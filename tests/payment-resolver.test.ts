/**
 * Tests for payment-resolver helpers: DOGE address regex, wallet history parsing,
 * and resolution score calculation.
 */

// We duplicate internal constants since they aren't exported
const DOGE_ADDRESS_RE = /\bD[1-9A-HJ-NP-Za-km-z]{24,33}\b/;

let passed = 0;
let failed = 0;

function assert(label: string, actual: unknown, expected: unknown) {
  if (actual === expected) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failed++;
  }
}

// ============================================================================
// DOGE_ADDRESS_RE tests
// ============================================================================

console.log("DOGE_ADDRESS_RE tests:\n");

// Valid addresses
assert("Valid: D84hUKd37sKjmvfweAAs3CRWiZYuP54ygU",
  DOGE_ADDRESS_RE.test("D84hUKd37sKjmvfweAAs3CRWiZYuP54ygU"), true);

assert("Valid: D6i8TeepmrGztENxdME84d2x5UVjLWncat",
  DOGE_ADDRESS_RE.test("D6i8TeepmrGztENxdME84d2x5UVjLWncat"), true);

assert("Valid: embedded in text",
  DOGE_ADDRESS_RE.test("send to D84hUKd37sKjmvfweAAs3CRWiZYuP54ygU please"), true);

assert("Valid: extracts correct address",
  "send to D84hUKd37sKjmvfweAAs3CRWiZYuP54ygU please".match(DOGE_ADDRESS_RE)?.[0],
  "D84hUKd37sKjmvfweAAs3CRWiZYuP54ygU");

// Invalid addresses
assert("Invalid: starts with 1",
  DOGE_ADDRESS_RE.test("184hUKd37sKjmvfweAAs3CRWiZYuP54ygU"), false);

assert("Invalid: too short (Dabc)",
  DOGE_ADDRESS_RE.test("Dabc"), false);

assert("Invalid: contains 0 (D0000000000000000000000000)",
  DOGE_ADDRESS_RE.test("D0000000000000000000000000"), false);

assert("Invalid: special chars",
  DOGE_ADDRESS_RE.test("DINVALID!@#$%^&*()_+"), false);

assert("Invalid: empty string",
  DOGE_ADDRESS_RE.test(""), false);

assert("Invalid: just D",
  DOGE_ADDRESS_RE.test("D"), false);

// ============================================================================
// Koinu to DOGE conversion (mirrors getWalletHistory logic)
// ============================================================================

console.log("\nKoinu→DOGE conversion tests:\n");

function koinuToDoge(koinu: number): number {
  return koinu / 100000000;
}

assert("1 DOGE = 100000000 koinu", koinuToDoge(100000000), 1);
assert("0.5 DOGE", koinuToDoge(50000000), 0.5);
assert("0 koinu = 0 DOGE", koinuToDoge(0), 0);
assert("10 DOGE", koinuToDoge(1000000000), 10);

// ============================================================================
// Audit line parsing (mirrors getWalletHistory logic)
// ============================================================================

console.log("\nAudit line parsing tests:\n");

interface WalletTx {
  txid: string;
  address?: string;
  amount?: number;
  type?: string;
  memo?: string;
  reason?: string;
}

function parseAuditLines(lines: string[]): WalletTx[] {
  const txs: WalletTx[] = [];
  for (const line of lines) {
    if (!line) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.action === "send" && entry.address) {
        txs.push({
          txid: entry.txid || "",
          address: entry.address,
          amount: entry.amount ? entry.amount / 100000000 : undefined,
          type: "send",
          memo: entry.reason || "",
          reason: entry.reason || "",
        });
      }
    } catch { /* skip malformed */ }
  }
  return txs;
}

const sampleLines = [
  '{"action":"send","txid":"abc123","address":"D84hUKd37sKjmvfweAAs3CRWiZYuP54ygU","amount":100000000,"reason":"test payment"}',
  '{"action":"send","txid":"def456","address":"D6i8TeepmrGztENxdME84d2x5UVjLWncat","amount":50000000,"reason":"coffee"}',
  '{"action":"receive","txid":"ghi789","address":"Dxyz","amount":200000000}',
  'this is not json',
  '',
  '{"action":"send","address":"Dtest123456789012345678901234","amount":null,"reason":"no amount"}',
];

const parsed = parseAuditLines(sampleLines);

assert("Parses 3 send entries (receive skipped)", parsed.length, 3);
assert("First tx amount = 1 DOGE", parsed[0]?.amount, 1);
assert("Second tx amount = 0.5 DOGE", parsed[1]?.amount, 0.5);
assert("First tx reason", parsed[0]?.reason, "test payment");
assert("Malformed line skipped (no crash)", parsed.length, 3);
assert("Null amount → undefined", parsed[2]?.amount, undefined);
assert("Txid defaults to empty string", parsed[2]?.txid, "");

// ============================================================================
// Resolution score calculation (mirrors resolvePaymentEntities logic)
// ============================================================================

console.log("\nResolution score calculation tests:\n");

function calcScore(hasAddress: boolean, hasAmount: boolean, hasReason: boolean): number {
  let score = 0;
  if (hasAddress) score += 0.50;
  if (hasAmount) score += 0.30;
  if (hasReason) score += 0.20;
  return Math.round(score * 100) / 100; // avoid float issues
}

assert("All three = 1.0", calcScore(true, true, true), 1.0);
assert("Address + amount = 0.80", calcScore(true, true, false), 0.80);
assert("Address only = 0.50", calcScore(true, false, false), 0.50);
assert("None = 0", calcScore(false, false, false), 0);
assert("Amount + reason = 0.50", calcScore(false, true, true), 0.50);
assert("Reason only = 0.20", calcScore(false, false, true), 0.20);

// ============================================================================
// Amount parsing edge cases
// ============================================================================

console.log("\nAmount parsing tests:\n");

const MAX_PAYMENT_AMOUNT = 1000;

function parseAmount(raw: string | undefined): number | "cap" | null {
  if (!raw) return null;
  const parsed = parseFloat(raw);
  if (isNaN(parsed) || parsed <= 0) return null;
  if (parsed > MAX_PAYMENT_AMOUNT) return "cap";
  return parsed;
}

assert("Normal amount '5'", parseAmount("5"), 5);
assert("Decimal '0.5'", parseAmount("0.5"), 0.5);
assert("Zero returns null", parseAmount("0"), null);
assert("Negative returns null", parseAmount("-1"), null);
assert("NaN returns null", parseAmount("abc"), null);
assert("Empty returns null", parseAmount(""), null);
assert("Undefined returns null", parseAmount(undefined), null);
assert("'1.01' parses correctly", parseAmount("1.01"), 1.01);
assert("Amount over cap returns 'cap'", parseAmount("1001"), "cap");
assert("Amount at cap returns 1000", parseAmount("1000"), 1000);
assert("Huge amount returns 'cap'", parseAmount("999999"), "cap");

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log("✅ All payment-resolver tests passed!");
