# Agent Orchestration: Intermodal AI Company Engine

## Vision

A local-first operating system for an AI-native company. One human (CEO) commands AI agents organized into workspaces (teams/departments). Agents collaborate across platforms (Telegram, Slack, WhatsApp) through group conversations, shared knowledge, and task delegation. The infinite canvas is the strategic org chart; group chats are the operational layer; DMs are tactical.

This is not a chatbot dashboard. It is a parallel, autonomous workforce running on local hardware with cloud fallback for deep reasoning.

## Communication Model

Three layers mirroring how real companies operate:

1. **Canvas (strategic)** -- Bird's eye org chart. Hire, fire, restructure, view KPIs. Weekly board meeting view.
2. **Group chats (operational)** -- One per workspace on each platform. Agents discuss, coordinate, report. CEO drops in to give team-wide orders.
3. **Direct messages (tactical)** -- 1:1 with a specific agent. Private orders, sensitive tasks.

## Data Model

### Workspace

```typescript
interface Workspace {
  id: string;
  name: string;
  color: string;
  purpose: string;                 // system prompt/charter for all agents
  topics: string[];                // knowledge graph filter tags
  budget: {
    dailyLimitUsd: number;
    preferCheap: boolean;
  };
  models?: {
    extraction?: string;
    reasoning?: string;
    deep?: string;
  };
  position: { x: number; y: number };
  size: { width: number; height: number };
  checkpoints: Checkpoint[];
  groups: WorkspaceGroup[];
}

interface Checkpoint {
  condition: 'between_teams' | 'high_cost' | 'external_action';
  approverChannel: string;
}

interface WorkspaceGroup {
  platform: 'telegram' | 'slack' | 'whatsapp';
  groupId: string;
  name: string;
  ceoMemberId: string;
  autoCreated: boolean;
}
```

### AgentNode (extended)

```typescript
interface AgentNode {
  id: string;
  platform: 'telegram' | 'slack' | 'whatsapp';
  label: string;
  photo: string | null;
  position: { x: number; y: number };
  status: 'connected' | 'disconnected' | 'error';
  credentials: string;
  meta: Record<string, string>;
  workspaceId: string | null;
  role: AgentRole;
  autonomy: AutonomyLevel;
  instructions: string;            // CEO standing orders
  groupBehavior: GroupBehavior;
}

type AgentRole =
  | 'lead'
  | 'specialist'
  | 'observer'
  | 'bridge'
  | 'assistant'
  | string;

type AutonomyLevel =
  | 'full'           // act independently, report daily
  | 'supervised'     // act, notify CEO in real-time
  | 'approval'       // propose, wait for CEO approval
  | 'manual';        // do nothing without CEO instruction
```

### GroupBehavior

```typescript
interface GroupBehavior {
  proactive: {
    reportStatus: 'daily' | 'on_change' | 'never';
    shareInsights: boolean;
    askForHelp: boolean;
    announceTaskCompletion: boolean;
  };
  ceoResponse: {
    acknowledgeOrders: boolean;
    askClarification: boolean;
    reportProgress: boolean;
  };
  peerInteraction: {
    canRequestHelp: boolean;
    canDelegateTasks: boolean;
    shareContext: boolean;
  };
}
```

### Edge (extended)

```typescript
interface Edge {
  id: string;
  from: string;
  to: string;
  label?: string;
  edgeType: 'intra_workspace' | 'cross_workspace' | 'manual';
  rules: EdgeRule[];
}

interface EdgeRule {
  type: 'always' | 'keyword' | 'priority' | 'llm_decided';
  condition?: string;
  action: 'forward' | 'assign' | 'notify' | 'send_to_all';
}
```

### CanvasGraph v2

```typescript
interface CanvasGraph {
  version: 2;
  workspaces: Workspace[];
  nodes: AgentNode[];
  edges: Edge[];
  viewport: { x: number; y: number; zoom: number };
}
```

### CEO Identity

```typescript
interface CEOIdentity {
  telegram?: { userId: number };
  slack?: { userId: string };
  whatsapp?: { phoneNumber: string };
}
```

### Agent Runtime State

```typescript
interface AgentRuntime {
  identity: {
    nodeId: string;
    role: AgentRole;
    workspaceId: string;
    autonomy: AutonomyLevel;
  };
  memory: {
    conversations: ConversationStore;
    learned: string[];
    tasks: Task[];
  };
  goals: {
    kpis: KPI[];
    instructions: string;
  };
  performance: {
    messagesHandled: number;
    tasksCompleted: number;
    avgResponseTime: number;
    costIncurred: number;
  };
}

interface KPI {
  name: string;
  target: number;
  current: number;
  unit: string;
}
```

## Engine Architecture

### Worker Thread Pool

Each workspace runs in its own worker thread. True parallel execution on separate CPU cores.

```
Electron Canvas UI (CEO dashboard)
        |  IPC
Daemon main thread (Orchestrator, Router, Audit, Budget)
        |  MessageChannel
   +---------+---------+---------+
   | W-1     | W-2     | W-3     |  Worker threads
   | Support | Sales   | Content |  (1 per workspace)
   | TG+WA   | Slack   | WA+TG  |  Each runs its own channels
   +---------+---------+---------+
             |
     Shared Knowledge DB
   (SQLite WAL mode, parallel reads)
```

### Model Tiers (local-first)

```typescript
interface ModelTiers {
  local: {
    engine: 'ollama' | 'llamacpp' | 'mlx';
    model: string;
    useGpu: boolean;
  };
  fast: {
    provider: string;
    model: string;
  };
  deep: {
    provider: string;
    model: string;
  };
}
```

