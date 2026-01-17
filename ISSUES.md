# Subtide Issues

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
### Broken Release Pipeline in GitHub Actions
- **Issue**: Extension packaging missed files, backend build used wrong platform syntax, and releases were misconfigured.
- **Fix**: Corrected paths for extension (pulling from `extension/` and including `_locales`), implemented platform-agnostic PyInstaller data separators, and optimized dependency caching.
- **Impact**: Cross-platform backend binaries and extension zip are now correctly packaged and automatically attached to GitHub Releases upon tagging.
### Insufficient Logging in Translation Pipeline
- **Issue**: When normal translation got stuck, there was no logging to debug the cause
- **Fix**: Added comprehensive logging to `process_service.py`, `translation_service.py`, `live_whisper_service.py`, and `routes/live.py`
- **Impact**: Worker thread lifecycle, queue timeouts, batch start/end, and rate limiting are now all logged

### Test Mock Issue with MLX-Whisper on Apple Silicon
- **Issue**: `test_live_whisper_service.py` failed because MLX-whisper returns a string placeholder instead of a mockable model
- **Fix**: Updated test to directly replace the model attribute after service initialization
- **Impact**: All 10 tests now pass on Apple Silicon Macs

### Subtitle Font Size Too Small
- **Issue**: Default subtitle font sizes (16px-28px) were too small for many users
- **Fix**: Increased base sizes (now 20px-48px) and added "Huge" (64px) and "Gigantic" (80px) options
- **Impact**: Improved readability and more customization options for users on large screens

### Subtitle Synchronization Going Out of Sync
- **Issue**: Subtitles would go out of sync with video during playback, especially after buffering/seeking
- **Root Causes**:
  - `timeupdate` event only fires ~4 times/second, causing visible delays
  - No detection or handling of video buffering/stalling
  - No handling for playback rate changes
  - Tight subtitle boundaries caused flickering between segments
- **Fix**: Complete rewrite of sync mechanism:
  - Replaced `timeupdate` with `requestAnimationFrame` loop (~60fps updates)
  - Added buffering/stall detection that pauses subtitle updates during stalls
  - Added playback rate change tracking
  - Implemented adaptive tolerance-based subtitle lookup (dynamically adjusts based on subtitle density)
  - Added gap bridging to prevent flickering during small timing gaps
  - Optimized lookups using last-known position for sequential playback
  - Added windowed access for very long videos (1000+ subtitles) with 200-subtitle sliding window
- **Impact**: Smoother, more accurate subtitle synchronization that stays in sync during buffering and playback speed changes

### Translation Accuracy Improvements
- **Issue**: Translations sometimes failed, unchanged text returned as "translated"
- **Fix**: Multiple accuracy improvements:
  - Language detection pre-check (skips translation when source = target)
  - Context window optimization (includes prev/next subtitle for coherence)
  - Sentence boundary detection (merges partial sentences before translation)
  - Translation retry logic with stronger prompt on failure
  - Optional multi-pass refinement for better naturalness
- **Impact**: Significantly improved translation quality and reduced API costs

### Whisper Transcription Accuracy
- **Issue**: Whisper missing segments, producing hallucinations
- **Fix**: Added:
  - Configurable thresholds (no_speech, compression, logprob)
  - Initial prompt injection (video title for proper nouns)
  - Hallucination filtering (removes repeated patterns)
- **Impact**: More complete and accurate transcriptions

### RunPod Docker Import Path Error
- **Issue**: RunPod serverless handler crashed with `ModuleNotFoundError: No module named 'backend'`
- **Root Cause**: Dockerfile copied files to `/app/` but code imported from `backend.*`
- **Fix**: Updated `Dockerfile.runpod` to:
  - Copy to `/app/backend/` instead of `/app/`
  - Add `ENV PYTHONPATH=/app`
  - Add `WORKDIR /app/backend`
- **Impact**: RunPod serverless deployments now work correctly

### RunPod Extension Authorization Header Missing
- **Issue**: API requests to RunPod returned "Permission denied" despite having API key configured
- **Root Cause**: Extension stored Backend API Key but wasn't including it in Authorization header properly
- **Fix**: Added proper Authorization header construction and detective logging in `service-worker.js`
- **Impact**: RunPod endpoints now receive proper authentication

