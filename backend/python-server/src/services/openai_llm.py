import openai
from typing import Dict, Any, List, Optional
from loguru import logger
import time

from src.services.base_llm import BaseLLMService
from src.models.schemas import LLMResponse, JiraTicketData, GenerationOptions
from src.core.config import settings


class OpenAILLMService(BaseLLMService):
    """OpenAI GPT service implementation"""

    def __init__(self, api_key: str = None, model_name: str = "gpt-4-turbo-preview"):
        super().__init__(api_key or settings.OPENAI_API_KEY, model_name)
        self.client = openai.AsyncOpenAI(api_key=self.api_key)
        self.max_tokens = 4000
        self.temperature = 0.1  # Low temperature for more consistent code generation

    async def generate_code(
        self,
        ticket_data: JiraTicketData,
        generation_options: GenerationOptions,
        system_prompt: str = None,
        user_prompt: str = None,
    ) -> LLMResponse:
        """Generate code using OpenAI GPT"""
        try:
            # Build prompts if not provided
            if not system_prompt or not user_prompt:
                prompts = self.build_code_generation_prompt(
                    ticket_data, generation_options
                )
                system_prompt = system_prompt or prompts["system_prompt"]
                user_prompt = user_prompt or prompts["user_prompt"]

            logger.info(
                f"Generating code with OpenAI {self.model_name} for ticket {ticket_data.key}"
            )

            start_time = time.time()
            response = await self.client.chat.completions.create(
                model=self.model_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                max_tokens=self.max_tokens,
                temperature=self.temperature,
                stream=False,
            )

            processing_time = time.time() - start_time
            logger.info(
                f"Code generation completed in {processing_time:.2f}s, tokens used: {response.usage.total_tokens}"
            )

            return LLMResponse(
                content=response.choices[0].message.content,
                tokens_used=response.usage.total_tokens,
                model_used=self.model_name,
                finish_reason=response.choices[0].finish_reason,
            )

        except Exception as e:
            logger.error(f"Error generating code with OpenAI: {str(e)}")
            raise

    async def generate_tests(
        self, source_code: str, file_path: str, test_framework: str
    ) -> LLMResponse:
        """Generate tests using OpenAI GPT"""
        try:
            prompts = self.build_test_generation_prompt(
                source_code, file_path, test_framework
            )

            logger.info(f"Generating tests for {file_path} with {test_framework}")

            start_time = time.time()
            response = await self.client.chat.completions.create(
                model=self.model_name,
                messages=[
                    {"role": "system", "content": prompts["system_prompt"]},
                    {"role": "user", "content": prompts["user_prompt"]},
                ],
                max_tokens=self.max_tokens,
                temperature=self.temperature,
                stream=False,
            )

            processing_time = time.time() - start_time
            logger.info(f"Test generation completed in {processing_time:.2f}s")

            return LLMResponse(
                content=response.choices[0].message.content,
                tokens_used=response.usage.total_tokens,
                model_used=self.model_name,
                finish_reason=response.choices[0].finish_reason,
            )

        except Exception as e:
            logger.error(f"Error generating tests with OpenAI: {str(e)}")
            raise

    async def review_code(self, code: str, language: str) -> LLMResponse:
        """Review code using OpenAI GPT"""
        try:
            system_prompt = f"""You are an expert code reviewer specializing in {language}.
Analyze the provided code and provide constructive feedback on:
1. Code quality and best practices
2. Performance improvements
3. Security considerations
4. Maintainability issues
5. Bug potential
6. Design patterns usage

Provide specific, actionable suggestions with examples when possible."""

            user_prompt = f"""Please review this {language} code:

```{language}
{code}
```

Provide a comprehensive code review with specific recommendations for improvement."""

            response = await self.client.chat.completions.create(
                model=self.model_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                max_tokens=self.max_tokens,
                temperature=0.2,
                stream=False,
            )

            return LLMResponse(
                content=response.choices[0].message.content,
                tokens_used=response.usage.total_tokens,
                model_used=self.model_name,
                finish_reason=response.choices[0].finish_reason,
            )

        except Exception as e:
            logger.error(f"Error reviewing code with OpenAI: {str(e)}")
            raise

    async def explain_code(self, code: str, language: str) -> LLMResponse:
        """Generate documentation for code using OpenAI GPT"""
        try:
            system_prompt = f"""You are an expert technical writer specializing in {language} documentation.
Generate clear, comprehensive documentation for the provided code including:
1. Overall purpose and functionality
2. Function/method descriptions
3. Parameter explanations
4. Return value descriptions
5. Usage examples
6. Notes about complexity or performance

Write in a clear, professional style suitable for technical documentation."""

            user_prompt = f"""Generate comprehensive documentation for this {language} code:

```{language}
{code}
```

Include detailed explanations of functionality, parameters, return values, and usage examples."""

            response = await self.client.chat.completions.create(
                model=self.model_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                max_tokens=self.max_tokens,
                temperature=0.3,
                stream=False,
            )

            return LLMResponse(
                content=response.choices[0].message.content,
                tokens_used=response.usage.total_tokens,
                model_used=self.model_name,
                finish_reason=response.choices[0].finish_reason,
            )

        except Exception as e:
            logger.error(f"Error explaining code with OpenAI: {str(e)}")
            raise
