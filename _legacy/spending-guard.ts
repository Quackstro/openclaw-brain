/**
 * Brain 2.0 -- Payment Spending Guards.
 *
 * Implements payment pipeline hardening measures:
 * 1. Daily spending limits + velocity checks
 * 2. Duplicate/replay payment protection
 * 3. Base58Check address validation
 * 4. Rate limiting on payment requests
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { DAILY_SPENDING_LIMIT, MAX_PAYMENTS_PER_HOUR, MAX_PAYMENT_REQUESTS_PER_HOUR } from "./constants.js";
import { 
  checkDailySpendingLimit, 
  checkSpendingVelocity, 
  recordSpendingTransaction,
  type DailyLimitResult as StateDailyLimitResult,
  type VelocityResult as StateVelocityResult 
} from "./spending-state.js";

// Re-export for external use
export { recordSpendingTransaction } from "./spending-state.js";

// ============================================================================
// Types
// ============================================================================

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

export interface DuplicateResult {
  isDuplicate: boolean;
  priorTxid?: string;
}

export interface AddressValidationResult {
  valid: boolean;
  error?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
}

// ============================================================================
// Base58 Implementation
// ============================================================================

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/**
 * Decode a Base58 string to bytes.
 * Returns null if the string contains invalid characters.
 */
function decodeBase58(str: string): Uint8Array | null {
  // Check for invalid characters
  for (const char of str) {
    if (!BASE58_ALPHABET.includes(char)) {
      return null;
    }
  }

  const base = BigInt(58);
  let num = BigInt(0);
  let multi = BigInt(1);

  // Process string in reverse
  for (let i = str.length - 1; i >= 0; i--) {
    const digit = BigInt(BASE58_ALPHABET.indexOf(str[i]));
    num += digit * multi;
    multi *= base;
  }

  // Convert to bytes
  const bytes: number[] = [];
  while (num > 0) {
    bytes.unshift(Number(num % 256n));
    num = num / 256n;
  }

  // Add leading zeros for each '1' at the beginning of the string
  let leadingOnes = 0;
  for (const char of str) {
    if (char === '1') {
      leadingOnes++;
    } else {
      break;
    }
  }

  for (let i = 0; i < leadingOnes; i++) {
    bytes.unshift(0);
  }

  return new Uint8Array(bytes);
}

/**
 * Compute SHA-256 hash of input bytes.
 */
function sha256(data: Uint8Array): Uint8Array {
  const hash = createHash('sha256');
  hash.update(data);
  return new Uint8Array(hash.digest());
}

// ============================================================================
// Daily Spending Limit Check
// ============================================================================

/**
 * Check if the amount would exceed the daily spending limit.
 * Uses the dedicated spending state JSON file for tracking, or audit log for testing.
 * 
 * @param amount - Amount in DOGE to check
 * @param auditPath - Path to audit log (for testing compatibility)
 * @returns Daily limit check result
 */
export function checkDailyLimit(
  amount: number,
  auditPath?: string
): DailyLimitResult {
  // If auditPath is provided (for testing), use old audit log approach
  if (auditPath) {
    return checkDailyLimitFromAuditLog(amount, auditPath);
  }
  
  // Otherwise use the new spending state tracking
  return checkDailySpendingLimit(amount);
}

/**
 * Legacy audit log based daily limit check (for testing compatibility).
 */
