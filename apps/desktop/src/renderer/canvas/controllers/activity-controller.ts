import type { ReactiveController, ReactiveControllerHost } from 'lit';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { ConvMessage } from '../types.js';
import { convKey } from '../helpers.js';

const NODE_IDLE_TIMEOUT_MS = 30_000;
const CONV_MAX_AGE_MS = 5 * 60 * 1000;

export interface ActivityCallbacks {
  onEdgeActivity(from: string, to: string, preview: string): void;
  onNodeActivity(nodeId: string, state: string): void;
  onMessageReceived(msg: ConvMessage): void;
  requestUpdate(): void;
}

export class ActivityController implements ReactiveController {
  private readonly host: ReactiveControllerHost;
  private cb!: ActivityCallbacks;
  private unlisteners: UnlistenFn[] = [];
  private nodeIdleTimers = new Map<string, ReturnType<typeof setTimeout>>();

  readonly activeNodeIds = new Set<string>();
  readonly edgeAnimCounts = new Map<string, number>();
  readonly edgeActiveCounts = new Map<string, number>();
  readonly conversationBuffer = new Map<string, ConvMessage[]>();
  unreadCount = 0;

  constructor(host: ReactiveControllerHost) {
    this.host = host;
    host.addController(this);
  }

  hostConnected(): void { /* noop — start() called explicitly */ }

  hostDisconnected(): void {
    for (const fn of this.unlisteners) fn();
    this.unlisteners = [];
    for (const timer of this.nodeIdleTimers.values()) clearTimeout(timer);
    this.nodeIdleTimers.clear();
  }

  setCallbacks(cb: ActivityCallbacks): void {
    this.cb = cb;
  }

  async start(): Promise<void> {
    this.unlisteners.push(
      await listen<{
        from: string;
        to: string;
        actionType: string;
        preview: string;
      }>('activity:edge', (e) => {
        this.cb.onEdgeActivity(
          e.payload.from,
          e.payload.to,
          e.payload.preview,
        );
      }),
      await listen<{ nodeId: string; state: string }>('activity:node', (e) => {
        this.setNodeActivityState(e.payload.nodeId, e.payload.state);
        this.cb.onNodeActivity(e.payload.nodeId, e.payload.state);
      }),
      await listen<ConvMessage>('activity:message', (e) => {
        this.bufferMessage(e.payload);
        this.cb.onMessageReceived(e.payload);
      }),
    );
  }

  setNodeActivityState(nodeId: string, state: string): void {
    const existing = this.nodeIdleTimers.get(nodeId);
    if (existing) clearTimeout(existing);

    if (state === 'active') {
      this.activeNodeIds.add(nodeId);
      this.nodeIdleTimers.set(
        nodeId,
        setTimeout(() => {
          this.activeNodeIds.delete(nodeId);
          this.nodeIdleTimers.delete(nodeId);
          this.cb.requestUpdate();
        }, NODE_IDLE_TIMEOUT_MS),
      );
    } else {
      this.activeNodeIds.delete(nodeId);
      this.nodeIdleTimers.delete(nodeId);
    }
  }

  bufferMessage(msg: ConvMessage): void {
    const key = convKey(msg.from, msg.to);
    if (!this.conversationBuffer.has(key)) {
      this.conversationBuffer.set(key, []);
    }
    this.conversationBuffer.get(key)!.push(msg);
    this.purgeOldConversations();
  }

  collectAllMessages(filterNodeId: string | null): ConvMessage[] {
    const all: ConvMessage[] = [];
    for (const [, msgs] of this.conversationBuffer) {
      for (const msg of msgs) {
        if (
          !filterNodeId ||
          msg.from === filterNodeId ||
          msg.to === filterNodeId
        ) {
          all.push(msg);
        }
      }
    }
    all.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
    return all;
  }

  private purgeOldConversations(): void {
    const now = Date.now();
    for (const [key, msgs] of this.conversationBuffer) {
      const last = msgs[msgs.length - 1];
      if (last && now - new Date(last.timestamp).getTime() > CONV_MAX_AGE_MS) {
        this.conversationBuffer.delete(key);
      }
    }
  }
}
