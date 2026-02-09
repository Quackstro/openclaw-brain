/**
 * Brain 2.0 — Action Router.
 *
 * Runs after classification + routing in the /drop pipeline (step 3.5).
 * Inspects classified thoughts for time-sensitive patterns and
 * automatically creates persistent cron job reminders.
 *
 * Persistent reminders:
 * - Send a Telegram message with inline buttons (Dismiss / Snooze)
 * - Nag every 5 minutes until the user takes action
 * - Uses brain-reminder.mjs script for direct Telegram API calls (no LLM per nag)
 *
 * All errors are non-fatal — the drop pipeline always completes
 * even if action routing fails.
 *
 * Design: detection heuristic → LLM time extraction → cron creation → audit.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { ClassificationResult, DetectedIntent, EmbeddingProvider } from "./schemas.js";
import type { BrainStore } from "./store.js";
import { logAudit } from "./audit.js";
import { tagToIntent, type InputTag } from "./tag-parser.js";
import { resolvePaymentEntities, type PaymentResolution } from "./payment-resolver.js";
import { createPaymentAction } from "./payment-action.js";
import { evaluatePaymentPolicy, type PolicyDecision } from "./action-policy.js";
import { sendPaymentApproval, sendPaymentConfirmation, sendPaymentFailure } from "./payment-approval.js";

const execFileAsync = promisify(execFile);

// ============================================================================
// Constants
// ============================================================================

/** Path to the reminder delivery script. */
const REMINDER_SCRIPT = "/home/clawdbot/clawd/scripts/brain-reminder.mjs";

/** Nag interval in minutes. */
const NAG_INTERVAL_MIN = 5;

// ============================================================================
// Config
// ============================================================================

export interface ActionRouterConfig {
  gatewayToken: string;
  gatewayUrl?: string;       // default: http://127.0.0.1:18789
  timezone?: string;         // default: America/New_York
  telegramChatId?: string;   // default: 8511108690
  extractionModel?: string;  // default: claude-haiku-3.5
  enabled?: boolean;         // default: true
  embedder?: EmbeddingProvider; // needed for payment entity resolution
}

// ============================================================================
// Result types
// ============================================================================

export type ActionType =
  | "no-action"
  | "reminder-created"
  | "booking-created"
  | "todo-tagged"
  | "purchase-tagged"
  | "call-tagged"
  | "payment-proposed"
  | "payment-resolved"
  | "payment-executed"
  | "payment-auto-executed"
  | "payment-pending"
  | "payment-failed";

export interface ActionResult {
  action: ActionType;
  triggerJobId?: string;
  nagJobId?: string;
  name?: string;
  reminderAt?: string;
  details?: string;
}

/** Shape of the LLM time extraction response. */
interface TimeExtraction {
  date: string | null;
  time: string | null;
  timezone: string;
  recurring: string | null;
  reminderText: string;
}

// ============================================================================
// Detection heuristic — should we even try?
// ============================================================================

/** Regex patterns for time-sensitive text. */
const TIME_PATTERNS = [
  /\bat\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i,
  /\bat\s+noon\b/i,
  /\bat\s+midnight\b/i,
  /\bby\s+tomorrow\b/i,
  /\bby\s+monday\b/i,
  /\bby\s+tuesday\b/i,
  /\bby\s+wednesday\b/i,
  /\bby\s+thursday\b/i,
  /\bby\s+friday\b/i,
  /\bby\s+saturday\b/i,
  /\bby\s+sunday\b/i,
  /\bevery\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|day|week|month|morning|evening|night)\b/i,
];

/** Keyword stems that suggest time-sensitive / reminder intent. */
const REMINDER_KEYWORDS = [
  "remind",
  "don't forget",
  "dont forget",
  "alarm",
  "wake me",
  "notify me",
  "at noon",
  "at midnight",
  "turn on",
  "turn off",
];

/**
 * Quick heuristic: should we invoke the LLM for time extraction?
 * Returns true only when the text is clearly time-sensitive.
 *
 * @param classification - The classification result
 * @param rawText - Original raw text
 * @returns true if the action router should proceed
 */
