/**
 * Brain 2.0 -- Payment Transaction Recorder.
 *
 * Helper for recording successful payments into the spending state.
 * This should be called by the agent after wallet_send succeeds.
 */

import { 
  recordSpendingTransaction, 
  getSpendingStats,
  checkDailySpendingLimit,
  checkSpendingVelocity
} from "./spending-state.js";

/**
 * Record a successful payment for spending tracking.
 * Call this after wallet_send succeeds to update daily/velocity limits.
 * 
 * @param amount - Amount in DOGE
 * @param address - Recipient address
 * @param txid - Transaction ID from wallet_send
 * @param reason - Payment purpose/reason
 */
export function recordPayment(
  amount: number,
  address: string,
  txid: string,
  reason?: string
): void {
  try {
    recordSpendingTransaction(amount, address, txid, reason);
    console.log(`[brain] Recorded payment for spending tracking: ${amount} DOGE to ${address}`);
  } catch (err) {
    console.error(`[brain] Failed to record payment for spending tracking: ${err}`);
    // Don't throw - recording failure shouldn't break the payment flow
  }
}

/**
 * Get current spending status for display/debugging.
 * Returns a summary of daily and hourly spending limits.
 */
export function getSpendingSummary(): {
  daily: string;
  hourly: string;
  status: string;
} {
  try {
    const stats = getSpendingStats();
    
    return {
      daily: `${stats.dailySpent.toFixed(2)}/${stats.dailyLimit} DOGE (${stats.dailyRemaining.toFixed(2)} remaining)`,
      hourly: `${stats.hourlyCount}/${stats.hourlyLimit} payments (${stats.hourlyRemaining} remaining)`,
      status: stats.dailyRemaining <= 5 || stats.hourlyRemaining <= 1 ? "warning" : "ok"
    };
  } catch (err) {
    console.error(`[brain] Failed to get spending summary: ${err}`);
    return {
      daily: "Unknown",
      hourly: "Unknown",
      status: "error"
    };
  }
}

/**
 * Check if a payment would be allowed by spending guards.
 * This can be used for pre-checks before attempting wallet_send.
 * 
 * @param amount - Amount in DOGE to check
 * @returns Object with allowed status and blocking reason if any
 */
export function checkPaymentAllowed(amount: number): {
  allowed: boolean;
  reason?: string;
} {
  try {
    // Check daily limit
    const dailyCheck = checkDailySpendingLimit(amount);
    if (!dailyCheck.allowed) {
      return {
        allowed: false,
        reason: `Daily limit exceeded: ${dailyCheck.spent.toFixed(2)} + ${amount} > ${dailyCheck.limit} DOGE`
      };
    }
    
    // Check velocity
    const velocityCheck = checkSpendingVelocity();
    if (!velocityCheck.allowed) {
      return {
        allowed: false,
        reason: `Too many payments: ${velocityCheck.count} >= ${velocityCheck.limit} per hour`
      };
    }
    
    return { allowed: true };
  } catch (err) {
    console.error(`[brain] Failed to check payment allowed: ${err}`);
    // Be conservative - if we can't check, don't block
    return { allowed: true };
  }
}