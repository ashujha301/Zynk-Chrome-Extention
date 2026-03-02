from fastapi import Header, HTTPException, Depends, Cookie
from app.core.security import verify_token
from app.db.session import SessionLocal
from sqlalchemy.orm import Session


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    authorization: str = Header(None),
    access_token: str = Cookie(None),
):
    # prefer header for manual testing, cookie for browser flow
    token = None
    if authorization:
        token = authorization.replace("Bearer ", "")
    elif access_token:
        token = access_token

    if not token:
        raise HTTPException(status_code=401, detail="Missing token")

    payload = verify_token(token)
    return payload.get("sub")