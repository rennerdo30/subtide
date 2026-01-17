# Changelog

All notable changes to Subtide will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-01-18

### Added

#### Platform Support
- **YouTube** - Full video translation with native UI integration
- **YouTube Shorts** - Pre-translation mode for instant subtitles while swiping
- **Twitch** - Live stream translation support
- **Generic Sites** - Works on any site with `<video>` elements

#### Translation Features
- Real-time subtitle translation powered by LLM APIs
- Support for OpenAI, OpenRouter, and any OpenAI-compatible API
- Local LLM support via LM Studio and Ollama
- Context-aware translation that merges partial sentences for better quality
- Smart caching system for instant replay of translated content

#### Transcription (Whisper)
- **MLX Whisper** - Apple Silicon optimized backend (M1/M2/M3/M4)
- **Faster-Whisper** - CUDA-accelerated for NVIDIA GPUs
- **OpenAI Whisper** - Cloud-based transcription option
- Model size options: tiny, base, small, medium, large-v3, large-v3-turbo

#### Operation Tiers
- **Tier 1 (Standard)** - Uses existing YouTube captions with browser API key
- **Tier 2 (Enhanced)** - Whisper transcription with browser API key
- **Tier 3 (Managed)** - Server-side API key for shared deployments
- **Tier 4 (Stream)** - Progressive translation with instant subtitle streaming

#### Supported Languages
- English, Spanish, French, German, Portuguese, Russian, Italian
- Japanese, Korean, Chinese (Simplified), Chinese (Traditional)
- Arabic, Hindi
- Plus 6 additional UI languages

#### User Interface
- Modern dark theme with teal accent colors
- Draggable subtitle positioning (drag to move, double-click to reset)
- Adjustable subtitle sizes: Small, Medium, Large, XL
- Dual subtitle mode showing original + translated text simultaneously
- Native integration with YouTube player controls

#### Text-to-Speech (TTS)
- Audio playback of translated subtitles
- Configurable voice and speed settings
- Synchronized with subtitle display

#### Export Options
- Download subtitles in SRT format
- Download subtitles in VTT format
- Download subtitles in plain text (TXT) format

#### Keyboard Shortcuts
- `T` - Toggle subtitles on/off
- `D` - Toggle dual subtitle mode
- `S` - Download subtitles

#### Deployment Options
- **Binary** - Standalone executables for Linux, macOS, Windows
- **Source** - Run directly with Python 3.9+
- **Docker** - Pre-built images for all tiers
- **RunPod** - Serverless GPU deployment for cloud transcription

#### Backend Features
- Flask-based REST API
- Health check endpoint
- Translation status tracking
- Configurable CORS settings
- Gunicorn production server with worker scaling

#### Developer Features
- Comprehensive test suite (186+ tests)
- Debug logging system with multiple verbosity levels
- Chrome Extension Manifest V3
- Internationalization support (i18n) with 50+ locales

### Technical Details

#### Chrome Extension
- Manifest V3 compliant
- Service worker for background processing
- Content scripts for YouTube, Twitch, and generic video players
- Offscreen document for audio capture

#### Backend API Endpoints
- `GET /health` - Health check
- `POST /api/translate` - Batch translation
- `POST /api/stream` - Streaming translation (Tier 4)
- `GET /api/status/{id}` - Translation job status

---

[1.1.0]: https://github.com/rennerdo30/video-translate/releases/tag/v1.1.0
