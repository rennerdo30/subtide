# Local LLM Setup

Run translations completely locally using LM Studio or Ollama.

---

## Overview

Subtide supports local LLM inference, allowing you to:

- Run translations without cloud API costs
- Keep all data on your machine
- Use any compatible model
- Avoid rate limits

---

## LM Studio

[LM Studio](https://lmstudio.ai/) provides a user-friendly interface for running local models.

### Installation

1. Download LM Studio from [lmstudio.ai](https://lmstudio.ai/)
2. Install and launch
3. Download a model from the built-in browser

### Recommended Models

| Model | Size | Quality | Speed |
|-------|------|---------|-------|
| Llama 3.1 8B | 4.7 GB | Good | Fast |
| Mistral 7B | 4.1 GB | Good | Fast |
| Qwen 2.5 7B | 4.4 GB | Excellent | Fast |
| Llama 3.1 70B | 40 GB | Excellent | Slow |

### Start Local Server

1. In LM Studio, click **Local Server** tab
2. Select your downloaded model
3. Click **Start Server**
4. Server runs at `http://localhost:1234/v1`

### Configure Extension

```
Operation Mode: Tier 1 or Tier 2
API Provider: Custom Endpoint
API URL: http://localhost:1234/v1
API Key: lm-studio
Model: (leave empty or enter model name)
```

---

## Ollama

[Ollama](https://ollama.ai/) is a lightweight tool for running LLMs locally.

### Installation

=== "macOS"

    ```bash
    brew install ollama
    ```

=== "Linux"

    ```bash
    curl -fsSL https://ollama.com/install.sh | sh
    ```

=== "Windows"

    Download from [ollama.ai](https://ollama.ai/download)

### Download Models

```bash
# Recommended models
ollama pull llama3.1:8b
ollama pull mistral:7b
ollama pull qwen2.5:7b

# For Asian languages
ollama pull qwen2.5:14b
```

### Start Server

Ollama runs automatically after installation. Verify:

```bash
ollama serve  # If not running
```

Server runs at `http://localhost:11434/v1`.

### Configure Extension

```
Operation Mode: Tier 1 or Tier 2
API Provider: Custom Endpoint
API URL: http://localhost:11434/v1
API Key: ollama
Model: llama3.1:8b
```

---

## Model Recommendations

### By Language

| Language | Recommended Model | Notes |
|----------|-------------------|-------|
| English | Any model | All work well |
| European | Mistral, Llama | Good coverage |
| Chinese | Qwen 2.5 | Specifically trained |
| Japanese | Qwen 2.5 | Good Asian language support |
| Korean | Qwen 2.5 | Good Asian language support |

### By Hardware

| RAM | Recommended Model |
|-----|-------------------|
| 8 GB | Not recommended |
| 16 GB | 7B models (quantized) |
| 32 GB | 7B-8B models |
| 64 GB | 13B-14B models |
| 128 GB+ | 70B models |

!!! warning "Memory Requirements"
    Models require significant RAM. The values above are rough estimates. Quantized models (Q4, Q5) use less memory.

---

## Performance Tuning

### LM Studio

1. **GPU Layers**: Increase for faster inference
2. **Context Length**: Reduce for less memory
3. **Batch Size**: Adjust based on hardware

### Ollama

```bash
# Set number of GPU layers
OLLAMA_NUM_GPU=35 ollama run llama3.1:8b

# Set context size
ollama run llama3.1:8b --num-ctx 4096
```

---

## Combining with Local Whisper

For fully local operation:

```bash
# Backend with local Whisper
WHISPER_MODEL=base WHISPER_BACKEND=mlx ./video-translate-backend
```

```
Extension:
Operation Mode: Tier 2 (Enhanced)
API Provider: Custom Endpoint
API URL: http://localhost:1234/v1
API Key: lm-studio
```

This setup:

- Transcribes audio locally with Whisper
- Translates locally with LM Studio/Ollama
- No data leaves your machine

---

## Troubleshooting

### Connection Refused

1. Verify the local server is running
2. Check the port (1234 for LM Studio, 11434 for Ollama)
3. Ensure no firewall blocking

### Slow Responses

1. Use a smaller model
2. Increase GPU layers
3. Use quantized versions

### Out of Memory

1. Use a smaller model
2. Use more aggressive quantization
3. Reduce context length

### Poor Translation Quality

1. Use a larger model
2. Try a different model architecture
3. Consider using cloud APIs for critical work

---

## Model Comparison

### Translation Quality Ranking

1. **GPT-4o** (cloud) - Best quality
2. **Llama 3.1 70B** (local) - Excellent
3. **Qwen 2.5 14B** (local) - Very good for Asian languages
4. **Llama 3.1 8B** (local) - Good
5. **Mistral 7B** (local) - Good

### Speed Ranking (local)

1. **Mistral 7B** - Fastest
2. **Llama 3.1 8B** - Fast
3. **Qwen 2.5 7B** - Fast
4. **Qwen 2.5 14B** - Medium
5. **Llama 3.1 70B** - Slow

---

## Cost Comparison

| Setup | Cost |
|-------|------|
| OpenAI GPT-4o | ~$0.01/video |
| OpenAI GPT-4o-mini | ~$0.001/video |
| Local LLM | Electricity only |

!!! tip "Hybrid Approach"
    Use local models for most translations, cloud APIs for high-quality needs.

---

## Next Steps

- [Backend Overview](overview.md) - All backend options
- [Docker Deployment](docker.md) - Container deployment
- [Configuration](../getting-started/configuration.md) - All settings
