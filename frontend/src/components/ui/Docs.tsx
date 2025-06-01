import React from 'react';

interface DocsProps {
  onClose: () => void;
}

export const Docs: React.FC<DocsProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="card max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="heading-2 mb-0">AI Dev Assistant Documentation</h2>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xl"
          >
            ✕
          </button>
        </div>

        <div className="space-y-6">
          <section>
            <h3 className="heading-3">Getting Started</h3>
            <p className="paragraph">
              AI Dev Assistant is an integrated solution that connects Jira with your VS Code development environment.
              This documentation will help you set up and use the extension effectively.
            </p>
          </section>

          <section>
            <h3 className="heading-3">Installation</h3>
            <ol className="list-decimal pl-6 space-y-2">
              <li>Download the extension from this site or the VS Code marketplace</li>
              <li>Install the extension in VS Code (either through the VSIX file or marketplace)</li>
              <li>Configure your Jira connection in the extension settings</li>
            </ol>
          </section>

          <section>
            <h3 className="heading-3">Features</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Jira Integration:</strong> Connect directly to your Jira instance to fetch ticket details and update progress</li>
              <li><strong>AI Code Generation:</strong> Generate code based on Jira ticket requirements</li>
              <li><strong>Workflow Automation:</strong> Automate git branches, tests, and updates</li>
              <li><strong>Progress Tracking:</strong> Monitor development progress within VS Code</li>
            </ul>
          </section>

          <section>
            <h3 className="heading-3">Configuration</h3>
            <p className="paragraph">To configure the extension, open VS Code settings and search for "AI Dev Assistant":</p>
            <div className="bg-gray-900 p-3 rounded font-mono text-sm mb-3">
              <p>{/* Jira configuration */}</p>
              <p>"aiDevAssistant.jira.instanceUrl": "https://yourcompany.atlassian.net"</p>
              <p>"aiDevAssistant.llm.provider": "openai" {/* or "anthropic", "azure-openai" */}</p>
              <p>"aiDevAssistant.git.autoCreateBranches": true</p>
            </div>
          </section>

          <section>
            <h3 className="heading-3">Using the Extension</h3>
            <h4 className="text-lg font-medium text-blue-200 mb-2">Starting a Workflow:</h4>
            <ol className="list-decimal pl-6 space-y-2 mb-4">
              <li>Open the AI Dev Assistant panel in VS Code</li>
              <li>Click "Start Development Workflow"</li>
              <li>Enter your Jira ticket ID when prompted</li>
              <li>The extension will analyze the ticket and generate code</li>
            </ol>
            
            <h4 className="text-lg font-medium text-blue-200 mb-2">Reviewing Progress:</h4>
            <ol className="list-decimal pl-6 space-y-2">
              <li>Open the AI Dev Assistant panel</li>
              <li>Click "View Development Progress"</li>
              <li>Review the current status of all workflows</li>
            </ol>
          </section>

          <section>
            <h3 className="heading-3">Backend Integration</h3>
            <p className="paragraph">
              The extension can connect to a backend server for enhanced functionality:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Python server for advanced LLM integrations</li>
              <li>Node.js server for Jira and GitHub integration</li>
              <li>Webhook support for automated triggers</li>
            </ul>
          </section>

          <section>
            <h3 className="heading-3">Troubleshooting</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Extension not activating:</strong> Check VS Code version (requires VS Code 1.100.0+)</li>
              <li><strong>Jira connection failing:</strong> Verify your Jira credentials and URL</li>
              <li><strong>Code generation issues:</strong> Check the LLM provider configuration</li>
              <li><strong>Backend connection:</strong> Ensure the backend servers are running (if configured)</li>
            </ul>
          </section>

          <section>
            <h3 className="heading-3">Support</h3>
            <p className="paragraph">
              For additional help, please visit our <a href="https://github.com/void-editor/ai-dev-assistant" className="link">GitHub repository</a> or submit an issue ticket.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};
