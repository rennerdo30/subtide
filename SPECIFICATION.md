# Video Translate - Chrome Extension

## Overview
A Chrome extension that translates video subtitles using any OpenAI-compatible LLM API. Initially supports YouTube with plans for expansion.

## Features

### Core Features
- **Subtitle Extraction**: Extract existing YouTube captions (auto-generated or uploaded)
- **Batch Translation**: Pre-translate entire subtitle track before video playback
- **Native Subtitle Display**: Show translated subtitles in YouTube's native style
- **In-Player Language Selector**: Select target language directly in the video player
- **Caching**: Store translations locally to avoid re-translating

### Configuration
Minimal configuration required:
- **API URL**: OpenAI-compatible API endpoint (e.g., `https://api.openai.com/v1`, Ollama, etc.)
- **API Key**: Authentication key for the API
- **Model**: Model identifier (e.g., `gpt-4o-mini`, `llama3.2`, etc.)

## Technical Architecture

### Components

```
video-translate/
├── manifest.json          # Chrome extension manifest (v3)
├── src/
│   ├── background/
│   │   └── service-worker.js    # Background service worker
│   ├── content/
│   │   ├── youtube.js           # YouTube content script
│   │   ├── subtitle-extractor.js # Extract subtitles from YouTube
│   │   ├── subtitle-display.js   # Display translated subtitles
│   │   └── language-selector.js  # In-player language selector UI
│   ├── popup/
│   │   ├── popup.html           # Extension popup UI
│   │   ├── popup.css            # Popup styles
│   │   └── popup.js             # Popup logic
│   └── lib/
│       ├── translator.js        # LLM translation logic
│       ├── cache.js             # Translation caching
│       └── storage.js           # Chrome storage helpers
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── SPECIFICATION.md
├── ISSUES.md
└── README.md
```

### Workflow

1. **Video Load Detection**
   - Content script detects YouTube video page
   - Extracts video ID from URL

2. **Subtitle Extraction**
   - Fetch available caption tracks from YouTube
   - Parse subtitle data (timing + text)

3. **Translation**
   - Check cache for existing translation
   - If not cached, send subtitle text to LLM API in batches
   - Store translated subtitles in cache

4. **Display**
   - Inject language selector into YouTube player controls
   - When language selected, display translated subtitles
   - Sync translations with video playback time

### YouTube Subtitle Extraction

YouTube provides subtitles through the `timedtext` API. We can extract:
- Auto-generated captions
- Uploaded captions in various languages

The subtitle data format:
```json
{
  "events": [
    {
      "tStartMs": 1000,
      "dDurationMs": 2000,
      "segs": [{ "utf8": "Hello world" }]
    }
  ]
}
```

### Translation Strategy

**Batch Processing**:
- Group subtitles into contextual chunks (e.g., 10-20 lines)
- Send to LLM with context about previous/next segments
- Preserve timing information

**Prompt Template**:
```
Translate the following subtitles from {source_language} to {target_language}.
Maintain the original meaning and tone. Keep translations concise for subtitle display.
Return ONLY the translations, one per line, matching the input order.

Subtitles:
1. [original text 1]
2. [original text 2]
...
```

### Caching Strategy

Cache key: `{videoId}_{sourceLanguage}_{targetLanguage}_{modelHash}`

Storage: Chrome's `chrome.storage.local` (10MB limit)
- LRU eviction for old translations
- Store translation timestamp for freshness

## User Interface

### Extension Popup
- API URL input field
- API Key input field (masked)
- Model name input field
- Default target language dropdown
- Status indicator (configured/not configured)
- Clear cache button

### In-Player Language Selector
- Dropdown button in YouTube player controls (near settings gear)
- Lists available target languages
- Shows translation status (loading/ready/error)
- Option to disable/enable translated subtitles

## Supported Languages

Initial target languages:
- English (en)
- Japanese (ja)
- Korean (ko)
- Chinese Simplified (zh-CN)
- Chinese Traditional (zh-TW)
- Spanish (es)
- French (fr)
- German (de)
- Portuguese (pt)
- Russian (ru)
- Arabic (ar)
- Hindi (hi)

## Future Enhancements

- [ ] Support for other video platforms (Twitch, Netflix, etc.)
- [ ] Dual subtitle mode (original + translated)
- [ ] Subtitle style customization
- [ ] Translation quality options
- [ ] Offline translation with local models
- [ ] Export translated subtitles (SRT/VTT)

## Privacy & Security

- API keys stored locally in Chrome storage
- No data sent to external servers except chosen LLM API
- All translations cached locally
- No analytics or tracking

## Version History

### v1.0.0 (Initial Release)
- YouTube support
- OpenAI-compatible API translation
- In-player language selector
- Local caching
