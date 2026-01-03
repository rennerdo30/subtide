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
