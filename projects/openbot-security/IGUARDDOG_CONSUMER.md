# iGuardDog — Self-Hosted Consumer Product Concept

**Tagline ideas:**
- "Your property. Your data. Your guard dog."
- "The guard dog that never sleeps."
- "Patrol. Detect. Alert. No cloud required."

---

## Core Philosophy: Self-Hosted, Privacy-First

**The problem with Ring/Nest/Arlo:**
- Your video goes to Amazon/Google/Arlo servers — you don't own it
- Monthly subscription required ($4-20/mo) just to see your own recordings
- Can be subpoenaed by law enforcement without your knowledge
- Service goes down = you lose security
- Company gets hacked = your home video is exposed
- Company shuts down = your hardware is a brick

**iGuardDog is the opposite:**
- Everything runs on YOUR hardware, in YOUR home
- Video never leaves your network unless YOU choose to share it
- No subscription required for full functionality
- Works even if the internet goes down
- You own your data forever
- No company can brick your device

---

## Self-Hosted Architecture

```
YOUR HOME NETWORK (nothing leaves)
┌──────────────────────────────────────────────┐
│                                               │
│  ┌──────────┐    ┌────────────────────────┐  │
│  │iGuardDog │    │    iGuardDog Hub        │  │
│  │  Robot    │◄──►│  (Raspberry Pi / Mini PC)│  │
│  │  🐕‍🦺     │WiFi│                          │  │
│  └──────────┘    │  • Frigate NVR (local)  │  │
│                   │  • MQTT broker (local)  │  │
│  ┌──────────┐    │  • AI detection (local) │  │
│  │iGuardDog │    │  • Web dashboard (local)│  │
│  │  Drone   │◄──►│  • Alert engine (local) │  │
│  │  🚁      │WiFi│  • Video storage (local)│  │
│  └──────────┘    │  • Home Assistant (opt.) │  │
│                   └─────────┬──────────────┘  │
│                             │                  │
│                   ┌─────────┴──────────┐      │
│                   │  Your Phone (LAN)   │      │
│                   │  iGuardDog App      │      │
│                   └────────────────────┘      │
└──────────────────────────────────────────────┘
         │
         │ OPTIONAL (user chooses to enable)
         ▼
    ┌─────────────┐
    │ WireGuard VPN│  ← Encrypted tunnel to YOUR hub
    │ (self-hosted)│    from anywhere in the world
    └─────────────┘
    No cloud. No middleman. Just your phone → your hub.
```

---

## Self-Hosted Components (All Free / Open Source)

| Component | Software | Runs On | Purpose |
|-----------|----------|---------|---------|
| **Hub OS** | Raspberry Pi OS / Ubuntu | Raspberry Pi 5 or mini PC | Base system |
| **NVR** | Frigate | Hub | Local video recording + AI detection |
| **AI Models** | YOLOv8-nano (TFLite) | Hub + Robot phone | Person/vehicle/animal detection |
| **Message Broker** | Mosquitto MQTT | Hub | Robot ↔ Hub communication |
| **Dashboard** | iGuardDog Web UI (custom React) | Hub | Local web interface at `http://iguarddog.local` |
| **Alerts** | Ntfy (self-hosted) or Gotify | Hub | Push notifications to your phone |
| **Remote Access** | WireGuard VPN | Hub | Access from anywhere, encrypted, no cloud |
| **Automation** | Home Assistant (optional) | Hub | Integrate with lights, locks, sirens |
| **Voice** | Piper TTS (local) | Hub | Generate voice warnings without cloud |
| **Incident Reports** | Ollama + Phi 4 Mini | Hub | AI-generated plain-English summaries, all local |
| **Storage** | USB SSD (1-4TB) | Hub | Weeks/months of video, all local |

**Total cloud services required: ZERO**

---

## Consumer Product Tiers

### iGuardDog Pup 🐕 — Starter ($399)
- 1 ground robot (indoor/outdoor)
- iGuardDog Hub (pre-configured Raspberry Pi 5 + 256GB SD)
- Mobile app
- Local AI detection (person, vehicle, animal)
- Push alerts to phone (local network)
- 7 days local video storage
- **No subscription. Ever.**

### iGuardDog Pro 🐕‍🦺 — Full Home ($799)
- 2 ground robots
- iGuardDog Hub (Raspberry Pi 5 + 1TB USB SSD)
- Mobile app + local web dashboard
- AI detection + anomaly alerts
- Patrol route scheduling
- Two-way audio
- 30 days local video storage
- WireGuard VPN pre-configured (access from anywhere)
- **No subscription. Ever.**

### iGuardDog Pack 🐺 — Property ($1,499)
- 3 ground robots + 1 drone
- iGuardDog Hub (mini PC + 2TB SSD)
- Full swarm coordination
- Inductive charging pads × 2
- Night vision
- Home Assistant pre-installed
- 90 days local video storage
- **No subscription. Ever.**

### iGuardDog DIY 🔧 — Open Source (Free plans)
- Download everything: STL files, firmware, software, setup guides
- Build your own from parts
- Community forum + wiki
- Free forever
- **Top-of-funnel → some convert to buying pre-built**

---

## How Remote Access Works WITHOUT Cloud

