import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ingestText, handleTextMessage, handleVoice, handleAsk, handleTeach } from '../telegram-handlers.js';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../security/sanitize.js', () => ({
  sanitizeChannelInput: vi.fn((text: string) => text),
}));

vi.mock('../../security/url-allowlist.js', () => ({
  secureFetch: vi.fn(),
}));

vi.mock('../../ai/reason.js', () => ({
  reasonAbout: vi.fn().mockResolvedValue('AI answer'),
}));

vi.mock('../../db/search.js', () => ({
  searchByKeyword: vi.fn().mockReturnValue([]),
}));

vi.mock('../../security/pii-scrubber.js', () => ({
  scrubPII: vi.fn((text: string) => text),
}));

function mockCtx(overrides?: Record<string, unknown>): {
  reply: ReturnType<typeof vi.fn>;
  from: { id: number };
  chat: { id: number };
  match: string;
  message: { text: string; voice?: { file_size: number; duration: number } };
  getFile: ReturnType<typeof vi.fn>;
} {
  return {
    reply: vi.fn().mockResolvedValue(undefined),
    from: { id: 123 },
    chat: { id: 456 },
    match: '',
    message: { text: 'test' },
    getFile: vi.fn(),
    ...overrides,
  };
}

function mockPipeline() {
  return { ingestEvent: vi.fn().mockResolvedValue(undefined) };
}

function mockAudit() {
  return { logAction: vi.fn() };
}

describe('ingestText', () => {
  it('calls pipeline.ingestEvent with source and content', async () => {
    const pipeline = mockPipeline();
    const audit = mockAudit();

    await ingestText(pipeline as never, audit as never, 'hello', 'telegram:text');

    expect(pipeline.ingestEvent).toHaveBeenCalledWith('telegram:text', {
      content: 'hello',
      timestamp: expect.any(String),
    });
  });

  it('logs audit error when pipeline throws', async () => {
    const pipeline = { ingestEvent: vi.fn().mockRejectedValue(new Error('fail')) };
    const audit = mockAudit();

    await ingestText(pipeline as never, audit as never, 'hello', 'telegram:text');

    expect(audit.logAction).toHaveBeenCalledWith(
      'telegram:ingest_error',
      expect.objectContaining({ source: 'telegram:text' }),
      { success: false },
    );
  });
});

describe('handleTextMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes to onInbound when nodeId and onInbound are present', async () => {
    const ctx = mockCtx();
    const onInbound = vi.fn();
    const deps = {
      pipeline: mockPipeline(),
      audit: mockAudit(),
      onInbound,
      nodeId: 'node-1',
      ownerId: 123,
      db: {} as never,
      router: {} as never,
    };

    await handleTextMessage(ctx as never, 'hello', deps as never);

    expect(onInbound).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceNodeId: 'node-1',
        platform: 'telegram',
        content: 'hello',
        contentType: 'text',
      }),
    );
  });

  it('falls back to handleAsk when no onInbound', async () => {
    const ctx = mockCtx();
    const deps = {
      pipeline: mockPipeline(),
      audit: mockAudit(),
      db: {} as never,
      router: {} as never,
    };

    await handleTextMessage(ctx as never, 'question?', deps as never);

    expect(ctx.reply).toHaveBeenCalledWith('AI answer');
  });
});

describe('handleVoice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('replies with error when transcription is null', async () => {
    const ctx = mockCtx();
    const deps = {
      token: 'tok',
      audit: mockAudit(),
      transcription: null,
      pipeline: mockPipeline(),
      db: {} as never,
      router: {} as never,
    };

    await handleVoice(ctx as never, deps as never);

    expect(ctx.reply).toHaveBeenCalledWith('Voice transcription is not enabled.');
  });

  it('returns early when no voice in message', async () => {
    const ctx = mockCtx({ message: { text: '' } });
    const deps = {
      token: 'tok',
      audit: mockAudit(),
      transcription: { transcribeVoice: vi.fn() },
      pipeline: mockPipeline(),
      db: {} as never,
      router: {} as never,
    };

    await handleVoice(ctx as never, deps as never);

    expect(deps.transcription.transcribeVoice).not.toHaveBeenCalled();
  });

  it('rejects voice messages that are too large', async () => {
    const ctx = mockCtx({
      message: { text: '', voice: { file_size: 25 * 1024 * 1024, duration: 60 } },
    });
    const deps = {
      token: 'tok',
      audit: mockAudit(),
      transcription: { transcribeVoice: vi.fn() },
      pipeline: mockPipeline(),
      db: {} as never,
      router: {} as never,
    };

    await handleVoice(ctx as never, deps as never);

    expect(ctx.reply).toHaveBeenCalledWith('Voice message too large (max 20 MB).');
  });
});

describe('handleAsk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('replies with AI answer on success', async () => {
    const ctx = mockCtx();
    const deps = {
      db: {} as never,
      router: {} as never,
      audit: mockAudit(),
    };

    await handleAsk(ctx as never, 'what is this?', deps as never);

    expect(ctx.reply).toHaveBeenCalledWith('AI answer');
  });

  it('replies with error message when reasonAbout throws', async () => {
    const { reasonAbout } = await import('../../ai/reason.js');
    (reasonAbout as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('AI down'));

    const ctx = mockCtx();
    const deps = {
      db: {} as never,
      router: {} as never,
      audit: mockAudit(),
    };

    await handleAsk(ctx as never, 'question', deps as never);

    expect(ctx.reply).toHaveBeenCalledWith('Sorry, I could not process that request right now.');
  });

  it('logs audit on success', async () => {
    const ctx = mockCtx();
    const audit = mockAudit();
    const deps = {
      db: {} as never,
      router: {} as never,
      audit,
    };

    await handleAsk(ctx as never, 'question', deps as never);

    expect(audit.logAction).toHaveBeenCalledWith('telegram:ask', expect.any(Object));
  });
});

