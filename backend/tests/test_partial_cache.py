"""
Tests for partial_cache.py - Partial translation cache for batch resume.
"""

import os
import json
import time
import tempfile
import pytest
from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock

from backend.utils.partial_cache import (
    _get_cache_key,
    _get_cache_path,
    save_partial_progress,
    load_partial_progress,
    clear_partial_progress,
    compute_source_hash,
    get_directory_size,
    get_cache_files_by_age,
    enforce_cache_size_limit,
    cleanup_expired_caches,
    PARTIAL_CACHE_DIR,
)


class TestCacheKey:
    """Tests for cache key generation."""

    def test_get_cache_key(self):
        """Should generate consistent cache keys."""
        key = _get_cache_key("abc123", "en")
        assert key == "abc123_en"

    def test_cache_key_different_videos(self):
        """Different videos should have different keys."""
        key1 = _get_cache_key("video1", "en")
        key2 = _get_cache_key("video2", "en")
        assert key1 != key2

    def test_cache_key_different_languages(self):
        """Different languages should have different keys."""
        key1 = _get_cache_key("video1", "en")
        key2 = _get_cache_key("video1", "ja")
        assert key1 != key2


class TestComputeSourceHash:
    """Tests for source hash computation."""

    def test_empty_subtitles(self):
        """Should handle empty list."""
        hash_val = compute_source_hash([])
        assert len(hash_val) == 16  # MD5 truncated to 16 chars

    def test_consistent_hash(self):
        """Same subtitles should produce same hash."""
        subs = [{"text": "Hello"}, {"text": "World"}]
        hash1 = compute_source_hash(subs)
        hash2 = compute_source_hash(subs)
        assert hash1 == hash2

    def test_different_hash_for_different_content(self):
        """Different subtitles should produce different hash."""
        subs1 = [{"text": "Hello"}]
        subs2 = [{"text": "Goodbye"}]
        assert compute_source_hash(subs1) != compute_source_hash(subs2)

    def test_ignores_non_text_fields(self):
        """Should only hash text field."""
        subs1 = [{"text": "Hello", "start": 0}]
        subs2 = [{"text": "Hello", "start": 100}]
        assert compute_source_hash(subs1) == compute_source_hash(subs2)


class TestSavePartialProgress:
    """Tests for saving partial progress."""

    def test_save_creates_file(self, tmp_path):
        """Should create cache file."""
        with patch('backend.utils.partial_cache.PARTIAL_CACHE_DIR', str(tmp_path)):
            result = save_partial_progress(
                video_id="test123",
                target_lang="en",
                completed_batches={0: ["translated"], 1: ["text"]},
                total_batches=5,
                source_hash="abc123"
            )
            assert result is True

            cache_file = tmp_path / "test123_en.json"
            assert cache_file.exists()

    def test_save_contains_correct_data(self, tmp_path):
        """Saved data should contain all required fields."""
        with patch('backend.utils.partial_cache.PARTIAL_CACHE_DIR', str(tmp_path)):
            save_partial_progress(
                video_id="test123",
                target_lang="ja",
                completed_batches={"0": ["trans1"]},
                total_batches=3,
                source_hash="hash123"
            )

            cache_file = tmp_path / "test123_ja.json"
            with open(cache_file, 'r') as f:
                data = json.load(f)

            assert data['video_id'] == "test123"
            assert data['target_lang'] == "ja"
            assert data['total_batches'] == 3
            assert data['source_hash'] == "hash123"
            assert 'timestamp' in data

    def test_save_creates_directory(self, tmp_path):
        """Should create cache directory if it doesn't exist."""
        cache_dir = tmp_path / "new_cache_dir"
        with patch('backend.utils.partial_cache.PARTIAL_CACHE_DIR', str(cache_dir)):
            result = save_partial_progress(
                video_id="test",
                target_lang="en",
                completed_batches={},
                total_batches=1,
                source_hash="x"
            )
            assert result is True
            assert cache_dir.exists()


class TestLoadPartialProgress:
    """Tests for loading partial progress."""

    def test_load_nonexistent_returns_none(self, tmp_path):
        """Should return None if no cache exists."""
        with patch('backend.utils.partial_cache.PARTIAL_CACHE_DIR', str(tmp_path)):
            result = load_partial_progress("nonexistent", "en", "hash")
            assert result is None

    def test_load_valid_cache(self, tmp_path):
        """Should load valid cache data."""
        with patch('backend.utils.partial_cache.PARTIAL_CACHE_DIR', str(tmp_path)):
            # First save
            save_partial_progress(
                video_id="test123",
                target_lang="en",
                completed_batches={"0": ["trans1"], "1": ["trans2"]},
                total_batches=5,
                source_hash="hash123"
            )

            # Then load
            result = load_partial_progress("test123", "en", "hash123")

            assert result is not None
            assert 0 in result  # Keys should be converted to int
            assert 1 in result

    def test_load_invalidates_on_hash_mismatch(self, tmp_path):
        """Should return None if source hash doesn't match."""
        with patch('backend.utils.partial_cache.PARTIAL_CACHE_DIR', str(tmp_path)):
            save_partial_progress(
                video_id="test",
                target_lang="en",
                completed_batches={},
                total_batches=1,
                source_hash="old_hash"
            )

            result = load_partial_progress("test", "en", "new_hash")
            assert result is None

    def test_load_invalidates_expired_cache(self, tmp_path):
        """Should return None if cache is expired."""
        with patch('backend.utils.partial_cache.PARTIAL_CACHE_DIR', str(tmp_path)):
            # Create cache file with old timestamp
            cache_file = tmp_path / "test_en.json"
            old_data = {
                'video_id': 'test',
                'target_lang': 'en',
                'completed_batches': {},
                'total_batches': 1,
                'source_hash': 'hash',
                'timestamp': '2000-01-01T00:00:00'  # Very old timestamp
            }
            cache_file.write_text(json.dumps(old_data))

            result = load_partial_progress("test", "en", "hash")
            assert result is None


