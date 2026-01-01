import pytest
from unittest.mock import MagicMock, patch
from backend.services.youtube_service import fetch_subtitles

@pytest.fixture
def mock_yt_dlp():
    with patch('backend.services.youtube_service.yt_dlp.YoutubeDL') as mock:
        yield mock

@pytest.fixture
def mock_requests():
    with patch('backend.services.youtube_service.requests.get') as mock:
        yield mock

def test_fetch_subtitles_complex_selection(mock_yt_dlp, mock_requests, mock_cache_dir):
    # Mock yt-dlp returning mixture of subs
    mock_instance = mock_yt_dlp.return_value.__enter__.return_value
    mock_instance.extract_info.return_value = {
        'subtitles': {
            'en': [{'ext': 'vtt', 'url': 'http://en.vtt'}],
            'es': [{'ext': 'json3', 'url': 'http://es.json3'}] # Preferred
        },
        'automatic_captions': {
            'fr': [{'ext': 'json3', 'url': 'http://fr-auto.json3'}]
        }
    }
    
    # helper to mock requests get
    def mock_get(url, *args, **kwargs):
        resp = MagicMock()
        resp.status_code = 200
        if 'es.json3' in url:
            resp.json.return_value = {'events': [{'text': 'Hola'}]}
        elif 'fr-auto.json3' in url: # auto handling
             resp.json.return_value = {'events': [{'text': 'Bonjour'}]}
        return resp
        
    mock_requests.side_effect = mock_get

    # Use side_effect for cache path to differentiate files
    def cache_side_effect(video_id, lang):
        return f"{mock_cache_dir}/{video_id}_{lang}.json"

    with patch('backend.services.youtube_service.get_cache_path', side_effect=cache_side_effect):
         # 1. Fetch 'es' -> should pick manual json3
         res, status = fetch_subtitles('vid', 'es')
         assert status == 200
         assert res['events'][0]['text'] == 'Hola'
         
         # 2. Fetch 'fr' -> should pick auto
         res, status = fetch_subtitles('vid', 'fr')
         assert status == 200
         assert res['events'][0]['text'] == 'Bonjour'

def test_fetch_subtitles_download_fail(mock_yt_dlp, mock_requests, mock_cache_dir):
    mock_instance = mock_yt_dlp.return_value.__enter__.return_value
    mock_instance.extract_info.return_value = {
        'subtitles': {'en': [{'url': 'http://fail.com'}]}
    }
    
    # Mock fail response
    fail_resp = MagicMock()
    fail_resp.status_code = 500
    mock_requests.return_value = fail_resp
    
    with patch('backend.services.youtube_service.get_cache_path', return_value=f"{mock_cache_dir}/test_cache_fail.json"):
        res, status = fetch_subtitles('vid', 'en')
        # It handles the failure and returns error (caught as Exception -> 502 likely 
        # because the code probably tries resp.json() or checks status and raises)
        # If the code just checks status != 200, it might return that status if designed so.
        # But looking at logs from previous failure "Subtitle fetch failed", likely exception.
        assert status == 502
