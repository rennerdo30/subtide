import sys
import types
import pytest
from unittest.mock import MagicMock, patch
import backend.services.whisper_service as ws

def reset_backend():
    ws._whisper_backend = None
    ws._diarization_pipeline = None

def test_whisper_backend_detection_mlx():
    reset_backend()
    with patch('platform.system', return_value='Darwin'), \
         patch('platform.machine', return_value='arm64'), \
         patch.dict(sys.modules, {'mlx_whisper': MagicMock()}):
         
        assert ws.get_whisper_backend() == 'mlx-whisper'
        assert ws.get_whisper_device() == 'metal'

def test_whisper_backend_detection_openai_whisper():
    reset_backend()
    # Simulate Linux/Intel where mlx and faster-whisper are not available
    with patch('platform.system', return_value='Linux'), \
         patch('platform.machine', return_value='x86_64'), \
         patch.dict(sys.modules, {'mlx_whisper': None, 'faster_whisper': None}), \
         patch.dict(sys.modules, {'whisper': MagicMock()}):
        assert ws.get_whisper_backend() == 'openai-whisper'

def test_get_whisper_device_cuda():
    mock_torch = MagicMock()
    mock_torch.cuda.is_available.return_value = True
    with patch('backend.services.whisper_service.get_whisper_backend', return_value='openai-whisper'), \
         patch('backend.services.whisper_service._ensure_torch', return_value=mock_torch):
        assert ws.get_whisper_device() == 'cuda'

def test_get_whisper_device_cpu():
    mock_torch = MagicMock()
    mock_torch.cuda.is_available.return_value = False
    mock_torch.backends.mps.is_available.return_value = False
    with patch('backend.services.whisper_service.get_whisper_backend', return_value='openai-whisper'), \
         patch('backend.services.whisper_service._ensure_torch', return_value=mock_torch):
        assert ws.get_whisper_device() == 'cpu'

def test_get_whisper_device_mps():
    mock_torch = MagicMock()
    mock_torch.cuda.is_available.return_value = False
    mock_torch.backends.mps.is_available.return_value = True
    with patch('backend.services.whisper_service.get_whisper_backend', return_value='openai-whisper'), \
         patch('backend.services.whisper_service._ensure_torch', return_value=mock_torch):
        assert ws.get_whisper_device() == 'mps'

def test_get_diarization_pipeline_no_token():
    reset_backend()
    with patch('backend.services.whisper_service.HF_TOKEN', None):
        assert ws.get_diarization_pipeline() is None

def test_get_diarization_pipeline_load_fail():
    reset_backend()
    mock_torch = MagicMock()
    mock_torch.backends.mps.is_available.return_value = False
    mock_torch.cuda.is_available.return_value = False

    fake_pyannote = types.ModuleType('pyannote')
    fake_pyannote_audio = types.ModuleType('pyannote.audio')
    fake_pipeline = MagicMock()
    fake_pipeline.from_pretrained.side_effect = Exception("Fail")
    fake_pyannote_audio.Pipeline = fake_pipeline
    fake_pyannote.audio = fake_pyannote_audio

    with patch('backend.services.whisper_service.HF_TOKEN', 'tok'), \
         patch('backend.services.whisper_service.ENABLE_DIARIZATION', True), \
         patch('backend.services.whisper_service._ensure_torch', return_value=mock_torch), \
         patch.dict(sys.modules, {'pyannote': fake_pyannote, 'pyannote.audio': fake_pyannote_audio}):
        assert ws.get_diarization_pipeline() is None
