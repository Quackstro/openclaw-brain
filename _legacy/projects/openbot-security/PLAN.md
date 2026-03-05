# OpenBot Security Patrol — Project Plan

**Author:** Dr. Castro & Jarvis  
**Date:** 2026-02-01  
**Status:** Research & Concept Phase  
**Philosophy:** Open source everything — hardware designs, firmware, software, AI models  
**Sourcing Policy:** No Chinese manufacturing or sourcing. US-made, Mexico, or allied nations only.

---

## ⚖️ CORE PRINCIPLE — MONITOR & REPORT ONLY

> **This company will NEVER add capabilities that take harmful action toward any living thing.**
> 
> Our robots **observe, detect, deter, and report** — nothing more. No weapons, no physical force, no tasers, no projectiles, no trapping mechanisms, no chemical deterrents. Not now, not ever. This is a non-negotiable founding principle.

### What Our Robots DO:
- ✅ Patrol and observe
- ✅ Detect and classify (person, vehicle, animal, anomaly)
- ✅ Record video and audio (where legally permitted)
- ✅ Alert property owners, security teams, and authorities
- ✅ Deter through **presence** — lights, strobes, voice warnings, visible cameras
- ✅ Follow and track subjects at a safe distance
- ✅ Provide live video feed to human decision-makers

### What Our Robots NEVER Do:
- ❌ No weapons of any kind
- ❌ No physical contact or force
- ❌ No chasing/cornering/trapping
- ❌ No projectiles (rubber bullets, paintballs, pepper spray, etc.)
- ❌ No electrical discharge (tasers, shock)
- ❌ No blocking/barricading escape routes
- ❌ No autonomous pursuit beyond property boundaries

### Why This Matters:
1. **Liability** — A robot that harms someone = lawsuit, criminal charges, company-ending risk
2. **Public trust** — Communities will accept helpful observers, not autonomous enforcers
3. **Regulation** — Weaponized robots face extreme regulatory scrutiny; observer robots don't
4. **Ethics** — Machines should never make harm decisions about living beings
5. **Insurance** — Insurable as monitoring equipment; uninsurable as autonomous weapons
6. **HOA/commercial adoption** — Zero chance of adoption if there's any injury risk

This principle is **hardcoded into firmware** — there are no actuator outputs for any harmful mechanism. The hardware physically cannot be weaponized without complete redesign.

---

## 🌍 CORE PRINCIPLE — GIVE BACK AT SCALE

> **If this company reaches billions in revenue, the majority of profits will be donated to charities targeting the root causes of crime, homelessness, and food access.**

We build technology that protects people and property — but we recognize that the best security is a society where people don't need to steal, trespass, or survive on the streets. Our long-term mission is to fund the elimination of the conditions that create insecurity in the first place.

### Focus Areas for Giving:
- **Root causes of crime** — poverty reduction, education, youth mentorship, job training, substance abuse treatment, reentry programs
- **Mental illness** — mental health services, crisis intervention, therapy access, psychiatric care, research funding, stigma reduction, community mental health centers
- **Homelessness** — permanent supportive housing, rapid rehousing programs, homeless prevention, veterans services
- **Food access** — food banks, community gardens, school meal programs, food deserts elimination, sustainable agriculture
- **Greed / systemic inequality** — the hardest root cause to tackle, but worth acknowledging. Support anti-corruption initiatives, financial literacy programs, fair wage advocacy, corporate accountability organizations, and economic empowerment for underserved communities. Lead by example: transparent pricing, fair employee compensation, and the giving pledge itself is an anti-greed statement.

### Structure:
- Formalize as a **1% Pledge** from day one (1% of revenue to charity from first dollar earned)
- Scale commitment as revenue grows: 1% → 5% → 10% → majority at billion-dollar scale
- Consider **B Corp certification** or **Public Benefit Corporation** structure to legally enshrine this mission
- Establish a foundation (e.g., Quackstro Foundation) when revenue supports it
- Transparent annual impact reporting — show customers their subscription dollars fund real change

### Why This Matters for the Business:
1. **Brand differentiation** — "The security company that fights crime at both ends"
2. **Customer loyalty** — HOAs and communities want to support mission-driven companies
3. **Talent attraction** — Engineers and operators want to work for companies that matter
4. **Government contracts** — Social impact missions score points in public procurement
5. **Investor appeal** — Impact investing is a $1T+ market

---

## 1. Executive Summary

Leverage the **OpenBot** open-source platform (smartphone-brained, ~$50 robot bodies) to build **autonomous RC security patrol robots** equipped with cameras, sensors, and AI-driven alerting. Target: large properties, businesses, HOA neighborhoods, and facilities where stationary cameras leave blind spots.

**Key Insight:** OpenBot already provides autonomous navigation, person following, and ML policy training. We extend this into a full security surveillance product by adding patrol route planning, anomaly detection, night vision, real-time alerting, and a central monitoring dashboard.

---

## 2. Why OpenBot as the Foundation

| Feature | OpenBot Provides | We Add |
|---------|-----------------|--------|
| **Robot Body** | DIY (~$50), RC Truck (1:16), Multi-Terrain Vehicle (MTV, 6-wheel rocker-bogie) | Weatherproofing, larger chassis options, night-vision mounts |
| **Brain** | Android smartphone (camera, GPU, WiFi, cellular, GPS) | Dedicated edge compute option (Jetson Nano/Orin) |
| **Firmware** | Arduino Nano motor control | Extended sensor I/O (PIR, ultrasonic, gas, temp) |
| **Navigation** | Autonomous driving policy, person following | Patrol route planning, SLAM mapping, geofencing |
| **ML/AI** | TensorFlow-based policy training, data collection app | Object detection (YOLOv8), anomaly detection, face recognition |
| **Control** | Android controller app, game controller | Central dashboard, multi-robot fleet management |
| **Cost** | ~$50-150 per robot body | Keeps total unit cost under $300-500 |

