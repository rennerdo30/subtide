# Video Translate Backend

Standalone backend server for the Video Translate Chrome extension.

## Quick Start (Binary)

Download the binary for your operating system from the [Releases](https://github.com/rennerdo30/video-translate/releases) page.

### Prerequisites

- **FFmpeg** must be installed and available in your PATH

  ```bash
  # macOS
  brew install ffmpeg

  # Ubuntu/Debian
  sudo apt install ffmpeg

  # Windows (using Chocolatey)
  choco install ffmpeg
  ```

### Running the Server

1. Download the appropriate binary:
   - `video-translate-backend-linux` (Linux)
   - `video-translate-backend-macos` (macOS)
   - `video-translate-backend-windows.exe` (Windows)

2. Make executable (Linux/macOS only):
   ```bash
   chmod +x video-translate-backend-linux  # or -macos
   ```

3. Run the server:
   ```bash
   # Linux/macOS
   ./video-translate-backend-linux

   # Windows
   video-translate-backend-windows.exe
   ```

4. The server will start on `http://localhost:5001`

## Configuration

Create a `.env` file in the same directory as the binary (optional):

```env
# Server Configuration
HOST=0.0.0.0
PORT=5001

# Whisper Configuration (Tier 2+)
ENABLE_WHISPER=true
WHISPER_MODEL=base
WHISPER_BEAM_SIZE=5                   # Higher = more accurate (default: 5)
ENABLE_AUDIO_NORMALIZATION=true       # Boost quiet voices

# Whisper Accuracy Tuning
WHISPER_NO_SPEECH_THRESHOLD=0.4       # Lower = capture more (default: 0.4)
WHISPER_COMPRESSION_RATIO_THRESHOLD=2.4
WHISPER_LOGPROB_THRESHOLD=-1.0
WHISPER_CONDITION_ON_PREVIOUS=true    # Better context for mixed languages

# Speaker Diarization
ENABLE_DIARIZATION=true
DIARIZATION_SMOOTHING=true
MIN_SEGMENT_DURATION=0.5

# Tier 3 Managed Translation (optional)
# Recommended FREE models via OpenRouter:
#   google/gemini-2.0-flash-exp:free - Best for non-English
#   meta-llama/llama-4-maverick:free - 12 languages
SERVER_API_KEY=your-openrouter-api-key
SERVER_API_URL=https://openrouter.ai/api/v1
SERVER_MODEL=google/gemini-2.0-flash-exp:free
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/api/subtitles` | GET | Fetch YouTube subtitles |
| `/api/transcribe` | GET | Generate subtitles with Whisper (Tier 2+) |
| `/api/process` | POST | Combined fetch + translate (Tier 3 only) |
| `/api/stream` | POST | Progressive streaming translation (Tier 4) |

### Tier 4 Streaming Mode

The `/api/stream` endpoint provides progressive subtitle delivery with **streaming Whisper transcription**:

- **First subtitles appear in 10-20 seconds** (vs 1-2 minutes for Tier 3)
- Uses subprocess-based Whisper runner that parses stdout in real-time
- Translates batches of 5 segments while transcription continues
- Users can start watching immediately while remaining subtitles load
- SSE events include partial subtitle data as `stage: "subtitles"`

> **Note**: Speaker diarization is disabled in streaming mode for faster initial display.

## Troubleshooting

### "FFmpeg not found" error
Ensure FFmpeg is installed and in your system PATH. Run `ffmpeg -version` to verify.

### "Address already in use" error
Another process is using port 5001. Either stop that process or change the port in your `.env` file.

### Whisper not working
- Ensure `ENABLE_WHISPER=true` in your `.env`
- First run will download the Whisper model (~150MB for base)
- Check you have enough disk space and memory

## Building from Source

If you prefer to run from source instead of the binary:

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
./run.sh
```

## License

MIT License - See [LICENSE](../LICENSE) for details.
