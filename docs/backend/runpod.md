# RunPod Deployment

Deploy Subtide on RunPod for GPU-accelerated transcription.

---

## Overview

[RunPod](https://runpod.io) provides GPU instances for running Subtide with hardware-accelerated Whisper transcription. Two deployment modes are available:

| Mode | Best For | Cost Model |
|------|----------|------------|
| **Serverless** | Variable load, pay-per-use | Per-second billing |
| **Dedicated** | Consistent load, always-on | Hourly billing |

---

## Quick Start

### Docker Image

```bash
docker pull ghcr.io/rennerdo30/subtide-runpod:latest
```

### Configure Extension

Set your backend URL to your RunPod endpoint:

- **Serverless**: `https://api.runpod.ai/v2/{ENDPOINT_ID}`
- **Dedicated**: `https://{POD_ID}-5001.proxy.runpod.net`

---

## Serverless Deployment

### 1. Create Serverless Endpoint

1. Go to [RunPod Serverless](https://www.runpod.io/console/serverless)
2. Click **New Endpoint**
3. Configure:
    - **Name**: `subtide`
    - **Container Image**: `ghcr.io/rennerdo30/subtide-runpod:latest`
    - **GPU Type**: RTX 3090, RTX 4090, or A100
    - **Max Workers**: 3-5 (adjust based on load)

### 2. Environment Variables

Set these in the endpoint configuration:

```
WHISPER_MODEL=large-v3-turbo
WHISPER_BACKEND=faster
SERVER_API_KEY=sk-xxx
SERVER_API_URL=https://api.openai.com/v1
SERVER_MODEL=gpt-4o
```

### 3. Configure Extension

```
Operation Mode: Tier 3 or Tier 4
Backend URL: https://api.runpod.ai/v2/{ENDPOINT_ID}
RunPod API Key: {YOUR_RUNPOD_API_KEY}
```

### Serverless Pricing

- Pay only when processing requests
- Cold start: ~10-30 seconds
- Ideal for sporadic usage

---

## Dedicated Pod Deployment

### 1. Create GPU Pod

1. Go to [RunPod GPU Pods](https://www.runpod.io/console/pods)
2. Click **Deploy**
3. Select a GPU (RTX 3090 or better recommended)
4. Use the Docker image:
   ```
   ghcr.io/rennerdo30/subtide-runpod-server:latest
   ```

### 2. Environment Variables

Set in pod configuration:

```
WHISPER_MODEL=large-v3-turbo
WHISPER_BACKEND=faster
SERVER_API_KEY=sk-xxx
SERVER_API_URL=https://api.openai.com/v1
SERVER_MODEL=gpt-4o
PORT=5001
```

### 3. Expose Port

Enable HTTP port 5001 in pod settings.

### 4. Configure Extension

```
Operation Mode: Tier 3 or Tier 4
Backend URL: https://{POD_ID}-5001.proxy.runpod.net
```

### Dedicated Pricing

- Hourly billing while pod is running
- No cold start
- Ideal for consistent usage

---

## GPU Selection

| GPU | VRAM | Whisper Model | Cost |
|-----|------|---------------|------|
| RTX 3090 | 24 GB | large-v3 | $$ |
| RTX 4090 | 24 GB | large-v3 | $$$ |
| A100 40GB | 40 GB | large-v3 | $$$$ |
| A100 80GB | 80 GB | large-v3 | $$$$$ |

!!! tip "Recommendation"
    RTX 3090 or RTX 4090 offer the best price/performance for Subtide.

---

## Configuration Examples

### Cost-Optimized (Serverless)

```
GPU: RTX 3090
WHISPER_MODEL=base
Max Workers: 2
```

- Lower cost per request
- Faster processing of smaller models
- Good for light usage

### Quality-Optimized (Dedicated)

```
GPU: RTX 4090
WHISPER_MODEL=large-v3-turbo
Always-on pod
```

- No cold start
- Best transcription quality
- Good for heavy usage

---

## API Authentication

RunPod requires authentication for serverless endpoints:

### Header Authentication

```bash
curl -X POST https://api.runpod.ai/v2/{ENDPOINT_ID}/runsync \
  -H "Authorization: Bearer {RUNPOD_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"input": {...}}'
```

### Extension Configuration

The extension handles this automatically when you provide your RunPod API key in the settings.

---

## Monitoring

### Serverless Dashboard

- View request counts
- Monitor worker scaling
- Check error rates
- See billing information

### Pod Monitoring

- SSH into pod for logs
- View GPU utilization
- Monitor memory usage

---

## Troubleshooting

### Cold Start Too Slow

- Increase minimum workers (serverless)
- Use dedicated pod for instant response
- Pre-warm with periodic requests

### GPU Out of Memory

- Use smaller Whisper model
- Reduce concurrent requests
- Upgrade to larger GPU

### Connection Timeout

- Check pod/endpoint status
- Verify URL format
- Ensure port is exposed

### 401 Unauthorized

- Verify RunPod API key
- Check endpoint ID
- Ensure key has correct permissions

---

## Cost Optimization

1. **Use serverless** for variable load
2. **Scale workers** based on actual usage
3. **Use smaller models** when quality isn't critical
4. **Stop pods** when not in use
5. **Monitor usage** in RunPod dashboard

---

## Next Steps

- [Docker Deployment](docker.md) - Local Docker deployment
- [Local LLM Setup](local-llm.md) - Run everything locally
- [API Reference](../api/endpoints.md) - API documentation
