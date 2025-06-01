import * as vscode from 'vscode';
import { OrchestrationService } from './services/orchestrationService';
import { JiraService } from './services/jiraService';
import { LLMService } from './services/llmService';
import { GitService } from './services/gitService';
import { TestingService } from './services/testingService';
import { ProgressTrackingService } from './services/progressTrackingService';
import { WebhookService } from './services/webhookService';
import { NotificationService } from './services/notificationService';
import { BackupService } from './services/backupService';
import { ConfigurationManager } from './utils/configurationManager';
import { Logger } from './utils/logger';
import { ErrorHandler } from './utils/errorHandler';
import { WorkflowEvent } from './types';

// Polyfill for fetch in Node.js (VS Code extension host)
import nodeFetch from 'node-fetch';
const fetch: typeof nodeFetch = (typeof (globalThis as any).fetch === 'function' ? (globalThis as any).fetch : nodeFetch) as typeof nodeFetch;

// Global extension context for services to access
let extensionContext: vscode.ExtensionContext;

// Function to get extension context
export function getExtensionContext(): vscode.ExtensionContext {
	return extensionContext;
}

// Helper to configure Jira
async function configureJiraConnection(jiraService: JiraService): Promise<void> {
	try {
		vscode.window.showInformationMessage('Configuring Jira connection...');
		const success = await jiraService.authenticate();
		if (success) {
			vscode.window.showInformationMessage('✅ Successfully connected to Jira!');
		} else {
			vscode.window.showErrorMessage('❌ Failed to connect to Jira. Please check your configuration.');
		}
	} catch (error: any) {
		vscode.window.showErrorMessage(`Jira configuration failed: ${error.message}`);
	}
}

// Start workflow for a Jira task key
async function startDevelopmentWorkflow(
	orchestrationService: OrchestrationService,
	jiraService: JiraService
): Promise<void> {
	try {
		if (!jiraService.isAuthenticated()) {
			const configureFirst = await vscode.window.showWarningMessage(
				'Jira not configured. Configure connection first?',
				'Configure Jira',
				'Cancel'
			);
			if (configureFirst === 'Configure Jira') {
				await vscode.commands.executeCommand('aiDevAssistant.configureJira');
				if (!jiraService.isAuthenticated()) {
					return;
				}
			} else {
				return;
			}
		}

		const taskKey = await vscode.window.showInputBox({
			prompt: 'Enter Jira task key (e.g., PROJ-123)',
			placeHolder: 'PROJ-123',
			validateInput: (value) => {
				if (!value || !value.match(/^[A-Z]+-\d+$/)) {
					return 'Please enter a valid Jira task key (e.g., PROJ-123)';
				}
				return null;
			}
		});

		if (!taskKey) return;

		vscode.window.showInformationMessage(`Starting development workflow for ${taskKey}...`);
		await orchestrationService.startDevelopmentWorkflow(taskKey);

		vscode.window.showInformationMessage(
			`✅ Workflow started for ${taskKey}!`,
			'View Progress'
		).then(selection => {
			if (selection === 'View Progress') {
				vscode.commands.executeCommand('aiDevAssistant.viewProgress');
			}
		});

	} catch (error: any) {
		vscode.window.showErrorMessage(`Failed to start workflow: ${error.message ?? error}`);
	}
}

// Show progress dashboard as webview
async function viewProgressDashboard(progressService: ProgressTrackingService): Promise<void> {
	try {
		const workflows = await progressService.getAllWorkflows();
		if (workflows.length === 0) {
			vscode.window.showInformationMessage('No workflows found. Start a new workflow to see progress here.');
			return;
		}

		const panel = vscode.window.createWebviewPanel(
			'progressDashboard',
			'AI Dev Assistant - Progress Dashboard',
			vscode.ViewColumn.One,
			{ enableScripts: true }
		);

		panel.webview.html = generateProgressDashboardHTML(workflows);

		panel.webview.onDidReceiveMessage(async (message: any) => {
			switch (message.command) {
				case 'openFrontend':
					vscode.env.openExternal(vscode.Uri.parse('http://localhost:3000'));
					break;
				case 'retryWorkflow':
					await vscode.commands.executeCommand('aiDevAssistant.retryWorkflow', message.workflowId);
					break;
				case 'cancelWorkflow':
					await vscode.commands.executeCommand('aiDevAssistant.cancelWorkflow', message.workflowId);
					break;
				case 'deleteWorkflow':
					await progressService.deleteWorkflow(message.workflowId);
					const updatedWorkflows = await progressService.getAllWorkflows();
					panel.webview.html = generateProgressDashboardHTML(updatedWorkflows);
					break;
			}
		});

	} catch (error: any) {
		vscode.window.showErrorMessage(`Failed to view progress: ${error.message ?? error}`);
	}
}

