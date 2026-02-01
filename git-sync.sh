#!/usr/bin/env bash
# git-sync.sh — Auto-fetch & pull tracked repos, resolve common issues
# Called by OpenClaw cron. Outputs only when there are changes or errors.
set -euo pipefail

REPOS=(
  "$HOME/repos/ALPA-Mobile"
  "$HOME/repos/ACA-Calculator"
)

CHANGES=()
ERRORS=()

for REPO_DIR in "${REPOS[@]}"; do
  REPO_NAME="$(basename "$REPO_DIR")"

  if [[ ! -d "$REPO_DIR/.git" ]]; then
    ERRORS+=("❌ $REPO_NAME: not a git repo at $REPO_DIR")
    continue
  fi

  cd "$REPO_DIR"

  BRANCH="$(git symbolic-ref --short HEAD 2>/dev/null || echo 'DETACHED')"
  if [[ "$BRANCH" == "DETACHED" ]]; then
    ERRORS+=("⚠️ $REPO_NAME: HEAD is detached, skipping")
    continue
  fi

  # --- Refresh Azure DevOps token if needed ---
  if git remote get-url origin 2>/dev/null | grep -q 'dev.azure.com'; then
    TOKEN="$(az account get-access-token --resource 499b84ac-1321-427f-aa17-267ca6975798 --query accessToken -o tsv 2>/dev/null || true)"
    if [[ -n "$TOKEN" ]]; then
      CURRENT_URL="$(git remote get-url origin)"
      # Strip existing oauth token if present
      BASE_URL="$(echo "$CURRENT_URL" | sed -E 's|https://oauth:[^@]+@|https://|')"
      NEW_URL="$(echo "$BASE_URL" | sed -E "s|https://|https://oauth:${TOKEN}@|")"
      git remote set-url origin "$NEW_URL" 2>/dev/null || true
      git remote set-url --push origin "$NEW_URL" 2>/dev/null || true
    fi
  fi

  # --- Fetch ---
  if ! FETCH_OUT="$(git fetch origin 2>&1)"; then
    ERRORS+=("❌ $REPO_NAME ($BRANCH): fetch failed — $FETCH_OUT")
    continue
  fi

  # --- Check if behind ---
  LOCAL="$(git rev-parse HEAD)"
  REMOTE="$(git rev-parse "origin/$BRANCH" 2>/dev/null || echo '')"

  if [[ -z "$REMOTE" ]]; then
    # No remote tracking branch
    continue
  fi

  if [[ "$LOCAL" == "$REMOTE" ]]; then
    # Already up to date
    continue
  fi

  # Check if we're behind (not diverged or ahead-only)
  BEHIND="$(git rev-list --count HEAD..origin/"$BRANCH")"
  AHEAD="$(git rev-list --count origin/"$BRANCH"..HEAD)"

  if [[ "$BEHIND" -eq 0 ]]; then
    # We're ahead only, nothing to pull
    continue
  fi

  # --- Handle dirty working tree ---
  STASHED=false
  if ! git diff --quiet HEAD 2>/dev/null || ! git diff --cached --quiet HEAD 2>/dev/null; then
    git stash push -m "git-sync auto-stash $(date -u +%Y-%m-%dT%H:%M:%SZ)" 2>/dev/null
    STASHED=true
  fi

  # --- Handle untracked files that would conflict ---
  # Check for untracked files that exist in the incoming commits
  UNTRACKED_CONFLICTS="$(git merge-tree --write-tree --name-only HEAD "origin/$BRANCH" 2>/dev/null | grep -v '^[0-9a-f]' || true)"
  # Simpler approach: do a dry-run merge check
  MERGE_CHECK="$(git merge --no-commit --no-ff "origin/$BRANCH" 2>&1 || true)"
  git merge --abort 2>/dev/null || true
  if echo "$MERGE_CHECK" | grep -q "untracked working tree files would be overwritten"; then
    # Extract filenames and back them up
    BLOCKING_FILES="$(echo "$MERGE_CHECK" | grep -A100 "untracked working tree files" | grep -E '^\t' | sed 's/^\t//')"
    if [[ -n "$BLOCKING_FILES" ]]; then
      BACKUP_DIR="$REPO_DIR/.git/sync-backup-$(date -u +%Y%m%d%H%M%S)"
      mkdir -p "$BACKUP_DIR"
      while IFS= read -r f; do
        if [[ -f "$REPO_DIR/$f" ]]; then
          mkdir -p "$BACKUP_DIR/$(dirname "$f")"
          mv "$REPO_DIR/$f" "$BACKUP_DIR/$f"
        fi
      done <<< "$BLOCKING_FILES"
      CHANGES+=("🗂️ $REPO_NAME ($BRANCH): backed up conflicting untracked files to .git/sync-backup-*/")
    fi
  fi

  # --- Pull ---
  if [[ "$AHEAD" -gt 0 ]]; then
    # Diverged — try rebase to keep local commits on top
    if PULL_OUT="$(git pull --rebase origin "$BRANCH" 2>&1)"; then
      NEW_HEAD="$(git rev-parse --short HEAD)"
      CHANGES+=("🔄 $REPO_NAME ($BRANCH): rebased $AHEAD local + $BEHIND remote commits → $NEW_HEAD")
    else
      git rebase --abort 2>/dev/null || true
      # Fallback: try merge
      if PULL_OUT="$(git pull --no-rebase origin "$BRANCH" 2>&1)"; then
        NEW_HEAD="$(git rev-parse --short HEAD)"
        CHANGES+=("🔀 $REPO_NAME ($BRANCH): merged $BEHIND remote commits (diverged) → $NEW_HEAD")
      else
        # Check for merge conflicts
        CONFLICTS="$(git diff --name-only --diff-filter=U 2>/dev/null || true)"
        if [[ -n "$CONFLICTS" ]]; then
          git merge --abort 2>/dev/null || true
          ERRORS+=("❌ $REPO_NAME ($BRANCH): merge conflicts in: $CONFLICTS")
        else
          ERRORS+=("❌ $REPO_NAME ($BRANCH): pull failed — $PULL_OUT")
        fi
      fi
    fi
  else
    # Clean fast-forward
    if PULL_OUT="$(git pull --ff-only origin "$BRANCH" 2>&1)"; then
      NEW_HEAD="$(git rev-parse --short HEAD)"
      # Get summary of what changed
      SUMMARY="$(git log --oneline "$LOCAL".."$REMOTE" 2>/dev/null | head -5)"
      CHANGES+=("✅ $REPO_NAME ($BRANCH): pulled $BEHIND new commit(s) → $NEW_HEAD"$'\n'"$SUMMARY")
    else
      # ff-only failed, try regular pull
      if PULL_OUT="$(git pull origin "$BRANCH" 2>&1)"; then
        NEW_HEAD="$(git rev-parse --short HEAD)"
        CHANGES+=("✅ $REPO_NAME ($BRANCH): pulled $BEHIND new commit(s) → $NEW_HEAD")
      else
        ERRORS+=("❌ $REPO_NAME ($BRANCH): pull failed — $PULL_OUT")
      fi
    fi
  fi

  # --- Restore stash ---
  if [[ "$STASHED" == true ]]; then
    if ! STASH_OUT="$(git stash pop 2>&1)"; then
      ERRORS+=("⚠️ $REPO_NAME ($BRANCH): stash pop failed (your changes are in 'git stash list') — $STASH_OUT")
    fi
  fi
done

# --- Output ---
if [[ ${#CHANGES[@]} -eq 0 && ${#ERRORS[@]} -eq 0 ]]; then
  echo "::NOCHANGE::"
  exit 0
fi

if [[ ${#CHANGES[@]} -gt 0 ]]; then
  echo "::CHANGES::"
  for c in "${CHANGES[@]}"; do
    echo "$c"
  done
fi

if [[ ${#ERRORS[@]} -gt 0 ]]; then
  echo "::ERRORS::"
  for e in "${ERRORS[@]}"; do
    echo "$e"
  done
fi
