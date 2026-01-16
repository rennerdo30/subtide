import pytest
import json
from unittest.mock import MagicMock, patch
from backend.services.process_service import process_video_logic

@pytest.fixture
def mock_dependencies():
    with patch('backend.services.process_service.ensure_audio_downloaded') as mock_ensure_audio, \
         patch('backend.services.process_service.download_audio') as mock_download_audio, \
         patch('backend.services.process_service.await_download_subtitles') as mock_dl_subs, \
         patch('backend.services.process_service.run_whisper_process') as mock_whisper, \
         patch('backend.services.process_service.await_translate_subtitles') as mock_translate, \
         patch('backend.services.process_service.yt_dlp.YoutubeDL') as mock_ytdl, \
         patch('backend.services.process_service.get_cache_path') as mock_cache:

        yield {
            'audio': mock_ensure_audio,
            'download_audio': mock_download_audio,
            'dl_subs': mock_dl_subs,
            'whisper': mock_whisper,
            'translate': mock_translate,
            'ytdl': mock_ytdl,
            'cache': mock_cache
        }

@patch('backend.services.process_service.SERVER_API_KEY', 'fake-key')
@patch('backend.services.process_service.ENABLE_WHISPER', True)
def test_process_video_logic_cached_translation(mock_dependencies):
    # Mock cache hit for translation
    mock_dependencies['cache'].return_value = '/tmp/cached_translation.json'
    with patch('os.path.exists', return_value=True), \
         patch('builtins.open', new_callable=MagicMock) as mock_open, \
         patch('json.load') as mock_json_load:
        
        mock_json_load.return_value = {'subtitles': [], 'source': 'cached'}
        
        generator = process_video_logic('vid123', 'es', False, True)
        events = list(generator)
        
        assert len(events) > 0
        last_event = json.loads(events[-1].replace('data: ', ''))
        assert 'result' in last_event
        assert last_event['result']['source'] == 'cached'

@patch('backend.services.process_service.SERVER_API_KEY', 'fake-key')
def test_process_video_logic_manual_subs(mock_dependencies):
    # Mock no cache
    with patch('os.path.exists', return_value=False):
        # Mock yt-dlp finding target lang
        mock_instance = mock_dependencies['ytdl'].return_value.__enter__.return_value
        mock_instance.extract_info.return_value = {
            'subtitles': {'es': [{'url': 'http://sub'}]},
            'duration': 100
        }
        
        mock_dependencies['dl_subs'].return_value = [{'text': 'Hola'}]
        
        generator = process_video_logic('vid123', 'es', False, True)
        events = list(generator)
        
        # Should finish with result
        result_event = [e for e in events if 'result' in e][0]
        data = json.loads(result_event.replace('data: ', ''))
        assert data['result']['source'] == 'youtube_direct'
        assert data['result']['subtitles'][0]['text'] == 'Hola'

@patch('backend.services.process_service.SERVER_API_KEY', 'fake-key')
@patch('backend.services.process_service.ENABLE_WHISPER', True)
def test_process_video_logic_whisper_fallback(mock_dependencies):
    # Mock no cache, no subs
    with patch('os.path.exists', return_value=False), \
         patch('builtins.open', new_callable=MagicMock): # Mock open for writing cache
        
        mock_instance = mock_dependencies['ytdl'].return_value.__enter__.return_value
        mock_instance.extract_info.return_value = {
            'subtitles': {},
            'automatic_captions': {},
            'duration': 100
        }
        
        # Mock Whisper flow - both audio download methods
        mock_dependencies['audio'].return_value = '/tmp/audio.mp3'
        mock_dependencies['download_audio'].return_value = '/tmp/audio.mp3'

        # Ensure cache path returns a string, though with open mocked it matters less,
        # but good practice.
        mock_dependencies['cache'].return_value = '/tmp/cache_file.json'

        with patch('backend.services.process_service.validate_audio_file', return_value=(True, "")):
            mock_dependencies['whisper'].return_value = {
                'segments': [{'start': 0, 'end': 1, 'text': 'Hello'}]
            }
            
            # Mock Translation
            mock_dependencies['translate'].return_value = [{'text': 'Hello', 'translatedText': 'Hola'}]
            
            generator = process_video_logic('vid123', 'es', False, True)
            events = list(generator)
            
            result_event = [e for e in events if 'result' in e]
            assert result_event
            data = json.loads(result_event[0].replace('data: ', ''))
            assert data['result']['source'] == 'whisper'
            assert data['result']['translated'] is True

@patch('backend.services.process_service.SERVER_API_KEY', None)
def test_process_video_logic_no_api_key():
    generator = process_video_logic('vid123', 'es', False, True)
    events = list(generator)
    assert 'Tier 3 not configured' in events[0]
