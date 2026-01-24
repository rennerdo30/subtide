#!/bin/bash
# Subtide Backend Runner
# Usage: ./run.sh [options]

set -e

# export MLX_FORCE_DIRECT=true
export KMP_DUPLICATE_LIB_OK=TRUE
export OMP_NUM_THREADS=1

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PYTHONPATH=$PYTHONPATH:$(dirname "$SCRIPT_DIR")
cd "$SCRIPT_DIR"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║       Subtide Backend Server       ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}"
echo ""

# Detect platform for requirements selection
detect_platform() {
    if [ "$(uname)" = "Darwin" ] && [ "$(uname -m)" = "arm64" ]; then
        echo "macos"
    elif python3 -c "import torch; exit(0 if torch.cuda.is_available() else 1)" 2>/dev/null; then
        echo "linux-cuda"
    else
        echo "linux-cpu"
    fi
}

DETECTED_PLATFORM=$(detect_platform)

# Compute requirements hash for auto-update detection
compute_requirements_hash() {
    if [ "$DETECTED_PLATFORM" = "macos" ] && [ -f "requirements-macos.txt" ]; then
        cat requirements.txt requirements-macos.txt 2>/dev/null | shasum -a 256 | cut -d' ' -f1
    else
        cat requirements.txt 2>/dev/null | shasum -a 256 | cut -d' ' -f1
    fi
}

install_dependencies() {
    echo -e "${YELLOW}Installing dependencies for platform: ${DETECTED_PLATFORM}${NC}"

    if [ "$DETECTED_PLATFORM" = "macos" ]; then
        if [ -f "requirements-macos.txt" ]; then
            pip install -r requirements-macos.txt
        else
            pip install -r requirements.txt
            pip install mlx-whisper pyannote.audio torch torchaudio
        fi
    elif [ "$DETECTED_PLATFORM" = "linux-cuda" ]; then
        pip install -r requirements.txt
        pip install openai-whisper pyannote.audio torch torchaudio
    else
        pip install -r requirements.txt
        pip install openai-whisper pyannote.audio torch torchaudio
    fi

    # Save requirements hash
    compute_requirements_hash > venv/.requirements_hash
}

# Check if venv exists
if [ ! -d "venv" ]; then
    echo -e "${YELLOW}Creating virtual environment...${NC}"
    python3 -m venv venv
    source venv/bin/activate
    install_dependencies
else
    source venv/bin/activate

    # Auto-update: check if requirements changed
    CURRENT_HASH=$(compute_requirements_hash)
    SAVED_HASH=""
    if [ -f "venv/.requirements_hash" ]; then
        SAVED_HASH=$(cat venv/.requirements_hash)
    fi

    if [ "$CURRENT_HASH" != "$SAVED_HASH" ]; then
        echo -e "${YELLOW}Requirements changed - updating dependencies...${NC}"
        install_dependencies
    fi
fi

# Load .env file if it exists
if [ -f ".env" ]; then
    echo -e "${CYAN}Loading configuration from .env${NC}"
    set -a
    source .env
    set +a
fi

# Kill any existing process on port 5001 OR matching app.py
echo -e "${YELLOW}Cleaning up old processes...${NC}"
if lsof -i:5001 -t &>/dev/null; then
    kill -9 $(lsof -t -i:5001) 2>/dev/null || true
fi
# Also kill by name just in case
pkill -f "python app.py" || true
sleep 1

