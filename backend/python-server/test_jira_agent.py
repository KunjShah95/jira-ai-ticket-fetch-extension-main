"""
Test script for JIRA Agent functionality
"""

import asyncio
import json
from datetime import datetime
from src.services.jira_agent_service import jira_agent_service
from src.models.schemas import GenerationOptions, UserContext


async def test_jira_agent():
    """Test the JIRA agent workflow"""
    print("🚀 Testing JIRA Agent Workflow")

    # Mock user context
    user_context = UserContext(user_id="test_user_123", session_id="test_session_456")

    # Mock generation options
    generation_options = GenerationOptions(
        code_style="typescript",
        framework="react",
        generate_tests=True,
        include_documentation=True,
        architecture_pattern="MVC",
    )

    try:
        # Test workflow creation
        print("\n📋 Starting workflow for mock ticket...")
        workflow_id = await jira_agent_service.start_workflow(
            ticket_key="TEST-123",
            generation_options=generation_options,
            user_context=user_context,
        )
        print(f"✅ Workflow created with ID: {workflow_id}")

        # Wait a bit for processing
        await asyncio.sleep(2)

        # Check workflow status
        print("\n📊 Checking workflow status...")
        workflow = await jira_agent_service.get_workflow_status(workflow_id)

        if workflow:
            print(f"📝 Workflow Status: {workflow.status}")
            print(f"🔄 Iterations: {workflow.iterations}")
            print(f"📅 Created: {workflow.created_at}")
            print(f"📅 Updated: {workflow.updated_at}")

            if workflow.analysis_results:
                print("🔍 Analysis completed")

            if workflow.generated_code:
                print("💻 Code generation completed")
                print("📊 Success: {workflow.generated_code.success}")
                print("📁 Generated files: {len(workflow.generated_code.generated_files)}")

        # Test workflow listing
        print("\n📋 Listing user workflows...")
        user_workflows = await jira_agent_service.list_active_workflows("test_user_123")
        print(f"👤 User has {len(user_workflows)} active workflows")

        # Test approval workflow
        if workflow and workflow.status.value == "pending_approval":
            print("\n✅ Testing workflow approval...")
            success = await jira_agent_service.approve_workflow(workflow_id)
            print(f"👍 Approval result: {success}")

        print("\n🎉 JIRA Agent test completed successfully!")

    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback

        traceback.print_exc()


async def test_mock_jira_functionality():
    """Test JIRA functionality with mock data"""
    print("\n🔧 Testing mock JIRA functionality...")

    # Since we might not have real JIRA credentials, test with mock data
    from src.models.schemas import JiraTicketData, IssueType, Priority, Status

    mock_ticket = JiraTicketData(
        key="TEST-123",
        summary="Create user authentication system",
        description="""
        We need to implement a complete user authentication system with the following features:

        1. User registration with email verification
        2. Login/logout functionality
        3. Password reset capability
        4. JWT token-based authentication
        5. Role-based access control
        6. Session management

        Technical Requirements:
        - Use React for frontend
        - Node.js/Express for backend
        - PostgreSQL for database
        - JWT for tokens
        - bcrypt for password hashing

        Acceptance Criteria:
        - Users can register with email and password
        - Email verification is sent upon registration
        - Users can login with verified credentials
        - Protected routes require authentication
        - Admin users have additional permissions
        """,
        issue_type=IssueType.STORY,
        priority=Priority.HIGH,
        status=Status.TODO,
        assignee="John Developer",
        reporter="Jane Product Manager",
        labels=["authentication", "security", "backend", "frontend"],
        components=["API", "Web App", "Database"],
    )

    print(f"🎫 Mock ticket: {mock_ticket.key}")
    print(f"📋 Summary: {mock_ticket.summary}")
    print(f"⚡ Priority: {mock_ticket.priority}")
    print(f"🏷️ Labels: {', '.join(mock_ticket.labels)}")


if __name__ == "__main__":
    print("🧪 JIRA Agent Test Suite")
    print("=" * 50)

    asyncio.run(test_mock_jira_functionality())
    asyncio.run(test_jira_agent())
