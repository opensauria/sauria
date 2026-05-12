"""LLM module using LM Studio local server."""

import logging
from dataclasses import dataclass, field
from typing import Any

import httpx

logger = logging.getLogger(__name__)


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: str


@dataclass
class LLMResponse:
    content: str | None = None
    tool_calls: list[ToolCall] = field(default_factory=list)

    @property
    def has_tool_calls(self) -> bool:
        return len(self.tool_calls) > 0


class LLM:
    def __init__(
        self,
        base_url: str = "http://localhost:1234/v1",
        model: str = "local-model",
    ):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.client = httpx.Client(timeout=120)
        self.system_prompt = (
            "You are Sauria, an AI workforce orchestrator. "
            "You help the user manage their team of AI agents. "
            "Respond concisely and directly."
        )

    def _parse_response(self, data: dict[str, Any]) -> LLMResponse:
        try:
            message = data["choices"][0]["message"]
        except (KeyError, IndexError, TypeError) as exc:
            raise ValueError("Malformed LLM response") from exc

        content = message.get("content")
        if content is not None and not isinstance(content, str):
            raise ValueError("Malformed LLM response")

        raw_tool_calls = message.get("tool_calls") or []
        tool_calls: list[ToolCall] = []
        for tc in raw_tool_calls:
            tool_calls.append(
                ToolCall(
                    id=tc["id"],
                    name=tc["function"]["name"],
                    arguments=tc["function"]["arguments"],
                )
            )

        return LLMResponse(content=content, tool_calls=tool_calls)

    def chat_raw(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
    ) -> LLMResponse:
        payload: dict[str, Any] = {"model": self.model, "messages": messages}
        if tools:
            payload["tools"] = tools

        logger.debug("Sending %d messages to LLM (tools=%s)", len(messages), tools is not None)

        response = self.client.post(
            f"{self.base_url}/chat/completions",
            json=payload,
        )
        response.raise_for_status()

        return self._parse_response(response.json())

    def chat(self, message: str, history: list[dict[str, Any]] | None = None) -> str:
        messages: list[dict[str, Any]] = [{"role": "system", "content": self.system_prompt}]

        if history:
            messages.extend(history)

        messages.append({"role": "user", "content": message})

        result = self.chat_raw(messages)

        if result.content is None:
            raise ValueError("Malformed LLM response")

        return result.content

    def set_system_prompt(self, prompt: str) -> None:
        self.system_prompt = prompt
