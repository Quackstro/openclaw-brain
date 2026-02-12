/**
 * Brain 2.0 — DND (Do Not Disturb) System.
 *
 * Phase 2: Surface layer — controls when digests/nudges are sent.
 *
 * Features:
 * - Auto-quiet hours: 10PM–7AM ET (configurable)
 * - Manual override: /dnd on / /dnd off
 * - DND state persisted to ~/.openclaw/brain/dnd-state.json
 * - Recovery: when DND ends, generates ONE summary (not a flood)
 */

import fs from "node:fs/promises";
import path from "node:path";
import { homedir } from "node:os";

// ============================================================================
// Types
// ============================================================================

export interface DndState {
  manualDnd: boolean;
  manualDndSince?: string; // ISO 8601
  /** Digests that were skipped during DND (type + timestamp) */
  skippedDigests: Array<{ type: string; timestamp: string }>;
}

export interface DndCheckResult {
  quiet: boolean;
  reason: string;
}

export interface DndConfig {
  autoQuiet: {
    enabled: boolean;
    from: string; // "22:00" (10 PM)
    to: string; // "07:00" (7 AM)
  };
  timezone: string; // "America/New_York"
}

// ============================================================================
// Default config
// ============================================================================

export const DEFAULT_DND_CONFIG: DndConfig = {
  autoQuiet: {
    enabled: true,
    from: "02:00",
    to: "06:00",
  },
  timezone: "America/New_York",
};

// ============================================================================
// State file path
// ============================================================================

const DND_STATE_PATH = path.join(
  homedir(),
  ".openclaw",
  "brain",
  "dnd-state.json",
);

// ============================================================================
// State management
// ============================================================================

/**
 * Load DND state from disk.
 */
export async function loadDndState(): Promise<DndState> {
  try {
    const raw = await fs.readFile(DND_STATE_PATH, "utf-8");
    return JSON.parse(raw) as DndState;
  } catch {
    return { manualDnd: false, skippedDigests: [] };
  }
}

/**
 * Save DND state to disk.
 */
export async function saveDndState(state: DndState): Promise<void> {
  await fs.mkdir(path.dirname(DND_STATE_PATH), { recursive: true });
  await fs.writeFile(DND_STATE_PATH, JSON.stringify(state, null, 2));
}

// ============================================================================
// DND check
// ============================================================================

/**
 * Get the current time in the configured timezone.
 * Returns { hours, minutes } in 24h format.
 */
export function getNowInTimezone(timezone: string): { hours: number; minutes: number } {
  const now = new Date();
  const formatted = now.toLocaleString("en-US", {
    timeZone: timezone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  // formatted is like "14:30" or "09:05"
  const [h, m] = formatted.split(":").map(Number);
  return { hours: h, minutes: m };
}

/**
 * Check if the current time falls within auto-quiet hours.
 *
 * Handles the wrap-around case (e.g., 22:00 to 07:00 crosses midnight).
 */
export function isInQuietHours(
  config: DndConfig,
  nowOverride?: { hours: number; minutes: number },
): boolean {
  if (!config.autoQuiet.enabled) return false;

  const now = nowOverride ?? getNowInTimezone(config.timezone);
  const currentMinutes = now.hours * 60 + now.minutes;

  const [fromH, fromM] = config.autoQuiet.from.split(":").map(Number);
  const [toH, toM] = config.autoQuiet.to.split(":").map(Number);
  const fromMinutes = fromH * 60 + fromM;
  const toMinutes = toH * 60 + toM;

  if (fromMinutes <= toMinutes) {
    // Simple range (e.g., 08:00 to 17:00)
    return currentMinutes >= fromMinutes && currentMinutes < toMinutes;
  } else {
    // Wraps midnight (e.g., 22:00 to 07:00)
    return currentMinutes >= fromMinutes || currentMinutes < toMinutes;
  }
}

/**
 * Check whether DND is currently active (either manual or auto-quiet).
 *
 * Priority:
 * - Manual DND ON → always quiet (overrides auto-quiet OFF period)
 * - Manual DND OFF → normal schedule applies
 * - No manual override → auto-quiet hours apply
 */
export async function checkDnd(
  config: DndConfig = DEFAULT_DND_CONFIG,
  nowOverride?: { hours: number; minutes: number },
): Promise<DndCheckResult> {
  const state = await loadDndState();

  // Manual override takes priority
  if (state.manualDnd) {
    return {
      quiet: true,
      reason: `Manual DND active since ${state.manualDndSince ?? "unknown"}`,
    };
  }

  // Check auto-quiet hours
  if (isInQuietHours(config, nowOverride)) {
    return {
      quiet: true,
      reason: `Auto-quiet hours (${config.autoQuiet.from}–${config.autoQuiet.to} ${config.timezone})`,
    };
  }

  return {
    quiet: false,
    reason: "Not in DND",
  };
}

// ============================================================================
// DND toggle
// ============================================================================

/**
 * Turn manual DND on or off.
 *
 * @param on - true to enable DND, false to disable
 * @returns The new DND state + any recovery data
 */
export async function toggleDnd(
  on: boolean,
): Promise<{ state: DndState; recovery?: string }> {
  const state = await loadDndState();

  if (on) {
    state.manualDnd = true;
    state.manualDndSince = new Date().toISOString();
    state.skippedDigests = []; // Reset skipped list
    await saveDndState(state);
    return { state };
  } else {
    // Turning DND off — check if we need recovery
    const skipped = state.skippedDigests;
    state.manualDnd = false;
    state.manualDndSince = undefined;
    state.skippedDigests = [];
    await saveDndState(state);

    let recovery: string | undefined;
    if (skipped.length > 0) {
      const types = [...new Set(skipped.map((s) => s.type))];
      recovery = `While DND was active, ${skipped.length} digest(s) were skipped: ${types.join(", ")}. Generating a catch-up summary.`;
    }

    return { state, recovery };
  }
}

/**
 * Record that a digest was skipped due to DND.
 * Used so we can generate a recovery summary when DND ends.
 */
export async function recordSkippedDigest(type: string): Promise<void> {
  const state = await loadDndState();
  state.skippedDigests.push({
    type,
    timestamp: new Date().toISOString(),
  });
  await saveDndState(state);
}
