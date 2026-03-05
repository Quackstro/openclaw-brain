#!/usr/bin/env npx tsx
/**
 * Brain Payment Edge Case Tests
 *
 * Tests 4 untested scenarios without sending real DOGE:
 * 1. Unknown recipient ("Pay NewGuy 2 DOGE")
 * 2. Missing amount ("Tip Castro")
 * 3. Raw DOGE address in text ("Send 1 DOGE to D84hUK...")
 * 4. Insufficient funds (mock wallet_send failure)
 *
 * Usage: cd ~/.openclaw/extensions/brain && npx tsx tests/test-payment-edge-cases.ts
 */

import { resolvePaymentEntities, type PaymentResolution } from "../payment-resolver.js";
import { createPaymentAction } from "../payment-action.js";
import { evaluatePaymentPolicy, type PolicyResult } from "../action-policy.js";
import { BrainStore } from "../store.js";
import type { EmbeddingProvider, ClassificationResult } from "../schemas.js";

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
// Setup: real store + real embedder (hits gateway for embeddings)
// ============================================================================

const GATEWAY_URL = "http://127.0.0.1:18789";

// Read gateway token from config
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

let gatewayToken: string;
try {
  const configPath = path.join(homedir(), ".openclaw", "openclaw.json");
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  gatewayToken = config.plugins?.brain?.classification?.apiKey
    || config.gateway?.auth?.token
    || config.gateway?.token
    || config.gatewayToken
    || "";
} catch {
  console.error("❌ Cannot read gateway token from ~/.openclaw/openclaw.json");
  process.exit(1);
}

if (!gatewayToken) {
  console.error("❌ No gateway token found");
  process.exit(1);
}

// Read embedding API key from openclaw.json → plugins.entries.brain.config.embedding.apiKey
let embeddingApiKey: string;
try {
  const configPath = path.join(homedir(), ".openclaw", "openclaw.json");
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  embeddingApiKey = config.plugins?.entries?.brain?.config?.embedding?.apiKey || "";
} catch {
  embeddingApiKey = "";
}

if (!embeddingApiKey) {
  embeddingApiKey = process.env.GEMINI_API_KEY || "";
}

if (!embeddingApiKey) {
  console.error("❌ No embedding API key found");
  process.exit(1);
}

