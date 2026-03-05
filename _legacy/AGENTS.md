# AGENTS.md - OpenClaw Workspace

This folder is the assistant's working directory.

## First run (one-time)
- If BOOTSTRAP.md exists, follow its ritual and delete it once complete.
- Your agent identity lives in IDENTITY.md.
- Your profile lives in USER.md.

## Backup tip (recommended)
If you treat this workspace as the agent's "memory", make it a git repo (ideally private) so identity
and notes are backed up.

```bash
git init
git add AGENTS.md
git commit -m "Add agent workspace"
```

## Safety defaults
- Don't exfiltrate secrets or private data.
- Don't run destructive commands unless explicitly asked.
- Be concise in chat; write longer output to files in this workspace.

## Sub-agent announce delivery
- When a sub-agent completes and posts an announce, the message arrives as an internal system event (no Telegram routing)
- **Always use `openclaw message send` via exec** to explicitly send the summary to Telegram after processing an announce
- Command: `openclaw message send --channel telegram --target 8511108690 --message "..."`
- The `message` tool doesn't recognize `telegram` as a channel — use the CLI instead
- This ensures the user actually sees sub-agent results instead of them silently sitting in the session transcript

## Daily memory (recommended)
- Keep a short daily log at memory/YYYY-MM-DD.md (create memory/ if needed).
- On session start, read today + yesterday if present.
- Capture durable facts, preferences, and decisions; avoid secrets.

## Heartbeats (optional)
- HEARTBEAT.md can hold a tiny checklist for heartbeat runs; keep it small.

## Telegram Inline Button Callbacks
When a user clicks an inline button on Telegram, the callback_data arrives as a
regular user message. Handle these patterns silently (no verbose response needed):

---

## DOGE Wallet Callbacks (low balance alerts)

### Dismiss: `doge:lowbal:dismiss`
1. Update alert state: set dismissed=true in `~/.openclaw/doge/alert-state.json`
2. Reply briefly: "✅ Low balance alert dismissed."

### Snooze: `doge:lowbal:snooze:<hours>`
1. Update alert state: set snoozedUntil to now + hours in ms
2. Reply briefly: "💤 Snoozed for X hours."

Example handler (node one-liner):
```bash
node -e "const fs=require('fs'),p='/home/clawdbot/.openclaw/doge/alert-state.json',s=JSON.parse(fs.readFileSync(p));s.snoozedUntil=Date.now()+12*3600000;fs.writeFileSync(p,JSON.stringify(s,null,2));console.log('Snoozed until',new Date(s.snoozedUntil).toISOString())"
```

---

## Brain Reminder Callbacks (inline button handling)
When a user clicks a Brain reminder inline button on Telegram, the callback_data
arrives as a regular user message. Handle these patterns:

### Dismiss: `brain:dismiss:<jobId>`
1. Run: `openclaw cron rm <jobId>` (deletes the nag cron job)
2. Reply: "✅ Reminder dismissed."

### Snooze: `brain:snooze:<jobId>:<minutes>`
1. Run: `openclaw cron disable <jobId>` (pauses the nag)
2. Create a one-shot to re-enable: `openclaw cron add --name "Brain Snooze End" --at "+<minutes>m" --session main --system-event "brain:enable:<jobId>" --delete-after-run`
3. Reply: "💤 Snoozed for <minutes> minutes."

### Re-enable after snooze: `brain:enable:<jobId>` (arrives as system event)
1. Run: `openclaw cron enable <jobId>`
2. No reply needed (the nag will fire on its own).

### Notes
- The jobId is the UUID of the recurring nag cron job
- These callbacks are ALWAYS handled — even after context compaction
- The brain-reminder.mjs script handles Telegram message delivery with buttons
- Nag jobs fire every 5 minutes until dismissed or snoozed

---

## Brain Payment Callbacks (inline button handling)
When a user clicks a Brain payment inline button on Telegram, the callback_data
arrives as a regular user message. Handle these patterns:

### Approve: `brain:pay:approve:<actionId>`
1. Read the pending action file: `~/.openclaw/brain/pending-actions/<actionId>.json`
2. Execute: `openclaw wallet send --to <address> --amount <amount> --reason "<reason>"`
3. Update action status to "complete", record txid
4. Send confirmation to Telegram: "Payment Sent: <amount> DOGE to <recipient>, TxID: <txid>"
5. Log to brain audit trail
6. Delete the pending action file

### Edit Amount: `brain:pay:edit:<actionId>`
1. Reply asking for the new amount: "What amount should I send? (Current: X DOGE)"
2. On next user message with a number, update the pending action file with new amount
3. Re-send the approval message with updated amount

### Dismiss: `brain:pay:dismiss:<actionId>`
1. Read and delete the pending action file: `~/.openclaw/brain/pending-actions/<actionId>.json`
2. Log dismissal to brain audit trail
3. Reply: "Payment dismissed."

### Notes
- The actionId is a UUID stored in `~/.openclaw/brain/pending-actions/`
- These callbacks are ALWAYS handled -- even after context compaction
- Payment actions are stored as JSON files with { action, resolution, inboxId }

## Customize
- Add your preferred style, rules, and "memory" here.
