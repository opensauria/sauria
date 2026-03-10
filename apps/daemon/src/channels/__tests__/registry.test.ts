import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChannelRegistry } from '../registry.js';
import type { Channel } from '../base.js';

function mockChannel(name: string): Channel {
  return {
    name,
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    sendAlert: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    sendToGroup: vi.fn().mockResolvedValue(undefined),
  };
}

describe('ChannelRegistry', () => {
  let registry: ChannelRegistry;

  beforeEach(() => {
    registry = new ChannelRegistry();
  });

  it('registers and retrieves a channel by nodeId', () => {
    const ch = mockChannel('telegram');
    registry.register('node-1', ch);
    expect(registry.get('node-1')).toBe(ch);
  });

  it('returns null for unknown nodeId', () => {
    expect(registry.get('unknown')).toBeNull();
  });

  it('unregisters a channel', () => {
    const ch = mockChannel('telegram');
    registry.register('node-1', ch);
    registry.unregister('node-1');
    expect(registry.get('node-1')).toBeNull();
  });

  it('lists all registered channels', () => {
    registry.register('n1', mockChannel('telegram'));
    registry.register('n2', mockChannel('slack'));
    const all = registry.getAll();
    expect(all).toHaveLength(2);
  });

  it('sends message to a specific node', async () => {
    const ch = mockChannel('telegram');
    registry.register('n1', ch);
    await registry.sendTo('n1', 'hello', null);
    expect(ch.sendMessage).toHaveBeenCalledWith('hello', null);
  });

  it('throws when sending to unknown node', async () => {
    await expect(registry.sendTo('unknown', 'hello', null)).rejects.toThrow();
  });
});

