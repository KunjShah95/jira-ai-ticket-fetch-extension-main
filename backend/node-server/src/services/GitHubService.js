import { Octokit } from '@octokit/rest';
import crypto from 'crypto';
import { createLogger } from '../utils/logger.js';
import { getUserGitHubToken } from '../utils/githubTokenStore.js';

const logger = createLogger();

export class GitHubService {
	/**
	 * Optionally accept a userId to use a per-user GitHub token if available
	 */
	constructor(userId) {
		let token = process.env.GITHUB_TOKEN;
		if (userId) {
			const userToken = getUserGitHubToken(userId);
			if (userToken) token = userToken;
		}
		this.octokit = new Octokit({ auth: token });
		this.owner = process.env.GITHUB_OWNER;
		this.repo = process.env.GITHUB_REPO;
		this.webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
	}

	/**
	 * Create a new branch from base branch
	 */
	async createBranch(branchName, baseBranch = 'main') {
		try {
			// Get the SHA of the base branch
			const baseRef = await this.octokit.git.getRef({
				owner: this.owner,
				repo: this.repo,
				ref: `heads/${baseBranch}`
			});

			// Check if branch already exists
			try {
				await this.octokit.git.getRef({
					owner: this.owner,
					repo: this.repo,
					ref: `heads/${branchName}`
				});

				logger.info('Branch already exists', { branchName });
				return { exists: true, branchName };
			} catch (error) {
				if (error.status !== 404) {
					throw error;
				}
			}

			// Create new branch
			const newBranch = await this.octokit.git.createRef({
				owner: this.owner,
				repo: this.repo,
				ref: `refs/heads/${branchName}`,
				sha: baseRef.data.object.sha
			});

			logger.info('Created new branch', {
				branchName,
				baseBranch,
				sha: newBranch.data.object.sha
			});

			return newBranch.data;
		} catch (error) {
			logger.error('Failed to create branch:', {
				branchName,
				baseBranch,
				error: error.message
			});
			throw new Error(`Failed to create branch: ${error.message}`);
		}
	}

	/**
	 * Create a commit with multiple files
	 */
	async createCommit(branchName, message, files) {
		try {
			// Get the current commit SHA of the branch
			const branchRef = await this.octokit.git.getRef({
				owner: this.owner,
				repo: this.repo,
				ref: `heads/${branchName}`
			});

			const currentCommitSha = branchRef.data.object.sha;

			// Get the tree of the current commit
			const currentCommit = await this.octokit.git.getCommit({
				owner: this.owner,
				repo: this.repo,
				commit_sha: currentCommitSha
			});

			// Create blobs for all files
			const blobs = await Promise.all(
				files.map(async (file) => {
					const blob = await this.octokit.git.createBlob({
						owner: this.owner,
						repo: this.repo,
						content: Buffer.from(file.content).toString('base64'),
						encoding: 'base64'
					});
					return {
						path: file.path,
						mode: '100644',
						type: 'blob',
						sha: blob.data.sha
					};
				})
			);

			// Create a new tree
			const newTree = await this.octokit.git.createTree({
				owner: this.owner,
				repo: this.repo,
				base_tree: currentCommit.data.tree.sha,
				tree: blobs
			});

			// Create a new commit
			const newCommit = await this.octokit.git.createCommit({
				owner: this.owner,
				repo: this.repo,
				message,
				tree: newTree.data.sha,
				parents: [currentCommitSha]
			});

			// Update the branch reference
			await this.octokit.git.updateRef({
				owner: this.owner,
				repo: this.repo,
				ref: `heads/${branchName}`,
				sha: newCommit.data.sha
			});

			logger.info('Created commit successfully', {
				branchName,
				commitSha: newCommit.data.sha,
				fileCount: files.length
			});

			return newCommit.data;
		} catch (error) {
			logger.error('Failed to create commit:', {
				branchName,
				fileCount: files.length,
				error: error.message
			});
			throw new Error(`Failed to create commit: ${error.message}`);
		}
	}

