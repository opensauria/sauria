import type { OpenSauriaConfig, ModelConfig } from '../config/schema.js';
import { createLimiter, SECURITY_LIMITS } from '../security/rate-limiter.js';
import type { RateLimiter } from '../security/rate-limiter.js';
import type { ChatMessage, ChatOptions, LLMProvider, StreamChunk } from './providers/base.js';
import type { ExtractionResult } from './anti-injection.js';
import { EXTRACTION_SYSTEM_PROMPT, parseAIResponse } from './anti-injection.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { OpenAIProvider } from './providers/openai.js';
import { GoogleProvider } from './providers/google.js';
import { OllamaProvider } from './providers/ollama.js';
export type CostCallback = (model: string, costUsd: number) => void;
export type ApiKeyGetter = (providerName: string) => string | Promise<string>;

const PROVIDER_BASE_URLS: Readonly<Record<string, string>> = {
  openrouter: 'https://openrouter.ai/api/v1',
  together: 'https://api.together.xyz/v1',
  groq: 'https://api.groq.com/openai/v1',
  mistral: 'https://api.mistral.ai/v1',
};

export class ModelRouter {
  private readonly providers = new Map<string, LLMProvider>();
  private readonly extractionLimiter: RateLimiter;
  private readonly deepLimiter: RateLimiter;
  private onCost: CostCallback | undefined;

  constructor(
    private readonly config: OpenSauriaConfig,
    private readonly getApiKey: ApiKeyGetter,
  ) {
    this.extractionLimiter = createLimiter(
      'extraction',
      SECURITY_LIMITS.ai.extractionCallsPerHour,
      3_600_000,
    );
    this.deepLimiter = createLimiter(
      'deep',
      SECURITY_LIMITS.ai.deepReasoningCallsPerDay,
      86_400_000,
    );
  }

  onCostIncurred(callback: CostCallback): void {
    this.onCost = callback;
  }

  async extract(content: string): Promise<ExtractionResult> {
    if (!this.extractionLimiter.tryConsume()) {
      throw new Error('Extraction rate limit exceeded');
    }

    const modelConfig = this.config.models.extraction;
    const provider = await this.resolveProvider(modelConfig);

    const messages: ChatMessage[] = [
      { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
      { role: 'user', content },
    ];

    const options: ChatOptions = {
      model: modelConfig.model,
      temperature: 0,
      maxTokens: SECURITY_LIMITS.ai.maxTokensPerRequest,
    };

    const responseText = await collectStream(provider.chat(messages, options));
    this.reportCost(modelConfig.model, responseText.length);

    return parseAIResponse(responseText);
  }

  async *reason(messages: ChatMessage[]): AsyncGenerator<StreamChunk> {
    const modelConfig = this.config.models.reasoning;
    const provider = await this.resolveProvider(modelConfig);

    const options: ChatOptions = {
      model: modelConfig.model,
      temperature: 0.7,
      maxTokens: SECURITY_LIMITS.ai.maxTokensPerRequest,
    };

    yield* provider.chat(messages, options);
  }

  async *deepAnalyze(messages: ChatMessage[]): AsyncGenerator<StreamChunk> {
    if (!this.deepLimiter.tryConsume()) {
      throw new Error('Deep analysis rate limit exceeded');
    }

    const modelConfig = this.config.models.deep;
    const provider = await this.resolveProvider(modelConfig);

    const options: ChatOptions = {
      model: modelConfig.model,
      temperature: 0.5,
      maxTokens: SECURITY_LIMITS.ai.maxTokensPerRequest,
    };

    yield* provider.chat(messages, options);
  }

  getProvider(providerName: string, apiKey: string, baseUrl?: string): LLMProvider {
    const cacheKey = `${providerName}:${baseUrl ?? 'default'}`;
    const cached = this.providers.get(cacheKey);
    if (cached) {
      return cached;
    }

    const provider = createProvider(providerName, apiKey, baseUrl);
    this.providers.set(cacheKey, provider);
    return provider;
  }

  private async resolveProvider(modelConfig: ModelConfig): Promise<LLMProvider> {
    const { provider: providerName, baseUrl } = modelConfig;
    const cacheKey = `${providerName}:${baseUrl ?? 'default'}`;

    const cached = this.providers.get(cacheKey);
    if (cached) {
      return cached;
    }

    const apiKey =
      providerName === 'ollama' || providerName === 'local'
        ? ''
        : await this.getApiKey(providerName);

    const resolvedBaseUrl = baseUrl ?? PROVIDER_BASE_URLS[providerName];

    const provider = createProvider(providerName, apiKey, resolvedBaseUrl);
    this.providers.set(cacheKey, provider);
    return provider;
  }

  private reportCost(model: string, responseLength: number): void {
    if (!this.onCost) {
      return;
    }
    const estimatedCost = responseLength * 0.000001;
    this.onCost(model, estimatedCost);
  }
}

function createProvider(providerName: string, apiKey: string, baseUrl?: string): LLMProvider {
  switch (providerName) {
    case 'anthropic':
      return new AnthropicProvider(apiKey);
    case 'openai':
      return new OpenAIProvider(apiKey, baseUrl);
    case 'google':
      return new GoogleProvider(apiKey);
    case 'ollama':
    case 'local':
      return new OllamaProvider(baseUrl);
    case 'openrouter':
    case 'together':
    case 'groq':
    case 'mistral':
      return new OpenAIProvider(apiKey, baseUrl);
    default:
      throw new Error(`Unknown provider: ${providerName}`);
  }
}

async function collectStream(stream: AsyncGenerator<StreamChunk>): Promise<string> {
  let result = '';
  for await (const chunk of stream) {
    result += chunk.text;
  }
  return result;
}
