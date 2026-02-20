import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

interface StatusResult {
  connected: boolean;
  provider?: string;
  authMethod?: string;
}

interface TelegramBot {
  nodeId?: string;
  label?: string;
  connected: boolean;
  photo?: string;
  profile?: { username: string; photo?: string };
}

interface TelegramStatus {
  bots: TelegramBot[];
}

interface ConnectResult {
  success: boolean;
  botUsername?: string;
  error?: string;
}

interface Command {
  id: string;
  label: string;
  hint: string;
}

const icons: Record<string, string> = {
  canvas:
    '<svg viewBox="0 0 24 24" fill="none"><rect width="8" height="8" x="3" y="3" rx="2" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/><path d="M7 11v4a2 2 0 0 0 2 2h4" stroke="rgba(255,255,255,0.35)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><rect width="8" height="8" x="13" y="13" rx="2" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/></svg>',
  status:
    '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/><path d="M12 7v5l3 3" stroke="rgba(255,255,255,0.7)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  telegram:
    '<svg viewBox="0 0 24 24"><path d="M9.04 15.6l-.39 5.36c.56 0 .8-.24 1.1-.52l2.63-2.5 5.45 3.97c1 .55 1.7.26 1.97-.92l3.57-16.67C23.71 2.7 22.85 2.14 21.9 2.5L1.4 10.17c-1.63.64-1.6 1.56-.28 1.98l5.1 1.58L19.5 5.8c.6-.38 1.15-.17.7.2L9.04 15.6z" fill="#27A7E7"/></svg>',
  setup:
    '<svg viewBox="0 0 24 24" fill="none"><path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" stroke="rgba(255,255,255,0.5)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 2v4" stroke="rgba(255,255,255,0.35)" stroke-width="1.5" stroke-linecap="round"/><path d="M22 4h-4" stroke="rgba(255,255,255,0.35)" stroke-width="1.5" stroke-linecap="round"/><circle cx="4" cy="20" r="2" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/></svg>',
  audit:
    '<svg viewBox="0 0 24 24" fill="none"><rect x="5" y="2" width="14" height="20" rx="2" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/><path d="M9 7h6M9 11h6M9 15h4" stroke="rgba(255,255,255,0.5)" stroke-width="1.5" stroke-linecap="round"/></svg>',
  doctor:
    '<svg viewBox="0 0 24 24" fill="none"><path d="M12 20s-7-5.75-7-10.25A4.5 4.5 0 0112 6a4.5 4.5 0 017 3.75C19 14.25 12 20 12 20z" stroke="rgba(255,255,255,0.5)" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 10v4M10 12h4" stroke="rgba(255,255,255,0.7)" stroke-width="1.5" stroke-linecap="round"/></svg>',
  docs: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 19.5A2.5 2.5 0 016.5 17H20" stroke="rgba(255,255,255,0.5)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" stroke="rgba(255,255,255,0.5)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  quit: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3v9" stroke="rgba(255,255,255,0.5)" stroke-width="1.5" stroke-linecap="round"/><path d="M18.36 6.64A9 9 0 0112 21a9 9 0 01-6.36-2.36A9 9 0 015.64 6.64" stroke="rgba(255,255,255,0.5)" stroke-width="1.5" stroke-linecap="round"/></svg>',
  brain:
    '<svg viewBox="0 0 24 24" fill="none"><path d="M12 18V5" stroke="rgba(255,255,255,0.35)" stroke-width="1.5" stroke-linecap="round"/><path d="M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4" stroke="rgba(255,255,255,0.35)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5" stroke="rgba(255,255,255,0.5)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M17.997 5.125a4 4 0 0 1 2.526 5.77" stroke="rgba(255,255,255,0.5)" stroke-width="1.5" stroke-linecap="round"/><path d="M18 18a4 4 0 0 0 2-7.464" stroke="rgba(255,255,255,0.5)" stroke-width="1.5" stroke-linecap="round"/><path d="M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517" stroke="rgba(255,255,255,0.5)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 18a4 4 0 0 1-2-7.464" stroke="rgba(255,255,255,0.5)" stroke-width="1.5" stroke-linecap="round"/><path d="M6.003 5.125a4 4 0 0 0-2.526 5.77" stroke="rgba(255,255,255,0.5)" stroke-width="1.5" stroke-linecap="round"/></svg>',
};

const mainCommands: Command[] = [
  { id: 'canvas', label: 'Agent Canvas', hint: '' },
  { id: 'brain', label: 'Knowledge', hint: 'knowledge graph' },
  { id: 'telegram', label: 'Telegram', hint: 'channel' },
  { id: 'setup', label: 'AI Provider', hint: 'config' },
  { id: 'quit', label: 'Quit', hint: '' },
];

