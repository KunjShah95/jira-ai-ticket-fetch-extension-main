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
exports.ProgressTrackingService = void 0;
const vscode = __importStar(require("vscode"));
const uuid_1 = require("uuid");
class ProgressTrackingService {
    constructor() {
        this.workflows = new Map();
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.statusBarItem.command = 'aiDevAssistant.viewProgress';
        this.statusBarItem.show();
        this.updateStatusBar();
    }
    async startWorkflow(jiraTask) {
        const workflowId = (0, uuid_1.v4)();
        const now = new Date();
        const workflow = {
            id: workflowId,
            jiraTask,
            steps: this.createDefaultWorkflowSteps(),
            createdAt: now,
            updatedAt: now,
            status: 'pending'
        };
        this.workflows.set(workflowId, workflow);
        await this.persistWorkflow(workflow);
        this.updateStatusBar();
        vscode.window.showInformationMessage(`Started development workflow for ${jiraTask.key}: ${jiraTask.summary}`, 'View Progress').then(selection => {
            if (selection === 'View Progress') {
                vscode.commands.executeCommand('aiDevAssistant.viewProgress');
            }
        });
        return workflowId;
    }
    async updateWorkflowStep(workflowId, stepId, status, metadata) {
        const workflow = this.workflows.get(workflowId);
        if (!workflow) {
            throw new Error(`Workflow ${workflowId} not found`);
        }
        const step = workflow.steps.find(s => s.id === stepId);
        if (!step) {
            throw new Error(`Step ${stepId} not found in workflow ${workflowId}`);
        }
        const now = new Date();
        step.status = status;
        step.metadata = { ...step.metadata, ...metadata };
        if (status === 'in-progress' && !step.startTime) {
            step.startTime = now;
        }
        else if ((status === 'completed' || status === 'failed') && !step.endTime) {
            step.endTime = now;
        }
        if (status === 'failed' && metadata?.error) {
            step.error = metadata.error;
        }
        workflow.updatedAt = now;
        await this.persistWorkflow(workflow);
        this.updateStatusBar();
        // Update workflow status based on step statuses
        this.updateWorkflowStatus(workflow);
    }
    async completeWorkflow(workflowId) {
        const workflow = this.workflows.get(workflowId);
        if (!workflow) {
            throw new Error(`Workflow ${workflowId} not found`);
        }
        workflow.status = 'completed';
        workflow.updatedAt = new Date();
        // Mark all remaining pending steps as completed
        workflow.steps.forEach(step => {
            if (step.status === 'pending') {
                step.status = 'completed';
                step.endTime = new Date();
            }
        });
        await this.persistWorkflow(workflow);
        this.updateStatusBar();
        vscode.window.showInformationMessage(`✅ Development workflow completed for ${workflow.jiraTask.key}!`, 'View Details').then(selection => {
            if (selection === 'View Details') {
                this.showWorkflowDetails(workflow);
            }
        });
    }
    async failWorkflow(workflowId, error) {
        const workflow = this.workflows.get(workflowId);
        if (!workflow) {
            throw new Error(`Workflow ${workflowId} not found`);
        }
        workflow.status = 'failed';
        workflow.updatedAt = new Date();
        // Find the current step and mark it as failed
        const currentStep = workflow.steps.find(s => s.status === 'in-progress');
        if (currentStep) {
            currentStep.status = 'failed';
            currentStep.error = error;
            currentStep.endTime = new Date();
        }
        await this.persistWorkflow(workflow);
        this.updateStatusBar();
        vscode.window.showErrorMessage(`❌ Development workflow failed for ${workflow.jiraTask.key}: ${error}`, 'View Details', 'Retry').then(selection => {
            if (selection === 'View Details') {
                this.showWorkflowDetails(workflow);
            }
            else if (selection === 'Retry') {
                vscode.commands.executeCommand('aiDevAssistant.retryWorkflow', workflowId);
            }
        });
    }
    async getWorkflow(workflowId) {
        const workflow = this.workflows.get(workflowId);
        if (!workflow) {
            // Try to load from storage
            const loadedWorkflow = await this.loadWorkflow(workflowId);
            if (loadedWorkflow) {
                this.workflows.set(workflowId, loadedWorkflow);
                return loadedWorkflow;
            }
            throw new Error(`Workflow ${workflowId} not found`);
        }
        return workflow;
    }
    async getActiveWorkflows() {
        // Load all workflows from storage
        await this.loadAllWorkflows();
        return Array.from(this.workflows.values())
            .filter(w => w.status === 'pending' || w.status === 'in-progress')
            .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    }
    async getAllWorkflows() {
        await this.loadAllWorkflows();
        return Array.from(this.workflows.values())
            .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    }
    async deleteWorkflow(workflowId) {
        this.workflows.delete(workflowId);
        const extensionContext = global.extensionContext;
        if (extensionContext) {
            await extensionContext.workspaceState.update(`workflow.${workflowId}`, undefined);
        }
        this.updateStatusBar();
    }
    createDefaultWorkflowSteps() {
        return [
            {
                id: 'create-branch',
                name: 'create-branch',
                status: 'pending'
            },
            {
                id: 'generate-code',
                name: 'generate-code',
                status: 'pending'
            },
            {
                id: 'run-tests',
                name: 'run-tests',
                status: 'pending'
            },
            {
                id: 'commit-changes',
                name: 'commit-changes',
                status: 'pending'
            },
            {
                id: 'create-pr',
                name: 'create-pr',
                status: 'pending'
            },
            {
                id: 'update-jira',
                name: 'update-jira',
                status: 'pending'
            }
        ];
    }
    updateWorkflowStatus(workflow) {
        const steps = workflow.steps;
        const hasFailedSteps = steps.some(s => s.status === 'failed');
        const allCompleted = steps.every(s => s.status === 'completed');
        const hasInProgress = steps.some(s => s.status === 'in-progress');
        if (hasFailedSteps) {
            workflow.status = 'failed';
        }
        else if (allCompleted) {
            workflow.status = 'completed';
        }
        else if (hasInProgress || steps.some(s => s.status === 'completed')) {
            workflow.status = 'in-progress';
        }
        else {
            workflow.status = 'pending';
        }
    }
    updateStatusBar() {
        const activeWorkflows = Array.from(this.workflows.values())
            .filter(w => w.status === 'pending' || w.status === 'in-progress');
        if (activeWorkflows.length === 0) {
            this.statusBarItem.text = '$(gear) AI Dev Assistant';
            this.statusBarItem.tooltip = 'No active workflows';
        }
        else if (activeWorkflows.length === 1) {
            const workflow = activeWorkflows[0];
            const completedSteps = workflow.steps.filter(s => s.status === 'completed').length;
            const totalSteps = workflow.steps.length;
            const currentStep = workflow.steps.find(s => s.status === 'in-progress');
            this.statusBarItem.text = `$(gear~spin) ${workflow.jiraTask.key} (${completedSteps}/${totalSteps})`;
            this.statusBarItem.tooltip = `Working on: ${workflow.jiraTask.summary}\nCurrent step: ${currentStep?.name || 'Starting...'}`;
        }
        else {
            this.statusBarItem.text = `$(gear~spin) ${activeWorkflows.length} workflows`;
            this.statusBarItem.tooltip = `${activeWorkflows.length} active workflows`;
        }
    }
    async persistWorkflow(workflow) {
        const extensionContext = global.extensionContext;
        if (extensionContext) {
            // Store workflow data
            await extensionContext.workspaceState.update(`workflow.${workflow.id}`, {
                ...workflow,
                createdAt: workflow.createdAt.toISOString(),
                updatedAt: workflow.updatedAt.toISOString(),
                steps: workflow.steps.map(step => ({
                    ...step,
                    startTime: step.startTime?.toISOString(),
                    endTime: step.endTime?.toISOString()
                }))
            });
            // Update workflow index
            const workflowIds = extensionContext.workspaceState.get('workflows', []);
            if (!workflowIds.includes(workflow.id)) {
                workflowIds.push(workflow.id);
                await extensionContext.workspaceState.update('workflows', workflowIds);
            }
        }
    }
    async loadWorkflow(workflowId) {
        const extensionContext = global.extensionContext;
        if (!extensionContext)
            return null;
        const workflowData = extensionContext.workspaceState.get(`workflow.${workflowId}`);
        if (!workflowData)
            return null;
        return this.deserializeWorkflow(workflowData);
    }
    async loadAllWorkflows() {
        const extensionContext = global.extensionContext;
        if (!extensionContext)
            return;
        const workflowIds = extensionContext.workspaceState.get('workflows', []);
        for (const workflowId of workflowIds) {
            if (!this.workflows.has(workflowId)) {
                const workflow = await this.loadWorkflow(workflowId);
                if (workflow) {
                    this.workflows.set(workflowId, workflow);
                }
            }
        }
    }
    deserializeWorkflow(data) {
        return {
            ...data,
            createdAt: new Date(data.createdAt),
            updatedAt: new Date(data.updatedAt),
            steps: data.steps.map((step) => ({
                ...step,
                startTime: step.startTime ? new Date(step.startTime) : undefined,
                endTime: step.endTime ? new Date(step.endTime) : undefined
            }))
        };
    }
    showWorkflowDetails(workflow) {
        const panel = vscode.window.createWebviewPanel('workflowDetails', `Workflow: ${workflow.jiraTask.key}`, vscode.ViewColumn.One, { enableScripts: true });
        panel.webview.html = this.generateWorkflowDetailsHTML(workflow);
    }
    generateWorkflowDetailsHTML(workflow) {
        const stepRows = workflow.steps.map(step => {
            const statusIcon = this.getStepStatusIcon(step.status);
            const duration = step.startTime && step.endTime
                ? Math.round((step.endTime.getTime() - step.startTime.getTime()) / 1000)
                : '-';
            return `
        <tr>
          <td>${statusIcon} ${step.name}</td>
          <td>${step.status}</td>
          <td>${step.startTime?.toLocaleTimeString() || '-'}</td>
          <td>${step.endTime?.toLocaleTimeString() || '-'}</td>
          <td>${duration}s</td>
          <td>${step.error || '-'}</td>
        </tr>
      `;
        }).join('');
        return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Workflow Details</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .header { background: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
          th { background-color: #f5f5f5; }
          .status-pending { color: #ffa500; }
          .status-in-progress { color: #0066cc; }
          .status-completed { color: #00aa00; }
          .status-failed { color: #cc0000; }
        </style>
      </head>
      <body>
        <div class="header">
          <h2>${workflow.jiraTask.key}: ${workflow.jiraTask.summary}</h2>
          <p><strong>Status:</strong> ${workflow.status}</p>
          <p><strong>Created:</strong> ${workflow.createdAt.toLocaleString()}</p>
          <p><strong>Updated:</strong> ${workflow.updatedAt.toLocaleString()}</p>
          <p><strong>Description:</strong> ${workflow.jiraTask.description}</p>
        </div>

        <h3>Workflow Steps</h3>
        <table>
          <thead>
            <tr>
              <th>Step</th>
              <th>Status</th>
              <th>Start Time</th>
              <th>End Time</th>
              <th>Duration</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            ${stepRows}
          </tbody>
        </table>
      </body>
      </html>
    `;
    }
    getStepStatusIcon(status) {
        switch (status) {
            case 'pending': return '⏳';
            case 'in-progress': return '🔄';
            case 'completed': return '✅';
            case 'failed': return '❌';
            default: return '❓';
        }
    }
    dispose() {
        this.statusBarItem.dispose();
    }
}
exports.ProgressTrackingService = ProgressTrackingService;
//# sourceMappingURL=progressTrackingService.js.map