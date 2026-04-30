"""Sauria Voice Assistant — main orchestrator."""

import json
import logging
import os
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

from .llm import LLM, LLMResponse
from .stt import STT
from .tool_registry import ToolRegistry
from .tools_sauria import build_sauria_tools
from .tts import TextToSpeech

logger = logging.getLogger(__name__)

MAX_TOOL_ITERATIONS = 10

HISTORY_DIR = Path.home() / ".sauria"
HISTORY_FILE = HISTORY_DIR / "voice-history.json"


@dataclass
class AssistantResponse:
    text: str
    audio_bytes: bytes
    transcription: str | None = None
    actions: list[dict[str, Any]] = field(default_factory=list)


class SauriaAssistant:
    def __init__(self, tool_registry: ToolRegistry | None = None) -> None:
        load_dotenv()

        self.stt = STT(model=os.getenv("STT_MODEL", "mlx-community/whisper-large-v3-mlx"))
        self.tts = TextToSpeech(
            model=os.getenv("TTS_MODEL", "tts_models/multilingual/multi-dataset/xtts_v2"),
            voice_ref=os.getenv("TTS_VOICE_REF", "voices/reference.wav"),
            language=os.getenv("TTS_LANGUAGE", "en"),
        )
        self.llm = LLM(
            base_url=os.getenv("LLM_BASE_URL", "http://localhost:1234/v1"),
            model=os.getenv("LLM_MODEL", "local-model"),
        )
        self.tools = tool_registry if tool_registry is not None else build_sauria_tools()
        self.history: list[dict[str, Any]] = self._load_history()

    def _load_history(self) -> list[dict[str, Any]]:
        if not HISTORY_FILE.exists():
            return []
        try:
            data = json.loads(HISTORY_FILE.read_text())
            if isinstance(data, list):
                return data
        except (json.JSONDecodeError, OSError):
            logger.debug("Failed to load history from %s", HISTORY_FILE)
        return []

    def _save_history(self) -> None:
        try:
            HISTORY_DIR.mkdir(parents=True, exist_ok=True)
            HISTORY_FILE.write_text(json.dumps(self.history, ensure_ascii=False))
        except OSError:
            logger.debug("Failed to save history to %s", HISTORY_FILE)

    def _build_system_prompt(self) -> str:
        tool_names = self.tools.list_names()
        parts = [
            "You are Sauria, an AI workforce orchestrator.",
            "You help the user manage their team of AI agents.",
            "Respond concisely and directly.",
            "Execute actions when asked — don't ask for confirmation unless genuinely ambiguous.",
            "When the user mentions an agent by name, use the appropriate tool to interact with that agent.",
        ]
        if tool_names:
            parts.append(f"Available tools: {', '.join(tool_names)}.")
        return "\n".join(parts)

    def _extract_actions(self, tool_results: list[str]) -> list[dict[str, Any]]:
        actions: list[dict[str, Any]] = []
        for result in tool_results:
            try:
                parsed = json.loads(result)
                if isinstance(parsed, dict) and "action" in parsed:
                    actions.append(parsed)
            except (json.JSONDecodeError, TypeError):
                logger.debug("Tool result is not valid JSON action: %s", result)
        return actions

    def _run_tool_loop(
        self,
        response: LLMResponse,
        messages: list[dict[str, Any]],
    ) -> tuple[str, list[dict[str, Any]]]:
        tools_schema = self.tools.to_openai_schema()
        all_tool_results: list[str] = []

        for _ in range(MAX_TOOL_ITERATIONS):
            if not response.has_tool_calls:
                break

            assistant_msg: dict[str, Any] = {"role": "assistant", "content": response.content}
            assistant_msg["tool_calls"] = [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {"name": tc.name, "arguments": tc.arguments},
                }
                for tc in response.tool_calls
            ]
            messages.append(assistant_msg)

            for tc in response.tool_calls:
                logger.debug("Executing tool %s (id=%s)", tc.name, tc.id)
                result = self.tools.execute_tool(tc.name, tc.arguments)
                all_tool_results.append(result)
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": result,
                    }
                )

            response = self.llm.chat_raw(messages, tools=tools_schema)

        actions = self._extract_actions(all_tool_results)
        return response.content or "", actions

    def _generate_response(self, user_text: str) -> AssistantResponse:
        logger.debug("Processing user message (%d chars)", len(user_text))

        system_prompt = self._build_system_prompt()
        messages: list[dict[str, Any]] = [{"role": "system", "content": system_prompt}]
        messages.extend(self.history)
        messages.append({"role": "user", "content": user_text})

        tools_schema = self.tools.to_openai_schema()
        response = self.llm.chat_raw(messages, tools=tools_schema or None)

        final_text, actions = self._run_tool_loop(response, messages)
        audio_bytes = self.tts.synthesize_bytes(final_text)

        self.history.append({"role": "user", "content": user_text})
        self.history.append({"role": "assistant", "content": final_text})
        self._save_history()

        return AssistantResponse(text=final_text, audio_bytes=audio_bytes, actions=actions)

    def process_audio(self, audio_path: str) -> AssistantResponse:
        user_text = self.stt.transcribe(audio_path)
        response = self._generate_response(user_text)
        response.transcription = user_text
        return response

    def process_audio_bytes(
        self,
        audio_data: bytes,
        suffix: str = ".wav",
    ) -> AssistantResponse:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
            f.write(audio_data)
            tmp_path = f.name

        try:
            return self.process_audio(tmp_path)
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                logger.debug("Failed to remove temp file %s", tmp_path)

    def process_text(self, text: str) -> AssistantResponse:
        return self._generate_response(text)

    def clear_history(self) -> None:
        self.history = []
        self._save_history()
