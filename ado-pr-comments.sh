#!/usr/bin/env bash
# ado-pr-comments.sh — Check Azure DevOps PRs for new comments and notify via Clawdbot
# Usage: ./ado-pr-comments.sh [--project "ALPA Mobile"] [--org "https://dev.azure.com/airlinepilotsassociation"]

set -euo pipefail

# Defaults
PROJECT="${ADO_PROJECT:-ALPA Mobile}"
ORG="${ADO_ORG:-https://dev.azure.com/airlinepilotsassociation}"
STATE_DIR="$HOME/clawd/.ado-pr-state"
NOTIFY_TARGET="telegram"

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --project) PROJECT="$2"; shift 2 ;;
    --org) ORG="$2"; shift 2 ;;
    *) shift ;;
  esac
done

mkdir -p "$STATE_DIR"

TIMESTAMP_FILE="$STATE_DIR/last_checked"
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Get last check time (default: 30 min ago if first run)
if [[ -f "$TIMESTAMP_FILE" ]]; then
  LAST_CHECKED=$(cat "$TIMESTAMP_FILE")
else
  LAST_CHECKED=$(date -u -d '30 minutes ago' +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -v-30M +"%Y-%m-%dT%H:%M:%SZ")
fi

echo "[$(date -u +%H:%M:%S)] Checking PRs in '$PROJECT' since $LAST_CHECKED"

# Get repo ID
REPO_ID=$(az repos show --repository "$PROJECT" --project "$PROJECT" --org "$ORG" --query 'id' -o tsv 2>/dev/null)
if [[ -z "$REPO_ID" ]]; then
  echo "ERROR: Could not find repository for project '$PROJECT'"
  exit 1
fi

# Get active PRs
PRS=$(az repos pr list --project "$PROJECT" --org "$ORG" --status active --output json 2>/dev/null)
PR_COUNT=$(echo "$PRS" | jq length)
echo "Found $PR_COUNT active PR(s)"

NEW_COMMENTS=""
DELEGATE_TASKS="[]"
BUILD_TASKS="[]"

