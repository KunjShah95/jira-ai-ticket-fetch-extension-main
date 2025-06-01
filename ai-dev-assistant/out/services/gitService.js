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
exports.GitService = void 0;
const vscode = __importStar(require("vscode"));
const simple_git_1 = require("simple-git");
class GitService {
    constructor() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder found');
        }
        this.workspaceRoot = workspaceFolder.uri.fsPath;
        this.git = (0, simple_git_1.simpleGit)(this.workspaceRoot);
    }
    async createBranch(branchName, baseBranch = 'main') {
        try {
            // Check if repository is initialized
            const isRepo = await this.git.checkIsRepo();
            if (!isRepo) {
                throw new Error('Current directory is not a Git repository');
            }
            // Ensure we're on the base branch and it's up to date
            const currentBranch = await this.getCurrentBranch();
            if (currentBranch !== baseBranch) {
                await this.git.checkout(baseBranch);
            }
            // Fetch latest changes
            try {
                await this.git.fetch();
                await this.git.pull('origin', baseBranch);
            }
            catch (error) {
                console.warn('Could not fetch/pull latest changes:', error);
                // Continue anyway - might be offline or no remote
            }
            // Check if branch already exists
            const branches = await this.git.branch();
            if (branches.all.includes(branchName)) {
                // Switch to existing branch
                await this.git.checkout(branchName);
                return {
                    success: true,
                    branchName,
                    error: undefined
                };
            }
            // Create and checkout new branch
            await this.git.checkoutLocalBranch(branchName);
            return {
                success: true,
                branchName,
                error: undefined
            };
        }
        catch (error) {
            return {
                success: false,
                error: `Failed to create branch: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }
    async commitChanges(message, files) {
        try {
            // Check if there are any changes
            const status = await this.git.status();
            const allChanges = [...status.modified, ...status.not_added, ...status.created];
            if (allChanges.length === 0) {
                return {
                    success: false,
                    error: 'No changes to commit'
                };
            }
            // Add specified files or all changes if no files specified
            const filesToAdd = files.length > 0 ? files : allChanges;
            for (const file of filesToAdd) {
                await this.git.add(file);
            }
            // Commit changes
            const commitResult = await this.git.commit(message);
            return {
                success: true,
                commitHash: commitResult.commit,
                error: undefined
            };
        }
        catch (error) {
            return {
                success: false,
                error: `Failed to commit changes: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }
    async pushBranch(branchName) {
        try {
            // Check if remote exists
            const remotes = await this.git.getRemotes(true);
            if (remotes.length === 0) {
                return {
                    success: false,
                    error: 'No Git remotes configured'
                };
            }
            const remoteName = remotes[0].name; // Use first remote (usually 'origin')
            // Push branch to remote
            await this.git.push(remoteName, branchName, { '--set-upstream': null });
            return {
                success: true,
                error: undefined
            };
        }
        catch (error) {
            return {
                success: false,
                error: `Failed to push branch: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }
    async createPullRequest(branchName, title, description) {
        try {
            // Get remote URL to determine Git provider
            const remotes = await this.git.getRemotes(true);
            if (remotes.length === 0) {
                throw new Error('No Git remotes configured');
            }
            const remoteUrl = remotes[0].refs.push;
            const gitProvider = this.detectGitProvider(remoteUrl);
            switch (gitProvider) {
                case 'github':
                    return await this.createGitHubPullRequest(branchName, title, description, remoteUrl);
                case 'gitlab':
                    return await this.createGitLabMergeRequest(branchName, title, description, remoteUrl);
                case 'azure':
                    return await this.createAzurePullRequest(branchName, title, description, remoteUrl);
                default:
                    // For unsupported providers, return instructions
                    return {
                        success: true,
                        pullRequestUrl: this.generateManualPRInstructions(branchName, title, description, remoteUrl),
                        error: undefined
                    };
            }
        }
        catch (error) {
            return {
                success: false,
                error: `Failed to create pull request: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }
    detectGitProvider(remoteUrl) {
        if (remoteUrl.includes('github.com')) {
            return 'github';
        }
        else if (remoteUrl.includes('gitlab.com') || remoteUrl.includes('gitlab')) {
            return 'gitlab';
        }
        else if (remoteUrl.includes('dev.azure.com') || remoteUrl.includes('visualstudio.com')) {
            return 'azure';
        }
        else if (remoteUrl.includes('bitbucket.org')) {
            return 'bitbucket';
        }
        return 'unknown';
    }
    async createGitHubPullRequest(branchName, title, description, remoteUrl) {
        try {
            const repoInfo = this.parseGitHubUrl(remoteUrl);
            // Try to use GitHub CLI if available
            const ghPath = await this.findGitHubCLI();
            if (ghPath) {
                const prUrl = await this.createPRWithGitHubCLI(ghPath, branchName, title, description);
                return {
                    success: true,
                    pullRequestUrl: prUrl,
                    error: undefined
                };
            }
            // Fallback to manual URL generation
            const prUrl = `https://github.com/${repoInfo.owner}/${repoInfo.repo}/compare/${branchName}?expand=1&title=${encodeURIComponent(title)}&body=${encodeURIComponent(description)}`;
            // Open the PR creation page in browser
            vscode.env.openExternal(vscode.Uri.parse(prUrl));
            return {
                success: true,
                pullRequestUrl: prUrl,
                error: undefined
            };
        }
        catch (error) {
            throw new Error(`GitHub PR creation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async createGitLabMergeRequest(branchName, title, description, remoteUrl) {
        // Similar implementation for GitLab
        const repoInfo = this.parseGitLabUrl(remoteUrl);
        const mrUrl = `${repoInfo.baseUrl}/${repoInfo.owner}/${repoInfo.repo}/-/merge_requests/new?merge_request[source_branch]=${branchName}&merge_request[title]=${encodeURIComponent(title)}&merge_request[description]=${encodeURIComponent(description)}`;
        vscode.env.openExternal(vscode.Uri.parse(mrUrl));
        return {
            success: true,
            pullRequestUrl: mrUrl,
            error: undefined
        };
    }
    async createAzurePullRequest(branchName, title, description, remoteUrl) {
        // Implementation for Azure DevOps
        const repoInfo = this.parseAzureUrl(remoteUrl);
        const prUrl = `${repoInfo.baseUrl}/${repoInfo.organization}/${repoInfo.project}/_git/${repoInfo.repo}/pullrequestcreate?sourceRef=${branchName}&targetRef=main&sourceRepositoryId=${repoInfo.repo}&targetRepositoryId=${repoInfo.repo}&title=${encodeURIComponent(title)}&description=${encodeURIComponent(description)}`;
        vscode.env.openExternal(vscode.Uri.parse(prUrl));
        return {
            success: true,
            pullRequestUrl: prUrl,
            error: undefined
        };
    }
    async findGitHubCLI() {
        try {
            // Try to find GitHub CLI
            const { execSync } = require('child_process');
            execSync('gh --version', { stdio: 'ignore' });
            return 'gh';
        }
        catch (error) {
            return null;
        }
    }
    async createPRWithGitHubCLI(ghPath, branchName, title, description) {
        const { execSync } = require('child_process');
        const command = `${ghPath} pr create --title "${title}" --body "${description}" --head ${branchName}`;
        const output = execSync(command, { cwd: this.workspaceRoot, encoding: 'utf8' });
        // Extract PR URL from output
        const urlMatch = output.match(/https:\/\/github\.com\/[^\s]+/);
        return urlMatch ? urlMatch[0] : output.trim();
    }
    parseGitHubUrl(url) {
        const match = url.match(/github\.com[\/:]([^\/]+)\/([^\/\.]+)/);
        if (!match) {
            throw new Error('Invalid GitHub URL');
        }
        return { owner: match[1], repo: match[2] };
    }
    parseGitLabUrl(url) {
        const match = url.match(/(https?:\/\/[^\/]+)\/([^\/]+)\/([^\/\.]+)/);
        if (!match) {
            throw new Error('Invalid GitLab URL');
        }
        return { baseUrl: match[1], owner: match[2], repo: match[3] };
    }
    parseAzureUrl(url) {
        const match = url.match(/(https?:\/\/dev\.azure\.com\/[^\/]+)\/([^\/]+)\/_git\/([^\/\.]+)/);
        if (!match) {
            throw new Error('Invalid Azure DevOps URL');
        }
        return {
            baseUrl: match[1],
            organization: match[1].split('/').pop(),
            project: match[2],
            repo: match[3]
        };
    }
    generateManualPRInstructions(branchName, title, description, remoteUrl) {
        return `Manual PR creation required:
1. Navigate to your Git provider's web interface
2. Create a new pull request from branch: ${branchName}
3. Title: ${title}
4. Description: ${description}
5. Remote URL: ${remoteUrl}`;
    }
    async getCurrentBranch() {
        try {
            const status = await this.git.status();
            return status.current || 'unknown';
        }
        catch (error) {
            throw new Error(`Failed to get current branch: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async getStatus() {
        try {
            const status = await this.git.status();
            return {
                staged: status.staged,
                unstaged: [...status.modified, ...status.deleted],
                untracked: status.not_added
            };
        }
        catch (error) {
            throw new Error(`Failed to get Git status: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    // Utility methods for advanced Git operations
    async stashChanges(message) {
        try {
            await this.git.stash(['push', '-m', message || 'AI Dev Assistant stash']);
            return { success: true };
        }
        catch (error) {
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }
    async applyStash() {
        try {
            await this.git.stash(['pop']);
            return { success: true };
        }
        catch (error) {
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }
    async rebaseInteractive(baseBranch) {
        try {
            await this.git.rebase(['-i', baseBranch]);
            return { success: true };
        }
        catch (error) {
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }
    async cherryPick(commitHash) {
        try {
            await this.git.raw(['cherry-pick', commitHash]);
            return { success: true };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    }
    async getCommitHistory(count = 10) {
        try {
            const log = await this.git.log({ maxCount: count });
            return log.all;
        }
        catch (error) {
            throw new Error(`Failed to get commit history: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async getDiff(file) {
        try {
            if (file) {
                return await this.git.diff([file]);
            }
            return await this.git.diff();
        }
        catch (error) {
            throw new Error(`Failed to get diff: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
exports.GitService = GitService;
//# sourceMappingURL=gitService.js.map