from flask import Blueprint, request, jsonify
from backend.config import ENABLE_WHISPER
from backend.services.process_service import await_whisper_transcribe
import logging

transcribe_bp = Blueprint('transcribe', __name__)
logger = logging.getLogger('subtide')

@transcribe_bp.route('/api/transcribe', methods=['GET'])
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
        return jsonify({'error': str(e)}), 500
