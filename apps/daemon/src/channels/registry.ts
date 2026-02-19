import type { Channel } from './base.js';
import type { CanvasGraph } from '../orchestrator/types.js';
import { CircuitBreaker } from '../orchestrator/circuit-breaker.js';
import { getLogger } from '../utils/logger.js';

const CIRCUIT_FAILURE_THRESHOLD = 5;
const CIRCUIT_RESET_TIMEOUT_MS = 30_000;

export class ChannelRegistry {
  private readonly channels = new Map<string, Channel>();
  private readonly breakers = new Map<string, CircuitBreaker>();

  register(nodeId: string, channel: Channel): void {
    this.channels.set(nodeId, channel);
    this.breakers.set(
      nodeId,
      new CircuitBreaker(CIRCUIT_FAILURE_THRESHOLD, CIRCUIT_RESET_TIMEOUT_MS),
    );
  }

  unregister(nodeId: string): void {
    this.channels.delete(nodeId);
    this.breakers.delete(nodeId);
  }

  get(nodeId: string): Channel | null {
    return this.channels.get(nodeId) ?? null;
  }

  getAll(): Array<{ nodeId: string; channel: Channel }> {
    return [...this.channels.entries()].map(([nodeId, channel]) => ({ nodeId, channel }));
  }

  async sendTo(nodeId: string, content: string, groupId: string | null): Promise<void> {
    const channel = this.channels.get(nodeId);
    if (!channel) {
      throw new Error(`No channel registered for node: ${nodeId}`);
    }

    const breaker = this.breakers.get(nodeId);
    if (!breaker) {
      await channel.sendMessage(content, groupId);
      return;
    }

    try {
      await breaker.execute(() => channel.sendMessage(content, groupId));
    } catch (error) {
      const logger = getLogger();
      const isCircuitOpen = error instanceof Error && error.message.includes('Circuit open');
      if (isCircuitOpen) {
        logger.warn(`Circuit open for node ${nodeId}, message dropped`);
        return;
      }
      throw error;
    }
  }

  async sendToGroup(nodeId: string, groupId: string, content: string): Promise<void> {
    const channel = this.channels.get(nodeId);
    if (!channel) {
      throw new Error(`No channel registered for node: ${nodeId}`);
    }

    const breaker = this.breakers.get(nodeId);
    if (!breaker) {
      await channel.sendToGroup(groupId, content);
      return;
    }

    try {
      await breaker.execute(() => channel.sendToGroup(groupId, content));
    } catch (error) {
      const logger = getLogger();
      const isCircuitOpen = error instanceof Error && error.message.includes('Circuit open');
      if (isCircuitOpen) {
        logger.warn(`Circuit open for node ${nodeId}, group message dropped`);
        return;
      }
      throw error;
    }
  }

  async sendToWorkspace(workspaceId: string, content: string, graph: CanvasGraph): Promise<void> {
    const workspaceNodes = graph.nodes.filter((n) => n.workspaceId === workspaceId);
    const workspace = graph.workspaces.find((w) => w.id === workspaceId);

    for (const node of workspaceNodes) {
      const channel = this.channels.get(node.id);
      if (!channel) continue;

      const group = workspace?.groups.find((g) => g.platform === node.platform);
      if (group) {
        try {
          await this.sendToGroup(node.id, group.groupId, content);
        } catch {
          // Individual channel failures don't block workspace broadcast
        }
      }
    }
  }

  async stop(nodeId: string): Promise<void> {
    const channel = this.channels.get(nodeId);
    if (channel) {
      await channel.stop();
    }
  }

  async stopAll(): Promise<void> {
    for (const channel of this.channels.values()) {
      await channel.stop();
    }
    this.channels.clear();
    this.breakers.clear();
  }
}
