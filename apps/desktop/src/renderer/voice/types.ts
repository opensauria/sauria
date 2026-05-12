export type AssistantState = 'idle' | 'recording' | 'processing' | 'playing';

export interface ChatMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant' | 'error';
  readonly text: string;
}

export interface VoiceConfig {
  readonly port: number;
  readonly token: string;
  readonly running: boolean;
}

export interface SidecarResponse {
  readonly text: string;
  readonly audio: string;
  readonly transcription?: string;
  readonly actions: readonly SidecarAction[];
}

export interface SidecarAction {
  readonly type: string;
  readonly params: Record<string, unknown>;
}
