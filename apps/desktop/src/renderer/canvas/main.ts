import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

/* ═══════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════ */

interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

interface AgentNode {
  id: string;
  platform: string;
  label: string;
  photo: string | null;
  position: { x: number; y: number };
  status: string;
  credentials: string;
  meta: Record<string, string>;
  workspaceId?: string | null;
  role?: string;
  autonomy?: number | string;
  instructions?: string;
  behavior?: {
    proactive?: boolean;
    ownerResponse?: boolean;
    peer?: boolean;
  };
  _formData?: Record<string, string>;
  _statusMsg?: string;
  _statusType?: string;
  _animateIn?: boolean;
  _editing?: boolean;
}

interface Edge {
  id: string;
  from: string;
  to: string;
  edgeType: string;
  rules: unknown[];
}

interface Workspace {
  id: string;
  name: string;
  color: string;
  purpose?: string;
  topics?: string[];
  budget?: number;
  position: { x: number; y: number };
  size: { w: number; h: number };
  checkpoints: unknown[];
  groups: unknown[];
}

interface CanvasGraph {
  nodes: AgentNode[];
  edges: Edge[];
  workspaces: Workspace[];
  globalInstructions: string;
  viewport: Viewport;
}

interface OwnerProfile {
  fullName: string;
  photo: string | null;
  customInstructions: string;
}

interface ConnectResult {
  success: boolean;
  error?: string;
  botUsername?: string;
  photo?: string;
  botId?: string;
  firstName?: string;
  teamName?: string;
  botUserId?: string;
  teamId?: string;
  displayName?: string;
  phoneNumberId?: string;
  email?: string;
}

interface PlatformField {
  key: string;
  label: string;
  type: string;
  placeholder: string;
  hint: string;
}

/* ═══════════════════════════════════════════════
   State
   ═══════════════════════════════════════════════ */

var graph: CanvasGraph = {
  nodes: [],
  edges: [],
  workspaces: [],
  globalInstructions: '',
  viewport: { x: 0, y: 0, zoom: 1 },
};
var selectedNodeId: string | null = null;
var selectedWorkspaceId: string | null = null;
var detailNodeId: string | null = null;
var detailWorkspaceId: string | null = null;

/* viewport pan/zoom state */
var vpX = 0,
  vpY = 0,
  vpZoom = 1;
var isPanning = false,
  panStartX = 0,
  panStartY = 0,
  panStartVpX = 0,
  panStartVpY = 0;

/* card drag state */
var isDragging = false,
  dragNodeId: string | null = null,
  dragStartX = 0,
  dragStartY = 0,
  dragStartNodeX = 0,
  dragStartNodeY = 0;

/* edge drag state */
var isEdgeDragging = false,
  edgeFromId: string | null = null,
  edgeTempLine: SVGPathElement | null = null;

/* workspace resize state */
var isWsResizing = false,
  wsResizeId: string | null = null,
  wsResizeDir: string | null = null;
var wsResizeStartX = 0,
  wsResizeStartY = 0,
  wsResizeStartW = 0,
  wsResizeStartH = 0;

/* workspace drag state (magnetic: moves contained cards too) */
var isWsDragging = false,
  wsDragId: string | null = null;
var wsDragStartX = 0,
  wsDragStartY = 0,
  wsDragStartWsX = 0,
  wsDragStartWsY = 0;
var wsDragNodeStarts: Array<{ id: string; startX: number; startY: number }> = [];

/* DOM refs */
var viewport = document.getElementById('viewport') as HTMLDivElement;
var world = document.getElementById('world') as HTMLDivElement;
var edgeSvg = document.getElementById('edge-svg') as unknown as SVGSVGElement;
var emptyState = document.getElementById('empty-state') as HTMLDivElement;
var zoomDisplay = document.getElementById('zoom-display') as HTMLSpanElement;
var agentDetailPanel = document.getElementById('agent-detail-panel') as HTMLDivElement;
var workspaceDetailPanel = document.getElementById('workspace-detail-panel') as HTMLDivElement;
var wsDialogOverlay = document.getElementById('ws-dialog-overlay') as HTMLDivElement;

/* Platform icons — loaded from /icons/ directory (simple-icons + lucide-static) */
var platformIcons: Record<string, string> = {
  telegram: '<img src="/icons/telegram.svg" alt="Telegram" />',
  slack: '<img src="/icons/slack.svg" alt="Slack" />',
  whatsapp: '<img src="/icons/whatsapp.svg" alt="WhatsApp" />',
  discord: '<img src="/icons/discord.svg" alt="Discord" />',
  gmail: '<img src="/icons/gmail.svg" alt="Gmail" />',
  email: '<img src="/icons/email.svg" alt="Email" class="icon-mono" />',
};

/* Persona templates */
var CEO_TEMPLATE = [
  '## Response Format',
  'Plain text only. No markdown formatting, no emojis, no asterisks.',
  '',
  '## Tone',
  'Concise, direct, professional.',
  '',
  '## Language',
  'English.',
].join('\n');

var BOT_TEMPLATE = [
  '## Role',
  '[What this agent does — e.g., Customer support for billing]',
  '',
  '## Personality',
  '[How this agent communicates — e.g., Friendly, patient, empathetic]',
  '',
  '## Response Style',
  '- [e.g., Use simple language]',
  '- [e.g., Ask clarifying questions when needed]',
  '',
  '## Constraints',
  '- [e.g., Never share internal policies]',
  '- [e.g., Escalate to human for complex issues]',
].join('\n');

/* ═══════════════════════════════════════════════
   Init: load graph
   ═══════════════════════════════════════════════ */

