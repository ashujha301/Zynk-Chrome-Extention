import requests
from fastapi import HTTPException
from jose import jwt
from datetime import datetime, timedelta
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

# ---------------------------
# SECRET_KEY startup guard
# ---------------------------
# Crash immediately with a clear message if SECRET_KEY is missing or still
# the default development placeholder. A weak key lets anyone forge JWTs.
if not settings.SECRET_KEY or settings.SECRET_KEY in ("dev-secret-change", ""):
    raise RuntimeError(
        "SECRET_KEY is not set or is still the default placeholder. "
        "Set a strong random SECRET_KEY in your .env file before starting. "
        "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
    )

# ---------------------------
# Clerk JWKS - lazy cache
# ---------------------------
# JWKS is NOT fetched at module import time. Fetching at module load causes
# the entire server to crash if Clerk is unreachable at startup (e.g. no
# internet, wrong URL in .env, cold start before network is ready).
#
# Instead we fetch lazily on the first token verification and cache the result.
# If the fetch fails we raise a clear 503 rather than crashing the process.

_jwks_cache: dict | None = None


def _get_jwks() -> dict:
    """Return cached JWKS, fetching from Clerk if not yet loaded."""
    global _jwks_cache
    if _jwks_cache is not None:
        return _jwks_cache

    url = settings.CLERK_JWKS_URL
    if not url:
        raise HTTPException(
            status_code=503,
            detail="CLERK_JWKS_URL is not configured. Set it in your .env file."
        )

    try:
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()          # raises on 4xx / 5xx
        data = resp.json()               # raises if body is empty or not JSON
    except requests.exceptions.ConnectionError:
        raise HTTPException(
            status_code=503,
            detail="Cannot reach Clerk JWKS endpoint. Check CLERK_JWKS_URL and network."
        )
    except requests.exceptions.Timeout:
        raise HTTPException(
            status_code=503,
            detail="Timed out fetching Clerk JWKS. Clerk may be down."
        )
    except requests.exceptions.HTTPError as e:
        raise HTTPException(
            status_code=503,
            detail=f"Clerk JWKS endpoint returned an error: {e}"
        )
    except ValueError:
        # requests raises ValueError (JSONDecodeError) for empty / non-JSON body
        raise HTTPException(
            status_code=503,
            detail="Clerk JWKS response was empty or not valid JSON. Check CLERK_JWKS_URL."
        )

    if "keys" not in data:
        raise HTTPException(
            status_code=503,
            detail="Clerk JWKS response is missing 'keys'. Check CLERK_JWKS_URL."
        )

    _jwks_cache = data
    logger.info("Clerk JWKS loaded and cached (%d key(s))", len(data["keys"]))
    return _jwks_cache


# ---------------------------
# Clerk JWT Verification
# ---------------------------
def verify_clerk_token(token: str):
    try:
        header = jwt.get_unverified_header(token)
        kid    = header["kid"]
        jwks   = _get_jwks()             # lazy fetch, raises HTTPException on failure
        key    = next((k for k in jwks["keys"] if k["kid"] == kid), None)

        if key is None:
            # Kid not found - JWKS may be stale. Clear cache so next call re-fetches.
            global _jwks_cache
            _jwks_cache = None
            raise HTTPException(status_code=401, detail="Unknown signing key (kid mismatch).")

        payload = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            audience=None,
            options={"verify_aud": False}
        )
        return payload

    except HTTPException:
        raise  # re-raise our own structured errors unchanged
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Clerk token.")


# ---------------------------
# Extension Token Creation
# ---------------------------
def create_extension_token(user_id: str):
    now    = datetime.utcnow()
    expire = now + timedelta(seconds=settings.EXT_TOKEN_EXPIRE_SECONDS)

    payload = {
        "sub":  user_id,
        "iat":  now,
        "exp":  expire,
        "type": "extension"
    }

    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


# ---------------------------
# Extension JWT Verification
# ---------------------------
def verify_extension_token(token: str):
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=["HS256"]
        )
        return payload
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid extension token.")