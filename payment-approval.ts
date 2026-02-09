/**
 * Brain 2.0 -- Payment Approval UX (Telegram).
 *
 * Sends payment proposals to Telegram with inline approve/edit/dismiss buttons.
 * Sends confirmation messages after execution.
 */

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";

import type { Action } from "./schemas.js";
import type { PolicyDecision } from "./action-policy.js";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CHAT_ID = "8511108690";

// ============================================================================
// Telegram helpers
// ============================================================================

async function getBotToken(): Promise<string> {
  const configPath = `${homedir()}/.openclaw/openclaw.json`;
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const token = config.channels?.telegram?.botToken;
  if (!token) throw new Error("No telegram.botToken in config");
  return token;
}

async function sendTelegramMessage(
  chatId: string,
  text: string,
  inlineKeyboard?: Array<Array<{ text: string; callback_data: string }>>,
): Promise<void> {
  const botToken = await getBotToken();
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: "Markdown",
  };

  if (inlineKeyboard) {
    body.reply_markup = { inline_keyboard: inlineKeyboard };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error(`[brain] Telegram send failed: ${res.status} ${errBody.slice(0, 300)}`);
  }
}

// ============================================================================
// Approval message
// ============================================================================

/**
 * Send a payment approval request to Telegram with inline buttons.
 */
export async function sendPaymentApproval(
  action: Action,
  policyDecision: PolicyDecision,
  chatId?: string,
): Promise<void> {
  const target = chatId ?? DEFAULT_CHAT_ID;
  const rp = action.resolvedParams;
  const recipientName = (rp.recipientName as string) || "Unknown";
  const address = (rp.to as string) || "???";
  const amount = rp.amount != null ? Number(rp.amount).toFixed(2) : "TBD";
  const currency = (rp.currency as string) || "DOGE";
  const reason = (rp.reason as string) || "Not specified";
  const score = (action.executionScore * 100).toFixed(0);

  const shortAddr = address.length > 10
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : address;

  let warning = "";
  if (policyDecision === "prompt-warning") {
    warning = "\n\n*Warning:* Low confidence score. Please verify details carefully.";
  }

  const text = [
    "Brain Payment Proposal",
    "",
    `To: ${recipientName} (${shortAddr})`,
    `Amount: ${amount} ${currency}`,
    `Reason: ${reason}`,
    `Score: ${score}%`,
    warning,
  ].join("\n");

  const keyboard = [
    [
      { text: "Approve", callback_data: `brain:pay:approve:${action.id}` },
      { text: "Edit Amount", callback_data: `brain:pay:edit:${action.id}` },
      { text: "Dismiss", callback_data: `brain:pay:dismiss:${action.id}` },
    ],
  ];

  await sendTelegramMessage(target, text, keyboard);
}

// ============================================================================
// Confirmation message
// ============================================================================

/**
 * Send a payment confirmation to Telegram after successful execution.
 */
export async function sendPaymentConfirmation(
  action: Action,
  txid: string,
  chatId?: string,
): Promise<void> {
  const target = chatId ?? DEFAULT_CHAT_ID;
  const rp = action.resolvedParams;
  const recipientName = (rp.recipientName as string) || "Unknown";
  const amount = rp.amount != null ? Number(rp.amount).toFixed(2) : "?";
  const currency = (rp.currency as string) || "DOGE";

  const shortTxid = txid.length > 16
    ? `${txid.slice(0, 8)}...${txid.slice(-8)}`
    : txid;

  const text = [
    "Payment Sent",
    "",
    `To: ${recipientName}`,
    `Amount: ${amount} ${currency}`,
    `TxID: \`${shortTxid}\``,
  ].join("\n");

  await sendTelegramMessage(target, text);
}

/**
 * Send a payment failure message to Telegram.
 * If the error is a wallet lock, includes a retry button.
 */
export async function sendPaymentFailure(
  action: Action,
  error: string,
  chatId?: string,
): Promise<void> {
  const target = chatId ?? DEFAULT_CHAT_ID;
  const rp = action.resolvedParams;
  const recipientName = (rp.recipientName as string) || "Unknown";
  const amount = rp.amount != null ? Number(rp.amount).toFixed(2) : "?";

  // Auto-retry is handled via file watcher in index.ts (watches ~/.openclaw/events/wallet-unlocked).
  // The retry button below is a fallback in case the watcher misses the event.
  const isLocked = /locked|unlock/i.test(error);

  const text = isLocked
    ? [
        "Wallet Locked",
        "",
        `To: ${recipientName}`,
        `Amount: ${amount} DOGE`,
        "",
        "Send `/wallet unlock` first, then tap Retry.",
      ].join("\n")
    : [
        "Payment Failed",
        "",
        `To: ${recipientName}`,
        `Amount: ${amount} DOGE`,
        `Error: ${error}`,
      ].join("\n");

  const keyboard = isLocked
    ? [
        [
          { text: "Retry", callback_data: `brain:pay:approve:${action.id}` },
          { text: "Dismiss", callback_data: `brain:pay:dismiss:${action.id}` },
        ],
      ]
    : undefined;

  await sendTelegramMessage(target, text, keyboard);
}
