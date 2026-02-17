import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import * as p from '@clack/prompts';
import { loadConfig, saveConfig } from '../config/loader.js';
import { paths } from '../config/paths.js';
import { secureFetch } from '../security/url-allowlist.js';
import { vaultStore } from '../security/vault-key.js';

interface TelegramUser {
  readonly id: number;
  readonly first_name: string;
  readonly username?: string;
}

interface GetMeResponse {
  readonly ok: boolean;
  readonly result?: TelegramUser;
}

function handleCancel(): never {
  p.cancel('Setup cancelled.');
  process.exit(0);
}

async function validateBotToken(token: string): Promise<TelegramUser> {
  const url = `https://api.telegram.org/bot${token}/getMe`;
  const response = await secureFetch(url);
  const body = (await response.json()) as GetMeResponse;

  if (!body.ok || !body.result) {
    throw new Error('Invalid bot token: Telegram API rejected it');
  }

  return body.result;
}

function generateNodeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function connectTelegram(): Promise<void> {
  p.intro('Connect Telegram');

  const token = await p.password({
    message: 'Enter your Telegram bot token (from @BotFather)',
  });
  if (p.isCancel(token)) handleCancel();

  const s = p.spinner();
  s.start('Validating token...');

  let botUser: TelegramUser;
  try {
    botUser = await validateBotToken(token);
    s.stop(`Bot verified: @${botUser.username ?? botUser.first_name}`);
  } catch (error) {
    s.stop('Validation failed');
    p.cancel(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const userIdInput = await p.text({
    message: 'Enter your Telegram user ID (numeric, from @userinfobot)',
    validate: (value) => {
      const parsed = parseInt(value, 10);
      if (Number.isNaN(parsed) || parsed <= 0) return 'Must be a positive integer';
      return undefined;
    },
  });
  if (p.isCancel(userIdInput)) handleCancel();

  const userId = parseInt(userIdInput, 10);

  s.start('Storing credentials...');

  const nodeId = generateNodeId();
  await vaultStore(`channel_token_${nodeId}`, token);

  // Create canvas node for the bot
  interface CanvasGraph {
    nodes: Array<Record<string, unknown>>;
    edges: Array<Record<string, unknown>>;
    workspaces: Array<Record<string, unknown>>;
  }

  let canvas: CanvasGraph = { nodes: [], edges: [], workspaces: [] };
  if (existsSync(paths.canvas)) {
    try {
      canvas = JSON.parse(readFileSync(paths.canvas, 'utf-8')) as CanvasGraph;
    } catch {
      canvas = { nodes: [], edges: [], workspaces: [] };
    }
  }

  const botUsername = botUser.username ?? botUser.first_name;
  canvas.nodes.push({
    id: nodeId,
    platform: 'telegram',
    label: `@${botUsername}`,
    photo: null,
    position: { x: 200, y: 200 },
    status: 'connected',
    credentials: `channel_token_${nodeId}`,
    meta: {
      botId: String(botUser.id),
      userId: String(userId),
      firstName: botUser.first_name,
    },
  });
  writeFileSync(paths.canvas, JSON.stringify(canvas, null, 2), 'utf-8');

  const config = await loadConfig();
  const updatedConfig = {
    ...config,
    channels: {
      ...config.channels,
      telegram: {
        ...config.channels.telegram,
        enabled: true,
        allowedUserIds: [userId],
      },
    },
  };
  await saveConfig(updatedConfig);
  s.stop('Credentials stored in vault, canvas node created');

  p.note(
    [
      `Bot: @${botUsername}`,
      `Node ID: ${nodeId}`,
      `Allowed user: ${String(userId)}`,
      `Voice transcription: ${config.channels.telegram.voice.enabled ? 'enabled' : 'disabled'}`,
      '',
      'Restart the daemon to activate:',
      '  openwind daemon',
    ].join('\n'),
    'Telegram connected',
  );

  p.outro('Done.');
}
