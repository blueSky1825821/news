#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/log.sh"
PID_FILE="$SCRIPT_DIR/server.pid"

BACKEND_DIR="$(cd "$SCRIPT_DIR/../backend" && pwd -P)"

is_server() {
    [[ "$PID" =~ ^[1-9][0-9]*$ ]] || return 1
    [[ "$(readlink "/proc/$PID/cwd" 2>/dev/null)" == "$BACKEND_DIR" ]] || return 1
    local -a args
    mapfile -d '' -t args < "/proc/$PID/cmdline" 2>/dev/null || return 1
    [[ ${#args[@]} -eq 2 && "${args[0]##*/}" == node && "${args[1]}" == src/server.js ]]
}

if [ ! -f "$PID_FILE" ]; then
    exit 0
fi

PID=$(cat "$PID_FILE")
if is_server; then
    log_message "Stopping server (PID: $PID)..."
    if ! kill -TERM "$PID" && is_server; then
        exit 1
    fi
    # The server allows up to 10 seconds for graceful shutdown.
    for ((attempt = 0; attempt < 60; attempt++)); do
        is_server || break
        sleep 0.2
    done
    if is_server; then
        log_message "Server (PID: $PID) did not stop within 12 seconds." >&2
        exit 1
    fi
    log_message "Server stopped."
else
    log_message "No matching server process for the recorded PID."
fi
rm -f "$PID_FILE"
