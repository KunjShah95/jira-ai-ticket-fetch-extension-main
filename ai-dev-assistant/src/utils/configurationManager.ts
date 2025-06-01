import * as vscode from 'vscode';
import { WorkflowConfig, JiraConfig, LLMConfig, GitConfig } from '../types';

export class ConfigurationManager {
	private static instance: ConfigurationManager;
	private context: vscode.ExtensionContext;

	private constructor(context: vscode.ExtensionContext) {
		this.context = context;
	}

	public static getInstance(context?: vscode.ExtensionContext): ConfigurationManager {
		if (!ConfigurationManager.instance && context) {
			ConfigurationManager.instance = new ConfigurationManager(context);
		}
		return ConfigurationManager.instance;
	}

	public async getWorkflowConfig(): Promise<Partial<WorkflowConfig>> {
		const config = vscode.workspace.getConfiguration('aiDevAssistant');

		return {
			jira: await this.getJiraConfig(),
			llm: await this.getLLMConfig(),
			git: this.getGitConfig(),
			testing: {
				autoRun: config.get('testing.autoRun', true),
				framework: config.get('testing.framework', 'jest'),
				coverageThreshold: config.get('testing.coverageThreshold', 80)
			}
		} as Partial<WorkflowConfig>;
	}

	public async getJiraConfig(): Promise<Partial<JiraConfig>> {
		const config = vscode.workspace.getConfiguration('aiDevAssistant');

		const jiraConfig: Partial<JiraConfig> = {
			instanceUrl: config.get('jira.instanceUrl'),
		};

		// Load sensitive data from secure storage
		if (this.context.secrets) {
			jiraConfig.accessToken = await this.context.secrets.get('jira.accessToken');
			jiraConfig.refreshToken = await this.context.secrets.get('jira.refreshToken');
			jiraConfig.clientId = await this.context.secrets.get('jira.clientId');
			jiraConfig.clientSecret = await this.context.secrets.get('jira.clientSecret');
		}

		return jiraConfig;
	}

	public async getLLMConfig(): Promise<Partial<LLMConfig>> {
		const config = vscode.workspace.getConfiguration('aiDevAssistant');
		const provider = config.get<LLMConfig['provider']>('llm.provider', 'openai');

		const llmConfig: Partial<LLMConfig> = {
			provider,
			model: config.get('llm.model'),
			baseUrl: config.get('llm.baseUrl')
		};

		// Load API key from secure storage
		if (this.context.secrets) {
			const storageKey = `llm.${provider}.apiKey`;
			llmConfig.apiKey = await this.context.secrets.get(storageKey);
		}

		return llmConfig;
	}

	public getGitConfig(): GitConfig {
		const config = vscode.workspace.getConfiguration('aiDevAssistant');

		return {
			autoCreateBranches: config.get('git.autoCreateBranches', true),
			branchPrefix: config.get('git.branchPrefix', 'feature/'),
			defaultBaseBranch: config.get('git.defaultBaseBranch', 'main'),
			autoCreatePR: config.get('git.autoCreatePR', true)
		};
	}

	public async updateJiraConfig(jiraConfig: Partial<JiraConfig>): Promise<void> {
		const config = vscode.workspace.getConfiguration('aiDevAssistant');

		// Update non-sensitive settings
		if (jiraConfig.instanceUrl) {
			await config.update('jira.instanceUrl', jiraConfig.instanceUrl, vscode.ConfigurationTarget.Workspace);
		}

		// Store sensitive data in secure storage
		if (this.context.secrets) {
			if (jiraConfig.accessToken) {
				await this.context.secrets.store('jira.accessToken', jiraConfig.accessToken);
			}
			if (jiraConfig.refreshToken) {
				await this.context.secrets.store('jira.refreshToken', jiraConfig.refreshToken);
			}
			if (jiraConfig.clientId) {
				await this.context.secrets.store('jira.clientId', jiraConfig.clientId);
			}
			if (jiraConfig.clientSecret) {
				await this.context.secrets.store('jira.clientSecret', jiraConfig.clientSecret);
			}
		}
	}

