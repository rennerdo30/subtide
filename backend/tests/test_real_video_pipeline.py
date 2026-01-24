"""
Real Video End-to-End Pipeline Test for Subtide Backend.

This test downloads, transcribes, and processes an actual YouTube video
through the complete Subtide pipeline.

Test Video: https://youtu.be/Mb7TUofwujA

Run with:
    PYTHONPATH=$PYTHONPATH:$(pwd) python -m pytest backend/tests/test_real_video_pipeline.py -v -s

Requirements:
    - Network access to YouTube
    - Whisper model (will be downloaded if not present)
    - FFmpeg installed
    - ~2-5 minutes for full pipeline execution
"""

import os
import json
import pytest
import tempfile
import shutil
import socket
import time
from typing import Optional, Dict, Any, List

# Test video configuration
TEST_VIDEO_ID = "Mb7TUofwujA"
TEST_VIDEO_URL = f"https://www.youtube.com/watch?v={TEST_VIDEO_ID}"


def network_available() -> bool:
    """Check if network is available."""
    try:
        socket.create_connection(("www.youtube.com", 443), timeout=5)
        return True
    except (socket.timeout, socket.error):
        return False


# Skip if no network
pytestmark = [
    pytest.mark.slow,
    pytest.mark.network,
    pytest.mark.skipif(not network_available(), reason="Network not available")
]


@pytest.fixture(scope="module")
def test_cache_dir():
    """Create isolated cache directory for tests."""
    tmpdir = tempfile.mkdtemp(prefix="subtide_pipeline_test_")
    yield tmpdir
    # Cleanup
    shutil.rmtree(tmpdir, ignore_errors=True)


@pytest.fixture(scope="module")
def downloaded_audio(test_cache_dir):
    """Download audio once for all tests in this module."""
    from unittest.mock import patch

    with patch('backend.config.CACHE_DIR', test_cache_dir), \
         patch('backend.services.video_loader.CACHE_DIR', test_cache_dir):

        from backend.services.video_loader import download_audio

        print(f"\n[SETUP] Downloading audio from {TEST_VIDEO_URL}...")
        start_time = time.time()

        audio_path = download_audio(TEST_VIDEO_URL, custom_id=f"pipeline_test_{TEST_VIDEO_ID}")

        elapsed = time.time() - start_time

        if audio_path is None:
            pytest.skip("Audio download failed - likely YouTube PO Token requirement")

        print(f"[SETUP] Audio downloaded in {elapsed:.1f}s: {audio_path}")
        print(f"[SETUP] File size: {os.path.getsize(audio_path) / 1024:.1f} KB")

        yield audio_path


