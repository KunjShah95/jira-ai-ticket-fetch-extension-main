import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from contextlib import asynccontextmanager
from loguru import logger

from src.core.config import settings
from src.api.v1.api import api_router
from src.core.logging import setup_logging
from src.api.v1.endpoints.generation import (
    value_error_handler,
    general_exception_handler,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    # Startup
    logger.info("🚀 Starting Void Editor Python Server")
    logger.info(f"Environment: {settings.ENVIRONMENT}")
    logger.info(f"LLM Provider: {settings.LLM_PROVIDER}")

    # Initialize services
    try:
        # You can add startup tasks here like:
        # - Database connection
        # - Redis connection
        # - Model loading
        logger.info("✅ All services initialized successfully")
        yield
    except Exception as e:
        logger.error(f"❌ Failed to initialize services: {e}")
        raise
    finally:
        # Shutdown
        logger.info("🛑 Shutting down Void Editor Python Server")


def create_application() -> FastAPI:
    """Create FastAPI application with all configurations"""

    app = FastAPI(
        title="Void Editor AI Code Generator",
        description="FastAPI server for AI-powered code generation from Jira tickets",
        version="1.0.0",
        docs_url="/docs" if settings.DEBUG else None,
        redoc_url="/redoc" if settings.DEBUG else None,
        lifespan=lifespan,
    )

    # CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Trusted host middleware
    if not settings.DEBUG:
        app.add_middleware(
            TrustedHostMiddleware,
            allowed_hosts=["localhost", "127.0.0.1", "*.yourdomain.com"],
        )

    # Include API router
    app.include_router(api_router, prefix="/api/v1")

    # Register global exception handlers
    app.add_exception_handler(ValueError, value_error_handler)
    app.add_exception_handler(Exception, general_exception_handler)

    # Health check endpoint
    @app.get("/health")
    async def health_check():
        return {
            "status": "healthy",
            "service": "void-editor-python-server",
            "version": "1.0.0",
            "environment": settings.ENVIRONMENT,
            "llm_provider": settings.LLM_PROVIDER,
        }

    # Root endpoint
    @app.get("/")
    async def root():
        return {"message": "Void Editor Python backend is running."}

    return app


app = create_application()


def main():
    """Main entry point"""
    # Setup logging
    setup_logging()

    # Run server
    uvicorn.run(
        "src.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level=settings.LOG_LEVEL.lower(),
        access_log=True,
    )


if __name__ == "__main__":
    main()
