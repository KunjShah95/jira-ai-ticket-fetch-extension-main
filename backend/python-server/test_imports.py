import sys
import os
from pathlib import Path

# Add src to path
sys.path.insert(0, "src")

print("🧪 Testing Python server setup...")

try:
    # Test basic imports
    import fastapi
    import uvicorn
    import pydantic

    print("✅ FastAPI core packages imported")

    # Test config
    from core.config import settings

    print(f"✅ Config loaded - Environment: {settings.ENVIRONMENT}")

    # Test logging
    from core.logging import setup_logging

    print("✅ Logging module imported")

    # Test models
    from models.schemas import GenerationRequest

    print("✅ Pydantic schemas imported")

    # Test services
    from services.base_llm import BaseLLM
    from services.openai_llm import OpenAILLM

    print("✅ LLM services imported")

    from services.code_generator import CodeGeneratorService

    print("✅ Code generator imported")

    # Test API
    from api.v1.api import api_router

    print("✅ API router imported")

    print("\n🎉 All imports successful! Python server is ready.")

except Exception as e:
    print(f"❌ Error: {e}")
    import traceback

    traceback.print_exc()
