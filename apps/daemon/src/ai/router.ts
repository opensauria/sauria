import type { SauriaConfig, ModelConfig } from '../config/schema.js';
import { CircuitBreaker } from '../orchestrator/circuit-breaker.js';
import { createLimiter, SECURITY_LIMITS } from '../security/rate-limiter.js';
import type { RateLimiter } from '../security/rate-limiter.js';
import type { ChatMessage, ChatOptions, LLMProvider, StreamChunk } from './providers/base.js';
import type { ExtractionResult } from './anti-injection.js';
import { EXTRACTION_SYSTEM_PROMPT, parseAIResponse } from './anti-injection.js';
import { createProvider, collectStream, PROVIDER_BASE_URLS } from './router-helpers.js';

export type CostCallback = (model: string, costUsd: number) => void;
export type ApiKeyGetter = (providerName: string) => string | Promise<string>;

export class ModelRouter {
  private readonly providers = new Map<string, LLMProvider>();
  private readonly breakers = new Map<string, CircuitBreaker>();
  private readonly extractionLimiter: RateLimiter;
  private readonly deepLimiter: RateLimiter;
  private onCost: CostCallback | undefined;

  constructor(
    private readonly config: SauriaConfig,
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
    const breaker = this.getBreaker(modelConfig.provider);
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

    const responseText = await breaker.execute(() =>
      collectStream(provider.chat(messages, options)),
    );
    this.reportCost(modelConfig.model, responseText.length);

    return parseAIResponse(responseText);
  }

  async *reason(messages: ChatMessage[]): AsyncGenerator<StreamChunk> {
    const modelConfig = this.config.models.reasoning;
    this.checkBreaker(modelConfig.provider);
    const provider = await this.resolveProvider(modelConfig);

    const options: ChatOptions = {
      model: modelConfig.model,
      temperature: 0.7,
      maxTokens: SECURITY_LIMITS.ai.maxTokensPerRequest,
    };

    try {
      yield* provider.chat(messages, options);
    } catch (err) {
      this.recordBreakerFailure(modelConfig.provider);
      throw err;
    }
  }

  async *deepAnalyze(messages: ChatMessage[]): AsyncGenerator<StreamChunk> {
    if (!this.deepLimiter.tryConsume()) {
      throw new Error('Deep analysis rate limit exceeded');
    }

    const modelConfig = this.config.models.deep;
    this.checkBreaker(modelConfig.provider);
    const provider = await this.resolveProvider(modelConfig);

    const options: ChatOptions = {
      model: modelConfig.model,
      temperature: 0.5,
      maxTokens: SECURITY_LIMITS.ai.maxTokensPerRequest,
    };

    try {
      yield* provider.chat(messages, options);
    } catch (err) {
      this.recordBreakerFailure(modelConfig.provider);
      throw err;
    }
  }

  getProvider(providerName: string, apiKey: string, baseUrl?: string): LLMProvider {
    const cacheKey = `${providerName}:${baseUrl ?? 'default'}`;
    const cached = this.providers.get(cacheKey);
    if (cached) return cached;

    const provider = createProvider(providerName, apiKey, baseUrl);
    this.providers.set(cacheKey, provider);
    return provider;
  }

  isProviderAvailable(providerName: string): boolean {
    const breaker = this.breakers.get(providerName);
    return !breaker || breaker.getState() !== 'open';
  }

  private getBreaker(providerName: string): CircuitBreaker {
    let breaker = this.breakers.get(providerName);
    if (!breaker) {
      breaker = new CircuitBreaker(3, 60_000);
      this.breakers.set(providerName, breaker);
    }
    return breaker;
  }

  private checkBreaker(providerName: string): void {
    const breaker = this.getBreaker(providerName);
    if (breaker.getState() === 'open') {
      throw new Error(`Provider ${providerName} circuit open — temporarily unavailable`);
    }
  }

  private recordBreakerFailure(providerName: string): void {
    const breaker = this.getBreaker(providerName);
    breaker.execute(() => Promise.reject(new Error('provider failure'))).catch(() => {});
  }

  private async resolveProvider(modelConfig: ModelConfig): Promise<LLMProvider> {
    const { provider: providerName, baseUrl } = modelConfig;
    const cacheKey = `${providerName}:${baseUrl ?? 'default'}`;

    const cached = this.providers.get(cacheKey);
    if (cached) return cached;

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
    if (!this.onCost) return;
    const estimatedCost = responseLength * 0.000001;
    this.onCost(model, estimatedCost);
  }
}
