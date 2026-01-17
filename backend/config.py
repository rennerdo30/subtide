import os
import platform


def detect_platform():
    """
    Detect the runtime platform for backend selection.

    Returns:
        'runpod' - RunPod/NVIDIA GPU cloud
        'macos' - Apple Silicon Mac
        'linux-cuda' - Linux with NVIDIA GPU
        'linux-cpu' - Linux without GPU
        'windows' - Windows
    """
    # Allow explicit override
    explicit_platform = os.getenv('PLATFORM')
    if explicit_platform:
        return explicit_platform

    # Detect Apple Silicon
    if platform.system() == 'Darwin' and platform.machine() == 'arm64':
        return 'macos'

    # Detect Windows
    if platform.system() == 'Windows':
        return 'windows'

    # Check for CUDA availability
    try:
        import torch
        if torch.cuda.is_available():
            return 'linux-cuda'
    except ImportError:
        pass

    return 'linux-cpu'


# Platform detection
PLATFORM = detect_platform()

# Base paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.getenv('CACHE_DIR', os.path.join(BASE_DIR, 'cache'))
# MODEL_CACHE_DIR is for the AI model weights (persistent, mountable)
MODEL_CACHE_DIR = os.getenv('MODEL_CACHE_DIR', os.path.join(os.path.expanduser("~"), '.cache', 'subtide-models'))

# Cache limits (for RunPod/serverless where storage is limited)
CACHE_MAX_SIZE_MB = int(os.getenv('CACHE_MAX_SIZE_MB', '5000'))  # 5GB default
CACHE_AUDIO_TTL_HOURS = int(os.getenv('CACHE_AUDIO_TTL_HOURS', '24'))  # 24 hours default
CACHE_CLEANUP_INTERVAL_MINUTES = int(os.getenv('CACHE_CLEANUP_INTERVAL_MINUTES', '30'))  # 30 min default

# Logging
LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')
LOG_JSON = os.getenv('LOG_JSON', 'false').lower() == 'true'
LOG_FILE = os.getenv('LOG_FILE')

# Feature Flags
ENABLE_WHISPER = os.getenv('ENABLE_WHISPER', 'true').lower() == 'true'
HF_TOKEN = os.getenv('HF_TOKEN')
ENABLE_DIARIZATION = os.getenv('ENABLE_DIARIZATION', 'true').lower() == 'true' and bool(HF_TOKEN)
DIARIZATION_MODE = os.getenv('DIARIZATION_MODE', 'on')  # on|off|deferred

# Cookies
COOKIES_FILE = os.getenv('COOKIES_FILE')

# Server Config (Tier 3)
SERVER_API_KEY = os.getenv('SERVER_API_KEY')
SERVER_MODEL = os.getenv('SERVER_MODEL', 'gpt-3.5-turbo')
SERVER_API_URL = os.getenv('SERVER_API_URL')

# Language-specific model mapping (JSON format)
# Example: {"ja":"claude-3-haiku","ko":"claude-3-haiku","zh":"gemini-2.0-flash","default":"gpt-4o-mini"}
_MODEL_LANG_MAP_STR = os.getenv('MODEL_LANG_MAP', '{}')
try:
    import json
    MODEL_LANG_MAP = json.loads(_MODEL_LANG_MAP_STR)
except (json.JSONDecodeError, TypeError, ValueError):
    MODEL_LANG_MAP = {}


def get_model_for_language(target_lang: str) -> str:
    """Get the best model for a target language.
    
    Falls back to SERVER_MODEL if no specific mapping exists.
    """
    # Check exact match
    if target_lang in MODEL_LANG_MAP:
        return MODEL_LANG_MAP[target_lang]
    
    # Check base language (e.g., 'zh' for 'zh-CN')
    base_lang = target_lang.split('-')[0]
    if base_lang in MODEL_LANG_MAP:
        return MODEL_LANG_MAP[base_lang]
    
    # Use default from map or fall back to SERVER_MODEL
    return MODEL_LANG_MAP.get('default', SERVER_MODEL)

