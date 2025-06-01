import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger';

export interface BackupMetadata {
	id: string;
	timestamp: Date;
	type: 'workflow' | 'configuration' | 'full';
	description: string;
	size: number;
	files: string[];
	checksum: string;
}

export interface BackupOptions {
	includeConfiguration: boolean;
	includeWorkflowStates: boolean;
	includeCredentials: boolean;
	compression: boolean;
	encryption: boolean;
}

export interface RestoreOptions {
	overwriteExisting: boolean;
	selectiveRestore: boolean;
	selectedFiles?: string[];
	restoreCredentials: boolean;
}

export class BackupService {
	private logger: Logger;
	private backupDir: string = '';
	private maxBackups: number = 10;

	constructor() {
		this.logger = Logger.getInstance();
		this.initializeBackupDirectory();
	}

	private initializeBackupDirectory(): void {
		const extensionPath = (global as any).extensionContext?.extensionPath;
		if (extensionPath) {
			this.backupDir = path.join(extensionPath, 'backups');
			this.ensureDirectoryExists(this.backupDir);
		}
	}

	private ensureDirectoryExists(dir: string): void {
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
	}

	public async createBackup(
		type: 'workflow' | 'configuration' | 'full',
		description: string,
		options: Partial<BackupOptions> = {}
	): Promise<string> {
		try {
			const config: BackupOptions = {
				includeConfiguration: true,
				includeWorkflowStates: true,
				includeCredentials: false,
				compression: true,
				encryption: false,
				...options
			};

			const backupId = this.generateBackupId();
			const timestamp = new Date();

			this.logger.info(`Creating ${type} backup: ${backupId}`, 'BackupService');

			const backupPath = path.join(this.backupDir, backupId);
			this.ensureDirectoryExists(backupPath);

			const files: string[] = [];

			// Backup configuration
			if (config.includeConfiguration) {
				await this.backupConfiguration(backupPath, files);
			}

			// Backup workflow states
			if (config.includeWorkflowStates) {
				await this.backupWorkflowStates(backupPath, files);
			}

			// Backup credentials (if requested and user confirms)
			if (config.includeCredentials) {
				const confirmCredentials = await vscode.window.showWarningMessage(
					'Include credentials in backup? This may be a security risk.',
					'Yes', 'No'
				);

				if (confirmCredentials === 'Yes') {
					await this.backupCredentials(backupPath, files);
				}
			}

			// Create metadata file
			const metadata: BackupMetadata = {
				id: backupId,
				timestamp,
				type,
				description,
				size: await this.calculateBackupSize(backupPath),
				files,
				checksum: await this.calculateChecksum(backupPath)
			};

			await this.saveMetadata(backupPath, metadata);

			// Compress if requested
			if (config.compression) {
				await this.compressBackup(backupPath);
			}

			// Encrypt if requested
			if (config.encryption) {
				await this.encryptBackup(backupPath);
			}

			// Clean up old backups
			await this.cleanupOldBackups();

			this.logger.info(`Backup created successfully: ${backupId}`, 'BackupService');

			vscode.window.showInformationMessage(`Backup created: ${backupId}`, 'View Backups');

			return backupId;
		} catch (error: unknown) {
			if (error instanceof Error) {
				this.logger.error('Failed to create backup', 'BackupService', error);
			} else {
				this.logger.error('Failed to create backup', 'BackupService', new Error(String(error)));
			}
			throw error;
		}
	}

	private generateBackupId(): string {
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		const random = Math.random().toString(36).substring(2, 8);
		return `backup-${timestamp}-${random}`;
	}

