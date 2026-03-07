import type { ReactiveController, ReactiveControllerHost } from 'lit';
import type { AgentNode, CanvasGraph, Workspace } from '../types.js';
import { CARD_FALLBACK_H, CARD_FALLBACK_W } from '../constants.js';

export interface DragCallbacks {
  getGraph(): CanvasGraph;
  getWorldEl(): HTMLElement;
  getViewportEl(): HTMLElement;
  getZoom(): number;
  getVpXY(): { x: number; y: number };
  onNodeDragged(): void;
  onNodeDropped(nodeId: string, dragDist: number): void;
  onEdgeCreated(fromId: string, toId: string): void;
  onWorkspaceDragged(): void;
  onWorkspaceDropped(): void;
  onWorkspaceResized(): void;
}

export class DragController implements ReactiveController {
  private readonly host: ReactiveControllerHost;
  private cb!: DragCallbacks;

  /* Node drag */
  isDragging = false;
  dragNodeId: string | null = null;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragStartNodeX = 0;
  private dragStartNodeY = 0;

  /* Edge drag */
  isEdgeDragging = false;
  edgeFromId: string | null = null;
  private edgeTempLine: SVGPathElement | null = null;
  private edgeDragOrigin = { x: 0, y: 0 };

  /* Workspace drag (magnetic) */
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

  /* Workspace resize */
  isWsResizing = false;
  wsResizeId: string | null = null;
  private wsResizeDir: string | null = null;
  private wsResizeStartX = 0;
  private wsResizeStartY = 0;
  private wsResizeStartW = 0;
  private wsResizeStartH = 0;

  constructor(host: ReactiveControllerHost) {
    this.host = host;
    host.addController(this);
  }

  hostConnected(): void { /* noop */ }
  hostDisconnected(): void { /* noop */ }

  setCallbacks(cb: DragCallbacks): void {
    this.cb = cb;
  }

  /* ── Node drag ─────────────────────────── */

  startNodeDrag(nodeId: string, e: MouseEvent): void {
    const graph = this.cb.getGraph();
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    this.isDragging = true;
    this.dragNodeId = nodeId;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.dragStartNodeX = node.position.x;
    this.dragStartNodeY = node.position.y;
  }

  /* ── Edge drag ─────────────────────────── */

  startEdgeDrag(port: HTMLElement, e: MouseEvent): void {
    if (port.dataset.port !== 'output') return;
    this.isEdgeDragging = true;
    this.edgeFromId = port.dataset.nodeId!;

    const graph = this.cb.getGraph();
    const fromNode = graph.nodes.find((n) => n.id === this.edgeFromId);
    if (!fromNode) return;

    const world = this.cb.getWorldEl();
    const fromCard = world.querySelector(
      `[data-node-id="${this.edgeFromId}"]`,
    ) as HTMLElement | null;
    const fromW = fromCard ? fromCard.offsetWidth : CARD_FALLBACK_W;
    const fromH = fromCard ? fromCard.offsetHeight : CARD_FALLBACK_H;
    this.edgeDragOrigin.x = fromNode.position.x + fromW / 2;
    this.edgeDragOrigin.y = fromNode.position.y + fromH;

    const edgeSvg = world.querySelector('#edge-svg') as SVGSVGElement;
    this.edgeTempLine = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'path',
    );
    this.edgeTempLine.classList.add('edge-temp');
    const ox = this.edgeDragOrigin.x;
    const oy = this.edgeDragOrigin.y;
    this.edgeTempLine.setAttribute('d', `M${ox},${oy} L${ox},${oy}`);
    edgeSvg.appendChild(this.edgeTempLine);

