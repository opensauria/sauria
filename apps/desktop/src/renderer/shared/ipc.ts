import { invoke } from '@tauri-apps/api/core';
import type { ConnectResult, TelegramStatus, StatusResult, IntegrationStatus } from './types.js';

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
  try {
    return await invoke<T>(cmd, args);
  } catch {
    return invoke<T>(cmd, args);
  }
}
