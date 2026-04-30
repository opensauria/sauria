"""Generic tool registry for OpenAI-compatible function calling."""

import json
import logging
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class ToolParam:
    name: str
    type: str
    description: str
    required: bool = True


@dataclass
class ToolDef:
    name: str
    description: str
    parameters: list[ToolParam]
    execute: Callable[..., str]


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, ToolDef] = {}

    def register(self, tool_def: ToolDef) -> None:
        self._tools[tool_def.name] = tool_def

    def get(self, name: str) -> ToolDef | None:
        return self._tools.get(name)

    def list_names(self) -> list[str]:
        return list(self._tools.keys())

    def to_openai_schema(self) -> list[dict[str, Any]]:
        schemas: list[dict[str, Any]] = []
        for tool in self._tools.values():
            properties: dict[str, Any] = {}
            required: list[str] = []
            for param in tool.parameters:
                properties[param.name] = {
                    "type": param.type,
                    "description": param.description,
                }
                if param.required:
                    required.append(param.name)
            schemas.append(
                {
                    "type": "function",
                    "function": {
                        "name": tool.name,
                        "description": tool.description,
                        "parameters": {
                            "type": "object",
                            "properties": properties,
                            "required": required,
                        },
                    },
                }
            )
        return schemas

    def execute_tool(self, name: str, arguments_json: str) -> str:
        tool = self._tools.get(name)
        if tool is None:
            return json.dumps({"error": f"Unknown tool: {name}"})
        try:
            kwargs = json.loads(arguments_json)
        except json.JSONDecodeError as exc:
            return json.dumps({"error": f"Invalid JSON arguments: {exc}"})
        try:
            result = tool.execute(**kwargs)
        except Exception as exc:
            logger.debug("Tool %s failed: %s", name, exc)
            return json.dumps({"error": f"Tool execution failed: {exc}"})
        return result
