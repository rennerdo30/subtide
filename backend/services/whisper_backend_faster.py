"""
Whisper Backend - Faster Whisper (CTranslate2)
Optimized for NVIDIA CUDA GPUs on RunPod.

This backend provides 4x faster transcription using CTranslate2
with INT8/FP16 quantization and batched inference.
"""

import os
import logging
from typing import List, Dict, Any, Optional, Callable

from services.whisper_backend_base import WhisperBackend, TranscriptionSegment

logger = logging.getLogger(__name__)


class FasterWhisperBackend(WhisperBackend):
    """
    Faster Whisper backend using CTranslate2 for CUDA acceleration.

    Features:
    - 4x faster than openai-whisper
    - INT8/FP16 quantization for lower memory
    - Built-in VAD filtering
    - Word-level timestamps
    """

    def __init__(self, model_size: str = None):
        """Initialize the faster-whisper backend."""
        self.model_size = model_size or os.getenv('WHISPER_MODEL', 'base')
        self.model = None
        self.device = None
        self.compute_type = None
        self._detect_device()

    def _detect_device(self):
        """Detect the best available device."""
        try:
            import torch
            if torch.cuda.is_available():
                self.device = "cuda"
                self.compute_type = "float16"  # FP16 for best speed/accuracy balance
                logger.info(f"FasterWhisper: Using CUDA with {self.compute_type}")
            else:
                self.device = "cpu"
                self.compute_type = "int8"  # INT8 for CPU efficiency
                logger.info("FasterWhisper: Using CPU with int8")
        except ImportError:
            self.device = "cpu"
            self.compute_type = "int8"
            logger.warning("FasterWhisper: torch not found, using CPU")

    def _load_model(self):
        """Lazy load the Whisper model."""
        if self.model is not None:
            return

        try:
            from faster_whisper import WhisperModel

            logger.info(f"Loading faster-whisper model: {self.model_size}")
            self.model = WhisperModel(
                self.model_size,
                device=self.device,
                compute_type=self.compute_type,
                download_root=os.getenv('WHISPER_CACHE_DIR', None),
            )
            logger.info(f"Faster-whisper model loaded on {self.device}")
        except ImportError as e:
            raise RuntimeError(
                "faster-whisper not installed. Install with: pip install faster-whisper"
            ) from e

    def transcribe(
        self,
        audio_path: str,
        model_size: str = None,
        language: Optional[str] = None,
        initial_prompt: Optional[str] = None,
        progress_callback: Optional[Callable[[str, str, int], None]] = None,
        segment_callback: Optional[Callable[[TranscriptionSegment], None]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Transcribe audio using faster-whisper.

        Returns:
            List of segments with 'start', 'end', 'text' keys
        """
        # Update model size if specified
        if model_size and model_size != self.model_size:
            self.model_size = model_size
            self.model = None  # Force reload

        self._load_model()

        if progress_callback:
            progress_callback('whisper', 'Starting transcription...', 10)

        # Configure transcription options
        transcribe_options = {
            'beam_size': 5,
            'word_timestamps': True,
            'vad_filter': True,
            'vad_parameters': {
                'min_silence_duration_ms': 500,
                'speech_pad_ms': 200,
            },
        }

        # Add language if specified
        if language:
            transcribe_options['language'] = language

        # Add initial prompt if specified
        if initial_prompt:
            transcribe_options['initial_prompt'] = initial_prompt

        # Get thresholds from environment
        no_speech_threshold = float(os.getenv('WHISPER_NO_SPEECH_THRESHOLD', '0.4'))
        compression_ratio_threshold = float(os.getenv('WHISPER_COMPRESSION_RATIO_THRESHOLD', '2.4'))
        logprob_threshold = float(os.getenv('WHISPER_LOGPROB_THRESHOLD', '-1.0'))

        transcribe_options['no_speech_threshold'] = no_speech_threshold
        transcribe_options['compression_ratio_threshold'] = compression_ratio_threshold
        transcribe_options['log_prob_threshold'] = logprob_threshold

        # Run transcription
        logger.info(f"Transcribing: {audio_path}")
        segments_generator, info = self.model.transcribe(audio_path, **transcribe_options)

        logger.info(f"Detected language: {info.language} (probability: {info.language_probability:.2f})")

        # Collect segments
        segments = []
        segment_count = 0

        for segment in segments_generator:
            segment_count += 1

            seg_dict = {
                'start': segment.start,
                'end': segment.end,
                'text': segment.text.strip(),
            }
            segments.append(seg_dict)

            # Call segment callback for streaming
            if segment_callback:
                segment_callback(TranscriptionSegment(
                    start=segment.start,
                    end=segment.end,
                    text=segment.text.strip(),
                ))

            # Update progress periodically
            if progress_callback and segment_count % 10 == 0:
                progress_callback(
                    'whisper',
                    f'Transcribed {segment_count} segments...',
                    min(30 + segment_count, 80)
                )

        if progress_callback:
            progress_callback('whisper', f'Transcription complete: {segment_count} segments', 90)

        logger.info(f"Transcription complete: {segment_count} segments")
        return segments

    def get_device(self) -> str:
        """Return the device being used."""
        return self.device or "cpu"

    def get_backend_name(self) -> str:
        """Return the backend name."""
        return "faster-whisper"

    def cleanup(self):
        """Clean up GPU memory."""
        if self.model is not None:
            del self.model
            self.model = None

            # Clear CUDA cache
            try:
                import torch
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                    logger.info("FasterWhisper: CUDA cache cleared")
            except ImportError:
                pass
