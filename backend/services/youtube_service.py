import logging
import time
import json
import os
import re
import requests
import yt_dlp
from typing import Optional, Dict, Any, Tuple, List
from flask import Response, jsonify

from backend.utils.file_utils import get_cache_path
from backend.services.translation_service import parse_vtt_to_json3
from backend.config import CACHE_DIR, COOKIES_FILE

logger = logging.getLogger('video-translate')

# YouTube video ID validation (typically 11 chars, but relaxed for tests/variants)
VIDEO_ID_PATTERN = re.compile(r'^[a-zA-Z0-9_-]{1,64}$')

# Reserved filenames on Windows (for cross-platform safety)
RESERVED_NAMES = {'CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4',
                  'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2',
                  'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'}


def validate_video_id(video_id: str) -> bool:
    """
    Validate YouTube video ID format.

    Args:
        video_id: The video ID to validate

    Returns:
        True if valid, False otherwise
    """
    if not video_id or not isinstance(video_id, str):
        return False
    if not VIDEO_ID_PATTERN.match(video_id):
        return False
    # Check for reserved names (case-insensitive)
    if video_id.upper() in RESERVED_NAMES:
        return False
    return True


def sanitize_video_id(video_id: str) -> str:
    """
    Sanitize video ID for safe filesystem use.

    Args:
        video_id: The video ID to sanitize

    Returns:
        Sanitized video ID safe for filenames

    Raises:
        ValueError: If video ID is invalid or cannot be sanitized
    """
    if not video_id:
        raise ValueError("Video ID cannot be empty")

    # Remove any characters that aren't alphanumeric, hyphen, or underscore
    safe_vid_id = "".join([c for c in video_id if c.isalnum() or c in ('-', '_')])

    # Validate length (YouTube IDs are typically 11 chars, but we allow 1-64 for test mocks)
    if not (1 <= len(safe_vid_id) <= 64):
        raise ValueError(f"Invalid video ID length: {len(safe_vid_id)}")

    # Check for reserved names
    if safe_vid_id.upper() in RESERVED_NAMES:
        raise ValueError(f"Video ID matches reserved filename: {safe_vid_id}")

    return safe_vid_id

