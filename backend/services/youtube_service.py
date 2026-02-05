import logging
import random
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

logger = logging.getLogger('subtide')

# YouTube video ID validation (typically 11 chars, but relaxed for tests/variants)
VIDEO_ID_PATTERN = re.compile(r'^[a-zA-Z0-9_-]{1,64}$')

# Reserved filenames on Windows (for cross-platform safety)
RESERVED_NAMES = {'CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4',
                  'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2',
                  'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'}


def validate_video_id(video_id: str) -> bool:
    """
    Validate YouTube video ID format.

    Standard YouTube video IDs are 11 characters using base64url alphabet.
    This function allows slightly longer IDs for flexibility with test data
    and other video platforms, but enforces safe characters only.

    Args:
        video_id: The video ID to validate

    Returns:
        True if valid, False otherwise
    """
    if not video_id or not isinstance(video_id, str):
        return False

    # Check against the pattern (alphanumeric, hyphen, underscore, 1-64 chars)
    if not VIDEO_ID_PATTERN.match(video_id):
        logger.warning(f"Invalid video ID format: {video_id[:20]}...")
        return False

    # Check for reserved Windows filenames
    if video_id.upper() in RESERVED_NAMES:
        logger.warning(f"Video ID matches reserved filename: {video_id}")
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

    # Validate length (allow up to 128 chars for hashes/urls)
    if not (1 <= len(safe_vid_id) <= 128):
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
    if not validate_video_id(video_id):
        return {'error': 'Invalid video ID'}, 400

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
        'format': None,
        'ignore_no_formats_error': True,
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
            used_fallback = False
            fallback_lang = None

            if not tracks:
                # Try English fallback
                tracks = find_track('en')
                if tracks:
                    used_fallback = True
                    fallback_lang = 'en'
                    logger.warning(f"Requested language '{lang}' not available, falling back to English")
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
                    wait_time = (attempt + 1) * 2 + random.uniform(0, 1)
                    time.sleep(wait_time)
                else:
                    return {'error': f'YouTube returned status {res.status_code}', 'retry': True}, 502
            
            if res.status_code != 200:
                return {'error': 'Rate limited by YouTube', 'retry': True}, 429

            # Parse/Cache if JSON
            if selected.get('ext') == 'json3':
                try:
                    json_data = res.json()
                    # Add fallback metadata if applicable
                    if used_fallback:
                        json_data['_metadata'] = {
                            'requested_language': lang,
                            'actual_language': fallback_lang,
                            'used_fallback': True,
                            'warning': f'Requested language "{lang}" was not available, using "{fallback_lang}" instead'
                        }
                    with open(cache_path, 'w', encoding='utf-8') as f:
                        json.dump(json_data, f, indent=2)
                    return json_data, 200
                except Exception as e:
                    logger.warning(f"JSON parse error: {e}")
                    pass

            # Return raw content with metadata if fallback was used
            if used_fallback:
                return {
                    'content': res.content.decode('utf-8', errors='replace'),
                    '_metadata': {
                        'requested_language': lang,
                        'actual_language': fallback_lang,
                        'used_fallback': True,
                        'warning': f'Requested language "{lang}" was not available, using "{fallback_lang}" instead'
                    }
                }, 200

            return Response(res.content, mimetype='text/plain'), 200

    except Exception as e:
        logger.exception("Subtitle fetch error")
        return {'error': 'Failed to fetch subtitles. Please try again.'}, 500


def get_video_title(video_id: str) -> Optional[str]:
    """
    Fetch video title for Whisper initial prompt injection.
    Returns video title or None on failure.
    """
    # Check cache first
    cache_path = get_cache_path(video_id, 'title')
    if os.path.exists(cache_path):
        try:
            with open(cache_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return data.get('title')
        except Exception:
            pass

    url = f"https://www.youtube.com/watch?v={video_id}"
    ydl_opts = {
        'skip_download': True,
        'quiet': True,
        'no_warnings': True,
        'format': None,
        'ignore_no_formats_error': True,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            title = info.get('title', '')
            
            # Cache it
            if title:
                with open(cache_path, 'w', encoding='utf-8') as f:
                    json.dump({'title': title}, f)
                logger.info(f"[YOUTUBE] Got video title: {title[:50]}...")
            
            return title
    except Exception as e:
        logger.warning(f"[YOUTUBE] Could not get title: {e}")
        return None

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
        
        # Retry logic for rate limits
        max_retries = 3
        for attempt in range(max_retries):
            res = requests.get(selected.get('url'), headers=headers, timeout=30)
            
            if res.status_code == 200:
                break
            elif res.status_code == 429:
                wait_time = (attempt + 1) * 2 + random.uniform(0, 1)
                logger.warning(f"[PROCESS] Rate limited (429), waiting {wait_time:.1f}s before retry {attempt+1}/{max_retries}")
                time.sleep(wait_time)
            else:
                logger.error(f"[PROCESS] Subtitle download failed: {res.status_code}")
                return []
        else:
            logger.error(f"[PROCESS] Subtitle download failed after {max_retries} retries (429)")
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
            start_ms = event.get('tStartMs', 0)
            duration_ms = event.get('dDurationMs', 0)
            # Use actual duration if available, otherwise estimate from text length
            # Average speech is ~150ms per character, with min 1.5s and max 5s
            if not duration_ms:
                duration_ms = max(1500, min(5000, len(text) * 150))
            subtitles.append({
                'start': start_ms,
                'end': start_ms + duration_ms,
                'text': text
            })

    return subtitles

def ensure_audio_downloaded(video_id: str, url: str) -> Optional[str]:
    """
    Download audio to persistent cache if not exists.
    Now delegates to generic video_loader.
    """
    from backend.services.video_loader import download_audio as generic_download_audio
    
    # If URL is not provided, construct it from video_id (legacy YouTube support)
    if not url:
        url = f"https://www.youtube.com/watch?v={video_id}"
        
    return generic_download_audio(url, custom_id=video_id)

