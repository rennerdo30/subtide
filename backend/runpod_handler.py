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
from typing import Dict, Any, Optional

# Configure logging for RunPod visibility
# Force unbuffered output for real-time logs
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)

# Set platform to runpod
os.environ['PLATFORM'] = 'runpod'

# Add app directory to path for imports
sys.path.insert(0, '/app')


def log_info(msg: str):
    """Log info with both logger and print for RunPod visibility."""
    logger.info(msg)
    print(f"[INFO] {msg}", flush=True)


def log_error(msg: str, exc: Exception = None):
    """Log error with both logger and print for RunPod visibility."""
    logger.error(msg)
    print(f"[ERROR] {msg}", flush=True)
    if exc:
        tb = traceback.format_exc()
        logger.error(tb)
        print(f"[TRACEBACK] {tb}", flush=True)


def initialize_models():
    """
    Pre-load models to reduce cold start time.
    Called once when the worker starts.
    """
    log_info("Initializing models...")
    start_time = time.time()

    try:
        # Load Whisper backend
        from backend.services.whisper_backend_base import get_whisper_backend
        whisper = get_whisper_backend()
        log_info(f"Whisper backend: {whisper.get_backend_name()} on {whisper.get_device()}")

        # Load diarization backend
        from backend.services.diarization import get_diarization_backend
        if os.getenv('ENABLE_DIARIZATION', 'true').lower() == 'true':
            diarization = get_diarization_backend()
            log_info(f"Diarization backend: {diarization.get_backend_name()} on {diarization.get_device()}")

        elapsed = time.time() - start_time
        log_info(f"Models initialized in {elapsed:.2f}s")

    except Exception as e:
        log_error(f"Model initialization failed: {e}", e)


def download_audio(video_id: str) -> str:
    """
    Download audio from YouTube video.

    Returns:
        Path to downloaded audio file
    """
    from backend.services.youtube_service import download_audio as yt_download

    log_info(f"Downloading audio for video: {video_id}")
    audio_path = yt_download(video_id)
    log_info(f"Audio downloaded: {audio_path}")

    return audio_path


def transcribe_audio(audio_path: str, progress_callback=None) -> list:
    """
    Transcribe audio using the configured backend.

    Returns:
        List of transcription segments
    """
    from services.whisper_backend_base import get_whisper_backend

    whisper = get_whisper_backend()
    logger.info(f"Transcribing with {whisper.get_backend_name()}...")

    segments = whisper.transcribe(
        audio_path,
        model_size=os.getenv('WHISPER_MODEL', 'base'),
        progress_callback=progress_callback,
    )

    logger.info(f"Transcription complete: {len(segments)} segments")
    return segments


def add_speaker_labels(audio_path: str, segments: list, progress_callback=None) -> list:
    """
    Add speaker labels to transcription segments.

    Returns:
        Segments with speaker field added
    """
    from services.diarization import get_diarization_backend

    diarization = get_diarization_backend()
    logger.info(f"Diarizing with {diarization.get_backend_name()}...")

    speaker_segments = diarization.diarize(
        audio_path,
        progress_callback=progress_callback,
    )

    if speaker_segments:
        segments = diarization.assign_speakers_to_segments(segments, speaker_segments)
        logger.info(f"Speaker labels added: {len(set(s.get('speaker') for s in segments))} speakers")
    else:
        logger.warning("No speaker segments found")

    return segments


