from typing import Dict, Any, Optional, List, Union
import json
from openai import OpenAI, OpenAIError
from .base import AbstractLLMProvider

class OpenAIProvider(AbstractLLMProvider):
    def __init__(self, api_key: str, model: str, base_url: Optional[str] = None):
        self.client = OpenAI(api_key=api_key, base_url=base_url)
        self._model = model
        self._provider_name = "openai" if not base_url else ("deepseek" if "deepseek" in base_url else "openai_compatible")

    @property
    def provider_name(self) -> str:
        return self._provider_name

    @property
    def default_model(self) -> str:
        return self._model

    def generate_text(self, prompt: str, system_prompt: Optional[str] = None, **kwargs) -> str:
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        try:
            response = self.client.chat.completions.create(
                model=self._model,
                messages=messages,
                **kwargs
            )
            return response.choices[0].message.content or ""
        except OpenAIError as e:
            raise Exception(f"OpenAI API Error: {str(e)}")

    def generate_json(self, prompt: str, system_prompt: Optional[str] = None, schema: Optional[Dict[str, Any]] = None, **kwargs) -> Union[Dict[str, Any], List[Any]]:
        # OpenAI supports json_object response format
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        # Ensure JSON mode is enabled if supported/requested
        if "response_format" not in kwargs:
             kwargs["response_format"] = {"type": "json_object"}

        try:
            response = self.client.chat.completions.create(
                model=self._model,
                messages=messages,
                **kwargs
            )
            content = response.choices[0].message.content or "{}"
            return json.loads(content)
        except json.JSONDecodeError:
            raise Exception("Failed to decode JSON response from OpenAI")
        except OpenAIError as e:
            raise Exception(f"OpenAI API Error: {str(e)}")
