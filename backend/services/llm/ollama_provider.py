from typing import Dict, Any, Optional, List, Union
import json
import ollama
from .base import AbstractLLMProvider

class OllamaProvider(AbstractLLMProvider):
    def __init__(self, model: str, base_url: Optional[str] = None):
        self._model = model
        # Ollama client auto-detects OLLAMA_HOST env var, or we can pass host.
        # If base_url is provided, we use it as host.
        self.client = ollama.Client(host=base_url) if base_url else ollama.Client()

    @property
    def provider_name(self) -> str:
        return "ollama"

    @property
    def default_model(self) -> str:
        return self._model

    def generate_text(self, prompt: str, system_prompt: Optional[str] = None, **kwargs) -> str:
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        try:
            response = self.client.chat(
                model=self._model,
                messages=messages,
                options=kwargs # Ollama uses 'options' for params like temperature
            )
            return response['message']['content'] or ""
        except Exception as e:
            raise Exception(f"Ollama API Error: {str(e)}")

    def generate_json(self, prompt: str, system_prompt: Optional[str] = None, schema: Optional[Dict[str, Any]] = None, **kwargs) -> Union[Dict[str, Any], List[Any]]:
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        
        # Ollama supports format='json'
        
        try:
            response = self.client.chat(
                model=self._model,
                messages=messages,
                format='json',
                options=kwargs
            )
            content = response['message']['content'] or "{}"
            return json.loads(content)
        except json.JSONDecodeError:
            raise Exception("Failed to decode JSON response from Ollama")
        except Exception as e:
            raise Exception(f"Ollama API Error: {str(e)}")
