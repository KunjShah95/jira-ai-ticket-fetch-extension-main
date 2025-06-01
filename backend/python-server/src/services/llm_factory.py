from typing import Dict, Type
from loguru import logger

from src.services.base_llm import BaseLLMService
from src.services.openai_llm import OpenAILLMService
from src.services.anthropic_llm import AnthropicLLMService
from src.core.config import settings


class LLMFactory:
    """Factory class for creating LLM service instances"""
    
    _providers: Dict[str, Type[BaseLLMService]] = {
        "openai": OpenAILLMService,
        "anthropic": AnthropicLLMService,
    }
    
    @classmethod
    def create_llm_service(
        self, 
        provider: str = None, 
        model_name: str = None,
        api_key: str = None
    ) -> BaseLLMService:
        """Create an LLM service instance based on provider"""
        
        provider = provider or settings.LLM_PROVIDER
        
        if provider not in self._providers:
            available_providers = ", ".join(self._providers.keys())
            raise ValueError(f"Unsupported LLM provider: {provider}. Available: {available_providers}")
        
        service_class = self._providers[provider]
        
        # Use default model names if not specified
        if not model_name:
            if provider == "openai":
                model_name = settings.OPENAI_MODEL or "gpt-4-turbo-preview"
            elif provider == "anthropic":
                model_name = settings.ANTHROPIC_MODEL or "claude-3-sonnet-20240229"
        
        logger.info(f"Creating {provider} LLM service with model: {model_name}")
        
        return service_class(api_key=api_key, model_name=model_name)
    
    @classmethod
    def get_available_providers(cls) -> list[str]:
        """Get list of available LLM providers"""
        return list(cls._providers.keys())
    
    @classmethod
    def register_provider(cls, name: str, service_class: Type[BaseLLMService]):
        """Register a new LLM provider"""
        cls._providers[name] = service_class
        logger.info(f"Registered new LLM provider: {name}")


# Global LLM service instance
_llm_service_instance = None


def get_llm_service() -> BaseLLMService:
    """Get the global LLM service instance (singleton pattern)"""
    global _llm_service_instance
    
    if _llm_service_instance is None:
        _llm_service_instance = LLMFactory.create_llm_service()
    
    return _llm_service_instance


def reset_llm_service():
    """Reset the global LLM service instance"""
    global _llm_service_instance
    _llm_service_instance = None
