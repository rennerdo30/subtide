import os
import sys
import logging
import platform
import functools
import warnings
import json
import subprocess
from typing import Optional, Dict, Any, List
import time

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
    CACHE_DIR,
    WHISPER_MODEL_SIZE,
    ENABLE_DIARIZATION,
    HF_TOKEN,
    ENABLE_WHISPER,
    DIARIZATION_MODE,
    WHISPER_QUANTIZED,
    WHISPER_HF_REPO,
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

# Control whether to use subprocess for mlx-whisper (default: False = direct/faster)
MLX_USE_SUBPROCESS = os.getenv('MLX_USE_SUBPROCESS', 'false').lower() == 'true'
# New: Force direct mode even for long files
MLX_FORCE_DIRECT = os.getenv('MLX_FORCE_DIRECT', 'false').lower() == 'true'


# Subprocess mode removed.
# def _run_mlx_child(...): ...


def _run_mlx_direct(audio_path: str, model_path: str, progress_callback=None) -> dict:
    """Run mlx-whisper directly in-process (faster, uses GPU properly)."""
    import mlx_whisper
    import mlx.core as mx

    # Log device info
    device = mx.default_device()
    logger.info(f"[MLX] Running on device: {device}")
    logger.info(f"[MLX] Model: {model_path}")
    logger.info(f"[MLX] Audio: {audio_path}")

    start_time = time.time()

    # Run transcription directly
    result = mlx_whisper.transcribe(
        audio_path,
        path_or_hf_repo=model_path,
        verbose=True  # Enable internal progress for debugging
    )

    elapsed = time.time() - start_time
    result["meta"] = {
        "mlx_device": str(device),
        "wall_clock": elapsed,
    }

    logger.info(f"[MLX] Transcription completed in {elapsed:.1f}s on {device}")
    
    # Send completion progress update if callback provided
    if progress_callback:
        progress_callback('whisper', 'Transcription complete', 99)
    
    return result

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
            logger.info("Using CPU with CTranslate2 optimizations (Metal not supported by faster-whisper)")
            return "cpu"
    else:
        if torch.cuda.is_available():
            logger.info("CUDA detected. Using NVIDIA GPU acceleration.")
            return "cuda"
        if torch.backends.mps.is_available():
             logger.info("MPS detected. Using Apple Silicon GPU acceleration.")
             return "mps"
        return "cpu"

def get_mlx_model_path():
    """Get the appropriate MLX model path/repo."""
    mlx_model_map = {
        'tiny': 'mlx-community/whisper-tiny-mlx',
        'base': 'mlx-community/whisper-base-mlx',
        'small': 'mlx-community/whisper-small-mlx',
        'medium': 'mlx-community/whisper-medium-mlx',
        'large': 'mlx-community/whisper-large-v3-mlx',
        'large-v3': 'mlx-community/whisper-large-v3-mlx',
        'large-v3-turbo': 'mlx-community/whisper-large-v3-turbo',
    }
    if WHISPER_HF_REPO:
        return WHISPER_HF_REPO
    return mlx_model_map.get(WHISPER_MODEL_SIZE, 'mlx-community/whisper-base-mlx')

