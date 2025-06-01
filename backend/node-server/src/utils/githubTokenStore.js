// In-memory store for demo purposes. Replace with DB or secrets manager for production.
const userGitHubTokens = new Map();

export function setUserGitHubToken(userId, token) {
	userGitHubTokens.set(userId, token);
}

export function getUserGitHubToken(userId) {
	return userGitHubTokens.get(userId);
}