class TestRealVideoPipeline:
    """End-to-end pipeline tests with real video."""

    def test_01_audio_download_succeeded(self, downloaded_audio):
        """Verify audio was downloaded successfully."""
        assert downloaded_audio is not None
        assert os.path.exists(downloaded_audio)

        file_size = os.path.getsize(downloaded_audio)
        assert file_size > 10000, f"Audio file too small: {file_size} bytes"

        # Check file extension
        ext = os.path.splitext(downloaded_audio)[1].lower()
        assert ext in ['.m4a', '.mp3', '.wav', '.webm', '.opus', '.ogg', '.aac'], \
            f"Unexpected audio format: {ext}"

        print(f"\n[TEST] Audio file: {downloaded_audio}")
        print(f"[TEST] Size: {file_size / 1024:.1f} KB")
        print(f"[TEST] Format: {ext}")

    def test_02_whisper_transcription(self, downloaded_audio, test_cache_dir):
        """Test Whisper transcription on the downloaded audio."""
        from unittest.mock import patch

        with patch('backend.config.CACHE_DIR', test_cache_dir), \
             patch('backend.services.whisper_service.CACHE_DIR', test_cache_dir):

            from backend.config import ENABLE_WHISPER
            from backend.services.whisper_service import run_whisper_process

            if not ENABLE_WHISPER:
                pytest.skip("Whisper is not enabled")

            print(f"\n[TEST] Starting Whisper transcription...")
            print(f"[TEST] Audio file: {downloaded_audio}")

            # Track progress - callback signature: (stage, message, percent)
            progress_updates = []
            def progress_callback(stage, message, percent):
                progress_updates.append({'stage': stage, 'message': message, 'percent': percent})
                print(f"[WHISPER] {stage}: {message} ({percent}%)")

            start_time = time.time()

            try:
                result = run_whisper_process(
                    audio_file=downloaded_audio,
                    progress_callback=progress_callback,
                    initial_prompt=None,  # Let Whisper auto-detect
                    language=None  # Auto-detect language
                )
            except Exception as e:
                pytest.fail(f"Whisper transcription failed: {e}")

            elapsed = time.time() - start_time

            print(f"\n[TEST] Transcription completed in {elapsed:.1f}s")

            # Validate result structure
            assert result is not None, "Whisper returned None"
            assert isinstance(result, dict), f"Expected dict, got {type(result)}"

            # Check for segments
            segments = result.get('segments', [])
            print(f"[TEST] Got {len(segments)} segments")

            # We should have at least some segments for a real video
            assert len(segments) > 0, "No segments returned from Whisper"

            # Validate segment structure
            for i, seg in enumerate(segments[:3]):  # Check first 3
                assert 'text' in seg, f"Segment {i} missing 'text'"
                assert 'start' in seg, f"Segment {i} missing 'start'"
                assert 'end' in seg, f"Segment {i} missing 'end'"
                print(f"[TEST] Segment {i}: [{seg['start']:.1f}s - {seg['end']:.1f}s] {seg['text'][:50]}...")

            # Check detected language if available
            if 'language' in result:
                print(f"[TEST] Detected language: {result['language']}")

            # Store for next test
            self.__class__.transcription_result = result
            self.__class__.segments = segments

    def test_03_subtitle_format_conversion(self, test_cache_dir):
        """Test converting Whisper output to subtitle format."""
        if not hasattr(self.__class__, 'segments'):
            pytest.skip("Transcription test must run first")

        segments = self.__class__.segments

        # Convert to subtitle format
        subtitles = []
        for seg in segments:
            subtitles.append({
                'text': seg.get('text', '').strip(),
                'start': seg.get('start', 0),
                'end': seg.get('end', 0),
                'duration': seg.get('end', 0) - seg.get('start', 0)
            })

        print(f"\n[TEST] Converted {len(subtitles)} segments to subtitle format")

        # Validate
        assert len(subtitles) > 0

        # Check timing makes sense
        for i, sub in enumerate(subtitles):
            assert sub['start'] >= 0, f"Subtitle {i} has negative start time"
            assert sub['end'] >= sub['start'], f"Subtitle {i} end before start"
            assert sub['duration'] >= 0, f"Subtitle {i} has negative duration"
            assert len(sub['text']) > 0, f"Subtitle {i} has empty text"

        # Check subtitles are in order
        for i in range(1, len(subtitles)):
            assert subtitles[i]['start'] >= subtitles[i-1]['start'], \
                f"Subtitles not in chronological order at index {i}"

        print(f"[TEST] All {len(subtitles)} subtitles validated successfully")

        # Show sample
        print("\n[TEST] Sample subtitles:")
        for sub in subtitles[:5]:
            print(f"  [{sub['start']:.1f}s] {sub['text'][:60]}...")

        self.__class__.subtitles = subtitles

    def test_04_translation_preparation(self, test_cache_dir):
        """Test preparing subtitles for translation."""
        if not hasattr(self.__class__, 'subtitles'):
            pytest.skip("Subtitle conversion test must run first")

        subtitles = self.__class__.subtitles

        from backend.services.translation_service import estimate_translation_time

        # Calculate stats
        total_chars = sum(len(sub['text']) for sub in subtitles)
        total_duration = subtitles[-1]['end'] if subtitles else 0

        print(f"\n[TEST] Translation preparation:")
        print(f"  Subtitles: {len(subtitles)}")
        print(f"  Total characters: {total_chars}")
        print(f"  Video duration: {total_duration:.1f}s")

        # Estimate translation time (function expects count, not list)
        eta_seconds = estimate_translation_time(len(subtitles))
        print(f"  Estimated translation time: {eta_seconds:.1f}s")

        # Validate we have enough content
        assert total_chars > 0, "No text content in subtitles"
        assert len(subtitles) > 0, "No subtitles to translate"

    def test_05_full_pipeline_summary(self, downloaded_audio, test_cache_dir):
        """Summary test showing full pipeline results."""
        print("\n" + "="*60)
        print("FULL PIPELINE TEST SUMMARY")
        print("="*60)

        print(f"\nVideo: {TEST_VIDEO_URL}")
        print(f"Video ID: {TEST_VIDEO_ID}")

        if downloaded_audio:
            size_kb = os.path.getsize(downloaded_audio) / 1024
            print(f"\n[✓] Audio Download: {size_kb:.1f} KB")

        if hasattr(self.__class__, 'segments'):
            print(f"[✓] Whisper Transcription: {len(self.__class__.segments)} segments")

        if hasattr(self.__class__, 'subtitles'):
            subs = self.__class__.subtitles
            total_chars = sum(len(s['text']) for s in subs)
            print(f"[✓] Subtitle Conversion: {len(subs)} subtitles, {total_chars} characters")

        print("\n" + "="*60)
        print("PIPELINE TEST COMPLETE")
        print("="*60)


