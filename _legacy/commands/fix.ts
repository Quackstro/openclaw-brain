/**
 * Brain 2.0 — /fix command handler.
 *
 * Corrections supported (from design doc Section 5.8):
 *   /fix <id> → people          Move item to a bucket
 *   /fix <id> → trash           Delete item entirely
 *   /fix <id> action: "..."     Update next action
 *   /fix <id> merge <other-id>  Merge two items
 *   /fix <id>                   Show item details + options
 */

import type { BrainStore } from "../store.js";
import { ALL_TABLES, MAIN_BUCKETS, type EmbeddingProvider, type TableName } from "../schemas.js";
import { logAudit } from "../audit.js";
import { bucketToTable } from "../classifier.js";

// ============================================================================
// Types
// ============================================================================

export interface FixResult {
  success: boolean;
  message: string;
  action?: string;
  itemId?: string;
}

type FixAction =
  | { type: "move"; target: string }
  | { type: "trash" }
  | { type: "action"; text: string }
  | { type: "merge"; otherId: string }
  | { type: "show" }
  | { type: "unknown"; raw: string };

// ============================================================================
// Helpers
// ============================================================================

/**
 * Find an item by ID across all non-audit tables.
 */
async function findItem(
  store: BrainStore,
  id: string,
): Promise<{ table: TableName; record: Record<string, unknown> } | null> {
  for (const table of ALL_TABLES) {
    if (table === "audit_trail") continue;
    try {
      const record = await store.get(table, id);
      if (record) return { table, record };
    } catch {
      // skip broken/empty tables
    }
  }
  return null;
}

/**
 * Parse the correction string into a structured action.
 */
function parseCorrection(correction: string): FixAction {
  const trimmed = correction.trim();

  // → <bucket> or -> <bucket>
  const moveMatch = trimmed.match(/^(?:→|->)\s*(.+)$/);
  if (moveMatch) {
    const target = moveMatch[1].trim().toLowerCase();
    if (target === "trash") return { type: "trash" };
    return { type: "move", target };
  }

  // action: "..." or action: ...
  const actionMatch = trimmed.match(/^action:\s*"?(.+?)"?\s*$/);
  if (actionMatch) {
    return { type: "action", text: actionMatch[1] };
  }

  // merge <other-id>
  const mergeMatch = trimmed.match(/^merge\s+(\S+)/i);
  if (mergeMatch) {
    return { type: "merge", otherId: mergeMatch[1] };
  }

  return { type: "unknown", raw: trimmed };
}

/**
 * Format a record for human-readable display.
 */
function formatRecord(table: string, record: Record<string, unknown>): string {
  const lines: string[] = [];
  const label =
    (record.title as string) ||
    (record.name as string) ||
    (record.id as string);

  lines.push(`📋 *${label}*`);
  lines.push(`  Bucket: ${table}`);
  lines.push(`  ID: ${record.id}`);

  for (const [key, value] of Object.entries(record)) {
    if (key === "vector" || key === "id") continue;
    if (value === "" || value === null || value === undefined) continue;

    // Pretty-print JSON array strings
    if (typeof value === "string" && value.startsWith("[")) {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed) && parsed.length > 0) {
          lines.push(`  ${key}: ${JSON.stringify(parsed)}`);
        }
        continue;
      } catch {
        // not JSON — fall through
      }
    }

    if (typeof value === "string" && value.length > 200) {
      lines.push(`  ${key}: ${value.slice(0, 200)}…`);
    } else if (Array.isArray(value)) {
      if (value.length < 50) {
        lines.push(`  ${key}: ${JSON.stringify(value)}`);
      }
    } else {
      lines.push(`  ${key}: ${value}`);
    }
  }

  lines.push("");
  lines.push("*Available fixes:*");
  lines.push("  → <bucket>  — move to another bucket");
  lines.push("  → trash     — delete permanently");
  lines.push('  action: "…" — update next action');
  lines.push("  merge <id>  — merge with another item");

  return lines.join("\n");
}

/**
 * Safely parse a JSON array string, returning [] on failure.
 */
