"""
Whisper Backend - MLX Whisper
Optimized for Apple Silicon (M1/M2/M3) with Metal GPU acceleration.

This backend uses MLX for native Apple Silicon performance.
"""

import os
import logging
import platform
from typing import List, Dict, Any, Optional, Callable

from services.whisper_backend_base import WhisperBackend, TranscriptionSegment

logger = logging.getLogger('subtide')


class MLXWhisperBackend(WhisperBackend):
    """
    MLX Whisper backend for Apple Silicon Macs.

    Features:
    - Native Metal GPU acceleration
    - Optimized for M1/M2/M3 chips
    - Low memory footprint with unified memory
    """

    def __init__(self, model_size: str = None):
        """Initialize the MLX Whisper backend."""
        if platform.system() != 'Darwin' or platform.machine() != 'arm64':
            raise RuntimeError("MLXWhisperBackend requires Apple Silicon Mac")

        self.model_size = model_size or os.getenv('WHISPER_MODEL', 'base')
        self.device = 'metal'

    def _get_model_path(self) -> str:
        """Get the MLX model path from HuggingFace."""
        # Map model sizes to HuggingFace repos
        model_map = {
            'tiny': 'mlx-community/whisper-tiny-mlx',
            'base': 'mlx-community/whisper-base-mlx',
            'small': 'mlx-community/whisper-small-mlx',
            'medium': 'mlx-community/whisper-medium-mlx',
            'large': 'mlx-community/whisper-large-v3-mlx',
            'large-v3': 'mlx-community/whisper-large-v3-mlx',
        }

        # Allow custom HF repo override
        custom_repo = os.getenv('WHISPER_HF_REPO')
        if custom_repo:
            return custom_repo

        return model_map.get(self.model_size, model_map['base'])

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
        Transcribe audio using MLX Whisper.

        Returns:
            List of segments with 'start', 'end', 'text' keys
        """
        try:
            import mlx_whisper
        except ImportError as e:
            raise RuntimeError(
                "mlx-whisper not installed. Install with: pip install mlx-whisper"
            ) from e

        if model_size:
            self.model_size = model_size

        model_path = self._get_model_path()

        if progress_callback:
            progress_callback('whisper', f'Loading model {self.model_size}...', 10)

        # Get thresholds from environment
        no_speech_threshold = float(os.getenv('WHISPER_NO_SPEECH_THRESHOLD', '0.4'))
        compression_ratio_threshold = float(os.getenv('WHISPER_COMPRESSION_RATIO_THRESHOLD', '2.4'))
        logprob_threshold = float(os.getenv('WHISPER_LOGPROB_THRESHOLD', '-1.0'))
        beam_size = int(os.getenv('WHISPER_BEAM_SIZE', '5'))

        # Build transcribe options
        transcribe_options = {
            'path_or_hf_repo': model_path,
            'no_speech_threshold': no_speech_threshold,
            'compression_ratio_threshold': compression_ratio_threshold,
            'logprob_threshold': logprob_threshold,
            'verbose': False,  # We handle our own progress
        }

        # Add decode options with beam_size
        transcribe_options['decode_options'] = {
            'beam_size': beam_size,
            'temperature': 0,  # Required for beam search
        }

        if language:
            transcribe_options['language'] = language

        if initial_prompt:
            transcribe_options['initial_prompt'] = initial_prompt

        if progress_callback:
            progress_callback('whisper', 'Transcribing with MLX...', 20)

        # Run transcription
        logger.info(f"MLX Whisper: Transcribing {audio_path} with model {model_path} (beam_size={beam_size})")
        result = mlx_whisper.transcribe(audio_path, **transcribe_options)

        # Convert MLX result to our format
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

        logger.info(f"MLX Whisper: Transcription complete, {len(segments)} segments")
        return segments

    def get_device(self) -> str:
        """Return the device being used."""
        return self.device

    def get_backend_name(self) -> str:
        """Return the backend name."""
        return "mlx-whisper"

    def cleanup(self):
        """MLX handles memory automatically."""
        pass
