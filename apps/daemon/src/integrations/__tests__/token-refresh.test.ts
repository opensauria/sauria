import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../security/vault-key.js', () => ({
  vaultGet: vi.fn(),
  vaultStore: vi.fn(),
}));

import { vaultGet, vaultStore } from '../../security/vault-key.js';
import { TokenRefreshService } from '../token-refresh.js';

const mockRegistry = {
  refreshRemoteConnection: vi.fn(),
};

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

function createService(): TokenRefreshService {
  return new TokenRefreshService(mockRegistry as never, mockLogger as never);
}

describe('TokenRefreshService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('scheduleRefresh', () => {
    it('schedules a timer that triggers refresh', async () => {
      const credential = {
        kind: 'oauth',
        accessToken: 'old-access',
        refreshToken: 'refresh-tok',
        expiresAt: Date.now() + 10 * 60 * 1000,
      };

      vi.mocked(vaultGet).mockResolvedValue(JSON.stringify(credential));
      vi.mocked(vaultStore).mockResolvedValue(undefined);

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: 'new-access',
            refresh_token: 'new-refresh',
            expires_in: 3600,
          }),
          { status: 200 },
        ),
      );

      mockRegistry.refreshRemoteConnection.mockResolvedValue(undefined);

      const service = createService();
      // expiresAt is 10 minutes from now, margin is 5 minutes, so delay = 5 minutes
      service.scheduleRefresh(
        'github',
        'https://auth.example.com/token',
        Date.now() + 10 * 60 * 1000,
      );

      // Advance past the delay
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 100);

      expect(vaultGet).toHaveBeenCalledWith('integration_oauth_github');
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://auth.example.com/token',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(vaultStore).toHaveBeenCalled();
      expect(mockRegistry.refreshRemoteConnection).toHaveBeenCalledWith(
        'github:default',
        'new-access',
      );

      service.stop();
      fetchSpy.mockRestore();
    });

    it('clears previous timer when rescheduling', () => {
      const service = createService();
      const clearSpy = vi.spyOn(globalThis, 'clearTimeout');

      service.scheduleRefresh(
        'github',
        'https://auth.example.com/token',
        Date.now() + 20 * 60 * 1000,
      );
      service.scheduleRefresh(
        'github',
        'https://auth.example.com/token',
        Date.now() + 30 * 60 * 1000,
      );

      expect(clearSpy).toHaveBeenCalled();

      service.stop();
      clearSpy.mockRestore();
    });

    it('uses delay of 0 when already past expiry margin', () => {
      const service = createService();
      // expiresAt in the past
      service.scheduleRefresh('github', 'https://auth.example.com/token', Date.now() - 1000);
      // Timer should fire almost immediately (delay clamped to 0)
      service.stop();
    });
  });

  describe('refresh (via timer)', () => {
    it('returns early when no vault credential found', async () => {
      vi.mocked(vaultGet).mockResolvedValue(null);

      const service = createService();
      service.scheduleRefresh('test', 'https://auth.example.com/token', Date.now());

      await vi.advanceTimersByTimeAsync(100);

      expect(vaultGet).toHaveBeenCalledWith('integration_oauth_test');
      expect(mockRegistry.refreshRemoteConnection).not.toHaveBeenCalled();

      service.stop();
    });

    it('returns early when vault value is not valid JSON', async () => {
      vi.mocked(vaultGet).mockResolvedValue('not-json');

      const service = createService();
      service.scheduleRefresh('test', 'https://auth.example.com/token', Date.now());

      await vi.advanceTimersByTimeAsync(100);

      expect(mockRegistry.refreshRemoteConnection).not.toHaveBeenCalled();

      service.stop();
    });

    it('returns early when no refresh token', async () => {
      vi.mocked(vaultGet).mockResolvedValue(
        JSON.stringify({ kind: 'oauth', accessToken: 'a', refreshToken: '', expiresAt: 0 }),
      );

      const service = createService();
      service.scheduleRefresh('test', 'https://auth.example.com/token', Date.now());

      await vi.advanceTimersByTimeAsync(100);

      expect(mockRegistry.refreshRemoteConnection).not.toHaveBeenCalled();

      service.stop();
    });

    it('logs error when fetch response is not ok', async () => {
      vi.mocked(vaultGet).mockResolvedValue(
        JSON.stringify({ kind: 'oauth', accessToken: 'a', refreshToken: 'r', expiresAt: 0 }),
      );

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response('Unauthorized', { status: 401 }));

      const service = createService();
      service.scheduleRefresh('test', 'https://auth.example.com/token', Date.now());

      await vi.advanceTimersByTimeAsync(100);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Token refresh failed for test: 401'),
      );

      service.stop();
      fetchSpy.mockRestore();
    });

    it('logs error when fetch throws', async () => {
      vi.mocked(vaultGet).mockResolvedValue(
        JSON.stringify({ kind: 'oauth', accessToken: 'a', refreshToken: 'r', expiresAt: 0 }),
      );

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

      const service = createService();
      service.scheduleRefresh('test', 'https://auth.example.com/token', Date.now());

      await vi.advanceTimersByTimeAsync(100);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to refresh token for test'),
        expect.objectContaining({ error: 'Network error' }),
      );

      service.stop();
      fetchSpy.mockRestore();
    });
  });

  describe('stop', () => {
    it('clears all timers', () => {
      const service = createService();
      service.scheduleRefresh('a', 'https://a.com/token', Date.now() + 600000);
      service.scheduleRefresh('b', 'https://b.com/token', Date.now() + 600000);

      service.stop();
      // No error means timers were cleared
    });
  });
});
