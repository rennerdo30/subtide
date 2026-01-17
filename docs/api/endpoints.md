# API Endpoints

Complete API reference for the Subtide backend.

---

## Base URL

```
http://localhost:5001
```

---

## Health Check

Check if the backend is running.

### Request

```http
GET /health
```

### Response

```json
{
  "status": "healthy"
}
```

### Example

```bash
curl http://localhost:5001/health
```

---

## Translate Video

Translate a video's subtitles (batch mode).

### Request

```http
POST /api/translate
Content-Type: application/json
```

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `video_url` | string | Yes | YouTube URL or video identifier |
| `target_language` | string | Yes | Target language code (e.g., `es`, `ja`) |
| `source_language` | string | No | Source language (auto-detect if omitted) |
| `api_key` | string | Tier 1/2 | Your LLM API key |
| `api_url` | string | No | Custom API endpoint |
| `model` | string | No | LLM model name |
| `tier` | number | No | Operation tier (1-4) |
| `force_whisper` | boolean | No | Force Whisper transcription |

### Response

```json
{
  "success": true,
  "job_id": "abc123",
  "subtitles": [
    {
      "start": 0.0,
      "end": 2.5,
      "text": "Translated text here"
    }
  ],
  "source_language": "en",
  "target_language": "es"
}
```

### Example

```bash
curl -X POST http://localhost:5001/api/translate \
  -H "Content-Type: application/json" \
  -d '{
    "video_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "target_language": "es",
    "api_key": "sk-xxx",
    "model": "gpt-4o-mini"
  }'
```

---

## Stream Translation

Translate with real-time streaming (Tier 4).

### Request

```http
POST /api/stream
Content-Type: application/json
```

### Request Body

Same as `/api/translate`.

### Response

Server-Sent Events (SSE) stream:

```
data: {"type": "subtitle", "start": 0.0, "end": 2.5, "text": "First subtitle"}

data: {"type": "subtitle", "start": 2.5, "end": 5.0, "text": "Second subtitle"}

data: {"type": "complete", "total_subtitles": 42}
```

### Event Types

| Type | Description |
|------|-------------|
| `subtitle` | A translated subtitle segment |
| `progress` | Progress update |
| `error` | Error occurred |
| `complete` | Translation finished |

### Example

```bash
curl -X POST http://localhost:5001/api/stream \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "video_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "target_language": "ja"
  }'
```

---

## Check Status

Get the status of a translation job.

### Request

```http
GET /api/status/{job_id}
```

### Response

```json
{
  "job_id": "abc123",
  "status": "completed",
  "progress": 100,
  "subtitles_count": 42,
  "error": null
}
```

### Status Values

| Status | Description |
|--------|-------------|
| `pending` | Job queued |
| `processing` | Currently translating |
| `completed` | Translation finished |
| `failed` | Error occurred |

### Example

```bash
curl http://localhost:5001/api/status/abc123
```

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "success": false,
  "error": "Error message here",
  "code": "ERROR_CODE"
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_URL` | 400 | Invalid video URL |
| `MISSING_API_KEY` | 400 | API key required but not provided |
| `INVALID_LANGUAGE` | 400 | Unsupported language code |
| `VIDEO_NOT_FOUND` | 404 | Video not accessible |
| `TRANSCRIPTION_FAILED` | 500 | Whisper transcription error |
| `TRANSLATION_FAILED` | 500 | LLM translation error |
| `API_ERROR` | 502 | External API error |

---

## Language Codes

Supported target languages:

| Language | Code |
|----------|------|
| English | `en` |
| Spanish | `es` |
| French | `fr` |
| German | `de` |
| Portuguese | `pt` |
| Russian | `ru` |
| Italian | `it` |
| Japanese | `ja` |
| Korean | `ko` |
| Chinese (Simplified) | `zh-CN` |
| Chinese (Traditional) | `zh-TW` |
| Arabic | `ar` |
| Hindi | `hi` |

---

## Rate Limiting

The backend does not implement rate limiting by default. For production deployments, consider adding:

- Reverse proxy with rate limiting (nginx, Traefik)
- Application-level rate limiting
- API key quotas

---

## CORS

By default, CORS is configured to allow all origins (`*`).

Restrict with environment variable:

```bash
CORS_ORIGINS=https://youtube.com,https://www.youtube.com
```

---

## Authentication

### Tier 1/2

API key is passed in the request body. The backend proxies to the LLM provider.

### Tier 3/4

API key is stored on the server. No client-side key required.

### RunPod

When using RunPod serverless, include the RunPod API key in the header:

```http
Authorization: Bearer {RUNPOD_API_KEY}
```

---

## Next Steps

- [Configuration](configuration.md) - Environment variables
- [Backend Overview](../backend/overview.md) - Deployment options
