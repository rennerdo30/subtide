"""
Translation Feedback Storage

Stores user feedback on translation quality for future analysis.
"""

import os
import json
import logging
from datetime import datetime
from typing import Dict, Any, Optional, List

logger = logging.getLogger('subtide')

# Feedback file path
FEEDBACK_DIR = os.getenv('CACHE_DIR', os.path.join(os.path.dirname(__file__), '..', 'cache'))
FEEDBACK_FILE = os.path.join(FEEDBACK_DIR, 'translation_feedback.json')
MAX_FEEDBACK_ENTRIES = 10000  # Limit storage size


def _load_feedback() -> List[Dict[str, Any]]:
    """Load existing feedback from file."""
    try:
        if os.path.exists(FEEDBACK_FILE):
            with open(FEEDBACK_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception as e:
        logger.warning(f"[FEEDBACK] Failed to load feedback: {e}")
    return []


def _save_feedback(feedback_list: List[Dict[str, Any]]) -> bool:
    """Save feedback to file."""
    try:
        os.makedirs(FEEDBACK_DIR, exist_ok=True)
        with open(FEEDBACK_FILE, 'w', encoding='utf-8') as f:
            json.dump(feedback_list, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        logger.error(f"[FEEDBACK] Failed to save feedback: {e}")
        return False


def store_feedback(
    video_id: str,
    segment_index: int,
    rating: int,  # 1 = positive, -1 = negative
    source_text: Optional[str] = None,
    translated_text: Optional[str] = None,
    target_lang: Optional[str] = None,
    user_correction: Optional[str] = None
) -> bool:
    """
    Store translation feedback.
    
    Args:
        video_id: YouTube video ID
        segment_index: Index of the subtitle segment
        rating: 1 for positive (thumbs up), -1 for negative (thumbs down)
        source_text: Original text (optional, for analysis)
        translated_text: Translated text (optional)
        target_lang: Target language code
        user_correction: Optional user-provided correction
    
    Returns:
        True if stored successfully
    """
    feedback_list = _load_feedback()
    
    entry = {
        'video_id': video_id,
        'segment_index': segment_index,
        'rating': rating,
        'timestamp': datetime.now().isoformat(),
    }
    
    if source_text:
        entry['source_text'] = source_text[:500]  # Limit size
    if translated_text:
        entry['translated_text'] = translated_text[:500]
    if target_lang:
        entry['target_lang'] = target_lang
    if user_correction:
        entry['user_correction'] = user_correction[:500]
    
    feedback_list.append(entry)
    
    # Enforce size limit (remove oldest entries)
    if len(feedback_list) > MAX_FEEDBACK_ENTRIES:
        feedback_list = feedback_list[-MAX_FEEDBACK_ENTRIES:]
    
    if _save_feedback(feedback_list):
        logger.info(f"[FEEDBACK] Stored feedback for video={video_id} segment={segment_index} rating={rating}")
        return True
    return False


def get_feedback_stats() -> Dict[str, Any]:
    """
    Get feedback statistics.
    
    Returns:
        Dict with feedback counts and ratings
    """
    feedback_list = _load_feedback()
    
    if not feedback_list:
        return {
            'total': 0,
            'positive': 0,
            'negative': 0,
            'ratio': 0.0
        }
    
    positive = sum(1 for f in feedback_list if f.get('rating', 0) > 0)
    negative = sum(1 for f in feedback_list if f.get('rating', 0) < 0)
    total = len(feedback_list)
    
    return {
        'total': total,
        'positive': positive,
        'negative': negative,
        'ratio': positive / total if total > 0 else 0.0
    }


def get_problematic_patterns() -> List[Dict[str, Any]]:
    """
    Analyze feedback to find problematic translation patterns.
    
    Returns:
        List of patterns that frequently receive negative feedback
    """
    feedback_list = _load_feedback()
    
    # Track negative feedback by target language
    lang_issues = {}
    for f in feedback_list:
        if f.get('rating', 0) < 0:
            lang = f.get('target_lang', 'unknown')
            if lang not in lang_issues:
                lang_issues[lang] = 0
            lang_issues[lang] += 1
    
    patterns = []
    for lang, count in sorted(lang_issues.items(), key=lambda x: -x[1])[:5]:
        patterns.append({
            'target_lang': lang,
            'negative_count': count
        })
    
    return patterns
