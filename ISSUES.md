# Video Translate Issues

## Resolved ✅

### Storage Keys Not Loading (Critical)
- **Issue**: `getConfig()` in service-worker.js wasn't including all storage keys in the `get()` call
- **Fix**: Changed to use `Object.values(STORAGE_KEYS)` to always get all keys
- **Impact**: Tier and Provider settings are now properly saved and restored

### Tier Not Being Passed to Backend
- **Issue**: `fetchSubtitlesFromBackend()` was called without tier option in fallback paths
- **Fix**: Updated all call sites to pass `{ tier: userTier }` option

### Dead Code in Service Worker
- **Issue**: `callLLMAPI()` function threw an error saying it was deprecated
- **Fix**: Removed all dead code and simplified to use `translateBatch()` directly

### CSS Dark Theme Conflict
- **Issue**: `.section` had `background: #fff` which conflicted with dark theme
- **Fix**: Complete CSS rewrite with cohesive dark purple/indigo theme

### Duplicate Imports in Backend
- **Issue**: `logging` module imported multiple times, `time` not imported at top
- **Fix**: Cleaned up imports, added `time` import at module level

### Tier 3 Configuration Error Handling
- **Issue**: Tier 3 silently failed if `SERVER_API_KEY` not set
- **Fix**: Backend now returns clear error message when Tier 3 is not configured

### Complex Network Interception
- **Issue**: CSP blocked inline script injection for network interception
- **Fix**: Removed complex interception, rely entirely on backend (yt-dlp) which is more reliable

### ModuleNotFoundError in Backend (Regression)
- **Issue**: Modularization split `config.py` but `run.sh` didn't include the project root in `PYTHONPATH`.
- **Fix**: Updated `run.sh` to export `PYTHONPATH` correctly.

### GitHub Actions: No space left on device
- **Issue**: Ubuntu runners ran out of space during PyInstaller assembly (Torch/Whisper are huge).
- **Fix**: Added `maximize-build-space` action to free up ~25GB before build.

### Incomplete Test Coverage
- **Issue**: Core logic for retries and error handling was untested.
- **Fix**: Implemented exhaustive test suites for services, routes, and utils reaching ~80-100% coverage.
### Insufficient Logging in Translation Pipeline
- **Issue**: When normal translation got stuck, there was no logging to debug the cause
- **Fix**: Added comprehensive logging to `process_service.py`, `translation_service.py`, `live_whisper_service.py`, and `routes/live.py`
- **Impact**: Worker thread lifecycle, queue timeouts, batch start/end, and rate limiting are now all logged

### Test Mock Issue with MLX-Whisper on Apple Silicon
- **Issue**: `test_live_whisper_service.py` failed because MLX-whisper returns a string placeholder instead of a mockable model
- **Fix**: Updated test to directly replace the model attribute after service initialization
- **Impact**: All 10 tests now pass on Apple Silicon Macs

## Known Limitations ⚠️

### YouTube Rate Limiting
- **Issue**: YouTube sometimes returns 429 (Too Many Requests) for subtitle URLs
- **Mitigation**: Backend retries up to 3 times with exponential backoff
- **Workaround**: Wait a few seconds and try again, or results will be cached

### Whisper Transcription Time
- **Issue**: First-time Whisper transcription can take 2-5 minutes for long videos
- **Mitigation**: Results are cached after first transcription

### Tier 3 Requires Server Configuration
- **Issue**: Tier 3 (managed service) requires `SERVER_API_KEY` environment variable
- **Info**: If not set, users on Tier 3 will see an error asking them to use their own key

### Subtitle Style Customization
- **Issue**: Users needed control over subtitle appearance
- **Fix**: Added full customization support for Font Size, Position, Background opacity, and Text Color in the popup UI

## Future Enhancements 🔮

### User Authentication
- Implement user accounts for proper tier management
- JWT-based auth between extension and backend

### Streaming Translation
- Stream translations as they're generated
- Show incremental progress in UI

### Multiple Video Platform Support
- Add support for Twitch, Vimeo, other video platforms
- Abstract video detection and UI injection

---
*Last updated: 2026-01-01*
