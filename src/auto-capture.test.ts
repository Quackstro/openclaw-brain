/**
 * Auto-Capture v2 — Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  TurnBuffer,
  buildExtractionPrompt,
  DEFAULT_AUTO_CAPTURE_CONFIG,
  type AutoCaptureConfig,
  type BufferedTurn,
  type ExtractionResult,
} from "./auto-capture.js";

// ============================================================================
// TurnBuffer tests
// ============================================================================

describe("TurnBuffer", () => {
  let config: AutoCaptureConfig;
  let flushFn: ReturnType<typeof vi.fn>;
  let buffer: TurnBuffer;

  beforeEach(() => {
    vi.useFakeTimers();
    config = {
      ...DEFAULT_AUTO_CAPTURE_CONFIG,
      enabled: true,
      flushAfterTurns: 3,
      idleFlushMs: 5000,
      maxBufferTurns: 10,
    };
    flushFn = vi.fn().mockResolvedValue(undefined);
    buffer = new TurnBuffer(config, flushFn);
  });

  afterEach(() => {
    buffer.destroy();
    vi.useRealTimers();
  });

  it("buffers turns without immediate flush", () => {
    buffer.addTurn("s1", "user", "hello world test message");
    expect(buffer.getBufferSize("s1")).toBe(1);
    expect(flushFn).not.toHaveBeenCalled();
  });

  it("flushes after reaching turn count threshold", async () => {
    buffer.addTurn("s1", "user", "turn one is a test message");
    buffer.addTurn("s1", "assistant", "response one here");
    buffer.addTurn("s1", "user", "turn two is another message");
    buffer.addTurn("s1", "assistant", "response two here");
    buffer.addTurn("s1", "user", "turn three triggers flush");

    // Flush is async, let microtasks run
    await vi.runAllTimersAsync();

    expect(flushFn).toHaveBeenCalledOnce();
    expect(flushFn).toHaveBeenCalledWith("s1", expect.any(Array));
    const turns = flushFn.mock.calls[0][1] as BufferedTurn[];
    expect(turns.length).toBe(5);
  });

  it("flushes on idle timeout", async () => {
    buffer.addTurn("s1", "user", "some message that is long enough");
    buffer.addTurn("s1", "assistant", "a response here");

    expect(flushFn).not.toHaveBeenCalled();

    // Advance past idle timeout
    await vi.advanceTimersByTimeAsync(6000);

    expect(flushFn).toHaveBeenCalledOnce();
  });

  it("resets idle timer on new turn", async () => {
    buffer.addTurn("s1", "user", "first message is here now");

    // Advance 4 seconds (before 5s idle timeout)
    await vi.advanceTimersByTimeAsync(4000);
    expect(flushFn).not.toHaveBeenCalled();

    // New turn resets the timer
    buffer.addTurn("s1", "user", "second message resets timer");

    // Advance another 4 seconds (still within new idle window)
    await vi.advanceTimersByTimeAsync(4000);
    expect(flushFn).not.toHaveBeenCalled();

    // Now exceed the idle timeout
    await vi.advanceTimersByTimeAsync(2000);
    expect(flushFn).toHaveBeenCalledOnce();
  });

  it("enforces ring buffer max size", () => {
    for (let i = 0; i < 15; i++) {
      buffer.addTurn("s1", "user", `message number ${i} is here`);
    }
    // maxBufferTurns is 10, but flushAfterTurns is 3
    // So it should have flushed multiple times
    expect(buffer.getBufferSize("s1")).toBeLessThanOrEqual(config.maxBufferTurns);
  });

  it("maintains separate buffers per session", () => {
    buffer.addTurn("s1", "user", "session one message here now");
    buffer.addTurn("s2", "user", "session two message here now");

    expect(buffer.getBufferSize("s1")).toBe(1);
    expect(buffer.getBufferSize("s2")).toBe(1);
    expect(buffer.activeBufferCount).toBe(2);
  });

  it("flushAll flushes all sessions", async () => {
    buffer.addTurn("s1", "user", "session one message here now");
    buffer.addTurn("s2", "user", "session two message here now");

    await buffer.flushAll();

    expect(flushFn).toHaveBeenCalledTimes(2);
  });

  it("cleans up empty buffers after flush", async () => {
    buffer.addTurn("s1", "user", "turn one test message here");
    buffer.addTurn("s1", "user", "turn two test message here");
    buffer.addTurn("s1", "user", "turn three triggers the flush");

    await vi.runAllTimersAsync();

    expect(buffer.activeBufferCount).toBe(0);
  });
});

// ============================================================================
// Extraction prompt tests
// ============================================================================

describe("buildExtractionPrompt", () => {
  const turns: BufferedTurn[] = [
    { role: "user", content: "Let's use PostgreSQL for the auth service", timestamp: "2026-03-27T20:00:00Z" },
    { role: "assistant", content: "Good choice. PostgreSQL has better JSON support.", timestamp: "2026-03-27T20:00:10Z" },
  ];

  it("builds prompt for 'facts' level", () => {
    const prompt = buildExtractionPrompt(turns, "facts");
    expect(prompt).toContain("FACTS:");
    expect(prompt).toContain("DECISIONS:");
    expect(prompt).not.toContain("PREFERENCES:");
    expect(prompt).not.toContain("TODOS:");
    expect(prompt).toContain("[user]: Let's use PostgreSQL");
  });

  it("builds prompt for 'standard' level", () => {
    const prompt = buildExtractionPrompt(turns, "standard");
    expect(prompt).toContain("FACTS:");
    expect(prompt).toContain("DECISIONS:");
    expect(prompt).toContain("PREFERENCES:");
    expect(prompt).toContain("TODOS:");
  });

  it("builds prompt for 'full' level", () => {
    const prompt = buildExtractionPrompt(turns, "full");
    expect(prompt).toContain("FACTS:");
    expect(prompt).toContain("all durable");
  });

  it("returns empty for 'off' level", () => {
    const prompt = buildExtractionPrompt(turns, "off");
    expect(prompt).toBe("");
  });

  it("includes conversation turns", () => {
    const prompt = buildExtractionPrompt(turns, "standard");
    expect(prompt).toContain("[user]: Let's use PostgreSQL for the auth service");
    expect(prompt).toContain("[assistant]: Good choice. PostgreSQL has better JSON support.");
  });
});

// ============================================================================
// Config backward compatibility
// ============================================================================

describe("AutoCapture config", () => {
  it("DEFAULT_AUTO_CAPTURE_CONFIG has sensible defaults", () => {
    expect(DEFAULT_AUTO_CAPTURE_CONFIG.enabled).toBe(false);
    expect(DEFAULT_AUTO_CAPTURE_CONFIG.level).toBe("standard");
    expect(DEFAULT_AUTO_CAPTURE_CONFIG.flushAfterTurns).toBe(10);
    expect(DEFAULT_AUTO_CAPTURE_CONFIG.idleFlushMs).toBe(300000);
    expect(DEFAULT_AUTO_CAPTURE_CONFIG.maxBufferTurns).toBe(20);
    expect(DEFAULT_AUTO_CAPTURE_CONFIG.bucket).toBe("conversations");
    expect(DEFAULT_AUTO_CAPTURE_CONFIG.minConfidence).toBe(0.6);
  });
});
