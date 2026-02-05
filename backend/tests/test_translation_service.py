import pytest
from unittest.mock import MagicMock, patch
from backend.services.translation_service import (
    parse_vtt_to_json3,
    await_translate_subtitles,
    translate_subtitles_simple,
    parse_numbered_translations,
    align_translations_to_subtitles
)

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

        # Mock generate_json response with numbered dict format
        mock_instance.generate_json.return_value = {
            "translations": {"1": "Hello translated", "2": "World translated"}
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
        assert result['translations'][0] == "Hello translated"
        assert result['translations'][1] == "World translated"

        MockProviderClass.assert_called_once()
        mock_instance.generate_json.assert_called_once()


def test_await_translate_subtitles(mock_get_llm_provider, mock_provider, mock_cache_dir):
    # Setup mock provider response with numbered dict format
    mock_provider.generate_json.return_value = {
        "translations": {"1": "Sub 1 translated", "2": "Sub 2 translated"}
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


# ============================================================================
# Tests for parse_numbered_translations
# ============================================================================

class TestParseNumberedTranslations:
    """Tests for parse_numbered_translations function."""

    def test_dict_with_string_keys(self):
        """Parse dict with string number keys."""
        response = {"1": "Hello", "2": "World", "3": "Foo"}
        result = parse_numbered_translations(response, 3)
        assert result == [(1, "Hello"), (2, "World"), (3, "Foo")]

    def test_dict_with_int_keys(self):
        """Parse dict with integer keys."""
        response = {1: "Hello", 2: "World"}
        result = parse_numbered_translations(response, 2)
        assert result == [(1, "Hello"), (2, "World")]

    def test_array_with_numbered_text(self):
        """Parse array where items have leading numbers."""
        response = ["1. Hello", "2. World", "3. Foo"]
        result = parse_numbered_translations(response, 3)
        assert result == [(1, "Hello"), (2, "World"), (3, "Foo")]

    def test_array_with_various_separators(self):
        """Parse array with different number separators (. ) :)."""
        response = ["1. Hello", "2) World", "3: Foo"]
        result = parse_numbered_translations(response, 3)
        assert result == [(1, "Hello"), (2, "World"), (3, "Foo")]

    def test_plain_array_fallback(self):
        """Parse plain array without numbers - fallback to position."""
        response = ["Hello", "World", "Foo"]
        result = parse_numbered_translations(response, 3)
        assert result == [(1, "Hello"), (2, "World"), (3, "Foo")]

    def test_empty_response(self):
        """Handle empty response."""
        assert parse_numbered_translations({}, 3) == []
        assert parse_numbered_translations([], 3) == []

    def test_duplicate_numbers_keeps_first(self):
        """Duplicate numbers keep first occurrence."""
        response = {"1": "First", "2": "Second"}
        # Can't have true duplicates in dict, test with array
        response = ["1. First", "1. Duplicate", "2. Second"]
        result = parse_numbered_translations(response, 3)
        # Should have (1, "First") and (2, "Second"), duplicate ignored
        assert (1, "First") in result
        assert (2, "Second") in result
        assert len([r for r in result if r[0] == 1]) == 1  # Only one entry for number 1

    def test_sorted_by_number(self):
        """Result should be sorted by number."""
        response = {"3": "Three", "1": "One", "2": "Two"}
        result = parse_numbered_translations(response, 3)
        assert result == [(1, "One"), (2, "Two"), (3, "Three")]

    def test_handles_whitespace(self):
        """Handles whitespace in values."""
        response = {"1": "  Hello  ", "2": "World"}
        result = parse_numbered_translations(response, 2)
        assert result == [(1, "Hello"), (2, "World")]

    def test_invalid_key_skipped(self):
        """Invalid keys are skipped."""
        response = {"1": "Hello", "abc": "Invalid", "2": "World"}
        result = parse_numbered_translations(response, 2)
        assert result == [(1, "Hello"), (2, "World")]

    def test_none_value_becomes_empty_string(self):
        """None values become empty strings."""
        response = {"1": "Hello", "2": None}
        result = parse_numbered_translations(response, 2)
        assert result == [(1, "Hello"), (2, "")]

    def test_numeric_leading_text_not_misparsed_as_number(self):
        """Numeric-leading text (e.g., year) should not be treated as a line number."""
        response = ["2025 will be better", "2. Mundo"]
        result = parse_numbered_translations(response, 2)
        assert result == [(1, "2025 will be better"), (2, "Mundo")]


# ============================================================================
# Tests for align_translations_to_subtitles
# ============================================================================

class TestAlignTranslationsToSubtitles:
    """Tests for align_translations_to_subtitles function."""

    def test_basic_alignment(self):
        """Basic 1-to-1 alignment."""
        subtitles = [{'text': 'a'}, {'text': 'b'}, {'text': 'c'}]
        parsed = [(1, "A"), (2, "B"), (3, "C")]
        result = align_translations_to_subtitles(subtitles, parsed)
        assert result == {0: "A", 1: "B", 2: "C"}

    def test_skipped_number_leaves_gap(self):
        """Skipped number (1, 2, 4) leaves gap."""
        subtitles = [{'text': 'a'}, {'text': 'b'}, {'text': 'c'}, {'text': 'd'}]
        parsed = [(1, "A"), (2, "B"), (4, "D")]
        result = align_translations_to_subtitles(subtitles, parsed)
        assert result == {0: "A", 1: "B", 3: "D"}
        assert 2 not in result  # Gap at index 2

    def test_extra_translations_ignored(self):
        """Extra translations beyond expected count are ignored."""
        subtitles = [{'text': 'a'}, {'text': 'b'}]
        parsed = [(1, "A"), (2, "B"), (3, "C"), (4, "D")]
        result = align_translations_to_subtitles(subtitles, parsed)
        assert result == {0: "A", 1: "B"}

    def test_fewer_translations_partial_fill(self):
        """Fewer translations than expected fills partially."""
        subtitles = [{'text': 'a'}, {'text': 'b'}, {'text': 'c'}]
        parsed = [(1, "A")]
        result = align_translations_to_subtitles(subtitles, parsed)
        assert result == {0: "A"}
        assert 1 not in result
        assert 2 not in result

    def test_offset_detection_and_adjustment(self):
        """Detect and adjust offset (5, 6, 7 instead of 1, 2, 3)."""
        subtitles = [{'text': 'a'}, {'text': 'b'}, {'text': 'c'}]
        parsed = [(5, "A"), (6, "B"), (7, "C")]
        result = align_translations_to_subtitles(subtitles, parsed)
        # Offset 4 detected, numbers adjusted to 1, 2, 3
        assert result == {0: "A", 1: "B", 2: "C"}

    def test_empty_parsed_translations(self):
        """Empty parsed translations returns empty dict."""
        subtitles = [{'text': 'a'}, {'text': 'b'}]
        result = align_translations_to_subtitles(subtitles, [])
        assert result == {}

    def test_out_of_range_numbers_ignored(self):
        """Numbers outside valid range are ignored."""
        subtitles = [{'text': 'a'}, {'text': 'b'}]
        parsed = [(0, "Zero"), (1, "A"), (2, "B"), (100, "Far")]
        result = align_translations_to_subtitles(subtitles, parsed)
        assert result == {0: "A", 1: "B"}  # 0 and 100 ignored (0-indexed means 1->0, 2->1)

    def test_partial_offset_detection(self):
        """Partial offset when 80%+ of numbers match expected offset pattern."""
        subtitles = [{'text': 'a'}, {'text': 'b'}, {'text': 'c'}, {'text': 'd'}, {'text': 'e'}]
        # Numbers 10, 11, 12, 13, 14 (offset of 9)
        parsed = [(10, "A"), (11, "B"), (12, "C"), (13, "D"), (14, "E")]
        result = align_translations_to_subtitles(subtitles, parsed)
        assert result == {0: "A", 1: "B", 2: "C", 3: "D", 4: "E"}

    def test_missing_first_number_does_not_shift_alignment(self):
        """If first line is missing (2,3,4), keep the gap instead of shifting all lines."""
        subtitles = [{'text': 'a'}, {'text': 'b'}, {'text': 'c'}, {'text': 'd'}]
        parsed = [(2, "B"), (3, "C"), (4, "D")]
        result = align_translations_to_subtitles(subtitles, parsed)
        assert result == {1: "B", 2: "C", 3: "D"}
        assert 0 not in result


# ============================================================================
# Integration tests for alignment with mocked LLM responses
# ============================================================================

class TestTranslationAlignmentIntegration:
    """Integration tests for translation alignment with various LLM response formats."""

    def test_translate_with_numbered_dict_response(self):
        """Integration: LLM returns numbered dict format."""
        with patch('backend.services.llm.openai_provider.OpenAIProvider') as MockProviderClass, \
             patch('backend.services.translation_service.supports_json_mode', return_value=True):
            mock_instance = MockProviderClass.return_value

            # LLM returns numbered dict format
            mock_instance.generate_json.return_value = {
                "translations": {"1": "Hola", "2": "Mundo"}
            }

            subtitles = [{'text': 'Hello'}, {'text': 'World'}]

            result = translate_subtitles_simple(
                subtitles=subtitles,
                source_lang='en',
                target_lang='es',
                model_id='gpt-4',
                api_key='fake-key'
            )

            assert result['translations'] == ["Hola", "Mundo"]

    def test_translate_with_extra_translations(self):
        """Integration: LLM returns more translations than expected."""
        with patch('backend.services.llm.openai_provider.OpenAIProvider') as MockProviderClass, \
             patch('backend.services.translation_service.supports_json_mode', return_value=True):
            mock_instance = MockProviderClass.return_value

            # LLM returns 4 translations for 2 subtitles (misalignment scenario)
            mock_instance.generate_json.return_value = {
                "translations": {"1": "Hola", "2": "Mundo", "3": "Extra1", "4": "Extra2"}
            }

            subtitles = [{'text': 'Hello'}, {'text': 'World'}]

            result = translate_subtitles_simple(
                subtitles=subtitles,
                source_lang='en',
                target_lang='es',
                model_id='gpt-4',
                api_key='fake-key'
            )

            # Only first 2 should be used
            assert len(result['translations']) == 2
            assert result['translations'] == ["Hola", "Mundo"]

    def test_translate_with_array_fallback(self):
        """Integration: LLM returns array format (backward compatibility)."""
        with patch('backend.services.llm.openai_provider.OpenAIProvider') as MockProviderClass, \
             patch('backend.services.translation_service.supports_json_mode', return_value=True):
            mock_instance = MockProviderClass.return_value

            # LLM returns old array format
            mock_instance.generate_json.return_value = {
                "translations": ["1. Hola", "2. Mundo"]
            }

            subtitles = [{'text': 'Hello'}, {'text': 'World'}]

            result = translate_subtitles_simple(
                subtitles=subtitles,
                source_lang='en',
                target_lang='es',
                model_id='gpt-4',
                api_key='fake-key'
            )

            assert result['translations'] == ["Hola", "Mundo"]

    def test_translate_with_offset_numbers(self):
        """Integration: LLM returns offset numbers (5, 6 instead of 1, 2)."""
        with patch('backend.services.llm.openai_provider.OpenAIProvider') as MockProviderClass, \
             patch('backend.services.translation_service.supports_json_mode', return_value=True):
            mock_instance = MockProviderClass.return_value

            # LLM returns offset numbers
            mock_instance.generate_json.return_value = {
                "translations": {"5": "Hola", "6": "Mundo"}
            }

            subtitles = [{'text': 'Hello'}, {'text': 'World'}]

            result = translate_subtitles_simple(
                subtitles=subtitles,
                source_lang='en',
                target_lang='es',
                model_id='gpt-4',
                api_key='fake-key'
            )

            # Offset should be detected and adjusted
            assert result['translations'] == ["Hola", "Mundo"]

    def test_translate_with_scalar_json_response_does_not_crash(self):
        """Integration: unexpected scalar JSON payload should not crash simple translation."""
        with patch('backend.services.llm.openai_provider.OpenAIProvider') as MockProviderClass, \
             patch('backend.services.translation_service.supports_json_mode', return_value=True):
            mock_instance = MockProviderClass.return_value
            mock_instance.generate_json.return_value = "not-a-dict"

            subtitles = [{'text': 'Hello'}, {'text': 'World'}]

            result = translate_subtitles_simple(
                subtitles=subtitles,
                source_lang='en',
                target_lang='es',
                model_id='gpt-4',
                api_key='fake-key'
            )

            assert result['translations'] == ["", ""]
