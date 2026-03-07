import type { AgentNode, ConnectResult } from './types.js';
import { connectChannel } from './ipc.js';

/**
 * Build platform-specific credentials from form data and invoke connect_channel.
 * Returns the ConnectResult or throws.
 */
export async function handleConnect(node: AgentNode): Promise<ConnectResult> {
  const formData = node._formData ?? {};
  const { platform } = node;
  let credentials: Record<string, unknown> = {};

  if (platform === 'telegram') {
    const rawId = String(formData.userId || '')
      .trim()
      .replace(/\D/g, '');
    const parsedId = parseInt(rawId, 10);
    if (!rawId || isNaN(parsedId) || parsedId <= 0) {
      return { success: false, error: 'User ID must be a positive number' };
    }
    credentials = { token: (formData.token || '').trim(), userId: parsedId, nodeId: node.id };
  } else if (platform === 'slack') {
    credentials = {
      token: (formData.token || '').trim(),
      signingSecret: (formData.signingSecret || '').trim(),
      nodeId: node.id,
    };
  } else if (platform === 'whatsapp') {
    credentials = {
      phoneNumberId: (formData.phoneNumberId || '').trim(),
      accessToken: (formData.accessToken || '').trim(),
      nodeId: node.id,
    };
  } else if (platform === 'discord') {
    credentials = { token: (formData.token || '').trim(), nodeId: node.id };
  } else if (platform === 'teams') {
    credentials = {
      appId: (formData.appId || '').trim(),
      appSecret: (formData.appSecret || '').trim(),
      tenantId: (formData.tenantId || '').trim(),
      nodeId: node.id,
    };
  } else if (platform === 'messenger') {
    credentials = {
      pageAccessToken: (formData.pageAccessToken || '').trim(),
      pageId: (formData.pageId || '').trim(),
      nodeId: node.id,
    };
  } else if (platform === 'line') {
    credentials = {
      channelAccessToken: (formData.channelAccessToken || '').trim(),
      channelSecret: (formData.channelSecret || '').trim(),
      nodeId: node.id,
    };
  } else if (platform === 'google-chat') {
    credentials = {
      serviceAccountKey: (formData.serviceAccountKey || '').trim(),
      spaceId: (formData.spaceId || '').trim(),
      nodeId: node.id,
    };
  } else if (platform === 'twilio') {
    credentials = {
      accountSid: (formData.accountSid || '').trim(),
      authToken: (formData.authToken || '').trim(),
      phoneNumber: (formData.phoneNumber || '').trim(),
      nodeId: node.id,
    };
  } else if (platform === 'matrix') {
    credentials = {
      homeserverUrl: (formData.homeserverUrl || '').trim(),
      accessToken: (formData.accessToken || '').trim(),
      nodeId: node.id,
    };
  } else if (platform === 'gmail') {
    credentials = { oauth: true, nodeId: node.id };
  } else if (platform === 'email') {
    credentials = {
      imapHost: (formData.imapHost || '').trim(),
      imapPort: parseInt(formData.imapPort, 10) || 993,
      smtpHost: (formData.smtpHost || '').trim(),
      smtpPort: parseInt(formData.smtpPort, 10) || 587,
      username: (formData.username || '').trim(),
      password: (formData.password || '').trim(),
      nodeId: node.id,
    };
  }

  return connectChannel(platform, credentials);
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
  if (platform === 'telegram') {
    node.label = result.displayName ? '@' + result.displayName : node.label;
    node.photo = result.photo || null;
    node.credentials = 'channel_token_' + (newNodeId || node.id);
    node.meta = {
      firstName: result.firstName || '',
      username: result.displayName || '',
    };
  } else if (platform === 'slack') {
    node.label = result.displayName || 'Slack Bot';
    node.photo = result.photo || null;
    node.credentials = 'channel_token_' + (newNodeId || node.id);
    node.meta = { botId: result.botId || '' };
  } else if (platform === 'discord') {
    node.label = result.displayName || 'Discord Bot';
    node.photo = result.photo || null;
    node.credentials = 'channel_token_' + (newNodeId || node.id);
    node.meta = {};
  } else if (platform === 'whatsapp') {
    node.label = result.displayName || 'WhatsApp Bot';
    node.credentials = 'channel_token_' + (newNodeId || node.id);
    node.meta = { phoneNumberId: credentials.phoneNumberId || '' };
  } else if (platform === 'matrix') {
    node.label = result.displayName || 'Matrix Bot';
    node.credentials = 'channel_token_' + (newNodeId || node.id);
    node.meta = { homeserver: credentials.homeserverUrl || '' };
  } else if (platform === 'gmail') {
    node.label = result.email || result.displayName || 'Gmail';
    node.photo = result.photo || null;
    node.credentials = 'gmail_oauth';
    node.meta = { email: result.email || '' };
  } else if (platform === 'email') {
    node.label = result.displayName || 'Email';
    node.credentials = 'channel_token_' + (newNodeId || node.id);
    node.meta = {
      username: credentials.username || '',
      imapHost: credentials.imapHost || '',
    };
  }

  return newNodeId;
}
