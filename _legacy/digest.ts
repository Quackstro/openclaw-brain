/**
 * Brain 2.0 — Digest Engine.
 *
 * Phase 2: Surface layer — gathers data from Brain stores and formats
 * into concise, actionable digests for delivery via Telegram.
 *
 * 5 digest types: morning, midday, afternoon, night, weekly.
 * Daily digests use template-based formatting (no LLM cost).
 * Weekly review optionally uses Sonnet for natural language.
 *
 * Design doc Section 5.7.
 */

import type { BrainStore } from "./store.js";
import { MAIN_BUCKETS, type MainBucket } from "./schemas.js";

// ============================================================================
// Digest types
// ============================================================================

export type DigestType = "morning" | "midday" | "afternoon" | "night" | "weekly";

export interface DigestData {
  type: DigestType;
  maxWords: number;
  bucketSummaries: BucketSummary[];
  overdueItems: OverdueItem[];
  stuckItems: StuckItem[];
  urgentItems: UrgentItem[];
  needsReviewCount: number;
  needsReviewItems: NeedsReviewItem[];
  recentActivity: ActivityItem[];
  timestamp: string;
  isEmpty: boolean;
}

export interface BucketSummary {
  bucket: string;
  totalCount: number;
  activeCount: number;
  overdueCount: number;
  stuckCount: number;
}

export interface OverdueItem {
  id: string;
  bucket: string;
  title: string;
  dueDate: string;
  nextAction?: string;
}

export interface StuckItem {
  id: string;
  bucket: string;
  title: string;
  stuckSince?: string;
  daysSinceUpdate: number;
  nextAction?: string;
}

export interface UrgentItem {
  id: string;
  bucket: string;
  title: string;
  urgency: string;
  nextAction?: string;
}

export interface NeedsReviewItem {
  id: string;
  title: string;
  suggestedBucket: string;
  ageHours: number;
}

export interface ActivityItem {
  id: string;
  bucket: string;
  title: string;
  date: string;
  action: string;
}

// ============================================================================
// Digest config (from design doc Section 5.7)
// ============================================================================

export const DIGEST_DEFAULTS: Record<DigestType, { maxWords: number }> = {
  morning: { maxWords: 150 },
  midday: { maxWords: 100 },
  afternoon: { maxWords: 120 },
  night: { maxWords: 100 },
  weekly: { maxWords: 250 },
};

// ============================================================================
// Helpers
// ============================================================================

