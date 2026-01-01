import os

def get_cache_path(video_id: str, suffix: str = 'subtitles', cache_dir: str = None) -> str:
    """
    Generate cache file path for a video.
    
    Args:
        video_id: YouTube Video ID
        suffix: File suffix (subtitles, audio, whisper)
        cache_dir: Directory to store cache (defaults to config.CACHE_DIR if None)
    """
    if cache_dir is None:
        from backend.config import CACHE_DIR
        cache_dir = CACHE_DIR
        
    return os.path.join(cache_dir, f"{video_id}_{suffix}.json")

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
