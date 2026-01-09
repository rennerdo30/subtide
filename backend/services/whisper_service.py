import os
import sys
import logging
import platform
import functools
import warnings
import json
import subprocess
import re
from typing import Optional, Dict, Any, List
import shutil
import time

# Suppress warnings
warnings.filterwarnings("ignore", message=".*torchaudio.*deprecated.*")
warnings.filterwarnings("ignore", message=".*TorchCodec.*")
warnings.filterwarnings("ignore", category=UserWarning, module="torchaudio")
warnings.filterwarnings("ignore", category=UserWarning, module="pyannote")
warnings.filterwarnings("ignore", category=UserWarning, module="speechbrain")

# Enable MPS fallback
os.environ["PYTORCH_ENABLE_MPS_FALLBACK"] = "1"


# Torch is now lazy-loaded to prevent OpenMP conflicts with MLX
def _ensure_torch():
    import torch
    import torch.serialization
    
    # If already patched, just return
    if hasattr(torch, '_antigravity_patched'):
        return torch

    logger.info("Applying security patches to Torch for PyTorch 2.6+ compatibility...")

    # 1. Add safe globals for PyTorch 2.6+
    if hasattr(torch.serialization, 'add_safe_globals'):
        try:
            import torch.torch_version
            torch.serialization.add_safe_globals([
                torch.torch_version.TorchVersion,
                # Add other common globals used by diarization models if needed
            ])
            logger.info("Added TorchVersion to safe globals")
        except Exception as e:
            logger.warning(f"Could not add safe globals: {e}")

    # 2. Force weights_only=False globally for torch.load
    # This is often needed for older models or third-party libraries (like pyannote)
    original_torch_load = torch.load
    
    @functools.wraps(original_torch_load)
    def _patched_torch_load(*args, **kwargs):
        # We FORCE weights_only to False to avoid unpickling errors with trusted models
        kwargs['weights_only'] = False
        return original_torch_load(*args, **kwargs)
    
    torch.load = _patched_torch_load
    
    # Also patch the internal serialization load if it exists
    if hasattr(torch.serialization, 'load'):
        original_ser_load = torch.serialization.load
        @functools.wraps(original_ser_load)
        def _patched_ser_load(*args, **kwargs):
            kwargs['weights_only'] = False
            return original_ser_load(*args, **kwargs)
        torch.serialization.load = _patched_ser_load

    # 3. Set threads for performance
    torch.set_num_threads(os.cpu_count() or 8)
    torch.set_num_interop_threads(os.cpu_count() or 8)
    
    torch._antigravity_patched = True
    return torch

from backend.config import (
    CACHE_DIR,
    MODEL_CACHE_DIR,
    WHISPER_MODEL_SIZE,
    ENABLE_DIARIZATION,
    HF_TOKEN,
    ENABLE_WHISPER,
    DIARIZATION_MODE,
    WHISPER_QUANTIZED,
    WHISPER_HF_REPO,
    WHISPER_LANGUAGE,
    ENABLE_VAD,
    VAD_THRESHOLD,
    MAX_SUBTITLE_DURATION,
    MAX_SUBTITLE_WORDS,
    MIN_SPEAKERS,
    MAX_SPEAKERS,
    DIARIZATION_SMOOTHING,
    MIN_SEGMENT_DURATION,
    WHISPER_NO_SPEECH_THRESHOLD,
    WHISPER_COMPRESSION_RATIO_THRESHOLD,
    WHISPER_LOGPROB_THRESHOLD,
    WHISPER_CONDITION_ON_PREVIOUS,
    WHISPER_BEAM_SIZE,
)
from backend.utils.logging_utils import log_stage

logger = logging.getLogger('video-translate')

# Whisper backend detection
_whisper_backend = None

def get_whisper_backend():
    """Detect and return the whisper backend to use."""
    global _whisper_backend
    if _whisper_backend is not None:
        return _whisper_backend
        
    # Prioritize environment variable if set
    env_backend = os.getenv('WHISPER_BACKEND')
    if env_backend in ['faster-whisper', 'openai-whisper', 'mlx-whisper']:
        logger.info(f"Using configured Whisper backend: {env_backend}")
        _whisper_backend = env_backend
        return _whisper_backend

    if platform.system() == "Darwin" and platform.machine() == "arm64":
        try:
            import mlx_whisper
            _whisper_backend = "mlx-whisper"
            return _whisper_backend
        except ImportError:
            pass

    # Prefer faster-whisper on Linux/CUDA if available
    if platform.system() == "Linux":
        try:
            import faster_whisper
            _whisper_backend = "faster-whisper"
            return _whisper_backend
        except ImportError:
            pass

    # Default to openai-whisper if others fail or aren't available
    try:
        import whisper
        _whisper_backend = "openai-whisper"
    except ImportError:
        logger.warning("No whisper backend available!")
        _whisper_backend = None
        
    return _whisper_backend

# Lazy loaded models
_whisper_model = None
_diarization_pipeline = None
_vad_model = None
_vad_utils = None  # Store VAD utils (get_speech_timestamps, etc.)
_vad_device = None  # Track VAD device explicitly (silero TorchScript doesn't expose .device)

# Thread lock for model initialization (prevents duplicate loading on concurrent requests)
import threading
_model_lock = threading.Lock()

