from typing import Dict, Any, Optional, List, Union
import json
from anthropic import Anthropic, APIError, RateLimitError, AuthenticationError
from .base import AbstractLLMProvider, LLMError, LLMRateLimitError, LLMAuthError, LLMResponseError

class AnthropicProvider(AbstractLLMProvider):
    def __init__(self, api_key: str, model: str):
        self.client = Anthropic(api_key=api_key)
        self._model = model

    @property
    def provider_name(self) -> str:
        return "anthropic"

    @property
    def default_model(self) -> str:
        return self._model

    def generate_text(self, prompt: str, system_prompt: Optional[str] = None, **kwargs) -> str:
        # Construct messages
        messages = [{"role": "user", "content": prompt}]
        
        try:
            response = self.client.messages.create(
                model=self._model,
                system=system_prompt,
                messages=messages,
                max_tokens=kwargs.get("max_tokens", 1024), # Anthropic requires max_tokens
                **{k: v for k, v in kwargs.items() if k != "max_tokens"}
            )
            
            if response.content and len(response.content) > 0:
                return response.content[0].text
            return ""
        except RateLimitError as e:
            raise LLMRateLimitError(f"Anthropic rate limit: {str(e)}") from e
        except AuthenticationError as e:
            raise LLMAuthError(f"Anthropic auth error: {str(e)}") from e
        except APIError as e:
            raise LLMError(f"Anthropic API Error: {str(e)}") from e

    def generate_json(self, prompt: str, system_prompt: Optional[str] = None, schema: Optional[Dict[str, Any]] = None, **kwargs) -> Union[Dict[str, Any], List[Any]]:
        # Anthropic doesn't enforce JSON mode strictly like OpenAI, but prompt engineering usually works.
        # Prefill response with "{" to encourage JSON
        
        augmented_prompt = prompt + "\n\nRespond strictly with valid JSON."
        messages = [{"role": "user", "content": augmented_prompt}]
        messages.append({"role": "assistant", "content": "{"}) # Prefill

        content = ""
        try:
            response = self.client.messages.create(
                model=self._model,
                system=system_prompt,
                messages=messages,
                 max_tokens=kwargs.get("max_tokens", 4096),
                **{k: v for k, v in kwargs.items() if k != "max_tokens"}
            )

            content = response.content[0].text if response.content else ""
            full_content = "{" + content # Re-attach the prefill
            return json.loads(full_content)
        except json.JSONDecodeError:
             raise LLMResponseError(f"Failed to decode JSON response from Anthropic. Raw content: {content[:200]}")
        except RateLimitError as e:
            raise LLMRateLimitError(f"Anthropic rate limit: {str(e)}") from e
        except AuthenticationError as e:
            raise LLMAuthError(f"Anthropic auth error: {str(e)}") from e
        except APIError as e:
            raise LLMError(f"Anthropic API Error: {str(e)}") from e
