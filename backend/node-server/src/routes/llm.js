import express from 'express';
import { body, validationResult } from 'express-validator';
import axios from 'axios';
import { authenticateToken } from '../middleware/auth.js';
import { createLogger } from '../utils/logger.js';

const router = express.Router();
const logger = createLogger();

/**
 * POST /api/llm/generate
 * Send Jira ticket data to FastAPI server for LLM processing
 */
router.post('/generate',
	authenticateToken,
	[
		body('ticketData').notEmpty().withMessage('Ticket data is required'),
		body('ticketData.key').notEmpty().withMessage('Jira ticket key is required'),
		body('ticketData.summary').notEmpty().withMessage('Ticket summary is required'),
		body('options.generateTests').optional().isBoolean().withMessage('generateTests must be boolean'),
		body('options.codeStyle').optional().isString().withMessage('codeStyle must be string'),
		body('options.framework').optional().isString().withMessage('framework must be string')
	],
	async (req, res, next) => {
		try {
			// Validate request
			const errors = validationResult(req);
			if (!errors.isEmpty()) {
				return res.status(400).json({
					error: 'Validation Error',
					details: errors.array()
				});
			}

			const { ticketData, options = {} } = req.body;
			const userId = req.user.jiraAccountId;

			logger.info('Initiating LLM code generation', {
				ticketKey: ticketData.key,
				userId,
				hasOptions: Object.keys(options).length > 0
			});

			// Prepare payload for FastAPI server
			const payload = {
				ticket_data: {
					key: ticketData.key,
					summary: ticketData.summary,
					description: ticketData.description || '',
					issue_type: ticketData.issueType || 'Task',
					priority: ticketData.priority || 'Medium',
					status: ticketData.status || 'To Do',
					assignee: ticketData.assignee || null,
					reporter: ticketData.reporter || null,
					labels: ticketData.labels || [],
					components: ticketData.components || [],
					custom_fields: ticketData.customFields || {}
				},
				generation_options: {
					generate_tests: options.generateTests !== false, // Default to true
					code_style: options.codeStyle || 'typescript',
					framework: options.framework || 'react',
					test_framework: options.testFramework || 'jest',
					include_documentation: options.includeDocumentation !== false,
					max_file_size: options.maxFileSize || 1000, // lines
					...options
				},
				user_context: {
					user_id: userId,
					timestamp: new Date().toISOString(),
					session_id: req.user.timestamp
				}
			};

			// Call FastAPI server
			const pythonServerUrl = process.env.PYTHON_SERVER_URL || 'http://localhost:8000';

			logger.info('Sending request to Python server', {
				url: `${pythonServerUrl}/api/v1/generate`,
				ticketKey: ticketData.key
			});

			const response = await axios.post(
				`${pythonServerUrl}/api/v1/generate`,
				payload,
				{
					headers: {
						'Content-Type': 'application/json',
						'X-Request-ID': `${userId}-${Date.now()}`,
						'User-Agent': 'VoidEditor-NodeServer/1.0'
					},
					timeout: 300000 // 5 minutes timeout for LLM processing
				}
			);

			logger.info('LLM generation completed', {
				ticketKey: ticketData.key,
				responseStatus: response.status,
				generatedFiles: response.data.generated_files?.length || 0
			});

			// Return the response from FastAPI
			res.json({
				success: true,
				message: 'Code generation completed successfully',
				data: response.data,
				metadata: {
					ticket_key: ticketData.key,
					generated_at: new Date().toISOString(),
					processing_time_ms: response.data.processing_time_ms
				}
			});

		} catch (error) {
			logger.error('LLM generation failed', {
				error: error.message,
				ticketKey: req.body?.ticketData?.key,
				pythonServerUrl: process.env.PYTHON_SERVER_URL
			});

			if (error.code === 'ECONNREFUSED') {
				return res.status(503).json({
					error: 'Python server unavailable',
					message: 'The AI processing server is currently unavailable. Please try again later.',
					details: 'Cannot connect to FastAPI server'
				});
			}

			if (error.response) {
				// FastAPI returned an error
				return res.status(error.response.status).json({
					error: 'LLM processing failed',
					message: error.response.data?.detail || 'AI processing encountered an error',
					details: error.response.data
				});
			}

			next(error);
		}
	}
);

/**
 * GET /api/llm/status
 * Check FastAPI server status
 */
router.get('/status', async (req, res, next) => {
	try {
		const pythonServerUrl = process.env.PYTHON_SERVER_URL || 'http://localhost:8000';

		const response = await axios.get(`${pythonServerUrl}/health`, {
			timeout: 5000
		});

		res.json({
			success: true,
			python_server: {
				status: 'healthy',
				url: pythonServerUrl,
				response: response.data
			}
		});
	} catch (error) {
		logger.warn('Python server health check failed', {
			error: error.message,
			url: process.env.PYTHON_SERVER_URL
		});

		res.status(503).json({
			success: false,
			python_server: {
				status: 'unhealthy',
				url: process.env.PYTHON_SERVER_URL,
				error: error.message
			}
		});
	}
});

export { router as llmRoutes };
