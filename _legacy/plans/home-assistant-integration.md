# 🏠 Home Assistant Integration — Roadmap

**Author:** Jarvis · **Requested by:** Dr. Castro  
**Date:** 2026-02-01  
**Status:** Research Complete / Planning  
**Research:** `research/home-assistant-integration.md` (60KB detailed findings)  
**Depends on:** Raspberry Pi or Docker host for HA, Nabu Casa subscription ($7.50/mo)

---

## Overview

Integrate OpenClaw with Home Assistant to enable smart home control, TTS announcements on Google Home/Nest speakers, bidirectional event handling, and eventually voice-command routing ("Hey Google" → HA → OpenClaw).

### Recommended Architecture

```
┌─────────────────────┐         ┌──────────────────────────┐
│  OpenClaw (Cloud VPS)│◄──────►│  Home Assistant           │
│  - HA plugin         │  REST/ │  (Raspberry Pi at home)   │
│  - Event handler     │  WS    │  - Nabu Casa cloud bridge │
│  - TTS generator     │  API   │  - Google Home integration│
└─────────────────────┘         │  - Smart home devices     │
                                │  - Cameras, sensors, etc. │
                                └──────────────────────────┘
                                         │
                        ┌────────────────┼────────────────┐
                        ▼                ▼                ▼
                   Google Home      Smart Lights     Thermostat
                   Nest Speakers    Locks, Blinds    Cameras
```

**Key tech:** `home-assistant-js-websocket` (official, 0 deps) + Nabu Casa for remote access

---

## Phase 1: Foundation (Week 1-2)

**Goal:** Basic HA ↔ OpenClaw communication

- [ ] Set up Home Assistant (Raspberry Pi at home or Docker for testing)
- [ ] Subscribe to Nabu Casa ($7.50/mo) for remote cloud access
- [ ] Create `openclaw-ha` plugin skeleton using `home-assistant-js-websocket`
- [ ] Implement basic capabilities:
  - [ ] Get all entity states
  - [ ] Call services (lights, switches)
  - [ ] Send TTS to a speaker
- [ ] Configure: HA URL, Long-Lived Access Token, basic entity aliases
- [ ] Update `openclaw.plugin.json` with config schema
- [ ] **Test:** Verify round-trip communication from VPS → HA → device

**Deliverables:** Working plugin that can turn a light on/off and speak through a speaker.

---

## Phase 2: TTS & Announcements (Week 2-3)

**Goal:** OpenClaw speaks through home speakers

- [ ] TTS routing: map natural language room names to speaker entity IDs
  - "announce on the kitchen speaker" → `media_player.kitchen_display`
- [ ] Broadcast support: send announcements to ALL speakers simultaneously
  - Via GA SDK broadcast (non-interrupting — music keeps playing)
- [ ] Multiple TTS engines:
  - [ ] Google Translate TTS (free, basic)
  - [ ] Piper (local, fast, good quality)
  - [ ] OpenAI TTS (highest quality, costs)
- [ ] Pre-generated audio: serve OpenClaw's own TTS audio via HA media player
- [ ] **Test:** "Jarvis, announce on the living room speaker: dinner is ready"

**Deliverables:** Natural language TTS to any speaker or all speakers.

---

## Phase 3: Smart Home Control (Week 3-4)

**Goal:** Full device control via natural language

