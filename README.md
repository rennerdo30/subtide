# Video Translate
<p align="center">
  <img src="extension/icons/icon.svg" width="128" height="128" alt="Video Translate Logo">
</p>

<p align="center">
  <b>AI-powered YouTube subtitle translation using LLMs and Whisper.</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License">
  <img src="https://img.shields.io/badge/python-3.9+-yellow.svg" alt="Python">
  <img src="https://img.shields.io/badge/chrome-v3-blue.svg" alt="Chrome Extension">
</p>

## Features

- 🎬 **Real-time Translation** — Translate YouTube subtitles on the fly
- 🤖 **AI Transcription** — Generate subtitles with Whisper when none exist
- ⚡ **Streaming Mode** — See subtitles within 15 seconds, not minutes (Tier 4)
- 🌍 **12+ Languages** — Support for major world languages
- 🔑 **Flexible API** — Works with OpenAI, OpenRouter, or any OpenAI-compatible API
- 💾 **Smart Caching** — Translations are cached for instant replay
- 🎨 **Modern UI** — Clean dark theme with soft cyan accents, Outfit typography
- ⌨️ **Keyboard Shortcuts** — Toggle subtitles (T), switch mode (D), download (S)
- 📺 **Dual Subtitles** — Show original + translated text simultaneously
- 📥 **Subtitle Download** — Export as SRT, VTT, or TXT
- 🎯 **Smart Language Detection** — Skip translation when source = target
- 🧠 **Context-Aware Translation** — Merges partial sentences for better quality

## Quick Start

### 1. Start the Backend

**Option A: Download Binary (Recommended)**