    e.preventDefault();
    e.stopPropagation();
  }

  /* ── Workspace drag ────────────────────── */

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

  /* ── Workspace resize ──────────────────── */

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

  /* ── Mouse move (delegated from root) ──── */

  handleMouseMove(e: MouseEvent): void {
    if (this.isDragging && this.dragNodeId) {
      this.moveNode(e);
    }
    if (this.isEdgeDragging && this.edgeTempLine) {
      this.moveEdge(e);
    }
    if (this.isWsDragging && this.wsDragId) {
      this.moveWorkspace(e);
    }
    if (this.isWsResizing && this.wsResizeId) {
      this.resizeWorkspace(e);
    }
  }

  private moveNode(e: MouseEvent): void {
    const graph = this.cb.getGraph();
    const zoom = this.cb.getZoom();
    const world = this.cb.getWorldEl();
    const node = graph.nodes.find((n) => n.id === this.dragNodeId);
    if (!node) return;

    node.position.x =
      this.dragStartNodeX + (e.clientX - this.dragStartX) / zoom;
    node.position.y =
      this.dragStartNodeY + (e.clientY - this.dragStartY) / zoom;

    const card = world.querySelector(
      `[data-node-id="${this.dragNodeId}"]`,
    ) as HTMLElement | null;
    if (card) {
      card.style.left = node.position.x + 'px';
      card.style.top = node.position.y + 'px';
    }

    this.highlightDropTargets(node, world, graph);
    this.cb.onNodeDragged();
  }

  private highlightDropTargets(
    node: AgentNode,
    world: HTMLElement,
    graph: CanvasGraph,
  ): void {
    const cardCx = node.position.x + 60;
    const cardCy = node.position.y + 75;
    world.querySelectorAll('.workspace-frame').forEach((frame) => {
      const ws = graph.workspaces.find(
        (w) => w.id === (frame as HTMLElement).dataset.workspaceId,
      );
      if (!ws) return;
      const isInside =
        cardCx >= ws.position.x &&
        cardCx <= ws.position.x + ws.size.width &&
        cardCy >= ws.position.y &&
        cardCy <= ws.position.y + ws.size.height;
      frame.classList.toggle('drop-target', isInside);
    });
  }

  private moveEdge(e: MouseEvent): void {
    const vp = this.cb.getViewportEl();
    const { x: vpX, y: vpY } = this.cb.getVpXY();
    const zoom = this.cb.getZoom();
    const rect = vp.getBoundingClientRect();
    const mx = (e.clientX - rect.left - vpX) / zoom;
    const my = (e.clientY - rect.top - vpY) / zoom;
    const dy = Math.abs(my - this.edgeDragOrigin.y) * 0.4;
    const ox = this.edgeDragOrigin.x;
    const oy = this.edgeDragOrigin.y;
    this.edgeTempLine!.setAttribute(
      'd',
      `M${ox},${oy} C${ox},${oy + dy} ${mx},${my - dy} ${mx},${my}`,
    );
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

    /* Move magnetic cards */
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

  /* ── Mouse up (delegated from root) ────── */

  handleMouseUp(e: MouseEvent): void {
    if (this.isDragging) {
      this.finishNodeDrag(e);
    }
    if (this.isEdgeDragging) {
      this.finishEdgeDrag(e);
    }
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

  private finishNodeDrag(e: MouseEvent): void {
    const graph = this.cb.getGraph();
    const world = this.cb.getWorldEl();
    const dragDist = Math.hypot(
      e.clientX - this.dragStartX,
      e.clientY - this.dragStartY,
    );
    const clickedNodeId = this.dragNodeId;

    /* Snap agent to workspace */
    const node = graph.nodes.find((n) => n.id === this.dragNodeId);
    if (node) {
      const cardCx = node.position.x + 60;
      const cardCy = node.position.y + 75;
      let snapped = false;
      for (const ws of graph.workspaces) {
        if (
          cardCx >= ws.position.x &&
          cardCx <= ws.position.x + ws.size.width &&
          cardCy >= ws.position.y &&
          cardCy <= ws.position.y + ws.size.height
        ) {
          node.workspaceId = ws.id;
          snapped = true;
          break;
        }
      }
      if (!snapped) node.workspaceId = null;
    }

    /* Clear highlights */
    world
      .querySelectorAll('.workspace-frame.drop-target')
      .forEach((f) => f.classList.remove('drop-target'));

    const card = world.querySelector(
      `[data-node-id="${this.dragNodeId}"]`,
    ) as HTMLElement | null;
    if (card) card.classList.remove('dragging');

    this.isDragging = false;
    this.dragNodeId = null;

    if (clickedNodeId) {
      this.cb.onNodeDropped(clickedNodeId, dragDist);
    }
  }

  private finishEdgeDrag(e: MouseEvent): void {
    this.isEdgeDragging = false;
    if (this.edgeTempLine) {
      this.edgeTempLine.remove();
      this.edgeTempLine = null;
    }

    const target = document.elementFromPoint(e.clientX, e.clientY);
    const port = target
      ? ((target as HTMLElement).closest(
          '.port[data-port="input"]',
        ) as HTMLElement | null)
      : null;

    if (port && port.dataset.nodeId !== this.edgeFromId && this.edgeFromId) {
      const toId = port.dataset.nodeId!;
      const graph = this.cb.getGraph();
      const exists = graph.edges.some(
        (edge) => edge.from === this.edgeFromId && edge.to === toId,
      );
      if (!exists) {
        this.cb.onEdgeCreated(this.edgeFromId, toId);
      }
    }
    this.edgeFromId = null;
  }
}
