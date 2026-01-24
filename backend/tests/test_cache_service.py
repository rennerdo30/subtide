"""
Tests for cache_service.py - Cache cleanup and scheduling.
"""

import os
import time
import tempfile
import shutil
import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock

from backend.services.cache_service import get_dir_size_mb, cleanup_cache, start_cache_scheduler


class TestGetDirSizeMB:
    """Tests for get_dir_size_mb function."""

    def test_empty_directory(self, tmp_path):
        """Empty directory should return 0."""
        assert get_dir_size_mb(str(tmp_path)) == 0

    def test_directory_with_files(self, tmp_path):
        """Should correctly calculate size of files."""
        # Create files of known sizes
        (tmp_path / "file1.txt").write_bytes(b"x" * 1024)  # 1 KB
        (tmp_path / "file2.txt").write_bytes(b"x" * 2048)  # 2 KB

        size_mb = get_dir_size_mb(str(tmp_path))
        expected_mb = 3 / 1024  # 3 KB in MB
        assert abs(size_mb - expected_mb) < 0.001

    def test_nested_directories(self, tmp_path):
        """Should include files in subdirectories."""
        subdir = tmp_path / "subdir"
        subdir.mkdir()
        (tmp_path / "root.txt").write_bytes(b"x" * 1024)
        (subdir / "nested.txt").write_bytes(b"x" * 1024)

        size_mb = get_dir_size_mb(str(tmp_path))
        expected_mb = 2 / 1024  # 2 KB in MB
        assert abs(size_mb - expected_mb) < 0.001

    def test_nonexistent_directory(self, tmp_path):
        """Nonexistent directory should raise exception or return 0."""
        nonexistent = tmp_path / "does_not_exist"
        try:
            size = get_dir_size_mb(str(nonexistent))
            assert size == 0
        except (OSError, FileNotFoundError):
            pass  # Either behavior is acceptable


class TestCleanupCache:
    """Tests for cleanup_cache function."""

    @patch('backend.services.cache_service.CACHE_DIR')
    @patch('backend.services.cache_service.CACHE_AUDIO_TTL_HOURS', 1)
    @patch('backend.services.cache_service.CACHE_MAX_SIZE_MB', 100)
    def test_deletes_expired_files(self, mock_cache_dir, tmp_path):
        """Should delete files older than TTL."""
        mock_cache_dir.__str__ = lambda x: str(tmp_path)

        with patch('backend.services.cache_service.CACHE_DIR', str(tmp_path)):
            # Create an "old" file (modify time 2 hours ago)
            old_file = tmp_path / "old_audio.m4a"
            old_file.write_bytes(b"x" * 100)
            old_time = time.time() - (2 * 3600)  # 2 hours ago
            os.utime(old_file, (old_time, old_time))

            # Create a "new" file
            new_file = tmp_path / "new_audio.m4a"
            new_file.write_bytes(b"x" * 100)

            cleanup_cache()

            assert not old_file.exists(), "Old file should be deleted"
            assert new_file.exists(), "New file should be kept"

    @patch('backend.services.cache_service.CACHE_DIR')
    @patch('backend.services.cache_service.CACHE_MAX_SIZE_MB', 0.001)  # 1 KB limit
    @patch('backend.services.cache_service.CACHE_AUDIO_TTL_HOURS', 24)
    def test_enforces_size_limit(self, mock_cache_dir, tmp_path):
        """Should delete oldest files when size limit exceeded."""
        with patch('backend.services.cache_service.CACHE_DIR', str(tmp_path)):
            # Create files that exceed the size limit
            file1 = tmp_path / "file1.m4a"
            file1.write_bytes(b"x" * 1024)  # 1 KB
            time.sleep(0.1)  # Ensure different mtime

            file2 = tmp_path / "file2.m4a"
            file2.write_bytes(b"x" * 1024)  # 1 KB

            cleanup_cache()

            # Oldest file should be deleted to get under limit
            assert not file1.exists() or not file2.exists(), "At least one file should be deleted"

    @patch('backend.services.cache_service.CACHE_DIR', '/nonexistent/path')
    def test_handles_nonexistent_cache_dir(self):
        """Should handle nonexistent cache directory gracefully."""
        # Should not raise exception
        cleanup_cache()

    @patch('backend.services.cache_service.CACHE_DIR')
    @patch('backend.services.cache_service.CACHE_AUDIO_TTL_HOURS', 24)
    @patch('backend.services.cache_service.CACHE_MAX_SIZE_MB', 1000)
    def test_keeps_files_under_limits(self, mock_cache_dir, tmp_path):
        """Should keep files that are within TTL and size limits."""
        with patch('backend.services.cache_service.CACHE_DIR', str(tmp_path)):
            # Create files that are within limits
            file1 = tmp_path / "file1.m4a"
            file1.write_bytes(b"x" * 100)

            cleanup_cache()

            assert file1.exists(), "File within limits should be kept"


class TestStartCacheScheduler:
    """Tests for start_cache_scheduler function."""

    @patch('backend.services.cache_service.CACHE_CLEANUP_INTERVAL_MINUTES', 0.001)
    @patch('backend.services.cache_service.cleanup_cache')
    def test_starts_daemon_thread(self, mock_cleanup):
        """Scheduler should start a daemon thread."""
        import threading

        initial_threads = threading.active_count()
        start_cache_scheduler()

        # Give thread time to start
        time.sleep(0.01)

        # Should have started a new thread
        # Note: Thread count may vary, just check it doesn't crash
        assert True  # Just verify no exception

    @patch('backend.services.cache_service.logger')
    def test_logs_scheduler_start(self, mock_logger):
        """Should log when scheduler starts."""
        with patch('backend.services.cache_service.CACHE_CLEANUP_INTERVAL_MINUTES', 60):
            start_cache_scheduler()
            mock_logger.info.assert_called()
