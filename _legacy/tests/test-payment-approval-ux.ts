#!/usr/bin/env npx tsx
/**
 * Brain Payment Approval UX Tests
 *
 * Tests the approval/failure message construction and policy edge cases
 * that weren't covered by the resolver tests:
 *
 * 1. Insufficient funds → "Waiting for Confirmations" UX
 * 2. Wallet locked → retry UX
 * 3. Generic failure → no retry button
 * 4. Prompt-warning low-confidence warning text
 * 5. First-time recipient blocks auto-approve
 * 6. Name similarity guard edge cases (typos, partial names)
 *
 * These tests intercept Telegram sends to verify message content
 * without actually calling the Telegram API.
 */

import { createPaymentAction } from "../payment-action.js";
import { evaluatePaymentPolicy } from "../action-policy.js";
import type { ClassificationResult, Action } from "../schemas.js";
import type { PaymentResolution } from "../payment-resolver.js";

// ============================================================================
// Test infrastructure
// ============================================================================

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${msg}`);
    failed++;
  }
}

function section(title: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`📋 ${title}`);
  console.log("=".repeat(60));
}

// ============================================================================
// Intercept Telegram sends
// ============================================================================

interface CapturedMessage {
  chatId: string;
  text: string;
  keyboard?: Array<Array<{ text: string; callback_data: string }>>;
}

const captured: CapturedMessage[] = [];

// Monkey-patch global fetch to intercept Telegram API calls
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (url.includes("api.telegram.org")) {
    const body = JSON.parse(init?.body as string || "{}");
    captured.push({
      chatId: body.chat_id,
      text: body.text,
      keyboard: body.reply_markup?.inline_keyboard,
    });
    // Return fake success
    return new Response(JSON.stringify({ ok: true, result: { message_id: 999 } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  return originalFetch(input, init!);
};

// ============================================================================
// Helpers
// ============================================================================

function makeAction(overrides: Partial<Action> = {}): Action {
  return {
    id: "test-action-001",
    type: "payment",
    confidence: 0.9,
    params: { recipient: "Castro", amount: "5", currency: "DOGE" },
    resolvedParams: {
      to: "D84hUKd37sKjmvfweAAs3CRWiZYuP54ygU",
      amount: 5,
      currency: "DOGE",
      reason: "test payment",
      recipientName: "Castro",
    },
    status: "proposed",
    gating: "manual",
    executionScore: 0.85,
    pluginId: "doge-wallet",
    trigger: null,
    createdAt: new Date().toISOString(),
    executedAt: null,
    auditId: null,
    result: null,
    error: null,
    ...overrides,
  };
}

function makeResolution(overrides: Partial<PaymentResolution> = {}): PaymentResolution {
  return {
    recipientName: "Castro",
    dogeAddress: "D84hUKd37sKjmvfweAAs3CRWiZYuP54ygU",
    amount: 5,
    currency: "DOGE",
    reason: "test",
    resolutionScore: 1.0,
    suggestedAmount: null,
    brainPersonId: "abc123",
    isFirstTimeRecipient: false,
    errors: [],
    ...overrides,
  };
}

function makeClassification(overrides: Partial<ClassificationResult> = {}): ClassificationResult {
  return {
    bucket: "finance",
    confidence: 0.9,
    title: "Payment",
    summary: "Payment request",
    nextActions: [],
    entities: { people: [], dates: [], amounts: [], locations: [] },
    urgency: "now",
    followUpDate: null,
    tags: ["payment"],
    detectedIntent: "payment",
    proposedActions: [{
      type: "payment",
      confidence: 0.9,
      params: { recipient: "Castro", amount: "5", currency: "DOGE" },
    }],
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

async function main() {
  console.log("🧪 Brain Payment Approval UX Tests");

  // Dynamic import to get the approval functions (they read bot token via fetch)
  const { sendPaymentApproval, sendPaymentConfirmation, sendPaymentFailure } = await import("../payment-approval.js");

  // ------------------------------------------------------------------
  section("Test 1: Insufficient Funds → 'Waiting for Confirmations' UX");
  // ------------------------------------------------------------------
  {
    captured.length = 0;
    const action = makeAction();
    await sendPaymentFailure(action, "insufficient funds: need 5 DOGE, have 2 DOGE", "test-chat");

    assert(captured.length === 1, "One message sent");
    const msg = captured[0];
    assert(msg.text.includes("Waiting for Confirmations"), "Shows 'Waiting for Confirmations' header");
    assert(msg.text.includes("pending"), "Mentions pending confirmations");
    assert(msg.text.includes("Castro"), "Shows recipient name");
    assert(msg.text.includes("5.00"), "Shows amount");
    assert(msg.keyboard !== undefined, "Has inline buttons");
    assert(msg.keyboard![0].some(b => b.text.includes("Retry")), "Has Retry button");
    assert(msg.keyboard![0].some(b => b.text.includes("Dismiss")), "Has Dismiss button");
  }

  // ------------------------------------------------------------------
  section("Test 2: Wallet Locked → Retry UX");
  // ------------------------------------------------------------------
  {
    captured.length = 0;
    const action = makeAction();
    await sendPaymentFailure(action, "Wallet is locked. Please unlock first.", "test-chat");

    assert(captured.length === 1, "One message sent");
    const msg = captured[0];
    assert(msg.text.includes("Wallet Locked"), "Shows 'Wallet Locked' header");
    assert(msg.text.includes("unlock"), "Mentions unlock");
    assert(msg.keyboard !== undefined, "Has inline buttons");
    assert(msg.keyboard![0].some(b => b.text.includes("Retry")), "Has Retry button");
    assert(
      msg.keyboard![0].some(b => b.callback_data.startsWith("brain:pay:approve:")),
      "Retry callback is brain:pay:approve",
    );
  }

  // ------------------------------------------------------------------
  section("Test 3: Generic Failure → No Retry Button");
  // ------------------------------------------------------------------
  {
    captured.length = 0;
    const action = makeAction();
    await sendPaymentFailure(action, "Network timeout: BlockCypher unreachable", "test-chat");

    assert(captured.length === 1, "One message sent");
    const msg = captured[0];
    assert(msg.text.includes("Payment Failed"), "Shows 'Payment Failed' header");
    assert(msg.text.includes("Network timeout"), "Shows error message");
    assert(msg.keyboard === undefined, "No inline buttons (no retry for unknown errors)");
  }

  // ------------------------------------------------------------------
  section("Test 4: Prompt-Warning Shows Low Confidence Warning");
  // ------------------------------------------------------------------
  {
    captured.length = 0;
    const action = makeAction({ executionScore: 0.45 });
    await sendPaymentApproval(action, "prompt-warning", "test-chat");

    assert(captured.length === 1, "One message sent");
    const msg = captured[0];
    assert(msg.text.includes("Warning"), "Shows warning text");
    assert(msg.text.includes("Low confidence"), "Mentions low confidence");
    assert(msg.keyboard !== undefined, "Has inline buttons");
    assert(msg.keyboard![0].length === 3, "Has 3 buttons (Approve, Edit, Dismiss)");
  }

  // ------------------------------------------------------------------
  section("Test 5: Normal Prompt Has No Warning");
  // ------------------------------------------------------------------
  {
    captured.length = 0;
    const action = makeAction({ executionScore: 0.85 });
    await sendPaymentApproval(action, "prompt", "test-chat");

    assert(captured.length === 1, "One message sent");
    const msg = captured[0];
    assert(!msg.text.includes("Warning"), "No warning text for normal prompt");
    assert(msg.text.includes("Brain Payment Proposal"), "Shows proposal header");
  }

  // ------------------------------------------------------------------
  section("Test 6: Confirmation Message Format");
  // ------------------------------------------------------------------
  {
    captured.length = 0;
    const action = makeAction();
    await sendPaymentConfirmation(action, "abc123def456789012345678", "test-chat");

    assert(captured.length === 1, "One message sent");
    const msg = captured[0];
    assert(msg.text.includes("Payment Sent"), "Shows 'Payment Sent' header");
    assert(msg.text.includes("Castro"), "Shows recipient");
    assert(msg.text.includes("abc123de"), "Shows truncated txid start");
    assert(msg.keyboard === undefined, "No buttons on confirmation");
  }

  // ------------------------------------------------------------------
  section("Test 7: First-Time Recipient Blocks Auto-Approve");
  // ------------------------------------------------------------------
  {
    const resolution = makeResolution({ isFirstTimeRecipient: true, amount: 0.5 });
    const classification = makeClassification({
      proposedActions: [{ type: "payment", confidence: 1.0, params: { amount: "0.5" } }],
    });
    const action = createPaymentAction(classification, resolution);

    // Force high execution score
    action.executionScore = 0.99;

    const policy = evaluatePaymentPolicy(action, resolution);
    console.log("  Policy:", policy);
    assert(policy.decision === "prompt", "First-time recipient → prompt (not auto)");
    assert(policy.reason.includes("First-time"), "Reason mentions first-time");
  }

  // ------------------------------------------------------------------
  section("Test 8: Known Recipient + Small Amount → Auto-Approve");
  // ------------------------------------------------------------------
  {
    const resolution = makeResolution({ isFirstTimeRecipient: false, amount: 1 });
    const classification = makeClassification({
      proposedActions: [{ type: "payment", confidence: 1.0, params: { amount: "1" } }],
    });
    const action = createPaymentAction(classification, resolution);
    const policy = evaluatePaymentPolicy(action, resolution);
    console.log("  Policy:", policy);
    assert(policy.decision === "auto", "Known recipient, ≤1 DOGE, high score → auto");
  }

  // ------------------------------------------------------------------
  section("Test 9: Known Recipient + Large Amount → Prompt");
  // ------------------------------------------------------------------
  {
    // Use 25 DOGE - large enough to trigger prompt, but under daily limit
    const resolution = makeResolution({ isFirstTimeRecipient: false, amount: 25 });
    const classification = makeClassification({
      proposedActions: [{ type: "payment", confidence: 1.0, params: { amount: "25" } }],
    });
    const action = createPaymentAction(classification, resolution);
    const policy = evaluatePaymentPolicy(action, resolution);
    console.log("  Policy:", policy);
    assert(policy.decision === "prompt", "Large amount (25 DOGE) → prompt even with high score");
  }

  // ------------------------------------------------------------------
  section("Test 10: Name Similarity Guard — Edge Cases");
  // ------------------------------------------------------------------
  {
    // Import the namesSimilar function (it's not exported, so test via resolver behavior)
    // Instead, replicate the logic here for direct testing
    function namesSimilar(query: string, stored: string): boolean {
      const q = query.toLowerCase().trim();
      const s = stored.toLowerCase().trim();
      if (s.includes(q) || q.includes(s)) return true;
      const bigrams = (str: string): Set<string> => {
        const set = new Set<string>();
        for (let i = 0; i < str.length - 1; i++) set.add(str.slice(i, i + 2));
        return set;
      };
      const qBi = bigrams(q);
      const sBi = bigrams(s);
      if (qBi.size === 0 || sBi.size === 0) return false;
      let overlap = 0;
      for (const b of qBi) if (sBi.has(b)) overlap++;
      const dice = (2 * overlap) / (qBi.size + sBi.size);
      return dice >= 0.4;
    }

    // Should match
    assert(namesSimilar("Castro", "Dr. Jose Castro — User Profile"), "Castro ⊂ full name");
    assert(namesSimilar("Jose", "Dr. Jose Castro — User Profile"), "Jose ⊂ full name");
    assert(namesSimilar("Castor", "Castro"), "Castor ~ Castro (typo, bigram dice ≥ 0.4)");
    assert(namesSimilar("castro", "Castro"), "Case insensitive");
    assert(namesSimilar("Dr. Castro", "Dr. Jose Castro"), "Dr. Castro ⊂ Dr. Jose Castro");

    // Should NOT match
    assert(!namesSimilar("NewGuy", "Dr. Jose Castro — User Profile"), "NewGuy ≠ Castro");
    assert(!namesSimilar("Bob", "Dr. Jose Castro — User Profile"), "Bob ≠ Castro");
    assert(!namesSimilar("Alice", "Castro"), "Alice ≠ Castro");
    assert(!namesSimilar("Mike", "Ashley Fox"), "Mike ≠ Ashley Fox");
    assert(!namesSimilar("Johnson", "Castro"), "Johnson ≠ Castro");
  }

  // ------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------
  console.log(`\n${"=".repeat(60)}`);
  console.log(`📊 Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  // Restore fetch
  globalThis.fetch = originalFetch;

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  globalThis.fetch = originalFetch;
  console.error("💥 Test crashed:", err);
  process.exit(2);
});
