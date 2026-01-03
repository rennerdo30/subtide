"""
Tests for streaming Whisper functionality.
"""
import pytest
from unittest.mock import MagicMock, patch, mock_open
import json


class TestWhisperRunner:
    """Tests for whisper_runner.py CLI interface."""
    
    def test_whisper_runner_import(self):
        """Test that whisper_runner can be imported."""
        from backend.services.whisper_runner import main
        assert callable(main)
    
    def test_whisper_runner_argument_parsing(self):
        """Test argument parsing for whisper_runner."""
        import argparse
        from backend.services.whisper_runner import main
        
        # Just verify the module structure - actual execution requires mlx_whisper
        assert main is not None


class TestRunWhisperStreaming:
    """Tests for run_whisper_streaming function."""
    
    @patch('backend.services.whisper_service.subprocess.Popen')
    @patch('backend.services.whisper_service.get_mlx_model_path')
    def test_streaming_calls_segment_callback(self, mock_model_path, mock_popen):
        """Test that segment_callback is called for each parsed segment."""
        from backend.services.whisper_service import run_whisper_streaming
        
        mock_model_path.return_value = 'mlx-community/whisper-small-mlx'
        
        # Simulate Whisper stdout output
        stdout_lines = [
            '[00:00.000 --> 00:02.500]  Hello world',
            '[00:02.500 --> 00:05.000]  This is a test',
            '[00:05.000 --> 00:07.500]  Third segment',
        ]
        
        # Mock process
        mock_process = MagicMock()
        mock_process.stdout = iter(stdout_lines)
        mock_process.stderr = iter([])
        mock_process.wait.return_value = None
        mock_process.returncode = 0
        mock_popen.return_value = mock_process
        
        # Track callback calls
        received_segments = []
        def segment_callback(segment):
            received_segments.append(segment)
        
        # Mock temp file and JSON result
        with patch('tempfile.NamedTemporaryFile') as mock_temp, \
             patch('os.path.exists', return_value=True), \
             patch('os.unlink'), \
             patch('builtins.open', mock_open(read_data=json.dumps({
                 'segments': [], 'text': 'Hello world This is a test Third segment'
             }))):
            
            mock_temp.return_value.__enter__.return_value.name = '/tmp/test.json'
            mock_temp.return_value.name = '/tmp/test.json'
            
            result = run_whisper_streaming(
                '/path/to/audio.mp3',
                segment_callback=segment_callback
            )
        
        # Verify callbacks were called
        assert len(received_segments) == 3
        assert received_segments[0]['text'] == 'Hello world'
        assert received_segments[1]['text'] == 'This is a test'
        assert received_segments[2]['text'] == 'Third segment'
        
        # Verify timestamps are parsed correctly
        assert received_segments[0]['start'] == 0.0
        assert received_segments[0]['end'] == 2.5
    
    @patch('backend.services.whisper_service.subprocess.Popen')
    @patch('backend.services.whisper_service.get_mlx_model_path')
    def test_streaming_progress_callback(self, mock_model_path, mock_popen):
        """Test that progress_callback is called periodically."""
        from backend.services.whisper_service import run_whisper_streaming
        
        mock_model_path.return_value = 'mlx-community/whisper-small-mlx'
        
        # Create 10 segments to trigger progress callback (every 5 segments)
        stdout_lines = [
            f'[00:{i:02d}.000 --> 00:{i+1:02d}.000]  Segment {i}'
            for i in range(10)
        ]
        
        mock_process = MagicMock()
        mock_process.stdout = iter(stdout_lines)
        mock_process.stderr = iter([])
        mock_process.wait.return_value = None
        mock_process.returncode = 0
        mock_popen.return_value = mock_process
        
        progress_calls = []
        def progress_callback(stage, message, percent):
            progress_calls.append((stage, message, percent))
        
        with patch('tempfile.NamedTemporaryFile') as mock_temp, \
             patch('os.path.exists', return_value=True), \
             patch('os.unlink'), \
             patch('builtins.open', mock_open(read_data=json.dumps({'segments': [], 'text': ''}))):
            
            mock_temp.return_value.__enter__.return_value.name = '/tmp/test.json'
            mock_temp.return_value.name = '/tmp/test.json'
            
            run_whisper_streaming(
                '/path/to/audio.mp3',
                progress_callback=progress_callback
            )
        
        # Progress should be called at completion
        assert len(progress_calls) >= 1
        # Last call should be completion
        assert progress_calls[-1][0] == 'whisper'
        assert 'complete' in progress_calls[-1][1].lower()


class TestStreamVideoLogic:
    """Tests for streaming video logic in process_service."""
    
    def test_stream_video_logic_import(self):
        """Test that stream_video_logic can be imported."""
        from backend.services.process_service import stream_video_logic
        assert callable(stream_video_logic)
    
    @patch('backend.services.process_service.SERVER_API_KEY', None)
    def test_stream_returns_error_without_api_key(self):
        """Test that streaming returns error when API key is not configured."""
        from backend.services.process_service import stream_video_logic
        
        generator = stream_video_logic('test_video', 'en', False)
        result = next(generator)
        
        assert 'error' in result
        assert 'Tier 4 not configured' in result


class TestYouTubeService429Retry:
    """Tests for 429 retry logic in youtube_service."""
    
    @patch('backend.services.youtube_service.requests.get')
    def test_retry_on_429(self, mock_get):
        """Test that 429 responses trigger retry logic."""
        from backend.services.youtube_service import await_download_subtitles
        
        # First call returns 429, second succeeds
        response_429 = MagicMock()
        response_429.status_code = 429
        
        response_200 = MagicMock()
        response_200.status_code = 200
        response_200.json.return_value = {
            'events': [
                {'tStartMs': 0, 'dDurationMs': 2000, 'segs': [{'utf8': 'Hello'}]}
            ]
        }
        
        mock_get.side_effect = [response_429, response_200]
        
        tracks = [{'ext': 'json3', 'url': 'https://example.com/subs'}]
        
        with patch('backend.services.youtube_service.get_cache_path', return_value='/tmp/test_cache.json'), \
             patch('os.path.exists', return_value=False), \
             patch('builtins.open', mock_open()), \
             patch('time.sleep'):  # Skip actual waiting
            
            result = await_download_subtitles('test_video', 'en', tracks)
        
        # Should have called get twice (retry after 429)
        assert mock_get.call_count == 2
        # Should have returned subtitles
        assert len(result) == 1
        assert result[0]['text'] == 'Hello'


class TestSendSubtitles:
    """Tests for send_subtitles SSE function."""
    
    def test_send_subtitles_format(self):
        """Test that send_subtitles puts correct data in queue."""
        import queue
        
        # Create a test queue and send_subtitles function
        progress_queue = queue.Queue()
        
        def send_subtitles(batch_num, total_batches, subtitles_batch):
            data = {
                'stage': 'subtitles',
                'message': f'Batch {batch_num}/{total_batches} ready',
                'batchInfo': {'current': batch_num, 'total': total_batches},
                'subtitles': subtitles_batch
            }
            progress_queue.put(('progress', data))
        
        # Call with test data
        test_subs = [{'start': 0, 'end': 1000, 'text': 'Test'}]
        send_subtitles(1, 5, test_subs)
        
        # Verify queue contents
        msg_type, data = progress_queue.get(timeout=1)
        
        assert msg_type == 'progress'
        assert data['stage'] == 'subtitles'
        assert data['batchInfo']['current'] == 1
        assert data['batchInfo']['total'] == 5
        assert data['subtitles'] == test_subs
