from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_socketio import SocketIO
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
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
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

# Load environment variables
load_dotenv()

from backend.config import (
    LOG_LEVEL, LOG_JSON, LOG_FILE, CACHE_DIR,
    ENABLE_WHISPER, SERVER_API_KEY, COOKIES_FILE,
    ENABLE_DIARIZATION, HF_TOKEN
)
from backend.utils.logging_utils import setup_logging
from backend.services.whisper_service import get_whisper_backend

# Setup logging
logger = setup_logging(
    level=LOG_LEVEL,
    json_format=LOG_JSON,
    log_file=LOG_FILE
)

app = Flask(__name__)
CORS(app)
# Use threading mode for MLX compatibility (gevent causes performance issues with Apple Silicon/MLX)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# Rate limiting configuration
# Limits: 30 requests/minute for general endpoints, 5/minute for heavy processing
limiter = Limiter(
    key_func=get_remote_address,
    app=app,
    default_limits=["60 per minute"],
    storage_uri="memory://",
)

# Request size limit (10MB max for POST requests)
MAX_CONTENT_LENGTH = 10 * 1024 * 1024  # 10MB

@app.before_request
def validate_request():
    """Validate incoming requests for size limits."""
    if request.method == 'POST':
        content_length = request.content_length
        if content_length and content_length > MAX_CONTENT_LENGTH:
            return jsonify({
                'error': 'Request too large',
                'max_size_mb': MAX_CONTENT_LENGTH // (1024 * 1024)
            }), 413

# Error handlers
@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors."""
    return jsonify({
        'error': 'Not found',
        'message': 'The requested endpoint does not exist'
    }), 404

@app.errorhandler(500)
def internal_error(error):
    """Handle 500 errors."""
    logger.exception("Internal server error")
    return jsonify({
        'error': 'Internal server error',
        'message': 'An unexpected error occurred'
    }), 500

@app.errorhandler(429)
def rate_limit_exceeded(error):
    """Handle rate limit exceeded errors."""
    return jsonify({
        'error': 'Rate limit exceeded',
        'message': 'Too many requests. Please try again later.',
        'retry_after': error.description if hasattr(error, 'description') else '60 seconds'
    }), 429

# Ensure cache directory exists
os.makedirs(CACHE_DIR, exist_ok=True)

# Register Blueprints
from backend.routes.health import health_bp, set_models_ready
from backend.routes.subtitles import subtitles_bp
from backend.routes.transcribe import transcribe_bp
from backend.routes.translation import translation_bp, init_limiter as init_translation_limiter

app.register_blueprint(health_bp)
app.register_blueprint(subtitles_bp)
app.register_blueprint(transcribe_bp)
app.register_blueprint(translation_bp)

# Note: set_models_ready(True) is called AFTER preload_models() in __main__
# This prevents RunPod Load Balancer from routing traffic before models are loaded

from backend.routes.live import live_bp, init_socketio as init_live_socketio
app.register_blueprint(live_bp)
init_live_socketio(socketio)

# Initialize rate limiter for routes that need custom limits
init_translation_limiter(limiter)

# Startup Banner
def print_banner():
    print("\n" + "="*60)
    print(" VIDEO TRANSLATE BACKEND")
    backend = get_whisper_backend()
    print(f" - Whisper Backend: {backend}")
    
    if backend == "mlx-whisper":
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

from backend.preload_models import preload_models
from backend.services.cache_service import start_cache_scheduler

if __name__ == '__main__':
    print_banner()
    port = int(os.getenv('PORT', 5001))
    
    # Initialize services on startup
    logger.info("Initializing services...")
    
    # 1. Start cache cleanup scheduler
    start_cache_scheduler()
    
    # 2. Pre-load models (RunPod Load Balancer optimization)
    # This ensures first request doesn't timeout (502)
    try:
        if os.environ.get('PLATFORM') == 'runpod':
            logger.info("Pre-loading models for RunPod...")
            preload_models()
    except Exception as e:
        logger.error(f"Failed to preload models: {e}")

    # 3. NOW mark server as ready (after models are loaded)
    set_models_ready(True)
    logger.info("Server marked as ready for traffic")

    logger.info(f"Starting SocketIO server on port {port}...")
    socketio.run(app, host='0.0.0.0', port=port, debug=False, log_output=True)
