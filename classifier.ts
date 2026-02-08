/**
 * Brain 2.0 — Classification engine.
 *
 * Classifies raw thoughts into structured records using the Anthropic API.
 * Uses claude-sonnet-4 for cost efficiency.
 *
 * Design doc Section 5.2: API-style prompts, structured JSON output.
 */

import type { ClassificationResult, DetectedIntent, MainBucket } from "./schemas.js";

// ============================================================================
// Classification prompt template (from design doc Section 5.2)
// ============================================================================

export const CLASSIFICATION_SYSTEM_PROMPT = `You are a classification engine. Given a raw thought, extract structured data.

BUCKETS: people, project, idea, admin, document, goal, health, finance
RULES:
- If it mentions a person by name or role → people
- If it relates to ongoing work, tasks, deadlines → project
- If it's a new concept, opportunity, or "what if" → idea
- If it's appointments, errands, logistics → admin
- If it references a specific document, article, or resource → document
- If it's a long-term objective, milestone, or life target → goal
- If it relates to medical, fitness, nutrition, mental health, or wellness → health
- If it involves money, bills, investments, expenses, or budgets → finance
- If unclear, return bucket: "unknown" with low confidence

INTENT DETECTION:
Also detect the user's actionable intent from the text:
- "reminder" — wants to be reminded/notified at a specific time
- "todo" — a task or action item to complete
- "purchase" — something to buy, a purchase to make
- "call" — needs to call someone or follow up by phone
- "booking" — needs to book/schedule an appointment or reservation
- "none" — no specific actionable intent, just a note or observation

OUTPUT (JSON only, no markdown fences):
{
  "bucket": "people|project|idea|admin|document|goal|health|finance|unknown",
  "confidence": 0.0-1.0,
  "title": "short label (≤8 words)",
  "summary": "1-2 sentence distillation",
  "nextActions": ["concrete next step 1", "optional step 2"],
  "entities": { "people": [], "dates": [], "amounts": [], "locations": [] },
  "urgency": "now|today|this-week|someday",
  "followUpDate": "YYYY-MM-DD or null",
  "tags": ["max", "3", "tags"],
  "detectedIntent": "reminder|todo|purchase|call|booking|none"
}`;

// ============================================================================
// JSON schema for structured output (Anthropic tool_use pattern)
// ============================================================================

export const CLASSIFICATION_JSON_SCHEMA = {
  type: "object" as const,
  properties: {
    bucket: {
      type: "string" as const,
      enum: [
        "people",
        "project",
        "idea",
        "admin",
        "document",
        "goal",
        "health",
        "finance",
        "unknown",
      ],
    },
    confidence: { type: "number" as const, minimum: 0, maximum: 1 },
    title: { type: "string" as const },
    summary: { type: "string" as const },
    nextActions: { type: "array" as const, items: { type: "string" as const } },
    entities: {
      type: "object" as const,
      properties: {
        people: { type: "array" as const, items: { type: "string" as const } },
        dates: { type: "array" as const, items: { type: "string" as const } },
        amounts: { type: "array" as const, items: { type: "string" as const } },
        locations: { type: "array" as const, items: { type: "string" as const } },
      },
    },
    urgency: {
      type: "string" as const,
      enum: ["now", "today", "this-week", "someday"],
    },
    followUpDate: { type: "string" as const, nullable: true },
    tags: { type: "array" as const, items: { type: "string" as const }, maxItems: 3 },
    detectedIntent: {
      type: "string" as const,
      enum: ["reminder", "todo", "purchase", "call", "booking", "none"],
    },
  },
  required: [
    "bucket",
    "confidence",
    "title",
    "summary",
    "nextActions",
    "entities",
    "urgency",
    "followUpDate",
    "tags",
    "detectedIntent",
  ],
};

// ============================================================================
// Prompt builder
// ============================================================================

/**
 * Build the user prompt for classifying a raw thought.
 */
export function buildClassificationPrompt(rawText: string): string {
  return `Classify this thought:\n\n"${rawText}"`;
}

/**
 * Map the classifier's bucket name to the actual LanceDB table name.
 * The classifier uses singular ("project") but tables use plural ("projects").
 */
