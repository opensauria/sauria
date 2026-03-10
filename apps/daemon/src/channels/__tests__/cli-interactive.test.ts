import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

vi.mock('../../security/sanitize.js', () => ({
  sanitizeChannelInput: vi.fn((text: string) => text),
}));

vi.mock('../../ai/reason.js', () => ({
  reasonAbout: vi.fn().mockResolvedValue('AI response'),
}));

vi.mock('../../db/search.js', () => ({
  searchByKeyword: vi.fn().mockReturnValue([]),
}));

class MockReadline extends EventEmitter {
  prompt = vi.fn();
  close = vi.fn(() => {
    this.emit('close');
  });
}

vi.mock('node:readline', () => ({
  createInterface: vi.fn(() => new MockReadline()),
}));

describe('startInteractiveMode', () => {
  let writeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  });

  it('prompts on start', async () => {
    const { createInterface } = await import('node:readline');
    const { startInteractiveMode } = await import('../cli-interactive.js');

    const deps = { db: {} as never, router: {} as never };
    const promise = startInteractiveMode(deps);

    const rl = (createInterface as ReturnType<typeof vi.fn>).mock.results[0]?.value as MockReadline;
    expect(rl.prompt).toHaveBeenCalled();

    rl.close();
    await promise;

    writeSpy.mockRestore();
  });

  it('closes on "exit" input', async () => {
    const { createInterface } = await import('node:readline');
    const { startInteractiveMode } = await import('../cli-interactive.js');

    const deps = { db: {} as never, router: {} as never };
    const promise = startInteractiveMode(deps);

    const rl = (createInterface as ReturnType<typeof vi.fn>).mock.results[0]?.value as MockReadline;
    rl.emit('line', 'exit');

    await promise;

    expect(writeSpy).toHaveBeenCalledWith('Goodbye.\n');
    writeSpy.mockRestore();
  });

  it('closes on empty input', async () => {
    const { createInterface } = await import('node:readline');
    const { startInteractiveMode } = await import('../cli-interactive.js');

    const deps = { db: {} as never, router: {} as never };
    const promise = startInteractiveMode(deps);

    const rl = (createInterface as ReturnType<typeof vi.fn>).mock.results[0]?.value as MockReadline;
    rl.emit('line', '');

    await promise;

    writeSpy.mockRestore();
  });

  it('queries AI and prints response', async () => {
    const { createInterface } = await import('node:readline');
    const { startInteractiveMode } = await import('../cli-interactive.js');

    const deps = { db: {} as never, router: {} as never };
    const promise = startInteractiveMode(deps);

    const rl = (createInterface as ReturnType<typeof vi.fn>).mock.results[0]?.value as MockReadline;
    rl.emit('line', 'What is sauria?');

    // Wait for the async handler to complete
    await vi.waitFor(() => {
      expect(writeSpy).toHaveBeenCalledWith('AI response\n');
    });

    rl.close();
    await promise;

    writeSpy.mockRestore();
  });

  it('prints error on AI failure', async () => {
    const { reasonAbout } = await import('../../ai/reason.js');
    (reasonAbout as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('AI down'));

    const { createInterface } = await import('node:readline');
    const { startInteractiveMode } = await import('../cli-interactive.js');

    const deps = { db: {} as never, router: {} as never };
    const promise = startInteractiveMode(deps);

    const rl = (createInterface as ReturnType<typeof vi.fn>).mock.results[0]?.value as MockReadline;
    rl.emit('line', 'fail please');

    await vi.waitFor(() => {
      expect(writeSpy).toHaveBeenCalledWith('Error: AI down\n');
    });

    rl.close();
    await promise;

    writeSpy.mockRestore();
  });
});
