import { invoke } from '@tauri-apps/api/core';

interface OAuthStartResult {
  started: boolean;
  error?: string;
}

interface OAuthCompleteResult {
  success: boolean;
  error?: string;
}

interface ValidationResult {
  valid: boolean;
}

interface ClientInfo {
  name: string;
  detected: boolean;
}

interface LocalProvider {
  name: string;
  baseUrl: string;
  running: boolean;
}

let selectedMode: string | null = null;
let selectedProvider: string | null = null;
let selectedLocalUrl = '';

/* ── Navigation ──────────────────────────────── */

function goTo(stepId: string) {
  document.querySelectorAll('.step').forEach((s) => s.classList.remove('active'));
  document.getElementById(stepId)!.classList.add('active');
}

/* ── Step 2: Connection Mode ─────────────────── */

function selectMode(card: HTMLElement) {
  document
    .querySelectorAll('#step-mode .card')
    .forEach((c) => c.classList.remove('selected'));
  card.classList.add('selected');
  selectedMode = card.dataset.mode!;
  (document.getElementById('btn-mode-next') as HTMLButtonElement).disabled = false;
}

function goToModeStep() {
  if (selectedMode === 'claude_desktop') {
    resetOAuth();
    goTo('step-claude-desktop');
  } else if (selectedMode === 'api_key') {
    goTo('step-provider');
  } else if (selectedMode === 'local') {
    scanLocalProviders();
  }
}

/* ── Step 3a: Claude Desktop (OAuth) ──────────── */

async function startOAuthFlow() {
  document.getElementById('oauth-error')!.textContent = '';
  document.getElementById('oauth-error')!.classList.remove('visible');

  const result = await invoke<OAuthStartResult>('start_oauth');
  if (result.started) {
    document.getElementById('oauth-start')!.style.display = 'none';
    document.getElementById('oauth-code')!.style.display = 'block';
    (document.getElementById('oauth-code-input') as HTMLInputElement).value = '';
    (document.getElementById('btn-oauth-submit') as HTMLButtonElement).disabled = true;
    (document.getElementById('oauth-code-input') as HTMLInputElement).focus();
  } else {
    const errEl = document.getElementById('oauth-error')!;
    errEl.textContent = result.error || 'Could not start OAuth flow.';
    errEl.classList.add('visible');
  }
}

function onOAuthCodeInput() {
  const code = (document.getElementById('oauth-code-input') as HTMLInputElement).value.trim();
  (document.getElementById('btn-oauth-submit') as HTMLButtonElement).disabled = code.length < 4;
  document.getElementById('oauth-code-error')!.classList.remove('visible');
}

async function submitOAuthCode() {
  const code = (document.getElementById('oauth-code-input') as HTMLInputElement).value.trim();
  if (!code) return;

  document.getElementById('oauth-code')!.style.display = 'none';
  document.getElementById('oauth-loading')!.style.display = 'block';

  const result = await invoke<OAuthCompleteResult>('complete_oauth', { code });
  if (result.success) {
    selectedProvider = 'anthropic';
    goTo('step-configuring');
    await runConfiguration('anthropic', '', 'claude_desktop');
  } else {
    document.getElementById('oauth-loading')!.style.display = 'none';
    document.getElementById('oauth-code')!.style.display = 'block';
    const errEl = document.getElementById('oauth-code-error')!;
    errEl.textContent = result.error || 'Token exchange failed. Please try again.';
    errEl.classList.add('visible');
  }
}

function resetOAuth() {
  document.getElementById('oauth-start')!.style.display = 'block';
  document.getElementById('oauth-code')!.style.display = 'none';
  document.getElementById('oauth-loading')!.style.display = 'none';
}

/* ── Step 3b: Provider Selection ─────────────── */

function selectProvider(card: HTMLElement) {
  document
    .querySelectorAll('#step-provider .card')
    .forEach((c) => c.classList.remove('selected'));
  card.classList.add('selected');
  selectedProvider = card.dataset.provider!;
  (document.getElementById('btn-provider-next') as HTMLButtonElement).disabled = false;
}

