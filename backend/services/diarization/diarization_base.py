"""
Diarization Backend - Abstract Base Class
Defines the interface for all speaker diarization backends.
"""

import os
import logging
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional, Callable
from dataclasses import dataclass

logger = logging.getLogger('subtide')


@dataclass
class SpeakerSegment:
    """A single speaker segment."""
    start: float      # Start time in seconds
    end: float        # End time in seconds
    speaker: str      # Speaker ID (e.g., "SPEAKER_00")
    confidence: float = 1.0  # Confidence score (0-1)


class DiarizationBackend(ABC):
    """Abstract base class for speaker diarization backends."""

    @abstractmethod
    def diarize(
        self,
        audio_path: str,
        num_speakers: Optional[int] = None,
        min_speakers: Optional[int] = None,
        max_speakers: Optional[int] = None,
        progress_callback: Optional[Callable[[str, str, int], None]] = None,
    ) -> List[SpeakerSegment]:
        """
        Perform speaker diarization on audio.

        Args:
            audio_path: Path to the audio file
            num_speakers: Exact number of speakers (if known)
            min_speakers: Minimum expected speakers
            max_speakers: Maximum expected speakers
            progress_callback: Called with (stage, message, percent) during processing

        Returns:
            List of SpeakerSegment objects
        """
        pass

    @abstractmethod
    def get_device(self) -> str:
        """
        Return the device being used for inference.

        Returns:
            Device string: 'cuda', 'mps', or 'cpu'
        """
        pass

    @abstractmethod
    def get_backend_name(self) -> str:
        """
        Return the backend name for logging.

        Returns:
            Backend name string: 'pyannote', 'nemo'
        """
        pass

    def cleanup(self):
        """
        Clean up resources (e.g., GPU memory).
        Override in subclasses if needed.
        """
        pass

    def assign_speakers_to_segments(
        self,
        transcription_segments: List[Dict[str, Any]],
        speaker_segments: List[SpeakerSegment],
        smoothing: bool = True,
        min_segment_duration: float = 0.5,
    ) -> List[Dict[str, Any]]:
        """
        Assign speaker labels to transcription segments.

        Args:
            transcription_segments: List of transcription segments with 'start', 'end', 'text'
            speaker_segments: List of SpeakerSegment from diarization
            smoothing: Apply smoothing to reduce speaker flickering
            min_segment_duration: Minimum duration for speaker assignments

        Returns:
            Transcription segments with 'speaker' field added
        """
        if not speaker_segments:
            return transcription_segments

        # Build speaker timeline
        speaker_timeline = []
        for seg in speaker_segments:
            if seg.end - seg.start >= min_segment_duration:
                speaker_timeline.append({
                    'start': seg.start,
                    'end': seg.end,
                    'speaker': seg.speaker,
                })

        # Assign speakers to each transcription segment
        for trans_seg in transcription_segments:
            seg_start = trans_seg.get('start', 0)
            seg_end = trans_seg.get('end', 0)
            seg_mid = (seg_start + seg_end) / 2

            # Find the speaker at the midpoint of the segment
            speaker = None
            for sp_seg in speaker_timeline:
                if sp_seg['start'] <= seg_mid <= sp_seg['end']:
                    speaker = sp_seg['speaker']
                    break

            # Fallback: find nearest speaker
            if speaker is None and speaker_timeline:
                min_dist = float('inf')
                for sp_seg in speaker_timeline:
                    sp_mid = (sp_seg['start'] + sp_seg['end']) / 2
                    dist = abs(seg_mid - sp_mid)
                    if dist < min_dist:
                        min_dist = dist
                        speaker = sp_seg['speaker']

            trans_seg['speaker'] = speaker

        # Apply smoothing if enabled
        if smoothing and len(transcription_segments) > 2:
            transcription_segments = self._smooth_speakers(transcription_segments)

        return transcription_segments

    def _smooth_speakers(
        self,
        segments: List[Dict[str, Any]],
        min_duration: float = 1.0,
    ) -> List[Dict[str, Any]]:
        """
        Smooth speaker assignments to reduce flickering.

        If a speaker change lasts less than min_duration, keep the previous speaker.
        """
        if len(segments) < 3:
            return segments

        smoothed = segments.copy()

        for i in range(1, len(smoothed) - 1):
            prev_speaker = smoothed[i - 1].get('speaker')
            curr_speaker = smoothed[i].get('speaker')
            next_speaker = smoothed[i + 1].get('speaker')

            # If current is different but previous and next are the same
            if curr_speaker != prev_speaker and prev_speaker == next_speaker:
                seg_duration = smoothed[i].get('end', 0) - smoothed[i].get('start', 0)
                if seg_duration < min_duration:
                    smoothed[i]['speaker'] = prev_speaker

        return smoothed


def get_diarization_backend(backend_type: Optional[str] = None) -> DiarizationBackend:
    """
    Factory function to get the appropriate diarization backend.

    Args:
        backend_type: Force a specific backend ('pyannote', 'nemo')
                     If None, auto-detects based on platform

    Returns:
        DiarizationBackend instance
    """
    # Allow override via environment variable
    if backend_type is None:
        backend_type = os.getenv('DIARIZATION_BACKEND')

    # Auto-detect if not specified
    if backend_type is None:
        if os.getenv('PLATFORM') == 'runpod':
            backend_type = 'nemo'
        else:
            backend_type = 'pyannote'

    # Import and instantiate the appropriate backend
    if backend_type == 'nemo':
        try:
            from services.diarization.diarization_nemo import NemoDiarization
            return NemoDiarization()
        except ImportError:
            logger.warning("NeMo not available, falling back to pyannote")
            backend_type = 'pyannote'

    # Default to pyannote
    from services.diarization.diarization_pyannote import PyAnnoteDiarization
    return PyAnnoteDiarization()
