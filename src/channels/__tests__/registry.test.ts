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
