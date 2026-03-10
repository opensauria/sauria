import { describe, it, expect } from 'vitest';
import { parseOwnerCommand, OwnerCommandSchema } from '../owner-commands.js';

describe('parseOwnerCommand', () => {
  describe('promote', () => {
    it('parses /promote @agent full', () => {
      const result = parseOwnerCommand('/promote @karl full');
      expect(result.type).toBe('promote');
      expect(result.target).toBe('karl');
      expect('ownerCommand' in result && result.ownerCommand).toEqual({
        type: 'promote',
        agentId: 'karl',
        newAutonomy: 'full',
      });
    });

    it('parses /promote with supervised level', () => {
      const result = parseOwnerCommand('/promote @agent supervised');
      expect(result.type).toBe('promote');
      expect('ownerCommand' in result && result.ownerCommand.type).toBe('promote');
    });

    it('parses /promote with approval level', () => {
      const result = parseOwnerCommand('/promote @agent approval');
      expect(result.type).toBe('promote');
    });

    it('parses /promote with manual level', () => {
      const result = parseOwnerCommand('/promote @agent manual');
      expect(result.type).toBe('promote');
    });

    it('is case insensitive', () => {
      const result = parseOwnerCommand('/PROMOTE @karl FULL');
      expect(result.type).toBe('promote');
      expect(result.target).toBe('karl');
    });
  });

  describe('reassign', () => {
    it('parses /reassign @agent #workspace', () => {
      const result = parseOwnerCommand('/reassign @karl #marketing');
      expect(result.type).toBe('reassign');
      expect(result.target).toBe('karl');
      expect(result.message).toBe('marketing');
      expect('ownerCommand' in result && result.ownerCommand).toEqual({
        type: 'reassign',
        agentId: 'karl',
        newWorkspaceId: 'marketing',
      });
    });
  });

  describe('pause', () => {
    it('parses /pause #workspace', () => {
      const result = parseOwnerCommand('/pause #dev-team');
      expect(result.type).toBe('pause');
      expect(result.target).toBe('dev-team');
      expect('ownerCommand' in result && result.ownerCommand).toEqual({
        type: 'pause',
        workspaceId: 'dev-team',
      });
    });
  });

  describe('review', () => {
    it('parses /review @agent', () => {
      const result = parseOwnerCommand('/review @karl');
      expect(result.type).toBe('review');
      expect(result.target).toBe('karl');
      expect('ownerCommand' in result && result.ownerCommand).toEqual({
        type: 'review',
        agentId: 'karl',
      });
    });
  });

  describe('hire', () => {
    it('parses /hire telegram #workspace specialist', () => {
      const result = parseOwnerCommand('/hire telegram #sales specialist');
      expect(result.type).toBe('hire');
      expect(result.target).toBe('sales');
      expect('ownerCommand' in result && result.ownerCommand).toEqual({
        type: 'hire',
        platform: 'telegram',
        workspace: 'sales',
        role: 'specialist',
      });
    });

    it('parses /hire with different platforms', () => {
      const platforms = ['telegram', 'slack', 'whatsapp', 'discord', 'email', 'owner'] as const;
      for (const platform of platforms) {
        const result = parseOwnerCommand(`/hire ${platform} #ws lead`);
        expect(result.type).toBe('hire');
        if ('ownerCommand' in result) {
          expect(result.ownerCommand.type).toBe('hire');
        }
      }
    });

    it('parses /hire with different roles', () => {
      const roles = ['lead', 'specialist', 'observer', 'coordinator', 'assistant'] as const;
      for (const role of roles) {
        const result = parseOwnerCommand(`/hire telegram #ws ${role}`);
        expect(result.type).toBe('hire');
      }
    });
  });

  describe('fire', () => {
    it('parses /fire @agent', () => {
      const result = parseOwnerCommand('/fire @karl');
      expect(result.type).toBe('fire');
      expect(result.target).toBe('karl');
      expect('ownerCommand' in result && result.ownerCommand).toEqual({
        type: 'fire',
        agentId: 'karl',
      });
    });
  });

  describe('instruct (@agent)', () => {
    it('parses @agent with instruction', () => {
      const result = parseOwnerCommand('@karl do something important');
      expect(result.type).toBe('instruct');
      expect(result.target).toBe('karl');
      expect(result.message).toBe('do something important');
      expect('ownerCommand' in result && result.ownerCommand).toEqual({
        type: 'instruct',
        agentId: 'karl',
        instruction: 'do something important',
      });
    });

    it('parses @agent with empty instruction', () => {
      const result = parseOwnerCommand('@karl');
      expect(result.type).toBe('instruct');
      expect(result.target).toBe('karl');
      expect(result.message).toBe('');
    });
  });

  describe('broadcast (#workspace)', () => {
    it('parses #workspace with message', () => {
      const result = parseOwnerCommand('#marketing launch the campaign');
      expect(result.type).toBe('broadcast');
      expect(result.target).toBe('marketing');
      expect(result.message).toBe('launch the campaign');
      expect('ownerCommand' in result && result.ownerCommand).toEqual({
        type: 'broadcast',
        message: 'launch the campaign',
      });
    });
  });

  describe('unknown and edge cases', () => {
    it('returns unknown for empty input', () => {
      const result = parseOwnerCommand('');
      expect(result.type).toBe('unknown');
      expect(result.target).toBeNull();
    });

    it('returns unknown for whitespace-only input', () => {
      const result = parseOwnerCommand('   ');
      expect(result.type).toBe('unknown');
    });

    it('returns unknown for plain text without command prefix', () => {
      const result = parseOwnerCommand('hello world');
      expect(result.type).toBe('unknown');
      expect(result.message).toBe('hello world');
    });

    it('returns unknown for unrecognized slash command', () => {
      const result = parseOwnerCommand('/unknown_command arg');
      expect(result.type).toBe('unknown');
    });

    it('always sets parsed to true', () => {
      expect(parseOwnerCommand('').parsed).toBe(true);
      expect(parseOwnerCommand('/fire @x').parsed).toBe(true);
      expect(parseOwnerCommand('random text').parsed).toBe(true);
    });
  });
});

