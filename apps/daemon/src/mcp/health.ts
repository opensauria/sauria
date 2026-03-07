import type { AuditLogger } from '../security/audit.js';
import { getLogger } from '../utils/logger.js';
import type { ConnectedClient, HealthCheckResult, McpServerConfig } from './types.js';

export type { HealthCheckResult };

const DEFAULT_INTERVAL_MS = 60_000;

export class McpHealthMonitor {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly clients: Map<string, ConnectedClient>,
    private readonly audit: AuditLogger,
    private readonly reconnect: (config: McpServerConfig) => Promise<void>,
  ) {}

  async healthCheck(): Promise<HealthCheckResult[]> {
    const logger = getLogger();
    const results: HealthCheckResult[] = [];
    const entries = [...this.clients.entries()];

    for (const [name, entry] of entries) {
      try {
        await entry.client.listTools();
        results.push({ name, status: 'healthy' });
      } catch (pingError: unknown) {
        const pingMessage = pingError instanceof Error ? pingError.message : String(pingError);
        logger.warn(`MCP health check failed for ${name}, attempting reconnect`, {
          error: pingMessage,
        });

        try {
          await this.reconnect(entry.config);
          results.push({ name, status: 'reconnected' });
          logger.info(`MCP server ${name} reconnected successfully`);
        } catch (reconnectError: unknown) {
          const reconnectMessage =
            reconnectError instanceof Error ? reconnectError.message : String(reconnectError);
          results.push({ name, status: 'failed', error: reconnectMessage });
          logger.error(`MCP server ${name} reconnect failed`, { error: reconnectMessage });
        }
      }
    }

    this.audit.logAction('mcp:health_check', {
      total: results.length,
      healthy: results.filter((r) => r.status === 'healthy').length,
      reconnected: results.filter((r) => r.status === 'reconnected').length,
      failed: results.filter((r) => r.status === 'failed').length,
    });

    return results;
  }

  start(intervalMs: number = DEFAULT_INTERVAL_MS): void {
    if (this.timer) return;

    const logger = getLogger();
    logger.info('MCP health monitor started', { intervalMs });

    this.timer = setInterval(() => {
      void this.healthCheck().catch((error: unknown) => {
        logger.error('MCP health check cycle failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, intervalMs);
  }

  stop(): void {
    if (!this.timer) return;

    clearInterval(this.timer);
    this.timer = null;

    const logger = getLogger();
    logger.info('MCP health monitor stopped');
  }
}
