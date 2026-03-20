import { html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { LightDomElement } from '../shared/light-dom-element.js';
import { personalMcpConnect } from '../shared/ipc.js';
import type { PersonalMcpConnectPayload } from '../shared/ipc.js';
import { t } from '../i18n.js';

type Transport = 'stdio' | 'remote';

interface EnvVar {
  readonly key: string;
  readonly value: string;
}

// ─── JSON MCP Server Config ─────────────────────────────────────────

interface McpServerJson {
  readonly type?: string;
  readonly command?: string;
  readonly args?: string[];
  readonly env?: Record<string, string>;
  readonly url?: string;
  readonly headers?: Record<string, string>;
  readonly accessToken?: string;
}

interface ParsedConfig {
  readonly transport: Transport;
  readonly name: string;
  // stdio
  readonly command?: string;
  readonly args?: string[];
  readonly env?: Record<string, string>;
  // remote
  readonly url?: string;
  readonly accessToken?: string;
}

/**
 * Parse any MCP input format:
 * - `npx -y some-mcp-server` (command)
 * - `https://app.example.com/mcp` (URL)
 * - `{"mcpServers": {"name": {...}}}` (standard JSON config)
 * - `{"name": {"command": "npx", ...}}` (bare JSON)
 * - `{"name": {"type": "http", "url": "...", "headers": {...}}}` (HTTP JSON)
 */
function parseInput(input: string): ParsedConfig | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Direct URL
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return {
      transport: 'remote',
      name: deriveNameFromUrl(trimmed),
      url: trimmed,
    };
  }

  // JSON config
  if (trimmed.startsWith('{')) {
    return parseJsonConfig(trimmed);
  }

  // Plain command (npx, uvx, node, etc.)
  const parts = trimmed.split(/\s+/);
  return {
    transport: 'stdio',
    name: deriveNameFromCommand(parts),
    command: parts[0] ?? '',
    args: parts.slice(1),
  };
}

function parseJsonConfig(raw: string): ParsedConfig | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const servers = (parsed.mcpServers ?? parsed) as Record<string, McpServerJson>;
    const [serverName, server] = Object.entries(servers)[0] ?? [];
    if (!serverName || !server || typeof server !== 'object') return null;

    const isRemote =
      server.type === 'http' ||
      server.type === 'sse' ||
      server.type === 'streamable-http' ||
      server.url !== undefined;

    if (isRemote) {
      const url = server.url;
      if (!url) return null;

      // Extract Bearer token from headers
      const authHeader = server.headers?.Authorization ?? server.headers?.authorization;
      const accessToken =
        server.accessToken ??
        (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : authHeader) ??
        undefined;

      return {
        transport: 'remote',
        name: serverName,
        url,
        accessToken,
      };
    }

    // stdio
    if (!server.command) return null;
    return {
      transport: 'stdio',
      name: serverName,
      command: server.command,
      args: [...(server.args ?? [])],
      env: server.env,
    };
  } catch {
    return null;
  }
}

const RUNNER_COMMANDS = new Set(['npx', 'npx.cmd', 'uvx', 'bunx', 'pnpm', 'yarn', 'node']);
const RUNNER_FLAGS = new Set(['-y', '--yes', '-g', '--global', 'dlx', 'exec', 'run']);

function deriveNameFromCommand(parts: string[]): string {
  const pkg = parts.find(
    (p) => !RUNNER_COMMANDS.has(p) && !RUNNER_FLAGS.has(p) && !p.startsWith('-'),
  );
  if (!pkg) return parts[0] ?? '';
  const segments = pkg.split('/');
  return segments[segments.length - 1] ?? pkg;
}

function deriveNameFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

// ─── Component ──────────────────────────────────────────────────────

@customElement('integration-personal-mcp-form')
export class IntegrationPersonalMcpForm extends LightDomElement {
  @state() private commandInput = '';
  @state() private nameInput = '';
  @state() private transport: Transport = 'stdio';
  @state() private envVars: EnvVar[] = [];
  @state() private accessToken = '';
  @state() private submitting = false;
  @state() private statusText = '';
  @state() private statusClass = '';
  @state() private showEnvVars = false;
  @state() private parsedConfig: ParsedConfig | null = null;

