#!/usr/bin/env npx tsx
/**
 * Brain Proposal Rate Limiting Tests
 *
 * Comprehensive tests for payment proposal rate limiting:
 * 1. Basic rate limiting (allows up to 10, blocks 11th within the hour)
 * 2. Window rolling (allows after window rolls)
 * 3. File persistence and cleanup
 * 4. Edge cases and error handling
 *
 * Usage: cd ~/.openclaw/extensions/brain && npx tsx tests/test-proposal-rate-limit.ts
 */

import { 
  checkProposalRateLimit, 
  getProposalRateStatus, 
  resetProposalRateLog,
  type ProposalRateLimitResult 
} from "../proposal-rate-limit.js";
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
  console.log(`🧪 ${title}`);
  console.log("=".repeat(60));
}

function summary() {
  console.log(`\n${"=".repeat(60)}`);
  if (failed === 0) {
    console.log(`🎉 All tests passed! (${passed}/${passed + failed})`);
  } else {
    console.log(`❌ Tests failed: ${failed}/${passed + failed} failed, ${passed} passed`);
  }
  console.log("=".repeat(60));
}

// ============================================================================
// Test helpers
// ============================================================================

function createTempLogPath(): string {
  const tempDir = join(tmpdir(), "brain-proposal-rate-test");
  mkdirSync(tempDir, { recursive: true });
  return join(tempDir, `proposal-rate-${Date.now()}-${Math.random().toString(36).substr(2, 5)}.json`);
}

function cleanupTempFile(path: string) {
  try {
    unlinkSync(path);
  } catch (err) {
    // File might not exist, that's fine
  }
}

function createMockLogFile(path: string, proposals: Array<{ timestamp: number }>) {
  const logData = {
    proposals: proposals.map(p => ({
      timestamp: p.timestamp,
      action: "payment-proposal"
    })),
    lastCleanup: Date.now()
  };
  
  mkdirSync(path.substring(0, path.lastIndexOf('/')), { recursive: true });
  writeFileSync(path, JSON.stringify(logData, null, 2));
}

// ============================================================================
// Basic Rate Limiting Tests
// ============================================================================

function testBasicRateLimit() {
  section("Basic Rate Limiting");
  
  const testPath = createTempLogPath();
  
  try {
    // Test: Should allow first 10 proposals
    const results: ProposalRateLimitResult[] = [];
    
    for (let i = 1; i <= 10; i++) {
      const result = checkProposalRateLimit(testPath);
      results.push(result);
      assert(result.allowed, `Proposal ${i}/10 should be allowed`);
      assert(result.count === i, `Count should be ${i}, got ${result.count}`);
      assert(result.limit === 10, `Limit should be 10, got ${result.limit}`);
    }
    
    // Test: 11th proposal should be blocked
    const eleventhResult = checkProposalRateLimit(testPath);
    assert(!eleventhResult.allowed, "11th proposal should be blocked");
    assert(eleventhResult.count === 10, `Count should remain 10, got ${eleventhResult.count}`);
    
    // Test: Further proposals should also be blocked
    const twelfthResult = checkProposalRateLimit(testPath);
    assert(!twelfthResult.allowed, "12th proposal should be blocked");
    assert(twelfthResult.count === 10, `Count should remain 10, got ${twelfthResult.count}`);
    
  } finally {
    cleanupTempFile(testPath);
  }
}

// ============================================================================
// Window Rolling Tests
// ============================================================================

