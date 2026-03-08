import type { AgentNode, EdgeGeometry } from './types.js';
import { CARD_FALLBACK_H, CARD_FALLBACK_W } from './constants.js';

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function escapeHtml(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

export function getInitials(name: string): string {
  const parts = (name || '').trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return (parts[0] || '?').slice(0, 2).toUpperCase();
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function getBotInfo(node: AgentNode): string {
  if (node.description) return node.description;
  const { platform } = node;
  if (platform === 'email') {
    return node.meta.username && node.meta.imapHost
      ? node.meta.username + '@' + node.meta.imapHost
      : node.meta.username || '';
  }
  return capitalize(platform);
}

export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function convKey(a: string, b: string): string {
  return a < b ? a + '|' + b : b + '|' + a;
}

/**
 * Compute a Bezier curve between two nodes.
 * Bottom-center of source to top-center of target.
 */
export function computeEdgeGeometry(
  fromNode: AgentNode,
  toNode: AgentNode,
  worldEl: HTMLElement,
): EdgeGeometry | null {
  const fromCard = worldEl.querySelector(`[data-node-id="${fromNode.id}"]`) as HTMLElement | null;
  const toCard = worldEl.querySelector(`[data-node-id="${toNode.id}"]`) as HTMLElement | null;
  const fromW = fromCard ? fromCard.offsetWidth : CARD_FALLBACK_W;
  const fromH = fromCard ? fromCard.offsetHeight : CARD_FALLBACK_H;
  const toW = toCard ? toCard.offsetWidth : CARD_FALLBACK_W;

  const x1 = fromNode.position.x + fromW / 2;
  const y1 = fromNode.position.y + fromH;
  const x2 = toNode.position.x + toW / 2;
  const y2 = toNode.position.y;
  const dy = Math.abs(y2 - y1) * 0.4;

  const d = `M${x1},${y1} C${x1},${y1 + dy} ${x2},${y2 - dy} ${x2},${y2}`;

  return { x1, y1, x2, y2, d, midX: (x1 + x2) / 2, midY: (y1 + y2) / 2 };
}
