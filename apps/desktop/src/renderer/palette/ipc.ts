import { invoke } from '@tauri-apps/api/core';

export function executeCommand(id: string): Promise<void> {
  return invoke('execute_command', { id });
}

export function hidePalette(): Promise<void> {
  return invoke('hide_palette');
}
