import { invoke } from '@tauri-apps/api/core';

export interface OAuthStartResult {
  readonly started: boolean;
  readonly error?: string;
}

export interface OAuthCompleteResult {
  readonly success: boolean;
  readonly error?: string;
}

export interface ValidationResult {
  readonly valid: boolean;
}

export interface ClientInfo {
  readonly name: string;
  readonly detected: boolean;
}

export interface LocalProvider {
  readonly name: string;
  readonly baseUrl: string;
  readonly running: boolean;
}

export function startOauth(): Promise<OAuthStartResult> {
  return invoke<OAuthStartResult>('start_oauth');
}

export function completeOauth(code: string): Promise<OAuthCompleteResult> {
  return invoke<OAuthCompleteResult>('complete_oauth', { code });
}

export function validateKey(provider: string, apiKey: string): Promise<ValidationResult> {
  return invoke<ValidationResult>('validate_key', { provider, apiKey });
}

export function configure(opts: {
  mode: string;
  provider: string;
  apiKey: string;
  localBaseUrl: string;
}): Promise<void> {
  return invoke('configure', { opts });
}

export function detectClients(): Promise<ClientInfo[]> {
  return invoke<ClientInfo[]>('detect_clients');
}

export function detectLocalProviders(): Promise<LocalProvider[]> {
  return invoke<LocalProvider[]>('detect_local_providers');
}

export function openExternal(url: string): Promise<void> {
  return invoke('open_external', { url });
}
