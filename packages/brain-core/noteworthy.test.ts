import { describe, expect, it } from "vitest";
import { isMessageNoteworthy } from "./noteworthy.js";

describe("isMessageNoteworthy", () => {
  it("rejects short messages (under 20 chars)", () => {
    expect(isMessageNoteworthy("ok")).toBe(false);
    expect(isMessageNoteworthy("hi there")).toBe(false);
    expect(isMessageNoteworthy("sure thing")).toBe(false);
  });

  it("rejects trivial acknowledgements", () => {
    expect(isMessageNoteworthy("thanks!")).toBe(false);
    expect(isMessageNoteworthy("got it")).toBe(false);
    expect(isMessageNoteworthy("yes")).toBe(false);
    expect(isMessageNoteworthy("cool")).toBe(false);
    expect(isMessageNoteworthy("okay")).toBe(false);
    expect(isMessageNoteworthy("understood")).toBe(false);
    expect(isMessageNoteworthy("roger")).toBe(false);
    expect(isMessageNoteworthy("ack")).toBe(false);
  });

  it("rejects greetings", () => {
    expect(isMessageNoteworthy("hello")).toBe(false);
    expect(isMessageNoteworthy("morning!")).toBe(false);
    expect(isMessageNoteworthy("hey")).toBe(false);
    expect(isMessageNoteworthy("gm")).toBe(false);
    expect(isMessageNoteworthy("gn")).toBe(false);
  });

  it("rejects emoji-only messages", () => {
    expect(isMessageNoteworthy("👍")).toBe(false);
    expect(isMessageNoteworthy("🔥")).toBe(false);
    expect(isMessageNoteworthy("✅")).toBe(false);
  });

  it("rejects messages with fewer than 4 words", () => {
    expect(isMessageNoteworthy("this is short")).toBe(false);
    expect(isMessageNoteworthy("deploy now please")).toBe(false);
  });

  it("accepts substantive multi-word messages", () => {
    expect(
      isMessageNoteworthy("We need to schedule a meeting with the team about the brain plugin"),
    ).toBe(true);
    expect(isMessageNoteworthy("Dr. Castro's appointment is next Tuesday at 3pm")).toBe(true);
    expect(
      isMessageNoteworthy("The OpenClaw gateway needs a restart after the config change"),
    ).toBe(true);
  });

  it("accepts messages with 4+ words even if moderately short", () => {
    expect(isMessageNoteworthy("deploy the brain plugin now")).toBe(true);
  });

  it("is case-insensitive for trivial pattern matching", () => {
    expect(isMessageNoteworthy("THANKS")).toBe(false);
    expect(isMessageNoteworthy("OK")).toBe(false);
  });
});
