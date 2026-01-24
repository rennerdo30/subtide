"""
Integration Tests for Subtide Backend.

These tests verify the complete request/response cycle through the API endpoints.
They use mocks for external services (LLM, Whisper) but test the full Flask pipeline.
"""

import json
import pytest
from unittest.mock import patch, MagicMock
from flask import Flask

# Import the Flask app
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))


@pytest.fixture
def client():
    """Create a test client for the Flask application."""
    from backend.app import app
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client


class TestHealthEndpoints:
    """Integration tests for health check endpoints."""

    def test_ping_returns_200_when_ready(self, client):
        """GET /ping should return 200 when server is ready."""
        from backend.routes.health import set_models_ready
        set_models_ready(True)

        response = client.get('/ping')
        assert response.status_code == 200
        # Response may be JSON or plain text
        if response.data:
            data = json.loads(response.data)
            assert data.get('status') == 'ok'

    def test_ping_returns_non_200_when_not_ready(self, client):
        """GET /ping should return non-200 when models are not loaded."""
        from backend.routes.health import set_models_ready
        set_models_ready(False)

        response = client.get('/ping')
        # Should return 503 or 204 (loading)
        assert response.status_code in [204, 503]

    def test_health_endpoint_exists(self, client):
        """GET /health should exist and return JSON."""
        response = client.get('/health')
        # Should return 200
        assert response.status_code == 200
        data = json.loads(response.data)
        # Should have some structure
        assert isinstance(data, dict)


class TestSubtitleEndpoints:
    """Integration tests for subtitle fetching endpoints."""

    def test_fetch_subtitles_endpoint_exists(self, client):
        """GET /api/subtitles endpoint should exist."""
        response = client.get('/api/subtitles?video_id=test123&lang=en')
        # Should not return 405 (endpoint exists)
        # May return 200, 404 (no subs), or 500 (error)
        assert response.status_code != 405  # Method allowed

    def test_fetch_subtitles_requires_video_id(self, client):
        """GET /api/subtitles should require video_id."""
        response = client.get('/api/subtitles?lang=en')
        # Should return 400 for missing video_id
        assert response.status_code == 400
        data = json.loads(response.data)
        assert 'error' in data


class TestTranslationEndpoints:
    """Integration tests for translation endpoints."""

    def test_translate_missing_subtitles(self, client):
        """POST /api/translate should return 400 if subtitles are missing."""
        response = client.post('/api/translate',
            data=json.dumps({
                'target_lang': 'en',
                'api_key': 'sk-test'
            }),
            content_type='application/json'
        )
        assert response.status_code == 400
        data = json.loads(response.data)
        assert 'error' in data

    def test_translate_missing_api_key_tier12(self, client):
        """POST /api/translate should require API key for Tier 1/2."""
        with patch('backend.routes.translation.SERVER_API_KEY', None):
            response = client.post('/api/translate',
                data=json.dumps({
                    'subtitles': [{'text': 'Hello'}],
                    'target_lang': 'ja'
                }),
                content_type='application/json'
            )
            assert response.status_code == 400

    @patch('backend.routes.translation.translate_subtitles_simple')
    def test_translate_with_api_key(self, mock_translate, client):
        """POST /api/translate should work with provided API key."""
        mock_translate.return_value = {'translations': ['こんにちは']}

        response = client.post('/api/translate',
            data=json.dumps({
                'subtitles': [{'text': 'Hello'}],
                'target_lang': 'ja',
                'api_key': 'sk-test-key',
                'model': 'gpt-4o-mini'
            }),
            content_type='application/json'
        )

        assert response.status_code == 200
        data = json.loads(response.data)
        assert 'translations' in data

    @patch('backend.routes.translation.SERVER_API_KEY', 'server-key')
    @patch('backend.routes.translation.translate_subtitles_simple')
    def test_translate_tier3_uses_server_key(self, mock_translate, client):
        """POST /api/translate Tier 3 should use server API key."""
        mock_translate.return_value = {'translations': ['こんにちは']}

        response = client.post('/api/translate',
            data=json.dumps({
                'subtitles': [{'text': 'Hello'}],
                'target_lang': 'ja'
                # No api_key provided - should use server key
            }),
            content_type='application/json'
        )

        assert response.status_code == 200


class TestProcessEndpoints:
    """Integration tests for video processing endpoints."""

    @patch('backend.routes.translation.SERVER_API_KEY', None)
    def test_process_requires_server_api_key(self, client):
        """POST /api/process should return 503 if SERVER_API_KEY not set."""
        response = client.post('/api/process',
            data=json.dumps({
                'video_id': 'test123',
                'target_lang': 'en'
            }),
            content_type='application/json'
        )
        assert response.status_code == 503

    def test_process_requires_video_id(self, client):
        """POST /api/process should return 400 if video_id missing."""
        with patch('backend.routes.translation.SERVER_API_KEY', 'key'):
            response = client.post('/api/process',
                data=json.dumps({
                    'target_lang': 'en'
                }),
                content_type='application/json'
            )
            assert response.status_code == 400

    @patch('backend.routes.translation.SERVER_API_KEY', 'server-key')
    @patch('backend.routes.translation.process_video_logic')
    def test_process_returns_sse_stream(self, mock_process, client):
        """POST /api/process should return SSE stream when requested."""
        def fake_generator():
            yield 'data: {"stage": "fetching"}\n\n'
            yield 'data: {"result": {"subtitles": []}}\n\n'

        mock_process.return_value = fake_generator()

        response = client.post('/api/process',
            data=json.dumps({
                'video_id': 'test123',
                'target_lang': 'en'
            }),
            content_type='application/json',
            headers={'Accept': 'text/event-stream'}
        )

        # SSE streams return 200
        assert response.status_code == 200
        assert 'text/event-stream' in response.content_type


