import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import type { ChatMessage, ChatOptions, LLMProvider, StreamChunk } from './base.js';

function toAnthropicMessages(messages: ChatMessage[]): MessageParam[] {
  return messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));
}

function extractSystemPrompt(messages: ChatMessage[], fallback?: string): string | undefined {
  const systemMessage = messages.find((m) => m.role === 'system');
  return systemMessage?.content ?? fallback;
}

const OAUTH_TOKEN_PREFIX = 'sk-ant-oat01-';
const OAUTH_BETA_HEADER = 'oauth-2025-04-20';

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  readonly supportsStreaming = true;
  private readonly client: Anthropic;

  constructor(apiKeyOrToken: string) {
    if (apiKeyOrToken.startsWith(OAUTH_TOKEN_PREFIX)) {
      this.client = new Anthropic({
        authToken: apiKeyOrToken,
        defaultHeaders: { 'anthropic-beta': OAUTH_BETA_HEADER },
      });
    } else {
      this.client = new Anthropic({ apiKey: apiKeyOrToken });
    }
  }

  async *chat(messages: ChatMessage[], options: ChatOptions): AsyncGenerator<StreamChunk> {
    const systemPrompt = extractSystemPrompt(messages, options.systemPrompt);
    const anthropicMessages = toAnthropicMessages(messages);

    const stream = this.client.messages.stream({
      model: options.model,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature,
      system: systemPrompt,
      messages: anthropicMessages,
    });

    for await (const event of stream) {
      if (event.type !== 'content_block_delta') {
        continue;
      }

      if (event.delta.type !== 'text_delta') {
        continue;
      }

      yield { text: event.delta.text, done: false };
    }

    yield { text: '', done: true };
  }
}
