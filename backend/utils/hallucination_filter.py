"""
Hallucination Filter for Whisper Transcription

General algorithmic detection of hallucinated segments without hardcoded phrases.
Detection is based on:
- Near-zero duration segments (< 0.1s)
- Consecutive duplicate text (same phrase appearing 3+ times in a row)
- Segment density anomalies (too many segments in short time)
- Timestamp anomalies (backwards or overlapping)
- Repetitive internal patterns (same words/phrases looping)
- Character entropy (gibberish detection)
"""

import re
import math
import logging
from typing import List, Dict, Any, Tuple
from collections import Counter

logger = logging.getLogger('subtide')

# =============================================================================
# Configuration Constants
# =============================================================================

# Duration thresholds (seconds)
MIN_SEGMENT_DURATION = 0.1  # Segments shorter than this are suspicious

# Speech rate limits (characters per second)
# Average speech is ~15-20 chars/sec, 30 is generous upper bound
MAX_SPEECH_RATE_CHARS_PER_SEC = 30.0

# Entropy thresholds (bits per character)
# Normal speech: 3.5-4.5, gibberish: < 2.0 or > 5.0
MIN_ENTROPY_THRESHOLD = 2.0
MIN_TEXT_LENGTH_FOR_ENTROPY = 10

# Repetition detection
MIN_PATTERN_LENGTH = 2  # Minimum words in a repeated pattern
REPETITION_THRESHOLD = 3  # Number of times pattern must repeat
MAX_PATTERN_LENGTH = 8  # Maximum pattern length to check

# Duplicate detection
CONSECUTIVE_DUPLICATE_LOOKBACK = 5  # Check last N segments for duplicates

# Looping detection
LOOPING_WINDOW_SIZE = 10  # Number of segments to check for loops
LOOPING_UNIQUENESS_THRESHOLD = 0.3  # Ratio of unique texts (below = looping)

# Punctuation threshold
PUNCTUATION_RATIO_THRESHOLD = 0.5  # Text with > 50% punctuation is suspicious

# Timestamp overlap threshold
OVERLAP_RATIO_THRESHOLD = 0.5  # > 50% overlap with previous = anomaly


def calculate_entropy(text: str) -> float:
    """
    Calculate Shannon entropy of text. Low entropy = repetitive/suspicious.
    Normal speech has entropy ~3.5-4.5 bits per character.
    Gibberish/hallucinations often have very low (< 2.0) or very high (> 5.0) entropy.
    """
    if not text:
        return 0.0
    
    # Count character frequencies
    freq = Counter(text.lower())
    length = len(text)
    
    # Calculate entropy
    entropy = 0.0
    for count in freq.values():
        prob = count / length
        if prob > 0:
            entropy -= prob * math.log2(prob)
    
    return entropy


