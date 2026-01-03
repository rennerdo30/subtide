# RunPod Deployment Guide

Deploy Video Translate on RunPod.io for fast, cost-effective GPU acceleration.

## 🚀 Quick Summary

| Feature | Serverless Endpoint | Dedicated Pod |
|---------|---------------------|---------------|
| **Best For** | Variable/clean loads, Tier 3 (Batch) | Continuous use, **Tier 4 (Streaming)** |
| **Cost** | Pay-per-second, scales to zero | Flat hourly rate |
| **Setup** | Easy, managed | Full control, accessible IP |
| **Streaming** | Limited (JSON chunks) | **Full SSE Support (Tier 4)** |

---

## 🔒 Authentication (New!)

The extension now supports **Secure API Keys** for RunPod endpoints.

1. **Dedicated Pods**: You can protect your pod using a reverse proxy or by passing your internal `SERVER_API_KEY` if configured.
2. **Serverless**: Uses standard RunPod API Keys (`Authorization: Bearer rpa_...`).

To use authentication:
1. Open Extension **Settings**.
2. Select **Tier 4 (Stream)** or **Tier 3**.
3. Set **Provider** to **Custom / RunPod**.
4. Enter your **Endpoint URL**.
5. Enter your **RunPod API Key** in the "API Key" field.

---

## 🛠 Deployment Options

### Option 1: Dedicated Pod (Recommended for Tier 4 Streaming)

This runs the full Flask backend, providing native SSE support for the "live streaming" subtitle experience (`/api/stream`).

#### 1. Deploy
1. Go to [RunPod Pods](https://www.runpod.io/console/pods).
2. Click **Deploy**.
3. Choose **RTX 4090** (Best value) or **RTX 3090**.
4. **Customize Deployment**:
   - **Container Image**: `ghcr.io/rennerdo30/video-translate-runpod-server:latest`
   - **Expose Port**: `5001` (HTTP)
   - **Environment Variables**:
     ```env
     SERVER_API_KEY=sk-your-openai-key   # Required for translation
     ENABLE_WHISPER=true
     WHISPER_MODEL=base
     ENABLE_DIARIZATION=true
     HF_TOKEN=hf_your-token             # Optional: for Diarization
     ```

#### 2. Get Backend Address
1. Once running, click **Connect**.
2. Find the **HTTP Service** mapped to port `5001`.
3. It will look like: `https://pod-id-5001.proxy.runpod.net`
4. **Copy this URL** into the Extension settings.

---

### Option 2: Serverless (Best for Tier 3 / Batch)

Best for on-demand usage where you don't want to pay for idle time.

#### 1. Create Template
1. Go to [Templates](https://www.runpod.io/console/serverless/user/templates).
2. Click **New Template**.
3. **Container Image**: `ghcr.io/rennerdo30/video-translate-runpod:latest`
4. **Container Disk**: `20 GB`.

#### 2. Create Endpoint
1. Go to [Serverless](https://www.runpod.io/console/serverless).
2. Click **New Endpoint**.
3. Select your template.
4. **Min Workers**: `0` (Scales to zero to save cost).
5. **Max Workers**: `3`.
6. **FlashBoot**: Enabled (Faster starts).

#### 3. Get Endpoint Details
1. Click on your new Endpoint.
2. Copy the **Endpoint ID** (e.g., `vllm-xyz123`).
3. Your **Endpoint URL** is: `https://api.runpod.ai/v2/{endpoint_id}`.

---

### Option 3: Connect GitHub Repo (RunPod Serverless Repos)

Build directly from your Git repository without managing Docker registries.

1. Go to [RunPod Serverless](https://www.runpod.io/console/serverless).
2. Click **New Endpoint**.
3. Select **Import Git Repository**.
4. Authorize GitHub (if needed) and select this repository.
5. **Configuration**:
   - **Dockerfile Path**: `backend/Dockerfile.runpod`
   - **Context Directory**: leave default (Root)
   - **Branch**: `main` (or your release branch)
6. RunPod will auto-build the image from the source code.

> **Note**: This uses `backend/Dockerfile.runpod` which is optimized to run from the repository root.

---

### Option 4: RunPod Hub (One-Click Deploy)

We have configured this repository for the RunPod Hub! You can deploy it directly from the community validation queue once published.

1. **Configuration**: Uses `.runpod/hub.json` to define valid environment variables and hardware requirements.
2. **Tests**: Uses `.runpod/tests.json` for automated validation.
3. **Deploy from Hub**:
   - Go to RunPod Hub.
   - Search for "Video Translate".
   - Click "Deploy".

If you are maintaining your own fork:
1. Create a release in GitHub.
2. Submit your repo to RunPod Hub.

---

### Option 5: RunPod Projects (CLI / Dockerless)

For rapid development without managing Dockerfiles manually, use the [RunPod CLI](https://docs.runpod.io/serverless/utils/rp-cli) with the included `runpod.toml`.

1. Install `runpodctl`.
2. Run from the repo root:
   ```bash
   runpodctl project create
   # or
   runpodctl project deploy
   ```
3. The configurations in `runpod.toml` (handler path, requirements, GPU type) are applied automatically.

---

## 🏗 Building Your Own Image

If you want to modify the backend and deploy your own version:

```bash
# Login to GitHub Registry (or DockerHub)
docker login ghcr.io

# Build Serverless Image
docker build -f Dockerfile -t ghcr.io/yourname/vt-runpod .

# Build Dedicated Server Image
# (Same Dockerfile, different entry command via docker-compose or override)
# The default Dockerfile is hybrid, but we use targets for clarity in CI/CD.
```

The provided `Dockerfile` in the root is optimized for both use cases.

## 📦 Troubleshooting

### 401 Unauthorized
- Ensure you pasted your **RunPod API Key** into the Extension's API Key field.
- Ensure your Serverless Endpoint allows your key scope.

### "Connection Refused" (Dedicated Pod)
- Ensure the Pod is showing "Running".
- Check that port `5001` is strictly exposed in the Pod settings.
- Check logs: `docker logs <container_id>`.

### Streaming Lag (Serverless)
- Serverless cold starts can take 10-20s.
- Use **Dedicated Pods** for instant, latency-sensitive streaming.