export function bucketToTable(bucket: string): MainBucket | null {
  const mapping: Record<string, MainBucket> = {
    people: "people",
    project: "projects",
    projects: "projects",
    idea: "ideas",
    ideas: "ideas",
    admin: "admin",
    document: "documents",
    documents: "documents",
    goal: "goals",
    goals: "goals",
    health: "health",
    finance: "finance",
  };
  return mapping[bucket] ?? null;
}

/**
 * Validate a classification result. Returns an array of error strings.
 * Empty array means valid.
 */
export function validateClassification(result: unknown): string[] {
  const errors: string[] = [];
  if (!result || typeof result !== "object") {
    errors.push("Classification result must be an object");
    return errors;
  }

  const r = result as Record<string, unknown>;

  if (typeof r.bucket !== "string") errors.push("Missing bucket");
  if (typeof r.confidence !== "number") errors.push("Missing confidence");
  if (typeof r.title !== "string") errors.push("Missing title");
  if (typeof r.summary !== "string") errors.push("Missing summary");
  if (!Array.isArray(r.nextActions)) errors.push("Missing nextActions");
  if (typeof r.urgency !== "string") errors.push("Missing urgency");

  return errors;
}

// ============================================================================
// Multi-provider classification (Gemini + Anthropic)
// ============================================================================

/** Options for calling the classifier */
export interface ClassifyOptions {
  /** API key (Gemini or Anthropic) */
  apiKey: string;
  /** Model to use (default: gemini-2.0-flash) */
  model?: string;
  /** Max tokens for response (default: 1024) */
  maxTokens?: number;
}

/** Result from classify including token usage */
export interface ClassifyResult {
  classification: ClassificationResult;
  tokensUsed: number;
}

/**
 * Detect provider from model name.
 */
function detectProvider(model: string): "gateway" | "gemini" {
  if (model.startsWith("claude") || model.startsWith("anthropic/")) {
    return "gateway";
  }
  return "gemini";
}

/**
 * Classify raw text via OpenClaw gateway's OpenAI-compatible chat completions endpoint.
 * Routes through the gateway so it handles auth (OAuth, API keys, fallbacks) transparently.
 */
