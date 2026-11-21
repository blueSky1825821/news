#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

npm_flags=()
system_flags=()
for arg in "$@"; do
    case "$arg" in
        --reinstall) npm_flags=(--reinstall); system_flags=(--reinstall) ;;
        --reinstall-npm) npm_flags=(--reinstall) ;;
        -h|--help)
            echo "Usage: bash scripts/deploy.sh [--reinstall | --reinstall-npm]"
            exit 0 ;;
        *) printf 'Unknown deployment option: %s\n' "$arg" >&2; exit 1 ;;
    esac
done

echo "============================================"
echo "  AI News Broadcasting - Deploy"
echo "============================================"

# Step 1: Install xinwenlianbo system dependencies (ffmpeg + whisper.cpp)
printf "\n[1/5] Checking xinwenlianbo dependencies...\n"
export WHISPER_MODEL="${WHISPER_MODEL:-large-v3-q5_0}"
whisper_install_dir="$(node -p 'require("node:path").resolve(process.argv[1])' "${INSTALL_DIR:-/opt}")"
export WHISPER_MODEL_PATH="${WHISPER_MODEL_PATH:-$whisper_install_dir/whisper.cpp/models/ggml-$WHISPER_MODEL.bin}"
bash "$SCRIPT_DIR/install-xinwenlianbo-deps.sh" "${system_flags[@]}"

# Step 2: Build frontend
printf "\n[2/5] Building frontend...\n"
cd "$ROOT_DIR/frontend"
node "$SCRIPT_DIR/ensure-npm-deps.js" "$PWD" "${npm_flags[@]}"
npm run build
echo "  Frontend built successfully"

# Step 3: Install backend dependencies
printf "\n[3/5] Checking backend dependencies...\n"
cd "$ROOT_DIR/backend"
node "$SCRIPT_DIR/ensure-npm-deps.js" "$PWD" --production "${npm_flags[@]}"
echo "  Backend dependencies ready"

# Step 4: Verify dist exists
printf "\n[4/5] Verifying build output...\n"
if [ ! -f "$ROOT_DIR/frontend/dist/index.html" ]; then
    echo "  Build output not found at $ROOT_DIR/frontend/dist/index.html"
    exit 1
fi
echo "  Build output verified"

# Step 5: Start server
printf "\n[5/5] Starting server...\n"
export NODE_ENV=production
printf "\nServer starting on http://0.0.0.0:3000\n"
printf "Access via: http://<your-ip>:3000\n"
printf "Logs: %s\n" "$ROOT_DIR/scripts/deploy.log"
printf "Stop: kill %s\n" "$(cat "$ROOT_DIR/scripts/server.pid" 2>/dev/null || true)"
cd "$ROOT_DIR/backend"
nohup node src/server.js > "$ROOT_DIR/scripts/deploy.log" 2>&1 &
echo $! > "$ROOT_DIR/scripts/server.pid"
printf "Server started in background. PID: %s\n\n" "$!"
