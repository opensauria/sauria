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

  scheduleRefresh(integrationId: string, tokenUrl: string, expiresAt: number): void {
    this.clearTimer(integrationId);
    const delay = Math.max(0, expiresAt - Date.now() - REFRESH_MARGIN_MS);
    const timer = setTimeout(() => {
      void this.refresh(integrationId, tokenUrl);
    }, delay);
    this.timers.set(integrationId, timer);
  }

  private async refresh(integrationId: string, tokenUrl: string): Promise<void> {
    const vaultKey = `integration_oauth_${integrationId}`;
    const stored = await vaultGet(vaultKey);
    if (!stored) return;

    let credential: OAuthCredential;
    try {
      credential = JSON.parse(stored) as OAuthCredential;
    } catch {
      return;
    }

    if (!credential.refreshToken) return;

    try {
      const resp = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: credential.refreshToken,
          client_id: 'sauria-desktop',
        }),
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
      await vaultStore(vaultKey, JSON.stringify(newCredential));

      // Reconnect with new token
      const instanceId = `${integrationId}:default`;
      await this.registry.refreshRemoteConnection(instanceId, newAccessToken);

      this.logger.info(`Refreshed OAuth token for ${integrationId}`);

      // Schedule next refresh
      this.scheduleRefresh(integrationId, tokenUrl, newExpiresAt);
    } catch (err) {
      this.logger.error(`Failed to refresh token for ${integrationId}`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private clearTimer(integrationId: string): void {
    const existing = this.timers.get(integrationId);
    if (existing) {
      clearTimeout(existing);
      this.timers.delete(integrationId);
    }
  }

  stop(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }
}
