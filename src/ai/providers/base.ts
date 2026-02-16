export interface ChatMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

export interface ChatOptions {
  readonly model: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly systemPrompt?: string;
}

export interface StreamChunk {
  readonly text: string;
  readonly done: boolean;
}

export interface LLMProvider {
  readonly name: string;
  readonly supportsStreaming: boolean;
  chat(
    messages: ChatMessage[],
    options: ChatOptions,
  ): AsyncGenerator<StreamChunk>;
  embed?(text: string): Promise<number[]>;
}
