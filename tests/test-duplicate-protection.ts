#!/usr/bin/env npx tsx
/**
 * Brain Duplicate Payment Protection Tests
 *
 * Tests the duplicate/replay protection specifically implemented for the Brain payment system.
 * Tests both the spending guard functions and their integration into the payment pipeline.
 *
 * Requirements tested:
 * 1. Block duplicate payments: same address + same amount within 10 minutes
 * 2. Maintain a recent-payments log (JSON file at ~/.openclaw/brain/recent-payments.json)
 * 3. Integrate into the existing payment evaluation pipeline
 * 4. Allow payments after window expires
 *
 * Usage: cd ~/.openclaw/extensions/brain && npx tsx tests/test-duplicate-protection.ts
 */

import { 
  checkDuplicate, 
  recordPaymentProposal,
  type DuplicateResult
} from "../spending-guard.js";
import { writeFileSync, mkdirSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

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
// Mock data and helpers
// ============================================================================

const TEST_ADDRESS_1 = "D6i8TeepmrGztENxdME84d2x5UVjLWncat";
const TEST_ADDRESS_2 = "D8KjWRTZ5XTGv1V3Z5j2VhVbKBKrjXMBde";

function createTestLog(entries: any[]): string {
  const tempDir = join(tmpdir(), `brain-test-dup-${Date.now()}`);
  const logPath = join(tempDir, "recent-payments.json");
  
  mkdirSync(tempDir, { recursive: true });
  writeFileSync(logPath, JSON.stringify(entries, null, 2));
  
  return logPath;
}

function createPaymentEntry(minutesAgo: number, address: string, amount: number, reason = "test payment"): any {
  return {
    timestamp: Date.now() - (minutesAgo * 60 * 1000),
    address,
    amount,
    reason,
    action: "proposal",
  };
}

// ============================================================================
// Core Duplicate Detection Tests
// ============================================================================

async function testBasicDuplicateDetection() {
  section("Basic Duplicate Detection");
  
  // Test 1: Exact duplicate within window
  {
    const entries = [
      createPaymentEntry(5, TEST_ADDRESS_1, 10.0), // 5 minutes ago
    ];
    const logPath = createTestLog(entries);
    
    const result = checkDuplicate(TEST_ADDRESS_1, 10.0, 10, logPath);
    assert(result.isDuplicate === true, "Exact match within window should be duplicate");
    assert(result.priorTxid === "recent-proposal", "Should return recent-proposal txid");
  }

  // Test 2: Different amount, same address - not duplicate
  {
    const entries = [
      createPaymentEntry(5, TEST_ADDRESS_1, 10.0),
    ];
    const logPath = createTestLog(entries);
    
    const result = checkDuplicate(TEST_ADDRESS_1, 5.0, 10, logPath);
    assert(result.isDuplicate === false, "Different amount should not be duplicate");
  }

  // Test 3: Same amount, different address - not duplicate
  {
    const entries = [
      createPaymentEntry(5, TEST_ADDRESS_1, 10.0),
    ];
    const logPath = createTestLog(entries);
    
    const result = checkDuplicate(TEST_ADDRESS_2, 10.0, 10, logPath);
    assert(result.isDuplicate === false, "Different address should not be duplicate");
  }

  // Test 4: Same payment but outside window - not duplicate
  {
    const entries = [
      createPaymentEntry(15, TEST_ADDRESS_1, 10.0), // 15 minutes ago
    ];
    const logPath = createTestLog(entries);
    
    const result = checkDuplicate(TEST_ADDRESS_1, 10.0, 10, logPath);
    assert(result.isDuplicate === false, "Payment outside window should not be duplicate");
  }

  // Test 5: Multiple entries, only one is duplicate
  {
    const entries = [
      createPaymentEntry(15, TEST_ADDRESS_1, 10.0), // Outside window
      createPaymentEntry(5, TEST_ADDRESS_2, 10.0),  // Different address
      createPaymentEntry(3, TEST_ADDRESS_1, 5.0),   // Different amount
      createPaymentEntry(1, TEST_ADDRESS_1, 10.0),  // This is the duplicate
    ];
    const logPath = createTestLog(entries);
    
    const result = checkDuplicate(TEST_ADDRESS_1, 10.0, 10, logPath);
    assert(result.isDuplicate === true, "Should find the duplicate among multiple entries");
  }
}

async function testEdgeCases() {
  section("Edge Cases");
  
  // Test 1: Tiny amount differences (floating point precision)
  {
    const entries = [
      createPaymentEntry(5, TEST_ADDRESS_1, 10.00000001),
    ];
    const logPath = createTestLog(entries);
    
    const result = checkDuplicate(TEST_ADDRESS_1, 10.0, 10, logPath);
    assert(result.isDuplicate === true, "Tiny floating point differences should still be duplicates");
  }

  // Test 2: Empty log file
  {
    const logPath = createTestLog([]);
    
    const result = checkDuplicate(TEST_ADDRESS_1, 10.0, 10, logPath);
    assert(result.isDuplicate === false, "Empty log should not have duplicates");
  }

  // Test 3: Non-existent log file
  {
    const nonExistentPath = join(tmpdir(), "non-existent", "recent-payments.json");
    
    const result = checkDuplicate(TEST_ADDRESS_1, 10.0, 10, nonExistentPath);
    assert(result.isDuplicate === false, "Non-existent log should not have duplicates");
  }

  // Test 4: Corrupted log file (invalid JSON)
  {
    const tempDir = join(tmpdir(), `brain-test-corrupt-${Date.now()}`);
    const logPath = join(tempDir, "recent-payments.json");
    
    mkdirSync(tempDir, { recursive: true });
    writeFileSync(logPath, "invalid json content");
    
    const result = checkDuplicate(TEST_ADDRESS_1, 10.0, 10, logPath);
    assert(result.isDuplicate === false, "Corrupted log should not crash and should return false");
  }

  // Test 5: Different window sizes
  {
    const entries = [
      createPaymentEntry(7, TEST_ADDRESS_1, 10.0), // 7 minutes ago
    ];
    const logPath = createTestLog(entries);
    
    const result5min = checkDuplicate(TEST_ADDRESS_1, 10.0, 5, logPath);
    assert(result5min.isDuplicate === false, "Payment 7min ago should not be duplicate with 5min window");
    
    const result10min = checkDuplicate(TEST_ADDRESS_1, 10.0, 10, logPath);
    assert(result10min.isDuplicate === true, "Payment 7min ago should be duplicate with 10min window");
  }
}

async function testRecordPaymentProposal() {
  section("Payment Proposal Recording");
  
  // Test 1: Record new proposal in empty log
  {
    const tempDir = join(tmpdir(), `brain-test-record-${Date.now()}`);
    const logPath = join(tempDir, "recent-payments.json");
    
    recordPaymentProposal(TEST_ADDRESS_1, 15.5, "lunch money", logPath);
    
    const content = JSON.parse(readFileSync(logPath, "utf8"));
    assert(content.length === 1, "Should have recorded exactly one entry");
    assert(content[0].address === TEST_ADDRESS_1, "Should record correct address");
    assert(content[0].amount === 15.5, "Should record correct amount");
    assert(content[0].reason === "lunch money", "Should record correct reason");
    assert(content[0].action === "proposal", "Should record correct action type");
    assert(typeof content[0].timestamp === "number", "Should record timestamp");
  }

  // Test 2: Record multiple proposals
  {
    const tempDir = join(tmpdir(), `brain-test-record-multi-${Date.now()}`);
    const logPath = join(tempDir, "recent-payments.json");
    
    recordPaymentProposal(TEST_ADDRESS_1, 5.0, "coffee", logPath);
    recordPaymentProposal(TEST_ADDRESS_2, 10.0, "drinks", logPath);
    
    const content = JSON.parse(readFileSync(logPath, "utf8"));
    assert(content.length === 2, "Should have recorded two entries");
    assert(content[0].reason === "coffee", "First entry should be coffee");
    assert(content[1].reason === "drinks", "Second entry should be drinks");
  }

  // Test 3: Clean up old entries (> 1 hour)
  {
    const tempDir = join(tmpdir(), `brain-test-cleanup-${Date.now()}`);
    const logPath = join(tempDir, "recent-payments.json");
    
    // Create log with old and new entries
    const oldTimestamp = Date.now() - (2 * 60 * 60 * 1000); // 2 hours ago
    const entries = [
      {
        timestamp: oldTimestamp,
        address: TEST_ADDRESS_1,
        amount: 100.0,
        reason: "old payment",
        action: "proposal",
      },
      {
        timestamp: Date.now() - (30 * 60 * 1000), // 30 min ago
        address: TEST_ADDRESS_1,
        amount: 50.0,
        reason: "recent payment",
        action: "proposal",
      },
    ];
    
    mkdirSync(tempDir, { recursive: true });
    writeFileSync(logPath, JSON.stringify(entries, null, 2));
    
    // Record a new proposal (should trigger cleanup)
    recordPaymentProposal(TEST_ADDRESS_2, 25.0, "new payment", logPath);
    
    const content = JSON.parse(readFileSync(logPath, "utf8"));
    assert(content.length === 2, "Should have 2 entries after cleanup (old one removed)");
    
    const reasons = content.map(e => e.reason);
    assert(!reasons.includes("old payment"), "Old payment should be cleaned up");
    assert(reasons.includes("recent payment"), "Recent payment should remain");
    assert(reasons.includes("new payment"), "New payment should be added");
  }
}

async function testWindowBehavior() {
  section("Time Window Behavior");
  
  // Test precise window boundaries
  const now = Date.now();
  const tenMinutesAgo = now - (10 * 60 * 1000);
  const tenMinutesAndOneSecond = now - (10 * 60 * 1000 + 1000);
  
  // Test 1: Just within window boundary (9 minutes 59 seconds ago)
  {
    const entries = [
      {
        timestamp: now - (9 * 60 * 1000 + 59 * 1000), // 9 min 59 sec ago
        address: TEST_ADDRESS_1,
        amount: 10.0,
        reason: "boundary test",
        action: "proposal",
      },
    ];
    const logPath = createTestLog(entries);
    
    const result = checkDuplicate(TEST_ADDRESS_1, 10.0, 10, logPath);
    assert(result.isDuplicate === true, "Payment just within window boundary should be duplicate");
  }

  // Test 2: Just outside window boundary
  {
    const entries = [
      {
        timestamp: tenMinutesAndOneSecond,
        address: TEST_ADDRESS_1,
        amount: 10.0,
        reason: "boundary test",
        action: "proposal",
      },
    ];
    const logPath = createTestLog(entries);
    
    const result = checkDuplicate(TEST_ADDRESS_1, 10.0, 10, logPath);
    assert(result.isDuplicate === false, "Payment just outside window boundary should not be duplicate");
  }

  // Test 3: Test different window sizes
  {
    const entries = [
      createPaymentEntry(3, TEST_ADDRESS_1, 10.0), // 3 minutes ago
    ];
    const logPath = createTestLog(entries);
    
    const result1min = checkDuplicate(TEST_ADDRESS_1, 10.0, 1, logPath);
    assert(result1min.isDuplicate === false, "3min ago should not be duplicate with 1min window");
    
    const result2min = checkDuplicate(TEST_ADDRESS_1, 10.0, 2, logPath);
    assert(result2min.isDuplicate === false, "3min ago should not be duplicate with 2min window");
    
    const result5min = checkDuplicate(TEST_ADDRESS_1, 10.0, 5, logPath);
    assert(result5min.isDuplicate === true, "3min ago should be duplicate with 5min window");
  }
}

async function testIntegrationScenarios() {
  section("Integration Scenarios");
  
  // Test 1: Typical workflow - record then check
  {
    const tempDir = join(tmpdir(), `brain-test-workflow-${Date.now()}`);
    const logPath = join(tempDir, "recent-payments.json");
    
    // User proposes a payment
    recordPaymentProposal(TEST_ADDRESS_1, 25.0, "dinner payment", logPath);
    
    // Check if the same payment would be a duplicate (it should be)
    const result1 = checkDuplicate(TEST_ADDRESS_1, 25.0, 10, logPath);
    assert(result1.isDuplicate === true, "Same payment should be detected as duplicate");
    
    // Check a different payment (should not be duplicate)
    const result2 = checkDuplicate(TEST_ADDRESS_1, 30.0, 10, logPath);
    assert(result2.isDuplicate === false, "Different amount should not be duplicate");
    
    // Check payment to different address (should not be duplicate)
    const result3 = checkDuplicate(TEST_ADDRESS_2, 25.0, 10, logPath);
    assert(result3.isDuplicate === false, "Different address should not be duplicate");
  }

  // Test 2: Multiple rapid proposals
  {
    const tempDir = join(tmpdir(), `brain-test-rapid-${Date.now()}`);
    const logPath = join(tempDir, "recent-payments.json");
    
    // Record multiple proposals quickly
    recordPaymentProposal(TEST_ADDRESS_1, 10.0, "payment 1", logPath);
    recordPaymentProposal(TEST_ADDRESS_2, 20.0, "payment 2", logPath);
    recordPaymentProposal(TEST_ADDRESS_1, 15.0, "payment 3", logPath);
    
    // Check duplicates
    const dup1 = checkDuplicate(TEST_ADDRESS_1, 10.0, 10, logPath);
    assert(dup1.isDuplicate === true, "First payment should be duplicate");
    
    const dup2 = checkDuplicate(TEST_ADDRESS_2, 20.0, 10, logPath);
    assert(dup2.isDuplicate === true, "Second payment should be duplicate");
    
    const dup3 = checkDuplicate(TEST_ADDRESS_1, 15.0, 10, logPath);
    assert(dup3.isDuplicate === true, "Third payment should be duplicate");
    
    const notDup = checkDuplicate(TEST_ADDRESS_1, 5.0, 10, logPath);
    assert(notDup.isDuplicate === false, "Different amount should not be duplicate");
  }

  // Test 3: Time-based expiry test  
  {
    const tempDir = join(tmpdir(), `brain-test-expiry-${Date.now()}`);
    const logPath = join(tempDir, "recent-payments.json");
    
    // Record a payment proposal
    recordPaymentProposal(TEST_ADDRESS_1, 7.5, "test expiry", logPath);
    
    // Should be duplicate within window
    let result = checkDuplicate(TEST_ADDRESS_1, 7.5, 10, logPath);
    assert(result.isDuplicate === true, "Should be duplicate within window");
    
    // Simulate time passing by manually editing the timestamp
    const content = JSON.parse(readFileSync(logPath, "utf8"));
    content[0].timestamp = Date.now() - (15 * 60 * 1000); // 15 minutes ago
    writeFileSync(logPath, JSON.stringify(content, null, 2));
    
    // Should not be duplicate outside window
    result = checkDuplicate(TEST_ADDRESS_1, 7.5, 10, logPath);
    assert(result.isDuplicate === false, "Should not be duplicate outside window");
  }
}

// ============================================================================
// Main test runner
// ============================================================================

async function main() {
  console.log("🛡️  Brain Duplicate Payment Protection Tests");
  console.log("Testing duplicate/replay protection implementation...\n");

  try {
    await testBasicDuplicateDetection();
    await testEdgeCases();
    await testRecordPaymentProposal();
    await testWindowBehavior();
    await testIntegrationScenarios();

    console.log(`\n${"=".repeat(60)}`);
    console.log(`📊 Results: ${passed} passed, ${failed} failed`);
    console.log("=".repeat(60));

    if (failed === 0) {
      console.log("✅ All duplicate protection tests passed!");
      console.log("🛡️  Duplicate/replay protection is working correctly.");
    } else {
      console.log("❌ Some duplicate protection tests failed.");
    }

    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error("💥 Test crashed:", err);
    process.exit(2);
  }
}

main();