	public async updateLLMConfig(llmConfig: Partial<LLMConfig>): Promise<void> {
		const config = vscode.workspace.getConfiguration('aiDevAssistant');

		// Update non-sensitive settings
		if (llmConfig.provider) {
			await config.update('llm.provider', llmConfig.provider, vscode.ConfigurationTarget.Global);
		}
		if (llmConfig.model) {
			await config.update('llm.model', llmConfig.model, vscode.ConfigurationTarget.Global);
		}
		if (llmConfig.baseUrl) {
			await config.update('llm.baseUrl', llmConfig.baseUrl, vscode.ConfigurationTarget.Global);
		}

		// Store API key in secure storage
		if (this.context.secrets && llmConfig.apiKey && llmConfig.provider) {
			const storageKey = `llm.${llmConfig.provider}.apiKey`;
			await this.context.secrets.store(storageKey, llmConfig.apiKey);
		}
	}

	public async updateGitConfig(gitConfig: Partial<GitConfig>): Promise<void> {
		const config = vscode.workspace.getConfiguration('aiDevAssistant');

		if (gitConfig.autoCreateBranches !== undefined) {
			await config.update('git.autoCreateBranches', gitConfig.autoCreateBranches, vscode.ConfigurationTarget.Workspace);
		}
		if (gitConfig.branchPrefix) {
			await config.update('git.branchPrefix', gitConfig.branchPrefix, vscode.ConfigurationTarget.Workspace);
		}
		if (gitConfig.defaultBaseBranch) {
			await config.update('git.defaultBaseBranch', gitConfig.defaultBaseBranch, vscode.ConfigurationTarget.Workspace);
		}
		if (gitConfig.autoCreatePR !== undefined) {
			await config.update('git.autoCreatePR', gitConfig.autoCreatePR, vscode.ConfigurationTarget.Workspace);
		}
	}

	public async clearAllSecrets(): Promise<void> {
		if (!this.context.secrets) return;

		const secretKeys = [
			'jira.accessToken',
			'jira.refreshToken',
			'jira.clientId',
			'jira.clientSecret',
			'llm.openai.apiKey',
			'llm.anthropic.apiKey',
			'llm.azure-openai.apiKey'
		];

		for (const key of secretKeys) {
			try {
				await this.context.secrets.delete(key);
			} catch (error) {
				console.warn(`Failed to delete secret ${key}:`, error);
			}
		}
	}

	public async validateConfiguration(): Promise<{ isValid: boolean; errors: string[] }> {
		const errors: string[] = [];
		const config = await this.getWorkflowConfig();

		// Validate Jira configuration
		if (!config.jira?.instanceUrl) {
			errors.push('Jira instance URL is not configured');
		}
		if (!config.jira?.accessToken) {
			errors.push('Jira authentication is not configured');
		}

		// Validate LLM configuration
		if (!config.llm?.provider) {
			errors.push('LLM provider is not configured');
		}
		if (!config.llm?.apiKey) {
			errors.push('LLM API key is not configured');
		}

		// Validate Git configuration (basic check)
		if (!config.git?.defaultBaseBranch) {
			errors.push('Git default base branch is not configured');
		}

		return {
			isValid: errors.length === 0,
			errors
		};
	}

	public async exportConfiguration(): Promise<string> {
		const config = await this.getWorkflowConfig();

		// Remove sensitive data before export
		const exportConfig = {
			jira: {
				instanceUrl: config.jira?.instanceUrl
			},
			llm: {
				provider: config.llm?.provider,
				model: config.llm?.model,
				baseUrl: config.llm?.baseUrl
			},
			git: config.git,
			testing: config.testing
		};

		return JSON.stringify(exportConfig, null, 2);
	}

	public async importConfiguration(configJson: string): Promise<void> {
		try {
			const config = JSON.parse(configJson);

			if (config.jira) {
				await this.updateJiraConfig(config.jira);
			}
			if (config.llm) {
				await this.updateLLMConfig(config.llm);
			}
			if (config.git) {
				await this.updateGitConfig(config.git);
			}
			if (config.testing) {
				const vsConfig = vscode.workspace.getConfiguration('aiDevAssistant');
				if (config.testing.autoRun !== undefined) {
					await vsConfig.update('testing.autoRun', config.testing.autoRun, vscode.ConfigurationTarget.Workspace);
				}
				if (config.testing.framework) {
					await vsConfig.update('testing.framework', config.testing.framework, vscode.ConfigurationTarget.Workspace);
				}
				if (config.testing.coverageThreshold) {
					await vsConfig.update('testing.coverageThreshold', config.testing.coverageThreshold, vscode.ConfigurationTarget.Workspace);
				}
			}

		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			throw new Error(`Failed to import configuration: ${errorMessage}`);
		}
	}
}