function goToAuth() {
  const titles: Record<string, string> = {
    anthropic: 'Enter your Anthropic API key',
    openai: 'Enter your OpenAI API key',
    google: 'Enter your Google AI API key',
  };

  const hints: Record<string, string> = {
    anthropic: 'console.anthropic.com',
    openai: 'platform.openai.com/api-keys',
    google: 'aistudio.google.com/apikey',
  };

  const placeholders: Record<string, string> = {
    anthropic: 'sk-ant-...',
    openai: 'sk-...',
    google: 'AI...',
  };

  document.getElementById('auth-title')!.textContent =
    titles[selectedProvider!] || 'Enter your API key';
  document.getElementById('auth-hint')!.innerHTML =
    'Get your key from <a href="#" onclick="openProviderConsole()">' +
    (hints[selectedProvider!] || 'the provider console') +
    '</a>';
  (document.getElementById('api-key') as HTMLInputElement).placeholder = placeholders[selectedProvider!] || 'sk-...';
  (document.getElementById('api-key') as HTMLInputElement).value = '';
  document.getElementById('auth-error')!.classList.remove('visible');
  (document.getElementById('btn-auth-next') as HTMLButtonElement).disabled = true;

  goTo('step-auth');
}

function openProviderConsole() {
  const urls: Record<string, string> = {
    anthropic: 'https://console.anthropic.com/settings/keys',
    openai: 'https://platform.openai.com/api-keys',
    google: 'https://aistudio.google.com/apikey',
  };
  const url = urls[selectedProvider!];
  if (url) invoke('open_external', { url });
}

function onKeyInput() {
  const key = (document.getElementById('api-key') as HTMLInputElement).value.trim();
  (document.getElementById('btn-auth-next') as HTMLButtonElement).disabled = key.length < 8;
  document.getElementById('auth-error')!.classList.remove('visible');
}

/* ── Step 3c: Local Providers ────────────────── */

async function scanLocalProviders() {
  goTo('step-local');
  document.getElementById('local-scanning')!.style.display = 'flex';
  document.getElementById('local-results')!.style.display = 'none';
  document.getElementById('local-manual')!.style.display = 'none';
  (document.getElementById('btn-local-next') as HTMLButtonElement).disabled = true;
  document.getElementById('local-subtitle')!.textContent =
    'Scanning your machine for running AI providers...';

  const providers = await invoke<LocalProvider[]>('detect_local_providers');
  const running = providers.filter(function (p) {
    return p.running;
  });

  document.getElementById('local-scanning')!.style.display = 'none';

  if (running.length > 0) {
    document.getElementById('local-subtitle')!.textContent =
      'Found ' + running.length + ' running provider' + (running.length > 1 ? 's' : '') + '.';

    const container = document.getElementById('local-results')!;
    container.innerHTML = running
      .map(function (p) {
        const key = p.name.toLowerCase().replace(/\s+/g, '-');
        return (
          '<div class="card" data-provider="' +
          key +
          '" data-url="' +
          p.baseUrl +
          '" onclick="selectLocalProvider(this)">' +
          '<div class="card-icon">' +
          p.name[0] +
          '</div>' +
          '<div class="card-info"><h3>' +
          p.name +
          '</h3><span>' +
          p.baseUrl +
          '</span></div>' +
          '<span class="badge badge-success">Running</span>' +
          '</div>'
        );
      })
      .join('');
    container.style.display = 'flex';

    if (running.length === 1) {
      const card = container.querySelector('.card') as HTMLElement;
      card.classList.add('selected');
      selectedProvider = card.dataset.provider!;
      selectedLocalUrl = card.dataset.url!;
      (document.getElementById('btn-local-next') as HTMLButtonElement).disabled = false;
    }
  } else {
    document.getElementById('local-subtitle')!.textContent =
      'No running provider detected. Select which one you will use.';
    document.getElementById('local-manual')!.style.display = 'flex';
  }
}

function selectLocalProvider(card: HTMLElement) {
  document.querySelectorAll('#step-local .card').forEach(function (c) {
    c.classList.remove('selected');
  });
  card.classList.add('selected');
  selectedProvider = card.dataset.provider!;
  selectedLocalUrl = card.dataset.url!;
  (document.getElementById('btn-local-next') as HTMLButtonElement).disabled = false;
}

async function configureLocal() {
  goTo('step-configuring');
  await runConfiguration(selectedProvider!, '', 'local');
}

/* ── Step 4: API Key ─────────────────────────── */

