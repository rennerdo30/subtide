"""
Language detection for translation validation.
Uses character range analysis - lightweight, no external deps.
"""

import re
import unicodedata
import logging
from typing import List, Tuple, Dict, Pattern

logger = logging.getLogger('video-translate')

# =============================================================================
# Configuration Constants
# =============================================================================

# Thresholds for language validation
MIN_TARGET_SCRIPT_RATIO = 0.10      # Minimum ratio of target script characters
MIN_CJK_SCRIPT_RATIO = 0.15         # Minimum ratio for CJK languages
MAX_LATIN_RATIO_FOR_NONLATIN = 0.80 # Max Latin ratio when expecting non-Latin
MIN_LATIN_RATIO_FOR_ROMANIZED = 0.70  # Threshold to detect romanized text
SOURCE_LEAKAGE_OVERLAP_THRESHOLD = 0.70  # Word overlap threshold for leakage
MIN_TEXT_LENGTH_FOR_VALIDATION = 5  # Minimum chars to validate
MIN_TEXT_LENGTH_FOR_LATIN_CHECK = 50  # Minimum chars for Latin language check
MIN_ENGLISH_MARKERS = 2             # Minimum English word markers to detect English

# Character ranges for language detection
LANGUAGE_CHAR_PATTERNS = {
    # Japanese: Hiragana + Katakana + Kanji (CJK)
    'ja': r'[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]',
    'ko': r'[\uAC00-\uD7AF\u1100-\u11FF]',  # Hangul
    'zh': r'[\u4E00-\u9FFF]',  # CJK
    'zh-CN': r'[\u4E00-\u9FFF]',  # CJK Simplified
    'zh-TW': r'[\u4E00-\u9FFF]',  # CJK Traditional
    'ar': r'[\u0600-\u06FF]',  # Arabic
    'hi': r'[\u0900-\u097F]',  # Devanagari
    'ru': r'[\u0400-\u04FF]',  # Cyrillic
    'th': r'[\u0E00-\u0E7F]',  # Thai
    'el': r'[\u0370-\u03FF]',  # Greek
    'he': r'[\u0590-\u05FF]',  # Hebrew
    # Vietnamese: specific diacritics unique to Vietnamese
    'vi': r'[\u1EA0-\u1EF9\u0110\u0111]',  # Vietnamese-specific characters
}

# Language-specific characters for Latin-based languages
# Used to distinguish from English
LATIN_LANG_SPECIFIC_CHARS = {
    'de': r'[äöüßÄÖÜẞ]',
    'fr': r'[àâæçéèêëîïôùûüÿœÀÂÆÇÉÈÊËÎÏÔÙÛÜŸŒ]',
    'es': r'[áéíóúñüÁÉÍÓÚÑÜ¿¡]',
    'pt': r'[ãõáéíóúâêôàçÃÕÁÉÍÓÚÂÊÔÀÇ]',
    'it': r'[àèéìíîòóùúÀÈÉÌÍÎÒÓÙÚ]',
    'nl': r'[éèëïíóöüÉÈËÏÍÓÖÜ]',
    'pl': r'[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]',
    'tr': r'[çğıöşüÇĞİÖŞÜ]',
    'vi': r'[ăâđêôơưàảãáạằẳẵắặầẩẫấậèẻẽéẹềểễếệìỉĩíịòỏõóọồổỗốộờởỡớợùủũúụừửữứựỳỷỹýỵ]',
}

# Languages that use Latin script (harder to validate against English)
LATIN_SCRIPT_LANGUAGES = {'en', 'de', 'fr', 'es', 'pt', 'it', 'nl', 'pl', 'tr', 'id', 'vi'}

LATIN_PATTERN = r'[a-zA-Z]'

# Pre-compiled regex patterns for performance
_COMPILED_PATTERNS: Dict[str, Pattern] = {}
_COMPILED_LATIN_SPECIFIC: Dict[str, Pattern] = {}
_COMPILED_LATIN: Pattern = None
_COMPILED_CJK: Pattern = None