for i in $(seq 0 $((PR_COUNT - 1))); do
  PR_ID=$(echo "$PRS" | jq -r ".[$i].pullRequestId")
  PR_TITLE=$(echo "$PRS" | jq -r ".[$i].title")
  PR_SOURCE=$(echo "$PRS" | jq -r ".[$i].sourceRefName" | sed 's|refs/heads/||')
  PR_TARGET=$(echo "$PRS" | jq -r ".[$i].targetRefName" | sed 's|refs/heads/||')

  # Get threads for this PR
  THREADS=$(az devops invoke \
    --area git --resource pullRequestThreads \
    --route-parameters project="$PROJECT" repositoryId="$REPO_ID" pullRequestId="$PR_ID" \
    --org "$ORG" --output json 2>/dev/null)

  # Filter for new human comments (exclude system/automated)
  NEW=$(echo "$THREADS" | jq -r --arg since "$LAST_CHECKED" '
    [.value[] |
      select(.comments[0].publishedDate > $since) |
      select(.comments[0].author.displayName != "Microsoft.VisualStudio.Services.TFS") |
      select(.comments[0].commentType != "system") |
      {
        file: (.threadContext.filePath // "General"),
        line: (.threadContext.rightFileStart.line // null),
        author: .comments[0].author.displayName,
        date: .comments[0].publishedDate,
        content_full: .comments[0].content,
        content: (.comments[0].content | gsub("\n"; " ") | if length > 200 then .[:200] + "..." else . end),
        status: (.status // "none"),
        mentions_clawdbot: (.comments[0].content | test("@clawdbot"; "i")),
        mentions_ios: (.comments[0].content | test("@ios"; "i")),
        mentions_android: (.comments[0].content | test("@android"; "i")),
        mentions_build: (.comments[0].content | test("@build"; "i"))
      }
    ] | sort_by(.date)')

  COUNT=$(echo "$NEW" | jq length)
  if [[ "$COUNT" -gt 0 ]]; then
    echo "  PR #$PR_ID ($PR_TITLE): $COUNT new comment(s)"

    for j in $(seq 0 $((COUNT - 1))); do
      AUTHOR=$(echo "$NEW" | jq -r ".[$j].author")
      CONTENT=$(echo "$NEW" | jq -r ".[$j].content")
      CONTENT_FULL=$(echo "$NEW" | jq -r ".[$j].content_full")
      FILE=$(echo "$NEW" | jq -r ".[$j].file")
      LINE=$(echo "$NEW" | jq -r ".[$j].line")
      MENTIONS=$(echo "$NEW" | jq -r ".[$j].mentions_clawdbot")

      COMMENT_MSG="💬 **New PR Comment**
**PR #${PR_ID}:** ${PR_TITLE}
**By:** ${AUTHOR}
**File:** ${FILE}
**Comment:** ${CONTENT}"

      MENTIONS_IOS=$(echo "$NEW" | jq -r ".[$j].mentions_ios")
      MENTIONS_ANDROID=$(echo "$NEW" | jq -r ".[$j].mentions_android")
      MENTIONS_BUILD=$(echo "$NEW" | jq -r ".[$j].mentions_build")

      if [[ "$MENTIONS" == "true" ]]; then
        # Strip @clawdbot mention from the task text
        TASK_TEXT=$(echo "$CONTENT_FULL" | sed -E 's/@clawdbot//gi' | sed -E 's/@ios//gi' | sed -E 's/@android//gi' | sed -E 's/@build//gi' | sed 's/^[[:space:]]*//' | sed 's/[[:space:]]*$//')

        COMMENT_MSG="${COMMENT_MSG}

🤖 _@clawdbot mentioned — AUTO-DELEGATING_"

        # Build delegation context as JSON
        DELEGATE_TASKS=$(echo "$DELEGATE_TASKS" | jq \
          --arg pr_id "$PR_ID" \
          --arg pr_title "$PR_TITLE" \
          --arg source_branch "$PR_SOURCE" \
          --arg target_branch "$PR_TARGET" \
          --arg file "$FILE" \
          --arg line "$LINE" \
          --arg task "$TASK_TEXT" \
          --arg author "$AUTHOR" \
          '. + [{pr_id: $pr_id, pr_title: $pr_title, source_branch: $source_branch, target_branch: $target_branch, file: $file, line: $line, task: $task, author: $author}]')
      fi

      # Detect build triggers: @ios, @android, @build
      TRIGGER_IOS=false
      TRIGGER_ANDROID=false
      if [[ "$MENTIONS_BUILD" == "true" ]]; then
        TRIGGER_IOS=true
        TRIGGER_ANDROID=true
      fi
      [[ "$MENTIONS_IOS" == "true" ]] && TRIGGER_IOS=true
      [[ "$MENTIONS_ANDROID" == "true" ]] && TRIGGER_ANDROID=true

      if [[ "$TRIGGER_IOS" == "true" || "$TRIGGER_ANDROID" == "true" ]]; then
        # Determine if this is also a @clawdbot delegation
        # If so, build should run AFTER the fix is pushed (post_delegate)
        BUILD_TRIGGER_MODE="immediate"
        [[ "$MENTIONS" == "true" ]] && BUILD_TRIGGER_MODE="post_delegate"

        BUILD_TASKS=$(echo "$BUILD_TASKS" | jq \
          --arg pr_id "$PR_ID" \
          --arg pr_title "$PR_TITLE" \
          --arg branch "$PR_SOURCE" \
          --argjson ios "$TRIGGER_IOS" \
          --argjson android "$TRIGGER_ANDROID" \
          --arg author "$AUTHOR" \
          --arg mode "$BUILD_TRIGGER_MODE" \
          '. + [{pr_id: $pr_id, pr_title: $pr_title, branch: $branch, ios: $ios, android: $android, author: $author, trigger_mode: $mode}]')

        PLATFORMS=""
        [[ "$TRIGGER_IOS" == "true" ]] && PLATFORMS="iOS"
        [[ "$TRIGGER_ANDROID" == "true" ]] && PLATFORMS="${PLATFORMS:+$PLATFORMS + }Android"

        if [[ "$BUILD_TRIGGER_MODE" == "post_delegate" ]]; then
          COMMENT_MSG="${COMMENT_MSG}
🏗️ _${PLATFORMS} build queued — will trigger after fix is pushed to ${PR_SOURCE}_"
        else
          COMMENT_MSG="${COMMENT_MSG}
🏗️ _Triggering ${PLATFORMS} build on ${PR_SOURCE}_"
        fi
      fi

      NEW_COMMENTS="${NEW_COMMENTS}${COMMENT_MSG}\n---\n"
    done
  else
    echo "  PR #$PR_ID ($PR_TITLE): no new comments"
  fi
done

# Save current timestamp
echo "$NOW" > "$TIMESTAMP_FILE"

# Output results
if [[ -n "$NEW_COMMENTS" ]]; then
  echo ""
  echo "=== NEW COMMENTS FOUND ==="
  echo -e "$NEW_COMMENTS"
  echo "::NOTIFY::$(echo -e "$NEW_COMMENTS")"
fi

# Output delegation tasks
DELEGATE_COUNT=$(echo "$DELEGATE_TASKS" | jq length)
if [[ "$DELEGATE_COUNT" -gt 0 ]]; then
  echo ""
  echo "::DELEGATE::${DELEGATE_TASKS}"
fi

# Output build tasks
BUILD_COUNT=$(echo "$BUILD_TASKS" | jq length)
if [[ "$BUILD_COUNT" -gt 0 ]]; then
  echo ""
  echo "::BUILD::${BUILD_TASKS}"
fi

if [[ -z "$NEW_COMMENTS" ]]; then
  echo "No new comments found."
fi

exit 0
