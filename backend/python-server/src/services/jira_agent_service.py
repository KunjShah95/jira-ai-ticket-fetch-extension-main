"""
JIRA Agent Service - Handles the complete workflow from ticket analysis to code generation
"""

import asyncio
import uuid
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum
from loguru import logger
from pydantic import BaseModel

from src.services.jira_service import jira_service
from src.services.code_generator import CodeGenerator
from src.models.schemas import (
    JiraTicketData,
    GenerationOptions,
    UserContext,
    GenerationResult,
)


class WorkflowStatus(str, Enum):
    INITIATED = "initiated"
    ANALYZING = "analyzing"
    GENERATING = "generating"
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    REJECTED = "rejected"
    COMPLETED = "completed"
    FAILED = "failed"


class CodeGenerationWorkflow(BaseModel):
    """Represents a code generation workflow instance"""

    workflow_id: str
    ticket_key: str
    ticket_data: Optional[JiraTicketData] = None
    status: WorkflowStatus = WorkflowStatus.INITIATED
    generation_options: GenerationOptions
    user_context: UserContext
    analysis_results: Optional[Dict[str, Any]] = None
    generated_code: Optional[GenerationResult] = None
    user_feedback: Optional[str] = None
    iterations: int = 0
    max_iterations: int = 3
    created_at: datetime = datetime.now()
    updated_at: datetime = datetime.now()


