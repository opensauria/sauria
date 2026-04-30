"""Text-to-Speech module using Coqui XTTS v2."""

import io
import logging
import os
import tempfile

import soundfile as sf
from TTS.api import TTS

logger = logging.getLogger(__name__)


class TextToSpeech:
    def __init__(
        self,
        model: str = "tts_models/multilingual/multi-dataset/xtts_v2",
        voice_ref: str = "voices/reference.wav",
        language: str = "en",
        speed: float = 1.0,
    ):
        self.voice_ref = voice_ref
        self.language = language
        self.speed = speed

        logger.debug("Loading TTS model: %s", model)
        self.tts = TTS(model)

    def synthesize_bytes(self, text: str, speed: float | None = None) -> bytes:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            tmp_path = f.name

        try:
            self.tts.tts_to_file(
                text=text,
                speaker_wav=self.voice_ref,
                language=self.language,
                file_path=tmp_path,
                speed=speed or self.speed,
            )
            data, sample_rate = sf.read(tmp_path)
            buf = io.BytesIO()
            sf.write(buf, data, sample_rate, format="WAV", subtype="PCM_16")
            return buf.getvalue()
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                logger.debug("Failed to remove temp file %s", tmp_path)
