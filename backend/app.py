from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import os
import platform
import warnings

# Suppress warnings
warnings.filterwarnings("ignore", message=".*torchaudio.*deprecated.*")
warnings.filterwarnings("ignore", message=".*TorchCodec.*")
warnings.filterwarnings("ignore", category=UserWarning, module="torchaudio")
warnings.filterwarnings("ignore", category=UserWarning, module="pyannote")

# Enable MPS fallback
os.environ["PYTORCH_ENABLE_MPS_FALLBACK"] = "1"

# Load environment variables
load_dotenv()

from backend.config import (
    LOG_LEVEL, LOG_JSON, LOG_FILE, CACHE_DIR,
    ENABLE_WHISPER, SERVER_API_KEY, COOKIES_FILE,
    ENABLE_DIARIZATION, HF_TOKEN
)
from backend.utils.logging_utils import setup_logging
from backend.services.whisper_service import WHISPER_BACKEND

# Setup logging
logger = setup_logging(
    level=LOG_LEVEL,
    json_format=LOG_JSON,
    log_file=LOG_FILE
)

app = Flask(__name__)
CORS(app)

# Ensure cache directory exists
os.makedirs(CACHE_DIR, exist_ok=True)

# Register Blueprints
from backend.routes.health import health_bp
from backend.routes.subtitles import subtitles_bp
from backend.routes.transcribe import transcribe_bp
from backend.routes.translation import translation_bp

app.register_blueprint(health_bp)
app.register_blueprint(subtitles_bp)
app.register_blueprint(transcribe_bp)
app.register_blueprint(translation_bp)

# Startup Banner
def print_banner():
    print("\n" + "="*60)
    print(" VIDEO TRANSLATE BACKEND")
    print(f" - Whisper Backend: {WHISPER_BACKEND}")
    
    if WHISPER_BACKEND == "mlx-whisper":
        print(" - GPU Acceleration: ENABLED (Apple Silicon Metal)")
    elif platform.system() == "Darwin" and platform.machine() == "arm64":
        print(" - GPU Acceleration: DISABLED (install mlx-whisper for Metal GPU)")
        
    print(" - Audio Cache: ENABLED")
    
    if ENABLE_DIARIZATION and HF_TOKEN:
        print(" - Speaker Diarization: ENABLED (CPU mode)")
    elif ENABLE_DIARIZATION:
        print(" - Speaker Diarization: DISABLED (HF_TOKEN not set)")
    else:
        print(" - Speaker Diarization: DISABLED")
        
    print("="*60 + "\n")
    logger.info(f"Server Configuration: ENABLE_WHISPER={ENABLE_WHISPER}, Tier3Enabled={bool(SERVER_API_KEY)}, Cookies={'Yes' if COOKIES_FILE else 'No'}")

print_banner()

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5001))
    app.run(host='0.0.0.0', port=port, debug=False)
