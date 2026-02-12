/**
 * Brain 2.0 -- Shared Constants.
 */

/** Default Telegram chat ID for notifications. */
export const DEFAULT_CHAT_ID = "8511108690";

/** Maximum single payment amount in DOGE. */
export const MAX_PAYMENT_AMOUNT = 1000;

/** Daily spending limit in DOGE. */
export const DAILY_SPENDING_LIMIT = 50;

/** Maximum payments allowed per hour. */
export const MAX_PAYMENTS_PER_HOUR = 5;

/** Maximum payment requests allowed per hour. */
export const MAX_PAYMENT_REQUESTS_PER_HOUR = 10;

/** DOGE address regex (Base58, starts with D for P2PKH or 9/A for P2SH, 25-34 chars total). */
export const DOGE_ADDRESS_RE = /\b[DA9][1-9A-HJ-NP-Za-km-z]{24,33}\b/;
