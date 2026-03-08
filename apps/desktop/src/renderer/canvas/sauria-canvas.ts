import { html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { LightDomElement } from './light-dom-element.js';
import { GraphSyncController } from './controllers/graph-sync-controller.js';
import { ViewportController } from './controllers/viewport-controller.js';
import { DragController } from './controllers/drag-controller.js';
import { ActivityController } from './controllers/activity-controller.js';
import type { AgentNode, IntegrationDef, Workspace } from './types.js';
import { generateId } from './helpers.js';
import { listIntegrationCatalog, navigateBack } from './ipc.js';
import { initLocale } from '../i18n.js';
import {
  handleCardAction,
  handleNodeUpdate,
  handlePlatformDrop,
  handleWorkspaceCreate,
  handleWorkspaceUpdate,
  handleWsLockToggle,
} from './canvas-actions.js';
import {
  handleViewportMouseDown,
  handleKeydown,
  handleCardHover,
  handleCardHoverLeave,
  openConversation,
  toggleFeed,
} from './canvas-events.js';
import type { EdgeLayer } from './components/edge-layer.js';
import type { EdgeActivity } from './components/edge-activity.js';

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
export class SauriaCanvas extends LightDomElement {
  readonly graphSync = new GraphSyncController(this);
  readonly viewport = new ViewportController(this);
  readonly drag: DragController;
  private activity: ActivityController;

  @state() selectedNodeId: string | null = null;
  @state() selectedWorkspaceId: string | null = null;
  @state() detailNode: AgentNode | null = null;
  @state() detailWorkspaceId: string | null = null;
  @state() dockCollapsed = true;
  @state() wsDialogOpen = false;
  @state() private confirmOpen = false;
  @state() private confirmMessage = '';
  @state() private legendVisible = true;
  @state() private catalogMap = new Map<string, IntegrationDef>();

  private confirmCallback: (() => void) | null = null;

  constructor() {
    super();
    this.drag = new DragController(this, {
      getGraph: () => this.graphSync.graph,
      getWorldEl: () => this.querySelector('.canvas-world') as HTMLElement,
      getViewportEl: () => this.querySelector('.canvas-viewport') as HTMLElement,
      getZoom: () => this.viewport.zoom,
      getVpXY: () => ({ x: this.viewport.x, y: this.viewport.y }),
      onNodeDragged: () => this.requestUpdate(),
      onNodeDropped: (nodeId: string, dragDist: number) => {
        if (dragDist < 5) {
          this.selectedNodeId = nodeId;
          this.detailNode = this.graphSync.graph.nodes.find((n) => n.id === nodeId) ?? null;
        }
        this.graphSync.save();
        this.requestUpdate();
      },
      onEdgeCreated: (fromId, toId) => {
        this.graphSync.graph.edges.push({
          id: generateId(),
          from: fromId,
          to: toId,
          edgeType: 'default',
          rules: [],
        });
        this.graphSync.save();
        this.requestUpdate();
      },
      onWorkspaceDragged: () => this.requestUpdate(),
      onWorkspaceDropped: () => {
        this.graphSync.save();
        this.requestUpdate();
      },
      onWorkspaceResized: () => {
        this.graphSync.save();
        this.requestUpdate();
      },
    });
    this.activity = new ActivityController(this, {
      onEdgeActivity: (from, to, preview) => {
        const ea = this.querySelector('edge-activity') as
          | (HTMLElement & { animateEdgeTravel: (f: string, t: string, p: string) => void })
          | null;
        ea?.animateEdgeTravel(from, to, preview);
      },
      onNodeActivity: () => this.requestUpdate(),
      onMessageReceived: () => this.requestUpdate(),
      requestUpdate: () => this.requestUpdate(),
    });
  }

  async connectedCallback(): Promise<void> {
    super.connectedCallback();
    await initLocale();
    await this.graphSync.init();
    document.addEventListener('keydown', this.onKeydown);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mouseup', this.onMouseUp);
    listIntegrationCatalog()
      .then((catalog) => {
        for (const item of catalog)
          this.catalogMap.set(item.id ?? item.definition.id, item.definition);
      })
      .catch(() => {});
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this.onKeydown);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
  }

  private onKeydown = (e: KeyboardEvent): void => {
    handleKeydown(this, e);
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (this.viewport.updatePan(e)) {
      this.requestUpdate();
      return;
    }
    this.drag.handleMouseMove(e);
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (this.viewport.stopPan()) {
      this.requestUpdate();
      return;
    }
    this.drag.handleMouseUp(e);
  };

  private dispatchCardAction(e: CustomEvent): void {
    const { action, nodeId } = e.detail;
    if (action === 'gear') {
      const node = this.graphSync.graph.nodes.find((n) => n.id === nodeId);
      if (node) {
        this.detailNode = node;
        return;
      }
    }
    handleCardAction(this, action, nodeId);
    if ((action === 'cancel' || action === 'disconnect') && this.selectedNodeId === nodeId)
      this.selectedNodeId = null;
  }

  private onWorkspaceCreate(e: CustomEvent): void {
    const vpEl = this.querySelector('.canvas-viewport') as HTMLElement | null;
    handleWorkspaceCreate(this, e.detail as Workspace, vpEl?.getBoundingClientRect() ?? null);
    this.wsDialogOpen = false;
  }

  render() {
    const { graph } = this.graphSync;
    const { zoom } = this.viewport;
    return html`
      <button class="palette-back" @click=${() => navigateBack()}>
        <img src="/icons/chevron-left.svg" alt="" />
      </button>
      <div
        class="canvas-viewport"
        @mousedown=${(e: MouseEvent) => handleViewportMouseDown(this, e)}
        @wheel=${(e: WheelEvent) => this.viewport.handleWheel(e)}
      >
        <div class="canvas-world" id="world">
          <edge-layer
            .edges=${graph.edges}
            .nodes=${graph.nodes}
            .worldEl=${this.querySelector('.canvas-world')}
            @edge-click=${(e: CustomEvent) =>
              openConversation(this, e.detail.fromId, e.detail.toId)}
          >
          </edge-layer>
          <edge-activity
            .edges=${graph.edges}
            .nodes=${graph.nodes}
            .worldEl=${this.querySelector('.canvas-world')}
            @bubble-click=${(e: CustomEvent) =>
              openConversation(this, e.detail.fromId, e.detail.toId)}
          >
          </edge-activity>
          ${graph.workspaces.map(
            (ws) => html`
              <workspace-frame
                .workspace=${ws}
                ?selected=${ws.id === this.selectedWorkspaceId}
                .agentCount=${graph.nodes.filter((n) => n.workspaceId === ws.id).length}
                @workspace-lock-toggle=${(e: CustomEvent) =>
                  handleWsLockToggle(this, e.detail.wsId)}
                @workspace-edit=${(e: CustomEvent) => {
                  this.detailWorkspaceId = e.detail.wsId;
                }}
              >
              </workspace-frame>
            `,
          )}
          ${graph.nodes.map(
            (node) => html`
              <agent-card
                .node=${node}
                ?selected=${node.id === this.selectedNodeId}
                ?active=${this.activity.activeNodeIds.has(node.id)}
                @card-action=${(e: CustomEvent) => this.dispatchCardAction(e)}
                @card-hover=${(e: CustomEvent) => handleCardHover(this, e.detail.nodeId)}
                @card-hover-leave=${() => handleCardHoverLeave(this)}
              >
              </agent-card>
            `,
          )}
          <orbital-bubbles
            .instances=${graph.instances ?? []}
            .catalogMap=${this.catalogMap}
            .worldEl=${this.querySelector('.canvas-world')}
          ></orbital-bubbles>
        </div>
      </div>
      <canvas-empty-state .nodeCount=${graph.nodes.length}></canvas-empty-state>
      <canvas-toolbar
        .zoom=${zoom}
        .unreadCount=${this.activity.unreadCount}
        @zoom-in=${() => this.viewport.setZoom(zoom + 0.25)}
        @zoom-out=${() => this.viewport.setZoom(zoom - 0.25)}
        @zoom-reset=${() => {
          this.viewport.x = 0;
          this.viewport.y = 0;
          this.viewport.setZoom(1);
        }}
        @toggle-feed=${() => toggleFeed(this)}
        @add-workspace=${() => {
          this.wsDialogOpen = true;
        }}
      >
      </canvas-toolbar>
      <agent-detail-panel
        .node=${this.detailNode}
        .graph=${graph}
        .catalogMap=${this.catalogMap}
        @close=${() => {
          this.detailNode = null;
        }}
        @node-update=${(e: CustomEvent) => {
          handleNodeUpdate(this, e.detail.nodeId, e.detail.patch);
        }}
        @language-change=${(e: CustomEvent) => {
          graph.language = e.detail.value === 'auto' ? undefined : e.detail.value;
          this.graphSync.save();
        }}
      >
      </agent-detail-panel>
      <workspace-detail-panel
        .workspace=${this.detailWorkspaceId
          ? (graph.workspaces.find((w) => w.id === this.detailWorkspaceId) ?? null)
          : null}
        @close=${() => {
          this.detailWorkspaceId = null;
        }}
        @workspace-update=${(e: CustomEvent) => {
          handleWorkspaceUpdate(this, e.detail.field, e.detail.value, this.detailWorkspaceId!);
        }}
      >
      </workspace-detail-panel>
      <conversation-panel
        .nodes=${graph.nodes}
        .conversationBuffer=${this.activity.conversationBuffer}
        .activeNodeIds=${this.activity.activeNodeIds}
      ></conversation-panel>
      <workspace-dialog
        ?open=${this.wsDialogOpen}
        @workspace-create=${(e: CustomEvent) => this.onWorkspaceCreate(e)}
        @cancel=${() => {
          this.wsDialogOpen = false;
        }}
      ></workspace-dialog>
      <confirm-dialog
        ?open=${this.confirmOpen}
        .message=${this.confirmMessage}
        @confirm=${() => {
          this.confirmOpen = false;
          this.confirmCallback?.();
        }}
        @cancel=${() => {
          this.confirmOpen = false;
        }}
      ></confirm-dialog>
      <coverflow-dock
        ?collapsed=${this.dockCollapsed}
        @platform-drop=${(e: CustomEvent) => {
          handlePlatformDrop(this, e.detail.platform, e.detail.clientX, e.detail.clientY);
        }}
      ></coverflow-dock>
      <button
        class="dock-toggle ${this.dockCollapsed ? 'collapsed' : ''}"
        @click=${() => {
          this.dockCollapsed = !this.dockCollapsed;
        }}
      >
        <img src="/icons/chevron-down.svg" alt="Toggle" />
      </button>
      <canvas-legend ?visible=${this.legendVisible}></canvas-legend>
    `;
  }

  updated(): void {
    const world = this.querySelector('.canvas-world') as HTMLElement | null;
    if (world) {
      this.viewport.applyTransform(world);
      const edgeLayer = this.querySelector('edge-layer') as EdgeLayer | null;
      const edgeActivity = this.querySelector('edge-activity') as EdgeActivity | null;
      if (edgeLayer && !edgeLayer.worldEl) {
        edgeLayer.worldEl = world;
      }
      if (edgeActivity && !edgeActivity.worldEl) {
        edgeActivity.worldEl = world;
      }
    }
  }
}
