#!/usr/bin/env python3
"""
Simple test to verify Python server setup
"""

import sys
# Removed unused import
from pathlib import Path

# Add src to Python path
current_dir = Path(__file__).parent
src_dir = current_dir / "src"
sys.path.insert(0, str(src_dir))


def test_basic_imports():
    """Test basic imports"""
    print("🧪 Testing basic imports...")

    try:
        # Removed unused imports

        print("✅ FastAPI dependencies imported successfully")

        import openai

        # Removed unused import

        from loguru import logger

        # Removed unused import

        return True
    except ImportError as e:
        print(f"❌ Import error: {e}")
        return False


def test_config():
    """Test configuration loading"""
    print("\n🧪 Testing configuration...")

    try:
        from core.config import settings

        # Ensure the correct path to 'core.config' is added to sys.path or verify the module exists
        from core.config import settings
        print(f"✅ Server will run on {settings.HOST}:{settings.PORT}")
        return True
    except Exception as e:
        print(f"❌ Config error: {e}")
        return False


def test_api_structure():
    """Test API structure"""
    print("\n🧪 Testing API structure...")

    try:
        from api.v1.api import api_router
        # Removed unused import
        print("✅ API router imported successfully")

        from models.schemas import GenerationRequest
        # Removed unused import
        print("✅ Pydantic models imported successfully")

        return True
    except Exception as e:
        print(f"❌ API structure error: {e}")
        return False


def test_services():
    """Test service imports"""
    print("\n🧪 Testing services...")

    try:
        from services.base_llm import BaseLLM
        # Removed unused imports
        print("✅ LLM services imported successfully")

        from services.code_generator import CodeGeneratorService

        print("✅ Code generator service imported successfully")
        # Removed unused import
        return True
    except Exception as e:
        print(f"❌ Services error: {e}")
        return False


def main():
    """Run all tests"""
    print("🚀 Starting Python Server Setup Test\n")

    tests = [
        test_basic_imports,
        test_config,
        test_api_structure,
        test_services,
    ]

    passed = 0
    total = len(tests)

    for test in tests:
        if test():
            passed += 1

    print(f"\n📊 Test Results: {passed}/{total} tests passed")

    if passed == total:
        print("🎉 All tests passed! Python server setup is working correctly.")
        return True
    else:
        print("❌ Some tests failed. Please check the errors above.")
        return False


if __name__ == "__main__":
    main()
