import express from 'express';
import { body, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import { JiraService } from '../services/JiraService.js';
import { createLogger } from '../utils/logger.js';

const router = express.Router();
const logger = createLogger();

/**
 * GET /api/jira/tickets
 * Fetch Jira tickets with optional filtering
 */
router.get('/tickets', authenticateToken, async (req, res, next) => {
	try {
		const jiraService = new JiraService(req.user.jiraAccessToken);
		const {
			assignee,
			status,
			project,
			issueType,
			maxResults = 50,
			startAt = 0
		} = req.query;

		// Build JQL query
		let jql = 'ORDER BY updated DESC';
		const conditions = [];

		if (assignee) {
			conditions.push(`assignee = "${assignee}"`);
		}
		if (status) {
			conditions.push(`status = "${status}"`);
		}
		if (project) {
			conditions.push(`project = "${project}"`);
		}
		if (issueType) {
			conditions.push(`issueType = "${issueType}"`);
		}

		if (conditions.length > 0) {
			jql = conditions.join(' AND ') + ' ' + jql;
		}

		logger.info('Fetching Jira tickets', {
			jql,
			maxResults,
			startAt,
			userId: req.user.jiraAccountId
		});

		const tickets = await jiraService.searchIssues(jql, {
			maxResults: parseInt(maxResults),
			startAt: parseInt(startAt)
		});

		res.json({
			success: true,
			data: tickets,
			metadata: {
				total: tickets.total,
				startAt: tickets.startAt,
				maxResults: tickets.maxResults,
				jql
			}
		});
	} catch (error) {
		logger.error('Failed to fetch Jira tickets', { error: error.message });
		next(error);
	}
});

/**
 * GET /api/jira/tickets/:ticketKey
 * Fetch a specific Jira ticket by key
 */
router.get('/tickets/:ticketKey', authenticateToken, async (req, res, next) => {
	try {
		const { ticketKey } = req.params;
		const jiraService = new JiraService(req.user.jiraAccessToken);

		logger.info('Fetching Jira ticket', {
			ticketKey,
			userId: req.user.jiraAccountId
		});

		const ticket = await jiraService.getIssue(ticketKey);

		res.json({
			success: true,
			data: ticket,
			metadata: {
				ticketKey,
				fetchedAt: new Date().toISOString()
			}
		});
	} catch (error) {
		if (error.response?.status === 404) {
			return res.status(404).json({
				error: 'Ticket not found',
				message: `Jira ticket ${req.params.ticketKey} was not found or you don't have permission to view it`
			});
		}

		logger.error('Failed to fetch Jira ticket', {
			ticketKey: req.params.ticketKey,
			error: error.message
		});
		next(error);
	}
});

/**
 * POST /api/jira/tickets/:ticketKey/comments
 * Add a comment to a Jira ticket
 */
router.post('/tickets/:ticketKey/comments',
	authenticateToken,
	[
		body('comment').notEmpty().withMessage('Comment content is required'),
		body('visibility').optional().isObject().withMessage('Visibility must be an object')
	],
	async (req, res, next) => {
		try {
			const errors = validationResult(req);
			if (!errors.isEmpty()) {
				return res.status(400).json({
					error: 'Validation Error',
					details: errors.array()
				});
			}

			const { ticketKey } = req.params;
			const { comment, visibility } = req.body;
			const jiraService = new JiraService(req.user.jiraAccessToken);

			logger.info('Adding comment to Jira ticket', {
				ticketKey,
				commentLength: comment.length,
				userId: req.user.jiraAccountId
			});

			const result = await jiraService.addComment(ticketKey, {
				body: comment,
				visibility
			});

			res.json({
				success: true,
				data: result,
				message: 'Comment added successfully',
				metadata: {
					ticketKey,
					commentId: result.id
				}
			});
		} catch (error) {
			logger.error('Failed to add comment to Jira ticket', {
				ticketKey: req.params.ticketKey,
				error: error.message
			});
			next(error);
		}
	}
);

/**
 * PUT /api/jira/tickets/:ticketKey/transition
 * Transition a Jira ticket to a new status
 */
router.put('/tickets/:ticketKey/transition',
	authenticateToken,
	[
		body('transition').notEmpty().withMessage('Transition ID or name is required'),
		body('comment').optional().isString().withMessage('Comment must be a string')
	],
	async (req, res, next) => {
		try {
			const errors = validationResult(req);
			if (!errors.isEmpty()) {
				return res.status(400).json({
					error: 'Validation Error',
					details: errors.array()
				});
			}

			const { ticketKey } = req.params;
			const { transition, comment, fields } = req.body;
			const jiraService = new JiraService(req.user.jiraAccessToken);

			logger.info('Transitioning Jira ticket', {
				ticketKey,
				transition,
				userId: req.user.jiraAccountId
			});

			const result = await jiraService.transitionIssue(ticketKey, {
				transition: { id: transition },
				update: comment ? {
					comment: [{
						add: { body: comment }
					}]
				} : undefined,
				fields
			});

			res.json({
				success: true,
				data: result,
				message: `Ticket ${ticketKey} transitioned successfully`,
				metadata: {
					ticketKey,
					transition
				}
			});
		} catch (error) {
			logger.error('Failed to transition Jira ticket', {
				ticketKey: req.params.ticketKey,
				error: error.message
			});
			next(error);
		}
	}
);

/**
 * GET /api/jira/projects
 * Fetch accessible Jira projects
 */
router.get('/projects', authenticateToken, async (req, res, next) => {
	try {
		const jiraService = new JiraService(req.user.jiraAccessToken);

		logger.info('Fetching Jira projects', {
			userId: req.user.jiraAccountId
		});

		const projects = await jiraService.getProjects();

		res.json({
			success: true,
			data: projects,
			metadata: {
				count: projects.length,
				fetchedAt: new Date().toISOString()
			}
		});
	} catch (error) {
		logger.error('Failed to fetch Jira projects', { error: error.message });
		next(error);
	}
});

export { router as jiraRoutes };
