import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { GraphSyncController } from './controllers/graph-sync-controller.js';
import { ViewportController } from './controllers/viewport-controller.js';
import { DragController } from './controllers/drag-controller.js';
import { ActivityController } from './controllers/activity-controller.js';
import type { AgentNode, IntegrationDef } from './types.js';
import { generateId, capitalize } from './helpers.js';
import { disconnectChannel, navigateBack, listIntegrationCatalog } from './ipc.js';
import { handleConnect, applyConnectResult } from './connect-handler.js';

/* Side-effect imports register custom elements */
import './components/empty-state.js';
import './components/canvas-toolbar.js';
import './components/confirm-dialog.js';
import './components/activity-legend.js';
import './components/workspace-frame.js';
import './components/workspace-dialog.js';
import './components/workspace-detail-panel.js';
import './components/agent-card.js';
import './components/agent-card-setup.js';
import './components/edge-layer.js';
import './components/edge-activity.js';
import './components/coverflow-dock.js';
import './components/agent-detail-panel.js';
import './components/conversation-panel.js';
import './components/orbital-bubbles.js';

@customElement('sauria-canvas')
export class SauriaCanvas extends LitElement {
  private graphSync = new GraphSyncController(this);
  private viewport = new ViewportController(this);
  private drag: DragController;
  private activity: ActivityController;

  @state() private selectedNodeId: string | null = null;
  @state() private selectedWorkspaceId: string | null = null;
  @state() private detailNode: AgentNode | null = null;
  @state() private detailWorkspaceId: string | null = null;
  @state() private dockCollapsed = true;
  @state() private wsDialogOpen = false;
  @state() private confirmOpen = false;
  @state() private confirmMessage = '';
  @state() private legendVisible = true;
  @state() private catalogMap = new Map<string, IntegrationDef>();

  private confirmCallback: (() => void) | null = null;
  private worldEl: HTMLElement | null = null;

  constructor() {
    super();
    this.drag = new DragController(this, {
      getGraph: () => this.graphSync.graph,
      getViewport: () => this.viewport,
      onDragEnd: () => { this.graphSync.save(); this.requestUpdate(); },
    });
    this.activity = new ActivityController(this, {
      getGraph: () => this.graphSync.graph,
      onEdgeTravel: (from, to, preview) => {
        const ea = this.renderRoot.querySelector('edge-activity') as HTMLElement & { animateEdgeTravel: (f: string, t: string, p: string) => void } | null;
        ea?.animateEdgeTravel(from, to, preview);
      },
      onNodeActivity: () => this.requestUpdate(),
      onMessage: () => this.requestUpdate(),
    });
  }

  createRenderRoot() {
    return this;
  }

