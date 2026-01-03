"""
Speaker Diarization Module

Provides platform-specific speaker diarization backends:
- PyAnnote: For macOS and general use
- NeMo: For NVIDIA GPUs (RunPod)
"""

from services.diarization.diarization_base import (
    DiarizationBackend,
    SpeakerSegment,
    get_diarization_backend,
)

__all__ = [
    'DiarizationBackend',
    'SpeakerSegment',
    'get_diarization_backend',
]
