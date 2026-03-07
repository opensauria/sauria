import type { ReactiveController, ReactiveControllerHost } from 'lit';
import type { CanvasGraph } from '../types.js';
import { NodeDragHandler } from './node-drag-handler.js';
import { WorkspaceDragHandler } from './workspace-drag-handler.js';

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
  private readonly nodeHandler: NodeDragHandler;
  private readonly wsHandler: WorkspaceDragHandler;

  constructor(host: ReactiveControllerHost, cb: DragCallbacks) {
    this.host = host;
    this.nodeHandler = new NodeDragHandler(cb);
    this.wsHandler = new WorkspaceDragHandler(cb);
    host.addController(this);
  }

  hostConnected(): void { /* noop */ }
  hostDisconnected(): void { /* noop */ }

  /* ── Delegated state (read by host) ── */

  get isDragging(): boolean { return this.nodeHandler.isDragging; }
  get dragNodeId(): string | null { return this.nodeHandler.dragNodeId; }
  get isEdgeDragging(): boolean { return this.nodeHandler.isEdgeDragging; }
  get edgeFromId(): string | null { return this.nodeHandler.edgeFromId; }
  get isWsDragging(): boolean { return this.wsHandler.isWsDragging; }
  get wsDragId(): string | null { return this.wsHandler.wsDragId; }
  get isWsResizing(): boolean { return this.wsHandler.isWsResizing; }
  get wsResizeId(): string | null { return this.wsHandler.wsResizeId; }

  /* ── Start operations ── */

  startNodeDrag(nodeId: string, e: MouseEvent): void {
    this.nodeHandler.startNodeDrag(nodeId, e);
  }

  startEdgeDrag(port: HTMLElement, e: MouseEvent): void {
    this.nodeHandler.startEdgeDrag(port, e);
  }

  startWsDrag(wsId: string, e: MouseEvent): void {
    this.wsHandler.startWsDrag(wsId, e);
  }

  startWsResize(wsId: string, dir: string, e: MouseEvent): void {
    this.wsHandler.startWsResize(wsId, dir, e);
  }

  /* ── Global mouse handlers (delegated from root) ── */

  handleMouseMove(e: MouseEvent): void {
    this.nodeHandler.handleMove(e);
    this.wsHandler.handleMove(e);
  }

  handleMouseUp(e: MouseEvent): void {
    this.nodeHandler.handleUp(e);
    this.wsHandler.handleUp();
  }
}
