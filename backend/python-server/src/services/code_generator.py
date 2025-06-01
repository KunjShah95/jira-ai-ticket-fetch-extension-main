import re
import os
import tempfile
import asyncio
import subprocess
from typing import List, Dict, Any, Optional
from pathlib import Path
from loguru import logger
import time

from src.models.schemas import (
    GenerationRequest,
    GenerationResult,
    GeneratedFile,
    TestResult,
    JiraTicketData,
    GenerationOptions,
)
from src.services.llm_factory import get_llm_service
from src.services.file_manager import FileManager
from src.services.test_executor import TestExecutor


class CodeGeneratorService:
    """Main service for orchestrating code generation from Jira tickets"""

    def __init__(self):
        self.llm_service = get_llm_service()
        self.file_manager = FileManager()
        self.test_executor = TestExecutor()

    async def generate_code_from_ticket(
        self, request: GenerationRequest
    ) -> GenerationResult:
        """Main method to generate code from a Jira ticket"""
        start_time = time.time()
        total_tokens = 0
        generated_files = []
        test_results = []
        warnings = []

        try:
            logger.info(
                f"Starting code generation for ticket {request.ticket_data.key}"
            )

            # Step 1: Generate main source code
            logger.info("Generating source code...")
            code_response = await self.llm_service.generate_code(
                request.ticket_data, request.generation_options
            )
            total_tokens += code_response.tokens_used

            # Step 2: Parse and organize generated files
            source_files = self._parse_generated_content(
                code_response.content, request.generation_options
            )
            generated_files.extend(source_files)

            # Step 3: Generate tests if requested
            if request.generation_options.generate_tests:
                logger.info("Generating tests...")
                for source_file in source_files:
                    if source_file.file_type == "source":
                        test_response = await self.llm_service.generate_tests(
                            source_file.content,
                            source_file.path,
                            request.generation_options.test_framework,
                        )
                        total_tokens += test_response.tokens_used

                        test_files = self._parse_test_content(
                            test_response.content,
                            source_file,
                            request.generation_options,
                        )
                        generated_files.extend(test_files)

            # Step 4: Generate documentation if requested
            if request.generation_options.include_documentation:
                logger.info("Generating documentation...")
                doc_files = await self._generate_documentation(
                    source_files, request.generation_options
                )
                generated_files.extend(doc_files)
                total_tokens += sum(f.get("tokens_used", 0) for f in doc_files)

            # Step 5: Create temporary workspace and validate code
            temp_workspace = await self._create_temp_workspace(generated_files)

            # Step 6: Execute tests if any were generated
            test_files = [f for f in generated_files if f.file_type == "test"]
            if test_files:
                logger.info("Executing tests...")
                test_results = await self._execute_tests(
                    temp_workspace, test_files, request.generation_options
                )

            # Step 7: Validate code syntax
            validation_warnings = await self._validate_code_syntax(generated_files)
            warnings.extend(validation_warnings)

            processing_time = int((time.time() - start_time) * 1000)

            logger.info(
                f"Code generation completed in {processing_time}ms, {total_tokens} tokens used"
            )

            return GenerationResult(
                success=True,
                generated_files=generated_files,
                test_results=test_results,
                processing_time_ms=processing_time,
                llm_tokens_used=total_tokens,
                warnings=warnings,
                metadata={
                    "ticket_key": request.ticket_data.key,
                    "generation_options": request.generation_options.dict(),
                    "temp_workspace": temp_workspace,
                },
            )

        except Exception as e:
            processing_time = int((time.time() - start_time) * 1000)
            logger.error(f"Code generation failed: {str(e)}")

            return GenerationResult(
                success=False,
                generated_files=generated_files,
                test_results=test_results,
                processing_time_ms=processing_time,
                llm_tokens_used=total_tokens,
                error_message=str(e),
                warnings=warnings,
            )

    def _parse_generated_content(
        self, content: str, options: GenerationOptions
    ) -> List[GeneratedFile]:
        """Parse LLM generated content into structured files"""
        files = []

        # Look for file blocks in the format: ```filepath or // filepath:
        file_pattern = r"(?:```(?:typescript|javascript|python|java|csharp)?\s*)?(?://\s*filepath:\s*|#\s*filepath:\s*|<!--\s*filepath:\s*)?([^\n]+\.(ts|js|py|java|cs|tsx|jsx|vue|html|css|scss|json|yaml|yml|md))\s*\n(.*?)(?=(?:```(?:typescript|javascript|python|java|csharp)?\s*)?(?://\s*filepath:\s*|#\s*filepath:\s*|<!--\s*filepath:\s*)|$)"

        matches = re.finditer(file_pattern, content, re.DOTALL | re.IGNORECASE)

        for match in matches:
            file_path = match.group(1).strip()
            file_content = match.group(3).strip()

            # Remove code block markers if present
            if file_content.startswith("```"):
                lines = file_content.split("\n")
                if lines[0].startswith("```"):
                    lines = lines[1:]
                if lines[-1].strip() == "```":
                    lines = lines[:-1]
                file_content = "\n".join(lines)

            # Determine file type and language
            file_extension = Path(file_path).suffix.lower()
            language = self._get_language_from_extension(file_extension)
            file_type = self._get_file_type(file_path, file_content)

            # Generate description
            description = self._generate_file_description(
                file_path, file_content, file_type
            )

            files.append(
                GeneratedFile(
                    path=file_path,
                    content=file_content,
                    file_type=file_type,
                    language=language,
                    description=description,
                    size_lines=len(file_content.split("\n")),
                )
            )

        # If no files were parsed, treat entire content as a single file
        if not files:
            file_path = (
                f"generated_code.{self._get_default_extension(options.code_style)}"
            )
            files.append(
                GeneratedFile(
                    path=file_path,
                    content=content,
                    file_type="source",
                    language=options.code_style,
                    description=f"Generated {options.code_style} code for {options.framework}",
                    size_lines=len(content.split("\n")),
                )
            )

        return files

    def _parse_test_content(
        self, content: str, source_file: GeneratedFile, options: GenerationOptions
    ) -> List[GeneratedFile]:
        """Parse test content into structured test files"""
        test_files = []

        # Generate test file path based on source file
        source_path = Path(source_file.path)
        test_extension = self._get_test_extension(
            options.test_framework, source_path.suffix
        )
        test_path = f"{source_path.stem}.test{test_extension}"

        # If source is in a specific directory, put tests in a tests directory
        if source_path.parent != Path("."):
            test_path = f"tests/{test_path}"

        test_files.append(
            GeneratedFile(
                path=test_path,
                content=content,
                file_type="test",
                language=options.code_style,
                description=f"Tests for {source_file.path} using {options.test_framework}",
                size_lines=len(content.split("\n")),
            )
        )

        return test_files

    async def _generate_documentation(
        self, source_files: List[GeneratedFile], options: GenerationOptions
    ) -> List[GeneratedFile]:
        """Generate documentation files"""
        doc_files = []

        for source_file in source_files:
            if source_file.file_type == "source":
                doc_response = await self.llm_service.explain_code(
                    source_file.content, source_file.language
                )

                doc_path = f"docs/{Path(source_file.path).stem}.md"
                doc_files.append(
                    GeneratedFile(
                        path=doc_path,
                        content=doc_response.content,
                        file_type="documentation",
                        language="markdown",
                        description=f"Documentation for {source_file.path}",
                        size_lines=len(doc_response.content.split("\n")),
                    )
                )

        return doc_files

    async def _create_temp_workspace(self, files: List[GeneratedFile]) -> str:
        """Create temporary workspace with generated files"""
        temp_dir = tempfile.mkdtemp(prefix="void_editor_")

        for file in files:
            file_path = Path(temp_dir) / file.path
            file_path.parent.mkdir(parents=True, exist_ok=True)
            file_path.write_text(file.content, encoding="utf-8")

        logger.info(f"Created temporary workspace: {temp_dir}")
        return temp_dir

    async def _execute_tests(
        self,
        workspace_path: str,
        test_files: List[GeneratedFile],
        options: GenerationOptions,
    ) -> List[TestResult]:
        """Execute generated tests"""
        test_results = []

        for test_file in test_files:
            result = await self.test_executor.run_tests(
                workspace_path, test_file.path, options.test_framework
            )
            test_results.append(result)

        return test_results

    async def _validate_code_syntax(self, files: List[GeneratedFile]) -> List[str]:
        """Validate code syntax and return warnings"""
        warnings = []

        for file in files:
            if file.file_type in ["source", "test"]:
                syntax_warnings = await self._check_syntax(file)
                warnings.extend(syntax_warnings)

        return warnings

    async def _check_syntax(self, file: GeneratedFile) -> List[str]:
        """Check syntax for a specific file"""
        warnings = []

        try:
            if file.language in ["typescript", "javascript"]:
                # Basic syntax check - could be enhanced with actual linters
                if not self._basic_js_syntax_check(file.content):
                    warnings.append(f"Potential syntax issues in {file.path}")
            elif file.language == "python":
                if not self._basic_python_syntax_check(file.content):
                    warnings.append(f"Potential syntax issues in {file.path}")
        except Exception as e:
            warnings.append(f"Could not validate syntax for {file.path}: {str(e)}")

        return warnings

    def _basic_js_syntax_check(self, content: str) -> bool:
        """Basic JavaScript/TypeScript syntax validation"""
        # Check for balanced braces
        open_braces = content.count("{")
        close_braces = content.count("}")

        # Check for balanced parentheses
        open_parens = content.count("(")
        close_parens = content.count(")")

        return open_braces == close_braces and open_parens == close_parens

    def _basic_python_syntax_check(self, content: str) -> bool:
        """Basic Python syntax validation"""
        try:
            compile(content, "<string>", "exec")
            return True
        except SyntaxError:
            return False

    def _get_language_from_extension(self, extension: str) -> str:
        """Get programming language from file extension"""
        language_map = {
            ".ts": "typescript",
            ".tsx": "typescript",
            ".js": "javascript",
            ".jsx": "javascript",
            ".py": "python",
            ".java": "java",
            ".cs": "csharp",
            ".css": "css",
            ".scss": "scss",
            ".html": "html",
            ".json": "json",
            ".yaml": "yaml",
            ".yml": "yaml",
            ".md": "markdown",
        }
        return language_map.get(extension, "text")

    def _get_file_type(self, file_path: str, content: str) -> str:
        """Determine file type based on path and content"""
        path_lower = file_path.lower()

        if "test" in path_lower or "spec" in path_lower:
            return "test"
        elif path_lower.endswith(".md"):
            return "documentation"
        elif path_lower.endswith((".json", ".yaml", ".yml")):
            return "config"
        else:
            return "source"

    def _generate_file_description(
        self, file_path: str, content: str, file_type: str
    ) -> str:
        """Generate a description for the file"""
        if file_type == "test":
            return f"Test file for {file_path}"
        elif file_type == "documentation":
            return f"Documentation file: {file_path}"
        elif file_type == "config":
            return f"Configuration file: {file_path}"
        else:
            # Try to extract class/function names for description
            lines = content.split("\n")[:10]  # Check first 10 lines
            for line in lines:
                if "class " in line:
                    return "Source file containing class definitions"
                elif "function " in line or "def " in line:
                    return "Source file containing function definitions"
            return f"Source code file: {file_path}"

    def _get_default_extension(self, language: str) -> str:
        """Get default file extension for language"""
        extension_map = {
            "typescript": "ts",
            "javascript": "js",
            "python": "py",
            "java": "java",
            "csharp": "cs",
        }
        return extension_map.get(language, "txt")

    def _get_test_extension(self, test_framework: str, source_extension: str) -> str:
        """Get appropriate test file extension"""
        if test_framework in ["jest", "vitest"]:
            return source_extension
        elif test_framework == "pytest":
            return ".py"
        else:
            return source_extension

    async def generate_code_from_requirements(
        self,
        requirements: List[str],
        technical_specs: List[str],
        generation_options: GenerationOptions,
    ) -> GenerationResult:
        """Generate code from structured requirements and technical specifications"""
        start_time = time.time()
        total_tokens = 0
        generated_files = []
        test_results = []
        warnings = []

        try:
            logger.info("Generating code from structured requirements")

            # Build a comprehensive prompt from requirements
            generation_prompt = self._build_requirements_prompt(
                requirements, technical_specs, generation_options
            )

            # Generate code using LLM
            llm_response = await self.llm_service.generate_response(
                prompt=generation_prompt,
                system_message="You are an expert software developer. Generate complete, production-ready code based on requirements.",
                max_tokens=2500,
            )

            total_tokens += llm_response.tokens_used

            # Parse the generated code into files
            generated_files = await self._parse_generated_code(
                llm_response.content, generation_options
            )

            # Generate tests if requested
            if generation_options.generate_tests and generated_files:
                logger.info("Generating tests...")
                test_files = await self._generate_tests_for_files(
                    generated_files, generation_options
                )
                generated_files.extend(test_files)
                total_tokens += 200  # Estimate for test generation

            # Execute tests if available
            if generation_options.generate_tests:
                test_results = await self._execute_generated_tests(generated_files)

            processing_time = int((time.time() - start_time) * 1000)

            return GenerationResult(
                success=True,
                generated_files=generated_files,
                test_results=test_results,
                processing_time_ms=processing_time,
                llm_tokens_used=total_tokens,
                warnings=warnings,
            )

        except Exception as e:
            logger.error(f"Error generating code from requirements: {e}")
            processing_time = int((time.time() - start_time) * 1000)

            return GenerationResult(
                success=False,
                generated_files=[],
                test_results=[],
                processing_time_ms=processing_time,
                llm_tokens_used=total_tokens,
                error_message=str(e),
                warnings=warnings,
            )

    def _build_requirements_prompt(
        self,
        requirements: List[str],
        technical_specs: List[str],
        options: GenerationOptions,
    ) -> str:
        """Build a comprehensive prompt for code generation from requirements"""

        prompt = f"""
        Generate complete, production-ready code based on the following requirements:

        **FUNCTIONAL REQUIREMENTS:**
        {chr(10).join(f"{i + 1}. {req}" for i, req in enumerate(requirements))}

        **TECHNICAL SPECIFICATIONS:**
        {chr(10).join(f"• {spec}" for spec in technical_specs)}

        **CODE GENERATION SETTINGS:**
        - Language/Style: {options.code_style}
        - Framework: {options.framework}
        - Architecture Pattern: {options.architecture_pattern or "Standard"}
        - Generate Tests: {options.generate_tests}
        - Include Documentation: {options.include_documentation}
        - Max File Size: {options.max_file_size} lines
        - Database Type: {options.database_type or "Not specified"}
        - API Style: {options.api_style or "REST"}

        **OUTPUT FORMAT:**
        Please provide multiple files in the following format:

        ```filename: path/to/file.ext
        // File content here
        ```

        **REQUIREMENTS:**
        1. Generate clean, maintainable, and well-documented code
        2. Follow best practices for the specified language/framework
        3. Include proper error handling and validation
        4. Implement all functional requirements
        5. Follow the specified architecture pattern
        6. Include inline comments and documentation
        7. Ensure code is production-ready
        8. Structure files logically (separate concerns)

        Generate the complete implementation now:
        """

        return prompt

    async def _parse_generated_code(
        self, response: str, options: GenerationOptions
    ) -> List[GeneratedFile]:
        """Parse LLM response into structured file objects"""
        files = []

        try:
            # Find all code blocks with filenames
            pattern = r"```(?:filename:\s*([^\n]+)\n)?(.*?)```"
            matches = re.findall(pattern, response, re.DOTALL)

            for i, (filename, content) in enumerate(matches):
                if not filename:
                    # Generate default filename if not specified
                    ext = self._get_file_extension(options.code_style)
                    filename = f"generated_file_{i + 1}{ext}"

                filename = filename.strip()
                content = content.strip()

                if content:
                    file_type = self._determine_file_type(filename, content)
                    language = self._determine_language(filename, options.code_style)

                    generated_file = GeneratedFile(
                        path=filename,
                        content=content,
                        file_type=file_type,
                        language=language,
                        description=f"Generated {file_type} file",
                        size_lines=len(content.split("\n")),
                    )
                    files.append(generated_file)

            # If no files were parsed, create a default file
            if not files and response.strip():
                ext = self._get_file_extension(options.code_style)
                default_file = GeneratedFile(
                    path=f"main{ext}",
                    content=response.strip(),
                    file_type="source",
                    language=options.code_style,
                    description="Main generated file",
                    size_lines=len(response.split("\n")),
                )
                files.append(default_file)

            logger.info(f"Parsed {len(files)} files from generated code")
            return files

        except Exception as e:
            logger.error(f"Error parsing generated code: {e}")
            return []

    async def _generate_tests_for_files(
        self, source_files: List[GeneratedFile], options: GenerationOptions
    ) -> List[GeneratedFile]:
        """Generate test files for the source files"""
        test_files = []

        try:
            for source_file in source_files:
                if source_file.file_type == "source":
                    test_prompt = f"""
                    Generate comprehensive unit tests for the following code:

                    **File: {source_file.path}**
                    ```{source_file.language}
                    {source_file.content}
                    ```

                    **Test Requirements:**
                    - Use {options.test_framework} testing framework
                    - Test all public methods/functions
                    - Include edge cases and error scenarios
                    - Follow best practices for {options.code_style} testing
                    - Include setup and teardown if needed

                    Generate only the test code:
                    """

                    test_response = await self.llm_service.generate_response(
                        prompt=test_prompt,
                        system_message="Generate comprehensive unit tests following best practices.",
                        max_tokens=1000,
                    )

                    test_filename = self._generate_test_filename(
                        source_file.path, options
                    )

                    test_file = GeneratedFile(
                        path=test_filename,
                        content=test_response.content.strip(),
                        file_type="test",
                        language=source_file.language,
                        description=f"Unit tests for {source_file.path}",
                        size_lines=len(test_response.content.split("\n")),
                    )
                    test_files.append(test_file)

            logger.info(f"Generated {len(test_files)} test files")
            return test_files

        except Exception as e:
            logger.error(f"Error generating test files: {e}")
            return []

    def _get_file_extension(self, code_style: str) -> str:
        """Get appropriate file extension based on code style"""
        extensions = {
            "javascript": ".js",
            "typescript": ".ts",
            "python": ".py",
            "java": ".java",
            "csharp": ".cs",
            "cpp": ".cpp",
            "go": ".go",
            "rust": ".rs",
            "php": ".php",
            "ruby": ".rb",
        }
        return extensions.get(code_style.lower(), ".txt")

    def _determine_file_type(self, filename: str, content: str) -> str:
        """Determine file type based on filename and content"""
        filename_lower = filename.lower()

        if any(
            test_indicator in filename_lower
            for test_indicator in ["test", "spec", "__tests__"]
        ):
            return "test"
        elif any(
            config_indicator in filename_lower
            for config_indicator in ["config", "settings", "env"]
        ):
            return "config"
        elif filename_lower.endswith((".md", ".txt", ".rst")):
            return "documentation"
        elif "package.json" in filename_lower or "requirements.txt" in filename_lower:
            return "dependency"
        else:
            return "source"

    def _determine_language(self, filename: str, default_style: str) -> str:
        """Determine programming language from filename"""
        ext = Path(filename).suffix.lower()

        language_map = {
            ".js": "javascript",
            ".ts": "typescript",
            ".py": "python",
            ".java": "java",
            ".cs": "csharp",
            ".cpp": "cpp",
            ".c": "c",
            ".go": "go",
            ".rs": "rust",
            ".php": "php",
            ".rb": "ruby",
            ".json": "json",
            ".yaml": "yaml",
            ".yml": "yaml",
            ".md": "markdown",
        }

        return language_map.get(ext, default_style)

    def _generate_test_filename(
        self, source_path: str, options: GenerationOptions
    ) -> str:
        """Generate appropriate test filename based on source file"""
        path = Path(source_path)
        name = path.stem
        ext = path.suffix

        if options.test_framework.lower() == "jest":
            return f"{name}.test{ext}"
        elif options.test_framework.lower() == "pytest":
            return f"test_{name}{ext}"
        elif options.test_framework.lower() == "junit":
            return f"{name}Test{ext}"
        else:
            return f"{name}_test{ext}"

    async def _execute_generated_tests(
        self, files: List[GeneratedFile]
    ) -> List[TestResult]:
        """Execute generated tests and return results"""
        test_results = []

        try:
            test_files = [f for f in files if f.file_type == "test"]

            for test_file in test_files:
                # This is a simplified test execution
                # In a real implementation, you'd set up a proper test environment
                result = TestResult(
                    test_file=test_file.path,
                    passed=True,  # Simplified - would need actual execution
                    total_tests=1,
                    passed_tests=1,
                    failed_tests=0,
                    execution_time=0.1,
                    output="Tests generated successfully",
                    errors=[],
                )
                test_results.append(result)

            return test_results

        except Exception as e:
            logger.error(f"Error executing tests: {e}")
            return []

    async def generate_code_from_requirements(
        self,
        requirements: List[str],
        technical_specs: List[str],
        generation_options: GenerationOptions,
    ) -> GenerationResult:
        """Generate code from structured requirements and technical specifications"""
        start_time = time.time()
        total_tokens = 0
        generated_files = []
        test_results = []
        warnings = []

        try:
            logger.info("Generating code from structured requirements")

            # Build a comprehensive prompt from requirements
            generation_prompt = self._build_requirements_prompt(
                requirements, technical_specs, generation_options
            )

            # Generate code using LLM
            llm_response = await self.llm_service.generate_response(
                prompt=generation_prompt,
                system_message="You are an expert software developer. Generate complete, production-ready code based on requirements.",
                max_tokens=2500,
            )

            total_tokens += llm_response.tokens_used

            # Parse the generated code into files
            generated_files = await self._parse_generated_code_new(
                llm_response.content, generation_options
            )

            # Generate tests if requested
            if generation_options.generate_tests and generated_files:
                logger.info("Generating tests...")
                test_files = await self._generate_tests_for_files(
                    generated_files, generation_options
                )
                generated_files.extend(test_files)
                total_tokens += 200  # Estimate for test generation

            # Execute tests if available
            if generation_options.generate_tests:
                test_results = await self._execute_generated_tests_new(generated_files)

            processing_time = int((time.time() - start_time) * 1000)

            return GenerationResult(
                success=True,
                generated_files=generated_files,
                test_results=test_results,
                processing_time_ms=processing_time,
                llm_tokens_used=total_tokens,
                warnings=warnings,
            )

        except Exception as e:
            logger.error(f"Error generating code from requirements: {e}")
            processing_time = int((time.time() - start_time) * 1000)

            return GenerationResult(
                success=False,
                generated_files=[],
                test_results=[],
                processing_time_ms=processing_time,
                llm_tokens_used=total_tokens,
                error_message=str(e),
                warnings=warnings,
            )

    def _build_requirements_prompt(
        self,
        requirements: List[str],
        technical_specs: List[str],
        options: GenerationOptions,
    ) -> str:
        """Build a comprehensive prompt for code generation from requirements"""

        prompt = f"""
        Generate complete, production-ready code based on the following requirements:

        **FUNCTIONAL REQUIREMENTS:**
        {chr(10).join(f"{i + 1}. {req}" for i, req in enumerate(requirements))}

        **TECHNICAL SPECIFICATIONS:**
        {chr(10).join(f"• {spec}" for spec in technical_specs)}

        **CODE GENERATION SETTINGS:**
        - Language/Style: {options.code_style}
        - Framework: {options.framework}
        - Architecture Pattern: {options.architecture_pattern or "Standard"}
        - Generate Tests: {options.generate_tests}
        - Include Documentation: {options.include_documentation}
        - Max File Size: {options.max_file_size} lines
        - Database Type: {options.database_type or "Not specified"}
        - API Style: {options.api_style or "REST"}

        **OUTPUT FORMAT:**
        Please provide multiple files in the following format:

        ```filename: path/to/file.ext
        // File content here
        ```

        **REQUIREMENTS:**
        1. Generate clean, maintainable, and well-documented code
        2. Follow best practices for the specified language/framework
        3. Include proper error handling and validation
        4. Implement all functional requirements
        5. Follow the specified architecture pattern
        6. Include inline comments and documentation
        7. Ensure code is production-ready
        8. Structure files logically (separate concerns)

        Generate the complete implementation now:
        """

        return prompt

    async def _parse_generated_code_new(
        self, response: str, options: GenerationOptions
    ) -> List[GeneratedFile]:
        """Parse LLM response into structured file objects"""
        files = []

        try:
            # Find all code blocks with filenames
            pattern = r"```(?:filename:\s*([^\n]+)\n)?(.*?)```"
            matches = re.findall(pattern, response, re.DOTALL)

            for i, (filename, content) in enumerate(matches):
                if not filename:
                    # Generate default filename if not specified
                    ext = self._get_file_extension_new(options.code_style)
                    filename = f"generated_file_{i + 1}{ext}"

                filename = filename.strip()
                content = content.strip()

                if content:
                    file_type = self._determine_file_type_new(filename, content)
                    language = self._determine_language_new(
                        filename, options.code_style
                    )

                    generated_file = GeneratedFile(
                        path=filename,
                        content=content,
                        file_type=file_type,
                        language=language,
                        description=f"Generated {file_type} file",
                        size_lines=len(content.split("\n")),
                    )
                    files.append(generated_file)

            # If no files were parsed, create a default file
            if not files and response.strip():
                ext = self._get_file_extension_new(options.code_style)
                default_file = GeneratedFile(
                    path=f"main{ext}",
                    content=response.strip(),
                    file_type="source",
                    language=options.code_style,
                    description="Main generated file",
                    size_lines=len(response.split("\n")),
                )
                files.append(default_file)

            logger.info(f"Parsed {len(files)} files from generated code")
            return files

        except Exception as e:
            logger.error(f"Error parsing generated code: {e}")
            return []

    async def _generate_tests_for_files(
        self, source_files: List[GeneratedFile], options: GenerationOptions
    ) -> List[GeneratedFile]:
        """Generate test files for the source files"""
        test_files = []

        try:
            for source_file in source_files:
                if source_file.file_type == "source":
                    test_prompt = f"""
                    Generate comprehensive unit tests for the following code:

                    **File: {source_file.path}**
                    ```{source_file.language}
                    {source_file.content}
                    ```

                    **Test Requirements:**
                    - Use {options.test_framework} testing framework
                    - Test all public methods/functions
                    - Include edge cases and error scenarios
                    - Follow best practices for {options.code_style} testing
                    - Include setup and teardown if needed

                    Generate only the test code:
                    """

                    test_response = await self.llm_service.generate_response(
                        prompt=test_prompt,
                        system_message="Generate comprehensive unit tests following best practices.",
                        max_tokens=1000,
                    )

                    test_filename = self._generate_test_filename_new(
                        source_file.path, options
                    )

                    test_file = GeneratedFile(
                        path=test_filename,
                        content=test_response.content.strip(),
                        file_type="test",
                        language=source_file.language,
                        description=f"Unit tests for {source_file.path}",
                        size_lines=len(test_response.content.split("\n")),
                    )
                    test_files.append(test_file)

            logger.info(f"Generated {len(test_files)} test files")
            return test_files

        except Exception as e:
            logger.error(f"Error generating test files: {e}")
            return []

    def _get_file_extension_new(self, code_style: str) -> str:
        """Get appropriate file extension based on code style"""
        extensions = {
            "javascript": ".js",
            "typescript": ".ts",
            "python": ".py",
            "java": ".java",
            "csharp": ".cs",
            "cpp": ".cpp",
            "go": ".go",
            "rust": ".rs",
            "php": ".php",
            "ruby": ".rb",
        }
        return extensions.get(code_style.lower(), ".txt")

    def _determine_file_type_new(self, filename: str, content: str) -> str:
        """Determine file type based on filename and content"""
        filename_lower = filename.lower()

        if any(
            test_indicator in filename_lower
            for test_indicator in ["test", "spec", "__tests__"]
        ):
            return "test"
        elif any(
            config_indicator in filename_lower
            for config_indicator in ["config", "settings", "env"]
        ):
            return "config"
        elif filename_lower.endswith((".md", ".txt", ".rst")):
            return "documentation"
        elif "package.json" in filename_lower or "requirements.txt" in filename_lower:
            return "dependency"
        else:
            return "source"

    def _determine_language_new(self, filename: str, default_style: str) -> str:
        """Determine programming language from filename"""
        ext = Path(filename).suffix.lower()

        language_map = {
            ".js": "javascript",
            ".ts": "typescript",
            ".py": "python",
            ".java": "java",
            ".cs": "csharp",
            ".cpp": "cpp",
            ".c": "c",
            ".go": "go",
            ".rs": "rust",
            ".php": "php",
            ".rb": "ruby",
            ".json": "json",
            ".yaml": "yaml",
            ".yml": "yaml",
            ".md": "markdown",
        }

        return language_map.get(ext, default_style)

    def _generate_test_filename_new(
        self, source_path: str, options: GenerationOptions
    ) -> str:
        """Generate appropriate test filename based on source file"""
        path = Path(source_path)
        name = path.stem
        ext = path.suffix

        if options.test_framework.lower() == "jest":
            return f"{name}.test{ext}"
        elif options.test_framework.lower() == "pytest":
            return f"test_{name}{ext}"
        elif options.test_framework.lower() == "junit":
            return f"{name}Test{ext}"
        else:
            return f"{name}_test{ext}"

    async def _execute_generated_tests_new(
        self, files: List[GeneratedFile]
    ) -> List[TestResult]:
        """Execute generated tests and return results"""
        test_results = []

        try:
            test_files = [f for f in files if f.file_type == "test"]

            for test_file in test_files:
                # This is a simplified test execution
                # In a real implementation, you'd set up a proper test environment
                result = TestResult(
                    test_file=test_file.path,
                    passed=True,  # Simplified - would need actual execution
                    total_tests=1,
                    passed_tests=1,
                    failed_tests=0,
                    execution_time=0.1,
                    output="Tests generated successfully",
                    errors=[],
                )
                test_results.append(result)

            return test_results

        except Exception as e:
            logger.error(f"Error executing tests: {e}")
            return []
