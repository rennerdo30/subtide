import os
import logging
from typing import Optional

from backend.config import (
    LLM_PROVIDER,
    OPENAI_API_KEY, OPENAI_MODEL, OPENAI_CONCURRENT_REQUESTS, SERVER_API_URL, 
    DEEPSEEK_API_KEY, DEEPSEEK_MODEL, DEEPSEEK_CONCURRENT_REQUESTS,
    ANTHROPIC_API_KEY, ANTHROPIC_MODEL, ANTHROPIC_CONCURRENT_REQUESTS,
    GOOGLE_API_KEY, GOOGLE_MODEL, GOOGLE_CONCURRENT_REQUESTS,
    MISTRAL_API_KEY, MISTRAL_MODEL, MISTRAL_CONCURRENT_REQUESTS,
    OLLAMA_MODEL, OLLAMA_BASE_URL, OLLAMA_CONCURRENT_REQUESTS,
    OPENROUTER_API_KEY, OPENROUTER_MODEL, OPENROUTER_CONCURRENT_REQUESTS
)
from .base import AbstractLLMProvider
from .openai_provider import OpenAIProvider
from .anthropic_provider import AnthropicProvider
from .google_provider import GoogleProvider
from .mistral_provider import MistralProvider
from .ollama_provider import OllamaProvider
from .openrouter_provider import OpenRouterProvider

logger = logging.getLogger(__name__)

def get_llm_provider() -> AbstractLLMProvider:
    """
    Factory function to get the configured LLM provider.
    """
    provider_name = LLM_PROVIDER
    
    if provider_name == "openai":
        if not OPENAI_API_KEY:
            raise ValueError("OPENAI_API_KEY is not set")
        # Check if it's actually DeepSeek or another compatible service via SERVER_API_URL logic overrides?
        # Actually, user might explicitly set 'deepseek' provider, handled below.
        # But if they use 'openai' with a custom URL, we support that too.
        # But if they use 'openai' with a custom URL, we support that too.
        provider = OpenAIProvider(api_key=OPENAI_API_KEY, model=OPENAI_MODEL, base_url=SERVER_API_URL)
        provider.concurrency_limit = OPENAI_CONCURRENT_REQUESTS
        return provider

    elif provider_name == "anthropic":
        if not ANTHROPIC_API_KEY:
             raise ValueError("ANTHROPIC_API_KEY is not set")
        provider = AnthropicProvider(api_key=ANTHROPIC_API_KEY, model=ANTHROPIC_MODEL)
        provider.concurrency_limit = ANTHROPIC_CONCURRENT_REQUESTS
        return provider

    elif provider_name == "google":
        if not GOOGLE_API_KEY:
             raise ValueError("GOOGLE_API_KEY is not set")
        provider = GoogleProvider(api_key=GOOGLE_API_KEY, model=GOOGLE_MODEL)
        provider.concurrency_limit = GOOGLE_CONCURRENT_REQUESTS
        return provider

    elif provider_name == "mistral":
        if not MISTRAL_API_KEY:
            raise ValueError("MISTRAL_API_KEY is not set")
        provider = MistralProvider(api_key=MISTRAL_API_KEY, model=MISTRAL_MODEL)
        provider.concurrency_limit = MISTRAL_CONCURRENT_REQUESTS
        return provider

    elif provider_name == "ollama":
        if not OLLAMA_MODEL:
            raise ValueError("OLLAMA_MODEL is not set")
        provider = OllamaProvider(model=OLLAMA_MODEL, base_url=OLLAMA_BASE_URL)
        provider.concurrency_limit = OLLAMA_CONCURRENT_REQUESTS
        return provider

    elif provider_name == "openrouter":
        if not OPENROUTER_API_KEY:
             raise ValueError("OPENROUTER_API_KEY is not set")
        provider = OpenRouterProvider(api_key=OPENROUTER_API_KEY, model=OPENROUTER_MODEL)
        provider.concurrency_limit = OPENROUTER_CONCURRENT_REQUESTS
        return provider

    elif provider_name == "deepseek":
        # DeepSeek can be used via OpenAI provider with specific base URL
        api_key = DEEPSEEK_API_KEY or OPENAI_API_KEY # Fallback
        if not api_key:
             raise ValueError("DEEPSEEK_API_KEY (or OPENAI_API_KEY) is not set")
        provider = OpenAIProvider(
            api_key=api_key, 
            model=DEEPSEEK_MODEL, 
            base_url="https://api.deepseek.com" # Standard DeepSeek API URL
        )
        provider.concurrency_limit = DEEPSEEK_CONCURRENT_REQUESTS
        return provider
    
    # Add support for generic "openai_compatible" or "lmstudio" via config if needed
    # Usage: LLM_PROVIDER=openai_compatible SERVER_API_URL=...
    elif provider_name == "openai_compatible" or provider_name == "lmstudio":
         if not OPENAI_API_KEY:
              # LM Studio often doesn't need a key, but library might require non-empty string
              # We can default to "lm-studio" if missing
              pass
         provider = OpenAIProvider(
             api_key=OPENAI_API_KEY or "lm-studio", 
             model=OPENAI_MODEL, 
             base_url=SERVER_API_URL or "http://localhost:1234/v1"
         )
         # Default to generic OpenAI concurrency or custom? Let's use OpenAI's default.
         provider.concurrency_limit = OPENAI_CONCURRENT_REQUESTS
         return provider

    else:
        raise ValueError(f"Unsupported LLM provider: {provider_name}")
