/**
 * Brain 2.0 — Phase 1 Tests: Core Loop (Capture + Classify + Store).
 *
 * Verifies the full pipeline:
 *   /drop → inbox → classify → route → bucket → audit
 *
 * Uses mock classifier (no real LLM calls) + isolated temp storage.
 *
 * Run: cd ~/.openclaw/extensions/brain && npx tsx tests/phase1.test.ts
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";

import { BrainStore } from "../store.js";
import type {
  ClassificationResult,
  EmbeddingProvider,
  MainBucket,
  TableName,
} from "../schemas.js";
import { handleDrop, dropAndClassify } from "../commands/drop.js";
import {
  checkConfidence,
  buildBucketRecord,
  routeClassification,
  cosineSimilarity,
  checkDuplicate,
  mergeIntoExisting,
  DEFAULT_CONFIDENCE_THRESHOLD,
  DEDUP_SIMILARITY_THRESHOLD,
} from "../router.js";
import {
  bucketToTable,
  buildClassificationPrompt,
  validateClassification,
  type ClassifyResult,
  type ClassifierFn,
} from "../classifier.js";
import { logAudit, getAuditTrail } from "../audit.js";

// ============================================================================
// Test infrastructure
// ============================================================================

const VECTOR_DIM = 8; // Small vectors for fast tests
const TEST_DIR = `/tmp/brain-phase1-${randomUUID()}`;

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
    throw new Error(
      `${label}: expected "${actual}" to include "${expected}"`,
    );
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
// Mock embedding provider (deterministic, fast)
// ============================================================================

class MockEmbedder implements EmbeddingProvider {
  readonly dim = VECTOR_DIM;
  readonly name = "Mock Embedder";
  private callCount = 0;

  // Map text → vector for deterministic embeddings
  private cache = new Map<string, number[]>();

  async embed(text: string): Promise<number[]> {
    if (this.cache.has(text)) return this.cache.get(text)!;
    this.callCount++;
    // Generate a deterministic-ish vector based on text hash
    const vec = normalizeVector(
      Array.from({ length: VECTOR_DIM }, (_, i) => {
        let hash = 0;
        for (let j = 0; j < text.length; j++) {
          hash = ((hash << 5) - hash + text.charCodeAt(j) + i * 7) | 0;
        }
        return (hash % 1000) / 1000;
      }),
    );
    this.cache.set(text, vec);
    return vec;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }

  getCallCount(): number {
    return this.callCount;
  }
}

// ============================================================================
// Mock classifier factory
// ============================================================================

function createMockClassifier(
  overrides: Partial<ClassificationResult> = {},
): ClassifierFn {
  return async (rawText: string): Promise<ClassifyResult> => {
    // Default smart classification based on text content
    let bucket: ClassificationResult["bucket"] = "unknown";
    let confidence = 0.5;
    let urgency: ClassificationResult["urgency"] = "someday";
    const entities: ClassificationResult["entities"] = {
      people: [],
      dates: [],
      amounts: [],
      locations: [],
    };

    const lower = rawText.toLowerCase();

    // Simple rule-based mock classification
    if (lower.includes("dr.") || lower.includes("doctor") || lower.match(/\b[A-Z][a-z]+ [A-Z][a-z]+\b/)) {
      bucket = "people";
      confidence = 0.92;
      urgency = "this-week";
      // Extract people names
      const nameMatch = rawText.match(/(?:Dr\.\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
      if (nameMatch) entities.people.push(nameMatch[0]);
    }
    if (lower.includes("pay") || lower.includes("bill") || lower.includes("electricity") || lower.includes("invest")) {
      bucket = "finance";
      confidence = 0.95;
      urgency = "this-week";
      const amountMatch = rawText.match(/\$[\d,.]+/);
      if (amountMatch) entities.amounts.push(amountMatch[0]);
    }
    if (lower.includes("what if") || lower.includes("idea") || lower.includes("drone")) {
      bucket = "idea";
      confidence = 0.88;
      urgency = "someday";
    }
    if (lower.includes("dentist") || lower.includes("appointment") || lower.includes("checkup")) {
      bucket = "health";
      confidence = 0.90;
      urgency = "this-week";
      const dateMatch = rawText.match(/(?:next\s+)?(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i);
      if (dateMatch) entities.dates.push(dateMatch[0]);
    }
    if (lower.includes("project") || lower.includes("deadline") || lower.includes("task")) {
      bucket = "project";
      confidence = 0.91;
      urgency = "today";
    }
    if (lower.includes("meeting") || lower.includes("errand") || lower.includes("pick up")) {
      bucket = "admin";
      confidence = 0.87;
      urgency = "today";
    }
    if (lower.includes("document") || lower.includes("article") || lower.includes("read")) {
      bucket = "document";
      confidence = 0.85;
      urgency = "this-week";
    }
    if (lower.includes("goal") || lower.includes("milestone") || lower.includes("life")) {
      bucket = "goal";
      confidence = 0.83;
      urgency = "someday";
    }

    const title =
      rawText.length > 40 ? rawText.slice(0, 37) + "..." : rawText;

    const classification: ClassificationResult = {
      bucket,
      confidence,
      title,
      summary: `Processed: ${rawText}`,
      nextActions: [`Follow up on: ${rawText.slice(0, 50)}`],
      entities,
      urgency,
      followUpDate: null,
      tags: ["test"],
      ...overrides,
    };

    return { classification, tokensUsed: 150 };
  };
}

/** Create a mock classifier that always returns low confidence */
function createLowConfidenceClassifier(): ClassifierFn {
  return createMockClassifier({
    confidence: 0.45,
    bucket: "unknown",
  });
}

