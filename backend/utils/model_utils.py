from functools import lru_cache
from typing import Dict, Set

# =============================================================================
# Model Context Sizes
# =============================================================================

# Known model context sizes (in tokens) - Updated December 2024
MODEL_CONTEXT_SIZES = {
    # OpenAI
    'gpt-4o': 128000,
    'gpt-4o-mini': 128000,
    'gpt-4-turbo': 128000,
    'gpt-4-turbo-preview': 128000,
    'gpt-4': 8192,
    'gpt-4-32k': 32768,
    'gpt-3.5-turbo': 16385,
    'gpt-3.5-turbo-16k': 16385,
    'o1': 200000,
    'o1-mini': 128000,
    'o1-preview': 128000,
    # Google Gemini
    'gemini-3': 1000000,
    'gemini-2.0-flash': 1000000,
    'gemini-2.0-flash-exp': 1000000,
    'gemini-2.0': 1000000,
    'gemini-1.5-pro': 2000000,
    'gemini-1.5-flash': 1000000,
    'gemini-1.5': 1000000,
    'gemini-1.0-pro': 32000,
    'gemini-pro': 32000,
    # Anthropic Claude
    'claude-3-opus': 200000,
    'claude-3-sonnet': 200000,
    'claude-3-haiku': 200000,
    'claude-3.5-sonnet': 200000,
    'claude-3.5-haiku': 200000,
    'claude-2': 100000,
    # Meta Llama
    'llama-3.3': 128000,
    'llama-3.2': 128000,
    'llama-3.1': 128000,
    'llama-3': 8192,
    'llama-2': 4096,
    'llama': 4096,
    # Mistral
    'mistral-large': 128000,
    'mistral-medium': 32768,
    'mistral-small': 32768,
    'mistral-7b': 32768,
    'mixtral': 32768,
    'mistral': 32768,
    # Qwen
    'qwen-2.5': 131072,
    'qwen-2': 131072,
    'qwen': 32768,
    # DeepSeek
    'deepseek-v3': 128000,
    'deepseek-v2': 128000,
    'deepseek': 64000,
    # Cohere
    'command-r-plus': 128000,
    'command-r': 128000,
    'command': 4096,
}

@lru_cache(maxsize=64)
def get_model_context_size(model_name: str) -> int:
    """
    Get context size for a model, with sensible defaults.

    Results are cached to avoid repeated lookups for the same model.
    """
    if not model_name:
        return 8192

    model_lower = model_name.lower()

    # Check exact match first
    if model_name in MODEL_CONTEXT_SIZES:
        return MODEL_CONTEXT_SIZES[model_name]

    # Check partial matches
    for key, size in MODEL_CONTEXT_SIZES.items():
        if key in model_lower:
            return size

    # Default for unknown models
    return 8192


# =============================================================================
# JSON Mode Support
# =============================================================================

# Models that support response_format={"type": "json_object"}
# This enables structured JSON output without parsing numbered lines
MODELS_WITH_JSON_MODE: Set[str] = {
    # OpenAI models with JSON mode support
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
    'gpt-4-turbo-preview',
    'gpt-4-1106-preview',
    'gpt-3.5-turbo-1106',
    'gpt-3.5-turbo-0125',
    # o1 models (JSON mode available)
    'o1',
    'o1-mini',
    'o1-preview',
    # Gemini via OpenAI-compatible API (JSON mode varies by provider)
    'gemini-2.0-flash',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
}


def supports_json_mode(model_name: str) -> bool:
    """
    Check if a model supports JSON response format.

    JSON mode (response_format={"type": "json_object"}) provides:
    - Guaranteed valid JSON output
    - More reliable parsing
    - No need to strip explanations or notes

    Args:
        model_name: The model ID/name to check

    Returns:
        True if the model supports JSON mode
    """
    if not model_name:
        return False

    model_lower = model_name.lower()

    # Check exact match
    if model_name in MODELS_WITH_JSON_MODE:
        return True

    # Check partial matches for model families
    json_prefixes = ['gpt-4o', 'gpt-4-turbo', 'o1']
    for prefix in json_prefixes:
        if model_lower.startswith(prefix):
            return True

    # Check if model name contains known JSON-capable model identifiers
    if any(model in model_lower for model in ['gpt-4o', 'gpt-4-turbo']):
        return True

    return False
