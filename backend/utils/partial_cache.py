"""
Partial Translation Cache

Stores partially completed translations to enable batch resume on failure.
"""

import os
import json
import logging
import hashlib
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List

logger = logging.getLogger('video-translate')

CACHE_DIR = os.getenv('CACHE_DIR', os.path.join(os.path.dirname(__file__), '..', 'cache'))
PARTIAL_CACHE_DIR = os.path.join(CACHE_DIR, 'partial_translations')
CACHE_TTL_HOURS = 24  # Expire partial caches after 24 hours


def _get_cache_key(video_id: str, target_lang: str) -> str:
    """Generate cache key for a translation job."""
    return f"{video_id}_{target_lang}"


def _get_cache_path(video_id: str, target_lang: str) -> str:
    """Get file path for partial cache."""
    key = _get_cache_key(video_id, target_lang)
    return os.path.join(PARTIAL_CACHE_DIR, f"{key}.json")


def save_partial_progress(
    video_id: str,
    target_lang: str,
    completed_batches: Dict[int, List[Dict[str, Any]]],
    total_batches: int,
    source_hash: str
) -> bool:
    """
    Save partial translation progress.
    
    Args:
        video_id: YouTube video ID
        target_lang: Target language code
        completed_batches: Dict mapping batch_index -> translated subtitles
        total_batches: Total number of batches
        source_hash: Hash of source subtitles to detect changes
    
    Returns:
        True if saved successfully
    """
    try:
        os.makedirs(PARTIAL_CACHE_DIR, exist_ok=True)
        
        cache_data = {
            'video_id': video_id,
            'target_lang': target_lang,
            'completed_batches': completed_batches,
            'total_batches': total_batches,
            'source_hash': source_hash,
            'timestamp': datetime.now().isoformat()
        }
        
        cache_path = _get_cache_path(video_id, target_lang)
        with open(cache_path, 'w', encoding='utf-8') as f:
            json.dump(cache_data, f, ensure_ascii=False)
        
        logger.debug(f"[PARTIAL_CACHE] Saved {len(completed_batches)}/{total_batches} batches for {video_id}")
        return True
    except Exception as e:
        logger.error(f"[PARTIAL_CACHE] Failed to save: {e}")
        return False


def load_partial_progress(
    video_id: str,
    target_lang: str,
    source_hash: str
) -> Optional[Dict[int, List[Dict[str, Any]]]]:
    """
    Load partial translation progress if available and valid.
    
    Args:
        video_id: YouTube video ID
        target_lang: Target language code
        source_hash: Hash of current source subtitles
    
    Returns:
        Dict of completed batches or None if no valid cache
    """
    cache_path = _get_cache_path(video_id, target_lang)
    
    if not os.path.exists(cache_path):
        return None
    
    try:
        with open(cache_path, 'r', encoding='utf-8') as f:
            cache_data = json.load(f)
        
        # Check if source subtitles have changed
        if cache_data.get('source_hash') != source_hash:
            logger.info(f"[PARTIAL_CACHE] Source changed for {video_id}, discarding cache")
            os.remove(cache_path)
            return None
        
        # Check TTL
        timestamp = datetime.fromisoformat(cache_data.get('timestamp', '2000-01-01'))
        if datetime.now() - timestamp > timedelta(hours=CACHE_TTL_HOURS):
            logger.info(f"[PARTIAL_CACHE] Cache expired for {video_id}")
            os.remove(cache_path)
            return None
        
        # Convert string keys back to int
        completed = {}
        for k, v in cache_data.get('completed_batches', {}).items():
            completed[int(k)] = v
        
        logger.info(f"[PARTIAL_CACHE] Loaded {len(completed)} batches for {video_id}")
        return completed
        
    except Exception as e:
        logger.error(f"[PARTIAL_CACHE] Failed to load: {e}")
        return None


def clear_partial_progress(video_id: str, target_lang: str) -> bool:
    """Clear partial cache on successful completion."""
    cache_path = _get_cache_path(video_id, target_lang)
    try:
        if os.path.exists(cache_path):
            os.remove(cache_path)
            logger.debug(f"[PARTIAL_CACHE] Cleared cache for {video_id}")
        return True
    except Exception as e:
        logger.error(f"[PARTIAL_CACHE] Failed to clear: {e}")
        return False


def compute_source_hash(subtitles: List[Dict[str, Any]]) -> str:
    """Compute hash of source subtitles to detect changes."""
    content = json.dumps([s.get('text', '') for s in subtitles], sort_keys=True)
    return hashlib.md5(content.encode()).hexdigest()[:16]
