#!/bin/bash
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
VIEWER_DIR="$PROJECT_DIR/Atlas"

cd "$VIEWER_DIR"

if [ ! -d "node_modules/electron" ]; then
    npm install --quiet 2>/dev/null
fi

ELECTRON_BIN="./node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
exec "$ELECTRON_BIN" .
