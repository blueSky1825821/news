#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/server.pid"

if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
        echo "Stopping server (PID: $PID)..."
        kill -TERM "$PID"
        sleep 2
        if kill -0 "$PID" 2>/dev/null; then
            echo "Server still running, force killing..."
            kill -KILL "$PID"
        fi
        echo "Server stopped."
    else
        echo "Server not running (stale PID file)."
    fi
    rm -f "$PID_FILE"
else
    echo "PID file not found. Is the server running?"
    echo "You can also stop it manually: pkill -f 'node src/server.js'"
fi
