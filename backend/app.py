from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import yt_dlp
import requests
import whisper
import tempfile
import time
from openai import OpenAI
import os
import json
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

from logging_config import setup_logging

# Configure logging based on environment
LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')
LOG_JSON = os.getenv('LOG_JSON', 'false').lower() == 'true'
LOG_FILE = os.getenv('LOG_FILE')

logger = setup_logging(
    level=LOG_LEVEL,
    json_format=LOG_JSON,
    log_file=LOG_FILE
)

app = Flask(__name__)
CORS(app)

# Configuration
CACHE_DIR = os.path.join(os.path.dirname(__file__), 'cache')
os.makedirs(CACHE_DIR, exist_ok=True)

# Environment Variables for Tier Configuration
ENABLE_WHISPER = os.getenv('ENABLE_WHISPER', 'true').lower() == 'true'
SERVER_API_KEY = os.getenv('SERVER_API_KEY')  # For Tier 3 managed translation
SERVER_MODEL = os.getenv('SERVER_MODEL', 'gpt-4o-mini')
SERVER_API_URL = os.getenv('SERVER_API_URL', 'https://api.openai.com/v1')
COOKIES_FILE = os.getenv('COOKIES_FILE')  # Path to cookies.txt for YouTube auth

logger.info(f"Server Configuration: ENABLE_WHISPER={ENABLE_WHISPER}, Tier3Enabled={bool(SERVER_API_KEY)}, Cookies={'Yes' if COOKIES_FILE else 'No'}")

# Whisper model (lazy loaded)
_whisper_model = None
WHISPER_MODEL_SIZE = os.getenv('WHISPER_MODEL', 'base')  # tiny, base, small, medium, large


def get_whisper_device():
    """Detect best available device for Whisper."""
    import torch
    if torch.cuda.is_available():
        return "cuda"
    elif torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def get_whisper_fp16():
    """Determine if fp16 should be used. MPS requires fp16=False to avoid NaN errors."""
    import torch
    if torch.cuda.is_available():
        return True  # CUDA supports fp16
    return False  # MPS and CPU need fp16=False


def get_whisper_model():
    """Lazy load Whisper model with GPU support."""
    global _whisper_model
    if _whisper_model is None:
        device = get_whisper_device()
        logger.info(f"Loading Whisper model '{WHISPER_MODEL_SIZE}' on {device.upper()}...")
        _whisper_model = whisper.load_model(WHISPER_MODEL_SIZE, device=device)
        logger.info(f"Whisper model loaded successfully on {device.upper()}")
    return _whisper_model


def get_cache_path(video_id: str, suffix: str = 'subtitles') -> str:
    """Generate cache file path for a video."""
    return os.path.join(CACHE_DIR, f"{video_id}_{suffix}.json")


