import axios from 'axios';
import { createLogger } from '../utils/logger.js';

const logger = createLogger();

export class JiraService {
	constructor(accessToken = null) {
		this.accessToken = accessToken;
		this.baseUrl = process.env.JIRA_BASE_URL;
		this.clientId = process.env.JIRA_CLIENT_ID;
		this.clientSecret = process.env.JIRA_CLIENT_SECRET;
		this.callbackUrl = process.env.JIRA_CALLBACK_URL;
	}

	/**
	 * Generate OAuth2 authorization URL for Jira
	 */
	getAuthorizationUrl() {
		const params = new URLSearchParams({
			audience: 'api.atlassian.com',
			client_id: this.clientId,
			scope: 'read:jira-work read:jira-user write:jira-work manage:jira-project',
			redirect_uri: this.callbackUrl,
			state: Math.random().toString(36).substring(7), // Simple state for CSRF protection
			response_type: 'code',
			prompt: 'consent'
		});

		return `https://auth.atlassian.com/authorize?${params.toString()}`;
	}

	/**
	 * Exchange authorization code for access token
	 */
	async exchangeCodeForToken(code) {
		try {
			const response = await axios.post('https://auth.atlassian.com/oauth/token', {
				grant_type: 'authorization_code',
				client_id: this.clientId,
				client_secret: this.clientSecret,
				code,
				redirect_uri: this.callbackUrl
			}, {
				headers: {
					'Content-Type': 'application/json'
				}
			});

			return response.data;
		} catch (error) {
			logger.error('Failed to exchange code for token:', error.response?.data || error.message);
			throw new Error('Failed to authenticate with Jira');
		}
	}

	/**
	 * Refresh access token using refresh token
	 */
	async refreshAccessToken(refreshToken) {
		try {
			const response = await axios.post('https://auth.atlassian.com/oauth/token', {
				grant_type: 'refresh_token',
				client_id: this.clientId,
				client_secret: this.clientSecret,
				refresh_token: refreshToken
			}, {
				headers: {
					'Content-Type': 'application/json'
				}
			});

			return response.data;
		} catch (error) {
			logger.error('Failed to refresh token:', error.response?.data || error.message);
			throw new Error('Failed to refresh Jira token');
		}
	}

	/**
	 * Get HTTP client with authentication headers
	 */
	getAuthenticatedClient() {
		if (!this.accessToken) {
			throw new Error('No access token available. Please authenticate first.');
		}

		return axios.create({
			baseURL: `${this.baseUrl}/rest/api/3`,
			headers: {
				'Authorization': `Bearer ${this.accessToken}`,
				'Accept': 'application/json',
				'Content-Type': 'application/json'
			}
		});
	}

	/**
	 * Search for Jira issues using JQL
	 */
	async searchIssues(jql, options = {}) {
		const client = this.getAuthenticatedClient();

		const params = {
			jql,
			maxResults: options.maxResults || 50,
			startAt: options.startAt || 0,
			fields: options.fields || [
				'summary', 'status', 'assignee', 'reporter', 'priority',
				'issuetype', 'project', 'created', 'updated', 'description',
				'labels', 'components', 'customfield_*'
			]
		};

		try {
			const response = await client.get('/search', { params });
			return response.data;
		} catch (error) {
			logger.error('Failed to search Jira issues:', {
				jql,
				error: error.response?.data || error.message
			});
			throw new Error('Failed to search Jira issues');
		}
	}

	/**
	 * Get a specific Jira issue by key
	 */
	async getIssue(issueKey) {
		const client = this.getAuthenticatedClient();

		try {
			const response = await client.get(`/issue/${issueKey}`, {
				params: {
					expand: 'renderedFields,transitions,changelog',
					fields: '*all'
				}
			});

			return response.data;
		} catch (error) {
			logger.error('Failed to get Jira issue:', {
				issueKey,
				error: error.response?.data || error.message
			});
			throw error;
		}
	}

	/**
	 * Add a comment to a Jira issue
	 */
	async addComment(issueKey, comment) {
		const client = this.getAuthenticatedClient();

		try {
			const response = await client.post(`/issue/${issueKey}/comment`, comment);
			return response.data;
		} catch (error) {
			logger.error('Failed to add comment to Jira issue:', {
				issueKey,
				error: error.response?.data || error.message
			});
			throw new Error('Failed to add comment to Jira issue');
		}
	}

	/**
	 * Transition a Jira issue
	 */
	async transitionIssue(issueKey, transition) {
		const client = this.getAuthenticatedClient();

		try {
			const response = await client.post(`/issue/${issueKey}/transitions`, transition);
			return response.data;
		} catch (error) {
			logger.error('Failed to transition Jira issue:', {
				issueKey,
				transition,
				error: error.response?.data || error.message
			});
			throw new Error('Failed to transition Jira issue');
		}
	}

	/**
	 * Get available projects
	 */
	async getProjects() {
		const client = this.getAuthenticatedClient();

		try {
			const response = await client.get('/project', {
				params: {
					expand: 'description,lead,issueTypes,url,projectKeys'
				}
			});
			return response.data;
		} catch (error) {
			logger.error('Failed to get Jira projects:', {
				error: error.response?.data || error.message
			});
			throw new Error('Failed to get Jira projects');
		}
	}

	/**
	 * Get issue transitions
	 */
	async getTransitions(issueKey) {
		const client = this.getAuthenticatedClient();

		try {
			const response = await client.get(`/issue/${issueKey}/transitions`);
			return response.data.transitions;
		} catch (error) {
			logger.error('Failed to get issue transitions:', {
				issueKey,
				error: error.response?.data || error.message
			});
			throw new Error('Failed to get issue transitions');
		}
	}
}
