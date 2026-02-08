/**
 * Brain 2.0 — Phase 2 Tests: Surface (Digests + Nudges + DND).
 *
 * Verifies:
 * - gatherDigestData() returns correct structure for each digest type
 * - formatDigest() produces output within word limits
 * - DND check correctly blocks during quiet hours
 * - DND manual override works in both directions
 * - Reactive nudge detection (overdue follow-ups, stuck items)
 * - Weekly review includes bucket health stats
 * - Empty brain shows warming-up message
 *
 * Run: cd ~/.openclaw/extensions/brain && npx tsx tests/phase2.test.ts
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";

import { BrainStore } from "../store.js";
import type { TableName, MainBucket } from "../schemas.js";
import {
  gatherDigestData,
  formatDigest,
  generateNudges,
  DIGEST_DEFAULTS,
  type DigestType,
  type DigestData,
} from "../digest.js";
import {
  checkDnd,
  toggleDnd,
  loadDndState,
  saveDndState,
  isInQuietHours,
  recordSkippedDigest,
  DEFAULT_DND_CONFIG,
  type DndConfig,
  type DndState,
} from "../dnd.js";

// ============================================================================
// Test infrastructure
// ============================================================================

const VECTOR_DIM = 8;
const TEST_DIR = `/tmp/brain-phase2-${randomUUID()}`;
const DND_STATE_PATH_BACKUP = `${process.env.HOME}/.openclaw/brain/dnd-state.json`;
let dndBackup: string | null = null;

let store: BrainStore;
let passed = 0;
let failed = 0;
const failures: string[] = [];

async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ❌ ${name}: ${msg}`);
    failures.push(`${name}: ${msg}`);
    failed++;
  }
}

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function assertIncludes(actual: string, expected: string, label: string): void {
  if (!actual.includes(expected)) {
    throw new Error(`${label}: expected "${actual}" to include "${expected}"`);
  }
}

function randomVector(dim: number = VECTOR_DIM): number[] {
  return Array.from({ length: dim }, () => Math.random() - 0.5);
}

// ============================================================================
// Helpers
// ============================================================================

async function cleanAllTables(): Promise<void> {
  for (const table of [
    "inbox", "people", "projects", "ideas", "admin", "documents",
    "goals", "health", "finance", "needs_review", "audit_trail",
  ] as TableName[]) {
    try {
      const records = await store.list(table);
      for (const r of records) {
        await store.delete(table, r.id as string);
      }
    } catch {
      // table might not exist yet
    }
  }
}

/** Seed a people record with an overdue follow-up. */
async function seedPeopleOverdue(): Promise<string> {
  const record = await store.create("people", {
    name: "Dr. Smith",
    context: "Primary care physician",
    company: "",
    contactInfo: "",
    nextActions: JSON.stringify(["Call about lab results"]),
    followUpDate: "2025-01-01", // way overdue
    lastInteraction: "2025-01-01",
    entries: JSON.stringify([{ date: "2025-01-01T10:00:00Z", note: "Initial visit" }]),
    tags: JSON.stringify(["medical"]),
    vector: randomVector(),
  });
  return record.id as string;
}

/** Seed a project record that's stuck (old entry, no recent updates). */
async function seedStuckProject(): Promise<string> {
  const record = await store.create("projects", {
    name: "Website Redesign",
    description: "Redesign the company website",
    status: "active",
    nextActions: JSON.stringify(["Review mockups"]),
    blockers: JSON.stringify(["Waiting on designer"]),
    relatedPeople: JSON.stringify([]),
    dueDate: "2025-02-01",
    entries: JSON.stringify([
      { date: "2024-12-01T10:00:00Z", note: "Started planning" },
    ]),
    tags: JSON.stringify(["web"]),
    vector: randomVector(),
  });
  return record.id as string;
}

/** Seed an urgent admin item due today. */
async function seedUrgentAdmin(): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  const record = await store.create("admin", {
    title: "Submit tax forms",
    category: "errand",
    nextActions: JSON.stringify(["File online at IRS.gov"]),
    dueDate: today,
    recurring: "",
    entries: JSON.stringify([{ date: new Date().toISOString(), note: "Due today" }]),
    tags: JSON.stringify(["tax"]),
    vector: randomVector(),
  });
  return record.id as string;
}

