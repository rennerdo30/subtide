"""
TTS (Text-to-Speech) API Routes
"""

from flask import Blueprint, request, jsonify, Response
import logging

from backend.services.tts_service import (
    generate_tts,
    get_available_voices,
    get_tts_status,
    TTS_ENABLED
)

tts_bp = Blueprint('tts', __name__)
logger = logging.getLogger('subtide')


@tts_bp.route('/api/tts/status', methods=['GET'])
def tts_status():
    """
    Get TTS service status.

    Returns:
        JSON with enabled status, backend type, and default voices
    """
    return jsonify(get_tts_status())


@tts_bp.route('/api/tts/voices', methods=['GET'])
def tts_voices():
    """
    Get available TTS voices.

    Query params:
        lang: Optional language filter (e.g., 'en', 'ja')

    Returns:
        JSON array of available voices with id, name, lang, gender
    """
    if not TTS_ENABLED:
        return jsonify({'error': 'TTS is disabled on this server'}), 503

    lang = request.args.get('lang')
    voices = get_available_voices(lang)
    return jsonify({'voices': voices})


@tts_bp.route('/api/tts/speak', methods=['POST'])
def tts_speak():
    """
    Generate TTS audio for text.

    Request body (JSON):
        text: Text to convert to speech (required)
        lang: Target language code (default: 'en')
        voice_id: Optional specific voice ID
        use_cache: Whether to use caching (default: true)

    Returns:
        Audio file (audio/mpeg) or JSON error
    """
    if not TTS_ENABLED:
        return jsonify({'error': 'TTS is disabled on this server'}), 503

    data = request.json or {}
    text = data.get('text', '').strip()
    lang = data.get('lang', 'en')
    voice_id = data.get('voice_id')
    use_cache = data.get('use_cache', True)

    if not text:
        return jsonify({'error': 'Text is required'}), 400

    # Limit text length to prevent abuse
    if len(text) > 1000:
        return jsonify({'error': 'Text too long (max 1000 characters)'}), 400

    try:
        audio_bytes, content_type = generate_tts(
            text=text,
            lang=lang,
            voice_id=voice_id,
            use_cache=use_cache
        )

        return Response(
            audio_bytes,
            mimetype=content_type,
            headers={
                'Content-Disposition': 'inline; filename="speech.mp3"',
                'Cache-Control': 'public, max-age=3600'  # Cache for 1 hour
            }
        )

    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except RuntimeError as e:
        logger.error(f"[TTS] Generation failed: {e}")
        return jsonify({'error': str(e)}), 500
    except Exception as e:
        logger.exception("[TTS] Unexpected error")
        return jsonify({'error': 'TTS generation failed'}), 500