def get_whisper_model():
    """Lazy load Whisper model."""
    global _whisper_model
    if _whisper_model is None:
        device = get_whisper_device()

        if WHISPER_BACKEND == "mlx-whisper":
            logger.info(f"MLX-Whisper ready (model '{WHISPER_MODEL_SIZE}')")
            logger.info("Using Apple Silicon GPU (Metal) for maximum performance!")
            # Return the model path for MLX backend
            _whisper_model = get_mlx_model_path()

        elif WHISPER_BACKEND == "faster-whisper":
            logger.info(f"Loading faster-whisper model '{WHISPER_MODEL_SIZE}' on {device.upper()}...")
            compute_type = "int8" if device == "cpu" else "float16"
            cpu_threads = os.cpu_count() or 4

            try:
                # Lazy import inside to avoid top-level dependency if possible, though this block runs only if backend selected
                from faster_whisper import WhisperModel
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

    if not ENABLE_DIARIZATION or DIARIZATION_MODE in ('off', 'deferred'):
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
        import threading
        import time as time_module
        import multiprocessing
        import tempfile
        
        # Get audio duration for progress estimation
        try:
            import soundfile as sf
            info = sf.info(audio_file)
            audio_duration = info.duration
        except Exception as e:
            logger.warning(f"Could not get audio duration with soundfile: {e}")
            audio_duration = 0

        # Load historical RTF (real-time factor) if available
        historical_rtf = None
        history_path = os.path.join(CACHE_DIR, 'whisper_timing.json')
        try:
            if os.path.exists(history_path):
                with open(history_path, 'r') as f:
                    history = json.load(f)
                    if history.get('rtf_samples'):
                        # Use average of last 10 samples
                        samples = history['rtf_samples'][-10:]
                        historical_rtf = sum(samples) / len(samples)
                        logger.info(f"[WHISPER] Using historical RTF: {historical_rtf:.3f}x (from {len(samples)} samples)")
        except Exception as e:
            logger.debug(f"Could not load whisper timing history: {e}")

        # Estimate transcription time - MORE CONSERVATIVE defaults
        # Increased factors to prevent "stuck at 99%" syndrome
        model_factors = {
            'tiny': 0.15, 'tiny.en': 0.15,
            'base': 0.20, 'base.en': 0.20,
            'small': 0.30, 'small.en': 0.30,
            'medium': 0.50, 'medium.en': 0.50,
            'large': 0.80, 'large-v2': 0.80,
            'large-v3': 0.80, 'large-v3-turbo': 0.60,
        }

        # Use historical RTF if available, otherwise use model factor
        if historical_rtf:
            factor = historical_rtf * 1.1  # Add 10% buffer
        else:
            factor = model_factors.get(WHISPER_MODEL_SIZE, 0.25)

        estimated_time = audio_duration * factor if audio_duration > 0 else 120
        
        logger.info(f"Starting mlx-whisper transcription (Metal GPU)...")
        logger.info(f"  Audio duration: {audio_duration:.1f}s, Estimated time: {estimated_time:.1f}s")
        
        mlx_model_map = {
            'tiny': 'mlx-community/whisper-tiny-mlx',
            'base': 'mlx-community/whisper-base-mlx',
            'small': 'mlx-community/whisper-small-mlx',
            'medium': 'mlx-community/whisper-medium-mlx',
            'large': 'mlx-community/whisper-large-v3-mlx',
            'large-v3': 'mlx-community/whisper-large-v3-mlx',
        }
        if WHISPER_HF_REPO:
            mlx_model_path = WHISPER_HF_REPO
        else:
            mlx_model_path = mlx_model_map.get(WHISPER_MODEL_SIZE, 'mlx-community/whisper-base-mlx')
        
        # Progress tracking in background thread
        transcribing = [True]
        start_time = time_module.time()
        last_status = ['transcribing']  # Track status for better messages
        overtime_warned = [False]  # Track if we've warned about overtime

        def progress_reporter():
            while transcribing[0]:
                elapsed = time_module.time() - start_time

                if estimated_time > 0:
                    # Calculate progress based on elapsed time
                    raw_pct = (elapsed / estimated_time) * 100

                    if raw_pct < 95:
                        # Normal progress
                        pct = int(raw_pct)
                        remaining = max(0, estimated_time - elapsed)

                        if remaining < 60:
                            eta_str = f"{int(remaining)}s"
                        else:
                            eta_str = f"{int(remaining // 60)}m {int(remaining % 60)}s"

                        status_msg = f"Transcribing... {pct}% complete, ETA: {eta_str}"
                        last_status[0] = 'transcribing'

                    elif raw_pct < 120:
                        # Between 95-120% of estimated time - show "finalizing"
                        pct = 95 + int((raw_pct - 95) * 0.2)  # Slowly increase to 99
                        pct = min(pct, 99)

                        if not overtime_warned[0]:
                            logger.info(f"[WHISPER] Taking longer than estimated, finalizing...")
                            overtime_warned[0] = True

                        extra_time = elapsed - estimated_time
                        status_msg = f"Finalizing transcription... {pct}% (+{int(extra_time)}s)"
                        last_status[0] = 'finalizing'
                        eta_str = "almost done"

                    else:
                        # Over 120% of estimated time - show "processing"
                        pct = 99
                        extra_time = elapsed - estimated_time

                        # Every 30 seconds over, give an update
                        status_msg = f"Processing complex audio... {pct}% (+{int(extra_time)}s)"
                        last_status[0] = 'processing'
                        eta_str = "processing..."

                    logger.info(f"[WHISPER] {status_msg}")

                    if progress_callback:
                        progress_callback('whisper', status_msg, 30 + int(min(pct, 99) * 0.2))

                time_module.sleep(0.5)  # Update every 0.5s for smoother UI
        
        progress_thread = threading.Thread(target=progress_reporter, daemon=True)
        progress_thread.start()

        try:
            # DIRECT MODE (Always use in-process for maximum performance)
            # Legacy version used this and was 100x faster.
            # Since faster-whisper is removed, we don't need subprocess isolation anymore.
            logger.info("[WHISPER] Using DIRECT mode (in-process, faster GPU execution)")
            result = _run_mlx_direct(audio_file, mlx_model_path, progress_callback)
        except Exception as mlx_error:
            logger.error(f"mlx-whisper failed: {mlx_error}")
            raise mlx_error
        finally:
            transcribing[0] = False
            progress_thread.join(timeout=1)
        
        total_time = time_module.time() - start_time

        # Save timing data for future estimates
        if audio_duration > 0:
            actual_rtf = total_time / audio_duration
            try:
                history = {'rtf_samples': [], 'model': WHISPER_MODEL_SIZE}
                if os.path.exists(history_path):
                    with open(history_path, 'r') as f:
                        history = json.load(f)
                history['rtf_samples'] = (history.get('rtf_samples', []) + [actual_rtf])[-20:]  # Keep last 20
                history['last_rtf'] = actual_rtf
                history['last_duration'] = audio_duration
                history['last_time'] = total_time
                with open(history_path, 'w') as f:
                    json.dump(history, f, indent=2)
                logger.info(f"[WHISPER] Saved timing: RTF={actual_rtf:.3f}x (took {total_time:.1f}s for {audio_duration:.1f}s audio)")
            except Exception as e:
                logger.debug(f"Could not save whisper timing: {e}")

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
        mlx_meta = result.get("meta", {})
        rtf = total_time / audio_duration if audio_duration > 0 else 0
        if mlx_meta.get("mlx_device"):
            logger.info(f"MLX device: {mlx_meta.get('mlx_device')}")
        logger.info(f"mlx-whisper done: {len(segments)} segments, language={language}, took {total_time:.1f}s, rtf={rtf:.3f}")

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
    if pipeline and ENABLE_DIARIZATION and DIARIZATION_MODE == 'on':
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

            # Custom Progress Hook for Pyannote 3.1+
            class CustomProgressHook:
                def __init__(self, callback):
                    self.callback = callback
                    self.step_idx = 0
                    self.steps = ['segmentation', 'embeddings', 'speaker_counting', 'discrete_diarization']
                    self.last_step = None
                
                def __enter__(self):
                    return self
                
                def __exit__(self, *args):
                    pass
                
                def __call__(self, step_name, step_artifact, file=None, total=None, completed=None):
                    if step_name != self.last_step:
                        self.last_step = step_name
                        logger.info(f"[DIARIZATION] Starting step: {step_name}")
                    
                    if total is not None and completed is not None:
                        # Granular progress within step
                        step_pct = (completed / total)
                        
                        # Global progress (approximate)
                        if step_name in self.steps:
                            current_step_idx = self.steps.index(step_name)
                            # map 0..4 to 50%..100%
                            # Each step is 1/4 of the remaining 50% = 12.5%
                            # So base is 50 + (idx * 12.5)
                            # Add step_pct * 12.5
                            base = 50.0 + (current_step_idx * 12.5)
                            final_pct = base + (step_pct * 12.5)
                            
                            status_msg = f"Diarization: {step_name} ({int(step_pct*100)}%)"
                            
                            # Log only every 10% to avoid spam
                            if completed % max(1, int(total/10)) == 0:
                                logger.debug(f"[DIARIZATION] {step_name}: {completed}/{total}")
                                
                            if self.callback:
                                self.callback('diarization', status_msg, int(final_pct))
                    else:
                        # Fallback if no numbers
                        logger.info(f"[DIARIZATION] {step_name} (running...)")

            # Run diarization on the audio file with progress tracking
            try:
                with CustomProgressHook(progress_callback) as hook:
                    diarization = pipeline(diarization_audio, hook=hook)
            except Exception as e:
                # If MPS fails (common with SparseMPS error), try fallback to CPU
                # We check the error message or device to decide
                device = getattr(pipeline, "device", None)
                if device and device.type == "mps":
                    logger.warning(f"Diarization failed on MPS ({e}). Falling back to CPU...")
                    pipeline.to(torch.device("cpu"))
                    with CustomProgressHook(progress_callback) as hook:
                        diarization = pipeline(diarization_audio, hook=hook)
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
