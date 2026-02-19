/**
 * Local AI provider detection (Ollama, LM Studio, Open WebUI).
 */

export interface LocalProvider {
  readonly name: string;
  readonly baseUrl: string;
  readonly running: boolean;
}

const LOCAL_PROVIDER_ENDPOINTS = [
  { name: 'Ollama', baseUrl: 'http://localhost:11434' },
  { name: 'LM Studio', baseUrl: 'http://localhost:1234' },
  { name: 'Open WebUI', baseUrl: 'http://localhost:3000' },
] as const;

export async function detectLocalProviders(): Promise<LocalProvider[]> {
  const results: LocalProvider[] = [];

  for (const provider of LOCAL_PROVIDER_ENDPOINTS) {
    let running = false;
    try {
      const res = await fetch(provider.baseUrl, { signal: AbortSignal.timeout(2000) });
      running = res.ok || res.status < 500;
    } catch {
      running = false;
    }
    results.push({ ...provider, running });
  }

  return results;
}
