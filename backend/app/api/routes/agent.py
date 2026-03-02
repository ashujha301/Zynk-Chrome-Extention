from fastapi import APIRouter, Depends, Body
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.api.deps import get_current_user, get_db
from app.services.user_services import get_or_create_user, deduct_credits
from app.services.llm_service import generate_action_plan

router = APIRouter()




class ExecuteRequest(BaseModel):
    command: str


@router.post("/execute")
def execute_command(
    payload: ExecuteRequest,
    clerk_id: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    command = payload.command
    user = get_or_create_user(db, clerk_id)

    if user.credits <= 0:
        return {"error": "No credits left"}

    try:
        action_plan = generate_action_plan(command)
    except Exception as e:
        return {"error": "LLM failed", "details": str(e)}

    # deduct one credit and refresh
    updated_user = deduct_credits(db, clerk_id, amount=1)
    if updated_user:
        db.refresh(user)

    return {
        "action_plan": action_plan,
        "credits_remaining": updated_user.credits if updated_user else user.credits
    }