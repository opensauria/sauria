import type { AgentNode, CanvasGraph, Workspace } from './types.js';
import { generateId, capitalize } from './helpers.js';
import { disconnectChannel } from './ipc.js';
import { handleConnect, applyConnectResult } from './connect-handler.js';

export interface CanvasEventHost {
  readonly graphSync: {
    graph: CanvasGraph;
    save(): void;
    replaceNodeId(oldId: string, newId: string): void;
  };
  readonly viewport: {
    x: number;
    y: number;
    zoom: number;
    setZoom(z: number): void;
    startPan(e: MouseEvent): void;
    handleWheel(e: WheelEvent): void;
  };
  readonly nodeDrag: {
    startNodeDrag(nodeId: string, e: MouseEvent): void;
    startEdgeDrag(port: HTMLElement, e: MouseEvent): void;
  };
  readonly wsDrag: {
    startWsDrag(wsId: string, e: MouseEvent): void;
    startWsResize(wsId: string, dir: string, e: MouseEvent): void;
  };
  selectedNodeId: string | null;
  selectedWorkspaceId: string | null;
  detailNode: AgentNode | null;
  detailWorkspaceId: string | null;
  wsDialogOpen: boolean;
  dockCollapsed: boolean;
  confirmOpen: boolean;
  confirmMessage: string;
  confirmCallback: (() => void) | null;
  requestUpdate(): void;
  querySelector(sel: string): Element | null;
}

export function requestConfirm(host: CanvasEventHost, message: string, callback: () => void): void {
  host.confirmMessage = message;
  host.confirmCallback = callback;
  host.confirmOpen = true;
}

/* ── Card / node actions ── */

export function handleCardAction(ctx: CanvasEventHost, action: string, nodeId: string): void {
  const node = ctx.graphSync.graph.nodes.find((n) => n.id === nodeId);
  if (!node) return;

  if (action === 'cancel') {
    removeNode(ctx, nodeId);
    return;
  }
  if (action === 'connect') {
    connectNode(ctx, node);
    return;
  }
  if (action === 'gear') {
    return; // detail panel opened by caller for all nodes
  }
  if (action === 'close-edit') {
    if (node._formData?.description !== undefined) {
      node.description = node._formData.description;
    }
    node._editing = false;
    ctx.graphSync.save();
    ctx.requestUpdate();
    return;
  }
  if (action === 'disconnect') {
    requestConfirm(ctx, 'canvas.confirmDisconnectAgent', () => {
      disconnectChannel(node.platform, nodeId);
      removeNode(ctx, nodeId);
    });
  }
}

export async function connectNode(ctx: CanvasEventHost, node: AgentNode): Promise<void> {
  node.status = 'connecting';
  node._statusMsg = '';
  ctx.requestUpdate();

  try {
    const result = await handleConnect(node);
    const newId = applyConnectResult(node, result, node._formData ?? {});
    if (newId) ctx.graphSync.replaceNodeId(node.id, newId);
    ctx.graphSync.save();
  } catch {
    node.status = 'error';
    node._statusMsg = 'Connection failed';
    node._statusType = 'error';
  }
  ctx.requestUpdate();
}

export function removeEdge(ctx: CanvasEventHost, edgeId: string): void {
  ctx.graphSync.graph.edges = ctx.graphSync.graph.edges.filter((e) => e.id !== edgeId);
  ctx.graphSync.save();
  ctx.requestUpdate();
}

export function removeNode(ctx: CanvasEventHost, nodeId: string): void {
  const { graph } = ctx.graphSync;
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node || node.platform === 'owner') return;

  disconnectChannel(node.platform, nodeId).catch(() => {});
  graph.nodes = graph.nodes.filter((n) => n.id !== nodeId);
  graph.edges = graph.edges.filter((e) => e.from !== nodeId && e.to !== nodeId);
  ctx.graphSync.save();
  ctx.requestUpdate();
}

export function handleNodeUpdate(
  ctx: CanvasEventHost,
  nodeId: string,
  patch: Record<string, unknown>,
): void {
  const idx = ctx.graphSync.graph.nodes.findIndex((n) => n.id === nodeId);
  if (idx === -1) return;

  const node = ctx.graphSync.graph.nodes[idx];
  Object.assign(node, patch);
  if (node.platform === 'owner' && patch.instructions !== undefined) {
    ctx.graphSync.graph.globalInstructions = patch.instructions as string;
  }
  const updated = { ...node };
  ctx.graphSync.graph.nodes[idx] = updated;
  if (ctx.detailNode?.id === nodeId) {
    ctx.detailNode = updated;
  }
  ctx.graphSync.save();
  ctx.requestUpdate();
}

export function handlePlatformDrop(
  ctx: CanvasEventHost,
  platform: string,
  clientX: number,
  clientY: number,
): void {
  const world = ctx.querySelector('.canvas-world') as HTMLElement;
  if (!world) return;

  const rect = world.closest('.canvas-viewport')!.getBoundingClientRect();
  const wx = (clientX - rect.left - ctx.viewport.x) / ctx.viewport.zoom - 140;
  const wy = (clientY - rect.top - ctx.viewport.y) / ctx.viewport.zoom - 80;

  const node: AgentNode = {
    id: 'tmp_' + generateId(),
    platform,
    label: capitalize(platform),
    photo: null,
    position: { x: Math.round(wx), y: Math.round(wy) },
    status: 'setup',
    credentials: '',
    meta: {},
    workspaceId: null,
    role: 'assistant',
    autonomy: 'supervised',
    instructions: '',
    _formData: {},
    _statusMsg: '',
    _statusType: '',
    _animateIn: true,
  };
  ctx.graphSync.graph.nodes.push(node);
  ctx.graphSync.save();
  ctx.requestUpdate();
}

