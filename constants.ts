/**
 * Brain 2.0 -- Shared Constants.
 */

/** Default Telegram chat ID for notifications. */
export const DEFAULT_CHAT_ID = "8511108690";

/** Maximum single payment amount in DOGE. */
export const MAX_PAYMENT_AMOUNT = 1000;

/** DOGE address regex (Base58, starts with D, 25-34 chars total). */
export const DOGE_ADDRESS_RE = /\bD[1-9A-HJ-NP-Za-km-z]{24,33}\b/;
