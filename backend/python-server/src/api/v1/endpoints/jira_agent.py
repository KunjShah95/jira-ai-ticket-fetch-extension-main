"""
JIRA Agent API endpoints
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from typing import Dict, Any
from loguru import logger

from src.models.schemas import (
    JiraAgentRequest,
    JiraAgentResponse,
    ApprovalRequest,
)
from src.services.jira_agent_workflow import JiraAgentWorkflowService

# Create router
router = APIRouter()

# Global workflow service instance
workflow_service = JiraAgentWorkflowService()


@router.on_event("startup")
async def startup_event():
    """Initialize workflow service on startup"""
    await workflow_service.initialize()


@router.post("/start", response_model=JiraAgentResponse)
async def start_jira_agent(request: JiraAgentRequest) -> JiraAgentResponse:
    """
    Start the JIRA agent process for a ticket

    This endpoint:
    1. Fetches the JIRA ticket
    2. Analyzes requirements and technical specs
    3. Generates initial code
    4. Returns code for user approval
    """
    try:
        logger.info(f"🎫 Starting JIRA agent for ticket: {request.ticket_key}")

        response = await workflow_service.start_jira_agent_process(request)

        if response.success:
            logger.info(
                f"✅ JIRA agent process started successfully for ticket: {request.ticket_key}"
            )
        else:
            logger.error(
                f"❌ JIRA agent process failed for ticket: {request.ticket_key}"
            )

        return response

    except Exception as e:
        logger.error(f"❌ Error starting JIRA agent process: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to start JIRA agent process: {str(e)}"
        )


@router.post("/approve", response_model=JiraAgentResponse)
async def handle_approval(approval_request: ApprovalRequest) -> JiraAgentResponse:
    """
    Handle user approval or feedback for generated code

    This endpoint handles:
    - Code approval (finalizes the generation)
    - Code rejection with feedback (triggers regeneration)
    """
    try:
        logger.info(
            f"📝 Processing approval for session: {approval_request.session_id}"
        )

        response = await workflow_service.handle_user_approval(approval_request)

        if response.success:
            if response.current_state.value == "completed":
                logger.info(
                    f"✅ Code approved and finalized for session: {approval_request.session_id}"
                )
            else:
                logger.info(
                    f"🔄 Code regenerated based on feedback for session: {approval_request.session_id}"
                )
        else:
            logger.error(
                f"❌ Failed to process approval for session: {approval_request.session_id}"
            )

        return response

    except Exception as e:
        logger.error(f"❌ Error processing approval: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to process approval: {str(e)}"
        )


@router.get("/status/{session_id}", response_model=JiraAgentResponse)
async def get_session_status(session_id: str) -> JiraAgentResponse:
    """
    Get the current status of a JIRA agent session
    """
    try:
        logger.info(f"📊 Getting status for session: {session_id}")

        response = await workflow_service.get_session_status(session_id)

        if not response:
            raise HTTPException(
                status_code=404, detail=f"Session not found: {session_id}"
            )

        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error getting session status: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to get session status: {str(e)}"
        )


@router.get("/sessions", response_model=Dict[str, Any])
async def list_active_sessions() -> Dict[str, Any]:
    """
    List all active JIRA agent sessions
    """
    try:
        sessions = workflow_service.sessions

        session_summaries = {}
        for session_id, session in sessions.items():
            session_summaries[session_id] = {
                "ticket_key": session.ticket_key,
                "current_state": session.current_state.value,
                "iteration_count": session.iteration_count,
                "created_at": session.created_at.isoformat(),
                "updated_at": session.updated_at.isoformat(),
            }

        return {"total_sessions": len(sessions), "sessions": session_summaries}

    except Exception as e:
        logger.error(f"❌ Error listing sessions: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to list sessions: {str(e)}"
        )


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str) -> Dict[str, str]:
    """
    Delete a specific session
    """
    try:
        if session_id not in workflow_service.sessions:
            raise HTTPException(
                status_code=404, detail=f"Session not found: {session_id}"
            )

        del workflow_service.sessions[session_id]
        logger.info(f"🗑️ Deleted session: {session_id}")

        return {"message": f"Session {session_id} deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error deleting session: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to delete session: {str(e)}"
        )


@router.post("/cleanup")
async def cleanup_old_sessions(
    background_tasks: BackgroundTasks, max_age_hours: int = 24
) -> Dict[str, str]:
    """
    Clean up old sessions (runs in background)
    """
    try:
        background_tasks.add_task(workflow_service.cleanup_old_sessions, max_age_hours)

        return {
            "message": f"Cleanup task started for sessions older than {max_age_hours} hours"
        }

    except Exception as e:
        logger.error(f"❌ Error starting cleanup task: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to start cleanup task: {str(e)}"
        )


@router.get("/health")
async def health_check() -> Dict[str, Any]:
    """
    Health check for JIRA agent service
    """
    try:
        return {
            "status": "healthy",
            "service": "jira-agent",
            "active_sessions": len(workflow_service.sessions),
            "workflow_service_initialized": workflow_service.llm_service is not None,
        }

    except Exception as e:
        logger.error(f"❌ Health check failed: {e}")
        return {"status": "unhealthy", "error": str(e)}
