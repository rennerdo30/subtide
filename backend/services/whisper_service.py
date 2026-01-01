import os
import sys
import logging
import platform
import functools
import warnings
import json
import subprocess
from typing import Optional, Dict, Any, List

# Suppress warnings
warnings.filterwarnings("ignore", message=".*torchaudio.*deprecated.*")
warnings.filterwarnings("ignore", message=".*TorchCodec.*")
warnings.filterwarnings("ignore", category=UserWarning, module="torchaudio")
warnings.filterwarnings("ignore", category=UserWarning, module="pyannote")
warnings.filterwarnings("ignore", category=UserWarning, module="speechbrain")

# Enable MPS fallback
os.environ["PYTORCH_ENABLE_MPS_FALLBACK"] = "1"

import torch
import torch.serialization

# Monkeypatch torch.load
def _patched_load(original_fn):
    @functools.wraps(original_fn)
    def wrapper(*args, **kwargs):
        kwargs['weights_only'] = False
        return original_fn(*args, **kwargs)
    return wrapper

torch.load = _patched_load(torch.load)
torch.serialization.load = _patched_load(torch.serialization.load)

# Set threads
torch.set_num_threads(os.cpu_count() or 8)
torch.set_num_interop_threads(os.cpu_count() or 8)

from backend.config import (
    WHISPER_MODEL_SIZE, 
    ENABLE_DIARIZATION, 
    HF_TOKEN,
    ENABLE_WHISPER
)
from backend.utils.logging_utils import log_stage

logger = logging.getLogger('video-translate')

# Whisper backend detection
WHISPER_BACKEND = None

if platform.system() == "Darwin" and platform.machine() == "arm64":
    try:
        import mlx_whisper
        WHISPER_BACKEND = "mlx-whisper"
    except ImportError:
        pass

if WHISPER_BACKEND is None:
    try:
        from faster_whisper import WhisperModel
        WHISPER_BACKEND = "faster-whisper"
    except ImportError:
        pass

if WHISPER_BACKEND is None:
    import whisper
    WHISPER_BACKEND = "openai-whisper"

# Lazy loaded models
_whisper_model = None
_diarization_pipeline = None

def get_whisper_device():
    """Detect best available device for Whisper."""
    if WHISPER_BACKEND == "mlx-whisper":
        logger.info("Using MLX with Metal GPU acceleration (Apple Silicon)")
        return "metal"
    elif WHISPER_BACKEND == "faster-whisper":
        if torch.cuda.is_available():
            logger.info("CUDA detected. Using NVIDIA GPU acceleration.")
            return "cuda"
        else:
            logger.info("Using CPU with CTranslate2 optimizations")
            return "cpu"
    else:
        if torch.cuda.is_available():
            logger.info("CUDA detected. Using NVIDIA GPU acceleration.")
            return "cuda"
        if torch.backends.mps.is_available():
             logger.info("MPS detected. Using Apple Silicon GPU acceleration.")
             return "mps"
        return "cpu"

def get_whisper_model():
    """Lazy load Whisper model."""
    global _whisper_model
    if _whisper_model is None:
        device = get_whisper_device()

        if WHISPER_BACKEND == "mlx-whisper":
            logger.info(f"MLX-Whisper ready (model '{WHISPER_MODEL_SIZE}')")
            logger.info("Using Apple Silicon GPU (Metal) for maximum performance!")
            _whisper_model = "mlx-whisper-ready"

        elif WHISPER_BACKEND == "faster-whisper":
            logger.info(f"Loading faster-whisper model '{WHISPER_MODEL_SIZE}' on {device.upper()}...")
            compute_type = "int8" if device == "cpu" else "float16"
            cpu_threads = os.cpu_count() or 4

            try:
                _whisper_model = WhisperModel(
                    WHISPER_MODEL_SIZE,
                    device=device,
                    compute_type=compute_type,
                    cpu_threads=cpu_threads,
                    num_workers=2
                )
                logger.info(f"faster-whisper loaded: device={device}, compute={compute_type}, threads={cpu_threads}")
            except Exception as e:
                logger.error(f"faster-whisper loading failed: {e}")
                raise
        else:
            logger.info(f"Loading openai-whisper model '{WHISPER_MODEL_SIZE}' on {device.upper()}...")
            try:
                import whisper
                _whisper_model = whisper.load_model(WHISPER_MODEL_SIZE, device=device)
                logger.info(f"openai-whisper loaded on {device.upper()}")
            except Exception as e:
                logger.error(f"Failed to load Whisper model: {e}")
                raise

    return _whisper_model

