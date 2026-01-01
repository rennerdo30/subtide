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

@patch('backend.services.translation_service.OpenAI')
@patch('backend.services.translation_service.SERVER_API_KEY', 'fake-key')
def test_await_translate_subtitles_rate_limit(mock_openai):
    # Setup mocks
    mock_client = mock_openai.return_value
    
    # Batch size is 25. Input 1 batch.
    subs = [{'text': 'Hello'} for _ in range(25)]
    
    # 1st call: Raise exception with "Rate limited ... 429 ... retry in 1"
    # Actually code checks str(e) for '429' or 'rate'
    error_msg = "Rate limit exceeded. Retry in 1 seconds. (429)"
    
    # 2nd call: Success
    success_resp = MagicMock()
    success_resp.choices[0].message.content = "\n".join([f"{i+1}. Hola" for i in range(25)])
    
    mock_client.chat.completions.create.side_effect = [
        Exception(error_msg), 
        success_resp
    ]
    
    with patch('time.sleep') as mock_sleep:
        res = await_translate_subtitles(subs, 'es')
        
        assert len(res) == 25
        assert res[0]['translatedText'] == 'Hola'
        # Check if sleep called with parsed time
        # Parsing logic: re.search(r'retry in (\d+)', ...) -> 1 + 1 = 2s wait
        # Or if "retry in 1", group(1) is '1'. Logic adds 1. So 2.
        mock_sleep.assert_called()

@patch('backend.services.translation_service.OpenAI')
@patch('backend.services.translation_service.SERVER_API_KEY', 'fake-key')
def test_await_translate_subtitles_incomplete_and_retry(mock_openai):
    # Test retry logic for incomplete batches
    mock_client = mock_openai.return_value
    
    subs = [{'text': 'Hello'} for _ in range(25)]
    
    # 1st call: Return only 5 translations (incomplete < 80%)
    incomplete_resp = MagicMock()
    incomplete_resp.choices[0].message.content = "\n".join([f"{i+1}. Hola" for i in range(5)])
    
    # Retry call: Return full
    success_resp = MagicMock()
    success_resp.choices[0].message.content = "\n".join([f"{i+1}. Hola" for i in range(25)])
    
    # Logic tries MAX_RETRIES (3) locally inside translate_batch?
    # No, translate_batch checks length. If < 80%, it returns what it has and success=False.
    # Then `process_batches` puts it in `failed_batches`.
    # Then `await_translate_subtitles` loops `RETRY_ROUNDS`.
    
    # So:
    # 1. translate_batch called. Returns success=False.
    # 2. failed_batches has 1 batch.
    # 3. Retry loop calls process_batches again.
    
    mock_client.chat.completions.create.side_effect = [
        incomplete_resp, # 1st attempt inside translate_batch
        # Wait, translate_batch does NOT retry if it gets a response but incomplete?
        # Let's check code:
        # It parses. Verify count. If >= 0.8 return True.
        # Else: logs warning. Does NOT retry loop (unless exception).
        # It returns success=False.
        
        # So it returns to process_batches with success=False.
        
        success_resp # 2nd attempt in Retry Round 1
    ]
    
    with patch('time.sleep'): # fast
        res = await_translate_subtitles(subs, 'es')
        assert len(res) == 25
        # Should be full now
        assert res[24].get('translatedText') == 'Hola'

@patch('backend.services.translation_service.OpenAI')
@patch('backend.services.translation_service.SERVER_API_KEY', 'fake-key')
def test_await_translate_subtitles_threading(mock_openai):
    # Test with multiple batches to trigger ThreadPool
    mock_client = mock_openai.return_value
    
    # 30 subs -> 2 batches (25, 5)
    subs = [{'text': 'Hello'} for _ in range(30)]
    
    def side_effect(*args, **kwargs):
        # Infer batch size from prompts?
        # message content has prompt.
        msg = kwargs['messages'][1]['content']
        count = msg.count('\n') # Rough count of lines in prompt
        # Actually logic says "Translate these X subtitles"
        if "25 subtitles" in msg:
            ret = "\n".join([f"{i+1}. Hola" for i in range(25)])
        else:
            ret = "\n".join([f"{i+1}. Hola" for i in range(5)])
        
        resp = MagicMock()
        resp.choices[0].message.content = ret
        return resp
        
    mock_client.chat.completions.create.side_effect = side_effect
    
    res = await_translate_subtitles(subs, 'es')
    assert len(res) == 30
    assert res[0]['translatedText'] == 'Hola'
    assert res[29]['translatedText'] == 'Hola'


