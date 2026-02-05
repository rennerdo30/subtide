from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List, Union


class LLMError(Exception):
    """Base exception for LLM provider errors."""
    pass


class LLMRateLimitError(LLMError):
    """Raised when the LLM API returns a rate limit error (429)."""
    pass


class LLMAuthError(LLMError):
    """Raised when the LLM API returns an authentication error (401/403)."""
    pass


class LLMResponseError(LLMError):
    """Raised when the LLM response cannot be parsed."""
    pass


class AbstractLLMProvider(ABC):
    """
    Abstract base class for LLM providers.
    """

    @abstractmethod
    def generate_text(self, prompt: str, system_prompt: Optional[str] = None, **kwargs) -> str:
        """
        Generates text based on a prompt.
        
        Args:
            prompt: The user prompt.
            system_prompt: Optional system instruction.
            **kwargs: Additional provider-specific parameters (e.g., temperature, max_tokens).
            
        Returns:
            The generated text content.
        """
        pass

    @abstractmethod
    def generate_json(self, prompt: str, system_prompt: Optional[str] = None, schema: Optional[Dict[str, Any]] = None, **kwargs) -> Union[Dict[str, Any], List[Any]]:
        """
        Generates structured JSON output.
        
        Args:
            prompt: The user prompt.
            system_prompt: Optional system instruction.
            schema: Optional JSON schema to enforce structure (if supported).
            **kwargs: Additional provider-specific parameters.
            
        Returns:
            The parsed JSON response.
        """
        pass

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Returns the name of the provider."""
        pass

    @property
    def concurrency_limit(self) -> int:
        """Returns the concurrency limit for this provider."""
        return getattr(self, "_concurrency_limit", 1)

    @concurrency_limit.setter
    def concurrency_limit(self, value: int):
        self._concurrency_limit = value
