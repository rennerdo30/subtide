# Subtide - Specification

## Overview
A Chrome extension + Python backend that translates video subtitles in real-time using LLM APIs. Works on YouTube, Twitch, and any video site.

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

| Feature | Tier 1 (Free) | Tier 2 (Basic) | Tier 3 (Pro) | Tier 4 (Stream) |
|---------|---------------|----------------|--------------|-----------------|
| YouTube Subtitles | ✅ | ✅ | ✅ | ✅ |
| Whisper Transcription | ❌ | ✅ | ✅ | ✅ |
| Force AI Generation | ❌ | ✅ | ✅ | ✅ |
| LLM Translation | ✅ (Own Key) | ✅ (Own Key) | ✅ (Managed) | ✅ (Managed) |
| API Key Required | Yes | Yes | No | No |
| Progressive Streaming | ❌ | ❌ | ❌ | ✅ |

**Tier 4 (Stream)** provides the fastest user experience by streaming translated subtitles progressively. Each batch of ~25 subtitles is sent to the client immediately when ready, allowing users to see subtitles within 3-5 seconds instead of waiting 30-60+ seconds for the entire translation to complete.

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

- **Tier 4**:
  - Same as Tier 3, but with progressive streaming
  - Subtitles are delivered batch-by-batch as they translate
  - Uses `/api/stream` endpoint instead of `/api/process`

## Extension Features

### Popup Settings
- **Service Tier Selection**: Choose between Free, Basic, Pro, or Stream tiers
- **Provider Selection**: OpenAI, OpenRouter, or Custom endpoint
- **API Configuration**: URL, Key, Model
- **Force AI Generation**: Use Whisper instead of YouTube captions
- **Default Language**: Target translation language
- **Internationalization (i18n)**: Full support for multiple UI languages (English and Spanish included)
- **Cache Management**: View and clear translation cache

### YouTube Integration
- Translate button injected into player controls (bottom right, `.ytp-right-controls`)
- Language selector dropdown
- Real-time subtitle overlay
- Network interception for caption data

### Generic Video Player Integration

For non-YouTube/Twitch sites, the extension uses a different UI approach:

#### UI Positioning (CRITICAL)
- **Control bar at TOP of video** - Never at bottom to avoid blocking native controls
- Native video controls (play, pause, seek, volume, fullscreen) are always at the bottom
- Our controls at the top ensure zero interference with any video player

#### Control Bar Layout
```
┌─────────────────────────────────────────────────────────────┐
│ [▶ Translate]  [EN ▼]  "Translating... 45%"          [⚙]  │
└─────────────────────────────────────────────────────────────┘
                    (at TOP of video)
```
- Auto-hides when mouse leaves video area
- Shows inline status during translation
- Quick language dropdown (50+ languages with search)
- Settings gear opens panel

#### Status Panel (Centered Overlay)
```
┌────────────────────────────────┐
│     Step 2 of 3: Transcribing  │
│  ████████████░░░░░░░░  45%     │
│     Processing audio...        │
└────────────────────────────────┘
```
- Only shown during active translation
- Step indicator with progress bar
- Auto-hides on completion

#### Settings Panel
- Opens below the top control bar (not above)
- Flat menu structure (no deep nesting)
- Appearance settings: size, position, background, color, font, outline, opacity
- Presets: Cinema, Minimal, High Contrast
- Keyboard shortcuts displayed

#### Keyboard Shortcuts
| Key | Action |
|-----|--------|
| Alt+T | Start translation |
| Alt+S | Toggle subtitles |
| Alt+L | Open language menu |
| Escape | Close menus |

#### File Structure
```
extension/src/content/
  generic-styles.js   # CSS with design tokens
  generic-sync.js     # Subtitle synchronization
  generic-ui.js       # UI components
  generic.js          # Entry point
```

## Backend API

### Endpoints