export function shouldRoute(
  classification: ClassificationResult,
  rawText: string,
): boolean {
  const lower = rawText.toLowerCase();

  // 1. Classification has urgency "now" or "today" WITH date entities
  if (
    (classification.urgency === "now" || classification.urgency === "today") &&
    classification.entities.dates.length > 0
  ) {
    return true;
  }

  // 2. followUpDate is set
  if (classification.followUpDate) {
    return true;
  }

  // 3. Reminder keywords
  for (const kw of REMINDER_KEYWORDS) {
    if (lower.includes(kw)) {
      return true;
    }
  }

  // 4. Time patterns via regex
  for (const pattern of TIME_PATTERNS) {
    if (pattern.test(lower)) {
      return true;
    }
  }

  return false;
}

// ============================================================================
// Time extraction via LLM
// ============================================================================

/**
 * Call the gateway LLM to extract time information from a thought.
 * Returns null if no actionable time can be determined.
 *
 * @param rawText - Original raw text
 * @param classification - Classification result
 * @param config - Action router config
 * @returns Extracted time info, or null
 */
async function extractTime(
  rawText: string,
  classification: ClassificationResult,
  config: ActionRouterConfig,
): Promise<TimeExtraction | null> {
  const gatewayUrl = config.gatewayUrl ?? "http://127.0.0.1:18789";
  const model = config.extractionModel ?? "claude-haiku-3.5";
  const timezone = config.timezone ?? "America/New_York";
  const now = new Date().toISOString();

  const prompt = `You are a time extraction engine. Given a thought/note and its classification, extract the exact reminder time.

Current date/time (UTC): ${now}
User timezone: ${timezone}

Rules:
- Return the reminder time in the USER's timezone (not UTC)
- "noon" = 12:00, "midnight" = 00:00
- "tomorrow" = next calendar day in user timezone
- "Monday", "Tuesday" etc. = next occurrence of that day
- "every Monday" = recurring (return cron expression in 5-field format)
- If no specific time but a date is given, default to 09:00
- If the text says "today" with no specific time, do NOT create a reminder (return null)
- Extract WHAT to remind about (strip "remind me" prefix, keep the action)

Thought: "${rawText}"

Classification:
- Urgency: ${classification.urgency}
- Date entities: ${JSON.stringify(classification.entities.dates)}
- Follow-up date: ${classification.followUpDate ?? "none"}
- Title: ${classification.title}

OUTPUT (JSON only, no markdown fences):
{
  "date": "YYYY-MM-DD or null",
  "time": "HH:MM or null",
  "timezone": "${timezone}",
  "recurring": null or "cron expression (5-field)",
  "reminderText": "what to remind about"
}`;

  const requestBody = {
    model,
    max_tokens: 256,
    messages: [{ role: "user", content: prompt }],
  };

  const response = await fetch(`${gatewayUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.gatewayToken}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`[brain] Action router: LLM call failed: ${response.status} ${body.slice(0, 300)}`);
    return null;
  }

  const data = (await response.json()) as any;
  const textContent = data.choices?.[0]?.message?.content;
  if (!textContent) {
    console.error("[brain] Action router: No text in LLM response");
    return null;
  }

  // Strip markdown fences if present, then extract JSON object
  let jsonStr = textContent
    .replace(/^```(?:json)?\s*\n?/m, "")
    .replace(/\n?```\s*$/m, "")
    .trim();

  const startIdx = jsonStr.indexOf("{");
  if (startIdx >= 0) {
    let depth = 0;
    let endIdx = startIdx;
    for (let i = startIdx; i < jsonStr.length; i++) {
      if (jsonStr[i] === "{") depth++;
      else if (jsonStr[i] === "}") depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
    jsonStr = jsonStr.slice(startIdx, endIdx + 1);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    console.error(`[brain] Action router: Failed to parse LLM JSON: ${jsonStr.slice(0, 200)}`);
    return null;
  }

  // Validate required fields
  if (!parsed.date && !parsed.recurring) {
    return null;
  }

  return {
    date: parsed.date ?? null,
    time: parsed.time ?? null,
    timezone: parsed.timezone ?? timezone,
    recurring: parsed.recurring ?? null,
    reminderText: parsed.reminderText ?? classification.title,
  };
}

// ============================================================================
// Timezone conversion
// ============================================================================

/**
 * Convert a local date/time string into a UTC timestamp (milliseconds).
 * Uses Intl.DateTimeFormat to compute the UTC offset for the given timezone.
 *
 * @param dateStr - Date in YYYY-MM-DD format
 * @param timeStr - Time in HH:MM (24h) format
 * @param timezone - IANA timezone string
 * @returns UTC timestamp in milliseconds
 */
function localToUtcMs(dateStr: string, timeStr: string, timezone: string): number {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = timeStr.split(":").map(Number);

  // Start with a UTC guess: interpret date/time as if it were UTC
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  // Format that UTC guess in the target timezone to see what the offset is
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date(utcGuess));
  const getPart = (type: string) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? "0");

  const tzHour = getPart("hour") === 24 ? 0 : getPart("hour");
  const tzTimeUtc = Date.UTC(
    getPart("year"),
    getPart("month") - 1,
    getPart("day"),
    tzHour,
    getPart("minute"),
    0,
    0,
  );

  // The offset is how much the timezone-formatted time differs from the UTC guess
  const offset = tzTimeUtc - utcGuess;

  // Subtract the offset to convert local → UTC
  return utcGuess - offset;
}

// ============================================================================
// Cron job helpers
// ============================================================================

/**
 * Run `openclaw cron add` and return the job ID.
 * Returns null on failure (non-fatal).
 *
 * Note: openclaw CLI prints banner lines (plugin registration, etc.)
 * before the JSON output. We extract the JSON block from stdout.
 */
async function cronAdd(args: string[]): Promise<string | null> {
  try {
    const { stdout, stderr } = await execFileAsync("openclaw", ["cron", "add", ...args], {
      timeout: 15000,
    });

    // Extract the JSON object from stdout (skip banner lines)
    const lines = stdout.split("\n");
    let jsonStr = "";
    let inJson = false;
    let depth = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!inJson && trimmed.startsWith("{")) {
        inJson = true;
      }
      if (inJson) {
        jsonStr += line + "\n";
        for (const ch of trimmed) {
          if (ch === "{") depth++;
          else if (ch === "}") depth--;
        }
        if (depth === 0) break;
      }
    }

    if (!jsonStr) {
      console.error("[brain] Action router: No JSON in cron output:", stdout.slice(0, 300));
      return null;
    }

    const result = JSON.parse(jsonStr.trim());
    const jobId = result?.id ?? result?.jobId ?? null;
    if (!jobId) {
      console.error("[brain] Action router: No job ID in parsed output:", jsonStr.slice(0, 200));
      return null;
    }

    return jobId;
  } catch (err) {
    console.error("[brain] Action router: Failed to create cron job:", err);
    return null;
  }
}

/**
 * Build the agent message for the reminder delivery.
 * The isolated agent runs the brain-reminder.mjs script and optionally
 * enables the nag cron job.
 */
function buildAgentMessage(
  reminderText: string,
  nagJobId: string,
  chatId: string,
  enableNag: boolean,
): string {
  const scriptCmd = `node ${REMINDER_SCRIPT} --text "⏰ Reminder: ${reminderText.replace(/"/g, '\\"')}" --nag-job "${nagJobId}" --chat-id "${chatId}"`;

  let msg = `Execute the following commands using the exec tool, then reply with ONLY: NO_REPLY\n\n`;
  msg += `Command 1: ${scriptCmd}\n`;

  if (enableNag) {
    msg += `Command 2: openclaw cron enable ${nagJobId}\n`;
    msg += `\nIMPORTANT: Run both commands. The first sends the reminder, the second enables the recurring nag.\n`;
  }

  msg += `\nDo not produce any other output. Just run the command(s) and reply NO_REPLY.`;
  return msg;
}

