# Void Editor Python Server

FastAPI server for AI-powered code generation from Jira tickets. This server handles LLM orchestration, code generation, test execution, and file management.

## Features

- 🤖 **Multi-LLM Support**: OpenAI GPT-4, Anthropic Claude, Azure OpenAI
- 🎯 **Jira Integration**: Generate code from Jira ticket requirements
- 🧪 **Test Generation**: Automatic unit and integration test creation
- 📁 **File Management**: Organized project structure generation
- 🔍 **Code Validation**: Syntax checking and test execution
- 🏥 **Health Monitoring**: Comprehensive health checks and metrics
- 🐳 **Docker Support**: Containerized deployment ready

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+ (for JavaScript test execution)
- Git
- Docker (optional)

### Installation

1. **Clone and navigate to the directory:**
   ```bash
   cd d:\void\backend\python-server
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys and configuration
   ```

4. **Start the server:**
   ```bash
   python startup.py
   ```

The server will be available at `http://localhost:8000`

### Docker Deployment

1. **Using Docker Compose (recommended):**
   ```bash
   docker-compose up -d
   ```

2. **Using Docker directly:**
   ```bash
   docker build -t void-editor-python .
   docker run -p 8000:8000 --env-file .env void-editor-python
   ```

## Configuration

### Environment Variables

```bash
# Environment
ENVIRONMENT=development  # development, production
DEBUG=true
HOST=0.0.0.0
PORT=8000

# LLM Configuration
LLM_PROVIDER=openai  # openai, anthropic, azure-openai
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key

# OpenAI Settings
OPENAI_MODEL=gpt-4-turbo-preview
OPENAI_MAX_TOKENS=4000

# Anthropic Settings
ANTHROPIC_MODEL=claude-3-sonnet-20240229

# Azure OpenAI Settings (if using azure-openai)
AZURE_OPENAI_API_KEY=your_azure_key
AZURE_OPENAI_ENDPOINT=https://your-endpoint.openai.azure.com/
AZURE_OPENAI_DEPLOYMENT_NAME=your-deployment-name

# File Generation
MAX_FILE_SIZE_LINES=1000
OUTPUT_DIRECTORY=./generated_code
TEMP_DIRECTORY=./temp

# Testing
TEST_RUNNER=pytest
TEST_TIMEOUT=300

# Logging
LOG_LEVEL=INFO
LOG_FILE=logs/app.log

# CORS
CORS_ORIGINS=["http://localhost:3000", "http://localhost:3001"]
```

## API Endpoints

### Code Generation

**POST** `/api/v1/generate/code`
- Generate complete code from Jira ticket data
- Includes source code, tests, and documentation

**Request:**
```json
{
  "ticket_data": {
    "key": "PROJ-123",
    "summary": "Implement user authentication",
    "description": "Create a secure login system with JWT tokens",
    "issue_type": "Story",
    "priority": "High"
  },
  "generation_options": {
    "generate_tests": true,
    "code_style": "typescript",
    "framework": "react",
    "test_framework": "jest",
    "include_documentation": true
  },
  "user_context": {
    "user_id": "user123",
    "session_id": "session456"
  }
}
```

**Response:**
```json
{
  "success": true,
  "generated_files": [
    {
      "path": "src/auth/AuthService.ts",
      "content": "// Generated TypeScript code...",
      "file_type": "source",
      "language": "typescript",
      "description": "Authentication service implementation"
    }
  ],
  "test_results": [
    {
      "test_file": "tests/auth/AuthService.test.ts",
      "passed": true,
      "total_tests": 10,
      "passed_tests": 10,
      "failed_tests": 0
    }
  ],
  "processing_time_ms": 15000,
  "llm_tokens_used": 3500
}
```

### Code Review

**POST** `/api/v1/generate/review`
- Review code and provide improvement suggestions

### Test Generation

**POST** `/api/v1/generate/test`
- Generate comprehensive tests for existing code