// Retry workflow
async function retryWorkflow(
	orchestrationService: OrchestrationService,
	workflowId: string
): Promise<void> {
	try {
		await orchestrationService.processWorkflowStep(workflowId);
		vscode.window.showInformationMessage(`Retrying workflow ${workflowId}...`);
	} catch (error: any) {
		vscode.window.showErrorMessage(`Failed to retry workflow: ${error.message ?? error}`);
	}
}

// Select a workflow to retry
async function selectWorkflowForRetry(
	progressService: ProgressTrackingService
): Promise<string | undefined> {
	const workflows = await progressService.getAllWorkflows();
	const failedWorkflows = workflows.filter((w: any) => w.status === 'failed');
	if (failedWorkflows.length === 0) {
		vscode.window.showInformationMessage('No failed workflows to retry');
		return undefined;
	}
	const selected = await vscode.window.showQuickPick(
		failedWorkflows.map((w: any) => ({ label: w.id, description: w.jiraTask?.key })),
		{ placeHolder: 'Select workflow to retry' }
	);
	return selected?.label;
}

// Sync Jira tasks
async function syncJiraTasks(jiraService: JiraService): Promise<void> {
	try {
		await jiraService.getTasks();
		vscode.window.showInformationMessage('Jira tasks synced successfully!');
	} catch (error: any) {
		vscode.window.showErrorMessage(`Failed to sync Jira tasks: ${error.message ?? error}`);
	}
}

// Generate code for a Jira task
async function generateCodeForTask(llmService: LLMService, jiraService: JiraService, taskKey?: string): Promise<void> {
	try {
		if (!taskKey) {
			taskKey = await vscode.window.showInputBox({
				prompt: 'Enter Jira task key to generate code for',
				placeHolder: 'PROJ-123'
			});
		}
		if (!taskKey) return;
		const task = await jiraService.getTask(taskKey);
		vscode.window.showInformationMessage(`Generating code for ${taskKey}...`);

		// Basic implementation
		const request = {
			task: task,
			context: {},
			requirements: task.description,
			fileType: 'component' as const
		};

		await llmService.generateCode(request);
		vscode.window.showInformationMessage(`Code generated for ${taskKey}`);
	} catch (error: any) {
		vscode.window.showErrorMessage(`Failed to generate code: ${error.message ?? error}`);
	}
}

// Run project tests
async function runProjectTests(testingService: TestingService): Promise<void> {
	try {
		vscode.window.showInformationMessage('Running project tests...');
		const results = await testingService.runTests();
		vscode.window.showInformationMessage(`Tests completed with ${results.passed} passed, ${results.failed} failed`);
	} catch (error: any) {
		vscode.window.showErrorMessage(`Test execution failed: ${error.message ?? error}`);
	}
}

// Review code
async function reviewCurrentCode(llmService: LLMService): Promise<void> {
	try {
		const activeEditor = vscode.window.activeTextEditor;
		if (!activeEditor) {
			vscode.window.showWarningMessage('No active editor. Please open a file to review.');
			return;
		}
		const code = activeEditor.document.getText();
		const fileName = activeEditor?.document?.fileName?.split(/[\\\/]/).pop() || 'Untitled';
		vscode.window.showInformationMessage('Reviewing code...');
		const review = await llmService.reviewCode(code!, `File: ${fileName}`);
		const reviewDoc = await vscode.workspace.openTextDocument({
			content: `Code Review for ${fileName}\n\n${review}`,
			language: 'markdown'
		});
		await vscode.window.showTextDocument(reviewDoc);
	} catch (error: any) {
		vscode.window.showErrorMessage(`Code review failed: ${error.message ?? error}`);
	}
}

