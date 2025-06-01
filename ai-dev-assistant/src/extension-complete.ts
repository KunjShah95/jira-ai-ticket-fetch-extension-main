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
import { ConfigurationManager } from './utils/configurationManager';
import { Logger } from './utils/logger';
import { ErrorHandler } from './utils/errorHandler';
import { WorkflowEvent } from './types';

// Global extension context for services to access
let extensionContext: vscode.ExtensionContext;

export function activate(context: vscode.ExtensionContext) {
	// Store extension context globally
	extensionContext = context;

	// Initialize logger and error handler first
	const logger = Logger.getInstance();
	const errorHandler = ErrorHandler.getInstance();

	logger.info('Activating AI Development Assistant extension', 'Extension');

	try {
		// Initialize configuration manager
		const configManager = ConfigurationManager.getInstance();

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
		setupEventHandlers(
			orchestrationService,
			jiraService,
			progressService,
			webhookService,
			notificationService,
			logger
		);

		// Register commands
		registerCommands(
			context,
			orchestrationService,
			jiraService,
			llmService,
			gitService,
			testingService,
			progressService,
			configManager,
			backupService
		);

		// Initialize webhooks (async)
		initializeWebhooks(webhookService, orchestrationService, logger);

		// Schedule periodic tasks
		schedulePeriodicTasks(
			backupService,
			jiraService,
			logger
		);

		// Add disposables
		context.subscriptions.push(
			progressService,
			webhookService,
			notificationService
		);

		logger.info('AI Development Assistant extension activated successfully', 'Extension');

	} catch (error) {
		const errorMessage = errorHandler.handleError(error as Error, 'Extension Activation');
		vscode.window.showErrorMessage(`Failed to activate AI Development Assistant: ${errorMessage}`);
		throw error;
	}
}

export function deactivate() {
	const logger = Logger.getInstance();
	logger.info('AI Development Assistant extension deactivated', 'Extension');
}

function setupEventHandlers(
	orchestrationService: OrchestrationService,
	jiraService: JiraService,
	_progressService: ProgressTrackingService,
	webhookService: WebhookService,
	notificationService: NotificationService,
	logger: Logger
) {
	// Listen for workflow events
	orchestrationService.addEventListener((event: WorkflowEvent) => {
		if (event.type === 'started') {
			logger.info(`Workflow ${event.workflowId} started`, 'Workflow');
			notificationService.showNotification({
				type: 'info',
				title: 'Workflow Started',
				message: `Started processing Jira task: ${event.stepId}`
			});
		} else if (event.type === 'step-completed') {
			logger.info(`Workflow ${event.workflowId} step ${event.stepId} completed`, 'Workflow');
		} else if (event.type === 'step-failed') {
			logger.error(`Workflow ${event.workflowId} step ${event.stepId} failed: ${event.error}`, 'Workflow');
			notificationService.showNotification({
				type: 'error',
				title: 'Workflow Step Failed',
				message: event.error || 'Unknown error'
			});
		} else if (event.type === 'completed') {
			logger.info(`Workflow ${event.workflowId} completed`, 'Workflow');
			notificationService.showNotification({
				type: 'info',
				title: 'Workflow Completed',
				message: 'Task has been processed successfully'
			});
		} else if (event.type === 'failed') {
			logger.error(`Workflow ${event.workflowId} failed: ${event.error}`, 'Workflow');
			notificationService.showNotification({
				type: 'error',
				title: 'Workflow Failed',
				message: event.error || 'Unknown error'
			});
		}
	});

	// Setup webhook event handlers
	webhookService.on('jiraTaskCreated', async (payload: any) => {
		logger.info('Jira task created webhook received', 'Webhook');
		try {
			const task = await jiraService.getTask(payload.issue.key);
			if (task) {
				await orchestrationService.startDevelopmentWorkflow(payload.issue.key);
			}
		} catch (error) {
			logger.error(`Failed to process Jira task created webhook: ${error}`, 'Webhook');
		}
	});

	webhookService.on('jiraTaskUpdated', async (_payload: any) => {
		logger.info('Jira task updated webhook received', 'Webhook');
		// Handle task updates if needed
	});

	webhookService.on('gitPrMerged', async (_payload: any) => {
		logger.info('Git PR merged webhook received', 'Webhook');
		// Handle PR merge events if needed
	});
}

