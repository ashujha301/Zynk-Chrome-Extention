from fastapi import APIRouter, Depends, UploadFile, File, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.services.user_services import get_or_create_user, deduct_credits
from app.services.llm_service import generate_action_plan
from app.services.whisper_service import transcribe_audio
from app.core.rate_limiter import (
    transcribe_ip_limiter, transcribe_user_limiter,
    execute_ip_limiter,    execute_user_limiter,
    limit_ip, limit_user,
)

router = APIRouter()


class ExecuteRequest(BaseModel):
    command:     str
    current_url: str | None = None


@router.post("/execute")
async def execute_command(
    request:  Request,
    payload:  ExecuteRequest,
    clerk_id: str     = Depends(get_current_user),
    db:       Session = Depends(get_db)
):
    # Rate limit: IP then per-user
    await limit_ip(request,    execute_ip_limiter)
    await limit_user(clerk_id, execute_user_limiter)

    user = get_or_create_user(db, clerk_id)

    if user.credits <= 0:
        return {"error": "No credits left"}

    command = payload.command
    if payload.current_url:
        command = f"[Current page: {payload.current_url}] {command}"

    try:
        action_plan = generate_action_plan(command)
    except Exception as e:
        return {"error": "Invalid LLM output", "details": str(e)}

    updated_user = deduct_credits(db, clerk_id, amount=1)
    if updated_user:
        db.refresh(user)

    return {
        "action_plan":       action_plan,
        "credits_remaining": updated_user.credits if updated_user else user.credits
    }


@router.post("/transcribe")
async def transcribe_audio_endpoint(
    request:  Request,
    file:     UploadFile = File(...),
    clerk_id: str        = Depends(get_current_user)
):
    # Rate limit: IP then per-user
    await limit_ip(request,    transcribe_ip_limiter)
    await limit_user(clerk_id, transcribe_user_limiter)

    audio_bytes = await file.read()
    mime_type   = file.content_type or "audio/webm"

    text = transcribe_audio(audio_bytes, mime_type)
    return {"text": text}