export function handleWorkspaceCreate(
  ctx: CanvasEventHost,
  ws: Workspace,
  viewportRect: DOMRect | null,
): void {
  ws.position = {
    x: viewportRect ? (viewportRect.width / 2 - ctx.viewport.x) / ctx.viewport.zoom - 200 : 100,
    y: viewportRect ? (viewportRect.height / 2 - ctx.viewport.y) / ctx.viewport.zoom - 150 : 100,
  };
  ws.size = { width: 400, height: 300 };
  ctx.graphSync.graph.workspaces.push(ws);
  ctx.graphSync.save();
  ctx.requestUpdate();
}

export function handleWorkspaceUpdate(
  ctx: CanvasEventHost,
  field: string,
  value: string,
  wsId: string,
): void {
  const idx = ctx.graphSync.graph.workspaces.findIndex((w) => w.id === wsId);
  if (idx === -1) return;

  const ws = ctx.graphSync.graph.workspaces[idx];
  if (field === 'name') ws.name = value;
  else if (field === 'color') ws.color = value;
  else if (field === 'purpose') ws.purpose = value;
  else if (field === 'budget') ws.budget = parseFloat(value) || 0;
  else if (field === 'addTopic') (ws.topics ??= []).push(value);
  else if (field === 'removeTopic') ws.topics?.splice(parseInt(value, 10), 1);

  ctx.graphSync.graph.workspaces[idx] = { ...ws };
  ctx.graphSync.save();
  ctx.requestUpdate();
}

export function handleWsLockToggle(ctx: CanvasEventHost, wsId: string): void {
  const idx = ctx.graphSync.graph.workspaces.findIndex((w) => w.id === wsId);
  if (idx === -1) return;

  const ws = ctx.graphSync.graph.workspaces[idx];
  ctx.graphSync.graph.workspaces[idx] = { ...ws, locked: !ws.locked };
  ctx.graphSync.save();
  ctx.requestUpdate();
}

/* ── Viewport / keyboard events ── */

export function handleViewportMouseDown(host: CanvasEventHost, e: MouseEvent): void {
  const target = e.target as HTMLElement;
  if (target.closest('.coverflow-dock')) return;

  const port = target.closest('.port') as HTMLElement | null;
  if (port) {
    host.nodeDrag.startEdgeDrag(port, e);
    return;
  }
  const resizeHandle = target.closest('.workspace-resize') as HTMLElement | null;
  if (resizeHandle) {
    host.wsDrag.startWsResize(resizeHandle.dataset.wsId ?? '', resizeHandle.dataset.dir ?? 'br', e);
    return;
  }
  const card = target.closest('.agent-card') as HTMLElement | null;
  if (card && e.button === 0) {
    const nodeId = card.dataset.nodeId;
    if (nodeId) host.nodeDrag.startNodeDrag(nodeId, e);
    return;
  }
  const wsHeader = target.closest('.workspace-header') as HTMLElement | null;
  if (wsHeader && e.button === 0) {
    const wsId = wsHeader.dataset.workspaceId ?? '';
    if (wsId) host.wsDrag.startWsDrag(wsId, e);
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
    else {
      host.selectedNodeId = null;
      host.selectedWorkspaceId = null;
    }
    e.preventDefault();
    return;
  }
  if (isMod && (e.key === '=' || e.key === '+')) {
    e.preventDefault();
    host.viewport.setZoom(host.viewport.zoom + 0.25);
  } else if (isMod && e.key === '-') {
    e.preventDefault();
    host.viewport.setZoom(host.viewport.zoom - 0.25);
  } else if (isMod && e.key === '0') {
    e.preventDefault();
    host.viewport.x = 0;
    host.viewport.y = 0;
    host.viewport.setZoom(1);
  } else if (isMod && e.key === 'l') {
    e.preventDefault();
    host.dockCollapsed = !host.dockCollapsed;
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && host.selectedNodeId && !isInputFocused()) {
    e.preventDefault();
    const nodeId = host.selectedNodeId;
    requestConfirm(host, 'canvas.confirmDeleteAgent', () => {
      removeNode(host, nodeId);
      host.selectedNodeId = null;
    });
  }
}

function isInputFocused(): boolean {
  const el = document.activeElement;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
}

export function handleCardHover(host: CanvasEventHost, nodeId: string): void {
  const node = host.graphSync.graph.nodes.find((n) => n.id === nodeId);
  if (!node) return;
  const orb = host.querySelector('orbital-bubbles') as
    | (HTMLElement & { show: (n: AgentNode) => void })
    | null;
  orb?.show(node);
}

export function handleCardHoverLeave(host: CanvasEventHost): void {
  const orb = host.querySelector('orbital-bubbles') as
    | (HTMLElement & { scheduleHide: () => void })
    | null;
  orb?.scheduleHide();
}

export function openConversation(host: CanvasEventHost, fromId: string, toId: string): void {
  const panel = host.querySelector('conversation-panel') as
    | (HTMLElement & { openEdgeConversation: (f: string, t: string) => void })
    | null;
  panel?.openEdgeConversation(fromId, toId);
}

export function toggleFeed(host: CanvasEventHost): void {
  const panel = host.querySelector('conversation-panel') as
    | (HTMLElement & { openFeed: () => void })
    | null;
  panel?.openFeed();
}
