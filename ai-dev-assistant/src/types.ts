import * as vscode from 'vscode';

// Core domain types
export interface JiraTask {
	id: string;
	key: string;
	summary: string;
	description: string;
	status: string;
	assignee?: string;
	priority: string;
	issueType: string;
	projectKey: string;
	created: Date;
	updated: Date;
	labels: string[];
	components: string[];
}

export interface WorkflowStep {
	id: string;
	name: string;
	status: 'pending' | 'in-progress' | 'completed' | 'failed';
	startTime?: Date;
	endTime?: Date;
	error?: string;
	metadata?: any;
}

export interface DevelopmentWorkflow {
	id: string;
	jiraTask: JiraTask;
	steps: WorkflowStep[];
	branchName?: string;
	pullRequestUrl?: string;
	testResults?: TestResults;
	createdAt: Date;
	updatedAt: Date;
	status: 'pending' | 'in-progress' | 'completed' | 'failed';
}

export interface CodeGenerationRequest {
	task: JiraTask;
	context: {
		projectStructure?: string[];
		existingCode?: string;
		dependencies?: string[];
		testFramework?: string;
	};
	requirements: string;
	fileType: 'component' | 'service' | 'test' | 'util' | 'config';
}

export interface CodeGenerationResult {
	files: GeneratedFile[];
	testFiles: GeneratedFile[];
	dependencies?: string[];
	instructions?: string;
}

export interface GeneratedFile {
	path: string;
	content: string;
	language: string;
	description?: string;
}

export interface TestResults {
	passed: number;
	failed: number;
	skipped: number;
	coverage?: number;
	failures: TestFailure[];
	duration: number;
	// Add missing properties
	success: boolean;
	testResults: {
		passed: number;
		failed: number;
		total: number;
	};
}

export interface TestFailure {
	testName: string;
	error: string;
	stackTrace?: string;
}

export interface GitOperationResult {
	success: boolean;
	branchName?: string;
	commitHash?: string;
	pullRequestUrl?: string;
	error?: string;
}

// Service interfaces
export interface IJiraService {
	authenticate(): Promise<boolean>;
	isAuthenticated(): boolean;
	getTasks(projectKey?: string, assignee?: string): Promise<JiraTask[]>;
	getTask(taskKey: string): Promise<JiraTask>;
	updateTaskStatus(taskKey: string, status: string, comment?: string): Promise<boolean>;
	addComment(taskKey: string, comment: string): Promise<boolean>;
	createSubtask(parentKey: string, summary: string, description: string): Promise<JiraTask>;
}

export interface ILLMService {
	generateCode(request: CodeGenerationRequest): Promise<CodeGenerationResult>;
	reviewCode(code: string, context: string): Promise<string>;
	suggestImprovements(code: string, testResults: TestResults): Promise<string>;
	generateTests(code: string, framework: string): Promise<GeneratedFile[]>;
}

export interface IGitService {
	createBranch(branchName: string, baseBranch?: string): Promise<GitOperationResult>;
	commitChanges(message: string, files: string[]): Promise<GitOperationResult>;
	pushBranch(branchName: string): Promise<GitOperationResult>;
	createPullRequest(branchName: string, title: string, description: string): Promise<GitOperationResult>;
	getCurrentBranch(): Promise<string>;
	getStatus(): Promise<{ staged: string[], unstaged: string[], untracked: string[] }>;
}

export interface ITestingService {
	runTests(testPattern?: string): Promise<TestResults>;
	runTestsForFiles(files: string[]): Promise<TestResults>;
	generateTestCoverage(): Promise<number>;
	validateTestSetup(): Promise<boolean>;
}

export interface IProgressTrackingService {
	startWorkflow(jiraTask: JiraTask): Promise<string>;
	updateWorkflowStep(workflowId: string, stepId: string, status: WorkflowStep['status'], metadata?: any): Promise<void>;
	completeWorkflow(workflowId: string): Promise<void>;
	failWorkflow(workflowId: string, error: string): Promise<void>;
	getWorkflow(workflowId: string): Promise<DevelopmentWorkflow>;
	getActiveWorkflows(): Promise<DevelopmentWorkflow[]>;
}

export interface IOrchestrationService {
	startDevelopmentWorkflow(taskKey: string): Promise<string>;
	processWorkflowStep(workflowId: string): Promise<void>;
	retryFailedStep(workflowId: string, stepId: string): Promise<void>;
	cancelWorkflow(workflowId: string): Promise<void>;
}

// Configuration types
export interface JiraConfig {
	instanceUrl: string;
	clientId?: string;
	clientSecret?: string;
	accessToken?: string;
	refreshToken?: string;
}

export interface LLMConfig {
	provider: 'openai' | 'anthropic' | 'azure-openai';
	apiKey: string;
	model?: string;
	baseUrl?: string;
}

export interface GitConfig {
	autoCreateBranches: boolean;
	branchPrefix: string;
	defaultBaseBranch: string;
	autoCreatePR: boolean;
}

export interface WorkflowConfig {
	jira: JiraConfig;
	llm: LLMConfig;
	git: GitConfig;
	testing: {
		autoRun: boolean;
		framework: string;
		coverageThreshold: number;
	};
}

// Events
export interface WorkflowEvent {
	type: 'started' | 'step-completed' | 'step-failed' | 'completed' | 'failed' | 'workflow_started' | 'workflow_completed' | 'workflow_failed' | 'workflow_trigger' | 'status_changed' | 'pr_merged' | 'commits_pushed';
	workflowId?: string; // Made optional
	stepId?: string;
	data?: any;
	timestamp: Date;
	// Add missing error property
	error?: string;
}

// Add missing BackupMetadata interface
export interface BackupMetadata {
	id: string;
	name: string;
	date: Date;
	size: number;
	type: string;
}