function testWindowRolling() {
  section("Window Rolling Tests");
  
  const testPath = createTempLogPath();
  
  try {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    const twoHoursAgo = now - (2 * 60 * 60 * 1000);
    
    // Create a log with old entries that should be expired
    const oldProposals = Array.from({ length: 10 }, (_, i) => ({
      timestamp: twoHoursAgo + (i * 1000) // Spread over 10 seconds, 2 hours ago
    }));
    
    createMockLogFile(testPath, oldProposals);
    
    // Test: Should allow new proposals since old ones are outside the window
    const firstResult = checkProposalRateLimit(testPath);
    assert(firstResult.allowed, "First proposal should be allowed after old ones expired");
    assert(firstResult.count === 1, `Count should be 1, got ${firstResult.count}`);
    
    // Test: Mix of old and recent entries
    const mixedProposals = [
      ...Array.from({ length: 5 }, (_, i) => ({
        timestamp: twoHoursAgo + (i * 1000) // Old entries (should be ignored)
      })),
      ...Array.from({ length: 8 }, (_, i) => ({
        timestamp: now - (30 * 60 * 1000) + (i * 1000) // Recent entries (30 min ago)
      }))
    ];
    
    createMockLogFile(testPath, mixedProposals);
    
    // Should allow 2 more proposals (8 recent + 2 = 10)
    const secondResult = checkProposalRateLimit(testPath);
    assert(secondResult.allowed, "Should allow proposal when count is 9");
    assert(secondResult.count === 9, `Count should be 9, got ${secondResult.count}`);
    
    const thirdResult = checkProposalRateLimit(testPath);
    assert(thirdResult.allowed, "Should allow proposal when count is 10");
    assert(thirdResult.count === 10, `Count should be 10, got ${thirdResult.count}`);
    
    // 11th should be blocked
    const fourthResult = checkProposalRateLimit(testPath);
    assert(!fourthResult.allowed, "11th proposal should be blocked");
    
  } finally {
    cleanupTempFile(testPath);
  }
}

// ============================================================================
// Status Check Tests
// ============================================================================

function testStatusCheck() {
  section("Status Check Tests");
  
  const testPath = createTempLogPath();
  
  try {
    // Test: Empty log should show 0 count
    const emptyStatus = getProposalRateStatus(testPath);
    assert(emptyStatus.allowed, "Should be allowed when empty");
    assert(emptyStatus.count === 0, `Count should be 0, got ${emptyStatus.count}`);
    assert(emptyStatus.limit === 10, `Limit should be 10, got ${emptyStatus.limit}`);
    
    // Add some proposals
    checkProposalRateLimit(testPath);
    checkProposalRateLimit(testPath);
    checkProposalRateLimit(testPath);
    
    const status = getProposalRateStatus(testPath);
    assert(status.count === 3, `Count should be 3, got ${status.count}`);
    assert(status.allowed, "Should still be allowed at 3");
    
    // Fill to limit
    for (let i = 0; i < 7; i++) {
      checkProposalRateLimit(testPath);
    }
    
    const fullStatus = getProposalRateStatus(testPath);
    assert(fullStatus.count === 10, `Count should be 10, got ${fullStatus.count}`);
    assert(!fullStatus.allowed, "Should not be allowed at 10");
    
  } finally {
    cleanupTempFile(testPath);
  }
}

// ============================================================================
// File Persistence Tests
// ============================================================================

function testFilePersistence() {
  section("File Persistence Tests");
  
  const testPath = createTempLogPath();
  
  try {
    // Make several proposals
    checkProposalRateLimit(testPath);
    checkProposalRateLimit(testPath);
    checkProposalRateLimit(testPath);
    
    // Verify file exists and has correct structure
    const fileContent = readFileSync(testPath, "utf8");
    const logData = JSON.parse(fileContent);
    
    assert(Array.isArray(logData.proposals), "Log should have proposals array");
    assert(logData.proposals.length === 3, `Should have 3 proposals, got ${logData.proposals.length}`);
    assert(typeof logData.lastCleanup === "number", "Should have lastCleanup timestamp");
    
    // Verify each proposal has correct structure
    logData.proposals.forEach((proposal: any, i: number) => {
      assert(typeof proposal.timestamp === "number", `Proposal ${i} should have timestamp`);
      assert(proposal.action === "payment-proposal", `Proposal ${i} should have correct action`);
    });
    
    // Test: Reading from existing file should preserve state
    const status = getProposalRateStatus(testPath);
    assert(status.count === 3, `Count should be preserved as 3, got ${status.count}`);
    
  } finally {
    cleanupTempFile(testPath);
  }
}

// ============================================================================
// Reset Functionality Tests
// ============================================================================

