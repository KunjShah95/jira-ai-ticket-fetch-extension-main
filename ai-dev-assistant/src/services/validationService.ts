import * as vscode from 'vscode';

export interface CredentialValidationResult {
	isValid: boolean;
	message: string;
	suggestions?: string[];
	details?: string;
}

/**
 * Validates that credentials are securely stored in the extension context.
 */
export async function validateCredentials(): Promise<CredentialValidationResult> {
	const extensionContext = (global as any).extensionContext;

	if (!extensionContext) {
		return {
			isValid: false,
			message: 'Extension context not available for credential validation'
		};
	}

	try {
		const jiraToken = await extensionContext.secrets.get('jira_token');
		const llmApiKey = await extensionContext.secrets.get('llm_api_key');

		if (!jiraToken && !llmApiKey) {
			return {
				isValid: false,
				message: 'No credentials configured',
				suggestions: ['Configure Jira and LLM credentials']
			};
		}

		return {
			isValid: true,
			message: 'Credentials are stored securely'
		};
	} catch (error: unknown) {
		const errObj = error instanceof Error ? error : new Error(String(error));
		return {
			isValid: false,
			message: 'Failed to validate credential security',
			details: (errObj as Error).message
		};
	}
}

// ...existing code for other validation functions (if any) ...
