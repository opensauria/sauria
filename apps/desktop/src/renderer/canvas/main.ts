import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { t, applyTranslations } from '../i18n.js';

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
  integrations?: string[];
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
  size: { width: number; height: number };
  checkpoints: unknown[];
  groups: unknown[];
  locked?: boolean;
}

interface IntegrationInstance {
  id: string;
  integrationId: string;
  label: string;
  connectedAt: string;
}

interface IntegrationDef {
  id: string;
  name: string;
  icon: string;
}

interface CanvasGraph {
  nodes: AgentNode[];
  edges: Edge[];
  workspaces: Workspace[];
  instances?: IntegrationInstance[];
  globalInstructions: string;
  language?: string;
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
  nodeId?: string;
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

/* workspace lock state — persisted in graph via ws.locked */

/* DOM refs */
var viewport = document.getElementById('viewport') as HTMLDivElement;
var world = document.getElementById('world') as HTMLDivElement;
var edgeSvg = document.getElementById('edge-svg') as unknown as SVGSVGElement;
var emptyState = document.getElementById('empty-state') as HTMLDivElement;
var zoomDisplay = document.getElementById('zoom-display') as HTMLSpanElement;
var agentDetailPanel = document.getElementById('agent-detail-panel') as HTMLDivElement;
var workspaceDetailPanel = document.getElementById('workspace-detail-panel') as HTMLDivElement;
var wsDialogOverlay = document.getElementById('ws-dialog-overlay') as HTMLDivElement;
var activitySvg = document.getElementById('activity-svg') as unknown as SVGSVGElement;
var canvasLegend = document.getElementById('canvas-legend') as HTMLDivElement;

/* Activity state */
var activeNodeIds = new Set<string>();
var edgeAnimCounts = new Map<string, number>();
var edgeActiveCounts = new Map<string, number>();
var legendTimer: ReturnType<typeof setTimeout> | null = null;

/* Confirm dialog */
var confirmOverlay = document.getElementById('confirm-dialog-overlay') as HTMLDivElement;
var confirmMessage = document.getElementById('confirm-dialog-message') as HTMLParagraphElement;
var confirmBtn = document.getElementById('confirm-dialog-confirm') as HTMLButtonElement;
var confirmCancelBtn = document.getElementById('confirm-dialog-cancel') as HTMLButtonElement;
var confirmCallback: (() => void) | null = null;

function showConfirmDialog(message: string, onConfirm: () => void): void {
  confirmMessage.textContent = message;
  confirmCallback = onConfirm;
  confirmOverlay.classList.add('open');
}

function closeConfirmDialog(): void {
  confirmOverlay.classList.remove('open');
  confirmCallback = null;
}

confirmBtn.addEventListener('click', function () {
  if (confirmCallback) confirmCallback();
  closeConfirmDialog();
});

confirmCancelBtn.addEventListener('click', closeConfirmDialog);

confirmOverlay.addEventListener('click', function (e) {
  if (e.target === confirmOverlay) closeConfirmDialog();
});

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && confirmOverlay.classList.contains('open')) {
    closeConfirmDialog();
  }
});

/* Integration catalog cache */
var catalogMap = new Map<string, IntegrationDef>();
var hoveredNodeId: string | null = null;
var hoverLeaveTimer: ReturnType<typeof setTimeout> | null = null;

/* Conversation panel state */
var convPanel = document.getElementById('conversation-panel') as HTMLDivElement;
var convMessages = document.getElementById('conv-messages') as HTMLDivElement;
var convParticipants = document.getElementById('conv-participants') as HTMLDivElement;
var convStatus = document.getElementById('conv-status') as HTMLDivElement;

interface ConvMessage {
  readonly id: string;
  readonly from: string;
  readonly fromLabel: string;
  readonly to: string;
  readonly toLabel: string;
  readonly content: string;
  readonly actionType: string;
  readonly timestamp: string;
}

var conversationBuffer = new Map<string, ConvMessage[]>();
var activeConvKey: string | null = null;
var CONV_MAX_AGE_MS = 5 * 60 * 1000;

/* Activity feed state */
var feedMode = false;
var feedFilterNodeId: string | null = null;
var unreadCount = 0;
var convFilters = document.getElementById('conv-filters') as HTMLDivElement;
var activityBadge = document.getElementById('activity-badge') as HTMLSpanElement;

/* ── Shared Edge Geometry ───────────────────── */
var CARD_FALLBACK_W = 120;
var CARD_FALLBACK_H = 150;

interface EdgeGeometry {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly d: string;
  readonly midX: number;
  readonly midY: number;
}

/**
 * Compute a Bezier curve between two nodes (bottom-center of source to top-center of target).
 * Used by renderEdges, activity animations, and edge midpoint calculations.
 */
function computeEdgeGeometry(fromId: string, toId: string): EdgeGeometry | null {
  var fromNode = graph.nodes.find(function (n) {
    return n.id === fromId;
  });
  var toNode = graph.nodes.find(function (n) {
    return n.id === toId;
  });
  if (!fromNode || !toNode) return null;

  var fromCard = world.querySelector('[data-node-id="' + fromId + '"]') as HTMLElement | null;
  var toCard = world.querySelector('[data-node-id="' + toId + '"]') as HTMLElement | null;
  var fromW = fromCard ? fromCard.offsetWidth : CARD_FALLBACK_W;
  var fromH = fromCard ? fromCard.offsetHeight : CARD_FALLBACK_H;
  var toW = toCard ? toCard.offsetWidth : CARD_FALLBACK_W;

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

  return {
    x1: x1,
    y1: y1,
    x2: x2,
    y2: y2,
    d: d,
    midX: (x1 + x2) / 2,
    midY: (y1 + y2) / 2,
  };
}

/* Platform icons — loaded from /icons/ directory (simple-icons + lucide-static) */
var platformIcons: Record<string, string> = {
  telegram: '<img src="/icons/telegram.svg" alt="Telegram" />',
  slack: '<img src="/icons/slack.svg" alt="Slack" />',
  whatsapp: '<img src="/icons/whatsapp.svg" alt="WhatsApp" />',
  discord: '<img src="/icons/discord.svg" alt="Discord" />',
  teams: '<img src="/icons/teams.svg" alt="Teams" />',
  messenger: '<img src="/icons/messenger.svg" alt="Messenger" />',
  line: '<img src="/icons/line.svg" alt="LINE" />',
  'google-chat': '<img src="/icons/google-chat.svg" alt="Google Chat" />',
  twilio: '<img src="/icons/twilio.svg" alt="Twilio" />',
  matrix: '<img src="/icons/matrix.svg" alt="Matrix" class="icon-mono" />',
  gmail: '<img src="/icons/gmail.svg" alt="Gmail" />',
  email: '<img src="/icons/email.svg" alt="Email" class="icon-mono" />',
};

/* Response language options */
var RESPONSE_LANGUAGES = [
  { code: 'auto', label: 'Auto-detect' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'French / Francais' },
  { code: 'es', label: 'Spanish / Espanol' },
  { code: 'de', label: 'German / Deutsch' },
  { code: 'it', label: 'Italian / Italiano' },
  { code: 'pt', label: 'Portuguese / Portugues' },
  { code: 'nl', label: 'Dutch / Nederlands' },
  { code: 'ru', label: 'Russian' },
  { code: 'uk', label: 'Ukrainian' },
  { code: 'pl', label: 'Polish / Polski' },
  { code: 'cs', label: 'Czech / Cestina' },
  { code: 'sk', label: 'Slovak / Slovencina' },
  { code: 'hu', label: 'Hungarian / Magyar' },
  { code: 'ro', label: 'Romanian / Romana' },
  { code: 'bg', label: 'Bulgarian' },
  { code: 'hr', label: 'Croatian / Hrvatski' },
  { code: 'sr', label: 'Serbian' },
  { code: 'sl', label: 'Slovenian / Slovenscina' },
  { code: 'lv', label: 'Latvian / Latviesu' },
  { code: 'lt', label: 'Lithuanian / Lietuviu' },
  { code: 'et', label: 'Estonian / Eesti' },
  { code: 'sv', label: 'Swedish / Svenska' },
  { code: 'no', label: 'Norwegian / Norsk' },
  { code: 'da', label: 'Danish / Dansk' },
  { code: 'fi', label: 'Finnish / Suomi' },
  { code: 'el', label: 'Greek' },
  { code: 'tr', label: 'Turkish / Turkce' },
  { code: 'ar', label: 'Arabic' },
  { code: 'he', label: 'Hebrew' },
  { code: 'hi', label: 'Hindi' },
  { code: 'bn', label: 'Bengali' },
  { code: 'ta', label: 'Tamil' },
  { code: 'te', label: 'Telugu' },
  { code: 'mr', label: 'Marathi' },
  { code: 'gu', label: 'Gujarati' },
  { code: 'ur', label: 'Urdu' },
  { code: 'fa', label: 'Persian / Farsi' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'th', label: 'Thai' },
  { code: 'vi', label: 'Vietnamese / Tieng Viet' },
  { code: 'id', label: 'Indonesian / Bahasa Indonesia' },
  { code: 'ms', label: 'Malay / Bahasa Melayu' },
  { code: 'tl', label: 'Filipino / Tagalog' },
  { code: 'sw', label: 'Swahili / Kiswahili' },
  { code: 'am', label: 'Amharic' },
  { code: 'yo', label: 'Yoruba' },
  { code: 'ha', label: 'Hausa' },
  { code: 'zu', label: 'Zulu / isiZulu' },
  { code: 'af', label: 'Afrikaans' },
  { code: 'ca', label: 'Catalan / Catala' },
  { code: 'eu', label: 'Basque / Euskara' },
  { code: 'gl', label: 'Galician / Galego' },
  { code: 'cy', label: 'Welsh / Cymraeg' },
  { code: 'ga', label: 'Irish / Gaeilge' },
  { code: 'ka', label: 'Georgian' },
  { code: 'hy', label: 'Armenian' },
  { code: 'az', label: 'Azerbaijani' },
  { code: 'uz', label: 'Uzbek' },
  { code: 'kk', label: 'Kazakh' },
  { code: 'mn', label: 'Mongolian' },
  { code: 'ne', label: 'Nepali' },
  { code: 'si', label: 'Sinhala' },
  { code: 'km', label: 'Khmer' },
  { code: 'lo', label: 'Lao' },
  { code: 'my', label: 'Burmese' },
];