# Control whether to use subprocess for mlx-whisper (default: False = direct/faster)
MLX_USE_SUBPROCESS = os.getenv('MLX_USE_SUBPROCESS', 'false').lower() == 'true'
# New: Force direct mode even for long files
MLX_FORCE_DIRECT = os.getenv('MLX_FORCE_DIRECT', 'false').lower() == 'true'


def get_vad_model():
    """Lazy load silero-vad model."""
    global _vad_model, _vad_utils, _vad_device
    if _vad_model is None and ENABLE_VAD:
        try:
            torch = _ensure_torch()
            # Set hub dir to persistent cache
            hub_dir = os.path.join(MODEL_CACHE_DIR, "torch_hub")
            os.makedirs(hub_dir, exist_ok=True)
            torch.hub.set_dir(hub_dir)
            
            logger.info("Loading silero-vad model...")
            model, utils = torch.hub.load(
                repo_or_dir='snakers4/silero-vad',
                model='silero_vad',
                force_reload=False,
                trust_repo=True
            )
            _vad_model = model
            _vad_utils = utils  # Contains get_speech_timestamps, read_audio, etc.
            _vad_device = 'cpu'  # Default to CPU
            
            # Move VAD to GPU if available for performance
            if torch.cuda.is_available():
                try:
                    _vad_model.to(torch.device('cuda'))
                    _vad_device = 'cuda'
                    logger.info("silero-vad moved to CUDA (GPU)")
                except Exception as e:
                    logger.warning(f"Failed to move VAD to CUDA: {e}")
                    _vad_device = 'cpu'
            elif torch.backends.mps.is_available():
                # MPS can be unstable with silero-vad's TorchScript model
                # The STFT/conv1d operations may not work properly on MPS
                # Fall back to CPU for reliability
                logger.info("silero-vad staying on CPU (MPS has compatibility issues with TorchScript STFT)")
                _vad_device = 'cpu'

            logger.info(f"silero-vad loaded successfully (device: {_vad_device})")
        except Exception as e:
            logger.warning(f"Could not load silero-vad: {e}")
            _vad_model = False  # Mark as failed so we don't retry
            _vad_device = None
    return (_vad_model, _vad_utils, _vad_device) if _vad_model else (None, None, None)


def get_speech_timestamps(audio_path: str, progress_callback=None) -> list:
    """Use silero-vad to detect speech segments in audio.
    
    Returns list of dicts with 'start' and 'end' in seconds.
    """
    if not ENABLE_VAD:
        return None
    
    vad_model, vad_utils, vad_device = get_vad_model()
    if not vad_model or not vad_utils:
        return None
    
    # Get the speech timestamp function from utils
    get_speech_ts = vad_utils[0] if isinstance(vad_utils, tuple) else getattr(vad_utils, 'get_speech_timestamps', None)
    if not get_speech_ts:
        logger.warning("[VAD] Could not find get_speech_timestamps in utils")
        return None
    
    try:
        torch = _ensure_torch()
        import torchaudio
        import subprocess
        import numpy as np
        
        logger.info(f"[VAD] Processing audio: {audio_path} (device: {vad_device})")
        
        # Try to load audio directly, fall back to ffmpeg pipe if needed
        try:
            waveform, sample_rate = torchaudio.load(audio_path)
        except Exception as load_error:
            # torchaudio failed (likely m4a/mp3 on platform without sox/ffmpeg backend configured),
            # Decode directly to memory using ffmpeg pipe to avoid large temp files.
            logger.info(f"[VAD] Loading audio via ffmpeg pipe...")
            
            try:
                cmd = [
                    'ffmpeg',
                    '-nostdin',
                    '-threads', '0',
                    '-i', audio_path,
                    '-f', 's16le',
                    '-ac', '1',
                    '-acodec', 'pcm_s16le',
                    '-ar', '16000',
                    '-'
                ]
                
                process = subprocess.run(cmd, capture_output=True, check=True)
                audio_bytes = process.stdout
                
                # Convert 16-bit PCM bytes to float32 tensor
                audio_array = np.frombuffer(audio_bytes, np.int16).flatten().astype(np.float32) / 32768.0
                waveform = torch.from_numpy(audio_array)
                
                # Torchaudio load returns (channels, time), so we add simple channel dim -> (1, time)
                waveform = waveform.unsqueeze(0)
                sample_rate = 16000
                
            except Exception as ffmpeg_err:
                logger.error(f"[VAD] ffmpeg pipe failed: {ffmpeg_err}")
                return None
        
        # Resample to 16kHz if needed (silero-vad requirement)
        if sample_rate != 16000:
            resampler = torchaudio.transforms.Resample(sample_rate, 16000)
            waveform = resampler(waveform)
            sample_rate = 16000
        
        # Convert to mono if stereo
        if waveform.shape[0] > 1:
            waveform = waveform.mean(dim=0, keepdim=True)
        
        # Flatten to 1D
        waveform = waveform.squeeze()
        
        # Move entire waveform to VAD device if needed (CPU is default, safe for all platforms)
        if vad_device and vad_device != 'cpu':
            waveform = waveform.to(torch.device(vad_device))
        
        # Get speech timestamps
        speech_timestamps = []
        
        # Process in chunks to avoid memory issues on long audio
        chunk_size = 30 * sample_rate  # 30 seconds
        total_chunks = (len(waveform) + chunk_size - 1) // chunk_size
        
        for i in range(0, len(waveform), chunk_size):
            chunk = waveform[i:i + chunk_size]
            chunk_offset = i / sample_rate
            
            # chunk is already on the correct device from waveform
            timestamps = get_speech_ts(chunk, vad_model, sampling_rate=sample_rate, threshold=VAD_THRESHOLD)
            
            for ts in timestamps:
                speech_timestamps.append({
                    'start': chunk_offset + ts['start'] / sample_rate,
                    'end': chunk_offset + ts['end'] / sample_rate
                })
            
            if progress_callback and total_chunks > 1:
                pct = int((i / len(waveform)) * 10)  # 0-10% for VAD
                progress_callback('vad', f'Detecting speech... {pct}%', pct)
        
        logger.info(f"[VAD] Found {len(speech_timestamps)} speech segments")
        return speech_timestamps
        
    except Exception as e:
        logger.warning(f"[VAD] Failed to process audio: {e}")
        return None


