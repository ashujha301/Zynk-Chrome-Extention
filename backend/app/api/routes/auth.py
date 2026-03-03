from fastapi import APIRouter, Response, HTTPException, Cookie, Request
from pydantic import BaseModel
from app.core.security import verify_clerk_token, create_extension_token

router = APIRouter()


class TokenPayload(BaseModel):
    token: str


@router.post("/logout")
def logout():
    resp = Response(status_code=204)
    resp.delete_cookie("access_token")
    return resp


@router.get("/ensure-extension-token")
def ensure_extension_token(request: Request):

    clerk_token = request.cookies.get("__session")

    if not clerk_token:
        raise HTTPException(status_code=401, detail="LOGIN_REQUIRED")

    payload = verify_clerk_token(clerk_token)
    user_id = payload.get("sub")

    ext_token = create_extension_token(user_id)

    return {
        "access_token": ext_token
    }