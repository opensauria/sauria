/**
 * Channel connector functions — API validation, vault storage, config update per platform.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { paths } from '@opensauria/config';
import { vaultStore } from '@opensauria/vault';
import { restartDaemon } from './daemon-manager';

export function readConfig(): Record<string, unknown> {
  if (!existsSync(paths.config)) return {};
  try {
    return JSON.parse(readFileSync(paths.config, 'utf-8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function writeConfig(config: Record<string, unknown>): void {
  writeFileSync(paths.config, JSON.stringify(config, null, 2), 'utf-8');
}

export function readProfiles(): Record<string, unknown> {
  if (!existsSync(paths.botProfiles)) return {};
  try {
    return JSON.parse(readFileSync(paths.botProfiles, 'utf-8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function writeProfiles(profiles: Record<string, unknown>): void {
  writeFileSync(paths.botProfiles, JSON.stringify(profiles, null, 2), 'utf-8');
}

export async function connectTelegram(
  credentials: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const token = String(credentials['token'] ?? '');
  const userId = Number(credentials['userId']);
  if (!token || !Number.isFinite(userId) || userId <= 0) {
    return { success: false, error: 'Invalid credentials' };
  }

  const tgApi = `https://api.telegram.org/bot${token}`;
  const res = await fetch(`${tgApi}/getMe`, { signal: AbortSignal.timeout(10_000) });
  const body = (await res.json()) as {
    ok: boolean;
    result?: { id: number; username?: string; first_name: string };
  };

  if (!body.ok || !body.result) {
    return { success: false, error: 'Invalid bot token' };
  }

  const { id: botId, username, first_name: firstName } = body.result;
  const botUsername = username ?? firstName;

  let photoBase64: string | null = null;
  try {
    const photosRes = await fetch(
      `${tgApi}/getUserProfilePhotos?user_id=${String(botId)}&limit=1`,
      { signal: AbortSignal.timeout(10_000) },
    );
    const photosBody = (await photosRes.json()) as {
      ok: boolean;
      result?: { photos: Array<Array<{ file_id: string; width: number }>> };
    };

    if (photosBody.ok && photosBody.result && photosBody.result.photos.length > 0) {
      const sizes = photosBody.result.photos[0];
      const smallest = sizes?.reduce((a, b) => (a.width < b.width ? a : b));
      if (smallest) {
        const fileRes = await fetch(`${tgApi}/getFile?file_id=${smallest.file_id}`, {
          signal: AbortSignal.timeout(10_000),
        });
        const fileBody = (await fileRes.json()) as {
          ok: boolean;
          result?: { file_path: string };
        };
        if (fileBody.ok && fileBody.result?.file_path) {
          const imgRes = await fetch(
            `https://api.telegram.org/file/bot${token}/${fileBody.result.file_path}`,
            { signal: AbortSignal.timeout(10_000) },
          );
          const imgBuf = Buffer.from(await imgRes.arrayBuffer());
          photoBase64 = `data:image/jpeg;base64,${imgBuf.toString('base64')}`;
        }
      }
    }
  } catch {
    // Photo fetch is best-effort
  }

  let nodeId = credentials['nodeId'] ? String(credentials['nodeId']) : null;
  if (!nodeId) {
    nodeId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    let canvas: Record<string, unknown> = { nodes: [], edges: [], workspaces: [] };
    if (existsSync(paths.canvas)) {
      try {
        canvas = JSON.parse(readFileSync(paths.canvas, 'utf-8')) as Record<string, unknown>;
      } catch {
        canvas = { nodes: [], edges: [], workspaces: [] };
      }
    }
    const nodes = (canvas['nodes'] ?? []) as Array<Record<string, unknown>>;
    nodes.push({
      id: nodeId,
      platform: 'telegram',
      label: `@${botUsername}`,
      photo: photoBase64,
      position: { x: 200, y: 200 },
      status: 'connected',
      credentials: `channel_token_${nodeId}`,
      meta: { botId: String(botId), userId: String(userId), firstName },
    });
    canvas['nodes'] = nodes;
    writeFileSync(paths.canvas, JSON.stringify(canvas, null, 2), 'utf-8');
  }

  await vaultStore(`channel_token_${nodeId}`, token);

  const profiles = readProfiles();
  profiles[nodeId] = {
    platform: 'telegram',
    botId,
    username: botUsername,
    firstName,
    photo: photoBase64,
    userId,
    connectedAt: new Date().toISOString(),
  };
  writeProfiles(profiles);

  const config = readConfig();
  const allUserIds = new Set<number>([userId]);
  for (const [, prof] of Object.entries(profiles)) {
    const p = prof as Record<string, unknown>;
    if (p['platform'] === 'telegram' && typeof p['userId'] === 'number') {
      allUserIds.add(p['userId'] as number);
    }
  }
  const channels = (config['channels'] ?? {}) as Record<string, unknown>;
  channels['telegram'] = { enabled: true, allowedUserIds: [...allUserIds] };
  config['channels'] = channels;
  writeConfig(config);

  restartDaemon();
  return { success: true, botUsername, firstName, photo: photoBase64, botId, nodeId };
}

export async function connectSlack(
  credentials: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const token = String(credentials['token'] ?? '');
  const signingSecret = String(credentials['signingSecret'] ?? '');
  if (!token || !signingSecret) {
    return { success: false, error: 'Bot token and signing secret required' };
  }

  const res = await fetch('https://slack.com/api/auth.test', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json()) as {
    ok: boolean;
    error?: string;
    team_id?: string;
    team?: string;
    user_id?: string;
    bot_id?: string;
  };

  if (!body.ok) {
    return { success: false, error: body.error ?? 'Invalid Slack credentials' };
  }

  await vaultStore('slack_bot_token', token);
  await vaultStore('slack_signing_secret', signingSecret);
  const slackNodeId = credentials['nodeId'] ? String(credentials['nodeId']) : null;
  if (slackNodeId) {
    await vaultStore(`channel_token_${slackNodeId}`, token);
    await vaultStore(`channel_signing_${slackNodeId}`, signingSecret);
  }

  const config = readConfig();
  const channels = (config['channels'] ?? {}) as Record<string, unknown>;
  channels['slack'] = {
    enabled: true,
    workspaceId: body.team_id ?? '',
    botUserId: body.user_id ?? '',
  };
  config['channels'] = channels;
  writeConfig(config);

  restartDaemon();
  return {
    success: true,
    teamName: body.team ?? 'Slack',
    teamId: body.team_id ?? '',
    botUserId: body.user_id ?? '',
  };
}

export async function connectWhatsApp(
  credentials: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const phoneNumberId = String(credentials['phoneNumberId'] ?? '');
  const accessToken = String(credentials['accessToken'] ?? '');
  if (!phoneNumberId || !accessToken) {
    return { success: false, error: 'Phone number ID and access token required' };
  }

  const res = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json()) as {
    id?: string;
    display_phone_number?: string;
    verified_name?: string;
    error?: { message: string };
  };

  if (body.error) {
    return { success: false, error: body.error.message };
  }

  await vaultStore('whatsapp_access_token', accessToken);
  const waNodeId = credentials['nodeId'] ? String(credentials['nodeId']) : null;
  if (waNodeId) {
    await vaultStore(`channel_token_${waNodeId}`, accessToken);
  }

  const appSecret = String(credentials['appSecret'] ?? '');
  if (appSecret) {
    await vaultStore('whatsapp_app_secret', appSecret);
    if (waNodeId) {
      await vaultStore(`whatsapp_app_secret_${waNodeId}`, appSecret);
    }
  }
  const verifyToken = randomBytes(16).toString('hex');
  await vaultStore('whatsapp_verify_token', verifyToken);
  if (waNodeId) {
    await vaultStore(`whatsapp_verify_token_${waNodeId}`, verifyToken);
  }

  const config = readConfig();
  const channels = (config['channels'] ?? {}) as Record<string, unknown>;
  const webhookPort = Number(credentials['webhookPort']) || 9090;
  channels['whatsapp'] = { enabled: true, phoneNumberId, webhookPort };
  config['channels'] = channels;
  writeConfig(config);

  restartDaemon();
  return {
    success: true,
    displayName: body.verified_name ?? body.display_phone_number ?? 'WhatsApp',
  };
}

export async function connectDiscord(
  credentials: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const token = String(credentials['token'] ?? '');
  if (!token) {
    return { success: false, error: 'Bot token required' };
  }

  const res = await fetch('https://discord.com/api/v10/users/@me', {
    headers: { Authorization: `Bot ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json()) as {
    id?: string;
    username?: string;
    discriminator?: string;
    avatar?: string;
    message?: string;
  };

  if (!res.ok || !body.id) {
    return { success: false, error: body.message ?? 'Invalid Discord bot token' };
  }

  let photoBase64: string | null = null;
  if (body.avatar) {
    try {
      const avatarUrl = `https://cdn.discordapp.com/avatars/${body.id}/${body.avatar}.png?size=128`;
      const imgRes = await fetch(avatarUrl, { signal: AbortSignal.timeout(10_000) });
      const imgBuf = Buffer.from(await imgRes.arrayBuffer());
      photoBase64 = `data:image/png;base64,${imgBuf.toString('base64')}`;
    } catch {
      // Avatar fetch is best-effort
    }
  }

  await vaultStore('discord_bot_token', token);
  const discordNodeId = credentials['nodeId'] ? String(credentials['nodeId']) : null;
  if (discordNodeId) {
    await vaultStore(`channel_token_${discordNodeId}`, token);
  }

  const config = readConfig();
  const channels = (config['channels'] ?? {}) as Record<string, unknown>;
  channels['discord'] = { enabled: true, botUserId: body.id };
  config['channels'] = channels;
  writeConfig(config);

  restartDaemon();
  return {
    success: true,
    botUsername: body.username ?? 'Discord Bot',
    botId: body.id,
    photo: photoBase64,
  };
}

export async function connectEmail(
  credentials: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const imapHost = String(credentials['imapHost'] ?? '');
  const smtpHost = String(credentials['smtpHost'] ?? '');
  const username = String(credentials['username'] ?? '');
  const password = String(credentials['password'] ?? '');
  const imapPort = Number(credentials['imapPort']) || 993;
  const smtpPort = Number(credentials['smtpPort']) || 587;

  if (!imapHost || !username || !password) {
    return { success: false, error: 'IMAP host, username, and password required' };
  }

  await vaultStore('email_password', password);
  const emailNodeId = credentials['nodeId'] ? String(credentials['nodeId']) : null;
  if (emailNodeId) {
    await vaultStore(`channel_token_${emailNodeId}`, password);
  }

  const config = readConfig();
  const channels = (config['channels'] ?? {}) as Record<string, unknown>;
  channels['email'] = {
    enabled: true,
    imapHost,
    imapPort,
    smtpHost: smtpHost || imapHost,
    smtpPort,
    username,
    tls: true,
  };
  config['channels'] = channels;
  writeConfig(config);

  restartDaemon();
  return { success: true, displayName: username };
}
