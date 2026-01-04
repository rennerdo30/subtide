import os
import logging
from faster_whisper import WhisperModel
# Import pyannote only if needed/available to avoid hard dependency if not used
try:
    from pyannote.audio import Pipeline
except ImportError:
    Pipeline = None

from backend.config import WHISPER_MODEL, ENABLE_DIARIZATION, HF_TOKEN

logger = logging.getLogger(__name__)

def preload_models():
    """
    Pre-load models into cache at startup.
    This runs synchronously and blocks server startup, which is intended
    to ensure the first request doesn't timeout due to model downloading.
    """
    logger.info("--- Starting Model Preload ---")
    
    # 1. Preload Whisper Model
    model_size = os.environ.get("SERVER_MODEL", WHISPER_MODEL)
    logger.info(f"Pre-loading Whisper model: {model_size}")
    try:
        # Download root=None uses default ~/.cache/huggingface/hub or specific ~/.cache/whisper
        # This effectively caches the model file
        WhisperModel(model_size, device="cpu", compute_type="int8", download_root=None)
        logger.info(f"Successfully cached Whisper model: {model_size}")
    except Exception as e:
        logger.error(f"Failed to preload Whisper model: {e}")
        # We don't raise here to allow the server to try starting anyway,
        # but it will likely fail on first request.

    # 2. Preload Diarization Model (if enabled)
    if ENABLE_DIARIZATION and Pipeline:
        logger.info("Pre-loading PyAnnote Diarization model...")
        try:
            if not HF_TOKEN:
                logger.warning("ENABLE_DIARIZATION is True but HF_TOKEN is missing. Skipping preload.")
            else:
                # This triggers download to huggingface cache
                Pipeline.from_pretrained("pyannote/speaker-diarization-3.1", use_auth_token=HF_TOKEN)
                logger.info("Successfully cached PyAnnote model")
        except Exception as e:
            logger.error(f"Failed to preload Diarization model: {e}")

    logger.info("--- Model Preload Complete ---")

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    preload_models()
