#!/usr/bin/env bash
# History of Western Music Revision App Launcher (macOS & Linux)
set -e

cd "$(dirname "$0")"

echo "=========================================================="
echo " Starting History of Western Music Revision App (Urtext)"
echo "=========================================================="

# Auto-detect Python 3 (built-in on macOS / standard on Linux)
if command -v python3 >/dev/null 2>&1; then
    PY_CMD="python3"
elif command -v python >/dev/null 2>&1; then
    PY_CMD="python"
else
    echo "Error: Python is required to run the local server."
    echo "Please install Python 3 from https://www.python.org/downloads/"
    exit 1
fi

PORT="${1:-8765}"
echo "Launching local server on port ${PORT}..."
exec "$PY_CMD" server.py "$PORT"
