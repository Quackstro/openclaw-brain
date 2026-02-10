/**
 * Tests for evaluatePaymentPolicy() from action-policy.ts
 */

import { evaluatePaymentPolicy } from "../action-policy.js";
import type { Action } from "../schemas.js";
import type { PaymentResolution } from "../payment-resolver.js";

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

const makeResolution = (overrides: Partial<PaymentResolution> = {}): PaymentResolution => ({
  recipientName: "Castro",
  dogeAddress: "D84hUKd37sKjmvfweAAs3CRWiZYuP54ygU",
  amount: 1,
  currency: "DOGE",
  reason: "test",
  resolutionScore: 1,
  suggestedAmount: null,
  brainPersonId: "test-person-id",
  isFirstTimeRecipient: false,
  errors: [],
  ...overrides,
});

let passed = 0;
let failed = 0;

function assert(label: string, actual: string, expected: string) {
  if (actual === expected) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}: expected "${expected}", got "${actual}"`);
    failed++;
  }
}

console.log("evaluatePaymentPolicy() tests:\n");

// Auto-approve
assert("Auto-approve: high score, low amount, known",
  evaluatePaymentPolicy(makeAction({ executionScore: 0.96 }), makeResolution({ amount: 0.5 })).decision,
  "auto");

// Auto blocked by first-time
assert("Auto blocked by first-time recipient",
  evaluatePaymentPolicy(makeAction({ executionScore: 0.96 }), makeResolution({ amount: 0.5, isFirstTimeRecipient: true })).decision,
  "prompt");

// Auto blocked by amount
assert("Auto blocked by amount > 1",
  evaluatePaymentPolicy(makeAction({ executionScore: 0.96 }), makeResolution({ amount: 5 })).decision,
  "prompt");

// Auto blocked by score
assert("Auto blocked by score < 0.95",
  evaluatePaymentPolicy(makeAction({ executionScore: 0.90 }), makeResolution({ amount: 0.5 })).decision,
  "prompt");

// Prompt
assert("Prompt: score=0.75, amount=10",
  evaluatePaymentPolicy(makeAction({ executionScore: 0.75 }), makeResolution({ amount: 10 })).decision,
  "prompt");

// Prompt-warning
assert("Prompt-warning: score=0.55",
  evaluatePaymentPolicy(makeAction({ executionScore: 0.55 }), makeResolution({ amount: 1 })).decision,
  "prompt-warning");

// Pending
assert("Pending: score=0.30",
  evaluatePaymentPolicy(makeAction({ executionScore: 0.30 }), makeResolution({ amount: 1 })).decision,
  "pending");

// Edge cases
assert("Edge: score exactly 0.95 -> auto",
  evaluatePaymentPolicy(makeAction({ executionScore: 0.95 }), makeResolution({ amount: 0.5 })).decision,
  "auto");

assert("Edge: score exactly 0.70 -> prompt",
  evaluatePaymentPolicy(makeAction({ executionScore: 0.70 }), makeResolution({ amount: 10 })).decision,
  "prompt");

assert("Edge: score exactly 0.50 -> prompt-warning",
  evaluatePaymentPolicy(makeAction({ executionScore: 0.50 }), makeResolution({ amount: 1 })).decision,
  "prompt-warning");

assert("Edge: score 0.49 -> pending",
  evaluatePaymentPolicy(makeAction({ executionScore: 0.49 }), makeResolution({ amount: 1 })).decision,
  "pending");

assert("Amount exactly 1 DOGE -> auto",
  evaluatePaymentPolicy(makeAction({ executionScore: 0.96 }), makeResolution({ amount: 1 })).decision,
  "auto");

assert("Amount 1.01 -> prompt",
  evaluatePaymentPolicy(makeAction({ executionScore: 0.96 }), makeResolution({ amount: 1.01 })).decision,
  "prompt");

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log("✅ All evaluatePaymentPolicy() tests passed!");
