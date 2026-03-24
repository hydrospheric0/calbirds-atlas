#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# pushit.sh — commit + push calbirds-atlas to GitHub (Cloudflare Pages)
#
# Usage:
#   ./pushit.sh [message]        # stage tracked files only (git add -u)
#   ./pushit.sh --all [message]  # stage everything including new files
# ---------------------------------------------------------------------------

REPO_URL="https://github.com/hydrospheric0/calbirds-atlas.git"
SOURCE_BRANCH="main"
DEFAULT_MESSAGE="Minor updates"

cd "$(dirname "${BASH_SOURCE[0]}")"

# ── Argument parsing ────────────────────────────────────────────────────────
ADD_ALL=false
COMMIT_MSG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --all) ADD_ALL=true; shift ;;
    --help|-h)
      echo "Usage: ./pushit.sh [--all] [message]"
      exit 0 ;;
    *) COMMIT_MSG="${COMMIT_MSG:+$COMMIT_MSG }$1"; shift ;;
  esac
done

[[ -z "$COMMIT_MSG" ]] && COMMIT_MSG="$DEFAULT_MESSAGE"

# ── Ensure we're on the right branch ───────────────────────────────────────
current_branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$current_branch" != "$SOURCE_BRANCH" ]]; then
  echo "❌ Not on '$SOURCE_BRANCH' (currently on '$current_branch'). Aborting."
  exit 1
fi

# ── Ensure remote is correct ────────────────────────────────────────────────
current_remote="$(git remote get-url origin 2>/dev/null || true)"
if [[ "$current_remote" != "$REPO_URL" && "$current_remote" != "${REPO_URL%.git}" ]]; then
  echo "🔧 Updating remote origin → $REPO_URL"
  git remote set-url origin "$REPO_URL"
fi

# ── Stage ──────────────────────────────────────────────────────────────────
if [[ "$ADD_ALL" == true ]]; then
  echo "📦 Staging all changes (git add -A)..."
  git add -A
else
  echo "📦 Staging tracked changes (git add -u)..."
  git add -u
fi

# ── Check for anything to commit ───────────────────────────────────────────
if git diff --cached --quiet; then
  echo "✅ Nothing to commit — working tree clean."
  exit 0
fi

# ── Commit + push ──────────────────────────────────────────────────────────
echo "💬 Committing: \"$COMMIT_MSG\""
git commit -m "$COMMIT_MSG"

echo "🚀 Pushing to $SOURCE_BRANCH..."
git push origin "$SOURCE_BRANCH"

echo "✅ Done — Cloudflare Pages will deploy automatically."
