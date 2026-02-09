/**
 * Brain 2.0 -- Payment Entity Resolver.
 *
 * Resolves payment intent parameters (recipient, amount, address)
 * from classifier output by searching Brain people bucket and
 * wallet transaction history.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { BrainStore } from "./store.js";
import type { EmbeddingProvider } from "./schemas.js";

const execFileAsync = promisify(execFile);

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

// ============================================================================
// DOGE address regex
// ============================================================================

const DOGE_ADDRESS_RE = /\bD[1-9A-HJ-NP-Za-km-z]{24,33}\b/;

// ============================================================================
// Wallet history helper
// ============================================================================

async function getWalletHistory(): Promise<WalletTx[]> {
  // Read directly from the wallet audit log (JSONL file).
  // The CLI `openclaw wallet history` doesn't exist; the wallet_history
  // tool is agent-only. The audit log is the source of truth.
  try {
    const auditPath = `${process.env.HOME || "/home/clawdbot"}/.openclaw/doge/audit/audit.jsonl`;
    const { readFileSync } = await import("node:fs");
    const lines = readFileSync(auditPath, "utf8").trim().split("\n");
    const txs: WalletTx[] = [];
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
      } catch { /* skip malformed lines */ }
    }
    return txs;
  } catch {
    return [];
  }
}

// ============================================================================
// Main resolver
// ============================================================================

/**
 * Resolve payment entities from classifier-extracted parameters.
 *
 * Resolution scoring:
 * - 0.33 for having a resolved DOGE address
 * - 0.33 for having an amount
 * - 0.34 for having a reason
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

  // 1. Check for raw DOGE address in text
  const addrMatch = rawText.match(DOGE_ADDRESS_RE);
  if (addrMatch) {
    result.dogeAddress = addrMatch[0];
    result.resolutionScore += 0.33;
  }

  // 2. Resolve recipient from people bucket
  if (!result.dogeAddress && result.recipientName) {
    try {
      const vector = await embedder.embed(result.recipientName);
      const matches = await store.search("people", vector, 3);

      // Find a match with reasonable similarity
      const best = matches[0];
      if (best && best.score >= 0.5) {
        result.brainPersonId = best.record.id as string;

        // Check contactInfo for DOGE address
        const contactInfo = (best.record.contactInfo as string) || "";
        const contactAddrMatch = contactInfo.match(DOGE_ADDRESS_RE);
        if (contactAddrMatch) {
          result.dogeAddress = contactAddrMatch[0];
          result.resolutionScore += 0.33;
        }

        // If still no address, search crypto-related buckets (finance, admin)
        // for records mentioning this person + a DOGE address
        if (!result.dogeAddress) {
          const personName = (best.record.name as string || "").toLowerCase();
          const cryptoBuckets = ["finance", "admin"] as const;
          for (const bucket of cryptoBuckets) {
            if (result.dogeAddress) break;
            try {
              const query = `${personName} DOGE address wallet`;
              const vec = await embedder.embed(query);
              const hits = await store.search(bucket, vec, 5);
              for (const hit of hits) {
                // Scan all string fields for a DOGE address
                const record = hit.record;
                const fieldsToCHeck = [
                  record.entries,
                  record.notes,
                  record.title,
                  record.summary,
                  record.nextActions,
                  record.tags,
                  record.contactInfo,
                  record.description,
                ];
                for (const field of fieldsToCHeck) {
                  if (!field) continue;
                  const str = typeof field === "string" ? field : JSON.stringify(field);
                  const match = str.match(DOGE_ADDRESS_RE);
                  if (match) {
                    // Verify this record is related to the recipient
                    const strLower = str.toLowerCase();
                    if (strLower.includes(personName) || hit.score >= 0.7) {
                      result.dogeAddress = match[0];
                      result.resolutionScore += 0.33;
                      break;
                    }
                  }
                }
                if (result.dogeAddress) break;
              }
            } catch {
              // Non-fatal, continue to next bucket
            }
          }
        }

        // Last resort: search wallet transaction history by name
        if (!result.dogeAddress) {
          const personName = (best.record.name as string || "").toLowerCase();
          const history = await getWalletHistory();
          for (const tx of history) {
            const txMemo = ((tx.memo || tx.reason || "") as string).toLowerCase();
            if (txMemo.includes(personName) && tx.address) {
              result.dogeAddress = tx.address;
              result.resolutionScore += 0.33;
              break;
            }
          }

          if (!result.dogeAddress) {
            result.errors.push(`Found ${best.record.name} in Brain but no DOGE address available`);
          }
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

  // 3. Parse amount
  if (params.amount) {
    const parsed = parseFloat(params.amount);
    if (!isNaN(parsed) && parsed > 0) {
      result.amount = parsed;
      result.resolutionScore += 0.33;
    }
  }

  // If no amount, try to find suggested amount from history
  if (result.amount === null && result.dogeAddress) {
    const history = await getWalletHistory();
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
    result.resolutionScore += 0.34;
  }

  // 5. Check if first-time recipient
  if (result.dogeAddress) {
    const history = await getWalletHistory();
    const hasPriorSend = history.some(
      (tx) => tx.address === result.dogeAddress && tx.type === "send",
    );
    result.isFirstTimeRecipient = !hasPriorSend;
  }

  return result;
}