function checkDailyLimitFromAuditLog(
  amount: number,
  auditPath: string
): DailyLimitResult {
  let spent = 0;
  const now = Date.now();
  const oneDayAgo = now - (24 * 60 * 60 * 1000);

  try {
    const logContent = readFileSync(auditPath, "utf8");
    const lines = logContent.trim().split("\n");

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const entry = JSON.parse(line);
        
        // Only count successful send actions
        if (entry.action === "send" && entry.amount && entry.timestamp) {
          const timestamp = new Date(entry.timestamp).getTime();
          
          // Only count transactions from the last 24 hours
          if (timestamp >= oneDayAgo) {
            // Amount in audit log is in koinu (satoshi equivalent), convert to DOGE
            const amountDoge = entry.amount / 100000000;
            spent += amountDoge;
          }
        }
      } catch {
        // Skip malformed entries
        continue;
      }
    }
  } catch (err) {
    console.warn(`[brain] checkDailyLimit: Could not read audit log: ${err}`);
    // If we can't read the log, be conservative and allow (could be first transaction)
    return { allowed: true, spent: 0, limit: DAILY_SPENDING_LIMIT };
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
 * Uses the dedicated spending state JSON file for tracking, or audit log for testing.
 * 
 * @param auditPath - Path to audit log (for testing compatibility)
 * @returns Velocity check result
 */
export function checkVelocity(auditPath?: string): VelocityResult {
  // If auditPath is provided (for testing), use old audit log approach
  if (auditPath) {
    return checkVelocityFromAuditLog(auditPath);
  }
  
  // Otherwise use the new spending state tracking
  return checkSpendingVelocity();
}

/**
 * Legacy audit log based velocity check (for testing compatibility).
 */
function checkVelocityFromAuditLog(auditPath: string): VelocityResult {
  let count = 0;
  const now = Date.now();
  const oneHourAgo = now - (60 * 60 * 1000);

  try {
    const logContent = readFileSync(auditPath, "utf8");
    const lines = logContent.trim().split("\n");

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const entry = JSON.parse(line);
        
        // Count send actions in the last hour
        if (entry.action === "send" && entry.timestamp) {
          const timestamp = new Date(entry.timestamp).getTime();
          
          if (timestamp >= oneHourAgo) {
            count++;
          }
        }
      } catch {
        // Skip malformed entries
        continue;
      }
    }
  } catch (err) {
    console.warn(`[brain] checkVelocity: Could not read audit log: ${err}`);
    // If we can't read the log, be conservative and allow
    return { allowed: true, count: 0, limit: MAX_PAYMENTS_PER_HOUR };
  }

  const wouldExceed = count >= MAX_PAYMENTS_PER_HOUR;
  
  return {
    allowed: !wouldExceed,
    count,
    limit: MAX_PAYMENTS_PER_HOUR,
  };
}

// ============================================================================
// Duplicate Payment Protection
// ============================================================================

/**
 * Record a payment proposal in the recent-payments log for duplicate detection.
 * This should be called before attempting the payment.
 * 
 * @param address - DOGE address
 * @param amount - Amount in DOGE
 * @param reason - Payment reason/description
 * @param logPath - Custom log path (for testing)
 */
export function recordPaymentProposal(
  address: string,
  amount: number,
  reason: string,
  logPath?: string
): void {
  const recentPaymentsPath = logPath || `${process.env.HOME || "/home/clawdbot"}/.openclaw/brain/recent-payments.json`;
  
  const now = Date.now();
  const entry = {
    timestamp: now,
    address,
    amount,
    reason,
    action: "proposal",
  };

  try {
    // Ensure directory exists
    const logDir = recentPaymentsPath.substring(0, recentPaymentsPath.lastIndexOf('/'));
    mkdirSync(logDir, { recursive: true });

    // Read existing log
    let payments: any[] = [];
    try {
      const content = readFileSync(recentPaymentsPath, "utf8");
      payments = JSON.parse(content);
    } catch {
      // File doesn't exist or is empty, start fresh
      payments = [];
    }

    // Clean old entries (older than 1 hour to keep log manageable)
    const oneHourAgo = now - (60 * 60 * 1000);
    payments = payments.filter(p => p.timestamp >= oneHourAgo);

    // Add new entry
    payments.push(entry);

    // Write back
    writeFileSync(recentPaymentsPath, JSON.stringify(payments, null, 2));
    console.log(`[brain] Payment proposal recorded: ${amount} DOGE to ${address.slice(0, 10)}...`);
  } catch (err) {
    console.warn(`[brain] recordPaymentProposal: Could not update log: ${err}`);
    // Non-fatal - duplicate detection failure shouldn't block legitimate payments
  }
}

/**
 * Check if the same address + amount was proposed recently.
 * Prevents replay attacks and accidental duplicate payments.
 * 
 * @param address - DOGE address
 * @param amount - Amount in DOGE
 * @param windowMinutes - Time window to check (default 10 minutes)
 * @param logPath - Path to recent payments log (optional for testing)
 * @returns Duplicate check result
 */
export function checkDuplicate(
  address: string,
  amount: number,
  windowMinutes = 10,
  logPath?: string
): DuplicateResult {
  const recentPaymentsPath = logPath || `${process.env.HOME || "/home/clawdbot"}/.openclaw/brain/recent-payments.json`;
  
  const now = Date.now();
  const windowMs = windowMinutes * 60 * 1000;
  const windowStart = now - windowMs;

  try {
    const content = readFileSync(recentPaymentsPath, "utf8");
    const payments = JSON.parse(content);

    for (const payment of payments) {
      // Check entries within the window
      if (payment.timestamp >= windowStart && payment.address && payment.amount) {
        // Check for exact match on address and amount (with floating point tolerance)
        if (payment.address === address && Math.abs(payment.amount - amount) < 1e-8 * Math.max(1, Math.abs(payment.amount), Math.abs(amount))) {
          return {
            isDuplicate: true,
            priorTxid: "recent-proposal", // No txid for proposals
          };
        }
      }
    }
  } catch (err) {
    console.warn(`[brain] checkDuplicate: Could not read recent payments log: ${err}`);
    // If we can't read the log, be conservative and allow
    return { isDuplicate: false };
  }

  return { isDuplicate: false };
}

