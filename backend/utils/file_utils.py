import os
import re

# Safe pattern for video IDs used in filesystem paths
_SAFE_ID_PATTERN = re.compile(r'^[a-zA-Z0-9_-]{1,128}$')

def get_cache_path(video_id: str, suffix: str = 'subtitles', cache_dir: str = None) -> str:
    """
    Generate cache file path for a video.

    Args:
        video_id: YouTube Video ID
        suffix: File suffix (subtitles, audio, whisper)
        cache_dir: Directory to store cache (defaults to config.CACHE_DIR if None)

    Raises:
        ValueError: If video_id contains unsafe characters (path traversal prevention)
    """
    if cache_dir is None:
        from backend.config import CACHE_DIR
        cache_dir = CACHE_DIR

    # Sanitize video_id to prevent path traversal
    if not video_id or not _SAFE_ID_PATTERN.match(video_id):
        raise ValueError(f"Invalid video_id for cache path: {str(video_id)[:20]}")

    path = os.path.join(cache_dir, f"{video_id}_{suffix}.json")
    # Double-check the result stays within cache_dir
    if not os.path.normpath(path).startswith(os.path.normpath(cache_dir)):
        raise ValueError("Path traversal detected in cache path")
    return path

def validate_audio_file(audio_path: str) -> tuple[bool, str]:
    """
    Check if audio file exists and is not empty.
    Returns: (is_valid, error_message)
    """
    if not os.path.exists(audio_path):
        return False, "File does not exist"
    if os.path.getsize(audio_path) == 0:
        return False, "File is empty"
    return True, ""