def get_diarization_pipeline():
    """Lazy load Pyannote diarization pipeline."""
    global _diarization_pipeline

    if not ENABLE_DIARIZATION:
        return None

    if _diarization_pipeline is None:
        if not HF_TOKEN or HF_TOKEN == 'your_huggingface_token_here':
            logger.warning("Diarization disabled: HF_TOKEN not set")
            return None

        logger.info("Loading Pyannote diarization pipeline (CPU mode for stability)...")

        try:
            from pyannote.audio import Pipeline
            pipeline = Pipeline.from_pretrained(
                "pyannote/speaker-diarization-3.1",
                use_auth_token=HF_TOKEN
            )

            if pipeline is None:
                logger.error("Diarization pipeline returned None - check your HF_TOKEN")
                return None

            if torch.backends.mps.is_available():
                try:
                    logger.info("Attempting to use MPS (Apple Silicon GPU) for diarization...")
                    pipeline.to(torch.device("mps"))
                    _diarization_pipeline = pipeline
                    logger.info("Diarization pipeline loaded on MPS (GPU)")
                except Exception as mps_error:
                    logger.warning(f"MPS failed ({mps_error}), falling back to CPU")
                    pipeline.to(torch.device("cpu"))
                    _diarization_pipeline = pipeline
                    logger.info("Diarization pipeline loaded on CPU (fallback)")
            else:
                pipeline.to(torch.device("cpu"))
                _diarization_pipeline = pipeline
                logger.info("Diarization pipeline loaded on CPU")
        except Exception as e:
            logger.error(f"Failed to load diarization pipeline: {e}")
            return None

    return _diarization_pipeline