def filter_segments_by_vad(segments: list, speech_timestamps: list) -> list:
    """Filter Whisper segments to only include those overlapping with VAD speech."""
    if not speech_timestamps:
        return segments
    
    filtered = []
    for seg in segments:
        seg_start = seg['start']
        seg_end = seg['end']
        
        # Check if segment overlaps with any speech timestamp
        for st in speech_timestamps:
            overlap_start = max(seg_start, st['start'])
            overlap_end = min(seg_end, st['end'])
            
            if overlap_end > overlap_start:
                # Has overlap - keep segment
                filtered.append(seg)
                break
    
    logger.info(f"[VAD] Filtered {len(segments)} -> {len(filtered)} segments")
    return filtered


def smooth_speaker_segments(segments: list) -> list:
    """Post-process segments to reduce speaker flicker.
    
    Merges short segments with adjacent segments that have the same speaker.
    """
    if not DIARIZATION_SMOOTHING or not segments:
        return segments
    
    smoothed = []
    i = 0
    
    while i < len(segments):
        current = segments[i].copy()
        
        # Look ahead and merge short segments with same speaker
        while i + 1 < len(segments):
            next_seg = segments[i + 1]
            current_duration = current['end'] - current['start']
            next_duration = next_seg['end'] - next_seg['start']
            
            # If current segment is short and next has same speaker, merge
            if current_duration < MIN_SEGMENT_DURATION and current.get('speaker') == next_seg.get('speaker'):
                current['end'] = next_seg['end']
                current['text'] = current['text'] + ' ' + next_seg['text']
                i += 1
            # If next segment is short and has same speaker, merge
            elif next_duration < MIN_SEGMENT_DURATION and current.get('speaker') == next_seg.get('speaker'):
                current['end'] = next_seg['end']
                current['text'] = current['text'] + ' ' + next_seg['text']
                i += 1
            else:
                break
        
        smoothed.append(current)
        i += 1
    
    if len(smoothed) != len(segments):
        logger.info(f"[SMOOTHING] Merged {len(segments)} -> {len(smoothed)} segments")
    
    return smoothed


def filter_hallucinations(segments: list) -> list:
    """Filter out Whisper hallucinations using the improved utility.
    
    Detects: repetitive text, impossible speech rates, common patterns,
    consecutive duplicates, and mostly-punctuation segments.
    """
    try:
        from backend.utils.hallucination_filter import filter_hallucinations as _filter_impl
        return _filter_impl(segments)
    except ImportError:
        # Fallback: just return segments as-is
        logger.warning("[HALLUCINATION] Could not import filter utility, skipping")
        return segments


# Subprocess mode removed.
# def _run_mlx_child(...): ...


def _run_mlx_direct(audio_path: str, model_path: str, progress_callback=None, initial_prompt: str = None, language: str = None) -> dict:
    """Run mlx-whisper directly in-process (faster, uses GPU properly).
    
    Args:
        audio_path: Path to audio file
        model_path: HuggingFace model path
        progress_callback: Optional progress callback
        initial_prompt: Optional prompt to guide transcription
        language: Optional language code (e.g., 'ja', 'en'). None = auto-detect.
    """
    import mlx_whisper
    import mlx.core as mx

    # Log device info
    device = mx.default_device()
    logger.info(f"[MLX] Running on device: {device}")
    logger.info(f"[MLX] Model: {model_path}")
    logger.info(f"[MLX] Audio: {audio_path}")
    logger.info(f"[MLX] Thresholds: no_speech={WHISPER_NO_SPEECH_THRESHOLD}, compression={WHISPER_COMPRESSION_RATIO_THRESHOLD}, logprob={WHISPER_LOGPROB_THRESHOLD}")
    if language:
        logger.info(f"[MLX] Forced language: {language}")
    if initial_prompt:
        logger.info(f"[MLX] Initial prompt: {initial_prompt[:80]}...")

    start_time = time.time()

    # Build transcription kwargs
    transcribe_kwargs = {
        'path_or_hf_repo': model_path,
        'verbose': True,
        'word_timestamps': True,
        'no_speech_threshold': WHISPER_NO_SPEECH_THRESHOLD,
        'compression_ratio_threshold': WHISPER_COMPRESSION_RATIO_THRESHOLD,
        'logprob_threshold': WHISPER_LOGPROB_THRESHOLD,
        'condition_on_previous_text': WHISPER_CONDITION_ON_PREVIOUS,
    }
    
    # Add language if specified (forces detection, fixes Japanese issues)
    if language:
        transcribe_kwargs['language'] = language
    
    # Add initial_prompt if provided (helps with proper nouns, technical terms)
    if initial_prompt:
        transcribe_kwargs['initial_prompt'] = initial_prompt

    # Run transcription directly with configurable thresholds
    result = mlx_whisper.transcribe(audio_path, **transcribe_kwargs)

    elapsed = time.time() - start_time
    result["meta"] = {
        "mlx_device": str(device),
        "wall_clock": elapsed,
    }

    logger.info(f"[MLX] Transcription completed in {elapsed:.1f}s on {device}")
    
    # Filter hallucinations
    if 'segments' in result:
         result['segments'] = filter_hallucinations(result['segments'])
         # Reconstruct text from filtered segments
         result['text'] = " ".join(s.get('text', '').strip() for s in result['segments'])
    
    # Send completion progress update if callback provided
    if progress_callback:
        progress_callback('whisper', 'Transcription complete', 99)
    
    return result


