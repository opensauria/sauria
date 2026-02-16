import { secureFetch } from '../../security/url-allowlist.js';
import type { ChatMessage, ChatOptions, LLMProvider, StreamChunk } from './base.js';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

interface GeminiContent {
  readonly role: string;
  readonly parts: ReadonlyArray<{ readonly text: string }>;
}

interface GeminiCandidate {
  readonly content?: { readonly parts?: ReadonlyArray<{ readonly text?: string }> };
  readonly finishReason?: string;
}

interface GeminiStreamChunk {
  readonly candidates?: ReadonlyArray<GeminiCandidate>;
}

function isGeminiStreamChunk(value: unknown): value is GeminiStreamChunk {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  return 'candidates' in value || Object.keys(value).length === 0;
}

function toGeminiRole(role: string): string {
  if (role === 'assistant') {
    return 'model';
  }
  return 'user';
}

function buildGeminiContents(
  messages: ChatMessage[],
): GeminiContent[] {
  return messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: toGeminiRole(m.role),
      parts: [{ text: m.content }],
    }));
}

function extractSystemInstruction(
  messages: ChatMessage[],
  fallback?: string,
): { parts: ReadonlyArray<{ text: string }> } | undefined {
  const systemMessage = messages.find((m) => m.role === 'system');
  const text = systemMessage?.content ?? fallback;
  if (!text) {
    return undefined;
  }
  return { parts: [{ text }] };
}

async function* parseSSEStream(
  response: Response,
): AsyncGenerator<GeminiStreamChunk> {
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
        if (!trimmed.startsWith('data:')) {
          continue;
        }

        const jsonStr = trimmed.slice(5).trim();
        if (jsonStr === '[DONE]' || jsonStr === '') {
          continue;
        }

        const parsed: unknown = JSON.parse(jsonStr);
        if (isGeminiStreamChunk(parsed)) {
          yield parsed;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export class GoogleProvider implements LLMProvider {
  readonly name = 'google';
  readonly supportsStreaming = true;

  constructor(private readonly apiKey: string) {}

  async *chat(
    messages: ChatMessage[],
    options: ChatOptions,
  ): AsyncGenerator<StreamChunk> {
    const url = `${GEMINI_BASE_URL}/${options.model}:streamGenerateContent?alt=sse&key=${this.apiKey}`;

    const contents = buildGeminiContents(messages);
    const systemInstruction = extractSystemInstruction(messages, options.systemPrompt);

    const body = JSON.stringify({
      contents,
      systemInstruction,
      generationConfig: {
        temperature: options.temperature,
        maxOutputTokens: options.maxTokens ?? 4096,
      },
    });

    const response = await secureFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google API error ${response.status}: ${errorText}`);
    }

    for await (const chunk of parseSSEStream(response)) {
      const candidate = chunk.candidates?.[0];
      if (!candidate) {
        continue;
      }

      const text = candidate.content?.parts?.[0]?.text;
      if (text) {
        yield { text, done: false };
      }

      if (candidate.finishReason && candidate.finishReason !== 'STOP') {
        break;
      }
    }

    yield { text: '', done: true };
  }
}
