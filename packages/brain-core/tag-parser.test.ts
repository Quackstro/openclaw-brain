import { describe, expect, it } from "vitest";
import { parseInputTags, tagToIntent } from "./tag-parser.js";

describe("parseInputTags", () => {
  it("returns null tag and original text for plain input", () => {
    const result = parseInputTags("just a regular note");
    expect(result.tag).toBeNull();
    expect(result.cleanText).toBe("just a regular note");
  });

  it("returns null tag and empty string for empty input", () => {
    const result = parseInputTags("");
    expect(result.tag).toBeNull();
    expect(result.cleanText).toBe("");
  });

  it("parses [ToDo] tag (case-insensitive)", () => {
    const result = parseInputTags("[ToDo] buy groceries");
    expect(result.tag).toBe("todo");
    expect(result.cleanText).toBe("buy groceries");
  });

  it("parses [TODO] tag", () => {
    const result = parseInputTags("[TODO] finish the report");
    expect(result.tag).toBe("todo");
    expect(result.cleanText).toBe("finish the report");
  });

  it("parses [Reminder] tag", () => {
    const result = parseInputTags("[Reminder] call mom at 5pm");
    expect(result.tag).toBe("reminder");
    expect(result.cleanText).toBe("call mom at 5pm");
  });

  it("parses [Buy] tag", () => {
    const result = parseInputTags("[Buy] new headphones");
    expect(result.tag).toBe("buy");
    expect(result.cleanText).toBe("new headphones");
  });

  it("parses [Call] tag", () => {
    const result = parseInputTags("[Call] dentist office");
    expect(result.tag).toBe("call");
    expect(result.cleanText).toBe("dentist office");
  });

  it("parses [Book] tag", () => {
    const result = parseInputTags("[Book] restaurant for Saturday");
    expect(result.tag).toBe("book");
    expect(result.cleanText).toBe("restaurant for Saturday");
  });

  it("parses [Payment] tag", () => {
    const result = parseInputTags("[Payment] send 10 doge to alice");
    expect(result.tag).toBe("payment");
    expect(result.cleanText).toBe("send 10 doge to alice");
  });

  it("parses [Pay] tag", () => {
    const result = parseInputTags("[Pay] bob 5 doge for lunch");
    expect(result.tag).toBe("payment");
    expect(result.cleanText).toBe("bob 5 doge for lunch");
  });

  it("parses [Send] tag", () => {
    const result = parseInputTags("[Send] 20 doge to carol");
    expect(result.tag).toBe("payment");
    expect(result.cleanText).toBe("20 doge to carol");
  });

  it("parses [Tip] tag", () => {
    const result = parseInputTags("[Tip] dave 2 doge");
    expect(result.tag).toBe("payment");
    expect(result.cleanText).toBe("dave 2 doge");
  });

  it("returns null tag and original text for unknown bracket tag", () => {
    const result = parseInputTags("[Unknown] something interesting");
    expect(result.tag).toBeNull();
    expect(result.cleanText).toBe("[Unknown] something interesting");
  });

  it("handles leading whitespace before bracket tag", () => {
    const result = parseInputTags("  [todo] task with leading space");
    expect(result.tag).toBe("todo");
    expect(result.cleanText).toBe("task with leading space");
  });

  it("trims the clean text", () => {
    const result = parseInputTags("[buy]   headphones with extra spaces  ");
    expect(result.tag).toBe("buy");
    expect(result.cleanText).toBe("headphones with extra spaces");
  });

  it("handles text with only a tag (no body)", () => {
    const result = parseInputTags("[todo]");
    expect(result.tag).toBe("todo");
    expect(result.cleanText).toBe("");
  });
});

describe("tagToIntent", () => {
  it("maps todo → todo", () => expect(tagToIntent("todo")).toBe("todo"));
  it("maps reminder → reminder", () => expect(tagToIntent("reminder")).toBe("reminder"));
  it("maps buy → purchase", () => expect(tagToIntent("buy")).toBe("purchase"));
  it("maps call → call", () => expect(tagToIntent("call")).toBe("call"));
  it("maps book → booking", () => expect(tagToIntent("book")).toBe("booking"));
  it("maps payment → payment", () => expect(tagToIntent("payment")).toBe("payment"));
});
