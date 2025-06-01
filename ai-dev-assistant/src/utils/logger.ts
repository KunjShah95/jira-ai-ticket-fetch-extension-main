import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export enum LogLevel {
	ERROR = 0,
	WARN = 1,
	INFO = 2,
	DEBUG = 3
}

export interface LogEntry {
	timestamp: Date;
	level: LogLevel;
	message: string;
	context?: string;
	error?: Error;
	metadata?: Record<string, any>;
}

export class Logger {
	private static instance: Logger;
	private outputChannel: vscode.OutputChannel;
	private logLevel: LogLevel = LogLevel.INFO;
	private logToFile: boolean = false;
	private logFilePath?: string;

	private constructor() {
		this.outputChannel = vscode.window.createOutputChannel('AI Dev Assistant');
		this.initializeLogger();
	}

	public static getInstance(): Logger {
		if (!Logger.instance) {
			Logger.instance = new Logger();
		}
		return Logger.instance;
	}

	private initializeLogger(): void {
		const config = vscode.workspace.getConfiguration('aiDevAssistant.logging');
		this.logLevel = this.parseLogLevel(config.get('level', 'info'));
		this.logToFile = config.get('toFile', false);

		if (this.logToFile) {
			const extensionPath = (global as any).extensionContext?.extensionPath;
			if (extensionPath) {
				this.logFilePath = path.join(extensionPath, 'logs', 'ai-dev-assistant.log');
				this.ensureLogDirectory();
			}
		}
	}

	private parseLogLevel(level: string): LogLevel {
		switch (level.toLowerCase()) {
			case 'error': return LogLevel.ERROR;
			case 'warn': return LogLevel.WARN;
			case 'info': return LogLevel.INFO;
			case 'debug': return LogLevel.DEBUG;
			default: return LogLevel.INFO;
		}
	}

	private ensureLogDirectory(): void {
		if (this.logFilePath) {
			const logDir = path.dirname(this.logFilePath);
			if (!fs.existsSync(logDir)) {
				fs.mkdirSync(logDir, { recursive: true });
			}
		}
	}

	private shouldLog(level: LogLevel): boolean {
		return level <= this.logLevel;
	}

	private formatLogEntry(entry: LogEntry): string {
		const timestamp = entry.timestamp.toISOString();
		const levelStr = LogLevel[entry.level];
		const context = entry.context ? `[${entry.context}]` : '';
		const metadata = entry.metadata ? ` - ${JSON.stringify(entry.metadata)}` : '';
		const errorStr = entry.error ? `\nError: ${entry.error.message}\nStack: ${entry.error.stack}` : '';

		return `${timestamp} ${levelStr} ${context} ${entry.message}${metadata}${errorStr}`;
	}

	private writeToFile(entry: LogEntry): void {
		if (this.logToFile && this.logFilePath) {
			try {
				const logLine = this.formatLogEntry(entry) + '\n';
				fs.appendFileSync(this.logFilePath, logLine);
			} catch (error) {
				console.error('Failed to write to log file:', error);
			}
		}
	}

	private log(level: LogLevel, message: string, context?: string, error?: Error, metadata?: Record<string, any>): void {
		if (!this.shouldLog(level)) {
			return;
		}

		const entry: LogEntry = {
			timestamp: new Date(),
			level,
			message,
			context,
			error,
			metadata
		};

		const formattedMessage = this.formatLogEntry(entry);

		// Output to VS Code output channel
		this.outputChannel.appendLine(formattedMessage);

		// Output to file if enabled
		this.writeToFile(entry);

		// Also log to console for development
		const consoleMethod = level === LogLevel.ERROR ? console.error :
			level === LogLevel.WARN ? console.warn :
				console.log;
		consoleMethod(formattedMessage);
	}

	public error(message: string, context?: string, error?: Error, metadata?: Record<string, any>): void {
		this.log(LogLevel.ERROR, message, context, error, metadata);
	}

	public warn(message: string, context?: string, metadata?: Record<string, any>): void {
		this.log(LogLevel.WARN, message, context, undefined, metadata);
	}

	public info(message: string, context?: string, metadata?: Record<string, any>): void {
		this.log(LogLevel.INFO, message, context, undefined, metadata);
	}

	public debug(message: string, context?: string, metadata?: Record<string, any>): void {
		this.log(LogLevel.DEBUG, message, context, undefined, metadata);
	}

	public show(): void {
		this.outputChannel.show();
	}

	public clear(): void {
		this.outputChannel.clear();
	}

	public setLogLevel(level: LogLevel): void {
		this.logLevel = level;
	}

	public dispose(): void {
		this.outputChannel.dispose();
	}
}
