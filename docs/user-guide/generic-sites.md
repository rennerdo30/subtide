# Generic Sites

Using Subtide on any website with video content.

---

## Overview

Subtide works on **any website** with `<video>` elements, not just YouTube and Twitch. This includes:

- Educational platforms (Coursera, Udemy, etc.)
- News sites
- Social media (Twitter/X video, etc.)
- Self-hosted video players
- Any HTML5 video

---

## How It Works

1. Subtide detects `<video>` elements on the page
2. A floating control bar appears above the video
3. Click to start translation
4. Subtitles overlay the video

!!! note "Detection"
    The extension automatically finds videos. On some sites, you may need to start playing the video first for detection.

---

## Controls

### Control Bar

A floating control bar appears at the **top** of the video:

- **Translate Button** - Start/stop translation
- **Language Selector** - Choose target language
- **Size Options** - Adjust subtitle size
- **Settings** - Additional options

!!! info "Why Top Positioning?"
    The control bar is at the top to avoid blocking native video controls (play, pause, volume, etc.) which are typically at the bottom.

### Subtitle Display

- **Position**: Draggable anywhere on the video
- **Size**: S / M / L / XL
- **Style**: Consistent dark theme with teal accents

---

## Supported Features

| Feature | Support |
|---------|---------|
| Transcription | Yes (Tier 2+) |
| Translation | Yes |
| Dual Subtitles | Yes |
| Export (SRT/VTT/TXT) | Yes |
| Draggable Position | Yes |
| Keyboard Shortcuts | Yes |

---

## Site-Specific Notes

### Educational Platforms

Most work well:

- **Coursera** - Works on course videos
- **Udemy** - Works on lecture videos
- **Khan Academy** - Works on educational content
- **LinkedIn Learning** - Works on course videos

### Social Media

- **Twitter/X** - Works on embedded videos
- **Facebook** - May require video to be playing
- **Instagram** - Limited support due to dynamic loading

### News Sites

Generally works well on:

- Major news outlets with HTML5 video
- Documentary sites
- Video archives

---

## Configuration

For generic sites, ensure:

### Extension Settings

```
Operation Mode: Tier 2 (Enhanced)
Backend URL: http://localhost:5001
```

### Backend

Whisper transcription is required since most sites don't have caption tracks:

```bash
WHISPER_MODEL=base ./video-translate-backend
```

---

## Keyboard Shortcuts

Keyboard shortcuts work on generic sites too:

| Key | Action |
|-----|--------|
| `T` | Toggle subtitles |
| `D` | Toggle dual mode |
| `S` | Download subtitles |

!!! note "Focus Required"
    The video or page must have focus for shortcuts to work.

---

## Troubleshooting

### Video not detected

1. **Start playing** the video first
2. **Refresh** the page after the video loads
3. **Check** if the video is in an iframe (some sites block extension access)
4. **Wait** for dynamic content to load

### Controls not appearing

1. The video may be in a shadow DOM (limited support)
2. The site may have custom video implementation
3. Try refreshing after the video fully loads

### Translation not working

1. Verify backend is running
2. Check browser console for CORS errors
3. Ensure the site isn't blocking the extension

### Subtitles misaligned

1. Drag subtitles to reposition
2. Check if the video container has unusual styling
3. Try different subtitle sizes

---

## Limitations

1. **DRM Content** - Videos with DRM protection cannot be transcribed
2. **Shadow DOM** - Some modern frameworks use shadow DOM which limits detection
3. **iframes** - Cross-origin iframes may block extension access
4. **Canvas-based players** - Non-standard video implementations may not work

---

## Sites Known to Work

- Vimeo
- Dailymotion
- Educational platforms (Coursera, Udemy, etc.)
- News sites (CNN, BBC, etc.)
- Self-hosted video (video.js, plyr, etc.)

---

## Next Steps

- [Troubleshooting](../troubleshooting.md) - More solutions
- [Backend Overview](../backend/overview.md) - Backend configuration
