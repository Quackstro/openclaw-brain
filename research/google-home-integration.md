# Google Home / Google Nest Integration Research for OpenClaw

**Date:** 2026-02-01  
**Status:** Exploratory Research  
**Author:** OpenClaw Research Agent

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Google Developer APIs Landscape](#2-google-developer-apis-landscape)
3. [Capability Feasibility Analysis](#3-capability-feasibility-analysis)
4. [Authentication & Setup Requirements](#4-authentication--setup-requirements)
5. [Unofficial / Community Approaches](#5-unofficial--community-approaches)
6. [OpenClaw Integration Architecture](#6-openclaw-integration-architecture)
7. [Comparison Table](#7-comparison-table)
8. [Recommendations](#8-recommendations)
9. [Appendix: Key Libraries & Tools](#9-appendix-key-libraries--tools)

---

## 1. Executive Summary

Google Home integration for OpenClaw is **feasible but fragmented**. There is no single, unified API that does everything we want. The landscape has shifted significantly:

- **Conversational Actions were sunset on June 13, 2023** — the primary way to build custom voice experiences ("Hey Google, ask OpenClaw...") is **dead**.
- **Google Home APIs** (new, 2024+) are mobile-SDK-focused (Android/iOS) — not server-side REST APIs we can call from OpenClaw directly.
- **Google Cast protocol** (via `castv2` / `pychromecast`) is the **most practical path for TTS announcements** — works locally on the same network with no cloud auth.
- **Home Assistant** as a bridge is the **most robust all-in-one integration** — it already supports Google Assistant SDK (broadcasts, commands) and Google Cast (TTS, media).
- **Cloud-to-cloud Smart Home API** lets us make OpenClaw-controlled devices appear in Google Home, but it's designed for device manufacturers, not for controlling existing Google Home devices.

**Bottom line:** For TTS announcements, use Google Cast (`castv2-client` or `pychromecast`). For full smart home control + voice, use Home Assistant as a bridge. There is currently no supported way to programmatically invoke "Hey Google, ask OpenClaw..." since Conversational Actions were shut down.

---

## 2. Google Developer APIs Landscape

### 2.1 Google Home APIs (New — 2024/2025+)

**URL:** https://developers.home.google.com/apis

The new "Home APIs" are Google's latest developer platform. They provide:
- Access to **750M+ devices** in the Google Home ecosystem
- **Device API** — control devices (lights, thermostats, etc.)
- **Structure API** — understand home layout (rooms, floors)
- **Automation API** — create and manage automations
- **Commissioning API** — add Matter devices

**Critical limitation:** These are **mobile SDKs** (Android and iOS). They are designed for building mobile companion apps, not for server-side integrations. There is **no REST API** or server-side SDK available.

> **Verdict:** Not directly usable by OpenClaw (which runs as a server-side agent). Could theoretically be used via a companion Android/iOS app acting as a bridge, but this is complex and fragile.

### 2.2 Cloud-to-Cloud (Smart Home API)

**URL:** https://developers.home.google.com/cloud-to-cloud/get-started

The Cloud-to-cloud platform connects your **cloud backend** to Google Home. It's designed for device manufacturers to make their products controllable via Google Assistant.

**How it works:**
1. You build a "fulfillment service" (webhook endpoint)
2. Google sends SYNC, QUERY, and EXECUTE intents to your webhook
3. You respond with device states and action results
4. Home Graph stores device state

**Supported device types:** 80+ types including lights, thermostats, speakers, cameras, locks, fans, sensors, vacuums, and many more.

**Supported traits:** 30+ traits including OnOff, Brightness, ColorSetting, TemperatureSetting, Volume, MediaState, LockUnlock, ArmDisarm, CameraStream, etc.

**What this means for OpenClaw:**
- We could make OpenClaw-managed devices (virtual or real) appear in Google Home
- When a user says "Hey Google, turn off the lights," Google would call our webhook
- We could then forward that command through OpenClaw to the actual device
- This gives us **Google Home → OpenClaw** direction (voice commands trigger our code)
- It does **NOT** let us push TTS to Google Home speakers

> **Verdict:** Useful for making OpenClaw act as a smart home hub visible to Google Home. Moderate setup complexity. Does not solve TTS announcements.

### 2.3 Google Assistant SDK

**URL:** https://developers.google.com/assistant/sdk/overview

The Google Assistant SDK allows embedding Google Assistant into custom hardware/software projects.

**Key characteristics:**
- **Experimental and non-commercial use only** — cannot be used in commercial devices
- Supports gRPC API in Python, Node.js, Go, Java, C#, Ruby
- Can send utterances and receive responses (text + audio)
- **Does NOT support:**
  - "Ok Google" hands-free activation
  - Timers, alarms
  - Podcast/news playback
  - **Broadcasting voice messages** (the exact feature we want most)

**What this means for OpenClaw:**
- We could theoretically embed a Google Assistant client in OpenClaw
- Send text commands like "turn off the living room lights" and get responses
- But we **cannot broadcast** announcements to Google Home speakers through this API
- Non-commercial restriction is a concern

> **Verdict:** Limited utility. Can act as a pass-through to Google Assistant, but doesn't support broadcasts. Non-commercial restriction is a blocker for production use.

### 2.4 Google Nest Device Access API (SDM API)

**URL:** https://developers.google.com/nest/device-access

Specifically for Nest devices (cameras, doorbells, thermostats, Nest Hub Max).

**Supported devices:**
- All Google Nest Thermostats
- All Google Nest Cameras  
- All Google Nest Doorbells
- Google Nest Hub Max (camera features only)

**Setup:**
- Requires Device Access registration ($5 one-time fee)
- Google Cloud project with OAuth 2.0
- SDM API calls use a Device Access Project ID

**What this means for OpenClaw:**
- Can access camera livestreams and events
- Can read/control thermostat temperature
- Can detect doorbell presses
- **Does NOT control Google Home speakers** — no TTS, no media control
- Limited to Nest hardware devices

> **Verdict:** Useful only for Nest-specific device integration (thermostats, cameras). Doesn't help with speakers/TTS.

### 2.5 Conversational Actions (SUNSET — June 13, 2023)

**URL:** https://developers.google.com/assistant/ca-sunset

**This was the feature that would have let us build "Hey Google, ask OpenClaw..."** — custom voice conversations through Google Assistant. It is now fully deprecated and removed.

**What survived the sunset:**
- App Actions (Android only — deep links into Android apps)
- Smart Home / Cloud-to-cloud (device control)
- Media Actions (content discovery)
- Actions from web content (Search-based)

> **Verdict:** The primary path for custom voice interactions via Google Home is gone. There is currently **no replacement** for building custom conversational experiences on Google Assistant.

### 2.6 Google Cast SDK

**URL:** https://developers.google.com/cast/docs/overview

The Cast SDK enables sending media content from a "Sender" to a "Receiver" (Chromecast, Google Home speakers, smart displays, smart TVs).

**Key architecture:**
- **Sender** — initiates and controls playback (mobile app, web app, or programmatic client)
- **Receiver** — plays content on Cast-enabled device
- Supports Android, iOS, and Web senders
- Default Media Receiver can play audio/video via URL

**What this means for OpenClaw:**
- Google Home speakers are Cast-enabled receivers
- We can cast audio (including TTS audio) to any Google Home speaker
- We can control playback (play, pause, stop, volume)
- Works locally on the same network — no cloud auth needed
- This is our **primary path for TTS announcements**

> **Verdict:** ⭐ **Best option for TTS announcements.** Use Cast protocol to play generated TTS audio on Google Home speakers. Works locally, no Google Cloud auth needed.

---

## 3. Capability Feasibility Analysis

### 3.1 TTS/Announcements

**"Hey Dr. Castro, your build finished" → plays on Google Home speaker**

| Approach | Feasibility | Notes |
|----------|-------------|-------|
| Google Cast + TTS audio | ✅ **High** | Generate TTS audio (Google TTS API, OpenClaw's own TTS), serve via HTTP, cast to speaker |
| Google Cast + `google-tts-api` URL | ✅ **High** | Use Google Translate TTS URL, cast directly. Hacky but works. |
| Home Assistant + `google_assistant_sdk` broadcast | ✅ **High** | HA can broadcast to all speakers. Interruption-free. |
| Home Assistant + `cast` integration | ✅ **High** | HA can play TTS on specific cast devices |
| Google Home APIs | ❌ **Not possible** | Mobile SDK only, no server-side TTS push |
| Google Assistant SDK | ❌ **Not possible** | Broadcast not supported |

**Recommended approach:** Google Cast protocol (direct) or Home Assistant bridge.

### 3.2 Voice Commands → OpenClaw

**"Hey Google, ask OpenClaw what's on my calendar"**

| Approach | Feasibility | Notes |
|----------|-------------|-------|
| Conversational Actions | ❌ **Dead** | Sunset June 2023 |
| Cloud-to-cloud + virtual devices | ⚠️ **Indirect** | Could create virtual "devices" that trigger OpenClaw when activated |
| Home Assistant + Google Assistant integration | ⚠️ **Indirect** | HA devices visible in Google Home; voice commands → HA → OpenClaw webhook |
| Google Assistant SDK (embedded) | ⚠️ **Limited** | Non-commercial, no custom intents |

**Bottom line:** There is **no direct path** to build "Hey Google, ask OpenClaw..." anymore. The closest approach is using Cloud-to-cloud or Home Assistant to create virtual devices/scenes that trigger OpenClaw actions when voice-activated.

### 3.3 Smart Home Control

**"Turn off the bedroom lights" via OpenClaw**

| Approach | Feasibility | Notes |
|----------|-------------|-------|
| Home Assistant bridge | ✅ **High** | HA controls 2000+ integrations, OpenClaw calls HA REST API |
| Cloud-to-cloud (as device provider) | ✅ **High** | Make OpenClaw devices visible in Google Home ecosystem |
| Google Home APIs (mobile SDK) | ⚠️ **Indirect** | Requires companion mobile app |
| Direct device protocols (Zigbee, Z-Wave, etc.) | ✅ **High** | Requires hardware gateway |

### 3.4 Routines

**Programmatically trigger/create Google Home routines**

| Approach | Feasibility | Notes |
|----------|-------------|-------|
| Google Home APIs Automation API | ⚠️ **Mobile only** | Android/iOS SDK, not server-side |
| Home Assistant automations | ✅ **High** | HA has full automation engine, can trigger from OpenClaw |
| Direct API | ❌ **Not available** | No server-side API for Google Home routines |

### 3.5 Media Control

**Play/pause/control media on Google Home devices**

| Approach | Feasibility | Notes |
|----------|-------------|-------|
| Google Cast protocol | ✅ **High** | Full media control: play, pause, stop, seek, volume, queue |
| Home Assistant cast integration | ✅ **High** | Same capabilities, managed through HA |
| `catt` CLI tool | ✅ **High** | Command-line cast tool, great for scripting |

### 3.6 Broadcast to All Speakers

**"Broadcast: dinner is ready" → all speakers in the house**

| Approach | Feasibility | Notes |
|----------|-------------|-------|
| Home Assistant `google_assistant_sdk` | ✅ **High** | `broadcast "dinner is ready"` — works without interrupting playback |
| Google Cast to speaker group | ✅ **Moderate** | Cast to a group containing all speakers (must be configured in Google Home app) |
| Google Cast to each speaker sequentially | ⚠️ **Works but clunky** | Need to discover and cast to each one |

---

## 4. Authentication & Setup Requirements

### 4.1 Google Cast (Direct — No Auth)

| Requirement | Details |
|-------------|---------|
| Auth | **None** — Cast protocol uses mDNS discovery, no authentication |
| Network | Must be on the **same local network** as Google Home devices |
| Google Cloud project | Not needed |
| Cost | **Free** |
| Hardware | Any computer on the LAN |

### 4.2 Cloud-to-Cloud Smart Home

| Requirement | Details |
|-------------|---------|
| Auth | OAuth 2.0 account linking between user's Google Account and your service |
| Google Cloud project | Required — with HomeGraph API enabled |
| Developer Console | Register at https://console.home.google.com |
| Cost | **Free** for development and personal use |
| HTTPS endpoint | Required for fulfillment webhook |
| Service Account | Required for Report State and Request Sync |

### 4.3 Google Nest Device Access (SDM API)

| Requirement | Details |
|-------------|---------|
| Auth | OAuth 2.0 |
| Registration | $5 one-time fee |
| Google Cloud project | Required — Smart Device Management API enabled |
| Pub/Sub | Optional for event subscriptions |
| Cost | **$5 registration** + free API usage |

### 4.4 Google Assistant SDK

| Requirement | Details |
|-------------|---------|
| Auth | OAuth 2.0 with Google Account |
| Google Cloud project | Required — Google Assistant API enabled |
| Cost | **Free** |
| Restriction | **Non-commercial use only** |

### 4.5 Home Assistant (Bridge)

| Requirement | Details |
|-------------|---------|
| Hardware | Raspberry Pi, VM, or any always-on Linux machine |
| HA Cloud (Nabu Casa) | $6.50/month — easiest setup, handles SSL/remote access |
| Manual setup | Free but requires HTTPS, static hostname, port forwarding |
| Google Cloud project | Required for Google Assistant integration |
| Cost | **Free** (manual) or **$6.50/mo** (Nabu Casa Cloud) |

---

## 5. Unofficial / Community Approaches

### 5.1 Google Home Local API (Reverse-Engineered)

**Repository:** https://github.com/rithvikvibhu/GHLocalApi

A community-documented local API available on port 8443 of Google Home devices. Provides:

- **Device info** — model, name, IP, capabilities, firmware version
- **Network info** — WiFi SSID, signal strength, IP address
- **Night mode settings** — do-not-disturb, LED brightness, volume schedules
- **Multizone/group info** — speaker group configuration
- **Device settings** — locale, timezone, control notifications
- **Audio settings** — EQ, volume
- **Supported capabilities:** assistant, bluetooth, cast, night mode, reboot, etc.

**Authentication:** Uses a local authorization token (can be extracted from the device). Some endpoints require authentication via Google account tokens.

**Limitations:**
- Unofficial and undocumented — can break with firmware updates
- Cannot push TTS directly through this API
- Read-mostly — limited write capabilities
- Authentication is complex (requires `gpsoauth` library)

> **Verdict:** Useful for device discovery and status monitoring. Not a path for TTS or control.

### 5.2 Home Assistant as a Bridge

**This is the most powerful community approach** and effectively gives us everything:

#### Google Assistant Integration (for HA)
**URL:** https://www.home-assistant.io/integrations/google_assistant/

- Exposes Home Assistant devices to Google Home / Google Assistant
- Supports voice commands: "Hey Google, turn off the bedroom lights" (controls HA devices)
- Supports local fulfillment for faster response
- Requires Cloud-to-cloud project setup or Nabu Casa subscription

#### Google Assistant SDK Integration (for HA)
**URL:** https://www.home-assistant.io/integrations/google_assistant_sdk/

This is the **key integration** for our use case. It allows:

1. **Broadcast messages** to all Google speakers/displays without interrupting playback:
   - "Coffee is ready"
   - "Someone is at the front door"

2. **Send text commands** to Google Assistant:
   - "Play rain sounds on bedroom speaker"
   - "Turn off kitchen TV"

3. **Playback Google Assistant audio responses** on any media player:
   - "Tell me a joke"
   - "What's the weather?"

4. **Full conversation** with Google Assistant via text or voice

#### Google Cast Integration (for HA)
**URL:** https://www.home-assistant.io/integrations/cast/

- Auto-discovers Cast devices on the network
- Play media (audio/video/images) on any Cast device
- TTS playback on specific speakers
- Full media control (play, pause, volume, etc.)
- Can show Home Assistant dashboards on Chromecast/smart displays

**OpenClaw → Home Assistant architecture:**
```
OpenClaw ─── HTTP/REST API ───→ Home Assistant ───→ Google Home speakers
                                                ├──→ Smart home devices
                                                ├──→ Google Assistant (broadcasts)
                                                └──→ Cast devices (TTS/media)
```

Home Assistant has a well-documented REST API:
- `POST /api/services/google_assistant_sdk/send_text_command` — send commands
- `POST /api/services/tts/google_translate_say` — TTS on cast devices
- `POST /api/services/media_player/play_media` — play media on cast devices
- `POST /api/services/notify/google_assistant_sdk` — broadcast notifications

### 5.3 Node-RED

Node-RED can act as a bridge between OpenClaw and Google Home via:
- **node-red-contrib-cast** — Cast protocol nodes
- **node-red-contrib-google-home** — Google Home integration (via Google Smart Home Actions)
- Can be used alongside or instead of Home Assistant
- Provides visual flow-based programming for automation

### 5.4 Google Cast Protocol (Direct Implementation)

#### Python: pychromecast
**Repository:** https://github.com/home-assistant-libs/pychromecast

The definitive Python library for Google Cast protocol (maintained by Home Assistant team).

**Features:**
- Auto-discovery of Cast devices via mDNS/Zeroconf
- Connect by friendly name: `pychromecast.get_listed_chromecasts(friendly_names=["Living Room"])`
- Default Media Receiver — play any HTTP-accessible audio/video
- Media control — play, pause, stop, seek, volume
- Speaker groups / multi-room support
- Custom namespace support (extensible)
- Python 3.11+ required

**TTS via pychromecast:**
```python
import pychromecast

# Find the speaker
chromecasts, browser = pychromecast.get_listed_chromecasts(
    friendly_names=["Living Room Speaker"]
)
cast = chromecasts[0]
cast.wait()

# Play TTS audio (must be HTTP-accessible)
mc = cast.media_controller
mc.play_media('http://your-server:8080/tts/announcement.mp3', 'audio/mp3')
mc.block_until_active()
```

#### Node.js: castv2 / castv2-client
**npm:** `castv2` (v0.1.10) + `castv2-client` (v1.2.0)

Low-level CASTV2 protocol implementation for Node.js.

**Features:**
- Raw protocol access
- Media playback control
- Custom app launching and messaging
- Used as dependency by `google-home-notify`

#### Node.js: google-home-notify
**npm:** `google-home-notify` (v0.0.4)

Higher-level wrapper specifically for sending TTS notifications to Google Home.

**Dependencies:** `castv2-client` + `google-tts-api`

**How it works:**
1. Uses `google-tts-api` to generate a TTS audio URL via Google Translate
2. Uses `castv2-client` to cast that audio URL to a Google Home device

**Concern:** Relies on undocumented Google Translate TTS endpoint — could break.

#### Node.js: google-tts-api
**npm:** `google-tts-api` (v2.0.2)

Generates Google Translate TTS URLs for given text. Can be combined with any Cast library.

### 5.5 catt (Cast All The Things)

**Repository:** https://github.com/skorokithakis/catt

Command-line tool for casting to Chromecast/Google Home devices.

**Features:**
- Cast YouTube/Vimeo/etc. URLs (via yt-dlp)
- Cast local files (video, audio, images)
- Cast websites
- Full playback control (pause, play, stop, volume, seek)
- Device aliases and configuration
- Python 3.11+, installable via pip/pipx/uv

**Usage for TTS:**
```bash
# Cast a pre-generated TTS audio file
catt -d "Living Room Speaker" cast http://server:8080/tts/announcement.mp3

# Cast a website (could be a TTS page)
catt -d "Kitchen Display" cast_site http://server:8080/announcement.html
```

Excellent for scripting and can be called from OpenClaw via `exec`.

---

## 6. OpenClaw Integration Architecture

### 6.1 Approach A: Direct Google Cast Plugin (Quickest for TTS)

```
┌─────────────┐     ┌──────────────────┐     ┌───────────────────┐
│   OpenClaw   │────▶│  Cast Plugin     │────▶│ Google Home       │
│   Agent      │     │  (castv2-client  │     │ Speakers          │
│              │     │   or pychromecast│     │ (on local network)│
└─────────────┘     │   + TTS engine)  │     └───────────────────┘
                    └──────────────────┘
```

**Implementation as OpenClaw plugin:**

```javascript
// Conceptual OpenClaw Cast Plugin
const Client = require('castv2-client').Client;
const DefaultMediaReceiver = require('castv2-client').DefaultMediaReceiver;
const mdns = require('mdns'); // or bonjour/zeroconf

class GoogleHomeCastPlugin {
  async announce(deviceName, text) {
    // 1. Generate TTS audio (use OpenClaw's TTS or google-tts-api)
    const ttsUrl = await this.generateTTS(text);
    
    // 2. Find device on network
    const device = await this.findDevice(deviceName);
    
    // 3. Cast audio to device
    await this.castAudio(device, ttsUrl);
  }
  
  async castAudio(device, url) {
    const client = new Client();
    client.connect(device.host, () => {
      client.launch(DefaultMediaReceiver, (err, player) => {
        player.load({ contentId: url, contentType: 'audio/mp3' });
      });
    });
  }
}
```

**User experience:**
- `"Announce on the living room speaker: your build is done"` → TTS generated → Cast to speaker
- `"Play music on kitchen speaker"` → Cast audio URL
- `"Set volume to 50% on bedroom speaker"` → Cast volume control

**Pros:**
- No cloud auth needed
- Low latency (local network)
- Simple to implement
- Works with all Google Home speakers, Chromecasts, Nest displays

**Cons:**
- Must be on the **same network** as the devices
- No smart home device control (just speakers)
- No voice input from Google Home → OpenClaw
- OpenClaw server needs LAN access to Google Home devices

### 6.2 Approach B: Home Assistant Bridge (Most Comprehensive)

```
┌─────────────┐     ┌──────────────────┐     ┌───────────────────┐
│   OpenClaw   │────▶│  Home Assistant   │────▶│ Google Home       │
│   Agent      │ REST│  (local or cloud)│     │ ├── Speakers (TTS)│
│              │ API │  ├─ GA SDK        │     │ ├── Lights        │
│              │     │  ├─ GA Integration│◀────│ ├── Thermostats   │
│              │     │  ├─ Cast          │     │ └── All devices   │
│              │     │  └─ 2000+ integs  │     └───────────────────┘
└─────────────┘     └──────────────────┘
```

**Implementation as OpenClaw skill/plugin:**

```javascript
// Conceptual OpenClaw Home Assistant Bridge
class HomeAssistantBridge {
  constructor(haUrl, haToken) {
    this.baseUrl = haUrl;  // e.g., http://homeassistant.local:8123
    this.token = haToken;   // Long-lived access token
  }

  async broadcast(message) {
    // Broadcast to ALL Google Home speakers
    await this.callService('google_assistant_sdk', 'send_text_command', {
      command: `broadcast ${message}`
    });
  }

  async ttsOnDevice(entityId, message) {
    // TTS on specific device
    await this.callService('tts', 'google_translate_say', {
      entity_id: entityId,
      message: message
    });
  }

  async controlDevice(entityId, action, data = {}) {
    // Control any smart home device
    await this.callService('homeassistant', action, {
      entity_id: entityId,
      ...data
    });
  }

  async callService(domain, service, data) {
    const response = await fetch(
      `${this.baseUrl}/api/services/${domain}/${service}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      }
    );
    return response.json();
  }
}
```

**User experience:**
- `"Announce on all speakers: dinner is ready"` → HA broadcast → all speakers
- `"Turn off the bedroom lights"` → HA service call → device control
- `"What's the temperature in the house?"` → HA state query → thermostat reading
- `"Play rain sounds on the bedroom speaker"` → HA Google Assistant SDK → plays media

**Pros:**
- Full smart home control (2000+ integrations)
- TTS announcements on individual or all speakers
- Broadcasts without interrupting playback
- Can work remotely (not just LAN)
- Google Assistant SDK gives access to all GA commands
- Massive community support
- Mature, stable platform

**Cons:**
- Requires running Home Assistant instance (always-on)
- Additional infrastructure to maintain
- Setup complexity (though Nabu Casa simplifies it)
- Adds latency through HA middleware

### 6.3 Approach C: Cloud-to-Cloud Smart Home (Voice → OpenClaw)

```
┌──────────────┐     ┌──────────────────┐     ┌───────────────────┐
│ Google Home   │────▶│  Google Cloud     │────▶│ OpenClaw          │
│ Speaker       │voice│  Smart Home API   │HTTP │ Fulfillment       │
│ "Hey Google,  │     │  (Cloud-to-Cloud) │     │ Webhook           │
│  turn on AI"  │     └──────────────────┘     └───────────────────┘
```

This would let us create virtual "devices" in Google Home that trigger OpenClaw actions:

- Virtual switch: "Hey Google, turn on the AI assistant" → triggers OpenClaw
- Virtual scene: "Hey Google, activate morning briefing" → triggers OpenClaw routine
- Virtual thermostat: "Hey Google, set knowledge to expert" → sends data to OpenClaw

**Pros:**
- Official, supported API
- Voice → OpenClaw direction
- Free

**Cons:**
- Hacky (abusing device metaphors for non-device actions)
- Complex setup (OAuth, Cloud project, fulfillment service, HTTPS endpoint)
- Does not provide TTS/announcement capability
- Limited to device-style interactions

---

## 7. Comparison Table

| Approach | Setup Complexity | TTS/Announce | Voice→OpenClaw | Smart Home Control | Broadcast | Media Control | Cost | Reliability | Maintenance |
|----------|:----------------:|:------------:|:--------------:|:------------------:|:---------:|:-------------:|:----:|:-----------:|:-----------:|
| **Google Cast (direct)** | 🟢 Low | ✅ Yes | ❌ No | ❌ No | ⚠️ Sequential | ✅ Yes | Free | 🟢 High | 🟢 Low |
| **Home Assistant bridge** | 🟡 Medium | ✅ Yes | ⚠️ Indirect | ✅ Yes (2000+ integrations) | ✅ Yes | ✅ Yes | Free or $6.50/mo | 🟢 High | 🟡 Medium |
| **Cloud-to-Cloud** | 🔴 High | ❌ No | ✅ Yes (device metaphor) | ✅ Yes (your devices) | ❌ No | ❌ No | Free | 🟡 Medium | 🟡 Medium |
| **Google Nest Device Access** | 🟡 Medium | ❌ No | ❌ No | ⚠️ Nest only | ❌ No | ❌ No | $5 one-time | 🟢 High | 🟢 Low |
| **Google Assistant SDK** | 🟡 Medium | ❌ No | ❌ No | ⚠️ Via commands | ❌ No broadcast | ❌ No | Free (non-commercial) | 🟡 Medium | 🟡 Medium |
| **GH Local API (unofficial)** | 🟡 Medium | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No | Free | 🔴 Low (can break) | 🔴 High |
| **catt CLI** | 🟢 Low | ✅ Yes | ❌ No | ❌ No | ⚠️ Sequential | ✅ Yes | Free | 🟢 High | 🟢 Low |
| **HA + GA SDK + Cast** | 🟡 Medium | ✅ Yes | ⚠️ Indirect | ✅ Full | ✅ Yes | ✅ Yes | Free–$6.50/mo | 🟢 High | 🟡 Medium |

### Quick Capability Matrix

| Capability | Cast Direct | HA Bridge | Cloud-to-Cloud |
|-----------|:-----------:|:---------:|:--------------:|
| TTS on specific speaker | ✅ | ✅ | ❌ |
| Broadcast to all speakers | ⚠️ | ✅ | ❌ |
| "Hey Google, ..." → OpenClaw | ❌ | ⚠️ | ⚠️ |
| Control lights/switches | ❌ | ✅ | ✅ |
| Control thermostats | ❌ | ✅ | ✅ |
| Play/pause media | ✅ | ✅ | ❌ |
| Volume control | ✅ | ✅ | ❌ |
| Works remotely (off-LAN) | ❌ | ✅ | ✅ |
| No Google Cloud project | ✅ | ❌ | ❌ |

---

## 8. Recommendations

### 8.1 Quickest Path to TTS Announcements (🏃 Sprint)

**Use Google Cast protocol directly via `castv2-client` (Node.js) or `pychromecast` (Python).**

**Why:**
- Zero cloud setup — no Google Cloud project, no OAuth
- Works on local network immediately
- OpenClaw's TTS tool already generates audio — just serve it via HTTP and cast
- Can be built as an OpenClaw plugin in a day

**Implementation plan:**
1. Install `castv2-client` + `bonjour-service` (for mDNS discovery)
2. Build a thin OpenClaw plugin that:
   - Discovers Google Home speakers on the network
   - Accepts text → generates TTS audio (using OpenClaw's existing TTS)
   - Serves audio file via local HTTP
   - Casts audio URL to target speaker
3. Map natural language commands: `"announce on [device]: [message]"`

**Limitation:** OpenClaw server must be on the same LAN as Google Home devices. If OpenClaw runs in the cloud, you'll need a local bridge (which is essentially what Home Assistant provides).

### 8.2 Most Robust Long-Term Integration (🏗️ Foundation)

**Use Home Assistant as a bridge layer.**

**Why:**
- Provides ALL capabilities: TTS, broadcast, device control, media control
- Battle-tested by millions of users
- Handles auth, device discovery, state management
- REST API is simple to integrate with
- Future-proof — HA team actively maintains Google integrations
- Works remotely (via Nabu Casa or custom HTTPS setup)

**Implementation plan:**
1. Set up Home Assistant (recommend: dedicated Raspberry Pi or VM)
2. Configure Google Cast integration (auto-discovers speakers)
3. Configure Google Assistant SDK integration (for broadcasts and commands)
4. Optionally configure Google Assistant integration (for voice → HA → OpenClaw)
5. Build OpenClaw Home Assistant plugin that calls HA REST API
6. Map natural language commands to HA service calls

### 8.3 Phased Rollout (Recommended)

**Phase 1 — TTS Announcements (1-2 days)**
- Implement direct Google Cast plugin using `castv2-client`
- Support: announce on specific speaker, volume control
- Requires: OpenClaw on same LAN as speakers

**Phase 2 — Home Assistant Bridge (1 week)**
- Set up Home Assistant with Google Cast + Google Assistant SDK
- Build OpenClaw ↔ HA REST API bridge plugin
- Support: broadcasts, TTS on any speaker, smart home control
- Removes LAN requirement for OpenClaw

**Phase 3 — Voice Input (2-4 weeks)**
- Set up Cloud-to-Cloud integration or HA Google Assistant integration
- Create virtual devices/scenes that trigger OpenClaw
- Support: "Hey Google, activate [OpenClaw command]"

**Phase 4 — Full Smart Home (ongoing)**
- Expand HA device integrations
- Build OpenClaw skills for common smart home tasks
- Implement automation rules (e.g., "when build fails, announce on all speakers")

### 8.4 Blockers & Dealbreakers

| Issue | Impact | Mitigation |
|-------|--------|------------|
| **Conversational Actions sunset** | Cannot build "Hey Google, ask OpenClaw..." | Use virtual devices or HA bridge for indirect voice commands |
| **Home APIs are mobile-only** | No server-side control via new APIs | Use Cast protocol + HA bridge instead |
| **Google Assistant SDK non-commercial** | Cannot use in production | Use HA Google Assistant SDK integration (different product, not restricted) |
| **LAN requirement for Cast** | OpenClaw cloud server can't reach speakers | Use HA bridge or local OpenClaw node |
| **Google Translate TTS is unofficial** | Could break without notice | Use OpenClaw's own TTS engine instead |
| **No official TTS push API** | Google provides no "push announcement to speaker" API | Cast protocol is the workaround — widely used and stable |

---

## 9. Appendix: Key Libraries & Tools

### Node.js (npm)

| Package | Version | Description | Maintained |
|---------|---------|-------------|:----------:|
| `castv2` | 0.1.10 | Low-level CASTV2 protocol | ⚠️ Stable but inactive |
| `castv2-client` | 1.2.0 | Higher-level Chromecast client | ⚠️ Stable but inactive |
| `google-home-notify` | 0.0.4 | TTS notifications to Google Home | ⚠️ Old |
| `google-tts-api` | 2.0.2 | Google Translate TTS URL generator | ✅ Active |
| `bonjour-service` | latest | mDNS/DNS-SD discovery | ✅ Active |
| `mdns` | latest | mDNS discovery (native) | ⚠️ |

### Python (pip)

| Package | Description | Maintained |
|---------|-------------|:----------:|
| `pychromecast` | Chromecast/Cast protocol (by HA team) | ✅ Active |
| `catt` | CLI cast tool | ✅ Active |
| `google-tts-api` (via `gTTS`) | Google Translate TTS | ✅ Active |
| `zeroconf` | mDNS/DNS-SD discovery | ✅ Active |

### Key URLs

| Resource | URL |
|----------|-----|
| Google Home Developer Center | https://developers.home.google.com/ |
| Home APIs (Mobile SDK) | https://developers.home.google.com/apis |
| Cloud-to-Cloud | https://developers.home.google.com/cloud-to-cloud/get-started |
| Google Cast SDK | https://developers.google.com/cast/docs/overview |
| Google Assistant SDK | https://developers.google.com/assistant/sdk/overview |
| Nest Device Access | https://developers.google.com/nest/device-access |
| Conversational Actions Sunset | https://developers.google.com/assistant/ca-sunset |
| Home Assistant - Google Assistant | https://www.home-assistant.io/integrations/google_assistant/ |
| Home Assistant - GA SDK | https://www.home-assistant.io/integrations/google_assistant_sdk/ |
| Home Assistant - Cast | https://www.home-assistant.io/integrations/cast/ |
| pychromecast (GitHub) | https://github.com/home-assistant-libs/pychromecast |
| catt (GitHub) | https://github.com/skorokithakis/catt |
| GH Local API (unofficial) | https://github.com/rithvikvibhu/GHLocalApi |
| castv2-client (npm) | https://github.com/thibauts/node-castv2-client |
| Google Home Playground | https://home-playground.withgoogle.com/ |

---

*This research document was compiled from official Google documentation, GitHub repositories, npm registry data, and Home Assistant documentation. All URLs were verified as of 2026-02-01.*
