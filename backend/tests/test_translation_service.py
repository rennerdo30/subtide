import pytest
from unittest.mock import MagicMock, patch
from backend.services.translation_service import parse_vtt_to_json3, await_translate_subtitles, translate_subtitles_simple

def test_parse_vtt_to_json3():
    vtt_content = """WEBVTT

00:00:01.000 --> 00:00:04.000
Hello world

00:00:04.500 --> 00:00:06.000
This is a test logic
"""
    result = parse_vtt_to_json3(vtt_content)
    events = result['events']
    
    assert len(events) == 2
    
    assert events[0]['tStartMs'] == 1000
    assert events[0]['dDurationMs'] == 3000
    assert events[0]['segs'][0]['utf8'] == "Hello world"
    
    assert events[1]['tStartMs'] == 4500
    assert events[1]['dDurationMs'] == 1500
    assert events[1]['segs'][0]['utf8'] == "This is a test logic"

@pytest.fixture
def mock_openai():
    with patch('backend.services.translation_service.OpenAI') as mock:
        yield mock

def test_translate_subtitles_simple(mock_openai):
    # Setup mock
    mock_client = mock_openai.return_value
    mock_response = MagicMock()
    mock_response.choices[0].message.content = "1. Hello translated\n2. World translated"
    # Mock usage to avoid MagicMock comparison issues
    mock_response.usage.prompt_tokens = 100
    mock_response.usage.completion_tokens = 50
    mock_response.usage.total_tokens = 150
    mock_client.chat.completions.create.return_value = mock_response

    subtitles = [{'text': 'Hello'}, {'text': 'World'}]

    result = translate_subtitles_simple(
        subtitles=subtitles,
        source_lang='en',
        target_lang='es',
        model_id='gpt-3.5-turbo',
        api_key='fake-key'
    )

    assert result['translations'] == ['Hello translated', 'World translated']
    mock_client.chat.completions.create.assert_called_once()

    # Check if system prompt contains constraint
    call_args = mock_client.chat.completions.create.call_args
    messages = call_args[1]['messages']
    assert "Spanish" in messages[0]['content'] # 'es' maps to Spanish

def test_await_translate_subtitles(mock_openai, mock_cache_dir):
    # Setup mock
    mock_client = mock_openai.return_value
    mock_response = MagicMock()
    # Mocking response for a batch of 2
    mock_response.choices[0].message.content = "1. Sub 1 translated\n2. Sub 2 translated"
    # Mock usage to avoid MagicMock comparison issues
    mock_response.usage.prompt_tokens = 100
    mock_response.usage.completion_tokens = 50
    mock_response.usage.total_tokens = 150
    mock_client.chat.completions.create.return_value = mock_response

    subtitles = [
        {'start': 0, 'end': 1000, 'text': 'Sub 1'},
        {'start': 1000, 'end': 2000, 'text': 'Sub 2'}
    ]

    with patch('backend.services.translation_service.CACHE_DIR', mock_cache_dir):
        # We also need to mock time.time or sleep to make it faster if there are retries,
        # but here we expect success on first try.

        updated_subs = await_translate_subtitles(subtitles, 'fr')

        assert len(updated_subs) == 2
        assert updated_subs[0]['translatedText'] == "Sub 1 translated"
        assert updated_subs[1]['translatedText'] == "Sub 2 translated"
