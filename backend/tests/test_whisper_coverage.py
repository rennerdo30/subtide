import sys
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
    # Simulate Linux/Intel where mlx is not available
    with patch('platform.system', return_value='Linux'), \
         patch('platform.machine', return_value='x86_64'), \
         patch.dict(sys.modules, {'mlx_whisper': None}, clear=True):
         # Hide whisper as well to see if it handles missing backend
         with patch.dict(sys.modules, {'whisper': MagicMock()}):
             assert ws.get_whisper_backend() == 'openai-whisper'

def test_get_whisper_device_cuda():
    with patch('backend.services.whisper_service.get_whisper_backend', return_value='openai-whisper'), \
         patch('torch.cuda.is_available', return_value=True):
        assert ws.get_whisper_device() == 'cuda'

def test_get_whisper_device_cpu():
    with patch('backend.services.whisper_service.get_whisper_backend', return_value='openai-whisper'), \
         patch('torch.cuda.is_available', return_value=False), \
         patch('torch.backends.mps.is_available', return_value=False):
        assert ws.get_whisper_device() == 'cpu'

def test_get_whisper_device_mps():
    with patch('backend.services.whisper_service.get_whisper_backend', return_value='openai-whisper'), \
         patch('torch.cuda.is_available', return_value=False), \
         patch('torch.backends.mps.is_available', return_value=True):
        assert ws.get_whisper_device() == 'mps'

def test_get_diarization_pipeline_no_token():
    reset_backend()
    with patch('backend.services.whisper_service.HF_TOKEN', None):
        assert ws.get_diarization_pipeline() is None

def test_get_diarization_pipeline_load_fail():
    reset_backend()
    with patch('backend.services.whisper_service.HF_TOKEN', 'tok'), \
         patch('backend.services.whisper_service.ENABLE_DIARIZATION', True):
        # Patch the function that loads the pipeline
        with patch('pyannote.audio.Pipeline.from_pretrained', side_effect=Exception("Fail")):
            assert ws.get_diarization_pipeline() is None