  override render() {
    const isStdio = this.transport === 'stdio';
    const hasJsonAccessToken = this.parsedConfig?.accessToken !== undefined;

    return html`
      <div class="ch-connect-section">
        <div class="form-group">
          <label class="form-label">${t('integ.mcpCommand')}</label>
          <textarea
            class="form-input"
            rows="3"
            style="font-family:var(--font-family-mono);font-size:var(--font-size-small);resize:vertical;min-height:40px"
            placeholder=${t('integ.mcpCommandHint')}
            autocomplete="off"
            .value=${this.commandInput}
            @input=${this.handleCommandInput}
          ></textarea>
        </div>

        ${this.commandInput.trim()
          ? html`<div style="margin-bottom:var(--spacing-sm)">
              <span class="badge ${isStdio ? 'badge-accent' : 'badge-success'}"
                >${isStdio ? t('integ.mcpTransportStdio') : t('integ.mcpTransportRemote')}</span
              >
            </div>`
          : nothing}

        <div class="form-group">
          <label class="form-label">${t('integ.mcpName')}</label>
          <input
            class="form-input"
            type="text"
            placeholder="${t('integ.mcpNameHint')}"
            autocomplete="off"
            .value=${this.nameInput}
            @input=${(e: Event) => {
              this.nameInput = (e.target as HTMLInputElement).value;
            }}
          />
        </div>

        ${isStdio
          ? this.renderEnvVarsSection()
          : hasJsonAccessToken
            ? nothing
            : this.renderAccessTokenSection()}
        ${this.statusText
          ? html`<div class="form-status visible ${this.statusClass}">${this.statusText}</div>`
          : nothing}

        <div class="form-actions">
          <button
            class="btn btn-primary"
            ?disabled=${this.submitting || !this.isValid()}
            @click=${this.handleSubmit}
          >
            ${this.submitting ? t('integ.connecting') : t('integ.connect')}
          </button>
        </div>
      </div>
    `;
  }

  private renderEnvVarsSection() {
    return html`
      <div class="form-group">
        <button
          class="btn btn-secondary"
          style="width:auto;padding:var(--spacing-xs) var(--spacing-sm);font-size:var(--font-size-small)"
          @click=${() => {
            this.showEnvVars = !this.showEnvVars;
          }}
        >
          ${t('integ.mcpEnvVars')} ${this.envVars.length > 0 ? ` (${this.envVars.length})` : ''}
        </button>
        ${this.showEnvVars
          ? html`
              <div
                style="margin-top:var(--spacing-sm);display:flex;flex-direction:column;gap:var(--spacing-xs)"
              >
                ${this.envVars.map(
                  (ev, i) => html`
                    <div style="display:flex;gap:var(--spacing-xs);align-items:center">
                      <input
                        class="form-input"
                        type="text"
                        placeholder="KEY"
                        style="flex:1;font-family:var(--font-family-mono);font-size:var(--font-size-small)"
                        .value=${ev.key}
                        @input=${(e: Event) => this.updateEnvVar(i, 'key', e)}
                      />
                      <span style="color:var(--text-dim)">=</span>
                      <input
                        class="form-input"
                        type="text"
                        placeholder="value"
                        style="flex:1;font-family:var(--font-family-mono);font-size:var(--font-size-small)"
                        .value=${ev.value}
                        @input=${(e: Event) => this.updateEnvVar(i, 'value', e)}
                      />
                      <button
                        class="btn btn-icon rounded-full"
                        style="flex-shrink:0"
                        @click=${() => this.removeEnvVar(i)}
                      >
                        <img
                          src="/icons/x.svg"
                          alt=""
                          style="width:var(--spacing-md);height:var(--spacing-md);filter:brightness(0) invert();opacity:var(--opacity-muted)"
                        />
                      </button>
                    </div>
                  `,
                )}
                <button
                  class="btn btn-secondary"
                  style="width:auto;padding:var(--spacing-xs) var(--spacing-sm);font-size:var(--font-size-small);align-self:flex-start"
                  @click=${this.addEnvVar}
                >
                  + ${t('integ.mcpAddEnvVar')}
                </button>
              </div>
            `
          : nothing}
      </div>
    `;
  }

