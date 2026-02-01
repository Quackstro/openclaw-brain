#!/usr/bin/env bash
# ============================================================================
# doc-rag safe deploy — sync updated plugin files + guarded restart
#
# 1. Backs up current production plugin
# 2. Syncs dev files → production
# 3. Restarts gateway
# 4. Monitors health for WATCHDOG_SEC seconds
# 5. If gateway dies or plugin fails to load → auto-rollback + restart
# ============================================================================

set -euo pipefail

DEV_DIR="/home/clawdbot/clawd/extensions/doc-rag"
PROD_DIR="/home/clawdbot/.openclaw/extensions/doc-rag"
BACKUP_DIR="/home/clawdbot/.openclaw/docrag-backups/doc-rag.bak-$(date +%Y%m%d-%H%M%S)"
GATEWAY_URL="http://127.0.0.1:18789"
GATEWAY_TOKEN="4ded707293fdda954ca58fe78642ed29d82af067cf5e867e"
WATCHDOG_SEC="${1:-60}"  # seconds to monitor (default 60)
CHECK_INTERVAL=5         # seconds between health checks
OPENCLAW_BIN="/home/clawdbot/.local/bin/openclaw"

# Files to sync (source TS files only — not node_modules, tests, fixtures)
SYNC_FILES=(
  config.ts
  parser.ts
  pipeline.ts
  types.ts
  store.ts
  chunker.ts
  auto-tagger.ts
  health.ts
  index.ts
  ocr.ts
  tags.ts
  openclaw.plugin.json
  package.json
)

log() { echo "[$(date +%H:%M:%S)] $*"; }

# ── Step 1: Backup ──────────────────────────────────────────────────────────
log "📦 Backing up production plugin → $BACKUP_DIR"
mkdir -p "$(dirname "$BACKUP_DIR")"
cp -a "$PROD_DIR" "$BACKUP_DIR"
log "   Backup complete ($(du -sh "$BACKUP_DIR" | cut -f1))"

# ── Step 2: Sync dev → production ────────────────────────────────────────────
log "📤 Syncing updated files from dev → production"
synced=0
for f in "${SYNC_FILES[@]}"; do
  if [ -f "$DEV_DIR/$f" ]; then
    if ! diff -q "$DEV_DIR/$f" "$PROD_DIR/$f" >/dev/null 2>&1; then
      cp "$DEV_DIR/$f" "$PROD_DIR/$f"
      log "   ✏️  $f (updated)"
      ((synced++)) || true
    fi
  fi
done
log "   $synced file(s) updated"

if [ "$synced" -eq 0 ]; then
  log "⚡ No files changed — skipping restart"
  rm -rf "$BACKUP_DIR"
  exit 0
fi

# ── Step 3: Restart gateway ──────────────────────────────────────────────────
log "🔄 Restarting gateway..."
sudo supervisorctl restart openclaw >/dev/null 2>&1 || {
  log "❌ supervisorctl restart failed — rolling back"
  rm -rf "$PROD_DIR"
  mv "$BACKUP_DIR" "$PROD_DIR"
  sudo supervisorctl restart openclaw >/dev/null 2>&1 || true
  exit 1
}

# Give gateway a moment to start
sleep 3

# ── Step 4: Watchdog — monitor health ────────────────────────────────────────
log "👁️  Watchdog active for ${WATCHDOG_SEC}s (checking every ${CHECK_INTERVAL}s)"

elapsed=0
consecutive_failures=0
MAX_CONSECUTIVE_FAILURES=3

while [ "$elapsed" -lt "$WATCHDOG_SEC" ]; do
  sleep "$CHECK_INTERVAL"
  elapsed=$((elapsed + CHECK_INTERVAL))

  # Check if gateway process is alive
  if ! sudo supervisorctl status openclaw 2>/dev/null | grep -q "RUNNING"; then
    log "💀 Gateway process not running at ${elapsed}s!"
    consecutive_failures=$((consecutive_failures + 1))
  else
    # Check HTTP health
    http_code=$(curl -s -o /dev/null -w "%{http_code}" \
      -H "Authorization: Bearer $GATEWAY_TOKEN" \
      "$GATEWAY_URL/api/health" 2>/dev/null || echo "000")
    
    if [ "$http_code" = "200" ] || [ "$http_code" = "204" ]; then
      consecutive_failures=0
      # Every 15 seconds, print a heartbeat
      if [ $((elapsed % 15)) -lt "$CHECK_INTERVAL" ]; then
        log "   ✅ Healthy at ${elapsed}s (HTTP $http_code)"
      fi
    else
      log "   ⚠️  HTTP $http_code at ${elapsed}s"
      consecutive_failures=$((consecutive_failures + 1))
    fi
  fi

  # Rollback if too many consecutive failures
  if [ "$consecutive_failures" -ge "$MAX_CONSECUTIVE_FAILURES" ]; then
    log "❌ ${MAX_CONSECUTIVE_FAILURES} consecutive health failures — ROLLING BACK"
    
    # Restore backup
    rm -rf "$PROD_DIR"
    mv "$BACKUP_DIR" "$PROD_DIR"
    log "   Restored backup"
    
    # Restart with old code
    sudo supervisorctl restart openclaw >/dev/null 2>&1 || true
    sleep 3
    
    # Verify recovery
    if sudo supervisorctl status openclaw 2>/dev/null | grep -q "RUNNING"; then
      log "   ✅ Rollback successful — gateway running with old code"
    else
      log "   ⚠️  Gateway still not running after rollback — manual intervention needed"
    fi
    exit 1
  fi
done

# ── Step 5: Success ──────────────────────────────────────────────────────────
log "✅ Watchdog complete — gateway healthy for ${WATCHDOG_SEC}s"
log "   Backup kept at: $BACKUP_DIR"
log "   To clean up: rm -rf $BACKUP_DIR"
exit 0
