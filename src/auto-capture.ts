/**
 * Brain — Auto-Capture v2: Conversation Distillation Pipeline.
 *
 * Buffers conversation turns per-session, then flushes them through
 * a lightweight LLM extraction pass to distill facts, decisions,
 * preferences, and todos. Only the distilled items are embedded
 * and stored in the `conversations` bucket.
 *
 * @see docs/DESIGN-auto-capture-v2.md
 */

import { randomUUID } from "node:crypto";
import { isMessageNoteworthy } from "./noteworthy.js";
import type { EmbeddingProvider } from "./schemas.js";
import type { BrainStore } from "./store.js";
import { logAudit } from "./audit.js";
import { parseJsonFromLlm } from "./parse-llm-json.js";

// ============================================================================
// Types
// ============================================================================

/** A single buffered conversation turn. */
export interface BufferedTurn {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  sessionId?: string;
}

/** An extracted item from the distillation LLM. */
export interface ExtractedItem {
  type: "fact" | "decision" | "preference" | "todo";
  text: string;
  confidence: number;
  entities: string[];
  temporal: string | null;
}

/** Result from the extraction LLM. */
export interface ExtractionResult {
  items: ExtractedItem[];
  context_summary: string;
}

/** Aggressiveness level for auto-capture. */
export type AutoCaptureLevel = "off" | "facts" | "standard" | "full";

/** Full configuration for auto-capture. */
export interface AutoCaptureConfig {
  enabled: boolean;
  level: AutoCaptureLevel;
  extractionModel: string;
  flushAfterTurns: number;
  idleFlushMs: number;
  maxBufferTurns: number;
  bucket: string;
  minConfidence: number;
  /** API key for extraction LLM (Gemini or gateway token). */
  extractionApiKey: string;
  /** Gateway URL for gateway-based models. */
  gatewayUrl: string;
}

export const DEFAULT_AUTO_CAPTURE_CONFIG: AutoCaptureConfig = {
  enabled: false,
  level: "standard",
  extractionModel: "gemini-2.0-flash",
  flushAfterTurns: 10,
  idleFlushMs: 5 * 60 * 1000, // 5 minutes
  maxBufferTurns: 20,
  bucket: "conversations",
  minConfidence: 0.6,
  extractionApiKey: "",
  gatewayUrl: "http://127.0.0.1:18789",
};

// ============================================================================
// Extraction Prompts
// ============================================================================

const EXTRACTION_PROMPTS: Record<AutoCaptureLevel, string> = {
  off: "",
  facts: `You are an information extraction engine. Given a conversation between a user and an assistant, extract ONLY durable, referenceable information.

Extract into these categories:

FACTS: Concrete statements of truth the user stated or confirmed
  - Personal details, preferences, names, dates, locations
  - Technical decisions, architecture choices
  - Account details, configurations mentioned

DECISIONS: Explicit choices the user made
  - "Let's go with X", "Use Y instead of Z", "We'll do A"

Skip opinions, preferences, action items, casual discussion, debugging back-and-forth, and assistant explanations.`,

  standard: `You are an information extraction engine. Given a conversation between a user and an assistant, extract ONLY durable, referenceable information. Skip pleasantries, acknowledgments, debugging back-and-forth, and assistant explanations.

Extract into these categories:

FACTS: Concrete statements of truth the user stated or confirmed
  - Personal details, names, dates, locations
  - Technical details, architecture choices, configurations

DECISIONS: Explicit choices the user made
  - "Let's go with X", "Use Y instead of Z", "We'll do A"

PREFERENCES: Stated likes, dislikes, or preferred approaches
  - "I prefer X", "Don't do Y", "Always use Z"

TODOS: Action items that emerged (for user or assistant)
  - "Need to do X", "Remind me to Y", "Next step is Z"`,

  full: `You are an information extraction engine. Given a conversation between a user and an assistant, extract all durable, referenceable information. Skip only trivial acknowledgments ("ok", "thanks", "got it").

Extract into these categories:

FACTS: Concrete statements of truth the user stated or confirmed
  - Personal details, names, dates, locations
  - Technical details, architecture choices, configurations

DECISIONS: Explicit choices the user made
  - "Let's go with X", "Use Y instead of Z", "We'll do A"

PREFERENCES: Stated likes, dislikes, or preferred approaches
  - "I prefer X", "Don't do Y", "Always use Z"

TODOS: Action items that emerged (for user or assistant)
  - "Need to do X", "Remind me to Y", "Next step is Z"`,
};

