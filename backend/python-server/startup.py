"""
Simple startup script for the Void Editor Python FastAPI server
"""

import sys
from pathlib import Path

# Add src to Python path
sys.path.insert(0, str(Path(__file__).parent / "src"))


def check_dependencies():
    """Check if required dependencies are installed"""
    required_packages = ["fastapi", "uvicorn", "pydantic", "loguru"]

    missing_packages = []

    for package in required_packages:
        try:
            __import__(package)
            print(f"✅ {package} is installed")
        except ImportError:
            print(f"❌ {package} is missing")
            missing_packages.append(package)

    if missing_packages:
        print(f"\nMissing packages: {', '.join(missing_packages)}")
        print("Please install them with: pip install -r requirements.txt")
        return False

    return True


def start_server():
    """Start the FastAPI server"""
    try:
        print("🚀 Starting Void Editor Python Server...")

        # Import after dependencies check
        from src.main import main

        print("📋 Configuration:")
        from src.core.config import settings

        print(f"   Environment: {settings.ENVIRONMENT}")
        print(f"   Host: {settings.HOST}")
        print(f"   Port: {settings.PORT}")
        print(f"   LLM Provider: {settings.LLM_PROVIDER}")
        print(f"   Debug Mode: {settings.DEBUG}")

        # Start the server
        main()

    except ImportError as e:
        print(f"❌ Import error: {e}")
        print("Please make sure all dependencies are installed.")
        return False
    except Exception as e:
        print(f"❌ Server startup failed: {e}")
        return False


if __name__ == "__main__":
    print("🔧 Void Editor Python Server Startup")
    print("=" * 50)

    # Check dependencies first
    if check_dependencies():
        print("\n" + "=" * 50)
        start_server()
    else:
        print("\n❌ Cannot start server due to missing dependencies.")
        sys.exit(1)
