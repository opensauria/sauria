import { describe, it, expect } from 'vitest';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { paths } from '../paths.js';

describe('paths', () => {
  const expectedHome = process.env['SAURIA_HOME'] ?? join(homedir(), '.sauria');

  describe('home derivation', () => {
    it('home matches SAURIA_HOME env or defaults to ~/.sauria', () => {
      expect(paths.home).toBe(expectedHome);
    });

    it('derives config path from home', () => {
      expect(paths.config).toBe(join(expectedHome, 'config.json5'));
    });

    it('derives db path from home', () => {
      expect(paths.db).toBe(join(expectedHome, 'sauria.db'));
    });

    it('derives vault path from home', () => {
      expect(paths.vault).toBe(join(expectedHome, 'vault'));
    });

    it('derives canvas path from home', () => {
      expect(paths.canvas).toBe(join(expectedHome, 'canvas.json'));
    });

    it('derives socket path from home', () => {
      expect(paths.socket).toBe(join(expectedHome, 'daemon.sock'));
    });
  });

  describe('all path keys exist', () => {
    it('exports all expected path keys', () => {
      const expectedKeys = [
        'home',
        'config',
        'db',
        'dbEncrypted',
        'logs',
        'tmp',
        'exports',
        'vault',
        'audit',
        'canvas',
        'ownerCommands',
        'pidFile',
        'socket',
        'ipcPort',
        'botProfiles',
      ];
      for (const key of expectedKeys) {
        expect(paths).toHaveProperty(key);
        expect(typeof paths[key as keyof typeof paths]).toBe('string');
      }
    });

    it('all paths are absolute', () => {
      for (const value of Object.values(paths)) {
        expect(value).toMatch(/^\//);
      }
    });
  });
});
