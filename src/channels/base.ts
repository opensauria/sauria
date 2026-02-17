import type { ProactiveAlert } from '../engine/proactive.js';

export interface Channel {
  readonly name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  sendAlert(alert: ProactiveAlert): Promise<void>;
  sendMessage(content: string, groupId: string | null): Promise<void>;
  sendToGroup(groupId: string, content: string): Promise<void>;
}

const MAX_BODY_LENGTH = 500;

function getPriorityPrefix(priority: number): string {
  if (priority >= 4) return '[!!!]';
  if (priority === 3) return '[!!]';
  if (priority === 2) return '[!]';
  return '[i]';
}

export function formatAlert(alert: ProactiveAlert): string {
  const prefix = getPriorityPrefix(alert.priority);
  const truncatedDetails =
    alert.details.length > MAX_BODY_LENGTH
      ? `${alert.details.slice(0, MAX_BODY_LENGTH)}...`
      : alert.details;

  return `${prefix} ${alert.title}\n\n${truncatedDetails}`;
}

export function alertPriorityValue(priority: number): number {
  return Math.max(0, Math.min(5, priority));
}
