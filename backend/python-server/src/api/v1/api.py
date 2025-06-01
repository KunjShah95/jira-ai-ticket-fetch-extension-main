from fastapi import APIRouter
from src.api.v1.endpoints import generation, health, jira_agent

api_router = APIRouter()

# Include routers
api_router.include_router(generation.router, prefix="/generate", tags=["generation"])
api_router.include_router(health.router, prefix="/health", tags=["health"])
api_router.include_router(jira_agent.router, prefix="/jira-agent", tags=["jira-agent"])
