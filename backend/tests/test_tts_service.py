"""
Unit tests for TTS service
"""

import pytest
import os
import tempfile
from unittest.mock import patch, MagicMock, AsyncMock


@pytest.fixture
def mock_tts_cache_dir(tmp_path):
    """Create a temporary TTS cache directory."""
    cache_dir = tmp_path / "tts"
    cache_dir.mkdir()
    return str(cache_dir)


@pytest.fixture
def mock_tts_enabled():
    """Enable TTS for testing."""
    with patch('backend.services.tts_service.TTS_ENABLED', True):
        yield


@pytest.fixture
def mock_tts_disabled():
    """Disable TTS for testing."""
    with patch('backend.services.tts_service.TTS_ENABLED', False):
        yield


class TestCacheKey:
    """Test cache key generation."""

    def test_get_cache_key_basic(self):
        from backend.services.tts_service import get_cache_key

        key1 = get_cache_key("Hello world", "en")
        key2 = get_cache_key("Hello world", "en")

        # Same input should produce same key
        assert key1 == key2
        assert len(key1) == 16  # SHA256 truncated to 16 chars

    def test_get_cache_key_different_text(self):
        from backend.services.tts_service import get_cache_key

        key1 = get_cache_key("Hello", "en")
        key2 = get_cache_key("World", "en")

        # Different text should produce different keys
        assert key1 != key2

    def test_get_cache_key_different_lang(self):
        from backend.services.tts_service import get_cache_key

        key1 = get_cache_key("Hello", "en")
        key2 = get_cache_key("Hello", "ja")

        # Different language should produce different keys
        assert key1 != key2

    def test_get_cache_key_different_voice(self):
        from backend.services.tts_service import get_cache_key

        key1 = get_cache_key("Hello", "en", "en-US-AriaNeural")
        key2 = get_cache_key("Hello", "en", "en-US-GuyNeural")

        # Different voice should produce different keys
        assert key1 != key2


class TestCaching:
    """Test TTS caching functionality."""

    def test_is_cached_false_when_not_exists(self, mock_tts_cache_dir):
        with patch('backend.services.tts_service.TTS_CACHE_DIR', mock_tts_cache_dir):
            from backend.services.tts_service import is_cached

            assert is_cached("Test text", "en") is False

    def test_is_cached_true_when_exists(self, mock_tts_cache_dir):
        with patch('backend.services.tts_service.TTS_CACHE_DIR', mock_tts_cache_dir):
            from backend.services.tts_service import (
                is_cached, get_cache_key, get_cache_path, _cache_audio
            )

            # Create a cached file
            _cache_audio(b"fake audio data", "Test text", "en")

            assert is_cached("Test text", "en") is True

    def test_get_cached_audio_returns_none_when_not_cached(self, mock_tts_cache_dir):
        with patch('backend.services.tts_service.TTS_CACHE_DIR', mock_tts_cache_dir):
            from backend.services.tts_service import get_cached_audio

            result = get_cached_audio("Test text", "en")
            assert result is None

    def test_get_cached_audio_returns_bytes_when_cached(self, mock_tts_cache_dir):
        with patch('backend.services.tts_service.TTS_CACHE_DIR', mock_tts_cache_dir):
            from backend.services.tts_service import get_cached_audio, _cache_audio

            # Cache some audio
            audio_data = b"fake audio content"
            _cache_audio(audio_data, "Test text", "en")

            # Retrieve it
            result = get_cached_audio("Test text", "en")
            assert result == audio_data


