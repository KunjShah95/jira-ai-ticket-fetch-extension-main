"""
JIRA Service for fetching and analyzing tickets
"""

import asyncio
from typing import Optional, Dict, Any
from jira import JIRA
from loguru import logger

from src.models.schemas import (
    JiraCredentials,
    JiraTicketData,
    JiraTicketAnalysis,
    IssueType,
    Priority,
    Status,
)
from src.services.base_llm import BaseLLMService
from src.services.llm_factory import LLMFactory


class JiraService:
    """Service for interacting with JIRA API and analyzing tickets"""

    def __init__(self):
        self.jira_client: Optional[JIRA] = None
        self.credentials: Optional[JiraCredentials] = None
        self.llm_service: Optional[BaseLLMService] = None

    async def initialize(self, credentials: JiraCredentials):
        """Initialize JIRA client with credentials"""
        try:
            self.credentials = credentials
            self.jira_client = JIRA(
                server=credentials.server_url,
                basic_auth=(credentials.username, credentials.api_token),
            )

            # Initialize LLM service for analysis
            self.llm_service = LLMFactory.create_llm()

            # Test connection
            await asyncio.get_event_loop().run_in_executor(
                None, self.jira_client.myself
            )

            logger.info(
                f"✅ JIRA client initialized successfully for {credentials.server_url}"
            )
            return True

        except Exception as e:
            logger.error(f"❌ Failed to initialize JIRA client: {e}")
            return False

    async def fetch_ticket(self, ticket_key: str) -> Optional[JiraTicketData]:
        """Fetch ticket data from JIRA"""
        if not self.jira_client:
            raise ValueError("JIRA client not initialized")

        try:
            logger.info(f"🎫 Fetching JIRA ticket: {ticket_key}")

            # Fetch the issue
            issue = await asyncio.get_event_loop().run_in_executor(
                None, self.jira_client.issue, ticket_key
            )

            # Map JIRA issue to our data model
            ticket_data = JiraTicketData(
                key=issue.key,
                summary=str(issue.fields.summary),
                description=str(issue.fields.description)
                if issue.fields.description
                else "",
                issue_type=self._map_issue_type(str(issue.fields.issuetype)),
                priority=self._map_priority(str(issue.fields.priority))
                if issue.fields.priority
                else Priority.MEDIUM,
                status=self._map_status(str(issue.fields.status)),
                assignee=str(issue.fields.assignee.displayName)
                if issue.fields.assignee
                else None,
                reporter=str(issue.fields.reporter.displayName)
                if issue.fields.reporter
                else None,
                labels=[str(label) for label in issue.fields.labels]
                if issue.fields.labels
                else [],
                components=[str(comp.name) for comp in issue.fields.components]
                if issue.fields.components
                else [],
                custom_fields=self._extract_custom_fields(issue),
            )

            logger.info(f"✅ Successfully fetched ticket: {ticket_key}")
            return ticket_data

        except Exception as e:
            logger.error(f"❌ Failed to fetch ticket {ticket_key}: {e}")
            return None

    async def analyze_ticket(
        self, ticket_data: JiraTicketData
    ) -> Optional[JiraTicketAnalysis]:
        """Analyze JIRA ticket to extract requirements and technical specifications"""
        if not self.llm_service:
            raise ValueError("LLM service not initialized")

        try:
            logger.info(f"🔍 Analyzing ticket: {ticket_data.key}")

            # Construct analysis prompt
            analysis_prompt = self._build_analysis_prompt(ticket_data)

            # Get LLM analysis
            llm_response = await self.llm_service.generate_response(
                prompt=analysis_prompt,
                system_message="You are an expert software analyst. Analyze JIRA tickets and extract structured requirements for code generation.",
                max_tokens=1500,
            )

            # Parse the response into structured analysis
            analysis = await self._parse_analysis_response(
                llm_response.content, ticket_data.key
            )

            logger.info(f"✅ Ticket analysis completed for: {ticket_data.key}")
            return analysis

        except Exception as e:
            logger.error(f"❌ Failed to analyze ticket {ticket_data.key}: {e}")
            return None

    def _build_analysis_prompt(self, ticket_data: JiraTicketData) -> str:
        """Build prompt for ticket analysis"""
        prompt = f"""
        Analyze the following JIRA ticket and extract structured requirements:

        **Ticket Key:** {ticket_data.key}
        **Summary:** {ticket_data.summary}
        **Type:** {ticket_data.issue_type}
        **Priority:** {ticket_data.priority}
        **Description:**
        {ticket_data.description}

        **Labels:** {", ".join(ticket_data.labels) if ticket_data.labels else "None"}
        **Components:** {", ".join(ticket_data.components) if ticket_data.components else "None"}

        Please provide a structured analysis in the following JSON format:
        {{
            "requirements": ["list of functional requirements"],
            "technical_specs": ["list of technical specifications"],
            "acceptance_criteria": ["list of acceptance criteria"],
            "complexity_score": 1-10,
            "estimated_files": estimated_number_of_files,
            "suggested_technologies": ["recommended technologies/frameworks"],
            "dependencies": ["required dependencies/libraries"]
        }}

        Focus on:
        1. What functionality needs to be implemented
        2. Technical constraints and requirements
        3. Expected behavior and outcomes
        4. Performance considerations
        5. Integration requirements
        """

        return prompt

    async def _parse_analysis_response(
        self, response: str, ticket_key: str
    ) -> JiraTicketAnalysis:
        """Parse LLM response into structured analysis"""
        try:
            # Try to extract JSON from the response
            import json
            import re

            # Find JSON block in the response
            json_match = re.search(r"\{.*\}", response, re.DOTALL)
            if json_match:
                json_str = json_match.group(0)
                analysis_data = json.loads(json_str)
            else:
                # Fallback: parse manually if JSON extraction fails
                analysis_data = self._manual_parse_analysis(response)

            return JiraTicketAnalysis(
                ticket_key=ticket_key,
                requirements=analysis_data.get("requirements", []),
                technical_specs=analysis_data.get("technical_specs", []),
                acceptance_criteria=analysis_data.get("acceptance_criteria", []),
                complexity_score=min(
                    10, max(1, analysis_data.get("complexity_score", 5))
                ),
                estimated_files=max(1, analysis_data.get("estimated_files", 3)),
                suggested_technologies=analysis_data.get("suggested_technologies", []),
                dependencies=analysis_data.get("dependencies", []),
            )

        except Exception as e:
            logger.warning(
                f"⚠️ Failed to parse analysis JSON for {ticket_key}, using fallback: {e}"
            )
            return self._create_fallback_analysis(ticket_key)

    def _manual_parse_analysis(self, response: str) -> Dict[str, Any]:
        """Manual parsing fallback if JSON parsing fails"""
        # Simple keyword-based extraction
        lines = response.lower().split("\n")

        requirements = []
        technical_specs = []
        acceptance_criteria = []

        current_section = None
        for line in lines:
            line = line.strip()
            if "requirement" in line:
                current_section = "requirements"
            elif "technical" in line or "spec" in line:
                current_section = "technical_specs"
            elif "acceptance" in line or "criteria" in line:
                current_section = "acceptance_criteria"
            elif line.startswith("- ") or line.startswith("* "):
                item = line[2:].strip()
                if current_section == "requirements":
                    requirements.append(item)
                elif current_section == "technical_specs":
                    technical_specs.append(item)
                elif current_section == "acceptance_criteria":
                    acceptance_criteria.append(item)

        return {
            "requirements": requirements or ["Implement functionality as described"],
            "technical_specs": technical_specs or ["Follow standard coding practices"],
            "acceptance_criteria": acceptance_criteria
            or ["Code should work as expected"],
            "complexity_score": 5,
            "estimated_files": 3,
            "suggested_technologies": ["javascript", "typescript"],
            "dependencies": [],
        }

    def _create_fallback_analysis(self, ticket_key: str) -> JiraTicketAnalysis:
        """Create fallback analysis if parsing completely fails"""
        return JiraTicketAnalysis(
            ticket_key=ticket_key,
            requirements=["Implement functionality as described in ticket"],
            technical_specs=["Follow project coding standards"],
            acceptance_criteria=["Code should compile and run without errors"],
            complexity_score=5,
            estimated_files=3,
            suggested_technologies=["javascript", "typescript"],
            dependencies=[],
        )

    def _map_issue_type(self, jira_type: str) -> IssueType:
        """Map JIRA issue type to our enum"""
        type_mapping = {
            "task": IssueType.TASK,
            "story": IssueType.STORY,
            "bug": IssueType.BUG,
            "epic": IssueType.EPIC,
            "sub-task": IssueType.SUBTASK,
            "subtask": IssueType.SUBTASK,
        }
        return type_mapping.get(jira_type.lower(), IssueType.TASK)

    def _map_priority(self, jira_priority: str) -> Priority:
        """Map JIRA priority to our enum"""
        priority_mapping = {
            "lowest": Priority.LOWEST,
            "low": Priority.LOW,
            "medium": Priority.MEDIUM,
            "high": Priority.HIGH,
            "highest": Priority.HIGHEST,
        }
        return priority_mapping.get(jira_priority.lower(), Priority.MEDIUM)

    def _map_status(self, jira_status: str) -> Status:
        """Map JIRA status to our enum"""
        status_mapping = {
            "to do": Status.TODO,
            "todo": Status.TODO,
            "in progress": Status.IN_PROGRESS,
            "in review": Status.IN_REVIEW,
            "done": Status.DONE,
            "closed": Status.CLOSED,
        }
        return status_mapping.get(jira_status.lower(), Status.TODO)

    def _extract_custom_fields(self, issue) -> Dict[str, Any]:
        """Extract custom fields from JIRA issue"""
        custom_fields = {}

        # Get all fields
        all_fields = self.jira_client.fields()
        custom_field_names = {
            field["id"]: field["name"]
            for field in all_fields
            if field["id"].startswith("customfield_")
        }

        for field_id, field_name in custom_field_names.items():
            if hasattr(issue.fields, field_id):
                field_value = getattr(issue.fields, field_id)
                if field_value is not None:
                    custom_fields[field_name] = str(field_value)

        return custom_fields
