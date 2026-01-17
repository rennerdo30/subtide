# Configuration

Configure Subtide for your needs.

---

## Extension Configuration

Click the Subtide extension icon to open the configuration popup.

### Basic Settings

| Setting | Description |
|---------|-------------|
| **Operation Mode** | Select Tier 1-4 based on your needs |
| **Backend URL** | URL of your backend server (default: `http://localhost:5001`) |
| **Target Language** | Language to translate subtitles into |

### API Settings (Tier 1 & 2)

| Setting | Description |
|---------|-------------|
| **API Provider** | OpenAI, OpenRouter, or Custom Endpoint |
| **API Key** | Your API key for the selected provider |
| **Model** | LLM model to use for translation |
| **API URL** | Custom API endpoint (for custom providers) |

### Display Settings

| Setting | Description |
|---------|-------------|
| **Subtitle Size** | Small, Medium, Large, or XL |
| **Dual Mode** | Show both original and translated text |

---

## Backend Environment Variables

Configure the backend using environment variables or a `.env` file.

### Core Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `5001` |
| `GUNICORN_WORKERS` | Number of worker processes | `2` |
| `GUNICORN_TIMEOUT` | Request timeout in seconds | `300` |
| `CORS_ORIGINS` | Allowed CORS origins | `*` |

### API Configuration (Tier 3/4)

| Variable | Description | Default |
|----------|-------------|---------|
| `SERVER_API_KEY` | API key for LLM provider | — |
| `SERVER_API_URL` | LLM API endpoint | — |
| `SERVER_MODEL` | LLM model name | — |

### Whisper Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `WHISPER_MODEL` | Model size: `tiny`, `base`, `small`, `medium`, `large-v3`, `large-v3-turbo` | `base` |
| `WHISPER_BACKEND` | Backend: `mlx`, `faster`, `openai` | Auto-detected |

---

## Example Configurations

### Tier 1: Basic YouTube Translation

**Extension:**
```
Operation Mode: Tier 1 (Standard)
Backend URL: http://localhost:5001
API Provider: OpenAI
API Key: sk-...
Model: gpt-4o-mini
Target Language: Spanish
```

**Backend:**
```bash
./subtide-backend-macos
```

---

### Tier 2: Whisper Transcription

**Extension:**
```
Operation Mode: Tier 2 (Enhanced)
Backend URL: http://localhost:5001
API Provider: OpenAI
API Key: sk-...
Model: gpt-4o
Target Language: Japanese
```

**Backend:**
```bash
WHISPER_MODEL=large-v3-turbo WHISPER_BACKEND=mlx ./subtide-backend-macos
```

---

### Tier 3: Shared Server

**Extension:**
```
Operation Mode: Tier 3 (Managed)
Backend URL: https://your-server.com
Target Language: German
```

**Backend:**
```bash
SERVER_API_KEY=sk-xxx \
SERVER_API_URL=https://api.openai.com/v1 \
SERVER_MODEL=gpt-4o \
docker-compose up subtide-tier3
```

---

### Tier 4: Streaming Mode

**Extension:**
```
Operation Mode: Tier 4 (Stream)
Backend URL: https://your-server.com
Target Language: French
```

**Backend:**
```bash
SERVER_API_KEY=sk-xxx \
SERVER_API_URL=https://api.openai.com/v1 \
SERVER_MODEL=gpt-4o \
WHISPER_MODEL=large-v3-turbo \
docker-compose up subtide-tier4
```

---

### Local LLM with LM Studio

**Extension:**
```
Operation Mode: Tier 2 (Enhanced)
Backend URL: http://localhost:5001
API Provider: Custom Endpoint
API URL: http://localhost:1234/v1
API Key: lm-studio
Model: local-model
Target Language: Korean
```

---

## Whisper Model Selection

Choose a model based on your hardware and quality needs:

| Model | VRAM/RAM | Speed | Quality | Best For |
|-------|----------|-------|---------|----------|
| `tiny` | ~1 GB | Fastest | Basic | Testing |
| `base` | ~1 GB | Fast | Good | General use |
| `small` | ~2 GB | Medium | Better | Better accuracy |
| `medium` | ~5 GB | Slow | Great | High quality |
| `large-v3` | ~10 GB | Slowest | Best | Maximum quality |
| `large-v3-turbo` | ~6 GB | Fast | Excellent | **Recommended** |

!!! tip "Recommendation"
    Use `large-v3-turbo` for the best balance of speed and quality.

---

## Next Steps

- [YouTube Guide](../user-guide/youtube.md) - Using Subtide with YouTube
- [Backend Overview](../backend/overview.md) - Backend deployment options