class TestGenerateTTS:
    """Test TTS generation."""

    def test_generate_tts_raises_when_disabled(self, mock_tts_disabled):
        from backend.services.tts_service import generate_tts

        with pytest.raises(RuntimeError, match="TTS is disabled"):
            generate_tts("Hello", "en")

    def test_generate_tts_raises_on_empty_text(self, mock_tts_enabled):
        from backend.services.tts_service import generate_tts

        with pytest.raises(ValueError, match="Text cannot be empty"):
            generate_tts("", "en")

        with pytest.raises(ValueError, match="Text cannot be empty"):
            generate_tts("   ", "en")

    def test_generate_tts_uses_cache(self, mock_tts_cache_dir, mock_tts_enabled):
        with patch('backend.services.tts_service.TTS_CACHE_DIR', mock_tts_cache_dir):
            from backend.services.tts_service import generate_tts, _cache_audio

            # Pre-cache some audio
            cached_audio = b"cached audio content"
            _cache_audio(cached_audio, "Hello world", "en")

            # Should return cached audio without calling TTS backend
            with patch('backend.services.tts_service._generate_edge_tts') as mock_edge:
                result, content_type = generate_tts("Hello world", "en")

                mock_edge.assert_not_called()
                assert result == cached_audio
                assert content_type == 'audio/mpeg'

    def test_generate_tts_with_edge_tts(self, mock_tts_cache_dir, mock_tts_enabled):
        with patch('backend.services.tts_service.TTS_CACHE_DIR', mock_tts_cache_dir):
            with patch('backend.services.tts_service.TTS_BACKEND', 'edge-tts'):
                from backend.services.tts_service import generate_tts

                fake_audio = b"fake edge-tts audio"

                # Mock the async edge-tts call
                async def mock_edge_tts(text, voice):
                    return fake_audio

                with patch('backend.services.tts_service._generate_edge_tts', side_effect=mock_edge_tts):
                    result, content_type = generate_tts("Test", "en", use_cache=False)

                    assert result == fake_audio
                    assert content_type == 'audio/mpeg'

    def test_generate_tts_falls_back_to_gtts(self, mock_tts_cache_dir, mock_tts_enabled):
        with patch('backend.services.tts_service.TTS_CACHE_DIR', mock_tts_cache_dir):
            with patch('backend.services.tts_service.TTS_BACKEND', 'edge-tts'):
                from backend.services.tts_service import generate_tts

                gtts_audio = b"fake gtts audio"

                # Make edge-tts fail
                async def mock_edge_fail(text, voice):
                    raise Exception("edge-tts failed")

                with patch('backend.services.tts_service._generate_edge_tts', side_effect=mock_edge_fail):
                    with patch('backend.services.tts_service._generate_gtts', return_value=gtts_audio) as mock_gtts:
                        result, content_type = generate_tts("Test", "en", use_cache=False)

                        mock_gtts.assert_called_once()
                        assert result == gtts_audio


class TestGetAvailableVoices:
    """Test voice listing."""

    def test_get_available_voices_gtts_backend(self):
        with patch('backend.services.tts_service.TTS_BACKEND', 'gtts'):
            from backend.services.tts_service import get_available_voices

            voices = get_available_voices('en')

            assert len(voices) == 1
            assert voices[0]['id'] == 'default'

    def test_get_available_voices_fallback_on_error(self):
        """Test that get_available_voices returns defaults when edge-tts fails."""
        with patch('backend.services.tts_service.TTS_BACKEND', 'edge-tts'):
            from backend.services.tts_service import get_available_voices, DEFAULT_VOICES

            # When edge-tts import or call fails, should return default voices
            voices = get_available_voices('en')

            # Should return at least one voice for English
            assert len(voices) >= 1
            # The default voice for 'en' should be included
            assert any(v['id'] == DEFAULT_VOICES['en'] for v in voices)


class TestGetTTSStatus:
    """Test status endpoint."""

    def test_get_tts_status(self, mock_tts_enabled, mock_tts_cache_dir):
        with patch('backend.services.tts_service.TTS_CACHE_DIR', mock_tts_cache_dir):
            with patch('backend.services.tts_service.TTS_BACKEND', 'edge-tts'):
                from backend.services.tts_service import get_tts_status

                status = get_tts_status()

                assert status['enabled'] is True
                assert status['backend'] == 'edge-tts'
                assert 'default_voices' in status
                assert 'en' in status['default_voices']


class TestClearCache:
    """Test cache clearing."""

    def test_clear_tts_cache(self, mock_tts_cache_dir):
        with patch('backend.services.tts_service.TTS_CACHE_DIR', mock_tts_cache_dir):
            from backend.services.tts_service import clear_tts_cache, _cache_audio

            # Create some cached files
            _cache_audio(b"audio1", "text1", "en")
            _cache_audio(b"audio2", "text2", "en")

            # Clear cache
            count = clear_tts_cache()

            assert count == 2

            # Verify files are deleted
            files = os.listdir(mock_tts_cache_dir)
            assert len(files) == 0


class TestDefaultVoices:
    """Test default voice selection."""

    def test_default_voices_coverage(self):
        from backend.services.tts_service import DEFAULT_VOICES

        # Common languages should have defaults
        assert 'en' in DEFAULT_VOICES
        assert 'es' in DEFAULT_VOICES
        assert 'fr' in DEFAULT_VOICES
        assert 'ja' in DEFAULT_VOICES
        assert 'ko' in DEFAULT_VOICES
        assert 'zh-CN' in DEFAULT_VOICES

    def test_generate_tts_uses_default_voice_for_lang(self, mock_tts_cache_dir, mock_tts_enabled):
        with patch('backend.services.tts_service.TTS_CACHE_DIR', mock_tts_cache_dir):
            with patch('backend.services.tts_service.TTS_BACKEND', 'edge-tts'):
                from backend.services.tts_service import DEFAULT_VOICES

                fake_audio = b"audio"

                async def mock_edge_tts(text, voice):
                    # Verify correct default voice is used
                    assert voice == DEFAULT_VOICES['ja']
                    return fake_audio

                with patch('backend.services.tts_service._generate_edge_tts', side_effect=mock_edge_tts):
                    from backend.services.tts_service import generate_tts
                    generate_tts("Hello", "ja", use_cache=False)
