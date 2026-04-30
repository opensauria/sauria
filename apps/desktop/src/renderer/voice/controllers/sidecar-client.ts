import type { SidecarResponse } from '../types.js';

const DEFAULT_PORT = 8100;
const REQUEST_TIMEOUT_MS = 120_000;

export class SidecarClient {
  private port: number;
  private token: string;

  constructor(port: number = DEFAULT_PORT, token: string = '') {
    this.port = port;
    this.token = token;
  }

  configure(port: number, token: string): void {
    this.port = port;
    this.token = token;
  }

  private get baseUrl(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
    };
  }

  async health(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/health`, {
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async sendAudio(wavBlob: Blob): Promise<SidecarResponse> {
    const formData = new FormData();
    formData.append('file', wavBlob, 'recording.wav');

    const response = await fetch(`${this.baseUrl}/api/chat/audio`, {
      method: 'POST',
      headers: this.headers(),
      body: formData,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Sidecar error: ${response.status}`);
    }

    const data = await response.json();
    return {
      text: data.text ?? '',
      audio: data.audio ?? '',
      transcription: data.transcription ?? undefined,
      actions: data.actions ?? [],
    };
  }

  async sendText(text: string): Promise<SidecarResponse> {
    const response = await fetch(`${this.baseUrl}/api/chat/text`, {
      method: 'POST',
      headers: {
        ...this.headers(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Sidecar error: ${response.status}`);
    }

    const data = await response.json();
    return {
      text: data.text ?? '',
      audio: data.audio ?? '',
      actions: data.actions ?? [],
    };
  }

  async clearHistory(): Promise<void> {
    await fetch(`${this.baseUrl}/api/chat/history`, {
      method: 'DELETE',
      headers: this.headers(),
    });
  }
}
