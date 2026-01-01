import pytest
from unittest.mock import MagicMock, patch
from backend.services.whisper_service import run_whisper_process, get_whisper_device

@pytest.fixture
def mock_get_whisper_model():
    with patch('backend.services.whisper_service.get_whisper_model') as mock:
        yield mock

def test_run_whisper_process_faster_whisper(mock_get_whisper_model):
    # Setup mock model
    mock_model = mock_get_whisper_model.return_value
    
    Segment = MagicMock()
    Segment.start = 0.0
    Segment.end = 2.0
    Segment.text = "Hello world"
    
    Info = MagicMock()
    Info.language = "en"
    
    def segment_gen():
        yield Segment
        
    mock_model.transcribe.return_value = (segment_gen(), Info)
    
    with patch('backend.services.whisper_service.WHISPER_BACKEND', 'faster-whisper'):
        with patch('backend.services.whisper_service.get_diarization_pipeline', return_value=None):
             with patch('backend.services.whisper_service.ENABLE_WHISPER', True):
                 result = run_whisper_process("fake_audio.mp3")
        
                 assert len(result['segments']) == 1
                 assert result['segments'][0]['text'] == "Hello world"
                 mock_model.transcribe.assert_called_once()

def test_run_whisper_process_openai_whisper(mock_get_whisper_model):
    # Setup mock model
    mock_model = mock_get_whisper_model.return_value
    
    # OpenAI whisper returns a dict directly
    mock_model.transcribe.return_value = {
        'segments': [{'start': 0.0, 'end': 2.0, 'text': 'Hello OpenAI'}],
        'text': 'Hello OpenAI',
        'language': 'en'
    }
    
    with patch('backend.services.whisper_service.WHISPER_BACKEND', 'openai-whisper'):
        with patch('backend.services.whisper_service.get_diarization_pipeline', return_value=None):
             with patch('backend.services.whisper_service.ENABLE_WHISPER', True):
                 result = run_whisper_process("fake_audio.mp3")
        
                 assert len(result['segments']) == 1
                 assert result['text'] == "Hello OpenAI"
                 mock_model.transcribe.assert_called_once()

@patch('backend.services.whisper_service.WHISPER_BACKEND', 'faster-whisper')
@patch('torch.cuda.is_available', return_value=True)
def test_get_whisper_device_cuda(mock_cuda):
    assert get_whisper_device() == "cuda"

@patch('backend.services.whisper_service.WHISPER_BACKEND', 'faster-whisper')
@patch('torch.cuda.is_available', return_value=False)
def test_get_whisper_device_cpu(mock_cuda):
    assert get_whisper_device() == "cpu"

@patch('backend.services.whisper_service.WHISPER_BACKEND', 'mlx-whisper')
def test_get_whisper_device_mlx():
    assert get_whisper_device() == "metal"

def test_run_whisper_process_diarization(mock_get_whisper_model):
    # Mock model
    mock_model = mock_get_whisper_model.return_value
    Segment = MagicMock()
    Segment.start = 0.0
    Segment.end = 2.0
    Segment.text = "Hello"
    Info = MagicMock()
    Info.language = "en"
    
    mock_model.transcribe.return_value = (iter([Segment]), Info)
    
    # Mock diarization pipeline
    mock_pipeline = MagicMock()
    
    # Mock turn
    Turn = MagicMock()
    Turn.start = 0.0
    Turn.end = 2.0
    
    mock_pipeline.return_value.itertracks.return_value = [
        (Turn, None, "SPEAKER_01")
    ]
    
    with patch('backend.services.whisper_service.WHISPER_BACKEND', 'faster-whisper'), \
         patch('backend.services.whisper_service.get_diarization_pipeline', return_value=mock_pipeline), \
         patch('backend.services.whisper_service.ENABLE_WHISPER', True), \
         patch('backend.services.whisper_service.ENABLE_DIARIZATION', True), \
         patch('os.path.exists', return_value=True), \
         patch('subprocess.run') as mock_run:
        
        result = run_whisper_process("fake_audio.mp3")
        
        assert result['segments'][0]['speaker'] == "SPEAKER_01"