// ============================================================================
// Persistent reminder creation
// ============================================================================

/**
 * Create a persistent reminder with two cron jobs:
 *
 * 1. **Nag job** (recurring every 5 min, initially DISABLED):
 *    Sends the reminder to Telegram with inline buttons.
 *    Enabled by the trigger job when the reminder time arrives.
 *
 * 2. **Trigger job** (one-shot at target time, auto-deletes):
 *    Sends the first reminder with buttons AND enables the nag job.
 *
 * For recurring patterns (e.g., "every Monday"), creates a single recurring
 * cron that sends the reminder with buttons each time.
 *
 * @returns Object with triggerJobId and nagJobId, or null on failure
 */
async function createPersistentReminder(
  extraction: TimeExtraction,
  config: ActionRouterConfig,
): Promise<{ triggerJobId: string | null; nagJobId: string; name: string } | null> {
  const timezone = config.timezone ?? "America/New_York";
  const chatId = config.telegramChatId ?? "8511108690";
  const reminderText = extraction.reminderText || "Brain reminder";
  const baseName = reminderText.slice(0, 50);

  // ---- Step 1: Create the NAG job (disabled, every 5 min) ----
  const nagMessage = buildAgentMessage(reminderText, "SELF", chatId, false);

  const nagJobId = await cronAdd([
    "--name", `Brain Nag: ${baseName}`,
    "--every", `${NAG_INTERVAL_MIN}m`,
    "--session", "isolated",
    "--message", nagMessage,
    "--disabled",
    "--json",
  ]);

  if (!nagJobId) {
    console.error("[brain] Action router: Failed to create nag job");
    return null;
  }

  // Now update the nag message with the real job ID (replace SELF placeholder)
  const nagMessageReal = buildAgentMessage(reminderText, nagJobId, chatId, false);
  try {
    await execFileAsync("openclaw", [
      "cron", "edit", nagJobId,
      "--message", nagMessageReal,
    ], { timeout: 15000 });
  } catch (err) {
    console.error("[brain] Action router: Failed to update nag job message (non-fatal):", err);
  }

  // ---- Step 2: Handle recurring vs one-shot ----
  if (extraction.recurring) {
    // For recurring patterns, we don't need a trigger/nag split.
    // Create a single recurring job that sends the reminder with buttons.
    const recurringMessage = buildAgentMessage(reminderText, nagJobId, chatId, false);
    const recurringJobId = await cronAdd([
      "--name", `Brain Recurring: ${baseName}`,
      "--cron", extraction.recurring,
      "--tz", timezone,
      "--session", "isolated",
      "--message", recurringMessage,
      "--json",
    ]);

    // Disable the nag job (not needed for recurring — the cron expr handles timing)
    // The nag was created anyway for the dismiss/snooze buttons to reference
    // Actually, for recurring we should use the recurring job's ID in buttons
    // Let's clean up: remove the nag job and use the recurring job instead
    if (recurringJobId) {
      try {
        await execFileAsync("openclaw", ["cron", "rm", nagJobId], { timeout: 10000 });
      } catch { /* best effort cleanup */ }

      // Update the recurring job's message to use its own ID for buttons
      const recurringMessageReal = buildAgentMessage(reminderText, recurringJobId, chatId, false);
      try {
        await execFileAsync("openclaw", [
          "cron", "edit", recurringJobId,
          "--message", recurringMessageReal,
        ], { timeout: 10000 });
      } catch { /* non-fatal */ }

      return {
        triggerJobId: null,
        nagJobId: recurringJobId,
        name: `Brain Recurring: ${baseName}`,
      };
    }

    return null;
  }

  // ---- Step 3: Create the TRIGGER job (one-shot at target time) ----
  const date = extraction.date!;
  const time = extraction.time ?? "09:00";
  const utcMs = localToUtcMs(date, time, extraction.timezone || timezone);
  const utcIso = new Date(utcMs).toISOString();

  const triggerMessage = buildAgentMessage(reminderText, nagJobId, chatId, true);
  const triggerJobId = await cronAdd([
    "--name", `Brain Trigger: ${baseName}`,
    "--at", utcIso,
    "--session", "isolated",
    "--message", triggerMessage,
    "--delete-after-run",
    "--json",
  ]);

  if (!triggerJobId) {
    // Trigger failed — clean up the nag job
    console.error("[brain] Action router: Failed to create trigger job, cleaning up nag");
    try {
      await execFileAsync("openclaw", ["cron", "rm", nagJobId], { timeout: 10000 });
    } catch { /* best effort */ }
    return null;
  }

  return {
    triggerJobId,
    nagJobId,
    name: `Brain Reminder: ${baseName}`,
  };
}

