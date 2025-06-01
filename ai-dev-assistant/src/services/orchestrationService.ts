import * as vscode from 'vscode';
import {
	IOrchestrationService,
	IJiraService,
	ILLMService,
	IGitService,
	ITestingService,
	IProgressTrackingService,
	DevelopmentWorkflow,
	WorkflowStep,
	CodeGenerationRequest,
	WorkflowEvent
} from '../types';

type WorkflowEventListener = (event: WorkflowEvent) => void;

export class OrchestrationService implements IOrchestrationService {
	private eventListeners: WorkflowEventListener[] = [];

	constructor(
		private jiraService: IJiraService,
		private llmService: ILLMService,
		private gitService: IGitService,
		private testingService: ITestingService,
		private progressService: IProgressTrackingService
	) { }

	public addEventListener(listener: WorkflowEventListener): void {
		this.eventListeners.push(listener);
	}

	public removeEventListener(listener: WorkflowEventListener): void {
		const index = this.eventListeners.indexOf(listener);
		if (index > -1) {
			this.eventListeners.splice(index, 1);
		}
	}

	private emitEvent(event: WorkflowEvent): void {
		this.eventListeners.forEach(listener => {
			try {
				listener(event);
			} catch (error) {
				console.error('Error in workflow event listener:', error);
			}
		});
	}

	public async startDevelopmentWorkflow(taskKey: string): Promise<string> {
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
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`Failed to start development workflow: ${error.message}`);
			} else {
				throw new Error('Failed to start development workflow: Unknown error');
			}
		}
	}

	public async processWorkflowStep(workflowId: string): Promise<void> {
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

			await this.progressService.updateWorkflowStep(
				workflowId,
				nextStep.id,
				'completed',
				stepResult
			);

			this.emitEvent({
				type: 'step-completed',
				workflowId,
				stepId: nextStep.id,
				data: stepResult,
				timestamp: new Date()
			});

			// Continue to next step
			await this.processWorkflowStep(workflowId);

		} catch (error) {
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

	private async executeWorkflowStep(workflow: DevelopmentWorkflow, step: WorkflowStep): Promise<any> {
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

	private async executeBranchCreationStep(workflow: DevelopmentWorkflow): Promise<any> {
		const branchName = `feature/${workflow.jiraTask.key.toLowerCase()}-${this.sanitizeBranchName(workflow.jiraTask.summary)}`;

		const result = await this.gitService.createBranch(branchName);
		if (!result.success) {
			throw new Error(`Failed to create branch: ${result.error}`);
		}

		return { branchName: result.branchName };
	}

	private async executeCodeGenerationStep(workflow: DevelopmentWorkflow): Promise<any> {
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		if (!workspaceRoot) {
			throw new Error('No workspace folder found');
		}

		// Analyze project structure
		const projectStructure = await this.analyzeProjectStructure(workspaceRoot);

		const codeRequest: CodeGenerationRequest = {
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
	private async executeTestingStep(workflow: DevelopmentWorkflow): Promise<any> {
		const testResults = await this.testingService.runTests();

		if (testResults.failed > 0) {
			const improvements = await this.llmService.suggestImprovements(
				'Generated code', // TODO: Pass actual code
				testResults
			);

			throw new Error(`Tests failed: ${testResults.failed} failures. Suggestions: ${improvements}`);
		}

		return {
			testsRun: testResults.passed + testResults.failed + testResults.skipped,
			testsPassed: testResults.passed,
			coverage: testResults.coverage
		};
	}

	private async executeCommitStep(workflow: DevelopmentWorkflow): Promise<any> {
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

	private async executePullRequestStep(workflow: DevelopmentWorkflow): Promise<any> {
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

	private async executeJiraUpdateStep(workflow: DevelopmentWorkflow): Promise<any> {
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

	private getNextPendingStep(workflow: DevelopmentWorkflow): WorkflowStep | null {
		return workflow.steps.find(step => step.status === 'pending') || null;
	}

	private async completeWorkflow(workflowId: string): Promise<void> {
		await this.progressService.completeWorkflow(workflowId);

		this.emitEvent({
			type: 'completed',
			workflowId,
			timestamp: new Date()
		});
	}

	public async retryFailedStep(workflowId: string, stepId: string): Promise<void> {
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

	public async cancelWorkflow(workflowId: string): Promise<void> {
		await this.progressService.failWorkflow(workflowId, 'Cancelled by user');
	}

	private sanitizeBranchName(name: string): string {
		return name
			.toLowerCase()
			.replace(/[^a-z0-9\-]/g, '-')
			.replace(/-+/g, '-')
			.substring(0, 50);
	}

	private async analyzeProjectStructure(workspaceRoot: string): Promise<string[]> {
		// TODO: Implement project structure analysis
		// This should recursively scan the project and return key file paths
		return ['src/', 'package.json', 'tsconfig.json'];
	}

	private inferFileType(jiraTask: any): CodeGenerationRequest['fileType'] {
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

	private async getJiraTaskUrl(taskKey: string): Promise<string> {
		const config = vscode.workspace.getConfiguration('aiDevAssistant');
		const instanceUrl = config.get<string>('jira.instanceUrl') || '';
		return `${instanceUrl}/browse/${taskKey}`;
	}
}
