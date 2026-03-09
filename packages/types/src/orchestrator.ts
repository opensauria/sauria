/**
 * Orchestrator message types — routing, commands, runtime.
 * Extracted from src/orchestrator/types.ts.
 */

import type { AgentRole, AutonomyLevel, Platform } from './canvas.js';

// ─── Owner Identity ───────────────────────────────────────────────

export interface OwnerIdentity {
  readonly telegram?: { readonly userId: number };
  readonly slack?: { readonly userId: string };
  readonly whatsapp?: { readonly phoneNumber: string };
}

// ─── Messages ──────────────────────────────────────────────────────

export interface InboundMessage {
  readonly sourceNodeId: string;
  readonly platform: Platform;
  readonly senderId: string;
  readonly senderIsOwner: boolean;
  readonly groupId: string | null;
  readonly content: string;
  readonly contentType: 'text' | 'voice' | 'image';
  readonly timestamp: string;
  readonly forwardDepth?: number;
  readonly replyToNodeId?: string;
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
  | { readonly type: 'group_message'; readonly workspaceId: string; readonly content: string }
  | {
      readonly type: 'use_tool';
      readonly integration: string;
      readonly tool: string;
      readonly arguments: Readonly<Record<string, unknown>>;
      readonly content: string;
    }
  | { readonly type: 'conclude'; readonly content: string };

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

// ─── Owner Commands ───────────────────────────────────────────────

export type OwnerCommand =
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