class TestClearPartialProgress:
    """Tests for clearing partial progress."""

    def test_clear_removes_file(self, tmp_path):
        """Should remove cache file."""
        with patch('backend.utils.partial_cache.PARTIAL_CACHE_DIR', str(tmp_path)):
            save_partial_progress(
                video_id="test",
                target_lang="en",
                completed_batches={},
                total_batches=1,
                source_hash="hash"
            )

            cache_file = tmp_path / "test_en.json"
            assert cache_file.exists()

            result = clear_partial_progress("test", "en")
            assert result is True
            assert not cache_file.exists()

    def test_clear_nonexistent_returns_true(self, tmp_path):
        """Should return True even if file doesn't exist."""
        with patch('backend.utils.partial_cache.PARTIAL_CACHE_DIR', str(tmp_path)):
            result = clear_partial_progress("nonexistent", "en")
            assert result is True


class TestGetDirectorySize:
    """Tests for directory size calculation."""

    def test_empty_directory(self, tmp_path):
        """Empty directory should return 0."""
        size = get_directory_size(str(tmp_path))
        assert size == 0

    def test_directory_with_files(self, tmp_path):
        """Should sum sizes of all files."""
        (tmp_path / "file1.txt").write_bytes(b"x" * 100)
        (tmp_path / "file2.txt").write_bytes(b"y" * 200)

        size = get_directory_size(str(tmp_path))
        assert size == 300

    def test_nested_directories(self, tmp_path):
        """Should include files in subdirectories."""
        subdir = tmp_path / "sub"
        subdir.mkdir()
        (tmp_path / "root.txt").write_bytes(b"x" * 50)
        (subdir / "nested.txt").write_bytes(b"y" * 50)

        size = get_directory_size(str(tmp_path))
        assert size == 100


class TestGetCacheFilesByAge:
    """Tests for getting cache files sorted by age."""

    def test_empty_directory(self, tmp_path):
        """Empty directory should return empty list."""
        files = get_cache_files_by_age(str(tmp_path))
        assert files == []

    def test_files_sorted_by_mtime(self, tmp_path):
        """Files should be sorted oldest first."""
        # Create files with different modification times
        old_file = tmp_path / "old.txt"
        old_file.write_bytes(b"x")
        old_time = time.time() - 3600
        os.utime(old_file, (old_time, old_time))

        new_file = tmp_path / "new.txt"
        new_file.write_bytes(b"y")

        files = get_cache_files_by_age(str(tmp_path))
        assert len(files) == 2
        assert files[0][0] == str(old_file)  # Oldest first


class TestEnforceCacheSizeLimit:
    """Tests for enforcing cache size limit."""

    def test_no_deletion_under_limit(self, tmp_path):
        """Should not delete files when under limit."""
        (tmp_path / "file.txt").write_bytes(b"x" * 100)

        deleted = enforce_cache_size_limit(str(tmp_path), max_size_mb=1)
        assert deleted == 0

    def test_deletes_oldest_first(self, tmp_path):
        """Should delete oldest files first when over limit."""
        # Create files with different ages
        old_file = tmp_path / "old.txt"
        old_file.write_bytes(b"x" * 600)
        old_time = time.time() - 3600
        os.utime(old_file, (old_time, old_time))

        new_file = tmp_path / "new.txt"
        new_file.write_bytes(b"y" * 600)

        # Limit to 0.001 MB (about 1 KB) - both files exceed this
        deleted = enforce_cache_size_limit(str(tmp_path), max_size_mb=0.001)

        assert deleted >= 1
        assert not old_file.exists()  # Old file should be deleted first


class TestCleanupExpiredCaches:
    """Tests for cleaning up expired caches."""

    @patch('backend.utils.partial_cache.CACHE_TTL_HOURS', 0.0001)
    def test_deletes_expired_partial_caches(self, tmp_path):
        """Should delete expired partial cache files."""
        with patch('backend.utils.partial_cache.PARTIAL_CACHE_DIR', str(tmp_path)):
            # Create an "old" cache file
            cache_file = tmp_path / "old_video_en.json"
            cache_file.write_text('{"test": true}')
            old_time = time.time() - 3600  # 1 hour ago
            os.utime(cache_file, (old_time, old_time))

            time.sleep(0.01)  # Ensure TTL has passed

            deleted = cleanup_expired_caches()
            assert deleted >= 1
            assert not cache_file.exists()
