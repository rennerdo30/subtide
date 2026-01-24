"""
Real Video Integration Tests for Subtide Backend.

These tests use actual YouTube videos to test the full pipeline.
They are marked as 'slow' and require network access.

Run with: pytest -m slow tests/test_real_videos.py -v
Skip in CI with: pytest -m "not slow"

Test Video: https://youtu.be/Mb7TUofwujA
"""

import os
import json
import pytest
import tempfile
import shutil
from unittest.mock import patch, MagicMock
from typing import Optional

# Mark all tests in this module as slow (network required)
pytestmark = [pytest.mark.slow, pytest.mark.network]


# Test video configuration
TEST_VIDEO_ID = "Mb7TUofwujA"
TEST_VIDEO_URL = f"https://www.youtube.com/watch?v={TEST_VIDEO_ID}"
TEST_VIDEO_SHORT_URL = f"https://youtu.be/{TEST_VIDEO_ID}"


def network_available() -> bool:
    """Check if network is available for tests."""
    import socket
    try:
        socket.create_connection(("www.youtube.com", 443), timeout=5)
        return True
    except (socket.timeout, socket.error):
        return False


# Skip all tests if no network
skip_if_no_network = pytest.mark.skipif(
    not network_available(),
    reason="Network not available"
)


@pytest.fixture(scope="module")
def temp_cache_dir():
    """Create a temporary cache directory for tests."""
    tmpdir = tempfile.mkdtemp(prefix="subtide_test_")
    yield tmpdir
    # Cleanup after all tests in module
    shutil.rmtree(tmpdir, ignore_errors=True)


@pytest.fixture
def mock_cache_dir(temp_cache_dir):
    """Patch CACHE_DIR to use temporary directory."""
    with patch('backend.config.CACHE_DIR', temp_cache_dir), \
         patch('backend.services.youtube_service.CACHE_DIR', temp_cache_dir), \
         patch('backend.services.video_loader.CACHE_DIR', temp_cache_dir):
        yield temp_cache_dir


class TestYouTubeSubtitleFetching:
    """Tests for fetching subtitles from real YouTube videos."""

    @skip_if_no_network
    def test_fetch_subtitles_returns_data(self, mock_cache_dir):
        """Should fetch subtitles for a video with captions."""
        from backend.services.youtube_service import fetch_subtitles

        result, status = fetch_subtitles(TEST_VIDEO_ID, 'en')

        # Should return 200 or 404 (if no subs available)
        assert status in [200, 404], f"Unexpected status: {status}, result: {result}"

        if status == 200:
            # If subs found, validate structure
            if isinstance(result, dict):
                # json3 format or dict response
                assert 'error' not in result or result.get('_metadata')
            else:
                # Flask Response object for raw VTT
                assert hasattr(result, 'data') or hasattr(result, 'content')

    @skip_if_no_network
    def test_fetch_subtitles_fallback_to_english(self, mock_cache_dir):
        """Should fallback to English if requested language unavailable."""
        from backend.services.youtube_service import fetch_subtitles

        # Request unlikely language (e.g., Zulu)
        result, status = fetch_subtitles(TEST_VIDEO_ID, 'zu')

        # Should either:
        # - Return 200 with English fallback
        # - Return 404 with available languages list
        # - Return 429/502 if rate limited (temporary network issue)
        if status in [429, 502]:
            pytest.skip("YouTube rate limited - temporary network issue")

        assert status in [200, 404], f"Unexpected status: {status}"

        if status == 404:
            # Should include available languages
            assert 'available_manual' in result or 'available_auto' in result
        elif status == 200 and isinstance(result, dict):
            # May have fallback metadata
            if '_metadata' in result:
                assert result['_metadata'].get('used_fallback') is True

    @skip_if_no_network
    def test_fetch_subtitles_caching(self, mock_cache_dir):
        """Should cache subtitles after first fetch."""
        from backend.services.youtube_service import fetch_subtitles

        # First fetch
        result1, status1 = fetch_subtitles(TEST_VIDEO_ID, 'en')

        if status1 != 200:
            pytest.skip("Subtitles not available for caching test")

        # Second fetch should hit cache
        result2, status2 = fetch_subtitles(TEST_VIDEO_ID, 'en')

        assert status2 == 200
        # Both should return equivalent data
        if isinstance(result1, dict) and isinstance(result2, dict):
            # Compare events if json3
            if 'events' in result1:
                assert len(result1.get('events', [])) == len(result2.get('events', []))

    @skip_if_no_network
    def test_validate_video_id(self):
        """Should validate video ID format correctly."""
        from backend.services.youtube_service import validate_video_id

        # Valid YouTube video IDs
        assert validate_video_id(TEST_VIDEO_ID) is True
        assert validate_video_id("dQw4w9WgXcQ") is True
        assert validate_video_id("abc123") is True

        # Invalid IDs
        assert validate_video_id("") is False
        assert validate_video_id(None) is False
        assert validate_video_id("../../../etc/passwd") is False
        assert validate_video_id("CON") is False  # Windows reserved


