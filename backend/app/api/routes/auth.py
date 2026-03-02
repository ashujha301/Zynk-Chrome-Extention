from fastapi import APIRouter, Response
from pydantic import BaseModel


class TokenPayload(BaseModel):
    token: str


router = APIRouter()


@router.post("/session")
def create_session(payload: TokenPayload):
    """Accept a JWT from the front end and store it in an httpOnly cookie."""
    resp = Response(status_code=204)
    # `secure=False` so the cookie can be sent over HTTP during local development.
    # In production you should set this to True and serve over HTTPS.
    resp.set_cookie(
        key="access_token",
        value=payload.token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=300,  # 5 minutes
    )
    return resp


@router.post("/logout")
def logout():
    resp = Response(status_code=204)
    resp.delete_cookie("access_token")
    return resp