/** Seed a needs_review item that's > 24h old. */
async function seedOldNeedsReview(): Promise<string> {
  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const record = await store.create("needs_review", {
    inboxId: randomUUID(),
    rawText: "Something about a meeting Tuesday",
    suggestedBucket: "admin",
    confidence: 0.55,
    title: "Tuesday meeting",
    summary: "Something about a meeting on Tuesday",
    timestamp: twoDaysAgo,
    status: "pending",
    vector: randomVector(),
  });
  return record.id as string;
}

/** Seed recent activity (entry from today). */
async function seedRecentIdea(): Promise<string> {
  const now = new Date().toISOString();
  const record = await store.create("ideas", {
    title: "AI-powered garden",
    description: "Use AI to optimize garden watering",
    nextActions: JSON.stringify(["Research sensors"]),
    potential: "explore",
    relatedTo: JSON.stringify([]),
    entries: JSON.stringify([{ date: now, note: "Brainstormed idea at lunch" }]),
    tags: JSON.stringify(["ai", "garden"]),
    vector: randomVector(),
  });
  return record.id as string;
}

/** Seed a finance bill item. */
async function seedFinanceBill(): Promise<string> {
  const record = await store.create("finance", {
    title: "Electricity bill",
    category: "bill",
    amount: 150,
    currency: "USD",
    dueDate: "2025-01-15",
    recurring: JSON.stringify({ interval: "monthly" }),
    nextActions: JSON.stringify(["Pay online"]),
    entries: JSON.stringify([{ date: "2025-01-10T10:00:00Z", note: "Bill received" }]),
    tags: JSON.stringify(["utilities"]),
    vector: randomVector(),
  });
  return record.id as string;
}

// ============================================================================
// Tests
// ============================================================================

