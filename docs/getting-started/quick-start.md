# Quick Start

Get Subtide running in under 5 minutes.

---

## 1. Start the Backend

Choose one of the following options:

=== "Binary (Recommended)"

    Download the latest backend binary from [Releases](https://github.com/rennerdo30/video-translate/releases):

    - `video-translate-backend-linux`
    - `video-translate-backend-macos`
    - `video-translate-backend-windows.exe`

    !!! note "Prerequisite"
        [FFmpeg](https://ffmpeg.org/download.html) must be installed.

    ```bash
    # Make executable (Linux/macOS)
    chmod +x video-translate-backend-macos

    # Run
    ./video-translate-backend-macos
    ```

=== "Python Source"

    ```bash
    cd backend
    python -m venv venv
    source venv/bin/activate  # Windows: venv\Scripts\activate
    pip install -r requirements.txt
    ./run.sh
    ```

=== "Docker"

    ```bash
    cd backend
    docker-compose up video-translate-tier2
    ```

The backend will start on `http://localhost:5001`.

---

## 2. Install the Extension

=== "Chrome / Edge / Brave"

    1. Download `video-translate-extension.zip` from [Releases](https://github.com/rennerdo30/video-translate/releases)
    2. Extract the ZIP file
    3. Open Chrome → `chrome://extensions`
    4. Enable **Developer mode** (top right)
    5. Click **Load unpacked** → select the extracted folder
    6. Pin the extension to your toolbar

=== "Firefox"

    1. Download `video-translate-extension-firefox.zip` from [Releases](https://github.com/rennerdo30/video-translate/releases)
    2. Open Firefox → `about:debugging`
    3. Click **This Firefox** → **Load Temporary Add-on**
    4. Select the ZIP file

---

## 3. Configure

1. Click the Subtide extension icon in your toolbar
2. Select your **operation mode** (Tier 1 for basic usage)
3. Enter your **API key** and select a **model** (for Tier 1 & 2)
4. Choose your **target language**
5. Click **Save**

!!! tip "API Providers"
    - **OpenAI**: Get your key at [platform.openai.com](https://platform.openai.com)
    - **OpenRouter**: Get your key at [openrouter.ai](https://openrouter.ai)
    - **Local LLM**: Use [LM Studio](https://lmstudio.ai/) or [Ollama](https://ollama.ai/)

---

## 4. Translate!

### YouTube Videos

1. Go to any YouTube video
2. Click the **translate button** in the player controls (bottom right)
3. Subtitles appear automatically

### YouTube Shorts

1. Navigate to any Shorts video
2. Click the **floating translate button** (bottom-right of the video)
3. Enable translation - videos are pre-translated as you scroll
4. Subtitles appear instantly when swiping to the next Short

---

## Next Steps

- [Full Installation Guide](installation.md) - Detailed setup instructions
- [Configuration Options](configuration.md) - All available settings
- [YouTube Guide](../user-guide/youtube.md) - Complete YouTube features
- [Troubleshooting](../troubleshooting.md) - Common issues and solutions
