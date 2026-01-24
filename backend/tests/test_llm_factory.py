"""
Tests for LLM Provider Factory.
"""

import pytest
from unittest.mock import patch, MagicMock

from backend.services.llm.base import AbstractLLMProvider
from backend.services.llm.factory import get_llm_provider


class TestGetLLMProvider:
    """Tests for the get_llm_provider factory function."""

    @patch('backend.services.llm.factory.OPENAI_API_KEY', 'sk-test-key')
    @patch('backend.services.llm.factory.OPENAI_MODEL', 'gpt-4o')
    @patch('backend.services.llm.factory.LLM_PROVIDER', 'openai')
    @patch('backend.services.llm.factory.OpenAIProvider')
    def test_creates_openai_provider(self, mock_provider_class):
        """Should create OpenAI provider when configured."""
        mock_provider = MagicMock(spec=AbstractLLMProvider)
        mock_provider_class.return_value = mock_provider

        provider = get_llm_provider()

        mock_provider_class.assert_called_once()
        assert provider == mock_provider

    @patch('backend.services.llm.factory.ANTHROPIC_API_KEY', 'sk-ant-test')
    @patch('backend.services.llm.factory.ANTHROPIC_MODEL', 'claude-3-5-sonnet')
    @patch('backend.services.llm.factory.LLM_PROVIDER', 'anthropic')
    @patch('backend.services.llm.factory.AnthropicProvider')
    def test_creates_anthropic_provider(self, mock_provider_class):
        """Should create Anthropic provider when configured."""
        mock_provider = MagicMock(spec=AbstractLLMProvider)
        mock_provider_class.return_value = mock_provider

        provider = get_llm_provider()

        mock_provider_class.assert_called_once()
        assert provider == mock_provider

    @patch('backend.services.llm.factory.GOOGLE_API_KEY', 'AIza-test')
    @patch('backend.services.llm.factory.GOOGLE_MODEL', 'gemini-2.0-flash')
    @patch('backend.services.llm.factory.LLM_PROVIDER', 'google')
    @patch('backend.services.llm.factory.GoogleProvider')
    def test_creates_google_provider(self, mock_provider_class):
        """Should create Google provider when configured."""
        mock_provider = MagicMock(spec=AbstractLLMProvider)
        mock_provider_class.return_value = mock_provider

        provider = get_llm_provider()

        mock_provider_class.assert_called_once()
        assert provider == mock_provider

    @patch('backend.services.llm.factory.MISTRAL_API_KEY', 'mistral-key')
    @patch('backend.services.llm.factory.MISTRAL_MODEL', 'mistral-large')
    @patch('backend.services.llm.factory.LLM_PROVIDER', 'mistral')
    @patch('backend.services.llm.factory.MistralProvider')
    def test_creates_mistral_provider(self, mock_provider_class):
        """Should create Mistral provider when configured."""
        mock_provider = MagicMock(spec=AbstractLLMProvider)
        mock_provider_class.return_value = mock_provider

        provider = get_llm_provider()

        mock_provider_class.assert_called_once()
        assert provider == mock_provider

    @patch('backend.services.llm.factory.OLLAMA_MODEL', 'llama3')
    @patch('backend.services.llm.factory.OLLAMA_BASE_URL', 'http://localhost:11434')
    @patch('backend.services.llm.factory.LLM_PROVIDER', 'ollama')
    @patch('backend.services.llm.factory.OllamaProvider')
    def test_creates_ollama_provider(self, mock_provider_class):
        """Should create Ollama provider when configured."""
        mock_provider = MagicMock(spec=AbstractLLMProvider)
        mock_provider_class.return_value = mock_provider

        provider = get_llm_provider()

        mock_provider_class.assert_called_once()
        assert provider == mock_provider

    @patch('backend.services.llm.factory.OPENROUTER_API_KEY', 'sk-or-test')
    @patch('backend.services.llm.factory.OPENROUTER_MODEL', 'openai/gpt-4')
    @patch('backend.services.llm.factory.LLM_PROVIDER', 'openrouter')
    @patch('backend.services.llm.factory.OpenRouterProvider')
    def test_creates_openrouter_provider(self, mock_provider_class):
        """Should create OpenRouter provider when configured."""
        mock_provider = MagicMock(spec=AbstractLLMProvider)
        mock_provider_class.return_value = mock_provider

        provider = get_llm_provider()

        mock_provider_class.assert_called_once()
        assert provider == mock_provider

    @patch('backend.services.llm.factory.DEEPSEEK_API_KEY', 'ds-key')
    @patch('backend.services.llm.factory.DEEPSEEK_MODEL', 'deepseek-chat')
    @patch('backend.services.llm.factory.LLM_PROVIDER', 'deepseek')
    @patch('backend.services.llm.factory.OpenAIProvider')
    def test_creates_deepseek_provider(self, mock_provider_class):
        """Should create DeepSeek provider (using OpenAI-compatible API)."""
        mock_provider = MagicMock(spec=AbstractLLMProvider)
        mock_provider_class.return_value = mock_provider

        provider = get_llm_provider()

        # DeepSeek uses OpenAIProvider with custom base URL
        mock_provider_class.assert_called_once()
        call_kwargs = mock_provider_class.call_args
        assert 'api.deepseek.com' in str(call_kwargs)

    @patch('backend.services.llm.factory.LLM_PROVIDER', 'unsupported')
    def test_raises_for_unsupported_provider(self):
        """Should raise ValueError for unsupported provider."""
        with pytest.raises(ValueError) as exc_info:
            get_llm_provider()
        assert 'Unsupported LLM provider' in str(exc_info.value)

    @patch('backend.services.llm.factory.OPENAI_API_KEY', None)
    @patch('backend.services.llm.factory.LLM_PROVIDER', 'openai')
    def test_raises_when_api_key_missing(self):
        """Should raise ValueError when required API key is missing."""
        with pytest.raises(ValueError) as exc_info:
            get_llm_provider()
        assert 'OPENAI_API_KEY' in str(exc_info.value)

    @patch('backend.services.llm.factory.ANTHROPIC_API_KEY', None)
    @patch('backend.services.llm.factory.LLM_PROVIDER', 'anthropic')
    def test_raises_when_anthropic_key_missing(self):
        """Should raise ValueError when Anthropic API key is missing."""
        with pytest.raises(ValueError) as exc_info:
            get_llm_provider()
        assert 'ANTHROPIC_API_KEY' in str(exc_info.value)

    @patch('backend.services.llm.factory.GOOGLE_API_KEY', None)
    @patch('backend.services.llm.factory.LLM_PROVIDER', 'google')
    def test_raises_when_google_key_missing(self):
        """Should raise ValueError when Google API key is missing."""
        with pytest.raises(ValueError) as exc_info:
            get_llm_provider()
        assert 'GOOGLE_API_KEY' in str(exc_info.value)

    @patch('backend.services.llm.factory.OPENAI_API_KEY', 'sk-test')
    @patch('backend.services.llm.factory.OPENAI_MODEL', 'test-model')
    @patch('backend.services.llm.factory.OPENAI_CONCURRENT_REQUESTS', 5)
    @patch('backend.services.llm.factory.LLM_PROVIDER', 'openai')
    @patch('backend.services.llm.factory.OpenAIProvider')
    def test_sets_concurrency_limit(self, mock_provider_class):
        """Should set concurrency limit on provider."""
        mock_provider = MagicMock(spec=AbstractLLMProvider)
        mock_provider_class.return_value = mock_provider

        provider = get_llm_provider()

        # Verify concurrency limit was set
        assert mock_provider.concurrency_limit == 5


