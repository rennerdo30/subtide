# Installation

Detailed installation instructions for all components.

---

## Backend Installation

### Option A: Pre-built Binary

The easiest way to get started is with the pre-built binaries.

**Prerequisites:**

- [FFmpeg](https://ffmpeg.org/download.html) installed and in your PATH

**Download:**

1. Go to [Releases](https://github.com/rennerdo30/video-translate/releases)
2. Download the appropriate binary for your OS:
    - `video-translate-backend-linux`
    - `video-translate-backend-macos`
    - `video-translate-backend-windows.exe`

**Run:**

=== "Linux"

    ```bash
    chmod +x video-translate-backend-linux
    ./video-translate-backend-linux
    ```

=== "macOS"

    ```bash
    chmod +x video-translate-backend-macos
    ./video-translate-backend-macos
    ```

    !!! note "macOS Security"
        If you see "cannot be opened because the developer cannot be verified":

        1. Right-click the file → **Open**
        2. Or: System Settings → Privacy & Security → Allow anyway

=== "Windows"

    ```powershell
    .\video-translate-backend-windows.exe
    ```

---

### Option B: Run from Source

For development or customization.

**Prerequisites:**

- Python 3.9 or higher
- FFmpeg installed

**Setup:**

```bash
# Clone the repository
git clone https://github.com/rennerdo30/video-translate.git
cd video-translate/backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
source venv/bin/activate  # Linux/macOS
# or
venv\Scripts\activate  # Windows

# Install dependencies
pip install -r requirements.txt

# Run the server
./run.sh  # Linux/macOS
# or
python app.py  # Windows
```

---

### Option C: Docker

For containerized deployments.

```bash
cd backend

# Tier 1: Standard (YouTube captions only)
docker-compose up video-translate-tier1

# Tier 2: With Whisper transcription
docker-compose up video-translate-tier2

# Tier 3/4: Managed with server-side API key
SERVER_API_KEY=sk-xxx docker-compose up video-translate-tier3
```

---

## Browser Extension Installation

### Chrome / Edge / Brave

=== "From Release"

    1. Download `video-translate-extension.zip` from [Releases](https://github.com/rennerdo30/video-translate/releases)
    2. Extract the ZIP file to a folder
    3. Open your browser and go to the extensions page:
        - Chrome: `chrome://extensions`
        - Edge: `edge://extensions`
        - Brave: `brave://extensions`
    4. Enable **Developer mode**
    5. Click **Load unpacked**
    6. Select the extracted folder
    7. Pin the extension to your toolbar for easy access

=== "From Source"

    1. Clone the repository:
       ```bash
       git clone https://github.com/rennerdo30/video-translate.git
       ```
    2. Open `chrome://extensions`
    3. Enable **Developer mode**
    4. Click **Load unpacked**
    5. Select the `extension` folder from the cloned repo

---

### Firefox

=== "Temporary Installation"

    1. Download `video-translate-extension-firefox.zip` from [Releases](https://github.com/rennerdo30/video-translate/releases)
    2. Open Firefox and go to `about:debugging`
    3. Click **This Firefox**
    4. Click **Load Temporary Add-on**
    5. Select the ZIP file

    !!! warning "Temporary Add-ons"
        Temporary add-ons are removed when Firefox restarts. For permanent installation, the extension needs to be signed by Mozilla.

=== "From Source"

    1. Run the Firefox build script:
       ```bash
       node extension/scripts/build-firefox.js
       ```
    2. Open `about:debugging` in Firefox
    3. Click **This Firefox** → **Load Temporary Add-on**
    4. Select `extension/manifest.firefox.json`

---

## Verifying Installation

### Backend

Open your browser and navigate to:

```
http://localhost:5001/health
```

You should see:

```json
{"status": "healthy"}
```

### Extension

1. Click the Subtide icon in your toolbar
2. The popup should display the configuration options
3. Go to any YouTube video
4. You should see the translate button in the player controls

---

## FFmpeg Installation

FFmpeg is required for audio extraction from videos.

=== "macOS"

    ```bash
    brew install ffmpeg
    ```

=== "Ubuntu/Debian"

    ```bash
    sudo apt update
    sudo apt install ffmpeg
    ```

=== "Windows"

    Using Chocolatey:
    ```powershell
    choco install ffmpeg
    ```

    Or download from [ffmpeg.org](https://ffmpeg.org/download.html) and add to PATH.

=== "Verify"

    ```bash
    ffmpeg -version
    ```

---

## Next Steps

- [Configuration](configuration.md) - Configure the extension and backend
- [Backend Overview](../backend/overview.md) - Learn about backend options
