import * as vscode from 'vscode';
import { Logger } from '../utils/logger';

export interface RateLimitConfig {
	requests: number;
	windowMs: number;
	retryAfter?: number;
}

export interface RateLimitState {
	requests: number;
	windowStart: number;
	isLimited: boolean;
}

export class RateLimitManager {
	private limits: Map<string, RateLimitConfig> = new Map();
	private states: Map<string, RateLimitState> = new Map();
	private logger: Logger;

	constructor() {
		this.logger = Logger.getInstance();
		this.initializeDefaultLimits();
	}

	private initializeDefaultLimits(): void {
		// Default rate limits for various services
		this.limits.set('jira_api', { requests: 100, windowMs: 60000 }); // 100 requests per minute
		this.limits.set('openai_api', { requests: 60, windowMs: 60000 }); // 60 requests per minute
		this.limits.set('anthropic_api', { requests: 50, windowMs: 60000 }); // 50 requests per minute
		this.limits.set('github_api', { requests: 1000, windowMs: 3600000 }); // 1000 requests per hour
		this.limits.set('gitlab_api', { requests: 2000, windowMs: 3600000 }); // 2000 requests per hour
		this.limits.set('llm_generation', { requests: 10, windowMs: 60000 }); // 10 generations per minute
	}

	public setLimit(key: string, config: RateLimitConfig): void {
		this.limits.set(key, config);
		this.logger.debug(`Set rate limit for ${key}: ${config.requests} requests per ${config.windowMs}ms`, 'RateLimitManager');
	}

	public async checkLimit(key: string): Promise<boolean> {
		const config = this.limits.get(key);
		if (!config) {
			return true; // No limit configured
		}

		const now = Date.now();
		let state = this.states.get(key);

		if (!state) {
			state = {
				requests: 0,
				windowStart: now,
				isLimited: false
			};
			this.states.set(key, state);
		}

		// Reset window if expired
		if (now - state.windowStart >= config.windowMs) {
			state.requests = 0;
			state.windowStart = now;
			state.isLimited = false;
		}

		// Check if limit would be exceeded
		if (state.requests >= config.requests) {
			state.isLimited = true;
			const remainingTime = config.windowMs - (now - state.windowStart);

			this.logger.warn(
				`Rate limit exceeded for ${key}. Limit: ${config.requests} requests per ${config.windowMs}ms. Try again in ${remainingTime}ms`,
				'RateLimitManager'
			);

			if (config.retryAfter) {
				await this.sleep(config.retryAfter);
				return this.checkLimit(key); // Retry after delay
			}

			return false;
		}

		state.requests++;
		return true;
	}

	public async waitForAvailability(key: string): Promise<void> {
		const config = this.limits.get(key);
		const state = this.states.get(key);

		if (!config || !state || !state.isLimited) {
			return;
		}

		const now = Date.now();
		const remainingTime = config.windowMs - (now - state.windowStart);

		if (remainingTime > 0) {
			this.logger.info(`Waiting ${remainingTime}ms for rate limit reset on ${key}`, 'RateLimitManager');
			await this.sleep(remainingTime);
		}
	}

	private sleep(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	public getRemainingRequests(key: string): number {
		const config = this.limits.get(key);
		const state = this.states.get(key);

		if (!config || !state) {
			return Infinity;
		}

		const now = Date.now();
		if (now - state.windowStart >= config.windowMs) {
			return config.requests; // Window has reset
		}

		return Math.max(0, config.requests - state.requests);
	}

	public getTimeUntilReset(key: string): number {
		const config = this.limits.get(key);
		const state = this.states.get(key);

		if (!config || !state) {
			return 0;
		}

		const now = Date.now();
		const windowEnd = state.windowStart + config.windowMs;
		return Math.max(0, windowEnd - now);
	}

	public isLimited(key: string): boolean {
		const state = this.states.get(key);
		return state?.isLimited ?? false;
	}

	public reset(key: string): void {
		this.states.delete(key);
		this.logger.debug(`Reset rate limit state for ${key}`, 'RateLimitManager');
	}

	public resetAll(): void {
		this.states.clear();
		this.logger.debug('Reset all rate limit states', 'RateLimitManager');
	}
}

export interface RetryOptions {
	maxAttempts: number;
	baseDelay: number;
	maxDelay: number;
	backoffFactor: number;
	jitter: boolean;
	retryCondition?: (error: any) => boolean;
}

export class RetryManager {
	private logger: Logger;
	private rateLimitManager: RateLimitManager;

