import type { AgentNode, CanvasGraph, Workspace } from '../types.js';
import { CARD_FALLBACK_W, CARD_FALLBACK_H } from '../constants.js';

export interface NodeDragAccessors {
  getGraph(): CanvasGraph;
  getWorldEl(): HTMLElement;
  getViewportEl(): HTMLElement;
  getZoom(): number;
  getVpXY(): { x: number; y: number };
  onNodeDragged(): void;
  onNodeDropped(nodeId: string, dragDist: number): void;
  onEdgeCreated(fromId: string, toId: string): void;
}

function isInsideWorkspace(cx: number, cy: number, ws: Workspace): boolean {
  return (
    cx >= ws.position.x &&
    cx <= ws.position.x + ws.size.width &&
    cy >= ws.position.y &&
    cy <= ws.position.y + ws.size.height
  );
}

export class NodeDragHandler {
  private readonly cb: NodeDragAccessors;

  isDragging = false;
  dragNodeId: string | null = null;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragStartNodeX = 0;
  private dragStartNodeY = 0;

  isEdgeDragging = false;
  edgeFromId: string | null = null;
  private edgeTempLine: SVGPathElement | null = null;
  private edgeDragOrigin = { x: 0, y: 0 };

  constructor(cb: NodeDragAccessors) {
    this.cb = cb;
  }

  startNodeDrag(nodeId: string, e: MouseEvent): void {
    const node = this.cb.getGraph().nodes.find((n) => n.id === nodeId);
    if (!node) return;
    this.isDragging = true;
    this.dragNodeId = nodeId;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.dragStartNodeX = node.position.x;
    this.dragStartNodeY = node.position.y;
  }

  startEdgeDrag(port: HTMLElement, e: MouseEvent): void {
    if (port.dataset.port !== 'output') return;
    this.isEdgeDragging = true;
    this.edgeFromId = port.dataset.nodeId!;

    const fromNode = this.cb.getGraph().nodes.find((n) => n.id === this.edgeFromId);
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
    this.edgeTempLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    this.edgeTempLine.classList.add('edge-temp');
    const { x: ox, y: oy } = this.edgeDragOrigin;
    this.edgeTempLine.setAttribute('d', `M${ox},${oy} L${ox},${oy}`);
    edgeSvg.appendChild(this.edgeTempLine);

    e.preventDefault();
    e.stopPropagation();
  }

  handleMove(e: MouseEvent): void {
    if (this.isDragging && this.dragNodeId) this.moveNode(e);
    if (this.isEdgeDragging && this.edgeTempLine) this.moveEdge(e);
  }

  handleUp(e: MouseEvent): void {
    if (this.isDragging) this.finishNodeDrag(e);
    if (this.isEdgeDragging) this.finishEdgeDrag(e);
  }

  private moveNode(e: MouseEvent): void {
    const { graph, zoom, world } = this.getContext();
    const node = graph.nodes.find((n) => n.id === this.dragNodeId);
    if (!node) return;

    node.position.x = this.dragStartNodeX + (e.clientX - this.dragStartX) / zoom;
    node.position.y = this.dragStartNodeY + (e.clientY - this.dragStartY) / zoom;

    const card = world.querySelector(`[data-node-id="${this.dragNodeId}"]`) as HTMLElement | null;
    if (card) {
      card.style.left = node.position.x + 'px';
      card.style.top = node.position.y + 'px';
    }

    this.highlightDropTargets(node, world, graph);
    this.cb.onNodeDragged();
  }

  private highlightDropTargets(node: AgentNode, world: HTMLElement, graph: CanvasGraph): void {
    const cardCx = node.position.x + 60;
    const cardCy = node.position.y + 75;
    world.querySelectorAll('.workspace-frame').forEach((frame) => {
      const ws = graph.workspaces.find((w) => w.id === (frame as HTMLElement).dataset.workspaceId);
      if (!ws) return;
      frame.classList.toggle('drop-target', isInsideWorkspace(cardCx, cardCy, ws));
    });
  }

  private moveEdge(e: MouseEvent): void {
    const { mx, my } = this.clientToWorld(e);
    const dy = Math.abs(my - this.edgeDragOrigin.y) * 0.4;
    const { x: ox, y: oy } = this.edgeDragOrigin;
    this.edgeTempLine!.setAttribute(
      'd',
      `M${ox},${oy} C${ox},${oy + dy} ${mx},${my - dy} ${mx},${my}`,
    );

    const target = this.findSnapTarget(mx, my);
    this.updateSnapFeedback(target);
  }