// Progress dashboard HTML
function generateProgressDashboardHTML(workflows: any[]): string {
	const workflowRows = workflows.map(workflow => {
		const statusClass = `status-${workflow.status}`;
		return `
            <tr>
                <td class="${statusClass}">${workflow.jiraTask?.key ?? ''}</td>
                <td>${workflow.currentStep ?? ''}</td>
                <td>
                    <button class="retry-btn" onclick="retryWorkflow('${workflow.id}')">Retry</button>
                    <button class="cancel-btn" onclick="cancelWorkflow('${workflow.id}')">Cancel</button>
                    <button class="delete-btn" onclick="deleteWorkflow('${workflow.id}')">Delete</button>
                </td>
            </tr>
        `;
	}).join('');

	return `
        <html>
        <head>
            <style>
                th { background-color: #f5f5f5; font-weight: bold; }
                .status-pending { color: #ffa500; }
                .status-in-progress { color: #0066cc; }
                .status-completed { color: #00aa00; }
                .status-failed { color: #cc0000; }
                .progress-bar { background: #e0e0e0; border-radius: 10px; overflow: hidden; height: 20px; margin-bottom: 5px; }
                .progress-fill { background: #0066cc; height: 100%; transition: width 0.3s ease; }
                button { margin-right: 5px; padding: 5px 10px; border: none; border-radius: 3px; cursor: pointer; }
                button:hover { opacity: 0.8; }
                .retry-btn { background: #ff9800; color: white; }
                .cancel-btn { background: #f44336; color: white; }
                .delete-btn { background: #666; color: white; }
                .open-frontend-btn {
                  background: #2563eb;
                  color: #fff;
                  border: none;
                  border-radius: 4px;
                  padding: 8px 16px;
                  font-size: 16px;
                  cursor: pointer;
                  margin-bottom: 16px;
                }
                .open-frontend-btn:hover {
                  background: #1d4ed8;
                }
            </style>
        </head>
        <body>
          <button class="open-frontend-btn" onclick="openFrontend()">Open Frontend UI</button>
          <h1>AI Development Assistant - Progress Dashboard</h1>
          <p>Track your automated development workflows</p>
            <table>
                <thead>
                    <tr>
                        <th>Task</th>
                        <th>Current Step</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${workflowRows}
                </tbody>
            </table>
            <script>
                const vscode = acquireVsCodeApi();
                function openFrontend() {
                  vscode.postMessage({ command: 'openFrontend' });
                }
                function retryWorkflow(id) { vscode.postMessage({ command: 'retryWorkflow', workflowId: id }); }
                function cancelWorkflow(id) { vscode.postMessage({ command: 'cancelWorkflow', workflowId: id }); }
                function deleteWorkflow(id) { vscode.postMessage({ command: 'deleteWorkflow', workflowId: id }); }
            </script>
        </body>
        </html>
    `;
}

// Show welcome message
function showWelcomeMessage(): void {
	const config = vscode.workspace.getConfiguration('aiDevAssistant');
	const hasShownWelcome = config.get('hasShownWelcome', false);

	if (!hasShownWelcome) {
		vscode.window.showInformationMessage(
			'Welcome to AI Development Assistant! This extension helps automate your development workflow with Jira integration.',
			'Configure Jira',
			'Learn More',
			"Don't show again"
		).then(selection => {
			if (selection === 'Configure Jira') {
				vscode.commands.executeCommand('aiDevAssistant.configureJira');
			}
		});
	}
}

// Setup event handlers
function setupEventHandlers(
	orchestrationService: OrchestrationService,
	webhookService: WebhookService,
	notificationService: NotificationService,
	logger: Logger
) {
	orchestrationService.addEventListener((event: WorkflowEvent) => {
		logger.info(`workflows event: ${event.type}`, 'Orchestration');
		// You can add notification or webhook logic here if those APIs are added in the future.
	});
}

// Function to handle deep links from frontend
function handleUri(uri: vscode.Uri): void {
	const queryParams = new URLSearchParams(uri.query);
	const action = queryParams.get('action');
	const id = queryParams.get('id');

	if (action === 'openDashboard') {
		vscode.commands.executeCommand('aiDevAssistant.dashboard.focus');
	} else if (action === 'startWorkflow' && id) {
		vscode.commands.executeCommand('aiDevAssistant.startWorkflow', id);
	} else if (action === 'viewProgress' && id) {
		vscode.commands.executeCommand('aiDevAssistant.viewProgress', id);
	} else {
		// Default action - show the dashboard
		vscode.commands.executeCommand('workbench.view.extension.ai-dev-assistant');
	}
}

