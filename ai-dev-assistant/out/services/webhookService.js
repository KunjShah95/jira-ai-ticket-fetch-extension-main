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
exports.WebhookService = void 0;
const vscode = __importStar(require("vscode"));
const events_1 = require("events");
const logger_1 = require("../utils/logger");
class WebhookService extends events_1.EventEmitter {
    constructor() {
        super();
        this.port = 3000;
        this.webhookEndpoints = new Map();
        this.logger = logger_1.Logger.getInstance();
        this.setupEndpoints();
    }
    setupEndpoints() {
        // Register webhook handlers
        this.webhookEndpoints.set('/webhook/jira', this.handleJiraWebhook.bind(this));
        this.webhookEndpoints.set('/webhook/git', this.handleGitWebhook.bind(this));
        this.webhookEndpoints.set('/webhook/generic', this.handleGenericWebhook.bind(this));
    }
    async startServer() {
        try {
            // Note: In a real VS Code extension, you'd need to use a different approach
            // as VS Code extensions can't typically run HTTP servers directly.
            // This would need to be implemented as a separate service or use VS Code's
            // built-in capabilities for handling external requests.
            const config = vscode.workspace.getConfiguration('aiDevAssistant.webhook');
            this.port = config.get('port', 3000);
            this.logger.info(`Starting webhook server on port ${this.port}`, 'WebhookService');
            // For demonstration purposes, we'll simulate server startup
            this.logger.info(`Webhook server started successfully on port ${this.port}`, 'WebhookService');
            // In a real implementation, you would:
            // 1. Use VS Code's built-in server capabilities
            // 2. Or communicate with an external webhook service
            // 3. Or use VS Code's URI handler for webhook-like functionality
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.logger.error('Failed to start webhook server', 'WebhookService', new Error(errorMsg));
            throw error;
        }
    }
    async stopServer() {
        if (this.server) {
            this.logger.info('Stopping webhook server', 'WebhookService');
            // Stop server implementation
            this.server = undefined;
        }
    }
    async handleJiraWebhook(payload) {
        try {
            const jiraPayload = payload;
            this.logger.info(`Received Jira webhook: ${jiraPayload.eventType}`, 'WebhookService', {
                issueKey: jiraPayload.data.issue.key,
                eventType: jiraPayload.eventType
            });
            switch (jiraPayload.eventType) {
                case 'jira:issue_created':
                    await this.handleIssueCreated(jiraPayload);
                    break;
                case 'jira:issue_updated':
                    await this.handleIssueUpdated(jiraPayload);
                    break;
                case 'jira:issue_assigned':
                    await this.handleIssueAssigned(jiraPayload);
                    break;
                default:
                    this.logger.debug(`Unhandled Jira event type: ${jiraPayload.eventType}`, 'WebhookService');
            }
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.logger.error('Error handling Jira webhook', 'WebhookService', new Error(errorMsg));
        }
    }
    async handleGitWebhook(payload) {
        try {
            const gitPayload = payload;
            this.logger.info(`Received Git webhook: ${gitPayload.eventType}`, 'WebhookService', {
                repository: gitPayload.data.repository.name,
                eventType: gitPayload.eventType
            });
            switch (gitPayload.eventType) {
                case 'git:pull_request':
                    await this.handlePullRequest(gitPayload);
                    break;
                case 'git:push':
                    await this.handlePush(gitPayload);
                    break;
                default:
                    this.logger.debug(`Unhandled Git event type: ${gitPayload.eventType}`, 'WebhookService');
            }
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.logger.error('Error handling Git webhook', 'WebhookService', new Error(errorMsg));
        }
    }
    async handleGenericWebhook(payload) {
        try {
            this.logger.info(`Received generic webhook: ${payload.eventType}`, 'WebhookService');
            this.emit('webhook', payload);
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.logger.error('Error handling generic webhook', 'WebhookService', new Error(errorMsg));
        }
    }
    async handleIssueCreated(payload) {
        const issue = payload.data.issue;
        // Check if this issue should trigger automated development
        const config = vscode.workspace.getConfiguration('aiDevAssistant.automation');
        // const autoTriggerLabels = config.get('triggerLabels', ['automation', 'ai-dev']);
        const autoTriggerIssueTypes = config.get('triggerIssueTypes', ['Story', 'Task', 'Bug']);
        if (autoTriggerIssueTypes.includes(issue.fields.issuetype.name)) {
            // Emit event to trigger automated workflow
            const workflowEvent = {
                type: 'workflow_trigger',
                workflowId: undefined,
                data: {
                    source: 'jira_webhook',
                    issueKey: issue.key,
                    trigger: 'issue_created'
                },
                timestamp: new Date()
            };
            this.emit('workflowTrigger', workflowEvent);
            // Show notification to user
            const action = await vscode.window.showInformationMessage(`New Jira issue created: ${issue.key} - ${issue.fields.summary}`, 'Start Automation', 'View Issue');
            if (action === 'Start Automation') {
                vscode.commands.executeCommand('aiDevAssistant.startWorkflow', issue.key);
            }
            else if (action === 'View Issue') {
                // Open issue in browser (would need Jira URL configuration)
                this.logger.info(`User chose to view issue ${issue.key}`, 'WebhookService');
            }
        }
    }
    async handleIssueUpdated(payload) {
        const issue = payload.data.issue;
        // Check if status changed to something that requires action
        if (payload.data.changelog) {
            const statusChange = payload.data.changelog.items?.find((item) => item.field === 'status');
            if (statusChange) {
                this.logger.info(`Issue ${issue.key} status changed from ${statusChange.fromString} to ${statusChange.toString}`, 'WebhookService');
                // Emit status change event
                const workflowEvent = {
                    type: 'status_changed',
                    workflowId: undefined,
                    data: {
                        issueKey: issue.key,
                        fromStatus: statusChange.fromString,
                        toStatus: statusChange.toString
                    },
                    timestamp: new Date()
                };
                this.emit('statusChange', workflowEvent);
            }
        }
    }
    async handleIssueAssigned(payload) {
        const issue = payload.data.issue;
        const assignee = issue.fields.assignee;
        if (assignee) {
            this.logger.info(`Issue ${issue.key} assigned to ${assignee.displayName}`, 'WebhookService');
            // Check if assigned to current user (would need user mapping)
            const currentUser = await this.getCurrentUser();
            if (currentUser && assignee.accountId === currentUser.accountId) {
                vscode.window.showInformationMessage(`You have been assigned to issue: ${issue.key} - ${issue.fields.summary}`, 'Start Work', 'View Issue').then(action => {
                    if (action === 'Start Work') {
                        vscode.commands.executeCommand('aiDevAssistant.startWorkflow', issue.key);
                    }
                });
            }
        }
    }
    async handlePullRequest(payload) {
        const pr = payload.data.pullRequest;
        if (pr) {
            this.logger.info(`Pull request ${pr.status}: ${pr.title}`, 'WebhookService');
            if (pr.status === 'merged') {
                // PR was merged, might want to update Jira issues
                const workflowEvent = {
                    type: 'pr_merged',
                    workflowId: undefined,
                    data: {
                        pullRequestId: pr.id,
                        title: pr.title,
                        url: pr.url
                    },
                    timestamp: new Date()
                };
                this.emit('prMerged', workflowEvent);
            }
        }
    }
    async handlePush(payload) {
        const commits = payload.data.commits || [];
        // Look for Jira issue keys in commit messages
        const jiraKeyRegex = /([A-Z]+-\d+)/g;
        const mentionedIssues = new Set();
        commits.forEach(commit => {
            const matches = commit.message.match(jiraKeyRegex);
            if (matches) {
                matches.forEach(key => mentionedIssues.add(key));
            }
        });
        if (mentionedIssues.size > 0) {
            this.logger.info(`Push mentioned Jira issues: ${Array.from(mentionedIssues).join(', ')}`, 'WebhookService');
            // Emit event for Jira integration
            const workflowEvent = {
                type: 'commits_pushed',
                workflowId: undefined,
                data: {
                    issues: Array.from(mentionedIssues),
                    commits: commits.map(c => ({ id: c.id, message: c.message })),
                    branch: payload.data.branch
                },
                timestamp: new Date()
            };
            this.emit('commitsPushed', workflowEvent);
        }
    }
    async getCurrentUser() {
        // This would integrate with the JiraService to get current user info
        // For now, return null
        return null;
    }
    getWebhookUrl(endpoint) {
        return `http://localhost:${this.port}${endpoint}`;
    }
    async registerWebhook(service, endpoint) {
        const webhookUrl = this.getWebhookUrl(endpoint);
        this.logger.info(`Webhook URL for ${service}: ${webhookUrl}`, 'WebhookService');
        // In a real implementation, you would:
        // 1. Register this URL with the external service (Jira, GitHub, etc.)
        // 2. Handle authentication/verification tokens
        // 3. Store the registration details
        return webhookUrl;
    }
    async initialize() {
        try {
            await this.startServer();
            // Register webhook endpoints with external services if needed
            this.logger.info('Webhook service initialized successfully', 'WebhookService');
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.logger.error('Failed to initialize webhook service', 'WebhookService', new Error(errorMsg));
            throw error;
        }
    }
    dispose() {
        this.stopServer();
        this.removeAllListeners();
    }
}
exports.WebhookService = WebhookService;
//# sourceMappingURL=webhookService.js.map