const EXTRACTION_OUTPUT_SCHEMA = `
OUTPUT (JSON only, no markdown fences):
{
  "items": [
    {
      "type": "fact|decision|preference|todo",
      "text": "concise distilled statement",
      "confidence": 0.0-1.0,
      "entities": ["entity1", "entity2"],
      "temporal": "YYYY-MM-DD or null"
    }
  ],
  "context_summary": "1-sentence summary of what this conversation was about"
}

If the conversation contains NO extractable durable information, return:
{"items": [], "context_summary": "brief topic description"}`;

// ============================================================================
// Turn Buffer
// ============================================================================

export class TurnBuffer {
  private buffers: Map<string, {
    turns: BufferedTurn[];
    lastActivity: number;
    flushTimer: ReturnType<typeof setTimeout> | null;
    userTurnCount: number;
    isFlushing: boolean;
  }> = new Map();

  constructor(
    private readonly config: AutoCaptureConfig,
    private readonly onFlush: (sessionId: string, turns: BufferedTurn[]) => Promise<void>,
    private readonly logger?: { info?: (...args: any[]) => void; debug?: (...args: any[]) => void; warn?: (...args: any[]) => void },
  ) {}

  /**
   * Add a turn to the buffer for a given session.
   * May trigger a flush if turn count threshold is reached.
   */
  addTurn(sessionId: string, role: "user" | "assistant", content: string): void {
    let buf = this.buffers.get(sessionId);
    if (!buf) {
      buf = { turns: [], lastActivity: Date.now(), flushTimer: null, userTurnCount: 0, isFlushing: false };
      this.buffers.set(sessionId, buf);
    }

    // Add turn (ring buffer eviction)
    buf.turns.push({
      role,
      content,
      timestamp: new Date().toISOString(),
      sessionId,
    });
    if (buf.turns.length > this.config.maxBufferTurns) {
      buf.turns.shift();
    }

    buf.lastActivity = Date.now();
    if (role === "user") {
      buf.userTurnCount++;
    }

    // Reset idle timer
    if (buf.flushTimer) {
      clearTimeout(buf.flushTimer);
    }
    buf.flushTimer = setTimeout(() => {
      this.triggerFlush(sessionId, "idle");
    }, this.config.idleFlushMs);

    // Check turn count threshold (skip if flush already in progress)
    if (buf.userTurnCount >= this.config.flushAfterTurns && !buf.isFlushing) {
      this.triggerFlush(sessionId, "turn_count");
    }
  }

  /**
   * Force flush a specific session's buffer.
   */
  async flushSession(sessionId: string): Promise<void> {
    await this.triggerFlush(sessionId, "manual");
  }

  /**
   * Flush all active buffers (e.g., on shutdown).
   */
  async flushAll(): Promise<void> {
    const sessions = [...this.buffers.keys()];
    for (const sessionId of sessions) {
      await this.triggerFlush(sessionId, "shutdown");
    }
  }

  /**
   * Get the number of active session buffers.
   */
  get activeBufferCount(): number {
    return this.buffers.size;
  }

  /**
   * Get the buffered turn count for a session.
   */
  getBufferSize(sessionId: string): number {
    return this.buffers.get(sessionId)?.turns.length ?? 0;
  }

  /**
   * Destroy all timers and buffers (cleanup).
   */
  destroy(): void {
    for (const [, buf] of this.buffers) {
      if (buf.flushTimer) clearTimeout(buf.flushTimer);
    }
    this.buffers.clear();
  }

