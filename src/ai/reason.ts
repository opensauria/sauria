import type { ModelRouter } from './router.js';
import type { ChatMessage } from './providers/base.js';

const REASONING_SYSTEM_PROMPT = `You are a reasoning engine for a personal knowledge system.
You have access to the user's world model context below.
Answer questions by synthesizing information from the context.
Be precise, cite specific entities and relationships when relevant.
If the context is insufficient, say so clearly.`;

export function buildReasoningPrompt(context: string, query: string, instructions?: string): ChatMessage[] {
  let systemContent = `${REASONING_SYSTEM_PROMPT}\n\n--- WORLD CONTEXT ---\n${context}\n--- END CONTEXT ---`;
  if (instructions) {
    systemContent += `\n\n--- INSTRUCTIONS ---\n${instructions}`;
  }
  return [
    {
      role: 'system',
      content: systemContent,
    },
    {
      role: 'user',
      content: query,
    },
  ];
}

export async function reasonAbout(
  router: ModelRouter,
  context: string,
  query: string,
  instructions?: string,
): Promise<string> {
  const messages = buildReasoningPrompt(context, query, instructions);
  let result = '';

  for await (const chunk of router.reason(messages)) {
    result += chunk.text;
  }

  return result;
}
