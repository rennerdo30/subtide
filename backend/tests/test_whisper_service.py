import pytest
from unittest.mock import MagicMock, patch
from backend.services.whisper_service import run_whisper_process, get_whisper_device

@pytest.fixture
def mock_get_whisper_model():
    with patch('backend.services.whisper_service.get_whisper_model') as mock:
        yield mock

@pytest.fixture
def mock_vad():
    """Mock VAD functions to prevent actual model loading in tests."""
    with patch('backend.services.whisper_service.ENABLE_VAD', False):
        yield

def test_run_whisper_process_openai_whisper(mock_get_whisper_model, mock_vad):
    # Setup mock model
    mock_model = mock_get_whisper_model.return_value
    
    # OpenAI whisper returns a dict directly
    mock_model.transcribe.return_value = {
        'segments': [{'start': 0.0, 'end': 2.0, 'text': 'Hello OpenAI', 'words': []}],
        'text': 'Hello OpenAI',
        'language': 'en'
    }
    
    with patch('backend.services.whisper_service.get_whisper_backend', return_value='openai-whisper'), \
         patch('backend.services.whisper_service.ENABLE_WHISPER', True), \
         patch('backend.services.whisper_service.get_diarization_pipeline', return_value=None):
        
        result = run_whisper_process("fake_audio.mp3")
    
        assert len(result['segments']) == 1
        assert result['text'] == "Hello OpenAI"
        # Verify transcribe was called
        mock_model.transcribe.assert_called_once()

def test_get_whisper_device_mlx():
    with patch('backend.services.whisper_service.get_whisper_backend', return_value='mlx-whisper'):
        assert get_whisper_device() == "metal"

def test_run_whisper_process_segment_level_diarization(mock_get_whisper_model, mock_vad):
    """Test that segment-level speaker matching assigns one speaker per segment."""
    mock_model = mock_get_whisper_model.return_value
    
    # Segment with two words - with segment-level matching, the whole segment gets one speaker
    mock_model.transcribe.return_value = {
        'segments': [{
            'start': 0.0, 
            'end': 2.0, 
            'text': 'Hello World',
            'words': [
                {'word': 'Hello', 'start': 0.0, 'end': 1.0},
                {'word': 'World', 'start': 1.0, 'end': 2.0}
            ]
        }],
        'text': 'Hello World',
        'language': 'en'
    }
    
    # Mock diarization pipeline
    mock_pipeline = MagicMock()
    
    TurnA = MagicMock()
    TurnA.start = 0.0
    TurnA.end = 1.5  # More overlap with segment
    
    TurnB = MagicMock()
    TurnB.start = 1.5
    TurnB.end = 2.0
    
    mock_pipeline.return_value.itertracks.return_value = [
        (TurnA, None, "SPEAKER_A"),
        (TurnB, None, "SPEAKER_B")
    ]
    
    with patch('backend.services.whisper_service.get_whisper_backend', return_value='openai-whisper'), \
         patch('backend.services.whisper_service.get_diarization_pipeline', return_value=mock_pipeline), \
         patch('backend.services.whisper_service.ENABLE_WHISPER', True), \
         patch('backend.services.whisper_service.ENABLE_DIARIZATION', True), \
         patch('os.path.exists', return_value=True), \
         patch('subprocess.run'):
        
        result = run_whisper_process("fake_audio.mp3")
        
        # With segment-level matching, the segment stays as ONE segment
        assert len(result['segments']) == 1
        # Speaker with most overlap wins
        assert result['segments'][0]['speaker'] == 'SPEAKER_A'
        assert result['segments'][0]['text'] == 'Hello World'

def test_run_whisper_process_long_segment_split(mock_get_whisper_model, mock_vad):
    """Test that segments exceeding MAX_SUBTITLE_WORDS are split."""
    mock_model = mock_get_whisper_model.return_value
    
    # Create a segment with 20 unique words (exceeds default MAX_SUBTITLE_WORDS=15)
    # Use different base names to avoid triggering hallucination filter
    unique_words = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta',
                    'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'omicron', 'pi',
                    'rho', 'sigma', 'tau', 'upsilon']
    words = [{'word': f' {unique_words[i]}', 'start': i * 0.5, 'end': (i + 1) * 0.5} for i in range(20)]
    
    mock_model.transcribe.return_value = {
        'segments': [{
            'start': 0.0, 
            'end': 10.0, 
            'text': ' '.join(unique_words),
            'words': words
        }],
        'text': ' '.join(unique_words),
        'language': 'en'
    }
    
    mock_pipeline = MagicMock()
    TurnA = MagicMock()
    TurnA.start = 0.0
    TurnA.end = 10.0
    
    mock_pipeline.return_value.itertracks.return_value = [
        (TurnA, None, "SPEAKER_A")
    ]
    
    # Patch filter_hallucinations to return input unchanged (test focuses on segment splitting)
    with patch('backend.services.whisper_service.get_whisper_backend', return_value='openai-whisper'), \
         patch('backend.services.whisper_service.get_diarization_pipeline', return_value=mock_pipeline), \
         patch('backend.services.whisper_service.ENABLE_WHISPER', True), \
         patch('backend.services.whisper_service.ENABLE_DIARIZATION', True), \
         patch('backend.services.whisper_service.filter_hallucinations', side_effect=lambda x: x), \
         patch('os.path.exists', return_value=True), \
         patch('subprocess.run'):
        
        result = run_whisper_process("fake_audio.mp3")
        
        # Should be split into at least 2 segments (20 words / 15 max = 2 segments)
        assert len(result['segments']) >= 2
        # All segments should have the same speaker
        for seg in result['segments']:
            assert seg['speaker'] == 'SPEAKER_A'

