from flask import Blueprint, request, jsonify
from backend.config import ENABLE_WHISPER
from backend.services.process_service import await_whisper_transcribe
import logging

transcribe_bp = Blueprint('transcribe', __name__)
logger = logging.getLogger('subtide')

# Rate limiter - set after blueprint registration
limiter = None

def init_limiter(app_limiter):
    """Initialize rate limiter for this blueprint."""
    global limiter
    limiter = app_limiter
    app_limiter.limit("3 per minute")(transcribe_video)

@transcribe_bp.route('/api/transcribe', methods=['GET'])
def transcribe_video():
    """
    Transcribe video audio using Whisper.
    Requires Tier 2 or Tier 3.
    """
    from backend.utils.input_validation import validate_tier
    video_id = request.args.get('video_id')
    tier = request.args.get('tier', 'tier1')

    if not validate_tier(tier):
        return jsonify({'error': 'Invalid tier'}), 400

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

    from backend.services.youtube_service import validate_video_id
    if not validate_video_id(video_id):
        return jsonify({'error': 'Invalid video_id format'}), 400

    logger.info(f"Transcribing video: {video_id}")
    url = f"https://www.youtube.com/watch?v={video_id}"
    
    try:
        segments = await_whisper_transcribe(video_id, url)
        return jsonify({
            'segments': segments,
            'cached': True
        })

    except Exception as e:
        logger.exception(f"Transcription failed: {e}")
        return jsonify({'error': 'Transcription failed. Please try again.'}), 500
