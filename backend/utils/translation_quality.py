"""
Translation Quality Verification

Detects common translation issues:
- Untranslated text (same as source)
- Wrong language output
- Empty/placeholder translations
- Extreme length mismatches
"""

import re
import logging
from typing import Tuple, Optional

logger = logging.getLogger('subtide')

# Script detection patterns
SCRIPT_PATTERNS = {
    'latin': re.compile(r'[a-zA-Z]'),
    'cyrillic': re.compile(r'[\u0400-\u04FF]'),
    'japanese': re.compile(r'[\u3040-\u30FF\u4E00-\u9FFF]'),  # Hiragana, Katakana, Kanji
    'korean': re.compile(r'[\uAC00-\uD7AF\u1100-\u11FF]'),
    'chinese': re.compile(r'[\u4E00-\u9FFF]'),
    'arabic': re.compile(r'[\u0600-\u06FF]'),
    'hebrew': re.compile(r'[\u0590-\u05FF]'),
    'thai': re.compile(r'[\u0E00-\u0E7F]'),
    'devanagari': re.compile(r'[\u0900-\u097F]'),  # Hindi
}

# Expected scripts for common target languages
EXPECTED_SCRIPTS = {
    'ja': ['japanese', 'latin'],  # Japanese can include romaji
    'ko': ['korean', 'latin'],
    'zh': ['chinese'],
    'zh-Hans': ['chinese'],
    'zh-Hant': ['chinese'],
    'ru': ['cyrillic'],
    'uk': ['cyrillic'],
    'ar': ['arabic'],
    'he': ['hebrew'],
    'hi': ['devanagari', 'latin'],
    'th': ['thai'],
    # Most European languages use Latin script
    'en': ['latin'], 'es': ['latin'], 'fr': ['latin'], 
    'de': ['latin'], 'it': ['latin'], 'pt': ['latin'],
    'nl': ['latin'], 'pl': ['latin'], 'sv': ['latin'],
}


def detect_script(text: str) -> str:
    """
    Detect the primary script used in text.
    Returns the script name with highest character count.
    """
    if not text:
        return 'unknown'
    
    script_counts = {}
    for script_name, pattern in SCRIPT_PATTERNS.items():
        count = len(pattern.findall(text))
        if count > 0:
            script_counts[script_name] = count
    
    if not script_counts:
        return 'unknown'
    
    return max(script_counts, key=script_counts.get)


def is_same_as_source(source: str, translation: str, threshold: float = 0.9) -> bool:
    """
    Check if translation is essentially the same as source.
    Uses normalized comparison to handle minor formatting differences.
    """
    if not source or not translation:
        return False
    
    # Normalize: lowercase, remove extra whitespace
    s_norm = ' '.join(source.lower().split())
    t_norm = ' '.join(translation.lower().split())
    
    if s_norm == t_norm:
        return True
    
    # Check character-level similarity
    if len(s_norm) > 0 and len(t_norm) > 0:
        common = sum(1 for a, b in zip(s_norm, t_norm) if a == b)
        similarity = common / max(len(s_norm), len(t_norm))
        return similarity >= threshold
    
    return False


def has_wrong_script(translation: str, target_lang: str) -> Tuple[bool, str]:
    """
    Check if translation uses unexpected script for target language.
    
    Returns:
        Tuple of (has_wrong_script, detected_script)
    """
    if not translation or target_lang not in EXPECTED_SCRIPTS:
        return False, ""
    
    detected = detect_script(translation)
    expected = EXPECTED_SCRIPTS.get(target_lang, [])
    
    if detected == 'unknown':
        return False, detected
    
    if detected not in expected:
        return True, detected
    
    return False, detected


def is_placeholder(translation: str) -> bool:
    """Check if translation is a placeholder or empty."""
    if not translation:
        return True
    
    stripped = translation.strip()
    
    # Common placeholders
    placeholders = [
        '', '...', '…', '---', '—',
        '[music]', '[applause]', '[laughter]',
        '(music)', '(applause)', '(laughter)',
        '♪', '♫', '🎵',
    ]
    
    if stripped.lower() in [p.lower() for p in placeholders]:
        return True
    
    # Only whitespace or punctuation
    if all(not c.isalnum() for c in stripped):
        return True
    
    return False


def has_length_mismatch(
    source: str, 
    translation: str, 
    min_ratio: float = 0.2, 
    max_ratio: float = 5.0
) -> Tuple[bool, float]:
    """
    Check for extreme length mismatches.
    Some variation is normal (e.g., Japanese to English expands),
    but extreme ratios indicate issues.
    
    Returns:
        Tuple of (has_mismatch, actual_ratio)
    """
    if not source or not translation:
        return False, 0.0
    
    ratio = len(translation) / len(source)
    
    if ratio < min_ratio or ratio > max_ratio:
        return True, ratio
    
    return False, ratio


def verify_translation(
    source: str, 
    translation: str, 
    target_lang: str,
    strict: bool = False
) -> Tuple[bool, Optional[str]]:
    """
    Verify translation quality.
    
    Args:
        source: Original text
        translation: Translated text
        target_lang: Target language code
        strict: If True, applies stricter checks
    
    Returns:
        Tuple of (is_valid, issue_description)
        is_valid: True if translation passes all checks
        issue_description: Description of issue if invalid, None if valid
    """
    # Check 1: Empty/placeholder
    if is_placeholder(translation):
        return False, "placeholder_or_empty"
    
    # Check 2: Same as source (untranslated)
    if is_same_as_source(source, translation):
        return False, "same_as_source"
    
    # Check 3: Wrong script
    wrong_script, detected = has_wrong_script(translation, target_lang)
    if wrong_script:
        return False, f"wrong_script_{detected}"
    
    # Check 4: Length mismatch
    if strict:
        has_mismatch, ratio = has_length_mismatch(source, translation)
        if has_mismatch:
            return False, f"length_mismatch_{ratio:.1f}x"
    
    return True, None


def verify_batch(
    sources: list,
    translations: list,
    target_lang: str
) -> Tuple[int, int, list]:
    """
    Verify a batch of translations.
    
    Returns:
        Tuple of (valid_count, invalid_count, issues_list)
    """
    valid = 0
    invalid = 0
    issues = []
    
    for i, (src, trans) in enumerate(zip(sources, translations)):
        is_valid, issue = verify_translation(src, trans, target_lang)
        if is_valid:
            valid += 1
        else:
            invalid += 1
            issues.append({
                'index': i,
                'source': src[:50],
                'translation': trans[:50] if trans else '',
                'issue': issue
            })
    
    if invalid > 0:
        logger.warning(f"[QUALITY] {invalid}/{len(sources)} translations have issues")
        for issue in issues[:3]:  # Log first 3
            logger.debug(f"[QUALITY] Issue at {issue['index']}: {issue['issue']} - '{issue['source']}' -> '{issue['translation']}'")
    
    return valid, invalid, issues
