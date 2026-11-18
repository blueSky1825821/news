#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

INSTALL_DIR="${INSTALL_DIR:-/opt}"
WHISPER_DIR="$INSTALL_DIR/whisper.cpp"
MODEL_NAME="${WHISPER_MODEL:-base-q5_1}"

echo "============================================"
echo "  CCTV Xinwenlianbo Dependencies Installer"
echo "============================================"

# Step 1: Check / Install ffmpeg
printf "\n[1/3] Checking ffmpeg...\n"
if command -v ffmpeg &>/dev/null; then
    echo "  ffmpeg already installed: $(ffmpeg -version | head -1)"
else
    echo "  ffmpeg not found, installing..."
    if command -v apt-get &>/dev/null; then
        sudo apt-get update
        sudo apt-get install -y ffmpeg
    elif command -v yum &>/dev/null; then
        sudo yum install -y ffmpeg
    elif command -v apk &>/dev/null; then
        sudo apk add ffmpeg
    else
        echo "  ERROR: Unsupported package manager. Please install ffmpeg manually."
        exit 1
    fi
    echo "  ffmpeg installed successfully"
fi

# Step 2: Install whisper.cpp
printf "\n[2/3] Checking whisper.cpp...\n"
if [ -f "$WHISPER_DIR/build/bin/whisper-cli" ]; then
    echo "  whisper.cpp already installed at $WHISPER_DIR"
else
    echo "  whisper.cpp not found, installing..."
    if [ -d "$WHISPER_DIR" ]; then
        echo "  Removing old whisper.cpp directory..."
        sudo rm -rf "$WHISPER_DIR"
    fi

    cd "$INSTALL_DIR"
    sudo git clone https://github.com/ggerganov/whisper.cpp.git
    cd whisper.cpp
    sudo cmake -B build
    sudo cmake --build build --config Release -j$(nproc)
    echo "  whisper.cpp built successfully"
fi

# Step 3: Download model
printf "\n[3/3] Checking whisper model ($MODEL_NAME)...\n"
MODEL_FILE="$WHISPER_DIR/models/ggml-$MODEL_NAME.bin"
if [ -f "$MODEL_FILE" ]; then
    echo "  Model already exists: $MODEL_FILE"
else
    echo "  Model not found, downloading..."
    cd "$WHISPER_DIR"
    sudo bash models/download-ggml-model.sh "$MODEL_NAME"
    echo "  Model downloaded successfully"
fi

# Print configuration
printf "\n============================================\n"
echo "  Installation Complete"
echo "============================================"
echo ""
echo "  ffmpeg:     $(which ffmpeg)"
echo "  whisper:    $WHISPER_DIR/build/bin/whisper-cli"
echo "  model:      $MODEL_FILE"
echo ""
echo "  Add to your backend/.env:"
echo ""
echo "  WHISPER_EXECUTABLE=$WHISPER_DIR/build/bin/whisper-cli"
echo "  WHISPER_MODEL_PATH=$MODEL_FILE"
echo ""