---

## 2.5 Prototype Property — Dr. Castro's Residence

| Detail | Value |
|--------|-------|
| **House** | ~2,000 sq ft |
| **Lot** | ~½ acre (≈21,780 sq ft / ~0.2 hectares) |
| **Terrain** | Residential — lawn, driveway, likely fenced backyard |
| **Priority zones** | Front entrance, driveway, backyard, sides of house, any outbuildings/garage |
| **Estimated patrol route** | ~600-800 ft perimeter loop |

### Recommended Prototype Setup
- **Ground robots:** 2 (one front/sides, one backyard — swap coverage during charging)
- **Drone:** 1 (rapid aerial sweep on-demand or scheduled flyovers)
- **Charging pads:** 2 (one front, one back — near exterior outlets)
- **Hub:** Raspberry Pi 4 or old laptop running dashboard + MQTT broker on home WiFi
- **Connectivity:** WiFi only (½ acre is well within range with one decent router)

---

## 3. Target Use Cases

### 3.1 Residential — Large Properties & Estates
- **Problem:** 5+ acre properties can't be covered by fixed cameras. Long driveways, outbuildings, perimeter fencing.
- **Solution:** 1-3 robots on scheduled patrol routes covering perimeter, driveway, outbuildings. Alert on unknown persons, vehicles, animals.

### 3.2 HOA / Neighborhood Security
- **Problem:** Shared common areas, parks, parking lots, pool areas. Hiring security guards is expensive ($15-30/hr).
- **Solution:** Robots patrol shared areas on rotating schedules. Visible deterrent + active monitoring. Alerts go to HOA security committee or local dispatch.

### 3.3 Commercial / Business
- **Problem:** Warehouses, office parks, retail plazas, construction sites — high theft/vandalism risk after hours.
- **Solution:** After-hours patrol robots covering parking lots, loading docks, entry points. Integrate with existing alarm systems.

### 3.4 Industrial / Agricultural
- **Problem:** Farms, solar farms, oil fields — vast open areas, equipment theft, trespassing.
- **Solution:** Long-range patrol robots with cellular connectivity, rugged all-terrain bodies.

### 3.5 Interior Security
- **Problem:** Large facilities (hospitals, schools, malls) with corridors, stairwells, blind spots.
- **Solution:** Smaller indoor robots on smooth-surface wheels, covering hallways and common areas during off-hours.

---

## 4. System Architecture

```
┌─────────────────────────────────────────────────────┐
│                 CLOUD / CENTRAL HUB                  │
│                                                       │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │ Monitoring   │  │ Alert Engine │  │ Fleet Mgmt  │ │
│  │ Dashboard    │  │ (AI + Rules) │  │ & Scheduling│ │
│  └──────┬──────┘  └──────┬───────┘  └──────┬──────┘ │
│         │                │                  │         │
│  ┌──────┴──────────────┴─────────────────┴──────┐   │
│  │           API / Message Broker (MQTT)          │   │
│  └──────────────────────┬────────────────────────┘   │
└─────────────────────────┼───────────────────────────┘
                          │  WiFi / Cellular
          ┌───────────────┼───────────────┐
          │               │               │
    ┌─────┴─────┐  ┌─────┴─────┐  ┌─────┴─────┐
    │  Robot 1   │  │  Robot 2   │  │  Robot N   │
    │            │  │            │  │            │
    │ ┌────────┐ │  │ ┌────────┐ │  │ ┌────────┐ │
    │ │Smartphone│ │  │ │Smartphone│ │  │ │Smartphone│ │
    │ │/ Jetson │ │  │ │/ Jetson │ │  │ │/ Jetson │ │
    │ │  Brain  │ │  │ │  Brain  │ │  │ │  Brain  │ │
    │ └────────┘ │  │ └────────┘ │  │ └────────┘ │
    │ ┌────────┐ │  │            │  │            │
    │ │Arduino  │ │  │   ...      │  │   ...      │
    │ │Firmware │ │  │            │  │            │
    │ └────────┘ │  │            │  │            │
    │ Motors,    │  │            │  │            │
    │ Sensors,   │  │            │  │            │
    │ Cameras    │  │            │  │            │
    └───────────┘  └───────────┘  └───────────┘
                          │
                    ┌─────┴─────┐
                    │  Charging  │
                    │  Station   │
                    └───────────┘
```

---

## 4.5 Hybrid Air + Ground Architecture

The real power move: **ground robots for persistent patrol + drones for rapid aerial response.** They complement each other perfectly.

| Capability | Ground Robot | Drone | Combined |
|-----------|-------------|-------|----------|
| Persistent patrol | ✅ Hours of runtime | ❌ 20-35 min flight time | Ground patrols, drone on standby |
| Speed to scene | ❌ Slow (~3 mph) | ✅ 30+ mph | Drone arrives in seconds |
| Camera angles | ❌ Ground level only | ✅ Aerial overview | Full 3D awareness |
| Night operation | ✅ IR + headlights | ⚠️ Noisy, limited | Ground handles night, drone for emergencies |
| Weather tolerance | ✅ Rain/wind OK | ❌ Grounded in rain/wind | Ground covers bad weather |
| Deterrent value | ✅ Visible, lights, audio | ✅ Buzzing overhead is intimidating | Double deterrent |
| Stealth | ⚠️ Somewhat visible | ❌ Very loud | Ground can be stealthy |
| Detail inspection | ✅ Ground-level close-up | ❌ Limited detail from altitude | Ground for detail, air for overview |