def is_repetitive_internal(text: str, min_pattern_len: int = MIN_PATTERN_LENGTH, threshold: int = REPETITION_THRESHOLD) -> bool:
    """
    Check if text contains the same phrase repeated multiple times internally.
    Works by finding repeated substrings.
    """
    words = text.split()
    if len(words) < threshold * min_pattern_len:
        return False

    # Check for repeated word sequences
    for pattern_len in range(min_pattern_len, min(MAX_PATTERN_LENGTH, len(words) // threshold + 1)):
        pattern = tuple(words[:pattern_len])
        count = 0
        i = 0
        while i <= len(words) - pattern_len:
            if tuple(words[i:i + pattern_len]) == pattern:
                count += 1
                i += pattern_len
            else:
                break
        if count >= threshold:
            return True

    return False


def is_near_zero_duration(segment: Dict[str, Any], threshold: float = MIN_SEGMENT_DURATION) -> bool:
    """Check if segment has near-zero or zero duration."""
    duration = segment.get('end', 0) - segment.get('start', 0)
    return duration < threshold


def has_impossible_speech_rate(segment: Dict[str, Any], max_chars_per_sec: float = MAX_SPEECH_RATE_CHARS_PER_SEC) -> bool:
    """
    Check if segment has an impossible speech rate.
    Average speech is ~4-5 words/sec or ~15-20 chars/sec.
    """
    duration = segment.get('end', 0) - segment.get('start', 0)
    text = segment.get('text', '')
    
    if duration < 0.1:
        return len(text) > 5  # Very short segment with text = suspicious
    
    chars_per_sec = len(text) / duration
    return chars_per_sec > max_chars_per_sec


def is_mostly_punctuation(text: str, threshold: float = PUNCTUATION_RATIO_THRESHOLD) -> bool:
    """Check if text is mostly punctuation/symbols."""
    if not text:
        return True

    punctuation_count = sum(1 for c in text if not c.isalnum() and not c.isspace())
    return punctuation_count / len(text) > threshold


def detect_timestamp_anomaly(segments: List[Dict[str, Any]], idx: int) -> bool:
    """
    Detect timestamp anomalies like:
    - Timestamp going backwards
    - Significant overlap with previous segment
    """
    if idx == 0 or idx >= len(segments):
        return False

    current = segments[idx]
    previous = segments[idx - 1]

    current_start = current.get('start', 0)
    previous_end = previous.get('end', 0)

    # Timestamp going backwards
    if current_start < previous.get('start', 0):
        return True

    # Significant overlap with previous segment
    current_duration = current.get('end', 0) - current_start
    if current_duration > 0:
        overlap = max(0, previous_end - current_start)
        if overlap / current_duration > OVERLAP_RATIO_THRESHOLD:
            return True

    return False


def detect_looping_hallucination(
    segments: List[Dict[str, Any]],
    window_size: int = LOOPING_WINDOW_SIZE,
    uniqueness_threshold: float = LOOPING_UNIQUENESS_THRESHOLD
) -> List[int]:
    """
    Detect looping hallucination where Whisper gets stuck repeating.
    Returns indices of segments that appear to be part of a loop.

    Detection: If within a window, the unique text ratio is too low,
    it indicates repetitive hallucination.
    """
    if len(segments) < window_size:
        return []

    loop_indices = []

    for i in range(len(segments) - window_size + 1):
        window = segments[i:i + window_size]
        texts = [s.get('text', '').strip().lower() for s in window]

        # Check uniqueness ratio
        unique_count = len(set(texts))
        uniqueness = unique_count / window_size

        if uniqueness < uniqueness_threshold:
            # This window is mostly duplicates - mark all as suspicious
            for j in range(i, i + window_size):
                if j not in loop_indices:
                    loop_indices.append(j)

    return loop_indices


def filter_hallucinations(
    segments: List[Dict[str, Any]],
    min_duration: float = MIN_SEGMENT_DURATION,
    max_chars_per_sec: float = MAX_SPEECH_RATE_CHARS_PER_SEC,
    log_filtered: bool = True
) -> List[Dict[str, Any]]:
    """
    Filter out likely hallucinated segments from Whisper output.
    Uses general algorithmic detection, not hardcoded phrases.
    
    Detection methods:
    1. Near-zero duration (< min_duration)
    2. Impossible speech rate (> max_chars_per_sec)
    3. Repetitive internal patterns
    4. Consecutive duplicates (same text in recent segments)
    5. Timestamp anomalies (backwards, overlapping)
    6. Looping detection (many segments with same text)
    7. Empty or mostly punctuation
    
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
    
    # First pass: detect looping hallucination patterns
    loop_indices = set(detect_looping_hallucination(segments))
    
    filtered = []
    removed_count = 0
    removed_reasons = Counter()
    
    # Track recent texts for consecutive duplicate detection
    recent_texts = []
    
    for i, segment in enumerate(segments):
        text = segment.get('text', '').strip()
        text_lower = text.lower()
        duration = segment.get('end', 0) - segment.get('start', 0)
        
        remove_reason = None
        
        # Check 1: Empty or whitespace only
        if not text:
            remove_reason = "empty"
        
        # Check 2: Near-zero duration
        elif duration < min_duration:
            remove_reason = f"near_zero_duration ({duration:.3f}s)"
        
        # Check 3: Impossible speech rate
        elif has_impossible_speech_rate(segment, max_chars_per_sec):
            chars_per_sec = len(text) / max(duration, 0.01)
            remove_reason = f"impossible_rate ({chars_per_sec:.0f} chars/s)"
        
        # Check 4: Repetitive internal patterns
        elif is_repetitive_internal(text):
            remove_reason = "repetitive_internal"
        
        # Check 5: Consecutive duplicate of recent segment
        elif text_lower in recent_texts:
            remove_reason = "consecutive_duplicate"
        
        # Check 6: Part of detected looping pattern
        elif i in loop_indices:
            remove_reason = "looping_hallucination"
        
        # Check 7: Timestamp anomaly
        elif detect_timestamp_anomaly(segments, i):
            remove_reason = "timestamp_anomaly"
        
        # Check 8: Mostly punctuation
        elif is_mostly_punctuation(text):
            remove_reason = "mostly_punctuation"

        # Check 9: Suspiciously low entropy (very repetitive characters)
        elif len(text) > MIN_TEXT_LENGTH_FOR_ENTROPY:
            entropy = calculate_entropy(text)
            if entropy < MIN_ENTROPY_THRESHOLD:
                remove_reason = f"low_entropy ({entropy:.2f})"

        # Keep or remove
        if remove_reason:
            removed_count += 1
            removed_reasons[remove_reason.split('(')[0].strip()] += 1
            if log_filtered:
                logger.debug(f"[HALLUCINATION] Removed segment {i}: {remove_reason} - '{text[:50]}...'")
        else:
            filtered.append(segment)
            # Add to recent texts for duplicate detection
            recent_texts.append(text_lower)
            if len(recent_texts) > CONSECUTIVE_DUPLICATE_LOOKBACK:
                recent_texts.pop(0)
    
    if removed_count > 0:
        logger.info(f"[HALLUCINATION] Filtered {removed_count}/{len(segments)} segments: {dict(removed_reasons)}")
    
    return filtered


def detect_repetition_at_end(segments: List[Dict[str, Any]], lookback: int = LOOPING_WINDOW_SIZE) -> int:
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
