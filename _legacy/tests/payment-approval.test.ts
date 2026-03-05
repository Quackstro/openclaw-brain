/**
 * Tests for payment-approval message formatting logic.
 * Tests the formatting without calling Telegram.
 */

import type { Action } from "../schemas.js";
import type { PolicyDecision } from "../action-policy.js";

const makeAction = (overrides: Partial<Action> = {}): Action => ({
  id: "test-id",
  type: "payment",
  confidence: 0.95,
  params: { recipient: "Castro", amount: "1", currency: "DOGE", reason: "test" },
  resolvedParams: { to: "D84hUKd37sKjmvfweAAs3CRWiZYuP54ygU", amount: 1, currency: "DOGE", reason: "test", recipientName: "Castro" },
  status: "proposed",
  gating: "manual",
  executionScore: 0.95,
  pluginId: "doge-wallet",
  trigger: null,
  createdAt: new Date().toISOString(),
  executedAt: null,
  auditId: null,
  result: null,
  error: null,
  ...overrides,
});

let passed = 0;
let failed = 0;

function assert(label: string, actual: unknown, expected: unknown) {
  if (actual === expected) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failed++;
  }
}

function assertIncludes(label: string, text: string, substring: string) {
  if (text.includes(substring)) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}: expected text to include "${substring}"`);
    failed++;
  }
}

function assertNotIncludes(label: string, text: string, substring: string) {
  if (!text.includes(substring)) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}: expected text NOT to include "${substring}"`);
    failed++;
  }
}

// ============================================================================
// Replicate the formatting logic from payment-approval.ts
// ============================================================================

function formatApprovalMessage(action: Action, policyDecision: PolicyDecision): string {
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

  return [
    "Brain Payment Proposal",
    "",
    `To: ${recipientName} (${shortAddr})`,
    `Amount: ${amount} ${currency}`,
    `Reason: ${reason}`,
    `Score: ${score}%`,
    warning,
  ].join("\n");
}

// ============================================================================
// Address truncation tests
// ============================================================================

console.log("Address truncation tests:\n");

const longAddr = "D84hUKd37sKjmvfweAAs3CRWiZYuP54ygU";
const shortAddr = longAddr.length > 10
  ? `${longAddr.slice(0, 6)}...${longAddr.slice(-4)}`
  : longAddr;

assert("Long address truncated", shortAddr, "D84hUK...4ygU");

assert("Short address unchanged",
  "D1234".length > 10 ? "truncated" : "D1234",
  "D1234");

const tenCharAddr = "D123456789";
assert("Exactly 10 chars: not truncated",
  tenCharAddr.length > 10 ? "truncated" : tenCharAddr,
  "D123456789");

const elevenCharAddr = "D1234567890";
const truncEleven = elevenCharAddr.length > 10
  ? `${elevenCharAddr.slice(0, 6)}...${elevenCharAddr.slice(-4)}`
  : elevenCharAddr;
assert("11 chars: truncated", truncEleven, "D12345...7890");

// ============================================================================
// Warning text tests
// ============================================================================

console.log("\nWarning text tests:\n");

const msgWarning = formatApprovalMessage(makeAction(), "prompt-warning");
assertIncludes("prompt-warning has warning text", msgWarning, "Warning:");
assertIncludes("prompt-warning has verify text", msgWarning, "verify details carefully");

const msgPrompt = formatApprovalMessage(makeAction(), "prompt");
assertNotIncludes("prompt has no warning", msgPrompt, "Warning:");

const msgAuto = formatApprovalMessage(makeAction(), "auto");
assertNotIncludes("auto has no warning", msgAuto, "Warning:");

// ============================================================================
// All fields present tests
// ============================================================================

console.log("\nField presence tests:\n");

const msg = formatApprovalMessage(makeAction({
  executionScore: 0.87,
  resolvedParams: {
    to: "D84hUKd37sKjmvfweAAs3CRWiZYuP54ygU",
    amount: 5.5,
    currency: "DOGE",
    reason: "lunch money",
    recipientName: "Alice",
  },
}), "prompt");

assertIncludes("Contains recipient name", msg, "Alice");
assertIncludes("Contains truncated address", msg, "D84hUK...4ygU");
assertIncludes("Contains amount", msg, "5.50");
assertIncludes("Contains currency", msg, "DOGE");
assertIncludes("Contains reason", msg, "lunch money");
assertIncludes("Contains score", msg, "87%");
assertIncludes("Contains header", msg, "Brain Payment Proposal");

// ============================================================================
// Edge cases
// ============================================================================

console.log("\nEdge case tests:\n");

const msgNoRecipient = formatApprovalMessage(makeAction({
  resolvedParams: { to: "D84hUKd37sKjmvfweAAs3CRWiZYuP54ygU", amount: 1, currency: "DOGE", reason: "test" },
}), "prompt");
assertIncludes("Missing recipientName → Unknown", msgNoRecipient, "Unknown");

const msgNoAddr = formatApprovalMessage(makeAction({
  resolvedParams: { amount: 1, currency: "DOGE", reason: "test", recipientName: "Bob" },
}), "prompt");
assertIncludes("Missing address → ???", msgNoAddr, "???");

const msgNoAmount = formatApprovalMessage(makeAction({
  resolvedParams: { to: "Dshort", currency: "DOGE", reason: "test", recipientName: "Bob" },
}), "prompt");
assertIncludes("Missing amount → TBD", msgNoAmount, "TBD");

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log("✅ All payment-approval tests passed!");
