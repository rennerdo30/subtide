from typing import Dict, Any, Optional, List, Union
import json
from openai import OpenAI, OpenAIError
from .base import AbstractLLMProvider

class OpenRouterProvider(AbstractLLMProvider):
    def __init__(self, api_key: str, model: str):
        # OpenRouter uses the OpenAI client with a specific base URL
        self.client = OpenAI(
            api_key=api_key,
            base_url="https://openrouter.ai/api/v1"
        )
        self._model = model

    @property
    def provider_name(self) -> str:
        return "openrouter"

    @property
    def default_model(self) -> str:
        return self._model

    def generate_text(self, prompt: str, system_prompt: Optional[str] = None, **kwargs) -> str:
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        # OpenRouter requires 'extra_headers' for site naming, but usually optional or safe to omit for simple scripts.
        # We can add them if needed:
        extra_headers = {
            "HTTP-Referer": "https://github.com/rennerdo30/video-translate",
            "X-Title": "Video Translate App"
        }

        try:
            response = self.client.chat.completions.create(
                model=self._model,
                messages=messages,
                extra_headers=extra_headers,
                **kwargs
            )
            return response.choices[0].message.content or ""
        except OpenAIError as e:
            raise Exception(f"OpenRouter API Error: {str(e)}")

    def generate_json(self, prompt: str, system_prompt: Optional[str] = None, schema: Optional[Dict[str, Any]] = None, **kwargs) -> Union[Dict[str, Any], List[Any]]:
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        extra_headers = {
            "HTTP-Referer": "https://github.com/rennerdo30/video-translate",
            "X-Title": "Video Translate App"
        }

        if "response_format" not in kwargs:
             kwargs["response_format"] = {"type": "json_object"}

        try:
            response = self.client.chat.completions.create(
                model=self._model,
                messages=messages,
                extra_headers=extra_headers,
                **kwargs
            )
            content = response.choices[0].message.content or "{}"
            return json.loads(content)
        except json.JSONDecodeError:
            raise Exception("Failed to decode JSON response from OpenRouter")
        except OpenAIError as e:
            raise Exception(f"OpenRouter API Error: {str(e)}")
