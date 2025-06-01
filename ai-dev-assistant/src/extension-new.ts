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
import { validateCredentials } from './services/validationService';
import { Logger } from './utils/logger';
import { ErrorHandler } from './utils/errorHandler';
import { WorkflowEvent } from './types';

let logger: Logger;
let errorHandler: ErrorHandler;

export function activate(context: vscode.ExtensionContext) {
	// Store extension context globally for services to access
	(globalThis as any).extensionContext = context;

	// Initialize logger and error handler first
	logger = Logger.getInstance();
	errorHandler = ErrorHandler.getInstance();

	logger.info('Activating AI Development Assistant extension', 'Extension');

	try {
		// Initialize core services
		const jiraService = new JiraService();
		const llmService = new LLMService();
		const gitService = new GitService();
		const testingService = new TestingService();
		const progressService = new ProgressTrackingService();

		// Initialize additional services
		const webhookService = new WebhookService();
		const notificationService = new NotificationService();
		const backupService = new BackupService();

		// Initialize orchestration service with all dependencies
		const orchestrationService = new OrchestrationService(
			jiraService,
			llmService,
			gitService,
			testingService,
			progressService
		);

		// Setup event handling
		setupEventHandlers(orchestrationService, webhookService, notificationService);

		// Register all commands
		const commands = registerCommands(
			orchestrationService,
			jiraService,
			llmService,
			testingService,
			progressService,
			webhookService,
			notificationService,
			backupService
		);

		// Add commands to context for disposal
		commands.forEach(command => context.subscriptions.push(command));

		// Start webhook server if enabled
		const config = vscode.workspace.getConfiguration('aiDevAssistant.webhook');
		if (config.get('enabled', false)) {
			webhookService.startServer().catch((error: unknown) => {
				const errorMsg = error instanceof Error ? error.message : String(error);
				logger.error('Failed to start webhook server', 'Extension', new Error(errorMsg));
			});
		}

		// Show welcome message for new users
		showWelcomeMessage();

		// Run initial validation after a short delay
		setTimeout(() => {
			validateCredentials().catch((error: unknown) => {
				const errorMsg = error instanceof Error ? error.message : String(error);
				logger.error('Initial validation failed', 'Extension', new Error(errorMsg));
			});
		}, 2000);

		logger.info('AI Development Assistant extension activated successfully', 'Extension');

	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		logger.error('Failed to activate extension', 'Extension', new Error(errorMsg));
		vscode.window.showErrorMessage(`Failed to activate AI Development Assistant: ${errorMsg}`);
	}
}

function setupEventHandlers(
	orchestrationService: OrchestrationService,
	webhookService: WebhookService,
	notificationService: NotificationService
): void {
	// Setup workflow event handling
	orchestrationService.addEventListener(handleWorkflowEvent);

	// Setup webhook event handling
	webhookService.on('workflowTrigger', (event: WorkflowEvent) => {
		notificationService.processEvent(event);
	});

	webhookService.on('statusChange', (event: WorkflowEvent) => {
		notificationService.processEvent(event);
	});

	webhookService.on('prMerged', (event: WorkflowEvent) => {
		notificationService.processEvent(event);
	});
}

