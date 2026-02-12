/**
 * Brain 2.0 -- Payment Proposal Rate Limiting.
 *
 * Implements rate limiting specifically for payment proposals:
 * - Max 10 payment proposals per hour
 * - Tracks proposal timestamps in ~/.openclaw/brain/proposal-rate.json
 * - Integrates at the proposal stage (before evaluation)
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

// ============================================================================
// Types
// ============================================================================

export interface ProposalRateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  windowStart?: number;
}

export interface ProposalTimestamp {
  timestamp: number;
  action: "payment-proposal";
}

export interface ProposalRateLog {
  proposals: ProposalTimestamp[];
  lastCleanup?: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Maximum payment proposals per hour */
const MAX_PROPOSALS_PER_HOUR = 10;

/** Rate limiting window in milliseconds (1 hour) */
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

/** How often to cleanup old entries (every 10 minutes) */
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

// ============================================================================
// Core Implementation
// ============================================================================

/**
 * Get the path to the proposal rate limiting log file.
 */
function getProposalRateLogPath(): string {
  const homeDir = process.env.HOME || "/home/clawdbot";
  return `${homeDir}/.openclaw/brain/proposal-rate.json`;
}

/**
 * Read the current proposal rate log, creating it if it doesn't exist.
 */
function readProposalRateLog(logPath?: string): ProposalRateLog {
  const path = logPath || getProposalRateLogPath();
  
  try {
    const content = readFileSync(path, "utf8");
    const data = JSON.parse(content);
    
    // Ensure the structure is valid
    if (!data || typeof data !== "object" || !Array.isArray(data.proposals)) {
      console.warn("[brain] Invalid proposal rate log structure, creating new one");
      return { proposals: [] };
    }
    
    return data;
  } catch (err) {
    // File doesn't exist or is malformed, return empty log
    return { proposals: [] };
  }
}

/**
 * Write the proposal rate log to disk.
 */
function writeProposalRateLog(log: ProposalRateLog, logPath?: string): void {
  const path = logPath || getProposalRateLogPath();
  
  try {
    // Ensure directory exists
    mkdirSync(dirname(path), { recursive: true });
    
    // Write the log
    writeFileSync(path, JSON.stringify(log, null, 2));
  } catch (err) {
    console.error(`[brain] Failed to write proposal rate log: ${err}`);
    throw err;
  }
}

/**
 * Clean up old entries from the proposal log.
 * Removes entries older than the rate limiting window.
 */
function cleanupOldEntries(log: ProposalRateLog, now: number): ProposalRateLog {
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  
  const filteredProposals = log.proposals.filter(entry => {
    // Keep entries that are within the rate limiting window
    return entry.timestamp >= windowStart;
  });
  
  return {
    ...log,
    proposals: filteredProposals,
    lastCleanup: now,
  };
}

/**
 * Check if a payment proposal should be rate limited.
 * This function:
 * 1. Reads the current proposal rate log
 * 2. Cleans up old entries if needed
 * 3. Counts proposals in the current window
 * 4. Records this proposal if it's allowed
 * 5. Returns the rate limit result
 */
export function checkProposalRateLimit(logPath?: string): ProposalRateLimitResult {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  
  // Read current log
  let log = readProposalRateLog(logPath);
  
  // Clean up old entries if it's been a while
  const shouldCleanup = !log.lastCleanup || (now - log.lastCleanup) >= CLEANUP_INTERVAL_MS;
  if (shouldCleanup) {
    log = cleanupOldEntries(log, now);
  }
  
  // Count proposals in the current window
  const proposalsInWindow = log.proposals.filter(entry => entry.timestamp >= windowStart);
  const currentCount = proposalsInWindow.length;
  
  // Check if this proposal would exceed the limit
  const wouldExceed = currentCount >= MAX_PROPOSALS_PER_HOUR;
  
  // If allowed, record this proposal
  if (!wouldExceed) {
    const newEntry: ProposalTimestamp = {
      timestamp: now,
      action: "payment-proposal",
    };
    
    log.proposals.push(newEntry);
    
    try {
      writeProposalRateLog(log, logPath);
    } catch (err) {
      console.warn(`[brain] Failed to record proposal for rate limiting: ${err}`);
      // Don't fail the request just because we can't log it
    }
  }
  
  return {
    allowed: !wouldExceed,
    count: wouldExceed ? currentCount : currentCount + 1, // Include this proposal in count
    limit: MAX_PROPOSALS_PER_HOUR,
    windowStart,
  };
}

/**
 * Get current rate limit status without recording a new proposal.
 * Useful for monitoring and diagnostics.
 */
export function getProposalRateStatus(logPath?: string): ProposalRateLimitResult {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  
  // Read current log
  const log = readProposalRateLog(logPath);
  
  // Count proposals in the current window
  const proposalsInWindow = log.proposals.filter(entry => entry.timestamp >= windowStart);
  const currentCount = proposalsInWindow.length;
  
  return {
    allowed: currentCount < MAX_PROPOSALS_PER_HOUR,
    count: currentCount,
    limit: MAX_PROPOSALS_PER_HOUR,
    windowStart,
  };
}

/**
 * Reset the proposal rate limiting log.
 * Useful for testing and emergency resets.
 */
export function resetProposalRateLog(logPath?: string): void {
  const emptyLog: ProposalRateLog = { proposals: [] };
  writeProposalRateLog(emptyLog, logPath);
}