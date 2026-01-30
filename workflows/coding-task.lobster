name: coding-task
description: >
  Delegated coding pipeline: worktree → code → PR → cleanup.
  No approval gates — runs end-to-end automatically.

args:
  repo:
    description: "Absolute path to the git repo (e.g., ~/repos/ALPA-Mobile)"
  project:
    description: "Azure DevOps project name (e.g., ALPA Mobile)"
  repository:
    description: "Azure DevOps repository name (e.g., ALPA-Mobile)"
  sourceBranch:
    description: "Branch to base the worktree off of"
  taskName:
    description: "Short name for branch suffix (e.g., fix-navbar)"
  task:
    description: "Full task description for the coding agent"
  prTitle:
    description: "PR title"
  prDescription:
    default: "Automated PR by Moltenbot"
    description: "PR description"

steps:
  - id: fetch
    command: "cd ${repo} && git fetch origin"

  - id: worktree
    command: "cd ${repo} && git worktree add -b moltenbot-${taskName} /tmp/moltenbot-${taskName} origin/${sourceBranch}"

  - id: code
    env:
      CODING_TASK: "${task}"
      CODING_PR_TITLE: "${prTitle}"
      CODING_BRANCH: "moltenbot-${taskName}"
    command: |
      PROMPT_FILE=$(mktemp)
      {
        echo "$CODING_TASK"
        echo ""
        echo "When complete:"
        echo "1. Update documentation if applicable"
        echo "2. Run /review to check for mistakes before committing"
        echo "3. Commit with message: $CODING_PR_TITLE"
        echo "4. Push: git push -u origin $CODING_BRANCH"
      } > "$PROMPT_FILE"
      cd /tmp/moltenbot-${taskName}
      /home/clawdbot/.local/bin/copilot -p --allow-all --no-auto-update --no-color --silent "$(cat "$PROMPT_FILE")"
      EXIT_CODE=$?
      rm -f "$PROMPT_FILE"
      exit $EXIT_CODE

  - id: create-pr
    env:
      PR_REPO: "${repository}"
      PR_PROJECT: "${project}"
      PR_SOURCE: "moltenbot-${taskName}"
      PR_TARGET: "${sourceBranch}"
      PR_TITLE: "${prTitle}"
      PR_DESC: "${prDescription}"
    command: |
      az repos pr create \
        --repository "$PR_REPO" \
        --project "$PR_PROJECT" \
        --source-branch "$PR_SOURCE" \
        --target-branch "$PR_TARGET" \
        --title "$PR_TITLE" \
        --description "$PR_DESC" \
        --output json

  - id: cleanup
    command: "cd ${repo} && git worktree remove /tmp/moltenbot-${taskName}"