# =============================================================================
# Health Check
# =============================================================================

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint for monitoring."""
    return jsonify({
        'status': 'ok',
        'service': 'video-translate-backend',
        'features': {
            'whisper': ENABLE_WHISPER,
            'tier3': bool(SERVER_API_KEY)
        },
        'config': {
            'model': SERVER_MODEL,
            'context_size': get_model_context_size(SERVER_MODEL)
        } if SERVER_API_KEY else None
    })


# Known model context sizes (in tokens) - Updated December 2024
MODEL_CONTEXT_SIZES = {
    # OpenAI
    'gpt-4o': 128000,
    'gpt-4o-mini': 128000,
    'gpt-4-turbo': 128000,
    'gpt-4-turbo-preview': 128000,
    'gpt-4': 8192,
    'gpt-4-32k': 32768,
    'gpt-3.5-turbo': 16385,
    'gpt-3.5-turbo-16k': 16385,
    'o1': 200000,
    'o1-mini': 128000,
    'o1-preview': 128000,
    # Google Gemini
    'gemini-3': 1000000,  # Gemini 3 preview models
    'gemini-2.0-flash': 1000000,
    'gemini-2.0-flash-exp': 1000000,
    'gemini-2.0': 1000000,
    'gemini-1.5-pro': 2000000,
    'gemini-1.5-flash': 1000000,
    'gemini-1.5': 1000000,
    'gemini-1.0-pro': 32000,
    'gemini-pro': 32000,
    # Anthropic Claude
    'claude-3-opus': 200000,
    'claude-3-sonnet': 200000,
    'claude-3-haiku': 200000,
    'claude-3.5-sonnet': 200000,
    'claude-3.5-haiku': 200000,
    'claude-2': 100000,
    # Meta Llama
    'llama-3.3': 128000,
    'llama-3.2': 128000,
    'llama-3.1': 128000,
    'llama-3': 8192,
    'llama-2': 4096,
    'llama': 4096,
    # Mistral
    'mistral-large': 128000,
    'mistral-medium': 32768,
    'mistral-small': 32768,
    'mistral-7b': 32768,
    'mixtral': 32768,
    'mistral': 32768,
    # Qwen
    'qwen-2.5': 131072,
    'qwen-2': 131072,
    'qwen': 32768,
    # DeepSeek
    'deepseek-v3': 128000,
    'deepseek-v2': 128000,
    'deepseek': 64000,
    # Cohere
    'command-r-plus': 128000,
    'command-r': 128000,
    'command': 4096,
}


def get_model_context_size(model_name):
    """Get context size for a model, with sensible defaults."""
    if not model_name:
        return 8192
    
    model_lower = model_name.lower()
    
    # Check exact match first
    if model_name in MODEL_CONTEXT_SIZES:
        return MODEL_CONTEXT_SIZES[model_name]
    
    # Check partial matches
    for key, size in MODEL_CONTEXT_SIZES.items():
        if key in model_lower:
            return size
    
    # Default for unknown models
    return 8192


@app.route('/api/model-info', methods=['GET'])
def get_model_info():
    """Get model information including context size for smart batching."""
    if not SERVER_API_KEY:
        return jsonify({'error': 'Tier 3 not configured'}), 400
    
    context_size = get_model_context_size(SERVER_MODEL)
    
    # Calculate recommended batch size
    # Use ~30% of context for input subtitles (leaving room for output + prompt)
    # Cap at 32K tokens to avoid overly large requests
    recommended_tokens = min(context_size * 30 // 100, 32000)
    
    return jsonify({
        'model': SERVER_MODEL,
        'context_size': context_size,
        'recommended_batch_tokens': recommended_tokens,
        'api_url': SERVER_API_URL
    })


# =============================================================================
# Subtitle Fetching (Tier 1+)
# =============================================================================

@app.route('/api/subtitles', methods=['GET'])
def get_subtitles():
    """
    Fetch YouTube subtitles using yt-dlp.
    Available on all tiers.
    """
    video_id = request.args.get('video_id')
    lang = request.args.get('lang', 'en')

    if not video_id:
        return jsonify({'error': 'video_id is required'}), 400

    # Check cache first
    cache_path = get_cache_path(video_id, f'subs_{lang}')
    if os.path.exists(cache_path):
        logger.info(f"Cache hit: {video_id} ({lang})")
        try:
            with open(cache_path, 'r', encoding='utf-8') as f:
                return jsonify(json.load(f))
        except Exception as e:
            logger.warning(f"Cache read error: {e}")

    logger.info(f"Fetching subtitles: {video_id} (lang={lang})")
    url = f"https://www.youtube.com/watch?v={video_id}"

    ydl_opts = {
        'skip_download': True,
        'writesubtitles': True,
        'writeautomaticsub': True,
        'quiet': True,
        'no_warnings': True,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

            subs = info.get('subtitles') or {}
            auto_subs = info.get('automatic_captions') or {}

            logger.info(f"Available: manual={list(subs.keys())[:5]}, auto={list(auto_subs.keys())[:5]}")

            # Find best matching track
            def find_track(language_code):
                for source in [subs, auto_subs]:
                    if language_code in source:
                        return source[language_code]
                    for key in source:
                        if key.startswith(language_code):
                            return source[key]
                return None

            tracks = find_track(lang)
            if not tracks:
                # Try English as fallback
                tracks = find_track('en')
                if tracks:
                    logger.info(f"Falling back to English subtitles")
                else:
                    return jsonify({
                        'error': f'No subtitles for language: {lang}',
                        'available_manual': list(subs.keys())[:10],
                        'available_auto': list(auto_subs.keys())[:10]
                    }), 404

            # Select best format (prefer json3)
            selected = None
            for fmt in ['json3', 'vtt', 'srv1', 'ttml']:
                for track in tracks:
                    if track.get('ext') == fmt:
                        selected = track
                        break
                if selected:
                    break

            if not selected:
                selected = tracks[0]

            logger.info(f"Selected format: {selected.get('ext')}")

            # Fetch subtitle content with retry for rate limiting
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
            
            max_retries = 3
            res = None
            for attempt in range(max_retries):
                res = requests.get(selected.get('url'), headers=headers, timeout=30)
                
                if res.status_code == 200:
                    break
                elif res.status_code == 429:
                    wait_time = (attempt + 1) * 2
                    logger.warning(f"Rate limited, waiting {wait_time}s before retry...")
                    time.sleep(wait_time)
                else:
                    return jsonify({
                        'error': f'YouTube returned status {res.status_code}',
                        'retry': True
                    }), 502
            
            if res.status_code != 200:
                return jsonify({
                    'error': 'Rate limited by YouTube. Try again in a moment.',
                    'retry': True
                }), 429

            # Parse and cache if JSON
            if selected.get('ext') == 'json3':
                try:
                    json_data = res.json()
                    with open(cache_path, 'w', encoding='utf-8') as f:
                        json.dump(json_data, f, indent=2)
                    return jsonify(json_data)
                except Exception as e:
                    logger.warning(f"JSON parse error: {e}")
                    return Response(res.content, mimetype='application/json')

            return Response(res.content, mimetype='text/plain')

    except Exception as e:
        logger.exception("Subtitle fetch error")
        return jsonify({'error': str(e)}), 500


# =============================================================================
# Whisper Transcription (Tier 2+)
# =============================================================================

@app.route('/api/transcribe', methods=['GET'])
def transcribe_video():
    """
    Transcribe video audio using Whisper.
    Requires Tier 2 or Tier 3.
    """
    video_id = request.args.get('video_id')
    tier = request.args.get('tier', 'tier1')

    # Tier check
    if tier == 'tier1':
        return jsonify({
            'error': 'Whisper transcription requires Tier 2 or higher',
            'upgrade': True
        }), 403

    if not ENABLE_WHISPER:
        return jsonify({'error': 'Whisper is disabled on this server'}), 403

    if not video_id:
        return jsonify({'error': 'video_id is required'}), 400

    # Check cache
    cache_path = get_cache_path(video_id, 'transcribed')
    if os.path.exists(cache_path):
        logger.info(f"Transcription cache hit: {video_id}")
        try:
            with open(cache_path, 'r', encoding='utf-8') as f:
                return jsonify(json.load(f))
        except Exception as e:
            logger.warning(f"Cache read error: {e}")

    logger.info(f"Transcribing video: {video_id}")
    url = f"https://www.youtube.com/watch?v={video_id}"

    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            # Download audio with better options to avoid 403
            ydl_opts = {
                'format': 'bestaudio[ext=m4a]/bestaudio/best',
                'outtmpl': os.path.join(temp_dir, 'audio.%(ext)s'),
                'postprocessors': [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '128',
                }],
                'quiet': True,
                'no_warnings': True,
                'extract_flat': False,
                'http_headers': {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept-Language': 'en-US,en;q=0.9',
                },
                'socket_timeout': 30,
                'retries': 3,
            }
            
            # Use cookies if available (optional - for better reliability)
            if COOKIES_FILE and os.path.exists(COOKIES_FILE):
                ydl_opts['cookiefile'] = COOKIES_FILE
                logger.info("Using cookies file for authentication")

            logger.info(f"Downloading audio...")
            try:
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    ydl.download([url])
            except Exception as download_err:
                # If download fails, return a specific error suggesting to use YouTube captions
                logger.error(f"Audio download failed: {download_err}")
                return jsonify({
                    'error': 'YouTube blocked audio download. Try using Tier 2 (YouTube captions + your API key) instead.',
                    'details': str(download_err),
                    'fallback': 'tier2'
                }), 503

            # Find audio file
            audio_file = None
            for f in os.listdir(temp_dir):
                if f.startswith('audio'):
                    audio_file = os.path.join(temp_dir, f)
                    break

            if not audio_file:
                return jsonify({
                    'error': 'Audio file not found after download',
                    'fallback': 'tier2'
                }), 500

            # Transcribe
            logger.info("Running Whisper transcription...")
            model = get_whisper_model()
            result = model.transcribe(audio_file, fp16=get_whisper_fp16())

            # Cache result
            with open(cache_path, 'w', encoding='utf-8') as f:
                json.dump(result, f, indent=2)

            logger.info(f"Transcription complete: {len(result.get('segments', []))} segments")
            return jsonify(result)

    except Exception as e:
        logger.exception("Transcription error")
        return jsonify({'error': str(e)}), 500


# =============================================================================
# Translation (All Tiers)
# =============================================================================

LANG_NAMES = {
    'en': 'English', 'ja': 'Japanese', 'ko': 'Korean',
    'zh-CN': 'Chinese (Simplified)', 'zh-TW': 'Chinese (Traditional)',
    'es': 'Spanish', 'fr': 'French', 'de': 'German',
    'pt': 'Portuguese', 'ru': 'Russian', 'ar': 'Arabic',
    'hi': 'Hindi', 'it': 'Italian', 'nl': 'Dutch',
    'pl': 'Polish', 'tr': 'Turkish', 'vi': 'Vietnamese',
    'th': 'Thai', 'id': 'Indonesian'
}


@app.route('/api/translate', methods=['POST'])
def translate_subtitles():
    """
    Translate subtitles using LLM.
    - Tier 1/2: User provides API key
    - Tier 3: Server-managed API key
    """
    data = request.json or {}
    subtitles = data.get('subtitles', [])
    source_lang = data.get('source_lang', 'auto')
    target_lang = data.get('target_lang', 'en')
    model_id = data.get('model')
    api_key = data.get('api_key')
    api_url = data.get('api_url')
    tier = data.get('tier', 'tier1')

    if not subtitles:
        return jsonify({'error': 'No subtitles provided'}), 400

    # Tier 3: Use server-managed API key (override frontend values)
    if tier == 'tier3':
        if SERVER_API_KEY:
            api_key = SERVER_API_KEY
            model_id = SERVER_MODEL  # Always use server model for Tier 3
            api_url = SERVER_API_URL  # Always use server URL for Tier 3
            logger.info(f"Using Tier 3 server config: {api_url} / {model_id}")
        else:
            return jsonify({'error': 'Tier 3 is not configured on this server. Please use your own API key.'}), 400
    elif not api_key:
        return jsonify({'error': 'API key is required for Tier 1/2'}), 400

    if not model_id:
        return jsonify({'error': 'Model is required'}), 400

    # Calculate stats for logging
    total_chars = sum(len(s.get('text', '')) for s in subtitles)
    estimated_tokens = total_chars // 4  # rough estimate
    
    logger.info(f"{'='*60}")
    logger.info(f"TRANSLATION REQUEST")
    logger.info(f"  Subtitles: {len(subtitles)} | Chars: {total_chars} | Est. tokens: {estimated_tokens}")
    logger.info(f"  Direction: {source_lang} -> {target_lang}")
    logger.info(f"  Model: {model_id}")
    logger.info(f"  API URL: {api_url}")
    logger.info(f"{'='*60}")

    # Build prompt
    s_name = LANG_NAMES.get(source_lang, source_lang)
    t_name = LANG_NAMES.get(target_lang, target_lang)
    numbered_subs = "\n".join([f"{i+1}. {s.get('text', '')}" for i, s in enumerate(subtitles)])

    system_prompt = "You are a professional subtitle translator."
    user_prompt = f"""Translate the following subtitles from {s_name} to {t_name}.

