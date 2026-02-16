import type BetterSqlite3 from 'better-sqlite3';
import { scanDeadlines } from './deadlines.js';
import { detectDecay } from './relations.js';
import { detectPatterns } from './patterns.js';
import { generateInsight } from './insights.js';
import { TaskManager } from './tasks.js';
import { AuditLogger } from '../security/audit.js';
import { SECURITY_LIMITS } from '../security/rate-limiter.js';
import type { ModelRouter } from '../ai/router.js';
import {
  deadlineToAlert,
  decayToAlert,
  patternToAlert,
  buildAlertKey,
  buildInsightContext,
} from './alert-converters.js';
import type { ProactiveAlert, AlertCallback } from './alert-converters.js';

export type { ProactiveAlert, AlertCallback };

const DEFAULT_INTERVAL_MS = 15 * 60_000;
const MAX_ALERTS_PER_TICK = 5;
const COOLDOWN_MS = SECURITY_LIMITS.channels.cooldownBetweenSimilarAlerts * 1_000;
const MAX_ALERTS_PER_DAY = SECURITY_LIMITS.channels.maxProactiveAlertsPerDay;
const ALERT_KEY_CLEANUP_INTERVAL_MS = 3_600_000;

export class ProactiveEngine {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private readonly recentAlertKeys = new Map<string, number>();
  private lastAlertCleanup = Date.now();
  private dailyAlertCount = 0;
  private lastDayReset = new Date().toDateString();
  private readonly audit: AuditLogger;
  private readonly tasks: TaskManager;

  constructor(
    private readonly db: BetterSqlite3.Database,
    private readonly router: ModelRouter,
    private readonly onAlert: AlertCallback,
  ) {
    this.audit = new AuditLogger(db);
    this.tasks = new TaskManager(db);
  }

  start(intervalMs = DEFAULT_INTERVAL_MS): void {
    if (this.intervalId) return;
    void this.tick();
    this.intervalId = setInterval(() => void this.tick(), intervalMs);
  }

  stop(): void {
    if (!this.intervalId) return;
    clearInterval(this.intervalId);
    this.intervalId = null;
  }

  getTaskManager(): TaskManager {
    return this.tasks;
  }

  private async tick(): Promise<void> {
    this.resetDailyCountIfNeeded();
    this.cleanupStaleKeys();

    const deadlineAlerts = scanDeadlines(this.db)
      .filter((a) => a.priority === 'critical' || a.priority === 'high')
      .map(deadlineToAlert);

    const decayAlerts = detectDecay(this.db)
      .filter((a) => a.priority === 'high')
      .map(decayToAlert);

    const patternAlerts = detectPatterns(this.db)
      .filter((a) => a.priority >= 3)
      .map(patternToAlert);

    const overdueAlerts = this.buildOverdueAlerts();

    const allAlerts = [...deadlineAlerts, ...decayAlerts, ...patternAlerts, ...overdueAlerts]
      .filter((alert) => !this.isDuplicate(alert))
      .sort((a, b) => b.priority - a.priority)
      .slice(0, MAX_ALERTS_PER_TICK);

    let emittedCount = 0;
    for (const alert of allAlerts) {
      if (this.dailyAlertCount >= MAX_ALERTS_PER_DAY) break;
      const key = buildAlertKey(alert);
      this.recentAlertKeys.set(key, Date.now());
      this.dailyAlertCount++;
      emittedCount++;
      this.onAlert(alert);
    }

    if (this.dailyAlertCount < MAX_ALERTS_PER_DAY) {
      await this.tryGenerateInsight();
    }

    this.audit.logAction('proactive_tick', {
      deadlines: deadlineAlerts.length,
      decay: decayAlerts.length,
      patterns: patternAlerts.length,
      overdue: overdueAlerts.length,
      emitted: emittedCount,
      dailyTotal: this.dailyAlertCount,
    });
  }

  private buildOverdueAlerts(): ProactiveAlert[] {
    const overdue = this.tasks.getOverdue();
    return overdue.map((task) => ({
      type: 'task_overdue',
      priority: task.priority === 'critical' ? 5 : task.priority === 'high' ? 4 : 3,
      title: `Overdue task: ${task.title}`,
      details: `Scheduled for ${task.scheduledFor ?? 'unknown'}, status: ${task.status}`,
      entityIds: task.entityIds ?? [],
      timestamp: new Date().toISOString(),
    }));
  }

  private async tryGenerateInsight(): Promise<void> {
    const context = buildInsightContext(this.db);
    if (context.length === 0) return;

    const insight = await generateInsight(this.db, this.router, context);
    if (!insight) return;

    const alert: ProactiveAlert = {
      type: 'insight',
      priority: Math.round(insight.confidence * 5),
      title: 'New insight generated',
      details: insight.content,
      entityIds: insight.entityIds,
      timestamp: new Date().toISOString(),
    };

    if (this.isDuplicate(alert)) return;
    if (this.dailyAlertCount >= MAX_ALERTS_PER_DAY) return;

    const key = buildAlertKey(alert);
    this.recentAlertKeys.set(key, Date.now());
    this.dailyAlertCount++;
    this.onAlert(alert);
    this.audit.logAction('proactive_insight', { content: insight.content });
  }

  private isDuplicate(alert: ProactiveAlert): boolean {
    const key = buildAlertKey(alert);
    const lastEmitted = this.recentAlertKeys.get(key);
    if (lastEmitted === undefined) return false;
    return Date.now() - lastEmitted < COOLDOWN_MS;
  }

  private cleanupStaleKeys(): void {
    const now = Date.now();
    if (now - this.lastAlertCleanup < ALERT_KEY_CLEANUP_INTERVAL_MS) return;
    for (const [key, timestamp] of this.recentAlertKeys) {
      if (now - timestamp > COOLDOWN_MS) {
        this.recentAlertKeys.delete(key);
      }
    }
    this.lastAlertCleanup = now;
  }

  private resetDailyCountIfNeeded(): void {
    const today = new Date().toDateString();
    if (today === this.lastDayReset) return;
    this.dailyAlertCount = 0;
    this.lastDayReset = today;
  }
}