def fetch_subtitles(video_id: str, lang: str = 'en') -> Tuple[Any, int]:
    """
    Fetch YouTube subtitles using yt-dlp.
    Returns (response_data, status_code).
    """
    # Check cache first
    cache_path = get_cache_path(video_id, f'subs_{lang}')
    if os.path.exists(cache_path):
        logger.info(f"Cache hit: {video_id} ({lang})")
        try:
            with open(cache_path, 'r', encoding='utf-8') as f:
                return json.load(f), 200
        except Exception as e:
            logger.warning(f"Cache read error: {e}")

    logger.info(f"Fetching subtitles: {video_id} (lang={lang})")
    url = f"https://www.youtube.com/watch?v={video_id}"

    ydl_opts = {
        'skip_download': True,
        'writesubtitles': True,
        'writeautomaticsub': True,
        'quiet': True,
        'no_warnings': True,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            subs = info.get('subtitles') or {}
            auto_subs = info.get('automatic_captions') or {}

            # Find best matching track
            def find_track(language_code):
                for source in [subs, auto_subs]:
                    if language_code in source:
                        return source[language_code]
                    for key in source:
                        if key.startswith(language_code):
                            return source[key]
                return None

            tracks = find_track(lang)
            if not tracks:
                # Try English fallback
                tracks = find_track('en')
                if tracks:
                    logger.info("Falling back to English subtitles")
                else:
                    return {
                        'error': f'No subtitles for language: {lang}',
                        'available_manual': list(subs.keys())[:10],
                        'available_auto': list(auto_subs.keys())[:10]
                    }, 404

            # Prefer json3
            selected = None
            for fmt in ['json3', 'vtt', 'srv1', 'ttml']:
                for track in tracks:
                    if track.get('ext') == fmt:
                        selected = track
                        break
                if selected: break
            
            if not selected:
                selected = tracks[0]

            # Fetch content
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
            
            res = None
            for attempt in range(3):
                res = requests.get(selected.get('url'), headers=headers, timeout=30)
                if res.status_code == 200:
                    break
                elif res.status_code == 429:
                    time.sleep((attempt + 1) * 2)
                else:
                    return {'error': f'YouTube returned status {res.status_code}', 'retry': True}, 502
            
            if res.status_code != 200:
                return {'error': 'Rate limited by YouTube', 'retry': True}, 429

            # Parse/Cache if JSON
            if selected.get('ext') == 'json3':
                try:
                    json_data = res.json()
                    with open(cache_path, 'w', encoding='utf-8') as f:
                        json.dump(json_data, f, indent=2)
                    return json_data, 200
                except Exception as e:
                    logger.warning(f"JSON parse error: {e}")
                    pass

            return Response(res.content, mimetype='text/plain'), 200

    except Exception as e:
        logger.exception("Subtitle fetch error")
        return {'error': str(e)}, 500

def await_download_subtitles(video_id: str, lang: str, tracks: List[Dict]) -> List[Dict]:
    """Download and parse subtitles from YouTube."""
    cache_path = get_cache_path(video_id, f'subs_{lang}')

    if os.path.exists(cache_path):
        logger.info(f"[PROCESS] Using cached {lang} subtitles")
        with open(cache_path, 'r', encoding='utf-8') as f:
            yt_subs = json.load(f)
    else:
        # Get json3 format URL
        selected = None
        for track in tracks:
            if track.get('ext') == 'json3':
                selected = track
                break
        if not selected:
            selected = tracks[0]

        logger.info(f"[PROCESS] Downloading {lang} subtitles ({selected.get('ext')})...")

        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        res = requests.get(selected.get('url'), headers=headers, timeout=30)

        if res.status_code != 200:
            logger.error(f"[PROCESS] Subtitle download failed: {res.status_code}")
            return []

        if selected.get('ext') == 'json3':
            yt_subs = res.json()
        else:
            # Parse VTT
            yt_subs = parse_vtt_to_json3(res.text)

        # Cache
        with open(cache_path, 'w', encoding='utf-8') as f:
            json.dump(yt_subs, f, indent=2)

    # Convert to subtitle format
    subtitles = []
    for event in yt_subs.get('events', []):
        if not event.get('segs'):
            continue
        text = ''.join(s.get('utf8', '') for s in event['segs']).strip()
        if text:
            subtitles.append({
                'start': event.get('tStartMs', 0),
                'end': event.get('tStartMs', 0) + event.get('dDurationMs', 3000),
                'text': text
            })

    return subtitles

def ensure_audio_downloaded(video_id: str, url: str) -> Optional[str]:
    """Download audio to persistent cache if not exists."""
    audio_cache_dir = os.path.join(CACHE_DIR, "audio")
    os.makedirs(audio_cache_dir, exist_ok=True)

    # Validate and sanitize the video ID for safe filesystem use
    try:
        safe_vid_id = sanitize_video_id(video_id)
    except ValueError as e:
        logger.error(f"[AUDIO CACHE] Invalid video ID: {e}")
        return None

    # Check if audio already exists (any audio format)
    possible_exts = ['m4a', 'mp3', 'wav', 'webm', 'opus', 'ogg', 'aac']

    for ext in possible_exts:
        p = os.path.join(audio_cache_dir, f"{safe_vid_id}.{ext}")
        if os.path.exists(p) and os.path.getsize(p) > 1000:
            logger.info(f"[AUDIO CACHE] Using cached audio: {p}")
            return p

    # Also check for files starting with video_id
    for f in os.listdir(audio_cache_dir):
        if f.startswith(safe_vid_id) and any(f.endswith(ext) for ext in possible_exts):
            p = os.path.join(audio_cache_dir, f)
            if os.path.getsize(p) > 1000:
                logger.info(f"[AUDIO CACHE] Found cached audio (variant): {p}")
                return p

    # Download audio to cache
    logger.info(f"[AUDIO CACHE] Downloading audio for {video_id}...")

    ydl_opts = {
        'format': 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best',
        'outtmpl': os.path.join(audio_cache_dir, f"{safe_vid_id}.%(ext)s"),
        'quiet': False,
        'no_warnings': False,
        'extract_audio': True,
    }

    if COOKIES_FILE and os.path.exists(COOKIES_FILE):
        ydl_opts['cookiefile'] = COOKIES_FILE
        logger.info(f"[AUDIO CACHE] Using cookies file: {COOKIES_FILE}")

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)

            if info:
                downloads = info.get('requested_downloads', [])
                if downloads and downloads[0].get('filepath'):
                    downloaded_file = downloads[0]['filepath']
                    if os.path.exists(downloaded_file):
                        logger.info(f"[AUDIO CACHE] Downloaded: {downloaded_file}")
                        return downloaded_file

        # Fallback: scan the directory
        logger.info("[AUDIO CACHE] Scanning directory for downloaded file...")
        for f in os.listdir(audio_cache_dir):
            if f.startswith(safe_vid_id):
                p = os.path.join(audio_cache_dir, f)
                if os.path.getsize(p) > 1000:
                    logger.info(f"[AUDIO CACHE] Found downloaded file: {p}")
                    return p

        return None

    except Exception as e:
        logger.error(f"[AUDIO CACHE] Download failed: {e}")
        return None
