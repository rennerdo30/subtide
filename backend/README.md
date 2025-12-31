# Video Translate Backend

A simple Flask server that wraps `yt-dlp` to fetch YouTube subtitles, bypassing browser-side restrictions (CORS, network blocks, strict CSP).

## Setup

1.  **Create a virtual environment (Recommended)**:
    ```bash
    python3 -m venv venv
    source venv/bin/activate
    ```

2.  **Install Dependencies**:
    ```bash
    pip install -r requirements.txt
    ```

3.  **Run the Server**:
    ```bash
    python app.py
    ```
    The server will start on `http://localhost:5001`.

## API Endpoints

### `GET /api/subtitles`

Fetches subtitles for a given YouTube video.

**Parameters:**
*   `video_id` (required): The YouTube Video ID.
*   `lang` (optional): Language code (default: `en`).

**Response:**
*   Returns the subtitle content directly (JSON, VTT, or XML).
*   Prefers `json3` format if available.
*   On error, returns a JSON object with `error` message.

**Example:**
```bash
curl "http://localhost:5001/api/subtitles?video_id=dQw4w9WgXcQ&lang=en"
```


### `GET /health`

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "service": "video-translate-backend"
}
```
