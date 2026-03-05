# Communication Systems & Cybersecurity Architecture
## Autonomous Security Patrol Robot Fleet

**System:** Ground patrol robots (OpenBot/Android phone brain) + ArduPilot drones + Central hub  
**Architecture:** All open source  
**Date:** February 2026  
**Classification:** Internal Engineering Reference

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Multi-Layer Communication Redundancy](#2-multi-layer-communication-redundancy)
3. [Encryption & Security Architecture](#3-encryption--security-architecture)
4. [Anti-Hacking / Attack Resistance](#4-anti-hacking--attack-resistance)
5. [Proprietary/Custom Obfuscation Schemes](#5-proprietarycustom-obfuscation-schemes)
6. [Specific Hardware for Secure Comms](#6-specific-hardware-for-secure-comms)
7. [Open Source Security Tools](#7-open-source-security-tools)
8. [Communication Methods Comparison Table](#8-communication-methods-comparison-table)
9. [Failover Architecture Diagram](#9-failover-architecture-diagram)
10. [Implementation Roadmap](#10-implementation-roadmap)

---

## 1. Executive Summary

This is a **security product**. If an adversary can hack the robots, jam communications, spoof GPS, or inject malicious commands, the entire value proposition collapses. The communication architecture must be:

- **Redundant:** No single point of failure — multiple independent radio technologies
- **Encrypted:** Every byte on every channel, end-to-end, with hardware-backed keys
- **Resilient:** Automatic failover, jamming detection, and autonomous fallback modes
- **Authenticated:** Zero-trust — every command cryptographically verified before execution
- **Obfuscated:** Custom protocols that give attackers no foothold even if they capture packets

The architecture uses a **5-layer communication stack** with automatic failover:

```
┌─────────────────────────────────────────────────┐
│  Layer 1: WiFi 6 Mesh (Primary)                 │  High bandwidth, medium range
│  Layer 2: Cellular 4G/5G (Backup)               │  Wide area, carrier-dependent
│  Layer 3: LoRa Sub-GHz (Emergency)              │  Ultra-long range, low bandwidth
│  Layer 4: BLE Mesh (Robot-to-Robot)              │  Short range swarm coordination
│  Layer 5: Autonomous Mode (No Comms)             │  Return-to-base, local AI decisions
└─────────────────────────────────────────────────┘
```

Each layer is independently encrypted with its own key material, stored in hardware secure elements, and monitored for jamming/tampering.

---

## 2. Multi-Layer Communication Redundancy

### 2.1 WiFi (Primary Channel)

#### Technology: 802.11ax (WiFi 6) / 802.11be (WiFi 7)

WiFi serves as the primary high-bandwidth channel for video streaming, real-time telemetry, and command/control.

**WiFi 6 (802.11ax) Advantages for Robotics:**
- **OFDMA (Orthogonal Frequency Division Multiple Access):** Allows simultaneous communication with multiple robots on a single channel — critical when 5-10 robots share the same AP
- **Target Wake Time (TWT):** Reduces power consumption for battery-powered ground robots by scheduling wake periods
- **BSS Coloring:** Reduces interference in dense deployments (multiple APs across large properties)
- **MU-MIMO:** Up to 8 spatial streams; multiple robots can receive data simultaneously
- **1024-QAM:** Higher data density per symbol = more throughput at same range
- **WPA3-SAE:** Mandatory, provides Simultaneous Authentication of Equals (resistant to offline dictionary attacks)

**WiFi 7 (802.11be) — Future-Ready:**
- **MLO (Multi-Link Operation):** Bond 2.4 GHz + 5 GHz + 6 GHz simultaneously for massive throughput and redundancy
- **320 MHz channels** on 6 GHz band
- **4096-QAM** for higher data rates
- **Reduced latency** via deterministic scheduling

**Range Analysis by Property Size:**

| Property Size | Infrastructure Needed | Expected Coverage |
|---|---|---|
| ½ acre (~2,000 m²) | 1 WiFi 6 AP (outdoor-rated) | Full coverage at 100-150m radius |
| 1-2 acres | 1-2 APs with directional antennas | Mesh backhaul recommended |
| 5 acres | 3-4 APs in mesh configuration | 802.11s mesh or proprietary mesh |
| 10+ acres | 5-8 APs, dedicated backhaul | Enterprise mesh (OpenWrt + batman-adv) |

**Outdoor Range (realistic, with obstacles):**
- 2.4 GHz: 100-200m (through moderate vegetation)
- 5 GHz: 50-120m (higher throughput, shorter range)
- 6 GHz (WiFi 6E/7): 30-80m (highest throughput, shortest range)

**Mesh Networking Options:**

| Protocol | Type | Notes |
|---|---|---|
| **802.11s** | Standard WiFi mesh | Built into Linux kernel, supported by OpenWrt |
| **batman-adv** | Layer 2 mesh | Open source, excellent for mobile nodes, used in Freifunk |
| **OLSR/OLSRd2** | Layer 3 mesh | Optimized Link State Routing, good for multi-hop |
| **Babel** | Layer 3 mesh | Distance-vector, handles mobile nodes well |
| **WDS (Wireless Distribution System)** | Bridge mode | Simpler but less flexible than mesh |

**Recommended Mesh Stack:**
- **batman-adv** on OpenWrt-based APs for the infrastructure mesh
- Each robot acts as a mesh node, maintaining connectivity as it patrols
- Self-healing: if one AP goes down, traffic reroutes automatically

**Hardware Recommendations:**
- **APs:** GL.iNet GL-MT6000 (WiFi 6, OpenWrt, 2x 2.5G Ethernet) or Ubiquiti UniFi 6 Long-Range
- **Robot WiFi:** Android phone's built-in WiFi 6 radio (for OpenBot), or external USB WiFi adapter with ath11k chipset
- **Drone WiFi:** ESP32-S3 or dedicated WiFi module connected to ArduPilot companion computer

**Bandwidth Budget:**
- H.264 video stream: 2-5 Mbps per camera
- Telemetry (IMU, GPS, battery, etc.): ~50 kbps
- Command/control: ~10 kbps
- AI model updates: Burst, 10-50 Mbps when available
- **Per robot total:** ~5-10 Mbps sustained, 50 Mbps burst

---

### 2.2 Bluetooth/BLE Mesh

#### Technology: Bluetooth 5.x / BLE Mesh (ESP32-S3/C6)

BLE Mesh provides **robot-to-robot communication** when WiFi infrastructure is down. It's the swarm coordination layer.

**BLE Mesh Overview:**
- Based on Bluetooth SIG Mesh Profile specification
- **Managed flooding** architecture — messages are relayed by all nodes in range
- No central coordinator required — fully decentralized
- Each robot is both a mesh node and a relay

**Specifications:**

| Parameter | Value |
|---|---|
| Range (per hop) | 30-100m outdoor (BLE 5.0 Long Range: up to 400m with coded PHY) |
| Multi-hop range | Theoretically unlimited (practical: 3-5 hops = 150-500m) |
| Throughput | ~125 kbps (BLE 5.0), effective mesh throughput: 10-50 kbps |
| Latency | 50-200ms per hop |
| Power consumption | Very low (10-50 mW active) |
| Max nodes | 32,767 per network (Bluetooth Mesh spec) |
| Encryption | AES-128-CCM (built into BLE Mesh spec) |
| Authentication | Provisioning with OOB (Out-of-Band) data |

**Use Cases in Robot Fleet:**
1. **Swarm heartbeat:** Robots broadcast their position and status to nearby robots via BLE mesh
2. **WiFi-down coordination:** If WiFi is jammed, robots can still coordinate patrols via BLE mesh
3. **Relay to hub:** A robot near the hub can relay BLE mesh messages from distant robots back to the hub
4. **Mutual health check:** Robots detect if a neighbor goes offline (potential tampering)

**ESP32 BLE Mesh Implementation:**
- ESP-IDF provides full BLE Mesh stack (Provisioner + Node roles)
- ESP32-S3: Supports BLE 5.0 with Long Range (Coded PHY, 125kbps/500kbps)
- ESP32-C6: Supports BLE 5.3 + Thread/802.15.4 — dual-radio capability
- Hardware AES acceleration handles mesh encryption without CPU overhead

**Limitations:**
- Not suitable for video — bandwidth too low
- Higher latency than WiFi — not for real-time control
- Managed flooding can cause congestion with many nodes in dense deployment
- Range drops significantly with obstacles/vegetation

**Mitigation:**
- Use BLE mesh only for telemetry and command relay, not video
- Implement message priority and TTL (time-to-live) to prevent flooding storms
- Use BLE 5.0 Long Range (Coded PHY S=8) for maximum outdoor range

---

### 2.3 LoRa (Long Range Radio)

#### Technology: Semtech SX1262 / SX1276 Sub-GHz LoRa

LoRa is the **emergency communication backbone**. When WiFi is jammed, cellular towers are down, and BLE mesh can't reach the hub — LoRa gets through.

**SX1262 Key Specifications (from Semtech datasheet):**
- Frequency range: 150 MHz to 960 MHz (continuous coverage)
- Maximum link budget: **170 dB**
- Sensitivity: down to **-148 dBm**
- TX power: up to **+22 dBm**
- RX current: **4.6 mA** (extremely low power)
- Modulations: LoRa (CSS), FSK, GFSK, MSK, GMSK, Long Range FHSS
- Data rate: Up to 62.5 kbps (LoRa), 300 kbps (FSK)
- **Built-in AES-128 hardware encryption**
- Channel Activity Detection (CAD) for listen-before-talk
- Blocking immunity: 88 dB at 1 MHz offset

**Range Analysis:**

| Environment | SX1262 Range (SF12, 125kHz BW) | SX1276 Range |
|---|---|---|
| Line of sight (rural) | 10-15 km | 8-12 km |
| Suburban (moderate obstacles) | 3-8 km | 2-5 km |
| Urban (dense buildings) | 1-3 km | 0.5-2 km |
| Dense vegetation/forest | 1-5 km | 0.5-3 km |
| ½ acre property | Full coverage (overkill) | Full coverage |
| 10+ acre property | Full coverage, multiple km margin | Full coverage |

**For our use case, LoRa provides absurd range margin** — even a 100-acre ranch is covered by a single LoRa gateway.

**LoRa Protocol Design for Robot Fleet:**

```
┌─────────────────────────────────────────────────┐
│  Custom LoRa Protocol (NOT LoRaWAN)             │
│                                                  │
│  • Point-to-multipoint (star topology)           │
│  • Hub has LoRa gateway, each robot has module   │
│  • Proprietary packet format (see Section 5)     │
│  • AES-128 + rolling nonce at hardware level     │
│  • Application-layer encryption on top           │
│  • FHSS (Frequency Hopping) for jam resistance   │
│  • Time-slotted for collision avoidance           │
└─────────────────────────────────────────────────┘
```

**Why NOT LoRaWAN:**
- LoRaWAN is designed for IoT sensors talking to cloud — unnecessary complexity
- We need point-to-point or point-to-multipoint with low latency
- LoRaWAN adds gateway→network server→application server hop — too slow for commands
- Custom protocol gives us full control over security and timing

**LoRa Message Types:**

| Message | Direction | Size | Frequency |
|---|---|---|---|
| Robot heartbeat (GPS, battery, status) | Robot → Hub | 32 bytes | Every 10s |
| Patrol command | Hub → Robot | 16 bytes | On demand |
| Alert (intrusion detected) | Robot → Hub | 48 bytes | Immediate |
| Emergency recall | Hub → All Robots | 8 bytes | Broadcast |
| Acknowledgment | Both directions | 4 bytes | Per command |

**Frequency Bands (US):**
- **915 MHz ISM band** (902-928 MHz): Primary
- FCC Part 15 compliant
- Up to 1 Watt (30 dBm) with frequency hopping
- Up to 36 dBm with directional antenna + FHSS

**Hardware Modules:**
- **EBYTE E22-900T30D:** SX1262, 30dBm (1W), UART interface, ~$15
- **Heltec LoRa 32 V3:** ESP32-S3 + SX1262 integrated, WiFi+BLE+LoRa, ~$18
- **RAK4631:** nRF52840 + SX1262, low power, Arduino-compatible, ~$20
- **Adafruit RFM95W:** SX1276, well-documented, Arduino library support, ~$20

**Recommended:** Heltec LoRa 32 V3 — gives us ESP32-S3 (WiFi + BLE + crypto) AND SX1262 LoRa on a single board.

---

### 2.4 Cellular (4G/LTE/5G)

#### Technology: LTE Cat-1/Cat-M1, 4G LTE, 5G NR

Cellular provides **cloud connectivity and off-property communication** — backup when local WiFi is down, and primary for remote deployments.

**Use Cases:**
1. **Remote monitoring:** Owner views live feeds from anywhere
2. **Cloud alerts:** Push notifications for intrusion detection
3. **WiFi backup:** If local WiFi mesh fails, cellular takes over for command/control
4. **Remote deployments:** Properties without WiFi infrastructure
5. **OTA updates:** Download firmware/AI model updates

**Cellular Module Options:**

| Module | Technology | Data Rate | Power | Cost | Notes |
|---|---|---|---|---|---|
| SIMCom SIM7600G | 4G LTE Cat-4 | 150 Mbps DL | ~2W active | ~$25 | Global bands, USB/UART |
| Quectel EC25 | 4G LTE Cat-4 | 150 Mbps DL | ~1.5W active | ~$20 | Mini PCIe, well-supported |
| Quectel BG96 | LTE Cat-M1/NB-IoT | 375 kbps | ~0.5W active | ~$15 | Ultra-low power, IoT optimized |
| SIMCom SIM8262E | 5G NR Sub-6 | 2.4 Gbps DL | ~3W active | ~$80 | Future-ready, M.2 form factor |

**SIM/Data Options:**

| Provider | Type | Data | Monthly Cost | Notes |
|---|---|---|---|---|
| Hologram | IoT SIM, global | Pay-per-use | $0.60/MB (no monthly) | Best for backup/low usage |
| Twilio Super SIM | IoT SIM, multi-carrier | Pay-per-use | $2/mo + $0.10/MB | Multi-carrier failover |
| Google Fi data SIM | Consumer, T-Mobile/US Cellular | 15 GB+ | $20-65/mo | Easy activation |
| T-Mobile IoT | IoT plans | 500 MB-5 GB | $5-15/mo | Good coverage in US |
| Starlink IoT (future) | Satellite + cellular | TBD | TBD | Direct-to-cell capability |

**Recommended for Patrol Robots:**
- **Hub:** Quectel EC25 on LTE Cat-4 with T-Mobile IoT SIM (~$10/mo for 2GB)
- **Robots:** No individual cellular (expensive, power hungry) — relay through hub's cellular
- **Remote deployments:** Each robot gets Quectel BG96 (Cat-M1) with Hologram SIM

**Security Considerations:**
- Cellular networks provide their own encryption (128-bit AES for LTE)
- But carrier can theoretically intercept — always use VPN/TLS on top
- IMSI catchers (Stingray) can intercept — WireGuard VPN tunnel mitigates this
- SIM cloning risk — use eSIM where possible, or SIM PIN lock

---

### 2.5 900 MHz / 2.4 GHz ISM Band Radio (RC Fallback)

#### Technology: ExpressLRS (ELRS), SiK Radio

Direct radio control as **absolute last resort** for manual override of drones.

**ExpressLRS (ELRS) for ArduPilot Drones:**
- Open source RC link protocol
- **900 MHz band:** Up to 100 km range (with appropriate antennas), excellent penetration
- **2.4 GHz band:** Up to 40 km range, higher update rates
- Packet rates: 25 Hz to 1000 Hz (configurable tradeoff of range vs. update rate)
- **Encryption:** AES-128 binding phrase (shared secret) — prevents unauthorized control
- Very low latency: as low as 2ms at 500 Hz
- ArduPilot integration via CRSF protocol on UART

**ELRS Configuration for Security Patrol:**

| Setting | Value | Rationale |
|---|---|---|
| Band | 900 MHz | Maximum range and penetration |
| Packet rate | 50 Hz | Sufficient for patrol (not racing), maximizes range |
| TX power | 1W (30 dBm) | Maximum legal power on 900 MHz ISM |
| Binding phrase | Unique per fleet | Prevents unauthorized binding |
| Telemetry ratio | 1:8 | Receive battery/GPS from drone |

**SiK Radio (MAVLink Telemetry):**
- Traditional 915 MHz half-duplex radio for MAVLink telemetry
- Range: 1-5 km with stock antennas, 10+ km with directional
- 100 mW typical, up to 1W with amplifier
- **Not encrypted by default** — requires MAVLink2 signing
- Being replaced by ELRS in modern setups but still useful as secondary telemetry path

**Use in Architecture:**
- ELRS provides **manual override** capability — if all autonomous comms fail, operator can take manual control of drone
- SiK radio provides **backup MAVLink telemetry** path separate from WiFi
- Both are separate RF paths from WiFi, making simultaneous jamming harder

---

### 2.6 Mesh Networking Protocols (Sensor Integration)

#### Thread, Zigbee, Z-Wave

These protocols are for **auxiliary sensor integration** — perimeter sensors, door/window sensors, motion detectors, camera triggers.

**Thread (802.15.4 + IPv6):**
- IPv6-native mesh networking
- Self-healing, self-forming mesh
- AES-128-CCM encryption
- Range: 30-100m per hop, up to 250m with amplification
- **ESP32-C6 has native Thread/802.15.4 radio** — dual-use with WiFi/BLE
- Google/Apple/Amazon backing (Matter/Thread ecosystem)
- **Recommended for new sensor deployments**

**Zigbee (802.15.4):**
- Mature ecosystem, thousands of devices available
- 250 kbps, AES-128 encryption
- Range: 10-75m indoor, 100-300m outdoor
- Zigbee2MQTT integration with hub's MQTT broker
- Good for integrating existing home security sensors

**Z-Wave (Sub-GHz, 908.42 MHz US):**
- Sub-GHz for better penetration through walls
- Mandatory AES-128 encryption (Z-Wave S2)
- Range: 30-100m
- Limited to 232 nodes per network
- Less relevant for outdoor patrol but useful for building access sensors

**Integration with Robot Fleet:**

```
┌──────────────┐     Thread/Zigbee      ┌──────────────┐
│  Perimeter   │ ──────────────────────→ │  Central Hub │
│  Sensors     │                          │  (MQTT)      │
│  (PIR/mmWave)│                          │              │
└──────────────┘                          │  Correlates  │
                                          │  sensor data │
┌──────────────┐     WiFi/LoRa           │  with robot  │
│  Patrol      │ ←──────────────────────→ │  positions   │
│  Robots      │                          │              │
└──────────────┘                          └──────────────┘
```

When a perimeter sensor triggers, the hub dispatches the nearest robot to investigate — multi-protocol fusion.

---

### 2.7 Failover Hierarchy

The system implements automatic failover with the following priority:

```
PRIORITY 1: WiFi 6 Mesh
    │ Monitored: RSSI, packet loss, latency
    │ Failover trigger: >50% packet loss OR RSSI < -80dBm OR no AP response for 5s
    ▼
PRIORITY 2: Cellular (4G/LTE)
    │ Monitored: Registration status, signal quality
    │ Failover trigger: No cellular registration OR >70% packet loss for 10s
    ▼
PRIORITY 3: LoRa (Sub-GHz)
    │ Monitored: ACK success rate
    │ Failover trigger: No ACK for 3 consecutive messages (30s)
    ▼
PRIORITY 4: BLE Mesh (Robot-to-Robot relay)
    │ Monitored: Mesh peer count, message delivery
    │ Failover trigger: No mesh peers reachable for 60s
    ▼
PRIORITY 5: Autonomous Fallback Mode
    │ ALL COMMS LOST
    │ Robot behavior:
    │   • Continue last patrol route for 5 minutes
    │   • Enable all sensors (camera, PIR, microphone)
    │   • Record locally to onboard storage
    │   • After 5 min, begin return-to-base
    │   • Sound local siren if intrusion detected
    │   • Flash lights as deterrent
    │   • Upon reaching base, attempt all comms again
    │   • If still no comms after 30 min: safe shutdown + loud alarm
    ▼
DEAD MAN'S SWITCH ACTIVATED
```

**Failover State Machine:**

```
                    ┌─────────────┐
                    │  WIFI_OK    │ ←── Primary operational
                    └──────┬──────┘
                           │ WiFi lost
                    ┌──────▼──────┐
                    │  CELL_TRY   │ ←── Attempting cellular
                    └──────┬──────┘
                           │ Cellular failed
                    ┌──────▼──────┐
                    │  LORA_ONLY  │ ←── LoRa telemetry only
                    └──────┬──────┘
                           │ LoRa failed
                    ┌──────▼──────┐
                    │  BLE_MESH   │ ←── Swarm mode, relay through peers
                    └──────┬──────┘
                           │ All peers lost
                    ┌──────▼──────┐
                    │  AUTONOMOUS │ ←── Dead man's switch countdown
                    └─────────────┘
```

**Key Design Principle:** At each failover level, the robot **tries to recover** the higher-priority channel. If WiFi comes back while on LoRa, it immediately switches back. The failover is not one-way.

**Simultaneous Multi-Channel:**
- WiFi and LoRa can operate simultaneously (different frequency bands)
- BLE and WiFi share 2.4 GHz but ESP32-S3 handles coexistence
- Critical alerts are sent on **ALL available channels** simultaneously for maximum delivery probability

---

### 2.8 Satellite Communication (Extreme Redundancy)

#### Technology: Iridium Short Burst Data / Starlink

For **truly remote deployments** (ranches, remote industrial sites, mining operations) where cellular coverage is nonexistent.

**Iridium Short Burst Data (SBD):**
- Global coverage via LEO satellite constellation
- Message size: up to 340 bytes (mobile-originated), 270 bytes (mobile-terminated)
- Latency: 10-60 seconds
- Data cost: ~$0.05-0.15 per message
- Module: RockBLOCK 9603 (~$250) or Iridium 9602/9603 transceiver
- Power: ~1.5W during transmission
- **Use case:** Emergency alerts only — "Robot X detected intrusion at GPS coordinates, all other comms down"

**Starlink (Future Integration):**
- Starlink Mini or business terminal at hub site
- High bandwidth (50-200+ Mbps), low latency (20-40ms)
- Monthly cost: $50-120/month
- Not practical on individual robots (too large, too much power)
- **Use case:** Primary internet uplink for hub in remote locations, replacing cellular

**Starlink Direct-to-Cell (Future):**
- Partnership with T-Mobile for direct satellite-to-phone connectivity
- Would allow Android phones (OpenBot brain) to connect directly to Starlink satellites
- Currently limited to text; data services expected 2025-2026
- **Game changer** for remote deployments if/when available

**Recommended Architecture for Remote Sites:**
```
Hub: Starlink terminal (primary) + Iridium SBD (emergency backup)
Robots: WiFi mesh to hub + LoRa direct to hub
No cellular required.
```

---

## 3. Encryption & Security Architecture

### 3.1 Transport Encryption

**Every communication channel must be encrypted. No exceptions.**

| Channel | Transport Encryption | Protocol | Port |
|---|---|---|---|
| WiFi (MQTT) | TLS 1.3 (MQTTS) | MQTT 5.0 over TLS | 8883 |
| WiFi (Video) | DTLS 1.3 / SRTP | WebRTC or RTSP-over-TLS | Dynamic |
| WiFi (Commands) | TLS 1.3 | gRPC over TLS or MQTTS | 8883 |
| Cellular | TLS 1.3 + WireGuard VPN | All traffic tunneled | 51820 (WG) |
| LoRa | AES-128-CTR (hardware) + AES-256-GCM (software) | Custom protocol | N/A (RF) |
| BLE Mesh | AES-128-CCM (BLE Mesh spec) + app-layer AES-256 | BLE Mesh | N/A (RF) |
| ELRS (Drone RC) | AES-128 (binding phrase derived) | CRSF | N/A (RF) |

**TLS 1.3 Configuration:**
```
Cipher suites (in order of preference):
  TLS_AES_256_GCM_SHA384
  TLS_CHACHA20_POLY1305_SHA256
  TLS_AES_128_GCM_SHA256

Key exchange: X25519 (Curve25519 ECDHE)
Signature: Ed25519 or ECDSA P-256
Certificate: X.509v3, ECDSA P-256 keys
Min version: TLS 1.3 ONLY (TLS 1.2 and below disabled)
Session tickets: Disabled (prevent tracking)
0-RTT: Disabled (prevent replay)
```

**MQTT Security (Primary Command Channel):**
```
Broker: Mosquitto 2.x with TLS 1.3
Port: 8883 (MQTTS only, port 1883 DISABLED)
Authentication: Client certificate (mTLS) — NO username/password
Authorization: Per-topic ACLs
  - robots/ROBOT_ID/telemetry  → Robot can PUBLISH only
  - robots/ROBOT_ID/commands   → Robot can SUBSCRIBE only
  - robots/ROBOT_ID/video      → Robot can PUBLISH only
  - hub/alerts                  → Hub can PUBLISH only
  - robots/+/status            → Hub can SUBSCRIBE only
QoS: Level 1 (at least once) for commands, Level 0 for telemetry
Retained messages: Disabled (prevents stale command execution)
Keep-alive: 30 seconds
Message expiry: 60 seconds (stale commands auto-expire)
```

---

### 3.2 End-to-End Encryption

Transport encryption (TLS) protects data in transit, but if the MQTT broker is compromised, an attacker can read all messages. **End-to-end encryption** ensures only the intended robot/hub can decrypt payloads.

**Architecture:**

```
┌────────┐     TLS 1.3 Tunnel      ┌──────────┐     TLS 1.3 Tunnel      ┌────────┐
│  Hub   │ ←─────────────────────→  │  MQTT    │ ←─────────────────────→  │ Robot  │
│        │   E2E encrypted payload  │  Broker  │   E2E encrypted payload  │        │
│  Has   │                          │          │                          │  Has   │
│ Robot's│   Broker sees:           │ Can NOT  │   Broker sees:           │ Hub's  │
│ pub key│   encrypted blob only    │ decrypt  │   encrypted blob only    │ pub key│
└────────┘                          └──────────┘                          └────────┘
```

**E2E Encryption Protocol (NaCl/libsodium):**
```
Library: libsodium (NaCl compatible)
Key exchange: X25519 (Curve25519)
Encryption: XChaCha20-Poly1305 (AEAD)
  - 256-bit key
  - 192-bit nonce (extended nonce, no nonce reuse risk)
  - Poly1305 MAC for authentication

Message format:
┌──────────┬──────────┬───────────────┬──────────────┐
│ Nonce    │ Counter  │ Encrypted     │ Poly1305     │
│ (24 B)   │ (8 B)    │ Payload       │ MAC (16 B)   │
└──────────┴──────────┴───────────────┴──────────────┘

Key derivation:
  shared_secret = X25519(robot_private_key, hub_public_key)
  session_key = HKDF-SHA256(shared_secret, "patrol-e2e-v1", robot_id || session_id)
```

**Why XChaCha20-Poly1305 over AES-GCM:**
- No timing side-channel attacks (constant-time by design)
- 24-byte nonce eliminates nonce-reuse concerns (critical for embedded devices with weak RNG)
- Faster on ARM without AES-NI (relevant for ESP32, Android ARM processors)
- Same security level as AES-256-GCM

---

### 3.3 Authentication: Mutual TLS (mTLS)

**Every robot has its own identity.** No shared credentials, no passwords.

**Certificate Hierarchy:**
```
┌─────────────────────────────────────┐
│  Fleet Root CA                       │  Offline, air-gapped, stored in safe
│  (Self-signed, ECDSA P-384)          │  Validity: 20 years
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  Hub Intermediate CA                 │  Online, on hub device
│  (Signed by Root CA, ECDSA P-256)    │  Validity: 5 years
│  Issues robot and hub certificates   │  Managed by step-ca
└──────────────┬──────────────────────┘
               │
    ┌──────────┼──────────┐
    ▼          ▼          ▼
┌────────┐ ┌────────┐ ┌────────┐
│ Hub    │ │ Robot  │ │ Robot  │
│ Cert   │ │ Cert 1 │ │ Cert 2 │   ... Robot Cert N
│ (P-256)│ │ (P-256)│ │ (P-256)│
│ 1 year │ │ 30 days│ │ 30 days│
└────────┘ └────────┘ └────────┘
```

**mTLS Flow:**
1. Robot connects to MQTT broker
2. Broker presents its certificate (signed by Hub Intermediate CA)
3. Robot verifies broker cert chain up to pinned Root CA
4. Broker requests client certificate
5. Robot presents its certificate (signed by Hub Intermediate CA)
6. Broker verifies robot cert chain up to Root CA
7. **Both sides authenticated** — encrypted channel established
8. Broker checks robot's Common Name against ACL for topic authorization

**Certificate Fields:**
```
Subject: CN=robot-001.fleet.local, O=PatrolFleet, OU=GroundRobot
SAN: DNS:robot-001.fleet.local, URI:urn:patrol:robot:001
Key Usage: Digital Signature, Key Encipherment
Extended Key Usage: TLS Client Authentication
Validity: 30 days (auto-renewed via step-ca ACME)
```

**Revocation:**
- Short certificate lifetimes (30 days) provide **passive revocation** — compromised robot's cert expires quickly
- For immediate revocation: CRL (Certificate Revocation List) distributed to all robots via LoRa broadcast
- OCSP stapling on the MQTT broker for real-time revocation checking

---

### 3.4 Key Management

**The hardest problem in security.** How do you get keys onto robots, keep them safe, and rotate them?

**Initial Provisioning (Factory/Setup):**
1. Robot is connected to hub via USB or local WiFi during setup
2. Hub's step-ca generates a private key **on the robot's secure element** (ATECC608A)
   - Private key NEVER leaves the secure element
   - Key generation uses hardware TRNG (True Random Number Generator)
3. Robot generates CSR (Certificate Signing Request) using secure element
4. Hub CA signs the CSR, returns certificate to robot
5. Root CA certificate is pinned in robot's firmware (burned into flash, protected by secure boot)

**Key Rotation:**
- Robot certificates auto-renew every 25 days (5-day overlap window)
- Renewal uses ACME protocol (step-ca) over MQTTS
- If a robot misses renewal (offline), it has 5-day grace period
- After expiry, robot must re-provision via physical USB connection (security feature — prevents remote re-enrollment of stolen robots)

**E2E Key Rotation:**
- Session keys derived per-connection using ephemeral X25519 key exchange
- Long-term identity keys stored in ATECC608A secure element
- Even if a session key is compromised, past sessions are safe (Perfect Forward Secrecy)

**Emergency Key Revocation:**
- Hub broadcasts "revoke robot-003" message on ALL channels (WiFi, LoRa, BLE mesh)
- All robots cache the revocation, reject messages from robot-003
- Hub blacklists robot-003's certificate serial number
- Physical recovery required to re-commission

---

### 3.5 Encrypted Firmware Updates (Secure OTA)

**The most dangerous attack vector.** If an attacker can inject malicious firmware, they own the robot.

**OTA Security Chain:**

```
┌─────────────────────────────────────────────────┐
│  1. Developer signs firmware with signing key     │
│     (Ed25519, offline on air-gapped machine)      │
│                                                   │
│  2. Signature embedded in firmware image header   │
│                                                   │
│  3. Firmware encrypted with AES-256-GCM           │
│     (per-fleet encryption key)                    │
│                                                   │
│  4. Encrypted+signed firmware uploaded to hub     │
│                                                   │
│  5. Hub distributes to robots over MQTTS          │
│                                                   │
│  6. Robot receives firmware:                      │
│     a. Verify Ed25519 signature (public key in    │
│        secure boot flash)                         │
│     b. Decrypt with fleet key (in ATECC608A)      │
│     c. Verify SHA-256 hash matches header         │
│     d. Write to inactive partition (A/B scheme)   │
│     e. Set boot flag to new partition             │
│     f. Reboot                                     │
│                                                   │
│  7. New firmware boots:                           │
│     a. Hardware secure boot verifies signature    │
│     b. If verification fails → roll back to       │
│        previous partition                         │
│     c. If boots successfully → mark as valid      │
│                                                   │
│  8. Rollback protection:                          │
│     Anti-rollback counter in eFuse prevents       │
│     downgrade to older (vulnerable) firmware      │
└─────────────────────────────────────────────────┘
```

**ESP32-S3 Secure Boot v2:**
- RSA-3072 or ECDSA signature verification in ROM
- Public key hash burned into eFuse (one-time programmable)
- Cannot be bypassed even with physical access to flash
- Bootloader verifies app, app verifies subsequent loads
- Flash encryption with per-device key (AES-256-XTS)

**Android Phone (OpenBot Brain):**
- Android Verified Boot (AVB) for system partition
- APK signing for app updates
- Play Protect or custom certificate pinning for sideloaded APKs
- OTA via hub's update server (not Google Play — air-gapped option)

---

### 3.6 Video Stream Encryption

**Video is the highest-value target for an attacker** — if they can see what robots see, they know patrol patterns and blind spots.

**WebRTC Stack (Recommended):**
```
Signaling: MQTTS (already encrypted and authenticated)
STUN/TURN: Self-hosted on hub (coturn)
Media: SRTP (AES-128-CM or AES-256-CM)
Key exchange: DTLS-SRTP
  - DTLS 1.3 handshake establishes SRTP keys
  - Certificate fingerprint verified via signaling channel
  - No ICE/STUN to external servers (all local)
  
Codec: H.264/H.265 (hardware encoder on Android phone)
Resolution: 720p @ 15fps (patrol), 1080p @ 30fps (alert)
Bitrate: 2-5 Mbps (adaptive based on WiFi quality)
```

**Alternative: RTSP over TLS (RTSPS):**
```
For simpler implementation:
- RTSP over TLS on port 322
- SRTP for media transport
- Less setup complexity than WebRTC
- No NAT traversal needed (all local network)
```

**Video Security Policies:**
- Video streams are **never** sent over cellular without explicit user authorization (bandwidth + privacy)
- On LoRa/BLE: Only alert snapshots (JPEG, heavily compressed) — no video
- Local recording encrypted with per-robot key on microSD (AES-256-XTS)
- Hub stores video in encrypted volume (LUKS)
- Automatic deletion after 30 days (configurable)

---

### 3.7 Zero-Trust Architecture

**Principle: "Never trust, always verify."** Even internal communications are treated as potentially hostile.

**Zero-Trust Policies:**

1. **Identity verification on every request:**
   - Every MQTT message includes robot ID in the client certificate CN
   - Every command includes a cryptographic signature from the hub
   - Robots verify the hub's signature before executing ANY command

2. **Least privilege:**
   - Robot-001 can only publish to `robots/robot-001/telemetry`, not `robots/robot-002/telemetry`
   - Hub can only send commands to robots it has provisioned
   - No robot can send commands to another robot directly (must go through hub)

3. **Command authorization levels:**
   ```
   Level 0 (Auto): Patrol route adjustments, speed changes
     → Hub signature required
   
   Level 1 (Confirmed): Return to base, investigate alert
     → Hub signature + sequence number + timestamp validation
   
   Level 2 (Critical): Firmware update, decommission, change geofence
     → Hub signature + human confirmation (2FA via owner's phone)
   
   Level 3 (Emergency): Kill switch, all-stop
     → Hub signature OR physical button on robot
   ```

4. **Micro-segmentation:**
   - Each robot is in its own network segment (VLAN or WireGuard peer)
   - Compromised robot cannot sniff traffic from other robots
   - Hub acts as the sole gateway between robot segments

5. **Continuous verification:**
   - TLS sessions re-authenticated every 60 minutes
   - Robot behavioral profile continuously checked (see Section 5.7)
   - Anomalous behavior triggers quarantine (robot removed from active duty)

---

## 4. Anti-Hacking / Attack Resistance

### 4.1 RF Jamming Detection and Response

**Threat:** Attacker uses a broadband jammer to blind the robots before break-in.

**Detection Mechanisms:**

| Method | Implementation | Detection Threshold |
|---|---|---|
| RSSI monitoring | Continuous WiFi/BLE/LoRa signal strength monitoring | Sudden drop >20 dB in <1 second |
| Noise floor analysis | LoRa CAD (Channel Activity Detection) | Noise floor rises >10 dB above baseline |
| Packet loss rate | Track ACK rate on all channels | >80% loss on any single channel |
| Cross-channel correlation | If WiFi AND cellular drop simultaneously | Both channels failing = likely jamming |
| Spectrum analysis | ESP32 WiFi promiscuous mode + LoRa RSSI scan | Broadband energy without valid packets |

**Response Protocol:**

```
JAMMING DETECTED on Channel X
    │
    ├─→ ALERT: Send jam notification on ALL OTHER channels
    │
    ├─→ FAILOVER: Switch to next priority channel
    │
    ├─→ RECORD: Log jamming event with timestamp, location, signal data
    │
    ├─→ FORENSIC: Record RF spectrum snapshot for analysis
    │
    ├─→ ESCALATE: If jamming persists >30s on multiple channels:
    │     • Activate siren/strobe on nearest robot
    │     • Send SMS/push notification to property owner
    │     • Record video at highest quality to local storage
    │     • Switch to autonomous patrol with aggressive detection mode
    │
    └─→ HARDEN: Enable FHSS on LoRa, switch WiFi channels, use BLE mesh
```

**Key Insight:** Jamming itself is a signal. If all comms go dark simultaneously, that's suspicious and should trigger the highest alert level. A "quiet night" where all robots lose signal is MORE alarming than a normal night.

---

### 4.2 GPS Spoofing Protection

**Threat:** Attacker sends fake GPS signals to misdirect robots off the property or into traps.

**Multi-Source Positioning System:**

```
┌─────────────────────────────────────────────────┐
│  Position Fusion Engine                          │
│                                                  │
│  Source 1: GPS/GNSS (L1/L5 dual-band)           │
│    Weight: 0.4 (reduced if anomaly detected)     │
│                                                  │
│  Source 2: WiFi Positioning (RSSI triangulation) │
│    Weight: 0.2 (from known AP locations)         │
│                                                  │
│  Source 3: IMU Dead Reckoning                    │
│    Weight: 0.3 (accelerometer + gyroscope)       │
│    Drift: ~2% of distance traveled               │
│                                                  │
│  Source 4: Visual Odometry (camera-based)        │
│    Weight: 0.1 (Android phone camera)            │
│                                                  │
│  Fusion: Extended Kalman Filter (EKF)            │
│  Output: Verified position + confidence score    │
└─────────────────────────────────────────────────┘
```

**GPS Anomaly Detection:**
- **Sudden position jumps:** >10m jump without corresponding IMU acceleration = spoofing
- **Impossible velocity:** Position implies robot moved faster than its maximum speed = spoofing
- **Altitude anomaly:** GPS altitude changes >5m on flat terrain = spoofing
- **Time anomaly:** GPS time diverges >100ms from NTP time = spoofing
- **Satellite geometry:** HDOP/PDOP sudden changes, or satellite signals all at same strength = spoofing
- **Geofence violation:** GPS says robot is outside property, but IMU says it hasn't moved far = spoofing

**Response to GPS Spoofing:**
1. Reduce GPS weight in EKF, rely more on IMU/WiFi
2. Alert hub with "GPS SPOOF DETECTED" (with spoofed vs. calculated positions)
3. Continue patrolling using dead reckoning + WiFi positioning
4. Log GPS raw data for forensic analysis
5. If position confidence drops below threshold, return to base using IMU

---

### 4.3 Replay Attack Prevention

**Threat:** Attacker captures a valid "return to base" command and replays it later to recall all robots during a break-in.

**Anti-Replay Mechanisms:**

```
Command Packet Format:
┌──────────┬──────────┬──────────┬──────────┬──────────────┬──────────┐
│ Sequence │ Timestamp│ Nonce    │ Robot ID │ Command      │ HMAC-256 │
│ Number   │ (Unix ms)│ (random) │ (target) │ Payload      │ Signature│
│ (4 B)    │ (8 B)    │ (16 B)  │ (4 B)    │ (variable)   │ (32 B)  │
└──────────┴──────────┴──────────┴──────────┴──────────────┴──────────┘
```

**Validation Rules:**
1. **Sequence number:** Must be strictly increasing. Robot tracks last received sequence number per sender. Any sequence number ≤ last received is REJECTED.
2. **Timestamp:** Must be within ±30 seconds of robot's local clock. Stale packets are REJECTED. (Clocks synced via NTP over WiFi, or GPS PPS)
3. **Nonce:** Must be unique. Robot maintains a sliding window of recently seen nonces (last 1000). Duplicate nonce = REJECTED.
4. **HMAC:** Computed over all fields using shared session key. Incorrect HMAC = REJECTED + alert.

**Combined, these three mechanisms make replay attacks mathematically impossible:**
- Replaying old packet: sequence number too low → rejected
- Replaying old packet: timestamp too old → rejected
- Replaying old packet: nonce already seen → rejected
- Modifying any field: HMAC verification fails → rejected + alert

---

### 4.4 Man-in-the-Middle (MITM) Protection

**Threat:** Attacker positions themselves between robot and hub, intercepting and modifying communications.

**Protections:**

| Layer | MITM Protection | Implementation |
|---|---|---|
| WiFi | WPA3-SAE (Dragonfly handshake) | No offline dictionary attacks possible |
| TLS | Mutual TLS with certificate pinning | Robot rejects any cert not signed by fleet CA |
| MQTT | Client certificate authentication | Impersonating hub requires hub's private key |
| LoRa | Pre-shared AES key + rolling nonces | No handshake to intercept |
| BLE Mesh | Provisioning with OOB authentication | Network key distributed via secure channel |
| E2E | X25519 key exchange with pinned identities | Perfect forward secrecy per session |

**Certificate Pinning Implementation:**
```python
# Robot-side TLS verification
PINNED_ROOT_CA_HASH = "sha256:A1B2C3..." # Root CA public key hash

def verify_server_cert(cert_chain):
    # 1. Standard X.509 chain validation
    if not validate_chain(cert_chain):
        return REJECT
    
    # 2. Pin check - root must match our fleet's root CA
    root_hash = sha256(cert_chain[-1].public_key)
    if root_hash != PINNED_ROOT_CA_HASH:
        return REJECT  # Not our fleet's CA!
    
    # 3. Check for revocation
    if cert_chain[0].serial in REVOCATION_LIST:
        return REJECT
    
    return ACCEPT
```

---

### 4.5 Deauthentication Attack Protection

**Threat:** Attacker sends forged WiFi deauthentication frames to disconnect robots from the AP.

**This is one of the most common and easiest WiFi attacks.** A $5 ESP8266 running off-the-shelf software can deauth every device on a WiFi network.

**Protections:**

1. **WPA3 + 802.11w (Management Frame Protection):**
   - 802.11w (Protected Management Frames / PMF) makes deauth frames cryptographically authenticated
   - Forged deauth frames are silently dropped
   - **MANDATORY** — set `ieee80211w=2` (required) on all APs
   - All modern WiFi 6 devices support 802.11w

2. **WPA3-SAE vs WPA2-PSK:**
   - WPA3 mandates 802.11w — no opt-out
   - SAE (Simultaneous Authentication of Equals) resists offline dictionary attacks
   - No PMKID-based attacks possible (unlike WPA2)
   - Transition mode (WPA2/WPA3) is **NOT acceptable** — WPA3 only

3. **AP Configuration (OpenWrt/hostapd):**
   ```
   # /etc/hostapd.conf
   wpa=2
   wpa_key_mgmt=SAE
   ieee80211w=2          # Required PMF
   sae_require_mfp=1     # SAE requires PMF
   rsn_pairwise=CCMP     # AES-CCMP only, no TKIP
   sae_password=<long-random-passphrase>
   # OR better: use WPA3-Enterprise with EAP-TLS (certificate-based)
   ```

4. **Detection of Deauth Attacks:**
   - Robot monitors for high volume of management frames
   - If deauth flood detected: log + alert + immediate failover to cellular/LoRa

---

### 4.6 Physical Tampering Detection

**Threat:** Attacker physically captures a robot to extract keys, modify firmware, or disable it.

**Detection Mechanisms:**

| Sensor | What It Detects | Implementation |
|---|---|---|
| Accelerometer (IMU) | Unexpected lifting/tilting/shaking | Threshold: >2g for >0.5s when stationary |
| Light sensor | Enclosure opened (light enters) | Phototransistor inside sealed enclosure |
| Tamper switch | Physical enclosure lid opened | Microswitch on enclosure |
| GPS + IMU fusion | Carried away while "stationary" | Movement detected without motor commands |
| Heartbeat monitor | Robot stops responding | Hub detects missed heartbeats |
| Voltage monitor | Power cut or battery removed | Supercapacitor provides 30s backup for alert |

**Response to Tamper Detection:**

```
TAMPER DETECTED
    │
    ├─→ IMMEDIATE: Send tamper alert on ALL channels (WiFi, cellular, LoRa, BLE)
    │     Include: Robot ID, GPS position, timestamp, tamper type
    │
    ├─→ RECORD: Start continuous video recording (if possible)
    │
    ├─→ SIREN: Activate loud siren + strobe lights
    │
    ├─→ CRYPTO: Trigger key zeroization countdown (60 seconds)
    │     If not authenticated by hub within 60s:
    │       • Erase all session keys from RAM
    │       • Lock secure element (ATECC608A enters locked state)
    │       • E2E keys are destroyed
    │       • Robot becomes cryptographically inert
    │
    ├─→ EVIDENCE: Attempt to upload all local recordings to hub before key wipe
    │
    └─→ BRICK: After key zeroization, robot cannot rejoin fleet without
          physical re-provisioning at hub (intentional — prevents attacker from
          extracting keys and rejoining with cloned robot)
```

**Hardware Protections:**
- **ESP32-S3 Flash Encryption:** Even with physical access to flash chip, contents are encrypted with device-specific key in eFuse
- **ESP32-S3 Secure Boot:** Modified firmware won't boot — hardware verification in ROM
- **ATECC608A:** Secure element resists decapping, voltage glitching, and side-channel attacks
- **Epoxy potting:** Critical circuit areas potted with epoxy, making physical access destructive

---

### 4.7 Network Isolation

**Threat:** Compromised robot used as pivot to attack home network.

**Network Architecture:**

```
┌─────────────────────────────────────────────────────────────┐
│  PROPERTY NETWORK                                            │
│                                                              │
│  ┌─────────────────┐     ┌─────────────────┐                │
│  │  Home Network   │     │  Robot Network   │                │
│  │  VLAN 10        │     │  VLAN 20         │                │
│  │  192.168.1.0/24 │     │  10.10.20.0/24   │                │
│  │                 │     │                  │                │
│  │  Family devices │     │  Patrol robots   │                │
│  │  Smart home     │     │  Drones          │                │
│  │  Computers      │     │  Hub controller  │                │
│  └────────┬────────┘     └────────┬─────────┘                │
│           │                       │                          │
│  ┌────────▼───────────────────────▼─────────┐                │
│  │           MANAGED SWITCH / ROUTER         │                │
│  │                                           │                │
│  │  Firewall Rules:                          │                │
│  │  • VLAN 20 → VLAN 10: DENY ALL           │                │
│  │  • VLAN 10 → VLAN 20: DENY ALL           │                │
│  │  • VLAN 20 → Internet: Allow MQTTS(8883) │                │
│  │  •                     Allow WG(51820)    │                │
│  │  •                     Allow NTP(123)     │                │
│  │  •                     DENY ALL ELSE      │                │
│  │  • VLAN 20 internal: Allow hub↔robot only │                │
│  │  • Robot↔Robot direct: DENY (must go      │                │
│  │    through hub)                           │                │
│  └──────────────────────────────────────────┘                │
└─────────────────────────────────────────────────────────────┘
```

**Additional Isolation:**
- Each robot has its own WireGuard tunnel to the hub — even on the same VLAN, robots can't see each other's traffic
- Hub runs in a container (Docker/Podman) with minimal capabilities
- Hub has no SSH access from robot VLAN — management only via dedicated management VLAN or physical console
- IoT sensors (Thread/Zigbee) on separate 802.15.4 radio — no IP connectivity to WiFi network

---

## 5. Proprietary/Custom Obfuscation Schemes

### 5.1 Protocol Obfuscation

**Goal:** Even if an attacker captures packets, they shouldn't be able to determine the message format, let alone decode it.

**Custom Binary Protocol (over LoRa and BLE Mesh):**

```
Standard approach (what NOT to do):
  {"type": "patrol", "robot": "001", "lat": 37.7749, "lng": -122.4194}
  ↑ Obvious structure, easy to reverse-engineer

Our approach:
  Raw bytes: 0x8A 0x3F 0x17 0xCC 0x4B 0x91 0xDE 0x00 ...
  ↑ Encrypted, padded, indistinguishable from random noise
```

**Protocol Design:**

```
┌────────────────────────────────────────────────────┐
│  Wire Format (after encryption)                     │
│                                                     │
│  ┌─────────┬──────────────────────┬──────────┐     │
│  │ Header  │ Encrypted Payload    │ Padding  │     │
│  │ (4 B)   │ (variable)           │ (random) │     │
│  └─────────┴──────────────────────┴──────────┘     │
│                                                     │
│  Header is also encrypted — only identifiable by    │
│  the first 4 bytes matching a rolling sync word     │
│  that changes every session.                        │
│                                                     │
│  All messages padded to fixed sizes:                │
│    Small:  32 bytes                                 │
│    Medium: 64 bytes                                 │
│    Large: 128 bytes                                 │
│    XL:    256 bytes                                 │
│  This prevents traffic analysis (can't tell         │
│  command type by packet size).                      │
│                                                     │
│  No version numbers, magic bytes, or identifiable   │
│  headers in the clear.                              │
└────────────────────────────────────────────────────┘
```

**Traffic Analysis Resistance:**
- Fixed-size packets prevent identifying message types by size
- Constant-rate dummy traffic fills gaps between real messages
- Message timing jittered (±100ms random delay) to prevent timing analysis
- Decoy packets indistinguishable from real packets without decryption key

---

### 5.2 Frequency Hopping Spread Spectrum (FHSS)

**Goal:** Make LoRa transmissions impossible to jam without a very expensive broadband jammer.

**Implementation on SX1262:**

The SX1262 natively supports **Long Range FHSS** modulation. Additionally, we implement application-level frequency hopping:

```
Frequency Hopping Configuration:
  Band: 902-928 MHz (US ISM)
  Number of channels: 64 (each 400 kHz wide)
  Hop rate: Every packet (or every 400ms, whichever is shorter)
  Hop sequence: Pseudo-random, derived from shared secret
    hop_sequence = AES-128(shared_key, counter)
    channel = hop_sequence mod 64
  
  Dwell time: <400ms per channel (FCC compliant)
  
  Both hub and robot use same sequence generator:
    Hub and robot share seed key (provisioned at setup)
    Counter synchronized via timestamp
    If counter drifts, use LoRa CAD to scan all channels
```

**Anti-Jamming Effect:**
- Narrowband jammer: Can only block 1-2 of 64 channels — 97-99% of packets get through
- Wideband jammer: Must jam entire 26 MHz band — requires high power (expensive, illegal, detectable)
- Attacker without the key cannot predict next frequency — can't follow the hopping

**Synchronization Recovery:**
- If robot loses sync with hub's hop sequence:
  1. Robot freezes on a "beacon channel" (known to both)
  2. Hub periodically transmits sync beacon on the beacon channel
  3. Robot receives beacon, resynchronizes counter
  4. Resumes hopping

---

### 5.3 Rolling Codes

**Like garage door openers, but cryptographically stronger.**

**Implementation (KeeLoq-inspired but using AES):**

```
Rolling Code Protocol:
  
  Hub maintains per-robot counter: N = 1000 (example)
  Robot maintains its own counter: N = 1000 (synchronized)
  
  Command from hub to robot:
    code = AES-128(robot_key, N || command_data)
    Send: {N, code}
  
  Robot receives:
    Verify: AES-128-decrypt(robot_key, code) → N' || command_data'
    Check: N' must be in range [robot_N, robot_N + 256]
      (256-window allows for some lost packets)
    If valid: Execute command, set robot_N = N' + 1
    If N' < robot_N: REJECT (replay attempt!)
    If N' > robot_N + 256: REJECT (desync, need resync)
  
  Benefits:
    • Each code is used ONCE
    • Replaying any captured code: counter has moved forward → rejected
    • Even if attacker captures 1000 codes, they're all used up
    • Forward secrecy: knowing code N doesn't help predict code N+1
      (without the key)
```

**Resynchronization (if counters drift):**
- Hub sends challenge on authenticated channel (mTLS/MQTTS)
- Robot proves identity by responding with code at current counter
- Hub accepts and updates its counter
- This resync channel is itself protected by mTLS — can't be spoofed

---

### 5.4 Steganographic Channels

**Advanced: Hide command data inside innocuous-looking traffic.**

**Use Case:** If an attacker is monitoring the property's WiFi traffic, normal security camera streams are expected. But robot commands hidden inside the video stream are invisible.

**Techniques:**

| Method | Capacity | Detectability | Complexity |
|---|---|---|---|
| LSB embedding in video frames | ~1 kbps per 720p stream | Low (human), Medium (statistical) | Medium |
| Protocol field manipulation | ~100 bps | Very low | Low |
| Timing-based (inter-packet intervals) | ~50 bps | Low | Medium |
| DNS-over-HTTPS tunneling | ~10 kbps | Very low | Low |

**Practical Implementation — Protocol Field Steganography:**
```
WiFi frame sequence numbers: Normally random-looking
Our implementation: Encode 2 bits of command data in the 
  least significant bits of WiFi sequence numbers.
  
Rate: ~2 bits per frame × 100 frames/sec = 200 bps
Enough for: Emergency commands (return-to-base, stop, alert)
Detection: Nearly impossible without knowing the encoding scheme
```

**Assessment:** Steganography is a "nice to have" for extreme threat models. For most deployments, the other encryption layers are sufficient. Consider for government/military contracts.

---

### 5.5 Custom Challenge-Response

**No command executes without a cryptographic handshake.**

```
Command Execution Flow:

Hub                                     Robot
  │                                       │
  │  1. CHALLENGE_REQUEST(command_hash)    │
  │ ─────────────────────────────────────→ │
  │                                       │
  │  Robot generates random challenge:    │
  │  challenge = random(32 bytes)          │
  │                                       │
  │  2. CHALLENGE(challenge, robot_nonce)  │
  │ ←───────────────────────────────────── │
  │                                       │
  │  Hub computes response:               │
  │  response = HMAC-SHA256(              │
  │    shared_key,                         │
  │    challenge || command || timestamp   │
  │  )                                     │
  │                                       │
  │  3. RESPONSE(response, command, ts)    │
  │ ─────────────────────────────────────→ │
  │                                       │
  │  Robot verifies:                       │
  │  • HMAC matches                        │
  │  • Timestamp is fresh                  │
  │  • Command hash matches step 1         │
  │  • Sequence number is valid            │
  │                                       │
  │  4. EXECUTE + ACK                      │
  │ ←───────────────────────────────────── │
  │                                       │

Latency cost: ~2 round trips
WiFi: ~10-20ms overhead (acceptable)
LoRa: ~1-2 second overhead (acceptable for non-time-critical commands)
```

**For time-critical commands (emergency stop):**
- Pre-computed challenge-response tokens
- Hub pre-computes next 10 challenge-response pairs during idle time
- Emergency commands use pre-computed tokens for zero-latency execution
- Each token is single-use and expires after 60 seconds

---

### 5.6 Honeypot Commands

**Detect hacking attempts by setting traps.**

**Implementation:**

```
Honeypot Architecture:

1. FAKE MQTT TOPICS:
   robots/debug/commands        ← Looks like a debug backdoor
   robots/admin/override        ← Looks like an admin channel  
   robots/test/firmware_update  ← Looks like a test channel
   
   ANY subscription or publish to these topics:
   → ALERT: "Unauthorized access attempt detected"
   → Log: Source IP, client certificate (if any), payload
   → Block: Immediately revoke connecting client's certificate
   → Notify: Property owner gets alert with details

2. FAKE COMMAND PORT:
   Hub listens on port 8080 (looks like a web admin interface)
   Any connection attempt → honeypot
   Serves a fake login page that logs all credentials entered
   
3. FAKE ROBOTS:
   Hub simulates 2-3 "ghost robots" on the network
   These robots appear in network scans but don't physically exist
   Any attempt to send commands to ghost robots → attacker detected

4. CANARY VALUES:
   MQTT retained messages with fake "credentials" that are unique per deployment
   If these credentials appear on the dark web or in breach databases → leak detected
```

---

### 5.7 Behavioral Anomaly Detection

**If a robot starts doing things it shouldn't, something is wrong.**

**Behavioral Profile per Robot:**

```
Normal behavior parameters (learned over first 72 hours):
  
  Movement:
    • Max speed: 1.5 m/s (ground robot), 10 m/s (drone)
    • Patrol route variance: ±5m from programmed path
    • Patrol duration: 20-45 minutes per cycle
    • Charging time: 1-3 hours
  
  Communication:
    • Telemetry rate: 1 message/second ± 10%
    • Command acknowledgment: <2 seconds
    • Video stream: constant bitrate ± 20%
    • LoRa beacon: every 10s ± 1s
  
  Sensor:
    • Camera active during patrol
    • IMU readings consistent with movement
    • Battery discharge rate: ~5% per hour of patrol
  
  Location:
    • Always within property geofence
    • Returns to charging station within expected timeframe
    • Doesn't visit same spot repeatedly (unless commanded)
```

**Anomaly Detection Rules:**

| Anomaly | Possible Cause | Response |
|---|---|---|
| Robot exceeds max speed | Hacked motor control or GPS spoof | Alert + restrict speed in firmware |
| Robot deviates >20m from route | Hacked navigation or GPS spoof | Alert + halt + request human confirmation |
| Telemetry rate doubles | Possible data exfiltration | Alert + throttle connection |
| Telemetry stops completely | Jamming or robot captured | Activate dead man's switch |
| Robot ignores commands | Firmware compromised | Quarantine + cut network access |
| Robot sends commands to other robots | Lateral movement attempt | Immediate quarantine + revoke certs |
| Battery drain >2x normal | Crypto mining or excessive computation | Alert + investigate |
| Camera stream to unknown IP | Data exfiltration | Kill connection + quarantine |

---

### 5.8 Dead Man's Switch

**If ALL communication is lost, the robot assumes the worst.**

```
Dead Man's Switch State Machine:

COMMS_OK (Normal operation)
    │
    │ All channels lost
    ▼
COMMS_WARNING (t = 0)
    │ Continue patrol
    │ Try all channels every 10s
    │ Enable all sensors on high
    │ Begin local recording
    │
    │ 5 minutes elapsed, still no comms
    ▼
RETURN_TO_BASE (t = 5 min)
    │ Navigate to charging station/base using dead reckoning
    │ Continue trying all channels
    │ Record everything locally
    │ Strobe lights ON (visible deterrent)
    │
    │ Reached base, still no comms for 10 more minutes
    ▼
LOCKDOWN (t = 15 min)
    │ SIREN ON (loud alarm)
    │ All lights ON
    │ Video recording continues
    │ Attempt emergency satellite uplink (if equipped)
    │ Send pre-programmed SMS via cellular (if available)
    │
    │ 30 minutes total, still no comms
    ▼
SAFE_SHUTDOWN (t = 30 min)
    │ Upload any recordings to local NAS (if reachable)
    │ Zero all session keys
    │ Enter low-power mode
    │ Maintain siren on battery
    │ Wait for physical recovery

Drone-specific behavior:
    COMMS_WARNING → Immediately RTL (Return to Launch)
    RETURN_TO_BASE → Land at home point
    (Drones should NOT loiter without comms — battery is critical)
```

---

### 5.9 Geofence Enforcement in Firmware

**Even if completely hacked, the robot physically cannot leave the property.**

**Implementation Layers:**

```
Layer 1: Software Geofence (ArduPilot / OpenBot app)
  • GPS-based polygon geofence
  • Configurable via hub
  • Can be overridden if software is compromised
  
Layer 2: Firmware Geofence (ESP32 coprocessor)
  • Runs on separate microcontroller from main brain
  • Checks GPS position against hardcoded polygon
  • Controls motor enable relay — physically cuts motor power
  • Firmware signed with secure boot — can't be modified
  
Layer 3: Hardware Geofence (Secure Element)
  • Geofence polygon hash stored in ATECC608A secure element
  • At boot, firmware reads geofence from flash and verifies hash
  • If geofence is modified (hash mismatch), motors are disabled
  • Geofence can ONLY be updated with physical button press on robot
    + hub authorization + human 2FA
  
Layer 4: ArduPilot Fence (Drone-specific)
  • ArduPilot's built-in geofence feature
  • Fence breach → RTL (Return to Launch) mode
  • Configurable fence margin (e.g., 10m inside property line)
  • FENCE_ACTION = RTL or LAND
```

**Physical Motor Cutoff Circuit:**

```
        ┌─────────────┐
GPS ──→ │ ESP32-S3    │     ┌───────────┐
        │ (Coprocessor│     │           │
        │  running    │     │  MOSFET   │
        │  geofence   │────→│  Motor    │────→ Motors
        │  check only)│     │  Driver   │
        │             │     │           │
        └─────────────┘     └───────────┘
                │
                │ If outside geofence:
                │ GPIO LOW → MOSFET OFF → Motors disabled
                │ No software can override this
                │ (Separate MCU from main brain)
```

---

## 6. Specific Hardware for Secure Communications

### 6.1 ESP32-S3 — Primary Communication Coprocessor

**Role:** WiFi + BLE Mesh + Hardware Crypto on each robot

| Feature | ESP32-S3 Specification |
|---|---|
| CPU | Dual-core Xtensa LX7, up to 240 MHz |
| WiFi | 802.11 b/g/n (2.4 GHz), WiFi 4 |
| Bluetooth | BLE 5.0 with Long Range (Coded PHY) |
| RAM | 512 KB SRAM + up to 8 MB PSRAM |
| Flash | Up to 16 MB (with encryption) |
| Crypto Acceleration | AES-128/256, SHA, RSA, ECC, RNG |
| Secure Boot | Secure Boot v2 (RSA-3072 or ECDSA) |
| Flash Encryption | AES-256-XTS with per-device key |
| eFuse | 256 bits for key storage (one-time write) |
| Digital Signature | Hardware RSA signing (private key in eFuse) |
| Secure JTAG | JTAG disabled when security features enabled |
| Power | ~100 mA active WiFi, ~10 µA deep sleep |
| Cost | ~$3-5 per chip |

**Security Features (from Espressif documentation):**
- Secure Boot v2 prevents unsigned firmware from running
- Flash encryption protects code and data at rest
- Digital Signature peripheral allows TLS with hardware-protected private keys
- Memory protection prevents code injection via MPU
- UART download mode lockable via eFuse
- JTAG disableable via eFuse (or soft-disable with HMAC re-enable)

### 6.2 ESP32-C6 — Thread/802.15.4 + WiFi + BLE

**Role:** Multi-protocol gateway on hub, sensor bridge

| Feature | ESP32-C6 Specification |
|---|---|
| CPU | Single-core RISC-V, up to 160 MHz |
| WiFi | 802.11 b/g/n/ax (WiFi 6, 2.4 GHz) |
| Bluetooth | BLE 5.3 |
| 802.15.4 | Thread, Zigbee compatible |
| Crypto | AES-128/256, SHA, RSA, ECC, HMAC |
| Secure Boot | Secure Boot v2 |
| Flash Encryption | AES-128-XTS |
| Cost | ~$2-4 per chip |

**Key Advantage:** Native WiFi 6 + Thread on a single chip. Hub can bridge Thread sensor network to WiFi robot network without additional hardware.

### 6.3 SX1262 LoRa Module

**Role:** Long-range emergency communication

| Feature | Specification |
|---|---|
| Frequency | 150-960 MHz (continuous) |
| TX Power | Up to +22 dBm (158 mW) |
| Sensitivity | -148 dBm (SF12, 125 kHz BW) |
| Link Budget | 170 dB |
| Data Rate | Up to 62.5 kbps (LoRa), 300 kbps (FSK) |
| Current (RX) | 4.6 mA |
| Current (TX, +22dBm) | 118 mA |
| Encryption | **AES-128 hardware** (built-in) |
| Modulation | LoRa CSS, FSK, GFSK, Long Range FHSS |
| Interface | SPI |
| Package | QFN 4×4mm |
| Cost | ~$3-5 per chip, $15-20 per module |

**Recommended Modules:**
- **Heltec LoRa 32 V3:** ESP32-S3 + SX1262 combo board ($18) — best all-in-one
- **EBYTE E22-900T30D:** SX1262, 1W output, UART interface ($15) — if using separate MCU
- **RAK4631:** nRF52840 + SX1262, ultra-low power ($20) — for battery-critical applications

### 6.4 ATECC608A / ATECC608B — Secure Element

**Role:** Hardware key storage and cryptographic operations

| Feature | Specification |
|---|---|
| Key Storage | 16 key slots |
| Key Types | ECC P-256, AES-128, SHA-256, HMAC |
| Operations | ECDH, ECDSA sign/verify, AES encrypt/decrypt |
| Random Number Generator | NIST SP 800-90A/B/C compliant TRNG |
| Tamper Resistance | Active shield, voltage/clock glitch detection |
| Interface | I²C (up to 1 MHz) |
| Operating Temp | -40°C to +85°C (industrial grade) |
| Package | UDFN 3×2mm |
| Cost | ~$0.60-0.80 per chip |
| Certifications | FIPS certified random number generator |

**How It's Used:**
```
┌──────────────────────────────────────────────────┐
│  ATECC608A Key Slot Allocation                    │
│                                                   │
│  Slot 0: Robot identity private key (ECC P-256)  │
│          NEVER leaves secure element              │
│          Used for: mTLS client authentication     │
│                                                   │
│  Slot 1: E2E encryption shared secret            │
│          Used for: Deriving session keys          │
│                                                   │
│  Slot 2: LoRa AES-128 key                        │
│          Used for: LoRa message encryption        │
│                                                   │
│  Slot 3: Rolling code key                        │
│          Used for: Command authentication         │
│                                                   │
│  Slot 4: Firmware decryption key                 │
│          Used for: OTA update decryption          │
│                                                   │
│  Slot 5: Geofence hash                           │
│          Used for: Geofence integrity check       │
│                                                   │
│  Slots 6-15: Reserved for future use             │
│                                                   │
│  All key slots configured as:                     │
│    • No read (keys never exported)                │
│    • Use-only (can sign/encrypt but not extract)  │
│    • Write-once or write-with-auth                │
└──────────────────────────────────────────────────┘
```

### 6.5 TPM 2.0 (For Hub / Companion Computer)

**Role:** Key storage and measured boot on the hub (Raspberry Pi 5 or equivalent)

| Feature | Specification |
|---|---|
| Standard | TCG TPM 2.0 |
| Interface | SPI or I²C |
| Key Storage | RSA 2048+, ECC P-256/P-384, AES-128/256 |
| Operations | Sign, verify, encrypt, decrypt, seal/unseal |
| Platform Integrity | PCR (Platform Configuration Registers) for measured boot |
| Cost | ~$5-15 per module (e.g., LetsTrust TPM, Infineon OPTIGA) |

**Hub uses TPM for:**
- Storing CA private key (never exposed to software)
- Measured boot — detects if hub OS has been tampered with
- Disk encryption key sealed to TPM (encrypted data only accessible on this specific hub)
- WireGuard private key stored in TPM

### 6.6 Hardware Security Bill of Materials (Per Robot)

| Component | Function | Cost |
|---|---|---|
| ESP32-S3 module (e.g., ESP32-S3-WROOM-1) | WiFi + BLE + crypto coprocessor | $4 |
| SX1262 module (e.g., EBYTE E22-900T22D) | LoRa long-range radio | $12 |
| ATECC608B (UDFN package) | Secure element / key storage | $0.70 |
| USB-C cable + Android phone (OpenBot brain) | Main compute, camera, GPS, cellular | (existing) |
| External WiFi antenna (2.4 GHz, 5dBi) | Extended WiFi range | $3 |
| LoRa antenna (915 MHz, 5dBi) | Extended LoRa range | $5 |
| **Total per ground robot (comms security hardware)** | | **~$25** |
| **Total per drone (add ELRS 900 MHz TX/RX)** | | **~$55** |

---

## 7. Open Source Security Tools

### 7.1 WireGuard VPN

**Role:** Encrypted tunnel from each robot to hub, and from hub to cloud.

**Why WireGuard over OpenVPN/IPSec:**
- ~4,000 lines of code (vs. 100,000+ for OpenVPN) — auditable
- Runs in Linux kernel — minimal overhead
- ChaCha20-Poly1305 encryption (fast on ARM without AES-NI)
- Silent to port scans (no response to unauthenticated packets)
- Roaming support — seamless when robot switches WiFi APs
- ~3ms overhead vs ~10-15ms for OpenVPN

**Deployment:**
```bash
# Hub (WireGuard server)
[Interface]
PrivateKey = <hub_private_key>  # Stored in TPM
Address = 10.10.10.1/24
ListenPort = 51820

[Peer]  # Robot 001
PublicKey = <robot_001_public_key>
AllowedIPs = 10.10.10.101/32

[Peer]  # Robot 002
PublicKey = <robot_002_public_key>
AllowedIPs = 10.10.10.102/32

# Robot 001 (WireGuard client)
[Interface]
PrivateKey = <robot_001_private_key>  # Stored in ATECC608A
Address = 10.10.10.101/32

[Peer]  # Hub
PublicKey = <hub_public_key>
Endpoint = 10.10.20.1:51820  # Hub's IP on robot VLAN
AllowedIPs = 10.10.10.0/24
PersistentKeepalive = 25
```

**All MQTT, video, and command traffic flows through the WireGuard tunnel.** Even if an attacker is on the same WiFi network, they see only encrypted WireGuard packets.

### 7.2 step-ca (Certificate Authority)

**Role:** Automated certificate issuance and renewal for the robot fleet.

**From step-ca documentation:** step-ca is an online Certificate Authority for secure, automated X.509 certificate management. It supports ACME protocol for automated issuance, mTLS, and pluggable backends.

**Deployment:**
```yaml
# step-ca configuration (on hub)
authority:
  provisioners:
    - type: ACME
      name: robot-acme
      claims:
        maxTLSCertDuration: 720h  # 30 days
        defaultTLSCertDuration: 720h
  
  # Template for robot certificates
  template: |
    {
      "subject": {
        "commonName": {{ toJson .Insecure.CR.Subject.CommonName }},
        "organization": ["PatrolFleet"]
      },
      "sans": {{ toJson .SANs }},
      "keyUsage": ["digitalSignature", "keyEncipherment"],
      "extKeyUsage": ["clientAuth"]
    }
```

**Certificate Lifecycle:**
1. Robot boots → requests certificate via ACME protocol over local network
2. step-ca verifies robot identity (device attestation or ACME challenge)
3. Certificate issued, valid for 30 days
4. Robot auto-renews at 20 days (10-day overlap)
5. Old certificate automatically invalid after expiry

### 7.3 HashiCorp Vault

**Role:** Centralized secrets management on the hub.

**Secrets Managed:**
- WiFi WPA3 passphrase
- MQTT broker credentials (for non-mTLS fallback)
- API keys (cloud services, cellular provider)
- LoRa encryption keys
- Fleet-wide shared secrets
- OTA signing key (sealed, requires hub unsealing)

**Deployment:** Vault runs on the hub in "dev-like" mode with file backend (no external dependencies). Unsealed at boot using TPM-sealed unseal key.

```bash
# Store LoRa fleet key
vault kv put secret/fleet/lora key="<base64-encoded-AES-key>"

# Robot retrieves its secrets via AppRole auth
vault write auth/approle/login \
  role_id="robot-001" \
  secret_id="<from-atecc608a>"
```

### 7.4 Suricata / Snort (Network IDS)

**Role:** Detect intrusion attempts on the robot network.

**Deployment:** Suricata runs on the hub, monitoring all traffic on the robot VLAN.

**Custom Rules for Robot Fleet:**

```yaml
# Detect unauthorized MQTT connection attempts
alert tcp any any -> $HUB_IP 8883 (msg:"Unauthorized MQTT connection attempt"; 
  flow:to_server,established; content:"|10|"; offset:0; depth:1;
  threshold:type both, track by_src, count 5, seconds 60;
  sid:1000001; rev:1;)

# Detect port scanning on robot VLAN
alert tcp any any -> $ROBOT_VLAN any (msg:"Port scan on robot VLAN"; 
  flags:S; threshold:type both, track by_src, count 20, seconds 10;
  sid:1000002; rev:1;)

# Detect WiFi deauth flood (requires monitor mode interface)
alert ieee80211 any any -> any any (msg:"Deauthentication flood detected";
  ieee80211.type:0; ieee80211.subtype:12;
  threshold:type both, track by_src, count 10, seconds 5;
  sid:1000003; rev:1;)

# Detect LoRa frequency scanning (via ESP32 spectrum monitor)
# (Custom integration — Suricata reads alerts from ESP32 via syslog)

# Detect DNS exfiltration
alert dns any any -> any any (msg:"DNS tunnel attempt"; 
  dns.query; content:"."; pcre:"/^.{50,}/";
  sid:1000004; rev:1;)
```

### 7.5 Fail2ban

**Role:** Block brute-force attempts against hub services.

**Configuration:**
```ini
# /etc/fail2ban/jail.local

[mosquitto-auth]
enabled = true
port = 8883
filter = mosquitto-auth
logpath = /var/log/mosquitto/mosquitto.log
maxretry = 3
bantime = 3600
findtime = 300

[ssh]
enabled = true
port = 22
maxretry = 3
bantime = 86400  # 24 hours

[wireguard]
enabled = true
filter = wireguard-handshake
logpath = /var/log/kern.log
maxretry = 10
bantime = 3600
```

### 7.6 Additional Open Source Security Tools

| Tool | Role | Notes |
|---|---|---|
| **CrowdSec** | Collaborative IDS | Community-shared blocklists, lighter than Suricata |
| **OpenCanary** | Honeypot framework | Deploy fake services to detect attackers |
| **OSSEC / Wazuh** | Host-based IDS (HIDS) | File integrity monitoring on hub |
| **Prometheus + Grafana** | Security monitoring dashboard | Visualize all security metrics |
| **Loki** | Log aggregation | Centralize logs from all robots + hub |
| **mitmproxy** | Testing tool | Test own system for MITM vulnerabilities |
| **Kismet** | WiFi/BLE/RF monitoring | Detect rogue devices near property |
| **GnuPG** | Firmware signing | Sign OTA updates offline |

---

## 8. Communication Methods Comparison Table

| Method | Range (Outdoor) | Bandwidth | Latency | Power (Active TX) | Encryption | Cost/Module | Weather Resilience | Jamming Resistance | Frequency |
|---|---|---|---|---|---|---|---|---|---|
| **WiFi 6 (802.11ax)** | 100-200m (2.4G), 50-120m (5G) | 100-1000+ Mbps | 1-10ms | 200-500 mW | WPA3 + TLS 1.3 | $3-5 (ESP32) / $30-100 (AP) | Moderate (rain fade on 5G) | Low (easily jammed on known channels) | 2.4 / 5 / 6 GHz |
| **BLE 5.0 Mesh** | 30-100m (standard), up to 400m (coded PHY) | 125-2000 kbps | 50-200ms/hop | 10-50 mW | AES-128-CCM | $3-5 (ESP32) | Good (sub-GHz not available, but robust modulation) | Low-Medium (narrow band, but 2.4 GHz congested) | 2.4 GHz |
| **LoRa (SX1262)** | 3-15 km | 0.3-62.5 kbps | 50-500ms | 120-500 mW (at +22dBm) | AES-128 hardware + software layer | $12-20 (module) | Excellent (sub-GHz penetrates rain/fog) | **High** (CSS spread spectrum + FHSS) | 868/915 MHz |
| **Cellular 4G LTE** | 1-10+ km (to tower) | 10-150 Mbps | 20-50ms | 500-2000 mW | LTE encryption + VPN | $15-25 (module) + $5-20/mo data | Good (carrier infrastructure) | Medium (requires carrier jamming) | 700-2600 MHz |
| **Cellular 5G NR** | 0.5-5 km (Sub-6), 100-300m (mmWave) | 100-2400 Mbps | 5-20ms | 1000-3000 mW | 5G NR encryption + VPN | $50-80 (module) + $20-65/mo data | Moderate (mmWave: poor; Sub-6: good) | Medium-High (wideband, beamforming) | Sub-6 GHz / mmWave |
| **ELRS 900 MHz** | 10-100+ km | 50 Hz-1000 Hz update rate (~1-5 kbps) | 2-25ms | 250-1000 mW | AES-128 (binding phrase) | $15-30 (TX+RX pair) | Excellent (sub-GHz) | **High** (FHSS, low dwell time) | 868/915 MHz |
| **SiK Radio 915 MHz** | 1-10 km | 64-250 kbps (MAVLink) | 10-50ms | 100-1000 mW | MAVLink2 signing (optional) | $20-60 (pair) | Excellent | Medium (fixed frequency, no FHSS) | 915 MHz |
| **Thread (802.15.4)** | 30-100m/hop, 300m+ mesh | 250 kbps | 10-50ms | 10-30 mW | AES-128-CCM | $2-4 (ESP32-C6) | Good | Low (narrow band, 2.4 GHz) | 2.4 GHz |
| **Zigbee** | 10-75m indoor, 100-300m outdoor | 250 kbps | 10-50ms | 10-30 mW | AES-128 | $5-10 (module) | Good | Low | 2.4 GHz |
| **Z-Wave** | 30-100m | 100 kbps (Gen5+) | 10-50ms | 10-30 mW | AES-128 (S2) | $8-15 (module) | Good (sub-GHz) | Medium (sub-GHz, less interference) | 908 MHz (US) |
| **Iridium SBD** | **Global** (satellite) | 340 B/message (up) | 10-60 sec | 1500 mW | Proprietary | $200-300 (modem) + $0.05-0.15/msg | **Excellent** | **Very High** (satellite, spread spectrum) | 1616-1626.5 MHz |
| **Starlink** | **Global** (satellite) | 50-200+ Mbps | 20-40ms | 50-100W (terminal) | Proprietary + VPN | $299-599 (terminal) + $50-120/mo | Good (rain fade at Ka-band) | **High** (LEO constellation, adaptive) | Ku/Ka-band |

### Jamming Resistance Rating Explanation

| Rating | Meaning |
|---|---|
| **Low** | Jammed by $20 device from 100m away |
| **Medium** | Requires $100-500 equipment, specific frequency knowledge |
| **High** | Requires $1000+ broadband jammer, detectable, legally risky |
| **Very High** | Requires state-level resources to jam effectively |

---

## 9. Failover Architecture Diagram

```
                    ┌─────────────────────────────────────┐
                    │           CENTRAL HUB                │
                    │                                      │
                    │  ┌─────────┐  ┌─────────────────┐   │
                    │  │ MQTT    │  │ step-ca (PKI)   │   │
                    │  │ Broker  │  │ Vault (secrets) │   │
                    │  │ (TLS)   │  │ Suricata (IDS)  │   │
                    │  └────┬────┘  └─────────────────┘   │
                    │       │                              │
                    │  ┌────┴────┐  ┌─────────────────┐   │
                    │  │WiFi 6  │  │  LoRa Gateway   │   │
                    │  │AP/Mesh │  │  (SX1262)       │   │
                    │  └────┬────┘  └────────┬────────┘   │
                    │       │                │             │
                    │  ┌────┴────┐  ┌────────┴────────┐   │
                    │  │Cellular │  │  BLE Mesh       │   │
                    │  │(LTE)   │  │  (ESP32)        │   │
                    │  └────┬────┘  └────────┬────────┘   │
                    │       │                │             │
                    │  ┌────┴────┐  ┌────────┴────────┐   │
                    │  │WireGuard│  │  Thread/Zigbee  │   │
                    │  │VPN     │  │  (Sensors)      │   │
                    │  └────┬────┘  └─────────────────┘   │
                    └───────┼──────────────────────────────┘
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
    ┌─────▼─────┐    ┌─────▼─────┐    ┌─────▼─────┐
    │  Robot 1   │    │  Robot 2   │    │  Drone 1  │
    │            │    │            │    │           │
    │ WiFi ◄──1──┤    │ WiFi ◄──1──┤    │ WiFi ◄─1─┤
    │ Cell ◄──2──┤    │ Cell ◄──2──┤    │ ELRS ◄─2─┤
    │ LoRa ◄──3──┤    │ LoRa ◄──3──┤    │ LoRa ◄─3─┤
    │ BLE  ◄──4──┤    │ BLE  ◄──4──┤    │ BLE  ◄─4─┤
    │ Auto ◄──5──┤    │ Auto ◄──5──┤    │ RTL  ◄─5─┤
    │            │    │            │    │           │
    │ ATECC608A  │    │ ATECC608A  │    │ ATECC608A │
    │ ESP32-S3   │    │ ESP32-S3   │    │ ESP32-S3  │
    │ SX1262     │    │ SX1262     │    │ SX1262    │
    └────────────┘    └────────────┘    └───────────┘
    
    Numbers = Failover priority
    All channels encrypted independently
    All channels authenticated via mTLS or pre-shared keys
```

---

## 10. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-4)
- [ ] Set up WPA3 WiFi network with 802.11w PMF
- [ ] Deploy Mosquitto MQTT broker with TLS 1.3
- [ ] Set up step-ca for automated certificate management
- [ ] Implement mTLS for robot-hub authentication
- [ ] Basic WireGuard VPN tunnel
- [ ] Network VLAN isolation

### Phase 2: Multi-Channel (Weeks 5-8)
- [ ] Integrate SX1262 LoRa modules on robots + hub
- [ ] Custom LoRa protocol with AES-128 encryption
- [ ] BLE Mesh on ESP32-S3 for robot-to-robot communication
- [ ] Implement failover state machine (WiFi → LoRa → BLE)
- [ ] Cellular backup integration (SIM7600G on hub)

### Phase 3: Hardening (Weeks 9-12)
- [ ] ATECC608A secure element integration
- [ ] ESP32-S3 secure boot + flash encryption
- [ ] End-to-end encryption (XChaCha20-Poly1305)
- [ ] Rolling codes implementation
- [ ] Challenge-response command authentication
- [ ] Signed OTA firmware updates

### Phase 4: Advanced Security (Weeks 13-16)
- [ ] FHSS on LoRa (application-level frequency hopping)
- [ ] RF jamming detection + response protocol
- [ ] GPS spoofing detection (multi-source position fusion)
- [ ] Behavioral anomaly detection engine
- [ ] Dead man's switch implementation
- [ ] Hardware geofence enforcement

### Phase 5: Monitoring & Intelligence (Weeks 17-20)
- [ ] Suricata IDS deployment on hub
- [ ] Honeypot channels (fake MQTT topics, fake services)
- [ ] Prometheus + Grafana security dashboard
- [ ] Log aggregation (Loki)
- [ ] Automated alerting (SMS, push notification, email)
- [ ] Penetration testing and vulnerability assessment

### Phase 6: Polish & Certification (Weeks 21-24)
- [ ] FCC Part 15 compliance verification (LoRa, ELRS)
- [ ] Security audit by third party
- [ ] Documentation for end users
- [ ] Manufacturing provisioning workflow (key injection)
- [ ] Disaster recovery procedures
- [ ] Thread/Zigbee sensor integration

---

## Appendix A: Threat Model Summary

| Threat | Likelihood | Impact | Mitigation Layers |
|---|---|---|---|
| WiFi jamming | **High** | Medium (failover available) | FHSS, multi-channel, 802.11w, failover to LoRa |
| WiFi deauth attack | **Very High** | Low-Medium | WPA3 + 802.11w mandatory PMF |
| GPS spoofing | Medium | High (misdirected robots) | Multi-source EKF, geofence, anomaly detection |
| Physical capture | Medium | **Critical** (key extraction) | Secure boot, ATECC608A, key zeroization, tamper detect |
| Firmware injection | Low-Medium | **Critical** (full control) | Secure boot, signed OTA, anti-rollback |
| Command replay | Medium | High (recall robots) | Rolling codes, nonces, timestamps, sequence numbers |
| MITM attack | Medium | High | mTLS, certificate pinning, E2E encryption |
| Cellular interception | Low | Medium | WireGuard VPN, E2E encryption |
| Insider threat | Low | **Critical** | Audit logs, separation of duties, short-lived certs |
| Broadband RF jamming | Low (expensive) | High | Dead man's switch, autonomous mode, local recording |

## Appendix B: Regulatory Compliance Notes

| Regulation | Relevance | Requirements |
|---|---|---|
| FCC Part 15 (US) | All radio transmissions | Power limits, spurious emissions, labeling |
| FCC Part 15.247 | 900 MHz / 2.4 GHz ISM | FHSS: ≥50 hopping channels, ≤400ms dwell time |
| FCC Part 15.249 | LoRa (915 MHz) | Max 1W with FHSS, field strength limits |
| FAA Part 107 | Drone operations | Remote ID, BVLOS restrictions |
| GDPR/CCPA | Video recording/processing | Privacy notices, data retention policies |
| NIST 800-53 | Security controls | Framework for security architecture |
| NIST 800-183 | IoT security | Networks of Things architecture |

## Appendix C: Key Cryptographic Algorithms Used

| Purpose | Algorithm | Key Size | Library |
|---|---|---|---|
| Transport encryption | TLS 1.3 (AES-256-GCM) | 256-bit | mbedTLS / OpenSSL |
| E2E encryption | XChaCha20-Poly1305 | 256-bit | libsodium |
| Key exchange | X25519 (Curve25519) | 256-bit | libsodium |
| Signatures (TLS) | ECDSA P-256 or Ed25519 | 256-bit | mbedTLS / libsodium |
| LoRa encryption | AES-128-CTR (hardware) + AES-256-GCM (software) | 128+256-bit | SX1262 HW + libsodium |
| BLE Mesh | AES-128-CCM (spec) + AES-256-GCM (app layer) | 128+256-bit | ESP-BLE-MESH + libsodium |
| Firmware signing | Ed25519 | 256-bit | libsodium / GnuPG |
| HMAC (command auth) | HMAC-SHA256 | 256-bit | libsodium / mbedTLS |
| Key derivation | HKDF-SHA256 | 256-bit | libsodium |
| Random numbers | ATECC608A TRNG + ESP32 RNG | N/A | Hardware |
| VPN tunnel | ChaCha20-Poly1305 (WireGuard) | 256-bit | WireGuard kernel module |
| Certificate hashing | SHA-256 / SHA-384 | N/A | mbedTLS |

---

*This document is a living reference. Update as the architecture evolves.*  
*Last updated: February 2026*
