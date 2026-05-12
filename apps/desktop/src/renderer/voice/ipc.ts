import { invoke } from '@tauri-apps/api/core';
import type { VoiceConfig } from './types.js';

export async function getVoiceConfig(): Promise<VoiceConfig> {
  return invoke<VoiceConfig>('voice_get_config');
}

export async function startVoiceSidecar(): Promise<void> {
  return invoke('voice_start');
}

export async function stopVoiceSidecar(): Promise<void> {
  return invoke('voice_stop');
}

export async function restartVoiceSidecar(): Promise<void> {
  return invoke('voice_restart');
}
