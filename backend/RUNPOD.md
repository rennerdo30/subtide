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
3. Choose **RTX 4090** (Best value), **RTX 3090**, or **RTX A4500** (High Availability).
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

### "Pod could not be created for tests" (Hub Validation)
- This means the requested GPU (likely RTX 4090) is unavailable in the test pool.
- Edit `.runpod/tests.json` and change `gpuTypeId` to a **GPU Pool ID** for better availability, such as `AMPERE_16` (includes A4000, A4500) or `AMPERE_24` (includes A5000, 3090).
- Avoid using specific GPU IDs like `NVIDIA GeForce RTX 4090` for validation unless strictly necessary, as they fluctuate in availability.
- You can also empty the `tests` list in `.runpod/tests.json` to skip functional validation if resource availability is blocking deployment.

### "Connection Refused" (Dedicated Pod)
- Ensure the Pod is showing "Running".
- Check that port `5001` is strictly exposed in the Pod settings.
- Check logs: `docker logs <container_id>`.

### Streaming Lag (Serverless)
- Serverless cold starts can take 10-20s.
- Use **Dedicated Pods** for instant, latency-sensitive streaming.

## 📚 Reference: GPU IDs & Pools

When configuring `gpuTypeId` in `.runpod/tests.json` or `runpod.toml`, use **Pool IDs** for better availability during validation/testing. Use specific **GPU IDs** if you strictly require a certain hardware tier.

### 🏊 GPU Pools (Recommended for Validation)
| Pool ID | Included GPUs | VRAM |
| :--- | :--- | :--- |
| `AMPERE_16` | A4000, A4500, RTX 4000, RTX 2000 | 16 GB |
| `AMPERE_24` | L4, A5000, 3090 | 24 GB |
| `ADA_24` | 4090 | 24 GB |
| `AMPERE_48` | A6000, A40 | 48 GB |
| `ADA_48_PRO` | L40, L40S, 6000 Ada | 48 GB |
| `AMPERE_80` | A100 | 80 GB |
| `ADA_80_PRO` | H100 | 80 GB |
| `HOPPER_141` | H200 | 141 GB |

### 🆔 Specific GPU IDs
**NVIDIA GeForce (Consumer)**
| ID | Model | VRAM |
| :--- | :--- | :--- |
| `NVIDIA GeForce RTX 3070` | RTX 3070 | 8 GB |
| `NVIDIA GeForce RTX 3080` | RTX 3080 | 10 GB |
| `NVIDIA GeForce RTX 3080 Ti` | RTX 3080 Ti | 12 GB |
| `NVIDIA GeForce RTX 3090` | RTX 3090 | 24 GB |
| `NVIDIA GeForce RTX 3090 Ti` | RTX 3090 Ti | 24 GB |
| `NVIDIA GeForce RTX 4070 Ti` | RTX 4070 Ti | 12 GB |
| `NVIDIA GeForce RTX 4080` | RTX 4080 | 16 GB |
| `NVIDIA GeForce RTX 4080 SUPER` | RTX 4080 SUPER | 16 GB |
| `NVIDIA GeForce RTX 4090` | RTX 4090 | 24 GB |
| `NVIDIA GeForce RTX 5080` | RTX 5080 | 16 GB |
| `NVIDIA GeForce RTX 5090` | RTX 5090 | 32 GB |

**NVIDIA RTX / Quadro (Professional)**
| ID | Model | VRAM |
| :--- | :--- | :--- |
| `NVIDIA RTX A2000` | RTX A2000 | 6 GB |
| `NVIDIA RTX A4000` | RTX A4000 | 16 GB |
| `NVIDIA RTX A4500` | RTX A4500 | 20 GB |
| `NVIDIA RTX A5000` | RTX A5000 | 24 GB |
| `NVIDIA RTX A6000` | RTX A6000 | 48 GB |
| `NVIDIA RTX 2000 Ada Generation` | RTX 2000 Ada | 16 GB |
| `NVIDIA RTX 4000 Ada Generation` | RTX 4000 Ada | 20 GB |
| `NVIDIA RTX 4000 SFF Ada Generation` | RTX 4000 Ada SFF | 20 GB |
| `NVIDIA RTX 5000 Ada Generation` | RTX 5000 Ada | 32 GB |
| `NVIDIA RTX 6000 Ada Generation` | RTX 6000 Ada | 48 GB |
| `NVIDIA RTX PRO 6000 Blackwell Server Edition` | RTX PRO 6000 Server | 96 GB |
| `NVIDIA RTX PRO 6000 Blackwell Workstation Edition` | RTX PRO 6000 Workstation | 96 GB |

**NVIDIA Data Center**
| ID | Model | VRAM |
| :--- | :--- | :--- |
| `NVIDIA L4` | L4 | 24 GB |
| `NVIDIA L40` | L40 | 48 GB |
| `NVIDIA L40S` | L40S | 48 GB |
| `NVIDIA A30` | A30 | 24 GB |
| `NVIDIA A40` | A40 | 48 GB |
| `NVIDIA A100 80GB PCIe` | A100 PCIe | 80 GB |
| `NVIDIA A100-SXM4-80GB` | A100 SXM | 80 GB |
| `NVIDIA H100 PCIe` | H100 PCIe | 80 GB |
| `NVIDIA H100 80GB HBM3` | H100 SXM | 80 GB |
| `NVIDIA H100 NVL` | H100 NVL | 94 GB |
| `NVIDIA H200` | H200 SXM | 141 GB |
| `NVIDIA B200` | B200 | 180 GB |
| `Tesla V100-FHHL-16GB` | V100 FHHL | 16 GB |
| `Tesla V100-PCIE-16GB` | Tesla V100 | 16 GB |
| `Tesla V100-SXM2-16GB` | V100 SXM2 | 16 GB |
| `Tesla V100-SXM2-32GB` | V100 SXM2 32GB | 32 GB |

**AMD**
| ID | Model | VRAM |
| :--- | :--- | :--- |
| `AMD Instinct MI300X OAM` | MI300X | 192 GB |
