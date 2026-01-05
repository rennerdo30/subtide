"""
RunPod Serverless Handler
Handles video translation requests in a serverless environment.

Usage:
    Deploy this as a RunPod Serverless endpoint.
    Send requests with: {"input": {"video_id": "...", "target_lang": "...", ...}}
"""

import os
import sys
import time
import logging
import traceback
import queue
import threading
from typing import Dict, Any, Optional

# Add app directory to path for imports
sys.path.insert(0, '/app')

from backend.utils.logging_utils import setup_logging, LogContext, generate_request_id, log_with_context

# Configure logging using shared utility
# We want JSON format if possible for RunPod to parse it nicely, 
# or just standard text if RunPod prefers that.
# Defaulting to INFO level.
logger = setup_logging(level=os.getenv('LOG_LEVEL', 'INFO'), json_format=True)

# Set platform to runpod
os.environ['PLATFORM'] = 'runpod'

# ============================================================================
# Module-level imports (loaded once at startup, not per-request)
# ============================================================================
# These imports are deferred until after path setup but happen only once
# This reduces per-request latency by 50-200ms

# Cached references to backend services
_whisper_backend = None
_diarization_backend = None

def _get_cached_whisper():
    """Get cached whisper backend (singleton pattern)."""
    global _whisper_backend
    if _whisper_backend is None:
        from backend.services.whisper_backend_base import get_whisper_backend
        _whisper_backend = get_whisper_backend()
    return _whisper_backend

def _get_cached_diarization():
    """Get cached diarization backend (singleton pattern)."""
    global _diarization_backend
    if _diarization_backend is None:
        from backend.services.diarization import get_diarization_backend
        _diarization_backend = get_diarization_backend()
    return _diarization_backend

# Pre-import commonly used modules (happens once at module load)
from backend.services.youtube_service import ensure_audio_downloaded
from backend.services.translation_service import await_translate_subtitles


def initialize_models():
    """
    Pre-load models to reduce cold start time.
    Called once when the worker starts.
    Uses cached backend getters to ensure singleton pattern.
    """
    logger.info("Initializing models...")
    start_time = time.time()

    try:
        # Load Whisper backend (uses cached singleton)
        whisper = _get_cached_whisper()
        logger.info(f"Whisper backend: {whisper.get_backend_name()} on {whisper.get_device()}")

        # Load diarization backend (uses cached singleton)
        if os.getenv('ENABLE_DIARIZATION', 'true').lower() == 'true':
            diarization = _get_cached_diarization()
            logger.info(f"Diarization backend: {diarization.get_backend_name()} on {diarization.get_device()}")

        elapsed = time.time() - start_time
        logger.info(f"Models initialized in {elapsed:.2f}s")

    except Exception as e:
        logger.exception(f"Model initialization failed: {e}")


def download_audio(video_id: str) -> str:
    """
    Download audio from YouTube video.

    Returns:
        Path to downloaded audio file
    """
    # Uses module-level import (no per-call import overhead)
    logger.info(f"Downloading audio for video: {video_id}")
    url = f"https://www.youtube.com/watch?v={video_id}"
    try:
        audio_path = ensure_audio_downloaded(video_id, url)
        
        if not audio_path:
            raise RuntimeError(f"Failed to download audio for {video_id}")
        
        logger.info(f"Audio downloaded: {audio_path}")
        return audio_path
    except Exception as e:
        logger.error(f"Error downloading audio: {e}")
        raise


def cleanup():
    """Clean up GPU memory after processing."""
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            logger.info("GPU memory cleared")
    except Exception:
        pass


