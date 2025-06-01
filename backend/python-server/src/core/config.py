from pydantic import BaseSettings

class Settings(BaseSettings):
    ENVIRONMENT: str = "dev"
    HOST: str = "127.0.0.1"
    PORT: int = 8000
    DEBUG: bool = True
    LLM_PROVIDER: str = "OpenAI"

    # Jira credentials loaded from .env
    JIRA_API_TOKEN: str
    JIRA_EMAIL: str
    JIRA_SERVER: str

    class Config:
        env_file = ".env"

settings = Settings()
