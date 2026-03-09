export const ACRONYMS: Record<string, string> = {
  api: 'API',
  url: 'URL',
  uri: 'URI',
  id: 'ID',
  sid: 'SID',
  imap: 'IMAP',
  smtp: 'SMTP',
  oauth: 'OAuth',
  ssh: 'SSH',
  http: 'HTTP',
  https: 'HTTPS',
  sql: 'SQL',
  crm: 'CRM',
  cdn: 'CDN',
  dns: 'DNS',
  ip: 'IP',
};

export function escapeHtml(s: string): string {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(s));
  return d.innerHTML;
}

export function formatLabel(key: string): string {
  const words = key
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .split(/\s+/);
  return words
    .map((w) => {
      const lower = w.toLowerCase();
      return ACRONYMS[lower] ?? lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}
