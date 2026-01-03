# RunPod Deployment Guide

Deploy Video Translate backend on RunPod.io for fast GPU-accelerated transcription and translation.

## Performance Comparison

| Component | macOS (MLX) | RunPod (NVIDIA) | Speedup |
|-----------|-------------|-----------------|---------|
| Whisper (1hr audio) | ~6 min | ~1.5 min | **4x** |
| Diarization (1hr audio) | ~24 min | ~1 min | **24x** |
| **Total Processing** | **~30 min** | **~2.5 min** | **12x** |

## Cost Estimates (Serverless RTX 4090)

| Video Length | Processing Time | Cost |
|-------------|-----------------|------|
| 10 min video | ~30 sec | ~$0.013 |
| 30 min video | ~1.5 min | ~$0.04 |
| 1 hour video | ~3 min | ~$0.08 |

---

## Deployment Options

### Option 1: Serverless (Recommended)

Pay only when processing requests. Auto-scales to zero.

#### 1. Get the Docker Image

**Option A: Use Pre-built Image (Recommended)**

Pre-built images are available from GitHub Container Registry:

```bash
# Serverless image
docker pull ghcr.io/rennerdo30/video-translate-runpod:latest

# Or specific version
docker pull ghcr.io/rennerdo30/video-translate-runpod:v1.0.0
```

**Option B: Build Locally**

```bash
cd backend

# Build for serverless
docker build -f Dockerfile.runpod --target serverless -t video-translate-runpod .

# Push to your registry
docker tag video-translate-runpod your-username/video-translate-runpod
docker push your-username/video-translate-runpod
```

#### 2. Create RunPod Serverless Endpoint

1. Go to [RunPod Serverless](https://www.runpod.io/console/serverless)
2. Click "New Endpoint"
3. Configure:
   - **Container Image**: `your-username/video-translate-runpod`
   - **GPU Type**: RTX 4090 (recommended) or A40
   - **Min Workers**: 0 (scale to zero)
   - **Max Workers**: 5 (adjust based on needs)
   - **Idle Timeout**: 60 seconds
   - **GPU Memory**: 24GB

4. Add Environment Variables:
   ```
   SERVER_API_KEY=sk-your-openai-key
   SERVER_MODEL=gpt-4o-mini
   HF_TOKEN=hf_your-token  (for diarization)
   WHISPER_MODEL=base
   ```

#### 3. Send Requests

```bash
curl -X POST https://api.runpod.ai/v2/YOUR_ENDPOINT_ID/run \
  -H "Authorization: Bearer YOUR_RUNPOD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "video_id": "dQw4w9WgXcQ",
      "target_lang": "ja",
      "enable_diarization": true
    }
  }'
```

Response:
```json
{
  "id": "job-123",
  "status": "IN_QUEUE"
}
```

Check status:
```bash
curl https://api.runpod.ai/v2/YOUR_ENDPOINT_ID/status/job-123 \
  -H "Authorization: Bearer YOUR_RUNPOD_API_KEY"
```

---

### Option 2: Dedicated Pod

Always-on instance for continuous workloads.

#### 1. Get the Docker Image

**Option A: Use Pre-built Image (Recommended)**

```bash
# Production server image
docker pull ghcr.io/rennerdo30/video-translate-runpod-server:latest
```

**Option B: Build Locally**

```bash
cd backend
docker build -f Dockerfile.runpod --target production -t video-translate-runpod-server .
docker push your-username/video-translate-runpod-server
```

#### 2. Deploy on RunPod

1. Go to [RunPod Pods](https://www.runpod.io/console/pods)
2. Click "Deploy"
3. Select GPU (RTX 4090 recommended)
4. Use custom Docker image
5. Configure environment variables

The server will be available at `http://POD_IP:5001`

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PLATFORM` | Force platform detection | `runpod` |
| `WHISPER_BACKEND` | Whisper implementation | `faster-whisper` |
| `DIARIZATION_BACKEND` | Diarization implementation | `nemo` |
| `WHISPER_MODEL` | Model size | `base` |
| `ENABLE_DIARIZATION` | Enable speaker detection | `true` |
| `SERVER_API_KEY` | OpenAI API key | Required |
| `SERVER_MODEL` | Translation model | `gpt-4o-mini` |
| `HF_TOKEN` | HuggingFace token | For diarization |

---

## API Reference

### Serverless Input

```json
{
  "input": {
    "video_id": "dQw4w9WgXcQ",
    "target_lang": "ja",
    "force_whisper": false,
    "enable_diarization": true
  }
}
```

### Serverless Output

```json
{
  "subtitles": [
    {
      "start": 0,
      "end": 2500,
      "text": "Hello world",
      "translatedText": "こんにちは世界",
      "speaker": "SPEAKER_00"
    }
  ],
  "stats": {
    "download_time": 5.2,
    "transcribe_time": 12.5,
    "diarize_time": 3.1,
    "translate_time": 8.3,
    "total_time": 29.1,
    "segment_count": 150
  }
}
```

---

## Optimizations

### Reduce Cold Start Time

1. **Pre-bake models in image**:
   Uncomment in Dockerfile.runpod:
   ```dockerfile
   RUN python -c "from faster_whisper import WhisperModel; WhisperModel('base', device='cpu')"
   ```

2. **Use Network Volumes**:
   Mount `/root/.cache` to a RunPod network volume for persistent model caching.

3. **Keep minimum workers**:
   Set `Min Workers: 1` to keep at least one warm instance.

### Reduce Costs

1. Use `base` Whisper model (fastest, good accuracy)
2. Disable diarization for simple videos
3. Use serverless for variable workloads
4. Set appropriate idle timeouts

---

## Troubleshooting

### "CUDA out of memory"

- Use smaller Whisper model (`tiny` or `base`)
- Reduce max_speakers for diarization
- Use RTX 4090 (24GB) instead of smaller GPUs

### "Model download timeout"

- Pre-bake models in Docker image
- Use network volumes for persistent cache
- Increase worker timeout

### "Diarization failed"

- Ensure HF_TOKEN is set correctly
- Check HuggingFace authentication
- Fall back to pyannote if NeMo fails

---

## Local Testing

Test the RunPod setup locally with nvidia-docker:

```bash
cd backend

# Build
docker build -f Dockerfile.runpod --target production -t video-translate-runpod .

# Run with GPU
docker run --gpus all -p 5001:5001 \
  -e SERVER_API_KEY=sk-xxx \
  -e HF_TOKEN=hf_xxx \
  video-translate-runpod

# Test health
curl http://localhost:5001/health
```

---

## Integration with Extension

Update the extension to use RunPod endpoint:

1. In extension settings, set Backend URL to your RunPod endpoint
2. For serverless, the extension needs to handle async job polling
3. For dedicated pod, use the pod's IP directly

---

## Support

- RunPod Documentation: https://docs.runpod.io
- RunPod Discord: https://discord.gg/runpod
- Project Issues: https://github.com/rennerdo30/video-translate/issues
