from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.api.deps import get_current_user, get_db
from app.services.user_services import get_or_create_user

router = APIRouter()


@router.get("/me")
def get_me(
    clerk_id: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user = get_or_create_user(db, clerk_id)

    return {
        "user_id": clerk_id,
        "credits": user.credits
    }