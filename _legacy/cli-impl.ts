/**
 * Brain 2.0 — CLI implementation (TypeScript).
 *
 * Called by cli.mjs wrapper or directly via `npx tsx cli-impl.ts`.
 *
 * Subcommands:
 *   fetch-inbox --id <uuid> --json
 *   classify --id <uuid> --json               (classify an inbox entry)
 *   classify-text --text <text> --json         (classify raw text directly)
 *   check-confidence --json                    (reads stdin)
 *   route --json                               (reads stdin)
 *   needs-review --json                        (reads stdin)
 *   audit --json                               (reads stdin)
 *   audit-list --input-id <uuid> --json        (list audit entries for input)
 *   gather-digest --type <type> --json
 *   format-digest --type <type> --max-words <n> --json  (reads stdin or gathers fresh)
 *   check-dnd --json                           (returns DND status)
 *   dnd --on / --off --json                    (toggle manual DND)
 *   list --bucket <name> --json
 *   get --id <uuid> --json
 *   update --id <uuid> --json                  (reads stdin)
 *   delete --id <uuid> --json
 *   stats --json
 */

import { BrainStore } from "./store.js";
import {
  checkConfidence,
  buildBucketRecord,
  routeClassification,
  DEFAULT_CONFIDENCE_THRESHOLD,
} from "./router.js";
import {
  gatherDigestData,
  formatDigest,
  generateNudges,
  type DigestType,
  DIGEST_DEFAULTS,
} from "./digest.js";
import { checkDnd, toggleDnd, recordSkippedDigest, type DndConfig, DEFAULT_DND_CONFIG } from "./dnd.js";
import { classifyText, createClassifier, type ClassifyOptions } from "./classifier.js";
import { logAudit, getAuditTrail } from "./audit.js";
import {
  ALL_TABLES,
  type TableName,
  type MainBucket,
  type EmbeddingProvider,
} from "./schemas.js";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

// ============================================================================
// Config — load embedding key and store path from openclaw.json
// ============================================================================

interface CliConfig {
  apiKey: string;
  model: string;
  baseURL: string;
  dbPath: string;
  confidenceThreshold: number;
  anthropicApiKey: string;
  classificationModel: string;
  dnd: DndConfig;
}

async function loadConfig(): Promise<CliConfig> {
  const configPath = join(homedir(), ".openclaw", "openclaw.json");
  try {
    const raw = JSON.parse(await readFile(configPath, "utf-8"));
    const brainCfg = raw?.plugins?.entries?.brain?.config;
    const docRagCfg = raw?.plugins?.entries?.["doc-rag"]?.config;
    const embCfg = brainCfg?.embedding ?? docRagCfg?.embedding ?? {};
    const classCfg = brainCfg?.classification ?? {};
    const dndCfg = brainCfg?.dnd ?? {};
    const digestsCfg = brainCfg?.digests ?? {};

    return {
      apiKey: embCfg.apiKey ?? "",
      model: embCfg.model ?? "text-embedding-3-small",
      baseURL: embCfg.baseURL ?? "https://models.inference.ai.azure.com",
      dbPath: brainCfg?.storage?.dbPath
        ? (brainCfg.storage.dbPath as string).replace("~", homedir())
        : join(homedir(), ".openclaw", "brain", "lancedb"),
      confidenceThreshold:
        classCfg?.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD,
      anthropicApiKey:
        classCfg?.apiKey ?? process.env.ANTHROPIC_API_KEY ?? "",
      classificationModel:
        classCfg?.model ?? "claude-sonnet-4-20250514",
      dnd: {
        autoQuiet: {
          enabled: dndCfg?.autoQuiet?.enabled ?? true,
          from: dndCfg?.autoQuiet?.from ?? "22:00",
          to: dndCfg?.autoQuiet?.to ?? "07:00",
        },
        timezone: digestsCfg?.timezone ?? "America/New_York",
      },
    };
  } catch {
    return {
      apiKey: "",
      model: "text-embedding-3-small",
      baseURL: "https://models.inference.ai.azure.com",
      dbPath: join(homedir(), ".openclaw", "brain", "lancedb"),
      confidenceThreshold: DEFAULT_CONFIDENCE_THRESHOLD,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
      classificationModel: "claude-sonnet-4-20250514",
      dnd: DEFAULT_DND_CONFIG,
    };
  }
}

