#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/log.sh"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

npm_flags=()
for arg in "$@"; do
    case "$arg" in
        --reinstall) npm_flags=(--reinstall) ;;
        --reinstall-npm) npm_flags=(--reinstall) ;;
        -h|--help)
            log_message "Usage: bash scripts/deploy.sh [--reinstall | --reinstall-npm]"
            exit 0 ;;
        *) log_format 'Unknown deployment option: %s' "$arg" >&2; exit 1 ;;
    esac
done

log_message "============================================"
log_message "  AI News Broadcasting - Deploy"
log_message "============================================"

# Step 1: Build frontend
log_message "[1/4] Building frontend..."
cd "$ROOT_DIR/frontend"
node "$SCRIPT_DIR/ensure-npm-deps.js" "$PWD" "${npm_flags[@]}"
npm run build
log_message "  Frontend built successfully"

# Step 2: Install backend dependencies
log_message "[2/4] Checking backend dependencies..."
cd "$ROOT_DIR/backend"
node "$SCRIPT_DIR/ensure-npm-deps.js" "$PWD" --production "${npm_flags[@]}"
log_message "  Backend dependencies ready"

# Step 3: Verify dist exists
log_message "[3/4] Verifying build output..."
if [ ! -f "$ROOT_DIR/frontend/dist/index.html" ]; then
    log_message "  Build output not found at $ROOT_DIR/frontend/dist/index.html"
    exit 1
fi
log_message "  Build output verified"

# Step 4: Stop the previous server, then start the new one
log_message "[4/4] Restarting server..."
bash "$SCRIPT_DIR/stop.sh"
export NODE_ENV=production
log_message "Server starting on http://0.0.0.0:3000"
log_message "Access via: http://<your-ip>:3000"
log_format "Logs: %s" "$ROOT_DIR/scripts/deploy.log"
log_format "Stop: bash %s" "$SCRIPT_DIR/stop.sh"
cd "$ROOT_DIR/backend"
nohup node src/server.js > "$ROOT_DIR/scripts/deploy.log" 2>&1 &
echo $! > "$ROOT_DIR/scripts/server.pid"
log_format "Server started in background. PID: %s" "$!"
