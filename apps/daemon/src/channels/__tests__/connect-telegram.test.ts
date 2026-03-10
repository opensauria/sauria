import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  note: vi.fn(),
  cancel: vi.fn(),
  isCancel: vi.fn().mockReturnValue(false),
  password: vi.fn().mockResolvedValue('test-token'),
  text: vi.fn().mockResolvedValue('12345'),
  spinner: vi.fn().mockReturnValue({
    start: vi.fn(),
    stop: vi.fn(),
  }),
}));

vi.mock('../../config/loader.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    channels: {
      telegram: {
        enabled: false,
        allowedUserIds: [],
        voice: { enabled: false },
      },
    },
  }),
  saveConfig: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../config/paths.js', () => ({
  paths: { canvas: '/mock/canvas.json' },
}));

vi.mock('../../security/url-allowlist.js', () => ({
  secureFetch: vi.fn(),
}));

vi.mock('../../security/vault-key.js', () => ({
  vaultStore: vi.fn().mockResolvedValue(undefined),
}));

const mockExistsSync = vi.fn().mockReturnValue(false);
const mockReadFileSync = vi.fn();
const mockWriteFileSync = vi.fn();

vi.mock('node:fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
}));

describe('connectTelegram', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates bot token via Telegram API', async () => {
    const { secureFetch } = await import('../../security/url-allowlist.js');
    (secureFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        ok: true,
        result: { id: 999, first_name: 'TestBot', username: 'testbot' },
      }),
    });

    const { connectTelegram } = await import('../connect-telegram.js');

    await connectTelegram();

    expect(secureFetch).toHaveBeenCalledWith(
      expect.stringContaining('api.telegram.org/bottest-token/getMe'),
    );
  });

  it('stores token in vault', async () => {
    const { secureFetch } = await import('../../security/url-allowlist.js');
    (secureFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        ok: true,
        result: { id: 999, first_name: 'TestBot', username: 'testbot' },
      }),
    });

    const { vaultStore } = await import('../../security/vault-key.js');

    const { connectTelegram } = await import('../connect-telegram.js');
    await connectTelegram();

    expect(vaultStore).toHaveBeenCalledWith('channel_token_telegram_999', 'test-token');
  });

  it('writes canvas file with bot node', async () => {
    const { secureFetch } = await import('../../security/url-allowlist.js');
    (secureFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        ok: true,
        result: { id: 999, first_name: 'TestBot', username: 'testbot' },
      }),
    });

    const { connectTelegram } = await import('../connect-telegram.js');
    await connectTelegram();

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      '/mock/canvas.json',
      expect.stringContaining('telegram_999'),
      'utf-8',
    );
  });

  it('saves updated config with telegram enabled', async () => {
    const { secureFetch } = await import('../../security/url-allowlist.js');
    (secureFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        ok: true,
        result: { id: 999, first_name: 'TestBot', username: 'testbot' },
      }),
    });

    const { saveConfig } = await import('../../config/loader.js');
    const { connectTelegram } = await import('../connect-telegram.js');
    await connectTelegram();

    expect(saveConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        channels: expect.objectContaining({
          telegram: expect.objectContaining({
            enabled: true,
            allowedUserIds: [12345],
          }),
        }),
      }),
    );
  });

  it('reads existing canvas when file exists', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      nodes: [{ id: 'other-node' }],
      edges: [],
      workspaces: [],
    }));

    const { secureFetch } = await import('../../security/url-allowlist.js');
    (secureFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        ok: true,
        result: { id: 999, first_name: 'TestBot', username: 'testbot' },
      }),
    });

    const { connectTelegram } = await import('../connect-telegram.js');
    await connectTelegram();

    const written = mockWriteFileSync.mock.calls[0]?.[1] as string;
    const parsed = JSON.parse(written) as { nodes: Array<{ id: string }> };
    expect(parsed.nodes.length).toBe(2);
  });
});

