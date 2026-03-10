# app/services/whisper_service.py
# Faster-whisper transcription service.

import io
import os
import tempfile
import logging
import subprocess

from faster_whisper import WhisperModel
from app.core.config import settings

logger = logging.getLogger(__name__)


# Model singleton — loaded once, reused for every request
_model: WhisperModel | None = None


def _get_model() -> WhisperModel:
    global _model
    if _model is not None:
        return _model

    model_size    = settings.WHISPER_MODEL        # default "base"
    device        = settings.WHISPER_DEVICE       # default "cpu"
    compute_type  = settings.WHISPER_COMPUTE_TYPE # default "int8"

    logger.info(
        "Loading faster-whisper model '%s' on %s (%s) — first call only...",
        model_size, device, compute_type
    )
    _model = WhisperModel(model_size, device=device, compute_type=compute_type)
    logger.info("faster-whisper model ready.")
    return _model


# Public API

def transcribe_audio(audio_bytes: bytes, mime_type: str = "audio/webm") -> str:
    """
    Transcribe raw audio bytes and return the text string.

    Accepts audio/webm (from MediaRecorder), audio/wav, audio/mp4, etc.
    Internally converts to 16kHz mono WAV via ffmpeg before passing to
    faster-whisper (which requires PCM input).

    Returns empty string if nothing was heard.
    """
    model = _get_model()

    # Write incoming bytes to a temp file so ffmpeg can read it
    suffix = _mime_to_ext(mime_type)
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp_in:
        tmp_in.write(audio_bytes)
        tmp_in_path = tmp_in.name

    tmp_out_path = tmp_in_path.replace(suffix, ".wav")

    try:
        # Convert to 16kHz mono WAV — required format for faster-whisper
        result = subprocess.run(
            [
                "ffmpeg", "-y",
                "-i", tmp_in_path,
                "-ar", "16000",   # 16kHz sample rate
                "-ac", "1",       # mono
                "-f",  "wav",
                tmp_out_path
            ],
            capture_output=True,
            timeout=10
        )
        if result.returncode != 0:
            logger.error("ffmpeg conversion failed: %s", result.stderr.decode())
            return ""

        # Transcribe — beam_size=1 is fastest, accuracy still fine for commands
        segments, info = model.transcribe(
            tmp_out_path,
            language="en",          # force English — no language detection delay
            beam_size=1,            # fastest decoding
            best_of=1,
            temperature=0.0,        # deterministic, no sampling
            condition_on_previous_text=False,  # each clip is independent
            vad_filter=True,        # built-in VAD — skips silent segments
            vad_parameters={
                "min_silence_duration_ms": 300,   # silence threshold
                "speech_pad_ms": 100,             # padding around speech
            }
        )

        text = " ".join(seg.text.strip() for seg in segments).strip()
        logger.info("Transcribed: '%s' (%.2fs audio)", text, info.duration)
        return text

    finally:
        # Clean up temp files
        for path in (tmp_in_path, tmp_out_path):
            try:
                os.unlink(path)
            except OSError:
                pass


def _mime_to_ext(mime_type: str) -> str:
    mapping = {
        "audio/webm":            ".webm",
        "audio/webm;codecs=opus": ".webm",
        "audio/ogg":             ".ogg",
        "audio/mp4":             ".mp4",
        "audio/wav":             ".wav",
        "audio/mpeg":            ".mp3",
    }
    return mapping.get(mime_type.split(";")[0].strip(), ".webm")