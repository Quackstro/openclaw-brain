/**
 * Brain 2.0 -- Payment Action Policy Evaluation.
 *
 * Evaluates payment actions against Brain-side policy thresholds
 * to determine gating: auto, prompt, prompt-warning, or pending.
 *
 * First-time recipients are NEVER auto-approved regardless of score.
 */

import type { Action } from "./schemas.js";
import type { PaymentResolution } from "./payment-resolver.js";

// ============================================================================
// Types
// ============================================================================

export type PolicyDecision = "auto" | "prompt" | "prompt-warning" | "pending";

export interface PolicyResult {
  decision: PolicyDecision;
  reason: string;
}

// ============================================================================
// Thresholds (hardcoded for PoC)
// ============================================================================

const AUTO_SCORE_THRESHOLD = 0.95;
const AUTO_MAX_AMOUNT = 1; // DOGE
const PROMPT_SCORE_THRESHOLD = 0.70;
const PROMPT_WARNING_SCORE_THRESHOLD = 0.50;

// ============================================================================
// Policy evaluation
// ============================================================================

/**
 * Evaluate a payment action against Brain-side policy thresholds.
 *
 * @param action - The payment Action object
 * @param resolution - The payment resolution with recipient info
 * @returns Policy decision and reason
 */
export function evaluatePaymentPolicy(
  action: Action,
  resolution: PaymentResolution,
): PolicyResult {
  const score = action.executionScore;
  const amount = resolution.amount ?? 0;
  const isFirstTime = resolution.isFirstTimeRecipient;

  // First-time recipients: never auto-approve
  if (isFirstTime && score >= AUTO_SCORE_THRESHOLD && amount <= AUTO_MAX_AMOUNT) {
    return {
      decision: "prompt",
      reason: `First-time recipient -- auto-approve blocked (score=${score.toFixed(2)}, amount=${amount})`,
    };
  }

  // Auto: high score, small amount, known recipient
  if (score >= AUTO_SCORE_THRESHOLD && amount <= AUTO_MAX_AMOUNT && !isFirstTime) {
    return {
      decision: "auto",
      reason: `Auto-approve: score=${score.toFixed(2)}, amount=${amount} DOGE, known recipient`,
    };
  }

  // Prompt: decent score
  if (score >= PROMPT_SCORE_THRESHOLD) {
    return {
      decision: "prompt",
      reason: `Prompt required: score=${score.toFixed(2)}, amount=${amount} DOGE`,
    };
  }

  // Prompt with warning: marginal score
  if (score >= PROMPT_WARNING_SCORE_THRESHOLD) {
    return {
      decision: "prompt-warning",
      reason: `Prompt with warning: score=${score.toFixed(2)} (marginal confidence)`,
    };
  }

  // Pending: low score, store but don't prompt
  return {
    decision: "pending",
    reason: `Pending (low score): score=${score.toFixed(2)}, not prompting user`,
  };
}