// Extension activation
export async function activate(context: vscode.ExtensionContext) {
	extensionContext = context;
	const logger = Logger.getInstance();
	logger.info('Activating AI Development Assistant extension', 'Extension');
	try {
		ConfigurationManager.getInstance(context);
		// Create all services first
		const jiraService = new JiraService();
		const llmService = new LLMService();
		const gitService = new GitService();
		const testingService = new TestingService();
		const progressService = new ProgressTrackingService();
		const webhookService = new WebhookService();
		const notificationService = new NotificationService();
		const backupService = new BackupService();
		// Then create orchestration service with proper dependencies
		const orchestrationService = new OrchestrationService(
			jiraService,
			llmService,
			gitService,
			testingService,
			progressService
		);
		setupEventHandlers(
			orchestrationService,
			webhookService,
			notificationService,
			logger
		);
		const commands = [
			vscode.commands.registerCommand('aiDevAssistant.configureJira', async () => {
				await configureJiraConnection(jiraService);
			}),
			vscode.commands.registerCommand('aiDevAssistant.startWorkflow', async () => {
				await startDevelopmentWorkflow(orchestrationService, jiraService);
			}),
			vscode.commands.registerCommand('aiDevAssistant.viewProgress', async () => {
				await viewProgressDashboard(progressService);
			}),
			vscode.commands.registerCommand('aiDevAssistant.retryWorkflow', async (workflowId?: string) => {
				if (!workflowId) {
					workflowId = await selectWorkflowForRetry(progressService);
				}
				if (workflowId) {
					await retryWorkflow(orchestrationService, workflowId);
				}
			}),
			vscode.commands.registerCommand('aiDevAssistant.restoreBackup', async () => {
				const backups = await backupService.listBackups();
				if (backups.length === 0) {
					vscode.window.showInformationMessage('No backups available');
					return;
				}
				const items = backups.map(backup => ({
					label: backup.description,
					detail: `${backup.timestamp.toLocaleString()} - ${backup.type}`,
					backup
				}));
				const selected = await vscode.window.showQuickPick(items, {
					placeHolder: 'Select backup to restore'
				});
				if (selected) {
					await backupService.restoreBackup(selected.backup.id);
				}
			}),
			vscode.commands.registerCommand('aiDevAssistant.openFrontend', async () => {
				try {
					// Open the frontend URL in the default browser
					await vscode.env.openExternal(vscode.Uri.parse('http://localhost:3000'));
				} catch (error: any) {
					vscode.window.showErrorMessage(`Failed to open frontend: ${error.message ?? error}`);
				}
			}),
			vscode.commands.registerCommand('aiDevAssistant.generateCodeForTask', async (taskKey?: string) => {
				await generateCodeForTask(llmService, jiraService, taskKey);
			}),
			vscode.commands.registerCommand('aiDevAssistant.syncJiraTasks', async () => {
				await syncJiraTasks(jiraService);
			}),
			vscode.commands.registerCommand('aiDevAssistant.runTests', async () => {
				await runProjectTests(testingService);
			}),
			vscode.commands.registerCommand('aiDevAssistant.reviewCode', async () => {
				await reviewCurrentCode(llmService);
			}),
			vscode.commands.registerCommand('aiDevAssistant.jiraToGitHubFlow', async () => {
				// 1. Ensure Jira is configured
				if (!jiraService.isAuthenticated()) {
					const configure = await vscode.window.showWarningMessage(
						'Jira is not configured. Configure now?',
						'Configure Jira',
						'Cancel'
					);
					if (configure === 'Configure Jira') {
						await vscode.commands.executeCommand('aiDevAssistant.configureJira');
						if (!jiraService.isAuthenticated()) return;
					} else {
						return;
					}
				}

				// 2. Prompt for Jira ticket key
				const taskKey = await vscode.window.showInputBox({
					prompt: 'Enter Jira ticket key (e.g., PROJ-123)',
					placeHolder: 'PROJ-123',
					validateInput: (value) => {
						if (!value || !value.match(/^[A-Z]+-\d+$/)) {
							return 'Please enter a valid Jira ticket key (e.g., PROJ-123)';
						}
						return null;
					}
				});
				if (!taskKey) return;

				// 3. Prompt for code generation options
				const codeStyle = await vscode.window.showQuickPick(['typescript', 'javascript', 'python'], {
					placeHolder: 'Select code style/language for generation'
				});
				if (!codeStyle) return;
				const framework = await vscode.window.showQuickPick(['react', 'node', 'none'], {
					placeHolder: 'Select framework (if any)'
				});
				if (!framework) return;
				const generateTests = await vscode.window.showQuickPick(['Yes', 'No'], {
					placeHolder: 'Generate tests?'
				});
				if (!generateTests) return;
				const includeDocs = await vscode.window.showQuickPick(['Yes', 'No'], {
					placeHolder: 'Include documentation?'
				});
				if (!includeDocs) return;

				// 4. Start code generation workflow via backend
				vscode.window.showInformationMessage(`Generating code for ${taskKey}...`);
				const userId = vscode.env.machineId;
				const sessionId = Date.now().toString();
				const response = await fetch('http://localhost:8000/api/v1/jira-agent/start', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						ticket_key: taskKey,
						generation_options: {
							code_style: codeStyle,
							framework: framework === 'none' ? undefined : framework,
							generate_tests: generateTests === 'Yes',
							include_documentation: includeDocs === 'Yes'
						},
						user_context: { user_id: userId, session_id: sessionId }
					})
				});
				const { workflow_id } = await response.json();
				if (!workflow_id) {
					vscode.window.showErrorMessage('Failed to start code generation workflow.');
					return;
				}

				// 5. Poll for completion
				let codeReady = false;
				let codeResult = null;
				while (!codeReady) {
					await new Promise(resolve => setTimeout(resolve, 5000));
					const statusRes = await fetch(`http://localhost:8000/api/v1/jira-agent/workflow/${workflow_id}`);
					const statusData = await statusRes.json();
					if (statusData.status === 'pending_approval') {
						codeReady = true;
						codeResult = statusData.generated_code;
					} else if (['completed', 'failed'].includes(statusData.status)) {
						vscode.window.showErrorMessage('Code generation failed or was completed without approval.');
						return;
					}
				}

				// 6. Show generated code for review
				const doc = await vscode.workspace.openTextDocument({
					content: codeResult || '// No code returned',
					language: codeStyle
				});
				await vscode.window.showTextDocument(doc);

				// 7. Ask user to approve and push to GitHub
				const approve = await vscode.window.showInformationMessage(
					'Do you want to approve and push this code to GitHub?',
					'Yes', 'No'
				);
				if (approve !== 'Yes') {
					// Optionally send rejection/feedback here
					return;
				}

				// 8. Approve workflow in backend
				await fetch('http://localhost:8000/api/v1/jira-agent/approve', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ workflow_id, approved: true })
				});

				// 9. Create branch, commit, and push code using GitService
				const branchName = `feature/${taskKey}`;
				const gitResult = await gitService.createBranch(branchName);
				if (!gitResult.success) {
					vscode.window.showErrorMessage(`Failed to create branch: ${gitResult.error}`);
					return;
				}
				// Save code to file (prompt for filename)
				const fileName = await vscode.window.showInputBox({
					prompt: 'Enter filename to save generated code',
					value: `${taskKey.replace(/-/g, '_')}.${codeStyle === 'typescript' ? 'ts' : codeStyle === 'javascript' ? 'js' : 'py'}`
				});
				if (!fileName) return;
				const wsFolder = vscode.workspace.workspaceFolders?.[0];
				if (!wsFolder) {
					vscode.window.showErrorMessage('No workspace folder found.');
					return;
				}
				const filePath = vscode.Uri.joinPath(wsFolder.uri, fileName);
				await vscode.workspace.fs.writeFile(filePath, Buffer.from(codeResult, 'utf8'));
				const commitResult = await gitService.commitChanges(`feat(${taskKey}): add generated code`, [fileName]);
				if (!commitResult.success) {
					vscode.window.showErrorMessage(`Failed to commit code: ${commitResult.error}`);
					return;
				}
				const pushResult = await gitService.pushBranch(branchName);
				if (!pushResult.success) {
					vscode.window.showErrorMessage(`Failed to push branch: ${pushResult.error}`);
					return;
				}
				// 10. Create PR
				const prResult = await gitService.createPullRequest(branchName, `Feature: ${taskKey}`, `Generated by AI Dev Assistant for Jira ticket ${taskKey}`);
				if (prResult.success && prResult.pullRequestUrl) {
					vscode.window.showInformationMessage(`Pull request created: ${prResult.pullRequestUrl}`);
				} else {
					vscode.window.showInformationMessage('Branch pushed. Please create a PR manually.');
				}
			}),
			// Register a command to focus the dashboard view
			vscode.commands.registerCommand('aiDevAssistant.dashboard.focus', async () => {
				try {
					// Focus on the dashboard view in the AI Dev Assistant view container
					await vscode.commands.executeCommand('workbench.view.extension.ai-dev-assistant');
					await vscode.commands.executeCommand('aiDevAssistant.dashboard.focus');
				} catch (error: any) {
					vscode.window.showErrorMessage(`Failed to focus dashboard: ${error.message ?? error}`);
				}
			}),
		];
		commands.forEach(command => context.subscriptions.push(command));
		context.subscriptions.push(progressService);

		// Register URI handler for deep linking from frontend
		context.subscriptions.push(
			vscode.window.registerUriHandler({
				handleUri
			})
		);

		showWelcomeMessage();
		logger.info('AI Development Assistant extension activated successfully', 'Extension');
	} catch (error: any) {
		logger.error(`Failed to activate extension: ${error.message ?? error}`, 'Extension');
		vscode.window.showErrorMessage(`Failed to activate AI Development Assistant: ${error.message ?? error}`);
	}
}
