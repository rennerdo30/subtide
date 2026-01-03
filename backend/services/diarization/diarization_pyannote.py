"""
Diarization Backend - PyAnnote
Speaker diarization using pyannote.audio.

Works on macOS (MPS), Linux (CUDA), and CPU.
"""

import os
import logging
from typing import List, Optional, Callable

from services.diarization.diarization_base import DiarizationBackend, SpeakerSegment

logger = logging.getLogger(__name__)


class PyAnnoteDiarization(DiarizationBackend):
    """
    PyAnnote speaker diarization backend.

    Features:
    - High accuracy (DER ~0.14)
    - Works on CPU, MPS, and CUDA
    - Supports overlapping speech detection
    - Speaker embedding clustering
    """

    def __init__(self):
        """Initialize the PyAnnote diarization backend."""
        self.pipeline = None
        self.device = None
        self._detect_device()

    def _detect_device(self):
        """Detect the best available device."""
        try:
            import torch
            if torch.cuda.is_available():
                self.device = "cuda"
            elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
                # MPS can be unstable for pyannote, but we'll try it
                self.device = "mps"
            else:
                self.device = "cpu"
            logger.info(f"PyAnnote: Using device {self.device}")
        except ImportError:
            self.device = "cpu"
            logger.warning("PyAnnote: torch not found, using CPU")

    def _load_pipeline(self):
        """Lazy load the pyannote pipeline."""
        if self.pipeline is not None:
            return

        try:
            from pyannote.audio import Pipeline
            import torch

            # Get HuggingFace token
            hf_token = os.getenv('HF_TOKEN')
            if not hf_token:
                logger.warning("HF_TOKEN not set. Diarization may fail without authentication.")

            logger.info("Loading pyannote speaker-diarization-3.1 pipeline...")
            self.pipeline = Pipeline.from_pretrained(
                "pyannote/speaker-diarization-3.1",
                use_auth_token=hf_token,
            )

            # Move to device
            if self.device == "cuda":
                self.pipeline = self.pipeline.to(torch.device("cuda"))
            elif self.device == "mps":
                try:
                    self.pipeline = self.pipeline.to(torch.device("mps"))
                except Exception as e:
                    logger.warning(f"MPS failed for pyannote, falling back to CPU: {e}")
                    self.device = "cpu"

            logger.info(f"PyAnnote pipeline loaded on {self.device}")

        except ImportError as e:
            raise RuntimeError(
                "pyannote.audio not installed. Install with: pip install pyannote.audio"
            ) from e

    def diarize(
        self,
        audio_path: str,
        num_speakers: Optional[int] = None,
        min_speakers: Optional[int] = None,
        max_speakers: Optional[int] = None,
        progress_callback: Optional[Callable[[str, str, int], None]] = None,
    ) -> List[SpeakerSegment]:
        """
        Perform speaker diarization using PyAnnote.

        Returns:
            List of SpeakerSegment objects
        """
        self._load_pipeline()

        if progress_callback:
            progress_callback('diarization', 'Starting speaker diarization...', 10)

        # Build diarization parameters
        params = {}
        if num_speakers is not None:
            params['num_speakers'] = num_speakers
        if min_speakers is not None:
            params['min_speakers'] = min_speakers
        if max_speakers is not None:
            params['max_speakers'] = max_speakers

        logger.info(f"PyAnnote: Diarizing {audio_path} with params {params}")

        if progress_callback:
            progress_callback('diarization', 'Analyzing speakers...', 30)

        # Run diarization
        diarization = self.pipeline(audio_path, **params)

        if progress_callback:
            progress_callback('diarization', 'Processing speaker segments...', 70)

        # Convert to SpeakerSegment list
        segments = []
        for turn, _, speaker in diarization.itertracks(yield_label=True):
            segments.append(SpeakerSegment(
                start=turn.start,
                end=turn.end,
                speaker=speaker,
            ))

        # Sort by start time
        segments.sort(key=lambda s: s.start)

        if progress_callback:
            progress_callback('diarization', f'Found {len(set(s.speaker for s in segments))} speakers', 90)

        logger.info(f"PyAnnote: Diarization complete, {len(segments)} segments, "
                   f"{len(set(s.speaker for s in segments))} speakers")

        return segments

    def get_device(self) -> str:
        """Return the device being used."""
        return self.device or "cpu"

    def get_backend_name(self) -> str:
        """Return the backend name."""
        return "pyannote"

    def cleanup(self):
        """Clean up GPU memory."""
        if self.pipeline is not None:
            del self.pipeline
            self.pipeline = None

            try:
                import torch
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            except ImportError:
                pass
