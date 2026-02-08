/**
 * Brain 2.0 — TypeScript interfaces & LanceDB schemas.
 *
 * All record types from the design doc Section 5.3,
 * plus InboxEntry (5.1), AuditEntry (5.5), and NeedsReviewEntry.
 *
 * LanceDB stores arrays/objects as JSON-serialized strings.
 * Each record carries a `vector` field for semantic search
 * (except AuditEntry which is structured-query-only).
 */

// ============================================================================
// Shared helpers
// ============================================================================

/** Entry in the chronological log attached to most records. */
export interface EntryNote {
  date: string; // ISO 8601
  note: string;
}

/** Milestone for GoalRecord. */
export interface Milestone {
  label: string;
  done: boolean;
  date?: string;
}

/** Recurring schedule. */
export interface RecurringSchedule {
  interval: "daily" | "weekly" | "monthly" | "yearly" | "quarterly";
}

// ============================================================================
// Bucket names — the 8 main buckets + system tables
// ============================================================================

export const MAIN_BUCKETS = [
  "people",
  "projects",
  "ideas",
  "admin",
  "documents",
  "goals",
  "health",
  "finance",
] as const;

export const SYSTEM_TABLES = ["inbox", "needs_review", "audit_trail"] as const;

export const ALL_TABLES = [...MAIN_BUCKETS, ...SYSTEM_TABLES] as const;

export type MainBucket = (typeof MAIN_BUCKETS)[number];
export type SystemTable = (typeof SYSTEM_TABLES)[number];
export type TableName = (typeof ALL_TABLES)[number];

// ============================================================================
// 5.1 — Raw Inbox Entry
// ============================================================================

export interface InboxEntry {
  id: string;
  rawText: string;
  source: "drop" | "chat" | "file" | "voice";
  timestamp: string; // ISO 8601
  mediaPath?: string;
  /** Explicit bracket tag detected by the tag parser (e.g., "todo", "buy"). */
  inputTag?: string;
  status: "pending" | "classified" | "needs-review" | "archived";
  vector: number[];
}

// ============================================================================
// 5.3 — Bucket Record Schemas
// ============================================================================

export interface PersonRecord {
  id: string;
  name: string;
  context: string;
  company?: string;
  contactInfo?: string;
  /** JSON-serialized string[] */
  nextActions: string;
  followUpDate?: string;
  lastInteraction: string; // ISO date
  /** JSON-serialized EntryNote[] */
  entries: string;
  /** JSON-serialized string[] */
  tags: string;
  vector: number[];
}

export interface ProjectRecord {
  id: string;
  name: string;
  description: string;
  status: "active" | "paused" | "completed" | "stuck";
  /** JSON-serialized string[] */
  nextActions: string;
  /** JSON-serialized string[] | undefined */
  blockers?: string;
  /** JSON-serialized string[] — IDs */
  relatedPeople: string;
  dueDate?: string;
  /** JSON-serialized EntryNote[] */
  entries: string;
  /** JSON-serialized string[] */
  tags: string;
  vector: number[];
}

export interface IdeaRecord {
  id: string;
  title: string;
  description: string;
  /** JSON-serialized string[] */
  nextActions: string;
  potential: "explore" | "validate" | "build" | "parked";
  /** JSON-serialized string[] | undefined — IDs */
  relatedTo?: string;
  /** JSON-serialized EntryNote[] */
  entries: string;
  /** JSON-serialized string[] */
  tags: string;
  vector: number[];
}

export interface AdminRecord {
  id: string;
  title: string;
  category: "appointment" | "errand" | "bill" | "logistics" | "other";
  /** JSON-serialized string[] */
  nextActions: string;
  dueDate?: string;
  /** JSON-serialized RecurringSchedule | undefined */
  recurring?: string;
  /** JSON-serialized EntryNote[] */
  entries: string;
  /** JSON-serialized string[] */
  tags: string;
  vector: number[];
}

export interface DocumentRecord {
  id: string;
  title: string;
  summary: string;
  sourceUrl?: string;
  filePath?: string;
  /** JSON-serialized string[] */
  nextActions: string;
  /** JSON-serialized string[] | undefined — IDs */
  relatedTo?: string;
  /** JSON-serialized EntryNote[] */
  entries: string;
  /** JSON-serialized string[] */
  tags: string;
  vector: number[];
}

export interface GoalRecord {
  id: string;
  title: string;
  description: string;
  timeframe: "short-term" | "medium-term" | "long-term";
  status: "active" | "achieved" | "paused" | "abandoned";
  /** JSON-serialized Milestone[] */
  milestones: string;
  /** JSON-serialized string[] */
  nextActions: string;
  /** JSON-serialized string[] | undefined — IDs */
  relatedProjects?: string;
  /** JSON-serialized EntryNote[] */
  entries: string;
  /** JSON-serialized string[] */
  tags: string;
  vector: number[];
}

export interface HealthRecord {
  id: string;
  title: string;
  category: "medical" | "fitness" | "nutrition" | "mental" | "wellness";
  description: string;
  /** JSON-serialized string[] */
  nextActions: string;
  provider?: string;
  followUpDate?: string;
  /** JSON-serialized EntryNote[] */
  entries: string;
  /** JSON-serialized string[] */
  tags: string;
  vector: number[];
}

export interface FinanceRecord {
  id: string;
  title: string;
  category: "bill" | "investment" | "expense" | "income" | "budget" | "tax" | "other";
  amount?: number;
  currency?: string;
  dueDate?: string;
  /** JSON-serialized RecurringSchedule | undefined */
  recurring?: string;
  /** JSON-serialized string[] */
  nextActions: string;
  /** JSON-serialized EntryNote[] */
  entries: string;
  /** JSON-serialized string[] */
  tags: string;
  vector: number[];
}

