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
`GET /health`
- **Purpose**: Verify server status and view active features.
- **Returns**: JSON with version, hardware info, and enabled tiers.

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

## Caching
All results are cached:
- **Audio**: `backend/cache/*.mp3`
- **Subtitles**: `backend/cache/*.json`
- **Transcripts**: `backend/cache/*.whisper.json`