# Default configuration
export ENABLE_WHISPER="${ENABLE_WHISPER:-true}"
export WHISPER_MODEL="${WHISPER_MODEL:-base}"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --whisper-model)
            export WHISPER_MODEL="$2"
            shift 2
            ;;
        --no-whisper)
            export ENABLE_WHISPER="false"
            shift
            ;;
        --cookies)
            export COOKIES_FILE="$2"
            shift 2
            ;;
        --api-key)
            export SERVER_API_KEY="$2"
            shift 2
            ;;
        --api-url)
            export SERVER_API_URL="$2"
            shift 2
            ;;
        --model)
            export SERVER_MODEL="$2"
            shift 2
            ;;
        --lmstudio)
            # Shortcut for LM Studio local server
            export SERVER_API_KEY="lm-studio"
            export SERVER_API_URL="http://localhost:1234/v1"
            if [ -n "$2" ] && [[ ! "$2" =~ ^-- ]]; then
                export SERVER_MODEL="$2"
                shift
            fi
            shift
            ;;
        --ollama)
            # Shortcut for Ollama local server
            export SERVER_API_KEY="ollama"
            export SERVER_API_URL="http://localhost:11434/v1"
            if [ -n "$2" ] && [[ ! "$2" =~ ^-- ]]; then
                export SERVER_MODEL="$2"
                shift
            fi
            shift
            ;;
        --openai)
            # Shortcut for OpenAI
            export SERVER_API_URL="https://api.openai.com/v1"
            if [ -z "$SERVER_API_KEY" ]; then
                echo -e "${YELLOW}Warning: --openai requires SERVER_API_KEY or --api-key${NC}"
            fi
            if [ -n "$2" ] && [[ ! "$2" =~ ^-- ]]; then
                export SERVER_MODEL="$2"
                shift
            else
                export SERVER_MODEL="${SERVER_MODEL:-gpt-4o-mini}"
            fi
            shift
            ;;
        --openrouter)
            # Shortcut for OpenRouter
            export SERVER_API_URL="https://openrouter.ai/api/v1"
            if [ -z "$SERVER_API_KEY" ]; then
                echo -e "${YELLOW}Warning: --openrouter requires SERVER_API_KEY or --api-key${NC}"
            fi
            if [ -n "$2" ] && [[ ! "$2" =~ ^-- ]]; then
                export SERVER_MODEL="$2"
                shift
            fi
            shift
            ;;
        --google)
            # Shortcut for Google AI Studio (Gemini)
            export SERVER_API_URL="https://generativelanguage.googleapis.com/v1beta/openai/"
            if [ -z "$SERVER_API_KEY" ]; then
                echo -e "${YELLOW}Warning: --google requires SERVER_API_KEY or --api-key (get from https://aistudio.google.com/apikey)${NC}"
            fi
            if [ -n "$2" ] && [[ ! "$2" =~ ^-- ]]; then
                export SERVER_MODEL="$2"
                shift
            else
                export SERVER_MODEL="${SERVER_MODEL:-gemini-2.0-flash-exp}"
            fi
            shift
            ;;
        --port)
            export PORT="$2"
            shift 2
            ;;
        --help)
            echo "Usage: ./run.sh [options]"
            echo ""
            echo -e "${CYAN}Whisper Options:${NC}"
            echo "  --whisper-model <size>  Model size: tiny, base, small, medium, large"
            echo "  --no-whisper            Disable Whisper transcription"
            echo ""
            echo -e "${CYAN}LLM Provider Shortcuts:${NC}"
            echo "  --lmstudio [model]      Use LM Studio (localhost:1234)"
            echo "  --ollama [model]        Use Ollama (localhost:11434)"
            echo "  --openai [model]        Use OpenAI (requires --api-key)"
            echo "  --openrouter [model]    Use OpenRouter (requires --api-key)"
            echo "  --google [model]        Use Google AI Studio/Gemini (requires --api-key)"
            echo ""
            echo -e "${CYAN}Manual LLM Config:${NC}"
            echo "  --api-key <key>         API key for LLM provider"
            echo "  --api-url <url>         API URL (OpenAI-compatible)"
            echo "  --model <model>         Model name/ID"
            echo ""
            echo -e "${CYAN}Other Options:${NC}"
            echo "  --cookies <file>        Path to YouTube cookies file"
            echo "  --port <port>           Server port (default: 5001)"
            echo "  --help                  Show this help"
            echo ""
            echo -e "${CYAN}Examples:${NC}"
            echo "  ./run.sh --lmstudio meta-llama-3.1-8b-instruct"
            echo "  ./run.sh --ollama llama3.1"
            echo "  ./run.sh --api-key sk-xxx --openai gpt-4o"
            echo "  ./run.sh --api-key AIza... --google gemini-2.0-flash-exp"
            echo "  ./run.sh --whisper-model small"
            echo ""
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Detect hardware
HARDWARE="CPU"
if python3 -c "import torch; exit(0 if torch.cuda.is_available() else 1)" 2>/dev/null; then
    HARDWARE="CUDA (NVIDIA GPU)"
elif python3 -c "import torch; exit(0 if torch.backends.mps.is_available() else 1)" 2>/dev/null; then
    HARDWARE="MPS (Apple Silicon GPU)"
fi

# Pre-download silero-vad model if VAD is enabled
if [ "${ENABLE_VAD:-true}" = "true" ]; then
    VAD_CACHE_DIR="$HOME/.cache/torch/hub/snakers4_silero-vad_master"
    if [ ! -d "$VAD_CACHE_DIR" ]; then
        echo -e "${YELLOW}Pre-downloading silero-vad model...${NC}"
        python3 -c "
import torch
try:
    torch.hub.load('snakers4/silero-vad', 'silero_vad', force_reload=False, trust_repo=True)
    print('silero-vad downloaded successfully')
except Exception as e:
    print(f'Warning: Could not pre-download silero-vad: {e}')
" 2>/dev/null || echo -e "${YELLOW}VAD download skipped (will retry at runtime)${NC}"
    fi
fi

