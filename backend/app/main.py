import asyncio
import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.api.routes import user, agent, auth
from app.core.config import settings
from app.core.rate_limiter import (
    global_ip_limiter, limit_ip,
    transcribe_ip_limiter, transcribe_user_limiter,
    execute_ip_limiter, execute_user_limiter,
    auth_ip_limiter,
)

logger = logging.getLogger(__name__)
app = FastAPI(title="Zynk API")

# CORS
_extension_origin = (
    f"chrome-extension://{settings.EXTENSION_ID}"
    if settings.EXTENSION_ID else None
)
_allowed_origins = [
    "https://localhost:3000",
    "https://localhost:8000",
]
if _extension_origin:
    _allowed_origins.append(_extension_origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Set-Cookie", "Retry-After"],
)


# GLOBAL IP RATE LIMIT MIDDLEWARE
# Catches all routes not already covered by endpoint-specific limiters.

# Routes with their own tighter limiters — skip global check on these
_SKIP_GLOBAL = {
    "/agent/transcribe",
    "/agent/execute",
    "/auth/ensure-extension-token",
    "/auth/logout",
}

@app.middleware("http")
async def global_rate_limit_middleware(request: Request, call_next):
    if request.url.path not in _SKIP_GLOBAL:
        try:
            await limit_ip(request, global_ip_limiter)
        except Exception as exc:
            # Re-raise HTTPException as JSON response
            if hasattr(exc, "status_code") and exc.status_code == 429:
                return JSONResponse(
                    status_code=429,
                    content=exc.detail,
                    headers={"Retry-After": exc.headers.get("Retry-After", "60")},
                )
            raise
    return await call_next(request)


# STARTUP / SHUTDOWN — background eviction task
# Cleans stale rate limiter keys every 5 minutes to keep memory bounded.
@app.on_event("startup")
async def start_eviction_task():
    async def evict_loop():
        while True:
            await asyncio.sleep(300)  # every 5 minutes
            try:
                all_limiters = [
                    global_ip_limiter,
                    auth_ip_limiter,
                    transcribe_ip_limiter, transcribe_user_limiter,
                    execute_ip_limiter,    execute_user_limiter,
                ]
                for limiter in all_limiters:
                    await limiter.evict_stale()
                logger.debug("Rate limiter eviction complete.")
            except Exception as e:
                logger.warning("Eviction error: %s", e)

    asyncio.create_task(evict_loop())
    logger.info("Rate limiter eviction task started.")

# ROUTES
app.include_router(auth.router,  prefix="/auth",  tags=["auth"])
app.include_router(user.router,  prefix="/user",  tags=["user"])
app.include_router(agent.router, prefix="/agent", tags=["agent"])


@app.get("/health")
def health():
    return {"status": "ok"}