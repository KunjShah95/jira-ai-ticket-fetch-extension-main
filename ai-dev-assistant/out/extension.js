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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = exports.getExtensionContext = void 0;
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
const configurationManager_1 = require("./utils/configurationManager");
const logger_1 = require("./utils/logger");
// Polyfill for fetch in Node.js (VS Code extension host)
const node_fetch_1 = __importDefault(require("node-fetch"));
const fetch = (typeof globalThis.fetch === 'function' ? globalThis.fetch : node_fetch_1.default);
// Global extension context for services to access
let extensionContext;
// Function to get extension context
function getExtensionContext() {
    return extensionContext;
}
exports.getExtensionContext = getExtensionContext;
// Helper to configure Jira
async function configureJiraConnection(jiraService) {
    try {
        vscode.window.showInformationMessage('Configuring Jira connection...');
        const success = await jiraService.authenticate();
        if (success) {
            vscode.window.showInformationMessage('✅ Successfully connected to Jira!');
        }
        else {
            vscode.window.showErrorMessage('❌ Failed to connect to Jira. Please check your configuration.');
        }
    }
    catch (error) {
        vscode.window.showErrorMessage(`Jira configuration failed: ${error.message}`);
    }
}
// Start workflow for a Jira task key
async function startDevelopmentWorkflow(orchestrationService, jiraService) {
    try {
        if (!jiraService.isAuthenticated()) {
            const configureFirst = await vscode.window.showWarningMessage('Jira not configured. Configure connection first?', 'Configure Jira', 'Cancel');
            if (configureFirst === 'Configure Jira') {
                await vscode.commands.executeCommand('aiDevAssistant.configureJira');
                if (!jiraService.isAuthenticated()) {
                    return;
                }
            }
            else {
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
        if (!taskKey)
            return;
        vscode.window.showInformationMessage(`Starting development workflow for ${taskKey}...`);
        await orchestrationService.startDevelopmentWorkflow(taskKey);
        vscode.window.showInformationMessage(`✅ Workflow started for ${taskKey}!`, 'View Progress').then(selection => {
            if (selection === 'View Progress') {
                vscode.commands.executeCommand('aiDevAssistant.viewProgress');
            }
        });
    }
    catch (error) {
        vscode.window.showErrorMessage(`Failed to start workflow: ${error.message ?? error}`);
    }
}
// Show progress dashboard as webview
async function viewProgressDashboard(progressService) {
    try {
        const workflows = await progressService.getAllWorkflows();
        if (workflows.length === 0) {
            vscode.window.showInformationMessage('No workflows found. Start a new workflow to see progress here.');
            return;
        }
        const panel = vscode.window.createWebviewPanel('progressDashboard', 'AI Dev Assistant - Progress Dashboard', vscode.ViewColumn.One, { enableScripts: true });
        panel.webview.html = generateProgressDashboardHTML(workflows);
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
                    panel.webview.html = generateProgressDashboardHTML(updatedWorkflows);
                    break;
            }
        });
    }
    catch (error) {
        vscode.window.showErrorMessage(`Failed to view progress: ${error.message ?? error}`);
    }
}
// Retry workflow
async function retryWorkflow(orchestrationService, workflowId) {
    try {
        await orchestrationService.processWorkflowStep(workflowId);
        vscode.window.showInformationMessage(`Retrying workflow ${workflowId}...`);
    }
    catch (error) {
        vscode.window.showErrorMessage(`Failed to retry workflow: ${error.message ?? error}`);
    }
}
// Select a workflow to retry
async function selectWorkflowForRetry(progressService) {
    const workflows = await progressService.getAllWorkflows();
    const failedWorkflows = workflows.filter((w) => w.status === 'failed');
    if (failedWorkflows.length === 0) {
        vscode.window.showInformationMessage('No failed workflows to retry');
        return undefined;
    }
    const selected = await vscode.window.showQuickPick(failedWorkflows.map((w) => ({ label: w.id, description: w.jiraTask?.key })), { placeHolder: 'Select workflow to retry' });
    return selected?.label;
}
// Sync Jira tasks
async function syncJiraTasks(jiraService) {
    try {
        await jiraService.getTasks();
        vscode.window.showInformationMessage('Jira tasks synced successfully!');
    }
    catch (error) {
        vscode.window.showErrorMessage(`Failed to sync Jira tasks: ${error.message ?? error}`);
    }
}
// Generate code for a Jira task
async function generateCodeForTask(llmService, jiraService, taskKey) {
    try {
        if (!taskKey) {
            taskKey = await vscode.window.showInputBox({
                prompt: 'Enter Jira task key to generate code for',
                placeHolder: 'PROJ-123'
            });
        }
        if (!taskKey)
            return;
        const task = await jiraService.getTask(taskKey);
        vscode.window.showInformationMessage(`Generating code for ${taskKey}...`);
        // Basic implementation
        const request = {
            task: task,
            context: {},
            requirements: task.description,
            fileType: 'component'
        };
        await llmService.generateCode(request);
        vscode.window.showInformationMessage(`Code generated for ${taskKey}`);
    }
    catch (error) {
        vscode.window.showErrorMessage(`Failed to generate code: ${error.message ?? error}`);
    }
}
// Run project tests
async function runProjectTests(testingService) {
    try {
        vscode.window.showInformationMessage('Running project tests...');
        const results = await testingService.runTests();
        vscode.window.showInformationMessage(`Tests completed with ${results.passed} passed, ${results.failed} failed`);
    }
    catch (error) {
        vscode.window.showErrorMessage(`Test execution failed: ${error.message ?? error}`);
    }
}
// Review code
async function reviewCurrentCode(llmService) {
    try {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            vscode.window.showWarningMessage('No active editor. Please open a file to review.');
            return;
        }
        const code = activeEditor.document.getText();
        const fileName = activeEditor?.document?.fileName?.split(/[\\\/]/).pop() || 'Untitled';
        vscode.window.showInformationMessage('Reviewing code...');
        const review = await llmService.reviewCode(code, `File: ${fileName}`);
        const reviewDoc = await vscode.workspace.openTextDocument({
            content: `Code Review for ${fileName}\n\n${review}`,
            language: 'markdown'
        });
        await vscode.window.showTextDocument(reviewDoc);
    }
    catch (error) {
        vscode.window.showErrorMessage(`Code review failed: ${error.message ?? error}`);
    }
}
// Progress dashboard HTML
function generateProgressDashboardHTML(workflows) {
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
            </style>
        </head>
        <body>
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
                function retryWorkflow(id) { vscode.postMessage({ command: 'retryWorkflow', workflowId: id }); }
                function cancelWorkflow(id) { vscode.postMessage({ command: 'cancelWorkflow', workflowId: id }); }
                function deleteWorkflow(id) { vscode.postMessage({ command: 'deleteWorkflow', workflowId: id }); }
            </script>
        </body>
        </html>
    `;
}
// Show welcome message
function showWelcomeMessage() {
    const config = vscode.workspace.getConfiguration('aiDevAssistant');
    const hasShownWelcome = config.get('hasShownWelcome', false);
    if (!hasShownWelcome) {
        vscode.window.showInformationMessage('Welcome to AI Development Assistant! This extension helps automate your development workflow with Jira integration.', 'Configure Jira', 'Learn More', "Don't show again").then(selection => {
            if (selection === 'Configure Jira') {
                vscode.commands.executeCommand('aiDevAssistant.configureJira');
            }
        });
    }
}
// Setup event handlers
function setupEventHandlers(orchestrationService, webhookService, notificationService, logger) {
    orchestrationService.addEventListener((event) => {
        logger.info(`workflows event: ${event.type}`, 'Orchestration');
        // You can add notification or webhook logic here if those APIs are added in the future.
    });
}
// Extension activation
async function activate(context) {
    extensionContext = context;
    const logger = logger_1.Logger.getInstance();
    logger.info('Activating AI Development Assistant extension', 'Extension');
    try {
        configurationManager_1.ConfigurationManager.getInstance(context);
        // Create all services first
        const jiraService = new jiraService_1.JiraService();
        const llmService = new llmService_1.LLMService();
        const gitService = new gitService_1.GitService();
        const testingService = new testingService_1.TestingService();
        const progressService = new progressTrackingService_1.ProgressTrackingService();
        const webhookService = new webhookService_1.WebhookService();
        const notificationService = new notificationService_1.NotificationService();
        const backupService = new backupService_1.BackupService();
        // Then create orchestration service with proper dependencies
        const orchestrationService = new orchestrationService_1.OrchestrationService(jiraService, llmService, gitService, testingService, progressService);
        setupEventHandlers(orchestrationService, webhookService, notificationService, logger);
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
            vscode.commands.registerCommand('aiDevAssistant.retryWorkflow', async (workflowId) => {
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
            vscode.commands.registerCommand('aiDevAssistant.generateCodeForTask', async (taskKey) => {
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
                    const configure = await vscode.window.showWarningMessage('Jira is not configured. Configure now?', 'Configure Jira', 'Cancel');
                    if (configure === 'Configure Jira') {
                        await vscode.commands.executeCommand('aiDevAssistant.configureJira');
                        if (!jiraService.isAuthenticated())
                            return;
                    }
                    else {
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
                if (!taskKey)
                    return;
                // 3. Prompt for code generation options
                const codeStyle = await vscode.window.showQuickPick(['typescript', 'javascript', 'python'], {
                    placeHolder: 'Select code style/language for generation'
                });
                if (!codeStyle)
                    return;
                const framework = await vscode.window.showQuickPick(['react', 'node', 'none'], {
                    placeHolder: 'Select framework (if any)'
                });
                if (!framework)
                    return;
                const generateTests = await vscode.window.showQuickPick(['Yes', 'No'], {
                    placeHolder: 'Generate tests?'
                });
                if (!generateTests)
                    return;
                const includeDocs = await vscode.window.showQuickPick(['Yes', 'No'], {
                    placeHolder: 'Include documentation?'
                });
                if (!includeDocs)
                    return;
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
                    }
                    else if (['completed', 'failed'].includes(statusData.status)) {
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
                const approve = await vscode.window.showInformationMessage('Do you want to approve and push this code to GitHub?', 'Yes', 'No');
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
                if (!fileName)
                    return;
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
                }
                else {
                    vscode.window.showInformationMessage('Branch pushed. Please create a PR manually.');
                }
            })
        ];
        commands.forEach(command => context.subscriptions.push(command));
        context.subscriptions.push(progressService);
        showWelcomeMessage();
        logger.info('AI Development Assistant extension activated successfully', 'Extension');
    }
    catch (error) {
        logger.error(`Failed to activate extension: ${error.message ?? error}`, 'Extension');
        vscode.window.showErrorMessage(`Failed to activate AI Development Assistant: ${error.message ?? error}`);
    }
}
exports.activate = activate;
//# sourceMappingURL=extension.js.map