async function init() {
  try {
    graph = await invoke<CanvasGraph>('get_canvas_graph');
  } catch {
    graph = {
      nodes: [],
      edges: [],
      workspaces: [],
      globalInstructions: '',
      viewport: { x: 0, y: 0, zoom: 1 },
    };
  }
  if (!graph.workspaces) graph.workspaces = [];
  if (typeof graph.globalInstructions !== 'string') graph.globalInstructions = '';
  vpX = graph.viewport.x;
  vpY = graph.viewport.y;
  vpZoom = graph.viewport.zoom;

  /* Auto-create owner node if not present */
  var hasOwner = graph.nodes.some(function (n) {
    return n.platform === 'owner';
  });
  if (!hasOwner) {
    var ownerProfile: OwnerProfile = { fullName: 'You', photo: null, customInstructions: '' };
    try {
      ownerProfile = await invoke<OwnerProfile>('get_owner_profile');
    } catch {
      /* fallback */
    }
    var cx = (window.innerWidth / 2 - vpX) / vpZoom - 60;
    graph.nodes.unshift({
      id: 'owner-' + generateId(),
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
    saveGraph();
  }

  /* Migrate: if globalInstructions exists but owner node has no instructions, copy over */
  var ownerNode = graph.nodes.find(function (n) {
    return n.platform === 'owner';
  });
  if (ownerNode && !ownerNode.instructions && graph.globalInstructions) {
    ownerNode.instructions = graph.globalInstructions;
    saveGraph();
  }

  renderAll();
  cfCurrentIndex = cfActiveIndex;
  renderCoverflow();
}

/* ═══════════════════════════════════════════════
   Render
   ═══════════════════════════════════════════════ */

function renderAll() {
  applyTransform();
  renderWorkspaces();
  renderNodes();
  renderEdges();
  updateEmptyState();
  updateZoomDisplay();
}

function applyTransform() {
  /* CSS zoom re-renders content crisp at any scale (no bitmap blur).
     zoom also multiplies transform values, so divide translate by zoom
     to keep vpX/vpY in screen-pixel space: visual offset = (vpX/Z)*Z = vpX */
  (world.style as unknown as Record<string, string>).zoom = String(vpZoom);
  world.style.transform = 'translate(' + vpX / vpZoom + 'px, ' + vpY / vpZoom + 'px)';
}

function updateEmptyState() {
  emptyState.style.display = graph.nodes.length === 0 ? '' : 'none';
}

function updateZoomDisplay() {
  zoomDisplay.textContent = Math.round(vpZoom * 100) + '%';
}

function renderWorkspaces() {
  /* Remove existing workspace frames */
  world.querySelectorAll('.workspace-frame').forEach(function (el) {
    el.remove();
  });

  graph.workspaces.forEach(function (ws) {
    var frame = document.createElement('div');
    frame.className = 'workspace-frame' + (ws.id === selectedWorkspaceId ? ' selected' : '');
    frame.dataset.workspaceId = ws.id;
    frame.style.left = ws.position.x + 'px';
    frame.style.top = ws.position.y + 'px';
    frame.style.width = ws.size.w + 'px';
    frame.style.height = ws.size.h + 'px';
    frame.style.borderColor = ws.color;
    frame.style.background = hexToRgba(ws.color, 0.04);

    var agentCount = graph.nodes.filter(function (n) {
      return n.workspaceId === ws.id;
    }).length;

    frame.innerHTML =
      '<div class="workspace-header" data-workspace-id="' +
      ws.id +
      '">' +
      '<span class="workspace-name">' +
      escapeHtml(ws.name) +
      '</span>' +
      '<span class="workspace-count">' +
      agentCount +
      '</span>' +
      (ws.purpose
        ? '<span class="workspace-purpose">' + escapeHtml(ws.purpose) + '</span>'
        : '') +
      '<button class="ws-gear" data-action="ws-gear" data-ws-id="' +
      ws.id +
      '" title="Edit workspace">' +
      GEAR_SVG +
      '</button>' +
      '</div>' +
      '<div class="workspace-resize workspace-resize-r" data-ws-id="' +
      ws.id +
      '" data-dir="r"></div>' +
      '<div class="workspace-resize workspace-resize-b" data-ws-id="' +
      ws.id +
      '" data-dir="b"></div>' +
      '<div class="workspace-resize workspace-resize-br" data-ws-id="' +
      ws.id +
      '" data-dir="br"></div>';

    world.appendChild(frame);
  });
}

function getFieldsForPlatform(platform: string): PlatformField[] {
  var fields: Record<string, PlatformField[]> = {
    telegram: [
      {
        key: 'userId',
        label: 'Your User ID',
        type: 'text',
        placeholder: '123456789',
        hint: 'Get from @userinfobot on Telegram',
      },
      {
        key: 'token',
        label: 'Bot Token',
        type: 'password',
        placeholder: '123456:ABC-DEF...',
        hint: 'Get from @BotFather on Telegram',
      },
    ],
    slack: [
      {
        key: 'token',
        label: 'Bot Token',
        type: 'password',
        placeholder: 'xoxb-...',
        hint: 'From Slack App > OAuth & Permissions',
      },
      {
        key: 'signingSecret',
        label: 'Signing Secret',
        type: 'password',
        placeholder: 'abc123...',
        hint: 'From Slack App > Basic Information',
      },
    ],
    whatsapp: [
      {
        key: 'phoneNumberId',
        label: 'Phone Number ID',
        type: 'text',
        placeholder: '1234567890',
        hint: 'From Meta Business > WhatsApp > API Setup',
      },
      {
        key: 'accessToken',
        label: 'Access Token',
        type: 'password',
        placeholder: 'EAA...',
        hint: 'Permanent token from System Users',
      },
    ],
    discord: [
      {
        key: 'token',
        label: 'Bot Token',
        type: 'password',
        placeholder: 'MTIz...',
        hint: 'From Discord Developer Portal > Bot > Token',
      },
    ],
    gmail: [],
    email: [
      {
        key: 'imapHost',
        label: 'IMAP Host',
        type: 'text',
        placeholder: 'imap.gmail.com',
        hint: '',
      },
      { key: 'imapPort', label: 'IMAP Port', type: 'number', placeholder: '993', hint: '' },
      {
        key: 'smtpHost',
        label: 'SMTP Host',
        type: 'text',
        placeholder: 'smtp.gmail.com',
        hint: 'Leave empty to use IMAP host',
      },
      { key: 'smtpPort', label: 'SMTP Port', type: 'number', placeholder: '587', hint: '' },
      {
        key: 'username',
        label: 'Username / Email',
        type: 'text',
        placeholder: 'bot@example.com',
        hint: '',
      },
      {
        key: 'password',
        label: 'Password',
        type: 'password',
        placeholder: 'App password',
        hint: 'Use an app password for Gmail / Outlook',
      },
    ],
  };
  return fields[platform] || [];
}

var GEAR_SVG = '<img src="/icons/settings.svg" alt="Settings" />';

function renderNodes() {
  world.querySelectorAll('.agent-card').forEach(function (el) {
    el.remove();
  });
  graph.nodes.forEach(function (node) {
    var card = document.createElement('div');

    card.dataset.nodeId = node.id;
    card.style.left = node.position.x + 'px';
    card.style.top = node.position.y + 'px';

    if (node.status === 'setup' || node.status === 'connecting') {
      var isConnecting = node.status === 'connecting';
      card.className =
        'agent-card ' + node.status + (node.id === selectedNodeId ? ' selected' : '');

      var statusHtml = '';
      if (isConnecting) {
        statusHtml =
          '<div class="card-setup-status info"><span class="card-spinner"></span>Connecting...</div>';
      } else if (node._statusMsg) {
        statusHtml =
          '<div class="card-setup-status ' +
          (node._statusType || '') +
          '">' +
          escapeHtml(node._statusMsg) +
          '</div>';
      }

      if (node.platform === 'gmail') {
        /* Gmail: OAuth-based, single button */
        card.innerHTML =
          '<div class="card-setup-header">' +
          '<div class="cf-icon">' +
          (platformIcons.gmail || '') +
          '</div>' +
          '<span class="card-setup-title">Gmail</span>' +
          '<button class="card-setup-close" data-action="cancel">&times;</button>' +
          '</div>' +
          '<div class="card-setup-field" style="text-align:center;color:rgba(255,255,255,0.4);font-size:12px;margin-bottom:8px;">Sign in securely with your Google account. No passwords stored.</div>' +
          statusHtml +
          '<div class="card-setup-actions">' +
          '<button class="btn-cancel" data-action="cancel"' +
          (isConnecting ? ' disabled' : '') +
          '>Cancel</button>' +
          '<button class="btn-connect" data-action="connect" style="background:#4285F4;"' +
          (isConnecting ? ' disabled' : '') +
          '>Sign in with Google</button>' +
          '</div>';
      } else {
        var fieldsHtml = '';
        var platformFields = getFieldsForPlatform(node.platform);
        platformFields.forEach(function (f) {
          var val = (node._formData && node._formData[f.key]) || '';
          fieldsHtml +=
            '<div class="card-setup-field">' +
            '<label>' +
            escapeHtml(f.label) +
            '</label>' +
            '<input type="' +
            f.type +
            '" data-field="' +
            f.key +
            '" placeholder="' +
            escapeHtml(f.placeholder) +
            '" value="' +
            escapeHtml(String(val)) +
            '"' +
            (isConnecting ? ' disabled' : '') +
            ' />' +
            (f.hint ? '<div class="card-field-hint">' + escapeHtml(f.hint) + '</div>' : '') +
            '</div>';
        });

        card.innerHTML =
          '<div class="card-setup-header">' +
          '<div class="cf-icon">' +
          (platformIcons[node.platform] || '') +
          '</div>' +
          '<span class="card-setup-title">' +
          escapeHtml(capitalize(node.platform)) +
          '</span>' +
          '<button class="card-setup-close" data-action="cancel">&times;</button>' +
          '</div>' +
          fieldsHtml +
          statusHtml +
          '<div class="card-setup-actions">' +
          '<button class="btn-cancel" data-action="cancel"' +
          (isConnecting ? ' disabled' : '') +
          '>Cancel</button>' +
          '<button class="btn-connect" data-action="connect"' +
          (isConnecting ? ' disabled' : '') +
          '>Connect</button>' +
          '</div>';
      }
    } else if (node.status === 'error') {
      card.className =
        'agent-card error-state' + (node.id === selectedNodeId ? ' selected' : '');
      var fieldsHtml = '';
      var platformFields = getFieldsForPlatform(node.platform);
      platformFields.forEach(function (f) {
        var val = (node._formData && node._formData[f.key]) || '';
        fieldsHtml +=
          '<div class="card-setup-field">' +
          '<label>' +
          escapeHtml(f.label) +
          '</label>' +
          '<input type="' +
          f.type +
          '" data-field="' +
          f.key +
          '" placeholder="' +
          escapeHtml(f.placeholder) +
          '" value="' +
          escapeHtml(String(val)) +
          '" />' +
          (f.hint ? '<div class="card-field-hint">' + escapeHtml(f.hint) + '</div>' : '') +
          '</div>';
      });

      card.innerHTML =
        '<div class="card-setup-header">' +
        '<div class="cf-icon">' +
        (platformIcons[node.platform] || '') +
        '</div>' +
        '<span class="card-setup-title">' +
        escapeHtml(capitalize(node.platform)) +
        '</span>' +
        '<button class="card-setup-close" data-action="cancel">&times;</button>' +
        '</div>' +
        fieldsHtml +
        '<div class="card-setup-status error">' +
        escapeHtml(node._statusMsg || 'Connection failed') +
        '</div>' +
        '<div class="card-setup-actions">' +
        '<button class="btn-cancel" data-action="cancel">Cancel</button>' +
        '<button class="btn-connect" data-action="connect">Retry</button>' +
        '</div>';
    } else if (node._editing === true) {
      card.className = 'agent-card setup' + (node.id === selectedNodeId ? ' selected' : '');
      var displayName = node.meta.firstName || node.label.replace(/^@/, '');
      var fieldsHtml = '';
      var platformFields = getFieldsForPlatform(node.platform);
      platformFields.forEach(function (f) {
        fieldsHtml +=
          '<div class="card-setup-field">' +
          '<label>' +
          escapeHtml(f.label) +
          '</label>' +
          '<input type="password" data-field="' +
          f.key +
          '" placeholder="' +
          escapeHtml(f.placeholder) +
          '" value="********" disabled />' +
          '</div>';
      });

      card.innerHTML =
        '<div class="card-setup-header">' +
        '<div class="cf-icon">' +
        (platformIcons[node.platform] || '') +
        '</div>' +
        '<span class="card-setup-title">' +
        escapeHtml(displayName) +
        '</span>' +
        '<button class="card-setup-close" data-action="close-edit">&times;</button>' +
        '</div>' +
        fieldsHtml +
        '<div class="card-setup-actions">' +
        '<button class="btn-cancel" data-action="disconnect">Disconnect</button>' +
        '<button class="btn-connect" data-action="close-edit">Done</button>' +
        '</div>';
    } else if (node.platform === 'owner') {
      /* Owner card */
      card.className =
        'agent-card owner-card' + (node.id === selectedNodeId ? ' selected' : '');

      var ownerAvatarInner = node.photo
        ? '<img src="' + node.photo + '" alt="" />'
        : '<span class="avatar-initials">' + getInitials(node.label) + '</span>';

      card.innerHTML =
        '<button class="card-gear" data-action="gear" title="Settings">' +
        GEAR_SVG +
        '</button>' +
        '<div class="agent-avatar owner-avatar">' +
        ownerAvatarInner +
        '</div>' +
        '<div class="agent-name">' +
        escapeHtml(node.label) +
        '</div>' +
        '<span class="platform-badge owner">YOU</span>' +
        '<div class="port port-output" data-node-id="' +
        node.id +
        '" data-port="output"></div>';
    } else {
      /* Connected portrait card */
      card.className = 'agent-card' + (node.id === selectedNodeId ? ' selected' : '');
      var photoHtml = node.photo
        ? '<img src="' + node.photo + '" alt="" />'
        : platformIcons[node.platform] || '';
      var displayName = node.meta.firstName || node.label.replace(/^@/, '');
      var handle = node.label.startsWith('@') ? node.label : '';

      card.innerHTML =
        '<button class="card-gear" data-action="gear" title="Settings">' +
        GEAR_SVG +
        '</button>' +
        '<div class="agent-avatar">' +
        photoHtml +
        '<span class="agent-status-dot ' +
        node.status +
        '"></span>' +
        '</div>' +
        '<div class="agent-name">' +
        escapeHtml(displayName) +
        '</div>' +
        (handle ? '<div class="agent-handle">' + escapeHtml(handle) + '</div>' : '') +
        '<span class="platform-badge ' +
        node.platform +
        '">' +
        node.platform +
        '</span>' +
        '<div class="port port-input" data-node-id="' +
        node.id +
        '" data-port="input"></div>' +
        '<div class="port port-output" data-node-id="' +
        node.id +
        '" data-port="output"></div>';
    }

    world.appendChild(card);

    /* Drop-in animation */
    if (node._animateIn) {
      card.classList.add('card-enter');
      delete node._animateIn;
      card.addEventListener(
        'animationend',
        function () {
          card.classList.remove('card-enter');
        },
        { once: true },
      );
    }
  });
}

/* Flip card animation: swap content at the midpoint of a Y-axis flip */
function flipCard(card: HTMLElement, callback: () => void) {
  card.classList.add('card-flip');
  /* Swap content at the 50% mark (when card is edge-on) */
  setTimeout(callback, 200);
  card.addEventListener(
    'animationend',
    function () {
      card.classList.remove('card-flip');
    },
    { once: true },
  );
}

/* Confetti-style delete: spawn particles from card center, then remove */
function animateCardDelete(nodeId: string, callback: () => void) {
  var card = world.querySelector('[data-node-id="' + nodeId + '"]') as HTMLElement | null;
  if (!card) {
    callback();
    return;
  }

  var cardRect = card.getBoundingClientRect();
  var cx = cardRect.left + cardRect.width / 2;
  var cy = cardRect.top + cardRect.height / 2;

  /* Spawn confetti particles */
  var PARTICLE_COUNT = 18;
  var particles: Array<{ el: HTMLDivElement; angle: number; dist: number }> = [];
  for (var i = 0; i < PARTICLE_COUNT; i++) {
    var p = document.createElement('div');
    var angle = (i / PARTICLE_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
    var dist = 60 + Math.random() * 80;
    var size = 4 + Math.random() * 6;
    var hue = Math.random() * 360;
    p.style.cssText =
      'position:fixed;left:' +
      cx +
      'px;top:' +
      cy +
      'px;width:' +
      size +
      'px;height:' +
      size +
      'px;' +
      'border-radius:' +
      (Math.random() > 0.5 ? '50%' : '2px') +
      ';' +
      'background:hsl(' +
      hue +
      ',70%,65%);pointer-events:none;z-index:1000;' +
      'transition:all 0.55s cubic-bezier(0.25,0.46,0.45,0.94);' +
      'opacity:1;transform:translate(-50%,-50%) scale(1);';
    document.body.appendChild(p);
    particles.push({ el: p, angle: angle, dist: dist });
  }

  /* Start card shrink */
  card.classList.add('card-exit');

  /* Spread particles outward after a frame */
  requestAnimationFrame(function () {
    particles.forEach(function (pt) {
      var dx = Math.cos(pt.angle) * pt.dist;
      var dy = Math.sin(pt.angle) * pt.dist - 30;
      pt.el.style.transform =
        'translate(calc(-50% + ' +
        dx +
        'px), calc(-50% + ' +
        dy +
        'px)) scale(0.2) rotate(' +
        Math.random() * 360 +
        'deg)';
      pt.el.style.opacity = '0';
    });
  });

  /* Clean up after animation */
  setTimeout(function () {
    particles.forEach(function (pt) {
      pt.el.remove();
    });
    callback();
  }, 550);
}

function renderEdges() {
  /* Hide edge delete button since paths are being recreated */
  if (edgeDeleteBtn) {
    edgeDeleteBtn.classList.remove('visible');
    hoveredEdgeId = null;
  }

  var paths = '';
  graph.edges.forEach(function (edge) {
    var fromNode = graph.nodes.find(function (n) {
      return n.id === edge.from;
    });
    var toNode = graph.nodes.find(function (n) {
      return n.id === edge.to;
    });
    if (!fromNode || !toNode) return;

    /* Org chart: bottom-center of parent -> top-center of child */
    var fromCard = world.querySelector('[data-node-id="' + edge.from + '"]') as HTMLElement | null;
    var toCard = world.querySelector('[data-node-id="' + edge.to + '"]') as HTMLElement | null;
    var fromW = fromCard ? fromCard.offsetWidth : 120;
    var fromH = fromCard ? fromCard.offsetHeight : 150;
    var toW = toCard ? toCard.offsetWidth : 120;

    var x1 = fromNode.position.x + fromW / 2;
    var y1 = fromNode.position.y + fromH;
    var x2 = toNode.position.x + toW / 2;
    var y2 = toNode.position.y;

    var dy = Math.abs(y2 - y1) * 0.4;
    var d =
      'M' +
      x1 +
      ',' +
      y1 +
      ' C' +
      x1 +
      ',' +
      (y1 + dy) +
      ' ' +
      x2 +
      ',' +
      (y2 - dy) +
      ' ' +
      x2 +
      ',' +
      y2;

    /* Hit-area path first (wide, invisible, interactive), then visible path */
    paths += '<path class="edge-hit" data-edge-id="' + edge.id + '" d="' + d + '" />';
    paths += '<path d="' + d + '" />';
  });
  edgeSvg.innerHTML = paths;
}

/* ═══════════════════════════════════════════════
   Pan & Zoom
   ═══════════════════════════════════════════════ */

viewport.addEventListener('mousedown', function (e) {
  if (e.target !== viewport && e.target !== world && !(e.target as HTMLElement).classList.contains('edge-svg'))
    return;
  if (e.button !== 0) return;
  /* Ignore if clicking in the dock area */
  var dockEl = document.getElementById('coverflow-dock');
  if (dockEl) {
    var dockRect = dockEl.getBoundingClientRect();
    if (e.clientY >= dockRect.top) return;
  }
  isPanning = true;
  panStartX = e.clientX;
  panStartY = e.clientY;
  panStartVpX = vpX;
  panStartVpY = vpY;
  viewport.classList.add('grabbing');
  selectedNodeId = null;
  renderNodes();
  e.preventDefault();
});

document.addEventListener('mousemove', function (e) {
  if (isPanning) {
    vpX = panStartVpX + (e.clientX - panStartX);
    vpY = panStartVpY + (e.clientY - panStartY);
    applyTransform();
    renderEdges();
  }
  if (isDragging && dragNodeId) {
    var node = graph.nodes.find(function (n) {
      return n.id === dragNodeId;
    });
    if (!node) return;
    node.position.x = dragStartNodeX + (e.clientX - dragStartX) / vpZoom;
    node.position.y = dragStartNodeY + (e.clientY - dragStartY) / vpZoom;
    var card = world.querySelector('[data-node-id="' + dragNodeId + '"]') as HTMLElement | null;
    if (card) {
      card.style.left = node.position.x + 'px';
      card.style.top = node.position.y + 'px';
    }
    renderEdges();
    /* Highlight workspace drop targets */
    var cardCx = node.position.x + 60;
    var cardCy = node.position.y + 75;
    world.querySelectorAll('.workspace-frame').forEach(function (frame) {
      var ws = graph.workspaces.find(function (w) {
        return w.id === (frame as HTMLElement).dataset.workspaceId;
      });
      if (!ws) return;
      var isInside =
        cardCx >= ws.position.x &&
        cardCx <= ws.position.x + ws.size.w &&
        cardCy >= ws.position.y &&
        cardCy <= ws.position.y + ws.size.h;
      if (isInside) {
        frame.classList.add('drop-target');
      } else {
        frame.classList.remove('drop-target');
      }
    });
  }
  if (isEdgeDragging && edgeTempLine) {
    var rect = viewport.getBoundingClientRect();
    var mx = (e.clientX - rect.left - vpX) / vpZoom;
    var my = (e.clientY - rect.top - vpY) / vpZoom;
    var dy = Math.abs(my - edgeDragOrigin.y) * 0.4;
    edgeTempLine.setAttribute(
      'd',
      'M' +
        edgeDragOrigin.x +
        ',' +
        edgeDragOrigin.y +
        ' C' +
        edgeDragOrigin.x +
        ',' +
        (edgeDragOrigin.y + dy) +
        ' ' +
        mx +
        ',' +
        (my - dy) +
        ' ' +
        mx +
        ',' +
        my,
    );
  }
  if (isWsDragging && wsDragId) {
    var ws = graph.workspaces.find(function (w) {
      return w.id === wsDragId;
    });
    if (ws) {
      var dx = (e.clientX - wsDragStartX) / vpZoom;
      var dy = (e.clientY - wsDragStartY) / vpZoom;
      ws.position.x = wsDragStartWsX + dx;
      ws.position.y = wsDragStartWsY + dy;

      /* Move magnetic cards with the workspace */
      wsDragNodeStarts.forEach(function (snap) {
        var node = graph.nodes.find(function (n) {
          return n.id === snap.id;
        });
        if (!node) return;
        node.position.x = snap.startX + dx;
        node.position.y = snap.startY + dy;
        var card = world.querySelector('[data-node-id="' + snap.id + '"]') as HTMLElement | null;
        if (card) {
          card.style.left = node.position.x + 'px';
          card.style.top = node.position.y + 'px';
        }
      });

      var frame = world.querySelector('[data-workspace-id="' + wsDragId + '"]') as HTMLElement | null;
      if (frame) {
        frame.style.left = ws.position.x + 'px';
        frame.style.top = ws.position.y + 'px';
      }
      renderEdges();
    }
  }
  if (isWsResizing && wsResizeId) {
    var ws = graph.workspaces.find(function (w) {
      return w.id === wsResizeId;
    });
    if (!ws) return;
    var dx = (e.clientX - wsResizeStartX) / vpZoom;
    var dy = (e.clientY - wsResizeStartY) / vpZoom;
    if (wsResizeDir === 'r' || wsResizeDir === 'br') {
      ws.size.w = Math.max(320, wsResizeStartW + dx);
    }
    if (wsResizeDir === 'b' || wsResizeDir === 'br') {
      ws.size.h = Math.max(240, wsResizeStartH + dy);
    }
    var frame = world.querySelector('[data-workspace-id="' + wsResizeId + '"]') as HTMLElement | null;
    if (frame) {
      frame.style.width = ws.size.w + 'px';
      frame.style.height = ws.size.h + 'px';
    }
  }
});

document.addEventListener('mouseup', function (e) {
  if (isPanning) {
    isPanning = false;
    viewport.classList.remove('grabbing');
    saveViewport();
  }
  if (isDragging) {
    var dragDist = Math.hypot(e.clientX - dragStartX, e.clientY - dragStartY);
    var clickedNodeId = dragNodeId;

    /* Snap agent to workspace */
    var node = graph.nodes.find(function (n) {
      return n.id === dragNodeId;
    });
    if (node) {
      var cardCx = node.position.x + 60;
      var cardCy = node.position.y + 75;
      var snapped = false;
      graph.workspaces.forEach(function (ws) {
        if (
          cardCx >= ws.position.x &&
          cardCx <= ws.position.x + ws.size.w &&
          cardCy >= ws.position.y &&
          cardCy <= ws.position.y + ws.size.h
        ) {
          node!.workspaceId = ws.id;
          snapped = true;
        }
      });
      if (!snapped) {
        node.workspaceId = null;
      }
    }
    /* Clear drop-target highlights */
    world.querySelectorAll('.workspace-frame.drop-target').forEach(function (f) {
      f.classList.remove('drop-target');
    });
    var card = world.querySelector('[data-node-id="' + dragNodeId + '"]') as HTMLElement | null;
    if (card) card.classList.remove('dragging');
    isDragging = false;
    dragNodeId = null;
    renderWorkspaces();
    saveGraph();

    /* Click (not drag): open agent detail panel */
    if (dragDist < 5 && clickedNodeId) {
      openAgentDetail(clickedNodeId);
    }
  }
  if (isEdgeDragging) {
    finishEdgeDrag(e);
  }
  if (isWsDragging) {
    isWsDragging = false;
    wsDragId = null;
    wsDragNodeStarts = [];
    renderAll();
    saveGraph();
  }
  if (isWsResizing) {
    isWsResizing = false;
    wsResizeId = null;
    wsResizeDir = null;
    saveGraph();
  }
});

viewport.addEventListener(
  'wheel',
  function (e) {
    /* Ignore if mouse is over the dock area */
    var dockEl = document.getElementById('coverflow-dock');
    if (dockEl) {
      var dockRect = dockEl.getBoundingClientRect();
      if (e.clientY >= dockRect.top) return;
    }
    e.preventDefault();

    if (e.ctrlKey || e.metaKey) {
      /* Pinch-to-zoom / Ctrl+scroll / Cmd+scroll -> zoom at cursor */
      var rect = viewport.getBoundingClientRect();
      var mx = e.clientX - rect.left;
      var my = e.clientY - rect.top;
      var delta = -e.deltaY * 0.01;
      var newZoom = Math.max(0.25, Math.min(3, vpZoom + delta));
      vpX = mx - (mx - vpX) * (newZoom / vpZoom);
      vpY = my - (my - vpY) * (newZoom / vpZoom);
      vpZoom = newZoom;
    } else {
      /* Two-finger scroll -> pan (including horizontal) */
      vpX -= e.deltaX;
      vpY -= e.deltaY;
    }

    applyTransform();
    renderEdges();
    updateZoomDisplay();
    saveViewport();
  },
  { passive: false },
);

/* ═══════════════════════════════════════════════
   Card Drag
   ═══════════════════════════════════════════════ */

world.addEventListener('mousedown', function (e) {
  var port = (e.target as HTMLElement).closest('.port') as HTMLElement | null;
  if (port) {
    startEdgeDrag(port, e);
    return;
  }

  /* Workspace gear button */
  var wsGear = (e.target as HTMLElement).closest('.ws-gear') as HTMLElement | null;
  if (wsGear) {
    openWorkspaceDetail(wsGear.dataset.wsId!);
    e.preventDefault();
    e.stopPropagation();
    return;
  }

  /* Workspace resize handles */
  var resizeHandle = (e.target as HTMLElement).closest('.workspace-resize') as HTMLElement | null;
  if (resizeHandle && e.button === 0) {
    isWsResizing = true;
    wsResizeId = resizeHandle.dataset.wsId!;
    wsResizeDir = resizeHandle.dataset.dir!;
    wsResizeStartX = e.clientX;
    wsResizeStartY = e.clientY;
    var ws = graph.workspaces.find(function (w) {
      return w.id === wsResizeId;
    });
    if (ws) {
      wsResizeStartW = ws.size.w;
      wsResizeStartH = ws.size.h;
    }
    e.preventDefault();
    e.stopPropagation();
    return;
  }

  var card = (e.target as HTMLElement).closest('.agent-card') as HTMLElement | null;
  if (card && e.button === 0) {
    /* Don't start drag if clicking inputs/buttons inside setup cards */
    if ((e.target as HTMLElement).closest('input') || (e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('label'))
      return;

    var nodeId = card.dataset.nodeId!;
    selectedNodeId = nodeId;
    selectedWorkspaceId = null;
    renderNodes();
    renderWorkspaces();

    isDragging = true;
    dragNodeId = nodeId;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    var node = graph.nodes.find(function (n) {
      return n.id === nodeId;
    });
    if (node) {
      dragStartNodeX = node.position.x;
      dragStartNodeY = node.position.y;
    }
    card.classList.add('dragging');
    e.preventDefault();
    e.stopPropagation();
    return;
  }

  /* Workspace drag (header or frame body -- not resize handles) */
  var wsFrame = (e.target as HTMLElement).closest('.workspace-frame') as HTMLElement | null;
  if (wsFrame && e.button === 0) {
    var wsId = wsFrame.dataset.workspaceId!;
    selectedWorkspaceId = wsId;
    selectedNodeId = null;
    renderNodes();
    renderWorkspaces();

    isWsDragging = true;
    wsDragId = wsId;
    wsDragStartX = e.clientX;
    wsDragStartY = e.clientY;
    var ws = graph.workspaces.find(function (w) {
      return w.id === wsId;
    });
    if (ws) {
      wsDragStartWsX = ws.position.x;
      wsDragStartWsY = ws.position.y;
    }
    /* Snapshot start positions of all contained cards (magnetic drag) */
    wsDragNodeStarts = [];
    graph.nodes.forEach(function (n) {
      if (n.workspaceId === wsId) {
        wsDragNodeStarts.push({ id: n.id, startX: n.position.x, startY: n.position.y });
      }
    });

    e.preventDefault();
    e.stopPropagation();
    return;
  }
});

/* ═══════════════════════════════════════════════
   Edge Drag (port-to-port)
   ═══════════════════════════════════════════════ */

var edgeDragOrigin = { x: 0, y: 0 };

function startEdgeDrag(port: HTMLElement, e: MouseEvent) {
  if (port.dataset.port !== 'output') return;
  isEdgeDragging = true;
  edgeFromId = port.dataset.nodeId!;

  var fromNode = graph.nodes.find(function (n) {
    return n.id === edgeFromId;
  });
  if (!fromNode) return;

  var fromCard = world.querySelector('[data-node-id="' + edgeFromId + '"]') as HTMLElement | null;
  var fromW = fromCard ? fromCard.offsetWidth : 120;
  var fromH = fromCard ? fromCard.offsetHeight : 150;
  edgeDragOrigin.x = fromNode.position.x + fromW / 2;
  edgeDragOrigin.y = fromNode.position.y + fromH;

  edgeTempLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  edgeTempLine.classList.add('edge-temp');
  edgeTempLine.setAttribute(
    'd',
    'M' +
      edgeDragOrigin.x +
      ',' +
      edgeDragOrigin.y +
      ' L' +
      edgeDragOrigin.x +
      ',' +
      edgeDragOrigin.y,
  );
  edgeSvg.appendChild(edgeTempLine);

  e.preventDefault();
  e.stopPropagation();
}

function finishEdgeDrag(e: MouseEvent) {
  isEdgeDragging = false;
  if (edgeTempLine) {
    edgeTempLine.remove();
    edgeTempLine = null;
  }

  var target = document.elementFromPoint(e.clientX, e.clientY);
  var port = target ? (target as HTMLElement).closest('.port[data-port="input"]') as HTMLElement | null : null;
  if (port && port.dataset.nodeId !== edgeFromId) {
    var toId = port.dataset.nodeId!;
    var exists = graph.edges.some(function (edge) {
      return edge.from === edgeFromId && edge.to === toId;
    });
    if (!exists) {
      graph.edges.push({
        id: generateId(),
        from: edgeFromId!,
        to: toId,
        edgeType: 'manual',
        rules: [],
      });
      renderEdges();
      saveGraph();
    }
  }
  edgeFromId = null;
}

/* ═══════════════════════════════════════════════
   Zoom Buttons
   ═══════════════════════════════════════════════ */

(document.getElementById('btn-zoom-in') as HTMLButtonElement).addEventListener('click', function () {
  setZoom(Math.min(3, vpZoom + 0.25));
});

(document.getElementById('btn-zoom-out') as HTMLButtonElement).addEventListener('click', function () {
  setZoom(Math.max(0.25, vpZoom - 0.25));
});

(document.getElementById('btn-zoom-reset') as HTMLButtonElement).addEventListener('click', function () {
  vpX = 0;
  vpY = 0;
  setZoom(1);
});

function setZoom(z: number) {
  var cx = window.innerWidth / 2;
  var cy = window.innerHeight / 2;
  vpX = cx - (cx - vpX) * (z / vpZoom);
  vpY = cy - (cy - vpY) * (z / vpZoom);
  vpZoom = z;
  applyTransform();
  renderEdges();
  updateZoomDisplay();
  saveViewport();
}

/* ═══════════════════════════════════════════════
   Cover Flow Dock
   ═══════════════════════════════════════════════ */

var cfActiveIndex = 0;
var cfPlatforms = [
  { id: 'telegram', name: 'Telegram', hint: 'Bot Token + User ID' },
  { id: 'slack', name: 'Slack', hint: 'Bot Token + Signing Secret' },
  { id: 'whatsapp', name: 'WhatsApp', hint: 'Phone Number ID + Token' },
  { id: 'discord', name: 'Discord', hint: 'Bot Token' },
  { id: 'gmail', name: 'Gmail', hint: 'Sign in with Google' },
  { id: 'email', name: 'Email', hint: 'IMAP + SMTP manual' },
];

var cfTrack = document.getElementById('coverflow-track') as HTMLDivElement;
var cfDock = document.getElementById('coverflow-dock') as HTMLDivElement;

/* Spring physics state */
var cfCurrentIndex = 0;
var cfVelocity = 0;
var cfAnimating = false;

function renderCoverflow() {
  cfTrack.innerHTML = '';
  cfPlatforms.forEach(function (p, i) {
    var card = document.createElement('div');
    card.className = 'coverflow-card';
    card.dataset.platform = p.id;
    card.dataset.index = String(i);

    card.innerHTML =
      '<div class="cf-icon">' +
      (platformIcons[p.id] || '') +
      '</div>' +
      '<div class="cf-name">' +
      escapeHtml(p.name) +
      '</div>' +
      '<div class="cf-hint">' +
      escapeHtml(p.hint) +
      '</div>';

    cfTrack.appendChild(card);
  });
  updateCoverflowTransforms();
}

function updateCoverflowTransforms() {
  var cards = cfTrack.querySelectorAll('.coverflow-card') as NodeListOf<HTMLElement>;
  for (var i = 0; i < cards.length; i++) {
    var card = cards[i];
    var offset = i - cfCurrentIndex;
    var absOffset = Math.abs(offset);
    var sign = offset > 0 ? 1 : -1;

    var translateX = offset * 100;
    var translateZ = 60 - absOffset * 120;
    var rotateY = absOffset < 0.01 ? 0 : -sign * Math.min(absOffset, 1.2) * 40;
    var scale = Math.max(0.85, 1.08 - absOffset * 0.16);
    var opacity = Math.max(0, 1 - absOffset * 0.3);
    var zIndex = Math.max(0, 5 - Math.round(absOffset));

    card.style.transform =
      'translateX(' +
      translateX +
      'px) translateZ(' +
      translateZ +
      'px) rotateY(' +
      rotateY +
      'deg) scale(' +
      scale +
      ')';
    card.style.opacity = String(opacity);
    card.style.zIndex = String(zIndex);
    card.style.pointerEvents = absOffset > 2.5 ? 'none' : 'auto';
  }
}

function cfSpringTick() {
  var stiffness = 0.06;
  var damping = 0.78;

  var force = (cfActiveIndex - cfCurrentIndex) * stiffness;
  cfVelocity = (cfVelocity + force) * damping;
  cfCurrentIndex += cfVelocity;

  if (Math.abs(cfCurrentIndex - cfActiveIndex) < 0.002 && Math.abs(cfVelocity) < 0.002) {
    cfCurrentIndex = cfActiveIndex;
    cfVelocity = 0;
    cfAnimating = false;
    updateCoverflowTransforms();
    return;
  }

  updateCoverflowTransforms();
  requestAnimationFrame(cfSpringTick);
}

function startCfAnimation() {
  if (!cfAnimating) {
    cfAnimating = true;
    requestAnimationFrame(cfSpringTick);
  }
}

/* Scroll/swipe on dock to change active card -- smooth trackpad support */
var cfScrollAccum = 0;
var CF_SCROLL_THRESHOLD = 50;
var cfScrollTimer: ReturnType<typeof setTimeout> | null = null;
cfDock.addEventListener(
  'wheel',
  function (e) {
    e.preventDefault();
    e.stopPropagation();
    /* Use horizontal delta when available (trackpad two-finger swipe), fall back to vertical */
    var delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    cfScrollAccum += delta;
    /* Reset accumulator after scroll inertia settles */
    if (cfScrollTimer) clearTimeout(cfScrollTimer);
    cfScrollTimer = setTimeout(function () {
      cfScrollAccum = 0;
    }, 150);
    if (Math.abs(cfScrollAccum) >= CF_SCROLL_THRESHOLD) {
      var steps = Math.round(cfScrollAccum / CF_SCROLL_THRESHOLD);
      cfActiveIndex = Math.max(0, Math.min(cfPlatforms.length - 1, cfActiveIndex + steps));
      cfScrollAccum = cfScrollAccum % CF_SCROLL_THRESHOLD;
      startCfAnimation();
    }
  },
  { passive: false },
);

/* Click non-center card to center it */
cfTrack.addEventListener('click', function (e) {
  var card = (e.target as HTMLElement).closest('.coverflow-card') as HTMLElement | null;
  if (!card) return;
  var idx = parseInt(card.dataset.index!, 10);
  if (idx !== cfActiveIndex) {
    cfActiveIndex = idx;
    startCfAnimation();
  }
});

/* Dock collapse/expand toggle */
var dockToggle = document.getElementById('dock-toggle') as HTMLButtonElement;
var canvasToolbar = document.getElementById('toolbar') as HTMLDivElement;
var isDockCollapsed = false;
function toggleDock() {
  isDockCollapsed = !isDockCollapsed;
  cfDock.classList.toggle('collapsed', isDockCollapsed);
  dockToggle.classList.toggle('collapsed', isDockCollapsed);
  canvasToolbar.classList.toggle('dock-hidden', isDockCollapsed);
}
dockToggle.addEventListener('click', toggleDock);

/* ═══════════════════════════════════════════════
   Edge Hover Delete Button
   ═══════════════════════════════════════════════ */

var edgeDeleteBtn = document.createElement('button');
edgeDeleteBtn.className = 'edge-delete-btn';
edgeDeleteBtn.innerHTML = '<img src="/icons/unlink.svg" alt="Remove" />';
world.appendChild(edgeDeleteBtn);

var hoveredEdgeId: string | null = null;
var edgeHideTimeout: ReturnType<typeof setTimeout> | null = null;

function getEdgeMidpoint(edgeId: string): { x: number; y: number } | null {
  var matchedEdge = graph.edges.find(function (e) {
    return e.id === edgeId;
  });
  if (!matchedEdge) return null;
  var edgeFrom = matchedEdge.from;
  var edgeTo = matchedEdge.to;
  var fromNode = graph.nodes.find(function (n) {
    return n.id === edgeFrom;
  });
  var toNode = graph.nodes.find(function (n) {
    return n.id === edgeTo;
  });
  if (!fromNode || !toNode) return null;
  var fromCard = world.querySelector('[data-node-id="' + edgeFrom + '"]') as HTMLElement | null;
  var toCard = world.querySelector('[data-node-id="' + edgeTo + '"]') as HTMLElement | null;
  var fromW = fromCard ? fromCard.offsetWidth : 120;
  var fromH = fromCard ? fromCard.offsetHeight : 150;
  var toW = toCard ? toCard.offsetWidth : 120;
  var x1 = fromNode.position.x + fromW / 2;
  var y1 = fromNode.position.y + fromH;
  var x2 = toNode.position.x + toW / 2;
  var y2 = toNode.position.y;
  return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
}

edgeSvg.addEventListener('mouseover', function (e) {
  var hit = (e.target as HTMLElement).closest('.edge-hit') as HTMLElement | null;
  if (!hit) return;
  if (edgeHideTimeout) clearTimeout(edgeHideTimeout);
  hoveredEdgeId = hit.dataset.edgeId!;
  var mid = getEdgeMidpoint(hoveredEdgeId);
  if (mid) {
    edgeDeleteBtn.style.left = mid.x + 'px';
    edgeDeleteBtn.style.top = mid.y + 'px';
    edgeDeleteBtn.dataset.edgeId = hoveredEdgeId;
    edgeDeleteBtn.classList.add('visible');
  }
});

edgeSvg.addEventListener('mouseout', function (e) {
  var hit = (e.target as HTMLElement).closest('.edge-hit') as HTMLElement | null;
  if (!hit) return;
  edgeHideTimeout = setTimeout(function () {
    edgeDeleteBtn.classList.remove('visible');
    hoveredEdgeId = null;
  }, 300);
});

edgeDeleteBtn.addEventListener('mouseenter', function () {
  if (edgeHideTimeout) clearTimeout(edgeHideTimeout);
});

edgeDeleteBtn.addEventListener('mouseleave', function () {
  edgeHideTimeout = setTimeout(function () {
    edgeDeleteBtn.classList.remove('visible');
    hoveredEdgeId = null;
  }, 200);
});

edgeDeleteBtn.addEventListener('click', function (e) {
  e.stopPropagation();
  e.preventDefault();
  var edgeId = edgeDeleteBtn.dataset.edgeId;
  if (!edgeId) return;
  graph.edges = graph.edges.filter(function (edge) {
    return edge.id !== edgeId;
  });
  edgeDeleteBtn.classList.remove('visible');
  hoveredEdgeId = null;
  renderEdges();
  saveGraph();
});

/* ═══════════════════════════════════════════════
   Drag from Dock
   ═══════════════════════════════════════════════ */

var cfGhost: HTMLDivElement | null = null;
var cfDragPlatform: string | null = null;
var cfIsDragging = false;

cfTrack.addEventListener('mousedown', function (e) {
  var card = (e.target as HTMLElement).closest('.coverflow-card') as HTMLElement | null;
  if (!card || e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();

  cfDragPlatform = card.dataset.platform!;
  cfIsDragging = true;

  cfGhost = document.createElement('div');
  cfGhost.className = 'coverflow-ghost';
  cfGhost.innerHTML =
    '<div class="cf-icon">' +
    (platformIcons[cfDragPlatform] || '') +
    '</div>' +
    '<div class="cf-name">' +
    escapeHtml(capitalize(cfDragPlatform)) +
    '</div>';
  cfGhost.style.left = e.clientX - 48 + 'px';
  cfGhost.style.top = e.clientY - 64 + 'px';
  document.body.appendChild(cfGhost);
});

document.addEventListener('mousemove', function (e) {
  if (!cfIsDragging || !cfGhost) return;
  cfGhost.style.left = e.clientX - 48 + 'px';
  cfGhost.style.top = e.clientY - 64 + 'px';

  var dockRect = cfDock.getBoundingClientRect();
  if (e.clientY < dockRect.top) {
    cfGhost.classList.add('above-dock');
  } else {
    cfGhost.classList.remove('above-dock');
  }
});

document.addEventListener('mouseup', function (e) {
  if (!cfIsDragging) return;
  cfIsDragging = false;

  var dockRect = cfDock.getBoundingClientRect();
  var droppedAboveDock = e.clientY < dockRect.top;

  if (cfGhost) {
    cfGhost.remove();
    cfGhost = null;
  }

  if (droppedAboveDock && cfDragPlatform) {
    var rect = viewport.getBoundingClientRect();
    var wx = (e.clientX - rect.left - vpX) / vpZoom - 140;
    var wy = (e.clientY - rect.top - vpY) / vpZoom - 80;

    var node: AgentNode = {
      id: generateId(),
      platform: cfDragPlatform,
      label: capitalize(cfDragPlatform),
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
    graph.nodes.push(node);
    renderAll();
    saveGraph();
  }

  cfDragPlatform = null;
});

/* Cleanup ghost on window blur */
window.addEventListener('blur', function () {
  if (cfIsDragging && cfGhost) {
    cfGhost.remove();
    cfGhost = null;
    cfIsDragging = false;
    cfDragPlatform = null;
  }
});

/* ═══════════════════════════════════════════════
   Inline Card Actions (connect, cancel, gear, etc.)
   ═══════════════════════════════════════════════ */

world.addEventListener('click', function (e) {
  var actionEl = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
  if (!actionEl) return;
  var action = actionEl.dataset.action;
  var card = actionEl.closest('.agent-card') as HTMLElement | null;
  if (!card) return;
  var nodeId = card.dataset.nodeId!;
  var foundNode = graph.nodes.find(function (n) {
    return n.id === nodeId;
  });
  if (!foundNode) return;
  var node = foundNode;

  if (action === 'cancel') {
    animateCardDelete(nodeId, function () {
      graph.nodes = graph.nodes.filter(function (n) {
        return n.id !== nodeId;
      });
      graph.edges = graph.edges.filter(function (edge) {
        return edge.from !== nodeId && edge.to !== nodeId;
      });
      if (selectedNodeId === nodeId) selectedNodeId = null;
      renderAll();
      saveGraph();
    });
    e.stopPropagation();
    return;
  }

  if (action === 'connect') {
    handleInlineConnect(node);
    e.stopPropagation();
    return;
  }

  if (action === 'gear') {
    if (node.platform === 'owner') {
      openAgentDetail(nodeId);
    } else {
      flipCard(card, function () {
        node._editing = true;
        renderNodes();
      });
    }
    e.stopPropagation();
    return;
  }

  if (action === 'close-edit') {
    flipCard(card, function () {
      node._editing = false;
      renderNodes();
    });
    e.stopPropagation();
    return;
  }

  if (action === 'disconnect') {
    invoke('disconnect_channel', { platform: node.platform, nodeId });
    animateCardDelete(nodeId, function () {
      graph.nodes = graph.nodes.filter(function (n) {
        return n.id !== nodeId;
      });
      graph.edges = graph.edges.filter(function (edge) {
        return edge.from !== nodeId && edge.to !== nodeId;
      });
      if (selectedNodeId === nodeId) selectedNodeId = null;
      renderAll();
      saveGraph();
    });
    e.stopPropagation();
    return;
  }
});

/* Capture form input changes into node._formData */
world.addEventListener('input', function (e) {
  if (!(e.target as HTMLElement).matches('.card-setup-field input')) return;
  var card = (e.target as HTMLElement).closest('.agent-card') as HTMLElement | null;
  if (!card) return;
  var nodeId = card.dataset.nodeId!;
  var node = graph.nodes.find(function (n) {
    return n.id === nodeId;
  });
  if (!node) return;
  if (!node._formData) node._formData = {};
  var fieldKey = (e.target as HTMLInputElement).dataset.field;
  if (fieldKey) {
    node._formData[fieldKey] = (e.target as HTMLInputElement).value;
  }
});

/* ═══════════════════════════════════════════════
   Inline Connect Logic
   ═══════════════════════════════════════════════ */

async function handleInlineConnect(node: AgentNode) {
  var formData = node._formData || {};
  var platform = node.platform;
  var credentials: Record<string, unknown> = {};

  if (platform === 'telegram') {
    var rawId = String(formData.userId || '')
      .trim()
      .replace(/\D/g, '');
    var parsedId = parseInt(rawId, 10);
    if (!rawId || isNaN(parsedId) || parsedId <= 0) {
      node._statusMsg = 'User ID must be a positive number';
      node._statusType = 'error';
      node.status = 'error';
      renderNodes();
      return;
    }
    credentials = { token: (formData.token || '').trim(), userId: parsedId, nodeId: node.id };
  } else if (platform === 'slack') {
    credentials = {
      token: (formData.token || '').trim(),
      signingSecret: (formData.signingSecret || '').trim(),
      nodeId: node.id,
    };
  } else if (platform === 'whatsapp') {
    credentials = {
      phoneNumberId: (formData.phoneNumberId || '').trim(),
      accessToken: (formData.accessToken || '').trim(),
      nodeId: node.id,
    };
  } else if (platform === 'discord') {
    credentials = { token: (formData.token || '').trim(), nodeId: node.id };
  } else if (platform === 'gmail') {
    credentials = { oauth: true, nodeId: node.id };
  } else if (platform === 'email') {
    credentials = {
      imapHost: (formData.imapHost || '').trim(),
      imapPort: parseInt(formData.imapPort, 10) || 993,
      smtpHost: (formData.smtpHost || '').trim(),
      smtpPort: parseInt(formData.smtpPort, 10) || 587,
      username: (formData.username || '').trim(),
      password: (formData.password || '').trim(),
      nodeId: node.id,
    };
  }

  node.status = 'connecting';
  node._statusMsg = '';
  node._statusType = '';
  renderNodes();

  try {
    var result = await invoke<ConnectResult>('connect_channel', { platform, credentials });
    if (result.success) {
      node.status = 'connected';
      node._statusMsg = '';
      node._statusType = '';
      delete node._formData;

      if (platform === 'telegram') {
        node.label = '@' + (result.botUsername || 'TelegramBot');
        node.photo = result.photo || null;
        node.credentials = 'channel_token_' + node.id;
        node.meta = {
          botId: String(result.botId || ''),
          userId: String(credentials.userId),
          firstName: result.firstName || result.botUsername || '',
        };
      } else if (platform === 'slack') {
        node.label = result.teamName || 'Slack Bot';
        node.credentials = 'slack_bot_token';
        node.meta = { botUserId: result.botUserId || '', teamId: result.teamId || '' };
      } else if (platform === 'whatsapp') {
        node.label = result.displayName || 'WhatsApp';
        node.credentials = 'whatsapp_access_token';
        node.meta = { phoneNumberId: credentials.phoneNumberId as string };
      } else if (platform === 'discord') {
        node.label = result.botUsername || 'Discord Bot';
        node.photo = result.photo || null;
        node.credentials = 'discord_bot_token';
        node.meta = { botId: result.botId || '' };
      } else if (platform === 'gmail') {
        node.label = result.email || result.displayName || 'Gmail';
        node.photo = result.photo || null;
        node.credentials = 'gmail_oauth';
        node.meta = { email: result.email || '' };
      } else if (platform === 'email') {
        node.label = result.displayName || 'Email';
        node.credentials = 'email_password';
        node.meta = { username: credentials.username as string, imapHost: credentials.imapHost as string };
      }

      renderAll();
      saveGraph();
    } else {
      node.status = 'error';
      node._statusMsg = result.error || 'Connection failed';
      node._statusType = 'error';
      renderNodes();
    }
  } catch {
    node.status = 'error';
    node._statusMsg = 'Connection failed';
    node._statusType = 'error';
    renderNodes();
  }
}

/* ═══════════════════════════════════════════════
   Keyboard Shortcuts
   ═══════════════════════════════════════════════ */

document.addEventListener('keydown', function (e) {
  var isMod = e.metaKey || e.ctrlKey;

  if (e.key === 'Escape') {
    if (wsDialogOverlay.classList.contains('open')) {
      wsDialogOverlay.classList.remove('open');
    } else if (agentDetailPanel.classList.contains('open')) {
      closeAgentDetail();
    } else if (workspaceDetailPanel.classList.contains('open')) {
      closeWorkspaceDetail();
    } else {
      /* Close any setup/error cards first, then deselect */
      var closedSetup = false;
      graph.nodes.forEach(function (n) {
        if (n.status === 'setup' || n.status === 'error') {
          closedSetup = true;
        }
        if (n._editing) {
          n._editing = false;
          closedSetup = true;
        }
      });
      if (closedSetup) {
        graph.nodes = graph.nodes.filter(function (n) {
          return n.status !== 'setup' && n.status !== 'error';
        });
        renderAll();
        saveGraph();
      } else {
        selectedNodeId = null;
        selectedWorkspaceId = null;
        renderNodes();
        renderWorkspaces();
      }
    }
    e.preventDefault();
    return;
  }

  if (isMod && (e.key === '=' || e.key === '+')) {
    e.preventDefault();
    setZoom(Math.min(3, vpZoom + 0.25));
  } else if (isMod && e.key === '-') {
    e.preventDefault();
    setZoom(Math.max(0.25, vpZoom - 0.25));
  } else if (isMod && e.key === '0') {
    e.preventDefault();
    vpX = 0;
    vpY = 0;
    setZoom(1);
  }

  if (isMod && e.key === 'l') {
    e.preventDefault();
    toggleDock();
  }

  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId && !isInputFocused()) {
    e.preventDefault();
    removeNode(selectedNodeId);
  }
});

function isInputFocused(): boolean {
  var el = document.activeElement;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
}

/* ═══════════════════════════════════════════════
   Graph Mutations
   ═══════════════════════════════════════════════ */

function removeNode(nodeId: string) {
  var node = graph.nodes.find(function (n) {
    return n.id === nodeId;
  });
  if (!node) return;
  if (node.platform === 'owner') return; /* Owner cannot be deleted */
  invoke('disconnect_channel', { platform: node.platform, nodeId });

  animateCardDelete(nodeId, function () {
    graph.nodes = graph.nodes.filter(function (n) {
      return n.id !== nodeId;
    });
    graph.edges = graph.edges.filter(function (e) {
      return e.from !== nodeId && e.to !== nodeId;
    });
    selectedNodeId = null;
    renderAll();
    saveGraph();
  });
}

/* ═══════════════════════════════════════════════
   Persistence
   ═══════════════════════════════════════════════ */

var saveTimeout: ReturnType<typeof setTimeout> | null = null;
function saveGraph() {
  graph.viewport = { x: vpX, y: vpY, zoom: vpZoom };
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(function () {
    invoke('save_canvas_graph', { graph });
  }, 300);
}

function saveViewport() {
  graph.viewport = { x: vpX, y: vpY, zoom: vpZoom };
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(function () {
    invoke('save_canvas_graph', { graph });
  }, 500);
}

/* ═══════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════ */

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function escapeHtml(s: string): string {
  var d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function getInitials(name: string): string {
  var parts = (name || '').trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0] || '?').slice(0, 2).toUpperCase();
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ═══════════════════════════════════════════════
   Listen for external updates
   ═══════════════════════════════════════════════ */

listen<CanvasGraph>('canvas-update', function (e) {
  graph = e.payload;
  if (!graph.workspaces) graph.workspaces = [];
  vpX = graph.viewport.x;
  vpY = graph.viewport.y;
  vpZoom = graph.viewport.zoom;
  renderAll();
});

/* ═══════════════════════════════════════════════
   Double-click: Agent Detail Panel
   ═══════════════════════════════════════════════ */

world.addEventListener('dblclick', function (e) {
  var wsHeader = (e.target as HTMLElement).closest('.workspace-header') as HTMLElement | null;
  if (wsHeader) {
    openWorkspaceDetail(wsHeader.dataset.workspaceId!);
    e.preventDefault();
    e.stopPropagation();
    return;
  }
});

function openAgentDetail(nodeId: string) {
  var node = graph.nodes.find(function (n) {
    return n.id === nodeId;
  });
  if (!node) return;
  detailNodeId = nodeId;

  /* Close other panels */
  closeWorkspaceDetail();

  /* Populate identity */
  var identityEl = document.getElementById('agent-detail-identity') as HTMLDivElement;
  var isOwner = node.platform === 'owner';
  var photoHtml = isOwner
    ? node.photo
      ? '<img src="' + node.photo + '" alt="" />'
      : '<span class="avatar-initials" style="font-size:12px;">' +
        getInitials(node.label) +
        '</span>'
    : node.photo
      ? '<img src="' + node.photo + '" alt="" />'
      : platformIcons[node.platform] || '';
  var displayName = isOwner
    ? node.label
    : node.meta.firstName || node.label.replace(/^@/, '');
  var platformLabel = isOwner ? 'You — Organization Owner' : capitalize(node.platform);
  var avatarClass = isOwner ? 'detail-avatar owner-avatar' : 'detail-avatar';
  identityEl.innerHTML =
    '<div class="' +
    avatarClass +
    '">' +
    photoHtml +
    '</div>' +
    '<div>' +
    '<div class="detail-agent-name">' +
    escapeHtml(displayName) +
    '</div>' +
    '<div class="detail-agent-platform">' +
    escapeHtml(platformLabel) +
    '</div>' +
    '</div>';

  /* Role pills */
  var role = node.role || 'assistant';
  document.querySelectorAll('#agent-role-pills .role-pill').forEach(function (pill) {
    pill.classList.toggle('active', (pill as HTMLElement).dataset.role === role);
  });

  /* Autonomy */
  var autonomy = typeof node.autonomy === 'number' ? node.autonomy : 1;
  document.querySelectorAll('#autonomy-segmented .autonomy-seg').forEach(function (seg) {
    seg.classList.toggle('active', parseInt((seg as HTMLElement).dataset.level!, 10) === autonomy);
  });
  moveAutonomyHighlight(autonomy, false);

  /* Instructions -- dynamic label based on node type */
  var instructionsLabel = document.getElementById('instructions-label') as HTMLSpanElement;
  var instructionsTextarea = document.getElementById('agent-instructions') as HTMLTextAreaElement;
  if (isOwner) {
    instructionsLabel.textContent = 'Communication Style (all agents)';
    instructionsTextarea.placeholder =
      'Define how all agents should respond...\n\nExample:\n- Plain text only, no markdown\n- Concise and direct\n- No emojis';
  } else {
    instructionsLabel.textContent = 'Agent Persona';
    instructionsTextarea.placeholder =
      "Describe this agent's role, personality, and behavior...";
  }
  instructionsTextarea.value = node.instructions || '';

  /* Toggles */
  var behavior = node.behavior || {};
  setToggle('toggle-proactive', behavior.proactive === true);
  setToggle('toggle-owner-response', behavior.ownerResponse !== false);
  setToggle('toggle-peer', behavior.peer === true);

  agentDetailPanel.classList.add('open');
}

function closeAgentDetail() {
  agentDetailPanel.classList.remove('open');
  detailNodeId = null;
}

(document.getElementById('agent-detail-close') as HTMLButtonElement).addEventListener('click', closeAgentDetail);

/* Role pill clicks */
document.querySelectorAll('#agent-role-pills .role-pill').forEach(function (pill) {
  pill.addEventListener('click', function () {
    if (!detailNodeId) return;
    var node = graph.nodes.find(function (n) {
      return n.id === detailNodeId;
    });
    if (!node) return;
    node.role = (pill as HTMLElement).dataset.role;
    document.querySelectorAll('#agent-role-pills .role-pill').forEach(function (p) {
      p.classList.toggle('active', (p as HTMLElement).dataset.role === node!.role);
    });
    saveGraph();
  });
});

/* Autonomy segmented control */
function moveAutonomyHighlight(level: number, animate: boolean) {
  var container = document.getElementById('autonomy-segmented') as HTMLDivElement;
  var highlight = document.getElementById('autonomy-highlight') as HTMLDivElement;
  var segs = container.querySelectorAll('.autonomy-seg') as NodeListOf<HTMLElement>;
  var target = segs[level];
  if (!target || !highlight) return;
  highlight.style.transition = animate
    ? 'left 0.25s cubic-bezier(0.4, 0, 0.2, 1), width 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
    : 'none';
  highlight.style.left = target.offsetLeft + 'px';
  highlight.style.width = target.offsetWidth + 'px';
}

document.querySelectorAll('#autonomy-segmented .autonomy-seg').forEach(function (seg) {
  seg.addEventListener('click', function () {
    if (!detailNodeId) return;
    var node = graph.nodes.find(function (n) {
      return n.id === detailNodeId;
    });
    if (!node) return;
    var val = parseInt((seg as HTMLElement).dataset.level!, 10);
    node.autonomy = val;
    document.querySelectorAll('#autonomy-segmented .autonomy-seg').forEach(function (s) {
      s.classList.toggle('active', parseInt((s as HTMLElement).dataset.level!, 10) === val);
    });
    moveAutonomyHighlight(val, true);
    saveGraph();
  });
});

/* Instructions textarea */
(document.getElementById('agent-instructions') as HTMLTextAreaElement).addEventListener('input', function () {
  if (!detailNodeId) return;
  var node = graph.nodes.find(function (n) {
    return n.id === detailNodeId;
  });
  if (!node) return;
  node.instructions = (this as HTMLTextAreaElement).value;
  if (node.platform === 'owner') {
    graph.globalInstructions = (this as HTMLTextAreaElement).value;
  }
  saveGraph();
});

/* Template button */
(document.getElementById('insert-template-btn') as HTMLButtonElement).addEventListener('click', function () {
  if (!detailNodeId) return;
  var node = graph.nodes.find(function (n) {
    return n.id === detailNodeId;
  });
  if (!node) return;
  var textarea = document.getElementById('agent-instructions') as HTMLTextAreaElement;
  var template = node.platform === 'owner' ? CEO_TEMPLATE : BOT_TEMPLATE;
  textarea.value = template;
  node.instructions = template;
  if (node.platform === 'owner') graph.globalInstructions = template;
  saveGraph();
});

/* Toggle switches */
function setToggle(id: string, active: boolean) {
  var el = document.getElementById(id) as HTMLButtonElement;
  if (active) {
    el.classList.add('active');
  } else {
    el.classList.remove('active');
  }
}

function bindToggle(id: string, key: string) {
  (document.getElementById(id) as HTMLButtonElement).addEventListener('click', function () {
    if (!detailNodeId) return;
    var node = graph.nodes.find(function (n) {
      return n.id === detailNodeId;
    });
    if (!node) return;
    if (!node.behavior) node.behavior = {};
    var isActive = this.classList.contains('active');
    (node.behavior as Record<string, boolean>)[key] = !isActive;
    this.classList.toggle('active');
    saveGraph();
  });
}

bindToggle('toggle-proactive', 'proactive');
bindToggle('toggle-owner-response', 'ownerResponse');
bindToggle('toggle-peer', 'peer');

/* ═══════════════════════════════════════════════
   Workspace Detail Panel
   ═══════════════════════════════════════════════ */

function openWorkspaceDetail(wsId: string) {
  var ws = graph.workspaces.find(function (w) {
    return w.id === wsId;
  });
  if (!ws) return;
  detailWorkspaceId = wsId;

  /* Close other panels */
  closeAgentDetail();

  (document.getElementById('ws-detail-name') as HTMLInputElement).value = ws.name;
  (document.getElementById('ws-detail-purpose') as HTMLTextAreaElement).value = ws.purpose || '';
  (document.getElementById('ws-detail-budget') as HTMLInputElement).value = String(ws.budget || '');

  /* Color swatches */
  var presetColors = ['#038B9A', '#27A7E7', '#34d399', '#f59e0b', '#f87171', '#a78bfa'];
  var isPreset = presetColors.indexOf(ws.color) !== -1;
  var wsColor = ws.color;
  document.querySelectorAll('#ws-detail-colors .color-swatch').forEach(function (s) {
    if (s.classList.contains('color-swatch-custom')) return;
    s.classList.toggle('active', (s as HTMLElement).dataset.color === wsColor);
  });
  /* Custom swatch state */
  var customSwatch = document.querySelector('#ws-detail-colors .color-swatch-custom') as HTMLElement | null;
  if (customSwatch) {
    if (!isPreset && ws.color) {
      customSwatch.style.background = ws.color;
      (customSwatch.querySelector('span') as HTMLSpanElement).style.display = 'none';
      customSwatch.classList.add('active');
      (document.getElementById('ws-detail-color-input') as HTMLInputElement).value = ws.color;
    } else {
      customSwatch.style.background = '';
      (customSwatch.querySelector('span') as HTMLSpanElement).style.display = '';
      customSwatch.classList.remove('active');
    }
  }

  /* Tags */
  renderWsTags(ws.topics || []);

  workspaceDetailPanel.classList.add('open');
}

function closeWorkspaceDetail() {
  workspaceDetailPanel.classList.remove('open');
  detailWorkspaceId = null;
}

(document.getElementById('workspace-detail-close') as HTMLButtonElement)
  .addEventListener('click', closeWorkspaceDetail);

/* Workspace name */
(document.getElementById('ws-detail-name') as HTMLInputElement).addEventListener('input', function () {
  if (!detailWorkspaceId) return;
  var ws = graph.workspaces.find(function (w) {
    return w.id === detailWorkspaceId;
  });
  if (!ws) return;
  ws.name = (this as HTMLInputElement).value;
  renderWorkspaces();
  saveGraph();
});

/* Workspace color */
document.querySelectorAll('#ws-detail-colors .color-swatch').forEach(function (swatch) {
  swatch.addEventListener('click', function () {
    if (!detailWorkspaceId) return;
    if (swatch.classList.contains('color-swatch-custom')) {
      (document.getElementById('ws-detail-color-input') as HTMLInputElement).click();
      return;
    }
    var ws = graph.workspaces.find(function (w) {
      return w.id === detailWorkspaceId;
    });
    if (!ws) return;
    ws.color = (swatch as HTMLElement).dataset.color!;
    document.querySelectorAll('#ws-detail-colors .color-swatch').forEach(function (s) {
      if (s.classList.contains('color-swatch-custom')) return;
      s.classList.toggle('active', (s as HTMLElement).dataset.color === ws!.color);
    });
    /* Reset custom swatch */
    var customSwatch = document.querySelector('#ws-detail-colors .color-swatch-custom') as HTMLElement | null;
    if (customSwatch) {
      customSwatch.style.background = '';
      (customSwatch.querySelector('span') as HTMLSpanElement).style.display = '';
      customSwatch.classList.remove('active');
    }
    renderWorkspaces();
    saveGraph();
  });
});

(document.getElementById('ws-detail-color-input') as HTMLInputElement).addEventListener('input', function () {
  if (!detailWorkspaceId) return;
  var ws = graph.workspaces.find(function (w) {
    return w.id === detailWorkspaceId;
  });
  if (!ws) return;
  ws.color = (this as HTMLInputElement).value;
  document.querySelectorAll('#ws-detail-colors .color-swatch').forEach(function (s) {
    s.classList.remove('active');
  });
  var customSwatch = document.querySelector('#ws-detail-colors .color-swatch-custom') as HTMLElement | null;
  if (customSwatch) {
    customSwatch.style.background = ws.color;
    (customSwatch.querySelector('span') as HTMLSpanElement).style.display = 'none';
    customSwatch.classList.add('active');
  }
  renderWorkspaces();
  saveGraph();
});

/* Workspace purpose */
(document.getElementById('ws-detail-purpose') as HTMLTextAreaElement).addEventListener('input', function () {
  if (!detailWorkspaceId) return;
  var ws = graph.workspaces.find(function (w) {
    return w.id === detailWorkspaceId;
  });
  if (!ws) return;
  ws.purpose = (this as HTMLTextAreaElement).value;
  renderWorkspaces();
  saveGraph();
});

/* Workspace budget */
(document.getElementById('ws-detail-budget') as HTMLInputElement).addEventListener('input', function () {
  if (!detailWorkspaceId) return;
  var ws = graph.workspaces.find(function (w) {
    return w.id === detailWorkspaceId;
  });
  if (!ws) return;
  ws.budget = parseFloat((this as HTMLInputElement).value) || 0;
  saveGraph();
});

/* Number stepper buttons (generic) */
document.querySelectorAll('.stepper-btn').forEach(function (btn) {
  btn.addEventListener('click', function () {
    var input = document.getElementById((btn as HTMLElement).dataset.target!) as HTMLInputElement | null;
    if (!input) return;
    var step = parseFloat(input.step) || 1;
    var min = input.min !== '' ? parseFloat(input.min) : -Infinity;
    var current = parseFloat(input.value) || 0;
    var next = btn.classList.contains('stepper-plus') ? current + step : current - step;
    if (next < min) next = min;
    input.value = String(next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
});

/* Workspace tags */
function renderWsTags(topics: string[]) {
  var container = document.getElementById('ws-detail-tags') as HTMLDivElement;
  var input = document.getElementById('ws-tag-input') as HTMLInputElement;
  /* Remove existing tag items */
  container.querySelectorAll('.tag-item').forEach(function (t) {
    t.remove();
  });
  topics.forEach(function (topic, idx) {
    var tag = document.createElement('span');
    tag.className = 'tag-item';
    tag.innerHTML =
      escapeHtml(topic) + '<button class="tag-remove" data-idx="' + idx + '">x</button>';
    container.insertBefore(tag, input);
  });
}

(document.getElementById('ws-detail-tags') as HTMLDivElement).addEventListener('click', function (e) {
  var removeBtn = (e.target as HTMLElement).closest('.tag-remove') as HTMLElement | null;
  if (!removeBtn || !detailWorkspaceId) return;
  var ws = graph.workspaces.find(function (w) {
    return w.id === detailWorkspaceId;
  });
  if (!ws || !ws.topics) return;
  var idx = parseInt(removeBtn.dataset.idx!, 10);
  ws.topics.splice(idx, 1);
  renderWsTags(ws.topics);
  saveGraph();
});

(document.getElementById('ws-tag-input') as HTMLInputElement).addEventListener('keydown', function (e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  var val = (this as HTMLInputElement).value.trim();
  if (!val || !detailWorkspaceId) return;
  var ws = graph.workspaces.find(function (w) {
    return w.id === detailWorkspaceId;
  });
  if (!ws) return;
  if (!ws.topics) ws.topics = [];
  ws.topics.push(val);
  (this as HTMLInputElement).value = '';
  renderWsTags(ws.topics);
  saveGraph();
});

/* ═══════════════════════════════════════════════
   Workspace Creation Dialog
   ═══════════════════════════════════════════════ */

var wsCreateColor = '#038B9A';

(document.getElementById('btn-add-workspace') as HTMLButtonElement).addEventListener('click', function () {
  wsDialogOverlay.classList.add('open');
  (document.getElementById('ws-create-name') as HTMLInputElement).value = '';
  (document.getElementById('ws-create-purpose') as HTMLTextAreaElement).value = '';
  (document.getElementById('ws-create-topics') as HTMLInputElement).value = '';
  (document.getElementById('ws-create-budget') as HTMLInputElement).value = '';
  wsCreateColor = '#038B9A';
  document.querySelectorAll('#ws-create-colors .color-swatch').forEach(function (s) {
    s.classList.toggle('active', (s as HTMLElement).dataset.color === '#038B9A');
  });
  /* Reset custom swatch appearance */
  var customSwatch = document.querySelector('#ws-create-colors .color-swatch-custom') as HTMLElement | null;
  if (customSwatch) {
    customSwatch.style.background = '';
    (customSwatch.querySelector('span') as HTMLSpanElement).style.display = '';
    customSwatch.classList.remove('active');
  }
  (document.getElementById('ws-create-name') as HTMLInputElement).focus();
});

(document.getElementById('ws-create-cancel') as HTMLButtonElement).addEventListener('click', function () {
  wsDialogOverlay.classList.remove('open');
});

document.querySelectorAll('#ws-create-colors .color-swatch').forEach(function (swatch) {
  swatch.addEventListener('click', function () {
    if (swatch.classList.contains('color-swatch-custom')) {
      (document.getElementById('ws-create-color-input') as HTMLInputElement).click();
      return;
    }
    wsCreateColor = (swatch as HTMLElement).dataset.color!;
    document.querySelectorAll('#ws-create-colors .color-swatch').forEach(function (s) {
      s.classList.toggle('active', (s as HTMLElement).dataset.color === wsCreateColor);
    });
    /* Reset custom swatch */
    var customSwatch = document.querySelector('#ws-create-colors .color-swatch-custom') as HTMLElement | null;
    if (customSwatch) {
      customSwatch.style.background = '';
      (customSwatch.querySelector('span') as HTMLSpanElement).style.display = '';
      customSwatch.classList.remove('active');
    }
  });
});

(document.getElementById('ws-create-color-input') as HTMLInputElement).addEventListener('input', function () {
  wsCreateColor = (this as HTMLInputElement).value;
  document.querySelectorAll('#ws-create-colors .color-swatch').forEach(function (s) {
    s.classList.remove('active');
  });
  var customSwatch = document.querySelector('#ws-create-colors .color-swatch-custom') as HTMLElement | null;
  if (customSwatch) {
    customSwatch.style.background = wsCreateColor;
    (customSwatch.querySelector('span') as HTMLSpanElement).style.display = 'none';
    customSwatch.classList.add('active');
  }
});

(document.getElementById('ws-create-submit') as HTMLButtonElement).addEventListener('click', function () {
  var name = (document.getElementById('ws-create-name') as HTMLInputElement).value.trim();
  if (!name) return;
  var purpose = (document.getElementById('ws-create-purpose') as HTMLTextAreaElement).value.trim();
  var topicsRaw = (document.getElementById('ws-create-topics') as HTMLInputElement).value.trim();
  var topics = topicsRaw
    ? topicsRaw
        .split(',')
        .map(function (t) {
          return t.trim();
        })
        .filter(Boolean)
    : [];
  var budgetVal = parseFloat((document.getElementById('ws-create-budget') as HTMLInputElement).value) || 0;

  var cx = (window.innerWidth / 2 - vpX) / vpZoom - 200;
  var cy = (window.innerHeight / 2 - vpY) / vpZoom - 160;

  var ws: Workspace = {
    id: generateId(),
    name: name,
    color: wsCreateColor,
    purpose: purpose,
    topics: topics,
    budget: budgetVal,
    position: { x: Math.round(cx), y: Math.round(cy) },
    size: { w: 400, h: 320 },
    checkpoints: [],
    groups: [],
  };
  graph.workspaces.push(ws);
  wsDialogOverlay.classList.remove('open');
  renderAll();
  saveGraph();
});

/* Close dialog on overlay click */
wsDialogOverlay.addEventListener('click', function (e) {
  if (e.target === wsDialogOverlay) {
    wsDialogOverlay.classList.remove('open');
  }
});

/* ═══════════════════════════════════════════════
   Helpers (continued)
   ═══════════════════════════════════════════════ */

function hexToRgba(hex: string, alpha: number): string {
  var r = parseInt(hex.slice(1, 3), 16);
  var g = parseInt(hex.slice(3, 5), 16);
  var b = parseInt(hex.slice(5, 7), 16);
  return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
}

/* -- Back to Palette -- */
(document.getElementById('palette-back') as HTMLButtonElement).addEventListener('click', function () {
  invoke('close_and_show_palette', { label: 'canvas' });
});

/* Boot */
init();