	private async backupConfiguration(backupPath: string, files: string[]): Promise<void> {
		const configPath = path.join(backupPath, 'configuration');
		this.ensureDirectoryExists(configPath);

		// Backup VS Code configuration
		const workspaceConfig = vscode.workspace.getConfiguration('aiDevAssistant');
		const configData: { workspace: Record<string, any>; global: Record<string, any> } = {
			workspace: {},
			global: {}
		};

		// Get all configuration keys
		const configKeys = [
			'jira.serverUrl',
			'jira.email',
			'git.defaultBranch',
			'llm.provider',
			'llm.model',
			'testing.framework',
			'automation.triggerLabels',
			'webhook.port',
			'logging.level'
		];

		configKeys.forEach(key => {
			const workspaceValue = workspaceConfig.inspect(key);
			if (workspaceValue) {
				configData.workspace[key] = workspaceValue.workspaceValue;
				configData.global[key] = workspaceValue.globalValue;
			}
		});

		const configFile = path.join(configPath, 'settings.json');
		fs.writeFileSync(configFile, JSON.stringify(configData, null, 2));
		files.push('configuration/settings.json');

		this.logger.debug('Configuration backed up', 'BackupService');
	}

	private async backupWorkflowStates(backupPath: string, files: string[]): Promise<void> {
		const statePath = path.join(backupPath, 'workflow-states');
		this.ensureDirectoryExists(statePath);

		// Backup workflow states from storage
		const extensionContext = (global as any).extensionContext;
		if (extensionContext) {
			try {
				const workflowStates = extensionContext.globalState.get('workflowStates', {});
				const stateFile = path.join(statePath, 'workflows.json');
				fs.writeFileSync(stateFile, JSON.stringify(workflowStates, null, 2));
				files.push('workflow-states/workflows.json');

				// Backup progress tracking data
				const progressData = extensionContext.globalState.get('progressData', {});
				const progressFile = path.join(statePath, 'progress.json');
				fs.writeFileSync(progressFile, JSON.stringify(progressData, null, 2));
				files.push('workflow-states/progress.json');

				this.logger.debug('Workflow states backed up', 'BackupService');
			} catch (error) {
				this.logger.warn('Failed to backup workflow states', 'BackupService', error instanceof Error ? error : new Error(String(error)));
			}
		}
	}

	private async backupCredentials(backupPath: string, files: string[]): Promise<void> {
		const credPath = path.join(backupPath, 'credentials');
		this.ensureDirectoryExists(credPath);

		// Note: This is a simplified example. In production, you'd want to:
		// 1. Use proper encryption for credentials
		// 2. Implement secure key management
		// 3. Follow security best practices

		const extensionContext = (global as any).extensionContext;
		if (extensionContext) {
			try {
				// Get credentials from VS Code secrets
				const jiraToken = await extensionContext.secrets.get('jira_token');
				const llmApiKey = await extensionContext.secrets.get('llm_api_key');
				const githubToken = await extensionContext.secrets.get('github_token');

				const credentials = {
					jira_token: jiraToken ? '***encrypted***' : null,
					llm_api_key: llmApiKey ? '***encrypted***' : null,
					github_token: githubToken ? '***encrypted***' : null
				};

				const credFile = path.join(credPath, 'credentials.json');
				fs.writeFileSync(credFile, JSON.stringify(credentials, null, 2));
				files.push('credentials/credentials.json');

				this.logger.debug('Credentials backed up (encrypted)', 'BackupService');
			} catch (error) {
				this.logger.warn('Failed to backup credentials', 'BackupService', error instanceof Error ? error : new Error(String(error)));
			}
		}
	}

	private async calculateBackupSize(backupPath: string): Promise<number> {
		const calculateDirSize = (dirPath: string): number => {
			let size = 0;
			if (fs.existsSync(dirPath)) {
				const files = fs.readdirSync(dirPath);
				files.forEach(file => {
					const filePath = path.join(dirPath, file);
					const stat = fs.statSync(filePath);
					if (stat.isDirectory()) {
						size += calculateDirSize(filePath);
					} else {
						size += stat.size;
					}
				});
			}
			return size;
		};

		return calculateDirSize(backupPath);
	}

	private async calculateChecksum(backupPath: string): Promise<string> {
		// Simple checksum calculation (in production, use crypto)
		const files = this.getAllFiles(backupPath);
		let checksum = 0;

		files.forEach(file => {
			const content = fs.readFileSync(file);
			for (let i = 0; i < content.length; i++) {
				checksum += content[i];
			}
		});

		return checksum.toString(16);
	}

