"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateCredentials = void 0;
/**
 * Validates that credentials are securely stored in the extension context.
 */
async function validateCredentials() {
    const extensionContext = global.extensionContext;
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
    }
    catch (error) {
        const errObj = error instanceof Error ? error : new Error(String(error));
        return {
            isValid: false,
            message: 'Failed to validate credential security',
            details: errObj.message
        };
    }
}
exports.validateCredentials = validateCredentials;
// ...existing code for other validation functions (if any) ...
//# sourceMappingURL=validationService.js.map