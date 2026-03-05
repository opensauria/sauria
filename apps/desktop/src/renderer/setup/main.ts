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

/* ── Helpers ─────────────────────────────────── */

function $(id: string): HTMLElement {
  return document.getElementById(id)!;
}

function goTo(stepId: string) {
  document.querySelectorAll('.step').forEach((s) => s.classList.remove('active'));
  $(stepId).classList.add('active');
}

/* ── Step 1: Welcome ─────────────────────────── */

$('btn-get-started').addEventListener('click', () => goTo('step-mode'));

/* ── Step 2: Connection Mode ─────────────────── */

$('mode-cards').addEventListener('click', (e) => {
  const card = (e.target as HTMLElement).closest('.card') as HTMLElement | null;
  if (!card) return;
  document.querySelectorAll('#mode-cards .card').forEach((c) => c.classList.remove('selected'));
  card.classList.add('selected');
  selectedMode = card.dataset.mode!;
  ($('btn-mode-next') as HTMLButtonElement).disabled = false;
});

$('btn-mode-back').addEventListener('click', () => goTo('step-welcome'));

$('btn-mode-next').addEventListener('click', () => {
  if (selectedMode === 'claude_desktop') {
    resetOAuth();
    goTo('step-claude-desktop');
  } else if (selectedMode === 'api_key') {
    goTo('step-provider');
  } else if (selectedMode === 'local') {
    scanLocalProviders();
  }
});

/* ── Step 3a: Claude Desktop (OAuth) ──────────── */

$('btn-oauth-back').addEventListener('click', () => goTo('step-mode'));

$('btn-oauth-start').addEventListener('click', async () => {
  $('oauth-error').textContent = '';
  $('oauth-error').classList.remove('visible');

  const result = await invoke<OAuthStartResult>('start_oauth');
  if (result.started) {
    $('oauth-start').style.display = 'none';
    $('oauth-code').style.display = 'block';
    ($('oauth-code-input') as HTMLInputElement).value = '';
    ($('btn-oauth-submit') as HTMLButtonElement).disabled = true;
    ($('oauth-code-input') as HTMLInputElement).focus();
  } else {
    const errEl = $('oauth-error');
    errEl.textContent = result.error || 'Could not start OAuth flow.';
    errEl.classList.add('visible');
  }
});

$('oauth-code-input').addEventListener('input', () => {
  const code = ($('oauth-code-input') as HTMLInputElement).value.trim();
  ($('btn-oauth-submit') as HTMLButtonElement).disabled = code.length < 4;
  $('oauth-code-error').classList.remove('visible');
});

$('btn-oauth-reset').addEventListener('click', () => resetOAuth());

$('btn-oauth-submit').addEventListener('click', async () => {
  const code = ($('oauth-code-input') as HTMLInputElement).value.trim();
  if (!code) return;

  $('oauth-code').style.display = 'none';
  $('oauth-loading').style.display = 'block';

  const result = await invoke<OAuthCompleteResult>('complete_oauth', { code });
  if (result.success) {
    selectedProvider = 'anthropic';
    goTo('step-configuring');
    await runConfiguration('anthropic', '', 'claude_desktop');
  } else {
    $('oauth-loading').style.display = 'none';
    $('oauth-code').style.display = 'block';
    const errEl = $('oauth-code-error');
    errEl.textContent = result.error || 'Token exchange failed. Please try again.';
    errEl.classList.add('visible');
  }
});

function resetOAuth() {
  $('oauth-start').style.display = 'block';
  $('oauth-code').style.display = 'none';
  $('oauth-loading').style.display = 'none';
}

/* ── Step 3b: Provider Selection ─────────────── */

$('provider-cards').addEventListener('click', (e) => {
  const card = (e.target as HTMLElement).closest('.card') as HTMLElement | null;
  if (!card) return;
  document.querySelectorAll('#provider-cards .card').forEach((c) => c.classList.remove('selected'));
  card.classList.add('selected');
  selectedProvider = card.dataset.provider!;
  ($('btn-provider-next') as HTMLButtonElement).disabled = false;
});

$('btn-provider-back').addEventListener('click', () => goTo('step-mode'));

$('btn-provider-next').addEventListener('click', () => {
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

  $('auth-title').textContent = titles[selectedProvider!] || 'Enter your API key';
  $('auth-hint').innerHTML =
    'Get your key from <a href="#" id="auth-link">' +
    (hints[selectedProvider!] || 'the provider console') +
    '</a>';
  ($('api-key') as HTMLInputElement).placeholder = placeholders[selectedProvider!] || 'sk-...';
  ($('api-key') as HTMLInputElement).value = '';
  $('auth-error').classList.remove('visible');
  ($('btn-auth-next') as HTMLButtonElement).disabled = true;

  /* Re-attach link listener after innerHTML replace */
  $('auth-link').addEventListener('click', (e) => {
    e.preventDefault();
    openProviderConsole();
  });

  goTo('step-auth');
});

function openProviderConsole() {
  const urls: Record<string, string> = {
    anthropic: 'https://console.anthropic.com/settings/keys',
    openai: 'https://platform.openai.com/api-keys',
    google: 'https://aistudio.google.com/apikey',
  };
  const url = urls[selectedProvider!];
  if (url) invoke('open_external', { url });
}

/* ── Step 3c: Local Providers ────────────────── */

