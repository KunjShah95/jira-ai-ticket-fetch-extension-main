"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiClient = exports.APIClient = exports.RetryManager = exports.RateLimitManager = void 0;
const logger_1 = require("../utils/logger");
class RateLimitManager {
    constructor() {
        this.limits = new Map();
        this.states = new Map();
        this.logger = logger_1.Logger.getInstance();
        this.initializeDefaultLimits();
    }
    initializeDefaultLimits() {
        // Default rate limits for various services
        this.limits.set('jira_api', { requests: 100, windowMs: 60000 }); // 100 requests per minute
        this.limits.set('openai_api', { requests: 60, windowMs: 60000 }); // 60 requests per minute
        this.limits.set('anthropic_api', { requests: 50, windowMs: 60000 }); // 50 requests per minute
        this.limits.set('github_api', { requests: 1000, windowMs: 3600000 }); // 1000 requests per hour
        this.limits.set('gitlab_api', { requests: 2000, windowMs: 3600000 }); // 2000 requests per hour
        this.limits.set('llm_generation', { requests: 10, windowMs: 60000 }); // 10 generations per minute
    }
    setLimit(key, config) {
        this.limits.set(key, config);
        this.logger.debug(`Set rate limit for ${key}: ${config.requests} requests per ${config.windowMs}ms`, 'RateLimitManager');
    }
    async checkLimit(key) {
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
            this.logger.warn(`Rate limit exceeded for ${key}. Limit: ${config.requests} requests per ${config.windowMs}ms. Try again in ${remainingTime}ms`, 'RateLimitManager');
            if (config.retryAfter) {
                await this.sleep(config.retryAfter);
                return this.checkLimit(key); // Retry after delay
            }
            return false;
        }
        state.requests++;
        return true;
    }
    async waitForAvailability(key) {
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
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    getRemainingRequests(key) {
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
    getTimeUntilReset(key) {
        const config = this.limits.get(key);
        const state = this.states.get(key);
        if (!config || !state) {
            return 0;
        }
        const now = Date.now();
        const windowEnd = state.windowStart + config.windowMs;
        return Math.max(0, windowEnd - now);
    }
    isLimited(key) {
        const state = this.states.get(key);
        return state?.isLimited ?? false;
    }
    reset(key) {
        this.states.delete(key);
        this.logger.debug(`Reset rate limit state for ${key}`, 'RateLimitManager');
    }
    resetAll() {
        this.states.clear();
        this.logger.debug('Reset all rate limit states', 'RateLimitManager');
    }
}
exports.RateLimitManager = RateLimitManager;
class RetryManager {
    constructor(rateLimitManager) {
        this.logger = logger_1.Logger.getInstance();
        this.rateLimitManager = rateLimitManager;
    }
    async withRetry(operation, options = {}, rateLimitKey) {
        const config = {
            maxAttempts: 3,
            baseDelay: 1000,
            maxDelay: 30000,
            backoffFactor: 2,
            jitter: true,
            retryCondition: this.defaultRetryCondition,
            ...options
        };
        let lastError;
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
            }
            catch (error) {
                lastError = error;
                // Check if we should retry
                if (attempt === config.maxAttempts || !config.retryCondition(error)) {
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
                this.logger.warn(`Attempt ${attempt}/${config.maxAttempts} failed, retrying in ${delay}ms`, 'RetryManager', { error: error instanceof Error ? error.message : String(error), attempt, delay });
                await this.sleep(delay);
            }
        }
        throw lastError;
    }
    defaultRetryCondition(error) {
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
    isRateLimitError(error) {
        return error.response?.status === 429 ||
            error.message?.toLowerCase().includes('rate limit') ||
            error.message?.toLowerCase().includes('too many requests');
    }
    calculateDelay(attempt, config) {
        let delay = config.baseDelay * Math.pow(config.backoffFactor, attempt - 1);
        delay = Math.min(delay, config.maxDelay);
        if (config.jitter) {
            // Add random jitter to prevent thundering herd
            delay = delay * (0.5 + Math.random() * 0.5);
        }
        return Math.round(delay);
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
exports.RetryManager = RetryManager;
// API wrapper that combines rate limiting and retry logic
class APIClient {
    constructor() {
        this.rateLimitManager = new RateLimitManager();
        this.retryManager = new RetryManager(this.rateLimitManager);
        this.logger = logger_1.Logger.getInstance();
    }
    async request(operation, rateLimitKey, retryOptions) {
        this.logger.debug(`Making API request with rate limit key: ${rateLimitKey}`, 'APIClient');
        return await this.retryManager.withRetry(operation, retryOptions, rateLimitKey);
    }
    setRateLimit(key, config) {
        this.rateLimitManager.setLimit(key, config);
    }
    getRemainingRequests(key) {
        return this.rateLimitManager.getRemainingRequests(key);
    }
    getTimeUntilReset(key) {
        return this.rateLimitManager.getTimeUntilReset(key);
    }
    isRateLimited(key) {
        return this.rateLimitManager.isLimited(key);
    }
    resetRateLimit(key) {
        this.rateLimitManager.reset(key);
    }
    dispose() {
        this.rateLimitManager.resetAll();
    }
}
exports.APIClient = APIClient;
// Export singleton instance
exports.apiClient = new APIClient();
//# sourceMappingURL=rateLimitManager.js.map