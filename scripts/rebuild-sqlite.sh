#!/bin/bash
# Script to rebuild better-sqlite3 native bindings
# This fixes the "Could not locate the bindings file" error

set -e

echo "Rebuilding better-sqlite3 native bindings..."

# Find better-sqlite3 installation
BETTER_SQLITE3_PATH=$(find node_modules/.pnpm -name "better-sqlite3@12.5.0" -type d 2>/dev/null | head -1)

if [ -z "$BETTER_SQLITE3_PATH" ]; then
  echo "Error: Could not find better-sqlite3@12.5.0"
  echo "Trying to reinstall..."
  pnpm remove better-sqlite3
  pnpm add better-sqlite3@^12.5.0
  exit 0
fi

echo "Found better-sqlite3 at: $BETTER_SQLITE3_PATH"
cd "$BETTER_SQLITE3_PATH/node_modules/better-sqlite3"

echo "Building native bindings..."
if command -v node-gyp &> /dev/null; then
  node-gyp rebuild
elif command -v npm &> /dev/null; then
  npm run build-release
else
  echo "Error: Need node-gyp or npm to build native bindings"
  exit 1
fi

echo "✓ better-sqlite3 rebuilt successfully!"

