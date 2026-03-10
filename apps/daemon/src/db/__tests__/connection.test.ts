import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDb = {
  pragma: vi.fn(),
  close: vi.fn(),
};

vi.mock('better-sqlite3', () => {
  return {
    default: class MockDatabase {
      pragma = mockDb.pragma;
      close = mockDb.close;
    },
  };
});

vi.mock('../../config/paths.js', () => ({
  paths: { db: '/tmp/test-sauria.db' },
}));

describe('connection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('openDatabase', () => {
    it('creates database and sets all required pragmas', async () => {
      const { openDatabase } = await import('../connection.js');

      const db = openDatabase();

      expect(db.pragma).toBeDefined();
      expect(mockDb.pragma).toHaveBeenCalledWith('journal_mode = WAL');
      expect(mockDb.pragma).toHaveBeenCalledWith('foreign_keys = ON');
      expect(mockDb.pragma).toHaveBeenCalledWith('page_size = 4096');
      expect(mockDb.pragma).toHaveBeenCalledWith('busy_timeout = 30000');
      expect(mockDb.pragma).toHaveBeenCalledWith('synchronous = NORMAL');
      expect(mockDb.pragma).toHaveBeenCalledWith('optimize');
      expect(mockDb.pragma).toHaveBeenCalledTimes(6);
    });
  });

  describe('closeDatabase', () => {
    it('calls close on the database instance', async () => {
      const { openDatabase, closeDatabase } = await import('../connection.js');

      const db = openDatabase();
      closeDatabase(db);
      expect(mockDb.close).toHaveBeenCalledOnce();
    });
  });
});
