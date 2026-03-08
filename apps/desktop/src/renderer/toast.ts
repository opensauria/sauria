type ToastType = 'error' | 'success' | 'info';

const ICONS: Record<ToastType, string> = {
  error: '\u2716',
  success: '\u2714',
  info: '\u24D8',
};

const AUTO_DISMISS_MS = 4000;
const EXIT_MS = 200;

let container: HTMLDivElement | null = null;

function ensureContainer(): HTMLDivElement {
  if (container) return container;
  container = document.createElement('div');
  container.className = 'toast-container';
  container.setAttribute('role', 'status');
  container.setAttribute('aria-live', 'polite');
  document.body.appendChild(container);
  return container;
}

function dismissToast(el: HTMLDivElement): void {
  el.classList.add('toast-exit');
  setTimeout(() => el.remove(), EXIT_MS);
}

export function showToast(message: string, type: ToastType = 'info', retryFn?: () => void): void {
  const wrap = ensureContainer();

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icon = document.createElement('span');
  icon.className = 'toast-icon';
  icon.textContent = ICONS[type];
  toast.appendChild(icon);

  const msg = document.createElement('span');
  msg.className = 'toast-message';
  msg.textContent = message;
  toast.appendChild(msg);

  if (retryFn) {
    const btn = document.createElement('button');
    btn.className = 'toast-retry';
    btn.textContent = 'Retry';
    btn.addEventListener('click', () => {
      dismissToast(toast);
      retryFn();
    });
    toast.appendChild(btn);
  }

  wrap.appendChild(toast);

  const timer = setTimeout(() => dismissToast(toast), AUTO_DISMISS_MS);
  toast.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).classList.contains('toast-retry')) return;
    clearTimeout(timer);
    dismissToast(toast);
  });
}
