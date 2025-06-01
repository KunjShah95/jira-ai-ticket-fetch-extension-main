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
exports.LLMService = void 0;
const vscode = __importStar(require("vscode"));
const openai_1 = __importDefault(require("openai"));
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
class LLMService {
    constructor() {
        this.config = this.loadConfiguration();
        // initializeClients is async, but constructor cannot be async
        this.initializeClients();
    }
    loadConfiguration() {
        const config = vscode.workspace.getConfiguration('aiDevAssistant');
        const provider = config.get('llm.provider') || 'openai';
        return {
            provider: provider,
            apiKey: '',
            model: this.getDefaultModel(provider),
            baseUrl: config.get('llm.baseUrl')
        };
    }
    getDefaultModel(provider) {
        switch (provider) {
            case 'openai':
                return 'gpt-4-turbo-preview';
            case 'anthropic':
                return 'claude-3-sonnet-20240229';
            case 'azure-openai':
                return 'gpt-4-turbo';
            default:
                return 'gpt-4-turbo-preview';
        }
    }
    async initializeClients() {
        try {
            this.config.apiKey = await this.getApiKey();
            switch (this.config.provider) {
                case 'openai':
                    this.openaiClient = new openai_1.default({
                        apiKey: this.config.apiKey,
                        baseURL: this.config.baseUrl // Add baseURL for OpenAI if provided
                    });
                    break;
                case 'anthropic':
                    this.anthropicClient = new sdk_1.default({
                        apiKey: this.config.apiKey
                    });
                    break;
                case 'azure-openai':
                    this.openaiClient = new openai_1.default({
                        apiKey: this.config.apiKey,
                        baseURL: this.config.baseUrl
                    });
                    break;
            }
        }
        catch (error) {
            console.error('Failed to initialize LLM client:', error);
        }
    }
    async getApiKey() {
        const extensionContext = global.extensionContext;
        if (!extensionContext) {
            throw new Error('Extension context not available');
        }
        const storageKey = `llm.${this.config.provider}.apiKey`;
        let apiKey = await extensionContext.secrets.get(storageKey);
        if (!apiKey) {
            // Prompt user for API key
            apiKey = await vscode.window.showInputBox({
                prompt: `Enter your ${this.config.provider.toUpperCase()} API key`,
                ignoreFocusOut: true,
                password: true
            });
            if (!apiKey) {
                throw new Error('API key is required');
            }
            // Store securely
            await extensionContext.secrets.store(storageKey, apiKey);
        }
        return apiKey;
    }
    async generateCode(request) {
        try {
            const prompt = this.buildCodeGenerationPrompt(request);
            const response = await this.callLLM(prompt);
            return this.parseCodeGenerationResponse(response, request);
        }
        catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            throw new Error(`Code generation failed: ${errMsg}`);
        }
    }
    async reviewCode(code, context) {
        const prompt = `
Please review the following code and provide constructive feedback:

Context: ${context}

Code:
\`\`\`
${code}
\`\`\`

Please focus on:
1. Code quality and best practices
2. Security considerations
3. Performance optimizations
4. Maintainability
5. Testing suggestions

Provide specific, actionable feedback.
    `.trim();
        return await this.callLLM(prompt);
    }
    async suggestImprovements(code, testResults) {
        const prompt = `
The following code has test failures. Please analyze the code and test results to suggest improvements:

Code:
\`\`\`
${code}
\`\`\`

Test Results:
- Passed: ${testResults.passed}
- Failed: ${testResults.failed}
- Coverage: ${testResults.coverage}%

Failed Tests:
${testResults.failures.map(f => `- ${f.testName}: ${f.error}`).join('\n')}

Please provide specific suggestions to fix the failing tests and improve the code quality.
    `.trim();
        return await this.callLLM(prompt);
    }
    async generateTests(code, framework) {
        const prompt = `
Generate comprehensive unit tests for the following code using ${framework}:

\`\`\`
${code}
\`\`\`

Please generate tests that cover:
1. Happy path scenarios
2. Edge cases
3. Error conditions
4. Boundary conditions

Ensure good test coverage and follow ${framework} best practices.

Return the test code in a format suitable for a test file.
    `.trim();
        const testCode = await this.callLLM(prompt);
        return [
            {
                path: this.inferTestFilePath(code, framework),
                content: testCode,
                language: this.inferLanguage(code),
                description: 'Generated unit tests'
            }
        ];
    }
    buildCodeGenerationPrompt(request) {
        return `
You are an expert software developer. Generate high-quality, production-ready code based on the following Jira task:

## Task Details
- **Key**: ${request.task.key}
- **Summary**: ${request.task.summary}
- **Description**: ${request.task.description}
- **Type**: ${request.task.issueType}
- **Priority**: ${request.task.priority}

## Requirements
${request.requirements}

## Project Context
- **File Type**: ${request.fileType}
- **Project Structure**: ${request.context.projectStructure?.join(', ') || 'Not specified'}
- **Test Framework**: ${request.context.testFramework || 'Jest'}
- **Dependencies**: ${request.context.dependencies?.join(', ') || 'Not specified'}

## Instructions
1. Generate clean, maintainable, and well-documented code
2. Follow best practices for the technology stack
3. Include comprehensive error handling
4. Add TypeScript types where applicable
5. Generate corresponding unit tests
6. Include proper imports and dependencies

## Output Format
Please provide your response in the following JSON format:

\`\`\`json
{
  "files": [
    {
      "path": "relative/path/to/file.ts",
      "content": "// File content here",
      "language": "typescript",
      "description": "Brief description of the file"
    }
  ],
  "testFiles": [
    {
      "path": "relative/path/to/file.test.ts",
      "content": "// Test file content here",
      "language": "typescript",
      "description": "Test file description"
    }
  ],
  "dependencies": ["package1", "package2"],
  "instructions": "Any additional setup instructions"
}
\`\`\`

Generate the implementation now:
    `.trim();
    }
    async callLLM(prompt) {
        switch (this.config.provider) {
            case 'openai':
            case 'azure-openai':
                return await this.callOpenAI(prompt);
            case 'anthropic':
                return await this.callAnthropic(prompt);
            default:
                throw new Error(`Unsupported LLM provider: ${this.config.provider}`);
        }
    }
    async callOpenAI(prompt) {
        if (!this.openaiClient) {
            throw new Error('OpenAI client not initialized');
        }
        const response = await this.openaiClient.chat.completions.create({
            model: this.config.model,
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert software developer who writes clean, efficient, and well-tested code.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.1,
            max_tokens: 4000
        });
        return response.choices[0]?.message?.content || '';
    }
    async callAnthropic(prompt) {
        if (!this.anthropicClient) {
            throw new Error('Anthropic client not initialized');
        }
        // Anthropic SDK v1 uses .messages.create, v0.19.x uses .completions.create
        if (typeof this.anthropicClient.messages?.create === 'function') {
            const response = await this.anthropicClient.messages.create({
                model: this.config.model,
                max_tokens: 4000,
                temperature: 0.1,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ]
            });
            if (Array.isArray(response.content)) {
                const textPart = response.content.find((c) => c.type === 'text');
                return textPart ? textPart.text : '';
            }
            return '';
        }
        else if (typeof this.anthropicClient.completions?.create === 'function') {
            const response = await this.anthropicClient.completions.create({
                model: this.config.model,
                max_tokens_to_sample: 4000,
                prompt: prompt,
                temperature: 0.1
            });
            return response.completion || '';
        }
        else {
            throw new Error('Anthropic client does not support known completion APIs');
        }
    }
    parseCodeGenerationResponse(response, request) {
        try {
            // Extract JSON from response (it might be wrapped in markdown)
            const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
            const jsonContent = jsonMatch ? jsonMatch[1] : response;
            const parsed = JSON.parse(jsonContent);
            // Validate the response structure
            if (!parsed.files || !Array.isArray(parsed.files)) {
                throw new Error('Invalid response format: missing files array');
            }
            return {
                files: parsed.files.map((file) => ({
                    path: file.path,
                    content: file.content,
                    language: file.language || this.inferLanguage(file.content),
                    description: file.description
                })),
                testFiles: (parsed.testFiles || []).map((file) => ({
                    path: file.path,
                    content: file.content,
                    language: file.language || this.inferLanguage(file.content),
                    description: file.description
                })),
                dependencies: parsed.dependencies || [],
                instructions: parsed.instructions
            };
        }
        catch (error) {
            // Fallback: try to extract code blocks manually
            console.warn('Failed to parse JSON response, attempting manual extraction:', error);
            return this.extractCodeFromResponse(response, request);
        }
    }
    extractCodeFromResponse(response, request) {
        const codeBlocks = response.match(/```[\w]*\n([\s\S]*?)\n```/g) || [];
        const files = [];
        const testFiles = [];
        codeBlocks.forEach((block, index) => {
            const content = block.replace(/```[\w]*\n/, '').replace(/\n```$/, '');
            const language = this.inferLanguage(content);
            const isTest = content.includes('test') || content.includes('spec') || content.includes('describe');
            const file = {
                path: isTest ? `src/${request.task.key.toLowerCase()}.test.${this.getFileExtension(language)}`
                    : `src/${request.task.key.toLowerCase()}.${this.getFileExtension(language)}`,
                content,
                language,
                description: isTest ? 'Generated test file' : 'Generated implementation file'
            };
            if (isTest) {
                testFiles.push(file);
            }
            else {
                files.push(file);
            }
        });
        return { files, testFiles };
    }
    inferLanguage(content) {
        if (content.includes('import') && content.includes('export') && content.includes(':')) {
            return 'typescript';
        }
        if (content.includes('import') && content.includes('export')) {
            return 'javascript';
        }
        if (content.includes('def ') && content.includes('import ')) {
            return 'python';
        }
        if (content.includes('package ') && content.includes('func ')) {
            return 'go';
        }
        return 'typescript'; // Default
    }
    getFileExtension(language) {
        switch (language) {
            case 'typescript': return 'ts';
            case 'javascript': return 'js';
            case 'python': return 'py';
            case 'go': return 'go';
            case 'java': return 'java';
            case 'csharp': return 'cs';
            default: return 'ts';
        }
    }
    inferTestFilePath(code, framework) {
        // Try to extract filename from code or use a default
        const classMatch = code.match(/class\s+(\w+)/);
        const functionMatch = code.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
        const name = classMatch?.[1] || functionMatch?.[1] || 'generated';
        const ext = this.getFileExtension(this.inferLanguage(code));
        if (framework.toLowerCase().includes('jest')) {
            return `src/${name.toLowerCase()}.test.${ext}`;
        }
        else if (framework.toLowerCase().includes('mocha')) {
            return `test/${name.toLowerCase()}.spec.${ext}`;
        }
        else {
            return `src/${name.toLowerCase()}.test.${ext}`;
        }
    }
}
exports.LLMService = LLMService;
//# sourceMappingURL=llmService.js.map