Rules:
- Maintain original meaning, tone, and emotion
- Keep translations concise for subtitle display
- Preserve speaker indicators and sound effects in brackets
- Return ONLY numbered translations, one per line
- No explanations or notes

Subtitles:
{numbered_subs}"""

    prompt_tokens = len(user_prompt) // 4
    logger.info(f"Prompt size: ~{prompt_tokens} tokens")

    try:
        # Configure OpenAI client
        client_args = {'api_key': api_key}
        extra_headers = {}

        if api_url:
            client_args['base_url'] = api_url.rstrip('/')
            if 'openrouter.ai' in api_url:
                extra_headers['HTTP-Referer'] = 'https://video-translate.app'
                extra_headers['X-Title'] = 'Video Translate'

        if extra_headers:
            client_args['default_headers'] = extra_headers

        client = OpenAI(**client_args)

        import time
        start_time = time.time()
        logger.info("Sending request to LLM...")

        response = client.chat.completions.create(
            model=model_id,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.3,
            max_tokens=8192  # Increased for larger batches
        )

        elapsed = time.time() - start_time
        logger.info(f"Response received in {elapsed:.2f}s")

        content = response.choices[0].message.content

        # Parse response
        lines = content.strip().split('\n')
        translations = []
        for line in lines:
            cleaned = line.strip()
            # Handle numbered list formats: "1. Text" or "1 Text" or "1) Text"
            if cleaned and cleaned[0].isdigit():
                # Split only on first period or parenthesis
                import re
                match = re.match(r'^\d+[\.\)]\s*(.*)', cleaned)
                if match:
                    cleaned = match.group(1).strip()
            
            if cleaned:
                translations.append(cleaned)

        logger.info(f"Received {len(translations)} translations (Expected {len(subtitles)})")
        
        # Ensure correct count
        expected = len(subtitles)
        if len(translations) != expected:
            logger.warning(f"Translation count mismatch! Expected {expected}, got {len(translations)}")
            if len(translations) < expected:
                logger.warning("Padding with empty strings")
                while len(translations) < expected:
                    translations.append("")
            else:
                logger.warning("Truncating extra translations")
                translations = translations[:expected]

        return jsonify({'translations': translations})

    except Exception as e:
        logger.exception("Translation error")
        return jsonify({'error': str(e)}), 500


# =============================================================================
# Combined Process Endpoint (Tier 3 Only)
# =============================================================================

@app.route('/api/process', methods=['POST'])
def process_video():
    """
    Combined endpoint: fetch subtitles + translate in one call.
    Tier 3 only - uses server-managed API key.
    Returns Server-Sent Events for progress updates.

    Logic:
    1. Check if target language subtitles already exist → use directly (no translation)
    2. Check if manual/creator subtitles exist → download & translate
    3. Only auto-generated? → Use Whisper (better quality than YouTube auto-captions)
    """
    data = request.json or {}
    video_id = data.get('video_id')
    target_lang = data.get('target_lang', 'en')
    force_whisper = data.get('force_whisper', False)
    use_sse = request.headers.get('Accept') == 'text/event-stream'

    if not video_id:
        return jsonify({'error': 'video_id is required'}), 400

    # Tier 3 requires server API key
    if not SERVER_API_KEY:
        return jsonify({
            'error': 'Tier 3 is not configured on this server',
            'details': 'SERVER_API_KEY environment variable not set'
        }), 503

    def generate():
        """Generator for SSE progress updates with threading."""
        import queue
        import threading

        # Queue for progress messages
        progress_queue = queue.Queue()

        def send_sse(stage, message, percent=None, step=None, total_steps=None, eta=None, batch_info=None):
            """Queue a progress message with step and ETA information."""
            data = {'stage': stage, 'message': message}
            if percent is not None:
                data['percent'] = percent
            if step is not None:
                data['step'] = step
            if total_steps is not None:
                data['totalSteps'] = total_steps
            if eta is not None:
                data['eta'] = eta
            if batch_info is not None:
                data['batchInfo'] = batch_info
            progress_queue.put(('progress', data))

        def send_result(result):
            """Queue the final result."""
            progress_queue.put(('result', result))

        def send_error(error):
            """Queue an error."""
            progress_queue.put(('error', str(error)))

        def do_work():
            """Background worker that does the actual processing."""
            try:
                # Check translation cache first
                translation_cache_path = get_cache_path(video_id, f'translated_{target_lang}')
                if os.path.exists(translation_cache_path) and not force_whisper:
                    logger.info(f"[PROCESS] Using cached translation for {video_id} -> {target_lang}")
                    send_sse('complete', 'Using cached translation', 100)
                    with open(translation_cache_path, 'r', encoding='utf-8') as f:
                        cached_result = json.load(f)
                    send_result(cached_result)
                    return

                url = f"https://www.youtube.com/watch?v={video_id}"
                subtitles = []
                source_type = None
                needs_translation = True

                # Define total steps based on whether translation will be needed
                # We'll update this later if we know translation is needed
                # Steps: 1-Checking, 2-Downloading/Whisper, 3-Translating (optional), 4-Complete
                
                # Step 1: Check available subtitles
                send_sse('checking', 'Checking available subtitles...', 5, step=1, total_steps=4)
                logger.info(f"[PROCESS] Starting: video={video_id}, target={target_lang}")

                ydl_opts = {
                    'skip_download': True,
                    'writesubtitles': True,
                    'writeautomaticsub': True,
                    'quiet': True,
                    'no_warnings': True,
                }

                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(url, download=False)
                    manual_subs = info.get('subtitles') or {}
                    auto_subs = info.get('automatic_captions') or {}

                logger.info(f"[PROCESS] Manual subs: {list(manual_subs.keys())}")

                # Priority 1: Target language MANUAL subs exist
                if target_lang in manual_subs:
                    send_sse('downloading', f'Found {target_lang} subtitles!', 20, step=2, total_steps=3)
                    source_type = 'youtube_direct'
                    needs_translation = False
                    subtitles = await_download_subtitles(video_id, target_lang, manual_subs[target_lang])

                # Priority 2: Manual subtitles in another language
                elif manual_subs and not force_whisper:
                    source_lang = 'en' if 'en' in manual_subs else list(manual_subs.keys())[0]
                    send_sse('downloading', f'Downloading {source_lang} subtitles...', 20, step=2, total_steps=4)
                    source_type = 'youtube_manual'
                    subtitles = await_download_subtitles(video_id, source_lang, manual_subs[source_lang])

                # Priority 3: Use Whisper
                elif ENABLE_WHISPER:
                    send_sse('whisper', 'Downloading audio...', 10, step=2, total_steps=4)
                    source_type = 'whisper'

                    # Check cache first
                    cache_path = get_cache_path(video_id, 'whisper')
                    if os.path.exists(cache_path):
                        send_sse('whisper', 'Using cached transcription', 50, step=2, total_steps=4)
                        with open(cache_path, 'r', encoding='utf-8') as f:
                            whisper_result = json.load(f)
                    else:
                        with tempfile.TemporaryDirectory() as temp_dir:
                            ydl_opts = {
                                'format': 'bestaudio[ext=m4a]/bestaudio/best',
                                'outtmpl': os.path.join(temp_dir, 'audio.%(ext)s'),
                                'postprocessors': [{
                                    'key': 'FFmpegExtractAudio',
                                    'preferredcodec': 'mp3',
                                    'preferredquality': '128',
                                }],
                                'quiet': True,
                                'no_warnings': True,
                            }

                            if COOKIES_FILE and os.path.exists(COOKIES_FILE):
                                ydl_opts['cookiefile'] = COOKIES_FILE

                            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                                ydl.download([url])

                            audio_file = None
                            for f in os.listdir(temp_dir):
                                if f.startswith('audio'):
                                    audio_file = os.path.join(temp_dir, f)
                                    break

                            if not audio_file:
                                send_error('Audio download failed')
                                return

                            send_sse('whisper', 'Transcribing with Whisper...', 30, step=2, total_steps=4)
                            model = get_whisper_model()
                            whisper_result = model.transcribe(audio_file, fp16=get_whisper_fp16())

                            with open(cache_path, 'w', encoding='utf-8') as f:
                                json.dump(whisper_result, f, indent=2)

                    send_sse('whisper', 'Transcription complete', 50, step=2, total_steps=4)

                    # Convert to subtitle format
                    for seg in whisper_result.get('segments', []):
                        subtitles.append({
                            'start': int(seg['start'] * 1000),
                            'end': int(seg['end'] * 1000),
                            'text': seg['text'].strip()
                        })

                # Fallback: YouTube auto
                elif auto_subs:
                    source_lang = list(auto_subs.keys())[0]
                    send_sse('downloading', f'Using auto-captions ({source_lang})...', 20, step=2, total_steps=4)
                    source_type = 'youtube_auto'
                    subtitles = await_download_subtitles(video_id, source_lang, auto_subs[source_lang])

                else:
                    send_error('No subtitles available')
                    return

                if not subtitles:
                    send_error('Failed to get subtitles')
                    return

                logger.info(f"[PROCESS] Got {len(subtitles)} subtitles from {source_type}")

                # Step 2: Translate if needed
                if needs_translation:
                    send_sse('translating', f'Translating {len(subtitles)} subtitles...', 55, step=3, total_steps=4)

                    def on_translate_progress(done, total, pct, eta=""):
                        # Calculate overall percent: translation is 55-95% of total progress
                        overall_pct = 55 + int(pct * 0.4)
                        batch_info = {'current': done, 'total': total}
                        send_sse('translating', f'Translating subtitles...', overall_pct, step=3, total_steps=4, eta=eta if eta else None, batch_info=batch_info)

                    subtitles = await_translate_subtitles(subtitles, target_lang, on_translate_progress)
                    send_sse('translating', 'Translation complete', 95, step=3, total_steps=4)
                else:
                    for sub in subtitles:
                        sub['translatedText'] = sub['text']

                # Verify translations exist
                has_translations = all(sub.get('translatedText') for sub in subtitles[:5])
                if needs_translation and not has_translations:
                    logger.error("[PROCESS] Translation failed - no translatedText in results!")
                    send_error('Translation failed - no translations received')
                    return

                # Build final result
                final_result = {
                    'subtitles': subtitles,
                    'source': source_type,
                    'translated': needs_translation
                }

                # Cache the result
                if has_translations or not needs_translation:
                    translation_cache_path = get_cache_path(video_id, f'translated_{target_lang}')
                    with open(translation_cache_path, 'w', encoding='utf-8') as f:
                        json.dump(final_result, f, indent=2)
                    logger.info(f"[PROCESS] Cached translation to {translation_cache_path}")

                send_sse('complete', 'Subtitles ready!', 100, step=4, total_steps=4)
                send_result(final_result)

            except Exception as e:
                logger.exception("[PROCESS] Error")
                send_error(str(e))

        # Start background worker
        worker = threading.Thread(target=do_work, daemon=True)
        worker.start()

        # Yield SSE events from queue
        while True:
            try:
                # Wait for message with timeout (for keepalive)
                msg_type, data = progress_queue.get(timeout=10)

                if msg_type == 'progress':
                    yield f"data: {json.dumps(data)}\n\n"
                elif msg_type == 'result':
                    yield f"data: {json.dumps({'result': data})}\n\n"
                    return
                elif msg_type == 'error':
                    yield f"data: {json.dumps({'error': data})}\n\n"
                    return

            except queue.Empty:
                # Send keepalive ping
                if worker.is_alive():
                    yield f"data: {json.dumps({'ping': True})}\n\n"
                else:
                    # Worker finished without sending result
                    yield f"data: {json.dumps({'error': 'Processing ended unexpectedly'})}\n\n"
                    return

    # Return SSE stream or regular JSON
    if use_sse:
        return Response(generate(), mimetype='text/event-stream')
    else:
        # Non-SSE: run synchronously and return JSON
        result = None
        error = None
        for event in generate():
            data = json.loads(event.replace('data: ', '').strip())
            if 'result' in data:
                result = data['result']
            if 'error' in data:
                error = data['error']

        if error:
            return jsonify({'error': error}), 500
        return jsonify(result)


def await_download_subtitles(video_id, lang, tracks):
    """Download and parse subtitles from YouTube."""
    cache_path = get_cache_path(video_id, f'subs_{lang}')

    if os.path.exists(cache_path):
        logger.info(f"[PROCESS] Using cached {lang} subtitles")
        with open(cache_path, 'r', encoding='utf-8') as f:
            yt_subs = json.load(f)
    else:
        # Get json3 format URL
        selected = None
        for track in tracks:
            if track.get('ext') == 'json3':
                selected = track
                break
        if not selected:
            selected = tracks[0]

        logger.info(f"[PROCESS] Downloading {lang} subtitles ({selected.get('ext')})...")

        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        res = requests.get(selected.get('url'), headers=headers, timeout=30)

        if res.status_code != 200:
            logger.error(f"[PROCESS] Subtitle download failed: {res.status_code}")
            return []

        if selected.get('ext') == 'json3':
            yt_subs = res.json()
        else:
            # Parse VTT
            yt_subs = parse_vtt_to_json3(res.text)

        # Cache
        with open(cache_path, 'w', encoding='utf-8') as f:
            json.dump(yt_subs, f, indent=2)

    # Convert to subtitle format
    subtitles = []
    for event in yt_subs.get('events', []):
        if not event.get('segs'):
            continue
        text = ''.join(s.get('utf8', '') for s in event['segs']).strip()
        if text:
            subtitles.append({
                'start': event.get('tStartMs', 0),
                'end': event.get('tStartMs', 0) + event.get('dDurationMs', 3000),
                'text': text
            })

    return subtitles


def await_whisper_transcribe(video_id, url):
    """Transcribe video using Whisper."""
    cache_path = get_cache_path(video_id, 'whisper')

    if os.path.exists(cache_path):
        logger.info("[PROCESS] Using cached Whisper transcription")
        with open(cache_path, 'r', encoding='utf-8') as f:
            whisper_result = json.load(f)
    else:
        logger.info("[PROCESS] Running Whisper transcription...")

        with tempfile.TemporaryDirectory() as temp_dir:
            ydl_opts = {
                'format': 'bestaudio[ext=m4a]/bestaudio/best',
                'outtmpl': os.path.join(temp_dir, 'audio.%(ext)s'),
                'postprocessors': [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '128',
                }],
                'quiet': True,
                'no_warnings': True,
            }

            if COOKIES_FILE and os.path.exists(COOKIES_FILE):
                ydl_opts['cookiefile'] = COOKIES_FILE

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])

            audio_file = None
            for f in os.listdir(temp_dir):
                if f.startswith('audio'):
                    audio_file = os.path.join(temp_dir, f)
                    break

            if not audio_file:
                logger.error("[PROCESS] Audio download failed")
                return []

            model = get_whisper_model()
            whisper_result = model.transcribe(audio_file, fp16=get_whisper_fp16())

            # Cache
            with open(cache_path, 'w', encoding='utf-8') as f:
                json.dump(whisper_result, f, indent=2)

    # Convert to subtitle format
    subtitles = []
    for seg in whisper_result.get('segments', []):
        subtitles.append({
            'start': int(seg['start'] * 1000),
            'end': int(seg['end'] * 1000),
            'text': seg['text'].strip()
        })

    return subtitles


def get_historical_batch_time():
    """Get average batch time from history for initial ETA estimate."""
    history_path = os.path.join(CACHE_DIR, 'batch_time_history.json')
    try:
        if os.path.exists(history_path):
            with open(history_path, 'r') as f:
                history = json.load(f)
                if history.get('times'):
                    return sum(history['times']) / len(history['times'])
    except:
        pass
    return 3.0  # Default 3 seconds per batch


def save_batch_time_history(batch_times):
    """Save batch times for future ETA estimates."""
    history_path = os.path.join(CACHE_DIR, 'batch_time_history.json')
    try:
        history = {'times': []}
        if os.path.exists(history_path):
            with open(history_path, 'r') as f:
                history = json.load(f)

        # Keep last 50 batch times
        history['times'] = (history.get('times', []) + batch_times)[-50:]
        history['updated'] = time.time()

        with open(history_path, 'w') as f:
            json.dump(history, f)
    except Exception as e:
        logger.warning(f"Failed to save batch time history: {e}")


def await_translate_subtitles(subtitles, target_lang, progress_callback=None):
    """Translate subtitles using LLM with parallel batching, rate limit handling, and retry."""
    import re
    from concurrent.futures import ThreadPoolExecutor, as_completed

    BATCH_SIZE = 25
    MAX_RETRIES = 3
    MAX_WORKERS = 3  # Reduced to avoid rate limits
    RETRY_ROUNDS = 2  # Retry failed batches this many times
    t_name = LANG_NAMES.get(target_lang, target_lang)

    client_args = {
        'api_key': SERVER_API_KEY,
        'base_url': SERVER_API_URL.rstrip('/')
    }

    if 'openrouter.ai' in SERVER_API_URL:
        client_args['default_headers'] = {
            'HTTP-Referer': 'https://video-translate.app',
            'X-Title': 'Video Translate'
        }

    client = OpenAI(**client_args)

    # Split into batches
    batches = []
    for i in range(0, len(subtitles), BATCH_SIZE):
        batches.append((i, subtitles[i:i + BATCH_SIZE]))

    total_batches = len(batches)
    completed_batches = [0]
    start_time = [time.time()]
    batch_times = []  # Track time per batch for ETA
    historical_avg = get_historical_batch_time()  # Use history for initial estimate
    logger.info(f"[TRANSLATE] Translating {len(subtitles)} subtitles in {total_batches} batches ({MAX_WORKERS} parallel, hist avg: {historical_avg:.1f}s)")

    def translate_batch(batch_data, is_retry=False):
        """Translate a single batch with rate limit handling."""
        batch_start = time.time()
        batch_idx, batch = batch_data
        batch_num = batch_idx // BATCH_SIZE + 1

        numbered_subs = "\n".join([f"{i+1}. {s['text']}" for i, s in enumerate(batch)])

        system_prompt = "You are a professional subtitle translator."
        user_prompt = f"""Translate these {len(batch)} subtitles to {t_name}.

