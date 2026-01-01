import os
import pytest
from backend.utils.file_utils import get_cache_path, validate_audio_file
from backend.utils.model_utils import get_model_context_size
from backend.services.translation_service import format_eta, estimate_translation_time

def test_get_cache_path(mock_cache_dir):
    # Test default suffix
    path = get_cache_path("video123", cache_dir=mock_cache_dir)
    assert path == os.path.join(mock_cache_dir, "video123_subtitles.json")
    
    # Test custom suffix
    path = get_cache_path("video123", suffix="audio", cache_dir=mock_cache_dir)
    assert path == os.path.join(mock_cache_dir, "video123_audio.json")

def test_validate_audio_file(tmp_path):
    # Create a dummy file
    d = tmp_path / "subdir"
    d.mkdir()
    p = d / "test.mp3"
    p.write_text("some content")
    
    is_valid, msg = validate_audio_file(str(p))
    assert is_valid is True
    assert msg == ""
    
    # Test non-existent file
    is_valid, msg = validate_audio_file(str(d / "nonexistent.mp3"))
    assert is_valid is False
    assert msg == "File does not exist"
    
    # Test empty file
    empty = d / "empty.mp3"
    empty.write_text("")
    is_valid, msg = validate_audio_file(str(empty))
    assert is_valid is False
    assert msg == "File is empty"

def test_get_model_context_size():
    assert get_model_context_size("gpt-4o") == 128000
    assert get_model_context_size("gpt-3.5-turbo") == 16385
    assert get_model_context_size("unknown-model") == 8192
    assert get_model_context_size("claude-3-opus") == 200000

def test_format_eta():
    # We need to import format_eta from where it is defined. 
    # Currently it seems it was moved to services/translation_service.py or left in app.py?
    # Let's check where we put it. Ideally it should be in utils/logging_utils.py or similar
    # But based on my previous refactor, I put it in logging_utils? No, I put it in translation_service.py 
    # actually wait, I put it in services/translation_service.py AND there wa a copy in app.py
    
    # Let's verify where format_eta is.
    from backend.services.translation_service import format_eta as fmt_eta
    
    assert fmt_eta(30) == "30s"
    assert fmt_eta(90) == "1m 30s"
    assert fmt_eta(3665) == "1h 1m"
    assert fmt_eta(0) == ""
    assert fmt_eta(None) == ""
