from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum


class IssueType(str, Enum):
    TASK = "Task"
    STORY = "Story"
    BUG = "Bug"
    EPIC = "Epic"
    SUBTASK = "Sub-task"


class Priority(str, Enum):
    LOWEST = "Lowest"
    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"
    HIGHEST = "Highest"


class Status(str, Enum):
    TODO = "To Do"
    IN_PROGRESS = "In Progress"
    IN_REVIEW = "In Review"
    DONE = "Done"
    CLOSED = "Closed"


class WorkflowState(str, Enum):
    FETCHING_TICKET = "fetching_ticket"
    ANALYZING_REQUIREMENTS = "analyzing_requirements"
    GENERATING_CODE = "generating_code"
    AWAITING_APPROVAL = "awaiting_approval"
    INCORPORATING_FEEDBACK = "incorporating_feedback"
    COMPLETED = "completed"
    FAILED = "failed"


class ApprovalStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class JiraTicketData(BaseModel):
    """Jira ticket data model"""

    key: str = Field(..., description="Jira ticket key (e.g., PROJ-123)")
    summary: str = Field(..., description="Ticket summary/title")
    description: Optional[str] = Field(None, description="Detailed description")
    issue_type: IssueType = Field(default=IssueType.TASK, description="Type of issue")
    priority: Priority = Field(default=Priority.MEDIUM, description="Priority level")
    status: Status = Field(default=Status.TODO, description="Current status")
    assignee: Optional[str] = Field(None, description="Assigned user")
    reporter: Optional[str] = Field(None, description="Reporter user")
    labels: List[str] = Field(default_factory=list, description="Ticket labels")
    components: List[str] = Field(
        default_factory=list, description="Project components"
    )
    custom_fields: Dict[str, Any] = Field(
        default_factory=dict, description="Custom fields"
    )


class GenerationOptions(BaseModel):
    """Code generation options"""

    generate_tests: bool = Field(
        default=True, description="Generate unit and integration tests"
    )
    code_style: str = Field(
        default="typescript", description="Programming language/style"
    )
    framework: str = Field(default="react", description="Framework to use")
    test_framework: str = Field(default="jest", description="Testing framework")
    include_documentation: bool = Field(
        default=True, description="Include code documentation"
    )
    max_file_size: int = Field(default=1000, description="Maximum lines per file")
    architecture_pattern: Optional[str] = Field(
        None, description="Architecture pattern (MVC, Clean, etc.)"
    )
    database_type: Optional[str] = Field(None, description="Database type if needed")
    api_style: Optional[str] = Field(
        None, description="API style (REST, GraphQL, etc.)"
    )


class UserContext(BaseModel):
    """User context information"""

    user_id: str = Field(..., description="User identifier")
    timestamp: datetime = Field(
        default_factory=datetime.now, description="Request timestamp"
    )
    session_id: Optional[str] = Field(None, description="Session identifier")


class GenerationRequest(BaseModel):
    """Main request model for code generation"""

    ticket_data: JiraTicketData = Field(..., description="Jira ticket information")
    generation_options: GenerationOptions = Field(
        default_factory=GenerationOptions, description="Generation preferences"
    )
    user_context: UserContext = Field(..., description="User context")


class GeneratedFile(BaseModel):
    """Generated file model"""

    path: str = Field(..., description="File path relative to project root")
    content: str = Field(..., description="File content")
    file_type: str = Field(..., description="Type of file (source, test, config, etc.)")
    language: str = Field(..., description="Programming language")
    description: str = Field(..., description="Description of what this file does")
    size_lines: int = Field(..., description="Number of lines in the file")


class TestResult(BaseModel):
    """Test execution result"""

    test_file: str = Field(..., description="Test file path")
    passed: bool = Field(..., description="Whether tests passed")
    total_tests: int = Field(..., description="Total number of tests")
    passed_tests: int = Field(..., description="Number of passed tests")
    failed_tests: int = Field(..., description="Number of failed tests")
    execution_time: float = Field(..., description="Execution time in seconds")
    output: str = Field(..., description="Test output/logs")
    errors: List[str] = Field(default_factory=list, description="Error messages if any")


class GenerationResult(BaseModel):
    """Result of code generation process"""

    success: bool = Field(..., description="Whether generation was successful")
    generated_files: List[GeneratedFile] = Field(
        default_factory=list, description="Generated files"
    )
    test_results: List[TestResult] = Field(
        default_factory=list, description="Test execution results"
    )
    processing_time_ms: int = Field(
        ..., description="Total processing time in milliseconds"
    )
    llm_tokens_used: int = Field(default=0, description="Number of LLM tokens used")
    error_message: Optional[str] = Field(
        None, description="Error message if generation failed"
    )
    warnings: List[str] = Field(default_factory=list, description="Warning messages")
    metadata: Dict[str, Any] = Field(
        default_factory=dict, description="Additional metadata"
    )


class LLMResponse(BaseModel):
    """LLM response model"""

    content: str = Field(..., description="Generated content")
    tokens_used: int = Field(..., description="Number of tokens used")
    model_used: str = Field(..., description="Model that was used")
    finish_reason: Optional[str] = Field(
        None, description="Reason why generation finished"
    )


class ErrorResponse(BaseModel):
    """Error response model"""

    error: str = Field(..., description="Error type")
    message: str = Field(..., description="Error message")
    details: Optional[Dict[str, Any]] = Field(
        None, description="Additional error details"
    )
    timestamp: datetime = Field(
        default_factory=datetime.now, description="Error timestamp"
    )


