# Branch Protection Guidance for `main`

To maintain repository integrity and enforce automated quality gates, branch protection must be enabled for the `main` branch of the `Islamitech/Wasel` repository.

## GitHub Settings Configuration

Navigate to **Settings > Branches** in the repository (or via API):

### 1. Branch Name Pattern
- Target branch pattern: `main`

### 2. Protect Matching Branches Rules
- **Require a pull request before merging**
  - Check: *Require approvals* (minimum 1 approval recommended).
  - Check: *Dismiss stale pull request approvals when new commits are pushed*.
  - Check: *Require review from Code Owners* (if CODEOWNERS is configured).
- **Require status checks to pass before merging**
  - Check: *Require branches to be up to date before merging*.
  - Status checks that must pass:
    - `Lint, Typecheck, Test & Build` (from `.github/workflows/ci.yml`)
    - `db-real` (real PostGIS migration, seed, and spatial verification)
- **Require conversation resolution before merging**
  - All review conversations and comments must be resolved before merging.
- **Require signed commits** (optional, recommended for production integrity).
- **Require linear history**
  - Prevent merge commits to maintain a clean git graph (Rebase merge or Squash merge).
- **Do not allow bypassing the above settings**
  - Enforce rules for administrators as well to avoid accidental direct pushes.
- **Restrict who can push to matching branches**
  - Disallow direct pushes to `main`. All changes must arrive via pull requests from dedicated branches (e.g., `feat/*`, `fix/*`, `chore/*`).

---

## Programmatic Setup via GitHub API

Repository administrators can apply branch protection using the GitHub REST API:

```bash
curl -X PUT \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/Islamitech/Wasel/branches/main/protection \
  -d '{
    "required_status_checks": {
      "strict": true,
      "contexts": [
        "Lint, Typecheck, Test & Build"
      ]
    },
    "enforce_admins": true,
    "required_pull_request_reviews": {
      "dismiss_stale_reviews": true,
      "require_code_owner_reviews": false,
      "required_approving_review_count": 1
    },
    "restrictions": null,
    "required_linear_history": true,
    "allow_force_pushes": false,
    "allow_deletions": false
  }'
```
