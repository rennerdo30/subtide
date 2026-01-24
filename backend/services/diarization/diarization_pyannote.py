"""
Diarization Backend - PyAnnote
Speaker diarization using pyannote.audio.

Supports:
- pyannote/speaker-diarization-community-1 (v4.0, recommended)
- pyannote/speaker-diarization-3.1 (v3.x fallback)

Works on macOS (MPS), Linux (CUDA), and CPU.
"""

import os
import logging
from typing import List, Optional, Callable

from services.diarization.diarization_base import DiarizationBackend, SpeakerSegment

logger = logging.getLogger('subtide')

# Model selection via environment variable
# Options: "community-1" (default, best), "3.1" (legacy)
DIARIZATION_MODEL = os.getenv('DIARIZATION_MODEL', 'community-1')

# Hyperparameters for tuning (can be set via environment)
# Segmentation threshold: higher = fewer, longer segments (default 0.5)
SEGMENTATION_THRESHOLD = float(os.getenv('DIARIZATION_SEGMENTATION_THRESHOLD', '0.5'))
# Clustering threshold: higher = fewer speakers detected (default 0.7)
CLUSTERING_THRESHOLD = float(os.getenv('DIARIZATION_CLUSTERING_THRESHOLD', '0.7'))
# Minimum segment duration in seconds (default 0.5)
MIN_SEGMENT_DURATION = float(os.getenv('DIARIZATION_MIN_SEGMENT', '0.5'))


