import type { ReactiveController, ReactiveControllerHost } from 'lit';

export class ViewportController implements ReactiveController {
  private readonly host: ReactiveControllerHost;

  x = 0;
  y = 0;
  zoom = 1;

  private isPanning = false;
  private panStartX = 0;
  private panStartY = 0;
  private panStartVpX = 0;
  private panStartVpY = 0;

  constructor(host: ReactiveControllerHost) {
    this.host = host;
    host.addController(this);
  }

  hostConnected(): void { /* noop */ }
  hostDisconnected(): void { this.isPanning = false; }

  loadFrom(x: number, y: number, zoom: number): void {
    this.x = x;
    this.y = y;
    this.zoom = zoom;
  }

  applyTransform(world: HTMLElement): void {
    (world.style as unknown as Record<string, string>).zoom = String(this.zoom);
    world.style.transform = `translate(${this.x / this.zoom}px, ${this.y / this.zoom}px)`;
  }

  setZoom(z: number): void {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const newZoom = Math.max(0.15, Math.min(3, z));
    this.x = cx - (cx - this.x) * (newZoom / this.zoom);
    this.y = cy - (cy - this.y) * (newZoom / this.zoom);
    this.zoom = newZoom;
    this.host.requestUpdate();
  }

  handleWheel(e: WheelEvent): void {
    if (e.ctrlKey || e.metaKey) {
      /* Pinch-to-zoom / Ctrl+scroll / Cmd+scroll -> zoom at cursor */
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const delta = -e.deltaY * 0.01;
      const newZoom = Math.max(0.25, Math.min(3, this.zoom + delta));
      this.x = mx - (mx - this.x) * (newZoom / this.zoom);
      this.y = my - (my - this.y) * (newZoom / this.zoom);
      this.zoom = newZoom;
    } else {
      /* Two-finger scroll -> pan */
      this.x -= e.deltaX;
      this.y -= e.deltaY;
    }
    this.host.requestUpdate();
  }

  startPan(e: MouseEvent): void {
    this.isPanning = true;
    this.panStartX = e.clientX;
    this.panStartY = e.clientY;
    this.panStartVpX = this.x;
    this.panStartVpY = this.y;
  }

  updatePan(e: MouseEvent): boolean {
    if (!this.isPanning) return false;
    this.x = this.panStartVpX + (e.clientX - this.panStartX);
    this.y = this.panStartVpY + (e.clientY - this.panStartY);
    return true;
  }

  stopPan(): boolean {
    if (!this.isPanning) return false;
    this.isPanning = false;
    return true;
  }

  get panning(): boolean {
    return this.isPanning;
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this.x) / this.zoom,
      y: (sy - this.y) / this.zoom,
    };
  }
}
