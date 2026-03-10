import type { ReactiveController, ReactiveControllerHost } from 'lit';
import type { CanvasGraph, IntegrationDef, OwnerProfile } from '../types.js';
import {
  getCanvasGraph,
  saveCanvasGraph,
  getOwnerProfile,
  listIntegrationCatalog,
} from '../ipc.js';

const SAVE_DEBOUNCE_MS = 300;
const VIEWPORT_DEBOUNCE_MS = 500;

export class GraphSyncController implements ReactiveController {
  private readonly host: ReactiveControllerHost;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  readonly catalogMap = new Map<string, IntegrationDef>();

  graph: CanvasGraph = {
    nodes: [],
    edges: [],
    workspaces: [],
    globalInstructions: '',
    viewport: { x: 0, y: 0, zoom: 1 },
  };

  constructor(host: ReactiveControllerHost) {
    this.host = host;
    host.addController(this);
  }

  hostConnected(): void {
    /* noop — init() is called explicitly after first render */
  }

  hostDisconnected(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
  }

  async init(): Promise<void> {
    try {
      this.graph = await getCanvasGraph();
    } catch {
      /* fallback to empty graph */
    }
    if (!this.graph.workspaces) this.graph.workspaces = [];
    if (typeof this.graph.globalInstructions !== 'string') {
      this.graph.globalInstructions = '';
    }

    this.clearStaleTerminalFlags();
    await this.ensureOwnerNode();
    this.preloadCatalog();
    this.host.requestUpdate();
  }

  private async ensureOwnerNode(): Promise<void> {
    let ownerProfile: OwnerProfile = {
      fullName: 'You',
      photo: null,
      customInstructions: '',
    };
    try {
      ownerProfile = await getOwnerProfile();
    } catch {
      /* fallback */
    }

    const existing = this.graph.nodes.find((n) => n.platform === 'owner');
    if (!existing) {
      const cx = window.innerWidth / 2 / (this.graph.viewport.zoom || 1) - 60;
      this.graph.nodes.unshift({
        id: 'owner',
        platform: 'owner',
        label: ownerProfile.fullName || 'You',
        photo: ownerProfile.photo || null,
        position: { x: Math.round(cx), y: 40 },
        status: 'connected',
        credentials: '',
        meta: {},
        instructions: ownerProfile.customInstructions || '',
        role: 'lead',
        autonomy: 3,
      });
      this.save();
    } else {
      let changed = false;
      if (ownerProfile.photo && existing.photo !== ownerProfile.photo) {
        existing.photo = ownerProfile.photo;
        changed = true;
      }
      if (ownerProfile.fullName && existing.label !== ownerProfile.fullName) {
        existing.label = ownerProfile.fullName;
        changed = true;
      }
      if (changed) this.save();
    }

    /* Migrate globalInstructions to owner node */
    const ownerNode = this.graph.nodes.find((n) => n.platform === 'owner');
    if (ownerNode && !ownerNode.instructions && this.graph.globalInstructions) {
      ownerNode.instructions = this.graph.globalInstructions;
      this.save();
    }
  }

  /** Clear stale terminalActive flags from a previous crash / force-quit. */
  private clearStaleTerminalFlags(): void {
    const hasStale = this.graph.nodes.some((n) => n.codeMode?.terminalActive);
    if (!hasStale) return;

    this.graph.nodes = this.graph.nodes.map((n) =>
      n.codeMode?.terminalActive ? { ...n, codeMode: { ...n.codeMode, terminalActive: false } } : n,
    );
    this.save();
  }

  private preloadCatalog(): void {
    listIntegrationCatalog()
      .then((catalog) => {
        for (const item of catalog) {
          this.catalogMap.set(item.id ?? item.definition.id, item.definition);
        }
      })
      .catch(() => {
        /* daemon may not be ready */
      });
  }

  save(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      saveCanvasGraph(this.graph);
    }, SAVE_DEBOUNCE_MS);
  }

  /** Bypass debounce for critical state (e.g. terminalActive mutex). */
  saveImmediate(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    saveCanvasGraph(this.graph);
  }

  saveViewport(x: number, y: number, zoom: number): void {
    this.graph.viewport = { x, y, zoom };
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      saveCanvasGraph(this.graph);
    }, VIEWPORT_DEBOUNCE_MS);
  }

  replaceNodeId(oldId: string, newId: string): void {
    const node = this.graph.nodes.find((n) => n.id === oldId);
    if (!node) return;
    node.id = newId;
    if (node.credentials) {
      node.credentials = node.credentials.replace(oldId, newId);
    }
    for (const edge of this.graph.edges) {
      if (edge.from === oldId) edge.from = newId;
      if (edge.to === oldId) edge.to = newId;
    }
  }
}
