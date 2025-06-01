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
exports.Logger = exports.LogLevel = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["ERROR"] = 0] = "ERROR";
    LogLevel[LogLevel["WARN"] = 1] = "WARN";
    LogLevel[LogLevel["INFO"] = 2] = "INFO";
    LogLevel[LogLevel["DEBUG"] = 3] = "DEBUG";
})(LogLevel = exports.LogLevel || (exports.LogLevel = {}));
class Logger {
    constructor() {
        this.logLevel = LogLevel.INFO;
        this.logToFile = false;
        this.outputChannel = vscode.window.createOutputChannel('AI Dev Assistant');
        this.initializeLogger();
    }
    static getInstance() {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }
    initializeLogger() {
        const config = vscode.workspace.getConfiguration('aiDevAssistant.logging');
        this.logLevel = this.parseLogLevel(config.get('level', 'info'));
        this.logToFile = config.get('toFile', false);
        if (this.logToFile) {
            const extensionPath = global.extensionContext?.extensionPath;
            if (extensionPath) {
                this.logFilePath = path.join(extensionPath, 'logs', 'ai-dev-assistant.log');
                this.ensureLogDirectory();
            }
        }
    }
    parseLogLevel(level) {
        switch (level.toLowerCase()) {
            case 'error': return LogLevel.ERROR;
            case 'warn': return LogLevel.WARN;
            case 'info': return LogLevel.INFO;
            case 'debug': return LogLevel.DEBUG;
            default: return LogLevel.INFO;
        }
    }
    ensureLogDirectory() {
        if (this.logFilePath) {
            const logDir = path.dirname(this.logFilePath);
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }
        }
    }
    shouldLog(level) {
        return level <= this.logLevel;
    }
    formatLogEntry(entry) {
        const timestamp = entry.timestamp.toISOString();
        const levelStr = LogLevel[entry.level];
        const context = entry.context ? `[${entry.context}]` : '';
        const metadata = entry.metadata ? ` - ${JSON.stringify(entry.metadata)}` : '';
        const errorStr = entry.error ? `\nError: ${entry.error.message}\nStack: ${entry.error.stack}` : '';
        return `${timestamp} ${levelStr} ${context} ${entry.message}${metadata}${errorStr}`;
    }
    writeToFile(entry) {
        if (this.logToFile && this.logFilePath) {
            try {
                const logLine = this.formatLogEntry(entry) + '\n';
                fs.appendFileSync(this.logFilePath, logLine);
            }
            catch (error) {
                console.error('Failed to write to log file:', error);
            }
        }
    }
    log(level, message, context, error, metadata) {
        if (!this.shouldLog(level)) {
            return;
        }
        const entry = {
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
    error(message, context, error, metadata) {
        this.log(LogLevel.ERROR, message, context, error, metadata);
    }
    warn(message, context, metadata) {
        this.log(LogLevel.WARN, message, context, undefined, metadata);
    }
    info(message, context, metadata) {
        this.log(LogLevel.INFO, message, context, undefined, metadata);
    }
    debug(message, context, metadata) {
        this.log(LogLevel.DEBUG, message, context, undefined, metadata);
    }
    show() {
        this.outputChannel.show();
    }
    clear() {
        this.outputChannel.clear();
    }
    setLogLevel(level) {
        this.logLevel = level;
    }
    dispose() {
        this.outputChannel.dispose();
    }
}
exports.Logger = Logger;
//# sourceMappingURL=logger.js.map