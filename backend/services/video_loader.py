import logging
import os
import re
import hashlib
import yt_dlp
from typing import Optional, Dict, Any
from backend.config import CACHE_DIR, COOKIES_FILE

logger = logging.getLogger('video-translate')

# Logging prefix for consistent log messages
LOG_PREFIX = "[VIDEO_LOADER]"

# Minimum file size in bytes to consider a cached audio file valid
# Files smaller than this are likely corrupted/incomplete downloads
MIN_VALID_AUDIO_SIZE_BYTES = 1000

# Reserved filenames on Windows (for cross-platform safety)
RESERVED_NAMES = {'CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4',
                  'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2',
                  'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'}

def sanitize_id(raw_id: str) -> str:
    """
    Sanitize a video ID or create a hash if it contains unsafe characters.
    """
    if not raw_id:
        raise ValueError("Video ID cannot be empty")
        
    # Check if safe
    if re.match(r'^[a-zA-Z0-9_-]+$', raw_id) and 1 <= len(raw_id) <= 64 and raw_id.upper() not in RESERVED_NAMES:
        return raw_id
        
    # Otherwise hash it
    return hashlib.md5(raw_id.encode('utf-8')).hexdigest()

def is_supported_site(url: str) -> bool:
    """
    Check if the URL is supported by a specific yt-dlp extractor (not generic).
    """
    try:
        extractors = yt_dlp.extractor.gen_extractors()
        for extractor in extractors:
            if extractor.IE_NAME != 'generic' and extractor.suitable(url):
                return True
    except Exception as e:
        logger.warning(f"Error checking supported site: {e}")
    return False

def get_video_info(url: str) -> Dict[str, Any]:
    """
    Get video metadata using yt-dlp.
    """
    ydl_opts = {
        'skip_download': True,
        'quiet': True,
        'no_warnings': True,
        'ignore_no_formats_error': True,
    }
    
    # Add cookie file if available
    if COOKIES_FILE and os.path.exists(COOKIES_FILE):
        ydl_opts['cookiefile'] = COOKIES_FILE

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return info
    except Exception as e:
        logger.error(f"Failed to extract info for {url}: {e}")
        return {}

def download_audio(url: str, custom_id: Optional[str] = None) -> Optional[str]:
    """
    Download audio from any URL supported by yt-dlp.
    
    Args:
        url: The video URL or stream URL
        custom_id: Optional ID to force a specific cache filename (e.g. hash of URL)
                   If not provided, yt-dlp's ID will be used if available, else has of URL.
    
    Returns:
        Path to the downloaded audio file, or None on failure.
    """
    try:
        # Determine ID to use for filename
        vid_id = custom_id
        
        if not vid_id:
            # Try to get info first to get a stable ID
            info = get_video_info(url)
            if info and info.get('id'):
                vid_id = sanitize_id(info['id'])
            else:
                # Fallback to hash of URL
                vid_id = hashlib.md5(url.encode('utf-8')).hexdigest()
        
        # Check cache
        audio_cache_dir = os.path.join(CACHE_DIR, "audio")
        os.makedirs(audio_cache_dir, exist_ok=True)
        
        # Check if audio already exists
        possible_exts = ['m4a', 'mp3', 'wav', 'webm', 'opus', 'ogg', 'aac']
        for ext in possible_exts:
            p = os.path.join(audio_cache_dir, f"{vid_id}.{ext}")
            if os.path.exists(p) and os.path.getsize(p) > MIN_VALID_AUDIO_SIZE_BYTES:
                logger.info(f"{LOG_PREFIX} Using cached audio: {p}")
                return p

        # Download
        logger.info(f"{LOG_PREFIX} Downloading audio for {url} (ID: {vid_id})...")
        
        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': os.path.join(audio_cache_dir, f"{vid_id}.%(ext)s"),
            'quiet': False,
            'no_warnings': False,
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'm4a',
                'preferredquality': '192',
            }],
            'socket_timeout': 30,
            'retries': 3,
            'fragment_retries': 3,
        }

        if COOKIES_FILE and os.path.exists(COOKIES_FILE):
            ydl_opts['cookiefile'] = COOKIES_FILE
            
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            if info:
                # Finding the downloaded file
                # yt-dlp might change extension
                downloads = info.get('requested_downloads', [])
                if downloads and downloads[0].get('filepath'):
                    filepath = downloads[0]['filepath']
                    if os.path.exists(filepath):
                         return filepath
                
                # Fallback scan
                for f in os.listdir(audio_cache_dir):
                    if f.startswith(vid_id):
                        return os.path.join(audio_cache_dir, f)
                        
        return None

    except Exception as e:
        logger.error(f"{LOG_PREFIX} Download failed: {e}")
        return None
