import type { AgentNode, CanvasGraph, Workspace } from './types.js';
import { generateId, capitalize } from './helpers.js';
import { disconnectChannel } from './ipc.js';
import { handleConnect, applyConnectResult } from './connect-handler.js';

export interface CanvasContext {
  readonly graphSync: {
    graph: CanvasGraph;
    save(): void;
    replaceNodeId(oldId: string, newId: string): void;
  };
  readonly viewport: { x: number; y: number; zoom: number };
  requestUpdate(): void;
  querySelector(sel: string): Element | null;
}

export function handleCardAction(
  ctx: CanvasContext,
  action: string,
  nodeId: string,
): void {
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
    disconnectChannel(node.platform, nodeId);
    removeNode(ctx, nodeId);
  }
}

export async function connectNode(
  ctx: CanvasContext,
  node: AgentNode,
): Promise<void> {
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

export function removeNode(ctx: CanvasContext, nodeId: string): void {
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
  ctx: CanvasContext,
  nodeId: string,
  patch: Record<string, unknown>,
): void {
  const node = ctx.graphSync.graph.nodes.find((n) => n.id === nodeId);
  if (!node) return;

  Object.assign(node, patch);
  if (node.platform === 'owner' && patch.instructions !== undefined) {
    ctx.graphSync.graph.globalInstructions = patch.instructions as string;
  }
  ctx.graphSync.save();
  ctx.requestUpdate();
}

export function handlePlatformDrop(
  ctx: CanvasContext,
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
  ctx: CanvasContext,
  ws: Workspace,
  viewportRect: DOMRect | null,
): void {
  ws.position = {
    x: viewportRect
      ? (viewportRect.width / 2 - ctx.viewport.x) / ctx.viewport.zoom - 200
      : 100,
    y: viewportRect
      ? (viewportRect.height / 2 - ctx.viewport.y) / ctx.viewport.zoom - 150
      : 100,
  };
  ws.size = { width: 400, height: 300 };
  ctx.graphSync.graph.workspaces.push(ws);
  ctx.graphSync.save();
  ctx.requestUpdate();
}

export function handleWorkspaceUpdate(
  ctx: CanvasContext,
  field: string,
  value: string,
  wsId: string,
): void {
  const ws = ctx.graphSync.graph.workspaces.find((w) => w.id === wsId);
  if (!ws) return;

  if (field === 'name') ws.name = value;
  else if (field === 'color') ws.color = value;
  else if (field === 'purpose') ws.purpose = value;
  else if (field === 'budget') ws.budget = parseFloat(value) || 0;
  else if (field === 'addTopic') (ws.topics ??= []).push(value);
  else if (field === 'removeTopic') ws.topics?.splice(parseInt(value, 10), 1);

  ctx.graphSync.save();
  ctx.requestUpdate();
}

export function handleWsLockToggle(
  ctx: CanvasContext,
  wsId: string,
): void {
  const ws = ctx.graphSync.graph.workspaces.find((w) => w.id === wsId);
  if (!ws) return;

  ws.locked = !ws.locked;
  ctx.graphSync.save();
  ctx.requestUpdate();
}
