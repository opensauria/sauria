"""Sauria-specific tool definitions for voice assistant."""

import json
import logging

from .tool_registry import ToolDef, ToolParam, ToolRegistry

logger = logging.getLogger(__name__)


def build_sauria_tools() -> ToolRegistry:
    registry = ToolRegistry()

    registry.register(ToolDef(
        name="instruct_agent",
        description="Send an instruction to a specific agent on the canvas",
        parameters=[
            ToolParam(name="agent_name", type="string", description="Name of the agent to instruct"),
            ToolParam(name="instruction", type="string", description="The instruction to send"),
        ],
        execute=lambda agent_name, instruction: json.dumps({
            "action": "instruct_agent",
            "agent_name": agent_name,
            "instruction": instruction,
        }),
    ))

    registry.register(ToolDef(
        name="create_workspace",
        description="Create a new workspace on the canvas",
        parameters=[
            ToolParam(name="name", type="string", description="Workspace name"),
            ToolParam(name="description", type="string", description="Workspace description", required=False),
        ],
        execute=lambda name, description="": json.dumps({
            "action": "create_workspace",
            "name": name,
            "description": description,
        }),
    ))

    registry.register(ToolDef(
        name="query_brain",
        description="Query the knowledge graph for information about entities, facts, or events",
        parameters=[
            ToolParam(name="query", type="string", description="Natural language query"),
        ],
        execute=lambda query: json.dumps({
            "action": "query_brain",
            "query": query,
        }),
    ))

    registry.register(ToolDef(
        name="navigate_view",
        description="Switch the app to a different view",
        parameters=[
            ToolParam(name="view", type="string", description="View name: palette, canvas, brain, setup, integrations"),
        ],
        execute=lambda view: json.dumps({
            "action": "navigate_view",
            "view": view,
        }),
    ))

    registry.register(ToolDef(
        name="list_agents",
        description="List all agents currently on the canvas",
        parameters=[],
        execute=lambda: json.dumps({"action": "list_agents"}),
    ))

    registry.register(ToolDef(
        name="get_agent_status",
        description="Get the current status and activity of a specific agent",
        parameters=[
            ToolParam(name="agent_name", type="string", description="Name of the agent"),
        ],
        execute=lambda agent_name: json.dumps({
            "action": "get_agent_status",
            "agent_name": agent_name,
        }),
    ))

    registry.register(ToolDef(
        name="connect_channel",
        description="Connect an agent to a communication channel",
        parameters=[
            ToolParam(name="agent_name", type="string", description="Name of the agent"),
            ToolParam(name="platform", type="string", description="Platform: telegram, slack, discord, whatsapp, email"),
        ],
        execute=lambda agent_name, platform: json.dumps({
            "action": "connect_channel",
            "agent_name": agent_name,
            "platform": platform,
        }),
    ))

    return registry
