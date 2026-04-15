#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
VIEWER_DIR="$PROJECT_DIR/BibleViewer"

cd "$VIEWER_DIR"

if [ ! -d "node_modules/electron" ]; then
    npm install --quiet 2>/dev/null
fi

exec ./node_modules/.bin/electron .
