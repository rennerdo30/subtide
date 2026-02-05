"""
Input validation utilities for route parameters.
"""

import re
from backend.config import LANG_NAMES

# Valid language codes (from LANG_NAMES + 'auto' for source detection)
VALID_LANG_CODES = set(LANG_NAMES.keys()) | {'auto'}

# Valid tier values
VALID_TIERS = {'tier1', 'tier2', 'tier3', 'tier4'}

# Model ID pattern: alphanumeric, hyphens, dots, slashes, colons (for provider:model format)
MODEL_ID_PATTERN = re.compile(r'^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$')

# Max length for text fields in feedback
MAX_FEEDBACK_TEXT_LENGTH = 5000


def validate_lang_code(lang: str) -> bool:
    """Validate that a language code is in the supported set."""
    return isinstance(lang, str) and lang in VALID_LANG_CODES


def validate_tier(tier: str) -> bool:
    """Validate that a tier value is valid."""
    return isinstance(tier, str) and tier in VALID_TIERS


def validate_model_id(model_id: str) -> bool:
    """Validate model ID format (prevents injection via model parameter)."""
    if not model_id or not isinstance(model_id, str):
        return False
    return bool(MODEL_ID_PATTERN.match(model_id))


def validate_feedback_text(text: str) -> bool:
    """Validate feedback text field length."""
    if text is None:
        return True  # Optional field
    return isinstance(text, str) and len(text) <= MAX_FEEDBACK_TEXT_LENGTH