IMPORTANT: Return exactly {len(batch)} numbered translations, one per line.

Rules:
- Return ONLY translations, numbered 1 to {len(batch)}
- Keep concise for subtitles
- No explanations

Subtitles:
{numbered_subs}"""

        translations = []
        for attempt in range(MAX_RETRIES + 1):
            try:
                response = client.chat.completions.create(
                    model=SERVER_MODEL,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    temperature=0.3,
                    max_tokens=4096
                )

                content = response.choices[0].message.content

                # Parse translations
                lines = content.strip().split('\n')
                translations = []
                for line in lines:
                    cleaned = line.strip()
                    if not cleaned:
                        continue
                    if cleaned[0].isdigit():
                        match = re.match(r'^\d+[\.\)\:\-]\s*(.*)', cleaned)
                        if match:
                            cleaned = match.group(1).strip()
                    if cleaned:
                        translations.append(cleaned)

                # Verify count
                if len(translations) >= len(batch) * 0.8:
                    batch_duration = time.time() - batch_start
                    logger.info(f"[TRANSLATE] Batch {batch_num}/{total_batches} OK ({len(translations)}/{len(batch)}) in {batch_duration:.1f}s")
                    return batch_idx, translations, True, batch_duration
                else:
                    logger.warning(f"[TRANSLATE] Batch {batch_num} incomplete: {len(translations)}/{len(batch)}")

            except Exception as e:
                error_str = str(e)
                logger.error(f"[TRANSLATE] Batch {batch_num} attempt {attempt+1} failed: {e}")

                # Handle rate limits with exponential backoff
                if '429' in error_str or 'rate' in error_str.lower():
                    # Extract retry delay if available
                    wait_time = 2 ** (attempt + 1)  # 2, 4, 8 seconds
                    if 'retry in' in error_str.lower():
                        try:
                            import re as regex
                            match = regex.search(r'retry in (\d+)', error_str.lower())
                            if match:
                                wait_time = int(match.group(1)) + 1
                        except:
                            pass
                    logger.warning(f"[TRANSLATE] Rate limited, waiting {wait_time}s...")
                    time.sleep(wait_time)
                elif attempt < MAX_RETRIES:
                    time.sleep(1)

        # Return what we have (even if incomplete)
        batch_duration = time.time() - batch_start
        return batch_idx, translations if translations else [], False, batch_duration

    def format_eta(seconds):
        """Format seconds into human readable time."""
        if seconds < 60:
            return f"{int(seconds)}s"
        elif seconds < 3600:
            mins = int(seconds // 60)
            secs = int(seconds % 60)
            return f"{mins}m {secs}s"
        else:
            hours = int(seconds // 3600)
            mins = int((seconds % 3600) // 60)
            return f"{hours}h {mins}m"

    def process_batches(batch_list, round_num=1):
        """Process a list of batches in parallel."""
        results = {}
        failed_batches = []

        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futures = {executor.submit(translate_batch, batch, round_num > 1): batch for batch in batch_list}

            for future in as_completed(futures):
                batch_idx, translations, success, duration = future.result()
                results[batch_idx] = translations
                completed_batches[0] += 1
                batch_times.append(duration)

                if not success or len(translations) < len(batches[batch_idx // BATCH_SIZE][1]) * 0.8:
                    failed_batches.append(batches[batch_idx // BATCH_SIZE])

                # Calculate ETA using actual or historical data
                remaining_batches = total_batches - completed_batches[0]
                if batch_times:
                    avg_time = sum(batch_times) / len(batch_times)
                else:
                    avg_time = historical_avg  # Use history for initial estimate

                # Account for parallel processing
                eta_seconds = (remaining_batches / MAX_WORKERS) * avg_time
                eta_str = format_eta(eta_seconds) if remaining_batches > 0 else "almost done"

                # Report progress with ETA
                if progress_callback:
                    pct = int((completed_batches[0] / total_batches) * 100)
                    progress_callback(completed_batches[0], total_batches, min(pct, 99), eta_str)

        return results, failed_batches

    # Initial pass
    results, failed_batches = process_batches(batches)

    # Retry failed batches
    for retry_round in range(RETRY_ROUNDS):
        if not failed_batches:
            break

        logger.info(f"[TRANSLATE] Retry round {retry_round + 1}: {len(failed_batches)} failed batches")
        time.sleep(5)  # Wait before retry to let rate limits reset

        retry_results, failed_batches = process_batches(failed_batches, retry_round + 2)
        results.update(retry_results)

    # Apply translations to subtitles in order
    for batch_idx, batch in batches:
        translations = results.get(batch_idx, [])

        # Pad if needed
        while len(translations) < len(batch):
            translations.append('')
        translations = translations[:len(batch)]

        for i, sub in enumerate(batch):
            sub['translatedText'] = translations[i]

    # Save batch times for future estimates
    if batch_times:
        save_batch_time_history(batch_times)

    # Final verification
    total_empty = sum(1 for s in subtitles if not s.get('translatedText'))
    elapsed = time.time() - start_time[0]
    if total_empty > 0:
        logger.warning(f"[TRANSLATE] DONE: {total_empty}/{len(subtitles)} empty translations in {elapsed:.1f}s")
    else:
        logger.info(f"[TRANSLATE] DONE: All {len(subtitles)} subtitles translated in {elapsed:.1f}s!")

    return subtitles


def parse_vtt_to_json3(vtt_content):
    """Parse VTT subtitle format to JSON3-like structure."""
    import re
    events = []
    pattern = r'(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})\n(.+?)(?=\n\n|\Z)'

    def ts_to_ms(ts):
        h, m, s = ts.split(':')
        s, ms = s.split('.')
        return int(h)*3600000 + int(m)*60000 + int(s)*1000 + int(ms)

    for match in re.finditer(pattern, vtt_content, re.DOTALL):
        start_str, end_str, text = match.groups()
        events.append({
            'tStartMs': ts_to_ms(start_str),
            'dDurationMs': ts_to_ms(end_str) - ts_to_ms(start_str),
            'segs': [{'utf8': text.strip()}]
        })

    return {'events': events}


# =============================================================================
# Main
# =============================================================================

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=False)