  private async triggerFlush(sessionId: string, reason: string): Promise<void> {
    const buf = this.buffers.get(sessionId);
    if (!buf || buf.turns.length === 0) return;

    // Prevent concurrent flushes for the same session
    if (buf.isFlushing) return;
    buf.isFlushing = true;

    // Clear timer
    if (buf.flushTimer) {
      clearTimeout(buf.flushTimer);
      buf.flushTimer = null;
    }

    // Take snapshot and reset
    const turns = [...buf.turns];
    buf.turns = [];
    buf.userTurnCount = 0;

    this.logger?.debug?.(`brain: auto-capture flushing ${turns.length} turns for session ${sessionId} (reason: ${reason})`);

    try {
      await this.onFlush(sessionId, turns);
    } catch (err: any) {
      this.logger?.warn?.(`brain: auto-capture flush failed for ${sessionId}: ${err.message ?? err}`);
    } finally {
      buf.isFlushing = false;
    }

    // Clean up empty buffers
    if (buf.turns.length === 0 && !buf.flushTimer) {
      this.buffers.delete(sessionId);
    }
  }
}

// ============================================================================
// Extraction LLM
// ============================================================================

/**
 * Build the extraction prompt from buffered turns.
 */
export function buildExtractionPrompt(turns: BufferedTurn[], level: AutoCaptureLevel): string {
  const systemPrompt = EXTRACTION_PROMPTS[level];
  if (!systemPrompt) return "";

  const conversation = turns
    .map((t) => `[${t.role}]: ${t.content}`)
    .join("\n\n");

  return `${systemPrompt}\n${EXTRACTION_OUTPUT_SCHEMA}\n\n---\n\nCONVERSATION:\n${conversation}`;
}

/**
 * Call the extraction LLM to distill turns into structured items.
 */
export async function extractFromTurns(
  turns: BufferedTurn[],
  config: AutoCaptureConfig,
): Promise<ExtractionResult> {
  if (config.level === "off" || turns.length === 0) {
    return { items: [], context_summary: "" };
  }

  const prompt = buildExtractionPrompt(turns, config.level);
  const model = config.extractionModel;
  const isGateway = model.startsWith("claude") || model.startsWith("anthropic/");

  let textContent: string;

  if (isGateway) {
    textContent = await callGatewayExtraction(prompt, model, config);
  } else {
    textContent = await callGeminiExtraction(prompt, model, config);
  }

  // Parse response
  const parsed = parseJsonFromLlm(textContent);
  if (!parsed) {
    return { items: [], context_summary: "extraction failed" };
  }

  return normalizeExtractionResult(parsed, config);
}

/** Default timeout for extraction LLM fetch calls (30 seconds). */
const EXTRACTION_FETCH_TIMEOUT_MS = 30_000;