# Whisper Config
WHISPER_MODEL_SIZE = os.getenv('WHISPER_MODEL', 'base')  # tiny, base, small, medium, large
WHISPER_QUANTIZED = os.getenv('WHISPER_QUANTIZED', 'false').lower() == 'true'
WHISPER_HF_REPO = os.getenv('WHISPER_HF_REPO')
# Force source language detection (e.g., 'ja' for Japanese, 'en' for English)
# Set to None or empty for auto-detection
WHISPER_LANGUAGE = os.getenv('WHISPER_LANGUAGE', '') or None

# Supported Languages
LANG_NAMES = {
    'en': 'English', 'ja': 'Japanese', 'ko': 'Korean', 
    'zh-CN': 'Chinese (Simplified)', 'zh-TW': 'Chinese (Traditional)',
    'es': 'Spanish', 'fr': 'French', 'de': 'German',
    'pt': 'Portuguese', 'ru': 'Russian', 'ar': 'Arabic',
    'hi': 'Hindi', 'it': 'Italian', 'nl': 'Dutch',
    'pl': 'Polish', 'tr': 'Turkish', 'vi': 'Vietnamese',
    'th': 'Thai', 'id': 'Indonesian'
}

# VAD (Voice Activity Detection) Config
ENABLE_VAD = os.getenv('ENABLE_VAD', 'true').lower() == 'true'
VAD_THRESHOLD = float(os.getenv('VAD_THRESHOLD', '0.5'))  # Speech probability threshold

# Subtitle Segment Limits
MAX_SUBTITLE_DURATION = float(os.getenv('MAX_SUBTITLE_DURATION', '6.0'))  # seconds
MAX_SUBTITLE_WORDS = int(os.getenv('MAX_SUBTITLE_WORDS', '15'))

# Speaker Diarization Tuning
MIN_SPEAKERS = int(os.getenv('MIN_SPEAKERS', '0')) or None  # 0 = auto-detect
MAX_SPEAKERS = int(os.getenv('MAX_SPEAKERS', '0')) or None  # 0 = auto-detect
DIARIZATION_SMOOTHING = os.getenv('DIARIZATION_SMOOTHING', 'true').lower() == 'true'
MIN_SEGMENT_DURATION = float(os.getenv('MIN_SEGMENT_DURATION', '1.0'))  # Merge segments shorter than this

# Whisper Transcription Thresholds
# Lower values = more sensitive (captures more speech, but may include noise/hallucinations)
# Higher values = stricter (cleaner output, but may miss soft speech)
WHISPER_NO_SPEECH_THRESHOLD = float(os.getenv('WHISPER_NO_SPEECH_THRESHOLD', '0.6'))
WHISPER_COMPRESSION_RATIO_THRESHOLD = float(os.getenv('WHISPER_COMPRESSION_RATIO_THRESHOLD', '2.4'))
WHISPER_LOGPROB_THRESHOLD = float(os.getenv('WHISPER_LOGPROB_THRESHOLD', '-1.0'))
WHISPER_CONDITION_ON_PREVIOUS = os.getenv('WHISPER_CONDITION_ON_PREVIOUS', 'false').lower() == 'true'
WHISPER_BEAM_SIZE = int(os.getenv('WHISPER_BEAM_SIZE', '5'))


# ============================================================================
# Platform-Specific Backend Selection
# ============================================================================

def get_whisper_backend_type():
    """Get the appropriate Whisper backend for this platform."""
    override = os.getenv('WHISPER_BACKEND')
    if override:
        return override

    if PLATFORM == 'runpod':
        return 'faster-whisper'
    elif PLATFORM == 'macos':
        return 'mlx-whisper'
    else:
        return 'openai-whisper'


def get_diarization_backend_type():
    """Get the appropriate diarization backend for this platform."""
    override = os.getenv('DIARIZATION_BACKEND')
    if override:
        return override

    if PLATFORM == 'runpod':
        return 'nemo'
    else:
        return 'pyannote'


WHISPER_BACKEND = get_whisper_backend_type()
DIARIZATION_BACKEND = get_diarization_backend_type()
