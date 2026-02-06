#!/usr/bin/env node
/**
 * brain-reminder.mjs — Send a Brain reminder via Telegram with inline buttons.
 *
 * Called by cron-spawned agents to deliver persistent reminders.
 * Reads bot token from openclaw.json (no secrets in cron payloads).
 *
 * Usage:
 *   node brain-reminder.mjs --text "Turn on the crockpot" --nag-job "uuid" [--chat-id "123"]
 */

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    text:       { type: "string" },
    "nag-job":  { type: "string" },
    "chat-id":  { type: "string", default: "8511108690" },
  },
  strict: false,
});

const text      = values.text;
const nagJobId  = values["nag-job"];
const chatId    = values["chat-id"] ?? "8511108690";

if (!text || !nagJobId) {
  console.error("Missing required args: --text, --nag-job");
  process.exit(1);
}

// Read bot token from openclaw config
let botToken;
try {
  const configPath = `${homedir()}/.openclaw/openclaw.json`;
  const config = JSON.parse(await readFile(configPath, "utf8"));
  botToken = config.channels?.telegram?.botToken;
  if (!botToken) throw new Error("No telegram.botToken in config");
} catch (err) {
  console.error(`Failed to read bot token: ${err.message}`);
  process.exit(1);
}

// Build inline keyboard
const keyboard = {
  inline_keyboard: [
    [
      { text: "✅", callback_data: `brain:dismiss:${nagJobId}` },
      { text: "💤", callback_data: `brain:snooze:${nagJobId}:15` },
    ],
  ],
};

// Send via Telegram Bot API
const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
const body = {
  chat_id: chatId,
  text: `${text}\n\n_This reminder will repeat every 5 minutes until dismissed._`,
  parse_mode: "Markdown",
  reply_markup: keyboard,
};

try {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`Telegram API error: ${res.status} ${err}`);
    process.exit(1);
  }

  const data = await res.json();
  console.log(`OK message_id=${data.result.message_id}`);
} catch (err) {
  console.error(`Failed to send: ${err.message}`);
  process.exit(1);
}
