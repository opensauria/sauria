#!/bin/bash
# Full rebuild + restart OpenSauria desktop app
# Used by Claude Code Stop hook to auto-rebuild after changes

set -e

cd "$(git rev-parse --show-toplevel)"

# Kill existing processes
pkill -9 -f "opensauria" 2>/dev/null || true
pkill -9 -f "OpenSauria" 2>/dev/null || true
pkill -9 -f "tauri" 2>/dev/null || true
lsof -ti:5173 2>/dev/null | xargs kill -9 2>/dev/null || true

# Build all packages + daemon + desktop
pnpm -r build

# Install and launch
rm -rf /Applications/OpenSauria.app
cp -R apps/desktop/src-tauri/target/release/bundle/macos/OpenSauria.app /Applications/OpenSauria.app
open /Applications/OpenSauria.app
