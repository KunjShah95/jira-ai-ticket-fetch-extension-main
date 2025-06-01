import React from 'react';

interface ApiDocsProps {
  onClose: () => void;
}

export const ApiDocs: React.FC<ApiDocsProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="card max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="heading-2 mb-0">Backend API Documentation</h2>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xl"
          >
            ✕
          </button>
        </div>

        <div className="space-y-6">
          <section>
            <h3 className="heading-3">API Overview</h3>
            <p className="paragraph">
              The AI Dev Assistant uses both a Node.js backend and a Python backend for different aspects of functionality.
              This document describes the API endpoints available for integration.
            </p>
          </section>

          <section>
            <h3 className="heading-3">Node.js Backend</h3>
            <p className="paragraph">
              The Node.js backend handles Jira integration, GitHub operations, and authentication.
            </p>
            
            <div className="space-y-4 mt-4">
              <div className="bg-gray-900 p-4 rounded-md">
                <h4 className="text-lg font-medium text-green-400 mb-2">GET /api/jira/tickets</h4>
                <p className="text-gray-300 mb-2">Retrieves all Jira tickets for the current user.</p>
                <p className="text-sm text-gray-400 mb-2">Response:</p>
                <pre className="bg-gray-950 p-2 rounded text-gray-300 text-sm overflow-x-auto">
{`{
  "tickets": [
    {
      "id": "12345",
      "key": "PROJ-123",
      "summary": "Implement feature X",
      "description": "Detailed description...",
      "status": "In Progress",
      "assignee": "John Doe"
    },
    // More tickets...
  ]
}`}
                </pre>
              </div>

              <div className="bg-gray-900 p-4 rounded-md">
                <h4 className="text-lg font-medium text-green-400 mb-2">GET /api/jira/tickets/:id</h4>
                <p className="text-gray-300 mb-2">Retrieves a specific Jira ticket by ID.</p>
                <p className="text-sm text-gray-400 mb-2">Response:</p>
                <pre className="bg-gray-950 p-2 rounded text-gray-300 text-sm overflow-x-auto">
{`{
  "id": "12345",
  "key": "PROJ-123",
  "summary": "Implement feature X",
  "description": "Detailed description...",
  "status": "In Progress",
  "assignee": "John Doe",
  "comments": [
    {
      "author": "Jane Smith",
      "text": "Comment text...",
      "created": "2025-05-30T14:20:00Z"
    }
  ]
}`}
                </pre>
              </div>

              <div className="bg-gray-900 p-4 rounded-md">
                <h4 className="text-lg font-medium text-blue-400 mb-2">POST /api/jira/tickets/:id/comment</h4>
                <p className="text-gray-300 mb-2">Adds a comment to a Jira ticket.</p>
                <p className="text-sm text-gray-400 mb-2">Request Body:</p>
                <pre className="bg-gray-950 p-2 rounded text-gray-300 text-sm overflow-x-auto">
{`{
  "text": "Comment text here"
}`}
                </pre>
              </div>
            </div>
          </section>

          <section>
            <h3 className="heading-3">Python Backend</h3>
            <p className="paragraph">
              The Python backend handles LLM integration, code generation, and complex workflows.
            </p>
            
            <div className="space-y-4 mt-4">
              <div className="bg-gray-900 p-4 rounded-md">
                <h4 className="text-lg font-medium text-green-400 mb-2">POST /api/v1/generate</h4>
                <p className="text-gray-300 mb-2">Generates code based on a Jira ticket's requirements.</p>
                <p className="text-sm text-gray-400 mb-2">Request Body:</p>
                <pre className="bg-gray-950 p-2 rounded text-gray-300 text-sm overflow-x-auto">
{`{
  "ticketId": "PROJ-123",
  "options": {
    "language": "typescript",
    "framework": "react"
  }
}`}
                </pre>
                <p className="text-sm text-gray-400 mb-2 mt-3">Response:</p>
                <pre className="bg-gray-950 p-2 rounded text-gray-300 text-sm overflow-x-auto">
{`{
  "workflowId": "wf-12345",
  "status": "in-progress",
  "estimatedTime": 60 // seconds
}`}
                </pre>
              </div>

              <div className="bg-gray-900 p-4 rounded-md">
                <h4 className="text-lg font-medium text-green-400 mb-2">GET /api/v1/workflows/:id</h4>
                <p className="text-gray-300 mb-2">Gets the status of a code generation workflow.</p>
                <p className="text-sm text-gray-400 mb-2">Response:</p>
                <pre className="bg-gray-950 p-2 rounded text-gray-300 text-sm overflow-x-auto">
{`{
  "id": "wf-12345",
  "taskKey": "PROJ-123",
  "status": "completed",
  "progress": 100,
  "steps": [
    {
      "id": "analyze",
      "name": "Analyzing Requirements",
      "status": "completed"
    },
    {
      "id": "generate",
      "name": "Generating Code",
      "status": "completed"
    },
    {
      "id": "test",
      "name": "Testing Code",
      "status": "completed"
    }
  ],
  "createdAt": "2025-05-30T14:20:00Z",
  "updatedAt": "2025-05-30T14:25:00Z"
}`}
                </pre>
              </div>
            </div>
          </section>

          <section>
            <h3 className="heading-3">VS Code Extension Integration</h3>
            <p className="paragraph">
              The VS Code extension can be triggered via custom URI schemes:
            </p>
            
            <div className="bg-gray-900 p-4 rounded-md">
              <h4 className="text-lg font-medium text-green-400 mb-2">Deep Linking</h4>
              <p className="text-gray-300 mb-2">Format: <code>vscode:extension/void-editor.ai-dev-assistant?action=ACTION&id=ID</code></p>
              <p className="text-sm text-gray-400 mb-2">Supported Actions:</p>
              <ul className="list-disc pl-6 text-gray-300">
                <li><strong>openDashboard</strong> - Opens the extension dashboard</li>
                <li><strong>startWorkflow</strong> - Starts a workflow with the specified Jira ticket ID</li>
                <li><strong>viewProgress</strong> - Views progress of a specific workflow ID</li>
              </ul>
            </div>
          </section>

          <section>
            <h3 className="heading-3">Using the APIs</h3>
            <p className="paragraph">
              The frontend includes a BackendService that simplifies communication with these APIs:
            </p>
            <pre className="bg-gray-950 p-3 rounded text-gray-300 text-sm overflow-x-auto">
{`import { backendService } from '../services/BackendService';

// Example usage
async function fetchTickets() {
  const response = await backendService.getJiraTickets();
  if (response.success) {
    setTickets(response.data);
  } else {
    console.error(response.error);
  }
}

// Open in VS Code
function openDashboardInVSCode() {
  backendService.openInVSCode('openDashboard');
}

// Start workflow in VS Code
function startWorkflow(ticketId) {
  backendService.openInVSCode('startWorkflow', ticketId);
}`}
            </pre>
          </section>
        </div>
      </div>
    </div>
  );
};
