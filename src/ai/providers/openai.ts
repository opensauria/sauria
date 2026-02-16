import OpenAI from 'openai';
import type { ChatMessage, ChatOptions, LLMProvider, StreamChunk } from './base.js';

type OpenAIRole = 'system' | 'user' | 'assistant';

function toOpenAIMessages(
  messages: ChatMessage[],
  systemPrompt?: string,
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const result: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

  if (systemPrompt) {
    result.push({ role: 'system', content: systemPrompt });
  }

  for (const message of messages) {
    result.push({
      role: message.role as OpenAIRole,
      content: message.content,
    });
  }

  return result;
}

export class OpenAIProvider implements LLMProvider {
  readonly name: string;
  readonly supportsStreaming = true;
  private readonly client: OpenAI;

  constructor(apiKey: string, baseUrl?: string) {
    this.name = baseUrl ? 'openai-compatible' : 'openai';
    this.client = new OpenAI({
      apiKey,
      baseURL: baseUrl,
    });
  }

  async *chat(
    messages: ChatMessage[],
    options: ChatOptions,
  ): AsyncGenerator<StreamChunk> {
    const openAIMessages = toOpenAIMessages(messages, options.systemPrompt);

    const stream = await this.client.chat.completions.create({
      model: options.model,
      messages: openAIMessages,
      temperature: options.temperature,
      max_tokens: options.maxTokens ?? 4096,
      stream: true,
    });

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) {
        continue;
      }

      const content = choice.delta.content;
      if (choice.finish_reason !== null) {
        if (content) {
          yield { text: content, done: false };
        }
        yield { text: '', done: true };
        return;
      }

      if (content) {
        yield { text: content, done: false };
      }
    }

    yield { text: '', done: true };
  }
}
