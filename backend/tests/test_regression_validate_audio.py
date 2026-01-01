import os
import pytest
from backend.utils.file_utils import validate_audio_file

def test_validate_audio_file_return_type(tmp_path):
    """
    REGRESSION TEST: Ensure validate_audio_file returns a (bool, str) tuple.
    Expected usage in process_service.py: is_valid, err_msg = validate_audio_file(audio_file)
    """
    # 1. Test existing file
    p = tmp_path / "valid.mp3"
    p.write_text("audio data")
    result = validate_audio_file(str(p))
    
    assert isinstance(result, tuple), f"Expected tuple, got {type(result)}"
    assert len(result) == 2
    assert result[0] is True
    assert result[1] == ""
    
    # 2. Test non-existent file
    result = validate_audio_file(str(tmp_path / "missing.mp3"))
    assert isinstance(result, tuple)
    assert result[0] is False
    assert result[1] == "File does not exist"
    
    # 3. Test empty file
    p_empty = tmp_path / "empty.mp3"
    p_empty.write_text("")
    result = validate_audio_file(str(p_empty))
    assert isinstance(result, tuple)
    assert result[0] is False
    assert result[1] == "File is empty"

def test_validate_audio_file_unpacking():
    """
    Verifies that the function can be unpacked without ValueError/TypeError.
    """
    with patch('os.path.exists', return_value=True), \
         patch('os.path.getsize', return_value=100):
        try:
            is_valid, err_msg = validate_audio_file("fake.mp3")
            assert is_valid is True
        except (TypeError, ValueError) as e:
            pytest.fail(f"Unpacking failed: {e}")

from unittest.mock import patch
