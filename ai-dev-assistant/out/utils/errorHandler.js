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
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleErrors = exports.getErrorHandler = exports.ErrorHandler = void 0;
const vscode = __importStar(require("vscode"));
const logger_1 = require("./logger");
class ErrorHandler {
    constructor() {
        this.logger = logger_1.Logger.getInstance();
    }
    static getInstance() {
        if (!ErrorHandler.instance) {
            ErrorHandler.instance = new ErrorHandler();
        }
        return ErrorHandler.instance;
    }
    async handleError(error, context, userMessage, metadata) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.logger.error(`Error in ${context}: ${err.message}`, context, err, metadata);
        const displayMessage = userMessage || this.getDefaultUserMessage(error);
        const action = await vscode.window.showErrorMessage(displayMessage, 'View Logs', 'Report Issue', 'Retry');
        if (action === 'View Logs') {
            this.logger.show?.();
        }
        else if (action === 'Report Issue') {
            await this.openIssueReporter(error, context, metadata);
        }
    }
    getDefaultUserMessage(error) {
        if (typeof error === 'object' && error !== null) {
            const err = error;
            if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
                return 'Network connection failed. Please check your internet connection and try again.';
            }
            if (err.response?.status === 401) {
                return 'Authentication failed. Please check your credentials and try again.';
            }
            if (err.response?.status === 403) {
                return 'Permission denied. Please check your access rights and try again.';
            }
            if (err.response?.status >= 500) {
                return 'Server error occurred. Please try again later.';
            }
        }
        return 'An unexpected error occurred. Please check the logs for more details.';
    }
    async openIssueReporter(error, context, metadata) {
        let message = 'Unknown error';
        let stack;
        if (error instanceof Error) {
            message = error.message;
            stack = error.stack;
        }
        else {
            message = String(error);
        }
        const errorInfo = {
            error: message,
            stack,
            context,
            metadata,
            timestamp: new Date().toISOString(),
            vscodeVersion: vscode.version,
            extensionVersion: vscode.extensions.getExtension('your-publisher.ai-dev-assistant')?.packageJSON.version ?? 'unknown'
        };
        const body = encodeURIComponent(`
**Error Report**

**Context:** ${context}
**Error:** ${errorInfo.error}
**Timestamp:** ${errorInfo.timestamp}
**VS Code Version:** ${errorInfo.vscodeVersion}
**Extension Version:** ${errorInfo.extensionVersion}

**Stack Trace:**
\`\`\`
${errorInfo.stack || 'No stack trace available'}
\`\`\`

**Additional Metadata:**
\`\`\`json
${JSON.stringify(errorInfo.metadata, null, 2)}
\`\`\`

**Steps to Reproduce:**
1.
2.
3.

**Expected Behavior:**

**Actual Behavior:**
`.trim());
        const url = `https://github.com/your-username/your-repo/issues/new?title=${encodeURIComponent(`Error in ${context}`)}&body=${body}`;
        await vscode.env.openExternal(vscode.Uri.parse(url));
    }
    async withRetry(operation, options = {}, context) {
        const defaultOptions = {
            maxAttempts: 3,
            baseDelay: 1000,
            maxDelay: 10000,
            backoffFactor: 2,
            retryIf: (error) => typeof error === 'object' && error !== null && (!('response' in error) || error.response?.status >= 500)
        };
        const config = { ...defaultOptions, ...options };
        let lastError;
        for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
            try {
                return await operation();
            }
            catch (error) {
                lastError = error;
                if (attempt === config.maxAttempts ||
                    (config.retryIf && !config.retryIf(error))) {
                    throw error;
                }
                const delay = Math.min(config.baseDelay * Math.pow(config.backoffFactor, attempt - 1), config.maxDelay);
                this.logger.warn(`Operation failed, retrying in ${delay}ms (attempt ${attempt}/${config.maxAttempts})`, context, {
                    attempt,
                    delay,
                    error: error instanceof Error ? error.message : String(error)
                });
                await this.sleep(delay);
            }
        }
        throw lastError;
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    wrapAsync(fn, context, userMessage) {
        return async (...args) => {
            try {
                return await fn(...args);
            }
            catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                await this.handleError(err, context, userMessage, { args });
                return undefined;
            }
        };
    }
    wrapSync(fn, context, userMessage) {
        return (...args) => {
            try {
                return fn(...args);
            }
            catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                this.logger.error(`Error in ${context}: ${err.message}`, context, err, { args });
                return undefined;
            }
        };
    }
}
exports.ErrorHandler = ErrorHandler;
// Utility function for easy access
function getErrorHandler() {
    return ErrorHandler.getInstance();
}
exports.getErrorHandler = getErrorHandler;
// Decorator for automatic error handling
function handleErrors(context, userMessage) {
    return function (target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        const errorHandler = ErrorHandler.getInstance();
        descriptor.value = async function (...args) {
            try {
                return await originalMethod.apply(this, args);
            }
            catch (error) {
                await errorHandler.handleError(error, `${target.constructor.name}.${propertyKey}`, userMessage, { args });
                throw error;
            }
        };
        return descriptor;
    };
}
exports.handleErrors = handleErrors;
//# sourceMappingURL=errorHandler.js.map