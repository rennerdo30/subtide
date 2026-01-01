import pytest
from unittest.mock import MagicMock, patch, ANY
import os
from backend.services.youtube_service import fetch_subtitles, ensure_audio_downloaded

@pytest.fixture
def mock_yt_dlp():
    with patch('backend.services.youtube_service.yt_dlp.YoutubeDL') as mock:
        yield mock

@pytest.fixture
def mock_requests():
    with patch('backend.services.youtube_service.requests.get') as mock:
        yield mock

# Test Logic 1: Find best track
def test_fetch_subtitles_track_priority(mock_yt_dlp, mock_requests, mock_cache_dir):
    # Scenario: 'es' requested.
    # Manual subs: none
    # Auto subs: 'es' exists
    mock_instance = mock_yt_dlp.return_value.__enter__.return_value
    mock_instance.extract_info.return_value = {
        'subtitles': {},
        'automatic_captions': {
            'es': [{'ext': 'vtt', 'url': 'http://es-auto.vtt'}]
        }
    }
    
    # Mock requests to return VTT content
    mock_requests.return_value.status_code = 200
    mock_requests.return_value.content = b"WEBVTT..."
    mock_requests.return_value.text = "WEBVTT..."

    # Use side_effect for cache path
    with patch('backend.services.youtube_service.get_cache_path', 
              side_effect=lambda x, y: f"{mock_cache_dir}/{x}_{y}.json"):
             
        res, status = fetch_subtitles('vid', 'es')
        assert status == 200
        # Should have parsed VTT because ext != json3
        # But wait, fetch_subtitles logic:
        # if selected.get('ext') == 'json3': parse json
        # else: return Response(res.content, mimetype='text/plain')
        
        # In my test above `mock_requests` returns dummy text content
        # The service returns a Flask Response object if NOT json3?
        # Let's check code: `return Response(res.content, mimetype='text/plain'), 200`
        assert status == 200
        # res should be Response object
        assert res.mimetype == 'text/plain'

def test_fetch_subtitles_format_preference(mock_yt_dlp, mock_requests, mock_cache_dir):
    # Scenario: 'en' requested.
    # Available: 'en' in vtt, srv1, json3
    # Should pick json3
    mock_instance = mock_yt_dlp.return_value.__enter__.return_value
    mock_instance.extract_info.return_value = {
        'subtitles': {
            'en': [
                {'ext': 'srv1', 'url': 'http://srv1'},
                {'ext': 'json3', 'url': 'http://json3'}, # Priority
                {'ext': 'vtt', 'url': 'http://vtt'}
            ]
        }
    }
    
    mock_requests.return_value.status_code = 200
    mock_requests.return_value.json.return_value = {'events': []}
    
    lambda_path = lambda x, y: f"{mock_cache_dir}/{x}_{y}.json"
    
    with patch('backend.services.youtube_service.get_cache_path', side_effect=lambda_path):
        res, status = fetch_subtitles('vid', 'en')
        assert status == 200
        # json3 is parsed and returned as dict
        assert isinstance(res, dict)
        mock_requests.assert_called_with('http://json3', headers=ANY, timeout=30)

def test_fetch_subtitles_fallback_scan(mock_yt_dlp, mock_requests, mock_cache_dir):
    # Scenario: 'de' requested. 'de' not found. 'en' not found.
    # Should return 404 with lists
    mock_instance = mock_yt_dlp.return_value.__enter__.return_value
    mock_instance.extract_info.return_value = {
        'subtitles': {'fr': []},
        'automatic_captions': {'it': []}
    }
    
    with patch('backend.services.youtube_service.get_cache_path', return_value='/tmp/nopath'):
        res, status = fetch_subtitles('vid', 'de')
        assert status == 404
        assert 'fr' in res['available_manual']
        assert 'it' in res['available_auto']

def test_fetch_subtitles_retry_logic(mock_yt_dlp, mock_requests, mock_cache_dir):
    # Scenario: 429 then 200
    mock_instance = mock_yt_dlp.return_value.__enter__.return_value
    mock_instance.extract_info.return_value = {
        'subtitles': {'en': [{'ext': 'json3', 'url': 'http://json3'}]}
    }
    
    resp_429 = MagicMock()
    resp_429.status_code = 429
    
    resp_200 = MagicMock()
    resp_200.status_code = 200
    resp_200.json.return_value = {}
    
    mock_requests.side_effect = [resp_429, resp_200]
    
    with patch('backend.services.youtube_service.get_cache_path', return_value=f"{mock_cache_dir}/test_retry.json"), \
         patch('time.sleep') as mock_sleep:
        
        res, status = fetch_subtitles('vid', 'en')
        assert status == 200
        mock_sleep.assert_called_once() # Called once for retry

def test_ensure_audio_downloaded_variant(mock_yt_dlp):
    # Mock fallback scan: file exists but not exact name match (maybe different extension in listdir)
    # Actually logic: 
    # Check exact match for each ext.
    # IF fail, check os.listdir for startswith(safe_vid_id)
    
    with patch('os.path.exists', return_value=False), \
         patch('os.makedirs'), \
         patch('os.listdir', return_value=['vid123.mp3']), \
         patch('os.path.getsize', return_value=2000): # Size > 1000
        
        path = ensure_audio_downloaded('vid123', 'http://url')
        assert path.endswith('vid123.mp3')

def test_ensure_audio_downloaded_fail(mock_yt_dlp):
    # Mock download exception
    mock_instance = mock_yt_dlp.return_value.__enter__.return_value
    mock_instance.extract_info.side_effect = Exception("DL Fail")
    
    with patch('os.path.exists', return_value=False), \
         patch('os.makedirs'), \
         patch('os.listdir', return_value=[]):
        
        path = ensure_audio_downloaded('vid', 'url')
        assert path is None