function registerCommands(
	context: vscode.ExtensionContext,
	orchestrationService: OrchestrationService,
	jiraService: JiraService,
	llmService: LLMService,
	_gitService: GitService,
	testingService: TestingService,
	progressService: ProgressTrackingService,
	configManager: ConfigurationManager,
	backupService: BackupService
) {
	const logger = Logger.getInstance();
	const errorHandler = ErrorHandler.getInstance();

	// Main workflow commands
	const commands: vscode.Disposable[] = [
		vscode.commands.registerCommand('aiDevAssistant.configureJira', async () => {
			try {
				await configureJiraConnection(jiraService, configManager);
				vscode.window.showInformationMessage('Jira configuration completed successfully');
			} catch (error) {
				const errorMessage = errorHandler.handleError(error as Error, 'Jira Configuration');
				vscode.window.showErrorMessage(`Jira configuration failed: ${errorMessage}`);
			}
		}),

		vscode.commands.registerCommand('aiDevAssistant.startWorkflow', async () => {
			try {
				const taskKey = await promptForJiraTaskKey();
				if (taskKey) {
					const task = await jiraService.getTask(taskKey);
					if (task) {
						await orchestrationService.startDevelopmentWorkflow(taskKey);
						vscode.window.showInformationMessage(`Workflow started for task ${taskKey}`);
					} else {
						vscode.window.showErrorMessage(`Task ${taskKey} not found`);
					}
				}
			} catch (error) {
				const errorMessage = errorHandler.handleError(error as Error, 'Start Workflow');
				vscode.window.showErrorMessage(`Failed to start workflow: ${errorMessage}`);
			}
		}),

		vscode.commands.registerCommand('aiDevAssistant.viewProgress', async () => {
			try {
				await viewProgressDashboard(progressService);
			} catch (error) {
				const errorMessage = errorHandler.handleError(error as Error, 'View Progress');
				vscode.window.showErrorMessage(`Failed to view progress: ${errorMessage}`);
			}
		}),

		vscode.commands.registerCommand('aiDevAssistant.retryWorkflow', async () => {
			try {
				const workflowId = await selectWorkflowForRetry(progressService);
				if (workflowId) {
					const workflow = await progressService.getWorkflow(workflowId);
					const failedStep = workflow.steps.find(step => step.status === 'failed');
					if (failedStep) {
						await orchestrationService.retryFailedStep(workflowId, failedStep.id);
						vscode.window.showInformationMessage(`Workflow ${workflowId} retry initiated`);
					} else {
						vscode.window.showWarningMessage(`No failed steps found in workflow ${workflowId}`);
					}
				}
			} catch (error) {
				const errorMessage = errorHandler.handleError(error as Error, 'Retry Workflow');
				vscode.window.showErrorMessage(`Failed to retry workflow: ${errorMessage}`);
			}
		}),

		vscode.commands.registerCommand('aiDevAssistant.cancelWorkflow', async () => {
			try {
				const workflowId = await selectWorkflowForCancellation(progressService);
				if (workflowId) {
					await orchestrationService.cancelWorkflow(workflowId);
					vscode.window.showInformationMessage(`Workflow ${workflowId} cancelled`);
				}
			} catch (error) {
				const errorMessage = errorHandler.handleError(error as Error, 'Cancel Workflow');
				vscode.window.showErrorMessage(`Failed to cancel workflow: ${errorMessage}`);
			}
		}),

		// Individual service commands
		vscode.commands.registerCommand('aiDevAssistant.syncJiraTasks', async () => {
			try {
				await jiraService.getTasks();
				vscode.window.showInformationMessage('Jira tasks synced successfully');
			} catch (error) {
				const errorMessage = errorHandler.handleError(error as Error, 'Sync Jira Tasks');
				vscode.window.showErrorMessage(`Failed to sync Jira tasks: ${errorMessage}`);
			}
		}),

		vscode.commands.registerCommand('aiDevAssistant.generateCode', async () => {
			try {
				const taskKey = await promptForJiraTaskKey();
				if (taskKey) {
					const task = await jiraService.getTask(taskKey);
					if (task) {
						const codeResult = await llmService.generateCode({
							task: task,
							context: {},
							requirements: task.description,
							fileType: 'component'
						});
						if (codeResult && codeResult.files.length > 0) {
							const code = codeResult.files[0].content;
							await vscode.workspace.openTextDocument({ content: code, language: 'typescript' });
							vscode.window.showInformationMessage('Code generated successfully');
						}
					}
				}
			} catch (error) {
				const errorMessage = errorHandler.handleError(error as Error, 'Generate Code');
				vscode.window.showErrorMessage(`Failed to generate code: ${errorMessage}`);
			}
		}),

		vscode.commands.registerCommand('aiDevAssistant.runTests', async () => {
			try {
				const results = await testingService.runTests();
				if (results.success) {
					vscode.window.showInformationMessage(`Tests passed: ${results.testResults.passed}/${results.testResults.total}`);
				} else {
					vscode.window.showErrorMessage(`Tests failed: ${results.testResults.failed}/${results.testResults.total}`);
				}
			} catch (error) {
				const errorMessage = errorHandler.handleError(error as Error, 'Run Tests');
				vscode.window.showErrorMessage(`Test execution failed: ${errorMessage}`);
			}
		}),

		vscode.commands.registerCommand('aiDevAssistant.reviewCode', async () => {
			try {
				const activeEditor = vscode.window.activeTextEditor;
				if (activeEditor) {
					const code = activeEditor.document.getText();
					const review = await llmService.reviewCode(code, activeEditor.document.languageId);
					if (review) {
						vscode.window.showInformationMessage('Code review completed - check output panel');
					}
				} else {
					vscode.window.showWarningMessage('No active editor found');
				}
			} catch (error) {
				const errorMessage = errorHandler.handleError(error as Error, 'Review Code');
				vscode.window.showErrorMessage(`Code review failed: ${errorMessage}`);
			}
		}),

		// Configuration and maintenance commands
		vscode.commands.registerCommand('aiDevAssistant.validateConfig', async () => {
			try {
				const result = await validateCredentials();
				if (result.isValid) {
					vscode.window.showInformationMessage('Configuration is valid');
				} else {
					vscode.window.showWarningMessage('Configuration validation failed - check output panel');
				}
			} catch (error) {
				const errorMessage = errorHandler.handleError(error as Error, 'Validate Configuration');
				vscode.window.showErrorMessage(`Configuration validation failed: ${errorMessage}`);
			}
		}),

		vscode.commands.registerCommand('aiDevAssistant.backupData', async () => {
			try {
				await backupService.createBackup('full', 'Manual backup via command');
				vscode.window.showInformationMessage('Backup created successfully');
			} catch (error) {
				const errorMessage = errorHandler.handleError(error as Error, 'Create Backup');
				vscode.window.showErrorMessage(`Failed to create backup: ${errorMessage}`);
			}
		}),

		vscode.commands.registerCommand('aiDevAssistant.restoreData', async () => {
			try {
				// Fix: Use correct property for workflow selection (jiraTask.key) and status 'in-progress'
				const activeWorkflows = (await progressService.getActiveWorkflows()).filter(w => w.status === 'in-progress');
				const selectedCancel = await vscode.window.showQuickPick(
					activeWorkflows.map(w => ({ label: w.id, description: w.jiraTask.key })),
					{ placeHolder: 'Select workflow to cancel' }
				);
				return selectedCancel?.label;
			} catch (error) {
				const errorMessage = errorHandler.handleError(error as Error, 'Restore Data');
				vscode.window.showErrorMessage(`Failed to restore data: ${errorMessage}`);
			}
		}),

		vscode.commands.registerCommand('aiDevAssistant.openFrontend', async () => {
			try {
				vscode.env.openExternal(vscode.Uri.parse('http://localhost:3000'));
			} catch (error) {
				const errorMessage = errorHandler.handleError(error as Error, 'Open Frontend');
				vscode.window.showErrorMessage(`Failed to open frontend: ${errorMessage}`);
			}
		}),
	];

	// Add all commands to subscriptions
	commands.forEach(command => context.subscriptions.push(command));
}

