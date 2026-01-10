# Contributing to Video Translate

Thank you for your interest in contributing to Video Translate!

## Table of Contents
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Testing](#testing)
- [Code Style](#code-style)
- [Pull Requests](#pull-requests)
- [Debug Logging](#debug-logging)

---

## Development Setup

### Backend

1. **Navigate to backend directory:**
   ```bash
   cd backend
   ```

2. **Create virtual environment:**
   ```bash
   python -m venv venv
   source venv/bin/activate  # Windows: venv\Scripts\activate
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure environment (optional):**
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

5. **Run the server:**
   ```bash
   # Development mode with hot reload
   export FLASK_ENV=development
   python app.py

   # OR use the run script
   ./run.sh
   ```

### Extension

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `extension` folder
5. The extension will appear in your toolbar

**Hot Reload:**
- Make changes to JS/HTML/CSS files
- Click the refresh icon on the extension card in `chrome://extensions`
- Or use a tool like [Extension Reloader](https://chrome.google.com/webstore/detail/extensions-reloader/fimgfedafeadlieiabdeeaodndnlbhid)

---

## Project Structure

```
video-translate/
├── backend/                        # Python Flask server
│   ├── app.py                      # Flask entry point
│   ├── config.py                   # Configuration management
│   ├── routes/
│   │   └── translation.py          # API endpoint handlers
│   ├── services/
│   │   ├── whisper_service.py      # Speech-to-text (MLX/faster-whisper)
│   │   ├── translation_service.py  # LLM translation logic
│   │   ├── youtube_service.py      # YouTube data extraction
│   │   └── process_service.py      # Pipeline orchestration
│   ├── utils/
│   │   ├── model_utils.py          # Model loading/management
│   │   ├── partial_cache.py        # Translation caching
│   │   └── language_detection.py   # Language utilities
│   ├── tests/                      # Unit tests
│   ├── requirements.txt            # Python dependencies
│   ├── Dockerfile                  # Container configuration
│   └── docker-compose.yml          # Multi-tier deployment
│
├── extension/                      # Chrome Extension (Manifest V3)
│   ├── manifest.json               # Extension manifest
│   ├── _locales/                   # Internationalization
│   │   └── en/messages.json        # English strings
│   ├── icons/                      # Extension icons (16, 48, 128px)
│   └── src/
│       ├── background/
│       │   └── service-worker.js   # Background service worker
│       ├── content/
│       │   ├── youtube.js          # Main YouTube content script
│       │   ├── youtube-shorts.js   # Shorts pre-translation
│       │   ├── youtube-subtitles.js # Subtitle sync/rendering
│       │   ├── youtube-ui.js       # Player UI controls
│       │   ├── youtube-styles.js   # CSS injection
│       │   ├── youtube-constants.js # Shared constants
│       │   ├── youtube-status.js   # Status management
│       │   ├── youtube-export.js   # Subtitle export (SRT/VTT)
│       │   ├── twitch.js           # Twitch integration
│       │   ├── generic.js          # Generic video support
│       │   └── shorts-interceptor.js # Page-context interceptor
│       ├── lib/
│       │   └── debug.js            # Debug logging utility
│       ├── offscreen/              # Offscreen document for audio
│       └── popup/
│           ├── popup.html          # Extension popup UI
│           └── popup.js            # Popup logic
│
├── scripts/                        # Build/utility scripts
├── docs/                           # Additional documentation
├── SPECIFICATION.md                # Technical specification
├── ISSUES.md                       # Known issues
├── CLAUDE.md                       # AI assistant guidelines
└── LICENSE                         # MIT License
```

---

## Testing

We use `pytest` for backend testing.

### Run All Tests
```bash
cd backend
export PYTHONPATH=$PYTHONPATH:$(pwd)
python -m pytest tests/
```

### Run with Coverage
```bash
python -m pytest tests/ --cov=. --cov-report=term-missing
```

### Run Specific Tests
```bash
python -m pytest tests/test_translation_service.py -v
python -m pytest tests/ -k "test_cache"
```

### CI Integration
Every push to GitHub triggers the `test-backend` job. PRs will fail if tests don't pass.

---

## Code Style

### Python (Backend)
- Follow **PEP 8** style guide
- Use **type hints** where possible
- Maximum line length: 100 characters
- Use docstrings for public functions

```python
def translate_text(text: str, target_lang: str) -> str:
    """
    Translate text to the target language.

    Args:
        text: The source text to translate
        target_lang: ISO 639-1 language code

    Returns:
        Translated text string
    """
    ...
```

### JavaScript (Extension)
- Use modern **ES6+** syntax
- Use `const` by default, `let` when needed
- Avoid `var`
- Use template literals for string interpolation
- Clean, readable code with meaningful variable names

```javascript
// Good
const translateVideo = async (videoId, targetLang) => {
    const response = await chrome.runtime.sendMessage({
        action: 'translate',
        videoId,
        targetLang
    });
    return response.subtitles;
};

// Avoid
var translateVideo = function(id, lang) {
    return new Promise(function(resolve) {
        chrome.runtime.sendMessage({action: 'translate', videoId: id, targetLang: lang}, function(r) {
            resolve(r.subtitles);
        });
    });
};
```

### Commits
- Use clear, descriptive commit messages
- Start with a verb: "Add", "Fix", "Update", "Remove"
- Reference issues when applicable: "Fix #123"

```
Good: "Add YouTube Shorts pre-translation support"
Good: "Fix memory leak in subtitle observer"
Bad:  "stuff"
Bad:  "WIP"
```

---

## Pull Requests

1. **Fork** the repository
2. **Create a feature branch:**
   ```bash
   git checkout -b feature/amazing-feature
   ```
3. **Make your changes** with clear commits
4. **Run tests** to ensure nothing is broken
5. **Push** to your fork:
   ```bash
   git push origin feature/amazing-feature
   ```
6. **Open a Pull Request** with:
   - Clear title describing the change
   - Description of what/why/how
   - Screenshots for UI changes
   - Link to related issues

### PR Checklist
- [ ] Tests pass locally
- [ ] Code follows style guidelines
- [ ] No console.log statements (use vtLog for debugging)
- [ ] No hardcoded secrets or API keys
- [ ] Documentation updated if needed

---

## Debug Logging

The extension includes a debug logging utility (`src/lib/debug.js`).

### Usage in Content Scripts
```javascript
// Available globally as vtLog
vtLog.debug('Detailed debug info', { data });
vtLog.info('General info');
vtLog.warn('Warning message');
vtLog.error('Error occurred', error);
```

### Log Levels
- **debug** — Verbose debugging (disabled in production)
- **info** — General information
- **warn** — Warnings
- **error** — Errors

### Viewing Logs
1. Open Chrome DevTools (F12)
2. Go to Console tab
3. Filter by `[VideoTranslate]` prefix

---

## Issues

Please check [ISSUES.md](ISSUES.md) for known bugs and limitations before opening a new issue.

When reporting bugs, include:
- Browser version
- Extension version
- Steps to reproduce
- Expected vs actual behavior
- Console logs if applicable