describe('additional coverage — connectTelegram', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function mockValidBot(overrides?: { id?: number; first_name?: string; username?: string }): Promise<void> {
    const { secureFetch } = await import('../../security/url-allowlist.js');
    (secureFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        ok: true,
        result: {
          id: overrides?.id ?? 999,
          first_name: overrides?.first_name ?? 'TestBot',
          username: overrides?.username ?? 'testbot',
        },
      }),
    });
  }

  it('handles malformed existing canvas JSON gracefully', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('not valid json');
    await mockValidBot();

    const { connectTelegram } = await import('../connect-telegram.js');
    await connectTelegram();

    const written = mockWriteFileSync.mock.calls[0]?.[1] as string;
    const parsed = JSON.parse(written) as { nodes: Array<{ id: string }> };
    expect(parsed.nodes.length).toBe(1);
    expect(parsed.nodes[0]?.id).toBe('telegram_999');
  });

  it('updates existing node when same id already in canvas', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      nodes: [{ id: 'telegram_999', label: 'old-label' }],
      edges: [],
      workspaces: [],
    }));
    await mockValidBot();

    const { connectTelegram } = await import('../connect-telegram.js');
    await connectTelegram();

    const written = mockWriteFileSync.mock.calls[0]?.[1] as string;
    const parsed = JSON.parse(written) as { nodes: Array<{ id: string; label: string }> };
    expect(parsed.nodes.length).toBe(1);
    expect(parsed.nodes[0]?.label).toBe('@testbot');
  });

  it('creates canvas file when it does not exist', async () => {
    mockExistsSync.mockReturnValue(false);
    await mockValidBot();

    const { connectTelegram } = await import('../connect-telegram.js');
    await connectTelegram();

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      '/mock/canvas.json',
      expect.stringContaining('telegram_999'),
      'utf-8',
    );
  });

  it('uses first_name when username is not available', async () => {
    const { secureFetch } = await import('../../security/url-allowlist.js');
    (secureFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        ok: true,
        result: { id: 888, first_name: 'NoUsernameBot' },
      }),
    });
    mockExistsSync.mockReturnValue(false);

    const { connectTelegram } = await import('../connect-telegram.js');
    await connectTelegram();

    const written = mockWriteFileSync.mock.calls[0]?.[1] as string;
    const parsed = JSON.parse(written) as { nodes: Array<{ label: string }> };
    expect(parsed.nodes[0]?.label).toBe('@NoUsernameBot');
  });

  it('includes meta with botId, userId, firstName', async () => {
    mockExistsSync.mockReturnValue(false);
    await mockValidBot();

    const { connectTelegram } = await import('../connect-telegram.js');
    await connectTelegram();

    const written = mockWriteFileSync.mock.calls[0]?.[1] as string;
    const parsed = JSON.parse(written) as {
      nodes: Array<{ meta: { botId: string; userId: string; firstName: string } }>;
    };
    expect(parsed.nodes[0]?.meta.botId).toBe('999');
    expect(parsed.nodes[0]?.meta.userId).toBe('12345');
    expect(parsed.nodes[0]?.meta.firstName).toBe('TestBot');
  });

  it('sets node status to connected', async () => {
    mockExistsSync.mockReturnValue(false);
    await mockValidBot();

    const { connectTelegram } = await import('../connect-telegram.js');
    await connectTelegram();

    const written = mockWriteFileSync.mock.calls[0]?.[1] as string;
    const parsed = JSON.parse(written) as { nodes: Array<{ status: string }> };
    expect(parsed.nodes[0]?.status).toBe('connected');
  });
});

describe('connectTelegram — fetchBotPhoto', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
  });

  it('stores photo URL when bot has a profile photo', async () => {
    const { secureFetch } = await import('../../security/url-allowlist.js');
    let callCount = 0;
    (secureFetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      callCount++;
      if (url.includes('/getMe')) {
        return {
          json: vi.fn().mockResolvedValue({
            ok: true,
            result: { id: 999, first_name: 'TestBot', username: 'testbot' },
          }),
        };
      }
      if (url.includes('/getUserProfilePhotos')) {
        return {
          json: vi.fn().mockResolvedValue({
            ok: true,
            result: {
              photos: [[{ file_id: 'fid1', width: 160, height: 160 }, { file_id: 'fid2', width: 640, height: 640 }]],
            },
          }),
        };
      }
      if (url.includes('/getFile')) {
        return {
          json: vi.fn().mockResolvedValue({
            ok: true,
            result: { file_path: 'photos/file_0.jpg' },
          }),
        };
      }
      return { json: vi.fn().mockResolvedValue({}) };
    });

    const { connectTelegram } = await import('../connect-telegram.js');
    await connectTelegram();

    const written = mockWriteFileSync.mock.calls[0]?.[1] as string;
    const parsed = JSON.parse(written) as { nodes: Array<{ photo: string | null }> };
    expect(parsed.nodes[0]?.photo).toBe('https://api.telegram.org/file/bottest-token/photos/file_0.jpg');
  });

  it('sets photo to null when bot has no profile photos', async () => {
    const { secureFetch } = await import('../../security/url-allowlist.js');
    (secureFetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (url.includes('/getMe')) {
        return {
          json: vi.fn().mockResolvedValue({
            ok: true,
            result: { id: 999, first_name: 'TestBot', username: 'testbot' },
          }),
        };
      }
      if (url.includes('/getUserProfilePhotos')) {
        return {
          json: vi.fn().mockResolvedValue({
            ok: true,
            result: { photos: [] },
          }),
        };
      }
      return { json: vi.fn().mockResolvedValue({}) };
    });

    const { connectTelegram } = await import('../connect-telegram.js');
    await connectTelegram();

    const written = mockWriteFileSync.mock.calls[0]?.[1] as string;
    const parsed = JSON.parse(written) as { nodes: Array<{ photo: string | null }> };
    expect(parsed.nodes[0]?.photo).toBeNull();
  });

  it('sets photo to null when getFile returns no file_path', async () => {
    const { secureFetch } = await import('../../security/url-allowlist.js');
    (secureFetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (url.includes('/getMe')) {
        return {
          json: vi.fn().mockResolvedValue({
            ok: true,
            result: { id: 999, first_name: 'TestBot', username: 'testbot' },
          }),
        };
      }
      if (url.includes('/getUserProfilePhotos')) {
        return {
          json: vi.fn().mockResolvedValue({
            ok: true,
            result: {
              photos: [[{ file_id: 'fid1', width: 640, height: 640 }]],
            },
          }),
        };
      }
      if (url.includes('/getFile')) {
        return {
          json: vi.fn().mockResolvedValue({ ok: true, result: {} }),
        };
      }
      return { json: vi.fn().mockResolvedValue({}) };
    });

    const { connectTelegram } = await import('../connect-telegram.js');
    await connectTelegram();

    const written = mockWriteFileSync.mock.calls[0]?.[1] as string;
    const parsed = JSON.parse(written) as { nodes: Array<{ photo: string | null }> };
    expect(parsed.nodes[0]?.photo).toBeNull();
  });

  it('sets photo to null when fetchBotPhoto throws', async () => {
    const { secureFetch } = await import('../../security/url-allowlist.js');
    (secureFetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (url.includes('/getMe')) {
        return {
          json: vi.fn().mockResolvedValue({
            ok: true,
            result: { id: 999, first_name: 'TestBot', username: 'testbot' },
          }),
        };
      }
      if (url.includes('/getUserProfilePhotos')) {
        throw new Error('network error');
      }
      return { json: vi.fn().mockResolvedValue({}) };
    });

    const { connectTelegram } = await import('../connect-telegram.js');
    await connectTelegram();

    const written = mockWriteFileSync.mock.calls[0]?.[1] as string;
    const parsed = JSON.parse(written) as { nodes: Array<{ photo: string | null }> };
    expect(parsed.nodes[0]?.photo).toBeNull();
  });
});