def _get_compiled_pattern(lang: str) -> Pattern:
    """Get or compile regex pattern for a language."""
    if lang not in _COMPILED_PATTERNS:
        if lang in LANGUAGE_CHAR_PATTERNS:
            _COMPILED_PATTERNS[lang] = re.compile(LANGUAGE_CHAR_PATTERNS[lang])
    return _COMPILED_PATTERNS.get(lang)


def _get_compiled_latin_specific(lang: str) -> Pattern:
    """Get or compile Latin-specific character pattern for a language."""
    if lang not in _COMPILED_LATIN_SPECIFIC:
        if lang in LATIN_LANG_SPECIFIC_CHARS:
            _COMPILED_LATIN_SPECIFIC[lang] = re.compile(LATIN_LANG_SPECIFIC_CHARS[lang], re.IGNORECASE)
    return _COMPILED_LATIN_SPECIFIC.get(lang)


def _get_compiled_latin() -> Pattern:
    """Get compiled Latin pattern."""
    global _COMPILED_LATIN
    if _COMPILED_LATIN is None:
        _COMPILED_LATIN = re.compile(LATIN_PATTERN)
    return _COMPILED_LATIN


def _get_compiled_cjk() -> Pattern:
    """Get compiled CJK pattern."""
    global _COMPILED_CJK
    if _COMPILED_CJK is None:
        _COMPILED_CJK = re.compile(r'[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]')
    return _COMPILED_CJK


def detect_script_ratio(text: str, pattern: Pattern) -> float:
    """Return ratio of characters matching the compiled pattern."""
    if not text:
        return 0.0
    matches = len(pattern.findall(text))
    # Only count actual letters, not spaces/punctuation
    letters = sum(1 for c in text if unicodedata.category(c).startswith('L'))
    return matches / max(letters, 1)


def has_cjk_characters(text: str) -> bool:
    """Check if text contains CJK characters."""
    return bool(_get_compiled_cjk().search(text))


def is_likely_english(text: str) -> bool:
    """
    Check if text appears to be English.
    Uses common English word patterns and character distribution.
    """
    if not text or len(text.strip()) < 10:
        return False

    text_lower = text.lower()

    # Common English words that appear frequently
    english_markers = [
        ' the ', ' a ', ' an ', ' is ', ' are ', ' was ', ' were ',
        ' have ', ' has ', ' had ', ' will ', ' would ', ' could ',
        ' should ', ' can ', ' may ', ' might ', ' must ',
        ' and ', ' or ', ' but ', ' not ', ' no ', ' yes ',
        ' this ', ' that ', ' these ', ' those ',
        ' i ', ' you ', ' he ', ' she ', ' it ', ' we ', ' they ',
        ' what ', ' when ', ' where ', ' why ', ' how ', ' who ',
        ' to ', ' of ', ' in ', ' on ', ' at ', ' for ', ' with ',
    ]

    # Count English markers
    marker_count = sum(1 for marker in english_markers if marker in f' {text_lower} ')

    # If more than threshold common English words, likely English
    return marker_count >= MIN_ENGLISH_MARKERS


