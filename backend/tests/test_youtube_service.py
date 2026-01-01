import pytest
from unittest.mock import MagicMock, patch
from backend.services.youtube_service import fetch_subtitles, ensure_audio_downloaded

@pytest.fixture
def mock_yt_dlp():
    with patch('backend.services.youtube_service.yt_dlp.YoutubeDL') as mock:
        yield mock

@pytest.fixture
def mock_requests():
    with patch('backend.services.youtube_service.requests.get') as mock:
        yield mock

def test_fetch_subtitles_success(mock_yt_dlp, mock_requests, mock_cache_dir):
    # Setup mocks
    mock_instance = mock_yt_dlp.return_value.__enter__.return_value
    mock_instance.extract_info.return_value = {
        'subtitles': {
            'en': [{'ext': 'json3', 'url': 'http://fake.url/sub.json'}]
        }
    }
    
    # Mock requests response for subtitle download
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {'events': []}
    mock_requests.return_value = mock_response

    # Call function
    with patch('backend.services.youtube_service.get_cache_path') as mock_path:
        # We need to make sure get_cache_path returns a path in our temp dir
        mock_path.return_value = f"{mock_cache_dir}/test_cache.json"
        
        result, status = fetch_subtitles("video123", "en")
        
        assert status == 200
        assert result == {'events': []}
        mock_requests.assert_called_once()


def test_fetch_subtitles_not_found(mock_yt_dlp, mock_requests):
    # Setup mocks
    mock_instance = mock_yt_dlp.return_value.__enter__.return_value
    mock_instance.extract_info.return_value = {
        'subtitles': {},
        'automatic_captions': {}
    }

    with patch('backend.services.youtube_service.get_cache_path') as mock_path:
        mock_path.return_value = "/tmp/nonexistent"

        result, status = fetch_subtitles("video123", "fr")
        
        assert status == 404
        assert 'error' in result

def test_ensure_audio_downloaded_cached(mock_yt_dlp):
    # Mock file existence
    with patch('os.path.exists') as mock_exists, \
         patch('os.path.getsize') as mock_size, \
         patch('os.listdir') as mock_listdir:
        
        # Scenario: File already exists
        mock_exists.return_value = True
        mock_size.return_value = 2000
        mock_listdir.return_value = []
        
        path = ensure_audio_downloaded("video123", "http://youtube.com/watch?v=video123")
        
        # It should return the path without calling yt-dlp download (extract_info)
        assert path is not None
        mock_yt_dlp.return_value.__enter__.return_value.extract_info.assert_not_called()

def test_ensure_audio_download_fresh(mock_yt_dlp):
    # Mock file NOT exists initially, then exists after download
    def exists_side_effect(path):
        if path == '/tmp/downloaded.m4a':
            return True
        return False

    with patch('os.path.exists', side_effect=exists_side_effect) as mock_exists, \
         patch('os.path.getsize') as mock_size, \
         patch('os.makedirs') as mock_makedirs, \
         patch('os.listdir', return_value=[]):
        
        mock_instance = mock_yt_dlp.return_value.__enter__.return_value
        mock_instance.extract_info.return_value = {
            'requested_downloads': [{'filepath': '/tmp/downloaded.m4a'}]
        }
        
        # We need to make sure the loop over possible extensions doesn't return early
        # The exists_side_effect returns False for everything except the target file
        # But ensure_audio_downloaded checks for all extensions BEFORE downloading.
        # So it should return False for all checked extensions, then download, then check if downloaded file exists.
        
        path = ensure_audio_downloaded("video123", "http://youtube.com/watch?v=video123")
        
        # It should call extract_info to download
        mock_instance.extract_info.assert_called_once()
        assert path == '/tmp/downloaded.m4a'
