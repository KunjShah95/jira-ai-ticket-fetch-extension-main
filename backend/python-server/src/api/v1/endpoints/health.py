from fastapi import APIRouter, HTTPException
from typing import Dict, Any
from datetime import datetime
import psutil
import asyncio
from loguru import logger

from src.core.config import settings

router = APIRouter()


@router.get("/", summary="Basic health check")
async def health_check() -> Dict[str, Any]:
    """
    Basic health check endpoint.
    Returns service status and basic information.
    """

    return {
        "status": "healthy",
        "service": "void-editor-python-server",
        "version": "1.0.0",
        "timestamp": datetime.now().isoformat(),
        "environment": settings.ENVIRONMENT,
        "llm_provider": settings.LLM_PROVIDER,
    }


@router.get("/detailed", summary="Detailed health check")
async def detailed_health_check() -> Dict[str, Any]:
    """
    Detailed health check with system metrics and service status.
    """

    try:
        # System metrics
        cpu_percent = psutil.cpu_percent(interval=1)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage("/")

        # LLM service status
        llm_status = await _check_llm_service()

        # Service dependencies
        dependencies = await _check_dependencies()

        health_data = {
            "status": "healthy",
            "service": "void-editor-python-server",
            "version": "1.0.0",
            "timestamp": datetime.now().isoformat(),
            "environment": settings.ENVIRONMENT,
            "system": {
                "cpu_percent": cpu_percent,
                "memory": {
                    "total": memory.total,
                    "available": memory.available,
                    "percent": memory.percent,
                    "used": memory.used,
                },
                "disk": {
                    "total": disk.total,
                    "free": disk.free,
                    "percent": (disk.used / disk.total) * 100,
                },
            },
            "llm_service": llm_status,
            "dependencies": dependencies,
            "configuration": {
                "llm_provider": settings.LLM_PROVIDER,
                "debug_mode": settings.DEBUG,
                "log_level": settings.LOG_LEVEL,
            },
        }

        # Determine overall status
        if not llm_status["available"] or any(
            not dep["available"] for dep in dependencies.values()
        ):
            health_data["status"] = "degraded"

        return health_data

    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Health check failed: {str(e)}")


@router.get("/llm", summary="LLM service health check")
async def llm_health_check() -> Dict[str, Any]:
    """
    Check the health and availability of the LLM service.
    """

    try:
        llm_status = await _check_llm_service()

        return {
            "status": "healthy" if llm_status["available"] else "unhealthy",
            "llm_service": llm_status,
            "timestamp": datetime.now().isoformat(),
        }

    except Exception as e:
        logger.error(f"LLM health check failed: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"LLM health check failed: {str(e)}"
        )


@router.get("/metrics", summary="Service metrics")
async def get_metrics() -> Dict[str, Any]:
    """
    Get detailed service metrics and performance data.
    """

    try:
        # System metrics
        cpu_percent = psutil.cpu_percent(interval=1)
        memory = psutil.virtual_memory()

        # Process metrics
        process = psutil.Process()
        process_memory = process.memory_info()

        return {
            "timestamp": datetime.now().isoformat(),
            "system": {
                "cpu_percent": cpu_percent,
                "memory_percent": memory.percent,
                "available_memory_gb": memory.available / (1024**3),
                "total_memory_gb": memory.total / (1024**3),
            },
            "process": {
                "pid": process.pid,
                "memory_rss_mb": process_memory.rss / (1024**2),
                "memory_vms_mb": process_memory.vms / (1024**2),
                "cpu_percent": process.cpu_percent(),
                "num_threads": process.num_threads(),
                "create_time": datetime.fromtimestamp(
                    process.create_time()
                ).isoformat(),
            },
            "service": {
                "environment": settings.ENVIRONMENT,
                "llm_provider": settings.LLM_PROVIDER,
                "debug_mode": settings.DEBUG,
            },
        }

    except Exception as e:
        logger.error(f"Metrics collection failed: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Metrics collection failed: {str(e)}"
        )


async def _check_llm_service() -> Dict[str, Any]:
    """Check LLM service availability"""

    try:
        from src.services.llm_factory import get_llm_service

        llm_service = get_llm_service()

        # Try a simple test call (this could be expanded)
        test_response = {
            "available": True,
            "provider": settings.LLM_PROVIDER,
            "model": llm_service.model_name,
            "api_key_configured": bool(llm_service.api_key),
            "last_check": datetime.now().isoformat(),
        }

        # Could add actual API test here if needed
        # test_result = await llm_service.generate_code(...)

        return test_response

    except Exception as e:
        logger.warning(f"LLM service check failed: {str(e)}")
        return {
            "available": False,
            "provider": settings.LLM_PROVIDER,
            "error": str(e),
            "last_check": datetime.now().isoformat(),
        }


async def _check_dependencies() -> Dict[str, Dict[str, Any]]:
    """Check external dependencies"""

    dependencies = {}

    # Check Node.js (for running JavaScript tests)
    dependencies["nodejs"] = await _check_command_availability("node --version")

    # Check npm (for package management)
    dependencies["npm"] = await _check_command_availability("npm --version")

    # Check Python (for running Python tests)
    dependencies["python"] = await _check_command_availability("python --version")

    # Check Git (for version control operations)
    dependencies["git"] = await _check_command_availability("git --version")

    return dependencies


async def _check_command_availability(command: str) -> Dict[str, Any]:
    """Check if a command is available in the system"""

    try:
        process = await asyncio.create_subprocess_shell(
            command, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )

        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=5)

        return {
            "available": process.returncode == 0,
            "version": stdout.decode().strip() if stdout else None,
            "last_check": datetime.now().isoformat(),
        }

    except asyncio.TimeoutError:
        return {
            "available": False,
            "error": "Command timed out",
            "last_check": datetime.now().isoformat(),
        }
    except Exception as e:
        return {
            "available": False,
            "error": str(e),
            "last_check": datetime.now().isoformat(),
        }