- [ ] Entity discovery: auto-discover available HA entities
- [ ] Natural language mapping: "turn off the bedroom lights" → `light.bedroom` service call
- [ ] Domain handlers:
  - [ ] Lights (on/off, brightness, color, scenes)
  - [ ] Climate (set temp, read current, HVAC mode)
  - [ ] Locks (lock/unlock with confirmation prompt)
  - [ ] Covers (blinds, garage doors)
  - [ ] Media players (play, pause, volume, what's playing)
- [ ] Safety layer: confirmation prompts for secure entities (locks, garage)
- [ ] State queries:
  - "What's the temperature?" → read thermostat
  - "Is the garage open?" → read cover state
  - "Who's home?" → presence detection
- [ ] **Test:** Full control of lights, thermostat, and media from Telegram

**Deliverables:** Natural language smart home control with safety guardrails.

---

## Phase 4: Bidirectional Events (Week 4-5)

**Goal:** HA notifies OpenClaw when things happen at home

- [ ] WebSocket subscriptions: subscribe to critical state changes
- [ ] Event handlers for:
  - [ ] Doorbell pressed → Telegram notification + optional camera snapshot
  - [ ] Motion detected (night) → alert with severity assessment
  - [ ] Person arrives/leaves home → presence notification
  - [ ] Temperature exceeds threshold → warning
  - [ ] Appliance finished (washer, dryer) → announcement
  - [ ] Door/window left open → reminder after N minutes
- [ ] Proactive alerts: route HA events to Telegram, speakers, or both
- [ ] HA automations: set up HA-side automations that call OpenClaw webhook
- [ ] **Test:** Motion event at front door → Telegram notification within 5s

**Deliverables:** Real-time home event notifications routed through OpenClaw.

---

## Phase 5: Conversation Agent (Week 5-6)

**Goal:** OpenClaw as the brain behind "Hey Google" and HA Assist

- [ ] Implement HA Conversation API integration (`/api/conversation/process`)
- [ ] Register OpenClaw as a custom conversation agent in HA
- [ ] Intent recognition: map HA intents to OpenClaw capabilities
- [ ] Custom voice commands: add OpenClaw-specific sentences
- [ ] Full voice flow: "Hey Google" → Google Home → HA → OpenClaw → HA → Speaker response
- [ ] **Test:** "Hey Google, ask the assistant what's on my calendar" → spoken response

**Deliverables:** Voice commands on Google Home speakers processed by OpenClaw.

---

## Phase 6: Creative Features (Ongoing)

**Goal:** The "wow" factor

- [ ] **Morning briefing** — "Good morning" triggers calendar, weather, commute, news through kitchen speaker
- [ ] **Security monitoring** — Camera snapshot → OpenClaw image analysis → alert level decision
- [ ] **Energy dashboard** — "How much power did we use this month?" with HA energy data
- [ ] **Guest mode** — "We have guests" → adjust lighting, unlock door, play music
- [ ] **Sleep automation** — Bed sensor detects sleep → set thermostat, lock doors, lights off
- [ ] **Context awareness** — Room presence via motion sensors → targeted responses to nearest speaker
- [ ] **Package detection** — Doorbell camera detects package → announce on speakers
- [ ] **Cooking assistant** — Timer management, recipe lookups through kitchen speaker

---

## Prerequisites & Costs

| Item | Cost | Notes |
|------|------|-------|
| Raspberry Pi 4/5 | ~$60-80 | One-time; runs HA at home |
| Nabu Casa subscription | $7.50/mo | Remote access, Google Home link |
| Google Home/Nest speaker(s) | Already owned? | For TTS output |
| Smart home devices | Varies | Lights, thermostat, etc. |

**Software (free):**
- Home Assistant OS (free, open source)
- `home-assistant-js-websocket` npm package (official, 0 deps)
- OpenClaw HA plugin (we build it)

---

## Key Decisions Needed (Dr. Castro)

- [ ] **Hardware:** Do you have a Raspberry Pi? Or prefer Docker on an existing machine?
- [ ] **Nabu Casa:** OK with $7.50/mo for cloud bridge?
- [ ] **Scope:** Start with Phase 1-2 (TTS + basics) and expand? Or plan all 6 phases upfront?
- [ ] **Priority:** Where does this fit relative to the RAG improvement pipeline?
- [ ] **Devices:** What Google Home / smart home devices do you currently have?

---

## References

- Research: `research/home-assistant-integration.md` (comprehensive 60KB doc)
- Research: `research/google-home-integration.md` (Google Home findings)
- HA Developer Docs: https://developers.home-assistant.io/
- HA REST API: https://developers.home-assistant.io/docs/api/rest/
- HA WebSocket API: https://developers.home-assistant.io/docs/api/websocket/
- Nabu Casa: https://www.nabucasa.com/
