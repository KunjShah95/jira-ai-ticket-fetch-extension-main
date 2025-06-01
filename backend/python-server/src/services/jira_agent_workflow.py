"""
JIRA Agent Workflow Service - Handles the complete workflow from ticket to code approval
"""

import asyncio
import uuid
from typing import Dict, Optional, List
from datetime import datetime
from loguru import logger

from src.models.schemas import (
    CodeGenerationSession,
    JiraAgentRequest,
    JiraAgentResponse,
    UserFeedback,
    ApprovalRequest,
    WorkflowState,
    ApprovalStatus,
    JiraTicketData,
    JiraTicketAnalysis,
    GeneratedFile,
    GenerationOptions,
)
from src.services.jira_service import JiraService
from src.services.code_generator import CodeGeneratorService
from src.services.base_llm import BaseLLMService
from src.services.llm_factory import LLMFactory


class JiraAgentWorkflowService:
    """Main service orchestrating the JIRA agent workflow"""

    def __init__(self):
        self.sessions: Dict[str, CodeGenerationSession] = {}
        self.jira_service = JiraService()
        self.code_generator = CodeGeneratorService()
        self.llm_service: Optional[BaseLLMService] = None

    async def initialize(self):
        """Initialize the workflow service"""
        try:
            self.llm_service = LLMFactory.create_llm_service()
            logger.info("✅ JIRA Agent Workflow Service initialized")
            return True
        except Exception as e:
            logger.error(f"❌ Failed to initialize workflow service: {e}")
            return False

    async def start_jira_agent_process(
        self, request: JiraAgentRequest
    ) -> JiraAgentResponse:
        """Start the complete JIRA agent process"""
        session_id = str(uuid.uuid4())

        try:
            # Create new session
            session = CodeGenerationSession(
                session_id=session_id,
                ticket_key=request.ticket_key,
                current_state=WorkflowState.FETCHING_TICKET,
                max_iterations=request.session_config.get("max_iterations", 5),
            )

            self.sessions[session_id] = session

            logger.info(
                f"🚀 Starting JIRA agent process for ticket: {request.ticket_key}"
            )

            # Step 1: Initialize JIRA client and fetch ticket
            if not await self.jira_service.initialize(request.jira_credentials):
                return self._create_error_response(
                    session_id, "Failed to initialize JIRA client"
                )

            session.current_state = WorkflowState.FETCHING_TICKET
            ticket_data = await self.jira_service.fetch_ticket(request.ticket_key)

            if not ticket_data:
                return self._create_error_response(
                    session_id, f"Failed to fetch ticket: {request.ticket_key}"
                )

            session.original_ticket = ticket_data

            # Step 2: Analyze ticket requirements
            session.current_state = WorkflowState.ANALYZING_REQUIREMENTS
            self._update_session(session)

            ticket_analysis = await self.jira_service.analyze_ticket(ticket_data)
            if not ticket_analysis:
                return self._create_error_response(
                    session_id, "Failed to analyze ticket requirements"
                )

            session.ticket_analysis = ticket_analysis

            # Step 3: Generate initial code
            session.current_state = WorkflowState.GENERATING_CODE
            self._update_session(session)

            generated_code = await self._generate_code_from_analysis(
                ticket_analysis, request.generation_options
            )

            if not generated_code:
                return self._create_error_response(
                    session_id, "Failed to generate code"
                )

            session.generated_code = generated_code
            session.current_state = WorkflowState.AWAITING_APPROVAL
            self._update_session(session)

            # Return response requiring user approval
            return JiraAgentResponse(
                session_id=session_id,
                current_state=WorkflowState.AWAITING_APPROVAL,
                success=True,
                message="Code generated successfully. Please review and approve or provide feedback.",
                ticket_analysis=ticket_analysis,
                generated_code=generated_code,
                approval_required=True,
                iteration_count=session.iteration_count,
                processing_time_ms=int(
                    (datetime.now() - session.created_at).total_seconds() * 1000
                ),
                tokens_used=session.total_tokens_used,
            )

        except Exception as e:
            logger.error(f"❌ Error in JIRA agent process: {e}")
            return self._create_error_response(session_id, f"Process failed: {str(e)}")

    async def handle_user_approval(
        self, approval_request: ApprovalRequest
    ) -> JiraAgentResponse:
        """Handle user approval or feedback"""
        session_id = approval_request.session_id

        if session_id not in self.sessions:
            return self._create_error_response(session_id, "Session not found")

        session = self.sessions[session_id]
        feedback = approval_request.feedback

        # Add feedback to history
        session.user_feedback_history.append(feedback)

        try:
            if feedback.approval_status == ApprovalStatus.APPROVED:
                # User approved - finalize the code
                session.current_state = WorkflowState.COMPLETED
                self._update_session(session)

                logger.info(f"✅ Code approved for session {session_id}")

                return JiraAgentResponse(
                    session_id=session_id,
                    current_state=WorkflowState.COMPLETED,
                    success=True,
                    message="Code approved and finalized successfully!",
                    generated_code=session.generated_code,
                    approval_required=False,
                    iteration_count=session.iteration_count,
                    processing_time_ms=int(
                        (datetime.now() - session.created_at).total_seconds() * 1000
                    ),
                    tokens_used=session.total_tokens_used,
                )

            elif feedback.approval_status == ApprovalStatus.REJECTED:
                # User rejected - incorporate feedback and regenerate
                if session.iteration_count >= session.max_iterations:
                    session.current_state = WorkflowState.FAILED
                    self._update_session(session)

                    return self._create_error_response(
                        session_id,
                        f"Maximum iterations ({session.max_iterations}) reached without approval",
                    )

                session.current_state = WorkflowState.INCORPORATING_FEEDBACK
                session.iteration_count += 1
                self._update_session(session)

                logger.info(
                    f"🔄 Incorporating feedback for session {session_id}, iteration {session.iteration_count}"
                )

                # Regenerate code with feedback
                improved_code = await self._regenerate_code_with_feedback(
                    session, feedback
                )

                if not improved_code:
                    return self._create_error_response(
                        session_id, "Failed to regenerate code with feedback"
                    )

                session.generated_code = improved_code
                session.current_state = WorkflowState.AWAITING_APPROVAL
                self._update_session(session)

                return JiraAgentResponse(
                    session_id=session_id,
                    current_state=WorkflowState.AWAITING_APPROVAL,
                    success=True,
                    message=f"Code regenerated with your feedback (iteration {session.iteration_count}). Please review again.",
                    generated_code=improved_code,
                    approval_required=True,
                    iteration_count=session.iteration_count,
                    processing_time_ms=int(
                        (datetime.now() - session.created_at).total_seconds() * 1000
                    ),
                    tokens_used=session.total_tokens_used,
                )

            else:
                return self._create_error_response(
                    session_id, "Invalid approval status"
                )

        except Exception as e:
            logger.error(f"❌ Error handling approval for session {session_id}: {e}")
            return self._create_error_response(
                session_id, f"Failed to process approval: {str(e)}"
            )

    async def get_session_status(self, session_id: str) -> Optional[JiraAgentResponse]:
        """Get current status of a session"""
        if session_id not in self.sessions:
            return None

        session = self.sessions[session_id]

        return JiraAgentResponse(
            session_id=session_id,
            current_state=session.current_state,
            success=True,
            message=f"Session status: {session.current_state.value}",
            ticket_analysis=session.ticket_analysis,
            generated_code=session.generated_code,
            approval_required=session.current_state == WorkflowState.AWAITING_APPROVAL,
            iteration_count=session.iteration_count,
            processing_time_ms=int(
                (datetime.now() - session.created_at).total_seconds() * 1000
            ),
            tokens_used=session.total_tokens_used,
        )

    async def _generate_code_from_analysis(
        self, analysis: JiraTicketAnalysis, options: GenerationOptions
    ) -> List[GeneratedFile]:
        """Generate code based on ticket analysis"""
        try:
            # Build generation prompt from analysis
            generation_prompt = self._build_generation_prompt(analysis, options)

            # Use code generator service
            generation_result = (
                await self.code_generator.generate_code_from_requirements(
                    requirements=analysis.requirements,
                    technical_specs=analysis.technical_specs,
                    generation_options=options,
                )
            )

            if generation_result.success:
                return generation_result.generated_files
            else:
                logger.error(
                    f"Code generation failed: {generation_result.error_message}"
                )
                return []

        except Exception as e:
            logger.error(f"❌ Error generating code from analysis: {e}")
            return []

    async def _regenerate_code_with_feedback(
        self, session: CodeGenerationSession, feedback: UserFeedback
    ) -> List[GeneratedFile]:
        """Regenerate code incorporating user feedback"""
        try:
            if not self.llm_service:
                raise ValueError("LLM service not initialized")

            # Build improvement prompt
            improvement_prompt = self._build_improvement_prompt(session, feedback)

            # Get improved code from LLM
            llm_response = await self.llm_service.generate_response(
                prompt=improvement_prompt,
                system_message="You are an expert code improver. Take user feedback and improve the existing code accordingly.",
                max_tokens=3000,
            )

            session.total_tokens_used += llm_response.tokens_used

            # Parse the improved code
            improved_files = await self._parse_improved_code_response(
                llm_response.content, session.generated_code
            )

            return improved_files

        except Exception as e:
            logger.error(f"❌ Error regenerating code with feedback: {e}")
            return []

    def _build_generation_prompt(
        self, analysis: JiraTicketAnalysis, options: GenerationOptions
    ) -> str:
        """Build prompt for initial code generation"""
        return f"""
        Generate code based on the following ticket analysis:

        **Requirements:**
        {chr(10).join(f"- {req}" for req in analysis.requirements)}

        **Technical Specifications:**
        {chr(10).join(f"- {spec}" for spec in analysis.technical_specs)}

        **Acceptance Criteria:**
        {chr(10).join(f"- {criteria}" for criteria in analysis.acceptance_criteria)}

        **Suggested Technologies:** {", ".join(analysis.suggested_technologies)}
        **Dependencies:** {", ".join(analysis.dependencies)}

        **Generation Options:**
        - Language/Style: {options.code_style}
        - Framework: {options.framework}
        - Generate Tests: {options.generate_tests}
        - Include Documentation: {options.include_documentation}

        Please generate complete, functional code that meets all requirements.
        """

    def _build_improvement_prompt(
        self, session: CodeGenerationSession, feedback: UserFeedback
    ) -> str:
        """Build prompt for code improvement based on feedback"""
        current_files = "\n\n".join(
            [
                f"**File: {file.path}**\n```{file.language}\n{file.content}\n```"
                for file in session.generated_code
            ]
        )

        return f"""
        Improve the following code based on user feedback:

        **Current Code:**
        {current_files}

        **User Feedback:**
        {feedback.feedback_text}

        **Specific Issues to Address:**
        {chr(10).join(f"- {issue}" for issue in feedback.specific_issues)}

        **Improvement Requests:**
        {chr(10).join(f"- {req}" for req in feedback.improvement_requests)}

        **Priority Changes:**
        {chr(10).join(f"- {change}" for change in feedback.priority_changes)}

        Please provide the improved code addressing all feedback points while maintaining the original functionality.
        """

    async def _parse_improved_code_response(
        self, response: str, original_files: List[GeneratedFile]
    ) -> List[GeneratedFile]:
        """Parse LLM response containing improved code"""
        # This is a simplified parser - in a real implementation, you'd want more robust parsing
        try:
            improved_files = []

            # For now, update the existing files with improved content
            # In a real implementation, you'd parse the LLM response to extract new file contents
            for original_file in original_files:
                improved_file = GeneratedFile(
                    path=original_file.path,
                    content=f"// Improved based on user feedback\n{original_file.content}\n\n// Additional improvements:\n// {response[:200]}...",
                    file_type=original_file.file_type,
                    language=original_file.language,
                    description=f"Improved version: {original_file.description}",
                    size_lines=original_file.size_lines + 5,
                )
                improved_files.append(improved_file)

            return improved_files

        except Exception as e:
            logger.error(f"❌ Error parsing improved code response: {e}")
            return original_files  # Return original files as fallback

    def _update_session(self, session: CodeGenerationSession):
        """Update session metadata"""
        session.updated_at = datetime.now()
        self.sessions[session.session_id] = session

    def _create_error_response(
        self, session_id: str, error_message: str
    ) -> JiraAgentResponse:
        """Create error response"""
        if session_id in self.sessions:
            self.sessions[session_id].current_state = WorkflowState.FAILED
            self.sessions[session_id].error_messages.append(error_message)

        return JiraAgentResponse(
            session_id=session_id,
            current_state=WorkflowState.FAILED,
            success=False,
            message=error_message,
            approval_required=False,
            iteration_count=0,
            processing_time_ms=0,
            tokens_used=0,
            warnings=[error_message],
        )

    def cleanup_old_sessions(self, max_age_hours: int = 24):
        """Clean up old sessions"""
        current_time = datetime.now()
        sessions_to_remove = []

        for session_id, session in self.sessions.items():
            age_hours = (current_time - session.created_at).total_seconds() / 3600
            if age_hours > max_age_hours:
                sessions_to_remove.append(session_id)

        for session_id in sessions_to_remove:
            del self.sessions[session_id]
            logger.info(f"🧹 Cleaned up old session: {session_id}")