Selection logic:
- `route`, `classify`, `summarize`, `simple reply` -> local (free, 50-200ms)
- `moderate reply`, `draft content` -> fast cloud (cheap, 1-2s)
- `analyze`, `strategic decision`, `complex reasoning` -> deep cloud (expensive, 5-10s)

Target: 80% of operations run locally at zero cost.

### Orchestrator

```typescript
class AgentOrchestrator {
  constructor(
    db: Database,
    router: ModelRouter,
    channels: ChannelRegistry,
    graph: CanvasGraph,
    ceoIdentity: CEOIdentity,
    audit: AuditLogger,
  ) {}

  async handleInbound(message: InboundMessage): Promise<void> {
    // 1. Identify sender: CEO or external contact
    // 2. Find agent node and workspace
    // 3. Evaluate edge rules (deterministic, fast)
    // 4. If rules are insufficient, ask LLM for routing decision
    // 5. Check checkpoints (human approval needed?)
    // 6. Execute actions: reply, forward, assign, notify, learn
    // 7. Audit everything
  }
}
```

### InboundMessage

```typescript
interface InboundMessage {
  sourceNodeId: string;
  platform: 'telegram' | 'slack' | 'whatsapp';
  senderId: string;
  senderIsCeo: boolean;
  groupId: string | null;        // null = DM, string = group chat
  content: string;
  contentType: 'text' | 'voice' | 'image';
  timestamp: string;
}
```

### RoutingAction

```typescript
type RoutingAction =
  | { type: 'reply'; content: string }
  | { type: 'forward'; targetNodeId: string; content: string }
  | { type: 'assign'; targetNodeId: string; task: string; priority: 'low' | 'normal' | 'high' }
  | { type: 'notify'; targetNodeId: string; summary: string }
  | { type: 'send_to_all'; workspaceId: string; content: string }
  | { type: 'learn'; fact: string; topics: string[] }
  | { type: 'checkpoint'; description: string; pendingActions: RoutingAction[] }
  | { type: 'group_message'; workspaceId: string; content: string };
```

### ChannelRegistry

```typescript
class ChannelRegistry {
  private readonly channels: Map<string, Channel>;  // nodeId -> Channel

  register(nodeId: string, channel: Channel): void;
  unregister(nodeId: string): void;
  get(nodeId: string): Channel | null;
  getAll(): Array<{ nodeId: string; channel: Channel }>;
  sendTo(nodeId: string, content: string): Promise<void>;
  sendToGroup(group: WorkspaceGroup, content: string): Promise<void>;
  sendToWorkspace(workspaceId: string, content: string, graph: CanvasGraph): Promise<void>;
}
```

### CEO Command Layer

```typescript
type CEOCommand =
  | { type: 'instruct'; agentId: string; instruction: string }
  | { type: 'reassign'; agentId: string; newWorkspaceId: string }
  | { type: 'promote'; agentId: string; newAutonomy: AutonomyLevel }
  | { type: 'pause'; workspaceId: string }
  | { type: 'broadcast'; message: string }
  | { type: 'review'; agentId: string }
  | { type: 'hire'; platform: string; workspace: string; role: AgentRole }
  | { type: 'fire'; agentId: string };
```

CEO commands originate from:
- Canvas UI (click, drag, context menu)
- Group chats (type in a workspace group)
- DMs (message a specific agent directly)

## Resilience

### Message Queue with Backpressure

Every inbound message goes into a per-workspace queue. Controlled processing rate. If queue grows past threshold, agents reply "I'm busy, I'll get back to you."

### Smart LLM Bypass

Three routing tiers: `rules_only` (edge rules sufficient), `cached` (similar recent decision), `full_reasoning` (novel, needs LLM). Target: 60-80% bypass rate.

### Circuit Breaker per Channel

3 consecutive failures -> channel marked temporarily unavailable for 30s. Prevents cascading failures.

### Graceful Degradation

```
Normal      -> full LLM routing, all features
High load   -> routing cache priority, skip low-priority forwards
Overloaded  -> rules-only routing, no LLM calls, queue tasks for later
Critical    -> reply "overloaded", process backlog only
```

### Write Coalescing

Canvas state written via atomic rename with 1s debounce. Never write on every change.

### Per-Workspace Isolation

Each workspace has independent queue, budget counter, rate limiter, routing cache. One slow workspace cannot block another.

## Canvas UI Changes

### Workspace Frames

Visual rounded rectangles on the canvas. Agents snap into them. Draggable, resizable. Color-coded. Shows workspace name, purpose summary, agent count, budget usage bar.

### Agent Detail Panel

Click an agent card to open a side panel:
- Role selector
- Autonomy level slider
- Standing instructions (editable text)
- KPI dashboard (response time, tasks completed, cost)
- Recent activity log
- Group behavior toggles

### Workspace Detail Panel

Click a workspace frame:
- Purpose editor
- Topics list
- Budget configuration
- Model overrides
- Group chat links (clickable to open in platform)
- Checkpoint configuration
- Team performance summary

### CEO Command Bar

Quick-access command input at bottom of canvas (like Spotlight/Alfred):
- `@agent_name instruction` -> direct instruction
- `#workspace_name message` -> team broadcast
- `hire telegram lead in Support` -> create new agent
- `pause Sales` -> freeze workspace

## Security

- Credentials never stored in canvas.json, only vault reference keys
- CEO identity verified per-platform before executing privileged commands
- All agent decisions audited with full context
- Checkpoints enforce human approval at configured boundaries
- Per-workspace budget caps prevent runaway costs
- Rate limiters per channel, per workspace, per agent
- Circuit breakers prevent cascading failures to external APIs

## Replicability

Export: canvas.json + workspace configs = company blueprint.
Import on another machine, create new bot tokens, structure/roles/rules transfer.
One person can run multiple AI companies from a single machine.
