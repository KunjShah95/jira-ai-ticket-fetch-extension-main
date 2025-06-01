from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
from src.models.schemas import LLMResponse, JiraTicketData, GenerationOptions


class BaseLLMService(ABC):
    """Base class for LLM service implementations"""

    def __init__(self, api_key: str, model_name: str):
        self.api_key = api_key
        self.model_name = model_name

    @abstractmethod
    async def generate_code(
        self,
        ticket_data: JiraTicketData,
        generation_options: GenerationOptions,
        system_prompt: str,
        user_prompt: str,
    ) -> LLMResponse:
        """Generate code based on Jira ticket data"""
        pass

    @abstractmethod
    async def generate_tests(
        self, source_code: str, file_path: str, test_framework: str
    ) -> LLMResponse:
        """Generate tests for given source code"""
        pass

    @abstractmethod
    async def review_code(self, code: str, language: str) -> LLMResponse:
        """Review and suggest improvements for code"""
        pass

    @abstractmethod
    async def explain_code(self, code: str, language: str) -> LLMResponse:
        """Generate documentation/explanation for code"""
        pass

    def build_code_generation_prompt(
        self, ticket_data: JiraTicketData, generation_options: GenerationOptions
    ) -> Dict[str, str]:
        """Build system and user prompts for code generation"""

        system_prompt = f"""You are an expert software engineer specializing in {generation_options.code_style} and {generation_options.framework}.
Your task is to generate clean, production-ready code based on Jira ticket requirements.

IMPORTANT GUIDELINES:
1. Write modular, well-structured code following best practices
2. Include proper error handling and input validation
3. Add comprehensive comments and documentation
4. Follow {generation_options.code_style} coding conventions
5. Ensure code is testable and maintainable
6. Use appropriate design patterns when needed
7. Include TypeScript types if applicable
8. Make code secure and performant

OUTPUT FORMAT:
- Provide complete, runnable code
- Structure response as multiple files if needed
- Include import statements and dependencies
- Add file path comments at the top of each file
"""

        user_prompt = f"""
JIRA TICKET: {ticket_data.key}
TITLE: {ticket_data.summary}
TYPE: {ticket_data.issue_type}
PRIORITY: {ticket_data.priority}

DESCRIPTION:
{ticket_data.description or "No description provided"}

REQUIREMENTS:
- Programming Language: {generation_options.code_style}
- Framework: {generation_options.framework}
- Architecture: {generation_options.architecture_pattern or "Standard"}
- Database: {generation_options.database_type or "None specified"}
- API Style: {generation_options.api_style or "REST"}
- Max file size: {generation_options.max_file_size} lines
- Include tests: {generation_options.generate_tests}
- Include docs: {generation_options.include_documentation}

ADDITIONAL CONTEXT:
- Labels: {", ".join(ticket_data.labels) if ticket_data.labels else "None"}
- Components: {", ".join(ticket_data.components) if ticket_data.components else "None"}

Please generate complete, production-ready code that implements the requirements described in this Jira ticket.
"""

        return {"system_prompt": system_prompt, "user_prompt": user_prompt}

    def build_test_generation_prompt(
        self, source_code: str, file_path: str, test_framework: str
    ) -> Dict[str, str]:
        """Build prompts for test generation"""

        system_prompt = f"""You are an expert test engineer specializing in {test_framework}.
Your task is to generate comprehensive unit and integration tests for the provided source code.

TESTING GUIDELINES:
1. Write tests that cover all public methods and functions
2. Include edge cases and error scenarios
3. Test both positive and negative paths
4. Use proper mocking for external dependencies
5. Follow {test_framework} best practices
6. Ensure tests are isolated and independent
7. Include setup and teardown when needed
8. Write descriptive test names and comments

OUTPUT FORMAT:
- Provide complete test files
- Include proper imports and setup
- Follow naming conventions for {test_framework}
- Ensure tests are runnable
"""

        user_prompt = f"""
SOURCE FILE: {file_path}

SOURCE CODE:
```
{source_code}
```

Generate comprehensive {test_framework} tests for this code. Include:
1. Unit tests for all functions/methods
2. Integration tests where appropriate
3. Edge case testing
4. Error handling tests
5. Mocking for external dependencies

Ensure the tests are well-structured, maintainable, and provide good coverage.
"""

        return {"system_prompt": system_prompt, "user_prompt": user_prompt}
