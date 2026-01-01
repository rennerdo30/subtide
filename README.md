# Video Translate
<p align="center">
  <img src="icons/icon.svg" width="128" height="128" alt="Video Translate Logo">
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
- 🌍 **12+ Languages** — Support for major world languages
- 🔑 **Flexible API** — Works with OpenAI, OpenRouter, or any OpenAI-compatible API
- 💾 **Smart Caching** — Translations are cached for instant replay
- 🎨 **Beautiful UI** — Clean, modern dark theme interface

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
3. Click "Load unpacked" and select the project folder
4. The extension icon will appear in your toolbar

### 3. Configure

1. Click the extension icon
2. Select your operation mode:
   - **Tier 1** — Standard (YouTube captions + your API key)
   - **Tier 2** — Enhanced (Whisper transcription + your API key)
   - **Tier 3** — Managed (Server handles API keys)
3. Enter your API key and model (for Tier 1 & 2)
4. Save configuration

### 4. Translate!

1. Go to any YouTube video
2. Click the translate button in the player
3. Select your target language
4. Enjoy translated subtitles!

## Operation Modes

This project is fully open-source with no paid plans. The "Tiers" refer to different technical configurations:

| Feature | Tier 1 (Standard) | Tier 2 (Enhanced) | Tier 3 (Managed) |
|---------|-------------------|-------------------|------------------|
| YouTube Captions | ✅ | ✅ | ✅ |
| Whisper Transcription | ❌ | ✅ | ✅ |
| API Key Location | Browser (User's) | Browser (User's) | Server (Env Var) |
| Force AI Generation | ❌ | ✅ | ✅ |

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
├── src/
│   ├── background/         # Service worker
│   ├── content/            # YouTube integration
│   ├── lib/                # Shared utilities
│   └── popup/              # Extension popup UI
├── icons/                  # Extension icons
├── manifest.json           # Chrome extension manifest
└── SPECIFICATION.md        # Detailed documentation
```

## License

MIT License - See [LICENSE](LICENSE) for details.
