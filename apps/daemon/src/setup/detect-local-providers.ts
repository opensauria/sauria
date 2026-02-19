export interface LocalProvider {
  readonly name: string;
  readonly baseUrl: string;
  readonly running: boolean;
}

const LOCAL_PROVIDERS = [
  { name: 'Ollama', baseUrl: 'http://localhost:11434' },
  { name: 'LM Studio', baseUrl: 'http://localhost:1234' },
  { name: 'Open WebUI', baseUrl: 'http://localhost:3000' },
] as const;

async function isReachable(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/v1/models`, {
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    // Some providers use different endpoints
    try {
      const response = await fetch(baseUrl, {
        signal: AbortSignal.timeout(3000),
      });
      return response.ok || response.status === 404;
    } catch {
      return false;
    }
  }
}

export async function detectLocalProviders(): Promise<LocalProvider[]> {
  const results = await Promise.all(
    LOCAL_PROVIDERS.map(async (p) => ({
      name: p.name,
      baseUrl: p.baseUrl,
      running: await isReachable(p.baseUrl),
    })),
  );
  return results;
}

export async function findRunningLocalProvider(): Promise<LocalProvider | null> {
  const providers = await detectLocalProviders();
  return providers.find((p) => p.running) ?? null;
}