### How They Work Together

```
 Normal State:                    Alert Triggered:
 ┌─────────────┐                 ┌─────────────┐
 │  Drone: 🔋  │                 │ Drone: 🚁   │ ← Launches, gets aerial
 │  On pad,    │                 │ Flies to     │   view in <30 seconds
 │  charging   │                 │ alert zone   │
 └─────────────┘                 └──────┬──────┘
                                        │ Streams aerial feed
 ┌─────────────┐                 ┌──────┴──────┐
 │ Ground: 🤖  │                 │ Ground: 🤖  │ ← Continues ground
 │ Patrolling  │  ──trigger──▶   │ Approaches   │   approach for close-up
 │ Zone 1      │                 │ alert point  │   + deterrent
 └─────────────┘                 └─────────────┘
```

1. **Ground robot detects anomaly** (person, vehicle, motion)
2. **Drone auto-launches** from its pad, flies to location in seconds
3. **Drone provides aerial overview** — how many people, escape routes, vehicle plates from above
4. **Ground robot approaches** for close-up, deterrent (lights, voice), and sustained tracking
5. **Drone returns to pad** after 5-10 min (conserve battery), ground robot continues monitoring
6. **If ground robot is charging**, drone can do a quick flyover patrol instead

### Drone Platform Options

#### Option A: ArduPilot/PX4 Custom Build (Recommended for Prototype)
- **Flight controller:** Pixhawk 6C (~$100) or budget clone (~$40)
- **Autopilot firmware:** ArduPilot Copter (open-source, mature, waypoint missions, auto-land)
- **Frame:** 450mm-550mm quadcopter kit ($30-60)
- **Camera:** Raspberry Pi camera module or GoPro-style ($25-75)
- **Companion computer:** Raspberry Pi Zero 2W ($15) for AI + comms
- **Communication:** DroneKit-Python for programmatic control via WiFi
- **Auto-land pad:** Precision landing with IR beacon or ArUco marker (same as ground robot pads)
- **Inductive charging:** Drone landing pad with TX coil — drone has RX coil on landing gear
- **Flight time:** ~20-25 min on 4S 5000mAh LiPo
- **Est. cost:** $250-450

#### ~~Option B: DJI Mini Series~~ (REJECTED — closed source, not aligned with project philosophy)

#### Option B: PX4 Custom Build (Alternative Open-Source)
- **Flight controller:** Same Pixhawk hardware, different open-source firmware
- **Firmware:** PX4 Autopilot (BSD license, Dronecode Foundation)
- **Companion:** MAVSDK (C++/Python) instead of DroneKit
- **Pros:** Clean architecture, strong commercial adoption, great SITL simulation
- **Cons:** Slightly smaller hobbyist community than ArduPilot
- **Either ArduPilot or PX4 works — both are fully open source**

### Drone-Specific Features
- **Auto-launch on alert:** Ground robot triggers → drone takes off autonomously
- **Scheduled flyovers:** Every N hours, drone does a quick aerial sweep of the full property
- **Precision auto-land:** ArUco marker + IR beacon on landing pad for cm-accurate landing onto charging pad
- **Geofence:** Hard altitude and boundary limits — stays within property, max 100ft AGL
- **No-fly safety:** Doesn't launch in high wind (>20mph), rain, or low battery
- **Live stream:** Aerial camera feed to dashboard in real-time

