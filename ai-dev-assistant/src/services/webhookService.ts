import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { Logger } from '../utils/logger';
import { WorkflowEvent } from '../types';

export interface WebhookPayload {
	timestamp: string;
	eventType: string;
	source: string;
	data: any;
}

export interface JiraWebhookPayload extends WebhookPayload {
	eventType: 'jira:issue_created' | 'jira:issue_updated' | 'jira:issue_deleted' | 'jira:issue_assigned';
	data: {
		issue: {
			key: string;
			fields: {
				summary: string;
				description: string;
				status: { name: string };
				assignee?: { accountId: string; displayName: string };
				priority: { name: string };
				issuetype: { name: string };
			};
		};
		user?: {
			accountId: string;
			displayName: string;
		};
		changelog?: any;
	};
}

export interface GitWebhookPayload extends WebhookPayload {
	eventType: 'git:push' | 'git:pull_request' | 'git:branch_created' | 'git:branch_deleted';
	data: {
		repository: {
			name: string;
			url: string;
		};
		branch?: string;
		pullRequest?: {
			id: number;
			title: string;
			url: string;
			status: string;
		};
		commits?: Array<{
			id: string;
			message: string;
			author: string;
		}>;
	};
}

export class WebhookService extends EventEmitter {
	private logger: Logger;
	private server?: any;
	private port: number = 3000;
	private webhookEndpoints: Map<string, (payload: WebhookPayload) => Promise<void>> = new Map();

	constructor() {
		super();
		this.logger = Logger.getInstance();
		this.setupEndpoints();
	}

	private setupEndpoints(): void {
		// Register webhook handlers
		this.webhookEndpoints.set('/webhook/jira', this.handleJiraWebhook.bind(this));
		this.webhookEndpoints.set('/webhook/git', this.handleGitWebhook.bind(this));
		this.webhookEndpoints.set('/webhook/generic', this.handleGenericWebhook.bind(this));
	}