def translate_subtitles(segments: list, target_lang: str, progress_callback=None) -> list:
    """
    Translate transcription segments to target language.

    Returns:
        Segments with translatedText field added
    """
    from services.translation_service import await_translate_subtitles

    logger.info(f"Translating to {target_lang}...")

    translated = await_translate_subtitles(
        segments,
        target_lang,
        progress_callback=progress_callback,
    )

    logger.info(f"Translation complete: {len(translated)} segments")
    return translated


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
    start_time = time.time()
    
    # RunPod input validation
    input_data = event.get('input', {})
    video_id = input_data.get('video_id')
    target_lang = input_data.get('target_lang', 'en')
    force_whisper = input_data.get('force_whisper', False)
    enable_diarization = input_data.get('enable_diarization', True)

    if not video_id:
        yield {"error": "video_id is required"}
        return

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
        
        from services.whisper_backend_base import get_whisper_backend
        whisper = get_whisper_backend()
        
        # Buffer for batch translation
        segment_buffer = []
        BATCH_SIZE = 5
        batch_count = 0
        
        def runpod_progress_callback(stage, message, percent):
            # We can yield intermediate progress
            # Note: RunPod might buffer small yields, so don't be too chatty
            pass 

        # We'll run transcription and accumulate segments
        # Note: A true parallel streaming implementation in a single function 
        # without threads/queues is tricky if the transcriber is blocking.
        # RunPod handlers are synchronous. 
        # Ideally, we should use the same `run_whisper_streaming` subprocess approach
        # if we want true parallelism.
        
        # For simplicity and robustness in this environment, 
        # we will use the blocking transcribe but chunk the translation 
        # if the backend supports callbacks, OR use valid streaming if available.
        
        # Let's use the standard transcribe for now, but if we want streaming 
        # we'd need to use the subprocess method. 
        # Given the "Tier 4" requirement, let's use the SUBPROCESS method 
        # if available, or fall back to blocking.
        
        # However, `runpod_handler.py` runs inside the container where 
        # `whisper_service.py` is available.
        
        from services.translation_service import await_translate_subtitles
        
        yield {"stage": "whisper", "message": "Transcribing...", "percent": 30}
        
        completed_subtitles = []
        
        def on_whisper_segment(segment):
            nonlocal batch_count
            
            # Convert to subtitle format
            sub = {
                'start': int(segment['start'] * 1000),
                'end': int(segment['end'] * 1000),
                'text': segment['text'].strip(),
            }
            segment_buffer.append(sub)
            
            if len(segment_buffer) >= BATCH_SIZE:
                batch_count += 1
                batch_to_translate = segment_buffer.copy()
                segment_buffer.clear()
                
                # Translate
                translated = await_translate_subtitles(
                    batch_to_translate,
                    target_lang,
                    progress_callback=None
                )
                
                # Yield this batch immediately
                yield {
                    "stage": "subtitles",
                    "batchInfo": {"current": batch_count, "total": -1},
                    "subtitles": translated
                }
                completed_subtitles.extend(translated)

        # Run streaming whisper
        # Note: This might block until completion, but callbacks fire during execution
        # We need to make sure `yield` works from within callbacks? 
        # formatting: `yield` cannot be strictly called from nested function in Python properties.
        # We must use a queue-based approach similar to process_service.py
        # or use a generator wrapper.
        
        # Generator approach:
        import queue
        import threading
        
        output_queue = queue.Queue()
        
        def producer():
            try:
                def on_segment_wrapper(seg):
                    # We can't yield here, so put in queue
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
                            parse_segment_buffer_copy(segment_buffer), # Copy logic
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

                def parse_segment_buffer_copy(buf):
                    return list(buf)

                # Run Whisper directly (faster-whisper supports streaming via callback)
                whisper.transcribe(
                    audio_path,
                    model_size=os.getenv('WHISPER_MODEL', 'base'),
                    segment_callback=on_segment_wrapper,
                    initial_prompt=None,  # runpod handler doesn't pass this yet
                    progress_callback=None # we don't need detailed progress here
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
                
                output_queue.put({"type": "done"})
                
            except Exception as e:
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
                break

        yield {"stage": "complete", "message": "Processing finished", "percent": 100}

    except Exception as e:
        logger.error(f"Handler error: {e}")
        logger.error(traceback.format_exc())
        yield {"error": str(e)}
    finally:
        cleanup()


# RunPod entry point
if __name__ == "__main__":
    try:
        import runpod

        # Initialize models on startup
        initialize_models()

        # Start the serverless handler
        # "return_aggregate_stream": True ensures RunPod collects chunks if client doesn't support streaming
        # But for our SSE client, we want real streaming.
        log_info("Starting RunPod serverless handler...")
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