// ============================================================================
// Embedding helpers (auto-detect Gemini vs OpenAI from API key)
// ============================================================================

class CliOpenAIEmbedder implements EmbeddingProvider {
  readonly dim: number;
  readonly name: string;

  constructor(private config: CliConfig) {
    this.dim = config.model === "text-embedding-3-large" ? 3072 : 1536;
    this.name = `CLI Embedder (${config.model})`;
  }

  async embed(text: string): Promise<number[]> {
    const base = (this.config.baseURL || "https://api.openai.com/v1").replace(
      /\/+$/,
      "",
    );
    const url = `${base}/embeddings`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({ model: this.config.model, input: text }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Embedding failed: ${res.status} ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as any;
    return data.data[0].embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    for (const text of texts) {
      results.push(await this.embed(text));
    }
    return results;
  }
}

class CliGeminiEmbedder implements EmbeddingProvider {
  readonly dim = 3072;
  readonly name = "CLI Embedder (gemini-embedding-001)";

  constructor(private apiKey: string) {}

  async embed(text: string): Promise<number[]> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${this.apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: { parts: [{ text }] } }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Embedding failed: ${res.status} ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as any;
    return data.embedding.values;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const BATCH_SIZE = 100;
    const allEmbeddings: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents?key=${this.apiKey}`;
      const requests = batch.map((text) => ({
        model: "models/gemini-embedding-001",
        content: { parts: [{ text }] },
      }));
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requests }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Batch embedding failed: ${res.status} ${body.slice(0, 300)}`);
      }
      const data = (await res.json()) as any;
      allEmbeddings.push(...data.embeddings.map((e: any) => e.values));
    }
    return allEmbeddings;
  }
}

/**
 * Auto-detect embedding provider: Gemini keys start with "AI", otherwise OpenAI-compatible.
 */
function createCliEmbedder(config: CliConfig): EmbeddingProvider {
  if (config.apiKey.startsWith("AI")) {
    return new CliGeminiEmbedder(config.apiKey);
  }
  return new CliOpenAIEmbedder(config);
}

// ============================================================================
// stdin reader
// ============================================================================

async function readStdin(): Promise<any> {
  if (process.stdin.isTTY) return null;
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  const text = Buffer.concat(chunks).toString("utf-8").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ============================================================================
// Output helpers
// ============================================================================

function output(data: unknown, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(data);
  }
}

function error(msg: string, json: boolean): never {
  if (json) {
    console.log(JSON.stringify({ error: true, message: msg }));
  } else {
    console.error(`Error: ${msg}`);
  }
  process.exit(1);
}

// ============================================================================
// Parse CLI args
// ============================================================================

const args = process.argv.slice(2);
const subcommand = args[0];
const flags: Record<string, string | boolean> = {};

for (let i = 1; i < args.length; i++) {
  if (args[i].startsWith("--")) {
    const key = args[i].slice(2);
    if (key === "json" || key === "on" || key === "off") {
      flags[key] = true;
    } else if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
      flags[key] = args[i + 1];
      i++;
    } else {
      flags[key] = true;
    }
  }
}

const isJson = !!flags.json;

// ============================================================================
// Subcommand dispatch
// ============================================================================

const config = await loadConfig();
const embedder = createCliEmbedder(config);
const store = new BrainStore(config.dbPath, embedder.dim);

