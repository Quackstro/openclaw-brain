/**
 * Brain 2.0 — OpenClaw Plugin Entry Point.
 *
 * Registers tools + commands for the Brain behavioral support system.
 * Phase 1: Core Loop — capture, classify, route, audit.
 */

import { Type } from "@sinclair/typebox";
import { homedir } from "node:os";
import { watch, readFileSync, readdirSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { BrainStore } from "./store.js";
import { ALL_TABLES, MAIN_BUCKETS, type EmbeddingProvider, type TableName } from "./schemas.js";
import { handleDrop, dropAndClassify } from "./commands/drop.js";
import { handleFix } from "./commands/fix.js";
import type { ActionRouterConfig } from "./action-router.js";
import { parseInputTags } from "./tag-parser.js";
import { gatherDigestData, formatDigest, type DigestType } from "./digest.js";
import { checkDnd, toggleDnd, recordSkippedDigest } from "./dnd.js";
import { createClassifier, type ClassifierFn } from "./classifier.js";
import { getAuditTrail } from "./audit.js";

// ============================================================================
// Embedding Provider (same pattern as doc-RAG)
// ============================================================================

class BrainGeminiEmbeddings implements EmbeddingProvider {
  readonly dim = 3072;
  readonly name = "Brain Embeddings (gemini-embedding-001)";

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

class BrainOpenAIEmbeddings implements EmbeddingProvider {
  readonly dim: number;
  readonly name: string;
  private apiKey: string;
  private model: string;
  private embeddingsUrl: string;

  constructor(apiKey: string, model: string = "text-embedding-3-small", baseURL?: string) {
    this.apiKey = apiKey;
    this.model = model;
    const base = (baseURL || "https://api.openai.com/v1").replace(/\/+$/, "");
    this.embeddingsUrl = `${base}/embeddings`;
    this.name = `Brain Embeddings (${model})`;
    this.dim = model === "text-embedding-3-large" ? 3072 : 1536;
  }

  async embed(text: string): Promise<number[]> {
    const res = await fetch(this.embeddingsUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, input: text }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Embedding failed: ${res.status} ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as any;
    return data.data[0].embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const res = await fetch(this.embeddingsUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, input: texts }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Batch embedding failed: ${res.status} ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as any;
    return data.data.map((d: any) => d.embedding);
  }
}

/**
 * Auto-detect embedding provider: Gemini keys start with "AI", otherwise OpenAI-compatible.
 */
function createBrainEmbeddings(apiKey: string, model: string, baseURL?: string): EmbeddingProvider {
  if (!baseURL && apiKey.startsWith("AI")) {
    return new BrainGeminiEmbeddings(apiKey);
  }
  return new BrainOpenAIEmbeddings(apiKey, model, baseURL);
}

// ============================================================================
// Config parser
// ============================================================================

interface BrainConfig {
  embedding: {
    apiKey: string;
    model: string;
    baseURL?: string;
  };
  storage: {
    dbPath: string;
  };
  classification: {
    apiKey?: string;
    model: string;
    confidenceThreshold: number;
  };
}

function parseConfig(raw: unknown): BrainConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const cfg = raw as Record<string, unknown>;

  const embRaw = (cfg.embedding ?? {}) as Record<string, unknown>;
  if (typeof embRaw.apiKey !== "string") throw new Error("embedding.apiKey is required");

  const stoRaw = (cfg.storage ?? {}) as Record<string, unknown>;
  const classRaw = (cfg.classification ?? {}) as Record<string, unknown>;

  return {
    embedding: {
      apiKey: embRaw.apiKey as string,
      model: (embRaw.model as string) ?? "text-embedding-3-small",
      baseURL: embRaw.baseURL as string | undefined,
    },
    storage: {
      dbPath: (stoRaw.dbPath as string) ?? "~/.openclaw/brain/lancedb",
    },
    classification: {
      apiKey: classRaw.apiKey as string | undefined,
      model: (classRaw.model as string) ?? "claude-sonnet-4-20250514",
      confidenceThreshold: (classRaw.confidenceThreshold as number) ?? 0.80,
    },
  };
}

// ============================================================================
// Plugin Definition
// ============================================================================

const brainPlugin = {
  id: "brain",
  name: "Brain 2.0",
  description:
    "Behavioral support system — captures thoughts, classifies them, stores structured data, " +
    "and proactively surfaces the right information at the right time.",
  kind: "service" as const,

  register(api: any) {
    const cfg = parseConfig(api.pluginConfig);
    if (!cfg) {
      api.log?.info?.("brain: no config provided, plugin inactive. Add brain config to openclaw.json to activate.");
      return;
    }
    const resolvedDbPath = api.resolvePath(cfg.storage.dbPath);

    // Create embedding provider (auto-detects Gemini vs OpenAI from key prefix)
    const embedder = createBrainEmbeddings(
      cfg.embedding.apiKey,
      cfg.embedding.model,
      cfg.embedding.baseURL,
    );

    // Create store
    const store = new BrainStore(resolvedDbPath, embedder.dim);

    // Create classifier (if Anthropic API key is configured)
    let classifierFn: ClassifierFn | undefined;
    if (cfg.classification.apiKey) {
      classifierFn = createClassifier({
        apiKey: cfg.classification.apiKey,
        model: cfg.classification.model,
      });
    }

    // Create action router config (creates cron reminders for time-sensitive drops)
    const actionRouterConfig: ActionRouterConfig = {
      gatewayToken: cfg.classification.apiKey ?? "",
      gatewayUrl: "http://127.0.0.1:18789",
      timezone: "America/New_York",
      telegramChatId: "8511108690",
      extractionModel: cfg.classification.model,
      enabled: true,
      embedder,
    };

    api.logger.info(
      `brain: registered (db: ${resolvedDbPath}, embeddings: ${embedder.name}, classifier: ${classifierFn ? "active" : "no API key"})`,
    );

    // ==================================================================
    // Tool: brain_drop
    // ==================================================================

    api.registerTool(
      {
        name: "brain_drop",
        label: "Brain Drop",
        description:
          "Capture a thought into the Brain. One thought per drop — no organizing needed. " +
          "Automatically classifies and routes to the appropriate bucket.",
        parameters: Type.Object({
          text: Type.String({ description: "The raw thought to capture" }),
          source: Type.Optional(
            Type.String({
              description: "Source: drop, chat, file, voice, photo",
              enum: ["drop", "chat", "file", "voice", "photo"],
            }),
          ),
          mediaPath: Type.Optional(
            Type.String({ description: "Path to attached media (for photo OCR)" }),
          ),
        }),
        async execute(_toolCallId: string, params: any) {
          try {
            // Support skill command-dispatch: tool (receives { command, commandName, skillName })
            const text = params.text ?? params.command;
            if (!text) {
              return {
                content: [{ type: "text", text: "❌ No text provided." }],
                details: { error: true },
              };
            }

            // Tag parsing is integrated inside handleDrop (runs before classification).
            // The parsed tag is returned in result.inputTag for visibility.
            const result = await handleDrop(
              store,
              embedder,
              text,
              params.source ?? "drop",
              params.mediaPath,
              {
                classifierFn,
                confidenceThreshold: cfg.classification.confidenceThreshold,
                async: true, // Don't block tool execution
                actionRouterConfig,
              },
            );
            return {
              content: [{ type: "text", text: result.message }],
              details: { ...result, inputTag: result.inputTag ?? null },
            };
          } catch (err: any) {
            return {
              content: [
                { type: "text", text: `Drop failed: ${err.message ?? err}` },
              ],
              details: { error: true },
            };
          }
        },
      },
      { name: "brain_drop" },
    );

    // ==================================================================
    // Tool: brain_search
    // ==================================================================

    api.registerTool(
      {
        name: "brain_search",
        label: "Brain Search",
        description:
          "Search Brain stores by semantic similarity. Query across all buckets or a specific one.",
        parameters: Type.Object({
          query: Type.String({ description: "Natural language search query" }),
          bucket: Type.Optional(
            Type.String({
              description: "Specific bucket to search (people, projects, ideas, admin, documents, goals, health, finance)",
            }),
          ),
          limit: Type.Optional(
            Type.Number({ description: "Max results (default 5)" }),
          ),
        }),
        async execute(_toolCallId: string, params: any) {
          try {
            const vector = await embedder.embed(params.query);
            const limit = params.limit ?? 5;
            const bucketsToSearch = params.bucket
              ? [params.bucket as TableName]
              : [...MAIN_BUCKETS];

            const allResults: Array<{
              bucket: string;
              record: Record<string, unknown>;
              score: number;
            }> = [];

            for (const bucket of bucketsToSearch) {
              try {
                const results = await store.search(bucket, vector, limit);
                for (const r of results) {
                  allResults.push({ bucket, ...r });
                }
              } catch {
                // Skip empty tables or errors
              }
            }

            // Sort by score descending
            allResults.sort((a, b) => b.score - a.score);
            const topResults = allResults.slice(0, limit);

            if (topResults.length === 0) {
              return {
                content: [{ type: "text", text: "No results found." }],
                details: { count: 0 },
              };
            }

            const text = topResults
              .map(
                (r, i) =>
                  `${i + 1}. [${r.bucket}] ${(r.record as any).title || (r.record as any).name || r.record.id} (${(r.score * 100).toFixed(0)}%)`,
              )
              .join("\n");

            return {
              content: [{ type: "text", text: `Found ${topResults.length} results:\n\n${text}` }],
              details: { count: topResults.length, results: topResults },
            };
          } catch (err: any) {
            return {
              content: [
                { type: "text", text: `Search failed: ${err.message ?? err}` },
              ],
              details: { error: true },
            };
          }
        },
      },
      { name: "brain_search" },
    );

    // ==================================================================
    // Tool: brain_stats
    // ==================================================================

    api.registerTool(
      {
        name: "brain_stats",
        label: "Brain Stats",
        description: "Show record counts and health for all Brain buckets.",
        parameters: Type.Object({}),
        async execute() {
          try {
            const stats = await store.stats();
            const lines = stats.map(
              (s) => `  ${s.table}: ${s.count} records`,
            );
            const total = stats.reduce((sum, s) => sum + s.count, 0);
            const disk = await store.diskUsageMb();
            lines.push(`\n  Total: ${total} records`);
            lines.push(`  Disk: ${disk.toFixed(1)} MB`);
            return {
              content: [{ type: "text", text: `📊 Brain Stats:\n${lines.join("\n")}` }],
              details: { stats, totalRecords: total, diskMb: disk },
            };
          } catch (err: any) {
            return {
              content: [
                { type: "text", text: `Stats failed: ${err.message ?? err}` },
              ],
              details: { error: true },
            };
          }
        },
      },
      { name: "brain_stats" },
    );

    // ==================================================================
    // Tool: brain_audit
    // ==================================================================

    api.registerTool(
      {
        name: "brain_audit",
        label: "Brain Audit Trail",
        description: "View the audit trail for a specific item or recent actions.",
        parameters: Type.Object({
          inputId: Type.Optional(
            Type.String({ description: "Show audit entries for this input ID" }),
          ),
          limit: Type.Optional(
            Type.Number({ description: "Max entries to show (default 10)" }),
          ),
        }),
        async execute(_toolCallId: string, params: any) {
          try {
            let entries: Record<string, unknown>[];
            if (params.inputId) {
              entries = await getAuditTrail(store, params.inputId);
            } else {
              entries = await store.list("audit_trail", params.limit ?? 10);
            }

            if (entries.length === 0) {
              return {
                content: [{ type: "text", text: "No audit entries found." }],
                details: { count: 0 },
              };
            }

            const text = entries
              .map(
                (e) =>
                  `[${(e.timestamp as string).slice(0, 19)}] ${e.action} — ${e.details}`,
              )
              .join("\n");

            return {
              content: [
                { type: "text", text: `📋 Audit Trail (${entries.length} entries):\n\n${text}` },
              ],
              details: { count: entries.length, entries },
            };
          } catch (err: any) {
            return {
              content: [
                { type: "text", text: `Audit query failed: ${err.message ?? err}` },
              ],
              details: { error: true },
            };
          }
        },
      },
      { name: "brain_audit" },
    );

    // ==================================================================
    // Tool: brain_digest
    // ==================================================================

    api.registerTool(
      {
        name: "brain_digest",
        label: "Brain Digest",
        description:
          "Generate a Brain digest (morning/midday/afternoon/night/weekly). " +
          "Respects DND settings — if DND is active, records the skipped digest and returns.",
        parameters: Type.Object({
          type: Type.String({
            description: "Digest type: morning, midday, afternoon, night, or weekly",
            enum: ["morning", "midday", "afternoon", "night", "weekly"],
          }),
        }),
        async execute(_toolCallId: string, params: any) {
          try {
            const digestType = params.type as DigestType;

            // Check DND — if quiet, record and bail
            const dndStatus = await checkDnd();
            if (dndStatus.quiet) {
              await recordSkippedDigest(digestType);
              return {
                content: [
                  {
                    type: "text",
                    text: `🔇 DND active: ${dndStatus.reason}. Digest skipped.`,
                  },
                ],
                details: { skipped: true, reason: dndStatus.reason },
              };
            }

            // Gather data and format
            const data = await gatherDigestData(store, digestType);
            const formatted = formatDigest(data, digestType);

            return {
              content: [{ type: "text", text: formatted }],
              details: { type: digestType, isEmpty: data.isEmpty },
            };
          } catch (err: any) {
            return {
              content: [
                { type: "text", text: `Digest failed: ${err.message ?? err}` },
              ],
              details: { error: true },
            };
          }
        },
      },
      { name: "brain_digest" },
    );

    // ==================================================================
    // Tool: brain_dnd
    // ==================================================================

    api.registerTool(
      {
        name: "brain_dnd",
        label: "Brain DND",
        description:
          "Control Do Not Disturb mode for Brain notifications. " +
          "Actions: status (check current state), on (enable DND), off (disable DND).",
        parameters: Type.Object({
          action: Type.String({
            description: 'DND action: "status", "on", or "off"',
            enum: ["status", "on", "off"],
          }),
        }),
        async execute(_toolCallId: string, params: any) {
          try {
            if (params.action === "status") {
              const status = await checkDnd();
              return {
                content: [
                  {
                    type: "text",
                    text: status.quiet
                      ? `🔇 DND is ON: ${status.reason}`
                      : `🔔 DND is OFF: ${status.reason}`,
                  },
                ],
                details: status,
              };
            }

            const on = params.action === "on";
            const result = await toggleDnd(on);

            const message = on
              ? "🔇 Do Not Disturb enabled. All Brain notifications paused."
              : `🔔 Do Not Disturb disabled. Notifications resumed.${result.recovery ? `\n\n${result.recovery}` : ""}`;

            return {
              content: [{ type: "text", text: message }],
              details: { dnd: on, state: result.state, recovery: result.recovery },
            };
          } catch (err: any) {
            return {
              content: [
                { type: "text", text: `DND operation failed: ${err.message ?? err}` },
              ],
              details: { error: true },
            };
          }
        },
      },
      { name: "brain_dnd" },
    );

    // ==================================================================
    // Tool: brain_fix
    // ==================================================================

    api.registerTool(
      {
        name: "brain_fix",
        label: "Brain Fix",
        description:
          "Fix/correct a Brain item: move between buckets, trash, update actions, merge items, or show details.",
        parameters: Type.Object({
          id: Type.String({ description: "The item ID to fix" }),
          correction: Type.Optional(
            Type.String({
              description:
                'Fix syntax: "→ people", "→ trash", "action: call them", "merge abc123", or omit to show details',
            }),
          ),
        }),
        async execute(_toolCallId: string, params: any) {
          try {
            const result = await handleFix(
              store,
              params.id,
              params.correction,
              embedder,
            );
            return {
              content: [{ type: "text", text: result.message }],
              details: result,
            };
          } catch (err: any) {
            return {
              content: [
                { type: "text", text: `Fix failed: ${err.message ?? err}` },
              ],
              details: { error: true },
            };
          }
        },
      },
      { name: "brain_fix" },
    );

    // ==================================================================
    // CLI Commands
    // ==================================================================

    api.registerCli(
      ({ program }: any) => {
        const brain = program
          .command("brain")
          .description("Brain 2.0 plugin commands");

        brain
          .command("stats")
          .description("Show bucket counts")
          .action(async () => {
            const stats = await store.stats();
            for (const s of stats) {
              console.log(`  ${s.table}: ${s.count}`);
            }
          });

        brain
          .command("list")
          .description("List records in a bucket")
          .argument("<bucket>", "Bucket name")
          .option("--limit <n>", "Max records", "20")
          .action(async (bucket: string, opts: any) => {
            const records = await store.list(bucket as TableName, parseInt(opts.limit));
            if (records.length === 0) {
              console.log(`No records in ${bucket}.`);
              return;
            }
            for (const r of records) {
              const label = (r as any).title || (r as any).name || r.id;
              console.log(`  ${(r.id as string).slice(0, 8)}  ${label}`);
            }
          });

        brain
          .command("drop")
          .description("Drop a thought into the Brain")
          .argument("<text>", "The thought to capture")
          .option("--source <source>", "Source type", "drop")
          .action(async (text: string, opts: any) => {
            const result = await handleDrop(
              store,
              embedder,
              text,
              opts.source ?? "drop",
              undefined,
              {
                classifierFn,
                confidenceThreshold: cfg.classification.confidenceThreshold,
                async: false,
              },
            );
            console.log(result.message);
            console.log(`  ID: ${result.id}`);
          });

        brain
          .command("audit")
          .description("Show audit trail")
          .option("--id <inputId>", "Filter by input ID")
          .option("--limit <n>", "Max entries", "20")
          .action(async (opts: any) => {
            let entries: Record<string, unknown>[];
            if (opts.id) {
              entries = await getAuditTrail(store, opts.id);
            } else {
              entries = await store.list("audit_trail", parseInt(opts.limit));
            }
            if (entries.length === 0) {
              console.log("No audit entries.");
              return;
            }
            for (const e of entries) {
              console.log(
                `  [${(e.timestamp as string).slice(0, 19)}] ${e.action} — ${e.details}`,
              );
            }
          });
      },
      { commands: ["brain"] },
    );

    // ==================================================================
    // Auto-reply Commands (slash commands without LLM)
    // ==================================================================

    api.registerCommand({
      name: "drop",
      description: "Quick-capture a thought into Brain",
      acceptsArgs: true,
      requireAuth: true,
      handler: async (ctx: any) => {
        const text = ctx.args?.trim() ?? "";
        if (!text) return { text: "Usage: /drop <text>" };
        try {
          const result = await handleDrop(
            store, embedder, text, "drop", undefined,
            { classifierFn, confidenceThreshold: cfg.classification.confidenceThreshold, async: false },
          );
          return { text: `✅ ${result.message}\nID: ${result.id}` };
        } catch (err: any) {
          return { text: `❌ Drop failed: ${err.message ?? err}` };
        }
      },
    });

    api.registerCommand({
      name: "brain",
      description: "Brain 2.0 dashboard & commands",
      acceptsArgs: true,
      requireAuth: true,
      handler: async (ctx: any) => {
        const args = ctx.args?.trim() ?? "";

        // /brain drop <text>
        if (args.startsWith("drop ")) {
          const text = args.slice(5).trim();
          if (!text) return { text: "Usage: /brain drop <text>" };
          try {
            const result = await handleDrop(
              store, embedder, text, "drop", undefined,
              { classifierFn, confidenceThreshold: cfg.classification.confidenceThreshold, async: false },
            );
            return { text: `✅ ${result.message}\nID: ${result.id}` };
          } catch (err: any) {
            return { text: `❌ Drop failed: ${err.message ?? err}` };
          }
        }

        // /brain search <query>
        if (args.startsWith("search ")) {
          const query = args.slice(7).trim();
          if (!query) return { text: "Usage: /brain search <query>" };
          try {
            const vector = await embedder.embed(query);
            const allResults: Array<{ bucket: string; record: Record<string, unknown>; score: number }> = [];
            for (const bucket of MAIN_BUCKETS) {
              try {
                const results = await store.search(bucket, vector, 5);
                for (const r of results) allResults.push({ bucket, ...r });
              } catch {}
            }
            allResults.sort((a, b) => b.score - a.score);
            const top = allResults.slice(0, 5);
            if (top.length === 0) return { text: "No results found." };
            const text = top
              .map((r, i) => `${i + 1}. [${r.bucket}] ${(r.record as any).title || (r.record as any).name || r.record.id} (${(r.score * 100).toFixed(0)}%)`)
              .join("\n");
            return { text: `🔍 Found ${top.length} results:\n\n${text}` };
          } catch (err: any) {
            return { text: `❌ Search failed: ${err.message ?? err}` };
          }
        }

        // /brain stats
        if (args === "stats") {
          try {
            const stats = await store.stats();
            const lines = stats.map((s: any) => `  ${s.table}: ${s.count}`);
            return { text: `📊 Brain Buckets\n\n${lines.join("\n")}` };
          } catch (err: any) {
            return { text: `❌ Stats failed: ${err.message ?? err}` };
          }
        }

        // /brain dnd [on|off|status]
        if (args.startsWith("dnd")) {
          const sub = args.slice(3).trim() || "status";
          try {
            if (sub === "status") {
              const status = await checkDnd();
              return { text: status.quiet ? `🔇 DND is ON: ${status.reason}` : `🔔 DND is OFF: ${status.reason}` };
            }
            if (sub === "on" || sub === "off") {
              const on = sub === "on";
              const result = await toggleDnd(on);
              return { text: on
                ? "🔇 Do Not Disturb enabled."
                : `🔔 Do Not Disturb disabled.${result.recovery ? `\n${result.recovery}` : ""}` };
            }
            return { text: "Usage: /brain dnd [on|off|status]" };
          } catch (err: any) {
            return { text: `❌ DND failed: ${err.message ?? err}` };
          }
        }

        // /brain (no args) — dashboard
        try {
          const stats = await store.stats();
          const lines = stats.map((s: any) => `  ${s.table}: ${s.count}`);
          const dndStatus = await checkDnd();
          const dndLine = dndStatus.quiet ? "🔇 DND: ON" : "🔔 DND: OFF";
          return { text: `🧠 Brain 2.0 Dashboard\n\n${lines.join("\n")}\n\n${dndLine}\n\nCommands: drop, search, stats, dnd` };
        } catch (err: any) {
          return { text: `❌ ${err.message ?? err}` };
        }
      },
    });

    // ==================================================================
    // Service
    // ==================================================================

    api.registerService({
      id: "brain",
      start: () => {
        api.logger.info(`brain: initialized (db: ${resolvedDbPath})`);

        // Watch for wallet unlock events and retry pending payments
        const eventsDir = `${homedir()}/.openclaw/events`;
        const pendingDir = `${homedir()}/.openclaw/brain/pending-actions`;
        mkdirSync(eventsDir, { recursive: true });

        const execFileAsync = promisify(execFile);

        async function retryPendingPayments(): Promise<void> {
          if (!existsSync(pendingDir)) return;
          const files = readdirSync(pendingDir).filter(f => f.endsWith(".json"));
          for (const file of files) {
            try {
              const data = JSON.parse(readFileSync(`${pendingDir}/${file}`, "utf8"));
              const action = data.action;
              // Only retry proposed/awaiting-unlock actions with a resolved address
              if (!action?.resolvedParams?.to || !action?.resolvedParams?.amount) continue;
              if (action.status !== "proposed" && action.status !== "awaiting-unlock") continue;

              api.logger.info(`brain: retrying payment ${action.id} after wallet unlock`);
              const { stdout } = await execFileAsync("openclaw", [
                "wallet", "send",
                "--to", action.resolvedParams.to,
                "--amount", String(action.resolvedParams.amount),
                "--reason", action.resolvedParams.reason || "Brain payment",
                "--json",
              ], { timeout: 30000 });

              const startIdx = stdout.indexOf("{");
              if (startIdx < 0) continue;
              const endIdx = stdout.lastIndexOf("}");
              const parsed = JSON.parse(stdout.slice(startIdx, endIdx + 1));
              if (parsed.error) {
                api.logger.error(`brain: payment retry failed: ${parsed.error}`);
                continue;
              }

              // Update pending action as complete
              action.status = "complete";
              action.executedAt = new Date().toISOString();
              action.result = { txid: parsed.txid || parsed.id, fee: parsed.fee };
              writeFileSync(`${pendingDir}/${file}`, JSON.stringify(data, null, 2));

              // Send confirmation via Telegram
              const { sendPaymentConfirmation } = await import("./payment-approval.js");
              await sendPaymentConfirmation(action, parsed.txid || parsed.id);

              api.logger.info(`brain: payment ${action.id} auto-retried successfully, txid: ${parsed.txid}`);
            } catch (err) {
              api.logger.error(`brain: payment retry error for ${file}: ${err}`);
            }
          }
        }

        try {
          const watcher = watch(eventsDir, (eventType, filename) => {
            if (filename === "wallet-unlocked") {
              api.logger.info("brain: detected wallet unlock event, retrying pending payments");
              // Small delay to let wallet fully initialize
              setTimeout(() => {
                retryPendingPayments().catch(err => {
                  api.logger.error(`brain: retryPendingPayments failed: ${err}`);
                });
                // Clean up the trigger file
                try { unlinkSync(`${eventsDir}/wallet-unlocked`); } catch { /* ok */ }
              }, 2000);
            }
          });
          (api as any)._walletWatcher = watcher;
        } catch (err) {
          api.logger.error(`brain: failed to watch events dir: ${err}`);
        }
      },
      stop: () => {
        // Clean up the file watcher
        try { (api as any)._walletWatcher?.close(); } catch { /* ok */ }
        api.logger.info("brain: stopped");
      },
    });
  },
};

export default brainPlugin;
