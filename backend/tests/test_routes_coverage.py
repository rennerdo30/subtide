import pytest
import json
from unittest.mock import MagicMock, patch

def test_subtitles_missing_video_id(client):
    res = client.get('/api/subtitles')
    # According to logic (likely flask request.args.get), correct params required?
    # Subtitles requires video_id
    assert res.status_code == 400
    assert "video_id is required" in res.json['error']

def test_transcribe_missing_url(client):
    # Default tier is tier1 -> 403. Pass tier2 to trigger missing video_id/url check
    res = client.get('/api/transcribe?tier=tier2')
    assert res.status_code == 400
    # Code checks 'video_id is required' first in logic?
    # transcribe.py: if not video_id: return ... video_id is required
    # It doesn't check url first?
    # Line 28: if not video_id: return 400
    assert "video_id is required" in res.json['error']

def test_transcribe_error(client):
    with patch('backend.routes.transcribe.await_whisper_transcribe', side_effect=Exception("Fail")):
        # Mock validation to pass if needed.
        # usually checks video_id/url.
        res = client.get('/api/transcribe?tier=tier2&video_id=vid')
        # Logic catches exception and returns generic error (no internal details)
        assert res.status_code == 500
        assert "Transcription failed" in res.json['error']

def test_translate_simple_missing_args(client):
    # Endpoint /api/translate
    res = client.post('/api/translate', json={})
    assert res.status_code == 400
    assert "No subtitles provided" in res.json['error']

def test_process_stream_error(client):
    # /api/process stream (POST)
    # Mock process_video_logic to raise exception.
    
    with patch('backend.routes.translation.process_video_logic', side_effect=ValueError("Bad")), \
         patch('backend.routes.translation.SERVER_API_KEY', 'fake'):
         
         # Mock request.headers
         # Flask test client headers
         res = client.post('/api/process', 
                           json={'video_id': '1', 'target_lang': 'es'},
                           headers={'Accept': 'text/event-stream'})
         
         assert res.status_code == 500
         # Flask 500 handler? or route handles error?
         # If process_video_logic raises, route crashes.
         # Does verify output json?
         # If Flask crashes with 500, it returns HTML usually unless formatted.
         # But app might have error handler.
         # If we are strictly testing route logic, catching exception is usually done by flask.
         # If no error handler, 500 is standardized.
         # Let's check test result.
         pass

def test_routes_health(client):
    res = client.get('/health')
    assert res.status_code == 200
    assert res.json['status'] == 'ok'
