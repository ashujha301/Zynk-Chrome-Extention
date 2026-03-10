# In-memory sliding window rate limiter.
# No Redis, no external deps — single server, free tier friendly.
#
# HOW IT WORKS:
#   Each key (IP or user_id) gets a deque of request timestamps.
#   On every request we:
#     1. Drop timestamps older than the window
#     2. Count remaining — if >= limit, reject with 429
#     3. Append current timestamp
#
# THREAD SAFETY:
#   FastAPI runs async — we use asyncio.Lock per key bucket to prevent
#   race conditions under concurrent requests.
#
# MEMORY:
#   Each entry = one float timestamp (~28 bytes).
#   At 100 req/min per user, 1000 concurrent users = ~3MB max. Fine.
#   Stale keys (no requests for > 2x window) are evicted automatically.

import time
import asyncio
from collections import deque
from fastapi import Request, HTTPException


class SlidingWindowRateLimiter:
    """
    Generic sliding window rate limiter.

    Usage:
        limiter = SlidingWindowRateLimiter(limit=20, window_seconds=60)
        await limiter.check("user:abc123")   # raises 429 if over limit
    """

    def __init__(self, limit: int, window_seconds: int, name: str = ""):
        self.limit          = limit
        self.window         = window_seconds
        self.name           = name
        self._buckets: dict[str, deque] = {}
        self._locks:   dict[str, asyncio.Lock] = {}
        self._lock          = asyncio.Lock()   # protects _buckets/_locks dicts

    async def _get_lock(self, key: str) -> asyncio.Lock:
        async with self._lock:
            if key not in self._locks:
                self._locks[key]  = asyncio.Lock()
                self._buckets[key] = deque()
            return self._locks[key]

    async def check(self, key: str) -> None:
        """
        Checks the rate limit for `key`. Raises HTTP 429 if exceeded.
        Call this at the start of any endpoint handler.
        """
        lock = await self._get_lock(key)
        async with lock:
            now    = time.monotonic()
            cutoff = now - self.window
            bucket = self._buckets[key]

            # Evict expired timestamps
            while bucket and bucket[0] < cutoff:
                bucket.popleft()

            if len(bucket) >= self.limit:
                retry_after = int(self.window - (now - bucket[0])) + 1
                raise HTTPException(
                    status_code=429,
                    detail={
                        "error":       "rate_limit_exceeded",
                        "message":     f"Too many requests. Try again in {retry_after}s.",
                        "retry_after": retry_after,
                        "limiter":     self.name,
                    },
                    headers={"Retry-After": str(retry_after)},
                )

            bucket.append(now)

    async def remaining(self, key: str) -> int:
        """Returns how many requests this key has left in the current window."""
        lock = await self._get_lock(key)
        async with lock:
            now    = time.monotonic()
            cutoff = now - self.window
            bucket = self._buckets[key]
            while bucket and bucket[0] < cutoff:
                bucket.popleft()
            return max(0, self.limit - len(bucket))

    async def evict_stale(self) -> None:
        """
        Remove keys that haven't made a request in 2x the window.
        Call this from a background task (e.g. every 5 minutes).
        """
        async with self._lock:
            now     = time.monotonic()
            cutoff  = now - (self.window * 2)
            stale   = [k for k, b in self._buckets.items() if not b or b[-1] < cutoff]
            for k in stale:
                del self._buckets[k]
                del self._locks[k]


# LIMITER INSTANCES
# One instance per limit tier — shared across all requests.

# Heavy endpoints — transcribe (CPU) and execute (OpenAI cost)
transcribe_ip_limiter   = SlidingWindowRateLimiter(30,  60,  "transcribe_ip")
transcribe_user_limiter = SlidingWindowRateLimiter(20,  60,  "transcribe_user")

execute_ip_limiter      = SlidingWindowRateLimiter(30,  60,  "execute_ip")
execute_user_limiter    = SlidingWindowRateLimiter(20,  60,  "execute_user")

# Auth endpoints — prevent token farming / brute force
auth_ip_limiter         = SlidingWindowRateLimiter(20,  60,  "auth_ip")

# General API — catch-all for all other routes
global_ip_limiter       = SlidingWindowRateLimiter(100, 60,  "global_ip")


# HELPERS

def get_client_ip(request: Request) -> str:
    """
    Extract real client IP, respecting X-Forwarded-For from nginx/proxy.
    Falls back to direct connection IP.
    """
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        # X-Forwarded-For can be "client, proxy1, proxy2" — take the first
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def limit_ip(request: Request, limiter: SlidingWindowRateLimiter) -> None:
    """Apply an IP-based rate limit."""
    await limiter.check(f"ip:{get_client_ip(request)}")


async def limit_user(user_id: str, limiter: SlidingWindowRateLimiter) -> None:
    """Apply a user-id-based rate limit."""
    await limiter.check(f"user:{user_id}")