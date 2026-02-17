import type { Channel } from './base.js';
import type { CanvasGraph } from '../orchestrator/types.js';

export class ChannelRegistry {
  private readonly channels = new Map<string, Channel>();

  register(nodeId: string, channel: Channel): void {
    this.channels.set(nodeId, channel);
  }

  unregister(nodeId: string): void {
    this.channels.delete(nodeId);
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
    await channel.sendMessage(content, groupId);
  }

  async sendToGroup(nodeId: string, groupId: string, content: string): Promise<void> {
    const channel = this.channels.get(nodeId);
    if (!channel) {
      throw new Error(`No channel registered for node: ${nodeId}`);
    }
    await channel.sendToGroup(groupId, content);
  }

  async sendToWorkspace(workspaceId: string, content: string, graph: CanvasGraph): Promise<void> {
    const workspaceNodes = graph.nodes.filter((n) => n.workspaceId === workspaceId);
    const workspace = graph.workspaces.find((w) => w.id === workspaceId);

    for (const node of workspaceNodes) {
      const channel = this.channels.get(node.id);
      if (!channel) continue;

      const group = workspace?.groups.find((g) => g.platform === node.platform);
      if (group) {
        await channel.sendToGroup(group.groupId, content);
      }
    }
  }

  async stopAll(): Promise<void> {
    for (const channel of this.channels.values()) {
      await channel.stop();
    }
    this.channels.clear();
  }
}
