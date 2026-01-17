# Changelog

All notable changes to Subtide are documented here.

For the full changelog, see [CHANGELOG.md](https://github.com/rennerdo30/subtide/blob/main/CHANGELOG.md) in the repository.

---

## [1.1.1] - 2026-01-18

### Rebrand to Subtide

- New logo featuring ocean wave and subtitle motif
- Updated all branding from "Video Translate" to "Subtide"
- New popup header with matching inline SVG logo
- Renamed extension and backend packages

---

## [1.1.0] - 2026-01-18

Initial release of Subtide.

### Platform Support

- **YouTube** - Full video translation with native UI integration
- **YouTube Shorts** - Pre-translation mode for instant subtitles
- **Twitch** - Live stream translation support
- **Generic Sites** - Works on any site with `<video>` elements

### Translation Features

- Real-time subtitle translation powered by LLM APIs
- Support for OpenAI, OpenRouter, and OpenAI-compatible APIs
- Local LLM support via LM Studio and Ollama
- Context-aware translation
- Smart caching system

### Transcription (Whisper)

- **MLX Whisper** - Apple Silicon optimized
- **Faster-Whisper** - CUDA-accelerated for NVIDIA GPUs
- **OpenAI Whisper** - Cloud-based option
- Model sizes: tiny, base, small, medium, large-v3, large-v3-turbo

### Operation Tiers

- **Tier 1** - YouTube captions with browser API key
- **Tier 2** - Whisper transcription with browser API key
- **Tier 3** - Server-side API key
- **Tier 4** - Progressive streaming translation

### User Interface

- Modern dark theme with teal accents
- Draggable subtitle positioning
- Adjustable subtitle sizes (S/M/L/XL)
- Dual subtitle mode
- Native YouTube player integration

### Additional Features

- Text-to-Speech (TTS) support
- Subtitle export (SRT, VTT, TXT)
- Keyboard shortcuts (T, D, S)
- 13+ supported languages

### Deployment Options

- Standalone binaries (Linux, macOS, Windows)
- Docker images
- RunPod serverless/dedicated
- Python source

---

## Links

- [Full Changelog](https://github.com/rennerdo30/subtide/blob/main/CHANGELOG.md)
- [Releases](https://github.com/rennerdo30/subtide/releases)
- [GitHub Repository](https://github.com/rennerdo30/subtide)
