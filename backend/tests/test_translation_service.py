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
def mock_provider():
    mock = MagicMock()
    mock.concurrency_limit = 3
    mock.provider_name = "mock_provider"
    mock.default_model = "mock-model"
    return mock

@pytest.fixture
def mock_get_llm_provider(mock_provider):
    # Patch the factory function where it is defined
    with patch('backend.services.llm.factory.get_llm_provider', return_value=mock_provider) as mock:
        yield mock

def test_translate_subtitles_simple():
    # Patch OpenAIProvider at its source
    with patch('backend.services.llm.openai_provider.OpenAIProvider') as MockProviderClass, \
         patch('backend.services.translation_service.supports_json_mode', return_value=True):
        mock_instance = MockProviderClass.return_value
        
        # Mock generate_json response
        mock_instance.generate_json.return_value = {
            "translations": ["1. Hello translated", "2. World translated"]
        }
        mock_instance.generate_text.return_value = "1. Hello translated\n2. World translated"

        subtitles = [{'text': 'Hello'}, {'text': 'World'}]

        result = translate_subtitles_simple(
            subtitles=subtitles,
            source_lang='en',
            target_lang='es',
            model_id='gpt-3.5-turbo',
            api_key='fake-key'
        )

        assert len(result['translations']) == 2
        assert result['translations'][0].endswith("Hello translated")
        
        MockProviderClass.assert_called_once()
        mock_instance.generate_json.assert_called_once()


def test_await_translate_subtitles(mock_get_llm_provider, mock_provider, mock_cache_dir):
    # Setup mock provider response
    mock_provider.generate_json.return_value = {
        "translations": ["Sub 1 translated", "Sub 2 translated"]
    }

    subtitles = [
        {'start': 0, 'end': 1000, 'text': 'Sub 1'},
        {'start': 1000, 'end': 2000, 'text': 'Sub 2'}
    ]

    with patch('backend.services.translation_service.CACHE_DIR', mock_cache_dir):
        # Also mock translation_quality modules if they are imported inside
        with patch.dict('sys.modules', {'backend.utils.translation_quality': MagicMock()}):
            updated_subs = await_translate_subtitles(subtitles, 'fr')

        assert len(updated_subs) == 2
        assert updated_subs[0]['translatedText'] == "Sub 1 translated"
        assert updated_subs[1]['translatedText'] == "Sub 2 translated"
        
        mock_get_llm_provider.assert_called_once()
        mock_provider.generate_json.assert_called()
