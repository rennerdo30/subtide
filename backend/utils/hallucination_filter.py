"""
Hallucination Filter for Whisper Transcription

Detects and filters out likely hallucinated segments from Whisper output.
Common hallucination patterns include:
- Repetitive text (same phrase 3+ times)
- Impossible speech rates (too many chars in short time)
- Common hallucination phrases ("Thank you for watching", etc.)
- Very high compression ratios
"""

import re
import logging
from typing import List, Dict, Any, Tuple

logger = logging.getLogger('video-translate')

# Common hallucination phrases (case-insensitive)
HALLUCINATION_PHRASES = [
    r"thank you for watching",
    r"please subscribe",
    r"like and subscribe", 
    r"don't forget to subscribe",
    r"hit the bell",
    r"see you next time",
    r"bye bye",
    r"thanks for watching",
    r"please like",
    r"♪+",  # Music notes repeated
    r"\.{4,}",  # Many dots
    r"\?{3,}",  # Many question marks
    r"!{3,}",  # Many exclamation marks
]

# Compile patterns for efficiency
HALLUCINATION_PATTERNS = [re.compile(p, re.IGNORECASE) for p in HALLUCINATION_PHRASES]


def is_repetitive(text: str, threshold: int = 3) -> bool:
    """
    Check if text contains the same phrase repeated multiple times.
    
    Args:
        text: The text to check
        threshold: Number of repetitions to consider as hallucination
    
    Returns:
        True if text appears to be repetitive hallucination
    """
    # Split into words and look for repeated patterns
    words = text.split()
    if len(words) < threshold * 2:
        return False
    
    # Check for repeated word sequences
    for pattern_len in range(1, min(10, len(words) // threshold)):
        pattern = tuple(words[:pattern_len])
        count = 0
        for i in range(0, len(words) - pattern_len + 1, pattern_len):
            if tuple(words[i:i + pattern_len]) == pattern:
                count += 1
            else:
                break
        if count >= threshold:
            return True
    
    return False


def has_impossible_speech_rate(segment: Dict[str, Any], max_chars_per_sec: float = 25.0) -> bool:
    """
    Check if segment has an impossible speech rate.
    Average speech is ~4-5 words/sec or ~15-20 chars/sec.
    
    Args:
        segment: Segment dict with 'start', 'end', 'text'
        max_chars_per_sec: Maximum reasonable characters per second
    
    Returns:
        True if speech rate is impossibly high
    """
    duration = segment.get('end', 0) - segment.get('start', 0)
    text = segment.get('text', '')
    
    if duration <= 0.1:  # Very short segment
        return len(text) > 10
    
    chars_per_sec = len(text) / duration
    return chars_per_sec > max_chars_per_sec


def matches_hallucination_pattern(text: str) -> Tuple[bool, str]:
    """
    Check if text matches known hallucination patterns.
    
    Returns:
        Tuple of (is_hallucination, matched_pattern_description)
    """
    for pattern in HALLUCINATION_PATTERNS:
        if pattern.search(text):
            return True, pattern.pattern
    return False, ""


def is_mostly_punctuation(text: str, threshold: float = 0.5) -> bool:
    """Check if text is mostly punctuation/symbols."""
    if not text:
        return True
    
    punctuation_count = sum(1 for c in text if not c.isalnum() and not c.isspace())
    return punctuation_count / len(text) > threshold


def filter_hallucinations(
    segments: List[Dict[str, Any]],
    min_duration: float = 0.3,
    max_chars_per_sec: float = 25.0,
    log_filtered: bool = True
) -> List[Dict[str, Any]]:
    """
    Filter out likely hallucinated segments from Whisper output.
    
    Args:
        segments: List of segment dicts with 'start', 'end', 'text'
        min_duration: Minimum segment duration in seconds
        max_chars_per_sec: Maximum reasonable speech rate
        log_filtered: Whether to log filtered segments
    
    Returns:
        Filtered list of segments
    """
    if not segments:
        return segments
    
    filtered = []
    removed_count = 0
    
    # Track seen texts for duplicate detection (last N texts)
    recent_texts = []
    MAX_LOOKBACK = 5  # Check against last 5 segments
    
    for i, segment in enumerate(segments):
        text = segment.get('text', '').strip()
        text_lower = text.lower()
        duration = segment.get('end', 0) - segment.get('start', 0)
        
        remove_reason = None
        
        # Check 1: Empty or whitespace only
        if not text:
            remove_reason = "empty"
        
        # Check 2: Zero duration (start == end) - clear hallucination
        elif duration <= 0:
            remove_reason = f"zero_duration"
        
        # Check 3: Very short duration with too much text
        elif duration < min_duration and len(text) > 20:
            remove_reason = f"impossible_rate (dur={duration:.2f}s, chars={len(text)})"
        
        # Check 4: Impossible speech rate
        elif has_impossible_speech_rate(segment, max_chars_per_sec):
            remove_reason = f"impossible_rate (>{max_chars_per_sec} chars/s)"
        
        # Check 5: Repetitive text within segment
        elif is_repetitive(text):
            remove_reason = "repetitive_internal"
        
        # Check 6: Duplicate of recent segment (catches consecutive duplicates)
        elif text_lower in recent_texts:
            remove_reason = "duplicate_of_recent"
        
        # Check 7: Known hallucination patterns
        else:
            is_halluc, pattern = matches_hallucination_pattern(text)
            if is_halluc:
                remove_reason = f"pattern_match ({pattern})"
        
        # Check 8: Mostly punctuation
        if not remove_reason and is_mostly_punctuation(text):
            remove_reason = "mostly_punctuation"
        
        # Keep or remove
        if remove_reason:
            removed_count += 1
            if log_filtered:
                logger.debug(f"[HALLUCINATION] Removed segment {i}: {remove_reason} - '{text[:50]}...'")
        else:
            filtered.append(segment)
            # Add to recent texts for duplicate detection
            recent_texts.append(text_lower)
            if len(recent_texts) > MAX_LOOKBACK:
                recent_texts.pop(0)
    
    if removed_count > 0:
        logger.info(f"[HALLUCINATION] Filtered {removed_count}/{len(segments)} likely hallucinated segments")
    
    return filtered


def detect_repetition_at_end(segments: List[Dict[str, Any]], lookback: int = 10) -> int:
    """
    Detect if the last N segments are repetitive (common at video end).
    Returns the index where repetition starts, or -1 if no repetition detected.
    """
    if len(segments) < lookback:
        return -1
    
    last_segments = segments[-lookback:]
    texts = [s.get('text', '').strip().lower() for s in last_segments]
    
    # Check if last segments are mostly identical
    unique_texts = set(texts)
    if len(unique_texts) <= 2:  # Only 1-2 unique texts in last N
        # Find where repetition starts
        repeated_text = max(set(texts), key=texts.count)
        for i, seg in enumerate(segments):
            if seg.get('text', '').strip().lower() == repeated_text:
                return i
    
    return -1