/* Populate response language select */
var responseLangSelect = document.getElementById('detail-language') as HTMLSelectElement;
for (var rl of RESPONSE_LANGUAGES) {
  var rlOpt = document.createElement('option');
  rlOpt.value = rl.code;
  rlOpt.textContent = rl.label;
  responseLangSelect.appendChild(rlOpt);
}

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

  /* Auto-create or refresh owner node */
  var ownerProfile: OwnerProfile = { fullName: 'You', photo: null, customInstructions: '' };
  try {
    ownerProfile = await invoke<OwnerProfile>('get_owner_profile');
  } catch {
    /* fallback */
  }

  var existingOwner = graph.nodes.find(function (n) {
    return n.platform === 'owner';
  });
  if (!existingOwner) {
    var cx = (window.innerWidth / 2 - vpX) / vpZoom - 60;
    graph.nodes.unshift({
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
    saveGraph();
  } else {
    /* Refresh photo and name from OS profile */
    var changed = false;
    if (ownerProfile.photo && existingOwner.photo !== ownerProfile.photo) {
      existingOwner.photo = ownerProfile.photo;
      changed = true;
    }
    if (ownerProfile.fullName && existingOwner.label !== ownerProfile.fullName) {
      existingOwner.label = ownerProfile.fullName;
      changed = true;
    }
    if (changed) saveGraph();
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

  /* Preload integration catalog for orbital bubbles */
  invoke<Array<{ id: string; definition: IntegrationDef }>>('integrations_list_catalog')
    .then(function (catalog) {
      for (var item of catalog) {
        catalogMap.set(item.id ?? item.definition.id, item.definition);
      }
    })
    .catch(function () {
      /* daemon may not be ready yet */
    });
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
    var isLocked = ws.locked === true;
    frame.className =
      'workspace-frame' +
      (ws.id === selectedWorkspaceId ? ' selected' : '') +
      (isLocked ? ' locked' : '');
    frame.dataset.workspaceId = ws.id;
    frame.style.left = ws.position.x + 'px';
    frame.style.top = ws.position.y + 'px';
    frame.style.width = ws.size.width + 'px';
    frame.style.height = ws.size.height + 'px';
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
      (ws.purpose ? '<span class="workspace-purpose">' + escapeHtml(ws.purpose) + '</span>' : '') +
      '<button class="ws-lock' +
      (isLocked ? ' locked' : '') +
      '" data-action="ws-lock" data-ws-id="' +
      ws.id +
      '" title="' +
      (isLocked ? 'Unlock' : 'Lock') +
      ' workspace">' +
      (isLocked ? LOCK_SVG : UNLOCK_SVG) +
      '</button>' +
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
    teams: [
      {
        key: 'appId',
        label: 'App ID',
        type: 'text',
        placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
        hint: 'From Azure Bot Service > Configuration',
      },
      {
        key: 'appSecret',
        label: 'App Secret',
        type: 'password',
        placeholder: 'abc123...',
        hint: 'Client secret from Azure AD app registration',
      },
      {
        key: 'tenantId',
        label: 'Tenant ID',
        type: 'text',
        placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
        hint: 'Azure AD tenant ID (or "common" for multi-tenant)',
      },
    ],
    messenger: [
      {
        key: 'pageAccessToken',
        label: 'Page Access Token',
        type: 'password',
        placeholder: 'EAA...',
        hint: 'From Meta Developer Portal > Messenger > Access Tokens',
      },
      {
        key: 'pageId',
        label: 'Page ID',
        type: 'text',
        placeholder: '1234567890',
        hint: 'Facebook Page ID (Settings > About)',
      },
    ],
    line: [
      {
        key: 'channelAccessToken',
        label: 'Channel Access Token',
        type: 'password',
        placeholder: 'abc123...',
        hint: 'From LINE Developers > Messaging API > Channel Access Token',
      },
      {
        key: 'channelSecret',
        label: 'Channel Secret',
        type: 'password',
        placeholder: 'abc123...',
        hint: 'From LINE Developers > Basic Settings',
      },
    ],
    'google-chat': [
      {
        key: 'serviceAccountKey',
        label: 'Service Account Key (JSON)',
        type: 'password',
        placeholder: '{"type":"service_account",...}',
        hint: 'From Google Cloud Console > IAM > Service Accounts > Keys',
      },
      {
        key: 'spaceId',
        label: 'Space ID',
        type: 'text',
        placeholder: 'spaces/AAAAxxx',
        hint: 'Google Chat space to listen on',
      },
    ],
    twilio: [
      {
        key: 'accountSid',
        label: 'Account SID',
        type: 'text',
        placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        hint: 'From Twilio Console > Account Info',
      },
      {
        key: 'authToken',
        label: 'Auth Token',
        type: 'password',
        placeholder: 'abc123...',
        hint: 'From Twilio Console > Account Info',
      },
      {
        key: 'phoneNumber',
        label: 'Phone Number',
        type: 'text',
        placeholder: '+1234567890',
        hint: 'Twilio phone number (E.164 format)',
      },
    ],
    matrix: [
      {
        key: 'homeserverUrl',
        label: 'Homeserver URL',
        type: 'text',
        placeholder: 'https://matrix.org',
        hint: 'Matrix homeserver base URL',
      },
      {
        key: 'accessToken',
        label: 'Access Token',
        type: 'password',
        placeholder: 'syt_xxx...',
        hint: 'From Element > Settings > Help & About > Access Token',
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
var LOCK_SVG =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
var UNLOCK_SVG =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>';

function renderNodes() {
  /* Reset hover state — DOM is about to be rebuilt */
  removeOrbitalBubbles();

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
      card.className = 'agent-card error-state' + (node.id === selectedNodeId ? ' selected' : '');
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
      card.className = 'agent-card owner-card' + (node.id === selectedNodeId ? ' selected' : '');

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
      var botInfo = getBotInfo(node);

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
        (botInfo ? '<div class="agent-bot-info">' + escapeHtml(botInfo) + '</div>' : '') +
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

    /* Orbital hover bubbles */
    card.addEventListener('mouseenter', function () {
      if (isDragging) return;
      var nid = card.dataset.nodeId!;
      if (nid === hoveredNodeId) return;
      if (hoverLeaveTimer) {
        clearTimeout(hoverLeaveTimer);
        hoverLeaveTimer = null;
      }
      showOrbitalBubbles(nid);
    });
    card.addEventListener('mouseleave', function () {
      if (hoveredNodeId) scheduleOrbitalHide();
    });

    /* Restore active state from in-memory set */
    if (activeNodeIds.has(node.id)) {
      card.classList.add('node-active');
    }

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

  var defs = '';
  var paths = '';
  graph.edges.forEach(function (edge) {
    var geo = computeEdgeGeometry(edge.from, edge.to);
    if (!geo) return;

    /* Per-edge gradients: static line + animated flow both fade at ends */
    var gid = 'eg-' + edge.id;
    var fid = 'ef-' + edge.id;
    var gradientAttrs =
      '" gradientUnits="userSpaceOnUse" x1="' +
      geo.x1 +
      '" y1="' +
      geo.y1 +
      '" x2="' +
      geo.x2 +
      '" y2="' +
      geo.y2 +
      '">';
    defs +=
      '<linearGradient id="' +
      gid +
      gradientAttrs +
      '<stop offset="0%" stop-color="rgba(255,255,255,0)" />' +
      '<stop offset="20%" stop-color="rgba(255,255,255,0.14)" />' +
      '<stop offset="50%" stop-color="rgba(255,255,255,0.18)" />' +
      '<stop offset="80%" stop-color="rgba(255,255,255,0.14)" />' +
      '<stop offset="100%" stop-color="rgba(255,255,255,0)" />' +
      '</linearGradient>';
    defs +=
      '<linearGradient id="' +
      fid +
      gradientAttrs +
      '<stop offset="0%" stop-color="rgba(255,255,255,0)" />' +
      '<stop offset="15%" stop-color="rgba(255,255,255,0.35)" />' +
      '<stop offset="85%" stop-color="rgba(255,255,255,0.35)" />' +
      '<stop offset="100%" stop-color="rgba(255,255,255,0)" />' +
      '</linearGradient>';

    /* Hit-area, gradient line, animated flow overlay — wrapped in a group */
    paths += '<g class="edge-group" data-edge-id="' + edge.id + '">';
    paths += '<path class="edge-hit" data-edge-id="' + edge.id + '" d="' + geo.d + '" />';
    paths += '<path class="edge-line" d="' + geo.d + '" stroke="url(#' + gid + ')" />';
    paths += '<path class="edge-flow" d="' + geo.d + '" stroke="url(#' + fid + ')" />';
    paths += '</g>';
  });
  edgeSvg.innerHTML = '<defs>' + defs + '</defs>' + paths;
}

/* ═══════════════════════════════════════════════
   Activity Animations
   ═══════════════════════════════════════════════ */

var MAX_EDGE_ANIMS = 3;
var ANIM_DURATION_MS = 800;
var BUBBLE_LINGER_MS = 2500;
var NODE_IDLE_TIMEOUT_MS = 30_000;
var LEGEND_FADE_MS = 10_000;

function animateEdgeTravel(fromId: string, toId: string, preview: string): void {
  if (!activitySvg) return;

  /* Self-loop (reply): just pulse the node, no dot animation */
  if (fromId === toId) return;

  var edgeKey = fromId + '->' + toId;
  var currentCount = edgeAnimCounts.get(edgeKey) || 0;
  if (currentCount >= MAX_EDGE_ANIMS) return;
  edgeAnimCounts.set(edgeKey, currentCount + 1);

  /* Find matching edge in both directions and activate its SVG group */
  var matchedEdge = graph.edges.find(function (e) {
    return (e.from === fromId && e.to === toId) || (e.from === toId && e.to === fromId);
  });
  var isReverse = matchedEdge ? matchedEdge.from !== fromId : false;
  var edgeGroupEl: Element | null = null;
  if (matchedEdge) {
    edgeGroupEl = edgeSvg.querySelector('[data-edge-id="' + matchedEdge.id + '"].edge-group');
    if (edgeGroupEl) {
      edgeGroupEl.classList.add('edge-active');
      var activeCount = (edgeActiveCounts.get(matchedEdge.id) || 0) + 1;
      edgeActiveCounts.set(matchedEdge.id, activeCount);
    }
  }

  /* Compute geometry using edge's canonical direction so dot follows the curve */
  var geoFrom = isReverse ? toId : fromId;
  var geoTo = isReverse ? fromId : toId;
  var geo = computeEdgeGeometry(geoFrom, geoTo);
  if (!geo) {
    edgeAnimCounts.set(edgeKey, (edgeAnimCounts.get(edgeKey) || 1) - 1);
    if (matchedEdge && edgeGroupEl) {
      var cnt = (edgeActiveCounts.get(matchedEdge.id) || 1) - 1;
      edgeActiveCounts.set(matchedEdge.id, cnt);
      if (cnt <= 0) edgeGroupEl.classList.remove('edge-active');
    }
    return;
  }

  /* Create temp path for getPointAtLength */
  var ns = 'http://www.w3.org/2000/svg';
  var tempPath = document.createElementNS(ns, 'path') as SVGPathElement;
  tempPath.setAttribute('d', geo.d);
  tempPath.setAttribute('fill', 'none');
  tempPath.setAttribute('stroke', 'none');
  activitySvg.appendChild(tempPath);
  var totalLength = tempPath.getTotalLength();

  /* Traveling dot — color set via CSS class, not hardcoded */
  var circle = document.createElementNS(ns, 'circle');
  circle.setAttribute('r', '4');
  circle.classList.add('activity-dot');
  circle.setAttribute('filter', 'url(#activity-glow)');
  activitySvg.appendChild(circle);

  /* Floating bubble */
  var bubble = document.createElement('div');
  bubble.className = 'activity-bubble';
  bubble.textContent = preview;
  bubble.style.left = geo.midX + 'px';
  bubble.style.top = geo.midY + 'px';
  bubble.addEventListener('click', function () {
    openConversationPanel(fromId, toId);
  });
  world.appendChild(bubble);

  var startTime = performance.now();
  var bubbleShown = false;
  var bubbleHidden = false;

  function step(now: number): void {
    var elapsed = now - startTime;
    var t = Math.min(elapsed / ANIM_DURATION_MS, 1);
    /* Ease-out cubic */
    var eased = 1 - Math.pow(1 - t, 3);
    var point = tempPath.getPointAtLength(
      isReverse ? (1 - eased) * totalLength : eased * totalLength,
    );
    circle.setAttribute('cx', String(point.x));
    circle.setAttribute('cy', String(point.y));

    /* Show bubble at ~30% travel */
    if (!bubbleShown && t >= 0.3) {
      bubble.classList.add('visible');
      bubbleShown = true;
    }

    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      cleanup();
    }
  }

  function cleanup(): void {
    circle.remove();
    tempPath.remove();
    edgeAnimCounts.set(edgeKey, (edgeAnimCounts.get(edgeKey) || 1) - 1);

    /* Deactivate edge glow when last animation finishes */
    if (matchedEdge && edgeGroupEl) {
      var remaining = (edgeActiveCounts.get(matchedEdge.id) || 1) - 1;
      edgeActiveCounts.set(matchedEdge.id, remaining);
      if (remaining <= 0) edgeGroupEl.classList.remove('edge-active');
    }

    /* Fade bubble after linger */
    if (!bubbleHidden) {
      bubbleHidden = true;
      setTimeout(function () {
        bubble.classList.remove('visible');
        setTimeout(function () {
          bubble.remove();
        }, 300);
      }, BUBBLE_LINGER_MS);
    }
  }

  requestAnimationFrame(step);
}

var nodeIdleTimers = new Map<string, ReturnType<typeof setTimeout>>();

function setNodeActivityState(nodeId: string, state: string): void {
  /* Clear existing auto-idle timer */
  var existing = nodeIdleTimers.get(nodeId);
  if (existing) clearTimeout(existing);

  if (state === 'active') {
    activeNodeIds.add(nodeId);
    /* Safety: auto-idle after timeout */
    nodeIdleTimers.set(
      nodeId,
      setTimeout(function () {
        activeNodeIds.delete(nodeId);
        applyNodeActiveClass(nodeId, false);
        nodeIdleTimers.delete(nodeId);
      }, NODE_IDLE_TIMEOUT_MS),
    );
  } else {
    activeNodeIds.delete(nodeId);
    nodeIdleTimers.delete(nodeId);
  }

  applyNodeActiveClass(nodeId, state === 'active');
}

function applyNodeActiveClass(nodeId: string, active: boolean): void {
  var card = world.querySelector('[data-node-id="' + nodeId + '"]') as HTMLElement | null;
  if (!card) return;
  if (active) {
    card.classList.add('node-active');
    if (!card.querySelector('.glow-ring')) {
      var ring = document.createElement('div');
      ring.className = 'glow-ring';
      var mask = document.createElement('div');
      mask.className = 'glow-ring-mask';
      ring.appendChild(mask);
      card.prepend(ring);
    }
  } else {
    card.classList.remove('node-active');
    var existingRing = card.querySelector('.glow-ring');
    if (existingRing) existingRing.remove();
  }
}

function showLegend(): void {
  if (!canvasLegend) return;
  canvasLegend.classList.add('visible');

  if (legendTimer) clearTimeout(legendTimer);
  legendTimer = setTimeout(function () {
    canvasLegend.classList.remove('visible');
    legendTimer = null;
  }, LEGEND_FADE_MS);
}

/* Activity event listeners */
listen<{ from: string; to: string; actionType: string; preview: string }>(
  'activity:edge',
  function (e) {
    animateEdgeTravel(e.payload.from, e.payload.to, e.payload.preview);
    showLegend();
  },
);

listen<{ nodeId: string; state: string }>('activity:node', function (e) {
  setNodeActivityState(e.payload.nodeId, e.payload.state);
  showLegend();

  /* Update conversation panel status when nodes go idle */
  if (activeConvKey && e.payload.state === 'idle') {
    var parts = activeConvKey.split('|');
    var fromActive = activeNodeIds.has(parts[0]);
    var toActive = activeNodeIds.has(parts[1]);
    if (!fromActive && !toActive) {
      convStatus.textContent = 'Processing complete';
      convStatus.classList.add('idle');
    }
  }
});

/* Activity message listener — conversation panel */
listen<ConvMessage>('activity:message', function (e) {
  var msg = e.payload;
  var key = convKey(msg.from, msg.to);

  if (!conversationBuffer.has(key)) {
    conversationBuffer.set(key, []);
  }
  conversationBuffer.get(key)!.push(msg);

  /* If this conversation is open in edge mode, append live */
  if (activeConvKey === key && !feedMode) {
    appendConversationMessage(msg);
  }

  /* If feed mode is open, append to feed */
  if (feedMode && convPanel.classList.contains('open')) {
    if (!feedFilterNodeId || msg.from === feedFilterNodeId || msg.to === feedFilterNodeId) {
      appendFeedMessage(msg);
    }
  }

  /* Track unread when panel is closed */
  if (!convPanel.classList.contains('open')) {
    unreadCount++;
    activityBadge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
    activityBadge.classList.add('visible');
  }

  purgeOldConversations();
});

/* ── Conversation Panel Functions ──────────── */

function convKey(a: string, b: string): string {
  return a < b ? a + '|' + b : b + '|' + a;
}

function buildParticipant(node: AgentNode | undefined): string {
  if (!node) return '<span class="conv-participant-name">Unknown</span>';
  var photoHtml = node.photo
    ? '<div class="conv-participant-avatar"><img src="' + node.photo + '" alt="" /></div>'
    : '<div class="conv-participant-avatar">' + (platformIcons[node.platform] || '') + '</div>';
  return (
    '<div class="conv-participant">' +
    photoHtml +
    '<span class="conv-participant-name">' +
    escapeHtml(node.label) +
    '</span></div>'
  );
}

function openConversationPanel(fromId: string, toId: string): void {
  var key = convKey(fromId, toId);
  activeConvKey = key;
  feedMode = false;
  feedFilterNodeId = null;
  convFilters.classList.remove('visible');

  var activityBtn = document.getElementById('btn-activity-feed');
  if (activityBtn) activityBtn.classList.remove('active');

  unreadCount = 0;
  activityBadge.classList.remove('visible');

  closeAgentDetail();
  closeWorkspaceDetail();

  var fromNode = graph.nodes.find(function (n) {
    return n.id === fromId;
  });
  var toNode = graph.nodes.find(function (n) {
    return n.id === toId;
  });
  convParticipants.innerHTML =
    buildParticipant(fromNode) +
    '<span class="conv-separator">&middot;</span>' +
    buildParticipant(toNode);

  renderConversationMessages(key);

  var fromActive = activeNodeIds.has(fromId);
  var toActive = activeNodeIds.has(toId);
  if (fromActive || toActive) {
    convStatus.textContent = 'Processing...';
    convStatus.classList.remove('idle');
  } else {
    convStatus.textContent = 'Processing complete';
    convStatus.classList.add('idle');
  }

  convPanel.classList.add('open');

  loadEdgeHistory(fromId, toId);
}

function closeConversationPanel(): void {
  convPanel.classList.remove('open');
  activeConvKey = null;
  if (feedMode) closeActivityFeed();
}

function buildMsgBubbleHtml(msg: ConvMessage, side: string): string {
  var node = graph.nodes.find(function (n) {
    return n.id === msg.from;
  });
  var avatarHtml = '';
  if (node?.photo) {
    avatarHtml =
      '<div class="conv-msg-avatar"><img src="' + escapeHtml(node.photo) + '" alt="" /></div>';
  } else {
    var icon = node ? platformIcons[node.platform] || '' : '';
    avatarHtml =
      '<div class="conv-msg-avatar"><div class="conv-msg-avatar-icon">' + icon + '</div></div>';
  }

  return (
    '<div class="conv-msg-row ' +
    side +
    '">' +
    avatarHtml +
    '<div class="conv-msg-bubble">' +
    '<div class="conv-msg-sender">' +
    escapeHtml(msg.fromLabel) +
    '</div>' +
    '<div class="conv-msg-content">' +
    escapeHtml(msg.content) +
    '</div>' +
    '<div class="conv-msg-footer">' +
    '<span class="conv-msg-type-badge">' +
    escapeHtml(msg.actionType) +
    '</span>' +
    '<span class="conv-msg-time">' +
    formatTime(msg.timestamp) +
    '</span>' +
    '</div>' +
    '</div>' +
    '</div>'
  );
}

function renderConversationMessages(key: string): void {
  var messages = conversationBuffer.get(key) || [];
  if (messages.length === 0) {
    convMessages.innerHTML =
      '<div class="conv-empty">Messages will appear here when agents communicate on this edge.</div>';
    return;
  }
  var firstNodeId = key.split('|')[0];
  convMessages.innerHTML = messages
    .map(function (msg) {
      var side = msg.from === firstNodeId ? 'from' : 'to';
      return buildMsgBubbleHtml(msg, side);
    })
    .join('');
  convMessages.scrollTop = convMessages.scrollHeight;
}

function appendConversationMessage(msg: ConvMessage): void {
  var key = activeConvKey!;
  var firstNodeId = key.split('|')[0];
  var side = msg.from === firstNodeId ? 'from' : 'to';

  var emptyMsg = convMessages.querySelector('.conv-empty');
  if (emptyMsg) emptyMsg.remove();

  var wrapper = document.createElement('div');
  wrapper.innerHTML = buildMsgBubbleHtml(msg, side);
  var row = wrapper.firstElementChild;
  if (row) convMessages.appendChild(row);
  convMessages.scrollTop = convMessages.scrollHeight;

  convStatus.textContent = 'Processing...';
  convStatus.classList.remove('idle');
}

function purgeOldConversations(): void {
  var now = Date.now();
  for (var [key, msgs] of conversationBuffer) {
    var last = msgs[msgs.length - 1];
    if (last && now - new Date(last.timestamp).getTime() > CONV_MAX_AGE_MS) {
      conversationBuffer.delete(key);
    }
  }
}

function formatTime(iso: string): string {
  var d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/* ── Activity Feed Functions ──────────────────── */

function openActivityFeed(): void {
  feedMode = true;
  feedFilterNodeId = null;
  activeConvKey = null;

  closeAgentDetail();
  closeWorkspaceDetail();

  unreadCount = 0;
  activityBadge.classList.remove('visible');

  var allMessages = collectAllMessages(null);
  convParticipants.innerHTML =
    '<div class="conv-feed-title">' +
    '<span class="conv-feed-title-text">Activity Feed</span>' +
    '<span class="conv-feed-count">' + allMessages.length + ' messages</span>' +
    '</div>';

  renderFeedFilters();
  convFilters.classList.add('visible');
  renderFeedMessages(allMessages);

  var activityBtn = document.getElementById('btn-activity-feed');
  if (activityBtn) activityBtn.classList.add('active');

  convPanel.classList.add('open');

  loadFeedHistory();
}

function closeActivityFeed(): void {
  feedMode = false;
  feedFilterNodeId = null;
  convFilters.classList.remove('visible');

  var activityBtn = document.getElementById('btn-activity-feed');
  if (activityBtn) activityBtn.classList.remove('active');
}

function collectAllMessages(filterNodeId: string | null): ConvMessage[] {
  var all: ConvMessage[] = [];
  for (var [, msgs] of conversationBuffer) {
    for (var msg of msgs) {
      if (!filterNodeId || msg.from === filterNodeId || msg.to === filterNodeId) {
        all.push(msg);
      }
    }
  }
  all.sort(function (a, b) {
    return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
  });
  return all;
}

function renderFeedMessages(messages: ConvMessage[]): void {
  if (messages.length === 0) {
    convMessages.innerHTML =
      '<div class="conv-empty">Messages will appear here as agents communicate.</div>';
    return;
  }
  convMessages.innerHTML = messages
    .map(function (msg) {
      return buildMsgBubbleHtml(msg, 'from');
    })
    .join('');
  convMessages.scrollTop = convMessages.scrollHeight;
}

function appendFeedMessage(msg: ConvMessage): void {
  var emptyMsg = convMessages.querySelector('.conv-empty');
  if (emptyMsg) emptyMsg.remove();

  var wrapper = document.createElement('div');
  wrapper.innerHTML = buildMsgBubbleHtml(msg, 'from');
  var row = wrapper.firstElementChild;
  if (row) convMessages.appendChild(row);
  convMessages.scrollTop = convMessages.scrollHeight;

  var countEl = convPanel.querySelector('.conv-feed-count');
  if (countEl) {
    var total = convMessages.querySelectorAll('.conv-msg-row').length;
    countEl.textContent = total + ' messages';
  }
}

function renderFeedFilters(): void {
  var nodeIds = new Set<string>();
  for (var [key] of conversationBuffer) {
    var parts = key.split('|');
    nodeIds.add(parts[0]);
    nodeIds.add(parts[1]);
  }

  var html =
    '<button class="conv-filter-pill active" data-filter-node="">All</button>';
  for (var nid of nodeIds) {
    var node = graph.nodes.find(function (n) {
      return n.id === nid;
    });
    if (!node) continue;
    var avatarHtml = node.photo
      ? '<div class="conv-filter-pill-avatar"><img src="' + escapeHtml(node.photo) + '" alt="" /></div>'
      : '';
    html +=
      '<button class="conv-filter-pill" data-filter-node="' +
      escapeHtml(nid) +
      '">' +
      avatarHtml +
      escapeHtml(node.label) +
      '</button>';
  }
  convFilters.innerHTML = html;

  convFilters.querySelectorAll('.conv-filter-pill').forEach(function (pill) {
    pill.addEventListener('click', function () {
      var nodeId = (pill as HTMLElement).dataset['filterNode'] || null;
      feedFilterNodeId = nodeId || null;

      convFilters.querySelectorAll('.conv-filter-pill').forEach(function (p) {
        p.classList.remove('active');
      });
      pill.classList.add('active');

      var filtered = collectAllMessages(feedFilterNodeId);
      renderFeedMessages(filtered);

      var countEl = convPanel.querySelector('.conv-feed-count');
      if (countEl) countEl.textContent = filtered.length + ' messages';
    });
  });
}

async function loadFeedHistory(): Promise<void> {
  try {
    var result = await invoke<{ rows: Array<Record<string, unknown>>; total: number }>(
      'brain_list_conversations',
      { opts: { limit: 20 } },
    );
    if (!result?.rows?.length) return;

    for (var conv of result.rows) {
      var convId = conv['id'] as string;
      var participants = (conv['participant_node_ids'] as string) || '[]';
      var nodeIds: string[];
      try {
        nodeIds = JSON.parse(participants) as string[];
      } catch {
        continue;
      }
      if (nodeIds.length < 2) continue;

      var key = convKey(nodeIds[0], nodeIds[1]);
      var existing = conversationBuffer.get(key);
      if (existing && existing.length > 0) continue;

      var msgResult = await invoke<{ rows: Array<Record<string, unknown>> }>(
        'brain_get_conversation',
        { id: convId, opts: { limit: 50 } },
      );
      if (!msgResult?.rows?.length) continue;

      var fromNode = graph.nodes.find(function (n) { return n.id === nodeIds[0]; });
      var toNode = graph.nodes.find(function (n) { return n.id === nodeIds[1]; });

      var msgs: ConvMessage[] = msgResult.rows.map(function (row) {
        var sourceId = (row['source_node_id'] as string) || nodeIds[0];
        var targetId = sourceId === nodeIds[0] ? nodeIds[1] : nodeIds[0];
        var sourceNode = graph.nodes.find(function (n) { return n.id === sourceId; });
        var targetNode = graph.nodes.find(function (n) { return n.id === targetId; });
        return {
          id: (row['id'] as string) || '',
          from: sourceId,
          fromLabel: sourceNode?.label || fromNode?.label || sourceId,
          to: targetId,
          toLabel: targetNode?.label || toNode?.label || targetId,
          content: (row['content'] as string) || '',
          actionType: (row['role'] as string) || 'message',
          timestamp: (row['created_at'] as string) || new Date().toISOString(),
        };
      });

      conversationBuffer.set(key, msgs);
    }

    if (feedMode && convPanel.classList.contains('open')) {
      var allMessages = collectAllMessages(feedFilterNodeId);
      renderFeedMessages(allMessages);
      renderFeedFilters();

      var countEl = convPanel.querySelector('.conv-feed-count');
      if (countEl) countEl.textContent = allMessages.length + ' messages';
    }
  } catch {
    // History loading is best-effort
  }
}

async function loadEdgeHistory(fromId: string, toId: string): Promise<void> {
  try {
    var result = await invoke<{ rows: Array<Record<string, unknown>>; total: number }>(
      'brain_list_conversations',
      { opts: { nodeIds: [fromId, toId], limit: 1 } },
    );
    if (!result?.rows?.length) return;

    var convId = result.rows[0]['id'] as string;
    var msgResult = await invoke<{ rows: Array<Record<string, unknown>> }>(
      'brain_get_conversation',
      { id: convId, opts: { limit: 50 } },
    );
    if (!msgResult?.rows?.length) return;

    var key = convKey(fromId, toId);
    var existing = conversationBuffer.get(key) || [];
    var existingTimestamps = new Set(existing.map(function (m) { return m.timestamp; }));

    var fromNode = graph.nodes.find(function (n) { return n.id === fromId; });
    var toNode = graph.nodes.find(function (n) { return n.id === toId; });

    var dbMsgs: ConvMessage[] = msgResult.rows
      .map(function (row) {
        var sourceId = (row['source_node_id'] as string) || fromId;
        var targetId = sourceId === fromId ? toId : fromId;
        var sourceNode = graph.nodes.find(function (n) { return n.id === sourceId; });
        var targetNode = graph.nodes.find(function (n) { return n.id === targetId; });
        return {
          id: (row['id'] as string) || '',
          from: sourceId,
          fromLabel: sourceNode?.label || fromNode?.label || sourceId,
          to: targetId,
          toLabel: targetNode?.label || toNode?.label || targetId,
          content: (row['content'] as string) || '',
          actionType: (row['role'] as string) || 'message',
          timestamp: (row['created_at'] as string) || new Date().toISOString(),
        };
      })
      .filter(function (m) { return !existingTimestamps.has(m.timestamp); });

    if (dbMsgs.length > 0) {
      var merged = [...dbMsgs, ...existing].sort(function (a, b) {
        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      });
      conversationBuffer.set(key, merged);

      if (activeConvKey === key && !feedMode) {
        renderConversationMessages(key);
      }
    }
  } catch {
    // History loading is best-effort
  }
}

(document.getElementById('conv-panel-close') as HTMLButtonElement).addEventListener(
  'click',
  closeConversationPanel,
);

/* ═══════════════════════════════════════════════
   Pan & Zoom
   ═══════════════════════════════════════════════ */

viewport.addEventListener('mousedown', function (e) {
  if (
    e.target !== viewport &&
    e.target !== world &&
    !(e.target as HTMLElement).classList.contains('edge-svg')
  )
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
  if (selectedNodeId) {
    var prevCard = world.querySelector('[data-node-id="' + selectedNodeId + '"]');
    if (prevCard) prevCard.classList.remove('selected');
    selectedNodeId = null;
  }
  e.preventDefault();
});

document.addEventListener('mousemove', function (e) {
  if (isPanning) {
    vpX = panStartVpX + (e.clientX - panStartX);
    vpY = panStartVpY + (e.clientY - panStartY);
    applyTransform();
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
        cardCx <= ws.position.x + ws.size.width &&
        cardCy >= ws.position.y &&
        cardCy <= ws.position.y + ws.size.height;
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

      var frame = world.querySelector(
        '[data-workspace-id="' + wsDragId + '"]',
      ) as HTMLElement | null;
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
      ws.size.width = Math.max(320, wsResizeStartW + dx);
    }
    if (wsResizeDir === 'b' || wsResizeDir === 'br') {
      ws.size.height = Math.max(240, wsResizeStartH + dy);
    }
    var frame = world.querySelector(
      '[data-workspace-id="' + wsResizeId + '"]',
    ) as HTMLElement | null;
    if (frame) {
      frame.style.width = ws.size.width + 'px';
      frame.style.height = ws.size.height + 'px';
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
          cardCx <= ws.position.x + ws.size.width &&
          cardCy >= ws.position.y &&
          cardCy <= ws.position.y + ws.size.height
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

    /* Click (not drag): open conversation panel if node active, else agent detail */
    if (dragDist < 5 && clickedNodeId) {
      if (activeNodeIds.has(clickedNodeId)) {
        var foundConv = false;
        for (var [ck] of conversationBuffer) {
          if (ck.includes(clickedNodeId) && conversationBuffer.get(ck)!.length > 0) {
            var ckParts = ck.split('|');
            openConversationPanel(ckParts[0], ckParts[1]);
            foundConv = true;
            break;
          }
        }
        if (!foundConv) openAgentDetail(clickedNodeId);
      } else {
        openAgentDetail(clickedNodeId);
      }
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

  /* Workspace lock button */
  var wsLock = (e.target as HTMLElement).closest('.ws-lock') as HTMLElement | null;
  if (wsLock) {
    var lockWsId = wsLock.dataset.wsId!;
    var lockWs = graph.workspaces.find(function (w) {
      return w.id === lockWsId;
    });
    if (lockWs) {
      (lockWs as { locked?: boolean }).locked = !lockWs.locked;
      saveGraph();
    }
    renderWorkspaces();
    e.preventDefault();
    e.stopPropagation();
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
    var resizeWsId = resizeHandle.dataset.wsId!;
    var resizeWs = graph.workspaces.find(function (w) {
      return w.id === resizeWsId;
    });
    if (resizeWs?.locked) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    isWsResizing = true;
    wsResizeId = resizeWsId;
    wsResizeDir = resizeHandle.dataset.dir!;
    wsResizeStartX = e.clientX;
    wsResizeStartY = e.clientY;
    var ws = graph.workspaces.find(function (w) {
      return w.id === wsResizeId;
    });
    if (ws) {
      wsResizeStartW = ws.size.width;
      wsResizeStartH = ws.size.height;
    }
    e.preventDefault();
    e.stopPropagation();
    return;
  }

  var card = (e.target as HTMLElement).closest('.agent-card') as HTMLElement | null;
  if (card && e.button === 0) {
    /* Don't start drag if clicking inputs/buttons inside setup cards */
    if (
      (e.target as HTMLElement).closest('input') ||
      (e.target as HTMLElement).closest('button') ||
      (e.target as HTMLElement).closest('label')
    )
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

    var dragWs = graph.workspaces.find(function (w) {
      return w.id === wsId;
    });
    if (dragWs?.locked) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
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
  var fromW = fromCard ? fromCard.offsetWidth : CARD_FALLBACK_W;
  var fromH = fromCard ? fromCard.offsetHeight : CARD_FALLBACK_H;
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
  var port = target
    ? ((target as HTMLElement).closest('.port[data-port="input"]') as HTMLElement | null)
    : null;
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

(document.getElementById('btn-activity-feed') as HTMLButtonElement).addEventListener(
  'click',
  function () {
    if (feedMode && convPanel.classList.contains('open')) {
      closeConversationPanel();
    } else {
      openActivityFeed();
    }
  },
);

(document.getElementById('btn-zoom-in') as HTMLButtonElement).addEventListener(
  'click',
  function () {
    setZoom(Math.min(3, vpZoom + 0.25));
  },
);

(document.getElementById('btn-zoom-out') as HTMLButtonElement).addEventListener(
  'click',
  function () {
    setZoom(Math.max(0.25, vpZoom - 0.25));
  },
);

(document.getElementById('btn-zoom-reset') as HTMLButtonElement).addEventListener(
  'click',
  function () {
    vpX = 0;
    vpY = 0;
    setZoom(1);
  },
);

function setZoom(z: number) {
  var cx = window.innerWidth / 2;
  var cy = window.innerHeight / 2;
  vpX = cx - (cx - vpX) * (z / vpZoom);
  vpY = cy - (cy - vpY) * (z / vpZoom);
  vpZoom = z;
  applyTransform();
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
  { id: 'teams', name: 'Teams', hint: 'Bot ID + Secret' },
  { id: 'messenger', name: 'Messenger', hint: 'Page Token + Page ID' },
  { id: 'line', name: 'LINE', hint: 'Channel Token + Secret' },
  { id: 'google-chat', name: 'Google Chat', hint: 'Service Account Key' },
  { id: 'twilio', name: 'Twilio SMS', hint: 'Account SID + Auth Token' },
  { id: 'matrix', name: 'Matrix', hint: 'Homeserver + Token' },
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
var isDockCollapsed = true;
cfDock.classList.add('collapsed');
dockToggle.classList.add('collapsed');
canvasToolbar.classList.add('dock-hidden');
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
  var edge = graph.edges.find(function (e) {
    return e.id === edgeId;
  });
  if (!edge) return null;
  var geo = computeEdgeGeometry(edge.from, edge.to);
  if (!geo) return null;
  return { x: geo.midX, y: geo.midY };
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

edgeSvg.addEventListener('click', function (e) {
  var hit = (e.target as HTMLElement).closest('.edge-hit') as HTMLElement | null;
  if (!hit) return;
  var edgeId = hit.dataset.edgeId;
  if (!edgeId) return;
  var edge = graph.edges.find(function (ed) {
    return ed.id === edgeId;
  });
  if (!edge) return;
  openConversationPanel(edge.from, edge.to);
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
      id: 'tmp_' + generateId(),
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
  var node = graph.nodes.find(function (n) {
    return n.id === nodeId;
  });
  if (!node) return;

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
        node!._editing = true;
        renderNodes();
      });
    }
    e.stopPropagation();
    return;
  }

  if (action === 'close-edit') {
    flipCard(card, function () {
      node!._editing = false;
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
  } else if (platform === 'teams') {
    credentials = {
      appId: (formData.appId || '').trim(),
      appSecret: (formData.appSecret || '').trim(),
      tenantId: (formData.tenantId || '').trim(),
      nodeId: node.id,
    };
  } else if (platform === 'messenger') {
    credentials = {
      pageAccessToken: (formData.pageAccessToken || '').trim(),
      pageId: (formData.pageId || '').trim(),
      nodeId: node.id,
    };
  } else if (platform === 'line') {
    credentials = {
      channelAccessToken: (formData.channelAccessToken || '').trim(),
      channelSecret: (formData.channelSecret || '').trim(),
      nodeId: node.id,
    };
  } else if (platform === 'google-chat') {
    credentials = {
      serviceAccountKey: (formData.serviceAccountKey || '').trim(),
      spaceId: (formData.spaceId || '').trim(),
      nodeId: node.id,
    };
  } else if (platform === 'twilio') {
    credentials = {
      accountSid: (formData.accountSid || '').trim(),
      authToken: (formData.authToken || '').trim(),
      phoneNumber: (formData.phoneNumber || '').trim(),
      nodeId: node.id,
    };
  } else if (platform === 'matrix') {
    credentials = {
      homeserverUrl: (formData.homeserverUrl || '').trim(),
      accessToken: (formData.accessToken || '').trim(),
      nodeId: node.id,
    };
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
      /* Replace temp ID with deterministic ID from backend */
      if (result.nodeId && result.nodeId !== node.id) {
        var duplicate = graph.nodes.find(function (n) {
          return n.id === result.nodeId && n.id !== node.id;
        });
        if (duplicate) {
          node.status = 'error';
          node._statusMsg = 'This bot is already connected on another card';
          node._statusType = 'error';
          renderNodes();
          return;
        }
        replaceNodeId(node.id, result.nodeId);
      }

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
        node.credentials = 'channel_token_' + node.id;
        node.meta = { botUserId: result.botUserId || '', teamId: result.teamId || '' };
      } else if (platform === 'whatsapp') {
        node.label = result.displayName || 'WhatsApp';
        node.credentials = 'channel_token_' + node.id;
        node.meta = { phoneNumberId: credentials.phoneNumberId as string };
      } else if (platform === 'discord') {
        node.label = result.botUsername || 'Discord Bot';
        node.photo = result.photo || null;
        node.credentials = 'channel_token_' + node.id;
        node.meta = { botId: result.botId || '' };
      } else if (platform === 'teams') {
        node.label = result.displayName || 'Teams Bot';
        node.credentials = 'channel_token_' + node.id;
        node.meta = { appId: credentials.appId as string, tenantId: credentials.tenantId as string };
      } else if (platform === 'messenger') {
        node.label = result.displayName || 'Messenger';
        node.credentials = 'channel_token_' + node.id;
        node.meta = { pageId: credentials.pageId as string };
      } else if (platform === 'line') {
        node.label = result.displayName || 'LINE Bot';
        node.credentials = 'channel_token_' + node.id;
        node.meta = {};
      } else if (platform === 'google-chat') {
        node.label = result.displayName || 'Google Chat';
        node.credentials = 'channel_token_' + node.id;
        node.meta = { spaceId: credentials.spaceId as string };
      } else if (platform === 'twilio') {
        node.label = result.displayName || credentials.phoneNumber as string || 'Twilio SMS';
        node.credentials = 'channel_token_' + node.id;
        node.meta = { phoneNumber: credentials.phoneNumber as string };
      } else if (platform === 'matrix') {
        node.label = result.displayName || 'Matrix Bot';
        node.credentials = 'channel_token_' + node.id;
        node.meta = { homeserver: credentials.homeserverUrl as string };
      } else if (platform === 'gmail') {
        node.label = result.email || result.displayName || 'Gmail';
        node.photo = result.photo || null;
        node.credentials = 'gmail_oauth';
        node.meta = { email: result.email || '' };
      } else if (platform === 'email') {
        node.label = result.displayName || 'Email';
        node.credentials = 'channel_token_' + node.id;
        node.meta = {
          username: credentials.username as string,
          imapHost: credentials.imapHost as string,
        };
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
var savedHideTimeout: ReturnType<typeof setTimeout> | null = null;

function showSavedIndicator() {
  var footer = document.getElementById('panel-footer');
  if (!footer) return;
  var el = footer;
  el.classList.add('visible');
  if (savedHideTimeout) clearTimeout(savedHideTimeout);
  savedHideTimeout = setTimeout(function () {
    el.classList.remove('visible');
  }, 2000);
}

function saveGraph() {
  graph.viewport = { x: vpX, y: vpY, zoom: vpZoom };
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(function () {
    invoke('save_canvas_graph', { graph });
  }, 300);
}

function saveGraphFromPanel() {
  saveGraph();
  showSavedIndicator();
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

function replaceNodeId(oldId: string, newId: string): void {
  var node = graph.nodes.find(function (n) {
    return n.id === oldId;
  });
  if (!node) return;
  node.id = newId;
  if (node.credentials) {
    node.credentials = node.credentials.replace(oldId, newId);
  }
  for (var i = 0; i < graph.edges.length; i++) {
    if (graph.edges[i].from === oldId) graph.edges[i].from = newId;
    if (graph.edges[i].to === oldId) graph.edges[i].to = newId;
  }
  if (selectedNodeId === oldId) selectedNodeId = newId;
  if (detailNodeId === oldId) detailNodeId = newId;
  if (dragNodeId === oldId) dragNodeId = newId;
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

function getBotInfo(node: AgentNode): string {
  var { meta, platform } = node;
  if (platform === 'telegram') {
    return meta.botId ? 'Bot \u00B7 ID ' + meta.botId : 'Bot';
  }
  if (platform === 'slack') {
    return meta.teamId ? 'Team ' + meta.teamId : meta.botUserId ? 'Bot ' + meta.botUserId : '';
  }
  if (platform === 'discord') {
    return meta.botId ? 'Bot \u00B7 ID ' + meta.botId : 'Bot';
  }
  if (platform === 'email') {
    return meta.username && meta.imapHost ? meta.username + '@' + meta.imapHost : meta.username || '';
  }
  if (platform === 'whatsapp') {
    return meta.phoneNumberId ? 'Phone ' + meta.phoneNumberId : '';
  }
  return '';
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

  /* Panel title */
  var panelTitle = agentDetailPanel.querySelector('.panel-title') as HTMLSpanElement;
  panelTitle.textContent = isOwner ? t('canvas.ownerSettings') : t('canvas.agentDetails');
  var photoHtml = isOwner
    ? node.photo
      ? '<img src="' + node.photo + '" alt="" />'
      : '<span class="avatar-initials" style="font-size:12px;">' +
        getInitials(node.label) +
        '</span>'
    : node.photo
      ? '<img src="' + node.photo + '" alt="" />'
      : platformIcons[node.platform] || '';
  var displayName = isOwner ? node.label : node.meta.firstName || node.label.replace(/^@/, '');
  var platformLabel = isOwner ? t('canvas.youOwner') : capitalize(node.platform);
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

  /* Hide agent-only sections for owner, show language for owner */
  var sectionRole = document.getElementById('section-role') as HTMLDivElement;
  var sectionAutonomy = document.getElementById('section-autonomy') as HTMLDivElement;
  var sectionBehavior = document.getElementById('section-behavior') as HTMLDivElement;
  var sectionLanguage = document.getElementById('section-language') as HTMLDivElement;
  sectionRole.style.display = isOwner ? 'none' : '';
  sectionAutonomy.style.display = isOwner ? 'none' : '';
  sectionBehavior.style.display = isOwner ? 'none' : '';
  sectionLanguage.style.display = isOwner ? '' : 'none';
  if (isOwner) {
    responseLangSelect.value = graph.language || 'auto';
  }

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
    instructionsLabel.textContent = t('canvas.commStyle');
    instructionsTextarea.placeholder = t('canvas.commStylePlaceholder');
    instructionsTextarea.classList.add('owner-instructions');
  } else {
    instructionsLabel.textContent = t('canvas.agentPersona');
    instructionsTextarea.placeholder = t('canvas.agentPersonaPlaceholder');
    instructionsTextarea.classList.remove('owner-instructions');
  }
  instructionsTextarea.value = node.instructions || '';

  /* Toggles */
  var behavior = node.behavior || {};
  setToggle('toggle-proactive', behavior.proactive === true);
  setToggle('toggle-owner-response', behavior.ownerResponse !== false);
  setToggle('toggle-peer', behavior.peer === true);

  /* KPIs — hide for owner, fetch for agents */
  var sectionKpis = document.getElementById('section-kpis') as HTMLDivElement;
  var kpiGrid = document.getElementById('kpi-grid') as HTMLDivElement;
  sectionKpis.style.display = isOwner ? 'none' : '';
  kpiGrid.innerHTML = '';
  if (!isOwner) {
    loadAgentKpis(nodeId, kpiGrid);
  }

  /* Integrations — hide for owner */
  populateIntegrationSection(nodeId);

  agentDetailPanel.classList.add('open');
}

function loadAgentKpis(nodeId: string, container: HTMLDivElement) {
  invoke('get_agent_kpis', { nodeId: nodeId })
    .then(function (result: unknown) {
      var kpis = result as {
        messagesHandled: number;
        tasksCompleted: number;
        avgResponseTimeMs: number;
        costUsd: number;
      };
      var items = [
        { value: String(kpis.messagesHandled), label: 'Messages' },
        { value: String(kpis.tasksCompleted), label: 'Tasks' },
        {
          value:
            kpis.avgResponseTimeMs > 0 ? (kpis.avgResponseTimeMs / 1000).toFixed(1) + 's' : '--',
          label: 'Avg Response',
        },
        { value: kpis.costUsd > 0 ? '$' + kpis.costUsd.toFixed(2) : '--', label: 'Cost' },
      ];
      container.innerHTML = items
        .map(function (item) {
          return (
            '<div class="kpi-item">' +
            '<span class="kpi-value">' +
            item.value +
            '</span>' +
            '<span class="kpi-label">' +
            item.label +
            '</span>' +
            '</div>'
          );
        })
        .join('');
    })
    .catch(function () {
      container.innerHTML =
        '<div class="kpi-item" style="grid-column: span 2; text-align: center">' +
        '<span class="kpi-label">No data yet</span></div>';
    });
}

function closeAgentDetail() {
  agentDetailPanel.classList.remove('open');
  detailNodeId = null;
  var footer = document.getElementById('panel-footer');
  if (footer) footer.classList.remove('visible');
}

(document.getElementById('agent-detail-close') as HTMLButtonElement).addEventListener(
  'click',
  closeAgentDetail,
);

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
    saveGraphFromPanel();
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
    saveGraphFromPanel();
  });
});

/* Instructions textarea */
(document.getElementById('agent-instructions') as HTMLTextAreaElement).addEventListener(
  'input',
  function () {
    if (!detailNodeId) return;
    var node = graph.nodes.find(function (n) {
      return n.id === detailNodeId;
    });
    if (!node) return;
    node.instructions = (this as HTMLTextAreaElement).value;
    if (node.platform === 'owner') {
      graph.globalInstructions = (this as HTMLTextAreaElement).value;
    }
    saveGraphFromPanel();
  },
);

/* Template button */
(document.getElementById('insert-template-btn') as HTMLButtonElement).addEventListener(
  'click',
  function () {
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
    saveGraphFromPanel();
  },
);

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
    saveGraphFromPanel();
  });
}

bindToggle('toggle-proactive', 'proactive');
bindToggle('toggle-owner-response', 'ownerResponse');
bindToggle('toggle-peer', 'peer');

/* Response language select */
responseLangSelect.addEventListener('change', function () {
  graph.language = this.value === 'auto' ? undefined : this.value;
  saveGraphFromPanel();
});

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
  var wsColor = ws.color;
  var isPreset = presetColors.indexOf(wsColor) !== -1;
  document.querySelectorAll('#ws-detail-colors .color-swatch').forEach(function (s) {
    if (s.classList.contains('color-swatch-custom')) return;
    s.classList.toggle('active', (s as HTMLElement).dataset.color === wsColor);
  });
  /* Custom swatch state */
  var customSwatch = document.querySelector(
    '#ws-detail-colors .color-swatch-custom',
  ) as HTMLElement | null;
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

(document.getElementById('workspace-detail-close') as HTMLButtonElement).addEventListener(
  'click',
  closeWorkspaceDetail,
);

/* Workspace name */
(document.getElementById('ws-detail-name') as HTMLInputElement).addEventListener(
  'input',
  function () {
    if (!detailWorkspaceId) return;
    var ws = graph.workspaces.find(function (w) {
      return w.id === detailWorkspaceId;
    });
    if (!ws) return;
    ws.name = (this as HTMLInputElement).value;
    renderWorkspaces();
    saveGraphFromPanel();
  },
);

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
    var customSwatch = document.querySelector(
      '#ws-detail-colors .color-swatch-custom',
    ) as HTMLElement | null;
    if (customSwatch) {
      customSwatch.style.background = '';
      (customSwatch.querySelector('span') as HTMLSpanElement).style.display = '';
      customSwatch.classList.remove('active');
    }
    renderWorkspaces();
    saveGraphFromPanel();
  });
});

(document.getElementById('ws-detail-color-input') as HTMLInputElement).addEventListener(
  'input',
  function () {
    if (!detailWorkspaceId) return;
    var ws = graph.workspaces.find(function (w) {
      return w.id === detailWorkspaceId;
    });
    if (!ws) return;
    ws.color = (this as HTMLInputElement).value;
    document.querySelectorAll('#ws-detail-colors .color-swatch').forEach(function (s) {
      s.classList.remove('active');
    });
    var customSwatch = document.querySelector(
      '#ws-detail-colors .color-swatch-custom',
    ) as HTMLElement | null;
    if (customSwatch) {
      customSwatch.style.background = ws.color;
      (customSwatch.querySelector('span') as HTMLSpanElement).style.display = 'none';
      customSwatch.classList.add('active');
    }
    renderWorkspaces();
    saveGraphFromPanel();
  },
);

/* Workspace purpose */
(document.getElementById('ws-detail-purpose') as HTMLTextAreaElement).addEventListener(
  'input',
  function () {
    if (!detailWorkspaceId) return;
    var ws = graph.workspaces.find(function (w) {
      return w.id === detailWorkspaceId;
    });
    if (!ws) return;
    ws.purpose = (this as HTMLTextAreaElement).value;
    renderWorkspaces();
    saveGraphFromPanel();
  },
);

/* Workspace budget */
(document.getElementById('ws-detail-budget') as HTMLInputElement).addEventListener(
  'input',
  function () {
    if (!detailWorkspaceId) return;
    var ws = graph.workspaces.find(function (w) {
      return w.id === detailWorkspaceId;
    });
    if (!ws) return;
    ws.budget = parseFloat((this as HTMLInputElement).value) || 0;
    saveGraphFromPanel();
  },
);

/* Number stepper buttons (generic) */
document.querySelectorAll('.stepper-btn').forEach(function (btn) {
  btn.addEventListener('click', function () {
    var input = document.getElementById(
      (btn as HTMLElement).dataset.target!,
    ) as HTMLInputElement | null;
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

(document.getElementById('ws-detail-tags') as HTMLDivElement).addEventListener(
  'click',
  function (e) {
    var removeBtn = (e.target as HTMLElement).closest('.tag-remove') as HTMLElement | null;
    if (!removeBtn || !detailWorkspaceId) return;
    var ws = graph.workspaces.find(function (w) {
      return w.id === detailWorkspaceId;
    });
    if (!ws || !ws.topics) return;
    var idx = parseInt(removeBtn.dataset.idx!, 10);
    ws.topics.splice(idx, 1);
    renderWsTags(ws.topics);
    saveGraphFromPanel();
  },
);

(document.getElementById('ws-tag-input') as HTMLInputElement).addEventListener(
  'keydown',
  function (e) {
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
    saveGraphFromPanel();
  },
);

/* ═══════════════════════════════════════════════
   Workspace Creation Dialog
   ═══════════════════════════════════════════════ */

var wsCreateColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#038B9A';

(document.getElementById('btn-add-workspace') as HTMLButtonElement).addEventListener(
  'click',
  function () {
    wsDialogOverlay.classList.add('open');
    (document.getElementById('ws-create-name') as HTMLInputElement).value = '';
    (document.getElementById('ws-create-purpose') as HTMLTextAreaElement).value = '';
    (document.getElementById('ws-create-topics') as HTMLInputElement).value = '';
    (document.getElementById('ws-create-budget') as HTMLInputElement).value = '';
    wsCreateColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#038B9A';
    document.querySelectorAll('#ws-create-colors .color-swatch').forEach(function (s) {
      s.classList.toggle('active', (s as HTMLElement).dataset.color === wsCreateColor);
    });
    /* Reset custom swatch appearance */
    var customSwatch = document.querySelector(
      '#ws-create-colors .color-swatch-custom',
    ) as HTMLElement | null;
    if (customSwatch) {
      customSwatch.style.background = '';
      (customSwatch.querySelector('span') as HTMLSpanElement).style.display = '';
      customSwatch.classList.remove('active');
    }
    (document.getElementById('ws-create-name') as HTMLInputElement).focus();
  },
);

(document.getElementById('ws-create-cancel') as HTMLButtonElement).addEventListener(
  'click',
  function () {
    wsDialogOverlay.classList.remove('open');
  },
);

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
    var customSwatch = document.querySelector(
      '#ws-create-colors .color-swatch-custom',
    ) as HTMLElement | null;
    if (customSwatch) {
      customSwatch.style.background = '';
      (customSwatch.querySelector('span') as HTMLSpanElement).style.display = '';
      customSwatch.classList.remove('active');
    }
  });
});

(document.getElementById('ws-create-color-input') as HTMLInputElement).addEventListener(
  'input',
  function () {
    wsCreateColor = (this as HTMLInputElement).value;
    document.querySelectorAll('#ws-create-colors .color-swatch').forEach(function (s) {
      s.classList.remove('active');
    });
    var customSwatch = document.querySelector(
      '#ws-create-colors .color-swatch-custom',
    ) as HTMLElement | null;
    if (customSwatch) {
      customSwatch.style.background = wsCreateColor;
      (customSwatch.querySelector('span') as HTMLSpanElement).style.display = 'none';
      customSwatch.classList.add('active');
    }
  },
);

(document.getElementById('ws-create-submit') as HTMLButtonElement).addEventListener(
  'click',
  function () {
    var name = (document.getElementById('ws-create-name') as HTMLInputElement).value.trim();
    if (!name) return;
    var purpose = (
      document.getElementById('ws-create-purpose') as HTMLTextAreaElement
    ).value.trim();
    var topicsRaw = (document.getElementById('ws-create-topics') as HTMLInputElement).value.trim();
    var topics = topicsRaw
      ? topicsRaw
          .split(',')
          .map(function (t) {
            return t.trim();
          })
          .filter(Boolean)
      : [];
    var budgetVal =
      parseFloat((document.getElementById('ws-create-budget') as HTMLInputElement).value) || 0;

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
      size: { width: 400, height: 320 },
      checkpoints: [],
      groups: [],
    };
    graph.workspaces.push(ws);
    wsDialogOverlay.classList.remove('open');
    renderAll();
    saveGraph();
  },
);

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

/* -- In-Palette Mode -- */
var isInPalette = new URLSearchParams(window.location.search).has('inPalette');
if (isInPalette) {
  document.documentElement.style.background = 'transparent';
  document.body.classList.add('in-palette');
  (document.getElementById('palette-back') as HTMLButtonElement).addEventListener(
    'click',
    function () {
      invoke('navigate_back');
    },
  );
}

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    /* Close conversation panel first if open */
    if (convPanel.classList.contains('open')) {
      closeConversationPanel();
      return;
    }
    if (isInPalette) {
      var agentPanel = document.getElementById('agent-detail-panel') as HTMLDivElement;
      var wsPanel = document.getElementById('workspace-detail-panel') as HTMLDivElement;
      var wsDialog = document.getElementById('ws-dialog-overlay') as HTMLDivElement;
      if (agentPanel.classList.contains('open')) return;
      if (wsPanel.classList.contains('open')) return;
      if (wsDialog && wsDialog.classList.contains('open')) return;
      e.preventDefault();
      invoke('navigate_back');
    }
  }
});

