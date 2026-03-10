import { describe, it, expect, vi } from 'vitest';
import { buildReasoningPrompt, reasonAbout } from '../reason.js';

describe('buildReasoningPrompt', () => {
  it('creates system and user messages', () => {
    const messages = buildReasoningPrompt('context data', 'my question');
    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe('system');
    expect(messages[0]?.content).toContain('context data');
    expect(messages[1]?.role).toBe('user');
    expect(messages[1]?.content).toBe('my question');
  });

  it('includes instructions when provided', () => {
    const messages = buildReasoningPrompt('ctx', 'q', 'be concise');
    expect(messages[0]?.content).toContain('INSTRUCTIONS');
    expect(messages[0]?.content).toContain('be concise');
  });

  it('does not append extra instructions block when not provided', () => {
    const messages = buildReasoningPrompt('ctx', 'q');
    expect(messages[0]?.content).not.toContain('--- INSTRUCTIONS ---');
  });

  it('includes world context markers', () => {
    const messages = buildReasoningPrompt('my context', 'query');
    expect(messages[0]?.content).toContain('--- WORLD CONTEXT ---');
    expect(messages[0]?.content).toContain('--- END CONTEXT ---');
  });
});

describe('reasonAbout', () => {
  it('collects streamed chunks into result', async () => {
    const mockRouter = {
      reason: vi.fn(async function* () {
        yield { text: 'Hello', done: false };
        yield { text: ' world', done: false };
        yield { text: '', done: true };
      }),
    } as unknown as import('../router.js').ModelRouter;

    const result = await reasonAbout(mockRouter, 'context', 'question');
    expect(result).toBe('Hello world');
  });

  it('returns empty string when stream yields only done', async () => {
    const mockRouter = {
      reason: vi.fn(async function* () {
        yield { text: '', done: true };
      }),
    } as unknown as import('../router.js').ModelRouter;

    const result = await reasonAbout(mockRouter, '', '');
    expect(result).toBe('');
  });

  it('passes instructions through to prompt builder', async () => {
    const mockRouter = {
      reason: vi.fn(async function* () {
        yield { text: 'ok', done: true };
      }),
    } as unknown as import('../router.js').ModelRouter;

    await reasonAbout(mockRouter, 'ctx', 'q', 'custom instructions');
    const callArgs = vi.mocked(mockRouter.reason).mock.calls[0]?.[0];
    expect(callArgs?.[0]?.content).toContain('custom instructions');
  });
});