// ============================================================================
// 5.5 — Audit Trail (no vector — structured queries only)
// ============================================================================

export interface AuditEntry {
  id: string;
  timestamp: string;
  action:
    | "captured"
    | "classified"
    | "routed"
    | "updated"
    | "nudged"
    | "reviewed"
    | "fixed"
    | "archived"
    | "action-routed"
    | "merged";
  inputId: string;
  outputId?: string;
  bucket?: string;
  confidence?: number;
  details: string;
  tokenCost?: number;
}

// ============================================================================
// 5.6 — Needs Review Entry
// ============================================================================

export interface NeedsReviewEntry {
  id: string;
  inboxId: string;
  rawText: string;
  suggestedBucket?: string;
  confidence: number;
  title?: string;
  summary?: string;
  timestamp: string;
  status: "pending" | "resolved" | "trashed";
  vector: number[];
}

// ============================================================================
// Union type for any bucket record
// ============================================================================

export type BucketRecord =
  | PersonRecord
  | ProjectRecord
  | IdeaRecord
  | AdminRecord
  | DocumentRecord
  | GoalRecord
  | HealthRecord
  | FinanceRecord;

export type AnyRecord =
  | InboxEntry
  | BucketRecord
  | NeedsReviewEntry
  | AuditEntry;

// ============================================================================
// Classification output (from sorter / llm-task)
// ============================================================================

/** Detected actionable intent values. */
export type DetectedIntent = "reminder" | "todo" | "purchase" | "call" | "booking" | "none";

export interface ClassificationResult {
  bucket: MainBucket | "unknown";
  confidence: number;
  title: string;
  summary: string;
  nextActions: string[];
  entities: {
    people: string[];
    dates: string[];
    amounts: string[];
    locations: string[];
  };
  urgency: "now" | "today" | "this-week" | "someday";
  followUpDate: string | null;
  tags: string[];
  /** Inferred actionable intent from classifier (when no explicit bracket tag). */
  detectedIntent?: DetectedIntent;
}

// ============================================================================
// Embedding provider interface (reuse doc-RAG pattern)
// ============================================================================

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  readonly dim: number;
  readonly name: string;
}

// ============================================================================
// LanceDB row template builders
// ============================================================================

/**
 * Return a "schema seed" row for a given table.
 * LanceDB infers its schema from the first row inserted.
 * We insert a dummy row and immediately delete it.
 */
export function schemaSeed(table: TableName, vectorDim: number): Record<string, unknown> {
  const zeroVec = new Array(vectorDim).fill(0);

  switch (table) {
    case "inbox":
      return {
        id: "__schema__",
        rawText: "",
        source: "drop",
        timestamp: "",
        mediaPath: "",
        inputTag: "",
        status: "pending",
        vector: zeroVec,
      };

    case "people":
      return {
        id: "__schema__",
        name: "",
        context: "",
        company: "",
        contactInfo: "",
        nextActions: "[]",
        followUpDate: "",
        lastInteraction: "",
        entries: "[]",
        tags: "[]",
        vector: zeroVec,
      };

    case "projects":
      return {
        id: "__schema__",
        name: "",
        description: "",
        status: "active",
        nextActions: "[]",
        blockers: "[]",
        relatedPeople: "[]",
        dueDate: "",
        entries: "[]",
        tags: "[]",
        vector: zeroVec,
      };

    case "ideas":
      return {
        id: "__schema__",
        title: "",
        description: "",
        nextActions: "[]",
        potential: "explore",
        relatedTo: "[]",
        entries: "[]",
        tags: "[]",
        vector: zeroVec,
      };

    case "admin":
      return {
        id: "__schema__",
        title: "",
        category: "other",
        nextActions: "[]",
        dueDate: "",
        recurring: "",
        entries: "[]",
        tags: "[]",
        vector: zeroVec,
      };

    case "documents":
      return {
        id: "__schema__",
        title: "",
        summary: "",
        sourceUrl: "",
        filePath: "",
        nextActions: "[]",
        relatedTo: "[]",
        entries: "[]",
        tags: "[]",
        vector: zeroVec,
      };

    case "goals":
      return {
        id: "__schema__",
        title: "",
        description: "",
        timeframe: "short-term",
        status: "active",
        milestones: "[]",
        nextActions: "[]",
        relatedProjects: "[]",
        entries: "[]",
        tags: "[]",
        vector: zeroVec,
      };

    case "health":
      return {
        id: "__schema__",
        title: "",
        category: "wellness",
        description: "",
        nextActions: "[]",
        provider: "",
        followUpDate: "",
        entries: "[]",
        tags: "[]",
        vector: zeroVec,
      };

    case "finance":
      return {
        id: "__schema__",
        title: "",
        category: "other",
        amount: 0,
        currency: "",
        dueDate: "",
        recurring: "",
        nextActions: "[]",
        entries: "[]",
        tags: "[]",
        vector: zeroVec,
      };

    case "needs_review":
      return {
        id: "__schema__",
        inboxId: "",
        rawText: "",
        suggestedBucket: "",
        confidence: 0,
        title: "",
        summary: "",
        timestamp: "",
        status: "pending",
        vector: zeroVec,
      };

    case "audit_trail":
      return {
        id: "__schema__",
        timestamp: "",
        action: "captured",
        inputId: "",
        outputId: "",
        bucket: "",
        confidence: 0,
        details: "",
        tokenCost: 0,
      };

    default:
      throw new Error(`Unknown table: ${table}`);
  }
}
