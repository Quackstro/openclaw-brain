# Brain 2.0 — Digest generation pipeline
#
# Generate a scheduled digest from Brain stores.
# Steps: gather → format → check DND → send via Telegram
#
# Usage: lobster run brain-digest --type morning

name: brain-digest
description: >
  Generate a scheduled digest from Brain stores.
  Checks DND status before sending. Template-based for daily digests.

args:
  type:
    description: "morning|midday|afternoon|night|weekly"
  maxWords:
    default: "150"

steps:
  - id: check-dnd
    command: >
      node ~/.openclaw/extensions/brain/cli.mjs check-dnd --json

  - id: gather
    command: >
      node ~/.openclaw/extensions/brain/cli.mjs gather-digest --type ${type} --json
    condition: $check-dnd.json.quiet == false

  - id: format
    command: >
      node ~/.openclaw/extensions/brain/cli.mjs format-digest --type ${type} --max-words ${maxWords} --json
    stdin: $gather.stdout
    condition: $check-dnd.json.quiet == false

  # TODO: Send via a separate Telegram thread/bot in the future.
  # For now, sends to the main chat target.
  - id: send
    command: >
      openclaw message send --channel telegram --target 8511108690 --message "$format.json.digest"
    condition: $check-dnd.json.quiet == false
