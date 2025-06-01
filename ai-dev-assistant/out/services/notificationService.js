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
exports.NotificationService = void 0;
const vscode = __importStar(require("vscode"));
const logger_1 = require("../utils/logger");
class NotificationService {
    constructor() {
        this.alertRules = new Map();
        this.progressNotifications = new Map();
        this.logger = logger_1.Logger.getInstance();
        this.initializeDefaultRules();
    }
    initializeDefaultRules() {
        // Default alert rules
        const defaultRules = [
            {
                id: 'workflow_failed',
                name: 'Workflow Failed',
                condition: (event) => event.type === 'workflow_failed',
                notification: {
                    type: 'error',
                    title: 'Workflow Failed',
                    message: 'An automated workflow has failed.',
                    actions: ['View Logs', 'Retry'],
                    persistent: true
                },
                enabled: true,
                cooldown: 60000 // 1 minute
            },
            {
                id: 'test_failure',
                name: 'Test Failure',
                condition: (event) => event.type === 'test_failed' && event.data.failureCount > 0,
                notification: {
                    type: 'warning',
                    title: 'Tests Failed',
                    message: 'Some tests are failing in the automated workflow.',
                    actions: ['View Results', 'Fix Tests'],
                    persistent: false
                },
                enabled: true,
                cooldown: 30000 // 30 seconds
            },
            {
                id: 'workflow_completed',
                name: 'Workflow Completed',
                condition: (event) => event.type === 'workflow_completed',
                notification: {
                    type: 'info',
                    title: 'Workflow Completed',
                    message: 'Automated development workflow completed successfully.',
                    actions: ['View Results'],
                    persistent: false
                },
                enabled: true
            },
            {
                id: 'auth_expired',
                name: 'Authentication Expired',
                condition: (event) => event.type === 'auth_error' && event.data?.code === 401,
                notification: {
                    type: 'warning',
                    title: 'Authentication Required',
                    message: 'Your authentication has expired. Please re-authenticate.',
                    actions: ['Re-authenticate'],
                    persistent: true
                },
                enabled: true,
                cooldown: 300000 // 5 minutes
            }
        ];
        defaultRules.forEach(rule => this.alertRules.set(rule.id, rule));
    }
    async showNotification(options) {
        try {
            this.logger.debug(`Showing ${options.type} notification: ${options.title}`, 'NotificationService');
            switch (options.type) {
                case 'info':
                    return await this.showInfoNotification(options);
                case 'warning':
                    return await this.showWarningNotification(options);
                case 'error':
                    return await this.showErrorNotification(options);
                case 'progress':
                    return await this.showProgressNotification(options);
                default:
                    return await this.showInfoNotification(options);
            }
        }
        catch (error) {
            const errMsg = error instanceof Error ? error : new Error(String(error));
            this.logger.error(`Failed to show notification: ${options.title}`, 'NotificationService', errMsg);
            return undefined;
        }
    }
    async showInfoNotification(options) {
        const actions = options.actions || [];
        if (options.persistent) {
            // For persistent notifications, show in status bar
            this.showStatusBarMessage(options.message, options.title);
        }
        return await vscode.window.showInformationMessage(`${options.title}: ${options.message}`, ...actions);
    }
    async showWarningNotification(options) {
        const actions = options.actions || [];
        return await vscode.window.showWarningMessage(`${options.title}: ${options.message}`, ...actions);
    }
    async showErrorNotification(options) {
        const actions = options.actions || [];
        return await vscode.window.showErrorMessage(`${options.title}: ${options.message}`, ...actions);
    }
    async showProgressNotification(options) {
        return new Promise((resolve) => {
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: options.title,
                cancellable: true
            }, async (progress, token) => {
                if (options.progress) {
                    const percentage = (options.progress.current / options.progress.total) * 100;
                    progress.report({
                        increment: percentage,
                        message: options.message
                    });
                }
                else {
                    progress.report({ message: options.message });
                }
                token.onCancellationRequested(() => {
                    resolve('cancelled');
                });
                // Keep the progress notification open until explicitly closed
                return new Promise((progressResolve) => {
                    // This would be resolved by external code when progress is complete
                    setTimeout(() => progressResolve(), 1000);
                });
            });
        });
    }
    showStatusBarMessage(message, tooltip) {
        const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        statusBarItem.text = `$(info) ${message}`;
        statusBarItem.tooltip = tooltip || message;
        statusBarItem.show();
        // Auto-hide after 10 seconds
        setTimeout(() => {
            statusBarItem.dispose();
        }, 10000);
        return statusBarItem;
    }
    processEvent(event) {
        // Check each alert rule against the event
        this.alertRules.forEach(rule => {
            if (rule.enabled && this.shouldTriggerRule(rule, event)) {
                this.triggerAlert(rule, event);
            }
        });
    }
    shouldTriggerRule(rule, event) {
        // Check if rule condition matches
        if (!rule.condition(event)) {
            return false;
        }
        // Check cooldown period
        if (rule.cooldown && rule.lastTriggered) {
            const timeSinceLastTrigger = Date.now() - rule.lastTriggered.getTime();
            if (timeSinceLastTrigger < rule.cooldown) {
                return false;
            }
        }
        return true;
    }
    async triggerAlert(rule, event) {
        try {
            rule.lastTriggered = new Date();
            // Customize notification message with event data
            const notification = { ...rule.notification };
            notification.message = this.interpolateMessage(notification.message, event);
            this.logger.info(`Triggering alert: ${rule.name}`, 'NotificationService', { eventType: event.type });
            const action = await this.showNotification(notification);
            if (action) {
                await this.handleNotificationAction(action, event, rule);
            }
        }
        catch (error) {
            const errMsg = error instanceof Error ? error : new Error(String(error));
            this.logger.error(`Failed to trigger alert: ${rule.name}`, 'NotificationService', errMsg);
        }
    }
    interpolateMessage(message, event) {
        // Simple template interpolation
        let result = message;
        if (event.data) {
            Object.keys(event.data).forEach(key => {
                const placeholder = `{${key}}`;
                if (result.includes(placeholder)) {
                    result = result.replace(placeholder, String(event.data[key]));
                }
            });
        }
        return result;
    }
    async handleNotificationAction(action, event, rule) {
        this.logger.debug(`Handling notification action: ${action}`, 'NotificationService');
        switch (action) {
            case 'View Logs':
                this.logger.show();
                break;
            case 'Retry':
                if (event.data?.workflowId) {
                    vscode.commands.executeCommand('aiDevAssistant.retryWorkflow', event.data.workflowId);
                }
                break;
            case 'View Results':
                vscode.commands.executeCommand('aiDevAssistant.viewProgress');
                break;
            case 'Fix Tests':
                if (event.data?.testResults) {
                    // Open first failing test file
                    const firstFailure = event.data.testResults.failures?.[0];
                    if (firstFailure?.file) {
                        vscode.workspace.openTextDocument(firstFailure.file).then(doc => {
                            vscode.window.showTextDocument(doc);
                        });
                    }
                }
                break;
            case 'Re-authenticate':
                vscode.commands.executeCommand('aiDevAssistant.configureJira');
                break;
            default:
                this.logger.debug(`Unhandled notification action: ${action}`, 'NotificationService');
        }
    }
    addAlertRule(rule) {
        this.alertRules.set(rule.id, rule);
        this.logger.info(`Added alert rule: ${rule.name}`, 'NotificationService');
    }
    removeAlertRule(ruleId) {
        const removed = this.alertRules.delete(ruleId);
        if (removed) {
            this.logger.info(`Removed alert rule: ${ruleId}`, 'NotificationService');
        }
        return removed;
    }
    enableAlertRule(ruleId) {
        const rule = this.alertRules.get(ruleId);
        if (rule) {
            rule.enabled = true;
            this.logger.info(`Enabled alert rule: ${rule.name}`, 'NotificationService');
            return true;
        }
        return false;
    }
    disableAlertRule(ruleId) {
        const rule = this.alertRules.get(ruleId);
        if (rule) {
            rule.enabled = false;
            this.logger.info(`Disabled alert rule: ${rule.name}`, 'NotificationService');
            return true;
        }
        return false;
    }
    getAlertRules() {
        return Array.from(this.alertRules.values());
    }
    async showCustomNotification(title, message, type = 'info', actions) {
        return await this.showNotification({
            type,
            title,
            message,
            actions
        });
    }
    async showWorkflowProgress(workflowId, title, steps, currentStep) {
        const progressKey = `workflow_${workflowId}`;
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: title,
            cancellable: false
        }, async (progress) => {
            const increment = 100 / steps.length;
            const currentProgress = currentStep * increment;
            progress.report({
                increment: currentProgress,
                message: `Step ${currentStep + 1}/${steps.length}: ${steps[currentStep]}`
            });
        });
    }
    dispose() {
        this.progressNotifications.clear();
        this.alertRules.clear();
    }
}
exports.NotificationService = NotificationService;
//# sourceMappingURL=notificationService.js.map