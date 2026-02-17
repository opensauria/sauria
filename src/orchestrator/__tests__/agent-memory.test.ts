import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { applySchema } from '../../db/schema.js';
import { AgentMemory } from '../agent-memory.js';
import type { RecordedMessage } from '../agent-memory.js';

describe('AgentMemory', () => {
  let db: Database.Database;
  let memory: AgentMemory;

  beforeEach(() => {
    db = new Database(':memory:');
    applySchema(db);
    memory = new AgentMemory(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('storeFact / getAgentFacts', () => {
    it('stores and retrieves facts for an agent', () => {
      memory.storeFact('node1', 'ws1', 'Customer prefers email', ['support', 'preferences'], 'conversation');
      memory.storeFact('node1', 'ws1', 'Budget approved for Q2', ['finance'], 'conversation');

      const facts = memory.getAgentFacts('node1', 10);

      expect(facts).toHaveLength(2);
      expect(facts).toContain('Customer prefers email');
      expect(facts).toContain('Budget approved for Q2');
    });

    it('respects limit parameter', () => {
      memory.storeFact('node1', null, 'Fact 1', [], 'test');
      memory.storeFact('node1', null, 'Fact 2', [], 'test');
      memory.storeFact('node1', null, 'Fact 3', [], 'test');

      const facts = memory.getAgentFacts('node1', 2);

      expect(facts).toHaveLength(2);
    });

    it('returns empty array for unknown node', () => {
      const facts = memory.getAgentFacts('nonexistent', 10);
      expect(facts).toHaveLength(0);
    });

    it('isolates facts between agents', () => {
      memory.storeFact('node1', null, 'Fact for node1', [], 'test');
      memory.storeFact('node2', null, 'Fact for node2', [], 'test');

      const facts1 = memory.getAgentFacts('node1', 10);
      const facts2 = memory.getAgentFacts('node2', 10);

      expect(facts1).toEqual(['Fact for node1']);
      expect(facts2).toEqual(['Fact for node2']);
    });
  });

  describe('getWorkspaceFacts', () => {
    it('retrieves facts scoped to a workspace', () => {
      memory.storeFact('node1', 'ws1', 'Shared fact A', [], 'test');
      memory.storeFact('node2', 'ws1', 'Shared fact B', [], 'test');
      memory.storeFact('node3', 'ws2', 'Different workspace', [], 'test');

      const facts = memory.getWorkspaceFacts('ws1', 10);

      expect(facts).toHaveLength(2);
      expect(facts).toContain('Shared fact A');
      expect(facts).toContain('Shared fact B');
    });

    it('returns empty array for unknown workspace', () => {
      const facts = memory.getWorkspaceFacts('nonexistent', 10);
      expect(facts).toHaveLength(0);
    });
  });

  describe('recordMessage / getConversationHistory', () => {
    it('records and retrieves conversation messages', () => {
      const conversationId = memory.getOrCreateConversation('telegram', 'group1', ['node1']);

      const message: RecordedMessage = {
        conversationId,
        sourceNodeId: 'node1',
        senderId: 'user1',
        senderIsCeo: false,
        platform: 'telegram',
        groupId: 'group1',
        content: 'Hello there',
        contentType: 'text',
      };

      memory.recordMessage(message);

      const history = memory.getConversationHistory(conversationId, 10);

      expect(history).toHaveLength(1);
      expect(history[0]?.content).toBe('Hello there');
      expect(history[0]?.senderIsCeo).toBe(false);
      expect(history[0]?.sourceNodeId).toBe('node1');
    });

    it('returns messages in chronological order', () => {
      const conversationId = memory.getOrCreateConversation('telegram', 'group1', ['node1']);

      memory.recordMessage({
        conversationId,
        sourceNodeId: 'node1',
        senderId: 'user1',
        senderIsCeo: false,
        platform: 'telegram',
        groupId: 'group1',
        content: 'First message',
        contentType: 'text',
      });

      memory.recordMessage({
        conversationId,
        sourceNodeId: 'node1',
        senderId: 'user1',
        senderIsCeo: false,
        platform: 'telegram',
        groupId: 'group1',
        content: 'Second message',
        contentType: 'text',
      });

      const history = memory.getConversationHistory(conversationId, 10);

      expect(history).toHaveLength(2);
      expect(history[0]?.content).toBe('First message');
      expect(history[1]?.content).toBe('Second message');
    });

    it('respects limit on conversation history', () => {
      const conversationId = memory.getOrCreateConversation('telegram', null, ['node1']);

      for (let i = 0; i < 10; i++) {
        memory.recordMessage({
          conversationId,
          sourceNodeId: 'node1',
          senderId: 'user1',
          senderIsCeo: false,
          platform: 'telegram',
          groupId: null,
          content: `Message ${i}`,
          contentType: 'text',
        });
      }

      const history = memory.getConversationHistory(conversationId, 5);

      expect(history).toHaveLength(5);
      // Should return the 5 most recent, in chronological order
      expect(history[0]?.content).toBe('Message 5');
      expect(history[4]?.content).toBe('Message 9');
    });

    it('increments message count on conversation', () => {
      const conversationId = memory.getOrCreateConversation('telegram', 'group1', ['node1']);

      memory.recordMessage({
        conversationId,
        sourceNodeId: 'node1',
        senderId: 'user1',
        senderIsCeo: true,
        platform: 'telegram',
        groupId: 'group1',
        content: 'Test',
        contentType: 'text',
      });

      const row = db.prepare('SELECT message_count FROM agent_conversations WHERE id = ?').get(conversationId) as Record<string, unknown>;
      expect(row['message_count']).toBe(1);
    });
  });

  describe('getOrCreateConversation', () => {
    it('creates a new conversation for a group', () => {
      const id = memory.getOrCreateConversation('telegram', 'group1', ['node1', 'node2']);
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('returns existing conversation for same group', () => {
      const id1 = memory.getOrCreateConversation('telegram', 'group1', ['node1']);
      const id2 = memory.getOrCreateConversation('telegram', 'group1', ['node1']);
      expect(id1).toBe(id2);
    });

    it('creates separate conversations for different groups', () => {
      const id1 = memory.getOrCreateConversation('telegram', 'group1', ['node1']);
      const id2 = memory.getOrCreateConversation('telegram', 'group2', ['node1']);
      expect(id1).not.toBe(id2);
    });

    it('creates separate conversations for different platforms', () => {
      const id1 = memory.getOrCreateConversation('telegram', 'group1', ['node1']);
      const id2 = memory.getOrCreateConversation('slack', 'group1', ['node1']);
      expect(id1).not.toBe(id2);
    });

    it('handles DM conversations without groupId', () => {
      const id1 = memory.getOrCreateConversation('telegram', null, ['node1']);
      const id2 = memory.getOrCreateConversation('telegram', null, ['node1']);
      expect(id1).toBe(id2);
    });

    it('differentiates DM conversations by participant list', () => {
      const id1 = memory.getOrCreateConversation('telegram', null, ['node1']);
      const id2 = memory.getOrCreateConversation('telegram', null, ['node2']);
      expect(id1).not.toBe(id2);
    });

    it('sorts participant node IDs for consistent matching', () => {
      const id1 = memory.getOrCreateConversation('telegram', null, ['node2', 'node1']);
      const id2 = memory.getOrCreateConversation('telegram', null, ['node1', 'node2']);
      expect(id1).toBe(id2);
    });
  });
});
