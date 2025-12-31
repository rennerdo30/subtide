# Backend API Documentation

The `video-translate` extension now relies on a local Python backend to handle heavy lifting, specifically for network-sensitive tasks.

## Prerequisite

The backend must be running for the extension to work reliably.

```bash
cd backend
source venv/bin/activate
python app.py
```

## Architecture

![Hybrid Architecture](https://mermaid.ink/img/pako:eNpVkM1Kw0AQx19lzGkL9iKCR6HgQREvPZSWXDbTZhu6O5N0FymFvrsJtR7EczPz__3mN0Ith4gC1a2u1R0c4zq_gG-8P8A5rPMaLE9wDbthOAeLB7iC3WUY3sDiCW5g9xmG97B4hgfYe4bhAyye4Qn2fobhIyye4Rn2XobhMyye4QX2fobhCyyey1apW7VSt2qlbtVK3aqVuj9L3d_Lp3zK53zOVz6XfCnzZcmXJV_WfFnzZVfKrq6sW7VSt2qlbtVK3aqVuj9L3d-r_Fqf82t9zq_1Ob_W5_xaX8qv9aX8Wl_Kr_Wl_Fpfyq_1pfxaX8qv9aX8Wl_Kr_Wl_Fpfyq_1pfxaX8qv9aX8Wl_Kr_Wl_Fpfyq_1pfxaX8qv9aX8Wl_Kr_Wl_Fpfyq_1pfxaX8qv9aX8Wl_Kr_Wl_Fpfyq_1pfxaX8qv9aX8Wl_Kr_Wl_P4_v_8B_jdp1Q)

*(Conceptual Diagram)*
1. **Chrome Extension** runs in the browser.
2. **Browser Permissions** allow access to `http://localhost:5001`.
3. **Python Backend** runs on `localhost:5001`.
4. **Backend** makes requests to:
   - `www.youtube.com` (for subtitles via `yt-dlp`)
   - `api.openai.com` (for translation)

## Endpoints

### 1. Subtitle Fetching
`GET /api/subtitles`
- **Purpose**: Reliably get subtitle data without browser blocks.
- **Params**:
    - `video_id`: The YouTube Video ID.
    - `lang`: (Optional) 2-letter language code (default: `en`).
- **Returns**: JSON (json3 format) or Raw Subtitle Text.
- **Caching**: The backend caches results in `backend/cache/` to speed up subsequent requests.

## Troubleshooting

- **Server Not Found**: Ensure you ran `python app.py` on port 5001.
- **502 Bad Gateway**: The backend failed to reach YouTube. Check your internet connection (or server logs).
