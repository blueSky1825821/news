#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "============================================"
echo "  AI News Broadcasting - Deploy"
echo "============================================"

# Step 1: Build frontend
echo -e "\n[1/4] Building frontend..."
cd "$ROOT_DIR/frontend"
npm install
npm run build
echo "  Frontend built successfully"

# Step 2: Install backend dependencies
echo -e "\n[2/4] Installing backend dependencies..."
cd "$ROOT_DIR/backend"
npm install --production
echo "  Backend dependencies installed"

# Step 3: Verify dist exists
echo -e "\n[3/4] Verifying build output..."
if [ ! -f "$ROOT_DIR/frontend/dist/index.html" ]; then
    echo "  Build output not found at $ROOT_DIR/frontend/dist/index.html"
    exit 1
fi
echo "  Build output verified"

# Step 4: Start server
echo -e "\n[4/4] Starting server..."
export NODE_ENV=production
echo -e "\nServer starting on http://0.0.0.0:3000"
echo -e "Access via: http://<your-ip>:3000"
echo -e "Logs: $ROOT_DIR/scripts/deploy.log"
echo -e "Stop: kill $(cat "$ROOT_DIR/scripts/server.pid 2>/dev/null")"
cd "$ROOT_DIR/backend"
nohup node src/server.js > "$ROOT_DIR/scripts/deploy.log" 2>&1 &
echo $! > "$ROOT_DIR/scripts/server.pid"
echo -e "Server started in background. PID: $!\n"
