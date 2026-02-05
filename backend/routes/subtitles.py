from flask import Blueprint, request, jsonify
from backend.services.youtube_service import fetch_subtitles
from backend.utils.input_validation import validate_lang_code

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

    from backend.services.youtube_service import validate_video_id
    if not validate_video_id(video_id):
        return jsonify({'error': 'Invalid video_id format'}), 400

    if not validate_lang_code(lang):
        return jsonify({'error': 'Invalid language code'}), 400

    response, status_code = fetch_subtitles(video_id, lang)
    return jsonify(response) if isinstance(response, dict) else response, status_code