def run_whisper_process(audio_file: str, progress_callback=None) -> Dict[str, Any]:
    """Transcribe audio with Whisper + optional Pyannote diarization."""
    if not ENABLE_WHISPER:
        raise Exception("Whisper is disabled on this server")
        
    logger.info(f"Running Whisper transcription ({WHISPER_BACKEND})...")
    model = get_whisper_model()

    segments = []
    text = ""
    language = "en"

    if WHISPER_BACKEND == "mlx-whisper":
        logger.info("Starting mlx-whisper transcription (Metal GPU)...")
        mlx_model_map = {
            'tiny': 'mlx-community/whisper-tiny-mlx',
            'base': 'mlx-community/whisper-base-mlx',
            'small': 'mlx-community/whisper-small-mlx',
            'medium': 'mlx-community/whisper-medium-mlx',
            'large': 'mlx-community/whisper-large-v3-mlx',
            'large-v3': 'mlx-community/whisper-large-v3-mlx',
        }
        mlx_model_path = mlx_model_map.get(WHISPER_MODEL_SIZE, 'mlx-community/whisper-base-mlx')
        
        result = mlx_whisper.transcribe(audio_file, path_or_hf_repo=mlx_model_path)
        
        # Normalize segments
        for s in result.get("segments", []):
            segments.append({
                "start": s.get("start"),
                "end": s.get("end"),
                "text": s.get("text", "").strip(),
                "speaker": None
            })
        text = result.get("text", "")
        language = result.get("language", "en")
        logger.info(f"mlx-whisper done: {len(segments)} segments, language={language}")

    elif WHISPER_BACKEND == "faster-whisper":
        logger.info("Starting faster-whisper transcription...")
        segments_generator, info = model.transcribe(
            audio_file,
            beam_size=5,
            language=None,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=500),
        )

        text_parts = []
        for seg in segments_generator:
            segments.append({
                "start": seg.start,
                "end": seg.end,
                "text": seg.text.strip(),
                "speaker": None
            })
            text_parts.append(seg.text.strip())

        text = " ".join(text_parts)
        language = info.language
        logger.info(f"faster-whisper done: {len(segments)} segments, language={language}")

    else:
        # openai-whisper
        try:
            device = next(model.parameters()).device
            device_str = str(device)
        except:
            device_str = "cpu"

        fp16 = device_str == "cuda"
        logger.info(f"Starting openai-whisper transcription (fp16={fp16}, device={device_str})...")
        result = model.transcribe(audio_file, fp16=fp16)

        for s in result.get("segments", []):
            segments.append({
                "start": s.get("start"),
                "end": s.get("end"),
                "text": s.get("text", "").strip(),
                "speaker": None
            })
        text = result.get("text", "")
        language = result.get("language", "en")

    # Diarization
    pipeline = get_diarization_pipeline()
    if pipeline and ENABLE_DIARIZATION:
        logger.info("Starting speaker diarization...")
        try:
            # Convert to WAV if needed
            diarization_audio = audio_file
            if not audio_file.endswith('.wav'):
                wav_path = audio_file.rsplit('.', 1)[0] + '_diarization.wav'
                if not os.path.exists(wav_path):
                    logger.info(f"Converting audio to WAV for diarization: {wav_path}")
                    subprocess.run([
                        'ffmpeg', '-i', audio_file,
                        '-ar', '16000', '-ac', '1', '-y',
                        wav_path
                    ], capture_output=True, check=True)
                diarization_audio = wav_path

            diarization_steps = ['segmentation', 'embeddings', 'speaker_counting', 'discrete_diarization']
            step_idx = [0]
            
            def diarization_progress(step_name, step_result=None, **kwargs):
                if step_name in diarization_steps:
                    idx = diarization_steps.index(step_name) + 1
                    pct = int((idx / len(diarization_steps)) * 100)
                    if step_name != step_idx[0]:
                        logger.info(f"[DIARIZATION] {step_name}")
                        step_idx[0] = step_name
                        if progress_callback:
                            progress_callback('diarization', f'Speaker detection: {step_name}', 50 + (pct // 4))

            # Run diarization on the audio file with progress tracking
            try:
                diarization = pipeline(diarization_audio, hook=diarization_progress)
            except Exception as e:
                # If MPS fails (common with SparseMPS error), try fallback to CPU
                # We check the error message or device to decide
                device = getattr(pipeline, "device", None)
                if device and device.type == "mps":
                    logger.warning(f"Diarization failed on MPS ({e}). Falling back to CPU...")
                    pipeline.to(torch.device("cpu"))
                    diarization = pipeline(diarization_audio, hook=diarization_progress)
                    logger.info("Diarization succeeded on CPU fallback.")
                else:
                    raise e  # Re-raise if not MPS related or already on CPU
            
            # Match speakers
            for segment in segments:
                start = segment["start"]
                end = segment["end"]
                speaker_overlaps = {}
                
                for turn, _, speaker in diarization.itertracks(yield_label=True):
                    overlap_start = max(start, turn.start)
                    overlap_end = min(end, turn.end)
                    overlap = max(0, overlap_end - overlap_start)
                    if overlap > 0:
                        speaker_overlaps[speaker] = speaker_overlaps.get(speaker, 0) + overlap
                
                if speaker_overlaps:
                    best_speaker = max(speaker_overlaps, key=speaker_overlaps.get)
                    segment["speaker"] = best_speaker

            logger.info("Diarization complete.")
        except Exception as e:
            logger.error(f"Diarization failed: {e}")

    return {
        "segments": segments,
        "text": text,
        "language": language
    }
