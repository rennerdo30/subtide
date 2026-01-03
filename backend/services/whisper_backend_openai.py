"""
Whisper Backend - OpenAI Whisper
Standard implementation using openai-whisper package.

This is the fallback backend for non-Apple, non-CUDA systems.
"""

import os
import logging
from typing import List, Dict, Any, Optional, Callable

from services.whisper_backend_base import WhisperBackend, TranscriptionSegment

logger = logging.getLogger(__name__)


class OpenAIWhisperBackend(WhisperBackend):
    """
    OpenAI Whisper backend (standard implementation).

    Features:
    - Works on any platform (CPU, CUDA, MPS)
    - Official Whisper implementation
    - Reliable and well-tested
    """

    def __init__(self, model_size: str = None):
        """Initialize the OpenAI Whisper backend."""
        self.model_size = model_size or os.getenv('WHISPER_MODEL', 'base')
        self.model = None
        self.device = None
        self._detect_device()

    def _detect_device(self):
        """Detect the best available device."""
        try:
            import torch
            if torch.cuda.is_available():
                self.device = "cuda"
            elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
                self.device = "mps"
            else:
                self.device = "cpu"
            logger.info(f"OpenAI Whisper: Using device {self.device}")
        except ImportError:
            self.device = "cpu"
            logger.warning("OpenAI Whisper: torch not found, using CPU")

    def _load_model(self):
        """Lazy load the Whisper model."""
        if self.model is not None:
            return

        try:
            import whisper

            logger.info(f"Loading OpenAI Whisper model: {self.model_size}")
            self.model = whisper.load_model(self.model_size, device=self.device)
            logger.info(f"OpenAI Whisper model loaded on {self.device}")
        except ImportError as e:
            raise RuntimeError(
                "openai-whisper not installed. Install with: pip install openai-whisper"
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
        Transcribe audio using OpenAI Whisper.

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

        # Build transcription options
        transcribe_options = {
            'verbose': False,
            'fp16': self.device == 'cuda',  # Use FP16 on CUDA
        }

        if language:
            transcribe_options['language'] = language

        if initial_prompt:
            transcribe_options['initial_prompt'] = initial_prompt

        # Get thresholds from environment
        no_speech_threshold = float(os.getenv('WHISPER_NO_SPEECH_THRESHOLD', '0.4'))
        compression_ratio_threshold = float(os.getenv('WHISPER_COMPRESSION_RATIO_THRESHOLD', '2.4'))
        logprob_threshold = float(os.getenv('WHISPER_LOGPROB_THRESHOLD', '-1.0'))

        transcribe_options['no_speech_threshold'] = no_speech_threshold
        transcribe_options['compression_ratio_threshold'] = compression_ratio_threshold
        transcribe_options['logprob_threshold'] = logprob_threshold

        # Run transcription
        logger.info(f"OpenAI Whisper: Transcribing {audio_path}")
        result = self.model.transcribe(audio_path, **transcribe_options)

        # Convert result to our format
        segments = []
        if 'segments' in result:
            for i, seg in enumerate(result['segments']):
                seg_dict = {
                    'start': seg.get('start', 0),
                    'end': seg.get('end', 0),
                    'text': seg.get('text', '').strip(),
                }
                segments.append(seg_dict)

                # Call segment callback
                if segment_callback:
                    segment_callback(TranscriptionSegment(
                        start=seg_dict['start'],
                        end=seg_dict['end'],
                        text=seg_dict['text'],
                    ))

                # Update progress
                if progress_callback and i % 10 == 0:
                    progress_callback('whisper', f'Processed {i} segments...', min(30 + i, 80))

        if progress_callback:
            progress_callback('whisper', f'Transcription complete: {len(segments)} segments', 90)

        logger.info(f"OpenAI Whisper: Transcription complete, {len(segments)} segments")
        return segments

    def get_device(self) -> str:
        """Return the device being used."""
        return self.device or "cpu"

    def get_backend_name(self) -> str:
        """Return the backend name."""
        return "openai-whisper"

    def cleanup(self):
        """Clean up GPU memory."""
        if self.model is not None:
            del self.model
            self.model = None

            try:
                import torch
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
                    # MPS doesn't have explicit cache clearing
                    pass
            except ImportError:
                pass