### Health Checks

**GET** `/api/v1/health/`
- Basic health check

**GET** `/api/v1/health/detailed`
- Detailed health with system metrics

**GET** `/api/v1/health/llm`
- LLM service health status

## Architecture

```
src/
├── api/v1/           # FastAPI routes and endpoints
│   ├── endpoints/    # Individual endpoint implementations
│   └── api.py        # Main API router
├── core/             # Core configuration and utilities
│   ├── config.py     # Application settings
│   └── logging.py    # Logging configuration
├── models/           # Pydantic data models
│   └── schemas.py    # Request/response schemas
├── services/         # Business logic services
│   ├── base_llm.py           # Base LLM service interface
│   ├── openai_llm.py         # OpenAI implementation
│   ├── anthropic_llm.py      # Anthropic implementation
│   ├── llm_factory.py        # LLM service factory
│   ├── code_generator.py     # Main code generation orchestrator
│   ├── file_manager.py       # File and workspace management
│   └── test_executor.py      # Test execution service
└── main.py           # FastAPI application entry point
```

## Development

### Running Tests

```bash
# Run the basic functionality test
python test_server.py

# Run unit tests (when implemented)
pytest tests/

# Run with coverage
pytest --cov=src tests/
```

### Adding New LLM Providers

1. Create a new service class inheriting from `BaseLLMService`
2. Implement required methods (`generate_code`, `generate_tests`, etc.)
3. Register the provider in `LLMFactory`
4. Add configuration variables to `Settings`

Example:
```python
# src/services/custom_llm.py
from src.services.base_llm import BaseLLMService

class CustomLLMService(BaseLLMService):
    async def generate_code(self, ticket_data, generation_options, system_prompt, user_prompt):
        # Implementation here
        pass

# Register in llm_factory.py
LLMFactory.register_provider("custom", CustomLLMService)
```

## Integration with Node.js Server

The Python server is designed to work with the Node.js server:

1. **Node.js server** handles:
   - Jira OAuth and API integration
   - GitHub API operations
   - User authentication
   - Request routing to Python server

2. **Python server** handles:
   - LLM orchestration and code generation
   - Test execution and validation
   - File management and workspace creation

3. **Communication**: HTTP API calls between servers

```javascript
// Node.js server calling Python server
const response = await fetch('http://localhost:8000/api/v1/generate/code', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(generationRequest)
});
```

## Monitoring and Logging

### Health Checks

- **Basic Health**: `/api/v1/health/`
- **Detailed Health**: `/api/v1/health/detailed` (includes system metrics)
- **LLM Health**: `/api/v1/health/llm` (LLM service status)

### Logging

Structured logging with Loguru:
- Console output (development)
- File logging (production)
- Error-specific logs
- Request/response logging

### Metrics

Available via `/api/v1/health/metrics`:
- CPU and memory usage
- Process metrics
- Service configuration
- LLM provider status

## Troubleshooting

### Common Issues

1. **Import Errors**
   ```bash
   # Make sure all dependencies are installed
   pip install -r requirements.txt

   # Check Python path
   export PYTHONPATH=/path/to/src
   ```

2. **LLM API Errors**
   ```bash
   # Verify API keys are set
   echo $OPENAI_API_KEY

   # Check provider configuration
   curl http://localhost:8000/api/v1/generate/providers
   ```

3. **Test Execution Issues**
   ```bash
   # Ensure Node.js and npm are installed
   node --version
   npm --version

   # Check test framework availability
   npx jest --version
   ```

### Debug Mode

Enable debug logging:
```bash
export DEBUG=true
export LOG_LEVEL=DEBUG
python startup.py
```

## Contributing

1. Follow PEP 8 style guidelines
2. Add type hints to all functions
3. Write comprehensive docstrings
4. Include unit tests for new features
5. Update this README for new functionality

## License

This project is part of the Void Editor suite. See the main repository for license information.
