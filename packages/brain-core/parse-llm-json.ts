/**
 * Brain Core — JSON-from-LLM parser.
 *
 * Shared utility for parsing JSON out of LLM responses.
 * Handles markdown fences and extracts the first valid JSON object.
 */

/**
 * Parse JSON from an LLM response string.
 *
 * Steps:
 * 1. Strip markdown code fences (```json ... ``` or ``` ... ```)
 * 2. Find the first `{` and its matching `}`
 * 3. Parse and return the JSON object, or null on failure
 */
export function parseJsonFromLlm(text: string): any {
  // Strip markdown fences
  let jsonStr = text
    .replace(/^```(?:json)?\s*\n?/m, "")
    .replace(/\n?```\s*$/m, "")
    .trim();

  // Extract the JSON object — find first { and its matching }
  const startIdx = jsonStr.indexOf("{");
  if (startIdx >= 0) {
    let depth = 0;
    let endIdx = startIdx;
    for (let i = startIdx; i < jsonStr.length; i++) {
      if (jsonStr[i] === "{") depth++;
      else if (jsonStr[i] === "}") depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
    jsonStr = jsonStr.slice(startIdx, endIdx + 1);
  }

  try {
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}
