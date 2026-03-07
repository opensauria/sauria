import type { CanvasGraph } from '../types.js';

export interface WorkspaceDragAccessors {
  getGraph(): CanvasGraph;
  getWorldEl(): HTMLElement;
  getZoom(): number;
  onWorkspaceDragged(): void;
  onWorkspaceDropped(): void;
  onWorkspaceResized(): void;
}

export class WorkspaceDragHandler {
  private readonly cb: WorkspaceDragAccessors;

  isWsDragging = false;
  wsDragId: string | null = null;
  private wsDragStartX = 0;
  private wsDragStartY = 0;
  private wsDragStartWsX = 0;
  private wsDragStartWsY = 0;
  private wsDragNodeStarts: Array<{
    id: string;
    startX: number;
    startY: number;
  }> = [];

  isWsResizing = false;
  wsResizeId: string | null = null;
  private wsResizeDir: string | null = null;
  private wsResizeStartX = 0;
  private wsResizeStartY = 0;
  private wsResizeStartW = 0;
  private wsResizeStartH = 0;

  constructor(cb: WorkspaceDragAccessors) {
    this.cb = cb;
  }

  startWsDrag(wsId: string, e: MouseEvent): void {
    const graph = this.cb.getGraph();
    this.isWsDragging = true;
    this.wsDragId = wsId;
    this.wsDragStartX = e.clientX;
    this.wsDragStartY = e.clientY;

    const ws = graph.workspaces.find((w) => w.id === wsId);
    if (ws) {
      this.wsDragStartWsX = ws.position.x;
      this.wsDragStartWsY = ws.position.y;
    }

    this.wsDragNodeStarts = graph.nodes
      .filter((n) => n.workspaceId === wsId)
      .map((n) => ({ id: n.id, startX: n.position.x, startY: n.position.y }));
  }

  startWsResize(wsId: string, dir: string, e: MouseEvent): void {
    const graph = this.cb.getGraph();
    this.isWsResizing = true;
    this.wsResizeId = wsId;
    this.wsResizeDir = dir;
    this.wsResizeStartX = e.clientX;
    this.wsResizeStartY = e.clientY;

    const ws = graph.workspaces.find((w) => w.id === wsId);
    if (ws) {
      this.wsResizeStartW = ws.size.width;
      this.wsResizeStartH = ws.size.height;
    }
  }

  handleMove(e: MouseEvent): void {
    if (this.isWsDragging && this.wsDragId) {
      this.moveWorkspace(e);
    }
    if (this.isWsResizing && this.wsResizeId) {
      this.resizeWorkspace(e);
    }
  }

  handleUp(): void {
    if (this.isWsDragging) {
      this.isWsDragging = false;
      this.wsDragId = null;
      this.wsDragNodeStarts = [];
      this.cb.onWorkspaceDropped();
    }
    if (this.isWsResizing) {
      this.isWsResizing = false;
      this.wsResizeId = null;
      this.wsResizeDir = null;
      this.cb.onWorkspaceResized();
    }
  }

  private moveWorkspace(e: MouseEvent): void {
    const graph = this.cb.getGraph();
    const zoom = this.cb.getZoom();
    const world = this.cb.getWorldEl();
    const ws = graph.workspaces.find((w) => w.id === this.wsDragId);
    if (!ws) return;

    const dx = (e.clientX - this.wsDragStartX) / zoom;
    const dy = (e.clientY - this.wsDragStartY) / zoom;
    ws.position.x = this.wsDragStartWsX + dx;
    ws.position.y = this.wsDragStartWsY + dy;

    for (const snap of this.wsDragNodeStarts) {
      const node = graph.nodes.find((n) => n.id === snap.id);
      if (!node) continue;
      node.position.x = snap.startX + dx;
      node.position.y = snap.startY + dy;
      const card = world.querySelector(
        `[data-node-id="${snap.id}"]`,
      ) as HTMLElement | null;
      if (card) {
        card.style.left = node.position.x + 'px';
        card.style.top = node.position.y + 'px';
      }
    }

    const frame = world.querySelector(
      `[data-workspace-id="${this.wsDragId}"]`,
    ) as HTMLElement | null;
    if (frame) {
      frame.style.left = ws.position.x + 'px';
      frame.style.top = ws.position.y + 'px';
    }
    this.cb.onWorkspaceDragged();
  }

  private resizeWorkspace(e: MouseEvent): void {
    const graph = this.cb.getGraph();
    const zoom = this.cb.getZoom();
    const world = this.cb.getWorldEl();
    const ws = graph.workspaces.find((w) => w.id === this.wsResizeId);
    if (!ws) return;

    const dx = (e.clientX - this.wsResizeStartX) / zoom;
    const dy = (e.clientY - this.wsResizeStartY) / zoom;

    if (this.wsResizeDir === 'r' || this.wsResizeDir === 'br') {
      ws.size.width = Math.max(320, this.wsResizeStartW + dx);
    }
    if (this.wsResizeDir === 'b' || this.wsResizeDir === 'br') {
      ws.size.height = Math.max(240, this.wsResizeStartH + dy);
    }

    const frame = world.querySelector(
      `[data-workspace-id="${this.wsResizeId}"]`,
    ) as HTMLElement | null;
    if (frame) {
      frame.style.width = ws.size.width + 'px';
      frame.style.height = ws.size.height + 'px';
    }
  }
}