class TestProviderInterface:
    """Tests to verify provider interface compliance."""

    @patch('backend.services.llm.factory.OPENAI_API_KEY', 'sk-test')
    @patch('backend.services.llm.factory.OPENAI_MODEL', 'gpt-4o')
    @patch('backend.services.llm.factory.LLM_PROVIDER', 'openai')
    @patch('backend.services.llm.factory.OpenAIProvider')
    def test_provider_has_required_methods(self, mock_provider_class):
        """Provider should have all required interface methods."""
        mock_provider = MagicMock(spec=AbstractLLMProvider)
        mock_provider_class.return_value = mock_provider

        provider = get_llm_provider()

        # Verify interface methods exist
        assert hasattr(provider, 'generate_text')
        assert hasattr(provider, 'generate_json')
        assert hasattr(provider, 'provider_name')
        assert hasattr(provider, 'concurrency_limit')


class TestLMStudioProvider:
    """Tests for LM Studio / OpenAI-compatible provider."""

    @patch('backend.services.llm.factory.OPENAI_API_KEY', None)
    @patch('backend.services.llm.factory.OPENAI_MODEL', 'local-model')
    @patch('backend.services.llm.factory.SERVER_API_URL', 'http://localhost:1234/v1')
    @patch('backend.services.llm.factory.LLM_PROVIDER', 'lmstudio')
    @patch('backend.services.llm.factory.OpenAIProvider')
    def test_creates_lmstudio_provider(self, mock_provider_class):
        """Should create LM Studio provider with local URL."""
        mock_provider = MagicMock(spec=AbstractLLMProvider)
        mock_provider_class.return_value = mock_provider

        provider = get_llm_provider()

        mock_provider_class.assert_called_once()
        call_args = mock_provider_class.call_args
        # Should use local URL
        assert 'localhost:1234' in str(call_args) or call_args[1].get('base_url', '').find('localhost') >= 0

    @patch('backend.services.llm.factory.OPENAI_API_KEY', None)
    @patch('backend.services.llm.factory.OPENAI_MODEL', 'local-model')
    @patch('backend.services.llm.factory.SERVER_API_URL', None)
    @patch('backend.services.llm.factory.LLM_PROVIDER', 'openai_compatible')
    @patch('backend.services.llm.factory.OpenAIProvider')
    def test_openai_compatible_uses_default_url(self, mock_provider_class):
        """OpenAI-compatible should use default URL if not specified."""
        mock_provider = MagicMock(spec=AbstractLLMProvider)
        mock_provider_class.return_value = mock_provider

        provider = get_llm_provider()

        mock_provider_class.assert_called_once()