class JiraAgentService:
    """Main service for JIRA agent workflow"""

    def __init__(self):
        self.code_generator = CodeGenerator()
        self.active_workflows: Dict[str, CodeGenerationWorkflow] = {}

    async def start_workflow(
        self,
        ticket_key: str,
        generation_options: GenerationOptions,
        user_context: UserContext,
    ) -> str:
        """Start a new code generation workflow"""
        workflow_id = str(uuid.uuid4())

        workflow = CodeGenerationWorkflow(
            workflow_id=workflow_id,
            ticket_key=ticket_key,
            generation_options=generation_options,
            user_context=user_context,
        )

        self.active_workflows[workflow_id] = workflow

        # Start the workflow asynchronously
        asyncio.create_task(self._execute_workflow(workflow_id))

        logger.info(f"Started workflow {workflow_id} for ticket {ticket_key}")
        return workflow_id

    async def _execute_workflow(self, workflow_id: str):
        """Execute the complete workflow"""
        try:
            workflow = self.active_workflows[workflow_id]

            # Step 1: Fetch JIRA ticket
            await self._fetch_ticket_data(workflow)

            # Step 2: Analyze ticket
            await self._analyze_ticket(workflow)

            # Step 3: Generate code
            await self._generate_code(workflow)

            # Step 4: Set to pending approval
            workflow.status = WorkflowStatus.PENDING_APPROVAL
            workflow.updated_at = datetime.now()

            logger.info(f"Workflow {workflow_id} completed initial generation")

        except Exception as e:
            workflow = self.active_workflows.get(workflow_id)
            if workflow:
                workflow.status = WorkflowStatus.FAILED
                workflow.updated_at = datetime.now()
            logger.error(f"Workflow {workflow_id} failed: {e}")

    async def _fetch_ticket_data(self, workflow: CodeGenerationWorkflow):
        """Fetch JIRA ticket data"""
        workflow.status = WorkflowStatus.ANALYZING
        workflow.updated_at = datetime.now()

        ticket_data = await jira_service.fetch_ticket(workflow.ticket_key)
        if not ticket_data:
            raise Exception(f"Failed to fetch ticket {workflow.ticket_key}")

        workflow.ticket_data = ticket_data
        logger.info(f"Fetched ticket data for {workflow.ticket_key}")

    async def _analyze_ticket(self, workflow: CodeGenerationWorkflow):
        """Analyze the ticket to extract requirements"""
        if not workflow.ticket_data:
            raise Exception("No ticket data available for analysis")

        # Combine ticket summary, description, and comments for analysis
        analysis_text = f"""
        Title: {workflow.ticket_data.summary}

        Description: {workflow.ticket_data.description}

        Priority: {workflow.ticket_data.priority}
        Type: {workflow.ticket_data.issue_type}
        Labels: {", ".join(workflow.ticket_data.labels)}
        Components: {", ".join(workflow.ticket_data.components)}
        """

        # Get comments for additional context
        comments = await jira_service.get_ticket_comments(workflow.ticket_key)
        if comments:
            comments_text = "\n".join([f"Comment: {c['body']}" for c in comments])
            analysis_text += f"\n\nComments:\n{comments_text}"

        # Extract technical requirements using LLM
        analysis_prompt = f"""
        Analyze the following JIRA ticket and extract:
        1. Functional requirements
        2. Technical requirements
        3. Architecture components needed
        4. Database schema if applicable
        5. API endpoints if applicable
        6. UI components if applicable
        7. Testing requirements

        Ticket Details:
        {analysis_text}

        Provide a structured analysis in JSON format.
        """

        # Use the code generator's LLM for analysis
        analysis_response = await self.code_generator.llm_service.generate_response(
            analysis_prompt, max_tokens=2000
        )

        try:
            import json

            analysis_results = json.loads(analysis_response.content)
        except (json.JSONDecodeError, ValueError):
            # Fallback if JSON parsing fails
            analysis_results = {
                "raw_analysis": analysis_response.content,
                "requirements": analysis_text,
            }

        workflow.analysis_results = analysis_results
        logger.info(f"Completed analysis for {workflow.ticket_key}")

    async def _generate_code(self, workflow: CodeGenerationWorkflow):
        """Generate code based on the analysis"""
        workflow.status = WorkflowStatus.GENERATING
        workflow.updated_at = datetime.now()

        if not workflow.analysis_results or not workflow.ticket_data:
            raise Exception("Missing analysis results or ticket data")

        # Create a comprehensive generation prompt
        generation_prompt = f"""
        Generate complete, production-ready code for the following JIRA ticket:

        Ticket: {workflow.ticket_data.key} - {workflow.ticket_data.summary}

        Requirements Analysis:
        {workflow.analysis_results}

        Generation Options:
        - Language/Framework: {workflow.generation_options.framework}
        - Include Tests: {workflow.generation_options.generate_tests}
        - Include Documentation: {workflow.generation_options.include_documentation}
        - Architecture Pattern: {workflow.generation_options.architecture_pattern}

        Please generate:
        1. Main implementation files
        2. Test files (if requested)
        3. Configuration files
        4. Documentation (if requested)
        5. Database migration scripts (if applicable)

        User Feedback (if any): {workflow.user_feedback or "None"}

        Ensure code is:
        - Well-structured and maintainable
        - Follows best practices
        - Includes proper error handling
        - Has clear comments and documentation
        """

        # Generate the code
        result = await self.code_generator.generate_from_requirements(
            requirements=generation_prompt, options=workflow.generation_options
        )

        workflow.generated_code = result
        workflow.iterations += 1
        logger.info(
            f"Generated code for {workflow.ticket_key} (iteration {workflow.iterations})"
        )

    async def get_workflow_status(
        self, workflow_id: str
    ) -> Optional[CodeGenerationWorkflow]:
        """Get the current status of a workflow"""
        return self.active_workflows.get(workflow_id)

    async def approve_workflow(self, workflow_id: str) -> bool:
        """Approve the generated code"""
        workflow = self.active_workflows.get(workflow_id)
        if not workflow:
            return False

        workflow.status = WorkflowStatus.APPROVED
        workflow.updated_at = datetime.now()

        # You can add logic here to save/deploy the approved code
        logger.info(f"Workflow {workflow_id} approved")
        return True

    async def reject_workflow(self, workflow_id: str, feedback: str) -> bool:
        """Reject the generated code and provide feedback for regeneration"""
        workflow = self.active_workflows.get(workflow_id)
        if not workflow:
            return False

        if workflow.iterations >= workflow.max_iterations:
            workflow.status = WorkflowStatus.FAILED
            logger.warning(f"Workflow {workflow_id} exceeded max iterations")
            return False

        workflow.status = WorkflowStatus.REJECTED
        workflow.user_feedback = feedback
        workflow.updated_at = datetime.now()

        # Start regeneration with feedback
        asyncio.create_task(self._regenerate_code(workflow_id))

        logger.info(f"Workflow {workflow_id} rejected, starting regeneration")
        return True

    async def _regenerate_code(self, workflow_id: str):
        """Regenerate code with user feedback"""
        try:
            workflow = self.active_workflows[workflow_id]

            # Generate code again with the feedback
            await self._generate_code(workflow)

            # Set back to pending approval
            workflow.status = WorkflowStatus.PENDING_APPROVAL
            workflow.updated_at = datetime.now()

            logger.info(f"Workflow {workflow_id} regenerated code")

        except Exception as e:
            workflow = self.active_workflows.get(workflow_id)
            if workflow:
                workflow.status = WorkflowStatus.FAILED
                workflow.updated_at = datetime.now()
            logger.error(f"Regeneration failed for workflow {workflow_id}: {e}")

    async def list_active_workflows(self, user_id: str) -> List[CodeGenerationWorkflow]:
        """List all active workflows for a user"""
        user_workflows = []
        for workflow in self.active_workflows.values():
            if workflow.user_context.user_id == user_id:
                user_workflows.append(workflow)

        return user_workflows

    async def cleanup_completed_workflows(self, max_age_hours: int = 24):
        """Clean up old completed workflows"""
        current_time = datetime.now()
        workflows_to_remove = []

        for workflow_id, workflow in self.active_workflows.items():
            age_hours = (current_time - workflow.updated_at).total_seconds() / 3600
            if age_hours > max_age_hours and workflow.status in [
                WorkflowStatus.COMPLETED,
                WorkflowStatus.APPROVED,
                WorkflowStatus.FAILED,
            ]:
                workflows_to_remove.append(workflow_id)

        for workflow_id in workflows_to_remove:
            del self.active_workflows[workflow_id]

        logger.info(f"Cleaned up {len(workflows_to_remove)} old workflows")


# Global agent service instance
jira_agent_service = JiraAgentService()
