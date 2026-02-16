import { secureFetch } from '../../security/url-allowlist.js';
import type { ChatMessage, ChatOptions, LLMProvider, StreamChunk } from './base.js';

const DEFAULT_OLLAMA_URL = 'http://localhost:11434';

interface OllamaChatChunk {
  readonly message?: { readonly content?: string };
  readonly done?: boolean;
}

interface OllamaEmbeddingResponse {
  readonly embedding?: number[];
}

function isOllamaChatChunk(value: unknown): value is OllamaChatChunk {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  return 'done' in value || 'message' in value;
}

function isOllamaEmbeddingResponse(value: unknown): value is OllamaEmbeddingResponse {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  return 'embedding' in value;
}

function toOllamaMessages(
  messages: ChatMessage[],
  systemPrompt?: string,
): Array<{ role: string; content: string }> {
  const result: Array<{ role: string; content: string }> = [];

  if (systemPrompt) {
    result.push({ role: 'system', content: systemPrompt });
  }

  for (const message of messages) {
    result.push({ role: message.role, content: message.content });
  }

  return result;
}

async function* parseNDJSONStream(response: Response): AsyncGenerator<OllamaChatChunk> {
  const body = response.body;
  if (!body) {
    return;
  }

  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }

        const parsed: unknown = JSON.parse(trimmed);
        if (isOllamaChatChunk(parsed)) {
          yield parsed;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export class OllamaProvider implements LLMProvider {
  readonly name = 'ollama';
  readonly supportsStreaming = true;
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? DEFAULT_OLLAMA_URL;
  }

  async *chat(messages: ChatMessage[], options: ChatOptions): AsyncGenerator<StreamChunk> {
    const url = `${this.baseUrl}/api/chat`;
    const ollamaMessages = toOllamaMessages(messages, options.systemPrompt);

    const body = JSON.stringify({
      model: options.model,
      messages: ollamaMessages,
      stream: true,
      options: {
        temperature: options.temperature,
        num_predict: options.maxTokens,
      },
    });

    const response = await secureFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error ${response.status}: ${errorText}`);
    }

    for await (const chunk of parseNDJSONStream(response)) {
      const content = chunk.message?.content;
      if (content) {
        yield { text: content, done: false };
      }

      if (chunk.done) {
        yield { text: '', done: true };
        return;
      }
    }

    yield { text: '', done: true };
  }

  async embed(text: string): Promise<number[]> {
    const url = `${this.baseUrl}/api/embeddings`;

    const body = JSON.stringify({
      model: 'nomic-embed-text',
      prompt: text,
    });

    const response = await secureFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama embeddings error ${response.status}: ${errorText}`);
    }

    const data: unknown = await response.json();
    if (!isOllamaEmbeddingResponse(data) || !data.embedding) {
      throw new Error('Invalid embedding response from Ollama');
    }

    return data.embedding;
  }
}
