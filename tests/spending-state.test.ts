#!/usr/bin/env npx tsx
/**
 * Spending State Tests — daily limits & velocity checks.
 *
 * Tests the spending-state.ts module directly, which is the actual
 * implementation used by the payment pipeline.
 *
 * Usage: cd ~/.openclaw/extensions/brain && npx tsx tests/spending-state.test.ts
 */

import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname } from "node:path";

// The spending state module reads from a fixed path based on $HOME.
// We'll use a temp HOME to isolate tests.
const REAL_HOME = process.env.HOME!;
const TEST_HOME = "/tmp/brain-spending-test-" + Date.now();
process.env.HOME = TEST_HOME;

// Now import (constants are evaluated at import time)
const { 
  checkDailySpendingLimit, 
  checkSpendingVelocity, 
  recordSpendingTransaction, 
  resetSpendingState, 
  getSpendingStats,
  getSpendingState,
} = await import("../spending-state.js");

// ============================================================================
// Test infra
// ============================================================================
let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) { console.log(`  ✅ ${msg}`); passed++; }
  else      { console.log(`  ❌ FAIL: ${msg}`); failed++; }
}

function section(title: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`📋 ${title}`);
  console.log("=".repeat(60));
}

function setupClean() {
  const stateDir = `${TEST_HOME}/.openclaw/brain`;
  mkdirSync(stateDir, { recursive: true });
  const statePath = `${stateDir}/spending-state.json`;
  if (existsSync(statePath)) rmSync(statePath);
}

/** Seed the state file with pre-built transactions. */
function seedState(txs: Array<{ timestamp: string; amount: number; address: string }>) {
  const stateDir = `${TEST_HOME}/.openclaw/brain`;
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(`${stateDir}/spending-state.json`, JSON.stringify({
    version: 1,
    lastUpdated: new Date().toISOString(),
    transactions: txs,
  }, null, 2));
}

const ADDR = "D6i8TeepmrGztENxdME84d2x5UVjLWncat";

// ============================================================================
// Daily Spending Limit
// ============================================================================

section("Daily Spending Limit (50 DOGE/day)");

// Fresh state — any reasonable amount should be allowed
{
  setupClean();
  const r = checkDailySpendingLimit(10);
  assert(r.allowed === true, "10 DOGE on fresh state allowed");
  assert(r.spent === 0, "spent=0 on fresh state");
  assert(r.limit === 50, "limit=50");
}

// 40 DOGE already spent today → 10 more OK, 11 not
{
  setupClean();
  const now = new Date();
  seedState([
    { timestamp: new Date(now.getTime() - 2 * 3600_000).toISOString(), amount: 20, address: ADDR },
    { timestamp: new Date(now.getTime() - 1 * 3600_000).toISOString(), amount: 20, address: ADDR },
  ]);

  const r1 = checkDailySpendingLimit(10);
  assert(r1.allowed === true, "40+10=50 exactly at limit → allowed");
  assert(r1.spent === 40, "spent=40");

  const r2 = checkDailySpendingLimit(10.01);
  assert(r2.allowed === false, "40+10.01>50 → blocked");
}

// 50 DOGE already spent → even 0.01 blocked
{
  setupClean();
  const now = new Date();
  seedState([
    { timestamp: new Date(now.getTime() - 1 * 3600_000).toISOString(), amount: 50, address: ADDR },
  ]);

  const r = checkDailySpendingLimit(0.01);
  assert(r.allowed === false, "50+0.01>50 → blocked");
  assert(r.spent === 50, "spent=50");
}

// Transactions >24h old don't count
{
  setupClean();
  const now = new Date();
  seedState([
    { timestamp: new Date(now.getTime() - 25 * 3600_000).toISOString(), amount: 100, address: ADDR },
  ]);

  const r = checkDailySpendingLimit(49);
  assert(r.allowed === true, "old tx ignored → 49 allowed");
  assert(r.spent === 0, "spent=0 (old tx excluded)");
}