async function configureJiraConnection(jiraService: JiraService, configManager: ConfigurationManager) {
	const logger = Logger.getInstance();

	// Get Jira instance URL
	const instanceUrl = await vscode.window.showInputBox({
		prompt: 'Enter your Jira instance URL',
		placeHolder: 'https://your-company.atlassian.net',
		validateInput: (value) => {
			if (!value || !value.startsWith('http')) {
				return 'Please enter a valid URL';
			}
			return null;
		}
	});

	if (!instanceUrl) return;

	// Start OAuth flow
	logger.info('Starting Jira OAuth configuration', 'Configuration');

	const success = await jiraService.authenticate();
	if (success) {
		// Fix: Use updateJiraConfig instead of setConfiguration
		await configManager.updateJiraConfig({ instanceUrl });
		logger.info('Jira configuration completed successfully', 'Configuration');
	} else {
		throw new Error('OAuth authentication failed');
	}
}

async function promptForJiraTaskKey(): Promise<string | undefined> {
	return await vscode.window.showInputBox({
		prompt: 'Enter Jira task key (e.g., PROJ-123)',
		validateInput: (value) => {
			if (!value || !/^[A-Z]+-\d+$/.test(value)) {
				return 'Please enter a valid Jira task key (e.g., PROJ-123)';
			}
			return null;
		}
	});
}