# Detect whisper backend (priority: mlx-whisper > faster-whisper > openai-whisper)
WHISPER_BACKEND=$(python3 -c "
import platform
import sys

# Check for mlx-whisper first (Apple Silicon only)
if platform.system() == 'Darwin' and platform.machine() == 'arm64':
    try:
        import mlx_whisper
        print('mlx-whisper (Metal GPU - Apple Silicon)')
        sys.exit(0)
    except ImportError:
        pass

# Check for faster-whisper (REMOVED: We use mlx-whisper exclusively on Mac)
# try:
#     from faster_whisper import WhisperModel
#     print('faster-whisper (CTranslate2 - optimized)')
#     sys.exit(0)
# except ImportError:
#     pass

print('openai-whisper')
" 2>/dev/null || echo "openai-whisper")

# Determine Whisper backend based on platform
if [ "$DETECTED_PLATFORM" = "macos" ]; then
    WHISPER_BACKEND_NAME="mlx-whisper (Metal GPU)"
    DIARIZATION_BACKEND_NAME="pyannote (MPS/CPU)"
elif [ "$DETECTED_PLATFORM" = "linux-cuda" ]; then
    WHISPER_BACKEND_NAME="openai-whisper (CUDA)"
    DIARIZATION_BACKEND_NAME="pyannote (CUDA)"
else
    WHISPER_BACKEND_NAME="openai-whisper (CPU)"
    DIARIZATION_BACKEND_NAME="pyannote (CPU)"
fi

# Show configuration
echo -e "${GREEN}Configuration:${NC}"
echo "  • Platform: $DETECTED_PLATFORM"
echo "  • Hardware: $HARDWARE"
echo "  • Whisper: $ENABLE_WHISPER (model: $WHISPER_MODEL)"
echo "  • Whisper Backend: $WHISPER_BACKEND_NAME"
echo "  • Diarization: $DIARIZATION_BACKEND_NAME"
# Detect LLM provider configuration
LLM_CONFIGURED=false
LLM_DISPLAY_PROVIDER=""
LLM_DISPLAY_MODEL=""

if [ -n "$LLM_PROVIDER" ]; then
    case "$LLM_PROVIDER" in
        openai)
            [ -n "$OPENAI_API_KEY" ] && LLM_CONFIGURED=true
            LLM_DISPLAY_PROVIDER="OpenAI"
            LLM_DISPLAY_MODEL="${OPENAI_MODEL:-gpt-4o-mini}"
            ;;
        anthropic)
            [ -n "$ANTHROPIC_API_KEY" ] && LLM_CONFIGURED=true
            LLM_DISPLAY_PROVIDER="Anthropic"
            LLM_DISPLAY_MODEL="${ANTHROPIC_MODEL:-claude-3-5-sonnet-latest}"
            ;;
        google)
            [ -n "$GOOGLE_API_KEY" ] && LLM_CONFIGURED=true
            LLM_DISPLAY_PROVIDER="Google"
            LLM_DISPLAY_MODEL="${GOOGLE_MODEL:-gemini-2.0-flash-exp}"
            ;;
        deepseek)
            [ -n "$DEEPSEEK_API_KEY" ] && LLM_CONFIGURED=true
            LLM_DISPLAY_PROVIDER="DeepSeek"
            LLM_DISPLAY_MODEL="${DEEPSEEK_MODEL:-deepseek-chat}"
            ;;
        mistral)
            [ -n "$MISTRAL_API_KEY" ] && LLM_CONFIGURED=true
            LLM_DISPLAY_PROVIDER="Mistral"
            LLM_DISPLAY_MODEL="${MISTRAL_MODEL:-mistral-large-latest}"
            ;;
        openrouter)
            [ -n "$OPENROUTER_API_KEY" ] && LLM_CONFIGURED=true
            LLM_DISPLAY_PROVIDER="OpenRouter"
            LLM_DISPLAY_MODEL="${OPENROUTER_MODEL:-google/gemini-2.0-flash-exp:free}"
            ;;
        ollama)
            LLM_CONFIGURED=true
            LLM_DISPLAY_PROVIDER="Ollama"
            LLM_DISPLAY_MODEL="${OLLAMA_MODEL:-llama3.3}"
            ;;
    esac
fi

# Fallback to legacy SERVER_API_KEY
if [ "$LLM_CONFIGURED" = false ] && [ -n "$SERVER_API_KEY" ]; then
    LLM_CONFIGURED=true
    LLM_DISPLAY_PROVIDER="Custom"
    LLM_DISPLAY_MODEL="${SERVER_MODEL:-gpt-4o-mini}"
fi

if [ "$LLM_CONFIGURED" = true ]; then
    echo -e "  • Tier 3: ${GREEN}Enabled${NC}"
    echo "    └─ Provider: $LLM_DISPLAY_PROVIDER"
    echo "    └─ Model: $LLM_DISPLAY_MODEL"
else
    echo "  • Tier 3: Disabled (no API key)"
fi
if [ -n "$COOKIES_FILE" ]; then
    echo "  • Cookies: $COOKIES_FILE"
fi
echo ""

echo -e "${GREEN}Starting server on http://localhost:${PORT:-5001}${NC}"
echo ""

# Run the server
python app.py