def test_get_speech_timestamps_pipe(mock_vad):
    """Test that get_speech_timestamps uses ffmpeg pipe when torchaudio load fails."""
    # Ensure modules are imported so we can patch them globally
    import torchaudio
    import torch
    import numpy as np
    from backend.services.whisper_service import get_speech_timestamps
    
    with patch('backend.services.whisper_service.ENABLE_VAD', True), \
         patch('backend.services.whisper_service.get_vad_model') as mock_get_model, \
         patch('backend.services.whisper_service._ensure_torch'), \
         patch('torchaudio.load') as mock_torchaudio_load, \
         patch('backend.services.whisper_service.subprocess.run') as mock_run, \
         patch('torch.from_numpy') as mock_from_numpy, \
         patch('numpy.frombuffer') as mock_np_frombuffer:
         
        # Mock VAD model return
        mock_model = MagicMock()
        mock_utils = (MagicMock(),) # Tuple as in real implementation
        mock_get_model.return_value = (mock_model, mock_utils, 'cpu')
        
        # Mock torchaudio.load FAILURE to trigger pipe
        mock_torchaudio_load.side_effect = Exception("Format not supported")
        
        # Mock subprocess.run success
        mock_process = MagicMock()
        # Return 32k bytes (enough for 1 second of 16-bit mono 16kHz audio)
        mock_process.stdout = b'\x00' * 32000 
        mock_process.returncode = 0
        mock_run.return_value = mock_process
        
        # Mock numpy/torch conversion
        mock_np_array = MagicMock()
        mock_np_frombuffer.return_value.flatten.return_value.astype.return_value = mock_np_array
        # Division result
        mock_np_array.__truediv__.return_value = mock_np_array 
        
        # Mock torch.from_numpy to return a tensor
        mock_tensor = MagicMock()
        mock_tensor.unsqueeze.return_value = mock_tensor
        mock_tensor.__len__.return_value = 16000 # 1 second length
        mock_tensor.__getitem__.return_value = mock_tensor # Chunk slicing
        
        mock_from_numpy.return_value = mock_tensor
        
        # Run function
        get_speech_timestamps("test.m4a")
        
        # Verify torchaudio.load called first
        mock_torchaudio_load.assert_called_with("test.m4a")
        
        # Verify ffmpeg pipe called
        mock_run.assert_called_once()
        cmd = mock_run.call_args[0][0]
        assert cmd[0] == 'ffmpeg'
        assert '-i' in cmd
        assert 'test.m4a' in cmd
        assert '-' in cmd # Pipe output
        assert 's16le' in cmd # Format


def test_run_whisper_process_mlx_backend(mock_vad):
    """Test MLX backend transcription path."""
    with patch('backend.services.whisper_service.get_whisper_backend', return_value='mlx-whisper'), \
         patch('backend.services.whisper_service.ENABLE_WHISPER', True), \
         patch('backend.services.whisper_service.get_diarization_pipeline', return_value=None), \
         patch('backend.services.whisper_service.normalize_audio', side_effect=lambda x, **kw: x), \
         patch('backend.services.whisper_service.should_normalize', return_value=False), \
         patch('backend.services.whisper_service._run_mlx_direct') as mock_mlx_direct, \
         patch('backend.services.whisper_service.estimate_transcription_time', return_value=10.0), \
         patch('backend.services.whisper_service.threading.Thread') as mock_thread, \
         patch('backend.services.whisper_service.os.path.exists', return_value=True), \
         patch('backend.services.whisper_service.WHISPER_MODEL_SIZE', 'base'):

        # Mock the MLX direct result
        mock_mlx_direct.return_value = {
            'segments': [{'start': 0.0, 'end': 2.0, 'text': 'Hello MLX', 'words': []}],
            'text': 'Hello MLX',
            'language': 'en'
        }

        # Mock thread to prevent actual threading
        mock_thread_instance = MagicMock()
        mock_thread.return_value = mock_thread_instance

        result = run_whisper_process("fake_audio.mp3")

        # Verify MLX direct was called
        mock_mlx_direct.assert_called_once()

        # Verify result structure
        assert 'segments' in result
        assert result['text'] == 'Hello MLX'


def test_get_whisper_device_all_backends():
    """Test device detection for all supported backends."""
    with patch('backend.services.whisper_service.get_whisper_backend', return_value='mlx-whisper'):
        assert get_whisper_device() == "metal"

    with patch('backend.services.whisper_service.get_whisper_backend', return_value='openai-whisper'):
        with patch('backend.services.whisper_service.torch') as mock_torch:
            mock_torch.cuda.is_available.return_value = True
            assert get_whisper_device() == "cuda"

            mock_torch.cuda.is_available.return_value = False
            mock_torch.backends.mps.is_available.return_value = True
            assert get_whisper_device() == "mps"

            mock_torch.backends.mps.is_available.return_value = False
            assert get_whisper_device() == "cpu"
