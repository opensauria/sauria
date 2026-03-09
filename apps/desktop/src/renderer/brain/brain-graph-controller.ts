import { colors } from '@sauria/design-tokens';
import { TYPE_COLOR_STRINGS as TYPE_COLORS } from './scene-types.js';
import { brainListEntities, brainListRelations } from './ipc.js';
import { truncate } from './brain-helpers.js';
import { t } from '../i18n.js';

interface GraphNode {
  id: string;
  name: string;
  type: string;
  importance: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface GraphEdge {
  from: string;
  to: string;
  type: string;
  strength: number;
}

const SIM = { repulsion: 800, attraction: 0.005, damping: 0.92, minAlpha: 0.001 };

export class BrainGraphController {
  private nodes: GraphNode[] = [];
  private edges: GraphEdge[] = [];
  private nodeMap = new Map<string, GraphNode>();
  private cam = { x: 0, y: 0, zoom: 1 };
  private drag: { node: GraphNode; startX: number; startY: number } | null = null;
  private hover: GraphNode | null = null;
  private pan: { startX: number; startY: number; camX: number; camY: number } | null = null;
  private animId: number | null = null;
  private settled = false;
  private readonly ctx: CanvasRenderingContext2D;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly wrap: HTMLDivElement,
    private readonly emptyEl: HTMLDivElement,
    private readonly statsEl: HTMLDivElement,
    private readonly onEntitySelect: (id: string) => void,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.bindEvents();
  }