const devCommands: Command[] = [
  { id: 'status', label: 'Daemon Status', hint: '' },
  { id: 'doctor', label: 'Health Check', hint: '' },
  { id: 'audit', label: 'Audit Log', hint: '' },
  { id: 'docs', label: 'Documentation', hint: '' },
];

let commands = mainCommands;
let devMode = false;
let inSubView = false;
let selectedIndex = 0;
let filtered = commands.slice();

const searchEl = document.getElementById('search') as HTMLInputElement;
const listEl = document.getElementById('command-list')!;
const emptyEl = document.getElementById('empty-state')!;
const resultEl = document.getElementById('result-panel')!;
const mascotEl = document.getElementById('mascot')!;
const backBtn = document.getElementById('back-btn')!;
const tgForm = document.getElementById('telegram-form')!;
const tgBotList = document.getElementById('tg-bot-list')!;
const tgAddBtn = document.getElementById('tg-add-btn')!;
const tgFormFields = document.getElementById('tg-form-fields')!;
const tgToken = document.getElementById('tg-token') as HTMLInputElement;
const tgUserId = document.getElementById('tg-userid') as HTMLInputElement;
const tgSubmit = document.getElementById('tg-submit') as HTMLButtonElement;
const tgCancel = document.getElementById('tg-cancel')!;
const tgStatus = document.getElementById('tg-status')!;
const settingsBtn = document.getElementById('settings-btn')!;

function toggleDevMode() {
  devMode = !devMode;
  commands = devMode ? devCommands : mainCommands;
  selectedIndex = 0;
  searchEl.value = '';
  settingsBtn.classList.toggle('active', devMode);
  searchEl.placeholder = devMode ? 'Developer tools...' : 'Search commands...';
  render();
  searchEl.focus();
}

function render() {
  const query = searchEl.value.toLowerCase();
  filtered = commands.filter(function (c) {
    return (
      c.label.toLowerCase().includes(query) ||
      c.hint.toLowerCase().includes(query) ||
      c.id.includes(query)
    );
  });
  if (selectedIndex >= filtered.length) selectedIndex = Math.max(0, filtered.length - 1);
  if (filtered.length === 0) {
    listEl.style.display = 'none';
    emptyEl.style.display = 'block';
    return;
  }
  listEl.style.display = 'block';
  emptyEl.style.display = 'none';
  const header = devMode
    ? '<div class="section-header"><span>Developer</span><span class="section-line"></span></div>'
    : '';
  listEl.innerHTML =
    header +
    filtered
      .map(function (c, i) {
        const cls = 'command-row' + (i === selectedIndex ? ' selected' : '');
        return (
          '<div class="' +
          cls +
          '" data-index="' +
          i +
          '">' +
          '<div class="icon">' +
          icons[c.id] +
          '</div>' +
          '<div class="label">' +
          c.label +
          '</div>' +
          (c.hint ? '<div class="hint">' + c.hint + '</div>' : '') +
          '</div>'
        );
      })
      .join('');
}

function enterSubView() {
  inSubView = true;
  mascotEl.style.display = 'none';
  backBtn.classList.remove('hidden');
}

function exitSubView() {
  inSubView = false;
  mascotEl.style.display = '';
  backBtn.classList.add('hidden');
  tgForm.className = 'telegram-form';
  resultEl.className = 'result-panel';
  if (devMode) {
    devMode = false;
    commands = mainCommands;
    settingsBtn.classList.remove('active');
    searchEl.placeholder = 'Search commands...';
  }
  render();
  searchEl.focus();
}

function executeSelected() {
  if (filtered.length === 0) return;
  const cmd = filtered[selectedIndex];
  invoke('execute_command', { id: cmd.id });
}

const tgIconSvg =
  '<svg viewBox="0 0 24 24"><path d="M9.04 15.6l-.39 5.36c.56 0 .8-.24 1.1-.52l2.63-2.5 5.45 3.97c1 .55 1.7.26 1.97-.92l3.57-16.67C23.71 2.7 22.85 2.14 21.9 2.5L1.4 10.17c-1.63.64-1.6 1.56-.28 1.98l5.1 1.58L19.5 5.8c.6-.38 1.15-.17.7.2L9.04 15.6z" fill="#27A7E7"/></svg>';