class TestModelInfoEndpoint:
    """Integration tests for model info endpoint."""

    @patch('backend.routes.translation.SERVER_API_KEY', 'key')
    @patch('backend.routes.translation.SERVER_MODEL', 'gpt-4o')
    def test_model_info_returns_config(self, client):
        """GET /api/model-info should return model configuration."""
        response = client.get('/api/model-info')
        assert response.status_code == 200
        data = json.loads(response.data)

        assert 'model' in data
        assert 'context_size' in data
        assert 'recommended_batch_tokens' in data

    @patch('backend.routes.translation.SERVER_API_KEY', None)
    def test_model_info_requires_tier3(self, client):
        """GET /api/model-info should return 400 if Tier 3 not configured."""
        response = client.get('/api/model-info')
        assert response.status_code == 400


class TestErrorHandling:
    """Integration tests for error handling."""

    def test_404_for_unknown_endpoint(self, client):
        """Unknown endpoints should return 404 with JSON error."""
        response = client.get('/api/unknown-endpoint')
        assert response.status_code == 404
        data = json.loads(response.data)
        assert 'error' in data

    def test_request_too_large(self, client):
        """Requests exceeding size limit should return 413 or 400."""
        # Create a request body larger than 10MB
        large_data = 'x' * (11 * 1024 * 1024)

        response = client.post('/api/translate',
            data=large_data,
            content_type='application/json'
        )
        # May return 413 (too large) or 400 (bad JSON) depending on which check fails first
        assert response.status_code in [400, 413]

    def test_invalid_json_returns_error(self, client):
        """Invalid JSON should return appropriate error."""
        response = client.post('/api/translate',
            data='not valid json',
            content_type='application/json'
        )
        # Flask returns 400 or 415 for invalid JSON
        assert response.status_code in [400, 415, 500]


class TestVideoLoaderIntegration:
    """Integration tests for video loader with domain whitelist."""

    def test_allowed_youtube_url(self):
        """YouTube URLs should be allowed."""
        from backend.services.video_loader import is_allowed_url

        assert is_allowed_url('https://www.youtube.com/watch?v=abc123')
        assert is_allowed_url('https://youtu.be/abc123')
        assert is_allowed_url('https://youtube.com/watch?v=abc123')

    def test_allowed_twitch_url(self):
        """Twitch URLs should be allowed."""
        from backend.services.video_loader import is_allowed_url

        assert is_allowed_url('https://www.twitch.tv/channel')
        assert is_allowed_url('https://clips.twitch.tv/abc')

    def test_blocked_internal_url(self):
        """Internal/localhost URLs should be blocked."""
        from backend.services.video_loader import is_allowed_url

        assert not is_allowed_url('http://localhost:8080/video.mp4')
        assert not is_allowed_url('http://127.0.0.1/internal')
        assert not is_allowed_url('http://192.168.1.1/private')

    def test_blocked_arbitrary_url(self):
        """Arbitrary external URLs should be blocked."""
        from backend.services.video_loader import is_allowed_url

        assert not is_allowed_url('https://malicious-site.com/video')
        assert not is_allowed_url('https://example.com/hack')


class TestCORSHeaders:
    """Integration tests for CORS configuration."""

    def test_cors_preflight_handled(self, client):
        """CORS preflight requests should be handled."""
        response = client.options('/api/health',
            headers={'Origin': 'http://localhost:3000'}
        )
        # Flask-CORS should handle OPTIONS requests
        # Status can be 200, 204, or even 404 depending on config
        assert response.status_code in [200, 204, 404]


class TestRateLimiting:
    """Integration tests for rate limiting."""

    def test_health_endpoint_accessible(self, client):
        """Health endpoint should be accessible."""
        response = client.get('/health')
        # Should be accessible (rate limiting shouldn't block health)
        assert response.status_code == 200


class TestPartialCacheIntegration:
    """Integration tests for partial translation cache."""

    def test_cache_saves_and_loads(self, tmp_path):
        """Cache should save and load partial progress."""
        from backend.utils.partial_cache import (
            save_partial_progress,
            load_partial_progress,
            clear_partial_progress,
            compute_source_hash
        )

        with patch('backend.utils.partial_cache.PARTIAL_CACHE_DIR', str(tmp_path)):
            subtitles = [{'text': 'Hello'}, {'text': 'World'}]
            source_hash = compute_source_hash(subtitles)

            # Save progress
            result = save_partial_progress(
                video_id='test123',
                target_lang='ja',
                completed_batches={'0': ['こんにちは']},
                total_batches=2,
                source_hash=source_hash
            )
            assert result is True

            # Load progress
            loaded = load_partial_progress('test123', 'ja', source_hash)
            assert loaded is not None
            assert 0 in loaded

            # Clear progress
            clear_partial_progress('test123', 'ja')
            loaded_after = load_partial_progress('test123', 'ja', source_hash)
            assert loaded_after is None