function testReset() {
  section("Reset Functionality Tests");
  
  const testPath = createTempLogPath();
  
  try {
    // Fill the log
    for (let i = 0; i < 10; i++) {
      checkProposalRateLimit(testPath);
    }
    
    // Verify it's full
    const beforeReset = getProposalRateStatus(testPath);
    assert(beforeReset.count === 10, `Should be full before reset, got ${beforeReset.count}`);
    assert(!beforeReset.allowed, "Should not be allowed before reset");
    
    // Reset
    resetProposalRateLog(testPath);
    
    // Verify it's empty
    const afterReset = getProposalRateStatus(testPath);
    assert(afterReset.count === 0, `Should be empty after reset, got ${afterReset.count}`);
    assert(afterReset.allowed, "Should be allowed after reset");
    
    // Should be able to make proposals again
    const newResult = checkProposalRateLimit(testPath);
    assert(newResult.allowed, "Should allow new proposals after reset");
    assert(newResult.count === 1, `Count should be 1 after first new proposal, got ${newResult.count}`);
    
  } finally {
    cleanupTempFile(testPath);
  }
}

// ============================================================================
// Error Handling Tests
// ============================================================================

function testErrorHandling() {
  section("Error Handling Tests");
  
  // Test: Invalid file should be handled gracefully
  const invalidPath = createTempLogPath();
  
  try {
    // Create invalid JSON file
    writeFileSync(invalidPath, "{ invalid json }");
    
    const result = checkProposalRateLimit(invalidPath);
    assert(result.allowed, "Should allow when file is invalid (creates new log)");
    assert(result.count === 1, `Count should be 1 after fixing invalid file, got ${result.count}`);
    
    // Verify file is now valid
    const fileContent = readFileSync(invalidPath, "utf8");
    const parsed = JSON.parse(fileContent);
    assert(Array.isArray(parsed.proposals), "Should have valid proposals array after fixing");
    
  } finally {
    cleanupTempFile(invalidPath);
  }
  
  // Test: Non-existent file should be handled gracefully
  const nonExistentPath = join(tmpdir(), "non-existent-dir", "non-existent-file.json");
  
  try {
    const result = checkProposalRateLimit(nonExistentPath);
    assert(result.allowed, "Should allow when file doesn't exist (creates new)");
    assert(result.count === 1, `Count should be 1 for new file, got ${result.count}`);
    
  } finally {
    cleanupTempFile(nonExistentPath);
  }
}

// ============================================================================
// Integration Test (realistic scenario)
// ============================================================================

function testRealisticScenario() {
  section("Realistic Scenario Test");
  
  const testPath = createTempLogPath();
  
  try {
    // Simulate a day of normal usage
    const now = Date.now();
    
    // Morning: 3 proposals
    for (let i = 0; i < 3; i++) {
      const result = checkProposalRateLimit(testPath);
      assert(result.allowed, `Morning proposal ${i + 1} should be allowed`);
    }
    
    // Afternoon: 4 more proposals 
    for (let i = 0; i < 4; i++) {
      const result = checkProposalRateLimit(testPath);
      assert(result.allowed, `Afternoon proposal ${i + 1} should be allowed`);
    }
    
    // Evening: 3 more proposals (reaches limit)
    for (let i = 0; i < 3; i++) {
      const result = checkProposalRateLimit(testPath);
      assert(result.allowed, `Evening proposal ${i + 1} should be allowed`);
    }
    
    // Status check: should be at limit
    const status = getProposalRateStatus(testPath);
    assert(status.count === 10, `Should be at limit, got ${status.count}`);
    assert(!status.allowed, "Should not allow more at limit");
    
    // Attempt one more: should be blocked
    const blocked = checkProposalRateLimit(testPath);
    assert(!blocked.allowed, "Should block proposal over limit");
    assert(blocked.count === 10, `Count should remain 10, got ${blocked.count}`);
    
    console.log(`  💡 Realistic scenario: 10 proposals allowed, 11th blocked as expected`);
    
  } finally {
    cleanupTempFile(testPath);
  }
}

// ============================================================================
// Run all tests
// ============================================================================

async function runAllTests() {
  console.log("🚀 Starting Brain Proposal Rate Limiting Tests");
  console.log(`Timestamp: ${new Date().toISOString()}`);
  
  try {
    testBasicRateLimit();
    testWindowRolling();
    testStatusCheck();
    testFilePersistence();
    testReset();
    testErrorHandling();
    testRealisticScenario();
    
    summary();
    
    if (failed === 0) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (error) {
    console.error("\n💥 Unexpected test error:", error);
    process.exit(1);
  }
}

// Run tests
runAllTests();