class TestVideoMetadata:
    """Test video metadata fetching."""

    def test_fetch_video_title(self, test_cache_dir):
        """Fetch and validate video title."""
        from unittest.mock import patch

        with patch('backend.config.CACHE_DIR', test_cache_dir), \
             patch('backend.services.youtube_service.CACHE_DIR', test_cache_dir):

            from backend.services.youtube_service import get_video_title

            print(f"\n[TEST] Fetching title for video: {TEST_VIDEO_ID}")

            title = get_video_title(TEST_VIDEO_ID)

            assert title is not None, "Failed to fetch video title"
            assert len(title) > 0, "Video title is empty"

            print(f"[TEST] Video title: {title}")

    def test_fetch_video_info(self, test_cache_dir):
        """Fetch full video metadata."""
        from unittest.mock import patch

        with patch('backend.config.CACHE_DIR', test_cache_dir), \
             patch('backend.services.video_loader.CACHE_DIR', test_cache_dir):

            from backend.services.video_loader import get_video_info

            print(f"\n[TEST] Fetching metadata for: {TEST_VIDEO_URL}")

            info = get_video_info(TEST_VIDEO_URL)

            assert info is not None, "Failed to fetch video info"
            assert isinstance(info, dict), "Video info should be a dict"

            # Check expected fields
            print(f"[TEST] Video ID: {info.get('id')}")
            print(f"[TEST] Title: {info.get('title', 'N/A')[:50]}")
            print(f"[TEST] Duration: {info.get('duration', 'N/A')}s")
            print(f"[TEST] Uploader: {info.get('uploader', 'N/A')}")

            assert info.get('id') == TEST_VIDEO_ID, "Video ID mismatch"


class TestSubtitleFetching:
    """Test YouTube subtitle fetching."""

    def test_fetch_available_subtitles(self, test_cache_dir):
        """Fetch available subtitle tracks."""
        from unittest.mock import patch

        with patch('backend.config.CACHE_DIR', test_cache_dir), \
             patch('backend.services.youtube_service.CACHE_DIR', test_cache_dir):

            from backend.services.youtube_service import fetch_subtitles

            print(f"\n[TEST] Fetching subtitles for: {TEST_VIDEO_ID}")

            # Try to fetch English subtitles
            result, status = fetch_subtitles(TEST_VIDEO_ID, 'en')

            print(f"[TEST] Status: {status}")

            if status == 200:
                if isinstance(result, dict):
                    events = result.get('events', [])
                    print(f"[TEST] Got {len(events)} subtitle events")

                    # Show first few
                    for event in events[:3]:
                        text = ''.join(seg.get('utf8', '') for seg in event.get('segs', []))
                        print(f"  [{event.get('tStartMs', 0)/1000:.1f}s] {text[:50]}...")
                else:
                    print(f"[TEST] Got non-dict response: {type(result)}")
            elif status == 404:
                print(f"[TEST] No subtitles available")
                if isinstance(result, dict):
                    print(f"  Available manual: {result.get('available_manual', [])}")
                    print(f"  Available auto: {result.get('available_auto', [])}")
            else:
                print(f"[TEST] Unexpected status: {status}")
                if isinstance(result, dict):
                    print(f"  Error: {result.get('error', 'Unknown')}")