const trashSvg =
  '<svg viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function renderBotCard(bot: TelegramBot) {
  const photo = bot.photo || (bot.profile && bot.profile.photo);
  const photoHtml = photo ? '<img src="' + photo + '" alt="" />' : tgIconSvg;
  const name = bot.label || (bot.profile ? '@' + bot.profile.username : 'Telegram Bot');
  const isOnline = bot.connected;
  const dotClass = isOnline ? 'bot-status-dot' : 'bot-status-dot offline';
  const statusText = isOnline ? 'Online' : 'Offline';
  const nodeId = bot.nodeId || '';

  return (
    '<div class="bot-card" data-node-id="' +
    nodeId +
    '">' +
    '<div class="bot-avatar">' +
    photoHtml +
    '</div>' +
    '<div class="bot-info">' +
    '<div class="bot-name">' +
    name +
    '</div>' +
    '<div class="bot-meta">' +
    '<span class="' +
    dotClass +
    '"></span>' +
    statusText +
    '</div>' +
    '</div>' +
    '<div class="bot-actions">' +
    '<button class="bot-action-btn danger tg-disconnect-btn" data-node-id="' +
    nodeId +
    '" title="Disconnect">' +
    trashSvg +
    '</button>' +
    '</div>' +
    '</div>'
  );
}

async function showTelegramForm() {
  listEl.style.display = 'none';
  emptyEl.style.display = 'none';
  resultEl.className = 'result-panel';
  tgForm.className = 'telegram-form visible';
  enterSubView();

  const status = await invoke<TelegramStatus>('get_telegram_status');
  const bots = status.bots || [];
  const connectedBots = bots.filter(function (b) {
    return b.connected;
  });

  if (connectedBots.length > 0) {
    tgBotList.innerHTML = connectedBots.map(renderBotCard).join('');
    tgFormFields.className = 'tg-connect-form';
    tgAddBtn.style.display = '';

    const discBtns = tgBotList.querySelectorAll('.tg-disconnect-btn');
    discBtns.forEach(function (btn) {
      btn.addEventListener('mousedown', async function (e) {
        e.preventDefault();
        const nid = btn.getAttribute('data-node-id');
        if (nid) {
          await invoke('disconnect_channel', { platform: 'telegram', nodeId: nid });
          showTelegramForm();
        }
      });
    });
  } else {
    tgBotList.innerHTML = '';
    tgAddBtn.style.display = 'none';
    tgFormFields.className = 'tg-connect-form visible';
    tgToken.value = '';
    tgUserId.value = '';
    tgStatus.className = 'form-status';
    tgSubmit.disabled = true;
    tgUserId.focus();
  }
}

function hideTelegramForm() {
  exitSubView();
}

function showConnectForm() {
  tgFormFields.className = 'tg-connect-form visible';
  tgAddBtn.style.display = 'none';
  tgToken.value = '';
  tgUserId.value = '';
  tgStatus.className = 'form-status';
  tgSubmit.disabled = true;
  tgUserId.focus();
}

function validateTgForm() {
  const hasToken = tgToken.value.trim().length > 0;
  const hasId = tgUserId.value.trim().length > 0;
  tgSubmit.disabled = !(hasToken && hasId);
}

tgToken.addEventListener('input', validateTgForm);
tgToken.addEventListener('keyup', validateTgForm);
tgUserId.addEventListener('input', validateTgForm);
tgUserId.addEventListener('keyup', validateTgForm);
tgAddBtn.addEventListener('mousedown', function (e) {
  e.preventDefault();
  showConnectForm();
});
tgCancel.addEventListener('mousedown', function (e) {
  e.preventDefault();
  hideTelegramForm();
});

tgSubmit.addEventListener('mousedown', async function (e) {
  e.preventDefault();
  if (tgSubmit.disabled) return;

  const rawId = tgUserId.value.trim().replace(/\D/g, '');
  const parsedId = parseInt(rawId, 10);
  if (!rawId || isNaN(parsedId) || parsedId <= 0) {
    tgStatus.textContent = 'User ID must be a number (get it from @userinfobot)';
    tgStatus.className = 'form-status visible error';
    tgUserId.focus();
    return;
  }

  tgSubmit.disabled = true;
  tgStatus.textContent = 'Connecting...';
  tgStatus.className = 'form-status visible';
  try {
    const result = await invoke<ConnectResult>('connect_channel', {
      platform: 'telegram',
      credentials: {
        token: tgToken.value.trim(),
        userId: parsedId,
      },
    });
    if (result.success) {
      tgStatus.textContent = 'Connected to @' + result.botUsername;
      tgStatus.className = 'form-status visible success';
      setTimeout(function () {
        showTelegramForm();
      }, 1000);
    } else {
      tgStatus.textContent = result.error || 'Connection failed';
      tgStatus.className = 'form-status visible error';
      tgSubmit.disabled = false;
    }
  } catch {
    tgStatus.textContent = 'Connection failed';
    tgStatus.className = 'form-status visible error';
    tgSubmit.disabled = false;
  }
});

