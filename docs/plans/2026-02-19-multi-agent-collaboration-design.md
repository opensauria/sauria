# Multi-Agent Collaboration Consolidation

**Date:** 2026-02-19
**Goal:** Make OpenSauria's multi-agent architecture a real advantage over single-agent systems (OpenClaw) by enabling context sharing, shared memory, and conversation visibility between agents.

## Problem

Agents forward messages to each other but share zero context. Agent B receives a forwarded message from Agent A without knowing: what the user asked before, what A already said, or why A forwarded it. Each agent operates in a silo with only its own conversation history. The LLM router makes decisions without workspace-level knowledge.

## Design

### 1. Shared Conversation Window

When `executeAction()` dispatches a `forward` or `notify` action, enrich the content with the N most recent messages from the source conversation.

**Format:**

```
[Forwarded from @AgentA (Telegram, lead)]
[Recent context]:
- User: "Schedule a meeting with the design team"
- @AgentA: "I'll coordinate with the design workspace"
- User: "Make it urgent, deadline Friday"

[Message]:
Schedule a meeting with the design team -- urgent, deadline Friday
```

**Files:**

- `orchestrator.ts`: modify `executeAction()` for `forward` and `notify` actions
- `agent-memory.ts`: add `getRecentMessages(conversationId, limit): AgentMessage[]`

**Token budget:** ~150-200 tokens per forward. No additional LLM call.

### 2. Workspace Memory Pool

Promote `learn` facts to workspace scope. The LLM router injects relevant workspace facts into routing prompts.

**Schema change:**

```sql
ALTER TABLE agent_memory ADD COLUMN workspace_id TEXT;
CREATE INDEX idx_agent_memory_workspace ON agent_memory(workspace_id);
```

**Prompt injection in `buildRoutingPrompt()`:**

```
[Workspace knowledge]:
- [2026-02-18] Design team prefers async standups (from @AgentA)
- [2026-02-17] Budget approved for Q2 hiring (from @AgentB)
```

**Files:**

- `agent-memory.ts`: `storeFact()` accepts `workspaceId`, add `getWorkspaceFacts(workspaceId, limit)`
- `llm-router.ts`: `buildRoutingPrompt()` includes workspace facts (max 5, ~100 tokens)
- `db/schema.ts`: migration for `workspace_id` column
- `orchestrator.ts`: pass `workspaceId` when executing `learn` actions

### 3. Quick Wins

**3a. Persist owner commands to canvas.json**

`promote`, `reassign`, `fire` mutate the in-memory graph only. Changes are lost on daemon restart. Fix: call `writeCanvasGraph()` after each mutation in `handleOwnerCommand()`.

File: `orchestrator.ts` (~10 lines)

**3b. Peer messages in LLM routing prompt**

`buildRoutingPrompt()` only retrieves conversation history for the source node. Fix: retrieve recent messages from ALL nodes in the same workspace, sorted by date, limited to 5 total.

File: `llm-router.ts` (~15 lines)

**3c. Owner command file robustness**

The `owner-commands.jsonl` watcher clears the file immediately after reading. If parsing fails, the command is lost. Fix: only clear successfully parsed lines, rewrite failed lines.

File: `daemon-lifecycle.ts` (~10 lines)

## Token Budget

| Component                       | Additional tokens per routing decision |
| ------------------------------- | -------------------------------------- |
| Conversation context on forward | ~150-200                               |
| Workspace facts in prompt       | ~100                                   |
| Peer messages in prompt         | ~100                                   |
| **Total**                       | **~350-400**                           |

Negligible compared to the base routing prompt (~2000-4000 tokens).

## Implementation Order

1. `agent-memory.ts` — add `getRecentMessages()` and `getWorkspaceFacts()`, schema migration
2. `orchestrator.ts` — enrich forwards with context, pass workspaceId to learn, persist graph mutations
3. `llm-router.ts` — inject workspace facts and peer messages into routing prompt
4. `daemon-lifecycle.ts` — robust owner command parsing

## Not In Scope

- Agent-to-agent direct LLM inference (agents don't call each other's APIs)
- Semantic search on workspace facts (simple recency sort is sufficient for now)
- Agent handoff briefs (over-engineered, adds latency with extra LLM call)
- New channels (Signal, iMessage, Teams)
