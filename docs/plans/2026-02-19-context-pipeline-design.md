# Context Pipeline Fix — Design Document

## Problem

The Telegram bot (and all channels) restart from zero context every message. AgentMemory stores conversations, facts, and knowledge — but 6 wiring gaps prevent any of it from reaching the LLM routing prompt.

## Root Cause Analysis

| Gap | Description                                               | Location                                   |
| --- | --------------------------------------------------------- | ------------------------------------------ |
| 1   | Bot replies never recorded in AgentMemory                 | `orchestrator.ts:executeAction` reply case |
| 2   | Dual response: `onInbound()` + `handleAsk()` both fire    | `telegram.ts:handleTextMessage`            |
| 3   | Knowledge graph never queried in routing prompt           | `llm-router.ts:buildRoutingPrompt`         |
| 4   | Agent-level facts never injected                          | `llm-router.ts:buildRoutingPrompt`         |
| 5   | History too shallow (5 msgs, only user msgs due to Gap 1) | `llm-router.ts:buildRoutingPrompt`         |
| 6   | Cache key ignores conversationId                          | `routing-cache.ts:buildCacheKey`           |

## Solution: Token Budget System

Total budget: ~3200 tokens max per LLM prompt context section.

Token estimation: `Math.ceil(text.length / 4)` — no external deps, cross-platform.

### Token Allocation

| Section                  | Max Tokens | Source                                     | Priority    |
| ------------------------ | ---------- | ------------------------------------------ | ----------- |
| Conversation history     | 1500       | `agent_messages` table                     | 1 (highest) |
| Knowledge graph entities | 400        | FTS5 `searchByKeyword()`                   | 2           |
| Agent facts              | 200        | `getAgentFacts()`                          | 3           |
| Workspace facts          | 200        | `getWorkspaceFacts()` (already wired)      | 4           |
| Peer activity            | 200        | Already wired in Phase 1                   | 5           |
| Instructions             | 400        | `globalInstructions` + `node.instructions` | 6           |
| **Total**                | **~2900**  | Leaves headroom under 3200                 |             |

## Fix Details

### Gap 1: Record bot replies

In `orchestrator.ts:executeAction`, when `type === 'reply'`, after sending via registry, call `agentMemory.recordMessage()` with `senderIsOwner: false`. ~5 lines of code.

### Gap 2: Single response path

In `telegram.ts:handleTextMessage`, remove the `handleAsk()` fallback. All messages route through `onInbound()` -> orchestrator -> LLM routing brain -> reply action -> `sendTo()`. One path, no duplication.

### Gap 3: Knowledge graph injection

New function `buildKnowledgeContext(db, content, tokenBudget)` in `llm-router.ts`:

- Extract keywords from message (split whitespace, filter stop words, top 5)
- Call existing `searchByKeyword()` from `src/db/search.ts`
- Deduplicate entities by name
- Format as `"- EntityName (type): summary"`
- Truncate to token budget (400 tokens)

### Gap 4: Agent facts injection

In `buildRoutingPrompt()`, call `memory.getAgentFacts(sourceNode.id, 5)` and format identically to workspace facts. The method already exists — just not called.

### Gap 5: Token-budget-aware history

New method `getHistoryWithinBudget(conversationId, maxTokens)` on `AgentMemory`:

- Fetch messages newest-first in batches of 10
- Accumulate formatted messages until token budget exhausted
- Return in chronological order (reverse accumulated list)
- Replaces fixed `limit: 5` in `buildRoutingPrompt()`

### Gap 6: Fix cache key

Add `conversationId` parameter to `buildCacheKey()`:

```
buildCacheKey(nodeId, content, conversationId)
```

One-line change in `routing-cache.ts`, update call site in `llm-router.ts`.

## Architecture

All 6 fixes are isolated, backward-compatible changes:

- No new dependencies
- No new database tables
- No new IPC messages
- Pure TypeScript + SQLite
- Cross-platform compatible

## Testing Strategy

- Unit tests for each gap fix (TDD: write failing test first)
- Integration test: full message -> reply -> next message cycle with context preserved
- Token budget edge cases: empty history, oversized messages, truncation
