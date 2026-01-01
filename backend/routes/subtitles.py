from flask import Blueprint, request, jsonify
from backend.services.youtube_service import fetch_subtitles

subtitles_bp = Blueprint('subtitles', __name__)

@subtitles_bp.route('/api/subtitles', methods=['GET'])
def get_subtitles():
    """
    Fetch YouTube subtitles using yt-dlp.
    Available on all tiers.
    """
    video_id = request.args.get('video_id')
    lang = request.args.get('lang', 'en')

    if not video_id:
        return jsonify({'error': 'video_id is required'}), 400

    response, status_code = fetch_subtitles(video_id, lang)
    return jsonify(response) if isinstance(response, dict) else response, status_code