# JIRA Agent Models


class JiraCredentials(BaseModel):
    """JIRA authentication credentials"""

    server_url: str = Field(..., description="JIRA server URL")
    username: str = Field(..., description="JIRA username")
    api_token: str = Field(..., description="JIRA API token")
    project_key: Optional[str] = Field(None, description="Default project key")


class JiraTicketAnalysis(BaseModel):
    """Analysis of JIRA ticket requirements"""

    ticket_key: str = Field(..., description="JIRA ticket key")
    requirements: List[str] = Field(..., description="Extracted requirements")
    technical_specs: List[str] = Field(..., description="Technical specifications")
    acceptance_criteria: List[str] = Field(..., description="Acceptance criteria")
    complexity_score: int = Field(..., description="Complexity score 1-10")
    estimated_files: int = Field(
        ..., description="Estimated number of files to generate"
    )
    suggested_technologies: List[str] = Field(
        ..., description="Suggested technologies/frameworks"
    )
    dependencies: List[str] = Field(
        default_factory=list, description="Required dependencies"
    )


class UserFeedback(BaseModel):
    """User feedback on generated code"""

    feedback_text: str = Field(..., description="User's feedback text")
    specific_issues: List[str] = Field(
        default_factory=list, description="Specific issues to address"
    )
    improvement_requests: List[str] = Field(
        default_factory=list, description="Requested improvements"
    )
    approval_status: ApprovalStatus = Field(..., description="User's approval decision")
    priority_changes: List[str] = Field(
        default_factory=list, description="High priority changes"
    )


class CodeGenerationSession(BaseModel):
    """Code generation session tracking"""

    session_id: str = Field(..., description="Unique session identifier")
    ticket_key: str = Field(..., description="JIRA ticket key")
    current_state: WorkflowState = Field(..., description="Current workflow state")
    iteration_count: int = Field(default=1, description="Current iteration number")
    max_iterations: int = Field(default=5, description="Maximum allowed iterations")

    # Data at each stage
    original_ticket: Optional[JiraTicketData] = Field(
        None, description="Original JIRA ticket data"
    )
    ticket_analysis: Optional[JiraTicketAnalysis] = Field(
        None, description="Ticket analysis results"
    )
    generated_code: List[GeneratedFile] = Field(
        default_factory=list, description="Current generated code"
    )
    user_feedback_history: List[UserFeedback] = Field(
        default_factory=list, description="History of user feedback"
    )

    # Metadata
    created_at: datetime = Field(
        default_factory=datetime.now, description="Session creation time"
    )
    updated_at: datetime = Field(
        default_factory=datetime.now, description="Last update time"
    )
    total_tokens_used: int = Field(
        default=0, description="Total tokens used across iterations"
    )
    error_messages: List[str] = Field(
        default_factory=list, description="Any error messages"
    )


class JiraAgentRequest(BaseModel):
    """Request to start JIRA agent process"""

    ticket_key: str = Field(..., description="JIRA ticket key to process")
    jira_credentials: JiraCredentials = Field(..., description="JIRA authentication")
    generation_options: GenerationOptions = Field(
        default_factory=GenerationOptions, description="Code generation options"
    )
    user_context: UserContext = Field(..., description="User context")
    session_config: Optional[Dict[str, Any]] = Field(
        default_factory=dict, description="Session configuration"
    )


class ApprovalRequest(BaseModel):
    """Request for user approval/feedback"""

    session_id: str = Field(..., description="Session identifier")
    feedback: UserFeedback = Field(..., description="User feedback")


class JiraAgentResponse(BaseModel):
    """Response from JIRA agent"""

    session_id: str = Field(..., description="Session identifier")
    current_state: WorkflowState = Field(..., description="Current workflow state")
    success: bool = Field(..., description="Whether the operation was successful")
    message: str = Field(..., description="Status message")

    # Optional data based on state
    ticket_analysis: Optional[JiraTicketAnalysis] = Field(
        None, description="Ticket analysis if available"
    )
    generated_code: List[GeneratedFile] = Field(
        default_factory=list, description="Generated code if available"
    )
    approval_required: bool = Field(
        default=False, description="Whether user approval is required"
    )

    # Progress tracking
    iteration_count: int = Field(default=1, description="Current iteration")
    estimated_completion: Optional[str] = Field(
        None, description="Estimated completion time"
    )

    # Metadata
    processing_time_ms: int = Field(default=0, description="Processing time")
    tokens_used: int = Field(default=0, description="Tokens used in this operation")
    warnings: List[str] = Field(default_factory=list, description="Warning messages")


class JiraCredentials(BaseModel):
    """JIRA authentication credentials"""

    server_url: str = Field(..., description="JIRA server URL")
    username: str = Field(..., description="JIRA username")
    api_token: str = Field(..., description="JIRA API token")
    project_key: Optional[str] = Field(None, description="Default project key")


class JiraTicketAnalysis(BaseModel):
    """Analysis of JIRA ticket requirements"""

    ticket_key: str = Field(..., description="JIRA ticket key")
    requirements: List[str] = Field(..., description="Extracted requirements")
    technical_specs: List[str] = Field(..., description="Technical specifications")
    acceptance_criteria: List[str] = Field(..., description="Acceptance criteria")
class UserFeedback(BaseModel):
    """User feedback on generated code"""

    feedback_text: str = Field(..., description="User's feedback text")
    specific_issues: List[str] = Field(
        default_factory=list, description="Specific issues to address"
    )
    improvement_requests: List[str]