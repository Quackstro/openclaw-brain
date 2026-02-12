/**
 * Brain 2.0 -- Spending State Management.
 *
 * Implements dedicated spending state tracking with JSON persistence
 * as required for daily limits and velocity checks.
 */

import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";

// ============================================================================
// Types
// ============================================================================

export interface SpendingTransaction {
  /** Timestamp of the transaction (ISO 8601) */
  timestamp: string;
  /** Amount in DOGE */
  amount: number;
  /** Recipient address */
  address: string;
  /** Transaction ID (if known) */
  txid?: string;
  /** Reason/purpose of payment */
  reason?: string;
}

export interface SpendingState {
  /** Version for future schema migrations */
  version: number;
  /** Last updated timestamp (ISO 8601) */
  lastUpdated: string;
  /** Array of spending transactions */
  transactions: SpendingTransaction[];
}

export interface DailyLimitResult {
  allowed: boolean;
  spent: number;
  limit: number;
}

export interface VelocityResult {
  allowed: boolean;
  count: number;
  limit: number;
}

// ============================================================================
// Constants
// ============================================================================

const SPENDING_STATE_PATH = `${process.env.HOME || "/home/clawdbot"}/.openclaw/brain/spending-state.json`;
const DAILY_SPENDING_LIMIT = 50; // DOGE
const MAX_PAYMENTS_PER_HOUR = 5;

// ============================================================================
// State Management
// ============================================================================

/**
 * Load the current spending state from the JSON file.
 * Creates an empty state if the file doesn't exist.
 */
function loadSpendingState(): SpendingState {
  try {
    const content = readFileSync(SPENDING_STATE_PATH, "utf8");
    const state = JSON.parse(content) as SpendingState;
    
    // Validate schema
    if (!state.version || !state.transactions || !Array.isArray(state.transactions)) {
      console.warn(`[brain] Invalid spending state schema, resetting`);
      return createEmptyState();
    }
    
    return state;
  } catch (err) {
    if ((err as any)?.code === 'ENOENT') {
      // File doesn't exist, create empty state
      return createEmptyState();
    } else {
      console.warn(`[brain] Failed to load spending state: ${err}, resetting`);
      return createEmptyState();
    }
  }
}

/**
 * Save the spending state to the JSON file.
 */
function saveSpendingState(state: SpendingState): void {
  try {
    // Ensure directory exists
    mkdirSync(dirname(SPENDING_STATE_PATH), { recursive: true });
    
    // Update timestamp
    state.lastUpdated = new Date().toISOString();
    
    // Write atomically by writing to temp file then renaming
    const tempPath = SPENDING_STATE_PATH + '.tmp';
    writeFileSync(tempPath, JSON.stringify(state, null, 2));
    
    // Atomic rename (on Unix systems)
    renameSync(tempPath, SPENDING_STATE_PATH);
    
    console.log(`[brain] Spending state saved with ${state.transactions.length} transactions`);
  } catch (err) {
    console.error(`[brain] Failed to save spending state: ${err}`);
    throw err;
  }
}

/**
 * Create an empty spending state.
 */
function createEmptyState(): SpendingState {
  return {
    version: 1,
    lastUpdated: new Date().toISOString(),
    transactions: [],
  };
}

/**
 * Clean old transactions from the state to prevent it from growing indefinitely.
 * Removes transactions older than 7 days.
 */
function cleanOldTransactions(state: SpendingState): SpendingState {
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  
  const filteredTransactions = state.transactions.filter(tx => {
    const txTime = new Date(tx.timestamp).getTime();
    return txTime >= sevenDaysAgo;
  });
  
  const removedCount = state.transactions.length - filteredTransactions.length;
  if (removedCount > 0) {
    console.log(`[brain] Cleaned ${removedCount} old transactions (>7 days)`);
  }
  
  return {
    ...state,
    transactions: filteredTransactions,
  };
}

// ============================================================================
// Daily Spending Limit Check
// ============================================================================

/**
 * Check if the amount would exceed the daily spending limit.
 * Tracks spending using the dedicated spending state JSON file.
 * 
 * @param amount - Amount in DOGE to check
 * @returns Daily limit check result
 */
