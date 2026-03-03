import requests
from fastapi import HTTPException
from jose import jwt
from datetime import datetime, timedelta
from app.core.config import settings

# Fetch Clerk JWKS once at startup
jwks = requests.get(settings.CLERK_JWKS_URL).json()


# ---------------------------
# Clerk JWT Verification
# ---------------------------
def verify_clerk_token(token: str):
    try:
        header = jwt.get_unverified_header(token)
        kid = header["kid"]

        key = next(k for k in jwks["keys"] if k["kid"] == kid)

        payload = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            audience=None,
            options={"verify_aud": False}
        )

        return payload

    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Clerk token")


# ---------------------------
# Extension Token Creation
# ---------------------------
def create_extension_token(user_id: str):
    now = datetime.utcnow()
    expire = now + timedelta(seconds=settings.EXT_TOKEN_EXPIRE_SECONDS)

    payload = {
        "sub": user_id,
        "iat": now,
        "exp": expire,
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
        raise HTTPException(status_code=401, detail="Invalid extension token")