# Backend API Documentation

The Subtide backend provides a robust API for subtitle fetching, AI transcription, and LLM-powered translation.

## Getting Started

The preferred way to run locally is using the `run.sh` script, which handles environment isolation and PYTHONPATH setup.

```bash
cd backend
./run.sh
```

## Endpoints

### 1. Health & Config

#### `GET /health`
- **Purpose**: Verify server status and view active features.
- **Returns**: JSON with status, service name, features, and model config.
- **Example Response**:
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

#### `GET /ping`
- **Purpose**: Load balancer health check (RunPod compatible).
- **Returns**: `200 OK` if ready, `204 No Content` if still initializing.

#### `GET /api/version`
- **Purpose**: Get version and build information.
- **Returns**: JSON with version, build date, platform, and features.
- **Example Response**:
```json
{
  "version": "1.1.2",
  "build_date": "2026-01-24",
  "platform": "macos",
  "whisper_backend": "mlx-whisper",
  "features": {
    "whisper": true,
    "tier3": true
  }
}
```

### 2. Subtitle Fetching
`GET /api/subtitles`
- **Purpose**: Get existing YouTube subtitles.
- **Tiers**: All (1, 2, 3).
- **Params**: `video_id` (required), `lang` (optional).
- **Returns**: Subtitles in JSON3 format.

### 3. Whisper Transcription
`GET /api/transcribe`
- **Purpose**: Generate subtitles from audio using Whisper + Pyannote diarization.
- **Tiers**: Tier 2, Tier 3.
- **Params**: `video_id` (required).
- **Returns**: Array of segments with start, end, text, and speaker info.

### 4. Managed Translation (SSE)
`POST /api/process`
- **Purpose**: Combined workflow (fetch/transcribe → translate).
- **Tiers**: Tier 3 only.
- **Body**: `{ "video_id": "...", "target_lang": "...", "force_whisper": false }`
- **Returns**: Server-Sent Events (SSE) stream for real-time progress, followed by final result.

### 5. Progressive Streaming Translation (SSE)
`POST /api/stream`
- **Purpose**: Combined workflow with progressive subtitle delivery.
- **Tiers**: Tier 4 only.
- **Body**: `{ "video_id": "...", "target_lang": "...", "force_whisper": false }`
- **Returns**: SSE stream with subtitle batches delivered as they complete.

**Key Difference from `/api/process`**: Instead of waiting for all translations to complete, each batch of subtitles (~25) is streamed immediately when ready. This provides:
- First subtitles visible in 3-5 seconds
- Continuous updates as more batches complete
- Same final result, much faster perceived performance

**SSE Event Types**:
```
stage: "checking"    → Checking available subtitles
stage: "downloading" → Fetching subtitles/transcribing
stage: "translating" → Translation in progress (no subtitles yet)
stage: "subtitles"   → Batch ready! Includes subtitle data
stage: "complete"    → All done
```

**Subtitle Event Example**:
```json
{
  "stage": "subtitles",
  "message": "Batch 3/10 ready",
  "percent": 67,
  "step": 3,
  "totalSteps": 4,
  "batchInfo": {"current": 3, "total": 10},
  "subtitles": [
    {"start": 50000, "end": 52500, "text": "Hello", "translatedText": "こんにちは"},
    {"start": 52500, "end": 55000, "text": "World", "translatedText": "世界"}
  ]
}
```

### 6. Manual Translation
`POST /api/translate`
- **Purpose**: Translate provided subtitles using a custom API key.
- **Tiers**: Tier 1, 2.
- **Body**: `{ "subtitles": [...], "api_key": "...", "model": "...", "target_lang": "..." }`

### 7. Model Info
`GET /api/model-info`
- **Purpose**: Get context window limits for the server's configured model.
- **Tiers**: Tier 3.

## Request Tracking

All API requests include automatic request ID tracking for log correlation:

- **Request Header**: Send `X-Request-ID` to use your own ID, or one will be generated
- **Response Header**: `X-Request-ID` is always returned with the request ID
- **Logs**: All log entries include the request ID for easy debugging

Example:
```bash
curl -H "X-Request-ID: my-custom-id-123" http://localhost:5001/health
# Response includes: X-Request-ID: my-custom-id-123
```

## Caching

All results are cached:
- **Audio**: `backend/cache/audio/*.m4a`
- **Subtitles**: `backend/cache/*_subs_*.json`
- **Transcripts**: `backend/cache/*_whisper.json`
- **Partial Progress**: `backend/cache/partial/*.json` (for resume on failure)

## Security

- **API Key Protection**: Server-side API keys are never exposed to clients
- **SSRF Prevention**: Only whitelisted video domains (YouTube, Twitch, Vimeo, etc.) are allowed
- **Rate Limiting**: Default 60 req/min, stricter limits on expensive endpoints
- **Request Size Limit**: Maximum 10MB for POST requests
