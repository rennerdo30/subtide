"""
Whisper Backend - Abstract Base Class
Defines the interface for all Whisper transcription backends.
"""

from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional, Callable
from dataclasses import dataclass


@dataclass
class TranscriptionSegment:
    """A single transcription segment."""
    start: float  # Start time in seconds
    end: float    # End time in seconds
    text: str     # Transcribed text
    speaker: Optional[str] = None  # Speaker ID if diarization enabled


class WhisperBackend(ABC):
    """Abstract base class for Whisper transcription backends."""

    @abstractmethod
    def transcribe(
        self,
        audio_path: str,
        model_size: str = "base",
        language: Optional[str] = None,
        initial_prompt: Optional[str] = None,
        progress_callback: Optional[Callable[[str, str, int], None]] = None,
        segment_callback: Optional[Callable[[TranscriptionSegment], None]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Transcribe audio and return segments.

        Args:
            audio_path: Path to the audio file
            model_size: Whisper model size (tiny, base, small, medium, large)
            language: Force a specific source language (None for auto-detect)
            initial_prompt: Optional context prompt for better transcription
            progress_callback: Called with (stage, message, percent) during processing
            segment_callback: Called with each segment as it's transcribed (for streaming)

        Returns:
            List of segment dictionaries with 'start', 'end', 'text' keys
        """
        pass

    @abstractmethod
    def get_device(self) -> str:
        """
        Return the device being used for inference.

        Returns:
            Device string: 'cuda', 'mps', 'metal', or 'cpu'
        """
        pass

    @abstractmethod
    def get_backend_name(self) -> str:
        """
        Return the backend name for logging.

        Returns:
            Backend name string: 'mlx-whisper', 'faster-whisper', 'openai-whisper'
        """
        pass

    def cleanup(self):
        """
        Clean up resources (e.g., GPU memory).
        Override in subclasses if needed.
        """
        pass


def get_whisper_backend(backend_type: Optional[str] = None) -> WhisperBackend:
    """
    Factory function to get the appropriate Whisper backend.

    Args:
        backend_type: Force a specific backend ('mlx', 'faster', 'openai')
                     If None, auto-detects based on platform

    Returns:
        WhisperBackend instance
    """
    import os
    import platform

    # Allow override via environment variable
    if backend_type is None:
        backend_type = os.getenv('WHISPER_BACKEND')

    # Auto-detect if not specified
    if backend_type is None:
        if os.getenv('PLATFORM') == 'runpod':
            backend_type = 'faster'
        elif platform.system() == 'Darwin' and platform.machine() == 'arm64':
            backend_type = 'mlx'
        else:
            backend_type = 'openai'

    # Import and instantiate the appropriate backend
    if backend_type in ('faster', 'faster-whisper'):
        from services.whisper_backend_faster import FasterWhisperBackend
        return FasterWhisperBackend()
    elif backend_type in ('mlx', 'mlx-whisper'):
        from services.whisper_backend_mlx import MLXWhisperBackend
        return MLXWhisperBackend()
    else:
        from services.whisper_backend_openai import OpenAIWhisperBackend
        return OpenAIWhisperBackend()