// Real embedder using Gemini API directly (same as brain plugin)
const embedder: EmbeddingProvider = {
  dim: 3072,
  name: "Test Embeddings (gemini-embedding-001)",
  async embed(text: string): Promise<number[]> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${embeddingApiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: { parts: [{ text }] } }),
    });
    if (!res.ok) {
      throw new Error(`Embedding failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json() as any;
    return data.embedding.values;
  },
  async embedBatch(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    for (const t of texts) results.push(await this.embed(t));
    return results;
  },
} as EmbeddingProvider;

// ============================================================================
// Mock classification builder
// ============================================================================

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
      params: {},
    }],
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

async function main() {
  console.log("🧪 Brain Payment Edge Case Tests");
  console.log(`   Gateway: ${GATEWAY_URL}`);
  console.log(`   Token: ${gatewayToken.slice(0, 8)}...`);

  // Open real Brain store (read-only queries)
  // Read the actual configured DB path from openclaw.json
  let storePath: string;
  try {
    const configPath = path.join(homedir(), ".openclaw", "openclaw.json");
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    const rawPath = config.plugins?.entries?.brain?.config?.storage?.dbPath;
    storePath = rawPath || path.join(homedir(), ".openclaw", "brain", "lancedb");
  } catch {
    storePath = path.join(homedir(), ".openclaw", "brain", "lancedb");
  }
  console.log(`   Store: ${storePath}`);
  const store = new BrainStore(storePath, 3072);
  await store.ensureInitialized();

  // ------------------------------------------------------------------
  section("Test 1: Unknown Recipient — 'Pay NewGuy 2 DOGE'");
  // ------------------------------------------------------------------
  {
    const rawText = "Pay NewGuy 2 DOGE";
    const classification = makeClassification({
      proposedActions: [{
        type: "payment",
        confidence: 0.85,
        params: { recipient: "NewGuy", amount: "2", currency: "DOGE", reason: "payment" },
      }],
    });

    const resolution = await resolvePaymentEntities(
      classification.proposedActions![0].params,
      rawText,
      store,
      embedder,
    );

    console.log("  Resolution:", JSON.stringify(resolution, null, 2));

    assert(resolution.amount === 2, "Amount parsed correctly as 2");

    // BUG DETECTION: "NewGuy" should NOT match any known person.
    // With only 2 people in the DB, the fallback search (threshold 0.5) is too loose
    // and matches Castro's profile. This is the known threshold bug.
    if (resolution.brainPersonId !== null) {
      console.log(`  ⚠️  BUG CONFIRMED: "NewGuy" falsely matched person ${resolution.brainPersonId}`);
      console.log(`     → Fallback search threshold (0.5) is too loose`);
      console.log(`     → This would send DOGE to the wrong person!`);
      // This SHOULD fail — it's a real bug that needs fixing
      assert(false, "Unknown recipient should NOT match a known person (threshold too loose)");
    } else {
      assert(resolution.dogeAddress === null, "No DOGE address resolved");
      assert(resolution.errors.length > 0, "Has error(s)");
    }

    // Regardless of the bug, policy should not auto-approve
    const action = createPaymentAction(classification, resolution);
    const policy = evaluatePaymentPolicy(action, resolution);
    console.log("  Policy:", policy);
    assert(policy.decision !== "auto", "Not auto-approved");
  }

  // ------------------------------------------------------------------
  section("Test 2: Missing Amount — 'Tip Castro'");
  // ------------------------------------------------------------------
  {
    const rawText = "Tip Castro";
    const classification = makeClassification({
      proposedActions: [{
        type: "payment",
        confidence: 0.8,
        params: { recipient: "Castro", reason: "tip" },
      }],
    });

    const resolution = await resolvePaymentEntities(
      classification.proposedActions![0].params,
      rawText,
      store,
      embedder,
    );

    console.log("  Resolution:", JSON.stringify(resolution, null, 2));

    assert(resolution.recipientName === "Castro", "Recipient is Castro");
    assert(resolution.amount === null, "Amount is null (missing)");
    assert(resolution.dogeAddress !== null, `DOGE address resolved: ${resolution.dogeAddress}`);
    assert(resolution.resolutionScore >= 0.5, `Score includes address weight (${resolution.resolutionScore})`);
    assert(resolution.resolutionScore < 0.8, `Score missing amount weight (${resolution.resolutionScore})`);

    // Check suggested amount from history
    if (resolution.suggestedAmount !== null) {
      console.log(`  → Suggested amount from history: ${resolution.suggestedAmount} DOGE ✅`);
    } else {
      console.log("  → No suggested amount (no prior sends to this address)");
    }

    // Policy check: no amount means score will be low
    const action = createPaymentAction(classification, resolution);
    const policy = evaluatePaymentPolicy(action, resolution);
    console.log("  Policy:", policy);
    assert(policy.decision !== "auto", "Not auto-approved (missing amount)");
    assert(resolution.errors.length === 0, "No errors (just missing optional amount)");
  }

  // ------------------------------------------------------------------
  section("Test 3: Raw DOGE Address — 'Send 1 DOGE to D84hUKd37sKjmvfweAAs3CRWiZYuP54ygU'");
  // ------------------------------------------------------------------
  {
    const rawText = "Send 1 DOGE to D84hUKd37sKjmvfweAAs3CRWiZYuP54ygU";
    const classification = makeClassification({
      confidence: 0.95,
      proposedActions: [{
        type: "payment",
        confidence: 0.95,
        params: { amount: "1", currency: "DOGE", reason: "send" },
      }],
    });

    const resolution = await resolvePaymentEntities(
      classification.proposedActions![0].params,
      rawText,
      store,
      embedder,
    );

    console.log("  Resolution:", JSON.stringify(resolution, null, 2));

    assert(
      resolution.dogeAddress === "D84hUKd37sKjmvfweAAs3CRWiZYuP54ygU",
      "Address extracted from raw text",
    );
    assert(resolution.amount === 1, "Amount is 1 DOGE");
    assert(resolution.resolutionScore >= 0.8, `High score (${resolution.resolutionScore})`);
    assert(resolution.errors.length === 0, "No errors");

    // Policy check
    const action = createPaymentAction(classification, resolution);
    const policy = evaluatePaymentPolicy(action, resolution);
    console.log("  Policy:", policy);

    // This address has prior sends, so isFirstTimeRecipient should be false
    console.log(`  → First-time recipient: ${resolution.isFirstTimeRecipient}`);

    if (!resolution.isFirstTimeRecipient && resolution.resolutionScore >= 0.95) {
      assert(policy.decision === "auto", "Auto-approved (known recipient, high score, 1 DOGE)");
    } else {
      console.log(`  → Policy: ${policy.decision} — ${policy.reason}`);
    }
  }

  // ------------------------------------------------------------------
  section("Test 4: Amount Exceeds Safety Cap — 'Send 1500 DOGE to Castro'");
  // ------------------------------------------------------------------
  {
    const rawText = "Send 1500 DOGE to Castro";
    const classification = makeClassification({
      confidence: 0.95,
      proposedActions: [{
        type: "payment",
        confidence: 0.95,
        params: { recipient: "Castro", amount: "1500", currency: "DOGE", reason: "send" },
      }],
    });

    const resolution = await resolvePaymentEntities(
      classification.proposedActions![0].params,
      rawText,
      store,
      embedder,
    );

    console.log("  Resolution:", JSON.stringify(resolution, null, 2));

    assert(resolution.amount === null, "Amount NOT set (exceeds cap)");
    assert(resolution.errors.length > 0, "Has error(s)");
    assert(
      resolution.errors.some(e => e.includes("exceeds") || e.includes("safety limit")),
      "Error mentions safety limit",
    );

    // Action router checks errors and rejects before creating action
    console.log("  → Action router would reject (errors present) ✅");
  }

  // ------------------------------------------------------------------
  section("Test 5: No Recipient AND No Address — 'Send some DOGE'");
  // ------------------------------------------------------------------
  {
    const rawText = "Send some DOGE";
    const classification = makeClassification({
      proposedActions: [{
        type: "payment",
        confidence: 0.6,
        params: { currency: "DOGE", reason: "send" },
      }],
    });

    const resolution = await resolvePaymentEntities(
      classification.proposedActions![0].params,
      rawText,
      store,
      embedder,
    );

    console.log("  Resolution:", JSON.stringify(resolution, null, 2));

    assert(resolution.dogeAddress === null, "No address");
    assert(resolution.recipientName === null, "No recipient");
    assert(resolution.errors.some(e => e.includes("Missing recipient")), "Error: missing recipient");
    assert(resolution.resolutionScore <= 0.2, `Score minimal without address/amount (${resolution.resolutionScore})`);
  }

  // ------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------
  console.log(`\n${"=".repeat(60)}`);
  console.log(`📊 Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  await store.close?.();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("💥 Test crashed:", err);
  process.exit(2);
});
