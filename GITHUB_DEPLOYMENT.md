# GitHub Deployment Status

## Repository

**URL**: https://github.com/xbitoi/nour-agent  
**Branch**: `main`  
**Remote name**: `github`

## GitHub Pages

**Live URL**: https://xbitoi.github.io/nour-agent/  
**Status**: Live — HTTP 200  
**Build type**: `workflow` (GitHub Actions)  
**Source folder**: `docs/`  
**Workflow**: `.github/workflows/pages.yml`

## Verification

The following was confirmed on 2026-04-04:

```
GitHub Pages HTTP Status: 200
Pages build_type: workflow
Pages status: built
Workflow runs (last 3): completed / success
```

## Setup Script

To reproduce this setup from scratch, run:

```bash
GITHUB_PAT=<your-token> ./scripts/setup-github-pages.sh
```

Required token scopes: `repo`, `pages`

## Git Remote Configuration

```bash
# Configure remote (token injected at runtime, not stored)
git remote add github https://github.com/xbitoi/nour-agent.git

# Push
GITHUB_PAT=<token> git remote set-url github "https://xbitoi:<token>@github.com/xbitoi/nour-agent.git"
git push github main
git remote set-url github "https://github.com/xbitoi/nour-agent.git"  # clean token
```

## Workflow Runs

All 3 most recent `Deploy to GitHub Pages` workflow runs completed with `conclusion: success`.

Workflow file: `.github/workflows/pages.yml`
- Deploys `docs/` folder via `actions/upload-pages-artifact@v3` + `actions/deploy-pages@v4`
- Runs automatically on every push to `main`