function registerCommands(
	orchestrationService: OrchestrationService,
	jiraService: JiraService,
	llmService: LLMService,
	testingService: TestingService,
	progressService: ProgressTrackingService,
	webhookService: WebhookService,
	notificationService: NotificationService,
	backupService: BackupService
): vscode.Disposable[] {
	return [
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

		vscode.commands.registerCommand('aiDevAssistant.validateConfiguration', async () => {
			await validateCredentials();
		}),

		vscode.commands.registerCommand('aiDevAssistant.createBackup', async () => {
			const description = await vscode.window.showInputBox({
				prompt: 'Enter backup description',
				placeHolder: 'Manual backup before changes'
			});
			if (description) {
				await backupService.createBackup('full', description);
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

		vscode.commands.registerCommand('aiDevAssistant.setupWebhooks', async () => {
			await setupWebhooks(webhookService);
		}),

		vscode.commands.registerCommand('aiDevAssistant.generateCodeForTask', async (taskKey?: string) => {
			await generateCodeForTask(orchestrationService, jiraService, taskKey);
		}),

		vscode.commands.registerCommand('aiDevAssistant.runTests', async () => {
			await runTests(testingService);
		}),

		vscode.commands.registerCommand('aiDevAssistant.reviewCode', async () => {
			await reviewCode(llmService);
		})
	];
}

// Command implementations
async function configureJiraConnection(jiraService: JiraService): Promise<void> {
	try {
		vscode.window.showInformationMessage('Configuring Jira connection...');

		if (!jiraService.isAuthenticated()) {
			const success = await jiraService.authenticate();
			if (success) {
				vscode.window.showInformationMessage('Jira authentication successful!');
			} else {
				vscode.window.showWarningMessage('Jira authentication failed. Please check your credentials.');
			}
		} else {
			vscode.window.showInformationMessage('Jira is already configured and authenticated.');
		}
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		await errorHandler.handleError(error, 'configureJiraConnection');
		vscode.window.showErrorMessage(`Failed to configure Jira: ${errorMsg}`);
	}
}

async function startDevelopmentWorkflow(
	orchestrationService: OrchestrationService,
	jiraService: JiraService
): Promise<void> {
	try {
		// Check if Jira is configured first
		if (!jiraService.isAuthenticated()) {
			const configureFirst = await vscode.window.showWarningMessage(
				'Jira is not configured. Please configure Jira first.',
				'Configure Jira',
				'Cancel'
			);

			if (configureFirst === 'Configure Jira') {
				await configureJiraConnection(jiraService);
				return;
			} else {
				return;
			}
		}

		// Get task key from user
		const taskKey = await vscode.window.showInputBox({
			prompt: 'Enter Jira task key (e.g., PROJ-123)',
			placeHolder: 'PROJ-123',
			validateInput: (value: string) => {
				if (!value || !value.match(/^[A-Z]+-\d+$/)) {
					return 'Please enter a valid Jira task key (e.g., PROJ-123)';
				}
				return undefined;
			}
		});

		if (!taskKey) {
			return;
		}

		logger.info(`Starting development workflow for task: ${taskKey}`, 'Extension');

		const workflowId = await orchestrationService.startDevelopmentWorkflow(taskKey);

		vscode.window.showInformationMessage(
			`Development workflow started for ${taskKey}`,
			'View Progress'
		).then((selection: string | undefined) => {
			if (selection === 'View Progress') {
				vscode.commands.executeCommand('aiDevAssistant.viewProgress');
			}
		});

		logger.info(`Workflow ${workflowId} started for task ${taskKey}`, 'Extension');

	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		await errorHandler.handleError(error, 'startDevelopmentWorkflow');
		vscode.window.showErrorMessage(`Failed to start workflow: ${errorMsg}`);
	}
}

async function viewProgressDashboard(progressService: ProgressTrackingService): Promise<void> {
	try {
		const workflows = await progressService.getAllWorkflows();

		if (workflows.length === 0) {
			vscode.window.showInformationMessage('No active workflows found.');
			return;
		}

		// Create webview panel for progress dashboard
		const panel = vscode.window.createWebviewPanel(
			'aiDevAssistantProgress',
			'AI Dev Assistant - Progress Dashboard',
			vscode.ViewColumn.One,
			{ enableScripts: true }
		);

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
					panel.webview.html = generateProgressDashboardHtml(updatedWorkflows);
					break;
			}
		});

		panel.webview.html = generateProgressDashboardHtml(workflows);
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		await errorHandler.handleError(error, 'viewProgressDashboard');
		vscode.window.showErrorMessage(`Failed to show progress dashboard: ${errorMsg}`);
	}
}