class PyAnnoteDiarization(DiarizationBackend):
    """
    PyAnnote speaker diarization backend.

    Features:
    - High accuracy (DER ~0.11-0.14 depending on model)
    - Works on CPU, MPS (Apple Silicon), and CUDA
    - Supports overlapping speech detection
    - Speaker embedding clustering
    - Configurable hyperparameters for tuning

    Models:
    - community-1: Best accuracy, pyannote.audio 4.0+ (recommended)
    - 3.1: Stable legacy model, pyannote.audio 3.x
    """

    # Model configurations
    MODELS = {
        'community-1': {
            'name': 'pyannote/speaker-diarization-community-1',
            'version': '4.0',
            'description': 'Best open-source diarization model (2025)',
        },
        '3.1': {
            'name': 'pyannote/speaker-diarization-3.1',
            'version': '3.1',
            'description': 'Stable legacy model',
        },
    }

    def __init__(self, model: Optional[str] = None):
        """
        Initialize the PyAnnote diarization backend.

        Args:
            model: Model to use ('community-1' or '3.1'). Defaults to env var or 'community-1'.
        """
        self.pipeline = None
        self.device = None
        self.model_key = model or DIARIZATION_MODEL
        self._detect_device()

    def _detect_device(self):
        """Detect the best available device with Apple Silicon optimizations."""
        try:
            import torch

            if torch.cuda.is_available():
                self.device = "cuda"
                logger.info(f"PyAnnote: CUDA available, using GPU")
            elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
                # Apple Silicon MPS - enable with optimizations
                self.device = "mps"

                # MPS optimizations for stability
                # Set fallback for unsupported MPS operations
                os.environ.setdefault('PYTORCH_ENABLE_MPS_FALLBACK', '1')

                logger.info(f"PyAnnote: Apple Silicon MPS available, using Metal acceleration")
            else:
                self.device = "cpu"
                logger.info(f"PyAnnote: Using CPU")

        except ImportError:
            self.device = "cpu"
            logger.warning("PyAnnote: torch not found, using CPU")

    def _load_pipeline(self):
        """Lazy load the pyannote pipeline with model selection."""
        if self.pipeline is not None:
            return

        try:
            from pyannote.audio import Pipeline
            import torch

            # Get HuggingFace token
            hf_token = os.getenv('HF_TOKEN')
            if not hf_token:
                logger.warning("HF_TOKEN not set. Diarization requires authentication.")
                logger.warning("Get token at: https://huggingface.co/settings/tokens")
                logger.warning("Accept model terms at: https://huggingface.co/pyannote/speaker-diarization-community-1")

            # Select model
            model_config = self.MODELS.get(self.model_key, self.MODELS['community-1'])
            model_name = model_config['name']

            logger.info(f"Loading {model_name} ({model_config['description']})...")

            # Try loading the selected model
            try:
                # pyannote 4.0+ uses 'token' parameter
                self.pipeline = Pipeline.from_pretrained(
                    model_name,
                    token=hf_token,
                )
            except TypeError:
                # Fallback for pyannote 3.x which uses 'use_auth_token'
                logger.info("Falling back to pyannote 3.x API...")
                self.pipeline = Pipeline.from_pretrained(
                    model_name,
                    use_auth_token=hf_token,
                )
            except Exception as e:
                # If community-1 fails, try falling back to 3.1
                if self.model_key == 'community-1':
                    logger.warning(f"community-1 failed ({e}), falling back to 3.1...")
                    self.model_key = '3.1'
                    model_config = self.MODELS['3.1']
                    model_name = model_config['name']
                    try:
                        self.pipeline = Pipeline.from_pretrained(
                            model_name,
                            token=hf_token,
                        )
                    except TypeError:
                        self.pipeline = Pipeline.from_pretrained(
                            model_name,
                            use_auth_token=hf_token,
                        )
                else:
                    raise

            # Apply hyperparameter tuning if available
            self._apply_hyperparameters()

            # Move to device with Apple Silicon optimizations
            if self.device == "cuda":
                self.pipeline = self.pipeline.to(torch.device("cuda"))
                logger.info(f"PyAnnote pipeline on CUDA GPU")
            elif self.device == "mps":
                try:
                    # For MPS, we need to be careful with memory
                    # Use float32 for better MPS compatibility
                    self.pipeline = self.pipeline.to(torch.device("mps"))
                    logger.info(f"PyAnnote pipeline on Apple Silicon MPS")
                except Exception as e:
                    logger.warning(f"MPS failed for pyannote ({e}), falling back to CPU")
                    logger.warning("Tip: Try setting PYTORCH_ENABLE_MPS_FALLBACK=1")
                    self.device = "cpu"
            else:
                logger.info(f"PyAnnote pipeline on CPU")

            logger.info(f"PyAnnote {model_config['version']} loaded successfully")

        except ImportError as e:
            raise RuntimeError(
                "pyannote.audio not installed. Install with: pip install pyannote.audio>=3.1"
            ) from e

    def _apply_hyperparameters(self):
        """Apply hyperparameter tuning to the pipeline."""
        if self.pipeline is None:
            return

        try:
            # Access pipeline parameters for tuning
            # These may vary by model version
            params = self.pipeline.parameters(instantiated=True)

            # Log available parameters for debugging
            logger.debug(f"Pipeline parameters: {list(params.keys()) if hasattr(params, 'keys') else 'N/A'}")

            # Apply custom thresholds if the pipeline supports them
            # community-1 and 3.1 have different parameter structures
            if hasattr(self.pipeline, 'segmentation'):
                if hasattr(self.pipeline.segmentation, 'threshold'):
                    self.pipeline.segmentation.threshold = SEGMENTATION_THRESHOLD
                    logger.info(f"Set segmentation threshold: {SEGMENTATION_THRESHOLD}")

            if hasattr(self.pipeline, 'clustering'):
                if hasattr(self.pipeline.clustering, 'threshold'):
                    self.pipeline.clustering.threshold = CLUSTERING_THRESHOLD
                    logger.info(f"Set clustering threshold: {CLUSTERING_THRESHOLD}")

        except Exception as e:
            logger.debug(f"Could not apply hyperparameters: {e}")

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

        Args:
            audio_path: Path to audio file
            num_speakers: Exact number of speakers (if known)
            min_speakers: Minimum expected speakers
            max_speakers: Maximum expected speakers
            progress_callback: Optional callback for progress updates

        Returns:
            List of SpeakerSegment objects with speaker labels and timestamps
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

        logger.info(f"PyAnnote: Diarizing {audio_path}")
        if params:
            logger.info(f"PyAnnote: Speaker constraints: {params}")

        if progress_callback:
            progress_callback('diarization', 'Analyzing speakers...', 30)

        # Run diarization
        try:
            diarization = self.pipeline(audio_path, **params)
        except Exception as e:
            logger.error(f"Diarization failed: {e}")
            # Return empty list on failure rather than crashing
            return []

        if progress_callback:
            progress_callback('diarization', 'Processing speaker segments...', 70)

        # Convert to SpeakerSegment list
        segments = []
        for turn, _, speaker in diarization.itertracks(yield_label=True):
            # Filter out very short segments (noise)
            duration = turn.end - turn.start
            if duration >= MIN_SEGMENT_DURATION:
                segments.append(SpeakerSegment(
                    start=turn.start,
                    end=turn.end,
                    speaker=speaker,
                ))

        # Sort by start time
        segments.sort(key=lambda s: s.start)

        # Merge adjacent segments from same speaker (reduces fragmentation)
        segments = self._merge_adjacent_segments(segments)

        num_speakers_found = len(set(s.speaker for s in segments))

        if progress_callback:
            progress_callback('diarization', f'Found {num_speakers_found} speakers', 90)

        logger.info(f"PyAnnote: Diarization complete - {len(segments)} segments, "
                   f"{num_speakers_found} speakers detected")

        return segments

    def _merge_adjacent_segments(
        self,
        segments: List[SpeakerSegment],
        max_gap: float = 0.5
    ) -> List[SpeakerSegment]:
        """
        Merge adjacent segments from the same speaker.

        Args:
            segments: List of speaker segments
            max_gap: Maximum gap (seconds) to merge across

        Returns:
            Merged segment list
        """
        if not segments:
            return segments

        merged = []
        current = segments[0]

        for next_seg in segments[1:]:
            # Check if same speaker and close enough to merge
            gap = next_seg.start - current.end
            if next_seg.speaker == current.speaker and gap <= max_gap:
                # Extend current segment
                current = SpeakerSegment(
                    start=current.start,
                    end=next_seg.end,
                    speaker=current.speaker,
                )
            else:
                merged.append(current)
                current = next_seg

        merged.append(current)
        return merged

    def get_device(self) -> str:
        """Return the device being used."""
        return self.device or "cpu"

    def get_backend_name(self) -> str:
        """Return the backend name with model info."""
        model_config = self.MODELS.get(self.model_key, {})
        return f"pyannote-{self.model_key}"

    def get_model_info(self) -> dict:
        """Return detailed model information."""
        model_config = self.MODELS.get(self.model_key, self.MODELS['community-1'])
        return {
            'backend': 'pyannote',
            'model': self.model_key,
            'model_name': model_config['name'],
            'version': model_config['version'],
            'device': self.device,
            'hyperparameters': {
                'segmentation_threshold': SEGMENTATION_THRESHOLD,
                'clustering_threshold': CLUSTERING_THRESHOLD,
                'min_segment_duration': MIN_SEGMENT_DURATION,
            }
        }

    def cleanup(self):
        """Clean up GPU memory."""
        if self.pipeline is not None:
            del self.pipeline
            self.pipeline = None

            try:
                import torch
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
                    # MPS memory cleanup
                    torch.mps.empty_cache()
            except (ImportError, AttributeError):
                pass

            logger.info("PyAnnote pipeline cleaned up")
