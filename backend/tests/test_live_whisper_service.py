import unittest
from unittest.mock import MagicMock, patch
import numpy as np
import queue
import sys
import platform
import pytest

# Import LiveWhisperService only on macOS to avoid MLX import errors on Linux
if platform.system() == 'Darwin':
    # Mock modules before importing the service
    mock_faster_whisper = MagicMock()
    mock_whisper_service = MagicMock()
    mock_translation_service = MagicMock()
    mock_mlx = MagicMock()
    mock_mlx_whisper = MagicMock()

    with patch.dict('sys.modules', {
        'faster_whisper': mock_faster_whisper,
        'backend.services.whisper_service': mock_whisper_service,
        'backend.services.translation_service': mock_translation_service,
        'mlx': mock_mlx,
        'mlx.core': mock_mlx.core,
        'mlx_whisper': mock_mlx_whisper,
        'mlx_whisper.load_models': mock_mlx_whisper.load_models,
        'mlx_whisper.decoding': mock_mlx_whisper.decoding,
        'mlx_whisper.audio': mock_mlx_whisper.audio
    }):
        from backend.services.live_whisper_service import LiveWhisperService
else:
    LiveWhisperService = None

@pytest.mark.skipif(platform.system() != 'Darwin', reason="MLX is only available on macOS")
class TestLiveWhisperService(unittest.TestCase):
    def setUp(self):
        self.mock_socketio = MagicMock()
        self.sid = "test_sid"
        self.target_lang = "es"
        
        # Setup get_whisper_model mock to return a string (MLX path)
        mock_whisper_service.get_whisper_model.return_value = "mlx-community/whisper-base-mlx"
        
        # Initialize service - mocks are already in sys.modules
        self.service = LiveWhisperService(self.sid, self.target_lang, self.mock_socketio)

    def test_add_audio(self):
        # Create 16kHz PCM audio (1 second of silence)
        pcm_data = np.zeros(16000, dtype=np.int16)
        pcm_bytes = pcm_data.tobytes()
        
        self.service.add_audio(pcm_bytes)
        
        self.assertEqual(self.service.audio_queue.qsize(), 1)
        chunk = self.service.audio_queue.get()
        self.assertEqual(len(chunk), 16000)
        self.assertEqual(chunk.dtype, np.float32)

    def test_transcribe_and_translate(self):
        # Prepare buffer
        self.service.audio_buffer = np.zeros(32000, dtype=np.float32) # 2 seconds
        
        # Configure MLX decode mock
        # LiveWhisperService uses mlx_whisper.decoding.decode
        with patch('mlx_whisper.decoding.decode') as mock_decode:
            mock_res = MagicMock()
            mock_res.text = "Hello world"
            mock_decode.return_value = mock_res
            
            # Configure translation mock
            mock_translation_service.await_translate_subtitles.return_value = [{'translatedText': 'Hola mundo'}]
            
            # Run
            self.service._transcribe_and_translate()
        
        # Verify transcription emitted
        self.mock_socketio.emit.assert_any_call(
            'live_result',
            {
                'text': 'Hello world',
                'translatedText': None,
                'language': 'en',
                'status': 'transcribing'
            },
            room=self.sid,
            namespace='/live'
        )
        
        # Verify background task started
        self.mock_socketio.start_background_task.assert_called_once()
        
        # Extract task and run it manually to verify translation logic
        task_args = self.mock_socketio.start_background_task.call_args[0]
        func = task_args[0]
        args = task_args[1:]
        
        func(*args)
        
        # Verify translation emitted
        self.mock_socketio.emit.assert_called_with(
            'live_result',
            {
                'text': 'Hello world',
                'translatedText': 'Hola mundo',
                'language': 'en',
                'status': 'final'
            },
            room=self.sid,
            namespace='/live'
        )

    def test_process_loop_logic(self):
        self.service.running = True
        
        # Mock _transcribe_and_translate to stop the loop
        self.service._transcribe_and_translate = MagicMock(side_effect=lambda: setattr(self.service, 'running', False))
        
        # Add data
        chunk = np.zeros(32000, dtype=np.float32)
        self.service.audio_queue.put(chunk)
        
        # Run loop
        self.service._process_loop()
        
        self.service._transcribe_and_translate.assert_called_once()
        # Verify buffer sliding window
        self.assertEqual(len(self.service.audio_buffer), 8000)

if __name__ == '__main__':
    unittest.main()
