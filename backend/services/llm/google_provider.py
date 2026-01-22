from typing import Dict, Any, Optional, List, Union
import json
from google import genai
from google.genai import types
from .base import AbstractLLMProvider

class GoogleProvider(AbstractLLMProvider):
    def __init__(self, api_key: str, model: str):
        self.client = genai.Client(api_key=api_key)
        self._model = model

    @property
    def provider_name(self) -> str:
        return "google"

    @property
    def default_model(self) -> str:
        return self._model

    def generate_text(self, prompt: str, system_prompt: Optional[str] = None, **kwargs) -> str:
        config_args = {}
        if system_prompt:
             config_args['system_instruction'] = system_prompt
        if kwargs:
             # Map kwargs to GenerateContentConfig if needed, or pass blindly if keys match
             # Common ones: temperature, top_p, top_k, max_output_tokens
             config_args.update(kwargs)

        config = types.GenerateContentConfig(**config_args) if config_args else None

        try:
            response = self.client.models.generate_content(
                model=self._model,
                contents=prompt,
                config=config
            )
            return response.text or ""
        except Exception as e:
            raise Exception(f"Google GenAI Error: {str(e)}")

    def generate_json(self, prompt: str, system_prompt: Optional[str] = None, schema: Optional[Dict[str, Any]] = None, **kwargs) -> Union[Dict[str, Any], List[Any]]:
        config_args = {
            "response_mime_type": "application/json"
        }
        if system_prompt:
             config_args['system_instruction'] = system_prompt
        
        if schema:
             config_args['response_schema'] = schema

        if kwargs:
            config_args.update(kwargs)

        config = types.GenerateContentConfig(**config_args)

        try:
            response = self.client.models.generate_content(
                model=self._model,
                contents=prompt,
                config=config
            )
            # Response.text should be valid JSON
            return json.loads(response.text)
        except json.JSONDecodeError:
             raise Exception("Failed to decode JSON response from Google")
        except Exception as e:
            raise Exception(f"Google GenAI Error: {str(e)}")
