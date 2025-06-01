import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { createLogger } from './utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authRoutes } from './routes/auth.js';
import { jiraRoutes } from './routes/jira.js';
import { llmRoutes } from './routes/llm.js';
import { githubRoutes } from './routes/github.js';

// Load environment variables
dotenv.config();

const app = express();
const logger = createLogger();
const PORT = process.env.PORT || 3000;

// Rate limiting
const limiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 100, // limit each IP to 100 requests per windowMs
	message: 'Too many requests from this IP, please try again later.',
});

// Middleware
app.use(helmet());
app.use(cors({
	origin: process.env.NODE_ENV === 'production'
		? ['http://localhost:3001', 'https://your-frontend-domain.com']
		: true,
	credentials: true
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(limiter);

// Health check endpoint
app.get('/health', (req, res) => {
	res.status(200).json({
		status: 'healthy',
		timestamp: new Date().toISOString(),
		service: 'void-editor-node-server'
	});
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/jira', jiraRoutes);
app.use('/api/llm', llmRoutes);
app.use('/api/github', githubRoutes);

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
	res.status(404).json({
		error: 'Route not found',
		message: `Cannot ${req.method} ${req.originalUrl}`
	});
});

// Start server
app.listen(PORT, () => {
	logger.info(`🚀 Void Editor Node.js Server running on port ${PORT}`);
	logger.info(`Environment: ${process.env.NODE_ENV}`);
});

export default app;
