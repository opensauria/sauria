import { invoke } from '@tauri-apps/api/core';
import type {
  ConnectResult,
  TelegramStatus,
  ChannelStatus,
  StatusResult,
  IntegrationStatus,
  PersonalMcpEntry,
} from './types.js';

export function connectChannel(
  platform: string,
  credentials: Record<string, unknown>,
): Promise<ConnectResult> {
  return invoke<ConnectResult>('connect_channel', { platform, credentials });
}

export function disconnectChannel(platform: string, nodeId: string): Promise<void> {
  return invoke('disconnect_channel', { platform, nodeId });
}

export function getTelegramStatus(): Promise<TelegramStatus> {
  return invoke<TelegramStatus>('get_telegram_status');
}

export function getSlackStatus(): Promise<ChannelStatus> {
  return invoke<ChannelStatus>('get_slack_status');
}

export function getDiscordStatus(): Promise<ChannelStatus> {
  return invoke<ChannelStatus>('get_discord_status');
}

export function getWhatsappStatus(): Promise<ChannelStatus> {
  return invoke<ChannelStatus>('get_whatsapp_status');
}

export function getEmailStatus(): Promise<ChannelStatus> {
  return invoke<ChannelStatus>('get_email_status');
}

export function personalMcpList(): Promise<PersonalMcpEntry[]> {
  return invoke<PersonalMcpEntry[]>('personal_mcp_list');
}

export interface PersonalMcpConnectPayload {
  readonly name: string;
  readonly transport: 'stdio' | 'remote';
  readonly command?: string;
  readonly args?: string[];
  readonly env?: Record<string, string>;
  readonly url?: string;
  readonly accessToken?: string;
}

export function personalMcpConnect(payload: PersonalMcpConnectPayload): Promise<PersonalMcpEntry> {
  return invoke<PersonalMcpEntry>('personal_mcp_connect', { payload });
}

export interface PersonalMcpUpdatePayload {
  readonly id: string;
  readonly name?: string;
  readonly command?: string;
  readonly args?: string[];
  readonly env?: Record<string, string>;
  readonly url?: string;
  readonly accessToken?: string;
}

export function personalMcpUpdate(payload: PersonalMcpUpdatePayload): Promise<PersonalMcpEntry> {
  return invoke<PersonalMcpEntry>('personal_mcp_update', { payload });
}

export function personalMcpDisconnect(id: string): Promise<void> {
  return invoke('personal_mcp_disconnect', { id });
}

export function navigateBack(): Promise<void> {
  return invoke('navigate_back');
}

export function getStatus(): Promise<StatusResult> {
  return invoke<StatusResult>('get_status');
}

export function listCatalog(): Promise<IntegrationStatus[]> {
  return invoke<IntegrationStatus[]>('integrations_list_catalog');
}

export function getIntegrationAccounts(): Promise<Record<string, string>> {
  return invoke<Record<string, string>>('get_integration_accounts');
}

export async function invokeWithRetry<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await invoke<T>(cmd, args);
    } catch (err: unknown) {
      if (attempt === 2) throw err;
      await new Promise<void>((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw new Error('unreachable');
}
