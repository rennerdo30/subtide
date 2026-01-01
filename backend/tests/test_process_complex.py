import pytest
from unittest.mock import MagicMock, patch, ANY
import json
import queue
import time
from backend.services.process_service import process_video_logic

@pytest.fixture
def mock_dependencies():
    with patch('backend.services.process_service.yt_dlp') as ytdl, \
         patch('backend.services.process_service.get_cache_path') as cache, \
         patch('backend.services.process_service.await_download_subtitles') as dl_subs, \
         patch('backend.services.process_service.run_whisper_process') as whisper, \
         patch('backend.services.process_service.await_translate_subtitles') as translate, \
         patch('backend.services.process_service.ensure_audio_downloaded') as audio:
        yield {
            'ytdl': ytdl, 'cache': cache, 'dl_subs': dl_subs,
            'whisper': whisper, 'translate': translate, 'audio': audio
        }

@patch('backend.services.process_service.SERVER_API_KEY', 'fake-key')
def test_process_video_logic_queue_timeout(mock_dependencies):
    # Mock queue.get to raise Empty once, then return error to exit
    # We strip the real queue logic by mocking progress_queue in the closure?
    # Hard to mock inner function local var.
    # Instead, we rely on `time.sleep` or slow worker.
    
    # We want to trigger `queue.Empty` handling.
    # Logic:
    # try: msg = queue.get(timeout=10)
    # except Empty: if worker.alive: yield PING
    
    # To test this fast, we mock queue.Queue to raise Empty immediately?
    # But queue is instantiated INSIDE `generate`.
    # `progress_queue = queue.Queue()`
    
    with patch('backend.services.process_service.queue.Queue') as MockQueue:
        q_instance = MockQueue.return_value
        # First call raises Empty, Second call returns error to finish loop
        q_instance.get.side_effect = [queue.Empty, ('error', 'Stop')]
        
        # We also need worker to be alive for PING
        # But `worker` is a real Thread object created inside.
        # `worker = threading.Thread(...)`
        # We can mock threading.Thread to control `is_alive`.
        
        with patch('backend.services.process_service.threading.Thread') as MockThread:
            t_instance = MockThread.return_value
            t_instance.is_alive.return_value = True
            
            # Need to ensure do_work doesn't actually run/fail if start() is called on mock
            # MockThread return value is the thread instance. 
            # We don't need real thread logic if we mock the queue.
            
            generator = process_video_logic('vid', 'en', False, True)
            events = list(generator)
            
            # Should have PING then Error
            assert len(events) >= 2
            ping = json.loads(events[0].replace('data: ', ''))
            assert ping.get('ping') is True
            
            err = json.loads(events[1].replace('data: ', ''))
            assert err.get('error') == 'Stop'

@patch('backend.services.process_service.SERVER_API_KEY', 'fake-key')
def test_process_video_logic_worker_died(mock_dependencies):
    # Queue Empty and worker dead -> yield unexpected exit
    with patch('backend.services.process_service.queue.Queue') as MockQueue:
        q_instance = MockQueue.return_value
        q_instance.get.side_effect = [queue.Empty]
        
        with patch('backend.services.process_service.threading.Thread') as MockThread:
            t_instance = MockThread.return_value
            t_instance.is_alive.return_value = False # Dead
            
            generator = process_video_logic('vid', 'en', False, True)
            events = list(generator)
            
            assert len(events) == 1
            err = json.loads(events[0].replace('data: ', ''))
            assert err.get('error') == 'Processing ended unexpectedly'

@patch('backend.services.process_service.SERVER_API_KEY', 'fake-key')
@patch('backend.services.process_service.ENABLE_WHISPER', True)
def test_process_video_logic_invalid_audio(mock_dependencies):
    # Scenario: Whisper path, but audio invalid
    with patch('os.path.exists', return_value=False):
        # yt-dlp info
        mock_instance = mock_dependencies['ytdl'].YoutubeDL.return_value.__enter__.return_value
        mock_instance.extract_info.return_value = {}
        
        mock_dependencies['audio'].return_value = '/tmp/bad.mp3'
        
        with patch('backend.services.process_service.validate_audio_file', return_value=(False, 'Too small')):
             
             # Need to run real thread logic so we don't mock Queue here.
             # We rely on do_work putting error in queue.
             
             generator = process_video_logic('vid', 'en', False, True)
             # Consume generator
             events = list(generator)
             
             # Look for error event
             err_events = [e for e in events if 'error' in e]
             assert err_events
             data = json.loads(err_events[0].replace('data: ', ''))
             assert 'Audio download failed' in data['error']

@patch('backend.services.process_service.SERVER_API_KEY', 'fake-key')
def test_process_video_logic_no_subs_no_whisper(mock_dependencies):
    # Scenario: No manual, no auto, whisper disabled
    with patch('os.path.exists', return_value=False), \
         patch('backend.services.process_service.ENABLE_WHISPER', False):
        
        mock_instance = mock_dependencies['ytdl'].YoutubeDL.return_value.__enter__.return_value
        mock_instance.extract_info.return_value = {'subtitles':{}, 'automatic_captions':{}}
        
        generator = process_video_logic('vid', 'en', False, True)
        events = list(generator)
        
        err_events = [e for e in events if 'error' in e]
        assert err_events
        data = json.loads(err_events[0].replace('data: ', ''))
        assert data['error'] == 'No subtitles available'