	public async startServer(): Promise<void> {
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

		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			this.logger.error('Failed to start webhook server', 'WebhookService', new Error(errorMsg));
			throw error;
		}
	}

	public async stopServer(): Promise<void> {
		if (this.server) {
			this.logger.info('Stopping webhook server', 'WebhookService');
			// Stop server implementation
			this.server = undefined;
		}
	}

	private async handleJiraWebhook(payload: WebhookPayload): Promise<void> {
		try {
			const jiraPayload = payload as JiraWebhookPayload;
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
		} catch (error: unknown) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			this.logger.error('Error handling Jira webhook', 'WebhookService', new Error(errorMsg));
		}
	}

	private async handleGitWebhook(payload: WebhookPayload): Promise<void> {
		try {
			const gitPayload = payload as GitWebhookPayload;
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
		} catch (error: unknown) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			this.logger.error('Error handling Git webhook', 'WebhookService', new Error(errorMsg));
		}
	}

	private async handleGenericWebhook(payload: WebhookPayload): Promise<void> {
		try {
			this.logger.info(`Received generic webhook: ${payload.eventType}`, 'WebhookService');
			this.emit('webhook', payload);
		} catch (error: unknown) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			this.logger.error('Error handling generic webhook', 'WebhookService', new Error(errorMsg));
		}
	}
	private async handleIssueCreated(payload: JiraWebhookPayload): Promise<void> {
		const issue = payload.data.issue;
		// Check if this issue should trigger automated development
		const config = vscode.workspace.getConfiguration('aiDevAssistant.automation');
		// const autoTriggerLabels = config.get('triggerLabels', ['automation', 'ai-dev']);
		const autoTriggerIssueTypes = config.get('triggerIssueTypes', ['Story', 'Task', 'Bug']);

		if (autoTriggerIssueTypes.includes(issue.fields.issuetype.name)) {
			// Emit event to trigger automated workflow
			const workflowEvent: WorkflowEvent = {
				type: 'workflow_trigger',
				workflowId: undefined, // Explicitly set as undefined since it's optional
				data: {
					source: 'jira_webhook',
					issueKey: issue.key,
					trigger: 'issue_created'
				},
				timestamp: new Date()
			};

			this.emit('workflowTrigger', workflowEvent);

			// Show notification to user
			const action = await vscode.window.showInformationMessage(
				`New Jira issue created: ${issue.key} - ${issue.fields.summary}`,
				'Start Automation',
				'View Issue'
			);

			if (action === 'Start Automation') {
				vscode.commands.executeCommand('aiDevAssistant.startWorkflow', issue.key);
			} else if (action === 'View Issue') {
				// Open issue in browser (would need Jira URL configuration)
				this.logger.info(`User chose to view issue ${issue.key}`, 'WebhookService');
			}
		}
	}

	private async handleIssueUpdated(payload: JiraWebhookPayload): Promise<void> {
		const issue = payload.data.issue;

		// Check if status changed to something that requires action
		if (payload.data.changelog) {
			const statusChange = payload.data.changelog.items?.find((item: any) => item.field === 'status');

			if (statusChange) {
				this.logger.info(
					`Issue ${issue.key} status changed from ${statusChange.fromString} to ${statusChange.toString}`,
					'WebhookService'
				);

				// Emit status change event
				const workflowEvent: WorkflowEvent = {
					type: 'status_changed',
					workflowId: undefined, // Explicitly set as undefined since it's optional
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

	private async handleIssueAssigned(payload: JiraWebhookPayload): Promise<void> {
		const issue = payload.data.issue;
		const assignee = issue.fields.assignee;

		if (assignee) {
			this.logger.info(`Issue ${issue.key} assigned to ${assignee.displayName}`, 'WebhookService');

			// Check if assigned to current user (would need user mapping)
			const currentUser = await this.getCurrentUser();
			if (currentUser && assignee.accountId === currentUser.accountId) {
				vscode.window.showInformationMessage(
					`You have been assigned to issue: ${issue.key} - ${issue.fields.summary}`,
					'Start Work',
					'View Issue'
				).then(action => {
					if (action === 'Start Work') {
						vscode.commands.executeCommand('aiDevAssistant.startWorkflow', issue.key);
					}
				});
			}
		}
	}

	private async handlePullRequest(payload: GitWebhookPayload): Promise<void> {
		const pr = payload.data.pullRequest;

		if (pr) {
			this.logger.info(`Pull request ${pr.status}: ${pr.title}`, 'WebhookService');

			if (pr.status === 'merged') {
				// PR was merged, might want to update Jira issues
				const workflowEvent: WorkflowEvent = {
					type: 'pr_merged',
					workflowId: undefined, // Explicitly set as undefined since it's optional
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

	private async handlePush(payload: GitWebhookPayload): Promise<void> {
		const commits = payload.data.commits || [];

		// Look for Jira issue keys in commit messages
		const jiraKeyRegex = /([A-Z]+-\d+)/g;
		const mentionedIssues = new Set<string>();

		commits.forEach(commit => {
			const matches = commit.message.match(jiraKeyRegex);
			if (matches) {
				matches.forEach(key => mentionedIssues.add(key));
			}
		});

		if (mentionedIssues.size > 0) {
			this.logger.info(`Push mentioned Jira issues: ${Array.from(mentionedIssues).join(', ')}`, 'WebhookService');

			// Emit event for Jira integration
			const workflowEvent: WorkflowEvent = {
				type: 'commits_pushed',
				workflowId: undefined, // Explicitly set as undefined since it's optional
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

	private async getCurrentUser(): Promise<{ accountId: string; displayName: string } | null> {
		// This would integrate with the JiraService to get current user info
		// For now, return null
		return null;
	}

	public getWebhookUrl(endpoint: string): string {
		return `http://localhost:${this.port}${endpoint}`;
	}

	public async registerWebhook(service: string, endpoint: string): Promise<string> {
		const webhookUrl = this.getWebhookUrl(endpoint);

		this.logger.info(`Webhook URL for ${service}: ${webhookUrl}`, 'WebhookService');

		// In a real implementation, you would:
		// 1. Register this URL with the external service (Jira, GitHub, etc.)
		// 2. Handle authentication/verification tokens
		// 3. Store the registration details

		return webhookUrl;
	}

	public async initialize(): Promise<void> {
		try {
			await this.startServer();
			// Register webhook endpoints with external services if needed
			this.logger.info('Webhook service initialized successfully', 'WebhookService');
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			this.logger.error('Failed to initialize webhook service', 'WebhookService', new Error(errorMsg));
			throw error;
		}
	}

		public dispose(): void {
			this.stopServer();
			this.removeAllListeners();
		}
	}
