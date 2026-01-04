from flask import Blueprint, jsonify, Response
from backend.config import (
    ENABLE_WHISPER, SERVER_API_KEY, SERVER_MODEL
)
from backend.utils.model_utils import get_model_context_size

health_bp = Blueprint('health', __name__)

# Track if models are initialized (set by app.py after startup)
_models_ready = False


def set_models_ready(ready: bool = True):
    """Called after models are initialized to mark server as healthy."""
    global _models_ready
    _models_ready = ready


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


@health_bp.route('/ping', methods=['GET'])
def ping():
    """
    RunPod Load Balancer health check endpoint.
    
    Required for RunPod Serverless Load Balancing mode.
    See: https://docs.runpod.io/serverless/load-balancing/overview
    
    Returns:
        200: Worker is healthy and ready to receive requests
        204: Worker is initializing (still loading models)
        5xx: Worker is unhealthy
    """
    if _models_ready:
        return Response(status=200)
    else:
        # Return 204 (initializing) if models aren't ready yet
        return Response(status=204)
