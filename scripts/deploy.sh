#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "============================================"
echo "  AI News Broadcasting - Deploy"
echo "============================================"

# Step 1: Build frontend
printf "\n[1/4] Building frontend...\n"
cd "$ROOT_DIR/frontend"
npm install
npm run build
echo "  Frontend built successfully"

# Step 2: Install backend dependencies
printf "\n[2/4] Installing backend dependencies...\n"
cd "$ROOT_DIR/backend"
npm install --omit=dev
echo "  Backend dependencies installed"

# Step 3: Verify dist exists
printf "\n[3/4] Verifying build output...\n"
if [ ! -f "$ROOT_DIR/frontend/dist/index.html" ]; then
    echo "  Build output not found at $ROOT_DIR/frontend/dist/index.html"
    exit 1
fi
echo "  Build output verified"

# Step 4: Start server
printf "\n[4/4] Starting server...\n"
export NODE_ENV=production
printf "\nServer starting on http://0.0.0.0:3000\n"
printf "Access via: http://<your-ip>:3000\n"
printf "Logs: %s\n" "$ROOT_DIR/scripts/deploy.log"
printf "Stop: kill %s\n" "$(cat "$ROOT_DIR/scripts/server.pid" 2>/dev/null || true)"
cd "$ROOT_DIR/backend"
nohup node src/server.js > "$ROOT_DIR/scripts/deploy.log" 2>&1 &
echo $! > "$ROOT_DIR/scripts/server.pid"
printf "Server started in background. PID: %s\n\n" "$!"