### Popup Buttons Becoming Unresponsive
- **Issue**: Save button and other popup buttons would stop working after first use, requiring 10+ second wait
- **Root Cause**: `sendMessage` to service worker could hang if worker was busy, leaving button disabled
- **Fix**: Added 10-second timeout wrapper to `sendMessage` function in `popup.js`
- **Impact**: Buttons now always reset after timeout, preventing stuck UI state

### Docker Image Too Large (NeMo Dependency)
- **Issue**: RunPod Docker builds failed with "no space left on device" due to NeMo's large dependencies
- **Fix**: Removed NeMo installation, switched to PyAnnote.audio as default diarization backend
- **Impact**: Docker image is now significantly smaller and builds successfully on GitHub Actions

### RunPod Load Balancer 400 Bad Request
- **Issue**: All POST requests to RunPod Load Balancer endpoints returned `400 Bad Request`
- **Root Cause**: The `/ping` health check always returned `204` (initializing) because `set_models_ready(True)` was inside `if __name__ == '__main__':` block in `app.py`, which never runs when gunicorn imports the module
- **Fix**: Added WSGI initialization hook in `app.py` that runs when gunicorn imports the module, calling `set_models_ready(True)` in a background thread after initialization
- **Impact**: `/ping` now returns `200` after ~2 seconds, and RunPod Load Balancer correctly routes traffic

### YouTube Audio Download Stability
- **Issue**: Audio downloads sometimes failed silently with "Audio download failed" error
- **Fix**: 
  - Switched to yt-dlp master branch (bleeding edge) which get YouTube API fix updates faster
  - Added retry logic with exponential backoff (up to 3 attempts)
  - Added yt-dlp internal retry options (`retries`, `fragment_retries`, `extractor_retries`)
  - Improved error diagnostics for auth/geo-restriction/private video issues
  - Added Node.js as fallback JS runtime alongside Deno for nsig decoding
- **Impact**: More reliable audio downloads with better error messages

### RunPod 502 Gateway Timeout
- **Issue**: Long-running requests (Whisper transcription) caused 502 Bad Gateway after ~43 seconds
- **Root Cause**: Non-SSE mode waited synchronously for completion, but RunPod Load Balancer times out without response
- **Fix**: Force SSE mode for RunPod platform in `/api/process` endpoint - SSE streams progress events that keep the connection alive
- **Impact**: Long videos can now be processed without gateway timeout


## Known Limitations ⚠️

### YouTube Rate Limiting
- **Issue**: YouTube sometimes returns 429 (Too Many Requests) for subtitle URLs
- **Mitigation**: Backend retries up to 3 times with exponential backoff
- **Workaround**: Wait a few seconds and try again, or results will be cached

### Whisper Transcription Time
- **Issue**: First-time Whisper transcription can take 2-5 minutes for long videos
- **Mitigation**: 
  - Results are cached after first transcription
  - **Tier 4 Streaming**: Subtitles appear within 10-20 seconds while transcription continues
  - Uses subprocess-based Whisper runner that parses output in real-time

### Tier 3 Requires Server Configuration
- **Issue**: Tier 3 (managed service) requires `SERVER_API_KEY` environment variable
- **Info**: If not set, users on Tier 3 will see an error asking them to use their own key

### Subtitle Style Customization
- **Issue**: Users needed control over subtitle appearance
- **Fix**: Added full customization support for Font Size, Position, Background opacity, and Text Color in the popup UI

## Known Issues 🐛

### yt-dlp Format Not Available
- **Issue**: Some videos fail with "Requested format is not available"
- **Cause**: yt-dlp format selector is too strict for some videos
- **Workaround**: Update yt-dlp (`pip install -U yt-dlp`) or try a different video
- **Status**: Investigating fallback format selection

## Future Enhancements 🔮

### User Authentication
- Implement user accounts for proper tier management
- JWT-based auth between extension and backend

### Streaming Translation
- ✅ Implemented in Tier 4

### Multiple Video Platform Support
- Add support for Twitch, Vimeo, other video platforms
- Abstract video detection and UI injection

---
*Last updated: 2026-01-05*
