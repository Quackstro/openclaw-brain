# Brain 2.0 — Fix/correction pipeline (stub)
#
# Handle /fix commands — move items between buckets, update actions, merge.
#
# Full implementation in Phase 3.

name: brain-fix
description: >
  Process a /fix correction command.

args:
  itemId:
    description: "UUID of the item to fix"
  correction:
    description: "Correction instruction (e.g., '→ people', 'action: call them')"

steps:
  - id: fetch-item
    command: >
      node ~/.openclaw/extensions/brain/cli.mjs get --id ${itemId} --json

  # TODO Phase 3: Add fix logic steps
