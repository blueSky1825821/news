#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/log.sh"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

log_message "============================================"
log_message "  AI News Broadcasting - Dev Mode"
log_message "============================================"

# Step 1: Install dependencies
log_message "[1/3] Installing dependencies..."
cd "$ROOT_DIR/backend"
npm install >/dev/null 2>&1
log_message "  Backend dependencies ready"

cd "$ROOT_DIR/frontend"
npm install >/dev/null 2>&1
log_message "  Frontend dependencies ready"

# Step 2: Start backend in background
log_message "[2/3] Starting backend server..."
cd "$ROOT_DIR/backend"
PORT=3001 npm run dev &
BACKEND_PID=$!
log_message "  Backend starting on http://localhost:3001 (PID: $BACKEND_PID)"

sleep 2

# Step 3: Start frontend in background
log_message "[3/3] Starting frontend dev server..."
cd "$ROOT_DIR/frontend"
npm run dev &
FRONTEND_PID=$!
log_message "  Frontend starting on http://localhost:3000/news/ (PID: $FRONTEND_PID)"

printf '\n'
log_message "============================================"
log_message "  Both services are starting..."
log_message "  Frontend: http://0.0.0.0:3000/news/"
log_message "  Backend:  http://0.0.0.0:3001"
log_message "  Access via: http://<your-ip>:3000/news/"
log_message "============================================"
printf '\n'
log_message "Press Ctrl+C to stop all services."

# Wait for interrupt
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT
wait