def run_whisper_streaming(
    audio_file: str,
    segment_callback=None,
    progress_callback=None,
    initial_prompt: str = None
) -> dict:
    """
    Run Whisper transcription with real-time segment streaming.
    
    Args:
        audio_file: Path to audio file
        segment_callback: Called with (segment_dict) for each segment as it's transcribed
        progress_callback: Called with (stage, message, percent) for progress updates
        initial_prompt: Optional prompt to guide transcription
    
    Returns:
        Full transcription result dict with all segments
    """
    import time as time_module
    import threading
    import tempfile
    
    model_path = get_mlx_model_path()
    
    # Get path to whisper_runner.py
    runner_path = os.path.join(os.path.dirname(__file__), 'whisper_runner.py')
    
    # Create temp file for final JSON result
    result_file = tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False)
    result_file.close()
    
    # Build command
    cmd = [
        sys.executable,
        runner_path,
        '--audio', audio_file,
        '--model', model_path,
        '--no-speech-threshold', str(WHISPER_NO_SPEECH_THRESHOLD),
        '--compression-ratio-threshold', str(WHISPER_COMPRESSION_RATIO_THRESHOLD),
        '--logprob-threshold', str(WHISPER_LOGPROB_THRESHOLD),
        '--output-json', result_file.name,
    ]
    
    if WHISPER_CONDITION_ON_PREVIOUS:
        cmd.append('--condition-on-previous')
    
    if initial_prompt:
        cmd.extend(['--initial-prompt', initial_prompt])
    
    logger.info(f"[WHISPER_STREAM] Starting subprocess: {' '.join(cmd[:5])}...")
    
    # Regex to parse Whisper output lines like: [00:00.000 --> 00:04.440]  Text here
    segment_pattern = re.compile(r'\[(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2})\.(\d{3})\]\s*(.*)')
    
    segments = []
    start_time = time_module.time()
    segment_count = [0]
    
    try:
        # Start subprocess
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,  # Line buffered
            env={**os.environ, 'PYTHONUNBUFFERED': '1'}
        )
        
        # Read stderr in background thread for logging
        def read_stderr():
            for line in process.stderr:
                line = line.strip()
                if line:
                    logger.debug(f"[WHISPER_RUNNER] {line}")
        
        stderr_thread = threading.Thread(target=read_stderr, daemon=True)
        stderr_thread.start()
        
        # Read stdout line by line for segment capture
        for line in process.stdout:
            line = line.strip()
            if not line:
                continue
            
            # Try to parse as segment
            match = segment_pattern.match(line)
            if match:
                # Parse timestamps
                start_h, start_m, start_ms = int(match.group(1)), int(match.group(2)), int(match.group(3))
                end_h, end_m, end_ms = int(match.group(4)), int(match.group(5)), int(match.group(6))
                text = match.group(7).strip()
                
                start_sec = start_h * 60 + start_m + start_ms / 1000.0
                end_sec = end_h * 60 + end_m + end_ms / 1000.0
                
                segment = {
                    'start': start_sec,
                    'end': end_sec,
                    'text': text
                }
                
                segments.append(segment)
                segment_count[0] += 1
                
                logger.debug(f"[WHISPER_STREAM] Segment {segment_count[0]}: [{start_sec:.1f}-{end_sec:.1f}] {text[:50]}...")
                
                # Invoke callback for real-time streaming
                if segment_callback and text:
                    segment_callback(segment)
                
                # Update progress based on segments received
                if progress_callback and segment_count[0] % 5 == 0:
                    elapsed = time_module.time() - start_time
                    progress_callback('whisper', f"Transcribing... {segment_count[0]} segments ({elapsed:.0f}s)", 30 + min(segment_count[0], 60))
        
        # Wait for process to complete
        process.wait()
        
        if process.returncode != 0:
            raise RuntimeError(f"Whisper runner failed with code {process.returncode}")
        
        # Load final result from JSON file
        if os.path.exists(result_file.name):
            with open(result_file.name, 'r', encoding='utf-8') as f:
                result = json.load(f)
            os.unlink(result_file.name)
        else:
            # Fallback: construct result from captured segments
            result = {'segments': segments, 'text': ' '.join(s['text'] for s in segments)}
        
        total_time = time_module.time() - start_time
        logger.info(f"[WHISPER_STREAM] Completed in {total_time:.1f}s with {len(segments)} segments")
        
        if progress_callback:
            progress_callback('whisper', 'Transcription complete', 50)
        
        return result
        
    except Exception as e:
        logger.error(f"[WHISPER_STREAM] Error: {e}")
        # Clean up temp file
        if os.path.exists(result_file.name):
            os.unlink(result_file.name)
        raise

