import jwt from 'jsonwebtoken';
import { createLogger } from '../utils/logger.js';

const logger = createLogger();

export const authenticateToken = (req, res, next) => {
	const authHeader = req.headers['authorization'];
	const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

	if (!token) {
		return res.status(401).json({
			error: 'Access token required',
			message: 'Please provide a valid authentication token'
		});
	}

	jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
		if (err) {
			logger.warn('Invalid token attempt:', { token: token.substring(0, 10) + '...', err: err.message });
			return res.status(403).json({
				error: 'Invalid token',
				message: 'The provided token is invalid or expired'
			});
		}

		req.user = user;
		next();
	});
};

export const optionalAuth = (req, res, next) => {
	const authHeader = req.headers['authorization'];
	const token = authHeader && authHeader.split(' ')[1];

	if (!token) {
		req.user = null;
		return next();
	}

	jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
		if (err) {
			req.user = null;
		} else {
			req.user = user;
		}
		next();
	});
};
