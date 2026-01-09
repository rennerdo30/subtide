from flask import Blueprint, request, jsonify, Response
import json
from backend.config import (
    SERVER_API_KEY, SERVER_MODEL, SERVER_API_URL, LANG_NAMES
)
from backend.services.process_service import process_video_logic, stream_video_logic
from backend.services.translation_service import translate_subtitles_simple
from backend.utils.model_utils import get_model_context_size
import logging

translation_bp = Blueprint('translation', __name__)
logger = logging.getLogger('video-translate')

# Import limiter from app (will be set after blueprint registration)
limiter = None

def init_limiter(app_limiter):
    """Initialize rate limiter for this blueprint."""
    global limiter
    limiter = app_limiter

@translation_bp.route('/api/model-info', methods=['GET'])
def get_model_info():
    """Get model information including context size for smart batching."""
    if not SERVER_API_KEY:
        return jsonify({'error': 'Tier 3 not configured'}), 400
    
    context_size = get_model_context_size(SERVER_MODEL)
    recommended_tokens = min(context_size * 30 // 100, 32000)
    
    return jsonify({
        'model': SERVER_MODEL,
        'context_size': context_size,
        'recommended_batch_tokens': recommended_tokens,
        'api_url': SERVER_API_URL
    })

@translation_bp.route('/api/translate', methods=['POST'])
def translate_subtitles():
    """
    Translate subtitles using LLM.

    Rate limit: 60 requests/minute (app default)

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
            model_id = SERVER_MODEL
            api_url = SERVER_API_URL
            logger.info(f"Using Tier 3 server config: {api_url} / {model_id}")
        else:
            return jsonify({'error': 'Tier 3 is not configured on this server. Please use your own API key.'}), 400
    elif not api_key:
        return jsonify({'error': 'API key is required for Tier 1/2'}), 400

    if not model_id:
        return jsonify({'error': 'Model is required'}), 400

    try:
        result = translate_subtitles_simple(
            subtitles=subtitles,
            source_lang=source_lang,
            target_lang=target_lang,
            model_id=model_id,
            api_key=api_key,
            api_url=api_url
        )
        return jsonify(result)

    except Exception as e:
        logger.exception("Translation API failed")
        return jsonify({'error': str(e)}), 500


@translation_bp.route('/api/process', methods=['POST'])
def process_video():
    """
    Combined endpoint: fetch subtitles + translate in one call.
    Tier 3 only - uses server-managed API key.
    Returns Server-Sent Events for progress updates.
    """
    import os
    
    data = request.get_json(silent=True)
    if data is None:
        logger.warning(f"Failed to parse JSON body. Raw data: {request.get_data(as_text=True)[:1000]}")
        data = {} # Proceed with empty dict to trigger validation error below (or handle explicit body error)

    video_id = data.get('video_id')
    video_url = data.get('video_url')
    stream_url = data.get('stream_url')
    target_lang = data.get('target_lang', 'en')
    force_whisper = data.get('force_whisper', False)
    use_sse = request.headers.get('Accept') == 'text/event-stream'
    
    # Force SSE mode for RunPod to prevent gateway timeouts
    # RunPod Load Balancer times out after ~30-45s without response
    if os.environ.get('PLATFORM') == 'runpod':
        use_sse = True
        logger.info("[PROCESS] RunPod detected - forcing SSE mode to prevent gateway timeout")

    if not video_id:
        logger.warning(f"Process request missing video_id. Received data: {data}")
        return jsonify({'error': 'video_id is required'}), 400

    # Tier 3 requires server API key
    if not SERVER_API_KEY:
        return jsonify({
            'error': 'Tier 3 is not configured on this server',
            'details': 'SERVER_API_KEY environment variable not set'
        }), 503

    try:
        generator = process_video_logic(video_id, target_lang, force_whisper, use_sse, video_url=video_url, stream_url=stream_url)
    except Exception as e:
        logger.exception("Failed to start processing")
        return jsonify({'error': str(e)}), 500
    
    if use_sse:
        return Response(generator, mimetype='text/event-stream')
    else:
        # Non-SSE: run synchronously and return JSON
        # Note: logic inside process_video_logic is generator, we need to consume it
        result = None
        error = None
        for event in generator:
             # generator yields "data: {json}\n\n"
             try:
                 payload = json.loads(event.replace('data: ', '').strip())
                 if 'result' in payload:
                     result = payload['result']
                 if 'error' in payload:
                     error = payload['error']
             except (json.JSONDecodeError, KeyError, TypeError):
                 pass
        
        if error:
            return jsonify({'error': error}), 500
        return jsonify(result)


@translation_bp.route('/api/stream', methods=['POST'])
def stream_video():
    """
    Tier 4 streaming endpoint: fetch subtitles + translate with progressive streaming.
    Streams translated subtitle batches as they complete translation.
    Returns Server-Sent Events with subtitle data in each batch.
    """
    data = request.json or {}
    video_id = data.get('video_id')
    video_url = data.get('video_url')
    stream_url = data.get('stream_url')
    target_lang = data.get('target_lang', 'en')
    force_whisper = data.get('force_whisper', False)

    if not video_id:
        return jsonify({'error': 'video_id is required'}), 400

    # Tier 4 requires server API key
    if not SERVER_API_KEY:
        return jsonify({
            'error': 'Tier 4 is not configured on this server',
            'details': 'SERVER_API_KEY environment variable not set'
        }), 503

    try:
        generator = stream_video_logic(video_id, target_lang, force_whisper, video_url=video_url, stream_url=stream_url)
    except Exception as e:
        logger.exception("Failed to start streaming")
        return jsonify({'error': str(e)}), 500

    # Always return SSE for streaming endpoint
    return Response(generator, mimetype='text/event-stream')