// ============================================================================
// Intent resolution
// ============================================================================

/**
 * Resolve the effective intent from available signals.
 * Priority: explicit input tag > classifier detectedIntent > "none" (fallback to heuristic).
 *
 * @param inputTag - Explicit bracket tag from tag parser (e.g., "todo", "buy")
 * @param classification - Classification result with optional detectedIntent
 * @param _rawText - Original raw text (reserved for future keyword heuristics)
 * @returns Resolved intent string
 */
function resolveIntent(
  inputTag: string | null | undefined,
  classification: ClassificationResult,
  _rawText: string,
): string {
  // Priority 1: Explicit input tag from user
  if (inputTag) {
    return tagToIntent(inputTag as InputTag);
  }

  // Priority 2: Classifier-detected intent
  if (classification.detectedIntent && classification.detectedIntent !== "none") {
    return classification.detectedIntent;
  }

  // Priority 3: No explicit intent — return "none" to fall back to heuristic
  return "none";
}

// ============================================================================
// Non-time-sensitive action handlers
// ============================================================================

/**
 * Handle a todo intent: log to audit trail.
 * The "todo" tag is already applied to the record by the drop pipeline.
 */
async function handleTodoAction(
  store: BrainStore,
  classification: ClassificationResult,
  inboxId: string,
): Promise<ActionResult> {
  const actions = classification.nextActions.length > 0
    ? classification.nextActions.join(", ")
    : "No specific actions identified";

  const details = `Todo task routed: "${classification.title}" — Actions: ${actions}`;

  await logAudit(store, {
    action: "action-routed",
    inputId: inboxId,
    details,
  });

  return {
    action: "todo-tagged",
    details,
  };
}