describe('handleTeach', () => {
  it('ingests the fact and replies with confirmation', async () => {
    const ctx = mockCtx();
    const pipeline = mockPipeline();
    const audit = mockAudit();

    await handleTeach(ctx as never, 'sky is blue', { pipeline, audit } as never);

    expect(ctx.reply).toHaveBeenCalledWith('Learned: "sky is blue"');
    expect(audit.logAction).toHaveBeenCalledWith('telegram:teach', expect.any(Object));
  });
});

describe('handleTextMessage — owner detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks sender as owner when ctx.from.id matches ownerId', async () => {
    const ctx = mockCtx({ from: { id: 999 } });
    const onInbound = vi.fn();
    const deps = {
      pipeline: mockPipeline(),
      audit: mockAudit(),
      onInbound,
      nodeId: 'node-1',
      ownerId: 999,
      db: {} as never,
      router: {} as never,
    };

    await handleTextMessage(ctx as never, 'hello', deps as never);

    expect(onInbound).toHaveBeenCalledWith(
      expect.objectContaining({
        senderIsOwner: true,
        senderId: '999',
      }),
    );
  });

  it('marks sender as non-owner when ctx.from.id does not match ownerId', async () => {
    const ctx = mockCtx({ from: { id: 777 } });
    const onInbound = vi.fn();
    const deps = {
      pipeline: mockPipeline(),
      audit: mockAudit(),
      onInbound,
      nodeId: 'node-1',
      ownerId: 999,
      db: {} as never,
      router: {} as never,
    };

    await handleTextMessage(ctx as never, 'hello', deps as never);

    expect(onInbound).toHaveBeenCalledWith(
      expect.objectContaining({
        senderIsOwner: false,
      }),
    );
  });

  it('sets groupId from ctx.chat.id', async () => {
    const ctx = mockCtx({ chat: { id: 12345 } });
    const onInbound = vi.fn();
    const deps = {
      pipeline: mockPipeline(),
      audit: mockAudit(),
      onInbound,
      nodeId: 'node-1',
      ownerId: 123,
      db: {} as never,
      router: {} as never,
    };

    await handleTextMessage(ctx as never, 'hello', deps as never);

    expect(onInbound).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: '12345',
      }),
    );
  });
});

describe('handleVoice — successful transcription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('transcribes and routes to onInbound when available', async () => {
    const { secureFetch } = await import('../../security/url-allowlist.js');
    (secureFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
    });

    const ctx = mockCtx({
      message: { text: '', voice: { file_size: 1024, duration: 5 } },
      getFile: vi.fn().mockResolvedValue({ file_path: 'voice/file.ogg' }),
    });
    const onInbound = vi.fn();
    const transcription = { transcribeVoice: vi.fn().mockResolvedValue('transcribed text') };
    const deps = {
      token: 'tok',
      audit: mockAudit(),
      transcription,
      pipeline: mockPipeline(),
      onInbound,
      nodeId: 'node-1',
      ownerId: 123,
      db: {} as never,
      router: {} as never,
    };

    await handleVoice(ctx as never, deps as never);

    expect(onInbound).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'transcribed text',
        contentType: 'voice',
      }),
    );
  });

  it('falls back to handleAsk when no onInbound', async () => {
    const { secureFetch } = await import('../../security/url-allowlist.js');
    (secureFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
    });

    const ctx = mockCtx({
      message: { text: '', voice: { file_size: 1024, duration: 5 } },
      getFile: vi.fn().mockResolvedValue({ file_path: 'voice/file.ogg' }),
    });
    const transcription = { transcribeVoice: vi.fn().mockResolvedValue('voice text') };
    const deps = {
      token: 'tok',
      audit: mockAudit(),
      transcription,
      pipeline: mockPipeline(),
      db: {} as never,
      router: {} as never,
    };

    await handleVoice(ctx as never, deps as never);

    expect(ctx.reply).toHaveBeenCalledWith('AI answer');
  });

  it('handles transcription error gracefully', async () => {
    const { secureFetch } = await import('../../security/url-allowlist.js');
    (secureFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
    });

    const ctx = mockCtx({
      message: { text: '', voice: { file_size: 1024, duration: 5 } },
      getFile: vi.fn().mockResolvedValue({ file_path: 'voice/file.ogg' }),
    });
    const transcription = { transcribeVoice: vi.fn().mockRejectedValue(new Error('transcription failed')) };
    const audit = mockAudit();
    const deps = {
      token: 'tok',
      audit,
      transcription,
      pipeline: mockPipeline(),
      db: {} as never,
      router: {} as never,
    };

    await handleVoice(ctx as never, deps as never);

    expect(ctx.reply).toHaveBeenCalledWith('Failed to process voice message. Please try again.');
    expect(audit.logAction).toHaveBeenCalledWith(
      'telegram:voice_error',
      expect.objectContaining({ error: 'transcription failed' }),
      { success: false },
    );
  });
});

describe('handleAsk — audit on error', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs audit error with correct action on failure', async () => {
    const { reasonAbout } = await import('../../ai/reason.js');
    (reasonAbout as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('oops'));

    const ctx = mockCtx();
    const audit = mockAudit();
    const deps = {
      db: {} as never,
      router: {} as never,
      audit,
    };

    await handleAsk(ctx as never, 'question', deps as never);

    expect(audit.logAction).toHaveBeenCalledWith(
      'telegram:ask_error',
      expect.objectContaining({ error: 'oops' }),
      { success: false },
    );
  });
});
