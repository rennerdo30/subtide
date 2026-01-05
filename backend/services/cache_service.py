import os
import time
import shutil
import logging
import threading
from pathlib import Path
from backend.config import (
    CACHE_DIR,
    CACHE_MAX_SIZE_MB,
    CACHE_AUDIO_TTL_HOURS,
    CACHE_CLEANUP_INTERVAL_MINUTES
)

logger = logging.getLogger(__name__)

def get_dir_size_mb(path):
    """Calculate directory size in MB."""
    total_size = 0
    for dirpath, _, filenames in os.walk(path):
        for f in filenames:
            fp = os.path.join(dirpath, f)
            if not os.path.islink(fp):
                total_size += os.path.getsize(fp)
    return total_size / (1024 * 1024)

def cleanup_cache():
    """Enforce cache limits: size and TTL."""
    try:
        if not os.path.exists(CACHE_DIR):
            return

        # 1. TTL Cleanup (Time-based)
        now = time.time()
        ttl_seconds = CACHE_AUDIO_TTL_HOURS * 3600
        
        # Walk and delete expired files
        files = []
        for p in Path(CACHE_DIR).rglob('*'):
            if p.is_file():
                mtime = p.stat().st_mtime
                if now - mtime > ttl_seconds:
                    try:
                        p.unlink()
                        logger.info(f"Deleted expired cache file: {p.name}")
                    except Exception as e:
                        logger.warning(f"Failed to delete {p}: {e}")
                else:
                    files.append((p, mtime))

        # 2. Size Limit Cleanup (LRU-ish)
        current_size_mb = get_dir_size_mb(CACHE_DIR)
        if current_size_mb > CACHE_MAX_SIZE_MB:
            logger.info(f"Cache size ({current_size_mb:.2f}MB) exceeds limit ({CACHE_MAX_SIZE_MB}MB). Cleaning up...")
            
            # Sort by modification time (oldest first)
            files.sort(key=lambda x: x[1])
            
            for p, mtime in files:
                try:
                    size_mb = p.stat().st_size / (1024 * 1024)
                    p.unlink()
                    current_size_mb -= size_mb
                    logger.info(f"Deleted to free space: {p.name}")
                    
                    if current_size_mb <= CACHE_MAX_SIZE_MB:
                        break
                except Exception as e:
                    logger.warning(f"Failed to delete {p}: {e}")

    except Exception as e:
        logger.error(f"Error during cache cleanup: {e}")

def start_cache_scheduler():
    """Start background thread for periodic cache cleanup."""
    def run_scheduler():
        # Sleep first to avoid blocking startup with unnecessary cleanup
        time.sleep(CACHE_CLEANUP_INTERVAL_MINUTES * 60)
        while True:
            logger.info("Running scheduled cache cleanup...")
            cleanup_cache()
            time.sleep(CACHE_CLEANUP_INTERVAL_MINUTES * 60)

    thread = threading.Thread(target=run_scheduler, daemon=True)
    thread.start()
    logger.info(f"Cache cleanup scheduler started (Interval: {CACHE_CLEANUP_INTERVAL_MINUTES}min)")