async function main() {
  console.log(`\n🧠 Brain 2.0 — Phase 2 Tests: Surface (Digests + DND + Nudges)`);
  console.log(`   Test dir: ${TEST_DIR}\n`);

  // Backup DND state
  try {
    dndBackup = await fs.readFile(DND_STATE_PATH_BACKUP, "utf-8");
  } catch {
    dndBackup = null;
  }

  // Initialize store
  store = new BrainStore(TEST_DIR, VECTOR_DIM);
  await store.ensureInitialized();

  // ========== Section 1: Digest Data Gathering ==========
  console.log("Section 1: Digest Data Gathering");

  await runTest("gatherDigestData returns correct structure (morning)", async () => {
    await cleanAllTables();
    const data = await gatherDigestData(store, "morning");
    assertEqual(data.type, "morning", "Type is morning");
    assertEqual(data.maxWords, 150, "Max words is 150");
    assert(Array.isArray(data.bucketSummaries), "Has bucket summaries array");
    assertEqual(data.bucketSummaries.length, 8, "8 bucket summaries");
    assert(Array.isArray(data.overdueItems), "Has overdue items array");
    assert(Array.isArray(data.stuckItems), "Has stuck items array");
    assert(Array.isArray(data.urgentItems), "Has urgent items array");
    assert(typeof data.needsReviewCount === "number", "Has needs review count");
    assert(typeof data.timestamp === "string", "Has timestamp");
    assert(typeof data.isEmpty === "boolean", "Has isEmpty flag");
  });

  await runTest("gatherDigestData returns correct structure (midday)", async () => {
    await cleanAllTables();
    const data = await gatherDigestData(store, "midday");
    assertEqual(data.type, "midday", "Type is midday");
    assertEqual(data.maxWords, 100, "Max words is 100");
  });

  await runTest("gatherDigestData returns correct structure (afternoon)", async () => {
    await cleanAllTables();
    const data = await gatherDigestData(store, "afternoon");
    assertEqual(data.type, "afternoon", "Type is afternoon");
    assertEqual(data.maxWords, 120, "Max words is 120");
  });

  await runTest("gatherDigestData returns correct structure (night)", async () => {
    await cleanAllTables();
    const data = await gatherDigestData(store, "night");
    assertEqual(data.type, "night", "Type is night");
    assertEqual(data.maxWords, 100, "Max words is 100");
  });

  await runTest("gatherDigestData returns correct structure (weekly)", async () => {
    await cleanAllTables();
    const data = await gatherDigestData(store, "weekly");
    assertEqual(data.type, "weekly", "Type is weekly");
    assertEqual(data.maxWords, 250, "Max words is 250");
  });

  await runTest("gatherDigestData detects overdue items", async () => {
    await cleanAllTables();
    await seedPeopleOverdue();
    await seedFinanceBill();
    const data = await gatherDigestData(store, "morning");
    assert(data.overdueItems.length >= 2, `Expected ≥2 overdue, got ${data.overdueItems.length}`);
    const peopleBucket = data.bucketSummaries.find((s) => s.bucket === "people");
    assert(peopleBucket !== undefined, "Has people summary");
    assert(peopleBucket!.overdueCount >= 1, "People has overdue count");
  });

  await runTest("gatherDigestData detects stuck items", async () => {
    await cleanAllTables();
    await seedStuckProject();
    const data = await gatherDigestData(store, "midday");
    assert(data.stuckItems.length >= 1, `Expected ≥1 stuck, got ${data.stuckItems.length}`);
    const projBucket = data.bucketSummaries.find((s) => s.bucket === "projects");
    assert(projBucket!.stuckCount >= 1, "Projects has stuck count");
  });

  await runTest("gatherDigestData detects urgent items (due today)", async () => {
    await cleanAllTables();
    await seedUrgentAdmin();
    const data = await gatherDigestData(store, "morning");
    assert(data.urgentItems.length >= 1, `Expected ≥1 urgent, got ${data.urgentItems.length}`);
    assertIncludes(data.urgentItems[0].title, "Submit tax forms", "Urgent item is tax forms");
  });

  await runTest("gatherDigestData detects needs_review items", async () => {
    await cleanAllTables();
    await seedOldNeedsReview();
    const data = await gatherDigestData(store, "morning");
    assertEqual(data.needsReviewCount, 1, "1 needs review item");
    assert(data.needsReviewItems.length === 1, "Has 1 review item detail");
    assert(data.needsReviewItems[0].ageHours > 24, "Item is > 24h old");
  });

  await runTest("gatherDigestData captures recent activity", async () => {
    await cleanAllTables();
    await seedRecentIdea();
    const data = await gatherDigestData(store, "afternoon");
    assert(data.recentActivity.length >= 1, `Expected ≥1 recent, got ${data.recentActivity.length}`);
    assertIncludes(data.recentActivity[0].title, "AI-powered garden", "Recent activity title");
  });

  await runTest("gatherDigestData shows isEmpty=true for empty brain", async () => {
    await cleanAllTables();
    const data = await gatherDigestData(store, "morning");
    assertEqual(data.isEmpty, true, "isEmpty should be true");
  });

  await runTest("gatherDigestData shows isEmpty=false with data", async () => {
    await cleanAllTables();
    await seedPeopleOverdue();
    const data = await gatherDigestData(store, "morning");
    assertEqual(data.isEmpty, false, "isEmpty should be false");
  });

  // ========== Section 2: Digest Formatting ==========
  console.log("\nSection 2: Digest Formatting");

  await runTest("formatDigest morning produces output within word limit", async () => {
    await cleanAllTables();
    await seedPeopleOverdue();
    await seedUrgentAdmin();
    const data = await gatherDigestData(store, "morning");
    const result = formatDigest(data, "morning");
    const wordCount = result.split(/\s+/).length;
    assert(wordCount <= 200, `Morning digest ${wordCount} words > 200 limit`);
    assertIncludes(result, "Morning Brief", "Has morning header");
  });

  await runTest("formatDigest midday produces output within word limit", async () => {
    await cleanAllTables();
    await seedStuckProject();
    await seedUrgentAdmin();
    const data = await gatherDigestData(store, "midday");
    const result = formatDigest(data, "midday");
    const wordCount = result.split(/\s+/).length;
    assert(wordCount <= 150, `Midday digest ${wordCount} words > 150 limit`);
    assertIncludes(result, "Midday Check", "Has midday header");
  });

  await runTest("formatDigest afternoon includes recent activity", async () => {
    await cleanAllTables();
    await seedRecentIdea();
    const data = await gatherDigestData(store, "afternoon");
    const result = formatDigest(data, "afternoon");
    assertIncludes(result, "Afternoon Wrap", "Has afternoon header");
    // Should mention activity or "no activity" message
    assert(
      result.includes("Moved Today") || result.includes("No recorded activity"),
      "Has activity section",
    );
  });

  await runTest("formatDigest night includes tomorrow priorities", async () => {
    await cleanAllTables();
    await seedPeopleOverdue();
    const data = await gatherDigestData(store, "night");
    const result = formatDigest(data, "night");
    assertIncludes(result, "Night Wind-down", "Has night header");
    assert(
      result.includes("Tomorrow") || result.includes("No pressing"),
      "Has priorities section",
    );
  });

  await runTest("formatDigest weekly includes bucket health stats", async () => {
    await cleanAllTables();
    await seedPeopleOverdue();
    await seedStuckProject();
    await seedUrgentAdmin();
    await seedFinanceBill();
    await seedOldNeedsReview();
    const data = await gatherDigestData(store, "weekly");
    const result = formatDigest(data, "weekly");
    assertIncludes(result, "BUCKET HEALTH", "Has bucket health header");
    assertIncludes(result, "THIS WEEK'S FOCUS", "Has focus section");
    // Should mention people, projects, etc.
    assert(
      result.includes("People") || result.includes("people"),
      "Mentions people bucket",
    );
  });

  await runTest("formatDigest returns warming-up message for empty brain", async () => {
    await cleanAllTables();
    const data = await gatherDigestData(store, "morning");
    const result = formatDigest(data, "morning");
    assertIncludes(result, "warming up", "Shows warming up message");
  });

  await runTest("formatDigest weekly within word limit", async () => {
    await cleanAllTables();
    await seedPeopleOverdue();
    await seedStuckProject();
    await seedUrgentAdmin();
    await seedFinanceBill();
    await seedOldNeedsReview();
    await seedRecentIdea();
    const data = await gatherDigestData(store, "weekly");
    const result = formatDigest(data, "weekly");
    const wordCount = result.split(/\s+/).length;
    assert(wordCount <= 350, `Weekly digest ${wordCount} words > 350 soft limit`);
  });

  // ========== Section 3: DND System ==========
  console.log("\nSection 3: DND System");

  await runTest("isInQuietHours detects 22:00-07:00 range correctly", async () => {
    const config: DndConfig = {
      autoQuiet: { enabled: true, from: "22:00", to: "07:00" },
      timezone: "America/New_York",
    };
    // 23:00 should be quiet
    assert(isInQuietHours(config, { hours: 23, minutes: 0 }), "23:00 is quiet");
    // 03:00 should be quiet
    assert(isInQuietHours(config, { hours: 3, minutes: 0 }), "03:00 is quiet");
    // 06:59 should be quiet
    assert(isInQuietHours(config, { hours: 6, minutes: 59 }), "06:59 is quiet");
    // 07:00 should NOT be quiet (boundary)
    assert(!isInQuietHours(config, { hours: 7, minutes: 0 }), "07:00 not quiet");
    // 12:00 should NOT be quiet
    assert(!isInQuietHours(config, { hours: 12, minutes: 0 }), "12:00 not quiet");
    // 21:59 should NOT be quiet
    assert(!isInQuietHours(config, { hours: 21, minutes: 59 }), "21:59 not quiet");
    // 22:00 should be quiet (boundary)
    assert(isInQuietHours(config, { hours: 22, minutes: 0 }), "22:00 is quiet");
  });

  await runTest("isInQuietHours disabled returns false", async () => {
    const config: DndConfig = {
      autoQuiet: { enabled: false, from: "22:00", to: "07:00" },
      timezone: "America/New_York",
    };
    assert(!isInQuietHours(config, { hours: 23, minutes: 0 }), "Disabled = not quiet");
  });

  await runTest("isInQuietHours handles non-wrapping range", async () => {
    const config: DndConfig = {
      autoQuiet: { enabled: true, from: "08:00", to: "17:00" },
      timezone: "America/New_York",
    };
    assert(isInQuietHours(config, { hours: 12, minutes: 0 }), "12:00 is quiet (8-17)");
    assert(!isInQuietHours(config, { hours: 18, minutes: 0 }), "18:00 not quiet (8-17)");
    assert(!isInQuietHours(config, { hours: 7, minutes: 59 }), "07:59 not quiet (8-17)");
  });

  await runTest("checkDnd returns quiet during auto-quiet hours", async () => {
    // Reset manual DND
    await saveDndState({ manualDnd: false, skippedDigests: [] });
    const config: DndConfig = {
      autoQuiet: { enabled: true, from: "22:00", to: "07:00" },
      timezone: "America/New_York",
    };
    const result = await checkDnd(config, { hours: 23, minutes: 0 });
    assertEqual(result.quiet, true, "Should be quiet at 23:00");
    assertIncludes(result.reason, "Auto-quiet", "Reason mentions auto-quiet");
  });

  await runTest("checkDnd returns not quiet during normal hours", async () => {
    await saveDndState({ manualDnd: false, skippedDigests: [] });
    const config: DndConfig = {
      autoQuiet: { enabled: true, from: "22:00", to: "07:00" },
      timezone: "America/New_York",
    };
    const result = await checkDnd(config, { hours: 12, minutes: 0 });
    assertEqual(result.quiet, false, "Should not be quiet at 12:00");
  });

  await runTest("DND manual override ON blocks during normal hours", async () => {
    await saveDndState({
      manualDnd: true,
      manualDndSince: new Date().toISOString(),
      skippedDigests: [],
    });
    const config: DndConfig = {
      autoQuiet: { enabled: true, from: "22:00", to: "07:00" },
      timezone: "America/New_York",
    };
    // 12:00 noon — normally active, but manual DND overrides
    const result = await checkDnd(config, { hours: 12, minutes: 0 });
    assertEqual(result.quiet, true, "Manual DND blocks at 12:00");
    assertIncludes(result.reason, "Manual DND", "Reason mentions manual");
  });

  await runTest("DND toggle on/off works correctly", async () => {
    // Start with DND off
    await saveDndState({ manualDnd: false, skippedDigests: [] });

    // Toggle on
    const onResult = await toggleDnd(true);
    assertEqual(onResult.state.manualDnd, true, "DND is now on");
    assert(onResult.state.manualDndSince !== undefined, "Has since timestamp");

    // Verify persisted
    const loaded = await loadDndState();
    assertEqual(loaded.manualDnd, true, "Persisted DND is on");

    // Toggle off
    const offResult = await toggleDnd(false);
    assertEqual(offResult.state.manualDnd, false, "DND is now off");

    // Verify persisted
    const loaded2 = await loadDndState();
    assertEqual(loaded2.manualDnd, false, "Persisted DND is off");
  });

  await runTest("DND recovery reports skipped digests", async () => {
    // Set DND on with skipped digests
    await saveDndState({
      manualDnd: true,
      manualDndSince: new Date().toISOString(),
      skippedDigests: [
        { type: "morning", timestamp: new Date().toISOString() },
        { type: "midday", timestamp: new Date().toISOString() },
      ],
    });

    // Toggle off — should have recovery info
    const result = await toggleDnd(false);
    assert(result.recovery !== undefined, "Has recovery info");
    assertIncludes(result.recovery!, "2 digest(s)", "Recovery mentions count");
    assertIncludes(result.recovery!, "morning", "Recovery mentions morning");
    assertIncludes(result.recovery!, "midday", "Recovery mentions midday");
  });

  await runTest("recordSkippedDigest adds to state", async () => {
    await saveDndState({ manualDnd: true, skippedDigests: [] });
    await recordSkippedDigest("morning");
    await recordSkippedDigest("midday");
    const state = await loadDndState();
    assertEqual(state.skippedDigests.length, 2, "2 skipped digests recorded");
  });

  // ========== Section 4: Reactive Nudges ==========
  console.log("\nSection 4: Reactive Nudges");

  await runTest("generateNudges detects overdue follow-ups", async () => {
    await cleanAllTables();
    await seedPeopleOverdue();
    const data = await gatherDigestData(store, "morning");
    const nudges = generateNudges(data);
    const followUpNudges = nudges.filter((n) => n.type === "follow-up");
    assert(followUpNudges.length >= 1, `Expected ≥1 follow-up nudge, got ${followUpNudges.length}`);
    assertIncludes(followUpNudges[0].message, "Dr. Smith", "Nudge mentions Dr. Smith");
  });

  await runTest("generateNudges detects stuck items", async () => {
    await cleanAllTables();
    await seedStuckProject();
    const data = await gatherDigestData(store, "midday");
    const nudges = generateNudges(data);
    const stuckNudges = nudges.filter((n) => n.type === "stuck");
    assert(stuckNudges.length >= 1, `Expected ≥1 stuck nudge, got ${stuckNudges.length}`);
    assertIncludes(stuckNudges[0].message, "Website Redesign", "Nudge mentions project");
  });

  await runTest("generateNudges detects old needs-review items", async () => {
    await cleanAllTables();
    await seedOldNeedsReview();
    const data = await gatherDigestData(store, "morning");
    const nudges = generateNudges(data);
    const reviewNudges = nudges.filter((n) => n.type === "needs-review");
    assert(reviewNudges.length >= 1, `Expected ≥1 review nudge, got ${reviewNudges.length}`);
    assertIncludes(reviewNudges[0].message, "Tuesday meeting", "Nudge mentions item title");
  });

  await runTest("generateNudges returns empty for clean brain", async () => {
    await cleanAllTables();
    const data = await gatherDigestData(store, "morning");
    const nudges = generateNudges(data);
    assertEqual(nudges.length, 0, "No nudges for empty brain");
  });

  // ========== Section 5: Comprehensive Digest Scenarios ==========
  console.log("\nSection 5: Comprehensive Digest Scenarios");

  await runTest("Full morning digest with all item types", async () => {
    await cleanAllTables();
    await seedPeopleOverdue();
    await seedStuckProject();
    await seedUrgentAdmin();
    await seedFinanceBill();
    await seedOldNeedsReview();

    const data = await gatherDigestData(store, "morning");
    const result = formatDigest(data, "morning");

    assertIncludes(result, "Morning Brief", "Has morning header");
    // Should have actions section
    assert(
      result.includes("Today's Actions") || result.includes("No urgent"),
      "Has actions section",
    );
    // Word count check
    const wordCount = result.split(/\s+/).length;
    assert(wordCount <= 200, `Word count ${wordCount} within limit`);
  });

  await runTest("Full weekly digest with all item types", async () => {
    await cleanAllTables();
    await seedPeopleOverdue();
    await seedStuckProject();
    await seedUrgentAdmin();
    await seedFinanceBill();
    await seedOldNeedsReview();
    await seedRecentIdea();

    const data = await gatherDigestData(store, "weekly");
    const result = formatDigest(data, "weekly");

    assertIncludes(result, "BUCKET HEALTH", "Has health header");
    assertIncludes(result, "THIS WEEK'S FOCUS", "Has focus header");
    // Should have stuck section since we have a stuck project
    assert(
      result.includes("STUCK") || result.includes("stuck"),
      "Has stuck section",
    );
  });

  await runTest("Digest type defaults are all correct", async () => {
    assertEqual(DIGEST_DEFAULTS.morning.maxWords, 150, "Morning 150");
    assertEqual(DIGEST_DEFAULTS.midday.maxWords, 100, "Midday 100");
    assertEqual(DIGEST_DEFAULTS.afternoon.maxWords, 120, "Afternoon 120");
    assertEqual(DIGEST_DEFAULTS.night.maxWords, 100, "Night 100");
    assertEqual(DIGEST_DEFAULTS.weekly.maxWords, 250, "Weekly 250");
  });

  await runTest("All 5 digest types produce valid output", async () => {
    await cleanAllTables();
    await seedPeopleOverdue();
    await seedStuckProject();

    const types: DigestType[] = ["morning", "midday", "afternoon", "night", "weekly"];
    for (const type of types) {
      const data = await gatherDigestData(store, type);
      const result = formatDigest(data, type);
      assert(result.length > 0, `${type} digest is non-empty`);
      assert(typeof result === "string", `${type} digest is a string`);
    }
  });

  // ========== Summary ==========
  console.log(`\n${"=".repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed (${passed + failed} total)`);

  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const f of failures) {
      console.log(`  ❌ ${f}`);
    }
  }

  // Restore DND state
  try {
    if (dndBackup) {
      await fs.writeFile(DND_STATE_PATH_BACKUP, dndBackup);
    } else {
      await fs.unlink(DND_STATE_PATH_BACKUP).catch(() => {});
    }
  } catch {
    // OK
  }

  // Cleanup
  try {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
    console.log(`\nCleaned up: ${TEST_DIR}`);
  } catch {
    console.log(`\nNote: could not clean up ${TEST_DIR}`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