/**
 * Handle a purchase intent: log to audit trail with amount info.
 * The "purchase" tag is already applied to the record by the drop pipeline.
 */
async function handlePurchaseAction(
  store: BrainStore,
  classification: ClassificationResult,
  inboxId: string,
): Promise<ActionResult> {
  const amounts = classification.entities.amounts;
  const amountInfo = amounts.length > 0
    ? ` — Amount: ${amounts.join(", ")}`
    : "";

  const details = `Purchase item routed: "${classification.title}"${amountInfo}`;

  await logAudit(store, {
    action: "action-routed",
    inputId: inboxId,
    details,
  });

  return {
    action: "purchase-tagged",
    details,
  };
}

/**
 * Handle a call intent: log to audit trail with person info.
 * The "call" tag is already applied to the record by the drop pipeline.
 */
async function handleCallAction(
  store: BrainStore,
  classification: ClassificationResult,
  inboxId: string,
): Promise<ActionResult> {
  const people = classification.entities.people;
  const personInfo = people.length > 0
    ? ` — Contact: ${people.join(", ")}`
    : "";

  const details = `Call task routed: "${classification.title}"${personInfo}`;

  await logAudit(store, {
    action: "action-routed",
    inputId: inboxId,
    details,
  });

  return {
    action: "call-tagged",
    details,
  };
}

// ============================================================================
// Time-sensitive action handler (shared by reminder + booking)
// ============================================================================

/**
 * Handle a time-sensitive action (reminder or booking).
 * Extracts time via LLM and creates persistent cron reminders.
 *
 * @param store - BrainStore instance
 * @param classification - Classification result
 * @param rawText - Original raw text
 * @param inboxId - Inbox entry ID
 * @param config - Action router config
 * @param actionType - "reminder" or "booking"
 * @returns Action result
 */
