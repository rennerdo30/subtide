"""
Feedback API Routes

Handles user feedback on translation quality.
"""

import logging
from flask import Blueprint, request, jsonify

from backend.utils.feedback_store import store_feedback, get_feedback_stats

logger = logging.getLogger('video-translate')

feedback_bp = Blueprint('feedback', __name__)


@feedback_bp.route('/api/feedback', methods=['POST'])
def submit_feedback():
    """
    Submit translation feedback.
    
    Body:
        {
            "video_id": "dQw4w9WgXcQ",
            "segment_index": 5,
            "rating": 1,  // 1 = good, -1 = bad
            "source_text": "Original text",  // optional
            "translated_text": "Translated text",  // optional
            "target_lang": "ja",  // optional
            "user_correction": "Better translation"  // optional
        }
    """
    try:
        data = request.get_json() or {}
        
        video_id = data.get('video_id')
        segment_index = data.get('segment_index', 0)
        rating = data.get('rating', 0)
        
        if not video_id:
            return jsonify({'error': 'video_id required'}), 400
        
        if rating not in [-1, 1]:
            return jsonify({'error': 'rating must be 1 or -1'}), 400
        
        success = store_feedback(
            video_id=video_id,
            segment_index=segment_index,
            rating=rating,
            source_text=data.get('source_text'),
            translated_text=data.get('translated_text'),
            target_lang=data.get('target_lang'),
            user_correction=data.get('user_correction')
        )
        
        if success:
            return jsonify({'status': 'ok'})
        else:
            return jsonify({'error': 'Failed to store feedback'}), 500
            
    except Exception as e:
        logger.error(f"[FEEDBACK] Error: {e}")
        return jsonify({'error': str(e)}), 500


@feedback_bp.route('/api/feedback/stats', methods=['GET'])
def feedback_stats():
    """Get feedback statistics."""
    try:
        stats = get_feedback_stats()
        return jsonify(stats)
    except Exception as e:
        logger.error(f"[FEEDBACK] Stats error: {e}")
        return jsonify({'error': str(e)}), 500