### Drone Inductive Charging Pad
- Same concept as ground robot but built into a landing pad
- **TX coil** embedded in flat landing surface
- **RX coil** mounted on drone's landing gear/underside
- **Alignment:** Precision landing ensures coil alignment (ArduPilot's precision land feature is built for this)
- **Power:** 15-30W charging — full charge in ~90-120 min for typical quad battery
- **Weather protection:** Retractable cover or sheltered pad location

### FAA Considerations (USA)
| Rule | Implication |
|------|-------------|
| **Part 107** (commercial use) | Need Remote Pilot Certificate if used commercially. Dr. Castro's personal property = recreational/hobby. |
| **Under 250g** | DJI Mini class — no registration needed for recreational |
| **Over 250g** | Must register with FAA ($5), mark drone with registration # |
| **BVLOS** | Beyond Visual Line of Sight requires waiver for commercial. Autonomous patrol = BVLOS. Recreational on own property = gray area. |
| **Night flight** | Allowed with anti-collision lights (Part 107.29 updated) |
| **Over people** | Restricted without waiver. On private property with no public = generally fine |
| **Remote ID** | Required for drones manufactured after Sept 2023. ArduPilot supports Remote ID broadcast. |

**For prototyping on your own property:** Recreational use, stay under 400ft, keep anti-collision lights on, have Remote ID — you're good.

---

## 5. Hardware Design

### 5.1 Outdoor Patrol Robot (Primary)
**Base:** OpenBot MTV (Multi-Terrain Vehicle) — 6-wheel rocker-bogie, handles grass, gravel, curbs
- **Chassis Mods:** Weatherproof enclosure (IP65), larger battery (10,000-20,000 mAh LiPo), bumper guards
- **Brain:** Android phone (budget: Pixel 6a or similar, ~$150) OR NVIDIA Jetson Orin Nano (~$200)
- **Primary Camera:** Smartphone camera (1080p/4K, good low-light on modern phones)
- **Night Vision:** Add-on USB IR/thermal camera module (FLIR Lepton ~$200, or budget IR cam ~$30)
- **Sensors:**
  - Ultrasonic (HC-SR04) — obstacle avoidance ×4
  - PIR motion sensor — detect heat signatures
  - GPS module (if using Jetson instead of phone)
  - IMU/accelerometer (built into phone, or MPU6050)
  - Optional: environmental (temp, humidity, smoke/gas)
- **Lighting:** LED headlights + IR illuminators for night vision, optional strobe/blue light for deterrent
- **Audio:** Speaker for warnings/announcements, microphone for 2-way communication
- **Connectivity:** WiFi 5/6 + 4G/LTE cellular modem (for areas beyond WiFi range)
- **Estimated Unit Cost:** $300-500

### 5.2 Indoor Patrol Robot
**Base:** OpenBot DIY or RC Truck body — smaller, smooth wheels
- Simplified: no weatherproofing needed, WiFi only, smaller battery
- Add-on: LiDAR module (RPLiDAR A1 ~$100) for precise indoor SLAM
- **Estimated Unit Cost:** $150-300

### 5.3 Inductive (Wireless) Charging System

**Why Inductive:** No exposed contacts to corrode, no precise alignment needed, fully weatherproof, no mechanical wear. The robot just parks over a pad.

#### Charging Pad (Ground Unit)
- **Coil:** DIY inductive TX coil module (5V-12V, 10-20W) — available on AliExpress/Amazon for $5-15
  - Budget option: Qi-standard TX module (~15W, widely available)
  - Better option: Custom resonant inductive coil pair (higher tolerance for misalignment, up to 30-40mm gap)
- **Enclosure:** Weatherproof ground-flush pad (IP67), 3D-printed or cast resin housing
- **Power:** Wired to outdoor-rated 12V power supply or solar panel + battery for remote locations
- **Beacon:** IR LED or BLE beacon on the pad so the robot can locate it precisely during final approach
- **Visual marker:** ArUco marker on the pad for camera-based precision docking

#### Robot Receiver (Onboard)
- **Coil:** Matching RX coil mounted on the robot's underside (flat, protected by chassis)
- **Charging circuit:** Qi RX module → buck/boost converter → LiPo charge controller (TP4056 or BMS)
- **Alignment tolerance:** Resonant coupling allows ±3cm misalignment and 10-30mm air gap — robot just needs to park roughly over the pad
- **Charging indicator:** LED on robot + telemetry report to dashboard

#### Smart Charging Behavior
- **Battery monitoring:** Arduino reads voltage divider on LiPo → reports to phone brain via serial
- **Range awareness:** Robot continuously calculates distance-to-nearest-charger vs. remaining battery
- **Reserve threshold:** When battery hits 25%, robot enters "return to charge" mode
- **Critical threshold:** At 15%, robot aborts all tasks and heads straight to nearest pad
- **Energy budget:** Before accepting a patrol route, robot estimates if it has enough charge to complete it + return
- **Formula:** `can_patrol = (battery_remaining - reserve) > estimated_route_energy_cost`
- **Multi-pad support:** Large properties have multiple pads. Robot picks the closest one. Pads report occupancy so two robots don't fight over one pad.

#### Charging Station Options by Deployment
| Scenario | Power Source | Pad Type | Est. Cost |
|----------|-------------|----------|-----------|
| Near building | Wired 12V AC adapter | Ground-flush pad | $20-40 |
| Remote/perimeter | Solar panel (20W) + 12V battery | Elevated weatherproof pad | $60-100 |
| Indoor | Wired USB-C / 12V | Floor mat style | $15-30 |

#### Parts for Inductive Charging (per station + robot pair)
| Item | Est. Cost |
|------|-----------|
| TX coil module (15-20W) | $8-15 |
| RX coil module (matching) | $8-15 |
| Qi/resonant controller boards | $5-10 |
| LiPo charge controller (BMS) | $3-5 |
| Weatherproof enclosure (TX) | $5-10 |
| IR/BLE beacon + ArUco marker | $3-5 |
| **Total per charging point** | **$30-60** |

---

## 6. Software Stack

### 6.1 On-Robot (Edge)

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **OS** | Android (phone) / Jetson Linux | Base platform |
| **Motor Control** | OpenBot Arduino firmware (extended) | Drive motors, read sensors |
| **Navigation** | OpenBot autonomous nav + ROS2 Nav2 | Path planning, obstacle avoidance, SLAM |
| **Computer Vision** | YOLOv8-nano / MobileNet SSD | Real-time object detection (person, vehicle, animal, package) |
| **Anomaly Detection** | Custom TF Lite model | Detect unusual activity (loitering, fence climbing, broken windows) |
| **Communication** | MQTT client + WebRTC | Telemetry, alerts, live video stream |
| **Local Decision** | Rule engine | When to alert, when to follow, when to return to base |

### 6.2 Central Hub / Cloud

| Component | Technology Options | Purpose |
|-----------|-------------------|---------|
| **Dashboard** | React/Next.js web app (MIT) | Live map, camera feeds, alert history, fleet status |
| **API Server** | FastAPI (MIT) | REST + WebSocket API |
| **Message Broker** | Mosquitto MQTT (EPL/EDL open source) | Real-time robot telemetry |
| **Video Streaming** | MediaMTX (MIT) + WebRTC | Live camera feeds, recording |
| **Alert Engine** | Custom + Telegram / Ntfy (open source push) | Smart alerts via push, Telegram, email |
| **Video Storage** | Frigate NVR (MIT) / MinIO (AGPL) | Event clips, continuous recording, built-in object detection |
| **ML Pipeline** | PyTorch (BSD) / Ultralytics YOLOv8 (AGPL) | Train and update detection models |
| **Fleet Management** | Custom scheduler (our code, open source) | Route assignment, charging coordination, health monitoring |
| **Database** | PostgreSQL (BSD) + TimescaleDB (Apache 2.0) | Events, telemetry time-series, user management |
| **Maps** | OpenStreetMap (ODbL) + Leaflet (BSD) | Property mapping, patrol route editor |

### 6.3 Mobile App (Operator)
- Real-time alerts with snapshots
- Live camera view from any robot
- Manual override / joystick control
- Patrol route editor (draw on map)
- Two-way audio (talk through robot speaker)

---

## 7. AI / ML Capabilities

### 7.1 Detection Models (On-Device)
- **Person detection** — known vs. unknown (face recognition optional)
- **Vehicle detection** — car, truck, motorcycle; license plate recognition
- **Animal detection** — deer, dog, coyote, etc. (reduce false alarms)
- **Object classification** — packages, tools, weapons
- **Activity recognition** — walking, running, climbing, loitering

### 7.2 Anomaly Detection
- **Behavioral:** Person in unexpected area/time, loitering > N minutes
- **Environmental:** Sudden temperature spike (fire), unusual sounds (glass break, alarm)
- **Structural:** Open door/gate that should be closed, broken fence, graffiti (before/after comparison)
- **Temporal:** Activity patterns — learn what's normal for Tuesday 2am vs Saturday 2pm

### 7.3 Smart Alerting (Reduce False Alarms)
- **Tiered alerts:** Info → Warning → Critical
- **Context-aware:** Known delivery driver vs. unknown person; resident's car vs. stranger's
- **Confirmation protocol:** Robot approaches and captures more angles before escalating
- **Learning:** User feedback loop ("this was nothing" / "real threat") improves model over time

---

## 8. Key Features & Differentiators

### 8.1 Autonomous Patrol Routes
- Draw routes on a satellite/map view of the property
- Time-based schedules (more frequent at night, random intervals to be unpredictable)
- Dynamic rerouting — if anomaly detected on one side, other robots converge

### 8.2 Swarm Coordination (Multi-Robot Fleet)

#### Core Swarm Architecture
```
┌──────────────────────────────────────────────┐
│            SWARM COORDINATOR (Hub)            │
│                                               │
│  ┌───────────┐ ┌───────────┐ ┌─────────────┐│
│  │ Zone Map   │ │ Task Queue│ │ Energy Mgr  ││
│  │ & Divider  │ │ & Router  │ │ & Charge    ││
│  │            │ │           │ │ Scheduler   ││
│  └─────┬─────┘ └─────┬─────┘ └──────┬──────┘│
│        └──────────┬───┴──────────────┘       │
│                   │                           │
│        ┌──────────┴──────────┐               │
│        │   Swarm State Store  │               │
│        │  (all robot poses,   │               │
│        │   battery, status)   │               │
│        └──────────┬──────────┘               │
└───────────────────┼──────────────────────────┘
                    │ MQTT pub/sub
        ┌───────────┼───────────┐
        │           │           │
   ┌────┴───┐ ┌────┴───┐ ┌────┴───┐
   │Robot A  │ │Robot B  │ │Robot C  │
   │Zone 1   │ │Zone 2   │ │Zone 3   │
   │██████░░ │ │████░░░░ │ │███████░ │
   │ 75% ⚡  │ │ 50% ⚡  │ │ 88% ⚡  │
   └────────┘ └────────┘ └────────┘
```

#### Zone-Based Coverage
- **Map the property:** Satellite/aerial image or manual walk with GPS trace → define property boundary
- **Auto-zone division:** Algorithm splits property into N zones (one per robot) based on area, terrain difficulty, and priority areas
- **Overlap zones:** Adjacent zones overlap by 10-20% so no blind spots at boundaries
- **Priority weighting:** High-value areas (entry points, parking, storage) get more frequent passes
- **Dynamic rebalancing:** If a robot goes to charge, its zone is temporarily absorbed by neighbors

#### Swarm Behaviors
1. **Patrol Mode (default):** Each robot patrols its assigned zone on semi-random routes (unpredictable to intruders but ensures full coverage)
2. **Investigate Mode:** When one robot detects something, it alerts the swarm. Nearest available robot repositions to get a second angle / cut off escape routes
3. **Converge Mode:** Confirmed threat → multiple robots converge on location, surrounding from different directions. Maximizes camera angles and deterrent effect.
4. **Escort Mode:** Track and follow a person/vehicle of interest across zones. Robots hand off tracking as subject crosses zone boundaries (like cell tower handoff)
5. **Perimeter Lock:** On alarm trigger, all robots move to cover entry/exit points of the property
6. **Charge Rotation:** Staggered charging — never more than 1/3 of fleet charging at once. When Robot A goes to charge, Robot B expands patrol to cover.

#### Communication Protocol
- **Heartbeat:** Every robot broadcasts position + battery + status every 5 seconds via MQTT
- **Event broadcast:** Detection events published to swarm topic — all robots receive
- **Task assignment:** Coordinator pushes tasks, robots ACK/NACK based on battery and distance
- **Mesh fallback:** If WiFi to hub is lost, robots can relay messages to each other via BLE mesh (ESP32 supports this)
- **Consensus:** Simple leader-election — if coordinator goes offline, robots fall back to independent patrol of their last-known zones

#### Fleet Scaling
| Property Size | Recommended Robots | Charging Pads | Coverage |
|--------------|-------------------|---------------|----------|
| 1-2 acres | 2 robots | 1 pad | Full with charge rotation |
| 3-5 acres | 3-4 robots | 2 pads | Full continuous |
| 5-10 acres | 4-6 robots | 3 pads | Full continuous + rapid response |
| 10+ acres | 6-10+ robots | 4+ pads | Full continuous + swarm response |
| HOA neighborhood | 4-8 robots | 4-6 pads (distributed) | Common areas + perimeter |

#### Deployment Workflow
1. **Map:** Walk/drive property boundary with GPS → upload to dashboard
2. **Place pads:** Install charging pads at strategic locations (near power, spread across property)
3. **Register robots:** Power on, connect to WiFi, they auto-register with hub
4. **Auto-configure:** Hub divides zones based on # of robots and pad locations
5. **Launch:** Robots deploy from their nearest charging pad and begin patrol
6. **Learn:** Over first 48 hours, robots map terrain obstacles and refine routes

### 8.3 Autonomous Failover Policies (Comms Loss)

The robot must be **fully self-sufficient** when communication fails. Every behavior is burned into on-device firmware/software — no cloud dependency.

#### Failover State Machine
```
NORMAL (full comms)
  │
  ├─ WiFi lost ──▶ DEGRADED-1
  │                 • Switch to cellular / LoRa / BLE mesh
  │                 • Continue current patrol route
  │                 • Alert hub via backup channel
  │                 • Attempt WiFi reconnect every 30s
  │                 │
  │                 ├─ Backup comms working ──▶ Continue patrol (reduced telemetry)
  │                 │
  │                 └─ ALL comms lost ──▶ AUTONOMOUS MODE
  │
  └─ ALL comms lost immediately ──▶ AUTONOMOUS MODE

AUTONOMOUS MODE (zero comms)
  │
  ├─ Continue current patrol route from on-device memory
  ├─ All detection/alerting runs locally (on-device AI)
  ├─ Log all events to local storage (SD card / phone storage)
  ├─ Activate visible deterrent (LEDs on, slow strobe)
  ├─ Attempt comms reconnect every 60s
  │
  ├─ Battery > 25% ──▶ Continue patrol loop
  │
  ├─ Battery ≤ 25% ──▶ RETURN TO CHARGE
  │                     • Navigate to nearest known charging pad
  │                     • Park on inductive pad
  │                     • Enter SENTRY MODE while charging
  │
  └─ Battery ≤ 10% ──▶ EMERGENCY PARK
                        • Stop immediately in safe location
                        • Flash all LEDs as locator beacon
                        • Save GPS coordinates to persistent storage
                        • Power down non-essential systems
                        • Keep BLE beacon alive as long as possible

SENTRY MODE (on charging pad, no comms)
  │
  ├─ Camera stays active — records to local storage
  ├─ Motion detection via phone sensors (accelerometer, camera)
  ├─ If motion detected: activate lights + speaker warning
  ├─ Continue attempting comms reconnect
  │
  ├─ Comms restored ──▶ Upload all cached logs/video ──▶ NORMAL
  │
  └─ Fully charged + still no comms ──▶ Resume AUTONOMOUS patrol
```

#### On-Device Requirements (No Cloud Needed)
| Capability | Stored On-Device |
|-----------|-----------------|
| Patrol routes | Full route waypoints cached in phone storage |
| Map / obstacles | Local obstacle map from prior runs |
| AI models | YOLOv8-nano TFLite model on phone |
| Charging pad locations | GPS coordinates of all known pads |
| Alert policies | Detection rules + response actions |
| Event log | SQLite DB on phone, syncs when comms restore |
| Video buffer | Rolling 24hr recording to SD / phone storage |
| Geofence boundaries | Property boundary polygon — hard-coded |

#### Behavioral Rules (Firmware-Level, Cannot Be Overridden Remotely)
1. **Never leave geofence** — even under remote command, even if hacked
2. **Always reserve enough battery to return to nearest pad** — recalculated every 60s
3. **Never drain below 10%** — emergency park and preserve remaining power for beacon
4. **If picked up / tipped over** — accelerometer detects tampering → alarm + flash + log GPS
5. **If obstacle blocks return path** — try alternate route, if all blocked → emergency park + beacon
6. **Patrol completion guarantee** — won't start a route it can't finish + return to charge
7. **Stale command rejection** — ignore any cached command older than 5 minutes (anti-replay even offline)

#### Drone-Specific Failover
| Condition | Action |
|-----------|--------|
| Comms lost mid-flight | Return to launch (RTL) — ArduPilot built-in |
| Comms lost on pad | Stay on pad, do not auto-launch without comms |
| Battery < 25% in flight | Immediate RTL regardless of mission |
| GPS lost | Hold position → attempt reacquire → land in place if >30s |
| High wind detected | Abort mission → RTL |
| Ground robot calls for air support but no comms to drone | Ground robot handles alone — no unsafe drone launch |

#### Comms Restoration Sync
When connectivity is restored after an outage:
1. Upload all cached event logs (timestamped)
2. Upload buffered video clips of any detections
3. Report battery status and current position
4. Receive any updated patrol routes or policies
5. Resume normal coordinated operation with hub and swarm

### 8.5 Deterrent Mode
- Bright LED spotlight + audible alarm when threat confirmed
- Pre-recorded voice warnings ("You are being recorded. Authorities have been notified.")
- Strobe lights for visibility
- Two-way intercom for live operator communication

### 8.6 Integration Points
- **Smart Home:** HomeAssistant, SmartThings — trigger lights, locks, sirens
- **Alarm Systems:** Integration with ADT, Ring, SimpliSafe APIs
- **Law Enforcement:** Auto-generate incident reports with timestamped video
- **Cloud Cameras:** Complement fixed cameras — robot goes to investigate when fixed cam triggers

### 8.7 Geofencing & Safety
- GPS geofence — robot stays within property boundaries
- Speed limits near roads, pedestrians
- Emergency stop — physical button + remote kill switch
- Collision avoidance — ultrasonic + camera-based

---

## 9. Revenue / Business Model Options

| Model | Description | Price Point |
|-------|-------------|-------------|
| **Hardware Kit** | Sell robot kits (partial or fully assembled) | $300-800 per unit |
| **SaaS Dashboard** | Monthly subscription for cloud monitoring, alerts, video storage | $29-99/mo per property |
| **Managed Service** | Full-service: install, maintain, monitor | $199-499/mo |
| **Enterprise/HOA** | Multi-robot fleet with dedicated support | Custom pricing |
| **DIY Open Source** | Community edition — free plans, sell premium features | Freemium |

### Competitive Landscape
- **Knightscope K5** — $60K+, enterprise-only, 400lb robot
- **Cobalt Robotics** — $6/hr, indoor-focused, human-in-loop
- **Ring/Arlo/Wyze** — fixed cameras only, no mobility
- **Boston Dynamics Spot** — $75K, overkill for most use cases

**Our Position:** 10-100x cheaper than commercial security robots, open-source foundation, accessible to homeowners and small businesses. The "Ring doorbell" of patrol robots.

---

## 10. Development Phases

### Phase 1: Proof of Concept (Weeks 1-4)
- [ ] Order OpenBot MTV kit + parts
- [ ] Build 1 robot with smartphone brain
- [ ] Get OpenBot autonomous navigation working
- [ ] Add YOLOv8-nano person/vehicle detection
- [ ] Basic MQTT telemetry to a simple dashboard
- [ ] Test indoor + outdoor operation
- **Deliverable:** Single robot doing basic patrol + person detection

### Phase 2: Core Platform + Inductive Charging (Weeks 5-10)
- [ ] Design weatherproof enclosure (3D print)
- [ ] Add night vision (IR camera module)
- [ ] Build and test inductive charging pad + robot RX coil
- [ ] Implement battery monitoring + distance-to-home awareness
- [ ] Auto-return-to-charge behavior (25% threshold)
- [ ] Build patrol route editor (web-based map UI)
- [ ] Implement scheduled patrol routes with return-to-base
- [ ] Smart alerting engine (tiered, with photos/clips)
- [ ] Alert delivery via Telegram / push notification / SMS
- [ ] Basic web dashboard (live map, camera feed, alert history)
- **Deliverable:** Single robot doing scheduled patrols with smart alerts + wireless auto-charging

### Phase 3: Swarm + Drone Hybrid (Weeks 11-18)
- [ ] Build second ground robot
- [ ] Fleet management — register multiple robots, zone auto-division
- [ ] Zone-based patrol assignment with charge rotation
- [ ] Swarm communication protocol (MQTT heartbeat + event broadcast)
- [ ] Build or acquire drone (ArduPilot quad recommended)
- [ ] Drone precision auto-land on inductive charging pad
- [ ] Drone auto-launch on ground robot alert trigger
- [ ] Unified dashboard: ground bots + drone on same map
- [ ] Anomaly detection model training
- [ ] Two-way audio on ground robots
- [ ] Mobile app (React Native)
- [ ] Smart home integration (HomeAssistant)
- **Deliverable:** 2 ground robots + 1 drone, coordinated hybrid patrol on ½ acre property

### Phase 4: Production & Polish (Weeks 17-24)
- [ ] Ruggedize hardware for all-weather
- [ ] LTE cellular connectivity option
- [ ] Advanced AI: license plate recognition, activity recognition
- [ ] User management, multi-property support
- [ ] Video recording & playback (NVR)
- [ ] Beta testing with real properties
- **Deliverable:** Beta-ready product for early adopters

### Phase 5: Scale & Monetize (Month 7+)
- [ ] Refine based on beta feedback
- [ ] Launch SaaS platform
- [ ] Hardware kit sales (Amazon/direct)
- [ ] HOA/enterprise pilot programs
- [ ] Community edition release (open source)

---

## 11. Bill of Materials (MVP — 1 Robot)

| Item | Source | Est. Cost |
|------|--------|-----------|
| OpenBot MTV 3D-printed body parts | Self-print or service | $30-60 |
| 6× TT/N20 motors + wheels | Amazon/AliExpress | $20-40 |
| Arduino Nano + motor driver (L298N) | Amazon | $10-15 |
| Android phone (Pixel 6a / Samsung A series) | Refurbished | $100-150 |
| 10,000 mAh LiPo battery + BMS | Amazon | $20-30 |
| IR night vision camera (USB) | Amazon | $25-40 |
| Ultrasonic sensors ×4 (HC-SR04) | Amazon | $5 |
| PIR motion sensor | Amazon | $3 |
| LED headlights + IR illuminators | Amazon | $10 |
| Speaker module | Amazon | $5 |
| Weatherproof enclosure materials | Hardware store / 3D print | $15-25 |
| Inductive RX coil + controller (onboard) | AliExpress/Amazon | $12-20 |
| Misc (wires, connectors, screws, etc.) | Amazon | $10-15 |
| **TOTAL (per robot)** | | **$265-415** |
| **Charging pad (each)** | | **$30-60** |

---

## 12. Things to Leverage Beyond OpenBot

All open source, all the way down:

- **OpenBot** (MIT) — Robot body, firmware, Android app, ML policy training
- **ArduPilot** (GPLv3) — Drone autopilot, waypoint missions, precision landing
- **DroneKit-Python** (Apache 2.0) — Programmatic drone control
- **ROS2** (Apache 2.0) — Industry-standard robotics middleware for advanced SLAM/nav
- **OpenCV** (Apache 2.0) — Computer vision pipelines
- **YOLOv8** (AGPL) — Object detection (person, vehicle, animal)
- **Frigate NVR** (MIT) — Video recording with built-in object detection
- **Home Assistant** (Apache 2.0) — Smart home automation integration
- **Mosquitto MQTT** (EPL) — IoT messaging backbone
- **MediaMTX** (MIT) — RTSP/WebRTC video streaming server
- **Ntfy** (Apache 2.0) — Self-hosted push notifications
- **Leaflet + OpenStreetMap** (BSD/ODbL) — Mapping and route planning
- **Ollama** (MIT) — Local LLMs for natural language incident summaries
- **OpenClaw** — Alert routing, Telegram integration, scheduled reports, fleet chat interface
- **PostgreSQL** (BSD) + **TimescaleDB** (Apache 2.0) — Data storage
- **FastAPI** (MIT) — API server
- **React** (MIT) — Dashboard frontend

---

## 13. Key Resources & Contacts

| Resource | Detail |
|----------|--------|
| **Dr. Castro's company** | **Quackstro LLC** — existing app dev company, potential vehicle for this venture |
| **Prototype phone** | Pixel 9 Pro — Tensor G4, 50MP camera, night sight, WiFi 7 (use for dev/testing, get cheap dedicated phone for outdoor robot) |
| **3D printing** | Neighbor has printer — can print MTV body parts for filament cost |
| **Security domain expert** | Same neighbor owns a security company — potential partner, advisor, first commercial customer |
| **Prototype location** | Dr. Castro's property — ½ acre, 2K sq ft house |

### Business Structure Options with Quackstro LLC + Neighbor's Security Co.

**Option A: Operate Under Quackstro LLC**
- Add robotics/security as a new product line under existing LLC
- Simple, no new entity formation needed
- Neighbor comes in as contractor, advisor, or gets membership interest
- Pro: Fast, no setup cost. Con: Mixes app dev liability with robotics/security.

**Option B: New Joint Venture LLC**
- Quackstro LLC + Neighbor's Security Co. form a new JV entity
- Clean separation of IP, liability, and revenue
- Each company holds membership interest in the JV
- Pro: Clean structure, clear ownership. Con: More setup overhead.

**Option C: Quackstro as Tech Provider → Neighbor as Distributor**
- Quackstro builds and owns the tech (hardware + software)
- Neighbor's security company is the exclusive (or preferred) distributor/installer
- Revenue share on each deployment
- Pro: Each company does what it's best at. Con: Less alignment than JV.

**Option D: DBA / Division Under Quackstro**
- File a DBA (Doing Business As) for the security robotics brand under Quackstro LLC
- Keeps it simple while giving the product its own identity
- Neighbor joins as member or gets service agreement
- Pro: Cheapest, fastest. Con: Still shared liability with app dev work.

**Recommendation:** Start with **Option D** (DBA under Quackstro) for prototyping phase. Graduate to **Option B** (JV) if/when neighbor commits and there's product-market fit. This avoids premature entity formation while keeping the door open.

## 14. Open Questions / Decisions Needed

1. ~~**Phone vs. Jetson?**~~ → Phone for prototype (Pixel 9 Pro). Jetson as future upgrade tier.
2. **Body size?** MTV is great for outdoor but might be too large for indoor. Should we have two product lines?
3. **DIY kit vs. assembled?** Open source plans for builders + pre-assembled option for buyers?
4. **Legal/regulatory?** Recording laws vary by state. Need to address privacy concerns, especially for HOA/neighborhood use. **Neighbor's security company expertise is key here.**
5. **Connectivity?** WiFi-only for prototype (½ acre is fine). Cellular for larger deployments later.
6. **Branding?** Product name, identity, positioning.
7. **Neighbor involvement?** When/how to bring him in — early co-founder vs. advisor vs. later customer?

---

## 14. Next Steps

1. **Review this plan** — Dr. Castro to refine scope, priorities, and target market focus
2. **Order MVP parts** — Start with 1 OpenBot MTV build
3. **Set up development environment** — Clone OpenBot repo, Android Studio, Arduino IDE
4. **Prototype Phase 1** — Get a robot driving autonomously with basic detection
5. **Research legal/regulatory** — Recording laws, FCC compliance for radio, local drone/robot ordinances
