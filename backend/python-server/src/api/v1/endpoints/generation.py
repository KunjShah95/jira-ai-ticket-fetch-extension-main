from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from typing import Dict, Any
from loguru import logger

from src.models.schemas import GenerationRequest, GenerationResult, ErrorResponse
from src.services.code_generator import CodeGeneratorService
from src.core.config import settings

router = APIRouter()

# Global code generator instance
code_generator = CodeGeneratorService()


@router.post(
    "/code", response_model=GenerationResult, summary="Generate code from Jira ticket"
)
async def generate_code(
    request: GenerationRequest, background_tasks: BackgroundTasks
) -> GenerationResult:
    """
    Generate code based on Jira ticket data.

    This endpoint accepts Jira ticket information and generation options,
    then uses AI to generate production-ready code with tests and documentation.
    """

    try:
        logger.info(
            f"Code generation request received for ticket: {request.ticket_data.key}"
        )
        logger.debug(f"Generation options: {request.generation_options}")

        # Validate request
        _validate_generation_request(request)

        # Generate code
        result = await code_generator.generate_code_from_ticket(request)

        # Schedule cleanup of temporary files in the background
        if result.metadata and "temp_workspace" in result.metadata:
            background_tasks.add_task(
                _cleanup_temp_workspace, result.metadata["temp_workspace"]
            )

        logger.info(
            f"Code generation completed for ticket {request.ticket_data.key}: "
            f"Success={result.success}, Files={len(result.generated_files)}"
        )

        return result

    except ValueError as e:
        logger.warning(f"Invalid request: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Code generation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Code generation failed: {str(e)}")


@router.post("/review", summary="Review generated code")
async def review_code(code: str, language: str = "typescript") -> Dict[str, Any]:
    """
    Review code and provide suggestions for improvement.
    """

    try:
        logger.info(f"Code review request for {language} code")

        from src.services.llm_factory import get_llm_service

        llm_service = get_llm_service()

        review_result = await llm_service.review_code(code, language)

        return {
            "success": True,
            "review": review_result.content,
            "tokens_used": review_result.tokens_used,
            "model_used": review_result.model_used,
        }

    except Exception as e:
        logger.error(f"Code review failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Code review failed: {str(e)}")


@router.post("/explain", summary="Explain code functionality")
async def explain_code(code: str, language: str = "typescript") -> Dict[str, Any]:
    """
    Generate explanation and documentation for provided code.
    """

    try:
        logger.info(f"Code explanation request for {language} code")

        from src.services.llm_factory import get_llm_service

        llm_service = get_llm_service()

        explanation_result = await llm_service.explain_code(code, language)

        return {
            "success": True,
            "explanation": explanation_result.content,
            "tokens_used": explanation_result.tokens_used,
            "model_used": explanation_result.model_used,
        }

    except Exception as e:
        logger.error(f"Code explanation failed: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Code explanation failed: {str(e)}"
        )


@router.post("/test", summary="Generate tests for code")
async def generate_tests(
    source_code: str, file_path: str, test_framework: str = "jest"
) -> Dict[str, Any]:
    """
    Generate comprehensive tests for the provided source code.
    """

    try:
        logger.info(f"Test generation request for {file_path} using {test_framework}")

        from src.services.llm_factory import get_llm_service

        llm_service = get_llm_service()

        test_result = await llm_service.generate_tests(
            source_code, file_path, test_framework
        )

        return {
            "success": True,
            "tests": test_result.content,
            "tokens_used": test_result.tokens_used,
            "model_used": test_result.model_used,
            "test_framework": test_framework,
        }

    except Exception as e:
        logger.error(f"Test generation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Test generation failed: {str(e)}")


@router.get("/providers", summary="Get available LLM providers")
async def get_llm_providers() -> Dict[str, Any]:
    """
    Get list of available LLM providers and current configuration.
    """

    try:
        from src.services.llm_factory import LLMFactory

        providers = LLMFactory.get_available_providers()

        return {
            "available_providers": providers,
            "current_provider": settings.LLM_PROVIDER,
            "current_model": {
                "openai": settings.OPENAI_MODEL,
                "anthropic": settings.ANTHROPIC_MODEL,
            },
        }

    except Exception as e:
        logger.error(f"Failed to get LLM providers: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Failed to get providers: {str(e)}"
        )


def _validate_generation_request(request: GenerationRequest):
    """Validate generation request parameters"""

    # Check required fields
    if not request.ticket_data.key:
        raise ValueError("Ticket key is required")

    if not request.ticket_data.summary:
        raise ValueError("Ticket summary is required")

    # Validate generation options
    if request.generation_options.max_file_size <= 0:
        raise ValueError("Max file size must be greater than 0")

    if request.generation_options.max_file_size > 10000:
        raise ValueError("Max file size cannot exceed 10000 lines")

    # Validate supported languages and frameworks
    supported_languages = ["typescript", "javascript", "python", "java", "csharp"]
    if request.generation_options.code_style not in supported_languages:
        raise ValueError(
            f"Unsupported language: {request.generation_options.code_style}"
        )

    supported_test_frameworks = ["jest", "vitest", "pytest", "junit", "nunit"]
    if request.generation_options.test_framework not in supported_test_frameworks:
        raise ValueError(
            f"Unsupported test framework: {request.generation_options.test_framework}"
        )


async def _cleanup_temp_workspace(workspace_path: str):
    """Background task to cleanup temporary workspace"""

    try:
        import shutil
        import os

        if os.path.exists(workspace_path):
            shutil.rmtree(workspace_path)
            logger.debug(f"Cleaned up temporary workspace: {workspace_path}")
    except Exception as e:
        logger.warning(f"Failed to cleanup workspace {workspace_path}: {str(e)}")


# Exception handlers (removed from router, to be registered in main app)
async def value_error_handler(request, exc):
    """Handle validation errors"""
    logger.warning(f"Validation error: {str(exc)}")
    return JSONResponse(
        status_code=400,
        content=ErrorResponse(error="validation_error", message=str(exc)).dict(),
    )


async def general_exception_handler(request, exc):
    """Handle general exceptions"""
    logger.error(f"Unexpected error: {str(exc)}")
    return JSONResponse(
        status_code=500,
        content=ErrorResponse(
            error="internal_error", message="An unexpected error occurred"
        ).dict(),
    )