export function checkDailySpendingLimit(amount: number): DailyLimitResult {
  const state = loadSpendingState();
  
  let spent = 0;
  const now = Date.now();
  const oneDayAgo = now - (24 * 60 * 60 * 1000);

  // Sum all transactions in the last 24 hours
  for (const tx of state.transactions) {
    const txTime = new Date(tx.timestamp).getTime();
    
    if (txTime >= oneDayAgo) {
      spent += tx.amount;
    }
  }

  const wouldExceed = (spent + amount) > DAILY_SPENDING_LIMIT;
  
  return {
    allowed: !wouldExceed,
    spent,
    limit: DAILY_SPENDING_LIMIT,
  };
}

// ============================================================================
// Velocity Check (Payments Per Hour)
// ============================================================================

/**
 * Check if we've exceeded the maximum payments per hour.
 * Tracks velocity using the dedicated spending state JSON file.
 * 
 * @returns Velocity check result
 */
export function checkSpendingVelocity(): VelocityResult {
  const state = loadSpendingState();
  
  let count = 0;
  const now = Date.now();
  const oneHourAgo = now - (60 * 60 * 1000);

  // Count all transactions in the last hour
  for (const tx of state.transactions) {
    const txTime = new Date(tx.timestamp).getTime();
    
    if (txTime >= oneHourAgo) {
      count++;
    }
  }

  const wouldExceed = count >= MAX_PAYMENTS_PER_HOUR;
  
  return {
    allowed: !wouldExceed,
    count,
    limit: MAX_PAYMENTS_PER_HOUR,
  };
}

// ============================================================================
// Transaction Recording
// ============================================================================

/**
 * Record a spending transaction in the state file.
 * This should be called after a successful payment.
 * 
 * @param amount - Amount in DOGE
 * @param address - Recipient address
 * @param txid - Transaction ID (if known)
 * @param reason - Payment reason/purpose
 */
export function recordSpendingTransaction(
  amount: number,
  address: string,
  txid?: string,
  reason?: string
): void {
  let state = loadSpendingState();
  
  // Clean old transactions before adding new one
  state = cleanOldTransactions(state);
  
  // Add new transaction
  const transaction: SpendingTransaction = {
    timestamp: new Date().toISOString(),
    amount,
    address,
    txid,
    reason,
  };
  
  state.transactions.push(transaction);
  
  // Save updated state
  saveSpendingState(state);
  
  console.log(`[brain] Recorded spending: ${amount} DOGE to ${address}${txid ? ` (${txid})` : ''}`);
}

// ============================================================================
// State Inspection (for debugging/testing)
// ============================================================================

/**
 * Get the current spending state for inspection.
 * Used for debugging and testing.
 */
export function getSpendingState(): SpendingState {
  return loadSpendingState();
}

/**
 * Reset the spending state (clear all transactions).
 * Use with caution - mainly for testing.
 */
export function resetSpendingState(): void {
  const emptyState = createEmptyState();
  saveSpendingState(emptyState);
  console.log(`[brain] Spending state reset`);
}

/**
 * Get spending statistics for the current day and hour.
 * Useful for status reports and debugging.
 */
export function getSpendingStats(): {
  dailySpent: number;
  dailyLimit: number;
  dailyRemaining: number;
  hourlyCount: number;
  hourlyLimit: number;
  hourlyRemaining: number;
  transactionCount: number;
} {
  const state = loadSpendingState();
  
  const now = Date.now();
  const oneDayAgo = now - (24 * 60 * 60 * 1000);
  const oneHourAgo = now - (60 * 60 * 1000);
  
  let dailySpent = 0;
  let hourlyCount = 0;
  
  for (const tx of state.transactions) {
    const txTime = new Date(tx.timestamp).getTime();
    
    if (txTime >= oneDayAgo) {
      dailySpent += tx.amount;
    }
    
    if (txTime >= oneHourAgo) {
      hourlyCount++;
    }
  }
  
  return {
    dailySpent,
    dailyLimit: DAILY_SPENDING_LIMIT,
    dailyRemaining: Math.max(0, DAILY_SPENDING_LIMIT - dailySpent),
    hourlyCount,
    hourlyLimit: MAX_PAYMENTS_PER_HOUR,
    hourlyRemaining: Math.max(0, MAX_PAYMENTS_PER_HOUR - hourlyCount),
    transactionCount: state.transactions.length,
  };
}