/**
 * Brain — OpenClaw Plugin Entry Point.
 *
 * Unified behavioral memory system with LLM classification, semantic search,
 * auto-capture, auto-recall, and action detection (reminders, payments, todos).
 *
 * Consolidates the former brain-core + brain-actions packages into a single plugin.
 */

import path from "node:path";
import { Type } from "@sinclair/typebox";
import { getAuditTrail } from "./audit.js";
import { createClassifier, type ClassifierFn } from "./classifier.js";
import { handleDrop } from "./commands/drop.js";
import { handleFix } from "./commands/fix.js";
import { handleRecall, formatRecallResults, formatRecallForContext } from "./commands/recall.js";
import { createEmbeddingProvider, getVectorDimension } from "./embeddings.js";
import { DEFAULT_BUCKETS, SYSTEM_TABLES, type EmbeddingProvider } from "./schemas.js";
import { BrainStore } from "./store.js";
import { isMessageNoteworthy } from "./noteworthy.js";
import { gatherDigestData, formatDigest, generateNudges, type DigestType } from "./digest.js";
import {
  checkDnd, toggleDnd, recordSkippedDigest, setDndStatePath,
  type DndConfig, DEFAULT_DND_CONFIG,
} from "./dnd.js";

// Actions imports
import { routeAction, shouldRouteAction } from "./actions/action-router.js";
import type { ActionRouterConfig, ActionHooks, ActionContext } from "./actions/types.js";

// ============================================================================
// Re-exports
// ============================================================================

export { BrainStore, type BrainStoreConfig } from "./store.js";
export * from "./schemas.js";
export {
  createEmbeddingProvider,
  BrainGeminiEmbeddings,
  BrainOpenAIEmbeddings,
  getVectorDimension,
} from "./embeddings.js";
export {
  createClassifier,
  classifyText,
  bucketToTable,
  validateClassification,
  normalizeClassification,
  buildClassificationPrompt,
  type ClassifierFn,
  type ClassifyOptions,
  type ClassifyResult,
} from "./classifier.js";
export { parseJsonFromLlm } from "./parse-llm-json.js";
export { buildEmptyBucketRecord } from "./record-builder.js";
export { isMessageNoteworthy } from "./noteworthy.js";
export { parseInputTags, tagToIntent, type InputTag, type TagParseResult } from "./tag-parser.js";
export { logAudit, getAuditTrail, type AuditAction, type LogAuditParams } from "./audit.js";
export {
  routeClassification,
  checkConfidence,
  buildBucketRecord,
  cosineSimilarity,
  checkDuplicate,
  mergeIntoExisting,
  DEFAULT_CONFIDENCE_THRESHOLD,
  DEDUP_SIMILARITY_THRESHOLD,
} from "./router.js";
export {
  handleDrop,
  dropAndClassify,
  ocrImage,
  type DropResult,
  type DropOptions,
} from "./commands/drop.js";
export { handleFix, type FixResult } from "./commands/fix.js";
export {
  handleRecall,
  formatRecallResults,
  formatRecallForContext,
  type RecallResult,
  type RecallEntry,
  type RecallOptions,
} from "./commands/recall.js";

// Digest re-exports
export {
  gatherDigestData,
  formatDigest,
  generateNudges,
  type DigestType,
  type DigestData,
  type BucketSummary,
  type OverdueItem,
  type StuckItem,
  type UrgentItem,
  type NudgeItem,
} from "./digest.js";
export {
  checkDnd,
  toggleDnd,
  recordSkippedDigest,
  isInQuietHours,
  getNowInTimezone,
  loadDndState,
  saveDndState,
  setDndStatePath,
  DEFAULT_DND_CONFIG,
  type DndState,
  type DndCheckResult,
  type DndConfig,
} from "./dnd.js";

// Actions re-exports
export * from "./actions/types.js";
export * from "./actions/detector.js";
export * from "./actions/time-extractor.js";
export * from "./actions/action-router.js";
export {
  handleReminderAction,
  handleBookingAction,
  createPersistentReminder,
} from "./actions/handlers/reminder.js";
export { handlePaymentAction, extractPaymentParams } from "./actions/handlers/payment.js";

// ============================================================================
// Config
// ============================================================================