def is_likely_target_language(text: str, target_lang: str) -> Tuple[bool, str]:
    """
    Check if text appears to be in the target language.
    Returns (is_valid, reason).
    """
    if not text or len(text.strip()) < MIN_TEXT_LENGTH_FOR_VALIDATION:
        return True, "too_short_to_validate"

    latin_pattern = _get_compiled_latin()
    latin_ratio = detect_script_ratio(text, latin_pattern)

    # For non-Latin target languages, check if output is mostly Latin (English)
    base_lang = target_lang.split('-')[0]

    target_pattern = _get_compiled_pattern(target_lang) or _get_compiled_pattern(base_lang)

    if target_pattern:
        target_ratio = detect_script_ratio(text, target_pattern)

        # If target should be non-Latin but output is >80% Latin = likely English
        if target_ratio < MIN_TARGET_SCRIPT_RATIO and latin_ratio > MAX_LATIN_RATIO_FOR_NONLATIN:
            # Double check with English word detection
            if is_likely_english(text):
                return False, f"expected_{target_lang}_got_english"
            return False, f"expected_{target_lang}_got_latin"

        # For CJK languages, need some target characters
        if base_lang in ('ja', 'ko', 'zh') and target_ratio < MIN_CJK_SCRIPT_RATIO:
            # Check if it's mostly Latin (could be romanized or wrong language)
            if latin_ratio > MIN_LATIN_RATIO_FOR_ROMANIZED:
                return False, f"insufficient_{target_lang}_characters"

    # For Latin-based target languages (de, fr, es, etc.)
    # Check if the output looks like English when it shouldn't
    elif target_lang in LATIN_SCRIPT_LANGUAGES and target_lang != 'en':
        # If translating TO a Latin language (not English),
        # and the output looks very English, flag it
        if is_likely_english(text):
            # Check for language-specific characters that should be present
            specific_pattern = _get_compiled_latin_specific(target_lang)

            if specific_pattern:
                has_specific = bool(specific_pattern.search(text))
                # If no language-specific chars and looks English, might be wrong
                if not has_specific and len(text) > MIN_TEXT_LENGTH_FOR_LATIN_CHECK:
                    return False, f"looks_like_english_not_{target_lang}"

    return True, "ok"


# Batch validation thresholds
BATCH_INVALID_THRESHOLD = 0.30      # >30% invalid = batch failure
BATCH_LEAKAGE_THRESHOLD = 0.50      # >50% leakage = batch failure


def validate_batch_language(
    translations: List[str],
    target_lang: str,
    threshold: float = BATCH_INVALID_THRESHOLD
) -> Tuple[bool, List[int], str]:
    """
    Validate a batch of translations.
    Returns (is_valid, invalid_indices, reason).

    Args:
        translations: List of translated texts to validate
        target_lang: Target language code (e.g., 'de', 'ja', 'zh-CN')
        threshold: Ratio of invalid translations that triggers batch failure

    Returns:
        Tuple of (is_batch_valid, list_of_invalid_indices, reason_string)
    """
    if not translations:
        return True, [], "empty_batch"

    invalid_indices = []
    reasons = []

    for i, text in enumerate(translations):
        is_valid, reason = is_likely_target_language(text, target_lang)
        if not is_valid:
            invalid_indices.append(i)
            reasons.append(reason)

    invalid_ratio = len(invalid_indices) / len(translations)

    if invalid_ratio > threshold:
        # Aggregate reason
        primary_reason = max(set(reasons), key=reasons.count) if reasons else "unknown"
        return False, invalid_indices, f"batch_invalid_{invalid_ratio:.0%}_{primary_reason}"

    return True, invalid_indices, "ok"


def detect_source_language_leakage(
    source_texts: List[str],
    translations: List[str],
    threshold: float = BATCH_LEAKAGE_THRESHOLD
) -> Tuple[bool, List[int]]:
    """
    Detect if translations contain source language text (copy-paste or no translation).

    Returns (has_leakage, indices_with_leakage)
    """
    leakage_indices = []

    for i, (source, trans) in enumerate(zip(source_texts, translations)):
        if not source or not trans:
            continue

        # Normalize for comparison
        source_normalized = source.lower().strip()
        trans_normalized = trans.lower().strip()

        # Check for exact match (no translation happened)
        if source_normalized == trans_normalized:
            leakage_indices.append(i)
            continue

        # Check for high similarity (partial translation or copy)
        source_words = set(source_normalized.split())
        trans_words = set(trans_normalized.split())

        if source_words and trans_words:
            overlap = len(source_words & trans_words) / len(source_words)
            if overlap > SOURCE_LEAKAGE_OVERLAP_THRESHOLD and has_cjk_characters(source):
                # High overlap with CJK source = likely not translated
                leakage_indices.append(i)

    has_leakage = len(leakage_indices) / max(len(translations), 1) > threshold
    return has_leakage, leakage_indices