async function validateAndConfigure() {
  const apiKey = (document.getElementById('api-key') as HTMLInputElement).value.trim();
  goTo('step-configuring');
  await runConfiguration(selectedProvider!, apiKey, 'api_key');
}

/* ── Step 5: Configuration ───────────────────── */

async function runConfiguration(provider: string, apiKey: string, mode: string) {
  const verifyLabel = document.querySelector('#p-verify span')!;
  if (mode === 'claude_desktop') {
    verifyLabel.textContent = 'Account connected';
  } else if (mode === 'local') {
    verifyLabel.textContent = 'Provider detected';
  } else {
    verifyLabel.textContent = 'Validating credentials';
  }

  const storeLabel = document.querySelector('#p-store span')!;
  if (mode === 'local') {
    storeLabel.textContent = 'Saving provider settings';
  } else if (mode === 'claude_desktop') {
    storeLabel.textContent = 'Securing tokens';
  } else {
    storeLabel.textContent = 'Encrypting credentials';
  }

  async function completeStep(id: string, nextId: string | null) {
    const el = document.getElementById(id)!;
    el.classList.remove('active');
    el.classList.add('done');
    el.querySelector('.spinner, .progress-dot')!.outerHTML =
      '<div class="progress-dot">&#10003;</div>';
    if (nextId) {
      const next = document.getElementById(nextId)!;
      next.classList.add('active');
      next.querySelector('.progress-dot')!.outerHTML = '<div class="spinner"></div>';
    }
    await new Promise(function (r) {
      setTimeout(r, 400);
    });
  }

  try {
    if (mode === 'api_key' && apiKey) {
      const result = await invoke<ValidationResult>('validate_key', { provider, apiKey });
      if (!result.valid) {
        goTo('step-auth');
        const errEl = document.getElementById('auth-error')!;
        errEl.textContent = 'Invalid API key. Please check and try again.';
        errEl.classList.add('visible');
        return;
      }
    }
    await completeStep('p-verify', 'p-store');
    await completeStep('p-store', 'p-config');

    await invoke('configure', {
      opts: {
        mode,
        provider,
        apiKey,
        localBaseUrl: selectedLocalUrl,
      },
    });

    await completeStep('p-config', 'p-clients');
    await completeStep('p-clients', 'p-finish');
    await completeStep('p-finish', null);

    await new Promise(function (r) {
      setTimeout(r, 500);
    });

    const clientList = document.getElementById('client-list')!;
    const clients = await invoke<ClientInfo[]>('detect_clients');
    clientList.innerHTML = clients
      .filter(function (c) {
        return c.detected;
      })
      .map(function (c) {
        return (
          '<li><span class="check">&#10003;</span> ' + c.name + ' &mdash; configured</li>'
        );
      })
      .join('');

    if (clientList.innerHTML === '') {
      clientList.innerHTML =
        '<li>No AI clients detected. Add OpenSauria manually in your client settings.</li>';
    }

    goTo('step-done');
  } catch {
    if (mode === 'api_key') {
      goTo('step-auth');
      const errEl2 = document.getElementById('auth-error')!;
      errEl2.textContent = 'Something went wrong. Please try again.';
      errEl2.classList.add('visible');
    } else {
      goTo('step-mode');
    }
  }
}

/* ── In-Palette Mode ────────────────────────── */
const isInPalette = new URLSearchParams(window.location.search).has('inPalette');
if (isInPalette) {
  document.documentElement.style.background = 'transparent';
  document.body.classList.add('in-palette');
  document.getElementById('palette-back')!.addEventListener('click', function () {
    invoke('navigate_back');
  });
}

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && isInPalette) {
    e.preventDefault();
    invoke('navigate_back');
  }
});

function handleDone() {
  if (isInPalette) {
    invoke('navigate_back');
  } else {
    window.close();
  }
}

/* Expose to inline onclick handlers in HTML */
Object.assign(window, {
  goTo,
  selectMode,
  goToModeStep,
  startOAuthFlow,
  onOAuthCodeInput,
  submitOAuthCode,
  resetOAuth,
  selectProvider,
  goToAuth,
  openProviderConsole,
  onKeyInput,
  selectLocalProvider,
  configureLocal,
  validateAndConfigure,
  handleDone,
});
