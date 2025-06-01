/**
 * Backend service for communicating with the node and python backends
 */

const NODE_SERVER_URL = process.env.REACT_APP_NODE_SERVER_URL || 'http://localhost:3001';
const PYTHON_SERVER_URL = process.env.REACT_APP_PYTHON_SERVER_URL || 'http://localhost:5000';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface JiraTicket {
  id: string;
  key: string;
  summary: string;
  description: string;
  status: string;
  assignee?: string;
}

export interface WorkflowStatus {
  id: string;
  taskKey: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  progress: number;
  steps: {
    id: string;
    name: string;
    status: 'pending' | 'in-progress' | 'completed' | 'failed';
    output?: string;
  }[];
  createdAt: string;
  updatedAt: string;
}

class BackendService {
  // Node server API endpoints
  async getJiraTickets(): Promise<ApiResponse<JiraTicket[]>> {
    try {
      const response = await fetch(`${NODE_SERVER_URL}/api/jira/tickets`);
      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      console.error('Error fetching Jira tickets:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  async getJiraTicket(ticketId: string): Promise<ApiResponse<JiraTicket>> {
    try {
      const response = await fetch(`${NODE_SERVER_URL}/api/jira/tickets/${ticketId}`);
      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      console.error(`Error fetching Jira ticket ${ticketId}:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  // Python server API endpoints
  async generateCode(ticketId: string): Promise<ApiResponse<string>> {
    try {
      const response = await fetch(`${PYTHON_SERVER_URL}/api/v1/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ticketId }),
      });
      const data = await response.json();
      return { success: response.ok, data, error: !response.ok ? data.error : undefined };
    } catch (error) {
      console.error(`Error generating code for ticket ${ticketId}:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  async getWorkflowStatus(workflowId: string): Promise<ApiResponse<WorkflowStatus>> {
    try {
      const response = await fetch(`${PYTHON_SERVER_URL}/api/v1/workflows/${workflowId}`);
      const data = await response.json();
      return { success: response.ok, data, error: !response.ok ? data.error : undefined };
    } catch (error) {
      console.error(`Error fetching workflow status ${workflowId}:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  // VS Code Extension communication (via deep links)
  openInVSCode(action: string, id?: string): void {
    const EXTENSION_MARKETPLACE_URL = "vscode:extension/void-editor.ai-dev-assistant";
    const EXTENSION_MARKETPLACE_WEB_URL = "https://marketplace.visualstudio.com/items?itemName=void-editor.ai-dev-assistant";
    
    let deepLink = `${EXTENSION_MARKETPLACE_URL}?action=${action}`;
    if (id) {
      deepLink += `&id=${id}`;
    }
    
    // Try to open in VS Code with deep link, fallback to marketplace
    window.location.href = deepLink;
    
    // If the vscode: protocol link doesn't work after a short delay, 
    // redirect to the marketplace as fallback
    setTimeout(() => {
      window.open(EXTENSION_MARKETPLACE_WEB_URL, "_blank");
    }, 1000);
  }
}

// Export as singleton
export const backendService = new BackendService();