  async connectedCallback(): Promise<void> {
    super.connectedCallback();
    await this.graphSync.init();
    document.addEventListener('keydown', this.handleKeydown);
    listIntegrationCatalog().then((catalog) => {
      for (const item of catalog) {
        this.catalogMap.set(item.id ?? item.definition.id, item.definition);
      }
    }).catch(() => {});
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this.handleKeydown);
  }

  render() {
    const { graph } = this.graphSync;
    const { zoom } = this.viewport;
    this.worldEl = this.querySelector('.canvas-world');

    return html`
      <button class="palette-back" @click=${() => navigateBack()}>
        <img src="/icons/chevron-left.svg" alt="" />
      </button>
      <div class="canvas-viewport"
        @mousedown=${this.handleViewportMouseDown}
        @wheel=${(e: WheelEvent) => this.viewport.handleWheel(e)}>
        <div class="canvas-world" id="world">
          <edge-layer .edges=${graph.edges} .nodes=${graph.nodes} .worldEl=${this.worldEl}
            @edge-click=${(e: CustomEvent) => this.openConversation(e.detail.fromId, e.detail.toId)}
            @edge-hover=${(e: CustomEvent) => this.handleEdgeHover(e)}
            @edge-hover-leave=${() => this.handleEdgeHoverLeave()}>
          </edge-layer>
          <edge-activity .edges=${graph.edges} .nodes=${graph.nodes} .worldEl=${this.worldEl}
            @bubble-click=${(e: CustomEvent) => this.openConversation(e.detail.fromId, e.detail.toId)}>
          </edge-activity>
          ${graph.workspaces.map((ws) => html`
            <workspace-frame .workspace=${ws}
              ?selected=${ws.id === this.selectedWorkspaceId}
              .agentCount=${graph.nodes.filter((n) => n.workspaceId === ws.id).length}
              @workspace-lock-toggle=${(e: CustomEvent) => this.handleWsLockToggle(e.detail.wsId)}
              @workspace-edit=${(e: CustomEvent) => { this.detailWorkspaceId = e.detail.wsId; }}>
            </workspace-frame>
          `)}
          ${graph.nodes.map((node) => html`
            <agent-card .node=${node}
              ?selected=${node.id === this.selectedNodeId}
              ?active=${this.activity.activeNodeIds.has(node.id)}
              @card-action=${(e: CustomEvent) => this.handleCardAction(e)}
              @card-hover=${(e: CustomEvent) => this.handleCardHover(e.detail.nodeId)}
              @card-hover-leave=${() => this.handleCardHoverLeave()}>
            </agent-card>
          `)}
          <orbital-bubbles .instances=${graph.instances ?? []} .catalogMap=${this.catalogMap} .worldEl=${this.worldEl}>
          </orbital-bubbles>
        </div>
      </div>
      <canvas-empty-state .nodeCount=${graph.nodes.length}></canvas-empty-state>
      <canvas-toolbar .zoom=${zoom} .unreadCount=${this.activity.unreadCount}
        @zoom-in=${() => this.viewport.setZoom(zoom + 0.25)}
        @zoom-out=${() => this.viewport.setZoom(zoom - 0.25)}
        @zoom-reset=${() => { this.viewport.x = 0; this.viewport.y = 0; this.viewport.setZoom(1); }}
        @toggle-feed=${() => this.toggleFeed()}
        @add-workspace=${() => { this.wsDialogOpen = true; }}>
      </canvas-toolbar>
      <agent-detail-panel .node=${this.detailNode} .graph=${graph} .catalogMap=${this.catalogMap}
        @close=${() => { this.detailNode = null; }}
        @node-update=${(e: CustomEvent) => this.handleNodeUpdate(e)}
        @language-change=${(e: CustomEvent) => { graph.language = e.detail.value === 'auto' ? undefined : e.detail.value; this.graphSync.save(); }}>
      </agent-detail-panel>
      <workspace-detail-panel .workspace=${this.detailWorkspaceId ? graph.workspaces.find((w) => w.id === this.detailWorkspaceId) ?? null : null}
        @close=${() => { this.detailWorkspaceId = null; }}
        @workspace-update=${(e: CustomEvent) => this.handleWorkspaceUpdate(e)}>
      </workspace-detail-panel>
      <conversation-panel .nodes=${graph.nodes}
        .conversationBuffer=${this.activity.conversationBuffer}
        .activeNodeIds=${this.activity.activeNodeIds}>
      </conversation-panel>
      <workspace-dialog ?open=${this.wsDialogOpen}
        @workspace-create=${(e: CustomEvent) => this.handleWorkspaceCreate(e)}
        @cancel=${() => { this.wsDialogOpen = false; }}>
      </workspace-dialog>
      <confirm-dialog ?open=${this.confirmOpen} .message=${this.confirmMessage}
        @confirm=${() => { this.confirmOpen = false; this.confirmCallback?.(); }}
        @cancel=${() => { this.confirmOpen = false; }}>
      </confirm-dialog>
      <coverflow-dock ?collapsed=${this.dockCollapsed}
        @platform-drop=${(e: CustomEvent) => this.handlePlatformDrop(e)}>
      </coverflow-dock>
      <button class="dock-toggle ${this.dockCollapsed ? 'collapsed' : ''}"
        @click=${() => { this.dockCollapsed = !this.dockCollapsed; }}>
        <img src="/icons/chevron-down.svg" alt="Toggle" />
      </button>
      <canvas-legend ?visible=${this.legendVisible}></canvas-legend>
    `;
  }

  updated(): void {
    const world = this.querySelector('.canvas-world') as HTMLElement | null;
    if (world) this.viewport.applyTransform(world);
  }

  /* ── Event Handlers ── */

  private handleViewportMouseDown = (e: MouseEvent): void => {
    const target = e.target as HTMLElement;
    if (target.closest('.agent-card') || target.closest('.workspace-header') || target.closest('.coverflow-dock')) return;
    if (target.closest('.port')) {
      this.drag.startEdgeDrag(e);
      return;
    }
    if (target.closest('.workspace-resize')) {
      this.drag.startWorkspaceResize(e);
      return;
    }
    if (e.button === 0) {
      this.viewport.startPan(e);
      this.selectedNodeId = null;
      this.selectedWorkspaceId = null;
    }
  };

  private handleKeydown = (e: KeyboardEvent): void => {
    const isMod = e.metaKey || e.ctrlKey;
    if (e.key === 'Escape') {
      if (this.wsDialogOpen) { this.wsDialogOpen = false; }
      else if (this.detailNode) { this.detailNode = null; }
      else if (this.detailWorkspaceId) { this.detailWorkspaceId = null; }
      else { this.selectedNodeId = null; this.selectedWorkspaceId = null; }
      e.preventDefault();
      return;
    }
    if (isMod && (e.key === '=' || e.key === '+')) { e.preventDefault(); this.viewport.setZoom(this.viewport.zoom + 0.25); }
    else if (isMod && e.key === '-') { e.preventDefault(); this.viewport.setZoom(this.viewport.zoom - 0.25); }
    else if (isMod && e.key === '0') { e.preventDefault(); this.viewport.x = 0; this.viewport.y = 0; this.viewport.setZoom(1); }
    else if (isMod && e.key === 'l') { e.preventDefault(); this.dockCollapsed = !this.dockCollapsed; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedNodeId && !this.isInputFocused()) {
      e.preventDefault();
      this.removeNode(this.selectedNodeId);
    }
  };

  private isInputFocused(): boolean {
    const el = document.activeElement;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
  }

  private handleCardAction = (e: CustomEvent): void => {
    const { action, nodeId } = e.detail;
    const node = this.graphSync.graph.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    if (action === 'cancel') { this.removeNode(nodeId); }
    else if (action === 'connect') { this.connectNode(node); }
    else if (action === 'gear') {
      if (node.platform === 'owner') { this.detailNode = node; }
      else { node._editing = true; this.requestUpdate(); }
    }
    else if (action === 'close-edit') {
      if (node._formData?.description !== undefined) node.description = node._formData.description;
      node._editing = false;
      this.graphSync.save();
      this.requestUpdate();
    }
    else if (action === 'disconnect') {
      disconnectChannel(node.platform, nodeId);
      this.removeNode(nodeId);
    }
  };

  private async connectNode(node: AgentNode): Promise<void> {
    node.status = 'connecting';
    node._statusMsg = '';
    this.requestUpdate();

    try {
      const result = await handleConnect(node);
      const newId = applyConnectResult(node, result, node._formData ?? {});
      if (newId) this.graphSync.replaceNodeId(node.id, newId);
      this.graphSync.save();
    } catch {
      node.status = 'error';
      node._statusMsg = 'Connection failed';
      node._statusType = 'error';
    }
    this.requestUpdate();
  }

  private removeNode(nodeId: string): void {
    const { graph } = this.graphSync;
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node || node.platform === 'owner') return;
    disconnectChannel(node.platform, nodeId).catch(() => {});
    graph.nodes = graph.nodes.filter((n) => n.id !== nodeId);
    graph.edges = graph.edges.filter((e) => e.from !== nodeId && e.to !== nodeId);
    if (this.selectedNodeId === nodeId) this.selectedNodeId = null;
    this.graphSync.save();
    this.requestUpdate();
  }

  private handleNodeUpdate = (e: CustomEvent): void => {
    const { nodeId, patch } = e.detail;
    const node = this.graphSync.graph.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    Object.assign(node, patch);
    if (node.platform === 'owner' && patch.instructions !== undefined) {
      this.graphSync.graph.globalInstructions = patch.instructions;
    }
    this.graphSync.save();
    this.requestUpdate();
  };

  private handlePlatformDrop = (e: CustomEvent): void => {
    const { platform, clientX, clientY } = e.detail;
    const world = this.querySelector('.canvas-world') as HTMLElement;
    if (!world) return;
    const rect = world.closest('.canvas-viewport')!.getBoundingClientRect();
    const wx = (clientX - rect.left - this.viewport.x) / this.viewport.zoom - 140;
    const wy = (clientY - rect.top - this.viewport.y) / this.viewport.zoom - 80;

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
    this.graphSync.graph.nodes.push(node);
    this.graphSync.save();
    this.requestUpdate();
  };

  private handleWorkspaceCreate = (e: CustomEvent): void => {
    const ws = e.detail;
    const viewport = this.querySelector('.canvas-viewport') as HTMLElement;
    const rect = viewport?.getBoundingClientRect();
    ws.position = {
      x: rect ? (rect.width / 2 - this.viewport.x) / this.viewport.zoom - 200 : 100,
      y: rect ? (rect.height / 2 - this.viewport.y) / this.viewport.zoom - 150 : 100,
    };
    ws.size = { width: 400, height: 300 };
    this.graphSync.graph.workspaces.push(ws);
    this.wsDialogOpen = false;
    this.graphSync.save();
    this.requestUpdate();
  };

  private handleWorkspaceUpdate = (e: CustomEvent): void => {
    const { field, value } = e.detail;
    const ws = this.graphSync.graph.workspaces.find((w) => w.id === this.detailWorkspaceId);
    if (!ws) return;
    if (field === 'name') ws.name = value;
    else if (field === 'color') ws.color = value;
    else if (field === 'purpose') ws.purpose = value;
    else if (field === 'budget') ws.budget = parseFloat(value) || 0;
    else if (field === 'addTopic') (ws.topics ??= []).push(value);
    else if (field === 'removeTopic') ws.topics?.splice(parseInt(value, 10), 1);
    this.graphSync.save();
    this.requestUpdate();
  };

  private handleWsLockToggle(wsId: string): void {
    const ws = this.graphSync.graph.workspaces.find((w) => w.id === wsId);
    if (!ws) return;
    ws.locked = !ws.locked;
    this.graphSync.save();
    this.requestUpdate();
  }

  private handleEdgeHover(_e: CustomEvent): void { /* Edge delete button positioning handled by edge-layer */ }
  private handleEdgeHoverLeave(): void { /* handled by edge-layer */ }

  private handleCardHover(nodeId: string): void {
    const node = this.graphSync.graph.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const orb = this.querySelector('orbital-bubbles') as HTMLElement & { show: (n: AgentNode) => void } | null;
    orb?.show(node);
  }

  private handleCardHoverLeave(): void {
    const orb = this.querySelector('orbital-bubbles') as HTMLElement & { scheduleHide: () => void } | null;
    orb?.scheduleHide();
  }

  private openConversation(fromId: string, toId: string): void {
    const panel = this.querySelector('conversation-panel') as HTMLElement & { openEdgeConversation: (f: string, t: string) => void } | null;
    panel?.openEdgeConversation(fromId, toId);
  }

  private toggleFeed(): void {
    const panel = this.querySelector('conversation-panel') as HTMLElement & { openFeed: () => void } | null;
    panel?.openFeed();
  }
}
