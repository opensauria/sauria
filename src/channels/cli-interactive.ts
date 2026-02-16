import { createInterface } from 'node:readline';
import type BetterSqlite3 from 'better-sqlite3';
import type { ModelRouter } from '../ai/router.js';
import { sanitizeChannelInput } from '../security/sanitize.js';
import { reasonAbout } from '../ai/reason.js';
import { searchByKeyword } from '../db/search.js';

interface InteractiveDeps {
  readonly db: BetterSqlite3.Database;
  readonly router: ModelRouter;
}

function writeOutput(text: string): void {
  process.stdout.write(`${text}\n`);
}

export async function startInteractiveMode(
  deps: InteractiveDeps,
): Promise<void> {
  const { db, router } = deps;

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'openwind> ',
  });

  rl.prompt();

  const handleLine = async (line: string): Promise<void> => {
    const trimmed = line.trim();

    if (!trimmed || trimmed === 'exit' || trimmed === 'quit') {
      rl.close();
      return;
    }

    try {
      const sanitized = sanitizeChannelInput(trimmed);
      const entities = searchByKeyword(db, sanitized, 10);
      const context = entities
        .map((e) => `[${e.type}] ${e.name}: ${e.summary ?? 'no summary'}`)
        .join('\n');

      writeOutput('Thinking...');
      const answer = await reasonAbout(router, context, sanitized);
      writeOutput('');
      writeOutput(answer);
      writeOutput('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      writeOutput(`Error: ${message}`);
    }

    rl.prompt();
  };

  rl.on('line', (line) => void handleLine(line));

  return new Promise((resolve) => {
    rl.on('close', () => {
      writeOutput('Goodbye.');
      resolve();
    });
  });
}