describe('OwnerCommandSchema', () => {
  it('validates instruct command', () => {
    const result = OwnerCommandSchema.safeParse({
      type: 'instruct',
      agentId: 'karl',
      instruction: 'do work',
    });
    expect(result.success).toBe(true);
  });

  it('validates reassign command', () => {
    const result = OwnerCommandSchema.safeParse({
      type: 'reassign',
      agentId: 'karl',
      newWorkspaceId: 'sales',
    });
    expect(result.success).toBe(true);
  });

  it('validates promote command with valid autonomy', () => {
    const levels = ['full', 'supervised', 'approval', 'manual'] as const;
    for (const level of levels) {
      const result = OwnerCommandSchema.safeParse({
        type: 'promote',
        agentId: 'karl',
        newAutonomy: level,
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects promote with invalid autonomy level', () => {
    const result = OwnerCommandSchema.safeParse({
      type: 'promote',
      agentId: 'karl',
      newAutonomy: 'invalid',
    });
    expect(result.success).toBe(false);
  });

  it('validates pause command', () => {
    const result = OwnerCommandSchema.safeParse({
      type: 'pause',
      workspaceId: 'dev',
    });
    expect(result.success).toBe(true);
  });

  it('validates broadcast command', () => {
    const result = OwnerCommandSchema.safeParse({
      type: 'broadcast',
      message: 'hello team',
    });
    expect(result.success).toBe(true);
  });

  it('validates review command', () => {
    const result = OwnerCommandSchema.safeParse({
      type: 'review',
      agentId: 'karl',
    });
    expect(result.success).toBe(true);
  });

  it('validates hire command', () => {
    const result = OwnerCommandSchema.safeParse({
      type: 'hire',
      platform: 'telegram',
      workspace: 'sales',
      role: 'specialist',
    });
    expect(result.success).toBe(true);
  });

  it('rejects hire with invalid platform', () => {
    const result = OwnerCommandSchema.safeParse({
      type: 'hire',
      platform: 'invalid',
      workspace: 'sales',
      role: 'specialist',
    });
    expect(result.success).toBe(false);
  });

  it('rejects hire with invalid role', () => {
    const result = OwnerCommandSchema.safeParse({
      type: 'hire',
      platform: 'telegram',
      workspace: 'sales',
      role: 'invalid',
    });
    expect(result.success).toBe(false);
  });

  it('validates fire command', () => {
    const result = OwnerCommandSchema.safeParse({
      type: 'fire',
      agentId: 'karl',
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown command type', () => {
    const result = OwnerCommandSchema.safeParse({
      type: 'unknown',
      agentId: 'karl',
    });
    expect(result.success).toBe(false);
  });
});
