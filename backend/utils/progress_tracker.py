"""
Progress Tracker with Historical Data
=====================================
Tracks timing for all pipeline stages and uses historical data
to provide accurate ETAs across the entire translation workflow.
"""

import os
import json
import time
import logging
from typing import Dict, Any, Optional, Callable, List
from dataclasses import dataclass, field, asdict
from datetime import datetime

from backend.config import CACHE_DIR

logger = logging.getLogger('subtide')

# History file path
HISTORY_FILE = os.path.join(CACHE_DIR, 'timing_history.json')

# Maximum history entries per stage
MAX_HISTORY_ENTRIES = 100


@dataclass
class StageProgress:
    """Progress state for a single stage."""
    stage: str
    started_at: float = 0.0
    completed_at: float = 0.0
    percent: int = 0
    message: str = ""
    sub_progress: Dict[str, Any] = field(default_factory=dict)


@dataclass
class PipelineProgress:
    """Overall pipeline progress tracking."""
    video_id: str
    target_lang: str
    total_steps: int = 4
    current_step: int = 0
    stages: Dict[str, StageProgress] = field(default_factory=dict)
    started_at: float = 0.0
    video_duration: float = 0.0
    subtitle_count: int = 0


class ProgressTracker:
    """
    Tracks progress across all pipeline stages with historical ETA.

    Stages:
    - checking: Checking available subtitles (~2-10s)
    - downloading: Downloading audio/subtitles (~5-60s)
    - whisper: Transcription (~varies by duration)
    - translating: LLM translation (~varies by subtitle count)
    - complete: Done
    """

    # Stage weights for overall progress (should sum to 100)
    STAGE_WEIGHTS = {
        'checking': 5,
        'downloading': 10,
        'whisper': 45,
        'translating': 35,
        'complete': 5,
    }

    def __init__(self, video_id: str, target_lang: str, on_progress: Optional[Callable] = None):
        self.pipeline = PipelineProgress(
            video_id=video_id,
            target_lang=target_lang,
            started_at=time.time()
        )
        self.on_progress = on_progress
        self.history = self._load_history()
        self._current_stage: Optional[str] = None

    def _load_history(self) -> Dict[str, List[Dict]]:
        """Load historical timing data."""
        try:
            if os.path.exists(HISTORY_FILE):
                with open(HISTORY_FILE, 'r') as f:
                    return json.load(f)
        except Exception as e:
            logger.warning(f"Failed to load timing history: {e}")
        return {}

    def _save_history(self):
        """Save historical timing data."""
        try:
            os.makedirs(os.path.dirname(HISTORY_FILE), exist_ok=True)
            with open(HISTORY_FILE, 'w') as f:
                json.dump(self.history, f, indent=2)
        except Exception as e:
            logger.warning(f"Failed to save timing history: {e}")

    def _add_to_history(self, stage: str, duration: float, metadata: Dict[str, Any] = None):
        """Add a timing entry to history."""
        if stage not in self.history:
            self.history[stage] = []

        entry = {
            'duration': duration,
            'timestamp': time.time(),
            'metadata': metadata or {}
        }

        self.history[stage].append(entry)

        # Trim to max entries
        if len(self.history[stage]) > MAX_HISTORY_ENTRIES:
            self.history[stage] = self.history[stage][-MAX_HISTORY_ENTRIES:]

        self._save_history()

    def get_historical_estimate(self, stage: str, metadata: Dict[str, Any] = None) -> float:
        """
        Get estimated duration for a stage based on history.

        For whisper: Uses video_duration to scale estimate
        For translating: Uses subtitle_count to scale estimate
        """
        if stage not in self.history or not self.history[stage]:
            # Default estimates
            defaults = {
                'checking': 5.0,
                'downloading': 15.0,
                'whisper': 60.0,  # Will be scaled by duration
                'translating': 30.0,  # Will be scaled by subtitle count
            }
            return defaults.get(stage, 10.0)

        entries = self.history[stage]

        # For whisper, scale by video duration
        if stage == 'whisper' and metadata and metadata.get('video_duration'):
            target_duration = metadata['video_duration']
            scaled_estimates = []

            for entry in entries[-20:]:  # Last 20 entries
                hist_duration = entry.get('metadata', {}).get('video_duration', 300)
                if hist_duration > 0:
                    # Real-time factor from this entry
                    rtf = entry['duration'] / hist_duration
                    scaled_estimates.append(rtf * target_duration)

            if scaled_estimates:
                return sum(scaled_estimates) / len(scaled_estimates)

        # For translation, scale by subtitle count
        if stage == 'translating' and metadata and metadata.get('subtitle_count'):
            target_count = metadata['subtitle_count']
            scaled_estimates = []

            for entry in entries[-20:]:
                hist_count = entry.get('metadata', {}).get('subtitle_count', 100)
                if hist_count > 0:
                    # Time per subtitle from this entry
                    per_sub = entry['duration'] / hist_count
                    scaled_estimates.append(per_sub * target_count)

            if scaled_estimates:
                return sum(scaled_estimates) / len(scaled_estimates)

        # Default: average of recent entries
        recent = [e['duration'] for e in entries[-20:]]
        return sum(recent) / len(recent) if recent else 10.0

    def set_video_duration(self, duration: float):
        """Set video duration for better estimates."""
        self.pipeline.video_duration = duration

    def set_subtitle_count(self, count: int):
        """Set subtitle count for better estimates."""
        self.pipeline.subtitle_count = count

    def start_stage(self, stage: str, message: str = ""):
        """Start tracking a new stage."""
        self._current_stage = stage

        # Map stages to step numbers
        stage_steps = {
            'checking': 1,
            'downloading': 2,
            'whisper': 2,
            'translating': 3,
            'complete': 4,
        }

        self.pipeline.current_step = stage_steps.get(stage, 1)

        self.pipeline.stages[stage] = StageProgress(
            stage=stage,
            started_at=time.time(),
            message=message
        )

        self._emit_progress(stage, message, 0)

    def update_stage(self, stage: str, percent: int, message: str = "",
                     sub_progress: Dict[str, Any] = None, eta_override: str = None):
        """Update progress for current stage."""
        if stage not in self.pipeline.stages:
            self.start_stage(stage, message)

        stage_data = self.pipeline.stages[stage]
        stage_data.percent = percent
        stage_data.message = message
        if sub_progress:
            stage_data.sub_progress = sub_progress

        self._emit_progress(stage, message, percent, sub_progress, eta_override)

    def complete_stage(self, stage: str, message: str = "Complete"):
        """Mark a stage as complete and record timing."""
        if stage in self.pipeline.stages:
            stage_data = self.pipeline.stages[stage]
            stage_data.completed_at = time.time()
            stage_data.percent = 100
            stage_data.message = message

            # Record to history
            duration = stage_data.completed_at - stage_data.started_at
            metadata = {
                'video_duration': self.pipeline.video_duration,
                'subtitle_count': self.pipeline.subtitle_count,
            }
            self._add_to_history(stage, duration, metadata)

            logger.info(f"[PROGRESS] Stage '{stage}' completed in {duration:.1f}s")

        self._emit_progress(stage, message, 100)

    def _calculate_overall_percent(self) -> int:
        """Calculate overall pipeline progress."""
        total = 0
        achieved = 0

        for stage, weight in self.STAGE_WEIGHTS.items():
            total += weight
            if stage in self.pipeline.stages:
                stage_data = self.pipeline.stages[stage]
                achieved += (stage_data.percent / 100) * weight

        return int(achieved)

    def _calculate_overall_eta(self) -> str:
        """Calculate overall remaining time estimate."""
        remaining_seconds = 0

        # Find current and remaining stages
        stages_order = ['checking', 'downloading', 'whisper', 'translating', 'complete']
        current_idx = -1

        for i, stage in enumerate(stages_order):
            if stage == self._current_stage:
                current_idx = i
                break

        if current_idx == -1:
            return ""

        # Estimate remaining time for current stage
        if self._current_stage in self.pipeline.stages:
            stage_data = self.pipeline.stages[self._current_stage]
            elapsed = time.time() - stage_data.started_at
            percent = stage_data.percent

            if percent > 0 and percent < 100:
                # Time-based estimate
                estimated_total = (elapsed / percent) * 100
                remaining_seconds += max(0, estimated_total - elapsed)
            elif percent == 0:
                # Use historical estimate
                metadata = {
                    'video_duration': self.pipeline.video_duration,
                    'subtitle_count': self.pipeline.subtitle_count,
                }
                remaining_seconds += self.get_historical_estimate(self._current_stage, metadata)

        # Add estimates for remaining stages
        for i in range(current_idx + 1, len(stages_order)):
            stage = stages_order[i]
            if stage == 'complete':
                continue
            metadata = {
                'video_duration': self.pipeline.video_duration,
                'subtitle_count': self.pipeline.subtitle_count,
            }
            remaining_seconds += self.get_historical_estimate(stage, metadata)

        return format_eta(remaining_seconds)

    def _emit_progress(self, stage: str, message: str, percent: int,
                       sub_progress: Dict[str, Any] = None, eta_override: str = None):
        """Emit progress update via callback."""
        if not self.on_progress:
            return

        overall_percent = self._calculate_overall_percent()
        eta = eta_override or self._calculate_overall_eta()

        data = {
            'stage': stage,
            'message': message,
            'percent': overall_percent,
            'step': self.pipeline.current_step,
            'totalSteps': self.pipeline.total_steps,
            'eta': eta,
            'stagePercent': percent,
        }

        if sub_progress:
            data.update(sub_progress)

        self.on_progress(data)


def format_eta(seconds: float) -> str:
    """Format seconds into human-readable time."""
    if seconds <= 0:
        return ""
    if seconds < 60:
        return f"{int(seconds)}s"
    elif seconds < 3600:
        mins = int(seconds // 60)
        secs = int(seconds % 60)
        return f"{mins}m {secs}s"
    else:
        hours = int(seconds // 3600)
        mins = int((seconds % 3600) // 60)
        return f"{hours}h {mins}m"


def get_historical_whisper_rtf() -> float:
    """Get historical real-time factor for whisper transcription."""
    try:
        if os.path.exists(HISTORY_FILE):
            with open(HISTORY_FILE, 'r') as f:
                history = json.load(f)

            if 'whisper' in history and history['whisper']:
                rtfs = []
                for entry in history['whisper'][-20:]:
                    dur = entry.get('metadata', {}).get('video_duration', 0)
                    if dur > 0:
                        rtfs.append(entry['duration'] / dur)
                if rtfs:
                    return sum(rtfs) / len(rtfs)
    except:
        pass

    # Default RTF based on model
    return 0.12  # Small model on Apple Silicon
