from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from app.api.deps import get_current_user, get_db
from app.services.user_services import get_or_create_user

router = APIRouter()


@router.get("/me")
async def get_me(
    request:  Request,
    clerk_id: str     = Depends(get_current_user),
    db:       Session = Depends(get_db),
):
    user = get_or_create_user(db, clerk_id)

    return {
        "Name": user.display_name,
        "Credits remaining":      user.credits,
    }