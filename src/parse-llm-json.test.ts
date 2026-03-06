import { describe, expect, it } from "vitest";
import { parseJsonFromLlm } from "./parse-llm-json.js";

describe("parseJsonFromLlm", () => {
  it("parses a plain JSON object", () => {
    const result = parseJsonFromLlm('{"key": "value", "num": 42}');
    expect(result).toEqual({ key: "value", num: 42 });
  });

  it("strips ```json ... ``` markdown fences", () => {
    const input = '```json\n{"bucket": "ideas", "confidence": 0.9}\n```';
    const result = parseJsonFromLlm(input);
    expect(result).toEqual({ bucket: "ideas", confidence: 0.9 });
  });

  it("strips plain ``` ... ``` markdown fences", () => {
    const input = '```\n{"title": "test"}\n```';
    const result = parseJsonFromLlm(input);
    expect(result).toEqual({ title: "test" });
  });

  it("extracts JSON when there is surrounding text", () => {
    const input = 'Here is the result:\n{"bucket": "projects"}\nThat is all.';
    const result = parseJsonFromLlm(input);
    expect(result).toEqual({ bucket: "projects" });
  });

  it("handles nested objects correctly", () => {
    const input = '{"outer": {"inner": {"deep": true}}, "val": 1}';
    const result = parseJsonFromLlm(input);
    expect(result).toEqual({ outer: { inner: { deep: true } }, val: 1 });
  });

  it("returns null for malformed JSON", () => {
    const result = parseJsonFromLlm('{"broken": json here}');
    expect(result).toBeNull();
  });

  it("returns null for text with no JSON object", () => {
    const result = parseJsonFromLlm("no json here at all");
    expect(result).toBeNull();
  });

  it("returns null for empty string", () => {
    const result = parseJsonFromLlm("");
    expect(result).toBeNull();
  });

  it("handles JSON with arrays in values", () => {
    const input = '{"tags": ["a", "b", "c"], "count": 3}';
    const result = parseJsonFromLlm(input);
    expect(result).toEqual({ tags: ["a", "b", "c"], count: 3 });
  });

  it("handles fences with no newline after opening fence", () => {
    const input = '```json{"title": "inline"}```';
    const result = parseJsonFromLlm(input);
    expect(result).toEqual({ title: "inline" });
  });
});
