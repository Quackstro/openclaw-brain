import { describe, expect, it, vi } from "vitest";
import {
  handleRecall,
  formatRecallResults,
  formatRecallForContext,
} from "./recall.js";
import type { BrainStore, SearchResult } from "../store.js";
import type { EmbeddingProvider } from "../schemas.js";

// ============================================================================
// Mocks
// ============================================================================

function createMockEmbedder(): EmbeddingProvider {
  return {
    embed: vi.fn().mockResolvedValue(new Array(1536).fill(0.1)),
    embedBatch: vi.fn().mockResolvedValue([]),
    dim: 1536,
    name: "mock",
  };
}

function createMockStore(searchResults: Record<string, SearchResult[]> = {}): BrainStore {
  return {
    getBuckets: () => ["people", "projects", "ideas"],
    search: vi.fn().mockImplementation(async (bucket: string) => {
      return searchResults[bucket] ?? [];
    }),
  } as unknown as BrainStore;
}

// ============================================================================
// Tests: handleRecall
// ============================================================================

describe("handleRecall", () => {
  it("returns empty results when no matches found", async () => {
    const store = createMockStore();
    const embedder = createMockEmbedder();

    const result = await handleRecall(store, embedder, "find my notes");

    expect(result.query).toBe("find my notes");
    expect(result.results).toHaveLength(0);
    expect(result.totalFound).toBe(0);
  });

  it("returns results sorted by score across buckets", async () => {
    const store = createMockStore({
      people: [
        {
          record: { id: "p1", name: "Alice", summary: "Friend from work", tags: "[]", nextActions: "[]", entries: "[]" },
          score: 0.7,
        },
      ],
      projects: [
        {
          record: { id: "pr1", name: "Brain Plugin", description: "Memory system", tags: '["dev"]', nextActions: '["ship it"]', entries: "[]" },
          score: 0.9,
        },
      ],
    });
    const embedder = createMockEmbedder();

    const result = await handleRecall(store, embedder, "brain project");

    expect(result.results).toHaveLength(2);
    // Highest score first
    expect(result.results[0].title).toBe("Brain Plugin");
    expect(result.results[0].score).toBe(0.9);
    expect(result.results[0].bucket).toBe("projects");
    expect(result.results[1].title).toBe("Alice");
  });

  it("filters by minimum score", async () => {
    const store = createMockStore({
      ideas: [
        { record: { id: "i1", title: "Good idea", tags: "[]", nextActions: "[]", entries: "[]" }, score: 0.5 },
        { record: { id: "i2", title: "Bad match", tags: "[]", nextActions: "[]", entries: "[]" }, score: 0.05 },
      ],
    });
    const embedder = createMockEmbedder();

    const result = await handleRecall(store, embedder, "idea", { minScore: 0.1 });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].title).toBe("Good idea");
  });

  it("searches specific bucket when provided", async () => {
    const store = createMockStore({
      people: [
        { record: { id: "p1", name: "Bob", tags: "[]", nextActions: "[]", entries: "[]" }, score: 0.8 },
      ],
    });
    const embedder = createMockEmbedder();

    const result = await handleRecall(store, embedder, "Bob", { bucket: "people" });

    expect(store.search).toHaveBeenCalledTimes(1);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].bucket).toBe("people");
  });

  it("parses JSON tags and nextActions", async () => {
    const store = createMockStore({
      projects: [
        {
          record: {
            id: "pr1",
            name: "Test",
            tags: '["urgent", "dev"]',
            nextActions: '["review PR", "deploy"]',
            entries: '[]',
          },
          score: 0.9,
        },
      ],
    });
    const embedder = createMockEmbedder();

    const result = await handleRecall(store, embedder, "test");

    expect(result.results[0].tags).toEqual(["urgent", "dev"]);
    expect(result.results[0].nextActions).toEqual(["review PR", "deploy"]);
  });

  it("handles limit option", async () => {
    const store = createMockStore({
      ideas: [
        { record: { id: "1", title: "A", tags: "[]", nextActions: "[]", entries: "[]" }, score: 0.9 },
        { record: { id: "2", title: "B", tags: "[]", nextActions: "[]", entries: "[]" }, score: 0.8 },
        { record: { id: "3", title: "C", tags: "[]", nextActions: "[]", entries: "[]" }, score: 0.7 },
      ],
    });
    const embedder = createMockEmbedder();

    const result = await handleRecall(store, embedder, "ideas", { limit: 2 });

    expect(result.results).toHaveLength(2);
  });
});

// ============================================================================
// Tests: formatRecallResults
// ============================================================================

describe("formatRecallResults", () => {
  it("shows no results message for empty results", () => {
    const output = formatRecallResults({ query: "test", results: [], totalFound: 0 });
    expect(output).toContain("No results found");
    expect(output).toContain("test");
  });

  it("formats results with title, bucket, and score", () => {
    const output = formatRecallResults({
      query: "project",
      results: [
        {
          id: "1",
          bucket: "projects",
          title: "Brain Plugin",
          summary: "Memory system for OpenClaw",
          score: 0.92,
          tags: ["dev"],
          nextActions: ["ship it"],
        },
      ],
      totalFound: 1,
    });

    expect(output).toContain("Brain Plugin");
    expect(output).toContain("projects");
    expect(output).toContain("92%");
    expect(output).toContain("Memory system");
    expect(output).toContain("ship it");
    expect(output).toContain("dev");
  });
});

// ============================================================================
// Tests: formatRecallForContext
// ============================================================================

describe("formatRecallForContext", () => {
  it("returns empty string for no results", () => {
    expect(formatRecallForContext({ query: "x", results: [], totalFound: 0 })).toBe("");
  });

  it("formats compactly for system prompt injection", () => {
    const output = formatRecallForContext({
      query: "project",
      results: [
        {
          id: "1",
          bucket: "projects",
          title: "Brain Plugin",
          summary: "Memory system",
          score: 0.9,
          tags: [],
          nextActions: ["deploy"],
        },
      ],
      totalFound: 1,
    });

    expect(output).toContain("[projects] Brain Plugin");
    expect(output).toContain("Memory system");
    expect(output).toContain("deploy");
  });
});