def get_whisper_device():
    """Detect best available device for Whisper."""
    backend = get_whisper_backend()
    if backend == "mlx-whisper":
        logger.info("Using MLX with Metal GPU acceleration (Apple Silicon)")
        return "metal"
    elif backend == "faster-whisper":
        # Fallback to existing logic or error if strictly removed, 
        # but since we removed detection, this case shouldn't be hit unless manually set.
        # We will map it to cpu/cuda same as openai-whisper for safety or just error.
        logger.warning("faster-whisper backend is deprecated/removed. Using default device detection.")
        try:
            torch = _ensure_torch()
            if torch.cuda.is_available():
                return "cuda"
        except ImportError:
            pass
        return "cpu"
    else:
        try:
            torch = _ensure_torch()
            if torch.cuda.is_available():
                logger.info("CUDA detected. Using NVIDIA GPU acceleration.")
                return "cuda"
            if torch.backends.mps.is_available():
                 logger.info("MPS detected. Using Apple Silicon GPU acceleration.")
                 return "mps"
        except ImportError:
            pass
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
        'large-v3-turbo': 'mlx-community/whisper-large-v3-mlx', # mlx-community/whisper-large-v3-turbo does not exist
    }
    if WHISPER_HF_REPO:
        return WHISPER_HF_REPO
    return mlx_model_map.get(WHISPER_MODEL_SIZE, 'mlx-community/whisper-base-mlx')

def get_whisper_model():
    """Lazy load Whisper model with thread safety."""
    global _whisper_model
    
    # Fast path: model already loaded (no lock needed for read)
    if _whisper_model is not None:
        return _whisper_model
    
    # Slow path: acquire lock and check again (double-checked locking)
    with _model_lock:
        if _whisper_model is not None:
            return _whisper_model
            
        device = get_whisper_device()
        backend = get_whisper_backend()

        if backend == "mlx-whisper":
            logger.info(f"MLX-Whisper ready (model '{WHISPER_MODEL_SIZE}')")
            logger.info("Using Apple Silicon GPU (Metal) for maximum performance!")
            # Return the model path for MLX backend
            _whisper_model = get_mlx_model_path()

        elif backend == "faster-whisper":
             logger.info(f"Loading faster-whisper model '{WHISPER_MODEL_SIZE}' on {device.upper()}...")
             
             # Retry logic for corrupted downloads
             max_retries = 2
             for attempt in range(max_retries):
                 try:
                     from faster_whisper import WhisperModel
                     
                     # compute_type="int8_float16" is standard for GPU inference (faster, lower VRAM)
                     compute_type = "int8_float16" if device == "cuda" else "int8"
                     
                     # Use configured cache directory for persistence
                     download_root = os.path.join(MODEL_CACHE_DIR, "faster_whisper")
                     os.makedirs(download_root, exist_ok=True)

                     _whisper_model = WhisperModel(WHISPER_MODEL_SIZE, device=device, compute_type=compute_type, download_root=download_root)
                     logger.info(f"faster-whisper loaded on {device.upper()}")
                     break # Success
                     
                 except Exception as e:
                     err_msg = str(e)
                     is_checksum_error = "checksum" in err_msg.lower() or "mismatch" in err_msg.lower()
                     
                     if is_checksum_error and attempt < max_retries - 1:
                         logger.warning(f"Model load failed with checksum error (attempt {attempt+1}/{max_retries}). Clearing cache and retrying...")
                         
                         # Clear specific cache dir
                         cache_dir = os.path.join(MODEL_CACHE_DIR, "faster_whisper")
                         
                         if os.path.exists(cache_dir):
                             logger.info(f"Removing cache directory: {cache_dir}")
                             try:
                                 shutil.rmtree(cache_dir)
                             except Exception as cleanup_err:
                                 logger.error(f"Failed to remove cache: {cleanup_err}")
                                     
                         logger.info("Retrying model download...")
                         continue
                     
                     # If not checksum error or out of retries, raise
                     logger.exception(f"Failed to load faster-whisper model: {e}")
                     raise
        else:
            logger.info(f"Loading openai-whisper model '{WHISPER_MODEL_SIZE}' on {device.upper()}...")
            try:
                import whisper
                _whisper_model = whisper.load_model(WHISPER_MODEL_SIZE, device=device)
                logger.info(f"openai-whisper loaded on {device.upper()}")
            except Exception as e:
                logger.exception(f"Failed to load Whisper model: {e}")
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
            # CRITICAL: Call _ensure_torch BEFORE importing pyannote
            # This patches torch.load to work with pyannote's model files
            torch = _ensure_torch()
            
            # Force HF_HOME to persistent cache for this process
            hf_cache = os.path.join(MODEL_CACHE_DIR, "huggingface")
            os.makedirs(hf_cache, exist_ok=True)
            os.environ["HF_HOME"] = hf_cache
            
            from pyannote.audio import Pipeline
            pipeline = Pipeline.from_pretrained(
                "pyannote/speaker-diarization-3.1",
                use_auth_token=HF_TOKEN
            )

            if pipeline is None:
                logger.error("Diarization pipeline returned None - check your HF_TOKEN")
                return None

            # torch is already loaded above
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
            elif torch.cuda.is_available():
                try:
                    logger.info("Attempting to use CUDA (NVIDIA GPU) for diarization...")
                    pipeline.to(torch.device("cuda"))
                    _diarization_pipeline = pipeline
                    logger.info("Diarization pipeline loaded on CUDA (GPU)")
                except Exception as cuda_error:
                    logger.warning(f"CUDA failed ({cuda_error}), falling back to CPU")
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

