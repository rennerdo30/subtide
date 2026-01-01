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

# Tier 3 Managed Translation (optional)
SERVER_API_KEY=sk-your-api-key
SERVER_API_URL=https://api.openai.com/v1
SERVER_MODEL=gpt-4o-mini
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/api/subtitles` | GET | Fetch YouTube subtitles |
| `/api/transcribe` | GET | Generate subtitles with Whisper (Tier 2+) |
| `/api/process` | POST | Combined fetch + translate (Tier 3 only) |

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
