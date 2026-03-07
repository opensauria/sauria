import type { AgentNode } from './types.js';
import type { CanvasContext } from './canvas-actions.js';
import { removeNode } from './canvas-actions.js';

export interface CanvasEventHost extends CanvasContext {
  readonly viewport: {
    x: number;
    y: number;
    zoom: number;
    setZoom(z: number): void;
    startPan(e: MouseEvent): void;
    handleWheel(e: WheelEvent): void;
  };
  readonly drag: {
    startNodeDrag(nodeId: string, e: MouseEvent): void;
    startEdgeDrag(port: HTMLElement, e: MouseEvent): void;
    startWsDrag(wsId: string, e: MouseEvent): void;
    startWsResize(wsId: string, dir: string, e: MouseEvent): void;
  };
  selectedNodeId: string | null;
  selectedWorkspaceId: string | null;
  detailNode: AgentNode | null;
  detailWorkspaceId: string | null;
  wsDialogOpen: boolean;
  dockCollapsed: boolean;
}

export function handleViewportMouseDown(host: CanvasEventHost, e: MouseEvent): void {
  const target = e.target as HTMLElement;
  if (target.closest('.coverflow-dock')) return;

  const port = target.closest('.port') as HTMLElement | null;
  if (port) {
    host.drag.startEdgeDrag(port, e);
    return;
  }
  const resizeHandle = target.closest('.workspace-resize') as HTMLElement | null;
  if (resizeHandle) {
    host.drag.startWsResize(resizeHandle.dataset.wsId ?? '', resizeHandle.dataset.dir ?? 'br', e);
    return;
  }
  const card = target.closest('.agent-card') as HTMLElement | null;
  if (card && e.button === 0) {
    const nodeId = card.dataset.nodeId;
    if (nodeId) host.drag.startNodeDrag(nodeId, e);
    return;
  }
  const wsHeader = target.closest('.workspace-header') as HTMLElement | null;
  if (wsHeader && e.button === 0) {
    const wsId = wsHeader.dataset.workspaceId ?? '';
    if (wsId) host.drag.startWsDrag(wsId, e);
    return;
  }
  if (e.button === 0) {
    host.viewport.startPan(e);
    host.selectedNodeId = null;
    host.selectedWorkspaceId = null;
    host.detailNode = null;
  }
}

export function handleKeydown(host: CanvasEventHost, e: KeyboardEvent): void {
  const isMod = e.metaKey || e.ctrlKey;
  if (e.key === 'Escape') {
    if (host.wsDialogOpen) host.wsDialogOpen = false;
    else if (host.detailNode) host.detailNode = null;
    else if (host.detailWorkspaceId) host.detailWorkspaceId = null;
    else { host.selectedNodeId = null; host.selectedWorkspaceId = null; }
    e.preventDefault();
    return;
  }
  if (isMod && (e.key === '=' || e.key === '+')) { e.preventDefault(); host.viewport.setZoom(host.viewport.zoom + 0.25); }
  else if (isMod && e.key === '-') { e.preventDefault(); host.viewport.setZoom(host.viewport.zoom - 0.25); }
  else if (isMod && e.key === '0') { e.preventDefault(); host.viewport.x = 0; host.viewport.y = 0; host.viewport.setZoom(1); }
  else if (isMod && e.key === 'l') { e.preventDefault(); host.dockCollapsed = !host.dockCollapsed; }
  if ((e.key === 'Delete' || e.key === 'Backspace') && host.selectedNodeId && !isInputFocused()) {
    e.preventDefault();
    removeNode(host, host.selectedNodeId);
    host.selectedNodeId = null;
  }
}

function isInputFocused(): boolean {
  const el = document.activeElement;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
}

export function handleCardHover(host: CanvasEventHost, nodeId: string): void {
  const node = host.graphSync.graph.nodes.find((n) => n.id === nodeId);
  if (!node) return;
  const orb = host.querySelector('orbital-bubbles') as HTMLElement & { show: (n: AgentNode) => void } | null;
  orb?.show(node);
}

export function handleCardHoverLeave(host: CanvasEventHost): void {
  const orb = host.querySelector('orbital-bubbles') as HTMLElement & { scheduleHide: () => void } | null;
  orb?.scheduleHide();
}

export function openConversation(host: CanvasEventHost, fromId: string, toId: string): void {
  const panel = host.querySelector('conversation-panel') as HTMLElement & { openEdgeConversation: (f: string, t: string) => void } | null;
  panel?.openEdgeConversation(fromId, toId);
}

export function toggleFeed(host: CanvasEventHost): void {
  const panel = host.querySelector('conversation-panel') as HTMLElement & { openFeed: () => void } | null;
  panel?.openFeed();
}