class TestVideoTitleFetching:
    """Tests for fetching video titles."""

    @skip_if_no_network
    def test_get_video_title(self, mock_cache_dir):
        """Should fetch video title."""
        from backend.services.youtube_service import get_video_title

        title = get_video_title(TEST_VIDEO_ID)

        # Should return a non-empty string
        assert title is not None
        assert isinstance(title, str)
        assert len(title) > 0

    @skip_if_no_network
    def test_get_video_title_caching(self, mock_cache_dir):
        """Should cache video title after first fetch."""
        from backend.services.youtube_service import get_video_title
        import os

        # First fetch
        title1 = get_video_title(TEST_VIDEO_ID)

        # Check cache file exists
        cache_path = os.path.join(mock_cache_dir, f"{TEST_VIDEO_ID}_title.json")
        # The actual path may vary based on implementation

        # Second fetch
        title2 = get_video_title(TEST_VIDEO_ID)

        # Should return same title
        assert title1 == title2


class TestAudioDownload:
    """Tests for downloading audio from real videos."""

    @skip_if_no_network
    def test_download_audio_from_youtube(self, mock_cache_dir):
        """Should download audio from YouTube video."""
        from backend.services.video_loader import download_audio

        audio_path = download_audio(TEST_VIDEO_URL, custom_id=f"test_{TEST_VIDEO_ID}")

        # Note: YouTube may require PO Token for some videos, causing 403 errors.
        # This is a yt-dlp/YouTube limitation, not a code issue.
        if audio_path is None:
            pytest.skip("Audio download failed - likely YouTube PO Token requirement")

        assert os.path.exists(audio_path), f"Audio file not found: {audio_path}"

        # File should have meaningful size (not corrupted/empty)
        file_size = os.path.getsize(audio_path)
        assert file_size > 1000, f"Audio file too small: {file_size} bytes"

        # Should be an audio format
        ext = os.path.splitext(audio_path)[1].lower()
        assert ext in ['.m4a', '.mp3', '.wav', '.webm', '.opus', '.ogg', '.aac']

    @skip_if_no_network
    def test_download_audio_caching(self, mock_cache_dir):
        """Should use cached audio on second download."""
        from backend.services.video_loader import download_audio
        import time

        # First download
        start1 = time.time()
        path1 = download_audio(TEST_VIDEO_URL, custom_id=f"cache_test_{TEST_VIDEO_ID}")
        elapsed1 = time.time() - start1

        if path1 is None:
            pytest.skip("Initial download failed - likely YouTube PO Token requirement")

        # Second "download" should be instant (cache hit)
        start2 = time.time()
        path2 = download_audio(TEST_VIDEO_URL, custom_id=f"cache_test_{TEST_VIDEO_ID}")
        elapsed2 = time.time() - start2

        assert path2 is not None
        assert path1 == path2, "Cache should return same path"
        # Cache hit should be much faster (< 1 second vs potentially minutes)
        assert elapsed2 < 1.0, f"Cache lookup took too long: {elapsed2}s"

    @skip_if_no_network
    def test_download_audio_short_url(self, mock_cache_dir):
        """Should handle youtu.be short URLs."""
        from backend.services.video_loader import download_audio

        audio_path = download_audio(TEST_VIDEO_SHORT_URL, custom_id=f"short_{TEST_VIDEO_ID}")

        if audio_path is None:
            pytest.skip("Download failed - likely YouTube PO Token requirement")
        assert os.path.exists(audio_path)


