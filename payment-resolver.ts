/**
 * Brain 2.0 -- Payment Entity Resolver.
 *
 * Resolves payment intent parameters (recipient, amount, address)
 * from classifier output by searching Brain people bucket and
 * wallet transaction history.
 */

import { readFileSync } from "node:fs";

import type { BrainStore } from "./store.js";
import type { EmbeddingProvider } from "./schemas.js";
import { DOGE_ADDRESS_RE, MAX_PAYMENT_AMOUNT } from "./constants.js";

// ============================================================================
// Types
// ============================================================================

export interface PaymentResolution {
  recipientName: string | null;
  dogeAddress: string | null;
  amount: number | null;
  currency: string;
  reason: string;
  resolutionScore: number;
  suggestedAmount: number | null;
  brainPersonId: string | null;
  isFirstTimeRecipient: boolean;
  errors: string[];
}

interface PaymentParams {
  recipient?: string;
  amount?: string;
  currency?: string;
  reason?: string;
}

interface WalletTx {
  txid: string;
  address?: string;
  amount?: number;
  type?: string;
  memo?: string;
  reason?: string;
  [key: string]: unknown;
}

// Constants imported from ./constants.js

// ============================================================================
// Wallet history helper (cached per resolution call)
// ============================================================================

function loadWalletHistory(): WalletTx[] {
  try {
    const auditPath = `${process.env.HOME || "/home/clawdbot"}/.openclaw/doge/audit/audit.jsonl`;
    const lines = readFileSync(auditPath, "utf8").trim().split("\n");
    const txs: WalletTx[] = [];
    let malformed = 0;
    for (const line of lines) {
      if (!line) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.action === "send" && entry.address) {
          txs.push({
            txid: entry.txid || "",
            address: entry.address,
            amount: entry.amount ? entry.amount / 100000000 : undefined, // koinu to DOGE
            type: "send",
            memo: entry.reason || "",
            reason: entry.reason || "",
          });
        }
      } catch {
        malformed++;
      }
    }
    if (malformed > 0) {
      console.warn(`[brain] payment-resolver: ${malformed} malformed audit log entries skipped`);
    }
    console.log(`[brain] payment-resolver: loaded ${txs.length} send transactions from wallet audit log`);
    return txs;
  } catch (err) {
    console.error(`[brain] payment-resolver: failed to read wallet audit log: ${err}`);
    return [];
  }
}

// ============================================================================
// Address resolution helper (shared by primary + fallback search)
// ============================================================================

async function resolveAddressFromPerson(
  personRecord: Record<string, unknown>,
  store: BrainStore,
  embedder: EmbeddingProvider,
  history: WalletTx[],
): Promise<string | null> {
  // 1. Check contactInfo directly
  const contactInfo = (personRecord.contactInfo as string) || "";
  const contactMatch = contactInfo.match(DOGE_ADDRESS_RE);
  if (contactMatch) return contactMatch[0];

  // 2. Search finance/admin buckets for this person's DOGE address
  const personName = ((personRecord.name as string) || "").toLowerCase();
  if (!personName) return null;

  const cryptoBuckets = ["finance", "admin"] as const;
  for (const bucket of cryptoBuckets) {
    try {
      const query = `${personName} DOGE address wallet`;
      const vec = await embedder.embed(query);
      const hits = await store.search(bucket, vec, 5);
      for (const hit of hits) {
        const record = hit.record;
        const fieldsToCheck = [
          record.entries, record.notes, record.title, record.summary,
          record.nextActions, record.tags, record.contactInfo, record.description,
        ];
        for (const field of fieldsToCheck) {
          if (!field) continue;
          const str = typeof field === "string" ? field : JSON.stringify(field);
          const match = str.match(DOGE_ADDRESS_RE);
          if (match) {
            const strLower = str.toLowerCase();
            if (strLower.includes(personName) || hit.score >= 0.7) {
              return match[0];
            }
          }
        }
      }
    } catch {
      // Non-fatal, continue to next bucket
    }
  }

  // 3. Last resort: search wallet transaction history by name
  for (const tx of history) {
    const txMemo = ((tx.memo || tx.reason || "") as string).toLowerCase();
    if (txMemo.includes(personName) && tx.address) {
      return tx.address;
    }
  }

  return null;
}

