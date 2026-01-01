import pytest
from unittest.mock import patch, MagicMock
from backend.utils.file_utils import get_cache_path
from backend.utils.model_utils import get_model_context_size

def test_get_cache_path_default():
    # Test line 12-14: cache_dir is None
    # We need to mock backend.config.CACHE_DIR
    with patch('backend.config.CACHE_DIR', '/mock/cache'):
        path = get_cache_path('vid123')
        assert path == '/mock/cache/vid123_subtitles.json'

def test_get_model_context_size_none():
    assert get_model_context_size(None) == 8192
    assert get_model_context_size("") == 8192

def test_get_model_context_size_unknown():
    assert get_model_context_size("unknown-model-xyz") == 8192

def test_get_model_context_size_partial():
    # 'gpt-4o' is 128000. 'gpt-4o-custom' should match 'gpt-4o'?
    # Logic: if key in model_lower.
    # 'gpt-4o' key is in 'gpt-4o-custom'.
    assert get_model_context_size("gpt-4o-custom") == 128000

def test_get_model_context_size_exact():
    assert get_model_context_size("gpt-4") == 8192
