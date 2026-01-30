name: merge-and-build
description: >
  Merge a PR and kick off iOS/Android builds.
  Approval gate before triggering builds.

args:
  prId:
    description: "Azure DevOps PR ID to complete"
  project:
    description: "Azure DevOps project name (e.g., ALPA Mobile)"
  repository:
    description: "Azure DevOps repository name (e.g., ALPA-Mobile)"
  branch:
    description: "Branch to build after merge (usually the target branch)"
  ios:
    default: "true"
    description: "Trigger iOS build (true/false)"
  android:
    default: "false"
    description: "Trigger Android build (true/false)"

steps:
  - id: merge
    env:
      PR_ID: "${prId}"
      PR_PROJECT: "${project}"
      PR_REPO: "${repository}"
    command: |
      az repos pr update \
        --id "$PR_ID" \
        --status completed \
        --output json

  - id: confirm-builds
    env:
      PR_ID: "${prId}"
      BUILD_BRANCH: "${branch}"
      BUILD_IOS: "${ios}"
      BUILD_ANDROID: "${android}"
    command: |
      node -e "
        const items = [];
        if (process.env.BUILD_IOS === 'true') items.push({ build: 'iOS', branch: process.env.BUILD_BRANCH });
        if (process.env.BUILD_ANDROID === 'true') items.push({ build: 'Android', branch: process.env.BUILD_BRANCH });
        process.stdout.write(JSON.stringify({
          requiresApproval: {
            prompt: 'Trigger ' + items.map(i => i.build).join(' + ') + ' build(s) on branch ' + process.env.BUILD_BRANCH + ' after merging PR #' + process.env.PR_ID + '?',
            items: items
          }
        }));
      "
    approval: required

  - id: build-ios
    condition: "$confirm-builds.approved"
    env:
      BUILD_BRANCH: "${branch}"
      BUILD_PROJECT: "${project}"
    command: |
      if [ "${ios}" = "true" ]; then
        ~/clawd/ado-run.sh \
          --pipeline "ALPA Mobile iOS" \
          --branch "$BUILD_BRANCH" \
          --project "$BUILD_PROJECT" \
          --notify telegram
      else
        echo '{"skipped":true,"reason":"ios=false"}'
      fi

  - id: build-android
    condition: "$confirm-builds.approved"
    env:
      BUILD_BRANCH: "${branch}"
      BUILD_PROJECT: "${project}"
    command: |
      if [ "${android}" = "true" ]; then
        ~/clawd/ado-run.sh \
          --pipeline "ALPA Mobile Android" \
          --branch "$BUILD_BRANCH" \
          --project "$BUILD_PROJECT" \
          --notify telegram
      else
        echo '{"skipped":true,"reason":"android=false"}'
      fi