function handleLocalCardClick(card: HTMLElement) {
  document.querySelectorAll('#step-local .card').forEach((c) => c.classList.remove('selected'));
  card.classList.add('selected');
  selectedProvider = card.dataset.provider!;
  selectedLocalUrl = card.dataset.url!;
  ($('btn-local-next') as HTMLButtonElement).disabled = false;
}

$('local-manual').addEventListener('click', (e) => {
  const card = (e.target as HTMLElement).closest('.card') as HTMLElement | null;
  if (card) handleLocalCardClick(card);
});

$('local-results').addEventListener('click', (e) => {
  const card = (e.target as HTMLElement).closest('.card') as HTMLElement | null;
  if (card) handleLocalCardClick(card);
});

$('btn-local-back').addEventListener('click', () => goTo('step-mode'));

$('btn-local-next').addEventListener('click', async () => {
  goTo('step-configuring');
  await runConfiguration(selectedProvider!, '', 'local');
});

async function scanLocalProviders() {
  goTo('step-local');
  $('local-scanning').style.display = 'flex';
  $('local-results').style.display = 'none';
  $('local-manual').style.display = 'none';
  ($('btn-local-next') as HTMLButtonElement).disabled = true;
  $('local-subtitle').textContent = 'Scanning your machine for running AI providers...';

  const providers = await invoke<LocalProvider[]>('detect_local_providers');
  const running = providers.filter((p) => p.running);

  $('local-scanning').style.display = 'none';

  if (running.length > 0) {
    $('local-subtitle').textContent =
      'Found ' + running.length + ' running provider' + (running.length > 1 ? 's' : '') + '.';

    const container = $('local-results');
    container.innerHTML = running
      .map(
        (p) =>
          '<div class="card" data-provider="' +
          p.name.toLowerCase().replace(/\s+/g, '-') +
          '" data-url="' +
          p.baseUrl +
          '">' +
          '<div class="card-icon">' +
          p.name[0] +
          '</div>' +
          '<div class="card-info"><h3>' +
          p.name +
          '</h3><span>' +
          p.baseUrl +
          '</span></div>' +
          '<span class="badge badge-success">Running</span>' +
          '</div>',
      )
      .join('');
    container.style.display = 'flex';

    if (running.length === 1) {
      const card = container.querySelector('.card') as HTMLElement;
      handleLocalCardClick(card);
    }
  } else {
    $('local-subtitle').textContent =
      'No running provider detected. Select which one you will use.';
    $('local-manual').style.display = 'flex';
  }
}

/* ── Step 4: API Key ─────────────────────────── */

$('api-key').addEventListener('input', () => {
  const key = ($('api-key') as HTMLInputElement).value.trim();
  ($('btn-auth-next') as HTMLButtonElement).disabled = key.length < 8;
  $('auth-error').classList.remove('visible');
});

$('auth-link').addEventListener('click', (e) => {
  e.preventDefault();
  openProviderConsole();
});

$('btn-auth-back').addEventListener('click', () => goTo('step-provider'));

$('btn-auth-next').addEventListener('click', async () => {
  const apiKey = ($('api-key') as HTMLInputElement).value.trim();
  goTo('step-configuring');
  await runConfiguration(selectedProvider!, apiKey, 'api_key');
});

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
    const el = $(id);
    el.classList.remove('active');
    el.classList.add('done');
    el.querySelector('.spinner, .progress-dot')!.outerHTML =
      '<div class="progress-dot">&#10003;</div>';
    if (nextId) {
      const next = $(nextId);
      next.classList.add('active');
      next.querySelector('.progress-dot')!.outerHTML = '<div class="spinner"></div>';
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  try {
    if (mode === 'api_key' && apiKey) {
      const result = await invoke<ValidationResult>('validate_key', { provider, apiKey });
      if (!result.valid) {
        goTo('step-auth');
        const errEl = $('auth-error');
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

    await new Promise((r) => setTimeout(r, 500));

    const clientList = $('client-list');
    const clients = await invoke<ClientInfo[]>('detect_clients');
    clientList.innerHTML = clients
      .filter((c) => c.detected)
      .map((c) => '<li><span class="check">&#10003;</span> ' + c.name + ' &mdash; configured</li>')
      .join('');

    if (clientList.innerHTML === '') {
      clientList.innerHTML =
        '<li>No AI clients detected. Add Sauria manually in your client settings.</li>';
    }

    goTo('step-done');
  } catch {
    if (mode === 'api_key') {
      goTo('step-auth');
      const errEl = $('auth-error');
      errEl.textContent = 'Something went wrong. Please try again.';
      errEl.classList.add('visible');
    } else {
      goTo('step-mode');
    }
  }
}

/* ── Step 6: Done ────────────────────────────── */

$('btn-done').addEventListener('click', () => handleDone());

function handleDone() {
  if (isInPalette) {
    invoke('navigate_back');
  } else {
    window.close();
  }
}

/* ── In-Palette Mode ────────────────────────── */

const isInPalette = new URLSearchParams(window.location.search).has('inPalette');
if (isInPalette) {
  document.documentElement.style.background = 'transparent';
  document.body.classList.add('in-palette');
  $('palette-back').addEventListener('click', () => invoke('navigate_back'));
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isInPalette) {
    e.preventDefault();
    invoke('navigate_back');
  }
});
