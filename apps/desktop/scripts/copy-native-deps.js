#!/usr/bin/env node
// Copies only the runtime-necessary files from native Node.js modules
// into native-deps/ for Tauri bundling. Avoids shipping 12MB+ of build artifacts.

import { cpSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..', '..');
const nativeDeps = join(__dirname, '..', 'native-deps');
const nm = join(root, 'node_modules');

rmSync(nativeDeps, { recursive: true, force: true });

// better-sqlite3: native binding + JS wrapper
const bsq = join(nm, 'better-sqlite3');
const bsqDest = join(nativeDeps, 'better-sqlite3');
cpSync(join(bsq, 'package.json'), join(bsqDest, 'package.json'));
cpSync(join(bsq, 'lib'), join(bsqDest, 'lib'), { recursive: true });
cpSync(join(bsq, 'build', 'Release'), join(bsqDest, 'build', 'Release'), { recursive: true });

// bindings: runtime dep of better-sqlite3 (resolves .node file path)
cpSync(join(nm, 'bindings'), join(nativeDeps, 'bindings'), { recursive: true });

// file-uri-to-path: runtime dep of bindings
cpSync(join(nm, 'file-uri-to-path'), join(nativeDeps, 'file-uri-to-path'), { recursive: true });
