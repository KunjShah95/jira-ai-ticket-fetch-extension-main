# Void Editor Backend - GitHub Integration Guide

## GitHub API Token Handling

### Store Your GitHub Token
- Endpoint: `POST /api/github/token`
- Auth: Required (JWT)
- Body: `{ "token": "YOUR_GITHUB_TOKEN" }`
- Stores your GitHub token securely for all future GitHub actions (branch, commit, PR, etc).

### How It Works
- The backend uses your token for all GitHub API calls if provided.
- If not set, falls back to the default token in `.env`.

## Example Usage

1. **Store Token**
   ```sh
   curl -X POST http://localhost:3000/api/github/token \
     -H "Authorization: Bearer <your_jwt>" \
     -H "Content-Type: application/json" \
     -d '{ "token": "ghp_xxx..." }'
   ```

2. **Commit Code**
   ```sh
   curl -X POST http://localhost:3000/api/github/commit \
     -H "Authorization: Bearer <your_jwt>" \
     -H "Content-Type: application/json" \
     -d '{ "files": [...], "commitMessage": "...", "branchName": "...", "ticketKey": "..." }'
   ```

3. **Create Pull Request**
   ```sh
   curl -X POST http://localhost:3000/api/github/pull-request ...
   ```

## Security Notes
- Tokens are never logged or exposed.
- For demo, tokens are stored in-memory. For production, use a secure store.

---

## Extend/Modify
- See `src/utils/githubTokenStore.js` for token storage logic.
- See `src/services/GitHubService.js` for GitHub API usage.
- All endpoints in `src/routes/github.js` now support per-user tokens.
