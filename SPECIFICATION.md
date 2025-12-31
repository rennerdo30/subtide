# Video Translate - Specification

## Overview
A Chrome extension + Python backend that translates YouTube video subtitles in real-time using LLM APIs.

## Architecture

### Components
1. **Chrome Extension** (Frontend)
   - Popup UI for configuration
   - Content script for YouTube integration
   - Background service worker for API communication

2. **Python Backend** (Flask)
   - Subtitle fetching via yt-dlp
   - Whisper transcription (optional)
   - Translation via LLM APIs (Tier 3 only)
   - Caching layer

### Service Tiers

| Feature | Tier 1 (Free) | Tier 2 (Basic) | Tier 3 (Pro) |
|---------|---------------|----------------|--------------|
| YouTube Subtitles | ✅ | ✅ | ✅ |
| Whisper Transcription | ❌ | ✅ | ✅ |
| Force AI Generation | ❌ | ✅ | ✅ |
| LLM Translation | ✅ (Own Key) | ✅ (Own Key) | ✅ (Managed) |
| API Key Required | Yes | Yes | No |

### Security Model

**IMPORTANT**: User API keys NEVER leave the extension for Tier 1 & 2.

- **Tier 1 & 2**:
  - Backend only fetches subtitles (no API key sent)
  - Extension makes direct LLM API calls (API key stays local)
  - User's API key is stored in `chrome.storage.local`

- **Tier 3**:
  - Single backend call handles everything
  - Server uses its own managed API key
  - No user API key needed

## Extension Features

### Popup Settings
- **Service Tier Selection**: Choose between Free, Basic, or Pro tiers
- **Provider Selection**: OpenAI, OpenRouter, or Custom endpoint
- **API Configuration**: URL, Key, Model
- **Force AI Generation**: Use Whisper instead of YouTube captions
- **Default Language**: Target translation language
- **Cache Management**: View and clear translation cache

### YouTube Integration
- Translate button injected into player controls
- Language selector dropdown
- Real-time subtitle overlay
- Network interception for caption data

## Backend API

### Endpoints

#### `GET /health`
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "service": "video-translate-backend",
  "features": {
    "whisper": true,
    "tier3": false
  }
}
```

---

#### `GET /api/subtitles`
Fetch YouTube subtitles via yt-dlp. Used by **all tiers**.

**Parameters:**
- `video_id` (required): YouTube video ID
- `tier` (required): User tier (tier1, tier2, tier3)
- `lang` (optional): Language code (default: "en")

**Response:** JSON3 subtitle format
```json
{
  "events": [
    {
      "tStartMs": 0,
      "dDurationMs": 3000,
      "segs": [{"utf8": "Hello world"}]
    }
  ]
}
```

**Security**: No API key required. Only fetches publicly available captions.

---

#### `GET /api/transcribe`
Generate subtitles using Whisper. Used by **Tier 2 & 3**.

**Parameters:**
- `video_id` (required): YouTube video ID
- `tier` (required): User tier (tier2, tier3)

**Response:** Whisper transcription result
```json
{
  "segments": [
    {
      "start": 0.0,
      "end": 3.5,
      "text": "Hello world"
    }
  ]
}
```

**Restrictions:** Tier 2+ only. Returns 403 for Tier 1.

**Security**: No API key required. Uses server-side Whisper model.

---

#### `POST /api/process`
Combined subtitle fetch + translation. Used by **Tier 3 only**.

Single endpoint that fetches subtitles (or generates via Whisper) and translates them in one call. Server uses its own managed API key.

**Body:**
```json
{
  "video_id": "dQw4w9WgXcQ",
  "target_lang": "ja",
  "force_whisper": false
}
```

**Response:**
```json
{
  "subtitles": [
    {
      "start": 0,
      "end": 3000,
      "text": "Hello world",
      "translatedText": "こんにちは世界"
    }
  ],
  "cached": false
}
```

**Restrictions:** Tier 3 only. Returns 403 for other tiers.

**Security**: No user API key sent. Server uses `SERVER_API_KEY` environment variable.

---

### Deprecated Endpoints

#### `POST /api/translate` *(DEPRECATED)*
**DO NOT USE** - This endpoint previously accepted user API keys which is a security risk.

Tier 1 & 2 now call LLM APIs directly from the extension.
Tier 3 should use `/api/process` instead.

## Configuration

### Environment Variables (Backend)

| Variable | Description | Default |
|----------|-------------|---------|
| `ENABLE_WHISPER` | Enable Whisper transcription | `true` |
| `SERVER_API_KEY` | API key for Tier 3 managed translation | - |
| `SERVER_MODEL` | Default model for Tier 3 | `gpt-3.5-turbo` |
| `SERVER_API_URL` | Custom API URL for Tier 3 | - |

### Extension Storage

| Key | Description |
|-----|-------------|
| `apiUrl` | LLM API endpoint |
| `apiKey` | User's API key |
| `provider` | Provider selection (openai/openrouter/custom) |
| `model` | Model identifier |
| `tier` | Service tier |
| `forceGen` | Force Whisper generation |
| `defaultLanguage` | Default target language |

## Supported Languages

- 🇬🇧 English (en)
- 🇯🇵 Japanese (ja)
- 🇰🇷 Korean (ko)
- 🇨🇳 Chinese Simplified (zh-CN)
- 🇹🇼 Chinese Traditional (zh-TW)
- 🇪🇸 Spanish (es)
- 🇫🇷 French (fr)
- 🇩🇪 German (de)
- 🇵🇹 Portuguese (pt)
- 🇷🇺 Russian (ru)
- 🇸🇦 Arabic (ar)
- 🇮🇳 Hindi (hi)

## Deployment

### Docker
```bash
# Tier 1 (No Whisper)
docker-compose up video-translate-tier1

# Tier 2 (Whisper enabled)
docker-compose up video-translate-tier2

# Tier 3 (Managed translation)
SERVER_API_KEY=sk-xxx docker-compose up video-translate-tier3
```

### Local Development
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python app.py
```

## Technology Stack

- **Frontend**: Chrome Extension (Manifest V3), Vanilla JS
- **Backend**: Python 3.9+, Flask, Gunicorn
- **AI**: OpenAI Whisper, OpenAI/OpenRouter APIs
- **Tools**: yt-dlp, Docker
