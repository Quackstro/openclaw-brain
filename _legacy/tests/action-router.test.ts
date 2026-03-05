/**
 * Quick test for action-router shouldRoute() heuristic.
 */

import { shouldRoute } from "../action-router.js";
import type { ClassificationResult } from "../schemas.js";

const base: ClassificationResult = {
  bucket: "admin",
  confidence: 0.9,
  title: "Test",
  summary: "Test summary",
  nextActions: [],
  entities: { people: [], dates: [], amounts: [], locations: [] },
  urgency: "someday",
  followUpDate: null,
  tags: [],
};

let passed = 0;
let failed = 0;

function assert(label: string, actual: boolean, expected: boolean) {
  if (actual === expected) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}: expected ${expected}, got ${actual}`);
    failed++;
  }
}

console.log("shouldRoute() tests:\n");

assert("Generic thought → false", shouldRoute(base, "buy groceries"), false);
assert("Remind me → true", shouldRoute(base, "remind me to call the dentist"), true);
assert("At 3pm → true", shouldRoute(base, "meeting at 3pm"), true);
assert("At 10:30am → true", shouldRoute(base, "standup at 10:30am"), true);
assert("With followUpDate → true", shouldRoute({ ...base, followUpDate: "2025-01-15" }, "generic text"), true);
assert("Urgency now + dates → true", shouldRoute({ ...base, urgency: "now", entities: { ...base.entities, dates: ["2025-01-15"] } }, "do it now"), true);
assert("Urgency now, no dates → false", shouldRoute({ ...base, urgency: "now" }, "do this immediately"), false);
assert("Every Monday → true", shouldRoute(base, "review metrics every Monday"), true);
assert("By tomorrow → true", shouldRoute(base, "finish report by tomorrow"), true);
assert("At noon → true", shouldRoute(base, "lunch at noon"), true);
assert("Wake me → true", shouldRoute(base, "wake me at 7am"), true);
assert("Don't forget → true", shouldRoute(base, "don't forget the meeting tomorrow"), true);
assert("Dont forget → true", shouldRoute(base, "dont forget the meeting tomorrow"), true);
assert("Notify me → true", shouldRoute(base, "notify me when it's ready"), true);
assert("Turn on → true", shouldRoute(base, "turn on the lights at 8pm"), true);
assert("Random idea → false", shouldRoute(base, "maybe we should build a new feature"), false);
assert("At midnight → true", shouldRoute(base, "deploy at midnight"), true);
assert("Every morning → true", shouldRoute(base, "exercise every morning"), true);

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log("✅ All shouldRoute() tests passed!");
