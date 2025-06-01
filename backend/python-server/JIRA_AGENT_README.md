# JIRA Agent - Automated Code Generation from JIRA Tickets

## Overview

The JIRA Agent is an intelligent system that automates code generation from JIRA tickets. It fetches JIRA tickets, analyzes their requirements, generates code, and handles user approval workflows.

## Features

- **Automatic JIRA Integration**: Fetches tickets directly from JIRA using API
- **Intelligent Analysis**: Uses LLM to analyze ticket requirements and extract technical specifications
- **Code Generation**: Generates complete, production-ready code based on requirements
- **Approval Workflow**: Interactive approval process with feedback mechanism
- **Iterative Improvement**: Regenerates code based on user feedback
- **Multiple Framework Support**: Supports various programming languages and frameworks

## Architecture

### Core Components

1. **JiraService** (`src/services/jira_service.py`)
   - Handles JIRA API integration
   - Fetches tickets, comments, and metadata
   - Converts JIRA data to internal models

2. **JiraAgentService** (`src/services/jira_agent_service.py`)
   - Orchestrates the complete workflow
   - Manages workflow state and iterations
   - Handles approval/rejection logic

3. **API Endpoints** (`src/api/v1/endpoints/jira_agent.py`)
   - RESTful API for workflow management
   - Start, monitor, approve/reject workflows
   - Search and fetch JIRA tickets

### Workflow Process

```
1. Start Workflow → 2. Fetch Ticket → 3. Analyze Requirements →
4. Generate Code → 5. Pending Approval → 6. User Decision →
   ↓ (If Approved)                        ↓ (If Rejected)
7. Completed                           8. Regenerate (goto 4)
```

## API Endpoints

### Start Workflow
```http
POST /api/v1/jira-agent/start
{
  "ticket_key": "PROJ-123",
  "generation_options": {
    "code_style": "typescript",
    "framework": "react",
    "generate_tests": true,
    "include_documentation": true,
    "architecture_pattern": "MVC"
  },
  "user_context": {
    "user_id": "user123",
    "session_id": "session456"
  }
}
```

### Check Workflow Status
```http
GET /api/v1/jira-agent/workflow/{workflow_id}
```

### Approve/Reject Workflow
```http
POST /api/v1/jira-agent/approve
{
  "workflow_id": "workflow_uuid",
  "approved": false,
  "feedback": "Please add error handling and input validation"
}
```

### List User Workflows
```http
GET /api/v1/jira-agent/workflows/{user_id}
```

### Get JIRA Ticket
```http
GET /api/v1/jira-agent/ticket/{ticket_key}
```

### Search JIRA Tickets
```http
POST /api/v1/jira-agent/tickets/search
{
  "jql": "project = PROJ AND status = 'To Do'",
  "max_results": 50
}
```

## Configuration

### Environment Variables

Add these to your `.env` file:

```bash
# JIRA Configuration
JIRA_SERVER=https://your-company.atlassian.net
JIRA_USERNAME=your-email@company.com
JIRA_API_TOKEN=your_jira_api_token_here

# LLM Configuration (already configured)
LLM_PROVIDER=openai
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4
```

### JIRA API Token Setup

1. Go to https://id.atlassian.com/manage-profile/security/api-tokens
2. Create API token
3. Use your email as username and token as password

## Usage Examples

### Python Client Example

