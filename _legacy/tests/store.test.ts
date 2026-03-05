/**
 * Brain 2.0 — Store CRUD Tests.
 *
 * Verifies:
 * - Can create a record in each of the 11 tables
 * - Can read it back
 * - Can update it
 * - Can delete/archive it
 * - Can search by embedding similarity
 * - Tables are isolated (writing to people doesn't affect projects)
 *
 * Uses isolated temp storage: /tmp/brain-test-<uuid>/
 * Run: cd ~/.openclaw/extensions/brain && npx tsx tests/store.test.ts
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { BrainStore } from "../store.js";
import {
  ALL_TABLES,
  MAIN_BUCKETS,
  SYSTEM_TABLES,
  type TableName,
  schemaSeed,
} from "../schemas.js";

// ============================================================================
// Test infrastructure
// ============================================================================

const VECTOR_DIM = 1536;
const TEST_DIR = `/tmp/brain-test-${randomUUID()}`;

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
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function randomVector(dim: number = VECTOR_DIM): number[] {
  return Array.from({ length: dim }, () => Math.random() - 0.5);
}

function normalizeVector(vec: number[]): number[] {
  const mag = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  return mag > 0 ? vec.map((v) => v / mag) : vec;
}

// ============================================================================
// Sample records for each table
// ============================================================================

function sampleRecord(table: TableName): Record<string, unknown> {
  const vec = randomVector();

  switch (table) {
    case "inbox":
      return {
        rawText: "Call Dr. Smith about lab results",
        source: "drop",
        timestamp: new Date().toISOString(),
        mediaPath: "",
        status: "pending",
        vector: vec,
      };

    case "people":
      return {
        name: "Dr. Smith",
        context: "Primary care physician",
        company: "City Medical Center",
        contactInfo: "555-0100",
        nextActions: JSON.stringify(["Schedule follow-up appointment"]),
        followUpDate: "2026-02-15",
        lastInteraction: "2026-02-01",
        entries: JSON.stringify([{ date: "2026-02-01", note: "Discussed lab results" }]),
        tags: JSON.stringify(["medical", "doctor"]),
        vector: vec,
      };

    case "projects":
      return {
        name: "Brain 2.0",
        description: "Behavioral support system for thought capture",
        status: "active",
        nextActions: JSON.stringify(["Complete Phase 0", "Start Phase 1"]),
        blockers: JSON.stringify([]),
        relatedPeople: JSON.stringify([]),
        dueDate: "2026-02-08",
        entries: JSON.stringify([{ date: "2026-02-01", note: "Started Phase 0" }]),
        tags: JSON.stringify(["dev", "brain"]),
        vector: vec,
      };

    case "ideas":
      return {
        title: "Voice-activated drops",
        description: "Use Whisper for voice transcription before classification",
        nextActions: JSON.stringify(["Research Whisper API pricing"]),
        potential: "explore",
        relatedTo: JSON.stringify([]),
        entries: JSON.stringify([{ date: "2026-02-01", note: "Initial idea capture" }]),
        tags: JSON.stringify(["voice", "feature"]),
        vector: vec,
      };

    case "admin":
      return {
        title: "Dentist appointment",
        category: "appointment",
        nextActions: JSON.stringify(["Confirm appointment time"]),
        dueDate: "2026-02-10",
        recurring: "",
        entries: JSON.stringify([{ date: "2026-02-01", note: "Booked for 10am" }]),
        tags: JSON.stringify(["dental"]),
        vector: vec,
      };

    case "documents":
      return {
        title: "Brain 2.0 Design Doc",
        summary: "Complete system design for the Brain behavioral support system",
        sourceUrl: "",
        filePath: "/home/clawdbot/clawd/plans/brain-2.0-system-design.md",
        nextActions: JSON.stringify(["Review and approve"]),
        relatedTo: JSON.stringify([]),
        entries: JSON.stringify([{ date: "2026-02-01", note: "Document created" }]),
        tags: JSON.stringify(["design", "brain"]),
        vector: vec,
      };

    case "goals":
      return {
        title: "Ship Brain 2.0",
        description: "Complete all phases of Brain 2.0 behavioral support system",
        timeframe: "short-term",
        status: "active",
        milestones: JSON.stringify([
          { label: "Phase 0: Foundation", done: true, date: "2026-02-01" },
          { label: "Phase 1: Core Loop", done: false },
        ]),
        nextActions: JSON.stringify(["Complete Phase 0 tests"]),
        relatedProjects: JSON.stringify([]),
        entries: JSON.stringify([{ date: "2026-02-01", note: "Goal defined" }]),
        tags: JSON.stringify(["brain", "milestone"]),
        vector: vec,
      };

    case "health":
      return {
        title: "Annual physical",
        category: "medical",
        description: "Yearly checkup with Dr. Smith",
        nextActions: JSON.stringify(["Schedule blood work"]),
        provider: "Dr. Smith",
        followUpDate: "2026-03-01",
        entries: JSON.stringify([{ date: "2026-02-01", note: "Lab results pending" }]),
        tags: JSON.stringify(["checkup", "annual"]),
        vector: vec,
      };

    case "finance":
      return {
        title: "Server hosting bill",
        category: "bill",
        amount: 49.99,
        currency: "USD",
        dueDate: "2026-02-15",
        recurring: JSON.stringify({ interval: "monthly" }),
        nextActions: JSON.stringify(["Set up auto-pay"]),
        entries: JSON.stringify([{ date: "2026-02-01", note: "Monthly Azure bill" }]),
        tags: JSON.stringify(["hosting", "recurring"]),
        vector: vec,
      };

    case "needs_review":
      return {
        inboxId: randomUUID(),
        rawText: "Something unclear about Tuesday",
        suggestedBucket: "admin",
        confidence: 0.45,
        title: "Tuesday thing",
        summary: "Unclear reference to something on Tuesday",
        timestamp: new Date().toISOString(),
        status: "pending",
        vector: vec,
      };

    case "audit_trail":
      return {
        timestamp: new Date().toISOString(),
        action: "captured",
        inputId: randomUUID(),
        outputId: "",
        bucket: "",
        confidence: 0,
        details: "Test audit entry",
        tokenCost: 0,
      };

    default:
      throw new Error(`No sample record for table: ${table}`);
  }
}

// ============================================================================
// Tests
// ============================================================================

async function main() {
  console.log(`\n🧠 Brain 2.0 — Store CRUD Tests`);
  console.log(`   Test dir: ${TEST_DIR}\n`);

  // Initialize store
  store = new BrainStore(TEST_DIR, VECTOR_DIM);
  await store.ensureInitialized();

  // ========== Phase 1: Table Initialization ==========
  console.log("Phase 1: Table Initialization");

  await runTest("All 11 tables initialized", async () => {
    assertEqual(ALL_TABLES.length, 11, "Total table count");
    // Verify we can count rows in each (should be 0)
    for (const table of ALL_TABLES) {
      const count = await store.count(table);
      assertEqual(count, 0, `${table} initial count`);
    }
  });

  await runTest("Stats returns all tables with 0 counts", async () => {
    const stats = await store.stats();
    assertEqual(stats.length, 11, "Stats entries count");
    for (const s of stats) {
      assertEqual(s.count, 0, `${s.table} stats count`);
    }
  });

  // ========== Phase 2: CRUD per Table ==========
  console.log("\nPhase 2: CRUD Operations (all 11 tables)");

  const createdIds: Map<string, string> = new Map();

  for (const table of ALL_TABLES) {
    await runTest(`CREATE in ${table}`, async () => {
      const sample = sampleRecord(table);
      const created = await store.create(table, sample);
      assert(typeof created.id === "string", "Record has id");
      assert((created.id as string).length > 0, "Record id is non-empty");
      createdIds.set(table, created.id as string);

      // Verify count
      const count = await store.count(table);
      assertEqual(count, 1, `${table} count after create`);
    });

    await runTest(`READ in ${table}`, async () => {
      const id = createdIds.get(table)!;
      const record = await store.get(table, id);
      assert(record !== null, `Record found in ${table}`);
      assertEqual(record!.id, id, `${table} record id matches`);
    });

    await runTest(`UPDATE in ${table}`, async () => {
      const id = createdIds.get(table)!;

      // Pick an appropriate field to update based on table type
      let updates: Record<string, unknown>;
      if (table === "audit_trail") {
        updates = { details: "Updated audit entry" };
      } else if (table === "inbox") {
        updates = { status: "classified" };
      } else if (table === "needs_review") {
        updates = { status: "resolved" };
      } else if (table === "people") {
        updates = { context: "Updated context" };
      } else if (table === "projects") {
        updates = { description: "Updated description" };
      } else {
        updates = { tags: JSON.stringify(["updated"]) };
      }

      const updated = await store.update(table, id, updates);
      assert(updated !== null, `Update returned record`);

      // Verify the update persisted
      const readBack = await store.get(table, id);
      for (const [key, val] of Object.entries(updates)) {
        assertEqual(readBack![key], val, `${table}.${key} updated`);
      }
    });

    await runTest(`DELETE in ${table}`, async () => {
      const id = createdIds.get(table)!;
      const deleted = await store.delete(table, id);
      assertEqual(deleted, true, `Delete returned true`);

      // Verify gone
      const record = await store.get(table, id);
      assertEqual(record, null, `Record gone after delete`);

      // Verify count
      const count = await store.count(table);
      assertEqual(count, 0, `${table} count after delete`);
    });
  }

  // ========== Phase 3: Semantic Search ==========
  console.log("\nPhase 3: Semantic Search");

  await runTest("Vector search returns results ordered by similarity", async () => {
    // Create a normalized "query" vector
    const queryVec = normalizeVector(randomVector());

    // Create a "close" vector (slightly perturbed from query)
    const closeVec = normalizeVector(queryVec.map((v, i) => v + (i < 10 ? 0.01 : 0)));

    // Create a "far" vector (very different)
    const farVec = normalizeVector(queryVec.map((v) => -v));

    // Insert both into people table
    const closeRecord = sampleRecord("people");
    closeRecord.vector = closeVec;
    closeRecord.name = "Close Person";
    const created1 = await store.create("people", closeRecord);

    const farRecord = sampleRecord("people");
    farRecord.vector = farVec;
    farRecord.name = "Far Person";
    const created2 = await store.create("people", farRecord);

    // Search with query vector
    const results = await store.search("people", queryVec, 5);
    assert(results.length === 2, `Search returned 2 results, got ${results.length}`);
    assert(results[0].score > results[1].score, "Closer vector ranked higher");
    assertEqual(results[0].record.name, "Close Person", "Closest match is correct");

    // Cleanup
    await store.delete("people", created1.id as string);
    await store.delete("people", created2.id as string);
  });

  await runTest("Search on empty table returns empty results", async () => {
    const queryVec = randomVector();
    const results = await store.search("ideas", queryVec, 5);
    assertEqual(results.length, 0, "No results from empty table");
  });

  await runTest("Audit trail rejects vector search", async () => {
    let threw = false;
    try {
      await store.search("audit_trail", randomVector(), 5);
    } catch (err) {
      threw = true;
      assert(
        (err as Error).message.includes("audit_trail"),
        "Error mentions audit_trail",
      );
    }
    assert(threw, "Vector search on audit_trail should throw");
  });

  // ========== Phase 4: Table Isolation ==========
  console.log("\nPhase 4: Table Isolation");

  await runTest("Writing to people does not affect projects", async () => {
    // Ensure both are empty
    assertEqual(await store.count("people"), 0, "people starts empty");
    assertEqual(await store.count("projects"), 0, "projects starts empty");

    // Create in people
    const personData = sampleRecord("people");
    const person = await store.create("people", personData);

    // Verify people has 1, projects still has 0
    assertEqual(await store.count("people"), 1, "people count after insert");
    assertEqual(await store.count("projects"), 0, "projects still empty");

    // Create in projects
    const projectData = sampleRecord("projects");
    const project = await store.create("projects", projectData);

    assertEqual(await store.count("people"), 1, "people still 1");
    assertEqual(await store.count("projects"), 1, "projects now 1");

    // Delete from people — projects unaffected
    await store.delete("people", person.id as string);
    assertEqual(await store.count("people"), 0, "people now 0");
    assertEqual(await store.count("projects"), 1, "projects still 1");

    // Cleanup
    await store.delete("projects", project.id as string);
  });

  await runTest("All 8 main buckets are independent", async () => {
    const ids: Map<string, string> = new Map();

    // Insert one record in each main bucket
    for (const bucket of MAIN_BUCKETS) {
      const data = sampleRecord(bucket);
      const created = await store.create(bucket, data);
      ids.set(bucket, created.id as string);
    }

    // Verify each has exactly 1
    for (const bucket of MAIN_BUCKETS) {
      const count = await store.count(bucket);
      assertEqual(count, 1, `${bucket} has exactly 1`);
    }

    // Delete first bucket — others unaffected
    await store.delete("people", ids.get("people")!);
    assertEqual(await store.count("people"), 0, "people deleted");
    for (const bucket of MAIN_BUCKETS.filter((b) => b !== "people")) {
      assertEqual(await store.count(bucket), 1, `${bucket} still has 1`);
    }

    // Cleanup
    for (const bucket of MAIN_BUCKETS.filter((b) => b !== "people")) {
      await store.delete(bucket, ids.get(bucket)!);
    }
  });

  // ========== Phase 5: Edge Cases ==========
  console.log("\nPhase 5: Edge Cases");

  await runTest("Get non-existent record returns null", async () => {
    const record = await store.get("people", "nonexistent-id-12345");
    assertEqual(record, null, "Non-existent returns null");
  });

  await runTest("Delete non-existent record returns false", async () => {
    const deleted = await store.delete("people", "nonexistent-id-12345");
    assertEqual(deleted, false, "Non-existent delete returns false");
  });

  await runTest("Update non-existent record returns null", async () => {
    const updated = await store.update("people", "nonexistent-id-12345", { name: "Ghost" });
    assertEqual(updated, null, "Non-existent update returns null");
  });

  await runTest("Multiple records in same table", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const data = sampleRecord("inbox");
      data.rawText = `Thought number ${i + 1}`;
      const created = await store.create("inbox", data);
      ids.push(created.id as string);
    }

    assertEqual(await store.count("inbox"), 5, "5 inbox records");

    const listed = await store.list("inbox");
    assertEqual(listed.length, 5, "List returns 5");

    // Cleanup
    for (const id of ids) {
      await store.delete("inbox", id);
    }
  });

  await runTest("List with limit", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const data = sampleRecord("admin");
      data.title = `Admin item ${i + 1}`;
      const created = await store.create("admin", data);
      ids.push(created.id as string);
    }

    const limited = await store.list("admin", 3);
    assertEqual(limited.length, 3, "List respects limit");

    // Cleanup
    for (const id of ids) {
      await store.delete("admin", id);
    }
  });

  await runTest("Disk usage is measurable", async () => {
    const usage = await store.diskUsageMb();
    assert(usage >= 0, "Disk usage is non-negative");
    assert(typeof usage === "number", "Disk usage is a number");
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

  // Cleanup temp directory
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
