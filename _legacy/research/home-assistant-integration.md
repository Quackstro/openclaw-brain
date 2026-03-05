# Home Assistant Integration Research for OpenClaw

**Date:** 2026-02-01  
**Status:** Deep-Dive Research  
**Author:** OpenClaw Research Agent  
**Builds on:** [Google Home Integration Research](./google-home-integration.md)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Home Assistant REST API](#2-home-assistant-rest-api)
3. [Home Assistant WebSocket API](#3-home-assistant-websocket-api)
4. [Authentication](#4-authentication)
5. [TTS & Announcements](#5-tts--announcements)
6. [Smart Home Control via OpenClaw](#6-smart-home-control-via-openclaw)
7. [Automations & Scenes](#7-automations--scenes)
8. [Bidirectional Integration (HA → OpenClaw)](#8-bidirectional-integration-ha--openclaw)
9. [Installation Options](#9-installation-options)
10. [Google Home + Home Assistant Together](#10-google-home--home-assistant-together)
11. [Creative Integration Ideas](#11-creative-integration-ideas)
12. [npm Packages & Libraries](#12-npm-packages--libraries)
13. [Architecture Proposal](#13-architecture-proposal)
14. [Comparison: Direct Cast vs Home Assistant Bridge](#14-comparison-direct-cast-vs-home-assistant-bridge)
15. [Recommended Implementation Roadmap](#15-recommended-implementation-roadmap)

---

## 1. Executive Summary

Home Assistant (HA) is the **ideal bridge** between OpenClaw and the physical smart home world. Our [Google Home research](./google-home-integration.md) identified HA as the most comprehensive integration path — this deep-dive confirms it and maps out exactly how to build it.

### Why Home Assistant?

- **2000+ integrations** — lights, thermostats, cameras, locks, speakers, sensors, and virtually every smart home device
- **Well-documented REST + WebSocket APIs** — perfect for server-side integration from OpenClaw
- **TTS to any speaker** — including Google Home/Nest speakers via Cast protocol
- **Broadcasts without interrupting playback** — via Google Assistant SDK integration
- **Bidirectional communication** — HA can call OpenClaw via webhooks when events happen
- **Conversation agent support** — OpenClaw can BE the brain behind HA's voice control
- **Google Home + Alexa exposure** — HA devices appear in both ecosystems
- **Huge community** — millions of users, active development, extensive documentation
- **Runs anywhere** — Raspberry Pi, Docker container, VM, or alongside OpenClaw on a VPS

### Bottom Line

A single HA integration gives OpenClaw control over the entire physical home. The recommended approach is:

1. **HA Container (Docker)** running on a Raspberry Pi at home or alongside OpenClaw on the VPS
2. **OpenClaw plugin** communicating via HA REST + WebSocket APIs
3. **Nabu Casa Cloud ($7.50/mo)** for seamless Google Home/Alexa integration and remote access
4. **Webhook automations** in HA that notify OpenClaw when events occur

---

## 2. Home Assistant REST API

**Base URL:** `http://<HA_IP>:8123/api/`  
**Auth:** `Authorization: Bearer <LONG_LIVED_ACCESS_TOKEN>`  
**Content-Type:** `application/json`

### Complete Endpoint Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/` | API health check — returns `{"message": "API running."}` |
| `GET` | `/api/config` | Current HA configuration (location, timezone, units, version) |
| `GET` | `/api/components` | List of all loaded integrations/components |
| `GET` | `/api/events` | Array of event types with listener counts |
| `GET` | `/api/services` | Array of available services grouped by domain |
| `GET` | `/api/states` | **All entity states** — the big one for reading the home |
| `GET` | `/api/states/<entity_id>` | State of a specific entity (e.g., `sensor.kitchen_temperature`) |
| `GET` | `/api/history/period/<timestamp>` | Historical state changes (filterable by entity, time range) |
| `GET` | `/api/logbook/<timestamp>` | Human-readable event log |
| `GET` | `/api/error_log` | Current session error log (plaintext) |
| `GET` | `/api/camera_proxy/<entity_id>` | Camera snapshot image (returns JPEG) |
| `GET` | `/api/calendars` | List of calendar entities |
| `GET` | `/api/calendars/<entity_id>` | Calendar events (requires `start` and `end` params) |
| `POST` | `/api/states/<entity_id>` | **Create/update** entity state (200 if exists, 201 if new) |
| `POST` | `/api/events/<event_type>` | **Fire an event** on the HA event bus |
| `POST` | `/api/services/<domain>/<service>` | ⭐ **Call a service** — the primary action endpoint |
| `POST` | `/api/template` | Render a Jinja2 template |
| `POST` | `/api/config/core/check_config` | Validate configuration.yaml |
| `POST` | `/api/intent/handle` | Handle a voice/text intent |
| `POST` | `/api/tts_get_url` | Generate TTS audio and get the URL |
| `POST` | `/api/conversation/process` | ⭐ **Process natural language** — key for OpenClaw as conversation agent |
| `DELETE` | `/api/states/<entity_id>` | Delete an entity |

### Key Endpoints for OpenClaw

#### 1. Call a Service (Most Used)
```bash
# Turn on a light
curl -X POST -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"entity_id": "light.living_room"}' \
  http://homeassistant:8123/api/services/light/turn_on

# Set thermostat temperature
curl -X POST -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"entity_id": "climate.main", "temperature": 72}' \
  http://homeassistant:8123/api/services/climate/set_temperature

# TTS announcement on a specific speaker
curl -X POST -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"entity_id": "media_player.kitchen_speaker", "message": "Dinner is ready!"}' \
  http://homeassistant:8123/api/services/tts/google_translate_say

# Broadcast to ALL speakers (via Google Assistant SDK)
curl -X POST -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"command": "broadcast dinner is ready"}' \
  http://homeassistant:8123/api/services/google_assistant_sdk/send_text_command
```

#### 2. Get Entity States (Reading the Home)
```bash
# Get all states
curl -H "Authorization: Bearer TOKEN" http://homeassistant:8123/api/states

# Get specific entity
curl -H "Authorization: Bearer TOKEN" \
  http://homeassistant:8123/api/states/sensor.living_room_temperature
# Returns: {"state": "72.5", "attributes": {"unit_of_measurement": "°F", ...}}
```

#### 3. Process Natural Language (Conversation API)
```bash
# Send natural language command
curl -X POST -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text": "turn on the kitchen lights", "language": "en"}' \
  http://homeassistant:8123/api/conversation/process
```

#### 4. Fire Custom Events
```bash
# Fire a custom event that HA automations can listen for
curl -X POST -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"openclaw_command": "morning_briefing"}' \
  http://homeassistant:8123/api/events/openclaw_trigger
```

### Service Call with Response Data

Some services return data. Add `?return_response` to the URL:

```bash
# Get weather forecast
curl -X POST -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"entity_id": "weather.home", "type": "daily"}' \
  "http://homeassistant:8123/api/services/weather/get_forecasts?return_response"
```

Returns both changed states AND service response data:
```json
{
  "changed_states": [...],
  "service_response": {
    "weather.home": {
      "forecast": [
        {"condition": "rainy", "temperature": 16.0, "templow": 4.0}
      ]
    }
  }
}
```

### Rate Limits & Performance

- **No official rate limits** on the REST API
- Responses are typically **< 100ms** on local network
- For high-frequency state polling, use the **WebSocket API** instead (see below)
- History endpoints can be slow for large date ranges — use `minimal_response` and `no_attributes` params
- The REST API is synchronous — service calls return when the action completes

---

## 3. Home Assistant WebSocket API

**URL:** `ws://<HA_IP>:8123/api/websocket`  
**Official JS Library:** `home-assistant-js-websocket` (maintained by HA team, 0 dependencies)

The WebSocket API is the **real-time counterpart** to the REST API. It's what the HA frontend uses, and it's ideal for OpenClaw to maintain a persistent connection.

### Connection Flow

```
1. Client connects → Server sends: {"type": "auth_required", "ha_version": "2026.1.3"}
2. Client sends:    {"type": "auth", "access_token": "TOKEN"}
3. Server sends:    {"type": "auth_ok", "ha_version": "2026.1.3"}
4. Command phase begins — client can send commands with incrementing IDs
```

### Available WebSocket Commands

| Command Type | Description | Key Use for OpenClaw |
|-------------|-------------|---------------------|
| `subscribe_events` | Subscribe to all or specific event types | Real-time state monitoring |
| `subscribe_trigger` | Subscribe to automation-style triggers | React to sensor changes |
| `unsubscribe_events` | Cancel a subscription | Cleanup |
| `fire_event` | Fire a custom event | Trigger HA automations |
| `call_service` | Call any HA service | Control devices |
| `get_states` | Dump all current states | Initial state load |
| `get_config` | Get HA configuration | Setup |
| `get_services` | List available services | Discovery |
| `get_panels` | List registered UI panels | |
| `ping` / `pong` | Heartbeat/keepalive | Connection health |
| `validate_config` | Validate trigger/condition/action configs | |
| `extract_from_target` | Resolve targets to entities/devices/areas | |
| `conversation/process` | Process natural language | ⭐ OpenClaw as conversation agent |

### Real-Time Event Subscription

```json
// Subscribe to all state changes
{"id": 1, "type": "subscribe_events", "event_type": "state_changed"}

// Receive events:
{
  "id": 1,
  "type": "event",
  "event": {
    "data": {
      "entity_id": "light.living_room",
      "new_state": {"state": "on", "attributes": {"brightness": 180}},
      "old_state": {"state": "off"}
    },
    "event_type": "state_changed"
  }
}
```

### Subscribe to Specific Triggers

This is extremely powerful — you can subscribe to the same trigger syntax used in HA automations:

```json
// Alert when motion is detected
{
  "id": 2,
  "type": "subscribe_trigger",
  "trigger": {
    "platform": "state",
    "entity_id": "binary_sensor.front_door_motion",
    "from": "off",
    "to": "on"
  }
}
```

### Calling Services via WebSocket

```json
{
  "id": 3,
  "type": "call_service",
  "domain": "light",
  "service": "turn_on",
  "service_data": {"color_name": "blue", "brightness": 200},
  "target": {"entity_id": "light.bedroom"}
}
```

### Feature: Coalesced Messages

Modern clients can enable message coalescing for better performance:
```json
{"id": 1, "type": "supported_features", "features": {"coalesce_messages": 1}}
```

### Why WebSocket for OpenClaw?

- **Real-time state updates** without polling
- **Persistent connection** with auto-reconnect
- **Event subscription** — know immediately when things change
- **Lower overhead** than repeated REST calls
- **Bidirectional** — perfect for the HA → OpenClaw direction

---

## 4. Authentication

### Long-Lived Access Tokens (Recommended for OpenClaw)

The simplest and most appropriate method for server-to-server communication.

**How to generate:**
1. Log into HA web UI → Go to Profile (bottom-left)
2. Scroll to "Long-Lived Access Tokens" section
3. Click "Create Token" → Give it a name (e.g., "OpenClaw Integration")
4. Copy the token immediately (it won't be shown again)

**Usage:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Properties:**
- Never expires (until manually revoked)
- Full API access (same as the user who created it)
- Can be revoked from the profile page
- One token per integration is best practice

### OAuth 2.0 (For User-Facing Flows)

HA supports OAuth 2.0 for scenarios where users need to authorize an app:
- Authorization URL: `https://<HA>/auth/authorize`
- Token URL: `https://<HA>/auth/token`

This would be relevant if we wanted end-users to connect their own HA instances to OpenClaw.

### Security Best Practices

- Store HA tokens in OpenClaw's encrypted config (never in code)
- Use HTTPS for remote connections (Nabu Casa provides this automatically)
- Create a dedicated HA user for OpenClaw with appropriate permissions
- Consider HA's built-in user permission system for restricting access

---

## 5. TTS & Announcements

This is one of the most exciting integration areas — giving OpenClaw a physical voice.

### TTS Architecture in Home Assistant

```
OpenClaw → HA REST API → TTS Engine → Audio URL → Media Player → Speaker
```

### Available TTS Engines

| Engine | Type | Quality | Speed | Cost | Notes |
|--------|------|---------|-------|------|-------|
| **Google Translate TTS** | Cloud | Good | Fast | Free | Default, uses Google Translate endpoint |
| **Google Cloud TTS** | Cloud | Excellent | Fast | Pay-per-use | 300+ voices, SSML, WaveNet/Neural2 |
| **Amazon Polly** | Cloud | Excellent | Fast | Pay-per-use | Neural voices, SSML |
| **Microsoft Edge TTS** | Cloud | Very Good | Fast | Free (HACS) | Uses Edge browser's TTS engine |
| **Piper** | Local | Very Good | Medium | Free | Open source, runs locally, many voices |
| **OpenAI TTS** | Cloud | Excellent | Fast | Pay-per-use | `tts-1` and `tts-1-hd` models |
| **Nabu Casa Cloud TTS** | Cloud | Very Good | Fast | Included ($7.50/mo) | Comes with HA Cloud subscription |
| **Elevenlabs** | Cloud | Premium | Fast | Pay-per-use | Ultra-realistic voices |

### Method 1: `tts.speak` (Modern — Recommended)

The modern approach using TTS entity targeting:

```yaml
# Via REST API
POST /api/services/tts/speak
{
  "entity_id": "tts.google_translate",
  "media_player_entity_id": "media_player.kitchen_speaker",
  "message": "Good morning! The weather today is sunny with a high of 75 degrees.",
  "language": "en"
}
```

### Method 2: `tts.<platform>_say` (Legacy but Widely Used)

```yaml
# TTS on a specific speaker
POST /api/services/tts/google_translate_say
{
  "entity_id": "media_player.living_room_speaker",
  "message": "Your package has been delivered at the front door."
}

# TTS on ALL media players
POST /api/services/tts/google_translate_say
{
  "entity_id": "all",
  "message": "Dinner is ready!"
}
```

### Method 3: Google Assistant SDK Broadcast (Non-Interrupting)

⭐ **This is the killer feature** — broadcast to all Google Home speakers **without stopping music/video playback**:

```yaml
# Broadcast via Google Assistant SDK
POST /api/services/google_assistant_sdk/send_text_command
{
  "command": "broadcast Coffee is ready"
}

# Or via the notify service
POST /api/services/notify/google_assistant_sdk
{
  "message": "Someone is at the front door",
  "target": "bedroom"  # Optional: target specific room
}
```

**Key difference:** Broadcasts use Google's native broadcast mechanism, which plays a chime and speaks the message over whatever is currently playing, then resumes playback.

### Method 4: Play Audio URL on Media Player

For pre-generated audio (e.g., from OpenClaw's own TTS):

```yaml
POST /api/services/media_player/play_media
{
  "entity_id": "media_player.kitchen_speaker",
  "media_content_type": "audio/mp3",
  "media_content_id": "http://openclaw-server:8080/tts/announcement.mp3"
}
```

### Targeted vs Broadcast

| Approach | Interrupts Playback? | Targeted? | Requires GA SDK? |
|----------|:-------------------:|:---------:|:----------------:|
| `tts.speak` / `tts.*_say` | ✅ Yes | ✅ Specific speaker | No |
| `tts.*_say` with `entity_id: all` | ✅ Yes | ❌ All speakers | No |
| GA SDK `broadcast` | ❌ No! | ❌ All speakers | Yes |
| GA SDK `broadcast` with room | ❌ No! | ✅ Specific room | Yes |
| `media_player.play_media` | ✅ Yes | ✅ Specific player | No |

### TTS REST API — Get Audio URL

You can also generate a TTS URL without playing it immediately:

```bash
POST /api/tts_get_url
{
  "engine_id": "tts.google_translate",
  "message": "Hello world"
}
# Returns: {"url": "http://homeassistant:8123/api/tts_proxy/abc123.mp3"}
```

This is useful for OpenClaw to generate TTS audio and serve/cache it independently.

### Audio Format Options

TTS supports preferred audio format configuration for compatibility:

```yaml
POST /api/services/tts/speak
{
  "entity_id": "tts.example",
  "media_player_entity_id": "media_player.kitchen",
  "message": "Hello world",
  "options": {
    "preferred_format": "mp3",
    "preferred_sample_rate": 44100
  }
}
```

**Note for Google Cast devices:** They require `http://<ip>:<port>` URLs (not hostnames) and reject self-signed certificates. Set HA's local URL to automatic for best results.

---

## 6. Smart Home Control via OpenClaw

Every device type below can be controlled via `POST /api/services/<domain>/<service>`.

### 🔆 Lights

```yaml
# Turn on
POST /api/services/light/turn_on
{"entity_id": "light.living_room"}

# Set brightness (0-255)
POST /api/services/light/turn_on
{"entity_id": "light.bedroom", "brightness": 128}

# Set color (RGB)
POST /api/services/light/turn_on
{"entity_id": "light.bedroom", "rgb_color": [255, 100, 0]}

# Set color temperature (in mireds, 153-500)
POST /api/services/light/turn_on
{"entity_id": "light.bedroom", "color_temp": 300}

# Turn off
POST /api/services/light/turn_off
{"entity_id": "light.living_room"}

# Toggle
POST /api/services/light/toggle
{"entity_id": "light.living_room"}
```

**Natural language mapping:**
- "Turn on the living room lights" → `light.turn_on` + entity lookup
- "Set bedroom lights to 50%" → `light.turn_on` + `brightness_pct: 50`
- "Make the lights blue" → `light.turn_on` + `color_name: blue`
- "Dim the kitchen lights" → `light.turn_on` + `brightness_step: -50`

### 🌡️ Thermostats / Climate

```yaml
# Set temperature
POST /api/services/climate/set_temperature
{"entity_id": "climate.main_thermostat", "temperature": 72}

# Set HVAC mode
POST /api/services/climate/set_hvac_mode
{"entity_id": "climate.main_thermostat", "hvac_mode": "cool"}
# Modes: off, heat, cool, heat_cool, auto, dry, fan_only

# Set fan mode
POST /api/services/climate/set_fan_mode
{"entity_id": "climate.main_thermostat", "fan_mode": "auto"}

# Read current state
GET /api/states/climate.main_thermostat
# Returns: state: "cool", attributes: {current_temperature: 74, temperature: 72, ...}
```

**Natural language mapping:**
- "Set the thermostat to 72" → `climate.set_temperature`
- "What's the temperature?" → `GET /api/states/sensor.indoor_temperature`
- "Turn on the AC" → `climate.set_hvac_mode` + `hvac_mode: cool`
- "Turn off the heat" → `climate.set_hvac_mode` + `hvac_mode: off`

### 🔒 Locks

```yaml
# Lock
POST /api/services/lock/lock
{"entity_id": "lock.front_door"}

# Unlock (⚠️ security-sensitive)
POST /api/services/lock/unlock
{"entity_id": "lock.front_door"}
```

**Safety considerations:**
- HA marks locks as "secure devices" — Google Home requires a PIN to unlock via voice
- OpenClaw should implement confirmation for unlock commands ("Are you sure you want to unlock the front door?")
- Consider requiring voice/text confirmation or limiting unlock to certain contexts (e.g., when user is confirmed at home)

### 📹 Cameras

```yaml
# Get snapshot
GET /api/camera_proxy/camera.front_door?time=<timestamp>
# Returns: JPEG image data

# Get stream URL (from entity attributes)
GET /api/states/camera.front_door
# Attributes include: stream_source, entity_picture

# Stream to a display (via Google Assistant SDK)
POST /api/services/google_assistant_sdk/send_text_command
{"command": "show front door camera on living room TV"}
```

**Creative use:** OpenClaw could take a camera snapshot, analyze it with vision AI, and describe what it sees — "There's a delivery person at your front door with a package."

### 🚗 Garage Doors

```yaml
# Open
POST /api/services/cover/open_cover
{"entity_id": "cover.garage_door"}

# Close
POST /api/services/cover/close_cover
{"entity_id": "cover.garage_door"}

# Stop
POST /api/services/cover/stop_cover
{"entity_id": "cover.garage_door"}

# Check state
GET /api/states/cover.garage_door
# Returns: state: "open" or "closed"
```

**Safety:** HA marks garage doors as "secure devices" — same PIN/confirmation considerations as locks.

### 🎵 Media Players

```yaml
# Play/Pause
POST /api/services/media_player/media_play
{"entity_id": "media_player.living_room"}

POST /api/services/media_player/media_pause
{"entity_id": "media_player.living_room"}

# Volume (0.0 to 1.0)
POST /api/services/media_player/volume_set
{"entity_id": "media_player.living_room", "volume_level": 0.5}

# Mute
POST /api/services/media_player/volume_mute
{"entity_id": "media_player.living_room", "is_volume_muted": true}

# Next/Previous track
POST /api/services/media_player/media_next_track
{"entity_id": "media_player.living_room"}

# Play specific media
POST /api/services/media_player/play_media
{
  "entity_id": "media_player.living_room",
  "media_content_type": "music",
  "media_content_id": "https://example.com/song.mp3"
}

# Check what's playing
GET /api/states/media_player.living_room
# Attributes: media_title, media_artist, media_album_name, volume_level, etc.
```

### 📊 Sensors (Read-Only)

```yaml
# Temperature
GET /api/states/sensor.outdoor_temperature
# Returns: {"state": "75.2", "attributes": {"unit_of_measurement": "°F"}}

# Humidity
GET /api/states/sensor.indoor_humidity
# Returns: {"state": "45", "attributes": {"unit_of_measurement": "%"}}

# Motion
GET /api/states/binary_sensor.living_room_motion
# Returns: {"state": "on"} (motion detected) or {"state": "off"}

# Door/Window
GET /api/states/binary_sensor.front_door
# Returns: {"state": "open"} or {"state": "closed"}

# Energy
GET /api/states/sensor.energy_daily
# Returns: {"state": "12.5", "attributes": {"unit_of_measurement": "kWh"}}
```

### 👤 Presence Detection

```yaml
# Check person state
GET /api/states/person.dr_castro
# Returns: {"state": "home"} or {"state": "not_home"} or zone name

# Check device tracker
GET /api/states/device_tracker.phone
# Returns: state + attributes with GPS coordinates, battery level, etc.
```

**Presence sources:** Phone GPS, WiFi presence, Bluetooth, router-based tracking, smart locks, motion sensors.

### 🤖 Vacuum Robots

```yaml
POST /api/services/vacuum/start
{"entity_id": "vacuum.roborock"}

POST /api/services/vacuum/stop
{"entity_id": "vacuum.roborock"}

POST /api/services/vacuum/return_to_base
{"entity_id": "vacuum.roborock"}

POST /api/services/vacuum/send_command
{"entity_id": "vacuum.roborock", "command": "app_goto_target", "params": [25500, 25500]}
```

### 🪟 Blinds / Curtains

```yaml
POST /api/services/cover/open_cover
{"entity_id": "cover.living_room_blinds"}

POST /api/services/cover/close_cover
{"entity_id": "cover.living_room_blinds"}

POST /api/services/cover/set_cover_position
{"entity_id": "cover.living_room_blinds", "position": 50}  # 0=closed, 100=open
```

---

## 7. Automations & Scenes

### Can OpenClaw Trigger HA Automations?

**Yes — three ways:**

#### 1. Fire an Event That Automations Listen For

```bash
# OpenClaw fires an event:
POST /api/events/openclaw_command
{"command": "morning_routine", "user": "dr_castro"}
```

HA automation that responds:
```yaml
automation:
  - alias: "OpenClaw Morning Routine"
    triggers:
      - trigger: event
        event_type: openclaw_command
        event_data:
          command: morning_routine
    actions:
      - action: scene.turn_on
        target:
          entity_id: scene.morning
      - action: tts.speak
        data:
          entity_id: tts.google_translate
          media_player_entity_id: media_player.kitchen_speaker
          message: "Good morning! Lights are on and coffee maker is starting."
```

#### 2. Call the `automation.trigger` Service Directly

```bash
POST /api/services/automation/trigger
{"entity_id": "automation.morning_routine"}
```

#### 3. Use the Webhook Trigger

HA automations can have webhook triggers — OpenClaw hits the webhook URL:

```bash
POST http://homeassistant:8123/api/webhook/openclaw-morning-routine
```

HA automation:
```yaml
automation:
  - alias: "OpenClaw Webhook Handler"
    triggers:
      - trigger: webhook
        webhook_id: openclaw-morning-routine
        allowed_methods: [POST]
        local_only: false
    actions:
      - action: scene.turn_on
        target:
          entity_id: scene.morning
```

### Can OpenClaw Create/Modify Automations?

**Partially.** The WebSocket API provides internal commands for managing automations (used by the HA frontend), but this is not officially documented for external use. The practical approach:

- **Trigger existing automations** — Yes, easily
- **Create new automations via config** — Would require writing to HA's configuration files
- **Enable/disable automations** — Yes: `automation.turn_on` / `automation.turn_off`
- **Dynamically create via WebSocket** — Possible but uses internal APIs

### Scene Activation

Scenes are perfect for OpenClaw — they represent named states for multiple devices.

```bash
# Activate a scene
POST /api/services/scene/turn_on
{"entity_id": "scene.movie_time"}

# Some built-in scenes:
# scene.movie_time     → Dim lights, turn on TV, close blinds
# scene.goodnight      → Turn off all lights, lock doors, set thermostat to night mode
# scene.work_mode      → Bright office lights, mute speakers, set focus mode
# scene.party          → Colorful lights, music, turn up volume
```

**Natural language mapping:**
- "Movie time" → `scene.turn_on` scene.movie_time
- "Goodnight" → `scene.turn_on` scene.goodnight
- "I'm heading out" → `scene.turn_on` scene.away

### Can HA Trigger OpenClaw?

**Yes! This is the key bidirectional feature.** See next section.

---

## 8. Bidirectional Integration (HA → OpenClaw)

This is where things get truly powerful. HA doesn't just respond to OpenClaw — it can **proactively notify** OpenClaw when things happen.

### Method 1: REST Command (HA Calls OpenClaw's API)

Configure HA to call OpenClaw when events occur:

```yaml
# In HA's configuration.yaml
rest_command:
  notify_openclaw:
    url: "https://openclaw-server.com/api/webhook/ha-event"
    method: POST
    headers:
      Authorization: "Bearer OPENCLAW_TOKEN"
      Content-Type: "application/json"
    payload: '{"event": "{{ event_type }}", "data": {{ data | tojson }}}'

# Then use in automations:
automation:
  - alias: "Doorbell → OpenClaw"
    triggers:
      - trigger: state
        entity_id: binary_sensor.doorbell
        to: "on"
    actions:
      - action: rest_command.notify_openclaw
        data:
          event_type: doorbell_pressed
          data:
            location: "front_door"
            timestamp: "{{ now().isoformat() }}"
```

### Method 2: HA Webhooks → OpenClaw

HA automations can make HTTP calls to OpenClaw when triggered by events:

#### Example Events OpenClaw Could React To:

| Event | HA Trigger | OpenClaw Action |
|-------|-----------|-----------------|
| Motion at front door | `binary_sensor.front_door_motion` → on | Send Telegram alert + camera snapshot analysis |
| Doorbell pressed | `binary_sensor.doorbell` → on | Announce "Someone's at the door" + camera snapshot |
| Temperature too high | `sensor.indoor_temp` > 85°F | Alert user + suggest turning on AC |
| Washing machine done | `sensor.washer_power` < 5W (for 5 min) | Announce "Laundry is done!" |
| Person arrives home | `person.dr_castro` → "home" | "Welcome home!" + turn on lights + adjust thermostat |
| Person leaves home | `person.dr_castro` → "not_home" | Lock doors + set away mode |
| Garage door left open | `cover.garage` → open for 30 min | Alert: "Your garage door has been open for 30 minutes" |
| Water leak detected | `binary_sensor.water_leak` → on | 🚨 Emergency alert on all channels |
| Low battery sensor | `sensor.lock_battery` < 20% | "Your front door lock battery is getting low" |
| Smoke/CO detector | `binary_sensor.smoke` → on | 🚨 Emergency: call + alert all speakers |

### Method 3: WebSocket Event Subscription (Continuous)

OpenClaw maintains a WebSocket connection and subscribes to events:

```javascript
// OpenClaw subscribes to all state changes
ws.send(JSON.stringify({
  id: 1,
  type: "subscribe_events",
  event_type: "state_changed"
}));

// Process incoming events
ws.on('message', (data) => {
  const msg = JSON.parse(data);
  if (msg.type === 'event') {
    const { entity_id, new_state } = msg.event.data;
    
    if (entity_id === 'binary_sensor.doorbell' && new_state.state === 'on') {
      // OpenClaw handles doorbell event
      handleDoorbellPress();
    }
  }
});
```

### Method 4: OpenClaw as HA Conversation Agent 🌟

This is perhaps the most exciting possibility. Home Assistant supports **custom conversation agents** — OpenClaw could be the AI brain behind HA's Assist voice assistant.

**How it works:**

1. User speaks to a voice device (Google Home, HA Voice PE, phone)
2. Speech-to-text converts to text
3. HA sends the text to the conversation agent (OpenClaw)
4. OpenClaw processes the intent, potentially calling HA services
5. OpenClaw returns a response
6. HA speaks the response via TTS

**The `/api/conversation/process` endpoint:**

```bash
POST /api/conversation/process
{
  "text": "What's the weather like and should I bring an umbrella?",
  "language": "en",
  "agent_id": "conversation.openclaw"  # Custom agent ID
}

# Response:
{
  "response": {
    "response_type": "query_answer",
    "speech": {
      "plain": {
        "speech": "It's currently 68°F and partly cloudy. Rain is expected this afternoon with a 60% chance, so yes, definitely bring an umbrella!"
      }
    }
  },
  "conversation_id": "abc123"
}
```

**Implementation approaches for OpenClaw as conversation agent:**

1. **HA OpenAI Conversation integration** — HA already has an OpenAI integration that acts as a conversation agent. OpenClaw could potentially register as a similar custom integration.

2. **External conversation agent via REST** — Build a custom HA integration that proxies conversation to OpenClaw's API.

3. **Intent Script + REST Command** — For simpler cases, use HA's intent_script to forward specific intents to OpenClaw.

**Custom sentences in HA that trigger OpenClaw:**

```yaml
# config/custom_sentences/en/openclaw.yaml
language: "en"
intents:
  OpenClawQuery:
    data:
      - sentences:
          - "ask jarvis {query}"
          - "tell jarvis {query}"
          - "jarvis {query}"

# config/configuration.yaml
intent_script:
  OpenClawQuery:
    action:
      - action: rest_command.ask_openclaw
        data:
          query: "{{ query }}"
        response_variable: openclaw_response
    speech:
      text: "{{ openclaw_response.content.answer }}"
```

### HA Notifications → OpenClaw

HA has a powerful notification system. Instead of (or in addition to) sending to phone:

```yaml
# Send notification to OpenClaw instead of/alongside phone
automation:
  - alias: "Security Alert"
    triggers:
      - trigger: state
        entity_id: binary_sensor.front_door_motion
        to: "on"
    conditions:
      - condition: state
        entity_id: person.dr_castro
        state: "not_home"
    actions:
      # Notify phone
      - action: notify.mobile_app_phone
        data:
          title: "Motion Detected"
          message: "Motion at the front door while you're away"
      # Notify OpenClaw (which can then forward to Telegram, etc.)
      - action: rest_command.notify_openclaw
        data:
          event_type: "security_alert"
          data:
            type: "motion"
            location: "front_door"
            severity: "medium"
```

---

## 9. Installation Options

### Comparison Table

| Option | Complexity | Add-ons | Hardware | Remote Access | Resources | Best For |
|--------|:----------:|:-------:|----------|:-------------:|-----------|----------|
| **HA OS (Raspberry Pi)** | 🟢 Easy | ✅ Yes | RPi 4/5, 2GB+ RAM | Via Nabu Casa | Low (2GB RAM, 32GB SD) | Home deployment |
| **HA OS (VM/VPS)** | 🟡 Medium | ✅ Yes | VM, 2+ vCPU, 2GB+ RAM | Via Nabu Casa | Medium | Co-located with OpenClaw |
| **HA Container (Docker)** | 🟡 Medium | ❌ No | Any Linux with Docker | Manual/Nabu Casa | Low-Medium | VPS/server deployment |
| **HA OS (x86-64)** | 🟡 Medium | ✅ Yes | Old laptop/NUC/mini-PC | Via Nabu Casa | Low-Medium | Dedicated home hub |
| **HA Core (Python venv)** | 🔴 Hard | ❌ No | Any Python 3.12+ system | Manual | Low | Development only |

### Option A: Raspberry Pi at Home (Recommended for Smart Home)

**Best for:** Full smart home integration with local device access.

**Requirements:**
- Raspberry Pi 4 or 5 (2GB+ RAM, 4GB recommended)
- 32GB+ microSD card (or SSD via USB for better performance)
- Ethernet connection (WiFi possible but less reliable)
- Power supply
- **Cost: ~$60-100 for Pi + accessories**

**Pros:**
- Dedicated device, always on
- Full add-on support (Zigbee, Z-Wave, Bluetooth, etc.)
- Local network access to Cast devices, IoT devices
- Low power consumption (~5W)
- Easy setup with HA OS image

**Cons:**
- Requires physical hardware at home
- Network access needed from OpenClaw (Nabu Casa solves this)
- Limited compute for intensive add-ons

**Setup:**
1. Flash HA OS to SD card using Raspberry Pi Imager
2. Boot Pi, connect Ethernet
3. Access at `http://homeassistant.local:8123`
4. Complete onboarding wizard
5. Subscribe to Nabu Casa for remote access ($7.50/mo)
6. Configure OpenClaw with HA Cloud remote URL

### Option B: Docker Container on VPS (Alongside OpenClaw)

**Best for:** Cloud-first deployment where OpenClaw VPS is the main server.

**Docker Compose:**
```yaml
services:
  homeassistant:
    container_name: homeassistant
    image: "ghcr.io/home-assistant/home-assistant:stable"
    volumes:
      - /home/clawdbot/ha-config:/config
      - /etc/localtime:/etc/localtime:ro
    restart: unless-stopped
    privileged: true
    network_mode: host
    environment:
      TZ: America/New_York  # Adjust to user's timezone
```

**Resource Requirements:**
- 1-2 vCPU
- 1-2 GB RAM (minimum 512MB, recommended 2GB)
- 2-5 GB disk space
- Can comfortably run alongside OpenClaw

**Pros:**
- Same server as OpenClaw — minimal latency
- No extra hardware needed
- Easy to manage alongside OpenClaw

**Cons:**
- No add-on support (no Zigbee, Z-Wave, Bluetooth)
- Can't access local network devices (Cast, etc.) unless VPS is on home network
- If VPS is remote, needs Nabu Casa or VPN for home device access

**Recommended only if:** OpenClaw runs on a server at home on the same LAN as smart devices.

### Option C: HA OS in a VM on VPS

Similar to Docker but with full add-on support:

```bash
# Download KVM image
wget https://github.com/home-assistant/operating-system/releases/download/17.0/haos_ova-17.0.qcow2.xz
xz -d haos_ova-17.0.qcow2.xz

# Create VM (requires KVM support on VPS)
virt-install --name haos \
  --description "Home Assistant OS" \
  --os-variant=generic \
  --ram=2048 --vcpus=2 \
  --disk haos_ova-17.0.qcow2,bus=scsi \
  --controller type=scsi,model=virtio-scsi \
  --import --graphics none --boot uefi
```

### Nabu Casa Cloud ($7.50/month)

Nabu Casa is the commercial arm of Home Assistant, offering:

- **Remote access** — Secure tunnel to your HA instance (no port forwarding)
- **Google Assistant integration** — Seamless, no manual Cloud-to-cloud setup
- **Alexa integration** — Same seamless setup
- **Cloud TTS** — High-quality text-to-speech
- **Cloud webhooks** — Trigger automations from the internet
- **Supports HA development** — Funds the open-source project

**For our use case:** Nabu Casa is almost essential. It provides:
1. Remote API access from OpenClaw (wherever it runs) to HA (at home)
2. Google Home integration without complex manual setup
3. Reliable, encrypted connection

### Recommended Setup

```
┌─────────────────────┐    ┌──────────────────────────────┐
│  VPS (Cloud)         │    │  Home (Raspberry Pi)          │
│                      │    │                                │
│  ┌────────────────┐  │    │  ┌───────────────────────┐    │
│  │   OpenClaw     │──┼────┼──│  Home Assistant OS     │    │
│  │   Gateway      │  │    │  │  + Nabu Casa Cloud     │    │
│  └────────────────┘  │    │  │  + Google Cast          │    │
│                      │    │  │  + GA SDK               │    │
│  Connection via      │    │  │  + Zigbee/Z-Wave (opt)  │    │
│  Nabu Casa Cloud URL │    │  └──────────┬────────────┘    │
│  (https://xxx.       │    │             │                  │
│   ui.nabu.casa)      │    │  ┌──────────┴────────────┐    │
└─────────────────────┘    │  │  Smart Home Devices     │    │
                           │  │  • Google Home speakers  │    │
                           │  │  • Lights (Hue, LIFX)    │    │
                           │  │  • Thermostat (Nest)     │    │
                           │  │  • Cameras               │    │
                           │  │  • Locks                  │    │
                           │  │  • Sensors               │    │
                           │  └──────────────────────────┘    │
                           └──────────────────────────────────┘
```

---

## 10. Google Home + Home Assistant Together

### How It Works

```
"Hey Google, turn off the bedroom lights"
         │
         ▼
   Google Cloud
         │
         ▼ (Cloud-to-cloud or Nabu Casa)
   Home Assistant
         │
         ▼
   light.turn_off → light.bedroom
         │
         ▼
   Actual light turns off (via Zigbee/WiFi/Z-Wave)
```

### HA Google Assistant Integration

Exposes HA entities as Google Home devices. Supported entity types:

- `alarm_control_panel` — Arm/disarm security systems
- `camera` — Streaming to displays
- `climate` — Temperature, HVAC mode
- `cover` — Blinds, garage doors, curtains
- `event` — Doorbell events
- `fan` — On/off, speed, preset modes
- `humidifier` — Humidity setting, modes
- `input_boolean` — Virtual switches
- `light` — On/off, brightness, color, color temp
- `lock` — Lock/unlock (with PIN for security)
- `media_player` — On/off, volume, source, playback
- `scene` — Activate scenes
- `script` — Run scripts as scenes
- `sensor` — Temperature and humidity readings
- `switch` — On/off
- `vacuum` — Start, stop, dock
- `valve` — Open/close
- `water_heater` — Temperature, modes

### Setup Paths

#### With Nabu Casa (Recommended — $7.50/mo)

1. Subscribe to Nabu Casa at nabucasa.com
2. In HA → Settings → Home Assistant Cloud → Log in
3. Under Google Assistant → Enable
4. Choose which entities to expose
5. "Hey Google, sync my devices" — done!

**No port forwarding, no SSL certificates, no Google Cloud project needed.**

#### Manual Setup (Free but Complex)

1. Create Google Cloud project at console.home.google.com
2. Set up Cloud-to-cloud integration
3. Configure OAuth account linking
4. Set up service account for HomeGraph API
5. Configure SSL certificates and external access
6. Add `google_assistant:` to configuration.yaml
7. Link in Google Home app

### Local Fulfillment (Fast Response)

HA supports local fulfillment — Google Home devices send commands **directly to HA on the local network** instead of round-tripping through the cloud:

- **Latency:** ~200ms (local) vs ~800ms (cloud)
- **Requirements:** HA and Google Home on same network, mDNS enabled
- **Fallback:** Automatically falls back to cloud if local fails

### Google Assistant SDK Integration (HA → Google)

This goes the other direction — HA sends commands TO Google Assistant:

```yaml
# Play rain sounds on bedroom speaker (via Google)
POST /api/services/google_assistant_sdk/send_text_command
{"command": "play rain sounds on bedroom speaker"}

# Stream camera to TV
POST /api/services/google_assistant_sdk/send_text_command
{"command": "show front door camera on living room TV"}

# Broadcast to all speakers
POST /api/services/google_assistant_sdk/send_text_command
{"command": "broadcast dinner is ready"}

# Get info from Google
POST /api/services/google_assistant_sdk/send_text_command
{
  "command": "what's the weather tomorrow",
  "media_player": "media_player.kitchen_speaker"
}
```

**Key limitations of GA SDK:**
- Multiple Google accounts not supported
- Media playback commands (beyond news/podcasts/white noise) often don't work
- Routines can't be triggered
- Voice match commands don't work
- Broadcast to specific rooms sometimes fails in non-English

---

## 11. Creative Integration Ideas

### 🌅 Morning Briefing

**Trigger:** "Good morning" via Google Home, HA automation, or scheduled time

**OpenClaw Flow:**
1. HA detects person wakes up (bed sensor, motion in bedroom, or voice command)
2. HA triggers OpenClaw webhook
3. OpenClaw gathers: calendar events, weather forecast, commute time, news headlines
4. OpenClaw generates TTS briefing
5. HA plays briefing on kitchen speaker
6. HA also runs scene: lights to warm white, coffee maker on, blinds open

```yaml
# HA Automation
automation:
  - alias: "Morning Briefing"
    triggers:
      - trigger: state
        entity_id: binary_sensor.bedroom_motion
        to: "on"
    conditions:
      - condition: time
        after: "06:00"
        before: "10:00"
    actions:
      - action: rest_command.get_openclaw_briefing
      - action: scene.turn_on
        entity_id: scene.morning
```

### 🧠 Context-Aware Responses

OpenClaw knows the state of the home and adapts:

- **"What's going on at home?"** → OpenClaw queries HA states, reports: "It's 72°F inside, all lights are off, the garage door is closed, and your Roomba is charging at 85%."
- **Room awareness:** Motion sensors tell OpenClaw which room you're in → TTS plays in that room
- **Away mode:** If `person.dr_castro` is `not_home`, OpenClaw can give security-focused updates

### ⚠️ Proactive Alerts

HA fires events → OpenClaw decides severity and response:

| Trigger | Response |
|---------|----------|
| Garage open > 30 min | Telegram + speaker announcement |
| Temperature > 90°F | "Your house is getting warm. Want me to turn on the AC?" |
| Smoke detector triggered | 🚨 All speakers, all notification channels, emergency protocol |
| Water leak sensor | 🚨 All speakers + auto-close water valve if available |
| Front door unlocked > 10 min | "Your front door has been unlocked for 10 minutes" |
| Low battery on device | "Your front door lock battery is at 15%" |

### 📊 Energy Monitoring

```
User: "How much power did we use this month?"
OpenClaw → HA energy dashboard data → 
"You've used 450 kWh this month, which is about $67. That's 12% more than last 
month. Your HVAC is the biggest consumer at 180 kWh. Want me to suggest ways to 
reduce energy usage?"
```

### 🔐 AI-Powered Security

```
1. Motion detected at night → HA fires event
2. OpenClaw requests camera snapshot from HA
3. OpenClaw analyzes image with vision AI
4. Decision tree:
   - Person recognized → "Dr. Castro is at the front door" (low alert)
   - Unknown person → Photo + alert to Telegram (medium alert)
   - Nobody visible → "Motion detected but no person seen. Probably an animal." (low alert)
   - Multiple people → "Multiple people detected at front door" (high alert)
```

### 🗣️ Voice-Controlled Development

```
"Hey Google, tell Jarvis to check the build status"
→ Google Home → HA → webhook → OpenClaw
→ OpenClaw checks CI/CD pipeline
→ "The main branch build passed 20 minutes ago. All 847 tests passing. 
   The staging deployment completed successfully."
→ HA → TTS on speaker
```

### 😴 Sleep Automation

```
Bed pressure sensor detects sleep →
HA automation fires →
- Set thermostat to 67°F
- Lock all doors
- Close garage door
- Turn off all lights
- Set alarm for 7 AM
- Notify OpenClaw → "All secured for the night"
```

### 📦 Package Delivery Detection

```
1. Doorbell camera detects motion during delivery hours
2. HA sends snapshot to OpenClaw
3. OpenClaw vision analysis: "Package detected on doorstep"
4. OpenClaw via HA: TTS on nearest speaker + Telegram notification
   "A package was just delivered at your front door"
```

### 🎉 Guest Mode

```
"Jarvis, we have guests coming"
→ OpenClaw → HA:
  - Adjust lighting to warm, inviting scene
  - Set thermostat to 72°F
  - Play ambient music on living room speaker at low volume
  - Unlock front door (with confirmation)
  - Disable security motion alerts for common areas
  - "Guest mode activated. I've set the lights, music, and temperature. 
     The front door is unlocked."
```

### 🐕 Pet Monitoring

```
When person.dr_castro = "not_home":
  - Increase motion sensor monitoring in common areas
  - On motion: take camera snapshot → analyze for pet activity
  - "Your dog has been active in the living room. Want to see the camera?"
  - Track activity patterns over time
  - Alert if no activity for unusually long periods
```

### 🍳 Kitchen Assistant

```
"Jarvis, set a timer for 12 minutes for pasta"
→ OpenClaw → HA → input_datetime helper or script
→ After 12 minutes: "Your pasta timer is done!"
→ Kitchen speaker TTS

"Jarvis, what can I make with chicken and rice?"
→ OpenClaw processes recipe query
→ Reads recipe steps via TTS when asked
→ Manages multiple timers
```

---

## 12. npm Packages & Libraries

### Tier 1: Official / Well-Maintained

#### `home-assistant-js-websocket` (Official HA Library)

- **Repo:** [github.com/home-assistant/home-assistant-js-websocket](https://github.com/home-assistant/home-assistant-js-websocket)
- **Maintained by:** Home Assistant team (official)
- **Dependencies:** 0 (zero!)
- **Features:**
  - Full WebSocket API client
  - OAuth2 authentication flow
  - Auto-reconnect with suspend/resume
  - Entity/config/service subscriptions with collections
  - Built-in state management
  - Works in Node.js and browser
  - TypeScript support

```javascript
import {
  createConnection,
  subscribeEntities,
  callService,
  createLongLivedTokenAuth,
} from "home-assistant-js-websocket";

// Connect with long-lived token (ideal for OpenClaw)
const auth = createLongLivedTokenAuth("http://homeassistant:8123", "TOKEN");
const connection = await createConnection({ auth });

// Subscribe to all entity state changes
subscribeEntities(connection, (entities) => {
  console.log("Entity update:", entities);
});

// Call a service
await callService(connection, "light", "turn_on", {}, { entity_id: "light.living_room" });
```

**⭐ This is the recommended library for OpenClaw integration.**

### Tier 2: Community Libraries

#### `homeassistant-ws` (v0.2.5)

- **npm:** [homeassistant-ws](https://www.npmjs.com/package/homeassistant-ws)
- **Repo:** [github.com/filp/homeassistant-ws](https://github.com/filp/homeassistant-ws)
- **Last updated:** September 2025
- **Status:** Active, minimalist
- **Features:**
  - Minimalist WebSocket client
  - Works in Node.js and browser
  - Get states, services, panels, config
  - Call services
  - Event subscription (`state_changed`, etc.)
  - Camera/media player thumbnails

```javascript
import hass from 'homeassistant-ws';

const client = await hass({ token: 'my-token', host: 'homeassistant.local' });

// Get all states
const states = await client.getStates();

// Call a service
await client.callService('light', 'turn_on', { entity_id: 'light.living_room' });

// Listen for state changes
client.on('state_changed', (event) => {
  console.log(`${event.data.entity_id}: ${event.data.new_state.state}`);
});
```

**Good alternative if you want something simpler than the official library.**

#### `homeassistant` (v0.2.0)

- **npm:** [homeassistant](https://www.npmjs.com/package/homeassistant)
- **Repo:** [github.com/mririgoyen/homeassistant_node](https://github.com/mririgoyen/homeassistant_node)
- **Last updated:** 2019
- **Status:** Stable but unmaintained
- **Features:** REST API wrapper (not WebSocket)

```javascript
const HomeAssistant = require('homeassistant');
const hass = new HomeAssistant({
  host: 'http://homeassistant.local',
  port: 8123,
  token: 'my-long-lived-token'
});

// Call a service
await hass.services.call('turn_on', 'light', 'living_room');

// Get states
const states = await hass.states.list();
const temp = await hass.states.get('sensor', 'temperature');

// Fire events
await hass.events.fire('openclaw_event', { command: 'morning_briefing' });

// Get camera image
const image = await hass.camera.image('camera.front_door');

// Render template
const result = await hass.templates.render('Temperature is {{ states("sensor.temp") }}');
```

**Useful for REST-only needs, but hasn't been updated since 2019.**

#### `node-homeassistant` (v1.6.0)

- **npm:** [node-homeassistant](https://www.npmjs.com/package/node-homeassistant)
- **Last updated:** 2019
- **Status:** Stable but unmaintained
- **Features:** WebSocket-based, basic operations

### Tier 3: MCP (Model Context Protocol) Servers

Interesting for the AI integration angle:

#### `@jango-blockchained/homeassistant-mcp` (v1.2.0)

- **Description:** Home Assistant MCP server for AI assistants
- **Features:** Entity management, device control, smart prompt generation
- **Use case:** Provides a bridge specifically for AI agents to control HA
- **Updated:** November 2025

#### `@lishiguang1984/homeassistant-mcp-server` (v1.2.1)

- **Description:** Similar MCP server for HA integration
- **Updated:** November 2025

**These MCP servers demonstrate the growing trend of AI ↔ HA integration — exactly what we're building with OpenClaw.**

### Recommended Stack for OpenClaw

```
Primary:     home-assistant-js-websocket  (official, WebSocket, real-time)
Fallback:    Native fetch/axios           (REST API for simple calls)
Alternative: homeassistant-ws             (if simpler API is preferred)
```

---

## 13. Architecture Proposal

### Plugin Architecture

The HA integration should be an **OpenClaw plugin** (not a skill or channel) because:

- It's infrastructure (connects to external service)
- It provides capabilities used by multiple skills
- It needs persistent connection (WebSocket)
- It manages configuration/auth

### Proposed Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        OpenClaw                              │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              HA Plugin (openclaw-ha)                   │   │
│  │                                                        │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │   │
│  │  │  WS Client   │  │  REST Client │  │  Event      │  │   │
│  │  │  (real-time)  │  │  (commands)  │  │  Handler    │  │   │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬─────┘  │   │
│  │         │                  │                  │         │   │
│  │  ┌──────┴──────────────────┴──────────────────┴─────┐  │   │
│  │  │              State Cache / Entity Registry         │  │   │
│  │  └───────────────────────────────────────────────────┘  │   │
│  │                                                        │   │
│  │  ┌──────────────────────────────────────────────────┐  │   │
│  │  │         Natural Language → Service Mapper          │  │   │
│  │  │  "turn on the lights" → light.turn_on             │  │   │
│  │  │  "set temp to 72"     → climate.set_temperature   │  │   │
│  │  └──────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  Skills Layer:                                               │
│  ┌────────────┐ ┌──────────┐ ┌───────────┐ ┌────────────┐  │
│  │ Smart Home  │ │ TTS/     │ │ Security  │ │ Energy     │  │
│  │ Control     │ │ Announce │ │ Monitor   │ │ Dashboard  │  │
│  └────────────┘ └──────────┘ └───────────┘ └────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
                ┌───────────┴───────────┐
                │   Nabu Casa Cloud     │ (or direct LAN)
                │   (encrypted tunnel)   │
                └───────────┬───────────┘
                            │
┌───────────────────────────┴─────────────────────────────────┐
│                    Home Assistant                             │
│                                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │ Cast     │ │ GA SDK   │ │ Zigbee/  │ │ Webhook/     │   │
│  │ (TTS)   │ │ (Bcast)  │ │ Z-Wave   │ │ REST (→OC)   │   │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └──────────────┘   │
│       │             │            │                            │
│  ┌────┴─────────────┴────────────┴──────────────────────┐   │
│  │                    Smart Home Devices                  │   │
│  │  🔆 Lights    🌡️ Thermostat  🔒 Locks    📹 Cameras  │   │
│  │  🎵 Speakers  🚪 Garage      🤖 Vacuum   🪟 Blinds   │   │
│  │  📊 Sensors   👤 Presence    ⚡ Energy               │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Configuration

```yaml
# openclaw-ha plugin config
homeassistant:
  # Connection
  url: "https://xxxxx.ui.nabu.casa"  # Or http://homeassistant.local:8123
  token: "${HA_LONG_LIVED_TOKEN}"     # From HA profile page
  
  # WebSocket (for real-time events)
  websocket:
    enabled: true
    reconnect: true
    reconnect_interval: 5000
  
  # Event subscriptions (HA → OpenClaw)
  subscriptions:
    - event_type: state_changed
      entity_filter:
        - "binary_sensor.doorbell"
        - "binary_sensor.front_door_motion"
        - "person.*"
        - "sensor.indoor_temperature"
    - event_type: openclaw_trigger  # Custom events from HA automations
  
  # TTS configuration
  tts:
    default_engine: "tts.google_translate"
    default_speaker: "media_player.kitchen_speaker"
    broadcast_enabled: true  # Requires GA SDK integration in HA
  
  # Entity aliases (natural language → entity_id mapping)
  aliases:
    "living room lights": "light.living_room"
    "bedroom lights": "light.bedroom"
    "thermostat": "climate.main"
    "front door camera": "camera.front_door"
    "garage": "cover.garage_door"
    
  # Safety
  secure_entities:
    - "lock.*"        # Require confirmation
    - "cover.garage*" # Require confirmation
  confirmation_required: true
```

### Security Considerations

1. **Token Storage:** HA long-lived token must be encrypted at rest in OpenClaw's config
2. **HTTPS:** Always use HTTPS for remote connections (Nabu Casa handles this)
3. **Network Segmentation:** If HA is on home network, consider VPN or Nabu Casa tunnel
4. **Entity Exposure:** Only expose necessary entities to avoid accidental control
5. **Confirmation for Secure Actions:** Locks, garage doors, alarm systems should require user confirmation
6. **Audit Logging:** Log all actions OpenClaw takes on HA for accountability
7. **Token Rotation:** Periodically rotate the long-lived token
8. **Dedicated HA User:** Create a dedicated user for OpenClaw with appropriate permissions

### Should HA Run Alongside OpenClaw?

| Scenario | Recommendation |
|----------|---------------|
| OpenClaw on cloud VPS, smart home at home | **HA on Raspberry Pi at home** + Nabu Casa |
| OpenClaw on home server | **HA Docker container** on same server |
| OpenClaw on cloud VPS, no home hardware | **HA Docker on VPS** (limited to cloud-connected devices) |
| Full smart home with Zigbee/Z-Wave | **HA OS on Pi or NUC** — needs USB access |

---

## 14. Comparison: Direct Cast vs Home Assistant Bridge

### Updated Comparison Table

| Feature | Direct Cast (`castv2`) | Home Assistant | HA + Nabu Casa |
|---------|:---------------------:|:--------------:|:--------------:|
| **Setup Complexity** | 🟢 Low | 🟡 Medium | 🟢 Low-Medium |
| **TTS on Specific Speaker** | ✅ Yes | ✅ Yes | ✅ Yes |
| **Broadcast (All Speakers)** | ⚠️ Sequential | ✅ Yes (GA SDK) | ✅ Yes (GA SDK) |
| **Non-Interrupting Broadcast** | ❌ No | ✅ Yes (GA SDK) | ✅ Yes (GA SDK) |
| **Light Control** | ❌ No | ✅ Yes | ✅ Yes |
| **Thermostat Control** | ❌ No | ✅ Yes | ✅ Yes |
| **Lock Control** | ❌ No | ✅ Yes | ✅ Yes |
| **Camera Snapshots** | ❌ No | ✅ Yes | ✅ Yes |
| **Garage Door** | ❌ No | ✅ Yes | ✅ Yes |
| **Sensor Data** | ❌ No | ✅ Yes | ✅ Yes |
| **Presence Detection** | ❌ No | ✅ Yes | ✅ Yes |
| **Media Playback Control** | ✅ Yes | ✅ Yes | ✅ Yes |
| **Volume Control** | ✅ Yes | ✅ Yes | ✅ Yes |
| **Google Home Voice Commands** | ❌ No | ✅ Yes (manual setup) | ✅ Yes (seamless) |
| **Alexa Integration** | ❌ No | ✅ Yes (manual) | ✅ Yes (seamless) |
| **Automations** | ❌ No | ✅ Yes (powerful) | ✅ Yes (powerful) |
| **HA → OpenClaw Events** | ❌ No | ✅ Yes (webhooks/WS) | ✅ Yes |
| **Conversation Agent** | ❌ No | ✅ Yes (Assist API) | ✅ Yes |
| **Energy Monitoring** | ❌ No | ✅ Yes | ✅ Yes |
| **History/Logging** | ❌ No | ✅ Yes | ✅ Yes |
| **Works Remotely** | ❌ LAN only | ⚠️ Manual SSL/port forwarding | ✅ Yes (tunnel) |
| **Works from Cloud VPS** | ❌ No | ⚠️ Needs tunnel | ✅ Yes |
| **Cost** | Free | Free (self-managed) | $7.50/month |
| **Maintenance** | 🟢 Low | 🟡 Medium | 🟢 Low |
| **Reliability** | 🟢 High | 🟢 High | 🟢 High |
| **Community Support** | 🟡 Medium | 🟢 Massive | 🟢 Massive |
| **Future-Proof** | 🟡 Protocol stable | 🟢 Active development | 🟢 Active development |
| **Device Count** | Cast-only | 2000+ integrations | 2000+ integrations |

### Verdict

**Direct Cast** is great for a quick proof-of-concept (TTS on speakers only).

**Home Assistant** is the clear winner for a real integration:
- 100x more capabilities
- Bidirectional communication
- Google Home + Alexa support
- Massive ecosystem
- Well-documented APIs
- Active development

**Nabu Casa** ($7.50/mo) is the cherry on top:
- Seamless remote access from cloud-based OpenClaw
- One-click Google Home + Alexa setup
- Supports HA development
- Eliminates network configuration headaches

---

## 15. Recommended Implementation Roadmap

### Phase 1: Foundation (Week 1-2)

**Goal:** Basic HA ↔ OpenClaw communication

1. **Hardware:** Set up HA on Raspberry Pi (or Docker for testing)
2. **Nabu Casa:** Subscribe and configure remote access
3. **Plugin skeleton:** Create `openclaw-ha` plugin using `home-assistant-js-websocket`
4. **Basic commands:**
   - Get all entity states
   - Call services (lights, switches)
   - TTS on a speaker
5. **Config:** Set up token, URL, basic entity aliases

### Phase 2: TTS & Announcements (Week 2-3)

**Goal:** OpenClaw speaks through home speakers

1. **TTS routing:** Map "announce on kitchen speaker" to correct entity
2. **Broadcast support:** Integrate GA SDK broadcast via HA
3. **Multiple TTS engines:** Support Google, Piper, OpenAI TTS
4. **Pre-generated audio:** Serve OpenClaw's own TTS audio via HA media player

### Phase 3: Smart Home Control (Week 3-4)

**Goal:** Full device control via natural language

1. **Entity discovery:** Auto-discover available entities and map to natural language
2. **Domain handlers:** Lights, climate, locks, covers, media players
3. **Safety layer:** Confirmation prompts for secure entities
4. **State queries:** "What's the temperature?" "Is the garage open?" "Who's home?"

### Phase 4: Bidirectional Events (Week 4-5)

**Goal:** HA notifies OpenClaw when things happen

1. **WebSocket subscriptions:** Subscribe to critical state changes
2. **Event handlers:** Process doorbell, motion, presence changes
3. **Proactive alerts:** Route HA events to Telegram, speakers, etc.
4. **HA automations:** Set up HA-side automations that call OpenClaw

### Phase 5: Conversation Agent (Week 5-6)

**Goal:** OpenClaw as the brain behind "Hey Google" and HA Assist

1. **Conversation API integration:** Handle `/api/conversation/process`
2. **Intent recognition:** Map HA intents to OpenClaw capabilities
3. **Custom sentences:** Add OpenClaw-specific voice commands
4. **Google Home flow:** Voice → Google → HA → OpenClaw → HA → Speaker

### Phase 6: Creative Features (Ongoing)

**Goal:** The "wow" factor

1. **Morning briefing** — Calendar, weather, commute, news
2. **Security monitoring** — Camera snapshot analysis
3. **Energy dashboard** — Natural language energy queries
4. **Guest mode** — Multi-device scene orchestration
5. **Sleep automation** — Bed sensor → full house automation
6. **Context awareness** — Room presence → targeted responses

---

*This research document was compiled from official Home Assistant developer documentation, REST API reference, WebSocket API reference, integration pages, npm registry data, and GitHub repositories. All URLs and API endpoints verified as of 2026-02-01.*
