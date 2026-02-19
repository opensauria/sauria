/**
 * Owner command parsing — single source of truth.
 *
 * Unified from:
 * - desktop: regex-based parsing in main.ts L1275-1435
 * - daemon: Zod schema validation in orchestrator/types.ts L204-222
 *
 * This module provides both:
 * 1. `parseOwnerCommand()` — regex parser for raw text input (used by desktop)
 * 2. `OwnerCommandSchema` — Zod schema for validation (used by daemon)
 */

import { z } from 'zod';
import type { OwnerCommand } from '@opensauria/types';

// ─── Zod Validation Schema ────────────────────────────────────────

export const OwnerCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('instruct'), agentId: z.string(), instruction: z.string() }),
  z.object({ type: z.literal('reassign'), agentId: z.string(), newWorkspaceId: z.string() }),
  z.object({
    type: z.literal('promote'),
    agentId: z.string(),
    newAutonomy: z.enum(['full', 'supervised', 'approval', 'manual']),
  }),
  z.object({ type: z.literal('pause'), workspaceId: z.string() }),
  z.object({ type: z.literal('broadcast'), message: z.string() }),
  z.object({ type: z.literal('review'), agentId: z.string() }),
  z.object({
    type: z.literal('hire'),
    platform: z.enum(['telegram', 'slack', 'whatsapp', 'discord', 'email', 'owner']),
    workspace: z.string(),
    role: z.enum(['lead', 'specialist', 'observer', 'bridge', 'assistant']),
  }),
  z.object({ type: z.literal('fire'), agentId: z.string() }),
]);

// ─── Parsed Result ────────────────────────────────────────────────

export interface ParsedOwnerCommand {
  readonly parsed: true;
  readonly type: string;
  readonly target: string | null;
  readonly message: string;
  readonly ownerCommand: OwnerCommand;
}

export interface UnparsedCommand {
  readonly parsed: true;
  readonly type: 'unknown';
  readonly target: null;
  readonly message: string;
}

export type ParseResult = ParsedOwnerCommand | UnparsedCommand;

// ─── Regex Parser ─────────────────────────────────────────────────

export function parseOwnerCommand(input: string): ParseResult {
  const trimmed = input.trim();

  if (!trimmed) {
    return { parsed: true, type: 'unknown', target: null, message: trimmed };
  }

  // /promote @agent level
  const promoteMatch = trimmed.match(/^\/promote\s+@(\S+)\s+(full|supervised|approval|manual)$/i);
  if (promoteMatch) {
    return {
      parsed: true,
      type: 'promote',
      target: promoteMatch[1] ?? null,
      message: promoteMatch[2] ?? '',
      ownerCommand: {
        type: 'promote',
        agentId: promoteMatch[1]!,
        newAutonomy: promoteMatch[2]!.toLowerCase() as OwnerCommand & { type: 'promote' } extends { newAutonomy: infer T } ? T : never,
      },
    };
  }

  // /reassign @agent #workspace
  const reassignMatch = trimmed.match(/^\/reassign\s+@(\S+)\s+#(\S+)$/i);
  if (reassignMatch) {
    return {
      parsed: true,
      type: 'reassign',
      target: reassignMatch[1] ?? null,
      message: reassignMatch[2] ?? '',
      ownerCommand: {
        type: 'reassign',
        agentId: reassignMatch[1]!,
        newWorkspaceId: reassignMatch[2]!,
      },
    };
  }

  // /pause #workspace
  const pauseMatch = trimmed.match(/^\/pause\s+#(\S+)$/i);
  if (pauseMatch) {
    return {
      parsed: true,
      type: 'pause',
      target: pauseMatch[1] ?? null,
      message: '',
      ownerCommand: { type: 'pause', workspaceId: pauseMatch[1]! },
    };
  }

  // /review @agent
  const reviewMatch = trimmed.match(/^\/review\s+@(\S+)$/i);
  if (reviewMatch) {
    return {
      parsed: true,
      type: 'review',
      target: reviewMatch[1] ?? null,
      message: '',
      ownerCommand: { type: 'review', agentId: reviewMatch[1]! },
    };
  }

  // /hire platform #workspace role
  const hireMatch = trimmed.match(/^\/hire\s+(\S+)\s+#(\S+)\s+(\S+)$/i);
  if (hireMatch) {
    return {
      parsed: true,
      type: 'hire',
      target: hireMatch[2] ?? null,
      message: `${hireMatch[1] ?? ''} ${hireMatch[3] ?? ''}`,
      ownerCommand: {
        type: 'hire',
        platform: hireMatch[1]! as 'telegram' | 'slack' | 'whatsapp' | 'discord' | 'email' | 'owner',
        workspace: hireMatch[2]!,
        role: hireMatch[3]! as 'lead' | 'specialist' | 'observer' | 'bridge' | 'assistant',
      },
    };
  }

  // /fire @agent
  const fireMatch = trimmed.match(/^\/fire\s+@(\S+)$/i);
  if (fireMatch) {
    return {
      parsed: true,
      type: 'fire',
      target: fireMatch[1] ?? null,
      message: '',
      ownerCommand: { type: 'fire', agentId: fireMatch[1]! },
    };
  }

  // @name rest -> instruct agent
  const agentMatch = trimmed.match(/^@(\S+)\s*(.*)/s);
  if (agentMatch) {
    return {
      parsed: true,
      type: 'instruct',
      target: agentMatch[1] ?? null,
      message: agentMatch[2] ?? '',
      ownerCommand: {
        type: 'instruct',
        agentId: agentMatch[1]!,
        instruction: agentMatch[2] ?? '',
      },
    };
  }

  // #name rest -> broadcast to workspace
  const wsMatch = trimmed.match(/^#(\S+)\s*(.*)/s);
  if (wsMatch) {
    return {
      parsed: true,
      type: 'broadcast',
      target: wsMatch[1] ?? null,
      message: wsMatch[2] ?? '',
      ownerCommand: { type: 'broadcast', message: wsMatch[2] ?? '' },
    };
  }

  return { parsed: true, type: 'unknown', target: null, message: trimmed };
}