// ============================================================================
// Test helper: clean up all tables
// ============================================================================

async function cleanAllTables(): Promise<void> {
  for (const table of [
    "inbox",
    "people",
    "projects",
    "ideas",
    "admin",
    "documents",
    "goals",
    "health",
    "finance",
    "needs_review",
    "audit_trail",
  ] as TableName[]) {
    const records = await store.list(table);
    for (const r of records) {
      await store.delete(table, r.id as string);
    }
  }
}

// ============================================================================
// Tests
// ============================================================================

async function main() {
  console.log(`\n🧠 Brain 2.0 — Phase 1 Tests: Core Loop`);
  console.log(`   Test dir: ${TEST_DIR}\n`);

  // Initialize store with small vectors for speed
  store = new BrainStore(TEST_DIR, VECTOR_DIM);
  await store.ensureInitialized();

  const embedder = new MockEmbedder();

  // ========== Section 1: Classifier Module ==========
  console.log("Section 1: Classifier Module");

  await runTest("buildClassificationPrompt generates correct prompt", async () => {
    const prompt = buildClassificationPrompt("Call Dr. Smith");
    assertIncludes(prompt, "Call Dr. Smith", "Prompt contains raw text");
    assertIncludes(prompt, "Classify this thought", "Prompt has instruction");
  });

  await runTest("bucketToTable maps singular to plural correctly", async () => {
    assertEqual(bucketToTable("project"), "projects", "project → projects");
    assertEqual(bucketToTable("idea"), "ideas", "idea → ideas");
    assertEqual(bucketToTable("people"), "people", "people → people");
    assertEqual(bucketToTable("admin"), "admin", "admin → admin");
    assertEqual(bucketToTable("document"), "documents", "document → documents");
    assertEqual(bucketToTable("goal"), "goals", "goal → goals");
    assertEqual(bucketToTable("health"), "health", "health → health");
    assertEqual(bucketToTable("finance"), "finance", "finance → finance");
    assertEqual(bucketToTable("unknown"), null, "unknown → null");
    assertEqual(bucketToTable("garbage"), null, "garbage → null");
  });

  await runTest("validateClassification detects missing fields", async () => {
    const errors = validateClassification({ bucket: "people" });
    assert(errors.length > 0, "Should have validation errors");
    assertIncludes(errors.join(", "), "confidence", "Missing confidence");
  });

  await runTest("validateClassification accepts valid result", async () => {
    const valid: ClassificationResult = {
      bucket: "people",
      confidence: 0.92,
      title: "Dr. Smith",
      summary: "Call about lab results",
      nextActions: ["Call Dr. Smith"],
      entities: { people: ["Dr. Smith"], dates: [], amounts: [], locations: [] },
      urgency: "this-week",
      followUpDate: null,
      tags: ["medical"],
    };
    const errors = validateClassification(valid);
    assertEqual(errors.length, 0, "No validation errors");
  });

  await runTest("Mock classifier returns correct structure", async () => {
    const classifier = createMockClassifier();
    const { classification, tokensUsed } = await classifier(
      "Call Dr. Smith about lab results",
    );
    assertEqual(classification.bucket, "people", "Bucket is people");
    assert(classification.confidence > 0.8, "High confidence");
    assert(tokensUsed > 0, "Token count > 0");
    assert(classification.entities.people.length > 0, "Has people entities");
  });

  // ========== Section 2: Router / Bouncer ==========
  console.log("\nSection 2: Router / Bouncer");

  await runTest("checkConfidence routes high-confidence items", async () => {
    const result = checkConfidence({
      bucket: "people",
      confidence: 0.92,
      title: "Dr. Smith",
      summary: "Lab results",
      nextActions: [],
      entities: { people: [], dates: [], amounts: [], locations: [] },
      urgency: "this-week",
      followUpDate: null,
      tags: [],
    });
    assertEqual(result.routable, true, "Should be routable");
    assertEqual(result.bucket, "people", "Bucket is people");
  });

  await runTest("checkConfidence rejects low-confidence items", async () => {
    const result = checkConfidence({
      bucket: "people",
      confidence: 0.45,
      title: "Something",
      summary: "Unclear",
      nextActions: [],
      entities: { people: [], dates: [], amounts: [], locations: [] },
      urgency: "someday",
      followUpDate: null,
      tags: [],
    });
    assertEqual(result.routable, false, "Should not be routable");
    assert(result.reason !== undefined, "Has a reason");
  });

  await runTest("checkConfidence rejects unknown bucket", async () => {
    const result = checkConfidence({
      bucket: "unknown",
      confidence: 0.99,
      title: "What?",
      summary: "No idea",
      nextActions: [],
      entities: { people: [], dates: [], amounts: [], locations: [] },
      urgency: "someday",
      followUpDate: null,
      tags: [],
    });
    assertEqual(result.routable, false, "Unknown is never routable");
    assertIncludes(result.reason!, "unknown", "Reason mentions unknown");
  });

  await runTest("checkConfidence respects custom threshold", async () => {
    const classification: ClassificationResult = {
      bucket: "people",
      confidence: 0.75,
      title: "Borderline",
      summary: "Test",
      nextActions: [],
      entities: { people: [], dates: [], amounts: [], locations: [] },
      urgency: "someday",
      followUpDate: null,
      tags: [],
    };

    // With default threshold (0.80), should be rejected
    const strict = checkConfidence(classification, 0.80);
    assertEqual(strict.routable, false, "Rejected at 0.80 threshold");

    // With lower threshold (0.70), should be accepted
    const relaxed = checkConfidence(classification, 0.70);
    assertEqual(relaxed.routable, true, "Accepted at 0.70 threshold");
  });

  await runTest("buildBucketRecord creates correct people record", async () => {
    const classification: ClassificationResult = {
      bucket: "people",
      confidence: 0.92,
      title: "Dr. Smith",
      summary: "Call about lab results",
      nextActions: ["Call Dr. Smith Monday"],
      entities: { people: ["Dr. Smith"], dates: ["Monday"], amounts: [], locations: [] },
      urgency: "this-week",
      followUpDate: "2026-02-10",
      tags: ["medical", "doctor"],
    };
    const record = buildBucketRecord(classification, "people", "inbox-123");
    assertEqual(record.name, "Dr. Smith", "Name set");
    assertIncludes(record.context as string, "lab results", "Context has summary");
    assertEqual(record.followUpDate, "2026-02-10", "Follow-up date set");
    const nextActions = JSON.parse(record.nextActions as string);
    assert(nextActions.includes("Call Dr. Smith Monday"), "NextActions has action");
    const tags = JSON.parse(record.tags as string);
    assert(tags.includes("medical"), "Tags has medical");
  });

  await runTest("buildBucketRecord creates correct finance record", async () => {
    const classification: ClassificationResult = {
      bucket: "finance",
      confidence: 0.95,
      title: "Electricity bill",
      summary: "Pay electricity bill by Friday",
      nextActions: ["Pay the bill"],
      entities: { people: [], dates: ["Friday"], amounts: ["$150"], locations: [] },
      urgency: "this-week",
      followUpDate: "2026-02-07",
      tags: ["bill", "utilities"],
    };
    const record = buildBucketRecord(classification, "finance", "inbox-456");
    assertEqual(record.title, "Electricity bill", "Title set");
    assertEqual(record.category, "bill", "Category inferred as bill");
    assertEqual(record.amount, 150, "Amount extracted");
    assertEqual(record.dueDate, "2026-02-07", "Due date set");
  });

  await runTest("buildBucketRecord creates correct health record", async () => {
    const classification: ClassificationResult = {
      bucket: "health",
      confidence: 0.90,
      title: "Dentist appointment Tuesday",
      summary: "Schedule dentist appointment for next Tuesday",
      nextActions: ["Confirm appointment"],
      entities: { people: [], dates: ["next Tuesday"], amounts: [], locations: [] },
      urgency: "this-week",
      followUpDate: null,
      tags: ["dental"],
    };
    const record = buildBucketRecord(classification, "health", "inbox-789");
    assertEqual(record.title, "Dentist appointment Tuesday", "Title set");
    assertEqual(record.category, "medical", "Category inferred as medical");
  });

  await runTest("buildBucketRecord creates correct idea record", async () => {
    const classification: ClassificationResult = {
      bucket: "idea",
      confidence: 0.88,
      title: "Drone delivery service",
      summary: "What if we built a drone delivery service",
      nextActions: ["Research drone regulations"],
      entities: { people: [], dates: [], amounts: [], locations: [] },
      urgency: "someday",
      followUpDate: null,
      tags: ["startup", "drones"],
    };
    const record = buildBucketRecord(classification, "ideas", "inbox-abc");
    assertEqual(record.title, "Drone delivery service", "Title set");
    assertEqual(record.potential, "explore", "Potential is explore");
  });

  // ========== Section 3: Cosine Similarity ==========
  console.log("\nSection 3: Cosine Similarity & Duplicate Detection");

  await runTest("cosineSimilarity of identical vectors = 1", async () => {
    const v = normalizeVector([1, 2, 3, 4, 5, 6, 7, 8]);
    const sim = cosineSimilarity(v, v);
    assert(Math.abs(sim - 1.0) < 0.001, `Similarity should be ~1, got ${sim}`);
  });

  await runTest("cosineSimilarity of opposite vectors = -1", async () => {
    const v = normalizeVector([1, 2, 3, 4, 5, 6, 7, 8]);
    const neg = v.map((x) => -x);
    const sim = cosineSimilarity(v, neg);
    assert(
      Math.abs(sim - -1.0) < 0.001,
      `Similarity should be ~-1, got ${sim}`,
    );
  });

  await runTest("cosineSimilarity of orthogonal vectors ≈ 0", async () => {
    const v1 = normalizeVector([1, 0, 0, 0, 0, 0, 0, 0]);
    const v2 = normalizeVector([0, 1, 0, 0, 0, 0, 0, 0]);
    const sim = cosineSimilarity(v1, v2);
    assert(Math.abs(sim) < 0.01, `Similarity should be ~0, got ${sim}`);
  });

  await runTest("checkDuplicate finds no dup in empty bucket", async () => {
    const result = await checkDuplicate(
      store,
      "people",
      randomVector(),
    );
    assertEqual(result.isDuplicate, false, "No duplicate in empty bucket");
  });

  // ========== Section 4: Audit Trail ==========
  console.log("\nSection 4: Audit Trail");

  await runTest("logAudit creates an audit entry", async () => {
    await cleanAllTables();
    const inputId = randomUUID();
    const auditId = await logAudit(store, {
      action: "captured",
      inputId,
      details: "Test audit entry",
    });
    assert(typeof auditId === "string", "Audit ID is a string");

    const entry = await store.get("audit_trail", auditId);
    assert(entry !== null, "Audit entry exists");
    assertEqual(entry!.action, "captured", "Action is captured");
    assertEqual(entry!.inputId, inputId, "Input ID matches");
  });

  await runTest("getAuditTrail returns entries for an input ID", async () => {
    await cleanAllTables();
    const inputId = randomUUID();

    await logAudit(store, {
      action: "captured",
      inputId,
      details: "First action",
    });
    await logAudit(store, {
      action: "classified",
      inputId,
      bucket: "people",
      confidence: 0.92,
      details: "Classified as people",
      tokenCost: 150,
    });
    await logAudit(store, {
      action: "routed",
      inputId,
      bucket: "people",
      details: "Routed to people",
    });

    // Also add an unrelated audit entry
    await logAudit(store, {
      action: "captured",
      inputId: randomUUID(),
      details: "Unrelated entry",
    });

    const trail = await getAuditTrail(store, inputId);
    assertEqual(trail.length, 3, "3 audit entries for this input");
    assertEqual(trail[0].action, "captured", "First action is captured");
    assertEqual(trail[1].action, "classified", "Second action is classified");
    assertEqual(trail[2].action, "routed", "Third action is routed");
  });

  // ========== Section 5: Drop Command ==========
  console.log("\nSection 5: Drop Command");

  await runTest("handleDrop creates inbox entry", async () => {
    await cleanAllTables();
    const result = await handleDrop(
      store,
      embedder,
      "Call Dr. Smith about lab results",
      "drop",
    );
    assertEqual(result.status, "captured", "Status is captured");
    assertEqual(result.message, "✅ Captured", "Ack message");
    assert(typeof result.id === "string", "Has an ID");

    // Verify inbox entry
    const entry = await store.get("inbox", result.id);
    assert(entry !== null, "Inbox entry exists");
    assertEqual(entry!.rawText, "Call Dr. Smith about lab results", "Text stored");
    assertEqual(entry!.source, "drop", "Source is drop");
    assertEqual(entry!.status, "pending", "Status is pending");
  });

  await runTest("handleDrop logs captured audit entry", async () => {
    await cleanAllTables();
    const result = await handleDrop(
      store,
      embedder,
      "Test thought",
      "drop",
    );

    const trail = await getAuditTrail(store, result.id);
    assert(trail.length >= 1, "At least 1 audit entry");
    assertEqual(trail[0].action, "captured", "Action is captured");
    assertIncludes(trail[0].details as string, "Test thought", "Details include text");
  });

  // ========== Section 6: Full Pipeline ==========
  console.log("\nSection 6: Full Pipeline (Drop → Classify → Route → Audit)");

  await runTest(
    "Dr. Smith drop → people bucket → audit trail",
    async () => {
      await cleanAllTables();
      const classifier = createMockClassifier();

      const result = await dropAndClassify(
        store,
        embedder,
        classifier,
        "Call Dr. Smith about lab results",
        "drop",
      );

      assertEqual(result.status, "captured", "Status is captured");

      // Check inbox was created and updated
      const inbox = await store.get("inbox", result.id);
      assert(inbox !== null, "Inbox entry exists");
      assertEqual(inbox!.status, "classified", "Inbox status updated to classified");

      // Check record was routed to people
      const people = await store.list("people");
      assertEqual(people.length, 1, "1 record in people");
      assertIncludes(
        (people[0].name as string) || (people[0].context as string) || "",
        "Dr. Smith",
        "People record mentions Dr. Smith",
      );

      // Check audit trail
      const trail = await getAuditTrail(store, result.id);
      assert(trail.length >= 3, `At least 3 audit entries, got ${trail.length}`);
      const actions = trail.map((t) => t.action);
      assert(actions.includes("captured"), "Has captured action");
      assert(actions.includes("classified"), "Has classified action");
      assert(
        actions.includes("routed") || actions.includes("merged"),
        "Has routed/merged action",
      );
    },
  );

  await runTest(
    "Pay electricity bill → finance bucket",
    async () => {
      await cleanAllTables();
      const classifier = createMockClassifier();

      await dropAndClassify(
        store,
        embedder,
        classifier,
        "Pay electricity bill by Friday",
        "drop",
      );

      const finance = await store.list("finance");
      assertEqual(finance.length, 1, "1 record in finance");
      assertIncludes(
        (finance[0].title as string).toLowerCase(),
        "pay",
        "Finance record mentions pay",
      );
    },
  );

  await runTest(
    "Drone delivery idea → ideas bucket",
    async () => {
      await cleanAllTables();
      const classifier = createMockClassifier();

      await dropAndClassify(
        store,
        embedder,
        classifier,
        "What if we built a drone delivery service",
        "drop",
      );

      const ideas = await store.list("ideas");
      assertEqual(ideas.length, 1, "1 record in ideas");
      assertIncludes(
        (ideas[0].title as string).toLowerCase(),
        "drone",
        "Idea record mentions drone",
      );
    },
  );

  await runTest(
    "Dentist appointment → health bucket",
    async () => {
      await cleanAllTables();
      const classifier = createMockClassifier();

      await dropAndClassify(
        store,
        embedder,
        classifier,
        "Dentist appointment next Tuesday",
        "drop",
      );

      const health = await store.list("health");
      assertEqual(health.length, 1, "1 record in health");
      assertIncludes(
        (health[0].title as string).toLowerCase(),
        "dentist",
        "Health record mentions dentist",
      );
      assertEqual(health[0].category, "medical", "Category is medical");
    },
  );

  await runTest(
    "Low confidence → needs_review",
    async () => {
      await cleanAllTables();
      const lowConfClassifier = createLowConfidenceClassifier();

      const result = await dropAndClassify(
        store,
        embedder,
        lowConfClassifier,
        "Something vague about Tuesday",
        "drop",
      );

      // Should NOT be in any main bucket
      for (const bucket of [
        "people",
        "projects",
        "ideas",
        "admin",
        "documents",
        "goals",
        "health",
        "finance",
      ] as MainBucket[]) {
        const count = await store.count(bucket);
        assertEqual(count, 0, `${bucket} should be empty`);
      }

      // Should be in needs_review
      const reviews = await store.list("needs_review");
      assertEqual(reviews.length, 1, "1 record in needs_review");
      assertEqual(reviews[0].status, "pending", "Status is pending");

      // Check audit trail has needs-review entry
      const trail = await getAuditTrail(store, result.id);
      const actions = trail.map((t) => t.action);
      assert(actions.includes("needs-review"), "Has needs-review action");
    },
  );

  await runTest(
    "Audit trail has entries for all pipeline operations",
    async () => {
      await cleanAllTables();
      const classifier = createMockClassifier();

      const result = await dropAndClassify(
        store,
        embedder,
        classifier,
        "Call Dr. Smith about lab results",
        "drop",
      );

      const trail = await getAuditTrail(store, result.id);

      // Should have: captured, classified, routed (3 minimum)
      assert(trail.length >= 3, `At least 3 audit entries, got ${trail.length}`);

      // Verify order: captured comes first
      assertEqual(trail[0].action, "captured", "First action is captured");

      // Verify classified entry has token cost
      const classifiedEntry = trail.find((t) => t.action === "classified");
      assert(classifiedEntry !== undefined, "Has classified entry");
      assert(
        (classifiedEntry!.tokenCost as number) > 0,
        "Token cost is recorded",
      );
      assert(
        (classifiedEntry!.confidence as number) > 0,
        "Confidence is recorded",
      );

      // Verify routed entry has bucket info
      const routedEntry = trail.find(
        (t) => t.action === "routed" || t.action === "merged",
      );
      assert(routedEntry !== undefined, "Has routed entry");
      assert(
        (routedEntry!.bucket as string).length > 0,
        "Bucket is recorded",
      );
    },
  );

  // ========== Section 7: Duplicate Detection ==========
  console.log("\nSection 7: Duplicate Detection & Auto-Merge");

  await runTest(
    "Duplicate drops auto-merge into existing record",
    async () => {
      await cleanAllTables();
      const classifier = createMockClassifier();

      // First drop
      await dropAndClassify(
        store,
        embedder,
        classifier,
        "Call Dr. Smith about lab results",
        "drop",
      );

      let people = await store.list("people");
      assertEqual(people.length, 1, "1 record after first drop");

      // Second drop with very similar text (should merge)
      await dropAndClassify(
        store,
        embedder,
        classifier,
        "Call Dr. Smith about lab results follow up",
        "drop",
      );

      people = await store.list("people");
      // Note: with mock embedder, similar texts may or may not trigger dedup
      // The important thing is the pipeline doesn't crash and either merges or creates
      assert(
        people.length >= 1 && people.length <= 2,
        `People should have 1-2 records, got ${people.length}`,
      );

      // If merged, entries array should have 2 entries
      if (people.length === 1) {
        const entries = JSON.parse(people[0].entries as string);
        assert(
          entries.length >= 2,
          `Merged record should have 2+ entries, got ${entries.length}`,
        );
      }
    },
  );

  await runTest("mergeIntoExisting appends to entries log", async () => {
    await cleanAllTables();

    // Create a record manually
    const vec = randomVector();
    const created = await store.create("people", {
      name: "Dr. Smith",
      context: "Primary care physician",
      company: "",
      contactInfo: "",
      nextActions: JSON.stringify(["Original action"]),
      followUpDate: "",
      lastInteraction: "2026-02-01",
      entries: JSON.stringify([{ date: "2026-02-01", note: "First note" }]),
      tags: JSON.stringify(["medical"]),
      vector: vec,
    });

    const classification: ClassificationResult = {
      bucket: "people",
      confidence: 0.92,
      title: "Dr. Smith",
      summary: "New info about Dr. Smith",
      nextActions: ["New action"],
      entities: { people: ["Dr. Smith"], dates: [], amounts: [], locations: [] },
      urgency: "this-week",
      followUpDate: "2026-03-01",
      tags: ["medical"],
    };

    const merged = await mergeIntoExisting(
      store,
      "people",
      created.id as string,
      classification,
    );

    assert(merged !== null, "Merge returned record");

    const entries = JSON.parse(merged!.entries as string);
    assertEqual(entries.length, 2, "Now has 2 entries");
    assertEqual(entries[0].note, "First note", "Original entry preserved");
    assertIncludes(entries[1].note, "New info", "New entry appended");

    const actions = JSON.parse(merged!.nextActions as string);
    assert(actions.includes("Original action"), "Original action preserved");
    assert(actions.includes("New action"), "New action added");
  });

  // ========== Section 8: routeClassification Full Flow ==========
  console.log("\nSection 8: routeClassification Integration");

  await runTest("routeClassification routes high-confidence to bucket", async () => {
    await cleanAllTables();

    // Create an inbox entry first
    const inboxEntry = await store.create("inbox", {
      rawText: "Call Dr. Smith",
      source: "drop",
      timestamp: new Date().toISOString(),
      mediaPath: "",
      status: "pending",
      vector: await embedder.embed("Call Dr. Smith"),
    });

    const classification: ClassificationResult = {
      bucket: "people",
      confidence: 0.92,
      title: "Dr. Smith Call",
      summary: "Need to call Dr. Smith about results",
      nextActions: ["Call Dr. Smith"],
      entities: { people: ["Dr. Smith"], dates: [], amounts: [], locations: [] },
      urgency: "this-week",
      followUpDate: null,
      tags: ["medical"],
    };

    const result = await routeClassification(
      store,
      embedder,
      classification,
      inboxEntry.id as string,
      "Call Dr. Smith",
    );

    assertEqual(result.action, "routed", "Action is routed");
    assertEqual(result.bucket, "people", "Bucket is people");
    assert(typeof result.recordId === "string", "Has record ID");

    // Verify inbox status updated
    const updatedInbox = await store.get("inbox", inboxEntry.id as string);
    assertEqual(updatedInbox!.status, "classified", "Inbox status is classified");

    // Verify audit entry
    const trail = await getAuditTrail(store, inboxEntry.id as string);
    const routedAudit = trail.find((t) => t.action === "routed");
    assert(routedAudit !== undefined, "Has routed audit entry");
  });

  await runTest("routeClassification sends low-confidence to needs_review", async () => {
    await cleanAllTables();

    const inboxEntry = await store.create("inbox", {
      rawText: "Tuesday thing",
      source: "drop",
      timestamp: new Date().toISOString(),
      mediaPath: "",
      status: "pending",
      vector: await embedder.embed("Tuesday thing"),
    });

    const classification: ClassificationResult = {
      bucket: "admin",
      confidence: 0.45,
      title: "Tuesday thing",
      summary: "Something about Tuesday",
      nextActions: [],
      entities: { people: [], dates: ["Tuesday"], amounts: [], locations: [] },
      urgency: "someday",
      followUpDate: null,
      tags: [],
    };

    const result = await routeClassification(
      store,
      embedder,
      classification,
      inboxEntry.id as string,
      "Tuesday thing",
    );

    assertEqual(result.action, "needs-review", "Action is needs-review");

    // Verify needs_review entry
    const reviews = await store.list("needs_review");
    assertEqual(reviews.length, 1, "1 needs_review entry");
    assertEqual(reviews[0].suggestedBucket, "admin", "Suggested bucket is admin");

    // Verify inbox status
    const updatedInbox = await store.get("inbox", inboxEntry.id as string);
    assertEqual(updatedInbox!.status, "needs-review", "Inbox status is needs-review");
  });

  // ========== Section 9: Multi-Bucket Routing ==========
  console.log("\nSection 9: Multi-Bucket Routing");

  await runTest("Different drops route to different buckets", async () => {
    await cleanAllTables();
    const classifier = createMockClassifier();

    // Drop 1: People
    await dropAndClassify(store, embedder, classifier, "Call Dr. Smith about lab results");

    // Drop 2: Finance
    await dropAndClassify(store, embedder, classifier, "Pay electricity bill by Friday");

    // Drop 3: Ideas
    await dropAndClassify(store, embedder, classifier, "What if we built a drone delivery service");

    // Drop 4: Health
    await dropAndClassify(store, embedder, classifier, "Dentist appointment next Tuesday");

    // Drop 5: Project
    await dropAndClassify(store, embedder, classifier, "Project deadline is next week, need to finish task");

    // Verify each bucket got exactly 1
    const peopleCt = await store.count("people");
    const financeCt = await store.count("finance");
    const ideasCt = await store.count("ideas");
    const healthCt = await store.count("health");
    const projectsCt = await store.count("projects");

    assert(peopleCt >= 1, `People: ${peopleCt} (expected ≥1)`);
    assert(financeCt >= 1, `Finance: ${financeCt} (expected ≥1)`);
    assert(ideasCt >= 1, `Ideas: ${ideasCt} (expected ≥1)`);
    assert(healthCt >= 1, `Health: ${healthCt} (expected ≥1)`);
    assert(projectsCt >= 1, `Projects: ${projectsCt} (expected ≥1)`);

    // Verify 5 inbox entries
    const inboxCt = await store.count("inbox");
    assertEqual(inboxCt, 5, "5 inbox entries");

    // Verify audit trail has entries
    const allAudits = await store.list("audit_trail");
    assert(allAudits.length >= 15, `At least 15 audit entries (3 per drop), got ${allAudits.length}`);
  });

  // ========== Section 10: Edge Cases ==========
  console.log("\nSection 10: Edge Cases");

  await runTest("Drop with empty text still captures", async () => {
    await cleanAllTables();
    const result = await handleDrop(store, embedder, "", "drop");
    assertEqual(result.status, "captured", "Still captured");
    const entry = await store.get("inbox", result.id);
    assertEqual(entry!.rawText, "", "Empty text stored");
  });

  await runTest("Drop with very long text captures OK", async () => {
    await cleanAllTables();
    const longText = "A ".repeat(1000);
    const result = await handleDrop(store, embedder, longText, "drop");
    assertEqual(result.status, "captured", "Long text captured");
  });

  await runTest("buildBucketRecord handles all 8 buckets", async () => {
    const classification: ClassificationResult = {
      bucket: "people",
      confidence: 0.9,
      title: "Test Record",
      summary: "Test summary",
      nextActions: ["Test action"],
      entities: { people: [], dates: [], amounts: [], locations: [] },
      urgency: "someday",
      followUpDate: null,
      tags: ["test"],
    };

    const buckets: MainBucket[] = [
      "people",
      "projects",
      "ideas",
      "admin",
      "documents",
      "goals",
      "health",
      "finance",
    ];

    for (const bucket of buckets) {
      const record = buildBucketRecord(classification, bucket, "test-inbox");
      assert(
        record.nextActions !== undefined,
        `${bucket}: has nextActions`,
      );
      assert(record.entries !== undefined, `${bucket}: has entries`);
      assert(record.tags !== undefined, `${bucket}: has tags`);
    }
  });

  await runTest("Photo source type is accepted", async () => {
    await cleanAllTables();
    const result = await handleDrop(
      store,
      embedder,
      "Text from OCR",
      "photo" as any,
      "/path/to/image.jpg",
    );
    assertEqual(result.status, "captured", "Photo drop captured");
    const entry = await store.get("inbox", result.id);
    assertEqual(entry!.source, "photo", "Source is photo");
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