async function classifyViaGateway(
  rawText: string,
  options: ClassifyOptions,
): Promise<ClassifyResult> {
  const model = options.model ?? "claude-haiku-3.5";
  const gatewayToken = options.apiKey; // Reuse apiKey field for gateway token

  const url = "http://127.0.0.1:18789/v1/chat/completions";

  const requestBody = {
    model,
    max_tokens: options.maxTokens ?? 1024,
    messages: [
      { role: "system", content: CLASSIFICATION_SYSTEM_PROMPT },
      { role: "user", content: buildClassificationPrompt(rawText) },
    ],
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${gatewayToken}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Gateway API error: ${response.status} ${body.slice(0, 500)}`,
    );
  }

  const data = (await response.json()) as any;

  // Extract text from OpenAI-compatible response
  const textContent = data.choices?.[0]?.message?.content;
  if (!textContent) {
    throw new Error(
      "No text in gateway response: " + JSON.stringify(data).slice(0, 500),
    );
  }

  // Strip markdown fences if present, then extract just the JSON object
  let jsonStr = textContent.replace(/^```(?:json)?\s*\n?/m, "").replace(/\n?```\s*$/m, "").trim();

  // Extract the JSON object — find first { and its matching }
  const startIdx = jsonStr.indexOf("{");
  if (startIdx >= 0) {
    let depth = 0;
    let endIdx = startIdx;
    for (let i = startIdx; i < jsonStr.length; i++) {
      if (jsonStr[i] === "{") depth++;
      else if (jsonStr[i] === "}") depth--;
      if (depth === 0) { endIdx = i; break; }
    }
    jsonStr = jsonStr.slice(startIdx, endIdx + 1);
  }

  // Parse JSON response
  let raw: any;
  try {
    raw = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`Failed to parse classification JSON: ${jsonStr.slice(0, 500)}`);
  }

  // Validate the result
  const errors = validateClassification(raw);
  if (errors.length > 0) {
    throw new Error(`Invalid classification result: ${errors.join(", ")}`);
  }

  const classification = normalizeClassification(raw);
  const tokensUsed =
    (data.usage?.prompt_tokens ?? 0) + (data.usage?.completion_tokens ?? 0);

  return { classification, tokensUsed };
}

/**
 * Classify raw text by calling Gemini Flash with structured JSON output.
 */
async function classifyWithGemini(
  rawText: string,
  options: ClassifyOptions,
): Promise<ClassifyResult> {
  const model = options.model ?? "gemini-2.0-flash";
  const apiKey = options.apiKey;

  const prompt = `${CLASSIFICATION_SYSTEM_PROMPT}\n\nClassify this thought:\n\n"${rawText}"`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const requestBody = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      response_mime_type: "application/json",
      response_schema: CLASSIFICATION_JSON_SCHEMA,
      maxOutputTokens: options.maxTokens ?? 1024,
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Gemini API error: ${response.status} ${body.slice(0, 500)}`,
    );
  }

  const data = (await response.json()) as any;

  // Extract text from Gemini response
  const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textContent) {
    throw new Error(
      "No text in Gemini response: " + JSON.stringify(data).slice(0, 500),
    );
  }

  // Parse JSON response
  let raw: any;
  try {
    raw = JSON.parse(textContent);
  } catch (e) {
    throw new Error(`Failed to parse Gemini JSON: ${textContent.slice(0, 500)}`);
  }

  // Validate the result
  const errors = validateClassification(raw);
  if (errors.length > 0) {
    throw new Error(`Invalid classification result: ${errors.join(", ")}`);
  }

  const classification = normalizeClassification(raw);
  const tokensUsed =
    (data.usageMetadata?.promptTokenCount ?? 0) +
    (data.usageMetadata?.candidatesTokenCount ?? 0);

  return { classification, tokensUsed };
}

/**
 * Normalize raw classification JSON into a clean ClassificationResult.
 */
/** Valid detected intent values. */
const VALID_INTENTS: Set<string> = new Set([
  "reminder", "todo", "purchase", "call", "booking", "none",
]);

function normalizeClassification(raw: any): ClassificationResult {
  const rawIntent = raw.detectedIntent as string | undefined;
  const detectedIntent: DetectedIntent =
    rawIntent && VALID_INTENTS.has(rawIntent)
      ? (rawIntent as DetectedIntent)
      : "none";

  return {
    bucket: raw.bucket,
    confidence: Math.max(0, Math.min(1, raw.confidence)),
    title: raw.title,
    summary: raw.summary,
    nextActions: raw.nextActions ?? [],
    entities: {
      people: raw.entities?.people ?? [],
      dates: raw.entities?.dates ?? [],
      amounts: raw.entities?.amounts ?? [],
      locations: raw.entities?.locations ?? [],
    },
    urgency: raw.urgency ?? "someday",
    followUpDate: raw.followUpDate ?? null,
    tags: (raw.tags ?? []).slice(0, 3),
    detectedIntent,
  };
}

/**
 * Classify raw text — auto-detects provider from model name.
 *
 * @param rawText - The raw thought to classify
 * @param options - API configuration
 * @returns Classification result + token usage
 */
export async function classifyText(
  rawText: string,
  options: ClassifyOptions,
): Promise<ClassifyResult> {
  const model = options.model ?? "gemini-2.0-flash";
  const provider = detectProvider(model);

  if (provider === "gateway") {
    return classifyViaGateway(rawText, options);
  }
  return classifyWithGemini(rawText, options);
}

// ============================================================================
// Injectable classifier interface (for testing)
// ============================================================================

/**
 * A classifier function type — accepts raw text, returns classification.
 * Can be the real Gemini-based classifier or a mock for testing.
 */
export type ClassifierFn = (rawText: string) => Promise<ClassifyResult>;

/**
 * Create a real classifier function bound to specific API options.
 */
export function createClassifier(options: ClassifyOptions): ClassifierFn {
  return (rawText: string) => classifyText(rawText, options);
}
