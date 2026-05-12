"""Speech-to-Text module using mlx-whisper."""

import logging
import re
from typing import Any

import mlx_whisper

logger = logging.getLogger(__name__)


VOCAB_HINT = "Sauria, agent, workspace, canvas, brain, orchestrator"


def _match_claude(m: re.Match[str]) -> str:
    """Replace 'Cloud' / 'Cloud Code' with 'Claude' / 'Claude Code'."""
    return "Claude Code" if "code" in m.group().lower() else "Claude"


# Whisper misrecognition corrections: (pattern, replacement).
# Case-insensitive regex applied after transcription.
# replacement is either a string or a callable(Match) -> str.
CORRECTIONS: list[tuple[str, Any]] = [
    (r"\bCloud\b(?:\s+Code)?", _match_claude),
    (r"\bClaude?\s+Cote\b", "Claude Code"),
    (r"\bClod\s+Code\b", "Claude Code"),
    (r"\bClod\b", "Claude"),
    (r"\bclose?\s+code\b", "Claude Code"),
    (r"\bcloud\s+code\b", "Claude Code"),
]


def _apply_corrections(text: str) -> str:
    for pattern, replacement in CORRECTIONS:
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    return text


class STT:
    def __init__(self, model: str = "mlx-community/whisper-large-v3-mlx"):
        self.model = model

    def transcribe(self, audio_path: str, language: str = "en") -> str:
        logger.debug("Transcribing %s with model %s", audio_path, self.model)
        result = mlx_whisper.transcribe(
            audio_path,
            path_or_hf_repo=self.model,
            language=language,
            initial_prompt=VOCAB_HINT,
        )
        text = result.get("text")
        if text is None:
            raise ValueError("STT returned no text")
        return _apply_corrections(text)

    def transcribe_stream(self, audio_data: bytes) -> str:
        raise NotImplementedError("Streaming not yet implemented")