async function callGatewayExtraction(
  prompt: string,
  model: string,
  config: AutoCaptureConfig,
): Promise<string> {
  const url = `${config.gatewayUrl}/v1/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXTRACTION_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.extractionApiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Gateway extraction failed: ${response.status} ${body.slice(0, 300)}`);
    }

    const data = (await response.json()) as any;
    return data.choices?.[0]?.message?.content ?? "";
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error(`Gateway extraction timed out after ${EXTRACTION_FETCH_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function callGeminiExtraction(
  prompt: string,
  model: string,
  config: AutoCaptureConfig,
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.extractionApiKey}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXTRACTION_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          response_mime_type: "application/json",
          maxOutputTokens: 1024,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Gemini extraction failed: ${response.status} ${body.slice(0, 300)}`);
    }

    const data = (await response.json()) as any;
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error(`Gemini extraction timed out after ${EXTRACTION_FETCH_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Normalize and validate the raw extraction result.
 */
function normalizeExtractionResult(
  raw: any,
  config: AutoCaptureConfig,
): ExtractionResult {
  const items: ExtractedItem[] = [];
  const validTypes = getValidTypesForLevel(config.level);

  if (Array.isArray(raw.items)) {
    for (const item of raw.items) {
      if (!item || typeof item !== "object") continue;
      if (typeof item.text !== "string" || !item.text.trim()) continue;

      const type = validTypes.has(item.type) ? item.type : null;
      if (!type) continue;

      const confidence = typeof item.confidence === "number"
        ? Math.max(0, Math.min(1, item.confidence))
        : 0.7;

      if (confidence < config.minConfidence) continue;

      items.push({
        type,
        text: item.text.trim(),
        confidence,
        entities: Array.isArray(item.entities)
          ? item.entities.filter((e: any) => typeof e === "string")
          : [],
        temporal: typeof item.temporal === "string" && item.temporal !== "null"
          ? item.temporal
          : null,
      });
    }
  }

  return {
    items,
    context_summary: typeof raw.context_summary === "string"
      ? raw.context_summary.trim()
      : "",
  };
}

function getValidTypesForLevel(level: AutoCaptureLevel): Set<string> {
  switch (level) {
    case "facts":
      return new Set(["fact", "decision"]);
    case "standard":
    case "full":
      return new Set(["fact", "decision", "preference", "todo"]);
    default:
      return new Set();
  }
}

// ============================================================================
// Store extracted items
// ============================================================================

/**
 * Store extracted items in the conversations bucket.
 * Each item gets its own embedding and record.
 */
export async function storeExtractedItems(
  store: BrainStore,
  embedder: EmbeddingProvider,
  result: ExtractionResult,
  sessionId: string,
  config: AutoCaptureConfig,
): Promise<string[]> {
  if (result.items.length === 0) return [];

  const recordIds: string[] = [];
  const now = new Date().toISOString();

  // Batch embed all item texts
  const texts = result.items.map((item) => item.text);
  const vectors = await embedder.embedBatch(texts);

  for (let i = 0; i < result.items.length; i++) {
    const item = result.items[i];
    const vector = vectors[i];

    const record: Record<string, unknown> = {
      id: randomUUID(),
      type: item.type,
      text: item.text,
      confidence: item.confidence,
      source_session: sessionId,
      context_summary: result.context_summary,
      entities: JSON.stringify(item.entities),
      temporal: item.temporal ?? "",
      captured_at: now,
      tags: JSON.stringify([]),
      entries: JSON.stringify([{ date: now, note: `Auto-captured from session ${sessionId}` }]),
      nextActions: item.type === "todo" ? JSON.stringify([item.text]) : JSON.stringify([]),
      status: "active",
      vector,
    };

    await store.create(config.bucket, record);
    recordIds.push(record.id as string);

    // Audit trail
    await logAudit(store, {
      action: "captured",
      inputId: sessionId,
      outputId: record.id as string,
      bucket: config.bucket,
      confidence: item.confidence,
      details: `Auto-captured ${item.type}: "${item.text.slice(0, 80)}"`,
    });
  }

  return recordIds;
}

// ============================================================================
// Pipeline orchestrator
// ============================================================================

/**
 * Create the auto-capture pipeline: returns the TurnBuffer and flush handler.
 */
export function createAutoCapturePipeline(
  store: BrainStore,
  embedder: EmbeddingProvider,
  config: AutoCaptureConfig,
  logger?: { info?: (...args: any[]) => void; debug?: (...args: any[]) => void; warn?: (...args: any[]) => void },
): TurnBuffer {
  const onFlush = async (sessionId: string, turns: BufferedTurn[]) => {
    // Filter turns through noteworthy heuristic
    const worthyTurns = turns.filter(
      (t) => t.role === "assistant" || isMessageNoteworthy(t.content),
    );

    if (worthyTurns.length < 2) {
      logger?.debug?.(`brain: auto-capture skipping flush — only ${worthyTurns.length} worthy turns`);
      return;
    }

    logger?.info?.(`brain: auto-capture extracting from ${worthyTurns.length} turns (session: ${sessionId})`);

    // Run extraction
    const result = await extractFromTurns(worthyTurns, config);

    if (result.items.length === 0) {
      logger?.debug?.(`brain: auto-capture extraction found 0 items — skipping`);
      return;
    }

    // Store extracted items
    const ids = await storeExtractedItems(store, embedder, result, sessionId, config);
    logger?.info?.(`brain: auto-capture stored ${ids.length} items from session ${sessionId}`);
  };

  return new TurnBuffer(config, onFlush, logger);
}
