import pytest
from unittest.mock import MagicMock, patch, ANY
import json
import time
from backend.services.translation_service import (
    save_batch_time_history,
    get_historical_batch_time,
    await_translate_subtitles
)

def test_save_batch_time_history_fail(mock_cache_dir):
    # Mock open to raise exception
    with patch('builtins.open', side_effect=IOError("Permission denied")):
        # Should catch and log warning, not raise
        save_batch_time_history([1.0, 2.0])

def test_get_historical_batch_time_fail():
    with patch('builtins.open', side_effect=IOError("No file")):
        assert get_historical_batch_time() == 3.0

def test_get_historical_batch_time_corrupt(mock_cache_dir):
    with patch('builtins.open', MagicMock()) as mock_open:
        mock_open.return_value.__enter__.return_value.read.return_value = "{corrupt"
        with patch('json.load', side_effect=json.JSONDecodeError("msg", "doc", 0)):
             assert get_historical_batch_time() == 3.0

@patch('backend.services.llm.factory.get_llm_provider')
@patch('backend.services.translation_service.SERVER_API_KEY', 'fake-key')
def test_await_translate_subtitles_rate_limit(mock_get_llm_provider):
    # Setup mocks
    mock_provider = mock_get_llm_provider.return_value
    mock_provider.concurrency_limit = 3
    mock_provider.provider_name = "mock"
    mock_provider.default_model = "mock-model"

    # Batch size is 25. Input 1 batch.
    subs = [{'text': 'Hello'} for _ in range(25)]

    # 1st call: Raise exception with "Rate limited ... 429 ... retry in 1"
    error_msg = "Rate limit exceeded. Retry in 1 seconds. (429)"

    # 2nd call: Success with numbered dict format
    success_resp = {"translations": {str(i+1): "Hola" for i in range(25)}}

    mock_provider.generate_json.side_effect = [
        Exception(error_msg),
        success_resp
    ]

    with patch('time.sleep') as mock_sleep:
        res = await_translate_subtitles(subs, 'es')

        assert len(res) == 25
        assert res[0]['translatedText'] == 'Hola'

        # Check if sleep called
        mock_sleep.assert_called()

@patch('backend.services.llm.factory.get_llm_provider')
@patch('backend.services.translation_service.SERVER_API_KEY', 'fake-key')
def test_await_translate_subtitles_incomplete_and_retry(mock_get_llm_provider):
    # Test retry logic for incomplete batches
    mock_provider = mock_get_llm_provider.return_value
    mock_provider.concurrency_limit = 3
    mock_provider.provider_name = "mock"
    mock_provider.default_model = "mock-model"

    subs = [{'text': 'Hello'} for _ in range(25)]

    # 1st call: Return only 5 translations (incomplete < 80%) with numbered dict format
    incomplete_resp = {"translations": {str(i+1): "Hola" for i in range(5)}}

    # Retry call: Return full with numbered dict format
    success_resp = {"translations": {str(i+1): "Hola" for i in range(25)}}

    # generate_json side effects:
    # 1. translate_batch call 1 -> returns incomplete
    #    Service checks length, sees < 80%, logs warning.
    #    Does NOT retry loop inside translate_batch (unless exception).
    #    Returns success=False.
    # 2. process_batches puts it in failed_batches.
    # 3. Retry Round 1 calls translate_batch again -> returns success.

    mock_provider.generate_json.side_effect = [
        incomplete_resp,
        success_resp
    ]

    with patch('time.sleep'):  # fast
        res = await_translate_subtitles(subs, 'es')
        assert len(res) == 25
        assert res[24].get('translatedText') == 'Hola'

@patch('backend.services.llm.factory.get_llm_provider')
@patch('backend.services.translation_service.SERVER_API_KEY', 'fake-key')
def test_await_translate_subtitles_threading(mock_get_llm_provider):
    # Test with multiple batches to trigger ThreadPool
    mock_provider = mock_get_llm_provider.return_value
    mock_provider.concurrency_limit = 3
    mock_provider.provider_name = "mock"
    mock_provider.default_model = "mock-model"

    # 30 subs -> 2 batches (25, 5)
    subs = [{'text': 'Hello'} for _ in range(30)]

    def side_effect(*args, **kwargs):
        # Infer batch size from prompts
        prompt = kwargs.get('prompt', '')
        # Prompt now uses "(1 to 25)" or "(1 to 5)" format
        if "(1 to 25)" in prompt:
            return {"translations": {str(i+1): "Hola" for i in range(25)}}
        else:
            return {"translations": {str(i+1): "Hola" for i in range(5)}}

    mock_provider.generate_json.side_effect = side_effect

    res = await_translate_subtitles(subs, 'es')
    assert len(res) == 30
    assert res[0]['translatedText'] == 'Hola'
    assert res[29]['translatedText'] == 'Hola'