def handler(event: Dict[str, Any]) -> Any:
    """
    RunPod serverless handler (Generator).
    """
    # 1. Setup Request Context
    request_id = generate_request_id()
    LogContext.clear()
    LogContext.set(request_id=request_id)
    
    start_time = time.time()
    
    # RunPod input validation
    input_data = event.get('input', {})
    video_id = input_data.get('video_id')
    target_lang = input_data.get('target_lang', 'en')
    
    if not video_id:
        logger.error("Missing video_id in request")
        yield {"error": "video_id is required"}
        return

    # Update context with video_id
    LogContext.set(video_id=video_id)
    
    logger.info(f"Processing video: {video_id} -> {target_lang}")

    try:
        # 1. Download Audio
        yield {"stage": "checking", "message": "Starting process...", "percent": 0}
        
        t0 = time.time()
        audio_path = download_audio(video_id)
        download_time = time.time() - t0
        
        yield {"stage": "downloading", "message": "Audio downloaded", "percent": 20}

        # 2. Transcription & Translation (Streamed)
        # We need a custom implementation here that mirrors process_service.py 
        # but yields directly instead of using a queue.
        
        whisper = _get_cached_whisper()
        
        # Buffer for batch translation
        segment_buffer = []
        BATCH_SIZE = 5
        batch_count = 0
        
        # Generator approach:
        output_queue = queue.Queue()
        
        # Capture context for the producer thread
        thread_context = LogContext.get_all()

        def producer():
            # Set context for this thread
            LogContext.set(**thread_context)
            
            try:
                def on_segment_wrapper(seg):
                    # seg is TranscriptionSegment (faster-whisper) or dict
                    
                    # Extract attributes safely
                    s_start = seg.start if hasattr(seg, 'start') else seg.get('start')
                    s_end = seg.end if hasattr(seg, 'end') else seg.get('end')
                    s_text = seg.text if hasattr(seg, 'text') else seg.get('text')
                    
                    if s_text:
                        s_text = s_text.strip()
                    
                    sub = {
                        'start': int(s_start * 1000),
                        'end': int(s_end * 1000),
                        'text': s_text,
                    }
                    segment_buffer.append(sub)
                    
                    if len(segment_buffer) >= BATCH_SIZE:
                        # Translate
                        translated = await_translate_subtitles(
                            list(segment_buffer), 
                            target_lang
                        )
                        output_queue.put({
                            "type": "data",
                            "payload": {
                                "stage": "subtitles",
                                "subtitles": translated
                            }
                        })
                        segment_buffer.clear()

                # Run Whisper directly (faster-whisper supports streaming via callback)
                logger.info(f"Starting transcription with {os.getenv('WHISPER_MODEL', 'base')} model")
                whisper.transcribe(
                    audio_path,
                    model_size=os.getenv('WHISPER_MODEL', 'base'),
                    segment_callback=on_segment_wrapper,
                    initial_prompt=None,
                    progress_callback=None 
                )
                
                # Flush remaining
                if segment_buffer:
                    translated = await_translate_subtitles(segment_buffer, target_lang)
                    output_queue.put({
                        "type": "data",
                        "payload": {
                            "stage": "subtitles",
                            "subtitles": translated
                        }
                    })
                
                logger.info("Transcription producer finished successfully")
                output_queue.put({"type": "done"})
                
            except Exception as e:
                logger.exception(f"Producer thread error: {e}")
                output_queue.put({"type": "error", "error": str(e)})

        # Start producer thread
        t = threading.Thread(target=producer, daemon=True)
        t.start()
        
        # Consume queue and yield
        while True:
            try:
                item = output_queue.get(timeout=1200) # Long timeout for Whisper
                if item["type"] == "done":
                    break
                elif item["type"] == "error":
                    yield {"error": item["error"]}
                    break
                elif item["type"] == "data":
                    yield item["payload"]
            except queue.Empty:
                logger.error("Timeout waiting for transcription segments")
                break

        yield {"stage": "complete", "message": "Processing finished", "percent": 100}
        
        process_duration = time.time() - start_time
        logger.info(f"Request completed in {process_duration:.2f}s")

    except Exception as e:
        logger.exception(f"Handler failed: {e}")
        yield {"error": str(e)}
    finally:
        cleanup()
        LogContext.clear()


# RunPod entry point
if __name__ == "__main__":
    try:
        import runpod

        # Initialize models on startup
        initialize_models()

        # Start the serverless handler
        # "return_aggregate_stream": False ensures streaming works
        logger.info("Starting RunPod serverless handler...")
        runpod.serverless.start({"handler": handler, "return_aggregate_stream": False})

    except ImportError:
        # For local testing without RunPod SDK
        logger.warning("RunPod SDK not available, running in test mode")

        # Test with a sample request
        test_event = {
            "input": {
                "video_id": "dQw4w9WgXcQ",
                "target_lang": "ja",
            }
        }

        # Iterate over generator
        for chunk in handler(test_event):
            print("Chunk:", chunk)