async function selectWorkflowForRetry(progressService: ProgressTrackingService): Promise<string | undefined> {
	try {
		const workflows = await progressService.getAllWorkflows();
		const failedWorkflows = workflows.filter(w => w.status === 'failed');

		if (failedWorkflows.length === 0) {
			vscode.window.showInformationMessage('No failed workflows to retry.');
			return undefined;
		}

		const items = failedWorkflows.map(workflow => ({
			label: workflow.jiraTask.key,
			description: workflow.jiraTask.summary,
			detail: `Failed at: ${workflow.steps.find(step => step.status === 'failed')?.name || 'Unknown step'}`,
			workflowId: workflow.id
		}));

		const selected = await vscode.window.showQuickPick(items, {
			placeHolder: 'Select workflow to retry'
		});

		return selected?.workflowId;
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		await errorHandler.handleError(error, 'selectWorkflowForRetry');
		return undefined;
	}
}

async function retryWorkflow(orchestrationService: OrchestrationService, workflowId: string): Promise<void> {
	try {
		logger.info(`Retrying workflow: ${workflowId}`, 'Extension');

		// Get workflow to find the failed step
		const progressService = new ProgressTrackingService();
		const workflow = await progressService.getWorkflow(workflowId);

		// Find the failed step
		const failedStep = workflow.steps.find(step => step.status === 'failed');

		if (failedStep) {
			await orchestrationService.retryFailedStep(workflowId, failedStep.id);
			vscode.window.showInformationMessage(`Retrying workflow ${workflowId}`);
		} else {
			vscode.window.showWarningMessage(`No failed steps found in workflow ${workflowId}`);
		}
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		await errorHandler.handleError(error, 'retryWorkflow');
		vscode.window.showErrorMessage(`Failed to retry workflow: ${errorMsg}`);
	}
}

async function setupWebhooks(webhookService: WebhookService): Promise<void> {
	try {
		const jiraWebhookUrl = await webhookService.registerWebhook('jira', '/webhook/jira');
		const gitWebhookUrl = await webhookService.registerWebhook('git', '/webhook/git');

		vscode.window.showInformationMessage(
			'Webhook URLs generated. Configure them in your external services.',
			'Copy Jira URL',
			'Copy Git URL'
		).then((selection: string | undefined) => {
			if (selection === 'Copy Jira URL') {
				vscode.env.clipboard.writeText(jiraWebhookUrl);
			} else if (selection === 'Copy Git URL') {
				vscode.env.clipboard.writeText(gitWebhookUrl);
			}
		});
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		await errorHandler.handleError(error, 'setupWebhooks');
	}
}

async function generateCodeForTask(
	orchestrationService: OrchestrationService,
	jiraService: JiraService,
	taskKey?: string
): Promise<void> {
	try {
		if (!taskKey) {
			taskKey = await vscode.window.showInputBox({
				prompt: 'Enter Jira task key to generate code for',
				placeHolder: 'PROJ-123'
			});
		}

		if (!taskKey) {
			return;
		}

		logger.info(`Generating code for task: ${taskKey}`, 'Extension');

		// This would typically call the orchestration service
		// For now, just show a message
		vscode.window.showInformationMessage(`Code generation started for ${taskKey}`);

	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		await errorHandler.handleError(error, 'generateCodeForTask');
	}
}

async function runTests(testingService: TestingService): Promise<void> {
	try {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) {
			vscode.window.showWarningMessage('No workspace folder open');
			return;
		}

		logger.info('Running tests', 'Extension');

		const results = await testingService.runTests(workspaceFolder.uri.fsPath);

		if (results.failed > 0) {
			vscode.window.showWarningMessage(
				`Tests completed: ${results.passed} passed, ${results.failed} failed`,
				'View Results'
			);
		} else {
			vscode.window.showInformationMessage(`All ${results.passed} tests passed!`);
		}
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		await errorHandler.handleError(error, 'runTests');
	}
}

async function reviewCode(llmService: LLMService): Promise<void> {
	try {
		const activeEditor = vscode.window.activeTextEditor;
		if (!activeEditor) {
			vscode.window.showWarningMessage('No active editor to review');
			return;
		}

		const code = activeEditor.document.getText();
		const language = activeEditor.document.languageId;

		logger.info(`Reviewing ${language} code`, 'Extension');

		// This would call the LLM service for code review
		vscode.window.showInformationMessage('Code review started...');

	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		await errorHandler.handleError(error, 'reviewCode');
	}
}