#### `GET /health`
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "service": "subtide-backend",
  "features": {
    "whisper": true,
    "tier3": true
  },
  "config": {
    "model": "gpt-4o-mini",
    "context_size": 128000
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

Uses **Server-Sent Events (SSE)** for real-time progress updates.

**Body:**
```json
{
  "video_id": "dQw4w9WgXcQ",
  "target_lang": "ja",
  "force_whisper": false
}
```

**SSE Progress Events:**
```json
{
  "stage": "translating",
  "message": "Translating subtitles...",
  "percent": 65,
  "step": 3,
  "totalSteps": 4,
  "eta": "45s",
  "batchInfo": {"current": 3, "total": 10}
}
```

**Progress Stages:**
| Stage | Step | Description |
|-------|------|-------------|
| `checking` | 1 | Checking available subtitles |
| `downloading` | 2 | Downloading existing subtitles |
| `whisper` | 2 | Transcribing with Whisper |
| `translating` | 3 | Translating with LLM |
| `complete` | 4 | Processing finished |

**Final Response:**
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

#### `POST /api/stream`
Progressive streaming translation. Used by **Tier 4 only**.

Same functionality as `/api/process` but streams translated subtitle batches immediately as they complete, instead of waiting for all translations to finish.

**Body:**
```json
{
  "video_id": "dQw4w9WgXcQ",
  "target_lang": "ja",
  "force_whisper": false
}
```

**SSE Subtitle Events:**
```json
{
  "stage": "subtitles",
  "message": "Batch 3/10 ready",
  "percent": 67,
  "step": 3,
  "totalSteps": 4,
  "batchInfo": {"current": 3, "total": 10},
  "subtitles": [
    {"start": 50000, "end": 52500, "text": "Hello", "translatedText": "こんにちは"}
  ]
}
```

**Progress Stages:**
| Stage | Description |
|-------|-------------|
| `checking` | Checking available subtitles |
| `downloading` | Fetching subtitles or transcribing |
| `subtitles` | Batch ready with subtitle data |
| `complete` | All batches finished |

**Performance (with Streaming Whisper):**
| Metric | Tier 3 | Tier 4 |
|--------|--------|--------|
| Time to first subtitle | 60-120s | 10-20s |
| Whisper wait time | Full transcription | Progressive |
| Translation batches | All at once | 5 segments at a time |
| User experience | Wait then display | Stream as ready |

> **Note**: Tier 4 uses a subprocess-based Whisper runner that parses stdout in real-time, allowing translation to start while transcription is still running.

---

### Deprecated Endpoints

#### `POST /api/translate`
Standard translation endpoint for Tier 1 & 2 (Optional).
While the extension typically translates client-side for Tier 1 & 2 to keep API keys private, the backend provides this endpoint for convenience and as a fallback.

**Body:**
```json
{
  "subtitles": [...],
  "target_lang": "es",
  "api_key": "sk-...",
  "model": "gpt-4o"
}
```

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
docker-compose up subtide-tier1

# Tier 2 (Whisper enabled)
docker-compose up subtide-tier2

# Tier 3 (Managed translation)
SERVER_API_KEY=sk-xxx docker-compose up subtide-tier3
```

### Local Development
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
./run.sh
```

## Future Roadmap: Accuracy Improvements

### Translation Accuracy

1. **Context Window Optimization** => OK
   - Include previous and next subtitle in translation context
   - Helps LLM understand sentence continuity and speaker intent
   - Implementation: Send 3 subtitles but only use middle translation

2. **Multi-Pass Translation** => OK
   - First pass: Direct translation
   - Second pass: LLM reviews and refines for natural flow
   - Trade-off: 2x API cost, but significantly better quality

3. **Terminology Glossaries** => NO
   - Allow users to upload domain-specific terms
   - Useful for technical content, anime, gaming
   - Implementation: Include glossary in system prompt

4. **Language Detection Pre-Check** => OK
   - Auto-detect source language before translation
   - Prevents translating already-translated subtitles
   - Use small model for detection (fast, cheap)

5. **Sentence Boundary Detection** => OK
   - Merge partial sentences split across subtitles
   - Translate complete thoughts, then re-split
   - Improves translation quality for complex sentences

6. **Model Selection by Language Pair**
   - Some models excel at specific language pairs
   - Claude for Japanese/Korean, GPT-4 for European languages
   - Allow per-language model configuration

### Speaker Detection (Diarization) Accuracy

1. **Pyannote 3.0 Upgrade** => OK
   - Latest model has significant accuracy improvements
   - Better handling of overlapping speech
   - Requires HuggingFace token for access

2. **Speaker Embedding Clustering** => OK
   - Use speaker embeddings to improve clustering
   - Re-cluster at end of processing to fix early errors
   - Implementation: ECAPA-TDNN or WeSpeaker embeddings

3. **Voice Activity Detection Tuning** => OK
   - Adjust VAD onset/offset parameters per content type
   - Music videos need higher threshold
   - Podcasts can use lower threshold

4. **Minimum Speaker Duration** => OK
   - Filter out very short speaker segments (<0.5s)
   - Reduces noise from diarization errors
   - Configurable threshold per use case

5. **Speaker Consistency Post-Processing** => OK
   - If speaker changes for <1s, keep previous speaker
   - Reduces "flickering" between speakers
   - Improves perceived quality significantly

6. **Audio Preprocessing** => OK
   - Noise reduction before diarization
   - Normalize audio levels
   - Consider: RNNoise, DeepFilterNet

7. **Fine-Tuning for Specific Content** => NO
   - Train on anime dialogue patterns
   - Train on podcast conversation patterns
   - Domain-specific diarization models

### Whisper Transcription Accuracy

1. **Large-v3 Model** => NO for now!
   - Significant accuracy improvement over base/small
   - Trade-off: Slower processing, more memory
   - Consider: Distil-Whisper for speed/quality balance

2. **Initial Prompt Injection** => OK
   - Provide video title/description as context
   - Helps with proper nouns, technical terms
   - Implementation: `initial_prompt` parameter

3. **Language Forcing** => hä how do we then detect multiple languages
   - Force source language instead of auto-detect
   - Prevents language confusion in multilingual content
   - Implementation: `language` parameter

4. **Word-Level Timestamps** => OK
   - Enable for more accurate timing
   - Helps with subtitle synchronization
   - Trade-off: Slightly slower processing

5. **Hallucination Filtering** => OK
   - Detect and remove repetitive text (Whisper hallucination)
   - Filter segments with unusually high repetition
   - Check for common hallucination patterns

6. **Faster-Whisper Optimization** => NOT SUPPORTED BY MAC!! NO!!
   - Use CTranslate2 backend for 4x speed
   - INT8 quantization for lower memory
   - Batched inference for multiple segments

### Configuration Recommendations

| Content Type | Whisper Model | Diarization | Translation Model |
|-------------|---------------|-------------|-------------------|
| Short videos (<10min) | large-v3 | On | GPT-4o |
| Long videos (>30min) | distil-large-v3 | Optional | GPT-4o-mini |
| Podcasts | large-v3 | On (tuned) | Claude 3 Haiku |
| Anime | large-v3 | Off | Claude 3 Opus |
| Music videos | base | Off | GPT-4o-mini |

---

## Future Roadmap: Livestream Real-Time Translation (Proposed)

### Overview
A low-latency pipeline to translate live video streams in real-time by capturing tab audio and processing it via a streaming Whisper backend.

### Proposed Architecture

#### 1. Real-Time Audio Capture
- Uses Chrome `tabCapture` API (Extension) to record system audio from the browser tab.
- Audio is chunked (500ms - 1s) and sent via **WebSockets** to the backend.

#### 2. Streaming Transcription
- Backend uses `faster-whisper` in a streaming configuration.
- Voice Activity Detection (VAD) is used to identify speech segments without waiting for 30s chunks.

#### 3. Live Translation Overlay
- The UI uses a "Rolling Subtitles" approach, where text is updated dynamically as the LLM refines the translation of the current sentence.

### Technical Requirements
- **Frontend**: Chrome Offscreen Documents (for `MediaRecorder` support in MV3).
- **Backend**: `Flask-SocketIO` or parallel WebSocket server.
- **AI**: CUDA/MPS acceleration is highly recommended for real-time performance.

---

## Technology Stack


- **Frontend**: Chrome Extension (Manifest V3), Vanilla JS
- **Backend**: Python 3.9+, Flask, Gunicorn
- **AI**: OpenAI Whisper, OpenAI/OpenRouter APIs
- **Tools**: yt-dlp, Docker
