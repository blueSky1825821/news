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
log_message "[1/5] Building frontend..."
cd "$ROOT_DIR/frontend"
node "$SCRIPT_DIR/ensure-npm-deps.js" "$PWD" "${npm_flags[@]}"
npm run build
log_message "  Frontend built successfully"

# Step 2: Install backend dependencies
log_message "[2/5] Checking backend dependencies..."
cd "$ROOT_DIR/backend"
node "$SCRIPT_DIR/ensure-npm-deps.js" "$PWD" --production "${npm_flags[@]}"
log_message "  Backend dependencies ready"

# Step 3: Prepare the WeChat publishing browser
log_message "[3/5] Preparing WeChat browser..."
NODE_ENV=production node "$SCRIPT_DIR/ensure-wechat-browser.mjs"

# Step 4: Verify dist exists
log_message "[4/5] Verifying build output..."
if [ ! -f "$ROOT_DIR/frontend/dist/index.html" ]; then
    log_message "  Build output not found at $ROOT_DIR/frontend/dist/index.html"
    exit 1
fi
log_message "  Build output verified"

# Step 5: Stop the previous server, then start the new one
log_message "[5/5] Restarting server..."
bash "$SCRIPT_DIR/stop.sh"
export NODE_ENV=production
log_message "Server starting on http://0.0.0.0:3000"
log_message "Access via: http://<your-ip>:3000"
log_format "Logs: %s" "$ROOT_DIR/scripts/deploy.log"
log_format "Stop: bash %s" "$SCRIPT_DIR/stop.sh"
cd "$ROOT_DIR/backend"
DEPLOY_LOG="$ROOT_DIR/scripts/deploy.log"
nohup node src/server.js > "$DEPLOY_LOG" 2>&1 &
SERVER_PID=$!
echo "$SERVER_PID" > "$SCRIPT_DIR/server.pid"

for ((attempt = 0; attempt < 60; attempt++)); do
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
        log_format "Server failed to start. Check %s" "$DEPLOY_LOG" >&2
        exit 1
    fi
    if grep -Fq 'Server running on http://' "$DEPLOY_LOG"; then
        log_format "Server started in background. PID: %s" "$SERVER_PID"
        exit 0
    fi
    sleep 0.5
done

log_format "Server did not confirm startup. Check %s" "$DEPLOY_LOG" >&2
exit 1
