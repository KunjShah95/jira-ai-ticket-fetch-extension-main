import { createLogger } from '../utils/logger.js';

const logger = createLogger();

export const errorHandler = (err, req, res, next) => {
	logger.error('Error occurred:', {
		error: err.message,
		stack: err.stack,
		url: req.originalUrl,
		method: req.method,
		ip: req.ip,
		userAgent: req.get('User-Agent')
	});

	// Don't leak error details in production
	const isDevelopment = process.env.NODE_ENV === 'development';

	if (err.name === 'ValidationError') {
		return res.status(400).json({
			error: 'Validation Error',
			message: isDevelopment ? err.message : 'Invalid request data',
			...(isDevelopment && { details: err.details })
		});
	}

	if (err.name === 'UnauthorizedError') {
		return res.status(401).json({
			error: 'Unauthorized',
			message: 'Invalid or missing authentication token'
		});
	}

	if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
		return res.status(503).json({
			error: 'Service Unavailable',
			message: 'External service is currently unavailable'
		});
	}

	// Default server error
	res.status(err.status || 500).json({
		error: 'Internal Server Error',
		message: isDevelopment ? err.message : 'Something went wrong',
		...(isDevelopment && { stack: err.stack })
	});
};