interface BrainConfig {
  storage: { dbPath: string };
  buckets: readonly string[];
  embedding: {
    provider?: "gemini" | "openai" | "auto";
    apiKey: string;
    model?: string;
    baseURL?: string;
  };
  classifier: {
    apiKey?: string;
    model?: string;
  };
  confidenceThreshold: number;
  autoCapture: boolean;
  autoRecall: boolean;
  autoRecallLimit: number;
  autoRecallMinScore: number;
  dnd: {
    autoQuiet: {
      enabled: boolean;
      from: string;
      to: string;
    };
    timezone: string;
  };
  actions: {
    enabled: boolean;
    gatewayToken?: string;
    gatewayUrl: string;
    timezone: string;
    extractionModel: string;
    reminder: {
      enabled: boolean;
      nagIntervalMinutes: number;
      defaultTime: string;
    };
    payment: {
      enabled: boolean;
      autoExecuteThreshold: number;
      maxAutoExecuteAmount: number;
    };
  };
}

function parseConfig(raw: unknown): BrainConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const cfg = raw as Record<string, unknown>;

  const embRaw = (cfg.embedding ?? {}) as Record<string, unknown>;
  if (typeof embRaw.apiKey !== "string") {
    return null; // No API key — plugin inactive
  }

  const stoRaw = (cfg.storage ?? {}) as Record<string, unknown>;
  const classRaw = (cfg.classifier ?? {}) as Record<string, unknown>;
  const bucketsRaw = cfg.buckets as string[] | undefined;

  // DND config
  const dndRaw = (cfg.dnd ?? {}) as Record<string, unknown>;
  const autoQuietRaw = (dndRaw.autoQuiet ?? {}) as Record<string, unknown>;

  // Actions config
  const actRaw = (cfg.actions ?? {}) as Record<string, unknown>;
  const reminderRaw = (actRaw.reminder ?? {}) as Record<string, unknown>;
  const paymentRaw = (actRaw.payment ?? {}) as Record<string, unknown>;

  return {
    storage: {
      dbPath: (stoRaw.dbPath as string) ?? "~/.openclaw/brain/lancedb",
    },
    buckets: bucketsRaw && Array.isArray(bucketsRaw) ? bucketsRaw : DEFAULT_BUCKETS,
    embedding: {
      provider: embRaw.provider as "gemini" | "openai" | "auto" | undefined,
      apiKey: embRaw.apiKey as string,
      model: embRaw.model as string | undefined,
      baseURL: embRaw.baseURL as string | undefined,
    },
    classifier: {
      apiKey: classRaw.apiKey as string | undefined,
      model: classRaw.model as string | undefined,
    },
    confidenceThreshold: (cfg.confidenceThreshold as number) ?? 0.8,
    autoCapture: (cfg.autoCapture as boolean) ?? false,
    autoRecall: (cfg.autoRecall as boolean) ?? false,
    autoRecallLimit: (cfg.autoRecallLimit as number) ?? 3,
    autoRecallMinScore: (cfg.autoRecallMinScore as number) ?? 0.3,
    dnd: {
      autoQuiet: {
        enabled: autoQuietRaw.enabled !== false,
        from: (autoQuietRaw.from as string) ?? "02:00",
        to: (autoQuietRaw.to as string) ?? "06:00",
      },
      timezone: (dndRaw.timezone as string) ?? "America/New_York",
    },
    actions: {
      enabled: actRaw.enabled !== false,
      gatewayToken: actRaw.gatewayToken as string | undefined,
      gatewayUrl: (actRaw.gatewayUrl as string) ?? "http://127.0.0.1:18789",
      timezone: (actRaw.timezone as string) ?? "America/New_York",
      extractionModel: (actRaw.extractionModel as string) ?? "claude-haiku-3.5",
      reminder: {
        enabled: reminderRaw.enabled !== false,
        nagIntervalMinutes: (reminderRaw.nagIntervalMinutes as number) ?? 5,
        defaultTime: (reminderRaw.defaultTime as string) ?? "09:00",
      },
      payment: {
        enabled: paymentRaw.enabled !== false,
        autoExecuteThreshold: (paymentRaw.autoExecuteThreshold as number) ?? 0.95,
        maxAutoExecuteAmount: (paymentRaw.maxAutoExecuteAmount as number) ?? 10,
      },
    },
  };
}

