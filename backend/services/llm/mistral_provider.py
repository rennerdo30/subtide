from typing import Dict, Any, Optional, List, Union
import json
from mistralai import Mistral
from .base import AbstractLLMProvider

class MistralProvider(AbstractLLMProvider):
    def __init__(self, api_key: str, model: str):
        self.client = Mistral(api_key=api_key)
        self._model = model

    @property
    def provider_name(self) -> str:
        return "mistral"

    @property
    def default_model(self) -> str:
        return self._model

    def generate_text(self, prompt: str, system_prompt: Optional[str] = None, **kwargs) -> str:
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        try:
            response = self.client.chat.complete(
                model=self._model,
                messages=messages,
                **kwargs
            )
            return response.choices[0].message.content or ""
        except Exception as e:
            raise Exception(f"Mistral API Error: {str(e)}")

    def generate_json(self, prompt: str, system_prompt: Optional[str] = None, schema: Optional[Dict[str, Any]] = None, **kwargs) -> Union[Dict[str, Any], List[Any]]:
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        
        # Mistral supports response_format={"type": "json_object"}
        if "response_format" not in kwargs:
             kwargs["response_format"] = {"type": "json_object"}

        try:
            response = self.client.chat.complete(
                model=self._model,
                messages=messages,
                **kwargs
            )
            content = response.choices[0].message.content or "{}"
            return json.loads(content)
        except json.JSONDecodeError:
            raise Exception("Failed to decode JSON response from Mistral")
        except Exception as e:
            raise Exception(f"Mistral API Error: {str(e)}")
