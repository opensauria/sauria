/**
 * Canonical Canvas Graph types — shared between daemon and desktop.
 *
 * Reconciled from:
 * - daemon: src/orchestrator/types.ts (readonly, groupBehavior, strict status)
 * - desktop: desktop/src/main.ts L1189-1244 (optional fields, 'setup' status)
 */

// ─── Agent Roles & Autonomy ────────────────────────────────────────

export type AgentRole = 'lead' | 'specialist' | 'observer' | 'bridge' | 'assistant';

export type AutonomyLevel = 'full' | 'supervised' | 'approval' | 'manual';

export type Platform = 'telegram' | 'slack' | 'whatsapp' | 'discord' | 'email' | 'owner';

// ─── Group Behavior ────────────────────────────────────────────────

export interface ProactiveBehavior {
  readonly reportStatus: 'daily' | 'on_change' | 'never';
  readonly shareInsights: boolean;
  readonly askForHelp: boolean;
  readonly announceTaskCompletion: boolean;
}

export interface OwnerResponseBehavior {
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
  readonly ownerResponse: OwnerResponseBehavior;
  readonly peer: PeerBehavior;
}

// ─── Workspace ─────────────────────────────────────────────────────

export interface WorkspaceGroup {
  readonly platform: Platform;
  readonly groupId: string;
  readonly name: string;
  readonly ownerMemberId: string;
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

// ─── Agent Node ────────────────────────────────────────────────────

/**
 * Canonical agent node in the canvas graph.
 *
 * - `status: 'setup'` added for desktop (node created but not yet connected)
 * - `groupBehavior` optional (desktop may not provide it, daemon applies defaults)
 */
export interface AgentNode {
  readonly id: string;
  readonly platform: Platform;
  readonly label: string;
  readonly photo: string | null;
  readonly position: { readonly x: number; readonly y: number };
  readonly status: 'connected' | 'disconnected' | 'error' | 'setup';
  readonly credentials: string;
  readonly meta: Readonly<Record<string, string>>;
  readonly workspaceId: string | null;
  readonly role: AgentRole;
  readonly autonomy: AutonomyLevel;
  readonly instructions: string;
  readonly groupBehavior?: GroupBehavior;
}

// ─── Edge ──────────────────────────────────────────────────────────

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

// ─── Default Factories ─────────────────────────────────────────────

export const DEFAULT_GROUP_BEHAVIOR: GroupBehavior = {
  proactive: {
    reportStatus: 'on_change',
    shareInsights: true,
    askForHelp: true,
    announceTaskCompletion: true,
  },
  ownerResponse: {
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