async function handleTimeSensitiveAction(
  store: BrainStore,
  classification: ClassificationResult,
  rawText: string,
  inboxId: string,
  config: ActionRouterConfig,
  actionType: "reminder" | "booking",
): Promise<ActionResult> {
  // Extract time via LLM
  const extraction = await extractTime(rawText, classification, config);
  if (!extraction) {
    // For explicit intents, log that we tried but couldn't extract time
    if (actionType === "booking") {
      const details = `Booking intent detected for "${classification.title}" but no actionable time could be extracted`;
      await logAudit(store, {
        action: "action-routed",
        inputId: inboxId,
        details,
      });
      return { action: "no-action", details };
    }
    return { action: "no-action" };
  }

  // Check if extracted time is in the past (skip recurring)
  if (!extraction.recurring && extraction.date) {
    const timezone = config.timezone ?? "America/New_York";
    const time = extraction.time ?? "09:00";
    const utcMs = localToUtcMs(extraction.date, time, extraction.timezone || timezone);

    if (utcMs <= Date.now()) {
      console.log(`[brain] Action router: Extracted time is in the past, skipping ${actionType}`);
      return { action: "no-action" };
    }
  }

  // Create the persistent reminder (trigger + nag)
  const result = await createPersistentReminder(extraction, config);
  if (!result) {
    return { action: "no-action" };
  }

  // Build description for audit trail
  const reminderAt = extraction.recurring
    ? `recurring (${extraction.recurring})`
    : `${extraction.date} ${extraction.time ?? "09:00"} ${extraction.timezone || config.timezone || "America/New_York"}`;

  const actionLabel = actionType === "booking" ? "booking reminder" : "reminder";
  const details = `Created persistent ${actionLabel} "${result.name}" (nag: ${result.nagJobId}, trigger: ${result.triggerJobId ?? "N/A"}) for ${reminderAt} — "${extraction.reminderText}"`;

  // Log to audit trail
  await logAudit(store, {
    action: "action-routed",
    inputId: inboxId,
    details,
  });

  const action: ActionType = actionType === "booking" ? "booking-created" : "reminder-created";

  return {
    action,
    triggerJobId: result.triggerJobId ?? undefined,
    nagJobId: result.nagJobId,
    name: result.name,
    reminderAt,
    details,
  };
}

// ============================================================================
// Payment execution via CLI
// ============================================================================

/**
 * Execute a payment by sending an event to the main agent session via the
 * gateway API. The agent has access to wallet_send as a tool and will
 * execute the payment.
 *
 * For auto-approved payments, this is fire-and-forget; the agent handles
 * execution and sends the confirmation to Telegram.
 *
 * For now, auto-approve payments are stored as "proposed" and the agent
 * is notified via a system event to execute them. This avoids the problem
 * of plugins not being able to call other plugins' tools directly.
 */
async function executeWalletSend(
  actionId: string,
  config: ActionRouterConfig,
): Promise<void> {
  // Create a one-shot cron job that fires immediately, injecting a system event
  // into the main agent session. The agent handles wallet_send execution.
  const eventText = `brain:pay:auto-execute:${actionId}`;
  const { stdout } = await execFileAsync("openclaw", [
    "cron", "add",
    "--name", `Brain Auto-Pay: ${actionId.slice(0, 8)}`,
    "--at", new Date(Date.now() + 2000).toISOString(),
    "--session", "main",
    "--system-event", eventText,
    "--delete-after-run",
    "--json",
  ], { timeout: 15000 });

  console.log(`[brain] payment auto-execute cron created for ${actionId}: ${stdout.slice(0, 200)}`);
}

// ============================================================================
// Payment action handler
// ============================================================================

/**
 * Handle a payment intent: resolve entities, create action, evaluate policy,
 * and either auto-execute, prompt via Telegram, or store as pending.
 */
