"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = __importStar(require("vscode"));
const orchestrationService_1 = require("./services/orchestrationService");
const jiraService_1 = require("./services/jiraService");
const llmService_1 = require("./services/llmService");
const gitService_1 = require("./services/gitService");
const testingService_1 = require("./services/testingService");
const progressTrackingService_1 = require("./services/progressTrackingService");
const webhookService_1 = require("./services/webhookService");
const notificationService_1 = require("./services/notificationService");
const backupService_1 = require("./services/backupService");
const validationService_1 = require("./services/validationService");
const logger_1 = require("./utils/logger");
const errorHandler_1 = require("./utils/errorHandler");
let logger;
let errorHandler;
function activate(context) {
    // Store extension context globally for services to access
    globalThis.extensionContext = context;
    // Initialize logger and error handler first
    logger = logger_1.Logger.getInstance();
    errorHandler = errorHandler_1.ErrorHandler.getInstance();
    logger.info('Activating AI Development Assistant extension', 'Extension');
    try {
        // Initialize core services
        const jiraService = new jiraService_1.JiraService();
        const llmService = new llmService_1.LLMService();
        const gitService = new gitService_1.GitService();
        const testingService = new testingService_1.TestingService();
        const progressService = new progressTrackingService_1.ProgressTrackingService();
        // Initialize additional services
        const webhookService = new webhookService_1.WebhookService();
        const notificationService = new notificationService_1.NotificationService();
        const backupService = new backupService_1.BackupService();
        // Initialize orchestration service with all dependencies
        const orchestrationService = new orchestrationService_1.OrchestrationService(jiraService, llmService, gitService, testingService, progressService);
        // Setup event handling
        setupEventHandlers(orchestrationService, webhookService, notificationService);
        // Register all commands
        const commands = registerCommands(orchestrationService, jiraService, llmService, testingService, progressService, webhookService, notificationService, backupService);
        // Add commands to context for disposal
        commands.forEach(command => context.subscriptions.push(command));
        // Start webhook server if enabled
        const config = vscode.workspace.getConfiguration('aiDevAssistant.webhook');
        if (config.get('enabled', false)) {
            webhookService.startServer().catch((error) => {
                const errorMsg = error instanceof Error ? error.message : String(error);
                logger.error('Failed to start webhook server', 'Extension', new Error(errorMsg));
            });
        }
        // Show welcome message for new users
        showWelcomeMessage();
        // Run initial validation after a short delay
        setTimeout(() => {
            (0, validationService_1.validateCredentials)().catch((error) => {
                const errorMsg = error instanceof Error ? error.message : String(error);
                logger.error('Initial validation failed', 'Extension', new Error(errorMsg));
            });
        }, 2000);
        logger.info('AI Development Assistant extension activated successfully', 'Extension');
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error('Failed to activate extension', 'Extension', new Error(errorMsg));
        vscode.window.showErrorMessage(`Failed to activate AI Development Assistant: ${errorMsg}`);
    }
}
exports.activate = activate;
function setupEventHandlers(orchestrationService, webhookService, notificationService) {
    // Setup workflow event handling
    orchestrationService.addEventListener(handleWorkflowEvent);
    // Setup webhook event handling
    webhookService.on('workflowTrigger', (event) => {
        notificationService.processEvent(event);
    });
    webhookService.on('statusChange', (event) => {
        notificationService.processEvent(event);
    });
    webhookService.on('prMerged', (event) => {
        notificationService.processEvent(event);
    });
}
function registerCommands(orchestrationService, jiraService, llmService, testingService, progressService, webhookService, notificationService, backupService) {
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
        vscode.commands.registerCommand('aiDevAssistant.retryWorkflow', async (workflowId) => {
            if (!workflowId) {
                workflowId = await selectWorkflowForRetry(progressService);
            }
            if (workflowId) {
                await retryWorkflow(orchestrationService, workflowId);
            }
        }),
        vscode.commands.registerCommand('aiDevAssistant.validateConfiguration', async () => {
            await (0, validationService_1.validateCredentials)();
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
        vscode.commands.registerCommand('aiDevAssistant.generateCodeForTask', async (taskKey) => {
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
async function configureJiraConnection(jiraService) {
    try {
        vscode.window.showInformationMessage('Configuring Jira connection...');
        if (!jiraService.isAuthenticated()) {
            const success = await jiraService.authenticate();
            if (success) {
                vscode.window.showInformationMessage('Jira authentication successful!');
            }
            else {
                vscode.window.showWarningMessage('Jira authentication failed. Please check your credentials.');
            }
        }
        else {
            vscode.window.showInformationMessage('Jira is already configured and authenticated.');
        }
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        await errorHandler.handleError(error, 'configureJiraConnection');
        vscode.window.showErrorMessage(`Failed to configure Jira: ${errorMsg}`);
    }
}
async function startDevelopmentWorkflow(orchestrationService, jiraService) {
    try {
        // Check if Jira is configured first
        if (!jiraService.isAuthenticated()) {
            const configureFirst = await vscode.window.showWarningMessage('Jira is not configured. Please configure Jira first.', 'Configure Jira', 'Cancel');
            if (configureFirst === 'Configure Jira') {
                await configureJiraConnection(jiraService);
                return;
            }
            else {
                return;
            }
        }
        // Get task key from user
        const taskKey = await vscode.window.showInputBox({
            prompt: 'Enter Jira task key (e.g., PROJ-123)',
            placeHolder: 'PROJ-123',
            validateInput: (value) => {
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
        vscode.window.showInformationMessage(`Development workflow started for ${taskKey}`, 'View Progress').then((selection) => {
            if (selection === 'View Progress') {
                vscode.commands.executeCommand('aiDevAssistant.viewProgress');
            }
        });
        logger.info(`Workflow ${workflowId} started for task ${taskKey}`, 'Extension');
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        await errorHandler.handleError(error, 'startDevelopmentWorkflow');
        vscode.window.showErrorMessage(`Failed to start workflow: ${errorMsg}`);
    }
}
async function viewProgressDashboard(progressService) {
    try {
        const workflows = await progressService.getAllWorkflows();
        if (workflows.length === 0) {
            vscode.window.showInformationMessage('No active workflows found.');
            return;
        }
        // Create webview panel for progress dashboard
        const panel = vscode.window.createWebviewPanel('aiDevAssistantProgress', 'AI Dev Assistant - Progress Dashboard', vscode.ViewColumn.One, { enableScripts: true });
        panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
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
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        await errorHandler.handleError(error, 'viewProgressDashboard');
        vscode.window.showErrorMessage(`Failed to show progress dashboard: ${errorMsg}`);
    }
}
async function selectWorkflowForRetry(progressService) {
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
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        await errorHandler.handleError(error, 'selectWorkflowForRetry');
        return undefined;
    }
}
async function retryWorkflow(orchestrationService, workflowId) {
    try {
        logger.info(`Retrying workflow: ${workflowId}`, 'Extension');
        // Get workflow to find the failed step
        const progressService = new progressTrackingService_1.ProgressTrackingService();
        const workflow = await progressService.getWorkflow(workflowId);
        // Find the failed step
        const failedStep = workflow.steps.find(step => step.status === 'failed');
        if (failedStep) {
            await orchestrationService.retryFailedStep(workflowId, failedStep.id);
            vscode.window.showInformationMessage(`Retrying workflow ${workflowId}`);
        }
        else {
            vscode.window.showWarningMessage(`No failed steps found in workflow ${workflowId}`);
        }
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        await errorHandler.handleError(error, 'retryWorkflow');
        vscode.window.showErrorMessage(`Failed to retry workflow: ${errorMsg}`);
    }
}
async function setupWebhooks(webhookService) {
    try {
        const jiraWebhookUrl = await webhookService.registerWebhook('jira', '/webhook/jira');
        const gitWebhookUrl = await webhookService.registerWebhook('git', '/webhook/git');
        vscode.window.showInformationMessage('Webhook URLs generated. Configure them in your external services.', 'Copy Jira URL', 'Copy Git URL').then((selection) => {
            if (selection === 'Copy Jira URL') {
                vscode.env.clipboard.writeText(jiraWebhookUrl);
            }
            else if (selection === 'Copy Git URL') {
                vscode.env.clipboard.writeText(gitWebhookUrl);
            }
        });
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        await errorHandler.handleError(error, 'setupWebhooks');
    }
}
async function generateCodeForTask(orchestrationService, jiraService, taskKey) {
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
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        await errorHandler.handleError(error, 'generateCodeForTask');
    }
}
async function runTests(testingService) {
    try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showWarningMessage('No workspace folder open');
            return;
        }
        logger.info('Running tests', 'Extension');
        const results = await testingService.runTests(workspaceFolder.uri.fsPath);
        if (results.failed > 0) {
            vscode.window.showWarningMessage(`Tests completed: ${results.passed} passed, ${results.failed} failed`, 'View Results');
        }
        else {
            vscode.window.showInformationMessage(`All ${results.passed} tests passed!`);
        }
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        await errorHandler.handleError(error, 'runTests');
    }
}
async function reviewCode(llmService) {
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
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        await errorHandler.handleError(error, 'reviewCode');
    }
}
function handleWorkflowEvent(event) {
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
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error('Error handling workflow event', 'Extension', new Error(errorMsg));
    }
}
function generateProgressDashboardHtml(workflows) {
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
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Progress Dashboard</title>
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
      </style>
    </head>
    <body>
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
function showWelcomeMessage() {
    const config = vscode.workspace.getConfiguration('aiDevAssistant');
    const hasShownWelcome = config.get('hasShownWelcome', false);
    if (!hasShownWelcome) {
        vscode.window.showInformationMessage('Welcome to AI Development Assistant! This extension helps automate your development workflow with Jira integration.', 'Configure Jira', 'Learn More', 'Don\'t show again').then((selection) => {
            if (selection === 'Configure Jira') {
                vscode.commands.executeCommand('aiDevAssistant.configureJira');
            }
            else if (selection === 'Learn More') {
                vscode.env.openExternal(vscode.Uri.parse('https://github.com/your-repo/ai-dev-assistant'));
            }
            else if (selection === 'Don\'t show again') {
                config.update('hasShownWelcome', true, vscode.ConfigurationTarget.Global);
            }
        });
    }
}
function deactivate() {
    logger?.info('AI Development Assistant extension deactivated', 'Extension');
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension-new.js.map