  async load(): Promise<void> {
    try {
      const [entityResult, relationResult] = await Promise.all([
        brainListEntities({ limit: 200 }),
        brainListRelations({ limit: 500 }),
      ]);

      if (entityResult.rows.length === 0) {
        this.emptyEl.style.display = 'flex';
        this.canvas.style.display = 'none';
        this.statsEl.textContent = '';
        return;
      }

      this.emptyEl.style.display = 'none';
      this.canvas.style.display = 'block';
      await new Promise((resolve) => requestAnimationFrame(resolve));
      this.resize();
      if (this.canvas.width === 0 || this.canvas.height === 0) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        this.resize();
      }

      const cx = this.canvas.width / 2 / (devicePixelRatio || 1);
      const cy = this.canvas.height / 2 / (devicePixelRatio || 1);
      this.nodeMap = new Map();
      this.nodes = entityResult.rows.map((e, i) => {
        const angle = (i / entityResult.rows.length) * Math.PI * 2;
        const radius = 120 + Math.random() * 80;
        const node: GraphNode = {
          id: e.id as string,
          name: (e.name as string) || (e.id as string),
          type: (e.type as string) || 'concept',
          importance: typeof e.importance_score === 'number' ? e.importance_score : 0.3,
          x: cx + Math.cos(angle) * radius,
          y: cy + Math.sin(angle) * radius,
          vx: 0,
          vy: 0,
        };
        this.nodeMap.set(e.id as string, node);
        return node;
      });

      this.edges = relationResult.rows
        .filter(
          (r) =>
            this.nodeMap.has(r.from_entity_id as string) &&
            this.nodeMap.has(r.to_entity_id as string),
        )
        .map((r) => ({
          from: r.from_entity_id as string,
          to: r.to_entity_id as string,
          type: r.type as string,
          strength: typeof r.strength === 'number' ? r.strength : 0.5,
        }));

      this.settled = false;
      this.statsEl.textContent = t('brain.graphStats')
        .replace('{0}', String(this.nodes.length))
        .replace('{1}', String(this.edges.length));

      if (this.animId) cancelAnimationFrame(this.animId);
      this.cam = { x: 0, y: 0, zoom: 1 };
      this.tick();
    } catch (err) {
      console.error('[brain-graph] load failed:', err);
      this.emptyEl.style.display = 'flex';
      this.canvas.style.display = 'none';
      const div = this.emptyEl.querySelector('div');
      if (div) div.textContent = t('brain.error');
      this.statsEl.textContent = '';
    }
  }

  resume(): void {
    if (!this.settled) this.tick();
  }

  zoomIn(): void {
    this.cam.zoom = Math.min(5, this.cam.zoom * 1.3);
    if (this.settled) this.draw();
  }

  zoomOut(): void {
    this.cam.zoom = Math.max(0.1, this.cam.zoom / 1.3);
    if (this.settled) this.draw();
  }

  zoomReset(): void {
    this.cam = { x: 0, y: 0, zoom: 1 };
    if (this.settled) this.draw();
  }

  resize(): void {
    const dpr = devicePixelRatio || 1;
    const rect = this.wrap.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  redrawIfSettled(): void {
    if (this.settled) this.draw();
  }

  dispose(): void {
    if (this.animId) cancelAnimationFrame(this.animId);
  }

  private tick = (): void => {
    if (!this.settled) this.simulate();
    this.draw();
    this.animId = requestAnimationFrame(this.tick);
  };

  private simulate(): void {
    let maxV = 0;
    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = i + 1; j < this.nodes.length; j++) {
        const a = this.nodes[i],
          b = this.nodes[j];
        const dx = b.x - a.x,
          dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = SIM.repulsion / (dist * dist);
        const fx = (dx / dist) * force,
          fy = (dy / dist) * force;
        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;
      }
    }

    for (const e of this.edges) {
      const a = this.nodeMap.get(e.from),
        b = this.nodeMap.get(e.to);
      if (!a || !b) continue;
      const dx = b.x - a.x,
        dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = dist * SIM.attraction * (1 + e.strength);
      const fx = (dx / dist) * force,
        fy = (dy / dist) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }

    const cx = this.canvas.width / 2 / (devicePixelRatio || 1);
    const cy = this.canvas.height / 2 / (devicePixelRatio || 1);
    for (const n of this.nodes) {
      n.vx += (cx - n.x) * 0.0005;
      n.vy += (cy - n.y) * 0.0005;
      n.vx *= SIM.damping;
      n.vy *= SIM.damping;
      if (this.drag?.node !== n) {
        n.x += n.vx;
        n.y += n.vy;
      }
      maxV = Math.max(maxV, Math.abs(n.vx), Math.abs(n.vy));
    }
    this.settled = maxV < SIM.minAlpha;
  }

  private draw(): void {
    const w = this.canvas.width / (devicePixelRatio || 1);
    const h = this.canvas.height / (devicePixelRatio || 1);
    this.ctx.clearRect(0, 0, w, h);
    this.ctx.save();
    this.ctx.translate(w / 2 + this.cam.x, h / 2 + this.cam.y);
    this.ctx.scale(this.cam.zoom, this.cam.zoom);
    this.ctx.translate(-w / 2, -h / 2);

    for (const e of this.edges) {
      const a = this.nodeMap.get(e.from),
        b = this.nodeMap.get(e.to);
      if (!a || !b) continue;
      this.ctx.beginPath();
      this.ctx.moveTo(a.x, a.y);
      this.ctx.lineTo(b.x, b.y);
      this.ctx.strokeStyle = `rgba(255,255,255,${0.04 + e.strength * 0.08})`;
      this.ctx.lineWidth = 0.5 + e.strength;
      this.ctx.stroke();
    }

    for (const n of this.nodes) {
      const r = 4 + n.importance * 16;
      const color = TYPE_COLORS[n.type] || colors.textDim;
      const isHover = this.hover === n;
      this.ctx.beginPath();
      this.ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      this.ctx.fillStyle = isHover ? color : color + '99';
      this.ctx.fill();
      if (isHover) {
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
      }
      if (r > 6 || isHover) {
        this.ctx.fillStyle = 'rgba(255,255,255,0.8)';
        this.ctx.font = `${isHover ? 12 : 10}px -apple-system, system-ui, sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.fillText(truncate(n.name, 18), n.x, n.y + r + 14);
      }
    }
    this.ctx.restore();
  }

  private screenToGraph(sx: number, sy: number) {
    const w = this.canvas.width / (devicePixelRatio || 1);
    const h = this.canvas.height / (devicePixelRatio || 1);
    return {
      x: (sx - w / 2 - this.cam.x) / this.cam.zoom + w / 2,
      y: (sy - h / 2 - this.cam.y) / this.cam.zoom + h / 2,
    };
  }

  private findNodeAt(gx: number, gy: number): GraphNode | null {
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const n = this.nodes[i];
      const r = 4 + n.importance * 16;
      const dx = n.x - gx,
        dy = n.y - gy;
      if (dx * dx + dy * dy <= (r + 4) * (r + 4)) return n;
    }
    return null;
  }

  private bindEvents(): void {
    this.canvas.addEventListener('mousedown', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const { x: gx, y: gy } = this.screenToGraph(e.clientX - rect.left, e.clientY - rect.top);
      const node = this.findNodeAt(gx, gy);
      if (node) {
        this.drag = { node, startX: gx, startY: gy };
        this.settled = false;
      } else {
        this.pan = { startX: e.clientX, startY: e.clientY, camX: this.cam.x, camY: this.cam.y };
      }
    });

    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const { x: gx, y: gy } = this.screenToGraph(e.clientX - rect.left, e.clientY - rect.top);
      if (this.drag) {
        this.drag.node.x = gx;
        this.drag.node.y = gy;
        this.drag.node.vx = 0;
        this.drag.node.vy = 0;
        this.settled = false;
      } else if (this.pan) {
        this.cam.x = this.pan.camX + (e.clientX - this.pan.startX);
        this.cam.y = this.pan.camY + (e.clientY - this.pan.startY);
      } else {
        const prev = this.hover;
        this.hover = this.findNodeAt(gx, gy);
        this.canvas.style.cursor = this.hover ? 'pointer' : 'grab';
        if (prev !== this.hover && this.settled) this.draw();
      }
    });

    this.canvas.addEventListener('mouseup', (e) => {
      if (this.drag) {
        const rect = this.canvas.getBoundingClientRect();
        const { x: gx, y: gy } = this.screenToGraph(e.clientX - rect.left, e.clientY - rect.top);
        const dx = gx - this.drag.startX,
          dy = gy - this.drag.startY;
        if (dx * dx + dy * dy < 9) this.onEntitySelect(this.drag.node.id);
        this.drag = null;
      }
      this.pan = null;
    });

    this.canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        this.cam.zoom = Math.max(0.1, Math.min(5, this.cam.zoom * factor));
        if (this.settled) this.draw();
      },
      { passive: false },
    );
  }
}