switch (subcommand) {
  // --------------------------------------------------------------------------
  // fetch-inbox: get a raw inbox entry by ID
  // --------------------------------------------------------------------------
  case "fetch-inbox": {
    if (!flags.id) error("--id required", isJson);
    const record = await store.get("inbox", flags.id as string);
    if (!record) error(`Inbox entry not found: ${flags.id}`, isJson);
    output(record, isJson);
    break;
  }

  // --------------------------------------------------------------------------
  // classify: classify an inbox entry by ID (full pipeline)
  // --------------------------------------------------------------------------
  case "classify": {
    if (!flags.id) error("--id required", isJson);
    if (!config.anthropicApiKey) error("No Anthropic API key configured", isJson);

    const record = await store.get("inbox", flags.id as string);
    if (!record) error(`Inbox entry not found: ${flags.id}`, isJson);

    const rawText = record.rawText as string;
    const inboxId = record.id as string;

    // Classify
    const { classification, tokensUsed } = await classifyText(rawText, {
      apiKey: config.anthropicApiKey,
      model: config.classificationModel,
    });

    // Log classification audit
    await logAudit(store, {
      action: "classified",
      inputId: inboxId,
      bucket: classification.bucket,
      confidence: classification.confidence,
      details: `Classified as ${classification.bucket} (${classification.confidence.toFixed(2)}): "${classification.title}"`,
      tokenCost: tokensUsed,
    });

    // Route
    const routeResult = await routeClassification(
      store,
      embedder,
      classification,
      inboxId,
      rawText,
      config.confidenceThreshold,
    );

    output(
      {
        classification,
        tokensUsed,
        routing: routeResult,
      },
      isJson,
    );
    break;
  }

  // --------------------------------------------------------------------------
  // classify-text: classify raw text directly (no inbox entry)
  // --------------------------------------------------------------------------
  case "classify-text": {
    const text = flags.text as string;
    if (!text) error("--text required", isJson);
    if (!config.anthropicApiKey) error("No Anthropic API key configured", isJson);

    const { classification, tokensUsed } = await classifyText(text, {
      apiKey: config.anthropicApiKey,
      model: config.classificationModel,
    });

    output({ classification, tokensUsed }, isJson);
    break;
  }

  // --------------------------------------------------------------------------
  // check-confidence: evaluate classification confidence (reads stdin)
  // --------------------------------------------------------------------------
  case "check-confidence": {
    const input = await readStdin();
    if (!input) error("No input on stdin", isJson);
    const result = checkConfidence(input, config.confidenceThreshold);
    output(result, isJson);
    break;
  }

  // --------------------------------------------------------------------------
  // route: write classified record to correct bucket table (reads stdin)
  // --------------------------------------------------------------------------
  case "route": {
    const input = await readStdin();
    if (!input) error("No input on stdin", isJson);

    const { bucket, classification, routable } = input;
    if (!routable) error("Item is not routable", isJson);
    if (!bucket) error("Missing bucket", isJson);

    // Build the record from classification
    const record = buildBucketRecord(
      classification,
      bucket as MainBucket,
      input.inboxId ?? "",
    );

    // Generate embedding from title + summary
    const embText = `${classification.title} ${classification.summary}`;
    record.vector = await embedder.embed(embText);

    const created = await store.create(bucket, record);
    output({ success: true, bucket, id: created.id, record: created }, isJson);
    break;
  }

  // --------------------------------------------------------------------------
  // needs-review: write to needs_review table (reads stdin)
  // --------------------------------------------------------------------------
  case "needs-review": {
    const input = await readStdin();
    if (!input) error("No input on stdin", isJson);

    const { classification, confidence } = input;
    const embText = classification?.title
      ? `${classification.title} ${classification.summary}`
      : input.rawText ?? "";

    const vector = embText
      ? await embedder.embed(embText)
      : new Array(1536).fill(0);

    const record = await store.create("needs_review", {
      inboxId: input.inboxId ?? "",
      rawText: input.rawText ?? classification?.summary ?? "",
      suggestedBucket: classification?.bucket ?? "",
      confidence: confidence ?? classification?.confidence ?? 0,
      title: classification?.title ?? "",
      summary: classification?.summary ?? "",
      timestamp: new Date().toISOString(),
      status: "pending",
      vector,
    });

    output({ success: true, id: record.id, record }, isJson);
    break;
  }

  // --------------------------------------------------------------------------
  // audit: append to audit_trail (reads stdin)
  // --------------------------------------------------------------------------
  case "audit": {
    const input = await readStdin();
    if (!input) error("No input on stdin", isJson);

    const record = await store.create("audit_trail", {
      timestamp: input.timestamp ?? new Date().toISOString(),
      action: input.action ?? "captured",
      inputId: input.inputId ?? "",
      outputId: input.outputId ?? "",
      bucket: input.bucket ?? "",
      confidence: input.confidence ?? 0,
      details: input.details ?? "",
      tokenCost: input.tokenCost ?? 0,
    });

    output({ success: true, id: record.id }, isJson);
    break;
  }

  // --------------------------------------------------------------------------
  // audit-list: list audit entries for a given input ID
  // --------------------------------------------------------------------------
  case "audit-list": {
    const inputId = flags["input-id"] as string;
    let entries: Record<string, unknown>[];

    if (inputId) {
      entries = await getAuditTrail(store, inputId);
    } else {
      const limit = flags.limit ? parseInt(flags.limit as string) : 20;
      entries = await store.list("audit_trail", limit);
    }

    output({ count: entries.length, entries }, isJson);
    break;
  }

  // --------------------------------------------------------------------------
  // gather-digest: query stores for digest data
  // --------------------------------------------------------------------------
  case "gather-digest": {
    const type = flags.type as string;
    if (!type) error("--type required (morning|midday|afternoon|night|weekly)", isJson);
    const validTypes = ["morning", "midday", "afternoon", "night", "weekly"];
    if (!validTypes.includes(type)) {
      error(`Invalid type: ${type}. Must be one of: ${validTypes.join(", ")}`, isJson);
    }
    const data = await gatherDigestData(store, type as DigestType);
    output(data, isJson);
    break;
  }

  // --------------------------------------------------------------------------
  // format-digest: format gathered data into a digest message
  // --------------------------------------------------------------------------
  case "format-digest": {
    const type = flags.type as string;
    if (!type) error("--type required (morning|midday|afternoon|night|weekly)", isJson);
    const validTypes = ["morning", "midday", "afternoon", "night", "weekly"];
    if (!validTypes.includes(type)) {
      error(`Invalid type: ${type}. Must be one of: ${validTypes.join(", ")}`, isJson);
    }

    const maxWords = flags["max-words"]
      ? parseInt(flags["max-words"] as string)
      : DIGEST_DEFAULTS[type as DigestType].maxWords;

    // Try to read gathered data from stdin, or gather fresh
    let data = await readStdin();
    if (!data || typeof data === "string") {
      // No stdin data — gather fresh
      data = await gatherDigestData(store, type as DigestType);
    }

    const formatted = formatDigest(data, type as DigestType, maxWords);
    const nudges = generateNudges(data);

    output(
      {
        digest: formatted,
        type,
        maxWords,
        nudgeCount: nudges.length,
        nudges,
        wordCount: formatted.split(/\s+/).length,
      },
      isJson,
    );
    break;
  }

  // --------------------------------------------------------------------------
  // check-dnd: check current DND status
  // --------------------------------------------------------------------------
  case "check-dnd": {
    const result = await checkDnd(config.dnd);
    output(result, isJson);
    break;
  }

  // --------------------------------------------------------------------------
  // dnd: toggle manual DND on/off
  // --------------------------------------------------------------------------
  case "dnd": {
    if (flags.on) {
      const result = await toggleDnd(true);
      output(
        {
          success: true,
          dnd: "on",
          message: "🔇 Do Not Disturb enabled. All Brain notifications paused.",
          state: result.state,
        },
        isJson,
      );
    } else if (flags.off) {
      const result = await toggleDnd(false);
      output(
        {
          success: true,
          dnd: "off",
          message: "🔔 Do Not Disturb disabled. Notifications resumed.",
          recovery: result.recovery ?? null,
          state: result.state,
        },
        isJson,
      );
    } else {
      // No flag — show current state
      const result = await checkDnd(config.dnd);
      output(result, isJson);
    }
    break;
  }

  // --------------------------------------------------------------------------
  // list: list records in a bucket
  // --------------------------------------------------------------------------
  case "list": {
    const bucket = flags.bucket as string;
    if (!bucket) error("--bucket required", isJson);
    if (!ALL_TABLES.includes(bucket as TableName)) {
      error(`Unknown bucket: ${bucket}. Valid: ${ALL_TABLES.join(", ")}`, isJson);
    }
    const limit = flags.limit ? parseInt(flags.limit as string) : undefined;
    const records = await store.list(bucket as TableName, limit);
    output({ bucket, count: records.length, records }, isJson);
    break;
  }

  // --------------------------------------------------------------------------
  // get: get a specific record by ID (searches all tables)
  // --------------------------------------------------------------------------
  case "get": {
    if (!flags.id) error("--id required", isJson);
    let found: Record<string, unknown> | null = null;
    let foundTable: string | null = null;
    for (const table of ALL_TABLES) {
      const record = await store.get(table, flags.id as string);
      if (record) {
        found = record;
        foundTable = table;
        break;
      }
    }
    if (!found) error(`Record not found: ${flags.id}`, isJson);
    output({ table: foundTable, record: found }, isJson);
    break;
  }

  // --------------------------------------------------------------------------
  // update: update a record by ID (reads stdin for updates)
  // --------------------------------------------------------------------------
  case "update": {
    if (!flags.id) error("--id required", isJson);
    const updates = await readStdin();
    if (!updates) error("No updates on stdin", isJson);

    let targetTable: TableName | null = null;
    for (const table of ALL_TABLES) {
      const existing = await store.get(table, flags.id as string);
      if (existing) {
        targetTable = table;
        break;
      }
    }
    if (!targetTable) error(`Record not found: ${flags.id}`, isJson);

    const updated = await store.update(targetTable!, flags.id as string, updates);
    output({ success: true, table: targetTable, record: updated }, isJson);
    break;
  }

  // --------------------------------------------------------------------------
  // delete: delete/archive a record by ID
  // --------------------------------------------------------------------------
  case "delete": {
    if (!flags.id) error("--id required", isJson);

    let targetTable: TableName | null = null;
    for (const table of ALL_TABLES) {
      const existing = await store.get(table, flags.id as string);
      if (existing) {
        targetTable = table;
        break;
      }
    }
    if (!targetTable) error(`Record not found: ${flags.id}`, isJson);

    const deleted = await store.delete(targetTable!, flags.id as string);
    output({ success: true, table: targetTable, deleted }, isJson);
    break;
  }

  // --------------------------------------------------------------------------
  // stats: bucket health counts
  // --------------------------------------------------------------------------
  case "stats": {
    const stats = await store.stats();
    const total = stats.reduce((sum, s) => sum + s.count, 0);
    output({ stats, totalRecords: total }, isJson);
    break;
  }

  // --------------------------------------------------------------------------
  // Unknown subcommand
  // --------------------------------------------------------------------------
  default:
    error(
      `Unknown subcommand: ${subcommand ?? "(none)"}. ` +
        "Available: fetch-inbox, classify, classify-text, check-confidence, route, " +
        "needs-review, audit, audit-list, gather-digest, format-digest, check-dnd, dnd, " +
        "list, get, update, delete, stats",
      isJson,
    );
}