// ============================================================================
// Base58Check Address Validation
// ============================================================================

/**
 * Validate a DOGE address using Base58Check validation.
 * Ensures the address is properly formatted and has a valid checksum.
 * Supports both P2PKH (0x1e) and P2SH (0x16) addresses.
 * 
 * @param address - DOGE address to validate
 * @returns Validation result
 */
export function validateDogeAddress(address: string): AddressValidationResult {
  // Basic length and character check
  if (typeof address !== "string" || address.length < 25 || address.length > 34) {
    return {
      valid: false,
      error: "Address must be 25-34 characters long",
    };
  }

  // Decode Base58
  const decoded = decodeBase58(address);
  if (!decoded) {
    return {
      valid: false,
      error: "Invalid Base58 encoding (contains invalid characters)",
    };
  }

  // Must be exactly 25 bytes
  if (decoded.length !== 25) {
    return {
      valid: false,
      error: `Address must be exactly 25 bytes when decoded (got ${decoded.length})`,
    };
  }

  // Check network prefix (first byte)
  // 0x1e (30) = Dogecoin mainnet P2PKH (pay-to-public-key-hash)
  // 0x16 (22) = Dogecoin mainnet P2SH (pay-to-script-hash)
  const versionByte = decoded[0];
  if (versionByte !== 0x1e && versionByte !== 0x16) {
    return {
      valid: false,
      error: `Invalid network prefix: expected 0x1e (P2PKH) or 0x16 (P2SH), got 0x${versionByte.toString(16).padStart(2, '0')}`,
    };
  }

  // Verify checksum: last 4 bytes should equal first 4 bytes of SHA-256(SHA-256(first 21 bytes))
  const payload = decoded.slice(0, 21);
  const checksum = decoded.slice(21, 25);
  
  const hash1 = sha256(payload);
  const hash2 = sha256(hash1);
  const expectedChecksum = hash2.slice(0, 4);

  for (let i = 0; i < 4; i++) {
    if (checksum[i] !== expectedChecksum[i]) {
      return {
        valid: false,
        error: "Invalid checksum",
      };
    }
  }

  return { valid: true };
}

// ============================================================================
// Payment Request Rate Limiting
// ============================================================================

/**
 * Check if we've exceeded the payment request rate limit.
 * Tracks payment PROPOSALS (not just sends) using a file-based log.
 * 
 * @returns Rate limit check result
 */
export function checkPaymentRequestRate(): RateLimitResult {
  const logPath = `${process.env.HOME || "/home/clawdbot"}/.openclaw/brain/payment-request-log.jsonl`;
  
  let count = 0;
  const now = Date.now();
  const oneHourAgo = now - (60 * 60 * 1000);
  const validEntries: any[] = [];

  // Read existing entries and count recent requests
  try {
    const logContent = readFileSync(logPath, "utf8");
    const lines = logContent.trim().split("\n");

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const entry = JSON.parse(line);
        
        if (entry.timestamp && entry.timestamp >= oneHourAgo) {
          count++;
          validEntries.push(entry);
        }
      } catch {
        // Skip malformed entries
        continue;
      }
    }
  } catch (err) {
    // Log file doesn't exist yet, that's fine
  }

  // Include the current request in the count for decision making
  const wouldExceed = (count + 1) > MAX_PAYMENT_REQUESTS_PER_HOUR;
  
  // Log this request attempt if we're not already at the limit
  if (!wouldExceed) {
    count++; // Increment count to reflect this request
    
    try {
      // Ensure directory exists
      const logDir = logPath.substring(0, logPath.lastIndexOf('/'));
      mkdirSync(logDir, { recursive: true });
      
      // Add current request
      const newEntry = {
        timestamp: now,
        action: "payment-request",
      };
      validEntries.push(newEntry);
      
      // Write back all valid entries (this cleans up old entries automatically)
      const content = validEntries.map(e => JSON.stringify(e)).join("\n") + "\n";
      writeFileSync(logPath, content);
    } catch (err) {
      console.warn(`[brain] checkPaymentRequestRate: Could not update log: ${err}`);
      // Continue anyway - logging failure shouldn't block the request
    }
  }
  
  return {
    allowed: !wouldExceed,
    count,
    limit: MAX_PAYMENT_REQUESTS_PER_HOUR,
  };
}