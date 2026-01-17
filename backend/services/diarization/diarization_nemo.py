"""
Diarization Backend - NVIDIA NeMo
Fast speaker diarization using NeMo Sortformer.

Optimized for NVIDIA GPUs (80-100x faster than PyAnnote).
Only available on RunPod and other CUDA-enabled systems.
"""

import os
import logging
import tempfile
from typing import List, Optional, Callable

from services.diarization.diarization_base import DiarizationBackend, SpeakerSegment

logger = logging.getLogger('subtide')


class NemoDiarization(DiarizationBackend):
    """
    NVIDIA NeMo speaker diarization backend.

    Features:
    - 80-100x faster than PyAnnote on NVIDIA GPUs
    - Native CUDA implementation
    - RTF: 214x real-time (1 hour audio in ~17 seconds)
    - Supports up to 4 simultaneous speakers optimally
    """

    def __init__(self):
        """Initialize the NeMo diarization backend."""
        self.model = None
        self.device = None
        self._detect_device()

    def _detect_device(self):
        """Detect GPU availability."""
        try:
            import torch
            if torch.cuda.is_available():
                self.device = "cuda"
                logger.info("NeMo: CUDA available, using GPU acceleration")
            else:
                self.device = "cpu"
                logger.warning("NeMo: CUDA not available, performance will be degraded")
        except ImportError:
            self.device = "cpu"
            logger.warning("NeMo: torch not found")

    def _load_model(self):
        """Lazy load the NeMo diarization model."""
        if self.model is not None:
            return

        try:
            import nemo.collections.asr as nemo_asr
            import torch

            logger.info("Loading NeMo Sortformer diarization model...")

            # Try to load the Sortformer model for fast diarization
            try:
                self.model = nemo_asr.models.SortformerEncLabelModel.from_pretrained(
                    "nvidia/sortformer_diar_v2"
                )
                logger.info("Loaded Sortformer v2 model")
            except Exception as e:
                logger.warning(f"Sortformer v2 not available: {e}")
                # Fallback to clustering-based model
                self.model = nemo_asr.models.ClusteringDiarizer.from_pretrained(
                    "nvidia/speakerverification_speakernet"
                )
                logger.info("Loaded clustering-based diarization model")

            # Move to GPU
            if self.device == "cuda":
                self.model = self.model.to(torch.device("cuda"))

            logger.info(f"NeMo model loaded on {self.device}")

        except ImportError as e:
            raise RuntimeError(
                "nemo_toolkit not installed. Install with: pip install nemo_toolkit[asr]"
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
        Perform speaker diarization using NeMo.

        Returns:
            List of SpeakerSegment objects
        """
        self._load_model()

        if progress_callback:
            progress_callback('diarization', 'Starting NeMo diarization...', 10)

        logger.info(f"NeMo: Diarizing {audio_path}")

        try:
            import torch

            # Use FP16 for faster inference on GPU
            with torch.cuda.amp.autocast(enabled=self.device == "cuda"):
                if progress_callback:
                    progress_callback('diarization', 'Running neural speaker detection...', 30)

                # Create manifest file for NeMo
                manifest_path = self._create_manifest(audio_path)

                # Run diarization
                if hasattr(self.model, 'diarize'):
                    # Sortformer model
                    result = self.model.diarize(
                        [audio_path],
                        batch_size=1,
                        num_workers=0,
                    )
                else:
                    # Clustering-based model
                    result = self._run_clustering_diarization(audio_path, manifest_path)

                if progress_callback:
                    progress_callback('diarization', 'Processing speaker segments...', 70)

                # Parse RTTM output
                segments = self._parse_nemo_result(result, audio_path)

        except Exception as e:
            logger.error(f"NeMo diarization failed: {e}")
            # Return empty segments on failure
            segments = []

        if progress_callback:
            unique_speakers = len(set(s.speaker for s in segments)) if segments else 0
            progress_callback('diarization', f'Found {unique_speakers} speakers', 90)

        logger.info(f"NeMo: Diarization complete, {len(segments)} segments")
        return segments

    def _create_manifest(self, audio_path: str) -> str:
        """Create a NeMo manifest file for the audio."""
        import json

        manifest_path = tempfile.mktemp(suffix='.json')
        with open(manifest_path, 'w') as f:
            json.dump({
                'audio_filepath': audio_path,
                'duration': self._get_audio_duration(audio_path),
                'text': '-',
            }, f)
            f.write('\n')

        return manifest_path

    def _get_audio_duration(self, audio_path: str) -> float:
        """Get audio duration in seconds."""
        try:
            import torchaudio
            info = torchaudio.info(audio_path)
            return info.num_frames / info.sample_rate
        except Exception:
            # Fallback: assume 1 hour max
            return 3600.0

    def _run_clustering_diarization(self, audio_path: str, manifest_path: str):
        """Run clustering-based diarization."""
        # This is a simplified implementation
        # Full implementation would use NeMo's clustering pipeline
        return None

    def _parse_nemo_result(self, result, audio_path: str) -> List[SpeakerSegment]:
        """Parse NeMo diarization result to SpeakerSegment list."""
        segments = []

        if result is None:
            return segments

        # NeMo returns different formats depending on the model
        # Handle the common RTTM-like format
        try:
            if isinstance(result, dict) and audio_path in result:
                rttm_data = result[audio_path]
                for entry in rttm_data:
                    if len(entry) >= 4:
                        start = float(entry[0])
                        duration = float(entry[1])
                        speaker = str(entry[2]) if len(entry) > 2 else "SPEAKER_00"
                        segments.append(SpeakerSegment(
                            start=start,
                            end=start + duration,
                            speaker=speaker,
                        ))
            elif isinstance(result, list):
                for item in result:
                    if hasattr(item, 'start') and hasattr(item, 'end'):
                        segments.append(SpeakerSegment(
                            start=item.start,
                            end=item.end,
                            speaker=getattr(item, 'speaker', 'SPEAKER_00'),
                        ))
        except Exception as e:
            logger.warning(f"Error parsing NeMo result: {e}")

        # Sort by start time
        segments.sort(key=lambda s: s.start)

        return segments

    def get_device(self) -> str:
        """Return the device being used."""
        return self.device or "cpu"

    def get_backend_name(self) -> str:
        """Return the backend name."""
        return "nemo"

    def cleanup(self):
        """Clean up GPU memory."""
        if self.model is not None:
            del self.model
            self.model = None

            try:
                import torch
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                    logger.info("NeMo: CUDA cache cleared")
            except ImportError:
                pass
