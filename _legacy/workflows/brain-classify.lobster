# Brain 2.0 — Classification pipeline
#
# Classify a raw inbox drop into a structured record and route
# to the correct bucket. Runs asynchronously after /drop capture.
#
# Full Phase 1 pipeline:
#   1. Fetch the inbox entry by ID
#   2. Classify via Anthropic API (Sonnet)
#   3. Check confidence (bouncer)
#   4. Route to bucket OR needs-review
#   5. Log audit trail
#
# Usage: lobster run brain-classify --inboxId <uuid>

name: brain-classify
description: >
  Classify a raw inbox drop into a structured record and route to the correct bucket.
  Runs asynchronously after /drop capture.

args:
  inboxId:
    description: "UUID of the inbox entry to classify"

steps:
  # Step 1: Fetch the raw inbox entry
  - id: fetch-drop
    command: >
      node ~/.openclaw/extensions/brain/cli.mjs fetch-inbox --id ${inboxId} --json

  # Step 2: Classify the thought via LLM (Sonnet)
  # This calls the Anthropic API through the CLI's classify subcommand
  # which handles the full classify → check-confidence → route pipeline
  - id: classify-and-route
    command: >
      node ~/.openclaw/extensions/brain/cli.mjs classify --id ${inboxId} --json

  # Step 3: Output the result
  - id: output
    command: >
      echo "Classification complete for inbox entry ${inboxId}"