  private renderAccessTokenSection() {
    return html`
      <div class="form-group">
        <label class="form-label">${t('integ.mcpAccessToken')}</label>
        <input
          class="form-input"
          type="password"
          placeholder="${t('integ.mcpAccessTokenHint')}"
          autocomplete="off"
          .value=${this.accessToken}
          @input=${(e: Event) => {
            this.accessToken = (e.target as HTMLInputElement).value;
          }}
        />
      </div>
    `;
  }

  private handleCommandInput(e: Event) {
    const value = (e.target as HTMLTextAreaElement).value;
    this.commandInput = value;
    const config = parseInput(value);
    this.parsedConfig = config;
    if (config) {
      this.transport = config.transport;
      this.nameInput = config.name;
    }
  }

  private isValid(): boolean {
    if (!this.nameInput.trim()) return false;
    if (!this.commandInput.trim()) return false;
    // JSON input must parse successfully
    if (this.commandInput.trim().startsWith('{') && !this.parsedConfig) return false;
    if (this.transport === 'remote' && !this.parsedConfig?.url) {
      try {
        new URL(this.commandInput.trim());
      } catch {
        return false;
      }
    }
    return true;
  }

  private addEnvVar() {
    this.envVars = [...this.envVars, { key: '', value: '' }];
  }

  private removeEnvVar(index: number) {
    this.envVars = this.envVars.filter((_, i) => i !== index);
  }

  private updateEnvVar(index: number, field: 'key' | 'value', e: Event) {
    const val = (e.target as HTMLInputElement).value;
    this.envVars = this.envVars.map((ev, i) => (i === index ? { ...ev, [field]: val } : ev));
  }

  private async handleSubmit() {
    if (!this.isValid()) return;

    this.submitting = true;
    this.statusText = t('integ.connecting');
    this.statusClass = '';

    const config = this.parsedConfig;
    const manualEnv =
      this.envVars.length > 0
        ? Object.fromEntries(
            this.envVars.filter((ev) => ev.key.trim()).map((ev) => [ev.key.trim(), ev.value]),
          )
        : undefined;

    let payload: PersonalMcpConnectPayload;

    if (config && config.transport === 'remote') {
      payload = {
        name: this.nameInput.trim(),
        transport: 'remote',
        url: config.url!,
        ...(config.accessToken || this.accessToken.trim()
          ? { accessToken: config.accessToken ?? this.accessToken.trim() }
          : {}),
      };
    } else if (config && config.transport === 'stdio') {
      const mergedEnv = manualEnv ?? config.env;
      payload = {
        name: this.nameInput.trim(),
        transport: 'stdio',
        command: config.command!,
        args: config.args ?? [],
        ...(mergedEnv ? { env: mergedEnv } : {}),
      };
    } else {
      // Fallback: plain command string
      const parts = this.commandInput.trim().split(/\s+/);
      payload = {
        name: this.nameInput.trim(),
        transport: 'stdio',
        command: parts[0] ?? '',
        args: parts.slice(1),
        ...(manualEnv ? { env: manualEnv } : {}),
      };
    }

    try {
      await personalMcpConnect(payload);
      this.statusText = `${t('integ.connectedTo')} ${this.nameInput.trim()}`;
      this.statusClass = 'success';
      this.submitting = false;
      this.dispatchEvent(new CustomEvent('personal-mcp-connected', { bubbles: true }));
    } catch (err: unknown) {
      this.statusText = err instanceof Error ? err.message : t('integ.connectionFailed');
      this.statusClass = 'error';
      this.submitting = false;
    }
  }
}
