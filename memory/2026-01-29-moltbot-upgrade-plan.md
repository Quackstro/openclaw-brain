# Moltbot Upgrade Plan

**Date:** 2026-01-29
**From:** Clawdbot v2026.1.20 (git checkout)
**To:** Moltbot (new repo rebrand)

---

## Current State

| Item | Value |
|------|-------|
| **Version** | `2026.1.20` (git checkout) |
| **Repo** | `github.com/clawdbot/clawdbot.git` → `/home/clawdbot/clawdbot` |
| **Binary** | `/home/clawdbot/.local/bin/clawdbot` (wrapper → `~/clawdbot/dist/entry.js`) |
| **Config** | `~/.clawdbot/clawdbot.json` |
| **Managed by** | supervisord (`/etc/supervisor/conf.d/clawdbot.conf`) |
| **Node** | v24.13.0, pnpm 10.28.1 |

## What's Moltbot?

Rebrand of Clawdbot — same project by @steipete, new name, new repo (`github.com/moltbot/moltbot.git`). The npm `clawdbot` package still published (`2026.1.24-3` latest), but future is `moltbot` package. Beta: `2026.1.27-beta.1`.

## Key Facts

- Git method clones to `~/moltbot` (separate from `~/clawdbot`)
- Creates same wrapper at `~/.local/bin/clawdbot` → `~/moltbot/dist/entry.js`
- Config dir stays `~/.clawdbot/` — **config preserved automatically**
- Build: `pnpm install` + `pnpm ui:build` + `pnpm build` + `doctor`

---

## Implementation Strategy

### Execution Model

- **Phases 1-2** (clone, build, test): Handled by a **spawned sub-agent** — long-running task that doesn't block the main session.
- **Phase 3** (swap): Uses a **self-contained swap script** (`~/moltbot-swap.sh`). Can be triggered by the user via SSH or by Jarvis directly (gateway goes dark ~30s during restart).
- **Rollback**: `bash ~/moltbot-swap.sh --rollback`

### Why a swap script?

`supervisorctl stop clawdbot` kills the gateway process (which is Jarvis). A standalone bash script survives the process death and completes the stop → swap → start sequence atomically.

---

## Phase 1 — Clone & Build (no disruption)

**Executor:** Sub-agent (background)

```bash
git clone https://github.com/moltbot/moltbot.git ~/moltbot
cd ~/moltbot
pnpm install
pnpm ui:build
pnpm build
```

## Phase 2 — Test Without Swapping

**Executor:** Sub-agent (background)

```bash
# Verify it launches
node ~/moltbot/dist/entry.js --version

# Run doctor in non-interactive mode (dry check)
node ~/moltbot/dist/entry.js doctor --non-interactive

# Spot-check status
node ~/moltbot/dist/entry.js status
```

## Phase 3 — Swap (~30s downtime)

**Executor:** Swap script (`~/moltbot-swap.sh`) — run via SSH or triggered by Jarvis

The script does:
1. Pre-flight checks (verifies new entry point exists and runs)
2. Backs up current wrapper (`~/.local/bin/clawdbot.bak-TIMESTAMP`)
3. Stops gateway via `sudo supervisorctl stop clawdbot`
4. Rewrites wrapper to point to `~/moltbot/dist/entry.js`
5. Starts gateway via `sudo supervisorctl start clawdbot`
6. Runs health check

```bash
# Run the swap
bash ~/moltbot-swap.sh

# Or rollback if something goes wrong
bash ~/moltbot-swap.sh --rollback
```

### Swap Script Location
`~/moltbot-swap.sh` (already created, executable)

## Phase 4 — Post-Swap

- `clawdbot doctor` (full migration pass)
- Verify Telegram channel is connected
- Old repo at `~/clawdbot` kept as backup (remove later)

---

## Rollback

Two options:

### Option A: Use the swap script
```bash
bash ~/moltbot-swap.sh --rollback
```

### Option B: Manual
```bash
sudo supervisorctl stop clawdbot

cat > ~/.local/bin/clawdbot <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
exec node "/home/clawdbot/clawdbot/dist/entry.js" "$@"
EOF
chmod +x ~/.local/bin/clawdbot

sudo supervisorctl start clawdbot
```

## Risk Assessment

- **Low risk**: Config dir (`~/.clawdbot/`) is shared — nothing to migrate
- **Rollback**: Repoint wrapper + restart (~30s)
- **Downtime**: ~30 seconds during swap
- **Safety net**: Wrapper backup created automatically by swap script
