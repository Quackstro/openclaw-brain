/**
 * Brain 2.0 -- Payment Action Creator.
 *
 * Creates Action objects from classifier output and payment resolution.
 */

import { randomUUID } from "node:crypto";

import type { ClassificationResult, Action } from "./schemas.js";
import type { PaymentResolution } from "./payment-resolver.js";

/**
 * Create a payment Action from classification and resolution results.
 *
 * The executionScore is computed as classifierConfidence * resolutionScore,
 * capped at 1.0. This score drives the policy engine's gating decision.
 */
export function createPaymentAction(
  classification: ClassificationResult,
  resolution: PaymentResolution,
): Action {
  const proposedAction = classification.proposedActions?.[0];
  const classifierConfidence = proposedAction?.confidence ?? 0.5;
  const executionScore = Math.min(1.0, classifierConfidence * resolution.resolutionScore);

  return {
    id: randomUUID(),
    type: "payment",
    confidence: classifierConfidence,
    params: proposedAction?.params ?? {
      recipient: resolution.recipientName ?? "",
      amount: String(resolution.amount ?? ""),
      currency: resolution.currency,
      reason: resolution.reason,
    },
    resolvedParams: {
      to: resolution.dogeAddress,
      amount: resolution.amount,
      currency: resolution.currency,
      reason: resolution.reason,
      recipientName: resolution.recipientName,
    },
    status: "proposed",
    gating: "manual",
    executionScore,
    pluginId: "doge-wallet",
    trigger: null,
    createdAt: new Date().toISOString(),
    executedAt: null,
    auditId: null,
    result: null,
    error: null,
  };
}
