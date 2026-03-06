/**
 * Brain Core — Shared bucket record builder.
 *
 * Provides a skeleton record for a given bucket type, populated from
 * a title, description, and current timestamp. Used by both the
 * /fix command (inbox → bucket moves) and the router (classification-driven routing).
 *
 * The router adds classification-derived data (tags, nextActions, etc.) on top.
 */

// ============================================================================
// Core builder
// ============================================================================

/**
 * Build an empty skeleton bucket record with the common base fields filled in.
 *
 * @param bucket   - Target bucket name (e.g. "people", "projects")
 * @param title    - Record title / name
 * @param description - Body text / summary / context
 * @returns A plain record ready for store.create(), without id or vector
 */
export function buildEmptyBucketRecord(
  bucket: string,
  title: string,
  description: string,
): Record<string, unknown> {
  const now = new Date().toISOString();
  const emptyActions = "[]";
  const emptyTags = "[]";
  const entryNote = JSON.stringify([{ date: now, note: description }]);
  const base = { nextActions: emptyActions, entries: entryNote, tags: emptyTags };

  switch (bucket) {
    case "people":
      return {
        ...base,
        name: title,
        context: description,
        company: "",
        contactInfo: "",
        followUpDate: "",
        lastInteraction: now.split("T")[0],
      };
    case "projects":
      return {
        ...base,
        name: title,
        description,
        status: "active",
        blockers: "[]",
        relatedPeople: "[]",
        dueDate: "",
      };
    case "ideas":
      return {
        ...base,
        title,
        description,
        potential: "explore",
        relatedTo: "[]",
      };
    case "admin":
      return {
        ...base,
        title,
        category: "other",
        dueDate: "",
        recurring: "",
      };
    case "documents":
      return {
        ...base,
        title,
        summary: description,
        sourceUrl: "",
        filePath: "",
        relatedTo: "[]",
      };
    case "goals":
      return {
        ...base,
        title,
        description,
        timeframe: "medium-term",
        status: "active",
        milestones: "[]",
        relatedProjects: "[]",
      };
    case "health":
      return {
        ...base,
        title,
        category: "wellness",
        description,
        provider: "",
        followUpDate: "",
      };
    case "finance":
      return {
        ...base,
        title,
        category: "other",
        amount: 0,
        currency: "",
        dueDate: "",
        recurring: "",
      };
    default:
      return { ...base, title, description };
  }
}