/** Get today's date string in YYYY-MM-DD format (ET timezone). */
function getTodayET(): string {
  const now = new Date();
  return now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

/** Get a date N days ago in YYYY-MM-DD format. */
function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Parse a JSON string safely, returning a default on failure. */
function safeParseJSON<T>(s: unknown, fallback: T): T {
  if (typeof s !== "string") return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

/** Get the title/name label from a record. */
function getLabel(record: Record<string, unknown>): string {
  return (
    (record.title as string) ||
    (record.name as string) ||
    (record.id as string)?.slice(0, 8) ||
    "Untitled"
  );
}

/** Get the first next action from a record. */
function getFirstAction(record: Record<string, unknown>): string | undefined {
  const actions = safeParseJSON<string[]>(record.nextActions, []);
  return actions[0] || undefined;
}

/** Get the most recent entry date from a record. */
function getLatestEntryDate(record: Record<string, unknown>): string | null {
  const entries = safeParseJSON<Array<{ date: string; note: string }>>(
    record.entries,
    [],
  );
  if (entries.length === 0) return null;
  return entries[entries.length - 1].date;
}

/** Get the due/follow-up date from a record (different field names per bucket). */
function getDueDate(record: Record<string, unknown>): string | null {
  return (
    (record.dueDate as string) ||
    (record.followUpDate as string) ||
    null
  );
}

/** Count days between two date strings. */
function daysBetween(dateStr1: string, dateStr2: string): number {
  const d1 = new Date(dateStr1);
  const d2 = new Date(dateStr2);
  return Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

// ============================================================================
// Digest data gathering
// ============================================================================

/**
 * Gather data from Brain stores needed to generate a digest.
 *
 * Queries all 8 main bucket tables. For each bucket:
 * - Count records
 * - Find overdue items (followUpDate/dueDate < today)
 * - Find stuck items (no update > 3 days)
 * - Find urgent items (urgency "now" or "today")
 *
 * @param store - The BrainStore instance
 * @param type - The digest type
 * @returns DigestData for formatting
 */
export async function gatherDigestData(
  store: BrainStore,
  type: DigestType,
): Promise<DigestData> {
  const maxWords = DIGEST_DEFAULTS[type].maxWords;
  const today = getTodayET();
  const threeDaysAgo = daysAgo(3);
  const oneDayAgo = daysAgo(1);

  const bucketSummaries: BucketSummary[] = [];
  const overdueItems: OverdueItem[] = [];
  const stuckItems: StuckItem[] = [];
  const urgentItems: UrgentItem[] = [];
  const recentActivity: ActivityItem[] = [];

  let totalRecords = 0;

  // Gather from each main bucket
  for (const bucket of MAIN_BUCKETS) {
    let records: Record<string, unknown>[];
    try {
      records = await store.list(bucket);
    } catch {
      // Table might be empty or broken — skip gracefully
      bucketSummaries.push({
        bucket,
        totalCount: 0,
        activeCount: 0,
        overdueCount: 0,
        stuckCount: 0,
      });
      continue;
    }

    totalRecords += records.length;
    let overdueCount = 0;
    let stuckCount = 0;
    let activeCount = 0;

    for (const record of records) {
      const label = getLabel(record);
      const id = record.id as string;
      const firstAction = getFirstAction(record);
      const dueDate = getDueDate(record);
      const latestEntry = getLatestEntryDate(record);
      const status = record.status as string | undefined;

      // Skip completed/archived items
      if (status === "completed" || status === "achieved" || status === "archived") {
        continue;
      }
      activeCount++;

      // Check overdue: dueDate/followUpDate < today
      if (dueDate && dueDate < today && dueDate.length >= 10) {
        overdueCount++;
        overdueItems.push({
          id,
          bucket,
          title: label,
          dueDate,
          nextAction: firstAction,
        });
      }

      // Check stuck: no update in > 3 days
      if (latestEntry && latestEntry < threeDaysAgo) {
        stuckCount++;
        const daysSince = daysBetween(latestEntry, today);
        stuckItems.push({
          id,
          bucket,
          title: label,
          stuckSince: latestEntry,
          daysSinceUpdate: daysSince,
          nextAction: firstAction,
        });
      }

      // Check urgency fields (from classification metadata)
      // People records don't have urgency directly, but classified items
      // might have it in their entries/tags
      // For now, check if dueDate is today → urgent
      if (dueDate === today) {
        urgentItems.push({
          id,
          bucket,
          title: label,
          urgency: "today",
          nextAction: firstAction,
        });
      }

      // Collect recent activity (last 24h entries) for afternoon/night digests
      if (latestEntry && latestEntry >= oneDayAgo) {
        const entries = safeParseJSON<Array<{ date: string; note: string }>>(
          record.entries,
          [],
        );
        const recentEntries = entries.filter((e) => e.date >= oneDayAgo);
        for (const entry of recentEntries) {
          recentActivity.push({
            id,
            bucket,
            title: label,
            date: entry.date,
            action: entry.note.slice(0, 100),
          });
        }
      }
    }

    bucketSummaries.push({
      bucket,
      totalCount: records.length,
      activeCount,
      overdueCount,
      stuckCount,
    });
  }

  // Gather needs_review data
  let needsReviewCount = 0;
  const needsReviewItems: NeedsReviewItem[] = [];
  try {
    const reviews = await store.list("needs_review");
    needsReviewCount = reviews.length;
    const now = new Date();
    for (const r of reviews) {
      if (r.status === "pending") {
        const timestamp = r.timestamp as string;
        const ageMs = now.getTime() - new Date(timestamp).getTime();
        const ageHours = ageMs / (1000 * 60 * 60);
        needsReviewItems.push({
          id: r.id as string,
          title: (r.title as string) || (r.rawText as string)?.slice(0, 50) || "Untitled",
          suggestedBucket: r.suggestedBucket as string,
          ageHours,
        });
      }
    }
  } catch {
    // Table may not exist or be empty
  }

  // Sort for relevance
  overdueItems.sort((a, b) => a.dueDate.localeCompare(b.dueDate)); // Oldest overdue first
  stuckItems.sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate); // Most stuck first
  recentActivity.sort((a, b) => b.date.localeCompare(a.date)); // Most recent first

  const isEmpty = totalRecords === 0 && needsReviewCount === 0;

  return {
    type,
    maxWords,
    bucketSummaries,
    overdueItems,
    stuckItems,
    urgentItems,
    needsReviewCount,
    needsReviewItems,
    recentActivity,
    timestamp: new Date().toISOString(),
    isEmpty,
  };
}

// ============================================================================
// Template-based formatting (no LLM cost for daily digests)
// ============================================================================

/**
 * Format a digest using templates. No LLM needed.
 *
 * @param data - Gathered digest data
 * @param type - Digest type
 * @param maxWords - Maximum words (soft limit)
 * @returns Formatted digest string ready to send
 */
export function formatDigest(
  data: DigestData,
  type: DigestType,
  maxWords?: number,
): string {
  const limit = maxWords ?? DIGEST_DEFAULTS[type].maxWords;

  // If Brain is empty / warming up, return a gentle message
  if (data.isEmpty) {
    return "🧠 Brain is still warming up — no items tracked yet. Use /drop to start capturing thoughts.";
  }

  switch (type) {
    case "morning":
      return formatMorning(data, limit);
    case "midday":
      return formatMidday(data, limit);
    case "afternoon":
      return formatAfternoon(data, limit);
    case "night":
      return formatNight(data, limit);
    case "weekly":
      return formatWeekly(data, limit);
    default:
      return formatMorning(data, limit);
  }
}

// ============================================================================
// Morning digest: Top 3 actions for today, overdue items
// ============================================================================

function formatMorning(data: DigestData, maxWords: number): string {
  const lines: string[] = [];
  lines.push("☀️ *Morning Brief*");
  lines.push("");

  // Top actions: combine urgent + overdue, take top 3
  const topItems = [
    ...data.urgentItems.map((i) => ({
      label: `[${i.bucket}] ${i.title}`,
      action: i.nextAction,
      priority: 1,
    })),
    ...data.overdueItems.slice(0, 5).map((i) => ({
      label: `[${i.bucket}] ${i.title} (overdue: ${i.dueDate})`,
      action: i.nextAction,
      priority: 2,
    })),
  ];

  if (topItems.length > 0) {
    lines.push("🎯 *Today's Actions:*");
    for (const item of topItems.slice(0, 3)) {
      const action = item.action ? ` → ${item.action}` : "";
      lines.push(`  ${topItems.indexOf(item) + 1}. ${item.label}${action}`);
    }
  } else {
    lines.push("✅ No urgent actions today. You're clear.");
  }

  // Overdue summary
  if (data.overdueItems.length > 3) {
    lines.push("");
    lines.push(
      `⚠️ ${data.overdueItems.length} overdue items total — check Brain for details.`,
    );
  }

  // Needs review nudge (>24h old, mention once)
  const staleReviews = data.needsReviewItems.filter((r) => r.ageHours > 24);
  if (staleReviews.length > 0) {
    lines.push("");
    lines.push(`📋 ${staleReviews.length} item(s) waiting for your review.`);
  }

  return truncateToWords(lines.join("\n"), maxWords);
}

// ============================================================================
// Midday digest: Anything stuck? Items due today not started
// ============================================================================

function formatMidday(data: DigestData, maxWords: number): string {
  const lines: string[] = [];
  lines.push("🕐 *Midday Check*");
  lines.push("");

  // Items due today not started
  const todayItems = data.urgentItems;
  if (todayItems.length > 0) {
    lines.push("📌 *Due Today:*");
    for (const item of todayItems.slice(0, 3)) {
      const action = item.nextAction ? ` → ${item.nextAction}` : "";
      lines.push(`  • ${item.title}${action}`);
    }
    if (todayItems.length > 3) {
      lines.push(`  +${todayItems.length - 3} more`);
    }
  }

  // Stuck items
  const stuckTop = data.stuckItems.slice(0, 2);
  if (stuckTop.length > 0) {
    lines.push("");
    lines.push("🔴 *Stuck:*");
    for (const item of stuckTop) {
      lines.push(
        `  • ${item.title} — no update for ${item.daysSinceUpdate}d`,
      );
    }
  }

  if (todayItems.length === 0 && stuckTop.length === 0) {
    lines.push("👍 Nothing stuck. Keep the momentum going.");
  }

  return truncateToWords(lines.join("\n"), maxWords);
}

// ============================================================================
// Afternoon digest: What moved today, what carries to tomorrow
// ============================================================================

function formatAfternoon(data: DigestData, maxWords: number): string {
  const lines: string[] = [];
  lines.push("🌆 *Afternoon Wrap*");
  lines.push("");

  // What moved today (recent activity)
  if (data.recentActivity.length > 0) {
    lines.push("✅ *Moved Today:*");
    for (const item of data.recentActivity.slice(0, 3)) {
      lines.push(`  • ${item.title}: ${item.action}`);
    }
    if (data.recentActivity.length > 3) {
      lines.push(`  +${data.recentActivity.length - 3} more updates`);
    }
  } else {
    lines.push("📝 No recorded activity today. That's OK — rest is productive too.");
  }

  // Carries to tomorrow (overdue + urgent still open)
  const carries = [
    ...data.overdueItems.slice(0, 2),
    ...data.urgentItems
      .filter((u) => !data.overdueItems.find((o) => o.id === u.id))
      .slice(0, 2),
  ];

  if (carries.length > 0) {
    lines.push("");
    lines.push("📋 *Carries to Tomorrow:*");
    for (const item of carries.slice(0, 3)) {
      lines.push(`  • ${item.title}`);
    }
  }

  return truncateToWords(lines.join("\n"), maxWords);
}

// ============================================================================
// Night digest: Tomorrow's top priorities, pending follow-ups
// ============================================================================

function formatNight(data: DigestData, maxWords: number): string {
  const lines: string[] = [];
  lines.push("🌙 *Night Wind-down*");
  lines.push("");

  // Tomorrow's priorities (overdue + next due)
  const priorities = [
    ...data.overdueItems.slice(0, 2).map((i) => ({
      label: `${i.title} (overdue)`,
    })),
    ...data.urgentItems.slice(0, 2).map((i) => ({
      label: i.title,
    })),
  ];

  if (priorities.length > 0) {
    lines.push("🎯 *Tomorrow's Priorities:*");
    for (const p of priorities.slice(0, 3)) {
      lines.push(`  ${priorities.indexOf(p) + 1}. ${p.label}`);
    }
  } else {
    lines.push("✨ No pressing items for tomorrow. Rest well.");
  }

  // Pending follow-ups
  const followUps = data.overdueItems.filter(
    (i) => i.bucket === "people",
  );
  if (followUps.length > 0) {
    lines.push("");
    lines.push("📞 *Pending Follow-ups:*");
    for (const f of followUps.slice(0, 2)) {
      lines.push(`  • ${f.title} (since ${f.dueDate})`);
    }
  }

  return truncateToWords(lines.join("\n"), maxWords);
}

// ============================================================================
// Weekly digest: Bucket health + focus + stuck + wins
// ============================================================================

function formatWeekly(data: DigestData, maxWords: number): string {
  const lines: string[] = [];
  lines.push("📊 *BUCKET HEALTH*");

  // Build bucket health line for each bucket
  const healthLines: string[] = [];
  for (const s of data.bucketSummaries) {
    const label = capitalize(s.bucket);
    const parts: string[] = [];

    if (s.overdueCount > 0) {
      const desc =
        s.bucket === "people"
          ? "overdue follow-ups"
          : s.bucket === "projects"
            ? "stuck"
            : s.bucket === "ideas"
              ? "parked"
              : s.bucket === "goals"
                ? "milestone due"
                : s.bucket === "health"
                  ? "appointment"
                  : s.bucket === "finance"
                    ? "bills due"
                    : "overdue";
      parts.push(`${s.overdueCount} ${desc}`);
    } else if (s.stuckCount > 0) {
      parts.push(`${s.stuckCount} stuck`);
    } else {
      parts.push(`${s.activeCount} active`);
    }

    healthLines.push(`${label}: ${parts.join(" · ")}`);
  }

  // Add needs_review
  healthLines.push(`Needs Review: ${data.needsReviewCount} pending`);

  lines.push(healthLines.join(" · "));
  lines.push("");

  // This week's focus (top 3 actions)
  lines.push("🎯 *THIS WEEK'S FOCUS*");
  const focusItems = [
    ...data.overdueItems.slice(0, 2),
    ...data.urgentItems
      .filter((u) => !data.overdueItems.find((o) => o.id === u.id))
      .slice(0, 2),
  ].slice(0, 3);

  if (focusItems.length > 0) {
    focusItems.forEach((item, i) => {
      const action = item.nextAction ? ` — ${item.nextAction}` : "";
      lines.push(`${i + 1}. ${item.title}${action}`);
    });
  } else {
    lines.push("No pressing items this week. Use the time to review and plan.");
  }

  // Stuck items
  const stuckTop = data.stuckItems.slice(0, 3);
  if (stuckTop.length > 0) {
    lines.push("");
    lines.push("🔴 *STUCK (needs unblocking)*");
    for (const item of stuckTop) {
      const since = item.stuckSince ? ` since ${item.stuckSince.slice(0, 10)}` : "";
      const action = item.nextAction ? `: ${item.nextAction}` : "";
      lines.push(`- [${capitalize(item.bucket)}] ${item.title} blocked${since}${action}`);
    }
  }

  // Wins (recent activity as proxy for "what moved")
  if (data.recentActivity.length > 0) {
    lines.push("");
    lines.push("✅ *WINS LAST WEEK*");
    for (const item of data.recentActivity.slice(0, 3)) {
      lines.push(`- ${item.title}: ${item.action}`);
    }
  }

  return truncateToWords(lines.join("\n"), maxWords);
}

// ============================================================================
// Reactive nudges
// ============================================================================

export interface NudgeItem {
  type: "follow-up" | "stuck" | "needs-review";
  message: string;
  itemId: string;
  bucket: string;
}

/**
 * Generate reactive nudges from digest data.
 * These get included in the next digest — not sent separately.
 *
 * - Follow-up dates hitting today → reminder
 * - Items stuck > 3 days with no update → 🔴 mention
 * - Needs-review items > 24h old → gentle mention (once)
 */
export function generateNudges(data: DigestData): NudgeItem[] {
  const nudges: NudgeItem[] = [];

  // Follow-up reminders (overdue people items)
  for (const item of data.overdueItems) {
    if (item.bucket === "people") {
      nudges.push({
        type: "follow-up",
        message: `Reminder: follow up with ${item.title} about ${item.nextAction ?? "pending item"}`,
        itemId: item.id,
        bucket: item.bucket,
      });
    }
  }

  // Stuck items (> 3 days)
  for (const item of data.stuckItems.filter((s) => s.daysSinceUpdate > 3)) {
    nudges.push({
      type: "stuck",
      message: `🔴 ${item.title} has been stuck for ${item.daysSinceUpdate} days. Next action: ${item.nextAction ?? "needs attention"}`,
      itemId: item.id,
      bucket: item.bucket,
    });
  }

  // Needs-review items > 24h old
  for (const item of data.needsReviewItems.filter((r) => r.ageHours > 24)) {
    nudges.push({
      type: "needs-review",
      message: `📋 "${item.title}" needs your review (suggested: ${item.suggestedBucket})`,
      itemId: item.id,
      bucket: "needs_review",
    });
  }

  return nudges;
}

// ============================================================================
// Utility
// ============================================================================

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Truncate text to roughly maxWords. Doesn't break mid-word.
 * Soft limit — prioritizes readability over exact count.
 */
function truncateToWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;

  // Find the line break nearest to the word limit
  const truncated = words.slice(0, maxWords).join(" ");
  // Try to end at a newline for cleaner output
  const lastNewline = truncated.lastIndexOf("\n");
  if (lastNewline > truncated.length * 0.7) {
    return truncated.slice(0, lastNewline) + "\n…";
  }
  return truncated + "…";
}
