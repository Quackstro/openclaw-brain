# Brain Actions

Action framework for [Brain Core](../brain-core/) drops. Detects actionable intents from classified thoughts and routes them to configurable handlers.

## How It Works

```
brain-core classifies a drop
     ↓
brain-actions detects intent
     ↓
┌─────────────────────────────────┐
│ Intent Detection (priority):    │
│ 1. Explicit tag ([reminder])    │
│ 2. Classifier detectedIntent    │
│ 3. Keyword heuristics           │
│ 4. Urgency + followUpDate       │
└─────────────────────────────────┘
     ↓
Route to handler → execute via hooks
```

## Supported Intents

| Intent | Tag | Handler | Description |
|--------|-----|---------|-------------|
| `reminder` | `[reminder]`, `[remind]` | Creates cron job + nag loop | Time-sensitive alerts |
| `booking` | `[book]`, `[appointment]` | Creates scheduled reminder | Appointments and meetings |
| `payment` | `[pay]`, `[send]`, `[tip]` | Resolve → approve → execute | Crypto payments (DOGE) |
| `todo` | `[todo]`, `[task]` | Tags record, no automation | Task tracking |
| `purchase` | `[buy]`, `[purchase]` | Tags record, no automation | Shopping lists |
| `call` | `[call]`, `[phone]` | Tags record, no automation | Call reminders |

## Configuration

```yaml
plugins:
  entries:
    - id: brain-actions
      config:
        enabled: true
        timezone: America/New_York
        extractionModel: claude-haiku-3.5
        gatewayToken: "..."           # For LLM time extraction calls
        reminder:
          enabled: true
          nagIntervalMinutes: 5       # Minutes between reminder nags
          defaultTime: "09:00"        # Default time when only date given
        payment:
          enabled: true
          autoExecuteThreshold: 0.95  # Confidence for auto-execute (0.0-1.0)
          maxAutoExecuteAmount: 10    # Max DOGE for auto-execute
```

## Hook System

Brain Actions doesn't deliver notifications or execute payments directly. Instead, it exposes hooks that your integration layer implements:

```typescript
// Register hooks from your personal plugin or workspace
api.callMethod("brain-actions:setReminderHook", async (text, nagJobId, opts) => {
  // Send reminder via Telegram, email, etc.
  await sendTelegramMessage(chatId, `⏰ ${text}`);
});

api.callMethod("brain-actions:setPaymentResolverHook", async (recipient, embedder) => {
  // Resolve "Alice" → DOGE address from contacts
  const contact = await searchContacts(recipient, embedder);
  return { resolved: true, address: contact.dogeAddress };
});

api.callMethod("brain-actions:setPaymentExecuteHook", async (params, resolution) => {
  // Execute payment via wallet
  return await walletSend(resolution.address, params.amount);
});

api.callMethod("brain-actions:setPaymentApprovalHook", async (params, resolution, actionId) => {
  // Show approval buttons to user
  await sendApprovalPrompt(params, resolution, actionId);
});
```

### Available Hooks

| Hook | Called When | Purpose |
|------|-----------|---------|
| `onReminderDeliver` | Reminder fires | Send notification to user |
| `onPaymentResolve` | Payment detected | Resolve recipient name → address |
| `onPaymentExecute` | Payment approved | Execute the transaction |
| `onPaymentApproval` | Payment needs approval | Show approval UI to user |
| `onActionRouted` | Any action routed | Audit, logging, notifications |

## API

Route an action programmatically:

```typescript
const result = await api.callMethod("brain-actions:route", {
  store,
  embedder,
  classification,
  rawText: "remind me to call Alice tomorrow at 3pm",
  inboxId: "abc-123",
  inputTag: "reminder",
});
// result: { action: "reminder-created", reminderAt: "2026-03-06T15:00:00", ... }
```

## Intent Detection Details

Detection uses a priority chain:

1. **Explicit tags** — `[reminder]`, `[pay]`, `[todo]` etc. in the input text (highest priority)
2. **Classifier output** — `detectedIntent` field from brain-core's LLM classification
3. **Keyword heuristics** — Pattern matching on the raw text (e.g., "send 5 DOGE to Alice")
4. **Urgency signals** — High urgency + follow-up date → treated as reminder

Payment detection is stricter: requires either an amount pattern (`10 DOGE`) or a recipient pattern (`to Alice`) alongside payment keywords.

## Time Extraction

For time-sensitive intents (reminders, bookings), brain-actions uses an LLM call to extract structured time information:

```typescript
// Input: "remind me to call the dentist next Tuesday at 2pm"
// Output:
{
  date: "2026-03-11",
  time: "14:00",
  timezone: "America/New_York",
  recurring: null,
  reminderText: "Call the dentist"
}
```

Supports recurring patterns via cron expressions for repeating reminders.

## Dependencies

- **Peer dependency**: `@quackstro/brain-core` — provides store, embedder, and classification types
- **Runtime**: OpenClaw plugin SDK (`api.registerMethod`, `api.registerService`)
