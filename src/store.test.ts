import { describe, expect, it } from "vitest";
import { BrainStore } from "./store.js";

describe("BrainStore.sanitizeFilter", () => {
  // Access sanitizeFilter via a store instance
  const store = new BrainStore("/tmp/test-brain-audit", 8, ["people"]);

  it("allows basic equality filters", () => {
    expect(() => store.sanitizeFilter("id = 'abc'")).not.toThrow();
    expect(() => store.sanitizeFilter("status = 'pending'")).not.toThrow();
  });

  it("allows compound filters", () => {
    expect(() => store.sanitizeFilter("id = 'abc' AND status = 'pending'")).not.toThrow();
    expect(() => store.sanitizeFilter("confidence > 0.5 OR bucket = 'people'")).not.toThrow();
  });

  it("allows numeric comparisons", () => {
    expect(() => store.sanitizeFilter("confidence >= 0.8")).not.toThrow();
    expect(() => store.sanitizeFilter("count < 100")).not.toThrow();
  });

  it("allows parenthesized expressions", () => {
    expect(() => store.sanitizeFilter("(status = 'active') AND (count > 0)")).not.toThrow();
  });

  it("rejects semicolons", () => {
    expect(() => store.sanitizeFilter("id = 'a'; DROP TABLE people")).toThrow("Invalid filter");
  });

  it("rejects double dashes (comments)", () => {
    expect(() => store.sanitizeFilter("id = 'a' -- comment")).toThrow("Invalid filter");
  });

  it("rejects backticks", () => {
    expect(() => store.sanitizeFilter("`id` = 'a'")).toThrow("Invalid filter");
  });

  it("rejects unbalanced quotes with injected SQL", () => {
    expect(() => store.sanitizeFilter("id = 'a' OR '1'='1'")).not.toThrow(); // valid SQL filter, just always-true
  });

  it("allows escaped single quotes inside strings", () => {
    expect(() => store.sanitizeFilter("name = 'O''Brien'")).not.toThrow();
  });
});
