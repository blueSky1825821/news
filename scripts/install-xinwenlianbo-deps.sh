#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

reinstall=false
case "${1:-}" in
    --reinstall) reinstall=true ;;
    -h|--help) echo "Usage: bash scripts/install-xinwenlianbo-deps.sh [--reinstall]"; exit 0 ;;
    '') ;;
    *) printf 'Unknown installer option: %s\n' "$1" >&2; exit 1 ;;
esac

INSTALL_DIR="$(node -p 'require("node:path").resolve(process.argv[1])' "${INSTALL_DIR:-/opt}")"
WHISPER_DIR="$INSTALL_DIR/whisper.cpp"
MODEL_NAME="${WHISPER_MODEL:-base-q5_1}"
if [[ ! "$MODEL_NAME" =~ ^[A-Za-z0-9._-]+$ ]]; then
    echo 'Invalid WHISPER_MODEL name.' >&2
    exit 1
fi
MANAGED_WHISPER="$WHISPER_DIR/build/bin/whisper-cli"
MANAGED_MODEL="$WHISPER_DIR/models/ggml-$MODEL_NAME.bin"

configured_path() {
    node --input-type=module - "$ROOT_DIR/backend" "$1" <<'JS'
import { loadEnvFile } from 'node:process';
import path from 'node:path';
const [, , backend, name] = process.argv;
try {
    loadEnvFile(path.join(backend, '.env'));
} catch (error) {
    if (error.code !== 'ENOENT') throw error;
}
const value = process.env[name];
if (value) {
    const executableOnPath = name === 'WHISPER_EXECUTABLE' && !value.includes('/');
    console.log(executableOnPath ? value : path.resolve(backend, value));
}
JS
}

WHISPER_BIN="$(configured_path WHISPER_EXECUTABLE)"
MODEL_FILE="$(configured_path WHISPER_MODEL_PATH)"
if [[ -z "$WHISPER_BIN" ]]; then
    WHISPER_BIN="$MANAGED_WHISPER"
    if [[ ! -x "$MANAGED_WHISPER" ]] && command -v whisper-cli >/dev/null; then
        WHISPER_BIN="$(command -v whisper-cli)"
    fi
fi
MODEL_FILE="${MODEL_FILE:-$MANAGED_MODEL}"

privileged=()
if (( EUID != 0 )); then
    privileged=(sudo)
fi

printf '\n  Checking FFmpeg...\n'
if ! $reinstall && command -v ffmpeg >/dev/null; then
    echo "  Reusing FFmpeg: $(command -v ffmpeg)"
elif command -v apt-get >/dev/null; then
    "${privileged[@]}" apt-get update
    if $reinstall; then
        "${privileged[@]}" apt-get install -y --reinstall ffmpeg
    else
        "${privileged[@]}" apt-get install -y ffmpeg
    fi
elif command -v yum >/dev/null; then
    if $reinstall && rpm -q ffmpeg >/dev/null; then
        "${privileged[@]}" yum reinstall -y ffmpeg
    else
        "${privileged[@]}" yum install -y ffmpeg
    fi
elif command -v apk >/dev/null; then
    if $reinstall && apk info -e ffmpeg >/dev/null; then
        "${privileged[@]}" apk fix ffmpeg
    else
        "${privileged[@]}" apk add ffmpeg
    fi
else
    echo '  Unsupported package manager. Install FFmpeg manually.' >&2
    exit 1
fi

printf '\n  Checking Whisper and model...\n'
needs_build=false
needs_model=false
if $reinstall || ! command -v "$WHISPER_BIN" >/dev/null; then
    if ! $reinstall && [[ "$WHISPER_BIN" != "$MANAGED_WHISPER" ]]; then
        printf '  Configured WHISPER_EXECUTABLE is unavailable: %s\n' "$WHISPER_BIN" >&2
        exit 1
    fi
    needs_build=true
fi
if $reinstall || [[ ! -f "$MODEL_FILE" || ! -s "$MODEL_FILE" ]]; then
    if ! $reinstall && [[ "$MODEL_FILE" != "$MANAGED_MODEL" ]]; then
        printf '  Configured WHISPER_MODEL_PATH is unavailable: %s\n' "$MODEL_FILE" >&2
        exit 1
    fi
    needs_model=true
fi

if $needs_build || $needs_model; then
    install_command=("${privileged[@]}")
    if [[ -w "$WHISPER_DIR" || ( ! -e "$WHISPER_DIR" && -w "$INSTALL_DIR" ) ]]; then
        install_command=()
    fi

    if [[ ! -d "$WHISPER_DIR" ]]; then
        "${install_command[@]}" mkdir -p "$INSTALL_DIR"
        "${install_command[@]}" git clone https://github.com/ggml-org/whisper.cpp.git "$WHISPER_DIR"
    fi

    if $needs_build; then
        build_flags=()
        if $reinstall; then
            build_flags=(--clean-first)
        fi
        "${install_command[@]}" cmake -S "$WHISPER_DIR" -B "$WHISPER_DIR/build"
        "${install_command[@]}" cmake --build "$WHISPER_DIR/build" --config Release --parallel "${build_flags[@]}"
        [[ -x "$MANAGED_WHISPER" ]]
    fi

    if $needs_model; then
        stage_dir="$("${install_command[@]}" mktemp -d "$WHISPER_DIR/models/.download.XXXXXX")"
        staged_model="$stage_dir/ggml-$MODEL_NAME.bin"
        trap '"${install_command[@]}" rm -f -- "$staged_model"; "${install_command[@]}" rmdir -- "$stage_dir"' EXIT
        "${install_command[@]}" bash "$WHISPER_DIR/models/download-ggml-model.sh" "$MODEL_NAME" "$stage_dir"
        [[ -s "$staged_model" ]]
        "${install_command[@]}" mv -f -- "$staged_model" "$MANAGED_MODEL"
    fi
else
    printf '  Reusing Whisper: %s\n  Reusing model: %s\n' "$WHISPER_BIN" "$MODEL_FILE"
fi

if $needs_build || $needs_model; then
    printf '\n  Managed paths for backend/.env:\n'
    printf '  WHISPER_EXECUTABLE=%s\n  WHISPER_MODEL_PATH=%s\n' "$MANAGED_WHISPER" "$MANAGED_MODEL"
fi
