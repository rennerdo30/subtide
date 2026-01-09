"""
Audio Normalization for Whisper

Normalizes audio levels to improve transcription of quiet voices.
Uses ffmpeg for processing.
"""

import os
import subprocess
import logging
from typing import Optional

logger = logging.getLogger('video-translate')


def normalize_audio(
    input_path: str,
    output_path: Optional[str] = None,
    target_level: float = -16.0,
    method: str = 'loudnorm'
) -> str:
    """
    Normalize audio to consistent levels for better Whisper transcription.
    
    Args:
        input_path: Path to input audio file
        output_path: Path for normalized output (auto-generated if None)
        target_level: Target loudness in LUFS (default -16, broadcast standard)
        method: Normalization method ('loudnorm' or 'dynaudnorm')
                - loudnorm: EBU R128 loudness normalization (recommended)
                - dynaudnorm: Dynamic audio normalization (more aggressive)
    
    Returns:
        Path to normalized audio file
    """
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input audio not found: {input_path}")
    
    # Generate output path if not provided
    if output_path is None:
        base, ext = os.path.splitext(input_path)
        output_path = f"{base}_normalized{ext}"
    
    # Skip if already normalized
    if os.path.exists(output_path):
        logger.info(f"[AUDIO] Using existing normalized audio: {output_path}")
        return output_path
    
    logger.info(f"[AUDIO] Normalizing audio ({method}, target={target_level} LUFS)...")
    try:
        size_mb = os.path.getsize(input_path) / (1024 * 1024)
        logger.info(f"[AUDIO] Input file: {os.path.basename(input_path)} ({size_mb:.2f} MB)")
    except Exception:
        pass
    
    try:
        if method == 'loudnorm':
            # EBU R128 loudness normalization - professional broadcast standard
            # Two-pass for accurate normalization
            filter_str = f"loudnorm=I={target_level}:TP=-1.5:LRA=11:print_format=summary"
        elif method == 'dynaudnorm':
            # Dynamic normalization - more aggressive, good for variable volumes
            filter_str = "dynaudnorm=f=150:g=15:p=0.95:m=10"
        else:
            filter_str = f"loudnorm=I={target_level}"
        
        cmd = [
            'ffmpeg',
            '-i', input_path,
            '-af', filter_str,
            '-ar', '16000',  # Whisper expects 16kHz
            '-ac', '1',       # Mono
            '-y',
            output_path
        ]
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300  # 5 minute timeout
        )
        
        if result.returncode != 0:
            logger.warning(f"[AUDIO] ffmpeg normalization failed: {result.stderr[:500]}")
            return input_path  # Fall back to original
        
        if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
            logger.info(f"[AUDIO] Normalized audio saved: {output_path}")
            return output_path
        else:
            logger.warning("[AUDIO] Normalized file not created, using original")
            return input_path
            
    except subprocess.TimeoutExpired:
        logger.error("[AUDIO] Normalization timed out")
        return input_path
    except Exception as e:
        logger.error(f"[AUDIO] Normalization failed: {e}")
        return input_path


def get_audio_stats(audio_path: str) -> dict:
    """
    Get audio statistics (loudness, peak, etc.) using ffmpeg.
    
    Returns:
        Dict with audio stats or empty dict on failure
    """
    try:
        cmd = [
            'ffmpeg',
            '-i', audio_path,
            '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json',
            '-f', 'null',
            '-'
        ]
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60
        )
        
        # Parse loudnorm JSON output from stderr
        import json
        import re
        
        # Find JSON block in output
        match = re.search(r'\{[^}]+\}', result.stderr, re.DOTALL)
        if match:
            stats = json.loads(match.group())
            return stats
        
        return {}
        
    except Exception as e:
        logger.debug(f"[AUDIO] Could not get audio stats: {e}")
        return {}


def should_normalize(audio_path: str, threshold_lufs: float = -25.0) -> bool:
    """
    Check if audio needs normalization based on loudness.
    
    Args:
        audio_path: Path to audio file
        threshold_lufs: If input loudness is quieter than this, normalize
    
    Returns:
        True if normalization is recommended
    """
    stats = get_audio_stats(audio_path)
    
    if not stats:
        # Can't determine, normalize to be safe
        return True
    
    input_i = stats.get('input_i', '-99')
    try:
        loudness = float(input_i)
        if loudness < threshold_lufs:
            logger.info(f"[AUDIO] Input loudness {loudness:.1f} LUFS < {threshold_lufs}, will normalize")
            return True
        else:
            logger.info(f"[AUDIO] Input loudness {loudness:.1f} LUFS is acceptable")
            return False
    except (ValueError, TypeError):
        return True
