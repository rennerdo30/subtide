# Docker Deployment

Deploy Subtide backend using Docker.

---

## Quick Start

```bash
cd backend
docker-compose up video-translate-tier2
```

The backend will be available at `http://localhost:5001`.

---

## Docker Compose Services

### Tier 1: Standard

YouTube captions only, no transcription:

```bash
docker-compose up video-translate-tier1
```

Use when:

- Videos have existing captions
- You want minimal resource usage
- Browser provides the API key

### Tier 2: Enhanced

Full Whisper transcription support:

```bash
docker-compose up video-translate-tier2
```

Use when:

- You need transcription for any video
- Browser provides the API key
- Most common choice

### Tier 3: Managed

Server-side API key:

```bash
SERVER_API_KEY=sk-xxx \
SERVER_API_URL=https://api.openai.com/v1 \
SERVER_MODEL=gpt-4o \
docker-compose up video-translate-tier3
```

Use when:

- Deploying for a team
- Centralizing API key management
- Hiding API key from clients

### Tier 4: Streaming

Real-time progressive translation:

```bash
SERVER_API_KEY=sk-xxx \
SERVER_API_URL=https://api.openai.com/v1 \
SERVER_MODEL=gpt-4o \
docker-compose up video-translate-tier4
```

Use when:

- You want subtitles as they're generated
- Lowest perceived latency
- Server handles everything

---

## Building Images

### Build Locally

```bash
cd backend
docker build -t subtide-backend .
```

### Using Pre-built Images

```bash
# Standard backend
docker pull ghcr.io/rennerdo30/video-translate-backend:latest

# RunPod variant
docker pull ghcr.io/rennerdo30/video-translate-runpod:latest
```

---

## Environment Variables

Pass environment variables to configure the container:

```bash
docker run -d \
  -p 5001:5001 \
  -e WHISPER_MODEL=large-v3-turbo \
  -e WHISPER_BACKEND=faster \
  -e CORS_ORIGINS="*" \
  ghcr.io/rennerdo30/video-translate-backend:latest
```

### Available Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Internal port | `5001` |
| `GUNICORN_WORKERS` | Worker processes | `2` |
| `GUNICORN_TIMEOUT` | Request timeout (s) | `300` |
| `CORS_ORIGINS` | CORS allowed origins | `*` |
| `WHISPER_MODEL` | Whisper model size | `base` |
| `WHISPER_BACKEND` | `mlx`, `faster`, `openai` | Auto |
| `SERVER_API_KEY` | API key (Tier 3/4) | — |
| `SERVER_API_URL` | LLM endpoint (Tier 3/4) | — |
| `SERVER_MODEL` | LLM model (Tier 3/4) | — |

---

## Volume Mounts

### Model Cache

Persist downloaded Whisper models:

```bash
docker run -d \
  -p 5001:5001 \
  -v ~/.cache/whisper:/root/.cache/whisper \
  ghcr.io/rennerdo30/video-translate-backend:latest
```

### Custom Configuration

Mount a custom `.env` file:

```bash
docker run -d \
  -p 5001:5001 \
  -v /path/to/.env:/app/.env \
  ghcr.io/rennerdo30/video-translate-backend:latest
```

---

## GPU Support

### NVIDIA GPU

Use the NVIDIA Container Toolkit:

```bash
docker run -d \
  --gpus all \
  -p 5001:5001 \
  -e WHISPER_BACKEND=faster \
  ghcr.io/rennerdo30/video-translate-backend:latest
```

Requires:

- NVIDIA GPU with CUDA support
- [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html) installed

---

## Docker Compose Reference

### Full `docker-compose.yml` Example

```yaml
version: '3.8'

services:
  subtide:
    image: ghcr.io/rennerdo30/video-translate-backend:latest
    ports:
      - "5001:5001"
    environment:
      - WHISPER_MODEL=large-v3-turbo
      - WHISPER_BACKEND=faster
      - CORS_ORIGINS=*
      - GUNICORN_WORKERS=4
      - GUNICORN_TIMEOUT=600
    volumes:
      - whisper-cache:/root/.cache/whisper
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]

volumes:
  whisper-cache:
```

---

## Health Checks

Docker health check is built-in:

```bash
docker ps
# Check HEALTH column

docker inspect --format='{{.State.Health.Status}}' <container>
```

Manual check:

```bash
curl http://localhost:5001/health
```

---

## Troubleshooting

### Container exits immediately

Check logs:

```bash
docker logs <container_id>
```

Common causes:

- Port already in use
- Missing environment variables
- Insufficient memory

### Out of memory

Increase Docker memory limit or use a smaller model:

```bash
-e WHISPER_MODEL=base
```

### Permission denied

On Linux, add your user to the docker group:

```bash
sudo usermod -aG docker $USER
```

---

## Production Considerations

1. **Use specific tags** instead of `latest`
2. **Set resource limits** for memory and CPU
3. **Configure logging** with log drivers
4. **Use secrets** for API keys instead of environment variables
5. **Set up health checks** for orchestration

---

## Next Steps

- [RunPod Deployment](runpod.md) - Cloud GPU deployment
- [API Reference](../api/endpoints.md) - API documentation
