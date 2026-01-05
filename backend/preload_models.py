import os
import logging
from backend.services.whisper_service import get_whisper_model, get_diarization_pipeline, get_whisper_backend

logger = logging.getLogger(__name__)

def preload_models():
    """
    Pre-load models into cache at startup.
    This runs synchronously and blocks server startup, which is intended
    to ensure the first request doesn't timeout due to model downloading.
    """
    logger.info("--- Starting Model Preload ---")
    
    # 1. Preload Whisper Model
    try:
        backend = get_whisper_backend()
        logger.info(f"Pre-loading Whisper model (Backend: {backend})...")
        
        # This will download and load the model for openai-whisper.
        # For mlx-whisper, it currently returns the model path/ID (string),
        # so actual weight downloading happens on first transcribe or via huggingface_hub.
        # We'll just call it to ensure basic init is done.
        get_whisper_model()
        
        logger.info(f"Successfully initialized Whisper model")
    except Exception as e:
        logger.error(f"Failed to preload Whisper model: {e}")
        # We don't raise here to allow the server to try starting anyway

    # 2. Preload Diarization Model (if enabled)
    try:
        logger.info("Pre-loading PyAnnote Diarization pipeline...")
        # This will download and load the pipeline if enabled and token is present
        pipeline = get_diarization_pipeline()
        if pipeline:
            logger.info("Successfully loaded PyAnnote pipeline")
        else:
            logger.info("PyAnnote pipeline skipped (disabled or missing token)")
            
    except Exception as e:
        logger.error(f"Failed to preload Diarization model: {e}")

    # 3. Preload VAD Model (if enabled)
    try:
        from backend.services.whisper_service import get_vad_model
        from backend.config import ENABLE_VAD
        if ENABLE_VAD:
            logger.info("Pre-loading Silero VAD model...")
            vad_model, _ = get_vad_model()
            if vad_model:
                logger.info("Successfully loaded Silero VAD model")
            else:
                logger.info("Silero VAD skipped (disabled or failed)")
    except Exception as e:
        logger.error(f"Failed to preload VAD model: {e}")

    logger.info("--- Model Preload Complete ---")

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    preload_models()
