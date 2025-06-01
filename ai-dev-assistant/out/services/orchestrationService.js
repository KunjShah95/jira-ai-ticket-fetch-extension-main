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
exports.OrchestrationService = void 0;
const vscode = __importStar(require("vscode"));
class OrchestrationService {
    constructor(jiraService, llmService, gitService, testingService, progressService) {
        this.jiraService = jiraService;
        this.llmService = llmService;
        this.gitService = gitService;
        this.testingService = testingService;
        this.progressService = progressService;
        this.eventListeners = [];
    }
    addEventListener(listener) {
        this.eventListeners.push(listener);
    }
    removeEventListener(listener) {
        const index = this.eventListeners.indexOf(listener);
        if (index > -1) {
            this.eventListeners.splice(index, 1);
        }
    }
    emitEvent(event) {
        this.eventListeners.forEach(listener => {
            try {
                listener(event);
            }
            catch (error) {
                console.error('Error in workflow event listener:', error);
            }
        });
    }
    async startDevelopmentWorkflow(taskKey) {
        try {
            // Fetch Jira task
            const jiraTask = await this.jiraService.getTask(taskKey);
            // Start workflow tracking
            const workflowId = await this.progressService.startWorkflow(jiraTask);
            this.emitEvent({
                type: 'started',
                workflowId,
                timestamp: new Date()
            });
            // Start processing workflow asynchronously
            this.processWorkflowStep(workflowId).catch(error => {
                console.error('Workflow processing failed:', error);
                this.progressService.failWorkflow(workflowId, error.message);
            });
            return workflowId;
        }
        catch (error) {
            if (error instanceof Error) {
                throw new Error(`Failed to start development workflow: ${error.message}`);
            }
            else {
                throw new Error('Failed to start development workflow: Unknown error');
            }
        }
    }
    async processWorkflowStep(workflowId) {
        const workflow = await this.progressService.getWorkflow(workflowId);
        const nextStep = this.getNextPendingStep(workflow);
        if (!nextStep) {
            // All steps completed
            await this.completeWorkflow(workflowId);
            return;
        }
        try {
            await this.progressService.updateWorkflowStep(workflowId, nextStep.id, 'in-progress');
            const stepResult = await this.executeWorkflowStep(workflow, nextStep);
            await this.progressService.updateWorkflowStep(workflowId, nextStep.id, 'completed', stepResult);
            this.emitEvent({
                type: 'step-completed',
                workflowId,
                stepId: nextStep.id,
                data: stepResult,
                timestamp: new Date()
            });
            // Continue to next step
            await this.processWorkflowStep(workflowId);
        }
        catch (error) {
            await this.progressService.updateWorkflowStep(workflowId, nextStep.id, 'failed', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            this.emitEvent({
                type: 'step-failed',
                workflowId,
                stepId: nextStep.id,
                data: { error: error instanceof Error ? error.message : 'Unknown error' },
                timestamp: new Date()
            });
            throw error;
        }
    }
    async executeWorkflowStep(workflow, step) {
        switch (step.name) {
            case 'create-branch':
                return await this.executeBranchCreationStep(workflow);
            case 'generate-code':
                return await this.executeCodeGenerationStep(workflow);
            case 'run-tests':
                return await this.executeTestingStep(workflow);
            case 'commit-changes':
                return await this.executeCommitStep(workflow);
            case 'create-pr':
                return await this.executePullRequestStep(workflow);
            case 'update-jira':
                return await this.executeJiraUpdateStep(workflow);
            default:
                throw new Error(`Unknown workflow step: ${step.name}`);
        }
    }
    async executeBranchCreationStep(workflow) {
        const branchName = `feature/${workflow.jiraTask.key.toLowerCase()}-${this.sanitizeBranchName(workflow.jiraTask.summary)}`;
        const result = await this.gitService.createBranch(branchName);
        if (!result.success) {
            throw new Error(`Failed to create branch: ${result.error}`);
        }
        return { branchName: result.branchName };
    }
    async executeCodeGenerationStep(workflow) {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            throw new Error('No workspace folder found');
        }
        // Analyze project structure
        const projectStructure = await this.analyzeProjectStructure(workspaceRoot);
        const codeRequest = {
            task: workflow.jiraTask,
            context: {
                projectStructure,
                testFramework: 'jest' // TODO: Auto-detect
            },
            requirements: workflow.jiraTask.description,
            fileType: this.inferFileType(workflow.jiraTask)
        };
        const codeResult = await this.llmService.generateCode(codeRequest);
        // Write generated files to workspace
        for (const file of codeResult.files) {
            const filePath = vscode.Uri.file(`${workspaceRoot}/${file.path}`);
            await vscode.workspace.fs.writeFile(filePath, Buffer.from(file.content, 'utf8'));
        }
        // Write test files
        for (const testFile of codeResult.testFiles) {
            const filePath = vscode.Uri.file(`${workspaceRoot}/${testFile.path}`);
            await vscode.workspace.fs.writeFile(filePath, Buffer.from(testFile.content, 'utf8'));
        }
        return {
            filesGenerated: codeResult.files.length,
            testFilesGenerated: codeResult.testFiles.length,
        };
    }
    async executeTestingStep(workflow) {
        const testResults = await this.testingService.runTests();
        if (testResults.failed > 0) {
            const improvements = await this.llmService.suggestImprovements('Generated code', // TODO: Pass actual code
            testResults);
            throw new Error(`Tests failed: ${testResults.failed} failures. Suggestions: ${improvements}`);
        }
        return {
            testsRun: testResults.passed + testResults.failed + testResults.skipped,
            testsPassed: testResults.passed,
            coverage: testResults.coverage
        };
    }
    async executeCommitStep(workflow) {
        const status = await this.gitService.getStatus();
        const allChangedFiles = [...status.staged, ...status.unstaged, ...status.untracked];
        if (allChangedFiles.length === 0) {
            throw new Error('No changes to commit');
        }
        const commitMessage = `feat: ${workflow.jiraTask.summary}\n\nJira: ${workflow.jiraTask.key}\n${workflow.jiraTask.description}`;
        const result = await this.gitService.commitChanges(commitMessage, allChangedFiles);
        if (!result.success) {
            throw new Error(`Failed to commit changes: ${result.error}`);
        }
        return { commitHash: result.commitHash, filesCommitted: allChangedFiles.length };
    }
    async executePullRequestStep(workflow) {
        const branchName = workflow.branchName || await this.gitService.getCurrentBranch();
        // Push branch first
        const pushResult = await this.gitService.pushBranch(branchName);
        if (!pushResult.success) {
            throw new Error(`Failed to push branch: ${pushResult.error}`);
        }
        const prTitle = `${workflow.jiraTask.key}: ${workflow.jiraTask.summary}`;
        const prDescription = `
## Description
${workflow.jiraTask.description}

## Jira Task
[${workflow.jiraTask.key}](${await this.getJiraTaskUrl(workflow.jiraTask.key)})

## Changes
- Implemented solution for ${workflow.jiraTask.summary}
- Added comprehensive tests
- Maintained code coverage standards

## Testing
All tests are passing with appropriate coverage.
    `.trim();
        const prResult = await this.gitService.createPullRequest(branchName, prTitle, prDescription);
        if (!prResult.success) {
            throw new Error(`Failed to create pull request: ${prResult.error}`);
        }
        return { pullRequestUrl: prResult.pullRequestUrl };
    }
    async executeJiraUpdateStep(workflow) {
        const prUrl = workflow.pullRequestUrl || 'PR creation pending';
        const comment = `
Development workflow completed successfully:
- ✅ Feature branch created
- ✅ Code generated and implemented
- ✅ Tests passing
- ✅ Pull request created: ${prUrl}

The implementation is ready for review.
    `.trim();
        await this.jiraService.addComment(workflow.jiraTask.key, comment);
        await this.jiraService.updateTaskStatus(workflow.jiraTask.key, 'In Review');
        return { jiraUpdated: true };
    }
    getNextPendingStep(workflow) {
        return workflow.steps.find(step => step.status === 'pending') || null;
    }
    async completeWorkflow(workflowId) {
        await this.progressService.completeWorkflow(workflowId);
        this.emitEvent({
            type: 'completed',
            workflowId,
            timestamp: new Date()
        });
    }
    async retryFailedStep(workflowId, stepId) {
        const workflow = await this.progressService.getWorkflow(workflowId);
        const step = workflow.steps.find(s => s.id === stepId);
        if (!step || step.status !== 'failed') {
            throw new Error('Step is not in failed state');
        }
        // Reset step to pending
        await this.progressService.updateWorkflowStep(workflowId, stepId, 'pending');
        // Continue processing
        await this.processWorkflowStep(workflowId);
    }
    async cancelWorkflow(workflowId) {
        await this.progressService.failWorkflow(workflowId, 'Cancelled by user');
    }
    sanitizeBranchName(name) {
        return name
            .toLowerCase()
            .replace(/[^a-z0-9\-]/g, '-')
            .replace(/-+/g, '-')
            .substring(0, 50);
    }
    async analyzeProjectStructure(workspaceRoot) {
        // TODO: Implement project structure analysis
        // This should recursively scan the project and return key file paths
        return ['src/', 'package.json', 'tsconfig.json'];
    }
    inferFileType(jiraTask) {
        const summary = jiraTask.summary.toLowerCase();
        const description = jiraTask.description.toLowerCase();
        if (summary.includes('test') || description.includes('test')) {
            return 'test';
        }
        if (summary.includes('service') || description.includes('service')) {
            return 'service';
        }
        if (summary.includes('util') || description.includes('utility')) {
            return 'util';
        }
        if (summary.includes('config') || description.includes('configuration')) {
            return 'config';
        }
        return 'component'; // Default
    }
    async getJiraTaskUrl(taskKey) {
        const config = vscode.workspace.getConfiguration('aiDevAssistant');
        const instanceUrl = config.get('jira.instanceUrl') || '';
        return `${instanceUrl}/browse/${taskKey}`;
    }
}
exports.OrchestrationService = OrchestrationService;
//# sourceMappingURL=orchestrationService.js.map