from fastapi import Header, HTTPException, Cookie, Request
from app.core.security import verify_clerk_token, verify_extension_token
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
    request: Request = None
):
    # Extension auth
    if authorization:
        token = authorization.replace("Bearer ", "")
        payload = verify_extension_token(token)
        return payload.get("sub")

    # Web auth (Clerk cookie)
    clerk_token = request.cookies.get("__session")
    if clerk_token:
        payload = verify_clerk_token(clerk_token)
        return payload.get("sub")

    raise HTTPException(status_code=401, detail="Not authenticated")