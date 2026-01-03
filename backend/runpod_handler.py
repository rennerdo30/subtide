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

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Set platform to runpod
os.environ['PLATFORM'] = 'runpod'

# Add app directory to path
sys.path.insert(0, '/app')


def initialize_models():
    """
    Pre-load models to reduce cold start time.
    Called once when the worker starts.
    """
    logger.info("Initializing models...")
    start_time = time.time()

    try:
        # Load Whisper backend
        from services.whisper_backend_base import get_whisper_backend
        whisper = get_whisper_backend()
        logger.info(f"Whisper backend: {whisper.get_backend_name()} on {whisper.get_device()}")

        # Load diarization backend
        from services.diarization import get_diarization_backend
        if os.getenv('ENABLE_DIARIZATION', 'true').lower() == 'true':
            diarization = get_diarization_backend()
            logger.info(f"Diarization backend: {diarization.get_backend_name()} on {diarization.get_device()}")

        elapsed = time.time() - start_time
        logger.info(f"Models initialized in {elapsed:.2f}s")

    except Exception as e:
        logger.error(f"Model initialization failed: {e}")
        logger.error(traceback.format_exc())


def download_audio(video_id: str) -> str:
    """
    Download audio from YouTube video.

    Returns:
        Path to downloaded audio file
    """
    from services.youtube_service import download_audio as yt_download

    logger.info(f"Downloading audio for video: {video_id}")
    audio_path = yt_download(video_id)
    logger.info(f"Audio downloaded: {audio_path}")

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


def handler(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    RunPod serverless handler.

    Input format:
    {
        "input": {
            "video_id": "dQw4w9WgXcQ",
            "target_lang": "ja",
            "force_whisper": false,
            "enable_diarization": true
        }
    }

    Output format:
    {
        "subtitles": [
            {"start": 0, "end": 2500, "text": "Hello", "translatedText": "...", "speaker": "SPEAKER_00"},
            ...
        ],
        "stats": {
            "transcribe_time": 12.5,
            "diarize_time": 5.2,
            "translate_time": 8.3,
            "total_time": 26.0,
            "segment_count": 150
        }
    }
    """
    start_time = time.time()
    stats = {}

    try:
        # Parse input
        input_data = event.get('input', {})
        video_id = input_data.get('video_id')
        target_lang = input_data.get('target_lang', 'en')
        force_whisper = input_data.get('force_whisper', False)
        enable_diarization = input_data.get('enable_diarization', True)

        if not video_id:
            return {"error": "video_id is required"}

        logger.info(f"Processing video: {video_id} -> {target_lang}")

        # Download audio
        t0 = time.time()
        audio_path = download_audio(video_id)
        stats['download_time'] = time.time() - t0

        # Transcribe
        t0 = time.time()
        segments = transcribe_audio(audio_path)
        stats['transcribe_time'] = time.time() - t0

        # Add speaker labels (optional)
        if enable_diarization and os.getenv('ENABLE_DIARIZATION', 'true').lower() == 'true':
            t0 = time.time()
            segments = add_speaker_labels(audio_path, segments)
            stats['diarize_time'] = time.time() - t0
        else:
            stats['diarize_time'] = 0

        # Translate
        t0 = time.time()
        translated = translate_subtitles(segments, target_lang)
        stats['translate_time'] = time.time() - t0

        # Clean up
        cleanup()

        # Final stats
        stats['total_time'] = time.time() - start_time
        stats['segment_count'] = len(translated)

        logger.info(f"Processing complete in {stats['total_time']:.2f}s")

        return {
            "subtitles": translated,
            "stats": stats,
        }

    except Exception as e:
        logger.error(f"Handler error: {e}")
        logger.error(traceback.format_exc())
        cleanup()

        return {
            "error": str(e),
            "traceback": traceback.format_exc(),
        }


# RunPod entry point
if __name__ == "__main__":
    try:
        import runpod

        # Initialize models on startup
        initialize_models()

        # Start the serverless handler
        logger.info("Starting RunPod serverless handler...")
        runpod.serverless.start({"handler": handler})

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

        result = handler(test_event)
        print("Result:", result)
