# Subtide

<p align="center">
  <img src="https://raw.githubusercontent.com/rennerdo30/subtide/main/extension/icons/icon128.png" width="128" height="128" alt="Subtide Logo">
</p>

<p align="center">
  <b>AI-powered video subtitle translation for YouTube, Twitch, and any video site.</b>
</p>

---

## Features

### Core Translation
- **Real-time Translation** - Translate video subtitles on the fly
- **AI Transcription** - Generate subtitles with Whisper when none exist
- **Streaming Mode** - See subtitles within seconds, not minutes (Tier 4)
- **13+ Languages** - Support for major world languages
- **Context-Aware** - Merges partial sentences for better translation quality
- **Smart Caching** - Translations cached for instant replay

### Platform Support
- **YouTube** - Full support including embedded players
- **YouTube Shorts** - Pre-translation mode for instant subtitles while swiping
- **Twitch** - Live stream translation support
- **Generic Sites** - Works on any site with `<video>` elements

### User Experience
- **Modern UI** - Clean dark theme with teal accents
- **Draggable Subtitles** - Position subtitles anywhere on screen
- **Adjustable Size** - Small, Medium, Large, and XL subtitle options
- **Dual Subtitles** - Show original + translated text simultaneously
- **Keyboard Shortcuts** - Toggle subtitles (T), switch mode (D), download (S)
- **Subtitle Export** - Download as SRT, VTT, or TXT

### Technical
- **Flexible API** - Works with OpenAI, OpenRouter, or any OpenAI-compatible API
- **Local LLM Support** - Use LM Studio, Ollama, or other local models
- **Apple Silicon Optimized** - MLX Whisper backend for M1/M2/M3/M4 Macs
- **GPU Acceleration** - CUDA support for NVIDIA GPUs

---

## Quick Links

<div class="grid cards" markdown>

-   :material-rocket-launch:{ .lg .middle } __Getting Started__

    ---

    Get up and running with Subtide in minutes

    [:octicons-arrow-right-24: Quick Start](getting-started/quick-start.md)

-   :material-youtube:{ .lg .middle } __YouTube Guide__

    ---

    Learn how to use Subtide with YouTube videos

    [:octicons-arrow-right-24: YouTube](user-guide/youtube.md)

-   :material-server:{ .lg .middle } __Backend Setup__

    ---

    Configure the translation backend server

    [:octicons-arrow-right-24: Backend Overview](backend/overview.md)

-   :material-help-circle:{ .lg .middle } __Troubleshooting__

    ---

    Solutions for common issues

    [:octicons-arrow-right-24: Troubleshooting](troubleshooting.md)

</div>

---

## Operation Modes

This project is fully open-source with no paid tiers. The "Tiers" refer to different technical configurations:

| Feature | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---------|--------|--------|--------|--------|
| YouTube Captions | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| Whisper Transcription | :x: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| API Key Location | Browser | Browser | Server | Server |
| Force AI Generation | :x: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| Progressive Streaming | :x: | :x: | :x: | :white_check_mark: |

- **Tier 1 (Standard)** - Uses existing YouTube captions + your API key
- **Tier 2 (Enhanced)** - Whisper transcription + your API key
- **Tier 3 (Managed)** - Server handles API keys (for shared deployments)
- **Tier 4 (Stream)** - Progressive translation with instant subtitle display

---

## Supported Languages

| Language | Code | Language | Code |
|----------|------|----------|------|
| English | `en` | Japanese | `ja` |
| Spanish | `es` | Korean | `ko` |
| French | `fr` | Chinese (Simplified) | `zh-CN` |
| German | `de` | Chinese (Traditional) | `zh-TW` |
| Portuguese | `pt` | Arabic | `ar` |
| Russian | `ru` | Hindi | `hi` |
| Italian | `it` | | |

---

## License

Subtide is released under the [MIT License](https://github.com/rennerdo30/subtide/blob/main/LICENSE).
