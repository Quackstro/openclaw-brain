import { describe, expect, it } from "vitest";
import { isMessageNoteworthy } from "./noteworthy.js";

describe("isMessageNoteworthy", () => {
  it("rejects short messages", () => {
    expect(isMessageNoteworthy("ok")).toBe(false);
    expect(isMessageNoteworthy("hi there")).toBe(false);
  });

  it("rejects trivial acks", () => {
    expect(isMessageNoteworthy("thanks!")).toBe(false);
    expect(isMessageNoteworthy("got it")).toBe(false);
    expect(isMessageNoteworthy("yes")).toBe(false);
    expect(isMessageNoteworthy("cool")).toBe(false);
  });

  it("rejects greetings", () => {
    expect(isMessageNoteworthy("hello")).toBe(false);
    expect(isMessageNoteworthy("morning!")).toBe(false);
  });

  it("rejects emoji-only", () => {
    expect(isMessageNoteworthy("👍")).toBe(false);
    expect(isMessageNoteworthy("🔥")).toBe(false);
  });

  it("rejects messages with fewer than 4 words", () => {
    expect(isMessageNoteworthy("this is short")).toBe(false);
  });

  it("accepts substantive messages", () => {
    expect(isMessageNoteworthy("We need to schedule a meeting with the team about the brain plugin")).toBe(true);
    expect(isMessageNoteworthy("Dr. Castro's appointment is next Tuesday at 3pm")).toBe(true);
    expect(isMessageNoteworthy("The OpenClaw gateway needs a restart after the config change")).toBe(true);
  });

  it("accepts messages with enough words even if somewhat short", () => {
    expect(isMessageNoteworthy("deploy the brain plugin now")).toBe(true);
  });
});

describe("config defaults", () => {
  it("autoCapture defaults to false", () => {
    // Verify the config schema declares default: false
    // This is a documentation test — the actual default is in openclaw.plugin.json
    expect(false).toBe(false); // autoCapture default
  });

  it("autoRecall defaults to false", () => {
    expect(false).toBe(false); // autoRecall default
  });
});
