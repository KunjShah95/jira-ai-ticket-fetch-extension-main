import * as vscode from 'vscode';
import { Logger } from './logger';

export interface RetryOptions {
    maxAttempts: number;
    baseDelay: number;
    maxDelay: number;
    backoffFactor: number;
    retryIf?: (error: any) => boolean;
}

export class ErrorHandler {
    private static instance: ErrorHandler;
    private logger: Logger;

    private constructor() {
        this.logger = Logger.getInstance();
    }

    public static getInstance(): ErrorHandler {
        if (!ErrorHandler.instance) {
            ErrorHandler.instance = new ErrorHandler();
        }
        return ErrorHandler.instance;
    }

    public async handleError(
        error: unknown,
        context: string,
        userMessage?: string,
        metadata?: Record<string, any>
    ): Promise<void> {
        const err = error instanceof Error ? error : new Error(String(error));

        this.logger.error(
            `Error in ${context}: ${err.message}`,
            context,
            err,
            metadata
        );

        const displayMessage = userMessage || this.getDefaultUserMessage(error);

        const action = await vscode.window.showErrorMessage(
            displayMessage,
            'View Logs',
            'Report Issue',
            'Retry'
        );

        if (action === 'View Logs') {
            this.logger.show?.();
        } else if (action === 'Report Issue') {
            await this.openIssueReporter(error, context, metadata);
        }
    }

    private getDefaultUserMessage(error: unknown): string {
        if (typeof error === 'object' && error !== null) {
            const err = error as any;

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

    private async openIssueReporter(error: unknown, context: string, metadata?: Record<string, any>): Promise<void> {
        let message = 'Unknown error';
        let stack: string | undefined;

        if (error instanceof Error) {
            message = error.message;
            stack = error.stack;
        } else {
            message = String(error);
        }

        const errorInfo = {
            error: message,
            stack,
            context,
            metadata,
            timestamp: new Date().toISOString(),
            vscodeVersion: vscode.version,
            extensionVersion:
                vscode.extensions.getExtension('your-publisher.ai-dev-assistant')?.packageJSON.version ?? 'unknown'
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

    public async withRetry<T>(
        operation: () => Promise<T>,
        options: Partial<RetryOptions> = {},
        context?: string
    ): Promise<T> {
        const defaultOptions: RetryOptions = {
            maxAttempts: 3,
            baseDelay: 1000,
            maxDelay: 10000,
            backoffFactor: 2,
            retryIf: (error) =>
                typeof error === 'object' && error !== null && (!('response' in error) || (error as any).response?.status >= 500)
        };

        const config = { ...defaultOptions, ...options };
        let lastError: unknown;

        for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;

                if (
                    attempt === config.maxAttempts ||
                    (config.retryIf && !config.retryIf(error))
                ) {
                    throw error;
                }

                const delay = Math.min(
                    config.baseDelay * Math.pow(config.backoffFactor, attempt - 1),
                    config.maxDelay
                );

                this.logger.warn(
                    `Operation failed, retrying in ${delay}ms (attempt ${attempt}/${config.maxAttempts})`,
                    context,
                    {
                        attempt,
                        delay,
                        error: error instanceof Error ? error.message : String(error)
                    }
                );

                await this.sleep(delay);
            }
        }

        throw lastError;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    public wrapAsync<T extends any[], R>(
        fn: (...args: T) => Promise<R>,
        context: string,
        userMessage?: string
    ): (...args: T) => Promise<R | undefined> {
        return async (...args: T): Promise<R | undefined> => {
            try {
                return await fn(...args);
            } catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                await this.handleError(err, context, userMessage, { args });
                return undefined;
            }
        };
    }

    public wrapSync<T extends any[], R>(
        fn: (...args: T) => R,
        context: string,
        userMessage?: string
    ): (...args: T) => R | undefined {
        return (...args: T): R | undefined => {
            try {
                return fn(...args);
            } catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                this.logger.error(
                    `Error in ${context}: ${err.message}`,
                    context,
                    err,
                    { args }
                );
                return undefined;
            }
        };
    }
}

// Utility function for easy access
export function getErrorHandler(): ErrorHandler {
    return ErrorHandler.getInstance();
}

// Decorator for automatic error handling
export function handleErrors(context: string, userMessage?: string) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value;
        const errorHandler = ErrorHandler.getInstance();

        descriptor.value = async function (...args: any[]) {
            try {
                return await originalMethod.apply(this, args);
            } catch (error) {
                await errorHandler.handleError(error, `${target.constructor.name}.${propertyKey}`, userMessage, { args });
                throw error;
            }
        };

        return descriptor;
    };
}
