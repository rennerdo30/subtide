import os
import json
import time
import pytest
from unittest.mock import MagicMock, patch
from backend.utils.progress_tracker import ProgressTracker, StageProgress, PipelineProgress, format_eta

@pytest.fixture
def mock_on_progress():
    return MagicMock()

@pytest.fixture
def temp_history_file(tmp_path):
    history_file = tmp_path / "timing_history.json"
    with patch('backend.utils.progress_tracker.HISTORY_FILE', str(history_file)):
        yield history_file

def test_progress_tracker_init(temp_history_file):
    tracker = ProgressTracker("test_video", "ja")
    assert tracker.pipeline.video_id == "test_video"
    assert tracker.pipeline.target_lang == "ja"
    assert tracker.history == {}

def test_progress_tracker_load_save_history(temp_history_file):
    tracker = ProgressTracker("test_video", "ja")
    tracker._add_to_history("whisper", 10.0, {"video_duration": 100})
    
    assert "whisper" in tracker.history
    assert len(tracker.history["whisper"]) == 1
    assert tracker.history["whisper"][0]["duration"] == 10.0
    
    # Reload and check
    tracker2 = ProgressTracker("test_video", "ja")
    assert "whisper" in tracker2.history
    assert tracker2.history["whisper"][0]["duration"] == 10.0

def test_get_historical_estimate_defaults(temp_history_file):
    tracker = ProgressTracker("test_video", "ja")
    assert tracker.get_historical_estimate("checking") == 5.0
    assert tracker.get_historical_estimate("unknown") == 10.0

def test_get_historical_estimate_scaled_whisper(temp_history_file):
    tracker = ProgressTracker("test_video", "ja")
    # 100s video took 10s (RTF 0.1)
    tracker._add_to_history("whisper", 10.0, {"video_duration": 100})
    
    # 200s video should estimate 20s
    estimate = tracker.get_historical_estimate("whisper", {"video_duration": 200})
    assert estimate == 20.0

def test_get_historical_estimate_scaled_translating(temp_history_file):
    tracker = ProgressTracker("test_video", "ja")
    # 100 subs took 5s (0.05s per sub)
    tracker._add_to_history("translating", 5.0, {"subtitle_count": 100})
    
    # 200 subs should estimate 10s
    estimate = tracker.get_historical_estimate("translating", {"subtitle_count": 200})
    assert estimate == 10.0

def test_start_and_update_stage(temp_history_file, mock_on_progress):
    tracker = ProgressTracker("test_video", "ja", on_progress=mock_on_progress)
    tracker.start_stage("whisper", "Transcribing...")
    
    assert tracker._current_stage == "whisper"
    assert "whisper" in tracker.pipeline.stages
    assert tracker.pipeline.current_step == 2
    
    mock_on_progress.assert_called()
    last_call_args = mock_on_progress.call_args[0][0]
    assert last_call_args["stage"] == "whisper"
    assert last_call_args["percent"] == 0  # No previous stages completed
    
    tracker.update_stage("whisper", 50, "Halfway there")
    assert tracker.pipeline.stages["whisper"].percent == 50
    assert tracker.pipeline.stages["whisper"].message == "Halfway there"

def test_complete_stage(temp_history_file, mock_on_progress):
    tracker = ProgressTracker("test_video", "ja", on_progress=mock_on_progress)
    tracker.start_stage("checking")
    time.sleep(0.1)
    tracker.complete_stage("checking")
    
    assert tracker.pipeline.stages["checking"].percent == 100
    assert "checking" in tracker.history
    assert len(tracker.history["checking"]) == 1

def test_calculate_overall_percent(temp_history_file):
    tracker = ProgressTracker("test_video", "ja")
    tracker.start_stage("checking")
    tracker.complete_stage("checking") # 5%
    tracker.start_stage("downloading")
    tracker.update_stage("downloading", 50) # + 5% (50% of 10)
    
    assert tracker._calculate_overall_percent() == 10

def test_format_eta():
    assert format_eta(0) == ""
    assert format_eta(45) == "45s"
    assert format_eta(90) == "1m 30s"
    assert format_eta(3661) == "1h 1m"

def test_overall_eta_calculation(temp_history_file):
    tracker = ProgressTracker("test_video", "ja")
    tracker.set_video_duration(100)
    tracker.start_stage("whisper")
    tracker.update_stage("whisper", 50) 
    # If 50% took some time, it calculates based on elapsed
    # Hard to test precisely without time mocking, but we can verify it returns a string
    eta = tracker._calculate_overall_eta()
    assert isinstance(eta, str)