async function handlePaymentAction(
  store: BrainStore,
  classification: ClassificationResult,
  rawText: string,
  inboxId: string,
  config: ActionRouterConfig,
): Promise<ActionResult> {
  const chatId = config.telegramChatId ?? "8511108690";

  // Need embedder for entity resolution
  if (!config.embedder) {
    console.error("[brain] Payment action: No embedder configured, skipping");
    return { action: "no-action", details: "No embedder for payment resolution" };
  }

  // Extract params from classifier proposedActions
  const proposedAction = classification.proposedActions?.[0];
  const params = proposedAction?.params ?? {};

  // Step 1: Resolve entities
  let resolution: PaymentResolution;
  try {
    resolution = await resolvePaymentEntities(params, rawText, store, config.embedder);
  } catch (err) {
    console.error("[brain] Payment resolver error:", err);
    await logAudit(store, {
      action: "action-routed",
      inputId: inboxId,
      details: `Payment entity resolution failed: ${String(err)}`,
    });
    return { action: "payment-failed", details: `Resolution failed: ${String(err)}` };
  }

  await logAudit(store, {
    action: "action-routed",
    inputId: inboxId,
    details: `Payment resolved: to=${resolution.dogeAddress ?? "?"}, amount=${resolution.amount ?? "?"}, score=${resolution.resolutionScore.toFixed(2)}, errors=[${resolution.errors.join("; ")}]`,
  });

  // Step 2: Create action object
  const action = createPaymentAction(classification, resolution);

  await logAudit(store, {
    action: "action-routed",
    inputId: inboxId,
    details: `Payment action proposed: id=${action.id}, executionScore=${action.executionScore.toFixed(2)}`,
  });

  // Step 3: Evaluate policy
  const policy = evaluatePaymentPolicy(action, resolution);
  action.gating = policy.decision === "auto" ? "auto" : "manual";

  await logAudit(store, {
    action: "action-routed",
    inputId: inboxId,
    details: `Payment policy: decision=${policy.decision}, reason=${policy.reason}`,
  });

  // Step 4: Act on policy decision
  switch (policy.decision) {
    case "auto": {
      // Auto-execute immediately
      if (!resolution.dogeAddress || !resolution.amount) {
        return { action: "payment-failed", details: "Cannot auto-execute: missing address or amount" };
      }

      action.status = "executing";
      await logAudit(store, {
        action: "action-routed",
        inputId: inboxId,
        details: `Payment auto-executing: ${resolution.amount} DOGE to ${resolution.dogeAddress}`,
      });

      try {
        // Write pending action file BEFORE sending event so the agent can find it
        action.status = "proposed";
        const pendingDir = `${process.env.HOME || "/home/clawdbot"}/.openclaw/brain/pending-actions`;
        const { mkdirSync, writeFileSync } = await import("node:fs");
        mkdirSync(pendingDir, { recursive: true });
        writeFileSync(`${pendingDir}/${action.id}.json`, JSON.stringify({
          action,
          resolution,
          inboxId,
        }, null, 2));

        await executeWalletSend(action.id, config);

        await logAudit(store, {
          action: "action-routed",
          inputId: inboxId,
          details: `Payment auto-execute event sent to agent: ${resolution.amount} DOGE to ${resolution.dogeAddress}`,
        });

        return {
          action: "payment-auto-executed",
          details: `Auto-execute event sent: ${resolution.amount} DOGE to ${resolution.recipientName ?? resolution.dogeAddress}`,
        };
      } catch (err) {
        action.status = "failed";
        action.error = String(err);

        await logAudit(store, {
          action: "action-routed",
          inputId: inboxId,
          details: `Payment auto-execution failed: ${String(err)}`,
        });

        try {
          await sendPaymentFailure(action, String(err), chatId);
        } catch { /* non-fatal */ }

        return { action: "payment-failed", details: `Execution failed: ${String(err)}` };
      }
    }

    case "prompt":
    case "prompt-warning": {
      // Send Telegram approval message
      action.status = "proposed";

      // Store action in a JSON file for later retrieval by callback handler
      try {
        const fs = await import("node:fs/promises");
        const actionDir = `${process.env.HOME ?? "/home/clawdbot"}/.openclaw/brain/pending-actions`;
        await fs.mkdir(actionDir, { recursive: true });
        await fs.writeFile(
          `${actionDir}/${action.id}.json`,
          JSON.stringify({ action, resolution, inboxId }, null, 2),
        );
      } catch (err) {
        console.error("[brain] Failed to store pending action:", err);
      }

      try {
        await sendPaymentApproval(action, policy.decision, chatId);
      } catch (err) {
        console.error("[brain] Failed to send approval message:", err);
        await logAudit(store, {
          action: "action-routed",
          inputId: inboxId,
          details: `Payment approval message failed: ${String(err)}`,
        });
      }

      return {
        action: "payment-proposed",
        details: `Awaiting approval: ${resolution.amount ?? "?"} DOGE to ${resolution.recipientName ?? resolution.dogeAddress ?? "?"} (${policy.decision})`,
      };
    }

    case "pending":
    default: {
      // Store but don't prompt
      action.status = "proposed";

      try {
        const fs = await import("node:fs/promises");
        const actionDir = `${process.env.HOME ?? "/home/clawdbot"}/.openclaw/brain/pending-actions`;
        await fs.mkdir(actionDir, { recursive: true });
        await fs.writeFile(
          `${actionDir}/${action.id}.json`,
          JSON.stringify({ action, resolution, inboxId }, null, 2),
        );
      } catch (err) {
        console.error("[brain] Failed to store pending action:", err);
      }

      await logAudit(store, {
        action: "action-routed",
        inputId: inboxId,
        details: `Payment stored as pending (low score): ${resolution.amount ?? "?"} DOGE to ${resolution.recipientName ?? "?"}`,
      });

      return {
        action: "payment-pending",
        details: `Stored as pending (score too low): ${action.executionScore.toFixed(2)}`,
      };
    }
  }
}

