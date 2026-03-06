import { describe, expect, it } from "vitest";
import {
  validateClassification,
  normalizeClassification,
  bucketToTable,
  buildClassificationPrompt,
} from "./classifier.js";

const DEFAULT_BUCKETS = ["people", "projects", "ideas", "admin", "documents", "goals", "health", "finance"];

describe("validateClassification", () => {
  it("returns no errors for a valid classification", () => {
    const valid = {
      bucket: "ideas",
      confidence: 0.9,
      title: "New plugin concept",
      summary: "An idea for a new plugin.",
      nextActions: ["research feasibility"],
      urgency: "someday",
      followUpDate: null,
      tags: ["idea"],
      detectedIntent: "none",
    };
    expect(validateClassification(valid)).toEqual([]);
  });

  it("reports error for non-object input", () => {
    expect(validateClassification(null)).toContain("Classification result must be an object");
    expect(validateClassification("string")).toContain("Classification result must be an object");
    expect(validateClassification(42)).toContain("Classification result must be an object");
  });

  it("reports missing bucket", () => {
    const result = { confidence: 0.8, title: "x", summary: "y", nextActions: [], urgency: "now" };
    expect(validateClassification(result)).toContain("Missing bucket");
  });

  it("reports missing confidence", () => {
    const result = { bucket: "ideas", title: "x", summary: "y", nextActions: [], urgency: "now" };
    expect(validateClassification(result)).toContain("Missing confidence");
  });

  it("reports missing title", () => {
    const result = { bucket: "ideas", confidence: 0.8, summary: "y", nextActions: [], urgency: "now" };
    expect(validateClassification(result)).toContain("Missing title");
  });

  it("reports missing summary", () => {
    const result = { bucket: "ideas", confidence: 0.8, title: "x", nextActions: [], urgency: "now" };
    expect(validateClassification(result)).toContain("Missing summary");
  });

  it("reports missing nextActions", () => {
    const result = { bucket: "ideas", confidence: 0.8, title: "x", summary: "y", urgency: "now" };
    expect(validateClassification(result)).toContain("Missing nextActions");
  });

  it("reports missing urgency", () => {
    const result = { bucket: "ideas", confidence: 0.8, title: "x", summary: "y", nextActions: [] };
    expect(validateClassification(result)).toContain("Missing urgency");
  });

  it("can report multiple errors at once", () => {
    const errors = validateClassification({});
    expect(errors.length).toBeGreaterThan(1);
  });
});

describe("normalizeClassification", () => {
  it("normalizes a complete raw classification", () => {
    const raw = {
      bucket: "ideas",
      confidence: 0.85,
      title: "Plugin concept",
      summary: "A concept.",
      nextActions: ["research"],
      entities: { people: ["Alice"], dates: [], amounts: [], locations: [] },
      urgency: "this-week",
      followUpDate: "2026-03-10",
      tags: ["idea", "plugin", "research"],
      detectedIntent: "todo",
    };
    const result = normalizeClassification(raw);
    expect(result.bucket).toBe("ideas");
    expect(result.confidence).toBe(0.85);
    expect(result.title).toBe("Plugin concept");
    expect(result.detectedIntent).toBe("todo");
    expect(result.entities.people).toEqual(["Alice"]);
  });

  it("clamps confidence to [0, 1]", () => {
    const raw = { bucket: "ideas", confidence: 1.5, title: "x", summary: "y", nextActions: [], urgency: "now", detectedIntent: "none" };
    const result = normalizeClassification(raw);
    expect(result.confidence).toBe(1);

    const raw2 = { ...raw, confidence: -0.5 };
    const result2 = normalizeClassification(raw2);
    expect(result2.confidence).toBe(0);
  });

  it("defaults detectedIntent to none for unknown values", () => {
    const raw = { bucket: "ideas", confidence: 0.5, title: "x", summary: "y", nextActions: [], urgency: "now", detectedIntent: "fly-to-moon" };
    const result = normalizeClassification(raw);
    expect(result.detectedIntent).toBe("none");
  });

  it("defaults detectedIntent to none when missing", () => {
    const raw = { bucket: "ideas", confidence: 0.5, title: "x", summary: "y", nextActions: [], urgency: "now" };
    const result = normalizeClassification(raw);
    expect(result.detectedIntent).toBe("none");
  });

  it("limits tags to 3", () => {
    const raw = { bucket: "ideas", confidence: 0.5, title: "x", summary: "y", nextActions: [], urgency: "now", detectedIntent: "none", tags: ["a", "b", "c", "d", "e"] };
    const result = normalizeClassification(raw);
    expect(result.tags).toHaveLength(3);
  });

  it("defaults missing entities to empty arrays", () => {
    const raw = { bucket: "ideas", confidence: 0.5, title: "x", summary: "y", nextActions: [], urgency: "now", detectedIntent: "none" };
    const result = normalizeClassification(raw);
    expect(result.entities.people).toEqual([]);
    expect(result.entities.dates).toEqual([]);
    expect(result.entities.amounts).toEqual([]);
    expect(result.entities.locations).toEqual([]);
  });

  it("preserves payment detectedIntent", () => {
    const raw = { bucket: "finance", confidence: 0.9, title: "Pay Alice", summary: "Send money.", nextActions: [], urgency: "now", detectedIntent: "payment" };
    const result = normalizeClassification(raw);
    expect(result.detectedIntent).toBe("payment");
  });
});

describe("bucketToTable", () => {
  it("returns the bucket directly when it matches", () => {
    expect(bucketToTable("ideas", DEFAULT_BUCKETS)).toBe("ideas");
    expect(bucketToTable("people", DEFAULT_BUCKETS)).toBe("people");
    expect(bucketToTable("finance", DEFAULT_BUCKETS)).toBe("finance");
  });

  it("maps singular to plural for known mappings", () => {
    expect(bucketToTable("person", DEFAULT_BUCKETS)).toBe("people");
    expect(bucketToTable("project", DEFAULT_BUCKETS)).toBe("projects");
    expect(bucketToTable("idea", DEFAULT_BUCKETS)).toBe("ideas");
    expect(bucketToTable("document", DEFAULT_BUCKETS)).toBe("documents");
    expect(bucketToTable("goal", DEFAULT_BUCKETS)).toBe("goals");
  });

  it("tries adding 's' for auto-pluralization", () => {
    const buckets = ["todos"];
    expect(bucketToTable("todo", buckets)).toBe("todos");
  });

  it("returns null for an unknown bucket", () => {
    expect(bucketToTable("unknown", DEFAULT_BUCKETS)).toBeNull();
    expect(bucketToTable("gibberish", DEFAULT_BUCKETS)).toBeNull();
  });
});

describe("buildClassificationPrompt", () => {
  it("includes the raw text in the prompt", () => {
    const prompt = buildClassificationPrompt("buy milk tomorrow");
    expect(prompt).toContain("buy milk tomorrow");
  });

  it("returns a non-empty string", () => {
    const prompt = buildClassificationPrompt("test input");
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(0);
  });
});
