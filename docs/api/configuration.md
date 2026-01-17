# API Configuration

Environment variables and configuration options for the Subtide backend.

---

## Environment Variables

Configure the backend using environment variables or a `.env` file in the backend directory.

---

## Server Configuration

### PORT

Server listening port.

| | |
|---|---|
| **Default** | `5001` |
| **Example** | `PORT=8080` |

### GUNICORN_WORKERS

Number of Gunicorn worker processes.

| | |
|---|---|
| **Default** | `2` |
| **Recommendation** | `(CPU cores × 2) + 1` |
| **Example** | `GUNICORN_WORKERS=4` |

### GUNICORN_TIMEOUT

Request timeout in seconds.

| | |
|---|---|
| **Default** | `300` |
| **Note** | Increase for large videos |
| **Example** | `GUNICORN_TIMEOUT=600` |

### CORS_ORIGINS

Allowed CORS origins.

| | |
|---|---|
| **Default** | `*` (all origins) |
| **Example** | `CORS_ORIGINS=https://youtube.com,https://www.youtube.com` |

---

## Whisper Configuration

### WHISPER_MODEL

Whisper model size for transcription.

| | |
|---|---|
| **Default** | `base` |
| **Options** | `tiny`, `base`, `small`, `medium`, `large-v3`, `large-v3-turbo` |
| **Example** | `WHISPER_MODEL=large-v3-turbo` |

**Model Comparison:**

| Model | VRAM | Speed | Quality |
|-------|------|-------|---------|
| `tiny` | ~1 GB | Fastest | Basic |
| `base` | ~1 GB | Fast | Good |
| `small` | ~2 GB | Medium | Better |
| `medium` | ~5 GB | Slow | Great |
| `large-v3` | ~10 GB | Slowest | Best |
| `large-v3-turbo` | ~6 GB | Fast | Excellent |

### WHISPER_BACKEND

Whisper implementation to use.

| | |
|---|---|
| **Default** | Auto-detected |
| **Options** | `mlx`, `faster`, `openai` |
| **Example** | `WHISPER_BACKEND=mlx` |

**Backend Selection:**

| Backend | Hardware | Performance |
|---------|----------|-------------|
| `mlx` | Apple Silicon | Best for M1/M2/M3/M4 |
| `faster` | NVIDIA GPU | Best for CUDA |
| `openai` | CPU | Fallback option |

---

## API Configuration (Tier 3/4)

### SERVER_API_KEY

LLM API key stored on the server.

| | |
|---|---|
| **Default** | None |
| **Required** | Tier 3 and Tier 4 |
| **Example** | `SERVER_API_KEY=sk-xxx` |

### SERVER_API_URL

LLM API endpoint.

| | |
|---|---|
| **Default** | None |
| **Example** | `SERVER_API_URL=https://api.openai.com/v1` |

**Common Endpoints:**

| Provider | URL |
|----------|-----|
| OpenAI | `https://api.openai.com/v1` |
| OpenRouter | `https://openrouter.ai/api/v1` |
| LM Studio | `http://localhost:1234/v1` |
| Ollama | `http://localhost:11434/v1` |

### SERVER_MODEL

Default LLM model name.

| | |
|---|---|
| **Default** | None |
| **Example** | `SERVER_MODEL=gpt-4o` |

---

## Example Configurations

### Development

```bash
PORT=5001
WHISPER_MODEL=base
CORS_ORIGINS=*
```

### Production (Tier 2)

```bash
PORT=5001
GUNICORN_WORKERS=4
GUNICORN_TIMEOUT=600
WHISPER_MODEL=large-v3-turbo
WHISPER_BACKEND=faster
CORS_ORIGINS=https://youtube.com,https://www.youtube.com
```

### Production (Tier 3/4)

```bash
PORT=5001
GUNICORN_WORKERS=4
GUNICORN_TIMEOUT=600
WHISPER_MODEL=large-v3-turbo
WHISPER_BACKEND=faster
SERVER_API_KEY=sk-xxx
SERVER_API_URL=https://api.openai.com/v1
SERVER_MODEL=gpt-4o
CORS_ORIGINS=https://youtube.com,https://www.youtube.com
```

### Apple Silicon Optimized

```bash
WHISPER_MODEL=large-v3-turbo
WHISPER_BACKEND=mlx
```

### NVIDIA GPU Optimized

```bash
WHISPER_MODEL=large-v3
WHISPER_BACKEND=faster
```

---

## .env File

Create a `.env` file in the backend directory:

```bash
# backend/.env
PORT=5001
WHISPER_MODEL=large-v3-turbo
WHISPER_BACKEND=mlx
CORS_ORIGINS=*
```

The backend automatically loads this file on startup.

---

## Docker Environment

Pass environment variables to Docker:

```bash
docker run -d \
  -p 5001:5001 \
  -e WHISPER_MODEL=large-v3-turbo \
  -e WHISPER_BACKEND=faster \
  ghcr.io/rennerdo30/subtide-backend:latest
```

Or use an env file:

```bash
docker run -d \
  -p 5001:5001 \
  --env-file .env \
  ghcr.io/rennerdo30/subtide-backend:latest
```

---

## Validation

The backend validates configuration on startup. Check logs for warnings:

```bash
./subtide-backend 2>&1 | grep -i warning
```

---

## Next Steps

- [API Endpoints](endpoints.md) - API reference
- [Backend Overview](../backend/overview.md) - Deployment options
