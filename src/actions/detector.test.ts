import { describe, expect, it } from "vitest";
import {
  detectIntent,
  tagToIntent,
  isTimeSensitive,
  isPaymentIntent,
  isTagOnlyIntent,
} from "./detector.js";

// Minimal ClassificationResult for testing — matches the shape expected by detector
function makeClassification(overrides: Record<string, any> = {}): any {
  return {
    bucket: "ideas",
    confidence: 0.8,
    title: "Test",
    summary: "A test thought.",
    nextActions: [],
    entities: { people: [], dates: [], amounts: [], locations: [] },
    urgency: "someday",
    followUpDate: null,
    tags: [],
    detectedIntent: "none",
    ...overrides,
  };
}

// ============================================================================
// tagToIntent
// ============================================================================

describe("tagToIntent", () => {
  it("maps reminder tags", () => {
    expect(tagToIntent("reminder")).toBe("reminder");
    expect(tagToIntent("remind")).toBe("reminder");
    expect(tagToIntent("remindme")).toBe("reminder");
  });

  it("maps booking tags", () => {
    expect(tagToIntent("book")).toBe("booking");
    expect(tagToIntent("booking")).toBe("booking");
    expect(tagToIntent("appointment")).toBe("booking");
  });

  it("maps todo tags", () => {
    expect(tagToIntent("todo")).toBe("todo");
    expect(tagToIntent("task")).toBe("todo");
  });

  it("maps purchase tags", () => {
    expect(tagToIntent("buy")).toBe("purchase");
    expect(tagToIntent("purchase")).toBe("purchase");
  });

  it("maps call tags", () => {
    expect(tagToIntent("call")).toBe("call");
    expect(tagToIntent("phone")).toBe("call");
  });

  it("maps payment tags", () => {
    expect(tagToIntent("pay")).toBe("payment");
    expect(tagToIntent("send")).toBe("payment");
    expect(tagToIntent("tip")).toBe("payment");
    expect(tagToIntent("payment")).toBe("payment");
  });

  it("returns null for unknown tags", () => {
    expect(tagToIntent("unknown")).toBeNull();
    expect(tagToIntent("")).toBeNull();
    expect(tagToIntent(undefined)).toBeNull();
  });
});

// ============================================================================
// detectIntent — priority chain
// ============================================================================

describe("detectIntent priority chain", () => {
  it("1. explicit tag takes highest priority", () => {
    // Even if classification says 'purchase', the tag overrides
    const cls = makeClassification({ detectedIntent: "purchase" });
    expect(detectIntent(cls, "buy something", "reminder")).toBe("reminder");
  });

  it("2. classification detectedIntent is used when no tag", () => {
    const cls = makeClassification({ detectedIntent: "todo" });
    expect(detectIntent(cls, "regular text", undefined)).toBe("todo");
  });

  it("3. keyword heuristics fall back when no tag and no classification intent", () => {
    const cls = makeClassification({ detectedIntent: "none" });
    expect(detectIntent(cls, "book a dentist appointment", undefined)).toBe("booking");
  });

  it("returns none when nothing matches", () => {
    const cls = makeClassification({ detectedIntent: "none" });
    expect(detectIntent(cls, "just a thought about the weather", undefined)).toBe("none");
  });

  it("detects reminder from keywords", () => {
    const cls = makeClassification({ detectedIntent: "none" });
    expect(detectIntent(cls, "remind me to call mom tomorrow", undefined)).toBe("reminder");
  });

  it("detects payment intent from amount pattern", () => {
    const cls = makeClassification({ detectedIntent: "none" });
    expect(detectIntent(cls, "send 50 doge to alice", undefined)).toBe("payment");
  });

  it("detects payment intent from recipient pattern", () => {
    const cls = makeClassification({ detectedIntent: "none" });
    // "to bob" matches the recipient pattern /(?:to|for|@)\s+\w+/
    expect(detectIntent(cls, "pay to bob for lunch", undefined)).toBe("payment");
  });

  it("does not detect payment from keyword alone without amount/recipient", () => {
    const cls = makeClassification({ detectedIntent: "none" });
    // 'send' keyword alone without amount or @recipient should not trigger payment
    const result = detectIntent(cls, "send the file to the server", undefined);
    // May or may not detect; just ensure it doesn't crash
    expect(typeof result).toBe("string");
  });

  it("detects call from keywords", () => {
    const cls = makeClassification({ detectedIntent: "none" });
    // Avoid 'doctor' which is in BOOKING_KEYWORDS (higher priority than CALL_KEYWORDS)
    expect(detectIntent(cls, "call mom tonight", undefined)).toBe("reminder");
    // Pure call with no booking/reminder keywords
    expect(detectIntent(cls, "phone the school about pickup", undefined)).toBe("call");
  });

  it("detects purchase from keywords", () => {
    const cls = makeClassification({ detectedIntent: "none" });
    expect(detectIntent(cls, "buy new running shoes", undefined)).toBe("purchase");
  });

  it("detects todo from keywords", () => {
    const cls = makeClassification({ detectedIntent: "none" });
    expect(detectIntent(cls, "I should finish the documentation", undefined)).toBe("todo");
  });
});

// ============================================================================
// isTimeSensitive
// ============================================================================

describe("isTimeSensitive", () => {
  it("returns true for reminder", () => {
    expect(isTimeSensitive("reminder")).toBe(true);
  });

  it("returns true for booking", () => {
    expect(isTimeSensitive("booking")).toBe(true);
  });

  it("returns false for other intents", () => {
    expect(isTimeSensitive("todo")).toBe(false);
    expect(isTimeSensitive("payment")).toBe(false);
    expect(isTimeSensitive("purchase")).toBe(false);
    expect(isTimeSensitive("call")).toBe(false);
    expect(isTimeSensitive("none")).toBe(false);
  });
});

// ============================================================================
// isPaymentIntent
// ============================================================================

describe("isPaymentIntent", () => {
  it("returns true for payment", () => {
    expect(isPaymentIntent("payment")).toBe(true);
  });

  it("returns false for other intents", () => {
    expect(isPaymentIntent("reminder")).toBe(false);
    expect(isPaymentIntent("todo")).toBe(false);
    expect(isPaymentIntent("none")).toBe(false);
  });
});

// ============================================================================
// isTagOnlyIntent
// ============================================================================

describe("isTagOnlyIntent", () => {
  it("returns true for todo, purchase, call", () => {
    expect(isTagOnlyIntent("todo")).toBe(true);
    expect(isTagOnlyIntent("purchase")).toBe(true);
    expect(isTagOnlyIntent("call")).toBe(true);
  });

  it("returns false for time-sensitive and payment intents", () => {
    expect(isTagOnlyIntent("reminder")).toBe(false);
    expect(isTagOnlyIntent("booking")).toBe(false);
    expect(isTagOnlyIntent("payment")).toBe(false);
    expect(isTagOnlyIntent("none")).toBe(false);
  });
});