function handleWorkflowEvent(event: WorkflowEvent): void {
	try {
		switch (event.type) {
			case 'workflow_started':
				logger.info(`Workflow ${event.workflowId} started`, 'Extension');
				break;
			case 'workflow_completed':
				logger.info(`Workflow ${event.workflowId} completed successfully`, 'Extension');
				vscode.window.showInformationMessage(`Workflow completed: ${event.workflowId}`);
				break;
			case 'workflow_failed':
				logger.error(`Workflow ${event.workflowId} failed`, 'Extension');
				vscode.window.showErrorMessage(`Workflow failed: ${event.workflowId}`);
				break;
			case 'step-completed':
				logger.info(`Workflow ${event.workflowId} completed step: ${event.stepId}`, 'Extension');
				break;
			case 'step-failed':
				logger.warn(`Workflow ${event.workflowId} step failed: ${event.stepId}`, 'Extension');
				vscode.window.showWarningMessage(`Workflow step failed: ${event.stepId}`);
				break;
			default:
				logger.debug(`Unhandled workflow event: ${event.type}`, 'Extension');
		}
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		logger.error('Error handling workflow event', 'Extension', new Error(errorMsg));
	}
}

function generateProgressDashboardHtml(workflows: any[]): string {
	const workflowRows = workflows.map(workflow => {
		const statusClass = `status-${workflow.status}`;
		const progress = Math.round((workflow.completedSteps / workflow.totalSteps) * 100);

		const actions = `
      <button class="retry-btn" onclick="retryWorkflow('${workflow.id}')">Retry</button>
      <button class="cancel-btn" onclick="cancelWorkflow('${workflow.id}')">Cancel</button>
      <button class="delete-btn" onclick="deleteWorkflow('${workflow.id}')">Delete</button>
    `;

		return `
      <tr>
        <td>${workflow.jiraTask.key}</td>
        <td>${workflow.jiraTask.summary}</td>
        <td class="${statusClass}">${workflow.status}</td>
        <td>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${progress}%"></div>
          </div>
          ${progress}%
        </td>
        <td>${workflow.lastUpdated}</td>
        <td>
          ${actions}
        </td>
      </tr>
    `;
	}).join('');

	return `
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
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
            <th>Task Key</th>
            <th>Summary</th>
            <th>Status</th>
            <th>Progress</th>
            <th>Last Updated</th>
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

        function retryWorkflow(workflowId) {
          vscode.postMessage({ command: 'retryWorkflow', workflowId });
        }

        function cancelWorkflow(workflowId) {
          vscode.postMessage({ command: 'cancelWorkflow', workflowId });
        }

        function deleteWorkflow(workflowId) {
          if (confirm('Are you sure you want to delete this workflow?')) {
            vscode.postMessage({ command: 'deleteWorkflow', workflowId });
          }
        }
      </script>
    </body>
    </html>
  `;
}

function showWelcomeMessage(): void {
	const config = vscode.workspace.getConfiguration('aiDevAssistant');
	const hasShownWelcome = config.get('hasShownWelcome', false);

	if (!hasShownWelcome) {
		vscode.window.showInformationMessage(
			'Welcome to AI Development Assistant! This extension helps automate your development workflow with Jira integration.',
			'Configure Jira',
			'Learn More',
			'Don\'t show again'
		).then((selection: string | undefined) => {
			if (selection === 'Configure Jira') {
				vscode.commands.executeCommand('aiDevAssistant.configureJira');
			} else if (selection === 'Learn More') {
				vscode.env.openExternal(vscode.Uri.parse('https://github.com/your-repo/ai-dev-assistant'));
			} else if (selection === 'Don\'t show again') {
				config.update('hasShownWelcome', true, vscode.ConfigurationTarget.Global);
			}
		});
	}
}

export function deactivate() {
	logger?.info('AI Development Assistant extension deactivated', 'Extension');
}