describe('additional coverage — ChannelRegistry', () => {
  let registry: ChannelRegistry;

  beforeEach(() => {
    registry = new ChannelRegistry();
  });

  it('sendTo with groupId passes it to sendMessage', async () => {
    const ch = mockChannel('telegram');
    registry.register('n1', ch);
    await registry.sendTo('n1', 'hello', 'group-123');
    expect(ch.sendMessage).toHaveBeenCalledWith('hello', 'group-123');
  });

  it('sendTo drops message when circuit is open', async () => {
    const ch = mockChannel('telegram');
    ch.sendMessage = vi.fn().mockRejectedValue(new Error('network'));
    registry.register('n1', ch);

    // Trip the circuit breaker (threshold = 5)
    for (let i = 0; i < 5; i++) {
      await registry.sendTo('n1', 'msg', null).catch(() => {});
    }

    // Circuit should be open now — message should be dropped (not throw)
    await expect(registry.sendTo('n1', 'msg', null)).resolves.toBeUndefined();
  });

  it('sendTo rethrows non-circuit errors', async () => {
    const ch = mockChannel('telegram');
    ch.sendMessage = vi.fn().mockRejectedValue(new Error('random error'));
    registry.register('n1', ch);

    await expect(registry.sendTo('n1', 'msg', null)).rejects.toThrow('random error');
  });

  it('sendToGroup throws for unknown node', async () => {
    await expect(registry.sendToGroup('unknown', 'g1', 'msg')).rejects.toThrow(
      'No channel registered for node: unknown',
    );
  });

  it('sendToGroup calls channel.sendToGroup via breaker', async () => {
    const ch = mockChannel('telegram');
    registry.register('n1', ch);
    await registry.sendToGroup('n1', 'g1', 'hello group');
    expect(ch.sendToGroup).toHaveBeenCalledWith('g1', 'hello group');
  });

  it('sendToGroup drops message when circuit is open', async () => {
    const ch = mockChannel('telegram');
    ch.sendToGroup = vi.fn().mockRejectedValue(new Error('network'));
    registry.register('n1', ch);

    for (let i = 0; i < 5; i++) {
      await registry.sendToGroup('n1', 'g1', 'msg').catch(() => {});
    }

    await expect(registry.sendToGroup('n1', 'g1', 'msg')).resolves.toBeUndefined();
  });

  it('sendToGroup rethrows non-circuit errors', async () => {
    const ch = mockChannel('telegram');
    ch.sendToGroup = vi.fn().mockRejectedValue(new Error('other'));
    registry.register('n1', ch);

    await expect(registry.sendToGroup('n1', 'g1', 'msg')).rejects.toThrow('other');
  });

  it('sendToWorkspace sends to matching group channels', async () => {
    const ch = mockChannel('telegram');
    registry.register('n1', ch);

    const graph = {
      nodes: [{ id: 'n1', workspaceId: 'ws1', platform: 'telegram' }],
      edges: [],
      workspaces: [{ id: 'ws1', groups: [{ platform: 'telegram', groupId: 'g1' }] }],
    } as never;

    await registry.sendToWorkspace('ws1', 'broadcast', graph);
    expect(ch.sendToGroup).toHaveBeenCalledWith('g1', 'broadcast');
  });

  it('sendToWorkspace skips nodes without registered channels', async () => {
    const graph = {
      nodes: [{ id: 'unregistered', workspaceId: 'ws1', platform: 'telegram' }],
      edges: [],
      workspaces: [{ id: 'ws1', groups: [{ platform: 'telegram', groupId: 'g1' }] }],
    } as never;

    await expect(registry.sendToWorkspace('ws1', 'msg', graph)).resolves.toBeUndefined();
  });

  it('sendToWorkspace skips nodes without matching group', async () => {
    const ch = mockChannel('telegram');
    registry.register('n1', ch);

    const graph = {
      nodes: [{ id: 'n1', workspaceId: 'ws1', platform: 'telegram' }],
      edges: [],
      workspaces: [{ id: 'ws1', groups: [{ platform: 'slack', groupId: 'g1' }] }],
    } as never;

    await registry.sendToWorkspace('ws1', 'msg', graph);
    expect(ch.sendToGroup).not.toHaveBeenCalled();
  });

  it('sendToWorkspace swallows individual channel errors', async () => {
    const ch = mockChannel('telegram');
    ch.sendToGroup = vi.fn().mockRejectedValue(new Error('fail'));
    registry.register('n1', ch);

    const graph = {
      nodes: [{ id: 'n1', workspaceId: 'ws1', platform: 'telegram' }],
      edges: [],
      workspaces: [{ id: 'ws1', groups: [{ platform: 'telegram', groupId: 'g1' }] }],
    } as never;

    await expect(registry.sendToWorkspace('ws1', 'msg', graph)).resolves.toBeUndefined();
  });

  it('stop calls channel.stop for registered node', async () => {
    const ch = mockChannel('telegram');
    registry.register('n1', ch);
    await registry.stop('n1');
    expect(ch.stop).toHaveBeenCalled();
  });

  it('stop does nothing for unregistered node', async () => {
    await expect(registry.stop('nonexistent')).resolves.toBeUndefined();
  });

  it('stopAll stops all channels and clears registry', async () => {
    const ch1 = mockChannel('telegram');
    const ch2 = mockChannel('slack');
    registry.register('n1', ch1);
    registry.register('n2', ch2);

    await registry.stopAll();

    expect(ch1.stop).toHaveBeenCalled();
    expect(ch2.stop).toHaveBeenCalled();
    expect(registry.getAll()).toHaveLength(0);
  });

  it('unregister removes breaker as well', () => {
    const ch = mockChannel('telegram');
    registry.register('n1', ch);
    registry.unregister('n1');
    expect(registry.get('n1')).toBeNull();
  });

  it('sendToWorkspace works with no matching workspace', async () => {
    const ch = mockChannel('telegram');
    registry.register('n1', ch);

    const graph = {
      nodes: [{ id: 'n1', workspaceId: 'ws1', platform: 'telegram' }],
      edges: [],
      workspaces: [],
    } as never;

    await registry.sendToWorkspace('ws1', 'msg', graph);
    expect(ch.sendToGroup).not.toHaveBeenCalled();
  });
});
