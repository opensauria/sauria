import { vaultGet, vaultStore } from '../security/vault-key.js';
import type { IntegrationRegistry } from './registry.js';
import type { Logger } from '../utils/logger.js';

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

interface OAuthCredential {
  readonly kind: 'oauth';
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: number;
}

export class TokenRefreshService {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly registry: IntegrationRegistry,
    private readonly logger: Logger,
  ) {}

  scheduleRefresh(instanceId: string, tokenUrl: string, expiresAt: number): void {
    this.clearTimer(instanceId);
    const delay = Math.max(0, expiresAt - Date.now() - REFRESH_MARGIN_MS);
    const timer = setTimeout(() => {
      void this.refresh(instanceId, tokenUrl);
    }, delay);
    this.timers.set(instanceId, timer);
  }

  private async refresh(instanceId: string, tokenUrl: string): Promise<void> {
    const integrationId = instanceId.includes(':') ? instanceId.split(':')[0]! : instanceId;
    const stored =
      (await vaultGet(`integration_oauth_${instanceId}`)) ??
      (await vaultGet(`integration_oauth_${integrationId}`));
    if (!stored) return;

    let credential: OAuthCredential;
    try {
      credential = JSON.parse(stored) as OAuthCredential;
    } catch {
      return;
    }

    if (!credential.refreshToken) return;

    try {
      const formBody = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: credential.refreshToken,
        client_id: 'sauria-desktop',
      });
      const resp = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formBody.toString(),
      });

      if (!resp.ok) {
        this.logger.error(`Token refresh failed for ${integrationId}: ${resp.status}`);
        return;
      }

      const body = (await resp.json()) as Record<string, unknown>;
      const newAccessToken = body['access_token'] as string;
      const newRefreshToken = (body['refresh_token'] as string) || credential.refreshToken;
      const expiresIn = (body['expires_in'] as number) || 3600;
      const newExpiresAt = Date.now() + expiresIn * 1000;

      const newCredential: OAuthCredential = {
        kind: 'oauth',
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresAt: newExpiresAt,
      };
      const credJson = JSON.stringify(newCredential);
      await vaultStore(`integration_oauth_${instanceId}`, credJson);
      if (instanceId !== integrationId) {
        await vaultStore(`integration_oauth_${integrationId}`, credJson);
      }

      await this.registry.refreshRemoteConnection(instanceId, newAccessToken);

      this.logger.info(`Refreshed OAuth token for ${instanceId}`);

      this.scheduleRefresh(instanceId, tokenUrl, newExpiresAt);
    } catch (err) {
      this.logger.error(`Failed to refresh token for ${instanceId}`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private clearTimer(instanceId: string): void {
    const existing = this.timers.get(instanceId);
    if (existing) {
      clearTimeout(existing);
      this.timers.delete(instanceId);
    }
  }

  stop(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }
}