The #1 question: "How do I check my cameras when I'm away from home?"

**Answer: WireGuard VPN (self-hosted)**

1. Hub runs a WireGuard VPN server (built-in, auto-configured)
2. Your phone has WireGuard app (free, iOS + Android)
3. When you're away, phone connects to YOUR hub through encrypted tunnel
4. You see the same dashboard as if you were on WiFi at home
5. Video streams directly from hub to phone — no cloud relay
6. **Setup:** Scan a QR code during initial setup. That's it.

**For users who don't want to deal with port forwarding:**
- **Tailscale** (WireGuard-based) — free for personal use, zero-config
- Or Cloudflare Tunnel (free tier) — exposes hub securely without port forwarding
- Still no video stored in cloud — just a tunnel to YOUR hardware

---

## Self-Hosted Alert Options

| Method | How It Works | Cloud Dependency |
|--------|-------------|-----------------|
| **Local push (LAN)** | Direct push to phone on same WiFi | None |
| **Self-hosted Ntfy** | Push notification server on hub | None (if on LAN/VPN) |
| **Ntfy public relay** | Use ntfy.sh as relay | Minimal — just the push notification, no video/data |
| **Telegram bot** | Send alerts to your Telegram | Telegram servers see alert text/photo only |
| **Email (SMTP)** | Send from hub via your email | Your email provider |
| **Siren / smart home** | Trigger physical siren, lights via Home Assistant | None |
| **SMS via VoIP** | Twilio or similar for SMS alerts | Twilio (optional) |

**Default: Self-hosted Ntfy + local push. Zero cloud contact.**

---

## Making It Easy for Non-Technical Users

The biggest challenge with self-hosted: most consumers can't set up a Raspberry Pi.

### Solution: The iGuardDog Hub is PRE-CONFIGURED

1. **Unbox the hub** — plug in power, plug in ethernet (or connect WiFi via app)
2. **Download iGuardDog app** — scan QR code on the hub
3. **App auto-discovers hub** on local network (mDNS/Bonjour)
4. **Guided setup wizard** in app:
   - Name your property
   - Connect robots (they auto-pair via BLE)
   - Draw patrol zones on satellite image of your property
   - Set alert preferences
   - Optional: enable remote access (one tap → WireGuard configured)
5. **Done.** Robot starts patrolling.

**Time from unbox to patrol: ~15 minutes**

### The Hub is an Appliance, Not a Project
- Custom OS image (based on Raspberry Pi OS) with everything pre-installed
- Auto-updates (pulled from our update server, verified + signed)
- Self-healing: watchdog reboots services if they crash
- No terminal, no SSH, no config files for the user to touch
- Web dashboard at `http://iguarddog.local` for advanced settings
- Factory reset button if anything goes wrong

---

## Revenue Without Subscriptions

If there's no subscription, how do we make money?

| Revenue Source | Type | Amount |
|---------------|------|--------|
| **Hardware sales** (robots + hub + accessories) | One-time | $399-1,499 |
| **Charging pad add-ons** | One-time | $59-99 each |
| **Extra storage** (bigger SSD pre-configured) | One-time | $49-99 |
| **Night vision camera add-on** | One-time | $79-129 |
| **Additional robots** | One-time | $249-349 each |
| **Premium AI model pack** (license plate, face recognition) | One-time | $29-49 |
| **Extended warranty** | Annual | $49-79/yr |
| **Pro support** (priority help, remote troubleshooting) | Annual | $99/yr |
| **iGuardDog Cloud** (OPTIONAL — for people who WANT cloud) | Monthly | $4.99-14.99/mo |

**Core promise: Everything works without paying another dime after purchase.**
**Optional services exist for people who want convenience.**

---

## Competitive Positioning

| Feature | Ring | Arlo | Nest | **iGuardDog** |
|---------|------|------|------|---------------|
| Mobile patrol robot | ❌ | ❌ | ❌ | ✅ |
| Drone | ❌ (failed product) | ❌ | ❌ | ✅ |
| Self-hosted | ❌ | ❌ | ❌ | ✅ |
| No subscription required | ❌ | ❌ | ❌ | ✅ |
| Video stays local | ❌ | ❌ | ❌ | ✅ |
| Open source | ❌ | ❌ | ❌ | ✅ |
| AI detection | Paid tier | Paid tier | Paid tier | **Included** |
| Works without internet | ❌ | ❌ | ❌ | ✅ |
| Price (comparable setup) | $200 + $100/yr | $300 + $130/yr | $330 + $120/yr | **$399-799 once** |
| 3-year cost | $500+ | $690+ | $690+ | **$399-799** |

---

## Marketing Angle

**"Stop renting your security. Own it."**

- Ring charges you monthly to watch YOUR porch
- Nest sends YOUR family's video to Google's servers  
- iGuardDog keeps everything in YOUR home, on YOUR terms
- No subscriptions. No cloud. No compromises.

**Target audience:**
- Privacy-conscious homeowners
- Tech-savvy but convenience-wanting
- r/selfhosted, r/homeassistant, r/privacy communities
- People fed up with subscription fatigue
- Preppers and self-sufficiency enthusiasts
- Smart home enthusiasts who already run Home Assistant
