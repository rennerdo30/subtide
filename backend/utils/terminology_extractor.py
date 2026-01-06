"""
Terminology Extractor

Extracts proper nouns, brand names, and technical terms from video metadata
to ensure consistent handling in translations.
"""

import re
import logging
from typing import List, Set, Optional
from collections import Counter

logger = logging.getLogger('video-translate')

# Common words to exclude (not proper nouns)
COMMON_WORDS = {
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
    'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought',
    'used', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it',
    'we', 'they', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'what',
    'which', 'who', 'whom', 'how', 'when', 'where', 'why', 'all', 'each',
    'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
    'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'new',
    'vs', 'episode', 'part', 'chapter', 'video', 'official', 'full', 'hd',
    '4k', 'live', 'stream', 'tutorial', 'review', 'reaction', 'unboxing',
}

# Patterns for likely proper nouns
PROPER_NOUN_PATTERNS = [
    r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b',  # Multiple capitalized words
    r'\b[A-Z]{2,}\b',  # All caps (acronyms)
    r'\b[A-Z][a-z]*[A-Z][a-z]*\b',  # CamelCase
    r'#\w+',  # Hashtags
    r'@\w+',  # Mentions
]


def extract_capitalized_words(text: str) -> Set[str]:
    """Extract words that start with capital letters."""
    if not text:
        return set()
    
    # Find capitalized words
    words = re.findall(r'\b[A-Z][a-zA-Z0-9]*\b', text)
    
    # Filter out common words and very short words
    filtered = {
        w for w in words 
        if w.lower() not in COMMON_WORDS and len(w) > 1
    }
    
    return filtered


def extract_quoted_terms(text: str) -> Set[str]:
    """Extract terms in quotes (likely titles or specific terms)."""
    if not text:
        return set()
    
    terms = set()
    
    # Match various quote styles
    patterns = [
        r'"([^"]+)"',  # Double quotes
        r"'([^']+)'",  # Single quotes
        r'「([^」]+)」',  # Japanese quotes
        r'『([^』]+)』',  # Japanese double quotes
        r'【([^】]+)】',  # Japanese brackets
    ]
    
    for pattern in patterns:
        matches = re.findall(pattern, text)
        terms.update(m.strip() for m in matches if len(m.strip()) > 1)
    
    return terms


def extract_hashtags_mentions(text: str) -> Set[str]:
    """Extract hashtags and mentions without the prefix."""
    if not text:
        return set()
    
    terms = set()
    
    # Hashtags
    hashtags = re.findall(r'#(\w+)', text)
    terms.update(hashtags)
    
    # Mentions
    mentions = re.findall(r'@(\w+)', text)
    terms.update(mentions)
    
    return terms


def extract_from_segments(
    segments: List[str], 
    min_occurrences: int = 2,
    max_terms: int = 20
) -> Set[str]:
    """
    Extract repeated proper nouns from transcribed segments.
    Terms that appear multiple times are likely important.
    """
    if not segments:
        return set()
    
    # Combine all text
    all_text = ' '.join(segments)
    
    # Find capitalized words
    capitalized = extract_capitalized_words(all_text)
    
    # Count occurrences
    word_counts = Counter()
    for text in segments:
        words = re.findall(r'\b[A-Z][a-zA-Z0-9]*\b', text)
        for w in words:
            if w.lower() not in COMMON_WORDS and len(w) > 1:
                word_counts[w] += 1
    
    # Filter by minimum occurrences
    repeated = {
        word for word, count in word_counts.items() 
        if count >= min_occurrences
    }
    
    # Sort by frequency and limit
    sorted_terms = sorted(repeated, key=lambda x: word_counts[x], reverse=True)
    return set(sorted_terms[:max_terms])


def extract_terminology(
    title: str,
    description: Optional[str] = None,
    segments: Optional[List[str]] = None,
    max_terms: int = 30
) -> List[str]:
    """
    Extract terminology from video metadata and content.
    
    Args:
        title: Video title
        description: Video description (optional)
        segments: List of transcribed segment texts (optional)
        max_terms: Maximum number of terms to return
    
    Returns:
        List of extracted terms, sorted by likely importance
    """
    terms = set()
    
    # 1. Extract from title (highest priority)
    title_terms = extract_capitalized_words(title or '')
    title_quoted = extract_quoted_terms(title or '')
    title_tags = extract_hashtags_mentions(title or '')
    
    terms.update(title_terms)
    terms.update(title_quoted)
    terms.update(title_tags)
    
    # 2. Extract from description
    if description:
        desc_terms = extract_capitalized_words(description)
        desc_quoted = extract_quoted_terms(description)
        desc_tags = extract_hashtags_mentions(description)
        
        # Only add terms that also appear in title or are very prominent
        terms.update(desc_quoted)  # Quoted terms are usually important
        terms.update(desc_tags)
        
        # Add capitalized terms from description that are in title
        terms.update(desc_terms & title_terms)
    
    # 3. Extract from segments (repeated terms)
    if segments:
        segment_terms = extract_from_segments(
            segments, 
            min_occurrences=3,  # Must appear 3+ times
            max_terms=15
        )
        terms.update(segment_terms)
    
    # Sort by length (shorter = more likely to be specific terms)
    # and limit to max_terms
    sorted_terms = sorted(terms, key=lambda x: (len(x), x))[:max_terms]
    
    if sorted_terms:
        logger.info(f"[TERMINOLOGY] Extracted {len(sorted_terms)} terms: {sorted_terms[:10]}...")
    
    return sorted_terms


def format_terminology_prompt(terms: List[str], target_lang: str) -> str:
    """
    Format terminology for inclusion in translation prompt.
    
    Args:
        terms: List of terms to preserve
        target_lang: Target language code
    
    Returns:
        Prompt string to include in translation request
    """
    if not terms:
        return ""
    
    # Language-specific handling instructions
    lang_instructions = {
        'ja': "transliterate to katakana or keep as-is",
        'ko': "transliterate to hangul or keep as-is",
        'zh': "transliterate phonetically or keep as-is",
        'ru': "transliterate to cyrillic or keep as-is",
        'ar': "transliterate or keep as-is",
    }
    
    instruction = lang_instructions.get(target_lang, "keep as-is or translate appropriately")
    
    terms_str = ", ".join(terms[:15])  # Limit to 15 terms in prompt
    
    return f"""
TERMINOLOGY: The following terms are proper nouns/brand names. You should {instruction}:
{terms_str}
"""
