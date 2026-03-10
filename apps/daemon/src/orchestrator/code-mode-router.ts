/**
 * Code Mode Router — manages Claude Code CLI sessions per agent node.
 *
 * When an agent has `codeMode.enabled`, messages bypass the LLM routing
 * brain and go directly to a persistent Claude Code CLI session.
 *
 * Handles:
 * - Per-node ClaudeCodeService lifecycle
 * - Rate limiting (1 concurrent per agent, 10/min, 5 total)
 * - Mode-switching commands (/plan, /auto, etc.)
 * - Session reset (/reset)
 * - Session ID persistence to canvas.json
 * - Audit logging
 */

import type { AgentNode, InboundMessage, RoutingAction, CodePermissionMode } from './types.js';
import {
  ClaudeCodeService,
  validateProjectPath,
  type ApiKeyResolver,
} from '../channels/claude-code-service.js';
import { formatCodeResponse } from '../channels/claude-code-formatter.js';
import { getLogger } from '../utils/logger.js';
import type { AuditLogger } from '../security/audit.js';

const MAX_CONCURRENT_TOTAL = 5;
const MAX_PER_MINUTE = 10;

const MODE_COMMANDS: Readonly<Record<string, CodePermissionMode>> = {
  '/plan': 'plan',
  '/auto': 'auto',
  '/accept-edits': 'acceptEdits',
  '/default': 'default',
};

interface NodeTracker {
  readonly service: ClaudeCodeService;
  projectPath: string;
  permissionMode: CodePermissionMode;
  invocations: number;
  windowStart: number;
}

export type SessionPersistCallback = (nodeId: string, sessionId: string) => void;

export class CodeModeRouter {
  private readonly services = new Map<string, NodeTracker>();
  private readonly audit: AuditLogger | null;
  private readonly resolveApiKey: ApiKeyResolver | null;
  private onSessionPersist: SessionPersistCallback | null = null;

  constructor(audit: AuditLogger | null = null, resolveApiKey?: ApiKeyResolver) {
    this.audit = audit;
    this.resolveApiKey = resolveApiKey ?? null;
  }

  setSessionPersistCallback(callback: SessionPersistCallback): void {
    this.onSessionPersist = callback;
  }

  async route(node: AgentNode, message: InboundMessage): Promise<readonly RoutingAction[]> {
    const logger = getLogger();
    const { content } = message;
    const config = node.codeMode;

    if (!config?.enabled || !config.projectPath) {
      return [];
    }

    // Block while PTY terminal is active — sessions must not overlap
    if (config.terminalActive) {
      return [
        {
          type: 'reply',
          content:
            'This agent has an active terminal session. Close the terminal to process channel messages.',
        },
      ];
    }

    // Validate project path on every call (canvas.json may have been edited)
    try {
      validateProjectPath(config.projectPath);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('Code mode project path invalid', { nodeId: node.id, error: msg });
      return [{ type: 'reply', content: `Code Mode error: ${msg}` }];
    }

    // Handle /reset command
    if (content.trim() === '/reset') {
      this.resetSession(node.id);
      this.logAudit('session-reset', node);
      return [{ type: 'reply', content: 'Code Mode session reset. Next message starts fresh.' }];
    }

    // Handle mode-switching commands
    const modeCommand = MODE_COMMANDS[content.trim()];
    if (modeCommand) {
      const tracker = this.services.get(node.id);
      if (tracker) {
        tracker.service.setPermissionMode(modeCommand);
      }
      this.logAudit('mode-switch', node, { mode: modeCommand });
      return [{ type: 'reply', content: `Permission mode switched to: ${modeCommand}` }];
    }

    // Get or create service
    const tracker = this.getOrCreateTracker(node);

    // Check per-node busy state (previous invocation still in progress)
    if (tracker.service.isBusy) {
      return [
        {
          type: 'reply',
          content: 'Code Mode is still processing the previous message. Please wait.',
        },
      ];
    }

    // Check total concurrent limit
    const busyCount = Array.from(this.services.values()).filter((t) => t.service.isBusy).length;
    if (busyCount >= MAX_CONCURRENT_TOTAL) {
      return [
        { type: 'reply', content: 'Too many concurrent Code Mode sessions. Try again shortly.' },
      ];
    }

    // Rate limiting — checked after busy guards so rejected messages
    // don't consume rate limit slots
    if (!this.checkRateLimit(node.id)) {
      return [{ type: 'reply', content: 'Rate limit reached. Try again in a moment.' }];
    }

    this.logAudit('invocation', node, {
      messagePreview: content.slice(0, 100),
      permissionMode: config.permissionMode,
    });

    try {
      const raw = await tracker.service.sendMessage(content);
      const formatted = formatCodeResponse(raw, message.platform);

      // Persist session ID after successful invocation
      const sessionId = tracker.service.currentSessionId;
      if (sessionId && this.onSessionPersist) {
        this.onSessionPersist(node.id, sessionId);
      }

      return [{ type: 'reply', content: formatted }];
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('Claude Code invocation failed', { nodeId: node.id, error: msg });
      return [{ type: 'reply', content: `Code Mode error: ${msg}` }];
    }
  }

  resetSession(nodeId: string): void {
    const tracker = this.services.get(nodeId);
    if (tracker) {
      void tracker.service.resetSession();
      this.services.delete(nodeId);
    }
  }

  stopAll(): void {
    for (const [, tracker] of this.services) {
      tracker.service.stop();
    }
    this.services.clear();
  }

  private getOrCreateTracker(node: AgentNode): NodeTracker {
    const config = node.codeMode!;
    const existing = this.services.get(node.id);

    // Reuse service if project path matches, syncing mutable fields
    if (existing) {
      if (existing.projectPath === config.projectPath) {
        if (existing.permissionMode !== config.permissionMode) {
          existing.service.setPermissionMode(config.permissionMode);
          existing.permissionMode = config.permissionMode;
        }
        // Sync session ID from graph (may have been updated by desktop terminal)
        if (config.sessionId && config.sessionId !== existing.service.currentSessionId) {
          existing.service.setSessionId(config.sessionId);
        }
        return existing;
      }

      // Project path changed — tear down old session entirely
      existing.service.stop();
      this.services.delete(node.id);
    }

    const service = new ClaudeCodeService({
      projectPath: config.projectPath,
      permissionMode: config.permissionMode,
      initialSessionId: config.sessionId,
      resolveApiKey: this.resolveApiKey ?? undefined,
    });

    const tracker: NodeTracker = {
      service,
      projectPath: config.projectPath,
      permissionMode: config.permissionMode,
      invocations: 0,
      windowStart: Date.now(),
    };

    this.services.set(node.id, tracker);
    return tracker;
  }

  private checkRateLimit(nodeId: string): boolean {
    const tracker = this.services.get(nodeId);
    if (!tracker) return true;

    const now = Date.now();
    if (now - tracker.windowStart > 60_000) {
      tracker.invocations = 0;
      tracker.windowStart = now;
    }

    if (tracker.invocations >= MAX_PER_MINUTE) return false;

    tracker.invocations++;
    return true;
  }

  private logAudit(action: string, node: AgentNode, details: Record<string, unknown> = {}): void {
    this.audit?.logAction(`claude-code:${action}`, {
      nodeId: node.id,
      projectPath: node.codeMode?.projectPath,
      ...details,
    });
  }
}