function safeParseArray<T>(s: unknown): T[] {
  if (typeof s !== "string") return [];
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ============================================================================
// Main handler
// ============================================================================

/**
 * Handle a /fix command.
 *
 * @param store - BrainStore instance
 * @param id - The item ID to fix
 * @param correction - Optional fix syntax string
 * @param embedder - Optional embedding provider (for re-embedding on move)
 */
export async function handleFix(
  store: BrainStore,
  id: string,
  correction?: string,
  embedder?: EmbeddingProvider,
): Promise<FixResult> {
  // Find the item across all tables
  const found = await findItem(store, id);
  if (!found) {
    return {
      success: false,
      message: `❌ Item not found: ${id}`,
      itemId: id,
    };
  }

  const { table: sourceTable, record } = found;

  // No correction → show details
  if (!correction || correction.trim() === "") {
    return {
      success: true,
      message: formatRecord(sourceTable, record),
      action: "show",
      itemId: id,
    };
  }

  const action = parseCorrection(correction);

  switch (action.type) {
    // ------------------------------------------------------------------
    // Move to another bucket
    // ------------------------------------------------------------------
    case "move": {
      const targetBucket = bucketToTable(action.target);
      if (!targetBucket) {
        return {
          success: false,
          message: `❌ Unknown bucket: "${action.target}". Valid: ${MAIN_BUCKETS.join(", ")}`,
          itemId: id,
        };
      }

      if (targetBucket === sourceTable) {
        return {
          success: false,
          message: `⚠️ Item is already in ${sourceTable}.`,
          itemId: id,
        };
      }

      // Copy record data (strip id so a new one is generated)
      let data: Record<string, unknown>;
      if (sourceTable === "inbox") {
        // Inbox records have a different schema (rawText, source, status).
        // Transform to the target bucket's expected schema.
        const rawText = (record.rawText as string) || "";
        const now = new Date().toISOString();
        const emptyActions = "[]";
        const emptyTags = "[]";
        const entryNote = JSON.stringify([{ date: now, note: rawText }]);
        const base = { nextActions: emptyActions, entries: entryNote, tags: emptyTags };
        const targetBucketName = action.target as string;
        switch (targetBucketName) {
          case "people":
            data = { ...base, name: rawText.slice(0, 120), context: rawText, company: "", contactInfo: "", followUpDate: "", lastInteraction: now.split("T")[0] };
            break;
          case "projects":
            data = { ...base, name: rawText.slice(0, 120), description: rawText, status: "active", blockers: "[]", relatedPeople: "[]", dueDate: "" };
            break;
          case "ideas":
            data = { ...base, title: rawText.slice(0, 120), description: rawText, potential: "explore", relatedTo: "[]" };
            break;
          case "admin":
            data = { ...base, title: rawText.slice(0, 120), category: "task", dueDate: "", recurring: "" };
            break;
          case "documents":
            data = { ...base, title: rawText.slice(0, 120), summary: rawText, sourceUrl: "", filePath: "", relatedTo: "[]" };
            break;
          case "goals":
            data = { ...base, title: rawText.slice(0, 120), description: rawText, timeframe: "medium", status: "active", milestones: "[]", relatedProjects: "[]" };
            break;
          case "health":
            data = { ...base, title: rawText.slice(0, 120), category: "general", description: rawText, provider: "", followUpDate: "" };
            break;
          case "finance":
            data = { ...base, title: rawText.slice(0, 120), category: "other", amount: "", currency: "", dueDate: "", recurring: "" };
            break;
          default:
            data = { ...base, title: rawText.slice(0, 120), description: rawText };
        }
      } else {
        data = { ...record };
        delete data.id;
      }

      // Re-embed if an embedder is available
      if (embedder) {
        const label =
          (record.title as string) ||
          (record.name as string) ||
          "";
        const summary =
          (record.summary as string) ||
          (record.context as string) ||
          (record.description as string) ||
          "";
        const embText = `${label} ${summary}`.trim();
        if (embText) {
          try {
            data.vector = await embedder.embed(embText);
          } catch {
            // keep existing vector on embed failure
          }
        }
      }

      // Delete from source, create in destination
      await store.delete(sourceTable, id);
      const created = await store.create(targetBucket, data);

      await logAudit(store, {
        action: "fixed",
        inputId: id,
        outputId: created.id as string,
        bucket: targetBucket,
        details: `Moved from ${sourceTable} → ${targetBucket}`,
      });

      const label =
        (record.title as string) ||
        (record.name as string) ||
        id.slice(0, 8);
      return {
        success: true,
        message: `✅ Moved "${label}" from ${sourceTable} → ${targetBucket} (new ID: ${(created.id as string).slice(0, 8)})`,
        action: "move",
        itemId: created.id as string,
      };
    }

    // ------------------------------------------------------------------
    // Delete (trash)
    // ------------------------------------------------------------------
    case "trash": {
      const label =
        (record.title as string) ||
        (record.name as string) ||
        id.slice(0, 8);

      await store.delete(sourceTable, id);

      await logAudit(store, {
        action: "fixed",
        inputId: id,
        bucket: sourceTable,
        details: `Deleted from ${sourceTable} (trashed)`,
      });

      return {
        success: true,
        message: `🗑️ Deleted "${label}" from ${sourceTable}.`,
        action: "trash",
        itemId: id,
      };
    }

    // ------------------------------------------------------------------
    // Update next action
    // ------------------------------------------------------------------
    case "action": {
      const existingActions = safeParseArray<string>(record.nextActions);
      const updatedActions = [action.text, ...existingActions];
      const unique = [...new Set(updatedActions)];

      await store.update(sourceTable, id, {
        nextActions: JSON.stringify(unique),
      });

      await logAudit(store, {
        action: "fixed",
        inputId: id,
        bucket: sourceTable,
        details: `Updated next action: "${action.text}"`,
      });

      const label =
        (record.title as string) ||
        (record.name as string) ||
        id.slice(0, 8);
      return {
        success: true,
        message: `✅ Updated next action for "${label}": ${action.text}`,
        action: "action",
        itemId: id,
      };
    }

    // ------------------------------------------------------------------
    // Merge two items
    // ------------------------------------------------------------------
    case "merge": {
      const other = await findItem(store, action.otherId);
      if (!other) {
        return {
          success: false,
          message: `❌ Merge target not found: ${action.otherId}`,
          itemId: id,
        };
      }

      // Combine entries arrays
      const primaryEntries = safeParseArray<{ date: string; note: string }>(
        record.entries,
      );
      const otherEntries = safeParseArray<{ date: string; note: string }>(
        other.record.entries,
      );
      const mergedEntries = [...primaryEntries, ...otherEntries];
      mergedEntries.sort((a, b) => a.date.localeCompare(b.date));

      // Combine nextActions (dedup)
      const primaryActions = safeParseArray<string>(record.nextActions);
      const otherActions = safeParseArray<string>(other.record.nextActions);
      const mergedActions = [...new Set([...primaryActions, ...otherActions])];

      // Combine tags (dedup)
      const primaryTags = safeParseArray<string>(record.tags);
      const otherTags = safeParseArray<string>(other.record.tags);
      const mergedTags = [...new Set([...primaryTags, ...otherTags])];

      // Update primary, delete secondary
      await store.update(sourceTable, id, {
        entries: JSON.stringify(mergedEntries),
        nextActions: JSON.stringify(mergedActions),
        tags: JSON.stringify(mergedTags),
      });

      await store.delete(other.table, action.otherId);

      await logAudit(store, {
        action: "merged",
        inputId: id,
        outputId: action.otherId,
        bucket: sourceTable,
        details: `Merged ${action.otherId} (from ${other.table}) into ${id} (in ${sourceTable}). Combined ${mergedEntries.length} entries, ${mergedActions.length} actions.`,
      });

      const label =
        (record.title as string) ||
        (record.name as string) ||
        id.slice(0, 8);
      const otherLabel =
        (other.record.title as string) ||
        (other.record.name as string) ||
        action.otherId.slice(0, 8);
      return {
        success: true,
        message: `✅ Merged "${otherLabel}" into "${label}". Combined ${mergedEntries.length} entries, ${mergedActions.length} actions. Secondary item deleted.`,
        action: "merge",
        itemId: id,
      };
    }

    // ------------------------------------------------------------------
    // Unknown fix syntax
    // ------------------------------------------------------------------
    case "unknown":
    default:
      return {
        success: false,
        message:
          `❓ Unrecognized fix syntax: "${(action as any).raw ?? correction}"\n\n` +
          "Valid:\n" +
          "  → <bucket>  — move\n" +
          "  → trash     — delete\n" +
          '  action: "…" — update action\n' +
          "  merge <id>  — merge items",
        itemId: id,
      };
  }
}