/* ═══════════════════════════════════════════════
   Orbital Hover Bubbles
   ═══════════════════════════════════════════════ */

function showOrbitalBubbles(nodeId: string) {
  removeOrbitalBubbles();
  hoveredNodeId = nodeId;

  var node = graph.nodes.find(function (n) {
    return n.id === nodeId;
  });
  if (!node || !node.integrations || node.integrations.length === 0) return;

  var instances = graph.instances ?? [];
  var cardEl = world.querySelector('[data-node-id="' + nodeId + '"]') as HTMLElement | null;
  if (!cardEl) return;

  var cardRect = {
    x: node.position.x,
    y: node.position.y,
    w: cardEl.offsetWidth || 120,
    h: cardEl.offsetHeight || 160,
  };

  var bubbleData: Array<{ instanceId: string; integrationId: string; label: string }> = [];
  for (var iid of node.integrations) {
    var inst = instances.find(function (i) {
      return i.id === iid;
    });
    if (inst) {
      bubbleData.push({ instanceId: iid, integrationId: inst.integrationId, label: inst.label });
    }
  }

  if (bubbleData.length === 0) return;

  var gap = 32;
  var offsetX = 16;

  for (var i = 0; i < bubbleData.length; i++) {
    var b = bubbleData[i];
    var def = catalogMap.get(b.integrationId);
    var iconName = def ? def.icon : '';

    var rightSide = bubbleData.length <= 4 || i < Math.ceil(bubbleData.length / 2);
    var sideIndex = rightSide ? i : i - Math.ceil(bubbleData.length / 2);
    var totalOnSide = rightSide
      ? bubbleData.length <= 4
        ? bubbleData.length
        : Math.ceil(bubbleData.length / 2)
      : bubbleData.length - Math.ceil(bubbleData.length / 2);

    var startY = cardRect.y + (cardRect.h - totalOnSide * gap) / 2 + 12;
    var bx: number;
    var by = startY + sideIndex * gap;

    if (rightSide) {
      bx = cardRect.x + cardRect.w + offsetX;
    } else {
      bx = cardRect.x - offsetX - 24;
    }

    var bubble = document.createElement('div');
    bubble.className = 'orbital-bubble';
    bubble.dataset.orbitalNode = nodeId;
    bubble.style.left = bx + 'px';
    bubble.style.top = by + 'px';
    bubble.style.animationDelay = i * 50 + 'ms';

    if (iconName) {
      bubble.innerHTML =
        '<img src="/icons/integrations/' +
        escapeHtml(iconName) +
        '.svg" alt="" onerror="this.style.display=\'none\'" />';
    }

    var tooltip = document.createElement('div');
    tooltip.className = 'orbital-tooltip';
    tooltip.textContent = b.label;
    bubble.appendChild(tooltip);

    world.appendChild(bubble);
  }
}

