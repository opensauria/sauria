/**
 * Canonical Canvas Graph types — shared between daemon and desktop.
 */

import type { IntegrationInstance } from './integrations.js';

// ─── Agent Roles & Autonomy ────────────────────────────────────────

export type AgentRole = 'lead' | 'specialist' | 'observer' | 'coordinator' | 'assistant';

export type AutonomyLevel = 'full' | 'supervised' | 'approval' | 'manual';

export type Platform = 'telegram' | 'slack' | 'whatsapp' | 'discord' | 'email' | 'owner';

// ─── Agent Behavior ────────────────────────────────────────────────

export interface AgentBehavior {
  readonly proactive?: boolean;
  readonly ownerResponse?: boolean;
  readonly peer?: boolean;
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
  readonly locked?: boolean;
}

// ─── Agent Node ────────────────────────────────────────────────────

/**
 * Canonical agent node in the canvas graph.
 *
 * - `status: 'setup'` added for desktop (node created but not yet connected)
 * - `behavior` toggles are persisted by the canvas UI and consumed by the routing prompt
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
  readonly description?: string;
  readonly behavior?: AgentBehavior;
  readonly integrations?: readonly string[];
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
  readonly language?: string;
  readonly workspaces: readonly Workspace[];
  readonly nodes: readonly AgentNode[];
  readonly edges: readonly Edge[];
  readonly instances?: readonly IntegrationInstance[];
  readonly viewport: { readonly x: number; readonly y: number; readonly zoom: number };
}

// ─── Default Factories ─────────────────────────────────────────────

export function createEmptyGraph(): CanvasGraph {
  return {
    version: 2,
    globalInstructions: '',
    workspaces: [],
    nodes: [],
    edges: [],
    instances: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}