// ============================================================================
// Main entry point
// ============================================================================

/**
 * Route actions for a classified thought.
 *
 * Called after `routeClassification()` succeeds. Resolves the user's intent
 * from explicit bracket tags, classifier-detected intent, or keyword heuristics,
 * then dispatches to the appropriate action handler.
 *
 * Intent priority: explicit input tag > classifier detectedIntent > keyword heuristic.
 *
 * Action types:
 * - reminder: Creates persistent cron reminders with Telegram inline buttons
 * - booking:  Creates appointment/booking reminders (time-sensitive, like reminders)
 * - todo:     Tags and logs task items
 * - purchase: Tags and logs purchase/shopping items
 * - call:     Tags and logs call follow-up tasks
 *
 * All errors are caught and handled non-fatally.
 *
 * @param store - BrainStore instance (for audit trail)
 * @param classification - The classification result
 * @param rawText - Original raw text
 * @param inboxId - The inbox entry ID
 * @param config - Action router configuration
 * @param inputTag - Optional explicit bracket tag from tag parser
 * @returns Action result describing what was done
 */
export async function routeActions(
  store: BrainStore,
  classification: ClassificationResult,
  rawText: string,
  inboxId: string,
  config: ActionRouterConfig,
  inputTag?: string | null,
): Promise<ActionResult> {
  try {
    // Resolve intent from all available signals
    const intent = resolveIntent(inputTag, classification, rawText);

    switch (intent) {
      case "todo":
        return await handleTodoAction(store, classification, inboxId);

      case "purchase":
        return await handlePurchaseAction(store, classification, inboxId);

      case "call":
        return await handleCallAction(store, classification, inboxId);

      case "reminder":
        // Explicit reminder intent — skip shouldRoute heuristic
        return await handleTimeSensitiveAction(
          store, classification, rawText, inboxId, config, "reminder",
        );

      case "booking":
        // Booking intent -- extract time for appointment reminder
        return await handleTimeSensitiveAction(
          store, classification, rawText, inboxId, config, "booking",
        );

      case "payment":
        return await handlePaymentAction(store, classification, rawText, inboxId, config);

      default:
        // No explicit intent — fall back to existing shouldRoute heuristic
        if (!shouldRoute(classification, rawText)) {
          return { action: "no-action" };
        }
        return await handleTimeSensitiveAction(
          store, classification, rawText, inboxId, config, "reminder",
        );
    }
  } catch (err) {
    console.error("[brain] Action router error (non-fatal):", err);
    return { action: "no-action" };
  }
}