// Mix of old and recent
{
  setupClean();
  const now = new Date();
  seedState([
    { timestamp: new Date(now.getTime() - 25 * 3600_000).toISOString(), amount: 100, address: ADDR },
    { timestamp: new Date(now.getTime() - 2 * 3600_000).toISOString(), amount: 30, address: ADDR },
  ]);

  const r = checkDailySpendingLimit(20);
  assert(r.allowed === true, "30+20=50 → allowed");

  const r2 = checkDailySpendingLimit(21);
  assert(r2.allowed === false, "30+21=51 → blocked");
}

// ============================================================================
// Velocity Check (5 sends/hour)
// ============================================================================

section("Velocity Check (5 sends/hour)");

// Fresh state — allowed
{
  setupClean();
  const r = checkSpendingVelocity();
  assert(r.allowed === true, "0 sends → allowed");
  assert(r.count === 0, "count=0");
  assert(r.limit === 5, "limit=5");
}

// 4 sends in last hour → allowed
{
  setupClean();
  const now = new Date();
  seedState([
    { timestamp: new Date(now.getTime() - 10 * 60_000).toISOString(), amount: 1, address: ADDR },
    { timestamp: new Date(now.getTime() - 20 * 60_000).toISOString(), amount: 1, address: ADDR },
    { timestamp: new Date(now.getTime() - 30 * 60_000).toISOString(), amount: 1, address: ADDR },
    { timestamp: new Date(now.getTime() - 40 * 60_000).toISOString(), amount: 1, address: ADDR },
  ]);

  const r = checkSpendingVelocity();
  assert(r.allowed === true, "4 sends → allowed");
  assert(r.count === 4, "count=4");
}

// 5 sends in last hour → blocked (>= limit)
{
  setupClean();
  const now = new Date();
  seedState([
    { timestamp: new Date(now.getTime() - 5 * 60_000).toISOString(), amount: 1, address: ADDR },
    { timestamp: new Date(now.getTime() - 10 * 60_000).toISOString(), amount: 1, address: ADDR },
    { timestamp: new Date(now.getTime() - 20 * 60_000).toISOString(), amount: 1, address: ADDR },
    { timestamp: new Date(now.getTime() - 30 * 60_000).toISOString(), amount: 1, address: ADDR },
    { timestamp: new Date(now.getTime() - 50 * 60_000).toISOString(), amount: 1, address: ADDR },
  ]);

  const r = checkSpendingVelocity();
  assert(r.allowed === false, "5 sends → blocked");
  assert(r.count === 5, "count=5");
}

// Sends >1h old don't count
{
  setupClean();
  const now = new Date();
  seedState([
    { timestamp: new Date(now.getTime() - 61 * 60_000).toISOString(), amount: 1, address: ADDR },
    { timestamp: new Date(now.getTime() - 62 * 60_000).toISOString(), amount: 1, address: ADDR },
    { timestamp: new Date(now.getTime() - 63 * 60_000).toISOString(), amount: 1, address: ADDR },
    { timestamp: new Date(now.getTime() - 64 * 60_000).toISOString(), amount: 1, address: ADDR },
    { timestamp: new Date(now.getTime() - 65 * 60_000).toISOString(), amount: 1, address: ADDR },
  ]);

  const r = checkSpendingVelocity();
  assert(r.allowed === true, "all >1h old → allowed");
  assert(r.count === 0, "count=0");
}

// ============================================================================
// recordSpendingTransaction + round-trip
// ============================================================================

section("Record + Round-trip");

{
  setupClean();
  recordSpendingTransaction(5, ADDR, "txid123", "test");
  recordSpendingTransaction(10, ADDR, "txid456", "test2");

  const stats = getSpendingStats();
  assert(stats.dailySpent === 15, "dailySpent=15 after recording 5+10");
  assert(stats.hourlyCount === 2, "hourlyCount=2");
  assert(stats.dailyRemaining === 35, "dailyRemaining=35");
  assert(stats.hourlyRemaining === 3, "hourlyRemaining=3");
  assert(stats.transactionCount === 2, "transactionCount=2");
}

