import { describe, it, expect, beforeEach } from 'vitest';
import { AgentOrchestrator } from '../orchestrator.js';
import type { CanvasGraph, OwnerIdentity } from '../types.js';
import { DEFAULT_GROUP_BEHAVIOR, createEmptyGraph } from '../types.js';
import { ChannelRegistry } from '../../channels/registry.js';

function makeGraph(): CanvasGraph {
  return {
    ...createEmptyGraph(),
    workspaces: [
      {
        id: 'ws1',
        name: 'Support',
        color: '#ff0000',
        purpose: 'Handle support',
        topics: ['support'],
        budget: { dailyLimitUsd: 5, preferCheap: true },
        position: { x: 0, y: 0 },
        size: { width: 400, height: 300 },
        checkpoints: [],
        groups: [],
      },
    ],
    nodes: [
      {
        id: 'n1',
        platform: 'telegram',
        label: '@support_bot',
        photo: null,
        position: { x: 0, y: 0 },
        status: 'connected',
        credentials: 'key',
        meta: {},
        workspaceId: 'ws1',
        role: 'assistant',
        autonomy: 'supervised',
        instructions: '',
        groupBehavior: DEFAULT_GROUP_BEHAVIOR,
      },
    ],
  };
}

describe('AgentOrchestrator', () => {
  let orchestrator: AgentOrchestrator;
  let registry: ChannelRegistry;
  const ownerIdentity: OwnerIdentity = { telegram: { userId: 123 } };

  beforeEach(() => {
    registry = new ChannelRegistry();
    orchestrator = new AgentOrchestrator({
      registry,
      graph: makeGraph(),
      ownerIdentity,
    });
  });

  it('detects owner messages on telegram', () => {
    const isOwner = orchestrator.isOwnerSender('telegram', '123');
    expect(isOwner).toBe(true);
  });

  it('detects non-owner messages', () => {
    const isOwner = orchestrator.isOwnerSender('telegram', '999');
    expect(isOwner).toBe(false);
  });

  it('finds workspace for a node', () => {
    const ws = orchestrator.findWorkspace('n1');
    expect(ws?.name).toBe('Support');
  });

  it('returns null workspace for unknown node', () => {
    const ws = orchestrator.findWorkspace('unknown');
    expect(ws).toBeNull();
  });
});
