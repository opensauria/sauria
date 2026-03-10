import { describe, it, expect } from 'vitest';
import { parseForwardedContent, buildMessageSection } from '../forward-parser.js';
import type { InboundMessage, AgentNode } from '../types.js';

function makeNode(overrides: Partial<AgentNode> = {}): AgentNode {
  return {
    id: 'node-1',
    label: '@karl_bot',
    platform: 'telegram',
    role: 'specialist',
    autonomy: 'semi',
    status: 'connected',
    workspaceId: 'ws-1',
    ...overrides,
  } as AgentNode;
}

function makeMessage(overrides: Partial<InboundMessage> = {}): InboundMessage {
  return {
    sourceNodeId: 'node-1',
    senderId: 'user-1',
    senderIsOwner: true,
    platform: 'telegram',
    groupId: null,
    content: 'Hello',
    contentType: 'text',
    ...overrides,
  } as InboundMessage;
}

describe('parseForwardedContent', () => {
  it('returns null for non-forwarded content', () => {
    expect(parseForwardedContent('Just a normal message')).toBeNull();
  });

  it('parses forwarded content with sender label', () => {
    const content = '[Forwarded from @alice]\n[Message]:\nPlease review this';
    const result = parseForwardedContent(content);
    expect(result).not.toBeNull();
    expect(result!.senderLabel).toBe('@alice');
    expect(result!.actualMessage).toBe('Please review this');
  });

  it('parses reply content with sender label', () => {
    const content = '[Reply from @bob]\n[Message]:\nDone with the task';
    const result = parseForwardedContent(content);
    expect(result).not.toBeNull();
    expect(result!.senderLabel).toBe('@bob');
    expect(result!.actualMessage).toBe('Done with the task');
  });

  it('extracts context lines from forwarded content', () => {
    const content = [
      '[Forwarded from @alice]',
      '- User asked about pricing',
      '- Alice confirmed the rate',
      '',
      '[Message]:',
      'What do you think?',
    ].join('\n');
    const result = parseForwardedContent(content);
    expect(result).not.toBeNull();
    expect(result!.context).toEqual(['User asked about pricing', 'Alice confirmed the rate']);
    expect(result!.actualMessage).toBe('What do you think?');
  });

  it('returns empty context when no context lines', () => {
    const content = '[Forwarded from @alice]\n[Message]:\nDirect message';
    const result = parseForwardedContent(content);
    expect(result).not.toBeNull();
    expect(result!.context).toEqual([]);
  });

  it('returns content as actualMessage when no message marker', () => {
    const content = '[Forwarded from @alice] some raw text without marker';
    const result = parseForwardedContent(content);
    expect(result).not.toBeNull();
    expect(result!.senderLabel).toBe('@alice');
    expect(result!.context).toEqual([]);
    expect(result!.actualMessage).toBe(content);
  });
});

describe('buildMessageSection', () => {
  it('builds direct message section for non-forwarded messages', () => {
    const node = makeNode({ label: '@karl_bot', role: 'specialist' });
    const message = makeMessage({ content: 'Hello Karl', forwardDepth: 0 });
    const result = buildMessageSection(message, node);
    expect(result[0]).toContain('@karl_bot');
    expect(result[0]).toContain('specialist');
    expect(result[1]).toContain('Hello Karl');
  });

  it('builds forwarded message section with parsed content', () => {
    const node = makeNode({ label: '@karl_bot', role: 'specialist' });
    const content = '[Forwarded from @alice]\n[Message]:\nCan you help?';
    const message = makeMessage({ content, forwardDepth: 1 });
    const result = buildMessageSection(message, node);
    const joined = result.join('\n');
    expect(joined).toContain('@alice');
    expect(joined).toContain('Can you help?');
  });

  it('builds reply message section', () => {
    const node = makeNode({ label: '@karl_bot', role: 'specialist' });
    const content = '[Reply from @bob]\n[Message]:\nHere is my answer';
    const message = makeMessage({ content, forwardDepth: 1 });
    const result = buildMessageSection(message, node);
    const joined = result.join('\n');
    expect(joined).toContain('a reply from');
    expect(joined).toContain('@bob');
  });

  it('handles forwarded messages with context lines', () => {
    const node = makeNode();
    const content = [
      '[Forwarded from @alice]',
      '- Previous context item',
      '',
      '[Message]:',
      'The actual question',
    ].join('\n');
    const message = makeMessage({ content, forwardDepth: 1 });
    const result = buildMessageSection(message, node);
    const joined = result.join('\n');
    expect(joined).toContain('Previous context item');
    expect(joined).toContain('The actual question');
  });

  it('handles forwarded message without parseable forward metadata', () => {
    const node = makeNode({ label: '@karl_bot', role: 'specialist' });
    const message = makeMessage({ content: 'raw forwarded text', forwardDepth: 1 });
    const result = buildMessageSection(message, node);
    const joined = result.join('\n');
    expect(joined).toContain('a forwarded message');
    expect(joined).toContain('raw forwarded text');
  });
});