function removeOrbitalBubbles() {
  var existing = world.querySelectorAll('.orbital-bubble');
  for (var i = 0; i < existing.length; i++) {
    existing[i].remove();
  }
  hoveredNodeId = null;
}

function scheduleOrbitalHide() {
  if (hoverLeaveTimer) clearTimeout(hoverLeaveTimer);
  hoverLeaveTimer = setTimeout(function () {
    hoverLeaveTimer = null;
    removeOrbitalBubbles();
  }, 150);
}

/* Bubble hover — cancel hide when entering a bubble */
world.addEventListener(
  'mouseenter',
  function (e) {
    if ((e.target as HTMLElement).closest('.orbital-bubble')) {
      if (hoverLeaveTimer) {
        clearTimeout(hoverLeaveTimer);
        hoverLeaveTimer = null;
      }
    }
  },
  true,
);
world.addEventListener(
  'mouseleave',
  function (e) {
    if ((e.target as HTMLElement).closest('.orbital-bubble')) {
      scheduleOrbitalHide();
    }
  },
  true,
);

/* ═══════════════════════════════════════════════
   Integration Assignment UI (Detail Panel)
   ═══════════════════════════════════════════════ */

function populateIntegrationSection(nodeId: string) {
  var sectionEl = document.getElementById('section-integrations') as HTMLDivElement;
  var chipsEl = document.getElementById('agent-integration-chips') as HTMLDivElement;
  var addBtn = document.getElementById('add-integration-btn') as HTMLButtonElement;

  var node = graph.nodes.find(function (n) {
    return n.id === nodeId;
  });
  if (!node || node.platform === 'owner') {
    sectionEl.style.display = 'none';
    return;
  }
  sectionEl.style.display = '';

  var instances = graph.instances ?? [];
  var assigned = node.integrations ?? [];

  /* Render chips */
  chipsEl.innerHTML = '';
  for (var aid of assigned) {
    var inst = instances.find(function (i) {
      return i.id === aid;
    });
    if (!inst) continue;
    var def = catalogMap.get(inst.integrationId);
    var iconHtml =
      def && def.icon
        ? '<img src="/icons/integrations/' +
          escapeHtml(def.icon) +
          '.svg" alt="" onerror="this.style.display=\'none\'" />'
        : '';

    var chip = document.createElement('div');
    chip.className = 'integration-chip';
    chip.innerHTML =
      iconHtml +
      '<span>' +
      escapeHtml(inst.label) +
      '</span>' +
      '<button class="integration-chip-remove" data-instance-id="' +
      escapeHtml(inst.id) +
      '"><svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>';
    chipsEl.appendChild(chip);
  }

  /* Remove button clicks */
  chipsEl.querySelectorAll('.integration-chip-remove').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var iid = (btn as HTMLElement).dataset.instanceId!;
      showConfirmDialog('Remove this integration?', function () {
        invoke('integrations_unassign_instance', { nodeId: nodeId, instanceId: iid }).then(
          function () {
            /* Update local graph */
            var n = graph.nodes.find(function (nd) {
              return nd.id === nodeId;
            });
            if (n && n.integrations) {
              n.integrations = n.integrations.filter(function (id) {
                return id !== iid;
              });
            }
            populateIntegrationSection(nodeId);
            showSavedIndicator();
          },
        );
      });
    });
  });

  /* Add button — toggle dropdown */
  var existingDrop = addBtn.parentElement!.querySelector('.integration-dropdown');
  if (existingDrop) existingDrop.remove();

  addBtn.onclick = function () {
    var existing = addBtn.parentElement!.querySelector('.integration-dropdown');
    if (existing) {
      existing.remove();
      return;
    }

    var drop = document.createElement('div');
    drop.className = 'integration-dropdown';

    var unassigned = instances.filter(function (inst) {
      return !assigned.includes(inst.id);
    });

    var listContainer = document.createElement('div');
    listContainer.className = 'integration-dropdown-list';

    function renderDropdownItems(filter: string) {
      listContainer.innerHTML = '';
      var filtered = unassigned.filter(function (inst) {
        return !filter || inst.label.toLowerCase().includes(filter.toLowerCase());
      });
      if (filtered.length === 0) {
        listContainer.innerHTML =
          '<div class="integration-dropdown-empty">' +
          (unassigned.length === 0 ? 'No available instances' : 'No matches') +
          '</div>';
      } else {
        for (var ui of filtered) {
          var udef = catalogMap.get(ui.integrationId);
          var uicon =
            udef && udef.icon
              ? '<img src="/icons/integrations/' +
                escapeHtml(udef.icon) +
                '.svg" alt="" onerror="this.style.display=\'none\'" />'
              : '';
          var item = document.createElement('div');
          item.className = 'integration-dropdown-item';
          item.dataset.instanceId = ui.id;
          item.innerHTML = uicon + '<span>' + escapeHtml(ui.label) + '</span>';
          listContainer.appendChild(item);
        }
      }
    }

    renderDropdownItems('');
    drop.appendChild(listContainer);

    /* Search bar at the bottom */
    var searchWrap = document.createElement('div');
    searchWrap.className = 'integration-dropdown-search';
    searchWrap.innerHTML =
      '<svg class="integration-search-icon" viewBox="0 0 24 24" fill="none">' +
      '<circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.5"/>' +
      '<path d="M16 16l4.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
      '</svg>';
    var searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search...';
    searchInput.className = 'integration-search-input';
    searchWrap.appendChild(searchInput);
    drop.appendChild(searchWrap);

    searchInput.addEventListener('input', function () {
      renderDropdownItems(searchInput.value);
    });

    addBtn.parentElement!.appendChild(drop);
    searchInput.focus();

    listContainer.addEventListener('click', function (ev) {
      var target = (ev.target as HTMLElement).closest(
        '.integration-dropdown-item',
      ) as HTMLElement | null;
      if (!target) return;
      var iid = target.dataset.instanceId!;

      invoke('integrations_assign_instance', { nodeId: nodeId, instanceId: iid }).then(function () {
        var n = graph.nodes.find(function (nd) {
          return nd.id === nodeId;
        });
        if (n) {
          if (!n.integrations) n.integrations = [];
          n.integrations.push(iid);
        }
        drop.remove();
        populateIntegrationSection(nodeId);
        showSavedIndicator();
      });
    });

    /* Close dropdown on outside click */
    setTimeout(function () {
      document.addEventListener('click', function closeDropdown(ev) {
        if (!drop.contains(ev.target as Node) && ev.target !== addBtn) {
          drop.remove();
          document.removeEventListener('click', closeDropdown);
        }
      });
    }, 0);
  };
}

/* Boot */
applyTranslations();
init();
