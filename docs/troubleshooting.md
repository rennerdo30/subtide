# Troubleshooting

Solutions for common issues with Subtide.

---

## Backend Issues

### Cannot connect to backend

**Symptoms:**
- "Network Error" in extension
- "Cannot connect to backend" message
- Translations not starting

**Solutions:**

1. Verify the backend is running:
   ```bash
   curl http://localhost:5001/health
   ```

2. Check if another application is using port 5001:
   ```bash
   lsof -i :5001  # macOS/Linux
   netstat -ano | findstr :5001  # Windows
   ```

3. Ensure your firewall allows connections on port 5001

4. For Docker, verify the container is running:
   ```bash
   docker ps
   ```

---

### CORS Errors

**Symptoms:**
- Browser console shows CORS errors
- "Access-Control-Allow-Origin" messages

**Solutions:**

1. Set CORS to allow all origins:
   ```bash
   CORS_ORIGINS=* ./subtide-backend
   ```

2. Or specify YouTube domains:
   ```bash
   CORS_ORIGINS=https://youtube.com,https://www.youtube.com
   ```

3. Restart the backend after changing CORS settings

---

## FFmpeg Issues

### "FFmpeg not found"

**Symptoms:**
- Audio extraction fails
- "FFmpeg not found" error

**Solutions:**

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

    ```powershell
    choco install ffmpeg
    ```

    Or download from [ffmpeg.org](https://ffmpeg.org/download.html)

Verify installation:
```bash
ffmpeg -version
```

---

## Whisper Issues

### Out of memory

**Symptoms:**
- Process crashes
- "Out of memory" errors
- System becomes unresponsive

**Solutions:**

1. Use a smaller model:
   ```bash
   WHISPER_MODEL=base ./subtide-backend
   ```

2. Model memory requirements:

   | Model | Memory |
   |-------|--------|
   | tiny | ~1 GB |
   | base | ~1 GB |
   | small | ~2 GB |
   | medium | ~5 GB |
   | large-v3 | ~10 GB |

3. Close other applications to free memory

---

### Slow transcription

**Symptoms:**
- Transcription takes very long
- Progress seems stuck

**Solutions:**

1. On Apple Silicon, ensure MLX backend:
   ```bash
   WHISPER_BACKEND=mlx ./subtide-backend
   ```

2. On NVIDIA GPU, ensure CUDA backend:
   ```bash
   WHISPER_BACKEND=faster ./subtide-backend
   ```

3. Use a faster model:
   ```bash
   WHISPER_MODEL=large-v3-turbo ./subtide-backend
   ```

---

### "No module named 'mlx'"

**Symptoms:**
- Error when starting backend on Mac

**Solutions:**

1. MLX only works on Apple Silicon (M1/M2/M3/M4)
2. Install MLX:
   ```bash
   pip install mlx-whisper
   ```
3. Or use a different backend:
   ```bash
   WHISPER_BACKEND=openai ./subtide-backend
   ```

---

## Extension Issues

### Extension not loading

**Symptoms:**
- Extension doesn't appear in toolbar
- Error in chrome://extensions

**Solutions:**

1. Ensure Developer mode is enabled in `chrome://extensions`
2. Check for errors in the extension card
3. Try removing and re-adding the extension
4. Verify all files are present in the extension folder

---

### Subtitles not appearing

**Symptoms:**
- Click translate but no subtitles show
- Button activates but nothing happens

**Solutions:**

1. Click the translate button in the player controls
2. Check the extension popup for error messages
3. Verify the backend URL is correct in settings
4. Check browser console (F12) for errors
5. Ensure the video has audio content

---

### YouTube controls not showing translate button

**Symptoms:**
- No Subtide button in YouTube player

**Solutions:**

1. Refresh the page
2. Disable other extensions that modify YouTube's interface
3. Clear browser cache and reload
4. Check if the extension is enabled for YouTube

---

### Firefox temporary add-on removed

**Symptoms:**
- Extension disappears after Firefox restart

**Solutions:**

This is expected for temporary add-ons. For permanent installation:

1. The extension needs to be signed by Mozilla
2. Or use Firefox Developer Edition with signing disabled
3. Keep the ZIP file handy to reload

---

## Docker Issues

### Container exits immediately

**Symptoms:**
- Container starts then stops
- `docker ps` shows no running container

**Solutions:**

1. Check logs:
   ```bash
   docker logs <container_id>
   ```

2. Verify port mapping:
   ```bash
   docker run -p 5001:5001 ...
   ```

3. Ensure sufficient memory is allocated to Docker

4. Check for missing environment variables

---

### Permission denied

**Symptoms:**
- "Permission denied" when running Docker commands

**Solutions:**

1. On Linux, add your user to the docker group:
   ```bash
   sudo usermod -aG docker $USER
   ```
   Then log out and back in.

2. Or use sudo:
   ```bash
   sudo docker ...
   ```

---

## API Key Issues

### Invalid API key

**Symptoms:**
- "Invalid API key" error
- 401 Unauthorized responses

**Solutions:**

1. Verify your API key is correct
2. Check that the key hasn't expired
3. Ensure you're using the correct API URL for your provider
4. For local LLMs, use any non-empty string:
   ```
   API Key: lm-studio
   ```

---

### Rate limiting

**Symptoms:**
- "Rate limit exceeded" errors
- 429 responses

**Solutions:**

1. Wait and retry
2. Use a model with higher rate limits
3. Consider using a local LLM
4. Upgrade your API plan

---

## Translation Quality Issues

### Poor translation quality

**Symptoms:**
- Translations are inaccurate
- Context is lost

**Solutions:**

1. Use a better model (GPT-4o vs GPT-4o-mini)
2. For Asian languages, try Qwen models
3. Ensure source language is correctly detected
4. Check if the original transcription is accurate

---

### Subtitles out of sync

**Symptoms:**
- Subtitles appear at wrong times
- Audio doesn't match text

**Solutions:**

1. Refresh and retry the translation
2. Check if the video has unusual timing
3. For live streams, some delay is expected

---

## Getting Help

If these solutions don't resolve your issue:

1. Check the [GitHub Issues](https://github.com/rennerdo30/subtide/issues)
2. Search for similar problems
3. Open a new issue with:
   - Browser and version
   - Operating system
   - Backend configuration
   - Error messages
   - Steps to reproduce

---

## Next Steps

- [Configuration](getting-started/configuration.md) - Review settings
- [Backend Overview](backend/overview.md) - Backend options