async function viewProgressDashboard(progressService: ProgressTrackingService) {
	const panel = vscode.window.createWebviewPanel(
		'aiDevAssistantProgress',
		'AI Dev Assistant - Progress Dashboard',
		vscode.ViewColumn.One,
		{
			enableScripts: true,
			retainContextWhenHidden: true
		}
	);

	// Fix: Use correct async/await for workflows and dashboard
	panel.webview.html = generateProgressDashboardHtml(await progressService.getActiveWorkflows());

	panel.webview.onDidReceiveMessage(async (message: any) => {
		switch (message.command) {
			case 'openFrontend':
				vscode.env.openExternal(vscode.Uri.parse('http://localhost:3000'));
				break;
			case 'refresh':
				const refreshedWorkflows = await progressService.getActiveWorkflows();
				panel.webview.html = generateProgressDashboardHtml(refreshedWorkflows);
				break;
			case 'cancelWorkflow':
				// Handle workflow cancellation
				break;
		}
	});
}

function generateProgressDashboardHtml(workflows: any[]): string {
	return `
    <html>
    <head>
      <style>
        body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); }
        .workflow { margin: 10px 0; padding: 10px; border: 1px solid var(--vscode-panel-border); }
        .step { margin: 5px 0; padding: 5px; }
        .completed { background-color: var(--vscode-charts-green); }
        .failed { background-color: var(--vscode-charts-red); }
        .running { background-color: var(--vscode-charts-yellow); }
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
      ${workflows.map(workflow => `
        <div class="workflow">
          <h3>Workflow: ${workflow.id}</h3>
          <p>Task: ${workflow.jiraTask?.key ?? ''}</p>
          <p>Status: ${workflow.status}</p>
          <div class="steps">
            ${workflow.steps.map((step: any) => `
              <div class="step ${step.status}">
                ${step.name}: ${step.status}
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
      <script>
        const vscode = acquireVsCodeApi();
        function openFrontend() {
          vscode.postMessage({ command: 'openFrontend' });
        }
        function refresh() { vscode.postMessage({command: 'refresh'}); }
        setInterval(refresh, 5000); // Auto-refresh every 5 seconds
      </script>
    </body>
    </html>
  `;
}

async function selectWorkflowForRetry(progressService: ProgressTrackingService): Promise<string | undefined> {
	// Fix: Use correct property for workflow selection (jiraTask.key)
	const failedWorkflows = (await progressService.getAllWorkflows()).filter(w => w.status === 'failed');
	const selected = await vscode.window.showQuickPick(
		failedWorkflows.map(w => ({ label: w.id, description: w.jiraTask.key })),
		{ placeHolder: 'Select workflow to retry' }
	);

	return selected?.label;
}

async function selectWorkflowForCancellation(progressService: ProgressTrackingService): Promise<string | undefined> {
	// Fix: Use correct property for workflow selection (jiraTask.key) and status 'in-progress'
	const activeWorkflows = (await progressService.getActiveWorkflows()).filter(w => w.status === 'in-progress');
	const selectedCancel = await vscode.window.showQuickPick(
		activeWorkflows.map(w => ({ label: w.id, description: w.jiraTask.key })),
		{ placeHolder: 'Select workflow to cancel' }
	);
	return selectedCancel?.label;
}

function schedulePeriodicTasks(
	backupService: BackupService,
	jiraService: JiraService,
	logger: Logger
) {
	// Schedule daily backup
	setInterval(async () => {
		try {
			// Fix: createBackup requires at least two arguments for scheduled backup
			await backupService.createBackup('full', 'Scheduled backup');
			logger.info('Scheduled backup completed', 'Backup');
		} catch (error) {
			logger.error(`Scheduled backup failed: ${error}`, 'Backup');
		}
	}, 24 * 60 * 60 * 1000); // 24 hours

	// Schedule configuration validation every hour
	setInterval(async () => {
		try {
			await validateCredentials();
			logger.debug('Scheduled configuration validation completed', 'Validation');
		} catch (error) {
			logger.error(`Scheduled configuration validation failed: ${error}`, 'Validation');
		}
	}, 60 * 60 * 1000); // 1 hour
}

async function initializeWebhooks(
	webhookService: WebhookService,
	orchestrationService: OrchestrationService,
	logger: Logger
) {
	try {
		await webhookService.initialize();
		logger.info('Webhooks initialized successfully', 'Webhook');
	} catch (error) {
		logger.error(`Failed to initialize webhooks: ${error}`, 'Webhook');
	}
}

// Export the extension context getter for services
export function getExtensionContext(): vscode.ExtensionContext {
	return extensionContext;
}

