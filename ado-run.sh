#!/bin/bash
# ado-run.sh - Trigger and monitor an Azure DevOps pipeline with notifications

set -e

# --- Defaults ---
PIPELINE_NAME="ALPA Mobile iOS"
BRANCH="scim-flow"
PROJECT="ALPA Mobile"
POLL_INTERVAL=30
NOTIFY_CHANNELS=""  # comma-separated: telegram,slack,discord
NOTIFY_TARGET=""    # optional: specific chat/channel ID
NOTIFY_ON_START=false

# Default Telegram target (Dr. Castro's chat ID)
DEFAULT_TELEGRAM_TARGET="8511108690"

# --- Usage ---
usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Trigger an Azure DevOps pipeline and monitor until completion.

Options:
  -p, --pipeline NAME    Pipeline name (default: "$PIPELINE_NAME")
  -b, --branch BRANCH    Branch to build (default: "$BRANCH")
  -P, --project PROJECT  Azure DevOps project (default: "$PROJECT")
  -i, --interval SECS    Poll interval in seconds (default: $POLL_INTERVAL)
  -n, --notify CHANNELS  Notification channels, comma-separated
                         Options: telegram, slack, discord, signal
  -t, --target ID        Target chat/channel ID for notifications
  -s, --notify-start     Also notify when build starts
  -h, --help             Show this help

Examples:
  $(basename "$0")
  $(basename "$0") -p "My Pipeline" -b main --notify telegram
  $(basename "$0") -p "My Pipeline" -b feature/x --notify telegram,slack --notify-start
  $(basename "$0") --notify telegram --target "@mychannel"

Environment variables (alternative to flags):
  PIPELINE_NAME, BRANCH, PROJECT, POLL_INTERVAL
  NOTIFY_CHANNELS, NOTIFY_TARGET, NOTIFY_ON_START
EOF
  exit 0
}

# --- Parse arguments ---
while [[ $# -gt 0 ]]; do
  case "$1" in
    -p|--pipeline)
      PIPELINE_NAME="$2"
      shift 2
      ;;
    -b|--branch)
      BRANCH="$2"
      shift 2
      ;;
    -P|--project)
      PROJECT="$2"
      shift 2
      ;;
    -i|--interval)
      POLL_INTERVAL="$2"
      shift 2
      ;;
    -n|--notify)
      NOTIFY_CHANNELS="$2"
      shift 2
      ;;
    -t|--target)
      NOTIFY_TARGET="$2"
      shift 2
      ;;
    -s|--notify-start)
      NOTIFY_ON_START=true
      shift
      ;;
    -h|--help)
      usage
      ;;
    *)
      echo "Unknown option: $1"
      usage
      ;;
  esac
done

# --- Notification function ---
notify() {
  local message="$1"
  
  [[ -z "$NOTIFY_CHANNELS" ]] && return 0
  
  IFS=',' read -ra CHANNELS <<< "$NOTIFY_CHANNELS"
  for channel in "${CHANNELS[@]}"; do
    channel=$(echo "$channel" | xargs)  # trim whitespace
    echo "📨 Sending $channel notification..."
    
    # Determine target: use explicit target, or fall back to channel defaults
    local target="$NOTIFY_TARGET"
    if [[ -z "$target" ]]; then
      case "$channel" in
        telegram)
          target="$DEFAULT_TELEGRAM_TARGET"
          ;;
      esac
    fi
    
    if [[ -n "$target" ]]; then
      clawdbot message send --channel "$channel" --target "$target" --message "$message" 2>&1 || {
        echo "   ⚠️  Failed to send to $channel"
      }
    else
      echo "   ⚠️  No target configured for $channel — skipping"
    fi
  done
}

# --- Format message for notifications ---
format_message() {
  local status="$1"
  local emoji="$2"
  local include_url="${3:-true}"
  
  local msg="${emoji} *${PIPELINE_NAME}* ${status}
📌 Branch: \`${BRANCH}\`
🏗️ Project: ${PROJECT}"
  
  if [[ "$include_url" == "true" && -n "$WEB_URL" ]]; then
    msg="${msg}
🔗 [View Run](${WEB_URL})"
  fi
  
  echo "$msg"
}

# --- Trigger the pipeline ---
echo "🚀 Triggering pipeline: '$PIPELINE_NAME' on branch '$BRANCH'..."

RUN_JSON=$(az pipelines run \
  --name "$PIPELINE_NAME" \
  --branch "$BRANCH" \
  --project "$PROJECT" \
  --output json)

RUN_ID=$(echo "$RUN_JSON" | jq -r '.id')
# _links.web.href is often null from az CLI, so construct the URL manually
PROJECT_ENCODED=$(echo "$PROJECT" | sed 's/ /%20/g')
WEB_URL="https://dev.azure.com/airlinepilotsassociation/${PROJECT_ENCODED}/_build/results?buildId=${RUN_ID}"

echo "✅ Pipeline triggered!"
echo "   Run ID:  $RUN_ID"
echo "   URL:     $WEB_URL"
echo ""

# --- Notify on start ---
if [[ "$NOTIFY_ON_START" == "true" ]]; then
  notify "$(format_message "started" "🚀")"
fi

echo "📡 Monitoring progress (Ctrl+C to stop watching)..."
echo "---------------------------------------------------"

# --- Poll until complete ---
while true; do
  RUN_STATUS=$(az pipelines runs show \
    --id "$RUN_ID" \
    --project "$PROJECT" \
    --query "{status:status, result:result}" \
    --output json)

  STATUS=$(echo "$RUN_STATUS" | jq -r '.status')
  RESULT=$(echo "$RUN_STATUS" | jq -r '.result')

  TIMESTAMP=$(date '+%H:%M:%S')

  case "$STATUS" in
    "notStarted")
      echo "[$TIMESTAMP] ⏳ Queued..."
      ;;
    "inProgress")
      echo "[$TIMESTAMP] 🔄 In progress..."
      ;;
    "completed")
      echo ""
      case "$RESULT" in
        "succeeded")
          echo "[$TIMESTAMP] ✅ Build SUCCEEDED!"
          notify "$(format_message "succeeded" "✅")"
          exit 0
          ;;
        "failed")
          echo "[$TIMESTAMP] ❌ Build FAILED!"
          echo "   Check logs: $WEB_URL"
          notify "$(format_message "FAILED" "❌")"
          exit 1
          ;;
        "canceled")
          echo "[$TIMESTAMP] ⚠️  Build CANCELED"
          notify "$(format_message "was canceled" "⚠️")"
          exit 2
          ;;
        "partiallySucceeded")
          echo "[$TIMESTAMP] ⚠️  Build PARTIALLY SUCCEEDED"
          echo "   Check logs: $WEB_URL"
          notify "$(format_message "partially succeeded" "⚠️")"
          exit 0
          ;;
        *)
          echo "[$TIMESTAMP] 🏁 Build completed with result: $RESULT"
          notify "$(format_message "completed: ${RESULT}" "🏁")"
          exit 0
          ;;
      esac
      ;;
    *)
      echo "[$TIMESTAMP] 🔹 Status: $STATUS"
      ;;
  esac

  sleep "$POLL_INTERVAL"
done
