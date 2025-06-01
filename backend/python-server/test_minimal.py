#!/usr/bin/env python3
"""
Minimal FastAPI server test
"""

import sys
import os
from pathlib import Path

# Add src to path
current_dir = Path(__file__).parent
src_path = current_dir / "src"
sys.path.insert(0, str(src_path))


def main():
    print("🚀 Testing Void Editor Python Server")
    print("=" * 50)

    try:
        # Test imports
        print("1. Testing core imports...")
        import fastapi
        import uvicorn

        print("   ✅ FastAPI and Uvicorn imported")

        # Test config
        print("2. Testing configuration...")
        from core.config import settings

        print(f"   ✅ Config loaded - Environment: {settings.ENVIRONMENT}")
        print(f"   ✅ Server configured for {settings.HOST}:{settings.PORT}")

        # Test application creation
        print("3. Testing application creation...")
        from main import create_application

        _ = create_application()  # Use underscore for unused result
        print("   ✅ FastAPI application created successfully")

        print("\n🎉 Python server is ready!")
        print(
            f"💡 To start the server, run: uvicorn src.main:app --host {settings.HOST} --port {settings.PORT} --reload"
        )

        return True

    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback

        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
