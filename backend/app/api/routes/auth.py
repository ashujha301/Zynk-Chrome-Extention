# app/api/routes/auth.py
from fastapi import APIRouter, Response, HTTPException, Request
from pydantic import BaseModel
from app.core.security import verify_clerk_token, create_extension_token
from app.core.rate_limiter import auth_ip_limiter, limit_ip

router = APIRouter()


class TokenPayload(BaseModel):
    token: str


@router.post("/logout")
async def logout(request: Request, response: Response):
    await limit_ip(request, auth_ip_limiter)
    response.delete_cookie("ext_token")
    response.delete_cookie("access_token")
    return Response(status_code=204)


@router.get("/ensure-extension-token")
async def ensure_extension_token(request: Request, response: Response):
    # Rate limit first — prevents token farming
    await limit_ip(request, auth_ip_limiter)

    clerk_token = request.cookies.get("__session")
    if not clerk_token:
        raise HTTPException(status_code=401, detail="LOGIN_REQUIRED")

    payload = verify_clerk_token(clerk_token)
    user_id = payload.get("sub")
    ext_token = create_extension_token(user_id)

    response.set_cookie(
        key="ext_token",
        value=ext_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
    )
    return {"ok": True}