// Record 5 transactions → velocity blocked
{
  setupClean();
  for (let i = 0; i < 5; i++) {
    recordSpendingTransaction(1, ADDR, `tx${i}`, `payment ${i}`);
  }

  const vel = checkSpendingVelocity();
  assert(vel.allowed === false, "5 recorded → velocity blocked");

  const lim = checkDailySpendingLimit(1);
  assert(lim.allowed === true, "5 DOGE spent → 1 more allowed");
  assert(lim.spent === 5, "spent=5");
}

// Record up to daily limit
{
  setupClean();
  recordSpendingTransaction(48, ADDR, "tx-big", "big payment");

  const r1 = checkDailySpendingLimit(2);
  assert(r1.allowed === true, "48+2=50 → allowed");

  const r2 = checkDailySpendingLimit(3);
  assert(r2.allowed === false, "48+3=51 → blocked");
}

// ============================================================================
// resetSpendingState
// ============================================================================

section("Reset");

{
  setupClean();
  recordSpendingTransaction(40, ADDR, "tx1", "test");
  assert(checkDailySpendingLimit(11).allowed === false, "40+11>50 → blocked before reset");

  resetSpendingState();

  assert(checkDailySpendingLimit(11).allowed === true, "after reset → allowed");
  assert(getSpendingStats().transactionCount === 0, "transactionCount=0 after reset");
}

// ============================================================================
// Integration: evaluatePaymentPolicy uses guards
// ============================================================================

section("Integration with evaluatePaymentPolicy");

// Need to re-import action-policy with the test HOME
const { evaluatePaymentPolicy } = await import("../action-policy.js");

{
  setupClean();
  // Seed 50 DOGE spent today
  const now = new Date();
  seedState([
    { timestamp: new Date(now.getTime() - 1 * 3600_000).toISOString(), amount: 50, address: ADDR },
  ]);

  // Build a mock action + resolution
  const action = {
    id: "test-action",
    executionScore: 0.99,
    resolvedParams: { to: ADDR, amount: 1, currency: "DOGE", reason: "test", recipientName: "TestUser" },
  } as any;

  const resolution = {
    recipientName: "TestUser",
    dogeAddress: ADDR,
    amount: 1,
    currency: "DOGE",
    reason: "test",
    resolutionScore: 0.99,
    suggestedAmount: null,
    brainPersonId: "p1",
    isFirstTimeRecipient: false,
    errors: [],
  };

  const result = evaluatePaymentPolicy(action, resolution);
  assert(result.decision === "pending", `daily limit exceeded → pending (got ${result.decision})`);
  assert(result.reason.includes("Daily limit"), `reason mentions daily limit: ${result.reason}`);
}

// Velocity exceeded
{
  setupClean();
  const now = new Date();
  seedState(Array.from({ length: 5 }, (_, i) => ({
    timestamp: new Date(now.getTime() - (i + 1) * 10 * 60_000).toISOString(),
    amount: 1,
    address: ADDR,
  })));

  const action = {
    id: "test-action-2",
    executionScore: 0.99,
    resolvedParams: { to: ADDR, amount: 1, currency: "DOGE", reason: "test", recipientName: "TestUser" },
  } as any;

  const resolution = {
    recipientName: "TestUser",
    dogeAddress: ADDR,
    amount: 1,
    currency: "DOGE",
    reason: "test",
    resolutionScore: 0.99,
    suggestedAmount: null,
    brainPersonId: "p1",
    isFirstTimeRecipient: false,
    errors: [],
  };

  const result = evaluatePaymentPolicy(action, resolution);
  assert(result.decision === "pending", `velocity exceeded → pending (got ${result.decision})`);
  assert(result.reason.includes("Too many"), `reason mentions velocity: ${result.reason}`);
}

// ============================================================================
// Summary
// ============================================================================

// Restore HOME
process.env.HOME = REAL_HOME;

console.log(`\n${"=".repeat(60)}`);
console.log(`📊 Results: ${passed} passed, ${failed} failed`);
console.log("=".repeat(60));

if (failed === 0) {
  console.log("✅ All spending-state tests passed!");
} else {
  console.log("❌ Some tests failed.");
}

process.exit(failed > 0 ? 1 : 0);
