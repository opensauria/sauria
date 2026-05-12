"""Sauria Voice Backend — FastAPI HTTP server."""

import base64
import logging
import os
import secrets
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from .assistant import SauriaAssistant

logger = logging.getLogger(__name__)

ALLOWED_AUDIO_SUFFIXES = {".wav", ".mp3", ".ogg", ".flac", ".m4a"}
MAX_AUDIO_SIZE = 25 * 1024 * 1024  # 25 MB


def _get_api_token() -> str:
    token = os.getenv("SAURIA_VOICE_TOKEN", "").strip()
    if not token:
        raise RuntimeError("SAURIA_VOICE_TOKEN environment variable is required")
    return token


def _parse_suffix(filename: str | None) -> str:
    if not filename or "." not in filename:
        return ".wav"
    suffix = "." + filename.rsplit(".", 1)[-1].lower()
    if suffix not in ALLOWED_AUDIO_SUFFIXES:
        return ".wav"
    return suffix


API_TOKEN = _get_api_token()

app = FastAPI(title="Sauria Voice", docs_url=None, redoc_url=None)

security = HTTPBearer()


def _verify_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> None:
    if not secrets.compare_digest(credentials.credentials, API_TOKEN):
        raise HTTPException(status_code=401, detail="Invalid token")


assistant = SauriaAssistant()


class TextRequest(BaseModel):
    text: str = Field(min_length=1, max_length=10_000)


class ChatResponse(BaseModel):
    text: str
    audio: str
    transcription: str | None = None
    actions: list[dict[str, Any]] = Field(default_factory=list)


@app.exception_handler(Exception)
async def _global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.debug("Unhandled error on %s %s", request.method, request.url.path, exc_info=exc)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/chat/audio", response_model=ChatResponse)
async def chat_audio(
    file: UploadFile,
    _: None = Depends(_verify_token),
) -> ChatResponse:
    audio_data = await file.read()
    if len(audio_data) == 0:
        raise HTTPException(status_code=400, detail="Empty audio file")
    if len(audio_data) > MAX_AUDIO_SIZE:
        raise HTTPException(status_code=413, detail="Audio file too large")

    suffix = _parse_suffix(file.filename)
    logger.debug("Processing audio upload (%d bytes, suffix=%s)", len(audio_data), suffix)

    result = assistant.process_audio_bytes(audio_data, suffix=suffix)
    audio_b64 = base64.b64encode(result.audio_bytes).decode()
    return ChatResponse(
        text=result.text,
        audio=audio_b64,
        transcription=result.transcription,
        actions=result.actions,
    )


@app.post("/api/chat/text", response_model=ChatResponse)
def chat_text(
    body: TextRequest,
    _: None = Depends(_verify_token),
) -> ChatResponse:
    logger.debug("Processing text request (%d chars)", len(body.text))
    result = assistant.process_text(body.text)
    audio_b64 = base64.b64encode(result.audio_bytes).decode()
    return ChatResponse(text=result.text, audio=audio_b64, actions=result.actions)


@app.delete("/api/chat/history")
def clear_history(_: None = Depends(_verify_token)) -> dict[str, bool]:
    assistant.clear_history()
    return {"ok": True}