// ============================================================================
// Main resolver
// ============================================================================

/**
 * Resolve payment entities from classifier-extracted parameters.
 *
 * Resolution scoring (weighted by importance):
 * - 0.50 for having a resolved DOGE address
 * - 0.30 for having an amount
 * - 0.20 for having a reason
 */
export async function resolvePaymentEntities(
  params: PaymentParams,
  rawText: string,
  store: BrainStore,
  embedder: EmbeddingProvider,
): Promise<PaymentResolution> {
  const result: PaymentResolution = {
    recipientName: params.recipient || null,
    dogeAddress: null,
    amount: null,
    currency: params.currency || "DOGE",
    reason: params.reason || "",
    resolutionScore: 0,
    suggestedAmount: null,
    brainPersonId: null,
    isFirstTimeRecipient: true,
    errors: [],
  };

  // Load wallet history once for the entire resolution
  const history = loadWalletHistory();

  // 1. Check for raw DOGE address in text
  const addrMatch = rawText.match(DOGE_ADDRESS_RE);
  if (addrMatch) {
    result.dogeAddress = addrMatch[0];
    result.resolutionScore += 0.50;
  }

  // 2. Resolve recipient from people bucket
  if (!result.dogeAddress && result.recipientName) {
    try {
      // Primary search
      const vector = await embedder.embed(result.recipientName);
      const matches = await store.search("people", vector, 3);
      const best = matches[0];

      // Fallback: broader search if primary misses
      let matched = best && best.score >= 0.6 ? best : null;
      if (!matched) {
        const fallbackVector = await embedder.embed(`${result.recipientName} person profile`);
        const fallbackMatches = await store.search("people", fallbackVector, 3);
        const fallbackBest = fallbackMatches[0];
        if (fallbackBest && fallbackBest.score >= 0.5) {
          matched = fallbackBest;
        }
      }

      if (matched) {
        result.brainPersonId = matched.record.id as string;
        const address = await resolveAddressFromPerson(matched.record, store, embedder, history);
        if (address) {
          result.dogeAddress = address;
          result.resolutionScore += 0.50;
        } else {
          result.errors.push(`Found ${matched.record.name} in Brain but no DOGE address available`);
        }
      } else {
        result.errors.push("Recipient not found in Brain");
      }
    } catch (err) {
      result.errors.push(`People search failed: ${String(err)}`);
    }
  } else if (!result.dogeAddress && !result.recipientName) {
    result.errors.push("Missing recipient");
  }

  // 3. Parse amount (with safety cap)
  if (params.amount) {
    const parsed = parseFloat(params.amount);
    if (!isNaN(parsed) && parsed > 0) {
      if (parsed > MAX_PAYMENT_AMOUNT) {
        result.errors.push(`Amount ${parsed} DOGE exceeds safety limit of ${MAX_PAYMENT_AMOUNT} DOGE`);
      } else {
        result.amount = parsed;
        result.resolutionScore += 0.30;
      }
    }
  }

  // If no amount, try to find suggested amount from history
  if (result.amount === null && result.dogeAddress) {
    const pastAmounts = history
      .filter((tx) => tx.address === result.dogeAddress && tx.type === "send")
      .map((tx) => tx.amount)
      .filter((a): a is number => typeof a === "number" && a > 0);

    if (pastAmounts.length > 0) {
      pastAmounts.sort((a, b) => a - b);
      const mid = Math.floor(pastAmounts.length / 2);
      result.suggestedAmount = pastAmounts.length % 2 === 0
        ? (pastAmounts[mid - 1] + pastAmounts[mid]) / 2
        : pastAmounts[mid];
    }
  }

  // 4. Reason
  if (result.reason) {
    result.resolutionScore += 0.20;
  }

  // 5. Check if first-time recipient (using cached history)
  if (result.dogeAddress) {
    const hasPriorSend = history.some(
      (tx) => tx.address === result.dogeAddress && tx.type === "send",
    );
    result.isFirstTimeRecipient = !hasPriorSend;
  }

  return result;
}