def run_whisper_process(audio_file: str, progress_callback=None, initial_prompt: str = None, language: str = None) -> Dict[str, Any]:
    """Transcribe audio with Whisper + optional Pyannote diarization.
    
    Args:
        audio_file: Path to audio file
        progress_callback: Optional progress callback function
        initial_prompt: Optional prompt to guide transcription (e.g., video title)
        language: Optional language code to force (e.g., 'ja' for Japanese, 'en' for English).
                  If None, Whisper will auto-detect.
    """
    if not ENABLE_WHISPER:
        raise Exception("Whisper is disabled on this server")
    
    # Use config default if language not explicitly provided
    if language is None:
        language = WHISPER_LANGUAGE
    
    if language:
        logger.info(f"[WHISPER] Forcing source language: {language}")
    
    # Normalize audio for better quiet voice detection
    normalized_audio = audio_file
    if os.getenv('ENABLE_AUDIO_NORMALIZATION', 'true').lower() == 'true':
        try:
            from backend.utils.audio_normalization import normalize_audio
            normalized_audio = normalize_audio(audio_file)
            if normalized_audio != audio_file:
                logger.info(f"[WHISPER] Using normalized audio: {normalized_audio}")
        except Exception as e:
            logger.warning(f"[WHISPER] Audio normalization failed, using original: {e}")
            normalized_audio = audio_file
        
    backend = get_whisper_backend()
    logger.info(f"Running Whisper transcription ({backend})...")
    if initial_prompt:
        logger.info(f"[WHISPER] Using initial prompt: {initial_prompt[:100]}...")
    model = get_whisper_model()

    segments = []
    text = ""
    detected_language = "en"  # Default, will be overwritten by Whisper's detection

    if backend == "mlx-whisper":
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
            'large-v3-turbo': 'mlx-community/whisper-large-v3-mlx', # mlx-community/whisper-large-v3-turbo does not exist
        }
        
        # Determine model path
        if WHISPER_HF_REPO:
            # Explicit HF repo override
            mlx_model_path = WHISPER_HF_REPO
        elif WHISPER_MODEL_SIZE.startswith('mlx-community/') or '/' in WHISPER_MODEL_SIZE:
            # Full HuggingFace path provided in WHISPER_MODEL
            mlx_model_path = WHISPER_MODEL_SIZE
            logger.info(f"[MLX] Using full HF path from WHISPER_MODEL: {mlx_model_path}")
        else:
            # Map model size to HF path
            mlx_model_path = mlx_model_map.get(WHISPER_MODEL_SIZE, 'mlx-community/whisper-base-mlx')
        
        # Progress tracking in background thread
        stop_event = threading.Event()
        start_time = time_module.time()
        last_status = ['transcribing']  # Track status for better messages
        overtime_warned = [False]  # Track if we've warned about overtime

        def progress_reporter():
            while not stop_event.is_set():
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

                # Use event.wait() instead of sleep for faster response to stop signal
                stop_event.wait(timeout=0.5)
        
        progress_thread = threading.Thread(target=progress_reporter, daemon=True)
        progress_thread.start()

        try:
            # DIRECT MODE (Always use in-process for maximum performance)
            # Legacy version used this and was 100x faster.
            # Since faster-whisper is removed, we don't need subprocess isolation anymore.
            logger.info("[WHISPER] Using DIRECT mode (in-process, faster GPU execution)")
            result = _run_mlx_direct(normalized_audio, mlx_model_path, progress_callback, initial_prompt, language)
        except Exception as mlx_error:
            logger.error(f"mlx-whisper failed: {mlx_error}")
            raise mlx_error
        finally:
            stop_event.set()
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
                "words": s.get("words", []),
                "speaker": None
            })
        text = result.get("text", "")
        detected_language = result.get("language", "en")
        mlx_meta = result.get("meta", {})
        rtf = total_time / audio_duration if audio_duration > 0 else 0
        if mlx_meta.get("mlx_device"):
            logger.info(f"MLX device: {mlx_meta.get('mlx_device')}")
        logger.info(f"mlx-whisper done: {len(segments)} segments, language={detected_language}, took {total_time:.1f}s, rtf={rtf:.3f}")

    elif backend == "faster-whisper":
        logger.info(f"Starting faster-whisper transcription...")
        logger.info(f"[WHISPER] Thresholds: no_speech={WHISPER_NO_SPEECH_THRESHOLD}, compression={WHISPER_COMPRESSION_RATIO_THRESHOLD}, logprob={WHISPER_LOGPROB_THRESHOLD}")
        
        if initial_prompt:
             logger.info(f"[WHISPER] Initial prompt: {initial_prompt[:80]}...")
        if language:
            logger.info(f"[WHISPER] Forced language: {language}")

        try:
            transcribe_kwargs = {
                'beam_size': WHISPER_BEAM_SIZE,
                'initial_prompt': initial_prompt,
                'word_timestamps': True,
                'condition_on_previous_text': WHISPER_CONDITION_ON_PREVIOUS,
                'vad_filter': True,
                'vad_parameters': dict(min_silence_duration_ms=500),
                'no_speech_threshold': WHISPER_NO_SPEECH_THRESHOLD,
                'compression_ratio_threshold': WHISPER_COMPRESSION_RATIO_THRESHOLD,
                'log_prob_threshold': WHISPER_LOGPROB_THRESHOLD,
            }
            
            # Add language if specified
            if language:
                transcribe_kwargs['language'] = language
            
            segments_gen, info = model.transcribe(normalized_audio, **transcribe_kwargs)

            for segment in segments_gen:
                segments.append({
                    "start": segment.start,
                    "end": segment.end,
                    "text": segment.text.strip(),
                    "words": [{"start": w.start, "end": w.end, "word": w.word} for w in segment.words] if segment.words else [],
                    "speaker": None
                })
            
            text = " ".join([s["text"] for s in segments])
            detected_language = info.language
            logger.info(f"faster-whisper done: {len(segments)} segments, language={detected_language}")
            
        except Exception as e:
            logger.error(f"faster-whisper transcription failed: {e}")
            raise e

    else:
        # openai-whisper
        try:
            device = next(model.parameters()).device
            device_str = str(device)
        except (StopIteration, RuntimeError):
            device_str = "cpu"

        fp16 = device_str == "cuda"
        logger.info(f"Starting openai-whisper transcription (fp16={fp16}, device={device_str})...")
        logger.info(f"[WHISPER] Thresholds: no_speech={WHISPER_NO_SPEECH_THRESHOLD}, compression={WHISPER_COMPRESSION_RATIO_THRESHOLD}, logprob={WHISPER_LOGPROB_THRESHOLD}")
        if initial_prompt:
            logger.info(f"[WHISPER] Initial prompt: {initial_prompt[:80]}...")
        
        # Build transcribe kwargs
        transcribe_kwargs = {
            'fp16': fp16,
            'word_timestamps': True,
            'no_speech_threshold': WHISPER_NO_SPEECH_THRESHOLD,
            'compression_ratio_threshold': WHISPER_COMPRESSION_RATIO_THRESHOLD,
            'logprob_threshold': WHISPER_LOGPROB_THRESHOLD,
            'condition_on_previous_text': WHISPER_CONDITION_ON_PREVIOUS,
            'beam_size': WHISPER_BEAM_SIZE, # Add beam_size
        }
        
        if initial_prompt:
            transcribe_kwargs['initial_prompt'] = initial_prompt
        
        # Enable word timestamps for openai-whisper with configurable thresholds
        result = model.transcribe(normalized_audio, **transcribe_kwargs)

        # openai-whisper structure with word_timestamps=True might differ slightly or be same
        # It typically returns 'segments' with 'words' inside if supported
        for s in result.get("segments", []):
            # We want to keep the raw segment structure for now, but we will re-process it later
            # if we are doing word-level diarization.
            # But here we just populate the initial list.
            segments.append({
                "start": s.get("start"),
                "end": s.get("end"),
                "text": s.get("text", "").strip(),
                "words": s.get("words", []),
                "speaker": None
            })
        text = result.get("text", "")
        detected_language = result.get("language", "en")

    # VAD Filtering - remove hallucinated segments in silence
    # NOTE: faster-whisper already does this with vad_filter=True
    # We only need this manual pass for openai-whisper or mlx-whisper (if they don't have it built-in)
    should_run_vad = ENABLE_VAD
    if backend == "faster-whisper":
        should_run_vad = False
        logger.info("Skipping manual VAD (faster-whisper handles it internally)")

    if should_run_vad:
        speech_timestamps = get_speech_timestamps(normalized_audio, progress_callback)
        if speech_timestamps:
            segments = filter_segments_by_vad(segments, speech_timestamps)
    
    # Hallucination filtering - remove repeated text patterns
    segments = filter_hallucinations(segments)
    
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
            # Build kwargs with optional speaker count hints
            diarization_kwargs = {'hook': None}  # Will be set in context
            if MIN_SPEAKERS:
                diarization_kwargs['min_speakers'] = MIN_SPEAKERS
                logger.info(f"[DIARIZATION] Using min_speakers={MIN_SPEAKERS}")
            if MAX_SPEAKERS:
                diarization_kwargs['max_speakers'] = MAX_SPEAKERS
                logger.info(f"[DIARIZATION] Using max_speakers={MAX_SPEAKERS}")
            
            try:
                with CustomProgressHook(progress_callback) as hook:
                    diarization_kwargs['hook'] = hook
                    diarization = pipeline(diarization_audio, **diarization_kwargs)
            except Exception as e:
                # If MPS fails (common with SparseMPS error), try fallback to CPU
                # We check the error message or device to decide
                device = getattr(pipeline, "device", None)
                if device and device.type == "mps":
                    logger.warning(f"Diarization failed on MPS ({e}). Falling back to CPU...")
                    torch = _ensure_torch()
                    pipeline.to(torch.device("cpu"))
                    with CustomProgressHook(progress_callback) as hook:
                        diarization_kwargs['hook'] = hook
                        diarization = pipeline(diarization_audio, **diarization_kwargs)
                    logger.info("Diarization succeeded on CPU fallback.")
                else:
                    raise e  # Re-raise if not MPS related or already on CPU
            
            # Match speakers using SEGMENT-LEVEL approach (more stable than word-level)
            # This preserves Whisper's natural sentence boundaries and reduces noise
            
            diarization_turns = list(diarization.itertracks(yield_label=True))
            logger.info(f"[DIARIZATION] Found {len(diarization_turns)} speaker turns")
            logger.info(f"[DIARIZATION] Processing {len(segments)} segments for speaker assignment")
            
            # Use configurable limits from config.py
            max_duration = MAX_SUBTITLE_DURATION
            max_words = MAX_SUBTITLE_WORDS
            
            new_segments = []
            
            for seg in segments:
                seg_start = seg["start"]
                seg_end = seg["end"]
                seg_text = seg.get("text", "").strip()
                seg_words = seg.get("words", [])
                
                # Find speaker with most overlap for this segment
                speaker_overlaps = {}
                for turn, _, speaker in diarization_turns:
                    overlap_start = max(seg_start, turn.start)
                    overlap_end = min(seg_end, turn.end)
                    overlap_duration = max(0, overlap_end - overlap_start)
                    
                    if overlap_duration > 0:
                        speaker_overlaps[speaker] = speaker_overlaps.get(speaker, 0) + overlap_duration
                
                if speaker_overlaps:
                    best_speaker = max(speaker_overlaps, key=speaker_overlaps.get)
                else:
                    best_speaker = "SPEAKER_00"
                
                # Check if segment needs to be split (too long or too many words)
                duration = seg_end - seg_start
                word_count = len(seg_words) if seg_words else len(seg_text.split())
                
                if duration <= max_duration and word_count <= max_words:
                    # Segment is fine, keep it
                    new_segments.append({
                        "start": seg_start,
                        "end": seg_end,
                        "text": seg_text,
                        "speaker": best_speaker
                    })
                else:
                    # Segment is too long, split it
                    if seg_words:
                        # Split by words
                        current_words = []
                        current_start = None
                        
                        for w in seg_words:
                            if current_start is None:
                                current_start = w.get("start", seg_start)
                            
                            current_words.append(w.get("word", ""))
                            current_end = w.get("end", seg_end)
                            current_duration = current_end - current_start
                            
                            # Check limits
                            if len(current_words) >= max_words or current_duration >= max_duration:
                                # Close this sub-segment
                                text = "".join(current_words).strip()
                                if text:
                                    new_segments.append({
                                        "start": current_start,
                                        "end": current_end,
                                        "text": text,
                                        "speaker": best_speaker
                                    })
                                current_words = []
                                current_start = None
                        
                        # Handle remaining words
                        if current_words:
                            text = "".join(current_words).strip()
                            if text:
                                new_segments.append({
                                    "start": current_start,
                                    "end": seg_end,
                                    "text": text,
                                    "speaker": best_speaker
                                })
                    else:
                        # No word-level data, split by time
                        words = seg_text.split()
                        chunk_size = min(max_words, len(words))
                        time_per_word = duration / len(words) if words else duration
                        
                        for i in range(0, len(words), chunk_size):
                            chunk_words = words[i:i + chunk_size]
                            chunk_start = seg_start + (i * time_per_word)
                            chunk_end = seg_start + ((i + len(chunk_words)) * time_per_word)
                            
                            new_segments.append({
                                "start": chunk_start,
                                "end": min(chunk_end, seg_end),
                                "text": " ".join(chunk_words),
                                "speaker": best_speaker
                            })
            
            # Replace segments
            if new_segments:
                segments = new_segments
                logger.info(f"[DIARIZATION] Produced {len(segments)} segments with speaker labels")
                
                # Apply smoothing to reduce speaker flicker
                segments = smooth_speaker_segments(segments)
            else:
                # Fallback: just add speaker to original segments
                for s in segments:
                    if s.get("speaker") is None:
                        s["speaker"] = "SPEAKER_00"

            logger.info("Diarization complete.")
        except Exception as e:
            logger.error(f"Diarization failed: {e}")
            import traceback
            logger.error(traceback.format_exc())
            # Ensure segments at least have a default speaker if diarization crashed
            for s in segments:
                if s.get("speaker") is None:
                    s["speaker"] = "SPEAKER_00"

    return {
        "segments": segments,
        "text": text,
        "language": detected_language
    }