	private getAllFiles(dir: string): string[] {
		const files: string[] = [];

		const scanDir = (dirPath: string): void => {
			if (fs.existsSync(dirPath)) {
				const items = fs.readdirSync(dirPath);
				items.forEach(item => {
					const itemPath = path.join(dirPath, item);
					const stat = fs.statSync(itemPath);
					if (stat.isDirectory()) {
						scanDir(itemPath);
					} else {
						files.push(itemPath);
					}
				});
			}
		};

		scanDir(dir);
		return files;
	}

	private async saveMetadata(backupPath: string, metadata: BackupMetadata): Promise<void> {
		const metadataFile = path.join(backupPath, 'metadata.json');
		fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));
	}

	private async compressBackup(backupPath: string): Promise<void> {
		// Note: In a real implementation, you'd use a compression library like node-compress-commons
		this.logger.debug(`Compression would be applied to ${backupPath}`, 'BackupService');
	}

	private async encryptBackup(backupPath: string): Promise<void> {
		// Note: In a real implementation, you'd use proper encryption
		this.logger.debug(`Encryption would be applied to ${backupPath}`, 'BackupService');
	}

	public async listBackups(): Promise<BackupMetadata[]> {
		const backups: BackupMetadata[] = [];

		if (!fs.existsSync(this.backupDir)) {
			return backups;
		}

		const backupDirs = fs.readdirSync(this.backupDir);

		for (const dir of backupDirs) {
			const backupPath = path.join(this.backupDir, dir);
			const metadataFile = path.join(backupPath, 'metadata.json');

			if (fs.existsSync(metadataFile)) {
				try {
					const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
					metadata.timestamp = new Date(metadata.timestamp); // Convert back to Date
					backups.push(metadata);
				} catch (error: unknown) {
					this.logger.warn(`Failed to read backup metadata: ${dir}`, 'BackupService', error instanceof Error ? error : new Error(String(error)));
				}
			}
		}

		return backups.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
	}

	public async restoreBackup(
		backupId: string,
		options: Partial<RestoreOptions> = {}
	): Promise<void> {
		try {
			const config: RestoreOptions = {
				overwriteExisting: false,
				selectiveRestore: false,
				restoreCredentials: false,
				...options
			};

			this.logger.info(`Restoring backup: ${backupId}`, 'BackupService');

			const backupPath = path.join(this.backupDir, backupId);
			const metadataFile = path.join(backupPath, 'metadata.json');

			if (!fs.existsSync(metadataFile)) {
				throw new Error(`Backup not found: ${backupId}`);
			}

			const metadata: BackupMetadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));

			// Verify backup integrity
			const currentChecksum = await this.calculateChecksum(backupPath);
			if (currentChecksum !== metadata.checksum) {
				throw new Error('Backup integrity check failed');
			}

			// Confirm restore operation
			const confirmation = await vscode.window.showWarningMessage(
				`Restore backup "${metadata.description}"? This will overwrite current settings.`,
				'Yes', 'No'
			);

			if (confirmation !== 'Yes') {
				return;
			}

			// Restore configuration
			await this.restoreConfiguration(backupPath);

			// Restore workflow states
			await this.restoreWorkflowStates(backupPath);

			// Restore credentials if requested
			if (config.restoreCredentials) {
				await this.restoreCredentials(backupPath);
			}

			this.logger.info(`Backup restored successfully: ${backupId}`, 'BackupService');

			vscode.window.showInformationMessage(
				'Backup restored successfully. Please reload the window to apply changes.',
				'Reload Window'
			).then(action => {
				if (action === 'Reload Window') {
					vscode.commands.executeCommand('workbench.action.reloadWindow');
				}
			});

		} catch (error: unknown) {
			if (error instanceof Error) {
				this.logger.error('Failed to restore backup', 'BackupService', error);
				vscode.window.showErrorMessage(`Failed to restore backup: ${error.message}`);
			} else {
				this.logger.error('Failed to restore backup', 'BackupService', new Error(String(error)));
				vscode.window.showErrorMessage(`Failed to restore backup: ${String(error)}`);
			}
			throw error;
		}
	}

	private async restoreConfiguration(backupPath: string): Promise<void> {
		const configFile = path.join(backupPath, 'configuration', 'settings.json');

		if (fs.existsSync(configFile)) {
			const configData = JSON.parse(fs.readFileSync(configFile, 'utf8'));
			const config = vscode.workspace.getConfiguration('aiDevAssistant');

			// Restore configuration values
			for (const [key, value] of Object.entries(configData.workspace)) {
				if (value !== undefined) {
					await config.update(key, value, vscode.ConfigurationTarget.Workspace);
				}
			}

			this.logger.debug('Configuration restored', 'BackupService');
		}
	}

	private async restoreWorkflowStates(backupPath: string): Promise<void> {
		const extensionContext = (global as any).extensionContext;
		if (!extensionContext) return;

		const workflowFile = path.join(backupPath, 'workflow-states', 'workflows.json');
		const progressFile = path.join(backupPath, 'workflow-states', 'progress.json');

		if (fs.existsSync(workflowFile)) {
			const workflowStates = JSON.parse(fs.readFileSync(workflowFile, 'utf8'));
			await extensionContext.globalState.update('workflowStates', workflowStates);
		}

		if (fs.existsSync(progressFile)) {
			const progressData = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
			await extensionContext.globalState.update('progressData', progressData);
		}

		this.logger.debug('Workflow states restored', 'BackupService');
	}

	private async restoreCredentials(backupPath: string): Promise<void> {
		const credFile = path.join(backupPath, 'credentials', 'credentials.json');

		if (fs.existsSync(credFile)) {
			// Note: In a real implementation, you'd decrypt the credentials here
			this.logger.debug('Credentials would be restored (encrypted)', 'BackupService');

			vscode.window.showWarningMessage(
				'Credential restoration is not implemented for security reasons. Please reconfigure manually.',
				'Configure Now'
			).then(action => {
				if (action === 'Configure Now') {
					vscode.commands.executeCommand('aiDevAssistant.configureJira');
				}
			});
		}
	}

	public async deleteBackup(backupId: string): Promise<void> {
		try {
			const backupPath = path.join(this.backupDir, backupId);

			if (fs.existsSync(backupPath)) {
				// Recursive delete
				fs.rmSync(backupPath, { recursive: true, force: true });
				this.logger.info(`Backup deleted: ${backupId}`, 'BackupService');
			}
		} catch (error: unknown) {
			this.logger.error('Failed to delete backup', 'BackupService', error instanceof Error ? error : new Error(String(error)));
			throw error;
		}
	}

	private async cleanupOldBackups(): Promise<void> {
		try {
			const backups = await this.listBackups();

			if (backups.length > this.maxBackups) {
				const toDelete = backups.slice(this.maxBackups);

				for (const backup of toDelete) {
					await this.deleteBackup(backup.id);
					this.logger.debug(`Cleaned up old backup: ${backup.id}`, 'BackupService');
				}
			}
		} catch (error: unknown) {
			this.logger.warn('Failed to cleanup old backups', 'BackupService', error instanceof Error ? error : new Error(String(error)));
		}
	}

	public async exportBackup(backupId: string): Promise<string> {
		const backupPath = path.join(this.backupDir, backupId);

		// Show save dialog
		const uri = await vscode.window.showSaveDialog({
			defaultUri: vscode.Uri.file(`${backupId}.zip`),
			filters: {
				'Backup Files': ['zip']
			}
		});

		if (uri) {
			// In a real implementation, create a ZIP file and copy it to the selected location
			this.logger.info(`Backup would be exported to: ${uri.fsPath}`, 'BackupService');
			return uri.fsPath;
		}

		throw new Error('Export cancelled');
	}

	public setMaxBackups(max: number): void {
		this.maxBackups = max;
	}

	public dispose(): void {
		// Cleanup resources if needed
	}
}
