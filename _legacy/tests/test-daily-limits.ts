#!/usr/bin/env npx tsx
/**
 * Brain Daily Spending Limits & Velocity Checks Tests
 *
 * Tests for the new spending-state.ts implementation that persists
 * spending data to ~/.openclaw/brain/spending-state.json
 *
 * Usage: cd ~/.openclaw/extensions/brain && npx tsx tests/test-daily-limits.ts
 */

import { 
  checkDailySpendingLimit,
  checkSpendingVelocity,
  recordSpendingTransaction,
  getSpendingState,
  resetSpendingState,
  getSpendingStats,
  type SpendingState
} from "../spending-state.js";
import { checkDailyLimit, checkVelocity } from "../spending-guard.js";
import { evaluatePaymentPolicy } from "../action-policy.js";
import { createPaymentAction } from "../payment-action.js";
import type { PaymentResolution } from "../payment-resolver.js";
import type { ClassificationResult } from "../schemas.js";
import { writeFileSync, mkdirSync, readFileSync, existsSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";

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
// Mock data helpers
// ============================================================================

function makeMockClassification(overrides: Partial<ClassificationResult> = {}): ClassificationResult {
  return {
    bucket: "finance",
    confidence: 0.9,
    title: "Payment test",
    summary: "Test payment",
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

function makeMockResolution(overrides: Partial<PaymentResolution> = {}): PaymentResolution {
  return {
    recipientName: "TestUser",
    dogeAddress: "D6i8TeepmrGztENxdME84d2x5UVjLWncat",
    amount: 1.0,
    currency: "DOGE",
    reason: "test payment",
    resolutionScore: 0.8,
    suggestedAmount: null,
    brainPersonId: "test-person-id",
    isFirstTimeRecipient: false,
    errors: [],
    ...overrides,
  };
}

// ============================================================================
// Helper functions
// ============================================================================

function backupOriginalState(): SpendingState | null {
  try {
    return getSpendingState();
  } catch {
    return null;
  }
}

function restoreOriginalState(originalState: SpendingState | null): void {
  if (originalState) {
    const statePath = `${process.env.HOME}/.openclaw/brain/spending-state.json`;
    mkdirSync(dirname(statePath), { recursive: true });
    writeFileSync(statePath, JSON.stringify(originalState, null, 2));
  } else {
    resetSpendingState();
  }
}

// ============================================================================
// Test Cases
// ============================================================================

async function testBasicSpendingState() {
  section("Basic Spending State Operations");
  
  // Test 1: Reset and verify empty state
  resetSpendingState();
  const emptyState = getSpendingState();
  assert(emptyState.version === 1, "Empty state has version 1");
  assert(Array.isArray(emptyState.transactions), "Empty state has transactions array");
  assert(emptyState.transactions.length === 0, "Empty state has no transactions");
  console.log(`  ✅ Empty state: ${JSON.stringify(emptyState, null, 2).slice(0, 100)}...`);

  // Test 2: Record a transaction
  const testAddress = "D6i8TeepmrGztENxdME84d2x5UVjLWncat";
  recordSpendingTransaction(5.0, testAddress, "test-txid-123", "test payment");
  
  const stateAfterRecord = getSpendingState();
  assert(stateAfterRecord.transactions.length === 1, "State has 1 transaction after recording");
  
  const tx = stateAfterRecord.transactions[0];
  assert(tx.amount === 5.0, "Transaction amount is correct");
  assert(tx.address === testAddress, "Transaction address is correct");
  assert(tx.txid === "test-txid-123", "Transaction txid is correct");
  assert(tx.reason === "test payment", "Transaction reason is correct");
  assert(typeof tx.timestamp === "string", "Transaction has timestamp");
  console.log(`  ✅ Recorded transaction: ${JSON.stringify(tx, null, 2)}`);

  // Test 3: Get spending stats
  const stats = getSpendingStats();
  assert(stats.dailySpent === 5.0, "Daily spent is 5.0");
  assert(stats.dailyLimit === 50, "Daily limit is 50");
  assert(stats.dailyRemaining === 45, "Daily remaining is 45");
  assert(stats.hourlyCount === 1, "Hourly count is 1");
  assert(stats.hourlyLimit === 5, "Hourly limit is 5");
  assert(stats.hourlyRemaining === 4, "Hourly remaining is 4");
  assert(stats.transactionCount === 1, "Transaction count is 1");
  console.log(`  ✅ Stats: ${JSON.stringify(stats, null, 2)}`);
}

async function testDailyLimits() {
  section("Daily Spending Limits");
  
  // Start fresh
  resetSpendingState();
  
  // Test 1: Under daily limit
  recordSpendingTransaction(20.0, "D6i8TeepmrGztENxdME84d2x5UVjLWncat", "txid1", "payment 1");
  recordSpendingTransaction(15.0, "D6i8TeepmrGztENxdME84d2x5UVjLWncat", "txid2", "payment 2");
  
  const result1 = checkDailySpendingLimit(10.0); // 35 + 10 = 45 (under 50)
  assert(result1.allowed === true, "45 DOGE total should be under 50 DOGE limit");
  assert(result1.spent === 35.0, "Spent amount should be 35");
  assert(result1.limit === 50, "Limit should be 50");
  console.log(`  Test 1 - Under limit: ${JSON.stringify(result1)}`);

  // Test 2: Would exceed daily limit
  const result2 = checkDailySpendingLimit(20.0); // 35 + 20 = 55 (over 50)
  assert(result2.allowed === false, "55 DOGE total should exceed 50 DOGE limit");
  assert(result2.spent === 35.0, "Spent amount should still be 35");
  console.log(`  Test 2 - Would exceed: ${JSON.stringify(result2)}`);

  // Test 3: Exactly at limit
  const result3 = checkDailySpendingLimit(15.0); // 35 + 15 = 50 (exactly at limit)
  assert(result3.allowed === true, "50 DOGE total should be at limit (allowed)");
  console.log(`  Test 3 - At limit: ${JSON.stringify(result3)}`);

  // Test 4: Backward compatibility with spending-guard.ts
  const guardResult = checkDailyLimit(10.0);
  assert(guardResult.allowed === true, "checkDailyLimit wrapper should work");
  assert(guardResult.spent === 35.0, "checkDailyLimit should return same spent amount");
  console.log(`  Test 4 - Guard wrapper: ${JSON.stringify(guardResult)}`);
}

async function testVelocityChecks() {
  section("Velocity Checks (Payments Per Hour)");
  
  // Start fresh
  resetSpendingState();
  
  // Test 1: Under hourly limit
  const now = Date.now();
  for (let i = 0; i < 3; i++) {
    recordSpendingTransaction(1.0, "D6i8TeepmrGztENxdME84d2x5UVjLWncat", `txid${i}`, `payment ${i}`);
  }
  
  const result1 = checkSpendingVelocity();
  assert(result1.allowed === true, "3 payments should be under 5 payment limit");
  assert(result1.count === 3, "Count should be 3");
  assert(result1.limit === 5, "Limit should be 5");
  console.log(`  Test 1 - Under velocity limit: ${JSON.stringify(result1)}`);

  // Test 2: At velocity limit
  for (let i = 3; i < 5; i++) {
    recordSpendingTransaction(1.0, "D6i8TeepmrGztENxdME84d2x5UVjLWncat", `txid${i}`, `payment ${i}`);
  }
  
  const result2 = checkSpendingVelocity();
  assert(result2.allowed === false, "5 payments should be at limit (blocked)");
  assert(result2.count === 5, "Count should be 5");
  console.log(`  Test 2 - At velocity limit: ${JSON.stringify(result2)}`);

  // Test 3: Backward compatibility with spending-guard.ts
  const guardResult = checkVelocity();
  assert(guardResult.allowed === false, "checkVelocity wrapper should work");
  assert(guardResult.count === 5, "checkVelocity should return same count");
  console.log(`  Test 3 - Guard wrapper: ${JSON.stringify(guardResult)}`);
}

async function testTimeWindows() {
  section("Time Window Behavior");
  
  // Start fresh
  resetSpendingState();
  
  // Test 1: Manually create transactions with specific timestamps
  const now = new Date();
  const fiftyMinutesAgo = new Date(now.getTime() - 50 * 60 * 1000); // Within 1 hour
  const twentyThreeHoursAgo = new Date(now.getTime() - 23 * 60 * 60 * 1000);
  const twentyFiveHoursAgo = new Date(now.getTime() - 25 * 60 * 60 * 1000);
  
  // Manually create spending state with specific timestamps
  const statePath = `${process.env.HOME}/.openclaw/brain/spending-state.json`;
  const testState: SpendingState = {
    version: 1,
    lastUpdated: now.toISOString(),
    transactions: [
      {
        timestamp: fiftyMinutesAgo.toISOString(),
        amount: 10.0,
        address: "D6i8TeepmrGztENxdME84d2x5UVjLWncat",
        txid: "recent-txid-1",
        reason: "recent payment 1"
      },
      {
        timestamp: twentyThreeHoursAgo.toISOString(),
        amount: 15.0,
        address: "D6i8TeepmrGztENxdME84d2x5UVjLWncat",
        txid: "recent-txid-2",
        reason: "recent payment 2"
      },
      {
        timestamp: twentyFiveHoursAgo.toISOString(),
        amount: 30.0,
        address: "D6i8TeepmrGztENxdME84d2x5UVjLWncat",
        txid: "old-txid",
        reason: "old payment (should not count)"
      }
    ]
  };
  
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify(testState, null, 2));
  
  // Test daily limits (should only count transactions within 24 hours)
  const dailyResult = checkDailySpendingLimit(5.0);
  assert(dailyResult.spent === 25.0, "Should count only 10 + 15 = 25 DOGE from last 24h");
  assert(dailyResult.allowed === true, "25 + 5 = 30 DOGE should be under 50 limit");
  console.log(`  Daily window test: ${JSON.stringify(dailyResult)}`);
  
  // Test velocity (should only count transactions within 1 hour)
  const velocityResult = checkSpendingVelocity();
  assert(velocityResult.count === 1, "Should count only 1 transaction from last hour");
  assert(velocityResult.allowed === true, "1 payment should be under 5 limit");
  console.log(`  Velocity window test: ${JSON.stringify(velocityResult)}`);
}

async function testPolicyIntegration() {
  section("Policy Integration Tests");
  
  // Start fresh
  resetSpendingState();
  
  // Test 1: Normal payment should be allowed
  const mockClassification = makeMockClassification();
  const mockResolution = makeMockResolution({ amount: 5.0 });
  const action = createPaymentAction(mockClassification, mockResolution, "test-inbox-id");
  
  const policy1 = evaluatePaymentPolicy(action, mockResolution);
  assert(policy1.decision !== "pending", "Normal payment should not be blocked by guards");
  console.log(`  Test 1 - Normal payment: ${policy1.decision} - ${policy1.reason}`);
  
  // Test 2: Setup daily limit exceeded scenario
  for (let i = 0; i < 10; i++) {
    recordSpendingTransaction(5.0, "D6i8TeepmrGztENxdME84d2x5UVjLWncat", `txid${i}`, `payment ${i}`);
  }
  
  const policy2 = evaluatePaymentPolicy(action, mockResolution);
  assert(policy2.decision === "pending", "Payment should be blocked when daily limit exceeded");
  assert(policy2.reason.includes("Daily limit exceeded"), "Reason should mention daily limit");
  console.log(`  Test 2 - Daily limit exceeded: ${policy2.decision} - ${policy2.reason}`);
  
  // Test 3: Reset and test velocity limit
  resetSpendingState();
  for (let i = 0; i < 5; i++) {
    recordSpendingTransaction(1.0, "D6i8TeepmrGztENxdME84d2x5UVjLWncat", `txid${i}`, `payment ${i}`);
  }
  
  const policy3 = evaluatePaymentPolicy(action, mockResolution);
  assert(policy3.decision === "pending", "Payment should be blocked when velocity limit exceeded");
  assert(policy3.reason.includes("Too many payments"), "Reason should mention velocity limit");
  console.log(`  Test 3 - Velocity limit exceeded: ${policy3.decision} - ${policy3.reason}`);
}

async function testStateFilePersistence() {
  section("State File Persistence");
  
  const statePath = `${process.env.HOME}/.openclaw/brain/spending-state.json`;
  
  // Test 1: State file is created
  resetSpendingState();
  assert(existsSync(statePath), "State file should exist after reset");
  
  // Test 2: State survives across operations
  recordSpendingTransaction(10.0, "D6i8TeepmrGztENxdME84d2x5UVjLWncat", "persist-test", "persistence test");
  
  const state1 = getSpendingState();
  assert(state1.transactions.length === 1, "Should have 1 transaction");
  
  // Simulate restart by directly reading file
  const fileContent = readFileSync(statePath, "utf8");
  const parsedState = JSON.parse(fileContent) as SpendingState;
  assert(parsedState.transactions.length === 1, "File should contain 1 transaction");
  assert(parsedState.transactions[0].amount === 10.0, "File should contain correct amount");
  assert(parsedState.transactions[0].txid === "persist-test", "File should contain correct txid");
  console.log(`  ✅ State persisted correctly: ${fileContent.slice(0, 200)}...`);
  
  // Test 3: Atomic writes (temp file approach)
  const tempPath = statePath + '.tmp';
  recordSpendingTransaction(5.0, "D6i8TeepmrGztENxdME84d2x5UVjLWncat", "atomic-test", "atomic write test");
  assert(!existsSync(tempPath), "Temp file should be cleaned up after write");
  
  const state2 = getSpendingState();
  assert(state2.transactions.length === 2, "Should have 2 transactions after second write");
  console.log(`  ✅ Atomic writes work correctly`);
}

// ============================================================================
// Main test runner
// ============================================================================

async function main() {
  console.log("🧪 Brain Daily Spending Limits & Velocity Checks Tests");
  console.log("Testing new spending-state.ts implementation with JSON persistence...\n");

  // Backup original state
  const originalState = backupOriginalState();
  
  try {
    await testBasicSpendingState();
    await testDailyLimits();
    await testVelocityChecks();
    await testTimeWindows();
    await testPolicyIntegration();
    await testStateFilePersistence();

    console.log(`\n${"=".repeat(60)}`);
    console.log(`📊 Results: ${passed} passed, ${failed} failed`);
    console.log("=".repeat(60));

    if (failed === 0) {
      console.log("✅ All tests passed! Daily spending limits and velocity checks are working correctly.");
      console.log("💾 Spending state is properly persisted to ~/.openclaw/brain/spending-state.json");
    } else {
      console.log("❌ Some tests failed. Review the implementation.");
    }

  } finally {
    // Restore original state
    console.log("\n🔄 Restoring original spending state...");
    restoreOriginalState(originalState);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("💥 Test crashed:", err);
  process.exit(2);
});