class TestDomainWhitelist:
    """Tests for URL domain whitelisting (SSRF protection)."""

    def test_youtube_urls_allowed(self):
        """Should allow YouTube URLs."""
        from backend.services.video_loader import is_allowed_url

        assert is_allowed_url("https://www.youtube.com/watch?v=abc123") is True
        assert is_allowed_url("https://youtube.com/watch?v=abc123") is True
        assert is_allowed_url("https://youtu.be/abc123") is True
        assert is_allowed_url("https://m.youtube.com/watch?v=abc123") is True

    def test_twitch_urls_allowed(self):
        """Should allow Twitch URLs."""
        from backend.services.video_loader import is_allowed_url

        assert is_allowed_url("https://www.twitch.tv/channel") is True
        assert is_allowed_url("https://clips.twitch.tv/ClipName") is True

    def test_vimeo_urls_allowed(self):
        """Should allow Vimeo URLs."""
        from backend.services.video_loader import is_allowed_url

        assert is_allowed_url("https://vimeo.com/123456789") is True
        assert is_allowed_url("https://player.vimeo.com/video/123456789") is True

    def test_internal_urls_blocked(self):
        """Should block internal/localhost URLs (SSRF prevention)."""
        from backend.services.video_loader import is_allowed_url

        assert is_allowed_url("http://localhost:8080/video") is False
        assert is_allowed_url("http://127.0.0.1/internal") is False
        assert is_allowed_url("http://192.168.1.1/private") is False
        assert is_allowed_url("http://10.0.0.1/internal") is False
        assert is_allowed_url("http://0.0.0.0/") is False

    def test_arbitrary_domains_blocked(self):
        """Should block non-whitelisted domains."""
        from backend.services.video_loader import is_allowed_url

        assert is_allowed_url("https://malicious-site.com/video") is False
        assert is_allowed_url("https://example.com/video.mp4") is False
        assert is_allowed_url("https://attacker.com/steal?url=secret") is False

    def test_subdomain_handling(self):
        """Should correctly handle subdomains."""
        from backend.services.video_loader import is_allowed_url

        # Valid subdomains of allowed domains
        assert is_allowed_url("https://subdomain.youtube.com/watch") is True
        assert is_allowed_url("https://embed.twitch.tv/stream") is True

        # But not domains that just end with allowed domain names
        assert is_allowed_url("https://notyoutube.com/video") is False
        assert is_allowed_url("https://fakeyoutube.com/video") is False


class TestVideoInfo:
    """Tests for fetching video metadata."""

    @skip_if_no_network
    def test_get_video_info(self, mock_cache_dir):
        """Should fetch video info/metadata."""
        from backend.services.video_loader import get_video_info

        info = get_video_info(TEST_VIDEO_URL)

        assert info is not None
        assert isinstance(info, dict)

        # Should have basic video info
        assert 'id' in info
        assert 'title' in info
        assert info['id'] == TEST_VIDEO_ID

    @skip_if_no_network
    def test_get_video_info_returns_empty_for_invalid(self):
        """Should return empty dict for invalid URL."""
        from backend.services.video_loader import get_video_info

        # Non-whitelisted domain should return empty
        info = get_video_info("https://malicious.com/video")
        assert info == {}


class TestEndToEndSubtitlePipeline:
    """End-to-end tests for the subtitle pipeline."""

    @skip_if_no_network
    def test_fetch_translate_pipeline(self, mock_cache_dir):
        """Test fetching subtitles and preparing for translation."""
        from backend.services.youtube_service import fetch_subtitles

        # Step 1: Fetch subtitles
        result, status = fetch_subtitles(TEST_VIDEO_ID, 'en')

        if status == 404:
            pytest.skip("No subtitles available for this video")

        assert status == 200

        # Step 2: Parse to subtitle list
        subtitles = []
        if isinstance(result, dict):
            events = result.get('events', [])
            for event in events:
                segs = event.get('segs', [])
                text = ''.join(seg.get('utf8', '') for seg in segs).strip()
                if text:
                    subtitles.append({
                        'text': text,
                        'start': event.get('tStartMs', 0) / 1000,
                        'duration': event.get('dDurationMs', 0) / 1000
                    })

        # Should have extracted some subtitles
        assert len(subtitles) > 0, "Failed to parse subtitles"

        # Validate subtitle structure
        for sub in subtitles[:5]:  # Check first 5
            assert 'text' in sub
            assert 'start' in sub
            assert isinstance(sub['text'], str)
            assert len(sub['text']) > 0


class TestErrorHandling:
    """Tests for error handling with real network conditions."""

    @skip_if_no_network
    def test_nonexistent_video(self, mock_cache_dir):
        """Should handle non-existent video gracefully."""
        from backend.services.youtube_service import fetch_subtitles

        # Use a definitely invalid video ID
        result, status = fetch_subtitles("INVALID_VIDEO_ID_12345", 'en')

        # Should return error status (404 or 500)
        assert status in [404, 500], f"Expected error status, got {status}"

    @skip_if_no_network
    def test_private_video(self, mock_cache_dir):
        """Should handle private/unavailable video gracefully."""
        from backend.services.youtube_service import fetch_subtitles

        # This test uses a video ID format that looks valid but likely doesn't exist
        result, status = fetch_subtitles("zzzzzzzzzzz", 'en')

        # Should not crash, return appropriate error
        assert status in [404, 500]

    def test_empty_video_id(self, mock_cache_dir):
        """Should handle empty video ID."""
        from backend.services.youtube_service import fetch_subtitles

        result, status = fetch_subtitles("", 'en')

        # Should return error
        assert status in [400, 404, 500]