```python
import asyncio
import httpx
from datetime import datetime

async def generate_code_from_ticket():
    async with httpx.AsyncClient() as client:
        # Start workflow
        response = await client.post("http://localhost:8000/api/v1/jira-agent/start", json={
            "ticket_key": "PROJ-123",
            "generation_options": {
                "code_style": "typescript",
                "framework": "react",
                "generate_tests": True,
                "include_documentation": True
            },
            "user_context": {
                "user_id": "developer123",
                "session_id": "session456"
            }
        })

        workflow_data = response.json()
        workflow_id = workflow_data["workflow_id"]
        print(f"Started workflow: {workflow_id}")

        # Poll for completion
        while True:
            status_response = await client.get(f"http://localhost:8000/api/v1/jira-agent/workflow/{workflow_id}")
            status_data = status_response.json()

            print(f"Status: {status_data['status']}")

            if status_data["status"] == "pending_approval":
                # Code is ready for review
                print("Code generated! Ready for approval.")

                # Approve or reject
                approval_response = await client.post("http://localhost:8000/api/v1/jira-agent/approve", json={
                    "workflow_id": workflow_id,
                    "approved": True  # or False with feedback
                })

                break
            elif status_data["status"] in ["completed", "failed"]:
                break

            await asyncio.sleep(5)  # Wait 5 seconds before checking again

# Run the example
asyncio.run(generate_code_from_ticket())
```

### JavaScript/TypeScript Client Example

```typescript
async function generateCodeFromTicket() {
    // Start workflow
    const startResponse = await fetch('http://localhost:8000/api/v1/jira-agent/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ticket_key: 'PROJ-123',
            generation_options: {
                code_style: 'typescript',
                framework: 'react',
                generate_tests: true,
                include_documentation: true
            },
            user_context: {
                user_id: 'developer123',
                session_id: 'session456'
            }
        })
    });

    const { workflow_id } = await startResponse.json();
    console.log(`Started workflow: ${workflow_id}`);

    // Poll for completion
    while (true) {
        const statusResponse = await fetch(`http://localhost:8000/api/v1/jira-agent/workflow/${workflow_id}`);
        const statusData = await statusResponse.json();

        console.log(`Status: ${statusData.status}`);

        if (statusData.status === 'pending_approval') {
            // Code is ready for review
            console.log('Code generated! Ready for approval.');

            // Approve or reject
            await fetch('http://localhost:8000/api/v1/jira-agent/approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    workflow_id,
                    approved: true // or false with feedback
                })
            });

            break;
        } else if (['completed', 'failed'].includes(statusData.status)) {
            break;
        }

        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
    }
}
```

## Data Models

### Key Models

- **JiraTicketData**: JIRA ticket information
- **GenerationOptions**: Code generation preferences
- **WorkflowStatus**: Current workflow state
- **GenerationResult**: Generated code and metadata

## Error Handling

The system includes comprehensive error handling:

- JIRA API connectivity issues
- Invalid ticket keys
- LLM generation failures
- Workflow state management errors
- User input validation

## Monitoring and Logging

All operations are logged using Loguru:

```python
logger.info("Workflow started")
logger.error("Failed to fetch ticket")
logger.warning("Max iterations exceeded")
```

## Testing

Run the test suite:

```bash
cd d:\void\backend\python-server
python test_jira_agent.py
```

## Security Considerations

- JIRA API tokens should be kept secure
- Validate all user inputs
- Implement rate limiting for API calls
- Use HTTPS in production
- Sanitize generated code before execution

## Performance Optimization

- Async operations for JIRA API calls
- Background task processing
- Workflow cleanup for memory management
- Configurable timeouts and limits

## Troubleshooting

### Common Issues

1. **JIRA Connection Failed**
   - Check JIRA_SERVER, JIRA_USERNAME, JIRA_API_TOKEN
   - Verify API token permissions
   - Test network connectivity

2. **Code Generation Failed**
   - Check LLM API keys and quotas
   - Verify ticket has sufficient description
   - Check generation options compatibility

3. **Workflow Stuck**
   - Check workflow status endpoint
   - Review logs for errors
   - Use cleanup endpoint if needed

### Debug Mode

Enable debug logging:

```bash
export LOG_LEVEL=DEBUG
```

## Contributing

1. Follow existing code patterns
2. Add comprehensive error handling
3. Include unit tests for new features
4. Update documentation
5. Use type hints and docstrings

## Future Enhancements

- [ ] GitHub integration for direct PR creation
- [ ] Support for multiple JIRA projects
- [ ] Code quality analysis integration
- [ ] Automated testing execution
- [ ] Deployment automation
- [ ] Real-time notifications
- [ ] Workflow templates
- [ ] Analytics and reporting
