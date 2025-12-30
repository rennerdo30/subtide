# Video Translate

A Chrome extension that translates video subtitles using AI. Works with any OpenAI-compatible API.

![Video Translate](icons/icon128.png)

## Features

- 🎬 **YouTube Support** - Extract and translate YouTube captions
- 🌐 **Any Language** - Translate to 12+ languages
- 🤖 **AI-Powered** - Uses LLMs for natural, context-aware translations
- ⚡ **Fast Caching** - Translations are cached locally for instant replay
- 🎨 **Native Style** - Subtitles look just like YouTube's built-in captions
- 🔧 **Flexible** - Works with OpenAI, Ollama, or any compatible API

## Installation

### From Source (Developer Mode)

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top-right)
4. Click "Load unpacked"
5. Select the `video-translate` folder
6. The extension icon should appear in your toolbar

## Troubleshooting

### Subtitles not loading?
If you see an error about falling to load subtitles or they simply don't appear:
1. **Disable Adblockers for YouTube**: Extensions like uBlock Origin may block the subtitle API.
2. **Add an Exception**: If you want to keep your adblocker, add this rule to your filter list:
   ```
   @@||youtube.com/api/timedtext$xhr,domain=youtube.com
   ```
3. **Check API Key**: Ensure your LLM API details are correct in the popup.
   - **API URL**: Your OpenAI-compatible endpoint
     - OpenAI: `https://api.openai.com/v1`
     - Ollama: `http://localhost:11434/v1`
     - Other providers: Check their documentation
   - **API Key**: Your API key (or any value for local models)
   - **Model**: The model to use (e.g., `gpt-4o-mini`, `llama3.2`)

## Configuration

1. Click the Video Translate icon in your Chrome toolbar
2. Enter your API configuration:
   - **API URL**: Your OpenAI-compatible endpoint
     - OpenAI: `https://api.openai.com/v1`
     - Ollama: `http://localhost:11434/v1`
     - Other providers: Check their documentation
   - **API Key**: Your API key (or any value for local models)
   - **Model**: The model to use (e.g., `gpt-4o-mini`, `llama3.2`)
3. Select your default target language
4. Click "Save Configuration"

## Usage

1. Navigate to any YouTube video
2. Look for the translate button (🌐) in the player controls
3. Click it to open the language selector
4. Select your desired language
5. Wait for translation (first time only, then cached)
6. Watch with translated subtitles!

## Supported Languages

| Language | Code |
|----------|------|
| English | en |
| Japanese | ja |
| Korean | ko |
| Chinese (Simplified) | zh-CN |
| Chinese (Traditional) | zh-TW |
| Spanish | es |
| French | fr |
| German | de |
| Portuguese | pt |
| Russian | ru |
| Arabic | ar |
| Hindi | hi |

## API Providers

### OpenAI
```
API URL: https://api.openai.com/v1
Model: gpt-4o-mini (recommended) or gpt-4o
```

### Ollama (Local)
```
API URL: http://localhost:11434/v1
Model: llama3.2, mistral, etc.
API Key: ollama (any value works)
```

### Other Providers
Any OpenAI-compatible API should work. Check your provider's documentation for the correct URL and model names.

## How It Works

1. **Subtitle Extraction**: When you open a YouTube video, the extension extracts available captions
2. **Translation**: Subtitles are sent to your configured LLM API in batches
3. **Caching**: Translations are stored locally (up to 100 videos)
4. **Display**: Translated subtitles are shown in YouTube's native caption style

## Privacy

- ✅ API keys are stored locally in Chrome
- ✅ Translations are cached on your device only
- ✅ No analytics or external tracking
- ✅ Only your chosen LLM API receives subtitle text

## Development

### Project Structure
```
video-translate/
├── manifest.json           # Extension manifest
├── src/
│   ├── background/         # Service worker
│   ├── content/            # YouTube content scripts
│   ├── popup/              # Extension popup UI
│   └── lib/                # Shared utilities
├── icons/                  # Extension icons
└── SPECIFICATION.md        # Detailed specification
```

### Building
No build step required! The extension runs directly from source.

### Testing
1. Load the extension in developer mode
2. Open a YouTube video with captions
3. Try translating to different languages

## Known Limitations

- Only works on YouTube (for now)
- Requires videos to have captions (auto-generated or uploaded)
- Translation quality depends on the LLM model used
- Large videos may take longer to translate initially

## Roadmap

- [ ] Support for more video platforms
- [ ] Dual subtitle mode (original + translated)
- [ ] Subtitle style customization
- [ ] Export translations to SRT/VTT
- [ ] Offline translation with local models

## License

MIT License - feel free to use, modify, and distribute.

## Contributing

Contributions are welcome! Please read the [SPECIFICATION.md](SPECIFICATION.md) for technical details.