Download the latest backend binary for your OS from the [Releases](https://github.com/rennerdo30/video-translate/releases) page:
- `video-translate-backend-linux`
- `video-translate-backend-macos`
- `video-translate-backend-windows.exe`

> **Prerequisite**: [FFmpeg](https://ffmpeg.org/download.html) must be installed.

```bash
# Make executable (Linux/macOS only)
chmod +x video-translate-backend-macos

# Run
./video-translate-backend-macos
```

**Option B: Run from Source**

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
./run.sh
```

### 2. Install the Extension

1. Open Chrome and go to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `extension` folder
4. The extension icon will appear in your toolbar

### 3. Configure

1. Click the extension icon
2. Select your operation mode:
   - **Tier 1** — Standard (YouTube captions + your API key)
   - **Tier 2** — Enhanced (Whisper transcription + your API key)
   - **Tier 3** — Managed (Server handles API keys)
   - **Tier 4** — Stream (Progressive translation, subtitles appear instantly)
3. Enter your API key and model (for Tier 1 & 2)
4. Save configuration

### 4. Translate!

1. Go to any YouTube video
2. Click the translate button in the player
3. Select your target language
4. Enjoy translated subtitles!

## Operation Modes

This project is fully open-source with no paid plans. The "Tiers" refer to different technical configurations:

| Feature | Tier 1 (Standard) | Tier 2 (Enhanced) | Tier 3 (Managed) | Tier 4 (Stream) |
|---------|-------------------|-------------------|------------------|-----------------|
| YouTube Captions | ✅ | ✅ | ✅ | ✅ |
| Whisper Transcription | ❌ | ✅ | ✅ | ✅ |
| API Key Location | Browser (User's) | Browser (User's) | Server (Env Var) | Server (Env Var) |
| Force AI Generation | ❌ | ✅ | ✅ | ✅ |
| Progressive Streaming | ❌ | ❌ | ❌ | ✅ |

**Tier 4 (Stream)** provides the fastest experience — subtitles appear within seconds as each batch translates, instead of waiting for the entire video to finish processing.

## Supported Languages

🇬🇧 English • 🇯🇵 Japanese • 🇰🇷 Korean • 🇨🇳 Chinese • 🇪🇸 Spanish • 🇫🇷 French • 🇩🇪 German • 🇵🇹 Portuguese • 🇷🇺 Russian • 🇸🇦 Arabic • 🇮🇳 Hindi • 🇹🇼 Traditional Chinese

## Docker Deployment

```bash
cd backend

# Development
docker-compose up video-translate-tier1

# With Whisper
docker-compose up video-translate-tier2

# Fully managed (set your API key)
SERVER_API_KEY=sk-xxx docker-compose up video-translate-tier3

# Streaming mode (same setup as tier3)
SERVER_API_KEY=sk-xxx docker-compose up video-translate-tier3
```

> **Note**: Tier 4 uses the same backend configuration as Tier 3 but uses the `/api/stream` endpoint for progressive subtitle delivery.

## Cloud Deployment (RunPod)

For GPU-accelerated transcription, deploy on [RunPod.io](https://runpod.io):

- **Serverless Queue**: Pay per second, scales to zero
- **Dedicated Pod**: Flat rate, full streaming support

```bash
# Pull the latest image
docker pull ghcr.io/rennerdo30/video-translate-runpod:latest
```

Configure the extension with your RunPod endpoint URL:
- **Serverless**: `https://api.runpod.ai/v2/{ENDPOINT_ID}`
- **Dedicated**: `https://pod-id-5001.proxy.runpod.net`

See [backend/RUNPOD.md](backend/RUNPOD.md) for complete deployment instructions.

## Local LLM Setup (LM Studio / Ollama)

You can run translations completely locally using LM Studio or Ollama instead of cloud APIs.

### LM Studio

1. Download [LM Studio](https://lmstudio.ai/)
2. Download a model (see recommendations below)
3. Start the local server (default: `http://localhost:1234/v1`)
4. In the extension, set:
   - **Provider**: Custom Endpoint
   - **API URL**: `http://localhost:1234/v1`
   - **API Key**: `lm-studio` (or leave blank)

### Ollama

1. Install [Ollama](https://ollama.ai/)
2. Pull a model: `ollama pull llama3.1:8b`
3. Ollama runs on `http://localhost:11434` by default
4. In the extension, set:
   - **Provider**: Custom Endpoint
   - **API URL**: `http://localhost:11434/v1`
   - **API Key**: `ollama` (or leave blank)

### Hardware Requirements

Running translation LLMs alongside Whisper requires planning. Here's what you need:

#### Memory Allocation (Running Both)

| Component | VRAM/RAM Needed |
|-----------|-----------------|
| Whisper tiny | ~1 GB |
| Whisper base | ~1.5 GB |
| Whisper small | ~2 GB |
| Whisper medium | ~5 GB |
| Whisper large-v3 | ~10 GB |
| **LLM 7-8B (Q4)** | **~4-6 GB** |
| **LLM 13B (Q4)** | **~8-10 GB** |
| **LLM 70B (Q4)** | **~40 GB** |

#### Mac Recommendations (Apple Silicon)

| Mac | Unified Memory | Whisper | LLM | Notes |
|-----|---------------|---------|-----|-------|
| M1/M2 (8GB) | 8 GB | tiny/base only | ❌ Not recommended | Swap thrashing likely |
| M1/M2 (16GB) | 16 GB | small | Llama 3.1 8B Q4 | Comfortable for both |
| M1/M2 Pro (16GB) | 16 GB | medium | Llama 3.1 8B Q4 | Good balance |
| M1/M2 Pro (32GB) | 32 GB | large-v3 | Llama 3.1 8B Q4 | Full quality |
| M1/M2 Max (32GB) | 32 GB | large-v3 | Mistral 7B Q8 | High quality LLM |
| M1/M2 Max (64GB) | 64 GB | large-v3 | Llama 3.1 70B Q4 | Best local quality |
| M2/M3 Ultra (128GB+) | 128+ GB | large-v3 | Llama 3.1 70B Q8 | Premium setup |

**Recommended MLX Whisper model**: `large-v3-turbo` (optimized for Apple Silicon)

```bash
# Set in .env
WHISPER_MODEL=large-v3-turbo
WHISPER_BACKEND=mlx
```

#### NVIDIA GPU Recommendations

| GPU | VRAM | Whisper | LLM | Notes |
|-----|------|---------|-----|-------|
| RTX 3060 | 12 GB | medium | Llama 3.1 8B Q4 | Entry point for both |
| RTX 3070/3080 | 8-10 GB | small | Llama 3.1 8B Q4 | Tight but works |
| RTX 3090/4080 | 16-24 GB | large-v3 | Llama 3.1 8B Q8 | Comfortable |
| RTX 4090 | 24 GB | large-v3 | Llama 3.1 13B Q4 | Great quality |
| 2x RTX 4090 | 48 GB | large-v3 | Llama 3.1 70B Q4 | Near-cloud quality |
| A100/H100 | 40-80 GB | large-v3 | Llama 3.1 70B Q8 | Server-grade |

**Recommended faster-whisper model**: `large-v3` with `WHISPER_BACKEND=faster`

### Recommended Models for Translation

| Model | Size | Quality | Speed | Best For |
|-------|------|---------|-------|----------|
| `llama3.1:8b` | 4.7 GB | Good | Fast | Most users |
| `mistral:7b` | 4.1 GB | Good | Fast | General use |
| `qwen2.5:7b` | 4.4 GB | Excellent | Fast | Asian languages |
| `llama3.1:70b-q4` | 40 GB | Excellent | Slow | Best quality |
| `command-r:35b-q4` | 20 GB | Excellent | Medium | Multilingual |

### Configuration Example

```bash
# .env for local LLM
SERVER_API_URL=http://localhost:1234/v1
SERVER_MODEL=llama3.1:8b
SERVER_API_KEY=lm-studio

# Whisper for your hardware
WHISPER_MODEL=large-v3-turbo  # Mac
# WHISPER_MODEL=large-v3       # NVIDIA GPU
```

## Tech Stack

- **Extension**: Chrome Manifest V3, Vanilla JavaScript
- **Backend**: Python 3.9+, Flask, Gunicorn
- **AI**: OpenAI Whisper, GPT-4/Claude/Llama via API
- **Tools**: yt-dlp, Docker

## Project Structure

```
video-translate/
├── backend/
│   ├── app.py              # Flask entry point
│   ├── config.py           # Configuration
│   ├── services/           # Business logic (Whisper, YouTube, Translation)
│   ├── routes/             # API Endpoints
│   ├── utils/              # Helper utilities
│   ├── requirements.txt    # Python dependencies
│   ├── Dockerfile          # Container configuration
│   └── docker-compose.yml  # Multi-tier deployment
├── extension/
│   ├── manifest.json       # Chrome extension manifest
│   ├── _locales/           # Internationalization (i18n)
│   ├── icons/              # Extension icons
│   └── src/                # Extension source code
│       ├── background/     # Service worker
│       ├── content/        # YouTube integration
│       ├── lib/            # Shared utilities
│       ├── offscreen/      # Offscreen audio capture
│       └── popup/          # Extension popup UI
└── SPECIFICATION.md        # Detailed documentation
```

## License

MIT License - See [LICENSE](LICENSE) for details.
