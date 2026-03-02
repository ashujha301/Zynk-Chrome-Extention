import requests
from fastapi import HTTPException
from jose import jwt
from app.core.config import settings

jwks = requests.get(settings.CLERK_JWKS_URL).json()


def verify_token(token: str):
    try:
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header["kid"]

        key = next(
            key for key in jwks["keys"]
            if key["kid"] == kid
        )

        payload = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            audience=None,
            options={"verify_aud": False}
        )

        return payload

    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")