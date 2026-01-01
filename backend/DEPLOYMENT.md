# Backend Deployment Guide

The backend is containerized using Docker and supports 3 tiers of service configuration.

## Prerequisites

- Docker and Docker Compose
- OpenAI API Key (for Tier 3)

## Service Tiers

The application behaves differently based on environment variables, mapping to:

### Tier 1 (Free)
- **Features**: YouTube Subtitles (Auto/Manual) ONLY.
- **Restrictions**: No Whisper transcription. User must provide their own OpenAI Key in the extension.
- **Config**: `ENABLE_WHISPER=false`

### Tier 2 (Cheap)
- **Features**: YouTube Subtitles + Whisper Transcription.
- **Restrictions**: User must provide their own OpenAI Key in the extension.
- **Config**: `ENABLE_WHISPER=true`

### Tier 3 (Expensive/Pro)
- **Features**: YouTube Subtitles + Whisper Transcription + Managed Translation.
- **Restrictions**: None. The server handles translation costs.
- **Config**: `ENABLE_WHISPER=true`, `SERVER_API_KEY=sk-...`

## Running with Docker Compose

Running all tiers (for testing/development):

```bash
docker-compose up --build
```

Running a specific tier (e.g., Tier 1):

```bash
docker-compose up --build video-translate-tier1
```

## Local Development

1. Create a virtual environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Run the server:
   ```bash
   ./run.sh
   ```
   (Defaults to Tier 2 behavior for development convenience)
