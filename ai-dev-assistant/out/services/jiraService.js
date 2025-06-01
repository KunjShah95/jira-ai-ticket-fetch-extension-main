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
exports.JiraService = void 0;
const vscode = __importStar(require("vscode"));
const axios_1 = __importDefault(require("axios"));
class JiraService {
    constructor() {
        this.isAuthenticatedFlag = false;
        this.config = this.loadConfiguration();
        this.axiosInstance = axios_1.default.create({
            baseURL: `${this.config.instanceUrl}/rest/api/3`,
            timeout: 30000,
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });
        this.setupInterceptors();
    }
    loadConfiguration() {
        const config = vscode.workspace.getConfiguration('aiDevAssistant');
        const instanceUrl = config.get('jira.instanceUrl');
        if (!instanceUrl) {
            throw new Error('Jira instance URL not configured. Please run "Configure Jira Connection" command.');
        }
        return {
            instanceUrl,
            // OAuth2 tokens will be loaded from secure storage
            accessToken: undefined,
            refreshToken: undefined,
            clientId: undefined,
            clientSecret: undefined
        };
    }
    setupInterceptors() {
        // Request interceptor to add authorization
        this.axiosInstance.interceptors.request.use(async (config) => {
            if (this.config.accessToken) {
                config.headers.Authorization = `Bearer ${this.config.accessToken}`;
            }
            return config;
        }, (error) => Promise.reject(error));
        // Response interceptor to handle token refresh
        this.axiosInstance.interceptors.response.use((response) => response, async (error) => {
            const originalRequest = error.config;
            if (error.response?.status === 401 && !originalRequest._retry) {
                originalRequest._retry = true;
                try {
                    await this.refreshAccessToken();
                    originalRequest.headers.Authorization = `Bearer ${this.config.accessToken}`;
                    return this.axiosInstance(originalRequest);
                }
                catch (refreshError) {
                    this.isAuthenticatedFlag = false;
                    await this.clearStoredTokens();
                    throw new Error('Authentication failed. Please re-authenticate with Jira.');
                }
            }
            return Promise.reject(error);
        });
    }
    async authenticate() {
        try {
            // First, try to load existing tokens from secure storage
            const storedTokens = await this.loadStoredTokens();
            if (storedTokens) {
                this.config.accessToken = storedTokens.accessToken;
                this.config.refreshToken = storedTokens.refreshToken;
                // Test the token
                if (await this.testAuthentication()) {
                    this.isAuthenticatedFlag = true;
                    return true;
                }
            }
            // If no valid tokens, start OAuth2 flow
            return await this.startOAuth2Flow();
        }
        catch (error) {
            console.error('Jira authentication failed:', error);
            if (error instanceof Error) {
                vscode.window.showErrorMessage(`Jira authentication failed: ${error.message}`);
            }
            else {
                vscode.window.showErrorMessage(`Jira authentication failed: ${String(error)}`);
            }
            return false;
        }
    }
    async startOAuth2Flow() {
        try {
            // Show configuration input for OAuth2 credentials
            const clientId = await vscode.window.showInputBox({
                prompt: 'Enter your Jira OAuth2 Client ID',
                ignoreFocusOut: true,
                password: false
            });
            if (!clientId) {
                throw new Error('Client ID is required');
            }
            const clientSecret = await vscode.window.showInputBox({
                prompt: 'Enter your Jira OAuth2 Client Secret',
                ignoreFocusOut: true,
                password: true
            });
            if (!clientSecret) {
                throw new Error('Client Secret is required');
            }
            this.config.clientId = clientId;
            this.config.clientSecret = clientSecret;
            // Generate OAuth2 authorization URL
            const authUrl = this.generateAuthUrl();
            // Open browser for user authorization
            vscode.env.openExternal(vscode.Uri.parse(authUrl));
            // Get authorization code from user
            const authCode = await vscode.window.showInputBox({
                prompt: 'Enter the authorization code from Jira',
                ignoreFocusOut: true
            });
            if (!authCode) {
                throw new Error('Authorization code is required');
            }
            // Exchange authorization code for tokens
            const tokens = await this.exchangeCodeForTokens(authCode);
            this.config.accessToken = tokens.access_token;
            this.config.refreshToken = tokens.refresh_token;
            // Store tokens securely
            await this.storeTokens(tokens);
            // Test authentication
            if (await this.testAuthentication()) {
                this.isAuthenticatedFlag = true;
                vscode.window.showInformationMessage('Successfully authenticated with Jira!');
                return true;
            }
            else {
                throw new Error('Authentication test failed');
            }
        }
        catch (error) {
            console.error('OAuth2 flow failed:', error);
            throw error;
        }
    }
    generateAuthUrl() {
        const params = new URLSearchParams({
            audience: 'api.atlassian.com',
            client_id: this.config.clientId,
            scope: 'read:jira-work read:jira-user write:jira-work offline_access',
            redirect_uri: 'urn:ietf:wg:oauth:2.0:oob',
            state: 'ai-dev-assistant',
            response_type: 'code',
            prompt: 'consent'
        });
        return `https://auth.atlassian.com/authorize?${params.toString()}`;
    }
    async exchangeCodeForTokens(authCode) {
        const tokenResponse = await axios_1.default.post('https://auth.atlassian.com/oauth/token', {
            grant_type: 'authorization_code',
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret,
            code: authCode,
            redirect_uri: 'urn:ietf:wg:oauth:2.0:oob'
        });
        return tokenResponse.data;
    }
    async refreshAccessToken() {
        if (!this.config.refreshToken) {
            throw new Error('No refresh token available');
        }
        const response = await axios_1.default.post('https://auth.atlassian.com/oauth/token', {
            grant_type: 'refresh_token',
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret,
            refresh_token: this.config.refreshToken
        });
        this.config.accessToken = response.data.access_token;
        if (response.data.refresh_token) {
            this.config.refreshToken = response.data.refresh_token;
        }
        await this.storeTokens(response.data);
    }
    async testAuthentication() {
        try {
            const response = await this.axiosInstance.get('/myself');
            return response.status === 200;
        }
        catch (error) {
            return false;
        }
    }
    async storeTokens(tokens) {
        const extensionContext = global.extensionContext;
        if (extensionContext) {
            await extensionContext.secrets.store('jira.accessToken', tokens.access_token);
            if (tokens.refresh_token) {
                await extensionContext.secrets.store('jira.refreshToken', tokens.refresh_token);
            }
        }
    }
    async loadStoredTokens() {
        const extensionContext = global.extensionContext;
        if (!extensionContext)
            return null;
        const accessToken = await extensionContext.secrets.get('jira.accessToken');
        const refreshToken = await extensionContext.secrets.get('jira.refreshToken');
        if (accessToken && refreshToken) {
            return { accessToken, refreshToken };
        }
        return null;
    }
    async clearStoredTokens() {
        const extensionContext = global.extensionContext;
        if (extensionContext) {
            await extensionContext.secrets.delete('jira.accessToken');
            await extensionContext.secrets.delete('jira.refreshToken');
        }
    }
    isAuthenticated() {
        return this.isAuthenticatedFlag && !!this.config.accessToken;
    }
    async getTasks(projectKey, assignee) {
        if (!this.isAuthenticated()) {
            throw new Error('Not authenticated with Jira');
        }
        try {
            let jql = 'order by created DESC';
            const conditions = [];
            if (projectKey) {
                conditions.push(`project = "${projectKey}"`);
            }
            if (assignee) {
                conditions.push(`assignee = "${assignee}"`);
            }
            if (conditions.length > 0) {
                jql = `${conditions.join(' AND ')} ORDER BY created DESC`;
            }
            const response = await this.axiosInstance.get('/search', {
                params: {
                    jql,
                    maxResults: 100,
                    fields: 'summary,description,status,assignee,priority,issuetype,project,created,updated,labels,components'
                }
            });
            return response.data.issues.map((issue) => this.mapJiraIssueToTask(issue));
        }
        catch (error) {
            if (error instanceof Error) {
                throw new Error(`Failed to fetch Jira tasks: ${error.message}`);
            }
            else {
                throw new Error(`Failed to fetch Jira tasks: ${String(error)}`);
            }
        }
    }
    async getTask(taskKey) {
        if (!this.isAuthenticated()) {
            throw new Error('Not authenticated with Jira');
        }
        try {
            const response = await this.axiosInstance.get(`/issue/${taskKey}`, {
                params: {
                    fields: 'summary,description,status,assignee,priority,issuetype,project,created,updated,labels,components'
                }
            });
            return this.mapJiraIssueToTask(response.data);
        }
        catch (error) {
            if (error instanceof Error) {
                throw new Error(`Failed to fetch Jira task ${taskKey}: ${error.message}`);
            }
            else {
                throw new Error(`Failed to fetch Jira task ${taskKey}: ${String(error)}`);
            }
        }
    }
    async updateTaskStatus(taskKey, status, comment) {
        if (!this.isAuthenticated()) {
            throw new Error('Not authenticated with Jira');
        }
        try {
            // Get available transitions
            const transitionsResponse = await this.axiosInstance.get(`/issue/${taskKey}/transitions`);
            const transition = transitionsResponse.data.transitions.find((t) => t.to.name.toLowerCase() === status.toLowerCase());
            if (!transition) {
                throw new Error(`Transition to status "${status}" not available`);
            }
            // Perform transition
            await this.axiosInstance.post(`/issue/${taskKey}/transitions`, {
                transition: { id: transition.id }
            });
            // Add comment if provided
            if (comment) {
                await this.addComment(taskKey, comment);
            }
            return true;
        }
        catch (error) {
            if (error instanceof Error) {
                throw new Error(`Failed to update task status: ${error.message}`);
            }
            else {
                throw new Error(`Failed to update task status: ${String(error)}`);
            }
        }
    }
    async addComment(taskKey, comment) {
        if (!this.isAuthenticated()) {
            throw new Error('Not authenticated with Jira');
        }
        try {
            await this.axiosInstance.post(`/issue/${taskKey}/comment`, {
                body: {
                    type: 'doc',
                    version: 1,
                    content: [
                        {
                            type: 'paragraph',
                            content: [
                                {
                                    type: 'text',
                                    text: comment
                                }
                            ]
                        }
                    ]
                }
            });
            return true;
        }
        catch (error) {
            if (error instanceof Error) {
                throw new Error(`Failed to add comment: ${error.message}`);
            }
            else {
                throw new Error(`Failed to add comment: ${String(error)}`);
            }
        }
    }
    async createSubtask(parentKey, summary, description) {
        if (!this.isAuthenticated()) {
            throw new Error('Not authenticated with Jira');
        }
        try {
            // Get parent issue to extract project info
            const parentIssue = await this.getTask(parentKey);
            const response = await this.axiosInstance.post('/issue', {
                fields: {
                    project: { key: parentIssue.projectKey },
                    parent: { key: parentKey },
                    summary,
                    description: {
                        type: 'doc',
                        version: 1,
                        content: [
                            {
                                type: 'paragraph',
                                content: [
                                    {
                                        type: 'text',
                                        text: description
                                    }
                                ]
                            }
                        ]
                    },
                    issuetype: { name: 'Sub-task' }
                }
            });
            return await this.getTask(response.data.key);
        }
        catch (error) {
            if (error instanceof Error) {
                throw new Error(`Failed to create subtask: ${error.message}`);
            }
            else {
                throw new Error(`Failed to create subtask: ${String(error)}`);
            }
        }
    }
    mapJiraIssueToTask(issue) {
        return {
            id: issue.id,
            key: issue.key,
            summary: issue.fields.summary,
            description: issue.fields.description?.content?.[0]?.content?.[0]?.text || '',
            status: issue.fields.status.name,
            assignee: issue.fields.assignee?.displayName,
            priority: issue.fields.priority.name,
            issueType: issue.fields.issuetype.name,
            projectKey: issue.fields.project.key,
            created: new Date(issue.fields.created),
            updated: new Date(issue.fields.updated),
            labels: issue.fields.labels || [],
            components: issue.fields.components?.map((c) => c.name) || []
        };
    }
}
exports.JiraService = JiraService;
//# sourceMappingURL=jiraService.js.map