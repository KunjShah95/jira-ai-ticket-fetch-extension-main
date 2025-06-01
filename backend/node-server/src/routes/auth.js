import express from 'express';
import jwt from 'jsonwebtoken';
import { createLogger } from '../utils/logger.js';
import { JiraService } from '../services/JiraService.js';

const router = express.Router();
const logger = createLogger();
const jiraService = new JiraService();

/**
 * GET /api/auth/jira
 * Initiate OAuth2 flow with Jira
 */
router.get('/jira', async (req, res, next) => {
	try {
		const authUrl = jiraService.getAuthorizationUrl();

		logger.info('Initiating Jira OAuth flow');

		res.json({
			success: true,
			authUrl,
			message: 'Visit the authorization URL to connect your Jira account'
		});
	} catch (error) {
		next(error);
	}
});

/**
 * GET /api/auth/jira/callback
 * Handle OAuth2 callback from Jira
 */
router.get('/jira/callback', async (req, res, next) => {
	try {
		const { code, state } = req.query;

		if (!code) {
			return res.status(400).json({
				error: 'Authorization failed',
				message: 'No authorization code received from Jira'
			});
		}

		// Exchange code for access token
		const tokenData = await jiraService.exchangeCodeForToken(code);

		// Create JWT token for our application
		const userPayload = {
			jiraAccessToken: tokenData.access_token,
			jiraRefreshToken: tokenData.refresh_token,
			jiraAccountId: tokenData.account_id,
			timestamp: Date.now()
		};

		const appToken = jwt.sign(userPayload, process.env.JWT_SECRET, {
			expiresIn: '24h'
		});

		logger.info('Jira OAuth successful', {
			accountId: tokenData.account_id
		});

		// In a real app, you'd redirect to your frontend with the token
		res.json({
			success: true,
			token: appToken,
			message: 'Jira authentication successful',
			accountId: tokenData.account_id
		});
	} catch (error) {
		logger.error('Jira OAuth callback error:', error);
		next(error);
	}
});

/**
 * POST /api/auth/refresh
 * Refresh expired Jira access token
 */
router.post('/refresh', async (req, res, next) => {
	try {
		const { refreshToken } = req.body;

		if (!refreshToken) {
			return res.status(400).json({
				error: 'Refresh token required',
				message: 'Please provide a valid refresh token'
			});
		}

		const newTokenData = await jiraService.refreshAccessToken(refreshToken);

		const userPayload = {
			jiraAccessToken: newTokenData.access_token,
			jiraRefreshToken: newTokenData.refresh_token,
			jiraAccountId: newTokenData.account_id,
			timestamp: Date.now()
		};

		const appToken = jwt.sign(userPayload, process.env.JWT_SECRET, {
			expiresIn: '24h'
		});

		res.json({
			success: true,
			token: appToken,
			message: 'Token refreshed successfully'
		});
	} catch (error) {
		next(error);
	}
});

/**
 * GET /api/auth/status
 * Check authentication status
 */
router.get('/status', (req, res) => {
	const authHeader = req.headers['authorization'];
	const token = authHeader && authHeader.split(' ')[1];

	if (!token) {
		return res.json({
			authenticated: false,
			message: 'No authentication token provided'
		});
	}

	jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
		if (err) {
			return res.json({
				authenticated: false,
				message: 'Invalid or expired token'
			});
		}

		res.json({
			authenticated: true,
			user: {
				accountId: user.jiraAccountId,
				tokenTimestamp: user.timestamp
			},
			message: 'User is authenticated'
		});
	});
});

export { router as authRoutes };
