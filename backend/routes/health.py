from flask import Blueprint, jsonify
from backend.config import (
    ENABLE_WHISPER, SERVER_API_KEY, SERVER_MODEL
)
from backend.utils.model_utils import get_model_context_size

health_bp = Blueprint('health', __name__)

@health_bp.route('/health', methods=['GET'])
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
