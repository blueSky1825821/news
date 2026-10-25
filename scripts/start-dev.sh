#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "============================================"
echo "  AI News Broadcasting - Dev Mode"
echo "============================================"

# Step 1: Install dependencies
echo -e "\n[1/3] Installing dependencies..."
cd "$ROOT_DIR/backend"
npm install >/dev/null 2>&1
echo "  Backend dependencies ready"

cd "$ROOT_DIR/frontend"
npm install >/dev/null 2>&1
echo "  Frontend dependencies ready"

# Step 2: Start backend in background
echo -e "\n[2/3] Starting backend server..."
cd "$ROOT_DIR/backend"
npm run dev &
BACKEND_PID=$!
echo "  Backend starting on http://localhost:3001 (PID: $BACKEND_PID)"

sleep 2

# Step 3: Start frontend in background
echo -e "\n[3/3] Starting frontend dev server..."
cd "$ROOT_DIR/frontend"
npm run dev &
FRONTEND_PID=$!
echo "  Frontend starting on http://localhost:3000 (PID: $FRONTEND_PID)"

echo ""
echo "============================================"
echo "  Both services are starting..."
echo "  Frontend: http://0.0.0.0:3000"
echo "  Backend:  http://0.0.0.0:3001"
echo "  Access via: http://<your-ip>:3000"
echo "============================================"
echo ""
echo "Press Ctrl+C to stop all services."

# Wait for interrupt
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT
wait