	/**
	 * Create a pull request
	 */
	async createPullRequest(pullRequestData) {
		try {
			const pullRequest = await this.octokit.pulls.create({
				owner: this.owner,
				repo: this.repo,
				...pullRequestData
			});

			logger.info('Created pull request successfully', {
				prNumber: pullRequest.data.number,
				title: pullRequest.data.title,
				head: pullRequest.data.head.ref,
				base: pullRequest.data.base.ref
			});

			return pullRequest.data;
		} catch (error) {
			logger.error('Failed to create pull request:', {
				title: pullRequestData.title,
				head: pullRequestData.head,
				base: pullRequestData.base,
				error: error.message
			});
			throw new Error(`Failed to create pull request: ${error.message}`);
		}
	}

	/**
	 * Get repository branches
	 */
	async getBranches(protectedOnly = false) {
		try {
			const params = {
				owner: this.owner,
				repo: this.repo,
				per_page: 100
			};

			if (protectedOnly) {
				params.protected = true;
			}

			const branches = await this.octokit.repos.listBranches(params);

			return branches.data;
		} catch (error) {
			logger.error('Failed to get branches:', { error: error.message });
			throw new Error(`Failed to get branches: ${error.message}`);
		}
	}

	/**
	 * Get repository information
	 */
	async getRepositoryInfo() {
		try {
			const repo = await this.octokit.repos.get({
				owner: this.owner,
				repo: this.repo
			});

			return {
				name: repo.data.name,
				fullName: repo.data.full_name,
				description: repo.data.description,
				url: repo.data.html_url,
				defaultBranch: repo.data.default_branch,
				language: repo.data.language,
				languages: await this.getLanguages(),
				isPrivate: repo.data.private,
				createdAt: repo.data.created_at,
				updatedAt: repo.data.updated_at
			};
		} catch (error) {
			logger.error('Failed to get repository info:', { error: error.message });
			throw new Error(`Failed to get repository info: ${error.message}`);
		}
	}

	/**
	 * Get repository languages
	 */
	async getLanguages() {
		try {
			const languages = await this.octokit.repos.listLanguages({
				owner: this.owner,
				repo: this.repo
			});

			return languages.data;
		} catch (error) {
			logger.error('Failed to get repository languages:', { error: error.message });
			return {};
		}
	}

	/**
	 * Verify webhook signature for security
	 */
	verifyWebhookSignature(payload, signature) {
		if (!this.webhookSecret || !signature) {
			return false;
		}

		const expectedSignature = 'sha256=' + crypto
			.createHmac('sha256', this.webhookSecret)
			.update(payload)
			.digest('hex');

		return crypto.timingSafeEqual(
			Buffer.from(signature),
			Buffer.from(expectedSignature)
		);
	}

	/**
	 * Handle pull request webhook events
	 */
	async handlePullRequestWebhook(payload) {
		const { action, pull_request } = payload;

		logger.info('Processing pull request webhook', {
			action,
			prNumber: pull_request.number,
			state: pull_request.state
		});

		// You can add logic here to update Jira tickets based on PR status
		// For example, when PR is merged, transition Jira ticket to "Done"

		switch (action) {
			case 'opened':
				logger.info('Pull request opened', {
					prNumber: pull_request.number,
					title: pull_request.title
				});
				break;
			case 'closed':
				if (pull_request.merged) {
					logger.info('Pull request merged', {
						prNumber: pull_request.number,
						mergedAt: pull_request.merged_at
					});
					// TODO: Update corresponding Jira ticket status
				}
				break;
			case 'ready_for_review':
				logger.info('Pull request ready for review', {
					prNumber: pull_request.number
				});
				break;
		}
	}

	/**
	 * Handle push webhook events
	 */
	async handlePushWebhook(payload) {
		const { ref, commits } = payload;

		logger.info('Processing push webhook', {
			ref,
			commitCount: commits.length
		});

		// You can add logic here to trigger actions on push events
	}

	/**
	 * Get pull request status checks
	 */
	async getPullRequestChecks(pullNumber) {
		try {
			const pr = await this.octokit.pulls.get({
				owner: this.owner,
				repo: this.repo,
				pull_number: pullNumber
			});

			const checks = await this.octokit.checks.listForRef({
				owner: this.owner,
				repo: this.repo,
				ref: pr.data.head.sha
			});

			return checks.data.check_runs;
		} catch (error) {
			logger.error('Failed to get PR checks:', {
				pullNumber,
				error: error.message
			});
			throw new Error(`Failed to get PR checks: ${error.message}`);
		}
	}
}