// ============================================================================
// Plugin Definition
// ============================================================================

const brainPlugin = {
  id: "brain",
  name: "Brain",
  description:
    "Behavioral memory system — captures thoughts, classifies them into configurable " +
    "buckets, provides semantic search, and detects actionable intents (reminders, payments).",
  kind: "memory" as const,

  register(api: any) {
    const cfg = parseConfig(api.pluginConfig);
    if (!cfg) {
      api.logger?.info?.(
        "brain: no config or missing embedding.apiKey, plugin inactive.",
      );
      return;
    }

    const resolvedDbPath = api.resolvePath(cfg.storage.dbPath);
    const storagePath = path.dirname(resolvedDbPath);

    // Initialize DND state path
    setDndStatePath(storagePath);

    // Create embedding provider
    const embedder = createEmbeddingProvider({
      provider: cfg.embedding.provider,
      apiKey: cfg.embedding.apiKey,
      model: cfg.embedding.model,
      baseURL: cfg.embedding.baseURL,
    });

    // Create store with configured buckets
    const store = new BrainStore(resolvedDbPath, embedder.dim, cfg.buckets);

    // Create classifier
    let classifierFn: ClassifierFn | undefined;
    if (cfg.classifier.apiKey) {
      classifierFn = createClassifier({
        apiKey: cfg.classifier.apiKey,
        model: cfg.classifier.model ?? "claude-haiku-3.5",
        buckets: cfg.buckets,
      });
    }

    api.logger.info(
      `brain: registered (db: ${resolvedDbPath}, buckets: ${cfg.buckets.length}, ` +
        `embeddings: ${embedder.name}, classifier: ${classifierFn ? "active" : "no API key"})`,
    );

    // Expose internals for extension consumers
    (api as any)._brainCore = { store, embedder, classifierFn, config: cfg };

    // ==================================================================
    // Actions setup
    // ==================================================================

    let actionsRouterConfig: ActionRouterConfig | undefined;
    const actionsHooks: ActionHooks = {};

    if (cfg.actions.enabled) {
      actionsRouterConfig = {
        enabled: cfg.actions.enabled,
        gatewayToken: cfg.actions.gatewayToken ?? api.gatewayToken ?? "",
        gatewayUrl: cfg.actions.gatewayUrl,
        timezone: cfg.actions.timezone,
        extractionModel: cfg.actions.extractionModel,
        storagePath: path.dirname(resolvedDbPath),
        reminder: cfg.actions.reminder,
        payment: cfg.actions.payment,
      };

      (api as any)._brainActions = {
        config: actionsRouterConfig,
        hooks: actionsHooks,
        routeAction,
        shouldRouteAction,
      };

      api.logger.info(
        `brain: actions enabled (timezone: ${cfg.actions.timezone}, ` +
          `reminders: ${cfg.actions.reminder.enabled}, payments: ${cfg.actions.payment.enabled})`,
      );
    }

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
            const text = params.text ?? params.command;
            if (!text) {
              return {
                content: [{ type: "text", text: "❌ No text provided." }],
                details: { error: true },
              };
            }

            const result = await handleDrop(
              store,
              embedder,
              text,
              params.source ?? "drop",
              params.mediaPath,
              {
                classifierFn,
                confidenceThreshold: cfg.confidenceThreshold,
                async: true,
                buckets: cfg.buckets,
              },
            );
            return {
              content: [{ type: "text", text: result.message }],
              details: { ...result, inputTag: result.inputTag ?? null },
            };
          } catch (err: any) {
            return {
              content: [{ type: "text", text: `Drop failed: ${err.message ?? err}` }],
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
              description: `Specific bucket to search (${cfg.buckets.join(", ")})`,
            }),
          ),
          limit: Type.Optional(Type.Number({ description: "Max results (default 5)" })),
        }),
        async execute(_toolCallId: string, params: any) {
          try {
            const vector = await embedder.embed(params.query);
            const limit = params.limit ?? 5;
            const bucketsToSearch = params.bucket ? [params.bucket] : [...cfg.buckets];

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
              content: [{ type: "text", text: `Search failed: ${err.message ?? err}` }],
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
            const lines = stats.map((s) => `  ${s.table}: ${s.count} records`);
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
              content: [{ type: "text", text: `Stats failed: ${err.message ?? err}` }],
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
          limit: Type.Optional(Type.Number({ description: "Max entries to show (default 10)" })),
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
              .map((e) => `[${(e.timestamp as string).slice(0, 19)}] ${e.action} — ${e.details}`)
              .join("\n");

            return {
              content: [
                { type: "text", text: `📋 Audit Trail (${entries.length} entries):\n\n${text}` },
              ],
              details: { count: entries.length, entries },
            };
          } catch (err: any) {
            return {
              content: [{ type: "text", text: `Audit query failed: ${err.message ?? err}` }],
              details: { error: true },
            };
          }
        },
      },
      { name: "brain_audit" },
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
              cfg.buckets,
              embedder,
            );
            return {
              content: [{ type: "text", text: result.message }],
              details: result,
            };
          } catch (err: any) {
            return {
              content: [{ type: "text", text: `Fix failed: ${err.message ?? err}` }],
              details: { error: true },
            };
          }
        },
      },
      { name: "brain_fix" },
    );

    // ==================================================================
    // Tool: brain_recall
    // ==================================================================

    api.registerTool(
      {
        name: "brain_recall",
        label: "Brain Recall",
        description:
          "Recall memories from the Brain with formatted, human-readable output. " +
          "Use this when the user asks to remember something or wants to search their notes.",
        parameters: Type.Object({
          query: Type.String({ description: "Natural language query" }),
          bucket: Type.Optional(
            Type.String({
              description: `Specific bucket (${cfg.buckets.join(", ")})`,
            }),
          ),
          limit: Type.Optional(Type.Number({ description: "Max results (default 5)" })),
        }),
        async execute(_toolCallId: string, params: any) {
          try {
            const result = await handleRecall(store, embedder, params.query, {
              bucket: params.bucket,
              limit: params.limit,
            });
            const formatted = formatRecallResults(result);
            return {
              content: [{ type: "text", text: formatted }],
              details: { count: result.totalFound, results: result.results },
            };
          } catch (err: any) {
            return {
              content: [{ type: "text", text: `Recall failed: ${err.message ?? err}` }],
              details: { error: true },
            };
          }
        },
      },
      { name: "brain_recall" },
    );

    // ==================================================================
    // Auto-Capture
    // ==================================================================

    if (cfg.autoCapture) {
      api.registerHook(["message_received"], async (event: any) => {
        const content = event?.content?.trim();
        if (!content || content.length < 20) return;
        if (content.startsWith("/")) return;

        try {
          const isNoteworthy = await isMessageNoteworthy(content);
          if (!isNoteworthy) return;

          api.logger.debug?.(`brain: auto-capturing message (${content.length} chars)`);

          await handleDrop(store, embedder, content, "chat", undefined, {
            classifierFn,
            confidenceThreshold: cfg.confidenceThreshold,
            async: true,
            buckets: cfg.buckets,
          });
        } catch (err: any) {
          api.logger.warn?.(`brain: auto-capture failed: ${err.message ?? err}`);
        }
      });

      api.logger.info("brain: auto-capture enabled (message_received hook)");
    }

    // ==================================================================
    // Auto-Recall
    // ==================================================================

    if (cfg.autoRecall) {
      api.registerHook(["before_agent_start"], async (event: any) => {
        const prompt = event?.prompt?.trim();
        if (!prompt || prompt.length < 5) return;

        try {
          const result = await handleRecall(store, embedder, prompt, {
            limit: cfg.autoRecallLimit,
            minScore: cfg.autoRecallMinScore,
          });

          if (result.results.length === 0) return;

          const contextText = formatRecallForContext(result);
          if (!contextText) return;

          api.logger.info?.(`brain: injecting ${result.results.length} memories into context`);

          return {
            prependContext: [
              "## Relevant Memories (from Brain)",
              "The following are automatically recalled memories that may be relevant to this conversation.",
              "",
              contextText,
            ].join("\n"),
          };
        } catch (err: any) {
          api.logger.warn?.(`brain: auto-recall failed: ${err.message ?? err}`);
        }
      });

      api.logger.info("brain: auto-recall enabled (before_agent_start hook)");
    }

    // ==================================================================
    // Actions: Hook Registration Methods
    // ==================================================================

    if (cfg.actions.enabled && actionsRouterConfig) {
      // Expose action hooks and router for extension consumers via _brainActions
      // Extensions can set hooks directly: api._brainActions.hooks.onReminderDeliver = fn;
      // Extensions can route actions: api._brainActions.routeAction(ctx);
      (api as any)._brainActions.route = async (params: {
        store: any;
        embedder: any;
        classification: any;
        rawText: string;
        inboxId: string;
        inputTag?: string;
      }) => {
        const ctx: ActionContext = {
          store: params.store,
          embedder: params.embedder,
          config: actionsRouterConfig!,
          hooks: actionsHooks,
          classification: params.classification,
          rawText: params.rawText,
          inboxId: params.inboxId,
          inputTag: params.inputTag,
          logger: api.logger,
        };
        return await routeAction(ctx);
      };
    }

    // ==================================================================
    // Tool: brain_digest
    // ==================================================================

    const dndConfig: DndConfig = {
      autoQuiet: cfg.dnd.autoQuiet,
      timezone: cfg.dnd.timezone,
    };

    api.registerTool(
      {
        name: "brain_digest",
        label: "Brain Digest",
        description:
          "Generate a concise digest of your Brain status. Types: morning (top actions + overdue), " +
          "midday (due today + stuck), afternoon (what moved + carries), night (tomorrow's priorities), " +
          "weekly (bucket health + focus + wins). Respects DND.",
        parameters: Type.Object({
          type: Type.String({
            description: "Digest type: morning, midday, afternoon, night, weekly",
            enum: ["morning", "midday", "afternoon", "night", "weekly"],
          }),
        }),
        async execute(_toolCallId: string, params: any) {
          try {
            const digestType = params.type as DigestType;

            // Check DND
            const dndStatus = await checkDnd(dndConfig);
            if (dndStatus.quiet) {
              await recordSkippedDigest(digestType);
              return {
                content: [{ type: "text", text: `🔇 DND is active (${dndStatus.reason}). Digest skipped and recorded.` }],
                details: { skipped: true, reason: dndStatus.reason },
              };
            }

            const data = await gatherDigestData(store, digestType, cfg.buckets, cfg.dnd.timezone);
            const formatted = formatDigest(data, digestType);
            return {
              content: [{ type: "text", text: formatted }],
              details: { type: digestType, isEmpty: data.isEmpty },
            };
          } catch (err: any) {
            return {
              content: [{ type: "text", text: `Digest failed: ${err.message ?? err}` }],
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
          "Control Do Not Disturb mode. When active, digests are skipped and recorded for catch-up later.",
        parameters: Type.Object({
          action: Type.String({
            description: "Action: status, on, off",
            enum: ["status", "on", "off"],
          }),
        }),
        async execute(_toolCallId: string, params: any) {
          try {
            if (params.action === "status") {
              const status = await checkDnd(dndConfig);
              return {
                content: [{
                  type: "text",
                  text: status.quiet
                    ? `🔇 DND is ON: ${status.reason}`
                    : `🔔 DND is OFF: ${status.reason}`,
                }],
                details: { quiet: status.quiet, reason: status.reason },
              };
            }

            const on = params.action === "on";
            const result = await toggleDnd(on);
            let text: string;
            if (on) {
              text = "🔇 Do Not Disturb enabled.";
            } else {
              // Check if auto-quiet is still active after manual off
              const postStatus = await checkDnd(dndConfig);
              text = postStatus.quiet
                ? `🔔 Manual DND disabled, but auto-quiet is still active (${postStatus.reason}).`
                : "🔔 Do Not Disturb disabled.";
              if (result.recovery) text += `\n${result.recovery}`;
            }
            return {
              content: [{ type: "text", text }],
              details: { manualDnd: result.state.manualDnd, recovery: result.recovery },
            };
          } catch (err: any) {
            return {
              content: [{ type: "text", text: `DND failed: ${err.message ?? err}` }],
              details: { error: true },
            };
          }
        },
      },
      { name: "brain_dnd" },
    );

    // ==================================================================
    // Slash Commands (auto-reply, no LLM)
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
            { classifierFn, confidenceThreshold: cfg.confidenceThreshold, async: true, buckets: cfg.buckets },
          );
          return { text: `✅ ${result.message}\nID: ${result.id}` };
        } catch (err: any) {
          return { text: `❌ Drop failed: ${err.message ?? err}` };
        }
      },
    });

    api.registerCommand({
      name: "brain",
      description: "Brain dashboard & commands",
      acceptsArgs: true,
      requireAuth: true,
      handler: async (ctx: any) => {
        const args = ctx.args?.trim() ?? "";

        // /brain drop <text>
        if (args === "drop") return { text: "Usage: /brain drop <text>" };
        if (args.startsWith("drop ")) {
          const text = args.slice(5).trim();
          if (!text) return { text: "Usage: /brain drop <text>" };
          try {
            const result = await handleDrop(
              store, embedder, text, "drop", undefined,
              { classifierFn, confidenceThreshold: cfg.confidenceThreshold, async: true, buckets: cfg.buckets },
            );
            return { text: `✅ ${result.message}\nID: ${result.id}` };
          } catch (err: any) {
            return { text: `❌ Drop failed: ${err.message ?? err}` };
          }
        }

        // /brain search <query>
        if (args === "search") return { text: "Usage: /brain search <query>" };
        if (args.startsWith("search ")) {
          const query = args.slice(7).trim();
          if (!query) return { text: "Usage: /brain search <query>" };
          try {
            const result = await handleRecall(store, embedder, query, { limit: 5 });
            return { text: formatRecallResults(result) };
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
              const status = await checkDnd(dndConfig);
              return { text: status.quiet ? `🔇 DND is ON: ${status.reason}` : `🔔 DND is OFF: ${status.reason}` };
            }
            if (sub === "on" || sub === "off") {
              const on = sub === "on";
              const result = await toggleDnd(on);
              let msg: string;
              if (on) {
                msg = "🔇 Do Not Disturb enabled.";
              } else {
                const postStatus = await checkDnd(dndConfig);
                msg = postStatus.quiet
                  ? `🔔 Manual DND disabled, but auto-quiet is still active (${postStatus.reason}).`
                  : "🔔 Do Not Disturb disabled.";
                if (result.recovery) msg += `\n${result.recovery}`;
              }
              return { text: msg };
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
          const dndStatus = await checkDnd(dndConfig);
          const dndLine = dndStatus.quiet ? "🔇 DND: ON" : "🔔 DND: OFF";
          return {
            text: `🧠 Brain Dashboard\n\n${lines.join("\n")}\n\n${dndLine}\n\nCommands: drop, search, stats, dnd`,
          };
        } catch (err: any) {
          return { text: `❌ ${err.message ?? err}` };
        }
      },
    });

    // ==================================================================
    // CLI Commands
    // ==================================================================

    api.registerCli(
      ({ program }: any) => {
        const brain = program.command("brain").description("Brain plugin commands");

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
            const records = await store.list(bucket, parseInt(opts.limit));
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
                confidenceThreshold: cfg.confidenceThreshold,
                async: false,
                buckets: cfg.buckets,
              },
            );
            console.log(result.message);
            console.log(`  ID: ${result.id}`);
          });

        brain
          .command("recall")
          .description("Search memories by semantic similarity")
          .argument("<query>", "Natural language search query")
          .option("--bucket <bucket>", "Specific bucket to search")
          .option("--limit <n>", "Max results", "5")
          .action(async (query: string, opts: any) => {
            const result = await handleRecall(store, embedder, query, {
              bucket: opts.bucket,
              limit: parseInt(opts.limit),
            });
            console.log(formatRecallResults(result));
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
              console.log(`  [${(e.timestamp as string).slice(0, 19)}] ${e.action} — ${e.details}`);
            }
          });
      },
      { commands: ["brain"] },
    );

    // ==================================================================
    // Service
    // ==================================================================

    api.registerService({
      id: "brain",
      start: () => {
        api.logger.info(`brain: initialized (db: ${resolvedDbPath})`);
      },
      stop: () => {
        api.logger.info("brain: stopped");
      },
    });
  },
};

export default brainPlugin;
