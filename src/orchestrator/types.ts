// ─── Agent Roles & Autonomy ────────────────────────────────────────

export type AgentRole = 'lead' | 'specialist' | 'observer' | 'bridge' | 'assistant';

export type AutonomyLevel = 'full' | 'supervised' | 'approval' | 'manual';

export type Platform = 'telegram' | 'slack' | 'whatsapp' | 'discord' | 'email' | 'ceo';

// ─── Group Behavior ────────────────────────────────────────────────

export interface ProactiveBehavior {
  readonly reportStatus: 'daily' | 'on_change' | 'never';
  readonly shareInsights: boolean;
  readonly askForHelp: boolean;
  readonly announceTaskCompletion: boolean;
}

export interface CeoResponseBehavior {
  readonly acknowledgeOrders: boolean;
  readonly askClarification: boolean;
  readonly reportProgress: boolean;
}

export interface PeerBehavior {
  readonly canRequestHelp: boolean;
  readonly canDelegateTasks: boolean;
  readonly shareContext: boolean;
}

export interface GroupBehavior {
  readonly proactive: ProactiveBehavior;
  readonly ceoResponse: CeoResponseBehavior;
  readonly peer: PeerBehavior;
}

// ─── Workspace ─────────────────────────────────────────────────────

export interface WorkspaceGroup {
  readonly platform: Platform;
  readonly groupId: string;
  readonly name: string;
  readonly ceoMemberId: string;
  readonly autoCreated: boolean;
}

export interface Checkpoint {
  readonly condition: 'between_teams' | 'high_cost' | 'external_action';
  readonly approverChannel: string;
}

export interface WorkspaceModels {
  readonly extraction?: string;
  readonly reasoning?: string;
  readonly deep?: string;
}

export interface WorkspaceBudget {
  readonly dailyLimitUsd: number;
  readonly preferCheap: boolean;
}

export interface Workspace {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly purpose: string;
  readonly topics: readonly string[];
  readonly budget: WorkspaceBudget;
  readonly models?: WorkspaceModels;
  readonly position: { readonly x: number; readonly y: number };
  readonly size: { readonly width: number; readonly height: number };
  readonly checkpoints: readonly Checkpoint[];
  readonly groups: readonly WorkspaceGroup[];
}

// ─── Agent Node (extended) ─────────────────────────────────────────

export interface AgentNode {
  readonly id: string;
  readonly platform: Platform;
  readonly label: string;
  readonly photo: string | null;
  readonly position: { readonly x: number; readonly y: number };
  readonly status: 'connected' | 'disconnected' | 'error';
  readonly credentials: string;
  readonly meta: Readonly<Record<string, string>>;
  readonly workspaceId: string | null;
  readonly role: AgentRole;
  readonly autonomy: AutonomyLevel;
  readonly instructions: string;
  readonly groupBehavior: GroupBehavior;
}

// ─── Edge (extended) ───────────────────────────────────────────────

export type EdgeRuleType = 'always' | 'keyword' | 'priority' | 'llm_decided';
export type EdgeAction = 'forward' | 'assign' | 'notify' | 'send_to_all';

export interface EdgeRule {
  readonly type: EdgeRuleType;
  readonly condition?: string;
  readonly action: EdgeAction;
}

export interface Edge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly label?: string;
  readonly edgeType: 'intra_workspace' | 'cross_workspace' | 'manual';
  readonly rules: readonly EdgeRule[];
}

// ─── Canvas Graph v2 ───────────────────────────────────────────────

export interface CanvasGraph {
  readonly version: 2;
  readonly globalInstructions: string;
  readonly workspaces: readonly Workspace[];
  readonly nodes: readonly AgentNode[];
  readonly edges: readonly Edge[];
  readonly viewport: { readonly x: number; readonly y: number; readonly zoom: number };
}

// ─── CEO Identity ──────────────────────────────────────────────────

export interface CEOIdentity {
  readonly telegram?: { readonly userId: number };
  readonly slack?: { readonly userId: string };
  readonly whatsapp?: { readonly phoneNumber: string };
}

// ─── Messages ──────────────────────────────────────────────────────

export interface InboundMessage {
  readonly sourceNodeId: string;
  readonly platform: Platform;
  readonly senderId: string;
  readonly senderIsCeo: boolean;
  readonly groupId: string | null;
  readonly content: string;
  readonly contentType: 'text' | 'voice' | 'image';
  readonly timestamp: string;
}

export type RoutingAction =
  | { readonly type: 'reply'; readonly content: string }
  | { readonly type: 'forward'; readonly targetNodeId: string; readonly content: string }
  | {
      readonly type: 'assign';
      readonly targetNodeId: string;
      readonly task: string;
      readonly priority: 'low' | 'normal' | 'high';
    }
  | { readonly type: 'notify'; readonly targetNodeId: string; readonly summary: string }
  | { readonly type: 'send_to_all'; readonly workspaceId: string; readonly content: string }
  | { readonly type: 'learn'; readonly fact: string; readonly topics: readonly string[] }
  | {
      readonly type: 'checkpoint';
      readonly description: string;
      readonly pendingActions: readonly RoutingAction[];
    }
  | { readonly type: 'group_message'; readonly workspaceId: string; readonly content: string };

export interface RoutingDecision {
  readonly actions: readonly RoutingAction[];
}

// ─── Agent Runtime ─────────────────────────────────────────────────

export interface KPI {
  readonly name: string;
  readonly target: number;
  current: number;
  readonly unit: string;
}

export interface AgentPerformance {
  messagesHandled: number;
  tasksCompleted: number;
  avgResponseTimeMs: number;
  costIncurredUsd: number;
}

// ─── CEO Commands ──────────────────────────────────────────────────

export type CEOCommand =
  | { readonly type: 'instruct'; readonly agentId: string; readonly instruction: string }
  | { readonly type: 'reassign'; readonly agentId: string; readonly newWorkspaceId: string }
  | { readonly type: 'promote'; readonly agentId: string; readonly newAutonomy: AutonomyLevel }
  | { readonly type: 'pause'; readonly workspaceId: string }
  | { readonly type: 'broadcast'; readonly message: string }
  | { readonly type: 'review'; readonly agentId: string }
  | {
      readonly type: 'hire';
      readonly platform: Platform;
      readonly workspace: string;
      readonly role: AgentRole;
    }
  | { readonly type: 'fire'; readonly agentId: string };

// ─── Default Factories ─────────────────────────────────────────────

export const DEFAULT_GROUP_BEHAVIOR: GroupBehavior = {
  proactive: {
    reportStatus: 'on_change',
    shareInsights: true,
    askForHelp: true,
    announceTaskCompletion: true,
  },
  ceoResponse: {
    acknowledgeOrders: true,
    askClarification: true,
    reportProgress: true,
  },
  peer: {
    canRequestHelp: true,
    canDelegateTasks: false,
    shareContext: true,
  },
};

export function createEmptyGraph(): CanvasGraph {
  return {
    version: 2,
    globalInstructions: '',
    workspaces: [],
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}