describe('connectTelegram — validation failure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exits when Telegram API rejects the token', async () => {
    const { secureFetch } = await import('../../security/url-allowlist.js');
    (secureFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: vi.fn().mockResolvedValue({ ok: false }),
    });

    const exitError = new Error('process.exit');
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw exitError;
    });

    const { connectTelegram } = await import('../connect-telegram.js');
    await expect(connectTelegram()).rejects.toThrow('process.exit');

    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
  });

  it('exits when secureFetch throws a network error', async () => {
    const { secureFetch } = await import('../../security/url-allowlist.js');
    (secureFetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ECONNREFUSED'));

    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    const { connectTelegram } = await import('../connect-telegram.js');
    await expect(connectTelegram()).rejects.toThrow('process.exit');

    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
  });
});

describe('connectTelegram — cancel handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exits when user cancels token input', async () => {
    const prompts = await import('@clack/prompts');
    (prompts.password as ReturnType<typeof vi.fn>).mockResolvedValueOnce(Symbol('cancel'));
    (prompts.isCancel as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (val: unknown) => typeof val === 'symbol',
    );

    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    const { connectTelegram } = await import('../connect-telegram.js');
    await expect(connectTelegram()).rejects.toThrow('process.exit');

    expect(prompts.cancel).toHaveBeenCalledWith('Setup cancelled.');
    expect(mockExit).toHaveBeenCalledWith(0);
    mockExit.mockRestore();
  });

  it('exits when user cancels user ID input', async () => {
    const prompts = await import('@clack/prompts');
    (prompts.password as ReturnType<typeof vi.fn>).mockResolvedValueOnce('test-token');
    (prompts.text as ReturnType<typeof vi.fn>).mockResolvedValueOnce(Symbol('cancel'));

    const { secureFetch } = await import('../../security/url-allowlist.js');
    (secureFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        ok: true,
        result: { id: 999, first_name: 'TestBot', username: 'testbot' },
      }),
    });

    let cancelCallCount = 0;
    (prompts.isCancel as unknown as ReturnType<typeof vi.fn>).mockImplementation((val: unknown) => {
      cancelCallCount++;
      return cancelCallCount === 2 && typeof val === 'symbol';
    });

    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    const { connectTelegram } = await import('../connect-telegram.js');
    await expect(connectTelegram()).rejects.toThrow('process.exit');

    expect(mockExit).toHaveBeenCalledWith(0);
    mockExit.mockRestore();
  });
});

describe('connectTelegram — voice enabled note', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
  });

  it('shows voice transcription enabled in note when configured', async () => {
    const { loadConfig } = await import('../../config/loader.js');
    (loadConfig as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      channels: {
        telegram: {
          enabled: false,
          allowedUserIds: [],
          voice: { enabled: true },
        },
      },
    });

    const { secureFetch } = await import('../../security/url-allowlist.js');
    (secureFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        ok: true,
        result: { id: 999, first_name: 'TestBot', username: 'testbot' },
      }),
    });

    const prompts = await import('@clack/prompts');

    const { connectTelegram } = await import('../connect-telegram.js');
    await connectTelegram();

    expect(prompts.note).toHaveBeenCalledWith(
      expect.stringContaining('Voice transcription: enabled'),
      'Telegram connected',
    );
  });
});
