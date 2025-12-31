#!/bin/bash
# Video Translate Backend Runner
# Usage: ./run.sh [options]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Video Translate Backend Server     ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Check if venv exists
if [ ! -d "venv" ]; then
    echo -e "${YELLOW}Creating virtual environment...${NC}"
    python3 -m venv venv
    source venv/bin/activate
    echo -e "${YELLOW}Installing dependencies...${NC}"
    pip install -r requirements.txt
else
    source venv/bin/activate
fi

# Load .env file if it exists
if [ -f ".env" ]; then
    echo -e "${CYAN}Loading configuration from .env${NC}"
    set -a
    source .env
    set +a
fi

# Kill any existing process on port 5001
if lsof -i:5001 -t &>/dev/null; then
    echo -e "${YELLOW}Stopping existing server on port 5001...${NC}"
    kill -9 $(lsof -t -i:5001) 2>/dev/null || true
    sleep 1
fi

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

# Show configuration
echo -e "${GREEN}Configuration:${NC}"
echo "  • Whisper: $ENABLE_WHISPER (model: $WHISPER_MODEL)"
if [ -n "$SERVER_API_KEY" ]; then
    echo -e "  • Tier 3: ${GREEN}Enabled${NC}"
    echo "    └─ API URL: ${SERVER_API_URL:-https://api.openai.com/v1}"
    echo "    └─ Model: ${SERVER_MODEL:-gpt-4o-mini}"
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
if [ -n "$PORT" ]; then
    python -c "
import app
app.app.run(host='0.0.0.0', port=$PORT, debug=False)
"
else
    python app.py
fi
