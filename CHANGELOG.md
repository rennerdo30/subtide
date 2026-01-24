# Changelog

All notable changes to Subtide will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.2] - 2026-01-24

### Added

#### Security Improvements
- **Tier Spoofing Prevention** - API tier is now determined server-side based on API key presence, not client claims
- **SSRF Protection** - Added URL domain whitelist to prevent Server-Side Request Forgery attacks
- **API Key Masking** - All API keys are now masked in logs (shows only first/last 4 chars)
- **Request ID Tracking** - All requests now include unique request IDs for log correlation

#### Performance Optimizations
- **O(n) Translation Retry** - Optimized empty translation retry from O(n²) to O(n) using set-based tracking
- **O(n log m) Speaker Matching** - Optimized diarization speaker matching using binary search

#### New API Endpoints
- `GET /api/version` - Returns version, build date, platform, and feature flags
- `GET /ping` - Returns JSON response for health checks

#### Developer Experience
- **Retry Decorator** - New `@retry` decorator with exponential backoff for flaky operations
- **Request ID Middleware** - Automatic request ID injection for all Flask requests
- **Real Video Integration Tests** - End-to-end pipeline tests with actual YouTube videos

#### Testing Improvements
- **262 tests** now passing (up from 188)
- Added 29 real video integration tests
- Added cache layer tests (15 tests)
- Added LLM provider factory tests (15 tests)
- Added integration tests (25 tests)

#### CI/CD Improvements
- Added code quality checks (flake8, black, isort)
- Added security scanning (Bandit, pip-audit)
- Backend tests now run with coverage reporting

### Fixed
- Extension memory leaks - MutationObservers and intervals now properly cleaned up on navigation
- Integration tests using correct API routes

### Changed
- Whisper `no_speech_threshold` default is now 0.4 (more sensitive, catches quieter speech)
- Hallucination filter thresholds relaxed for better accuracy with accented speech

---

## [1.1.1] - 2026-01-18

### Changed

#### Rebrand to Subtide
- New logo featuring ocean wave and subtitle motif
- Updated all branding from "Video Translate" to "Subtide"
- New popup header with matching inline SVG logo
- Updated all GitHub URLs to github.com/rennerdo30/subtide
- Renamed extension packages to subtide-extension
- Renamed backend binaries to subtide-backend
- Updated Docker image names and volumes

---

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

[1.1.0]: https://github.com/rennerdo30/subtide/releases/tag/v1.1.0
