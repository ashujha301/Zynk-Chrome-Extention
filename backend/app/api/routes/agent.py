from fastapi import APIRouter, Depends, Body, UploadFile, File
from pydantic import BaseModel
from openai import OpenAI
import os
from dotenv import load_dotenv
from sqlalchemy.orm import Session
from app.api.deps import get_current_user, get_db
from app.services.user_services import get_or_create_user, deduct_credits
from app.services.llm_service import generate_action_plan

load_dotenv()

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
        return {
            "error": "Invalid LLM output",
            "details": str(e)
        }

    # deduct one credit and refresh
    updated_user = deduct_credits(db, clerk_id, amount=1)
    if updated_user:
        db.refresh(user)

    return {
        "action_plan": action_plan,
        "credits_remaining": updated_user.credits if updated_user else user.credits
    }

@router.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    clerk_id: str = Depends(get_current_user)
):
    audio_bytes = await file.read()

    with open("temp.webm", "wb") as f:
        f.write(audio_bytes)

    # Example using OpenAI Whisper
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    with open("temp.webm", "rb") as audio_file:
        transcript = client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file
        )

    return {"text": transcript.text}