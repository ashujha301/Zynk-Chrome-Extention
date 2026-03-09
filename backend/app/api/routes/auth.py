from fastapi import APIRouter, Response, HTTPException, Request
from app.core.security import verify_clerk_token, create_extension_token
from app.core.config import settings

router = APIRouter()

# Cookie name used everywhere
COOKIE_NAME = "ext_token"


@router.get("/ensure-extension-token")
def ensure_extension_token(request: Request, response: Response):
    """
    Called by the extension popup and background on every startup / auth check.
    Reads the Clerk __session cookie, mints an extension JWT, and sets it as
    an httpOnly cookie.  Returns only non-sensitive metadata — the token itself
    is NEVER sent in the response body.
    """
    clerk_token = request.cookies.get("__session")
    if not clerk_token:
        raise HTTPException(status_code=401, detail="LOGIN_REQUIRED")

    payload = verify_clerk_token(clerk_token)
    user_id = payload.get("sub")

    ext_token = create_extension_token(user_id)

    # Set httpOnly cookie — JS cannot read this value at all
    response.set_cookie(
        key=COOKIE_NAME,
        value=ext_token,
        httponly=True,          # not accessible via document.cookie / JS
        secure=True,            # only sent over HTTPS
        samesite="none",        # required for cross-origin (extension → backend)
        max_age=settings.EXT_TOKEN_EXPIRE_SECONDS,
        path="/",
    )

    # Return only non-sensitive confirmation — no token in body
    return {"ok": True, "expires_in": settings.EXT_TOKEN_EXPIRE_SECONDS}


@router.post("/logout")
def logout(response: Response):
    """Clears both the Clerk session cookie and our extension token cookie."""
    response.delete_cookie(COOKIE_NAME, path="/", samesite="none", secure=True)
    response.delete_cookie("access_token", path="/")
    return {"ok": True}