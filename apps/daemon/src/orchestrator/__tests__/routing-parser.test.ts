import { describe, it, expect } from 'vitest';
import { parseRoutingResponse } from '../routing-parser.js';

describe('parseRoutingResponse', () => {
  it('parses a valid reply action', () => {
    const raw = JSON.stringify({ actions: [{ type: 'reply', content: 'Hello there' }] });
    const result = parseRoutingResponse(raw);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toEqual({ type: 'reply', content: 'Hello there' });
  });

  it('parses a valid forward action', () => {
    const raw = JSON.stringify({
      actions: [{ type: 'forward', targetNodeId: 'node-1', content: 'Please handle this' }],
    });
    const result = parseRoutingResponse(raw);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toEqual({
      type: 'forward',
      targetNodeId: 'node-1',
      content: 'Please handle this',
    });
  });

  it('parses an assign action with valid priority', () => {
    const raw = JSON.stringify({
      actions: [{ type: 'assign', targetNodeId: 'node-2', task: 'Do research', priority: 'high' }],
    });
    const result = parseRoutingResponse(raw);
    expect(result.actions[0]).toEqual({
      type: 'assign',
      targetNodeId: 'node-2',
      task: 'Do research',
      priority: 'high',
    });
  });

  it('defaults assign priority to normal for invalid priority', () => {
    const raw = JSON.stringify({
      actions: [
        { type: 'assign', targetNodeId: 'node-2', task: 'Do research', priority: 'critical' },
      ],
    });
    const result = parseRoutingResponse(raw);
    expect(result.actions[0]).toEqual({
      type: 'assign',
      targetNodeId: 'node-2',
      task: 'Do research',
      priority: 'normal',
    });
  });

  it('parses a notify action', () => {
    const raw = JSON.stringify({
      actions: [{ type: 'notify', targetNodeId: 'node-3', summary: 'Task complete' }],
    });
    const result = parseRoutingResponse(raw);
    expect(result.actions[0]).toEqual({
      type: 'notify',
      targetNodeId: 'node-3',
      summary: 'Task complete',
    });
  });

  it('parses a send_to_all action', () => {
    const raw = JSON.stringify({
      actions: [{ type: 'send_to_all', workspaceId: 'ws-1', content: 'Announcement' }],
    });
    const result = parseRoutingResponse(raw);
    expect(result.actions[0]).toEqual({
      type: 'send_to_all',
      workspaceId: 'ws-1',
      content: 'Announcement',
    });
  });

  it('parses a learn action with topics', () => {
    const raw = JSON.stringify({
      actions: [{ type: 'learn', fact: 'User prefers dark mode', topics: ['preferences', 'ui'] }],
    });
    const result = parseRoutingResponse(raw);
    expect(result.actions[0]).toEqual({
      type: 'learn',
      fact: 'User prefers dark mode',
      topics: ['preferences', 'ui'],
    });
  });

  it('parses a learn action without topics, defaults to empty array', () => {
    const raw = JSON.stringify({ actions: [{ type: 'learn', fact: 'Something important' }] });
    const result = parseRoutingResponse(raw);
    expect(result.actions[0]).toEqual({
      type: 'learn',
      fact: 'Something important',
      topics: [],
    });
  });

  it('parses a group_message action', () => {
    const raw = JSON.stringify({
      actions: [{ type: 'group_message', workspaceId: 'ws-1', content: 'Group update' }],
    });
    const result = parseRoutingResponse(raw);
    expect(result.actions[0]).toEqual({
      type: 'group_message',
      workspaceId: 'ws-1',
      content: 'Group update',
    });
  });

  it('parses a use_tool action', () => {
    const raw = JSON.stringify({
      actions: [
        {
          type: 'use_tool',
          integration: 'notion:default',
          tool: 'API-post-search',
          arguments: { query: 'test' },
          content: 'Searching Notion',
        },
      ],
    });
    const result = parseRoutingResponse(raw);
    expect(result.actions[0]).toEqual({
      type: 'use_tool',
      integration: 'notion:default',
      tool: 'API-post-search',
      arguments: { query: 'test' },
      content: 'Searching Notion',
    });
  });

  it('parses a conclude action', () => {
    const raw = JSON.stringify({
      actions: [{ type: 'conclude', content: 'Final debate summary' }],
    });
    const result = parseRoutingResponse(raw);
    expect(result.actions[0]).toEqual({ type: 'conclude', content: 'Final debate summary' });
  });

  it('parses multiple actions in a single response', () => {
    const raw = JSON.stringify({
      actions: [
        { type: 'reply', content: 'Acknowledged' },
        { type: 'forward', targetNodeId: 'node-2', content: 'Handle this' },
      ],
    });
    const result = parseRoutingResponse(raw);
    expect(result.actions).toHaveLength(2);
    expect(result.actions[0]!.type).toBe('reply');
    expect(result.actions[1]!.type).toBe('forward');
  });

  it('returns empty actions for malformed JSON', () => {
    const result = parseRoutingResponse('not valid json at all');
    expect(result.actions).toHaveLength(0);
  });

  it('returns empty actions when no JSON object is found', () => {
    const result = parseRoutingResponse('just plain text without braces');
    expect(result.actions).toHaveLength(0);
  });

  it('extracts JSON embedded in surrounding text', () => {
    const raw = `Here is my decision:\n${JSON.stringify({ actions: [{ type: 'reply', content: 'Hi' }] })}\nEnd of response.`;
    const result = parseRoutingResponse(raw);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toEqual({ type: 'reply', content: 'Hi' });
  });

  it('returns empty actions when actions array is missing', () => {
    const result = parseRoutingResponse(JSON.stringify({ type: 'reply', content: 'hi' }));
    expect(result.actions).toHaveLength(0);
  });

  it('returns empty actions when response is null-like', () => {
    const result = parseRoutingResponse('{ "actions": null }');
    expect(result.actions).toHaveLength(0);
  });

  it('filters out unknown action types', () => {
    const raw = JSON.stringify({
      actions: [
        { type: 'unknown_action', content: 'test' },
        { type: 'reply', content: 'valid' },
      ],
    });
    const result = parseRoutingResponse(raw);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]!.type).toBe('reply');
  });

  it('filters out reply without content', () => {
    const raw = JSON.stringify({ actions: [{ type: 'reply' }] });
    const result = parseRoutingResponse(raw);
    expect(result.actions).toHaveLength(0);
  });

  it('filters out forward without targetNodeId', () => {
    const raw = JSON.stringify({ actions: [{ type: 'forward', content: 'test' }] });
    const result = parseRoutingResponse(raw);
    expect(result.actions).toHaveLength(0);
  });

  it('filters out forward without content', () => {
    const raw = JSON.stringify({ actions: [{ type: 'forward', targetNodeId: 'n1' }] });
    const result = parseRoutingResponse(raw);
    expect(result.actions).toHaveLength(0);
  });

  it('filters out notify without summary', () => {
    const raw = JSON.stringify({ actions: [{ type: 'notify', targetNodeId: 'n1' }] });
    const result = parseRoutingResponse(raw);
    expect(result.actions).toHaveLength(0);
  });

  it('defaults use_tool arguments to empty object when missing', () => {
    const raw = JSON.stringify({
      actions: [
        { type: 'use_tool', integration: 'notion:default', tool: 'search', content: 'Searching' },
      ],
    });
    const result = parseRoutingResponse(raw);
    expect(result.actions[0]).toEqual({
      type: 'use_tool',
      integration: 'notion:default',
      tool: 'search',
      arguments: {},
      content: 'Searching',
    });
  });
});
