import os

# Base paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(BASE_DIR, 'cache')

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

# Whisper Config
WHISPER_MODEL_SIZE = os.getenv('WHISPER_MODEL', 'base')  # tiny, base, small, medium, large
WHISPER_QUANTIZED = os.getenv('WHISPER_QUANTIZED', 'false').lower() == 'true'
WHISPER_HF_REPO = os.getenv('WHISPER_HF_REPO')

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
WHISPER_NO_SPEECH_THRESHOLD = float(os.getenv('WHISPER_NO_SPEECH_THRESHOLD', '0.4'))  # Default was 0.6
WHISPER_COMPRESSION_RATIO_THRESHOLD = float(os.getenv('WHISPER_COMPRESSION_RATIO_THRESHOLD', '2.4'))
WHISPER_LOGPROB_THRESHOLD = float(os.getenv('WHISPER_LOGPROB_THRESHOLD', '-1.0'))
WHISPER_CONDITION_ON_PREVIOUS = os.getenv('WHISPER_CONDITION_ON_PREVIOUS', 'true').lower() == 'true'