  private finishNodeDrag(e: MouseEvent): void {
    const { graph, world } = this.getContext();
    const dragDist = Math.hypot(e.clientX - this.dragStartX, e.clientY - this.dragStartY);
    const clickedNodeId = this.dragNodeId;

    const node = graph.nodes.find((n) => n.id === this.dragNodeId);
    if (node) {
      const cardCx = node.position.x + 60;
      const cardCy = node.position.y + 75;
      const target = graph.workspaces.find((ws) => isInsideWorkspace(cardCx, cardCy, ws));
      node.workspaceId = target ? target.id : null;
    }

    world
      .querySelectorAll('.workspace-frame.drop-target')
      .forEach((f) => f.classList.remove('drop-target'));

    const card = world.querySelector(`[data-node-id="${this.dragNodeId}"]`) as HTMLElement | null;
    if (card) card.classList.remove('dragging');

    this.isDragging = false;
    this.dragNodeId = null;
    if (clickedNodeId) this.cb.onNodeDropped(clickedNodeId, dragDist);
  }

  private finishEdgeDrag(e: MouseEvent): void {
    this.isEdgeDragging = false;
    this.updateSnapFeedback(null);

    if (this.edgeTempLine) {
      this.edgeTempLine.remove();
      this.edgeTempLine = null;
    }

    if (!this.edgeFromId) return;

    const { mx, my } = this.clientToWorld(e);
    const bestId = this.findSnapTarget(mx, my);

    if (bestId) {
      const hasEdge = this.cb
        .getGraph()
        .edges.some(
          (edge) =>
            (edge.from === this.edgeFromId && edge.to === bestId) ||
            (edge.from === bestId && edge.to === this.edgeFromId),
        );
      if (!hasEdge) this.cb.onEdgeCreated(this.edgeFromId, bestId);
    }
    this.edgeFromId = null;
  }

  private snapTargetId: string | null = null;

  private clientToWorld(e: MouseEvent): { mx: number; my: number } {
    const vp = this.cb.getViewportEl();
    const { x: vpX, y: vpY } = this.cb.getVpXY();
    const zoom = this.cb.getZoom();
    const rect = vp.getBoundingClientRect();
    return {
      mx: (e.clientX - rect.left - vpX) / zoom,
      my: (e.clientY - rect.top - vpY) / zoom,
    };
  }

  private findSnapTarget(mx: number, my: number): string | null {
    const graph = this.cb.getGraph();
    const world = this.cb.getWorldEl();
    const SNAP_THRESHOLD = 80;
    let bestId: string | null = null;
    let bestDist = SNAP_THRESHOLD;

    for (const node of graph.nodes) {
      if (node.id === this.edgeFromId) continue;
      if (node.platform === 'owner') continue;
      const card = world.querySelector(`[data-node-id="${node.id}"]`) as HTMLElement | null;
      const w = card ? card.offsetWidth : CARD_FALLBACK_W;
      const h = card ? card.offsetHeight : CARD_FALLBACK_H;
      const cx = node.position.x + w / 2;
      const cy = node.position.y + h / 2;
      const dist = Math.hypot(mx - cx, my - cy);
      if (dist < bestDist) {
        bestDist = dist;
        bestId = node.id;
      }
    }
    return bestId;
  }

  private updateSnapFeedback(targetId: string | null): void {
    if (targetId === this.snapTargetId) return;
    const world = this.cb.getWorldEl();

    if (this.snapTargetId) {
      const prev = world.querySelector(
        `[data-node-id="${this.snapTargetId}"] .port-input`,
      ) as HTMLElement | null;
      prev?.classList.remove('port-active');
    }

    if (targetId) {
      const next = world.querySelector(
        `[data-node-id="${targetId}"] .port-input`,
      ) as HTMLElement | null;
      next?.classList.add('port-active');
    }

    this.snapTargetId = targetId;
  }

  private getContext(): { graph: CanvasGraph; zoom: number; world: HTMLElement } {
    return { graph: this.cb.getGraph(), zoom: this.cb.getZoom(), world: this.cb.getWorldEl() };
  }
}