	constructor(rateLimitManager: RateLimitManager) {
		this.logger = Logger.getInstance();
		this.rateLimitManager = rateLimitManager;
	}

	public async withRetry<T>(
		operation: () => Promise<T>,
		options: Partial<RetryOptions> = {},
		rateLimitKey?: string
	): Promise<T> {
		const config: RetryOptions = {
			maxAttempts: 3,
			baseDelay: 1000,
			maxDelay: 30000,
			backoffFactor: 2,
			jitter: true,
			retryCondition: this.defaultRetryCondition,
			...options
		};

		let lastError: any;

		for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
			try {
				// Check rate limit before attempting
				if (rateLimitKey) {
					const canProceed = await this.rateLimitManager.checkLimit(rateLimitKey);
					if (!canProceed) {
						await this.rateLimitManager.waitForAvailability(rateLimitKey);
					}
				}

				return await operation();
			} catch (error) {
				lastError = error;

				// Check if we should retry
				if (attempt === config.maxAttempts || !config.retryCondition!(error)) {
					break;
				}

				// Handle rate limit errors specially
				if (this.isRateLimitError(error) && rateLimitKey) {
					this.logger.warn(`Rate limit hit for ${rateLimitKey}, waiting before retry`, 'RetryManager');
					await this.rateLimitManager.waitForAvailability(rateLimitKey);
					continue; // Don't add extra delay for rate limit errors
				}

				// Calculate delay with exponential backoff
				const delay = this.calculateDelay(attempt, config);

				this.logger.warn(
					`Attempt ${attempt}/${config.maxAttempts} failed, retrying in ${delay}ms`,
					'RetryManager',
					{ error: error instanceof Error ? error.message : String(error), attempt, delay }
				);

				await this.sleep(delay);
			}
		}

		throw lastError;
	}

	private defaultRetryCondition(error: any): boolean {
		// Retry on network errors, timeouts, and server errors
		if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
			return true;
		}

		// Retry on HTTP 5xx errors
		if (error.response?.status >= 500) {
			return true;
		}

		// Retry on rate limit errors
		if (error.response?.status === 429) {
			return true;
		}

		// Don't retry on client errors (4xx except 429)
		if (error.response?.status >= 400 && error.response?.status < 500 && error.response?.status !== 429) {
			return false;
		}

		return true;
	}

	private isRateLimitError(error: any): boolean {
		return error.response?.status === 429 ||
			error.message?.toLowerCase().includes('rate limit') ||
			error.message?.toLowerCase().includes('too many requests');
	}

	private calculateDelay(attempt: number, config: RetryOptions): number {
		let delay = config.baseDelay * Math.pow(config.backoffFactor, attempt - 1);
		delay = Math.min(delay, config.maxDelay);

		if (config.jitter) {
			// Add random jitter to prevent thundering herd
			delay = delay * (0.5 + Math.random() * 0.5);
		}

		return Math.round(delay);
	}

	private sleep(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}
}

// API wrapper that combines rate limiting and retry logic
export class APIClient {
	private rateLimitManager: RateLimitManager;
	private retryManager: RetryManager;
	private logger: Logger;

	constructor() {
		this.rateLimitManager = new RateLimitManager();
		this.retryManager = new RetryManager(this.rateLimitManager);
		this.logger = Logger.getInstance();
	}

	public async request<T>(
		operation: () => Promise<T>,
		rateLimitKey: string,
		retryOptions?: Partial<RetryOptions>
	): Promise<T> {
		this.logger.debug(`Making API request with rate limit key: ${rateLimitKey}`, 'APIClient');

		return await this.retryManager.withRetry(
			operation,
			retryOptions,
			rateLimitKey
		);
	}

	public setRateLimit(key: string, config: RateLimitConfig): void {
		this.rateLimitManager.setLimit(key, config);
	}

	public getRemainingRequests(key: string): number {
		return this.rateLimitManager.getRemainingRequests(key);
	}

	public getTimeUntilReset(key: string): number {
		return this.rateLimitManager.getTimeUntilReset(key);
	}

	public isRateLimited(key: string): boolean {
		return this.rateLimitManager.isLimited(key);
	}

	public resetRateLimit(key: string): void {
		this.rateLimitManager.reset(key);
	}

	public dispose(): void {
		this.rateLimitManager.resetAll();
	}
}

// Export singleton instance
export const apiClient = new APIClient();
