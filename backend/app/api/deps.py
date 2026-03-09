from fastapi import HTTPException, Request
from app.core.security import verify_clerk_token, verify_extension_token
from app.db.session import SessionLocal

COOKIE_NAME = "ext_token"


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(request: Request) -> str:
    """
    Auth priority:
      1. ext_token httpOnly cookie  — set by /auth/ensure-extension-token
                                      used by the Chrome extension
      2. __session Clerk cookie     — set by Clerk on the web frontend
                                      used by the web app directly

    The old Authorization: Bearer header is intentionally removed.
    Tokens are no longer sent in headers or response bodies.
    """

    # 1. Extension token (httpOnly cookie)
    ext_token = request.cookies.get(COOKIE_NAME)
    if ext_token:
        try:
            payload = verify_extension_token(ext_token)
            return payload.get("sub")
        except Exception:
            # Token present but invalid / expired — fall through to Clerk check
            pass

    # 2. Clerk session cookie (web frontend)
    clerk_token = request.cookies.get("__session")
    if clerk_token:
        try:
            payload = verify_clerk_token(clerk_token)
            return payload.get("sub")
        except Exception:
            pass

    raise HTTPException(status_code=401, detail="Not authenticated")