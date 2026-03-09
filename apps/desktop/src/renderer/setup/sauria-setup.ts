import { html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { LightDomElement } from '../shared/light-dom-element.js';
import { adoptGlobalStyles, adoptStyles } from '../shared/styles/inject.js';
import { setupLayoutStyles } from './setup-layout-styles.js';
import { setupComponentStyles } from './setup-component-styles.js';
import { navigateBack } from '../shared/ipc.js';
import { initPaletteMode } from '../shared/palette-mixin.js';
import type { ClientInfo } from './ipc.js';

adoptGlobalStyles();
adoptStyles(setupLayoutStyles, setupComponentStyles);

import './setup-step-welcome.js';
import './setup-step-mode.js';
import './setup-step-provider.js';
import './setup-step-local.js';
import './setup-step-auth.js';
import './setup-step-configuring.js';
import './setup-step-done.js';
import type { SetupStepAuth } from './setup-step-auth.js';

type Step =
  | 'welcome'
  | 'mode'
  | 'claude-desktop'
  | 'provider'
  | 'local'
  | 'auth'
  | 'configuring'
  | 'done';

@customElement('sauria-setup')
export class SauriaSetup extends LightDomElement {
  @state() private currentStep: Step = 'welcome';
  @state() private selectedProvider = '';
  @state() private selectedApiKey = '';
  @state() private selectedMode = '';
  @state() private localBaseUrl = '';
  @state() private detectedClients: ClientInfo[] = [];

  private isInPalette = false;

  override connectedCallback() {
    super.connectedCallback();
    this.isInPalette = initPaletteMode();
  }

  override render() {
    return html`
      <div class="setup-wrapper">
        <div class="setup-header" data-tauri-drag-region>
          <button class="palette-back" title="Back" @click=${() => navigateBack()}>
            <img src="/icons/chevron-left.svg" alt="" />
          </button>
          <span class="setup-title">AI Provider</span>
        </div>
        <div class="container">
          <div class="step active">${this.renderStep()}</div>
        </div>
      </div>
    `;
  }

  private renderStep() {
    switch (this.currentStep) {
      case 'welcome':
        return html`<setup-step-welcome @step-next=${this.goToMode}></setup-step-welcome>`;
      case 'mode':
        return html`<setup-step-mode
          @step-back=${this.goToWelcome}
          @mode-selected=${this.handleModeSelected}
        ></setup-step-mode>`;
      case 'claude-desktop':
        return html`<setup-step-auth
          mode="claude_desktop"
          provider="anthropic"
          @step-back=${this.goToMode}
          @auth-complete=${this.handleAuthComplete}
        ></setup-step-auth>`;
      case 'provider':
        return html`<setup-step-provider
          @step-back=${this.goToMode}
          @provider-selected=${this.handleProviderSelected}
        ></setup-step-provider>`;
      case 'local':
        return html`<setup-step-local
          @step-back=${this.goToMode}
          @local-selected=${this.handleLocalSelected}
        ></setup-step-local>`;
      case 'auth':
        return html`<setup-step-auth
          mode="api_key"
          .provider=${this.selectedProvider}
          @step-back=${this.goToProvider}
          @auth-complete=${this.handleAuthComplete}
        ></setup-step-auth>`;
      case 'configuring':
        return html`<setup-step-configuring
          .provider=${this.selectedProvider}
          .apiKey=${this.selectedApiKey}
          .mode=${this.selectedMode}
          .localBaseUrl=${this.localBaseUrl}
          @config-complete=${this.handleConfigComplete}
          @config-error=${this.handleConfigError}
        ></setup-step-configuring>`;
      case 'done':
        return html`<setup-step-done
          .clients=${this.detectedClients}
          @setup-done=${this.handleDone}
        ></setup-step-done>`;
      default:
        return nothing;
    }
  }

  private goToWelcome() {
    this.currentStep = 'welcome';
  }

  private goToMode() {
    this.currentStep = 'mode';
  }

  private goToProvider() {
    this.currentStep = 'provider';
  }

  private handleModeSelected(e: CustomEvent<{ mode: string }>) {
    const { mode } = e.detail;
    if (mode === 'claude_desktop') {
      this.currentStep = 'claude-desktop';
    } else if (mode === 'api_key') {
      this.currentStep = 'provider';
    } else if (mode === 'local') {
      this.currentStep = 'local';
    }
  }

  private handleProviderSelected(e: CustomEvent<{ provider: string }>) {
    this.selectedProvider = e.detail.provider;
    this.currentStep = 'auth';
  }

  private handleLocalSelected(e: CustomEvent<{ provider: string; url: string }>) {
    this.selectedProvider = e.detail.provider;
    this.localBaseUrl = e.detail.url;
    this.selectedMode = 'local';
    this.selectedApiKey = '';
    this.currentStep = 'configuring';
  }

  private handleAuthComplete(e: CustomEvent<{ provider: string; apiKey: string; mode: string }>) {
    this.selectedProvider = e.detail.provider;
    this.selectedApiKey = e.detail.apiKey;
    this.selectedMode = e.detail.mode;
    this.currentStep = 'configuring';
  }

  private handleConfigComplete(e: CustomEvent<{ clients: ClientInfo[] }>) {
    this.detectedClients = e.detail.clients;
    this.currentStep = 'done';
  }

  private handleConfigError(e: CustomEvent<{ message: string }>) {
    if (this.selectedMode === 'api_key') {
      this.currentStep = 'auth';
      requestAnimationFrame(() => {
        const authStep = this.querySelector<SetupStepAuth>('setup-step-auth');
        authStep?.showError(e.detail.message);
      });
    } else {
      this.currentStep = 'mode';
    }
  }

  private handleDone() {
    if (this.isInPalette) {
      navigateBack();
    } else {
      window.close();
    }
  }
}
