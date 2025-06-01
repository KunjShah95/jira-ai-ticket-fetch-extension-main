"""
Quick test script to verify the Python FastAPI server setup
"""

import asyncio
import sys
# Removed unused import
from pathlib import Path

# Add src to Python path
sys.path.append(str(Path(__file__).parent / "src"))

async def test_imports():
	"""Test that all imports work correctly"""
	print("Testing imports...")

	try:
		# Test core imports
		from src.core.config import settings
		from src.core.logging import setup_logging
		print("✅ Core modules imported successfully")

		# Test model imports
		from src.models.schemas import (
			GenerationRequest,
			JiraTicketData,
			GenerationOptions,
		)
		print("✅ Model schemas imported successfully")

		# Test service imports
		from src.services.llm_factory import LLMFactory, get_llm_service
		from src.services.code_generator import CodeGeneratorService
		print("✅ Service modules imported successfully")

		# Test API imports
		from src.api.v1.api import api_router
		print("✅ API modules imported successfully")

		# Test main app
		from src.main import create_application
		print("✅ Main application imported successfully")

		return True

	except ImportError as e:
		print(f"❌ Import error: {e}")
		return False
	except Exception as e:
		print(f"❌ Unexpected error: {e}")
		return False


async def test_basic_functionality():
	"""Test basic functionality without external API calls"""
	print("\nTesting basic functionality...")

	try:
		# Test configuration
		from src.core.config import settings

		print(f"✅ Configuration loaded: {settings.ENVIRONMENT} environment")

		# Test LLM factory
		from src.services.llm_factory import LLMFactory

		providers = LLMFactory.get_available_providers()
		print(f"✅ Available LLM providers: {providers}")

		# Test schemas
		from src.models.schemas import (
			JiraTicketData,
			GenerationOptions,
			GenerationRequest,
			UserContext,
		)
		from datetime import datetime

		ticket_data = JiraTicketData(
			key="TEST-123", summary="Test ticket", description="This is a test ticket"
		)

		generation_options = GenerationOptions(
			code_style="typescript", framework="react"
		)

		user_context = UserContext(user_id="test-user", timestamp=datetime.now())

		request = GenerationRequest(
			ticket_data=ticket_data,
			generation_options=generation_options,
			user_context=user_context,
		)

		print(f"✅ Schema validation successful: {request.ticket_data.key}")

		return True

	except Exception as e:
		print(f"❌ Functionality test failed: {e}")
		return False


async def test_app_creation():
	"""Test FastAPI app creation"""
	print("\nTesting FastAPI app creation...")

	try:
		from src.main import create_application

		app = create_application()

		print(f"✅ FastAPI app created: {app.title}")
		print(f"✅ App version: {app.version}")

		# Check routes
		routes = [route.path for route in app.routes]
		print(f"✅ Available routes: {len(routes)} routes registered")

		return True

	except Exception as e:
		print(f"❌ App creation failed: {e}")
		return False


async def main():
	"""Run all tests"""
	print("🚀 Starting Void Editor Python Server Tests\n")

	# Setup logging for tests
	from src.core.logging import setup_logging

	setup_logging()

	tests = [test_imports, test_basic_functionality, test_app_creation]

	results = []
	for test in tests:
		result = await test()
		results.append(result)

	print(f"\n📊 Test Results:")
	print(f"\n📊 Test Results:")
	print(f"✅ Passed: {sum(results)}")
	print(f"❌ Failed: {len(results) - sum(results)}")
	print(f"📈 Success Rate: {(sum(results) / len(results)) * 100:.1f}%")
	print(f"\n📊 Test Results:")
	print(f"✅ Passed: {sum(results)}")
	print(f"❌ Failed: {len(results) - sum(results)}")
	print(f"📈 Success Rate: {(sum(results) / len(results)) * 100:.1f}%")
	if all(results):
		print("\n🎉 All tests passed! The Python server is ready to run.")
		print("\nTo start the server, run:")
		print("cd d:\\void\\backend\\python-server")
		print("python -m src.main")
	else:
		print("\n⚠️ Some tests failed. Please check the error messages above.")

	return all(results)
