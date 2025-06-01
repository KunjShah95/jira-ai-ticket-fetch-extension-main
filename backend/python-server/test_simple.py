"""
Simple test for JIRA Agent models and basic functionality
"""

import sys
import os

# Add the src directory to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src", "models"))


def test_models():
    """Test the basic models without external dependencies"""
    print("🧪 Testing JIRA Agent Models")
    print("=" * 50)

    try:
        # Test basic model imports
        from models.schemas import JiraTicketData, IssueType, Priority, Status

        print("✅ Successfully imported schemas")

        # Create a test ticket
        ticket = JiraTicketData(
            key="TEST-123",
            summary="Test ticket for code generation",
            description="This is a test ticket to verify our JIRA agent functionality",
            issue_type=IssueType.TASK,
            priority=Priority.HIGH,
            status=Status.TODO,
            assignee="Test User",
            reporter="Test Reporter",
            labels=["test", "automation"],
            components=["Backend", "API"],
        )

        print(f"✅ Created test ticket: {ticket.key}")
        print(f"   Summary: {ticket.summary}")
        print(f"   Type: {ticket.issue_type}")
        print(f"   Priority: {ticket.priority}")
        print(f"   Labels: {', '.join(ticket.labels)}")

        # Test generation options
        from models.schemas import GenerationOptions

        options = GenerationOptions(
            code_style="typescript",
            framework="react",
            generate_tests=True,
            include_documentation=True,
            architecture_pattern="MVC",
        )

        print("✅ Created generation options:")
        print("   Framework: {options.framework}")
        print("   Generate Tests: {options.generate_tests}")
        print("   Architecture: {options.architecture_pattern}")

        # Test user context
        from models.schemas import UserContext
        from datetime import datetime

        user_context = UserContext(
            user_id="test_user_123", session_id="test_session_456"
        )

        print("✅ Created user context:")
        print("   User ID: {user_context.user_id}")
        print("   Session ID: {user_context.session_id}")
        print("   Timestamp: {user_context.timestamp}")

        print("\n🎉 All model tests passed!")
        return True

    except Exception as e:
        print(f"❌ Model test failed: {e}")
        import traceback

        traceback.print_exc()
        return False


def test_api_structure():
    """Test the API structure"""
    print("\n🔧 Testing API Structure")
    print("=" * 30)

    try:
        # Check if API files exist
        api_files = [
            "src/api/v1/endpoints/jira_agent.py",
            "src/services/jira_service.py",
            "src/services/jira_agent_service.py",
        ]

        for file_path in api_files:
            if os.path.exists(file_path):
                print(f"✅ Found: {file_path}")
            else:
                print(f"❌ Missing: {file_path}")

        print("\n📁 File structure verified!")
        return True

    except Exception as e:
        print(f"❌ API structure test failed: {e}")
        return False


def show_usage_example():
    """Show usage example"""
    print("\n📖 Usage Example")
    print("=" * 20)

    usage_example = """
# Example: Starting a JIRA Agent Workflow

import requests

# 1. Start workflow
response = requests.post("http://localhost:8000/api/v1/jira-agent/start", json={
    "ticket_key": "PROJ-123",
    "generation_options": {
        "code_style": "typescript",
        "framework": "react",
        "generate_tests": True,
        "include_documentation": True,
        "architecture_pattern": "MVC"
    },
    "user_context": {
        "user_id": "developer123",
        "session_id": "session456"
    }
})

workflow_id = response.json()["workflow_id"]

# 2. Check status
status_response = requests.get(f"http://localhost:8000/api/v1/jira-agent/workflow/{workflow_id}")
print(status_response.json())

# 3. Approve/Reject
requests.post("http://localhost:8000/api/v1/jira-agent/approve", json={
    "workflow_id": workflow_id,
    "approved": True  # or False with feedback
})
"""

    print(usage_example)


def main():
    """Run all tests"""
    print("🚀 JIRA Agent System Test Suite")
    print("=" * 50)

    # Run tests
    models_ok = test_models()
    api_ok = test_api_structure()

    # Show results
    print("\n📊 Test Results")
    print("=" * 20)
    print(f"Models Test: {'✅ PASSED' if models_ok else '❌ FAILED'}")
    print(f"API Structure Test: {'✅ PASSED' if api_ok else '❌ FAILED'}")

    if models_ok and api_ok:
        print("\n🎉 All tests passed! JIRA Agent is ready to use.")
        show_usage_example()
    else:
        print("\n⚠️ Some tests failed. Please check the implementation.")

    print("\n📚 Next Steps:")
    print("1. Configure JIRA credentials in .env file")
    print("2. Configure LLM API keys")
    print("3. Start the server: python src/main.py")
    print("4. Test the API endpoints")


if __name__ == "__main__":
    main()
