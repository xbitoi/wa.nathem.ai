#!/usr/bin/env bash
# setup-github-pages.sh
# Configure GitHub remote and enable GitHub Pages for nour-agent
# Usage: GITHUB_PAT=<token> ./scripts/setup-github-pages.sh

set -euo pipefail

REPO_OWNER="xbitoi"
REPO_NAME="nour-agent"
REPO_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}.git"
PAGES_URL="https://${REPO_OWNER}.github.io/${REPO_NAME}/"

if [ -z "${GITHUB_PAT:-}" ]; then
  echo "ERROR: GITHUB_PAT environment variable is required"
  exit 1
fi

echo "=== 1. Configure git remote ==="
if git remote get-url github &>/dev/null; then
  git remote set-url github "https://${REPO_OWNER}:${GITHUB_PAT}@github.com/${REPO_OWNER}/${REPO_NAME}.git"
else
  git remote add github "https://${REPO_OWNER}:${GITHUB_PAT}@github.com/${REPO_OWNER}/${REPO_NAME}.git"
fi
echo "Remote 'github' configured."

echo ""
echo "=== 2. Push main branch ==="
git push github main --force
echo "Branch 'main' pushed successfully."

echo ""
echo "=== 3. Clean token from remote URL ==="
git remote set-url github "${REPO_URL}"
echo "Remote URL cleaned (token removed)."

echo ""
echo "=== 4. Enable GitHub Pages (GitHub Actions mode, source: docs/) ==="
# First try to create Pages; if already exists, update it
HTTP_STATUS=$(curl -s -o /tmp/pages-response.json -w "%{http_code}" \
  -X POST \
  -H "Authorization: token ${GITHUB_PAT}" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/pages" \
  -d '{"source":{"branch":"main","path":"/docs"}}')

if [ "$HTTP_STATUS" = "409" ]; then
  echo "Pages already exists. Switching to GitHub Actions workflow mode..."
  curl -s -X PUT \
    -H "Authorization: token ${GITHUB_PAT}" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/pages" \
    -d '{"build_type":"workflow"}' > /dev/null
  echo "Pages updated to GitHub Actions mode."
else
  echo "Pages enabled (HTTP ${HTTP_STATUS})."
fi

echo ""
echo "=== 5. Verify Pages status ==="
PAGE_STATUS=$(curl -s \
  -H "Authorization: token ${GITHUB_PAT}" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/pages" \
  | node -e "const d=[];process.stdin.on('data',c=>d.push(c));process.stdin.on('end',()=>{const r=JSON.parse(Buffer.concat(d).toString());console.log(r.status+'|'+r.build_type+'|'+r.html_url);})")
echo "Pages: ${PAGE_STATUS}"

echo ""
echo "=== 6. Verify live URL ==="
sleep 5
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "${PAGES_URL}")
echo "HTTP Status for ${PAGES_URL}: ${HTTP}"

if [ "$HTTP" = "200" ]; then
  echo ""
  echo "SUCCESS: GitHub Pages is live at ${PAGES_URL}"
else
  echo ""
  echo "WARNING: Pages may still be building. Check ${PAGES_URL} in a few minutes."
fi
