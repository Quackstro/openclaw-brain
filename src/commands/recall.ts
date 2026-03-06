/**
 * Brain Core — /recall command handler.
 *
 * User-facing semantic search across all brain buckets.
 * Returns formatted, human-readable results with context.
 */

import type { EmbeddingProvider, GenericBucketRecord } from "../schemas.js";
import type { BrainStore, SearchResult } from "../store.js";

// ============================================================================
// Types
// ============================================================================

export interface RecallResult {
  query: string;
  results: RecallEntry[];
  totalFound: number;
}

export interface RecallEntry {
  id: string;
  bucket: string;
  title: string;
  summary: string;
  score: number;
  /** Most recent entry note, if any */
  lastNote?: string;
  tags: string[];
  nextActions: string[];
}

export interface RecallOptions {
  /** Specific bucket to search (omit for all) */
  bucket?: string;
  /** Max results (default 5) */
  limit?: number;
  /** Minimum similarity score 0-1 (default 0.1) */
  minScore?: number;
}

// ============================================================================
// Core recall function
// ============================================================================

export async function handleRecall(
  store: BrainStore,
  embedder: EmbeddingProvider,
  query: string,
  options: RecallOptions = {},
): Promise<RecallResult> {
  const limit = options.limit ?? 5;
  const minScore = options.minScore ?? 0.1;
  const bucketsToSearch = options.bucket
    ? [options.bucket]
    : [...store.getBuckets()];

  const vector = await embedder.embed(query);

  const allResults: Array<{ bucket: string } & SearchResult> = [];

  for (const bucket of bucketsToSearch) {
    try {
      const results = await store.search(bucket, vector, limit);
      for (const r of results) {
        allResults.push({ bucket, ...r });
      }
    } catch {
      // Skip empty/missing tables
    }
  }

  // Sort by score descending, filter by minimum
  allResults.sort((a, b) => b.score - a.score);
  const filtered = allResults.filter((r) => r.score >= minScore).slice(0, limit);

  const results: RecallEntry[] = filtered.map((r) => {
    const rec = r.record as Partial<GenericBucketRecord> & Record<string, unknown>;
    const title = (rec.title || rec.name || rec.id || "untitled") as string;
    const summary = (rec.summary || rec.description || rec.context || "") as string;

    // Parse JSON arrays safely
    const tags = safeParseArray(rec.tags);
    const nextActions = safeParseArray(rec.nextActions);
    const entries = safeParseArray(rec.entries);

    // Get most recent note
    const lastNote = entries.length > 0
      ? (typeof entries[entries.length - 1] === "object" && entries[entries.length - 1] !== null
          ? (entries[entries.length - 1] as { note?: string }).note
          : String(entries[entries.length - 1]))
      : undefined;

    return {
      id: (rec.id as string) || "",
      bucket: r.bucket,
      title,
      summary,
      score: r.score,
      lastNote,
      tags,
      nextActions,
    };
  });

  return {
    query,
    results,
    totalFound: filtered.length,
  };
}

// ============================================================================
// Formatting
// ============================================================================

/**
 * Format recall results for user-facing display.
 */
export function formatRecallResults(result: RecallResult): string {
  if (result.results.length === 0) {
    return `🔍 No results found for "${result.query}"`;
  }

  const lines: string[] = [
    `🧠 Found ${result.totalFound} result${result.totalFound !== 1 ? "s" : ""} for "${result.query}":\n`,
  ];

  for (const entry of result.results) {
    const scorePercent = Math.round(entry.score * 100);
    const header = `**${entry.title}** [${entry.bucket}] (${scorePercent}% match)`;
    lines.push(header);

    if (entry.summary) {
      lines.push(`  ${truncate(entry.summary, 120)}`);
    }

    if (entry.nextActions.length > 0) {
      lines.push(`  → ${entry.nextActions.slice(0, 2).join(", ")}`);
    }

    if (entry.tags.length > 0) {
      lines.push(`  🏷️ ${entry.tags.join(", ")}`);
    }

    lines.push(""); // blank line between entries
  }

  return lines.join("\n").trimEnd();
}

/**
 * Format recall results for system prompt injection (compact).
 */
export function formatRecallForContext(result: RecallResult): string {
  if (result.results.length === 0) return "";

  const lines = result.results.map((entry) => {
    const parts = [`[${entry.bucket}] ${entry.title}`];
    if (entry.summary) parts.push(truncate(entry.summary, 80));
    if (entry.nextActions.length > 0) parts.push(`Actions: ${entry.nextActions.slice(0, 2).join("; ")}`);
    return parts.join(" — ");
  });

  return lines.join("\n");
}

// ============================================================================
// Helpers
// ============================================================================

function safeParseArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "…";
}
