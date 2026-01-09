import pytest
import os
from unittest.mock import MagicMock, patch
from backend.services.video_loader import (
    download_audio,
    sanitize_id,
    is_supported_site,
    get_video_info,
    MIN_VALID_AUDIO_SIZE_BYTES
)


class TestSanitizeId:
    """Tests for the sanitize_id function."""

    def test_sanitize_id_valid_simple(self):
        """Valid simple IDs should pass through unchanged."""
        assert sanitize_id("abc123") == "abc123"
        assert sanitize_id("video-id_123") == "video-id_123"

    def test_sanitize_id_valid_youtube_format(self):
        """YouTube-style 11-char IDs should pass through."""
        assert sanitize_id("dQw4w9WgXcQ") == "dQw4w9WgXcQ"

    def test_sanitize_id_unsafe_characters_hashed(self):
        """IDs with unsafe characters should be hashed."""
        result = sanitize_id("https://example.com/video?v=123")
        assert len(result) == 32  # MD5 hash length
        assert result.isalnum()

    def test_sanitize_id_reserved_name_hashed(self):
        """Windows reserved names should be hashed."""
        result = sanitize_id("CON")
        assert len(result) == 32  # Hashed

    def test_sanitize_id_empty_raises(self):
        """Empty ID should raise ValueError."""
        with pytest.raises(ValueError, match="cannot be empty"):
            sanitize_id("")

    def test_sanitize_id_none_raises(self):
        """None ID should raise ValueError."""
        with pytest.raises(ValueError):
            sanitize_id(None)


class TestIsSupportedSite:
    """Tests for the is_supported_site function."""

    def test_youtube_is_supported(self):
        """YouTube URLs should be supported."""
        with patch('backend.services.video_loader.yt_dlp.extractor.gen_extractors') as mock_extractors:
            mock_yt = MagicMock()
            mock_yt.IE_NAME = 'youtube'
            mock_yt.suitable.return_value = True

            mock_generic = MagicMock()
            mock_generic.IE_NAME = 'generic'
            mock_generic.suitable.return_value = True

            mock_extractors.return_value = [mock_yt, mock_generic]

            assert is_supported_site("https://www.youtube.com/watch?v=abc123") is True

    def test_generic_only_not_supported(self):
        """URLs only matching generic extractor should return False."""
        with patch('backend.services.video_loader.yt_dlp.extractor.gen_extractors') as mock_extractors:
            mock_generic = MagicMock()
            mock_generic.IE_NAME = 'generic'
            mock_generic.suitable.return_value = True

            mock_extractors.return_value = [mock_generic]

            assert is_supported_site("https://random-site.com/video.mp4") is False


class TestDownloadAudio:
    """Tests for the download_audio function."""

    def test_download_audio_options(self):
        """Test that download_audio configures yt-dlp correctly, especially postprocessors."""
        with patch('backend.services.video_loader.yt_dlp.YoutubeDL') as mock_ydl, \
             patch('backend.services.video_loader.os.path.exists', return_value=False), \
             patch('backend.services.video_loader.os.makedirs'):
            mock_ctx = MagicMock()
            mock_ydl.return_value.__enter__.return_value = mock_ctx

            # Mock extract_info result
            mock_ctx.extract_info.return_value = {
                'requested_downloads': [{'filepath': '/tmp/cache/audio/123.m4a'}]
            }

            url = "https://example.com/video"
            download_audio(url, custom_id="123")

            # Extract the call args to YoutubeDL constructor
            mock_ydl.assert_called_once()
            call_args = mock_ydl.call_args[0][0]

            # 1. Verify Audio Format
            assert call_args['format'] == 'bestaudio/best'

            # 2. Verify FFmpeg Post-processor
            postprocessors = call_args.get('postprocessors', [])
            ffmpeg_pp = next((pp for pp in postprocessors if pp['key'] == 'FFmpegExtractAudio'), None)

            assert ffmpeg_pp is not None
            assert ffmpeg_pp['preferredcodec'] == 'm4a'
            assert ffmpeg_pp['preferredquality'] == '192'

    def test_download_audio_cache_hit(self):
        """Test that cached audio files are returned without re-downloading."""
        with patch('backend.services.video_loader.os.path.exists') as mock_exists, \
             patch('backend.services.video_loader.os.path.getsize') as mock_getsize, \
             patch('backend.services.video_loader.os.makedirs'), \
             patch('backend.services.video_loader.yt_dlp.YoutubeDL') as mock_ydl:

            # Simulate cache hit for .m4a file
            def exists_side_effect(path):
                return path.endswith('.m4a')

            mock_exists.side_effect = exists_side_effect
            mock_getsize.return_value = MIN_VALID_AUDIO_SIZE_BYTES + 1000

            result = download_audio("https://example.com/video", custom_id="cached123")

            # Should return cached path without calling yt-dlp
            assert result is not None
            assert result.endswith('.m4a')
            mock_ydl.assert_not_called()

    def test_download_audio_small_file_ignored(self):
        """Test that cached files smaller than minimum size are ignored."""
        with patch('backend.services.video_loader.os.path.exists', return_value=True), \
             patch('backend.services.video_loader.os.path.getsize') as mock_getsize, \
             patch('backend.services.video_loader.os.makedirs'), \
             patch('backend.services.video_loader.os.listdir', return_value=[]), \
             patch('backend.services.video_loader.yt_dlp.YoutubeDL') as mock_ydl:

            # File exists but is too small (corrupted)
            mock_getsize.return_value = MIN_VALID_AUDIO_SIZE_BYTES - 1

            mock_ctx = MagicMock()
            mock_ydl.return_value.__enter__.return_value = mock_ctx
            mock_ctx.extract_info.return_value = {
                'requested_downloads': [{'filepath': '/tmp/audio.m4a'}]
            }

            download_audio("https://example.com/video", custom_id="small_file")

            # Should call yt-dlp to re-download
            mock_ydl.assert_called_once()

    def test_download_audio_failure_returns_none(self):
        """Test that download failures return None gracefully."""
        with patch('backend.services.video_loader.os.path.exists', return_value=False), \
             patch('backend.services.video_loader.os.makedirs'), \
             patch('backend.services.video_loader.yt_dlp.YoutubeDL') as mock_ydl:

            mock_ydl.return_value.__enter__.side_effect = Exception("Network error")

            result = download_audio("https://example.com/video", custom_id="fail123")

            assert result is None