tgForm.addEventListener('keydown', function (e) {
  e.stopPropagation();
  if (e.key === 'Escape') {
    e.preventDefault();
    hideTelegramForm();
  } else if (e.key === 'Enter' && !tgSubmit.disabled) {
    e.preventDefault();
    tgSubmit.dispatchEvent(new MouseEvent('mousedown'));
  }
});

backBtn.addEventListener('mousedown', function (e) {
  e.preventDefault();
  exitSubView();
});

settingsBtn.addEventListener('mousedown', function (e) {
  e.preventDefault();
  if (inSubView) exitSubView();
  toggleDevMode();
});

searchEl.addEventListener('input', function () {
  selectedIndex = 0;
  if (inSubView) exitSubView();
  if (devMode) {
    devMode = false;
    commands = mainCommands;
    settingsBtn.classList.remove('active');
    searchEl.placeholder = 'Search commands...';
  }
  render();
});

document.addEventListener('keydown', function (e) {
  if (tgForm.classList.contains('visible')) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (filtered.length > 0) {
      selectedIndex = (selectedIndex + 1) % filtered.length;
      render();
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (filtered.length > 0) {
      selectedIndex = (selectedIndex - 1 + filtered.length) % filtered.length;
      render();
    }
  } else if (e.key === 'Enter') {
    e.preventDefault();
    executeSelected();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    if (inSubView) {
      exitSubView();
    } else if (devMode) {
      devMode = false;
      commands = mainCommands;
      selectedIndex = 0;
      settingsBtn.classList.remove('active');
      searchEl.placeholder = 'Search commands...';
      render();
    } else if (searchEl.value !== '') {
      searchEl.value = '';
      selectedIndex = 0;
      render();
    } else {
      invoke('hide_palette');
    }
  }
});

listEl.addEventListener('mousedown', function (e) {
  const row = (e.target as HTMLElement).closest('.command-row') as HTMLElement | null;
  if (!row) return;
  e.preventDefault();
  selectedIndex = parseInt(row.dataset.index!, 10);
  render();
  executeSelected();
});

listEl.addEventListener('mousemove', function (e) {
  const row = (e.target as HTMLElement).closest('.command-row') as HTMLElement | null;
  if (!row) return;
  const idx = parseInt(row.dataset.index!, 10);
  if (idx !== selectedIndex) {
    selectedIndex = idx;
    render();
  }
});

listen<string>('command-result', function (event) {
  resultEl.className = 'result-panel visible';
  resultEl.textContent = event.payload;
  enterSubView();
});

listen('show-telegram-form', function () {
  showTelegramForm();
});

listen('palette-show', function () {
  refreshProviderStatus();
  // Delay focus to ensure window has OS focus after show+set_focus
  setTimeout(function () {
    if (tgForm.classList.contains('visible')) {
      const firstEmpty = !tgUserId.value.trim()
        ? tgUserId
        : !tgToken.value.trim()
          ? tgToken
          : tgUserId;
      firstEmpty.focus();
    } else {
      searchEl.focus();
    }
  }, 50);
});

listen('palette-reset', function () {
  searchEl.value = '';
  selectedIndex = 0;
  devMode = false;
  commands = mainCommands;
  settingsBtn.classList.remove('active');
  searchEl.placeholder = 'Search commands...';
  resultEl.className = 'result-panel';
  tgForm.className = 'telegram-form';
  render();
  searchEl.focus();
});

render();

function refreshProviderStatus() {
  invoke<StatusResult>('get_status').then(function (status) {
    const dot = document.querySelector('#provider-status .pulse-dot')!;
    const label = document.getElementById('provider-label')!;
    if (status.connected && status.provider) {
      dot.className = 'pulse-dot';
      const method = status.authMethod === 'oauth' ? 'subscription' : 'API key';
      label.textContent = status.provider + ' (' + method + ')';
    } else {
      dot.className = 'pulse-dot offline';
      label.textContent = 'No provider';
    }
  });
}

refreshProviderStatus();

invoke<TelegramStatus>('get_telegram_status').then(function (status) {
  const tgCmd = mainCommands.find(function (c) {
    return c.id === 'telegram';
  });
  if (!tgCmd) return;
  const bots = status.bots || [];
  const count = bots.filter(function (b) {
    return b.connected;
  }).length;
  if (count > 0) {
    tgCmd.hint = count === 1 ? 'connected' : count + ' bots';
    if (!devMode) render();
  }
});
