import type { AgentNode, ConnectResult } from './types.js';
import { connectChannel } from './ipc.js';

/* ------------------------------------------------------------------ */
/*  Platform credential config                                         */
/* ------------------------------------------------------------------ */

interface PlatformCredentialConfig {
  readonly fields: readonly string[];
  readonly transform?: (
    formData: Record<string, string>,
    nodeId: string,
  ) => Record<string, unknown>;
}

const PLATFORM_CREDENTIALS: Record<string, PlatformCredentialConfig> = {
  telegram: {
    fields: ['token', 'userId'],
    transform: (form, nodeId) => {
      const rawId = String(form.userId || '')
        .trim()
        .replace(/\D/g, '');
      const parsedId = parseInt(rawId, 10);
      if (!rawId || isNaN(parsedId) || parsedId <= 0) {
        throw new Error('User ID must be a positive number');
      }
      return { token: (form.token || '').trim(), userId: parsedId, nodeId };
    },
  },
  slack: { fields: ['token', 'signingSecret'] },
  whatsapp: { fields: ['phoneNumberId', 'accessToken'] },
  discord: { fields: ['token'] },
  teams: { fields: ['appId', 'appSecret', 'tenantId'] },
  messenger: { fields: ['pageAccessToken', 'pageId'] },
  line: { fields: ['channelAccessToken', 'channelSecret'] },
  'google-chat': { fields: ['serviceAccountKey', 'spaceId'] },
  twilio: { fields: ['accountSid', 'authToken', 'phoneNumber'] },
  matrix: { fields: ['homeserverUrl', 'accessToken'] },
  gmail: { fields: [], transform: (_form, nodeId) => ({ oauth: true, nodeId }) },
  email: {
    fields: ['imapHost', 'smtpHost', 'username', 'password'],
    transform: (form, nodeId) => ({
      imapHost: (form.imapHost || '').trim(),
      imapPort: parseInt(form.imapPort, 10) || 993,
      smtpHost: (form.smtpHost || '').trim(),
      smtpPort: parseInt(form.smtpPort, 10) || 587,
      username: (form.username || '').trim(),
      password: (form.password || '').trim(),
      nodeId,
    }),
  },
};

function buildCredentials(
  platform: string,
  formData: Record<string, string>,
  nodeId: string,
): Record<string, unknown> {
  const config = PLATFORM_CREDENTIALS[platform];
  if (!config) return {};

  if (config.transform) {
    return config.transform(formData, nodeId);
  }

  const credentials: Record<string, unknown> = { nodeId };
  for (const field of config.fields) {
    credentials[field] = (formData[field] || '').trim();
  }
  return credentials;
}

/**
 * Build platform-specific credentials from form data and invoke connect_channel.
 * Returns the ConnectResult or throws.
 */
export async function handleConnect(node: AgentNode): Promise<ConnectResult> {
  const formData = node._formData ?? {};
  const { platform } = node;

  try {
    const credentials = buildCredentials(platform, formData, node.id);
    return connectChannel(platform, credentials);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid credentials';
    return { success: false, error: message };
  }
}

/* ------------------------------------------------------------------ */
/*  Platform result config                                             */
/* ------------------------------------------------------------------ */

function resultField(result: ConnectResult, key: string): string | undefined {
  return (result as unknown as Record<string, unknown>)[key] as string | undefined;
}

interface PlatformResultConfig {
  readonly labelKey?: string;
  readonly labelPrefix?: string;
  readonly labelFallback?: string;
  readonly photoKey?: string;
  readonly metaKeys?: Record<string, string>;
  readonly metaFromCredentials?: Record<string, string>;
  readonly credentialKey?: string;
}

const PLATFORM_RESULTS: Record<string, PlatformResultConfig> = {
  telegram: {
    labelKey: 'displayName',
    labelPrefix: '@',
    photoKey: 'photo',
    metaKeys: { firstName: 'firstName', username: 'displayName' },
  },
  slack: {
    labelKey: 'displayName',
    labelFallback: 'Slack Bot',
    photoKey: 'photo',
    metaKeys: { botId: 'botId' },
  },
  discord: {
    labelKey: 'displayName',
    labelFallback: 'Discord Bot',
    photoKey: 'photo',
  },
  whatsapp: {
    labelKey: 'displayName',
    labelFallback: 'WhatsApp Bot',
    metaFromCredentials: { phoneNumberId: 'phoneNumberId' },
  },
  matrix: {
    labelKey: 'displayName',
    labelFallback: 'Matrix Bot',
    metaFromCredentials: { homeserver: 'homeserverUrl' },
  },
  gmail: {
    labelFallback: 'Gmail',
    photoKey: 'photo',
    metaKeys: { email: 'email' },
    credentialKey: 'gmail_oauth',
  },
  email: {
    labelKey: 'displayName',
    labelFallback: 'Email',
    metaFromCredentials: { username: 'username', imapHost: 'imapHost' },
  },
};

function resolveLabel(
  config: PlatformResultConfig,
  result: ConnectResult,
  fallbackLabel: string,
): string {
  /* gmail special case: try email first, then displayName, then fallback */
  if (config.credentialKey === 'gmail_oauth') {
    return result.email || result.displayName || config.labelFallback || fallbackLabel;
  }

  const value = config.labelKey ? resultField(result, config.labelKey) : undefined;

  if (config.labelPrefix) {
    return value ? config.labelPrefix + value : fallbackLabel;
  }

  return value || config.labelFallback || fallbackLabel;
}

/**
 * Apply connect result to node state.
 * Returns the new deterministic nodeId if it changed, or null.
 */
export function applyConnectResult(
  node: AgentNode,
  result: ConnectResult,
  credentials: Record<string, string>,
): string | null {
  if (!result.success) {
    node.status = 'error';
    node._statusMsg = result.error || 'Connection failed';
    node._statusType = 'error';
    return null;
  }

  let newNodeId: string | null = null;
  if (result.nodeId && result.nodeId !== node.id) {
    newNodeId = result.nodeId;
  }

  node.status = 'connected';
  node._statusMsg = '';
  node._statusType = '';
  node._formData = undefined;

  const { platform } = node;
  const config = PLATFORM_RESULTS[platform];
  if (!config) return newNodeId;

  node.label = resolveLabel(config, result, node.label);

  if (config.photoKey) {
    node.photo = resultField(result, config.photoKey) || null;
  }

  node.credentials = config.credentialKey ?? 'channel_token_' + (newNodeId || node.id);

  const meta: Record<string, string> = {};
  if (config.metaKeys) {
    for (const [metaField, resultKey] of Object.entries(config.metaKeys)) {
      meta[metaField] = resultField(result, resultKey) || '';
    }
  }
  if (config.metaFromCredentials) {
    for (const [metaField, credField] of Object.entries(config.metaFromCredentials)) {
      meta[metaField] = credentials[credField] || '';
    }
  }
  node.meta = meta;

  return newNodeId;
}
