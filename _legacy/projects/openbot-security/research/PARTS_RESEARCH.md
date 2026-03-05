# Autonomous Security Patrol Robot — Parts Research Report

**Generated:** 2026-02-01  
**Builds:** OpenBot MTV (Ground) + ArduPilot F450 Quad (Air)

---

## Table of Contents

1. [OpenBot MTV Parts Deep Dive](#1-openbot-mtv-parts-deep-dive)
2. [ArduPilot Drone Parts Compatibility](#2-ardupilot-drone-parts-compatibility)
3. [Inductive Charging Components](#3-inductive-charging-components)
4. [Weatherproofing](#4-weatherproofing)
5. [Upgrade Path Components](#5-upgrade-path-components)
6. [Master Bill of Materials](#6-master-bill-of-materials)

---

## 1. OpenBot MTV Parts Deep Dive

### 1.1 JGB37-520 Motors

#### Exact Specs Required (per OpenBot MTV BOM)

The MTV README specifies: **JGB37-520 DC-Motor with encoders — 12V | 178RPM**

| Parameter | Value |
|---|---|
| **Motor Model** | JGB37-520 |
| **Rated Voltage** | 12V DC |
| **No-Load Speed** | 178 RPM (at output shaft, after gearbox) |
| **Gear Ratio** | ~1:56 (varies by RPM variant) |
| **Stall Torque** | ~2.5–4.0 kg·cm (typical for 178RPM variant) |
| **Stall Current** | ~2.5–3.5A per motor |
| **No-Load Current** | ~200–350mA |
| **Shaft Diameter** | 6mm D-shaft (flat on one side) |
| **Shaft Length** | ~15mm |
| **Encoder** | Hall-effect quadrature encoder, 11 PPR (at motor shaft), ×gear ratio = ~616 counts/rev at output |
| **Encoder Voltage** | 3.3V–5V compatible |
| **Motor Body Diameter** | 37mm (gearbox housing) |
| **Motor Length** | ~75mm (total with encoder) |
| **Weight** | ~110–130g per unit |
| **Mounting Holes** | M3, on gearbox face plate |

> **⚠️ CRITICAL:** The 178RPM variant is specifically required. JGB37-520 motors come in many RPM ratings (30, 50, 107, 150, 178, 200, 330, 520 RPM etc.). Ordering the wrong RPM variant means the wrong gear ratio and wrong torque profile. Always verify "178RPM" or "gear ratio 1:56" in the listing.

#### Best Sources

| Source | Price (per motor) | Notes |
|---|---|---|
| **AliExpress** (official MTV BOM link) | ~$8–9 | Best price, ships with encoder + coupling sleeve + wheel hex hub. 2–4 week shipping. |
| **Amazon US** — Search "JGB37-520 12V 178RPM encoder" | ~$12–18 | Faster shipping. Verify RPM rating carefully — many listings mix variants. |
| **Amazon US** — Bringsmart store | ~$13–15 | Reliable seller of this motor family. Search "Bringsmart JGB37-520". |
| **RobotShop** | ~$15–20 | Higher price but verified specs. |

> **Quantity needed: 6 motors**  
> **Budget estimate:** $54 (AliExpress) to $90 (Amazon)

#### Compatible Wheels

The MTV BOM specifies **2.8" Talon Tires** from RobotShop (~$27/pair, need 3 pairs = 6 wheels).

These mount via a **hex hub coupling sleeve** that comes with the JGB37-520 motor kit. The coupling sleeve fits the 6mm D-shaft and provides a hex mount for the wheel.

**Alternative wheels compatible with JGB37-520 6mm D-shaft:**
- **65mm/80mm rubber wheels with 6mm hub** — Common on AliExpress/Amazon, ~$3–5/pair. Smaller but cheaper.
- **Wild Thumper wheels** (Dagu) — 120mm, designed for similar geared motors, but need hub adapter verification.
- **3D-printed wheels** — Design your own with 6mm D-shaft bore. TPU tread over PLA/PETG hub works well for outdoor traction.

**Recommendation:** Stick with the 2.8" Talon Tires for terrain performance. The $162 cost is the single most expensive mechanical component but delivers excellent all-terrain grip for the Rocker-Bogie design.

---

### 1.2 Motor Drivers: TB6612FNG vs L298N vs Cytron MDD30A

#### What the MTV Actually Uses

**Important:** The official MTV BOM uses neither TB6612FNG nor L298N. It specifies **2× Cytron MDD30A** (30A 5–30V Single Brushed DC Motor Driver) at $34 each. Each MDD30A drives 2 motors (dual-channel 30A), so 2 boards = 4 channels. For 6 motors with differential (tank) drive, the left 3 motors are wired in parallel to one channel pair and the right 3 to the other.

However, for a custom or cost-optimized build, here's the comparison:

#### TB6612FNG vs L298N for 6-Motor Config

| Feature | TB6612FNG | L298N | Cytron MDD30A (MTV default) |
|---|---|---|---|
| **Max Current (per channel)** | 1.2A continuous / 3.2A peak | 2A continuous / 3A peak | 30A continuous |
| **Voltage Range** | 2.5–13.5V | 5–35V | 5–30V |
| **Efficiency** | ~95% (MOSFET H-bridge) | ~50–60% (BJT H-bridge, ~2V drop) | ~95%+ (MOSFET) |
| **Heat** | Minimal | Significant (needs heatsink) | Minimal with proper airflow |
| **PWM Frequency** | Up to 100kHz | ~40kHz max practical | Up to 20kHz |
| **Channels per board** | 2 | 2 | 2 |
| **Price** | ~$2–3 | ~$3–5 | ~$34 |
| **Boards needed for 6 motors** | 3 (min) | 3 (min) | 2 |

#### Analysis for 6-Motor MTV Configuration

**TB6612FNG — ❌ NOT RECOMMENDED for MTV**
- At 1.2A continuous, it cannot handle the JGB37-520 stall current (~3A). Even normal loaded operation at ~0.8–1.5A per motor is marginal.
- You'd need the motors running well under load, and any incline/obstacle would stall and burn the driver.
- 3 motors in parallel on one channel = ~2.4–4.5A continuous — far exceeds 1.2A rating.

**L298N — ⚠️ MARGINAL**
- 2A continuous could handle a single JGB37-520 under normal load, but the ~2V voltage drop means your 12V motor only sees ~10V, reducing speed/torque.
- 3 motors in parallel = way too much for one L298N channel.
- Would need 3× L298N (one per motor pair, left-front/right-front, left-mid/right-mid, left-rear/right-rear) = still insufficient per-channel current.

**Cytron MDD30A — ✅ RECOMMENDED (MTV default)**
- 30A handles 3 paralleled motors (even at stall) with huge headroom.
- MOSFET design = minimal voltage drop, high efficiency.
- Only 2 boards needed.
- $68 total is reasonable for the capability.

**Alternative: BTS7960 43A IBT-2 Motor Driver — ✅ GOOD BUDGET ALTERNATIVE**
- ~$8–10 each, 43A continuous
- Single channel per board, so need 2 boards (left side, right side)
- Very popular in robotics community
- $16–20 total vs $68 for Cytron

#### Wiring Diagram (MTV Configuration)

```
Battery (3S LiPo 11.1V)
    │
    ├──► Driver A (Left Side)
    │    ├── Channel A → Left-Front Motor  ┐
    │    └── Channel B → Left-Mid Motor    ├── Wired in parallel
    │                     Left-Rear Motor  ┘
    │
    └──► Driver B (Right Side)
         ├── Channel A → Right-Front Motor ┐
         └── Channel B → Right-Mid Motor   ├── Wired in parallel
                          Right-Rear Motor ┘

ESP32 Connections:
  - GPIO PIN_PWM_L1 → Driver A IN1 (Left Forward)
  - GPIO PIN_PWM_L2 → Driver A IN2 (Left Reverse)  
  - GPIO PIN_PWM_R1 → Driver B IN1 (Right Forward)
  - GPIO PIN_PWM_R2 → Driver B IN2 (Right Reverse)
```

> **Note:** The MTV firmware treats the robot as a 2-channel (left/right) differential drive regardless of motor count. All left motors receive the same PWM signal; all right motors receive the same PWM signal.

---

### 1.3 Microcontroller: Arduino Nano vs Nano Every vs ESP32

#### OpenBot Firmware Compatibility Matrix

From the OpenBot firmware source code (`openbot.ino`):

| MCU | Supported Body Types | Bluetooth | WiFi | Flash | RAM |
|---|---|---|---|---|---|
| **Arduino Nano (ATmega328P)** | DIY, PCB_V1, PCB_V2, RTR_TT, RC_CAR, LITE | ❌ | ❌ | 32KB | 2KB |
| **ESP32 (ESP-WROOM-32)** | RTR_TT2, RTR_520, **MTV**, DIY_ESP32 | ✅ | ✅ | 4MB | 520KB |
| **Arduino Nano Every (ATmega4809)** | ❌ Not officially supported | ❌ | ❌ | 48KB | 6KB |

#### Verdict: ESP32 is Required for MTV

**The MTV firmware configuration (`#define OPENBOT MTV`) is exclusively defined as an ESP32 target (`#define MCU ESP32`).** There is no Arduino Nano variant for the MTV.

This is because the MTV needs:
- **6 PWM outputs** (L1, L2, R1, R2 + additional middle motor channels)
- **6 encoder inputs** (front, middle, rear — left and right)
- **Bluetooth support** for wireless phone connection
- **More GPIO pins** than an ATmega328P provides
- **More RAM** for the Bluetooth stack and sensor processing

**Arduino Nano Every** is NOT supported by OpenBot firmware at all. While it has more pins and memory than the classic Nano, there's no firmware configuration for it, and porting would require significant effort.

#### Recommended ESP32 Board

The MTV BOM specifies: **AITRIP ESP32-DevKitC** (~$7 each, sold in 3-packs for ~$20)
- ESP32-WROOM-32D module
- USB-C or Micro-USB (varies by seller)
- 38-pin configuration
- **Select "ESP32 Dev Module" in Arduino IDE**
- **Use ESP32 board package version 2.0.17** (3.x.x is NOT compatible per the firmware README)

---

### 1.4 Phone-to-Arduino Connection: USB OTG with Pixel 9 Pro

#### How OpenBot Phone Connection Works

OpenBot connects the smartphone to the ESP32 via **USB Serial** (CDC/ACM). The phone runs the OpenBot Android app, which communicates with the ESP32 over this serial link at 115200 baud.

There are two connection methods:
1. **USB OTG cable** (wired) — Phone USB-C → OTG adapter → ESP32 Micro-USB
2. **Bluetooth** (wireless) — ESP32 BLE ↔ Phone Bluetooth (MTV supports this via `HAS_BLUETOOTH 1`)

#### Pixel 9 Pro USB OTG Compatibility

| Aspect | Status |
|---|---|
| **USB OTG Support** | ✅ Yes — Pixel 9 Pro fully supports USB OTG |
| **USB-C port** | ✅ USB 3.2 Gen 2 |
| **CDC/ACM Serial** | ✅ Android supports USB CDC/ACM natively (used by OpenBot) |
| **Power delivery to ESP32** | ✅ USB OTG provides 5V to connected devices |
| **CH340/CP2102 driver** | ✅ Built into Android kernel since Android 3.1+ |

#### Recommended Setup

**For outdoor patrol duty, Bluetooth is strongly preferred:**
- No cable to snag, weather-seal, or break
- ESP32 BLE range is ~10–30m (more than enough for on-board connection)
- Set `HAS_BLUETOOTH 1` in firmware config
- Pair via OpenBot app → Settings → Connection → Bluetooth

**For initial setup/debugging, use wired USB:**
- **Cable needed:** USB-C to Micro-USB OTG cable (or USB-C OTG adapter + standard Micro-USB cable)
- The MTV BOM includes a **Duttek Micro USB Panel Mount Cable** (O14) for clean routing through the chassis
- Pixel 9 Pro will power the ESP32 via OTG (draws ~100–200mA, well within phone's OTG output)

#### Pixel 9 Pro Specific Notes
- The Pixel 9 Pro runs Android 14+ which has full USB Host mode support
- OpenBot app is compatible with Android 5.0+ (API 21+)
- The 6.3" or 6.8" screen works well with OpenBot's camera-based AI features
- Tensor G4 chip handles the OpenBot neural network models extremely well
- 50MP main camera provides excellent input for object detection and path following

---

### 1.5 Battery Sizing: 3S vs 4S LiPo for 6 Motors

#### Current Draw Analysis

| Component | Current Draw |
|---|---|
| 6× JGB37-520 motors (normal load) | 6 × 0.8A = **4.8A** |
| 6× JGB37-520 motors (heavy load/incline) | 6 × 1.5A = **9.0A** |
| 6× JGB37-520 motors (stall) | 6 × 3.0A = **18.0A** |
| ESP32 + sensors | ~0.3A |
| LEDs (all on) | ~0.2A |
| LM2596 buck converter losses | ~0.1A |
| **Total (normal operation)** | **~5.4A** |
| **Total (heavy load)** | **~9.6A** |

#### 3S vs 4S Comparison

| Parameter | 3S (11.1V nominal) | 4S (14.8V nominal) |
|---|---|---|
| **Voltage range** | 9.0V–12.6V | 12.0V–16.8V |
| **Motor compatibility** | ✅ Perfect — motors are rated 12V | ⚠️ Overvoltage — 14.8V exceeds 12V rating |
| **Motor speed** | Normal (178 RPM at 12V) | ~220+ RPM (overspeed, shorter motor life) |
| **Firmware voltage config** | `VOLTAGE_LOW=9.0, VOLTAGE_MAX=12.6` | Would need firmware modification |
| **Available batteries** | Abundant, cheap | Abundant, slightly more expensive |
| **Official MTV BOM** | ✅ **3S 4500mAh 25C–55C** | ❌ Not recommended |

#### Runtime Calculations (3S 4500mAh)

```
Battery capacity: 4500mAh = 4.5Ah
Energy: 4.5Ah × 11.1V = 49.95Wh

Normal patrol (flat ground, moderate speed):
  Current draw: ~5.4A
  Runtime: 4500mAh / 5400mA = 0.83 hours ≈ 50 minutes

Heavy terrain patrol:
  Current draw: ~9.6A  
  Runtime: 4500mAh / 9600mA = 0.47 hours ≈ 28 minutes

Mixed use estimate (70% normal, 30% heavy):
  Average current: 0.7 × 5.4 + 0.3 × 9.6 = 6.66A
  Runtime: 4500mAh / 6660mA = 0.68 hours ≈ 40 minutes
```

#### Recommendation

**Use 3S LiPo** as specified by the MTV BOM. The JGB37-520 motors are rated for 12V, and 3S nominal (11.1V) is optimal.

**Recommended battery:** 3S 5200mAh 50C (for ~15% more runtime than the BOM's 4500mAh)
- Dimensions: verify fit in MTV battery compartment (~140×45×30mm typical for 3S 5200mAh)
- Need XT60 connector (standard for hobby LiPo)
- C-rating: 50C × 5.2Ah = 260A max burst — more than sufficient

**For extended patrol runtime**, consider:
- Two 3S 5200mAh batteries with a switching/parallel harness
- Estimated runtime with 10400mAh: ~90 minutes normal patrol

---

## 2. ArduPilot Drone Parts Compatibility

### 2.1 Pixhawk Autopilot Options

#### Comparison Matrix

| Feature | Pixhawk 2.4.8 (Budget Clone) | Pixhawk 6C Mini | Cube Orange+ |
|---|---|---|---|
| **Processor** | STM32F427 (168MHz Cortex-M4) | **STM32H743 (480MHz Cortex-M7)** | **STM32H757 (400MHz Cortex-M7)** |
| **RAM** | 256KB | 1MB | 1MB |
| **Flash** | 2MB (but clones often have 1MB chip bug) | 2MB | 2MB |
| **IMUs** | 1× MPU6000 | **3× redundant (ICM-42688P, ICM-20649, BMI088)** | **3× redundant (ICM-42688, ICM-20948 + mag)** |
| **Barometers** | 1× MS5611 | **2× (ICP-20100, MS5611)** | **2× MS5611** |
| **Magnetometer** | 1× (on GPS usually) | 1× built-in | 1× built-in (ICM-20948 + AK09916) |
| **IMU Vibration Isolation** | ❌ None | ✅ Yes (2 of 3 IMUs) | ✅ Yes (mechanically isolated) |
| **IMU Heating** | ❌ None | ✅ Yes | ✅ Yes |
| **UART Ports** | 5 | 6 (5 on Mini) | 5 |
| **CAN Bus** | 1 | 2 | 2 |
| **PWM Outputs** | 14 (8 main + 6 aux) | 8 FMU (6 on Mini) | 14 (8 IO + 6 FMU) |
| **ArduPilot Latest (4.5+)** | ⚠️ Limited firmware (1MB flash issue on clones) | ✅ Full support | ✅ Full support |
| **DShot ESC Protocol** | ⚠️ Only on AUX outputs | ✅ All FMU outputs | ✅ On FMU outputs |
| **Size** | 50×81.5×15.5mm | **36.2×40×13.5mm (smallest)** | 38.4×38.4×22mm (cube only) |
| **Weight** | ~38g | ~21g | ~76g (with carrier ~200g) |
| **Price** | **$25–40** | **$80–120** | **$250–350** |

#### ArduPilot Firmware Compatibility Details

**Pixhawk 2.4.8 (Budget Clones) — ⚠️ USE WITH CAUTION**
- Many clones use early STM32F427 revisions with a hardware bug limiting flash to 1MB
- 1MB flash = **limited firmware** — features like Lua scripting, precision landing, some GPS protocols may be missing
- Can use ArduPilot's [Custom Firmware Build Server](https://custom.ardupilot.org) to select which features to include
- Quality varies wildly between clone manufacturers
- Fine for learning/testing, NOT recommended for autonomous patrol duty

**Pixhawk 6C Mini — ✅ RECOMMENDED for F450 Quad**
- H7 processor handles ArduPilot 4.5+ with all features
- Compact size perfect for F450 frame
- Built-in PWM header reduces wiring
- 2 power monitor ports for redundancy
- ELRS/CRSF requires a full UART (SERIAL1–SERIAL4 available on Mini)
- Firmware: use "Pixhawk6C" from firmware.ardupilot.org

**Cube Orange+ — ✅ EXCELLENT but overkill for F450**
- Premium option, best sensor suite
- Requires separate carrier board (adds cost and weight)
- 80-pin DF17 connector system for carrier board modularity
- Best for larger vehicles or commercial operations
- ADS-B receiver available on carrier board (nice for awareness but not essential)

#### Recommendation for F450 Security Drone

**Pixhawk 6C Mini** — Best balance of capability, size, weight, and price for an F450 frame. Full ArduPilot support, compact enough for the frame, and all the UARTs needed for ELRS receiver + companion computer + GPS.

---

### 2.2 Thrust Calculations: 2212 920KV + 30A ESC + 1045 Props

#### Motor/Prop Specifications

| Parameter | Value |
|---|---|
| Motor | 2212 920KV brushless |
| Prop | 10×4.5 (1045) |
| ESC | 30A (SimonK or BLHeli) |
| Battery | 3S LiPo (11.1V) / 4S LiPo (14.8V) |

#### Thrust Data (2212 920KV with 1045 props)

Based on widely-published test data for this common combination:

| Battery | Throttle | Thrust/Motor | Current/Motor | Efficiency |
|---|---|---|---|---|
| **3S (11.1V)** | 50% | ~380g | ~3.5A | 8.5 g/W |
| **3S (11.1V)** | 75% | ~550g | ~7.0A | 7.0 g/W |
| **3S (11.1V)** | 100% | ~750g | ~12A | 5.6 g/W |
| **4S (14.8V)** | 50% | ~500g | ~4.5A | 7.5 g/W |
| **4S (14.8V)** | 75% | ~730g | ~9.0A | 5.5 g/W |
| **4S (14.8V)** | 100% | ~950g | ~16A | 4.0 g/W |

#### F450 Payload Budget

```
4 motors × 750g (3S max) = 3000g total max thrust
4 motors × 950g (4S max) = 3800g total max thrust

Hover should be at 50-60% throttle for efficiency and control authority.
Rule of thumb: All-Up Weight (AUW) should be ≤50% of max thrust.

Max recommended AUW (3S): 3000g × 0.5 = 1500g
Max recommended AUW (4S): 3800g × 0.5 = 1900g
```

#### Weight Budget (4S Recommended)

| Component | Weight |
|---|---|
| F450 frame + hardware | 280g |
| 4× 2212 920KV motors | 4 × 52g = 208g |
| 4× 30A ESCs | 4 × 28g = 112g |
| 4× 1045 props | 4 × 12g = 48g |
| Pixhawk 6C Mini + cables | ~50g |
| GPS module (M10) | ~30g |
| ELRS receiver | ~5g |
| Power module + PDB | ~40g |
| Raspberry Pi Zero 2W | 10g |
| Pi camera module | 3g |
| Camera mount (3D printed) | 20g |
| Wiring, zip ties, misc | 40g |
| **Subtotal (no battery)** | **~846g** |
| 4S 3300mAh LiPo | ~330g |
| **Total AUW** | **~1176g** |

```
Thrust-to-weight ratio (4S): 3800g / 1176g = 3.23:1 ✅ Excellent
Hover throttle estimate: ~31% ✅ Very efficient
Available payload margin: 1900g - 1176g = 724g
```

#### Battery & Flight Time (4S)

```
4S 3300mAh at hover (~31% throttle):
  Current per motor at hover: ~3.0A
  Total hover current: 4 × 3.0A = 12A
  Flight time: 3300mAh / 12000mA × 60 = ~16.5 minutes
  
  With 20% safety reserve: ~13 minutes usable
```

**Recommendation:** Use **4S LiPo** for the drone. The 2212 920KV motors handle 4S well (within 30A ESC limits), and the extra thrust headroom provides better handling and more payload capacity for the Pi Zero + camera system. A 4S 3300mAh gives ~13 minutes of usable flight time.

---

### 2.3 GPS Modules: M8N vs M10

| Feature | u-blox M8N | u-blox M10 |
|---|---|---|
| **Constellations (simultaneous)** | 3 (GPS + GLONASS + BeiDou) | **4 (GPS + GLONASS + BeiDou + Galileo)** |
| **Position Accuracy** | 2.5m CEP | **1.5m CEP** |
| **Time to First Fix (Cold)** | 26s | **24s** |
| **Time to First Fix (Hot)** | 1s | 1s |
| **Update Rate** | 10Hz (default 5Hz) | **25Hz (default 1Hz)** |
| **Power Consumption** | ~30mA | **~12mA** (super low-power) |
| **Compass (common modules)** | IST8310 or HMC5883L | IST8310 or QMC5883L |
| **Interface** | UART + I2C | UART + I2C + SPI |
| **Price** | $15–25 | $20–35 |
| **ArduPilot Support** | ✅ Full, mature | ✅ Full (since ArduPilot 4.1+) |

#### Compass Integration

Most GPS/Compass combo modules include an external magnetometer on the same PCB, connected via I2C. This is important because:
- The external compass (mounted on a GPS mast) is far from motor magnetic interference
- ArduPilot uses external compass as primary, internal as backup
- Pixhawk 6C Mini has 2× I2C buses — GPS compass connects via the GPS port's I2C lines

**Pixhawk Compatibility:**
- Both M8N and M10 modules work with all Pixhawk versions via UART (GPS port)
- The compass chip communicates via I2C through the same GPS connector
- No special configuration needed — ArduPilot auto-detects GPS and compass type
- Set `SERIAL3_PROTOCOL = 5` (GPS) — this is the default on Pixhawk 6C Mini

#### Recommendation

**u-blox M10** — The improved accuracy (1.5m vs 2.5m), quad-constellation support, and lower power draw are worth the modest price premium for a security patrol drone that needs reliable position holds.

**Suggested product:** Holybro M10 Standard GPS (includes IST8310 compass, JST-GH connector compatible with Pixhawk 6C Mini out of the box).

---

### 2.4 RadioMaster Pocket ELRS: ArduPilot Setup

#### Overview

The RadioMaster Pocket is a compact ELRS (ExpressLRS) transmitter running EdgeTX/OpenTX firmware. ELRS is an open-source, long-range, low-latency RC link.

#### Hardware Connection

ELRS uses the **CRSF protocol** which requires a full UART connection (TX + RX) on the Pixhawk:

```
ELRS Receiver (e.g., BetaFPV Nano, RadioMaster RP1/RP2/RP3):
  RX pin → Pixhawk UART TX
  TX pin → Pixhawk UART RX
  VCC → 5V
  GND → GND
```

On Pixhawk 6C Mini, use **SERIAL1 (TELEM1)** or **SERIAL2 (TELEM2)** for the ELRS receiver (freeing SERIAL3 for GPS and another serial for companion computer):

#### ArduPilot Parameters (using SERIAL2 as example)

```
SERIAL2_PROTOCOL = 23    (RCInput)
SERIAL2_OPTIONS = 0       (no special options for CRSF)
SERIAL2_BAUD = 115        (auto-detected, but 115200 is typical)
RSSI_TYPE = 3             (CRSF telemetry)
RC_PROTOCOLS = 512        (CRSF only, or leave at 1 for auto-detect)
```

#### Failsafe Configuration

This is **critical** for an autonomous security drone:

```
# RC Failsafe (triggered when ELRS link is lost)
FS_THR_ENABLE = 2        # RTL on throttle failsafe
FS_THR_VALUE = 975        # PWM threshold (below this = failsafe)

# GCS Failsafe (if companion computer link lost)  
FS_GCS_ENABLE = 2         # SmartRTL, or RTL if SmartRTL unavailable

# Battery Failsafe
BATT_FS_LOW_ACT = 2       # RTL on low battery
BATT_FS_CRT_ACT = 1       # Land on critical battery
BATT_LOW_VOLT = 14.0      # 4S low voltage (3.5V/cell)
BATT_CRT_VOLT = 13.2      # 4S critical voltage (3.3V/cell)

# EKF/GPS Failsafe
FS_EKF_ACTION = 1          # Land on EKF failsafe
```

#### ELRS-Specific Notes
- ELRS supports **telemetry** back to the transmitter (battery voltage, GPS, flight mode, etc.)
- On EdgeTX transmitters (RadioMaster Pocket), use the **Yaapu telemetry LUA script** for rich OSD on the transmitter screen
- ELRS packet rate: Use 250Hz or 500Hz for quad (lower latency for acro/manual), 50Hz or 150Hz is fine for autonomous patrol (saves power on receiver)
- Binding phrase: Set in ELRS Configurator, flashed to both TX module and receiver — no physical binding button needed

---

### 2.5 Raspberry Pi Zero 2W as Companion Computer

#### Hardware Specs

| Parameter | Value |
|---|---|
| Processor | BCM2710A1 (Cortex-A53 quad-core @ 1GHz) |
| RAM | 512MB |
| WiFi | 802.11 b/g/n (2.4GHz) |
| Bluetooth | 4.2 / BLE |
| GPIO | 40-pin header |
| Camera | CSI-2 camera connector (22-pin) |
| USB | 1× Micro-USB (data), 1× Micro-USB (power) |
| Power | 5V, ~350mA idle, ~500mA under load |
| Weight | **10g** |
| Size | 65mm × 30mm |

#### MAVLink Connection to Pixhawk

```
Physical Wiring:
  Pi Zero 2W GPIO 14 (TX) → Pixhawk TELEM2 RX (pin 3)
  Pi Zero 2W GPIO 15 (RX) → Pixhawk TELEM2 TX (pin 2)
  Pi Zero 2W GND → Pixhawk TELEM2 GND (pin 6)
  
  DO NOT connect 5V between them (power Pi separately via USB or BEC)
```

**Pixhawk Parameters (SERIAL2 = TELEM2):**
```
SERIAL2_PROTOCOL = 2      # MAVLink2
SERIAL2_BAUD = 921        # 921600 baud
```

> **Note:** If SERIAL2 is used for ELRS, use SERIAL4 (UART8) or SERIAL5 for the companion computer. On Pixhawk 6C Mini, you have SERIAL1–SERIAL4 available (no SERIAL5).

**Port allocation suggestion for 6C Mini:**
```
SERIAL1 (TELEM1) → Companion Computer (Pi Zero 2W) — MAVLink2 @ 921600
SERIAL2 (TELEM2) → ELRS Receiver — CRSF RC input
SERIAL3 (GPS1)   → GPS M10 module
SERIAL4 (GPS2)   → Free (or telemetry radio)
```

#### Pi Zero 2W Software Setup

**1. Enable UART:**
```bash
sudo raspi-config
# → Interface Options → Serial Port
# → Login shell over serial: NO
# → Serial port hardware enabled: YES
sudo reboot
```

**2. Install MAVLink tools:**
```bash
# Option A: DroneKit-Python (high-level, easier)
pip3 install dronekit

# Option B: pymavlink (low-level, more control)
pip3 install pymavlink

# Option C: mavlink-router (efficient routing daemon)
sudo apt install mavlink-router
```

**3. DroneKit-Python Example (autonomous patrol waypoints):**
```python
from dronekit import connect, VehicleMode, LocationGlobalRelative
import time

vehicle = connect('/dev/serial0', baud=921600, wait_ready=True)

# Arm and take off
vehicle.mode = VehicleMode("GUIDED")
vehicle.armed = True
while not vehicle.armed:
    time.sleep(1)

target_altitude = 10  # meters
vehicle.simple_takeoff(target_altitude)

# Wait to reach altitude
while vehicle.location.global_relative_frame.alt < target_altitude * 0.95:
    time.sleep(1)

# Fly to waypoint
point1 = LocationGlobalRelative(34.0522, -118.2437, 10)
vehicle.simple_goto(point1, groundspeed=5)

# ... patrol logic here ...

vehicle.mode = VehicleMode("RTL")
vehicle.close()
```

**4. Camera Streaming:**
```bash
# Install camera tools
sudo apt install libcamera-apps

# Stream via RTSP (viewable from ground station)
# Using mediamtx (lightweight RTSP server):
libcamera-vid -t 0 --width 640 --height 480 --framerate 30 \
  --codec h264 --inline -o - | \
  ffmpeg -i - -c copy -f rtsp rtsp://0.0.0.0:8554/camera

# Or simpler: stream via UDP to GCS
libcamera-vid -t 0 --width 640 --height 480 --framerate 15 \
  --codec h264 -o udp://192.168.1.100:5600
```

**5. mavlink-router configuration (`/etc/mavlink-router/main.conf`):**
```ini
[General]

[UartEndpoint to_fc]
Device = /dev/serial0
Baud = 921600

[UdpEndpoint to_gcs]
Mode = eavesdropping
Address = 0.0.0.0
Port = 14550
PortLock = 0
```

#### Limitations of Pi Zero 2W

- **512MB RAM** — limits concurrent processes. Running OpenCV + DroneKit + camera streaming is tight.
- **No Ethernet** — WiFi only, which can be unreliable at distance.
- **Single USB** — Need a USB hub if connecting multiple peripherals.
- **No hardware H.264 encoder access** via libcamera in some configurations — may need software encoding.

**If budget allows, consider Pi Zero 2W alternatives:**
- **Raspberry Pi 5** ($50) — Massively more powerful, but 25g heavier, needs more power
- **Radxa Zero 3W** (~$20) — Similar form factor, 1–2GB RAM option

---

## 3. Inductive Charging Components

### 3.1 Available TX/RX Coil Modules

#### Common Modules on Amazon/AliExpress

| Module | Power | Air Gap | Efficiency | Voltage In/Out | Price | Notes |
|---|---|---|---|---|---|---|
| **5V 2A Qi Module (generic)** | 10W | 2–5mm | 70–75% | 5V→5V | $5–10 | Not useful — voltage too low for LiPo direct charging |
| **12V 2A Wireless Charger Module** | 24W | 3–8mm | 65–75% | 12V→12V | $10–18 | ✅ Good for 3S LiPo (needs charge controller) |
| **12V 5A Module (AliExpress)** | 60W | 5–10mm | 60–70% | 12V→12V | $15–25 | ✅ Best for fast charging 3S |
| **24V 2A Module** | 48W | 5–15mm | 60–70% | 24V→24V | $15–30 | ✅ Good for 4S LiPo (needs charge controller) |
| **XKT-412A Module** | 5–12W | 2–4mm | 70–80% | 12V→12V | $3–8 | Cheap, small coils, tight alignment needed |
| **IP6808 + IP6809 Qi Chipset** | 15W | 3–8mm | 75–80% | Flexible | $8–15 | Full Qi standard compliance |
| **DIY Resonant Coil (custom wound)** | Variable | 10–30mm | 50–70% | Custom | $2–5 in materials | Maximum flexibility, requires RF tuning |

#### Key Specifications for Robot Application

**For 3S LiPo (Ground Robot):**
- Battery: 11.1V nominal, charge voltage 12.6V
- Need: ~12V output from wireless module → LiPo balance charger
- Charging current: 1C = 4.5A (for 4500mAh battery) → need ~56W wireless module
- **Practical approach:** Use 12V 5A wireless module (~60W) → standalone 3S balance charger module (TP5100 or similar)

**For 4S LiPo (Drone):**
- Battery: 14.8V nominal, charge voltage 16.8V
- Need: ~17V output → LiPo balance charger
- Charging current: 1C = 3.3A (for 3300mAh battery) → need ~55W wireless module
- **Practical approach:** Use 24V 2A wireless module → step-down to 16.8V → 4S balance charger

### 3.2 Qi Modules vs Custom Resonant Coils

| Aspect | Qi Standard Modules | Custom Resonant Coils |
|---|---|---|
| **Power** | 5–15W (standard), up to 50W (proprietary) | 5W–200W+ (design dependent) |
| **Frequency** | 110–205 kHz | Typically 50 kHz–13.56 MHz |
| **Alignment Tolerance** | ±5–10mm (with multi-coil TX) | Depends on coil diameter (larger = more tolerant) |
| **Air Gap** | 2–8mm designed | 5–50mm achievable with larger coils |
| **Regulation** | Built-in negotiation protocol | Manual / custom circuit design |
| **EMI** | Certified, low EMI | May need shielding, FCC considerations |
| **Cost** | $5–25 per TX/RX pair | $2–10 in components, significant engineering time |
| **Reliability** | High (commercial grade) | Depends on implementation |

**Recommendation for Security Robot:**

Use **commercial 12V 5A wireless charging modules** (non-Qi, purpose-built power transfer modules) rather than Qi:
- Qi is optimized for phone charging (5V–12V, <15W) — too low power
- The 12V/5A industrial modules are designed for exactly this use case (charging equipment at a distance)
- Pre-tuned resonant circuit, thermal protection, over-voltage/current protection built in
- Mount TX coil flush in a charging pad, RX coil on robot underbelly

### 3.3 Charging Circuit Integration

#### Ground Robot (3S LiPo)

```
Charging Pad (AC powered):
  AC Mains → 12V 5A PSU → Wireless TX Module (coil in pad surface)
  
Robot Underbelly:
  Wireless RX Module → 12V output
    → TP5100 Dual-Cell/3S Balance Charger Module
      → 3S LiPo Battery (with balance lead)
      
Components needed:
  - 12V 5A wireless TX/RX pair: ~$20
  - 12V 5A power supply: ~$10
  - TP5100 3S charger module: ~$3–5
  - Balance lead connector: ~$1
```

**TP5100 Note:** The TP5100 is a 2S charger by default. For 3S, you'll need a dedicated 3S balance charger board (search "3S 11.1V LiPo balance charger module" — available for ~$5–10, usually based on BQ24650 or similar IC, or use a full iCharger/ISDT module for reliable balance charging).

**Better approach for 3S:** Use a **SkyRC e430 or similar small balance charger** fed by the 12V wireless output. These are self-contained, reliable, and handle balance charging properly.

#### Drone (4S LiPo)

The drone's inductive charging is more complex because it needs to land precisely on a pad:

```
Charging Pad:
  AC Mains → 24V 3A PSU → Wireless TX Module (large coil, 60-80mm diameter)
  
Drone Landing Pad:
  Wireless RX Module → 24V output  
    → Buck converter to 16.8V
      → 4S Balance Charger Module
        → 4S LiPo Battery
```

**Practical consideration:** For the drone, a **contact-based charging system** (pogo pins) may be more reliable than inductive. The drone must land precisely anyway, and pogo pins are:
- More efficient (>95% vs 60–70%)
- Simpler circuit
- Higher power transfer possible
- Cheaper

### 3.4 Alignment Solutions

| Method | Accuracy | Range | Cost | Complexity | Best For |
|---|---|---|---|---|---|
| **ArUco Markers** | ±1–2cm | Camera range | Free (printed) | Medium (CV required) | Drone precision landing |
| **IR Beacons** | ±5–10cm | 2–5m | $10–20 | Low–Medium | Ground robot docking |
| **BLE Beacons** | ±1–3m (raw), ±30cm (AoA) | 10–30m | $5–15 | Medium | Coarse homing, not final alignment |
| **IR LED + Photodiode array** | ±1cm | 1–2m | $5 | Medium | Fine alignment (last meter) |
| **UWB (Ultra-Wideband)** | ±10–30cm | 10–50m | $15–30 per anchor | High | Full 3D positioning |
| **Magnetic alignment (magnets in pad)** | Self-centering | Contact | $5 | Very Low | Final snap alignment |

#### Recommended Strategy

**For Ground Robot (docking to charge pad):**
1. **BLE beacon** for coarse approach (get within 1m of pad)
2. **IR beacon array** for fine approach (last 1m, center on pad)
3. **Physical guides / funnel shape** on charging pad for final mechanical alignment
4. **Magnets** for final snap (optional, helps with inductive coil alignment)

**For Drone (precision landing on pad):**
1. **GPS/RTK** for approach (get within 1–2m)
2. **ArUco markers** on landing pad for precision landing (ArduPilot has built-in precision landing support via companion computer)
3. **IR beacon** as backup (works at night when camera might struggle)
4. Contact pogo pins or flush inductive coil for charging

ArduPilot's **Precision Landing** feature supports:
- IRLock sensor (commercial IR beacon system, ~$80)
- Companion computer with camera doing ArUco detection → sends landing target to autopilot via MAVLink (`LANDING_TARGET` message)
- The Pi Zero 2W can run ArUco detection at 15+ FPS with a 640×480 camera feed

---

## 4. Weatherproofing

### 4.1 IP65+ Enclosure Approaches for Ground Robot

IP65 = Dust-tight + protected against low-pressure water jets from any direction.

#### Strategy for MTV

The MTV already has a compartment design. For IP65:

**Electronics Compartment:**
1. **Gasket the compartment seams** — Use 2mm silicone gasket cord or closed-cell foam tape between compartment halves
2. **Cable glands** — Already in the BOM (PG7 glands for motor cables). Add PG9 or PG11 for thicker cables (battery, USB)
3. **Seal the battery door** — Add rubber gasket or O-ring channel around the battery access lid
4. **Vent with Gore-Tex membrane** — A small IP67 vent plug (M12, ~$3) allows pressure equalization without water ingress
5. **Conformal coat all PCBs** (see below)

**Motor Modules:**
- The 3D-printed motor enclosures provide some protection
- Seal motor enclosure seam with silicone RTV gasket maker
- Cable glands already provide water-tight cable entry
- Motor shaft seal: Apply marine-grade grease to the output shaft area
- JGB37-520 motors are NOT waterproof — the enclosure IS the protection

**Alternative: Use a commercial IP65 enclosure**
- Hammond 1554 series (polycarbonate, IP65, various sizes, ~$15–30)
- Mount inside the MTV compartment
- All electronics go inside the Hammond box
- Cable glands on the box for all connections

### 4.2 Conformal Coating for Electronics

| Coating Type | Protection | Flexibility | Rework | Cure Time | Best For |
|---|---|---|---|---|---|
| **Acrylic (e.g., MG Chemicals 419D)** | Good moisture/fungus | Good | Easy (dissolves in IPA) | 30 min | ✅ General purpose, easy to apply/remove |
| **Silicone (e.g., MG Chemicals 422B)** | Excellent moisture, wide temp range | Excellent | Medium (peelable) | 24 hrs | ✅ Best for temperature extremes |
| **Polyurethane (e.g., HumiSeal 1A33)** | Excellent moisture + chemical | Moderate | Difficult | 24 hrs | Industrial/chemical environments |
| **Epoxy** | Best overall protection | Poor (rigid) | Very difficult | Varies | Permanent potting |

**Recommended for Security Robot:**

**Acrylic conformal coating (MG Chemicals 419D spray)** — ~$15/can
- Spray all PCBs (ESP32 dev board, motor driver, buck converters, custom PCB)
- Mask connectors, buttons, and USB ports before spraying (use Kapton tape)
- Apply 2–3 thin coats, letting each dry 10 minutes
- Easy to rework if you need to solder/modify later (dissolves in isopropyl alcohol)
- Provides IPC-CC-830B Class 1 protection

**Application tips:**
- Clean boards with IPA first (remove flux residue)
- Mask: USB connectors, programming headers, potentiometers, battery connectors
- Apply in a well-ventilated area
- Verify coating coverage under UV light (most acrylic coatings fluoresce)

### 4.3 3D Printing Materials: PETG vs ASA vs ABS

| Property | PLA | PETG | ASA | ABS |
|---|---|---|---|---|
| **UV Resistance** | ❌ Very poor | ⚠️ Moderate | ✅ Excellent | ⚠️ Poor–Moderate |
| **Temperature Resistance** | 60°C HDT | 80°C HDT | 100°C HDT | 100°C HDT |
| **Impact Strength** | Low | **High** | Medium–High | Medium |
| **Layer Adhesion** | Good | **Excellent** | Good | Moderate |
| **Water Resistance** | Poor (hygroscopic) | **Good** | Good | Moderate |
| **Warping** | Minimal | Minimal | Moderate | **Severe** |
| **Enclosed Printer Needed** | No | No | ✅ Yes | ✅ Yes |
| **Outdoor Durability** | ❌ Degrades in months | ✅ 1–2 years | ✅✅ 5+ years | ⚠️ 1–2 years |
| **Chemical Resistance** | Poor | Good | Good | Moderate |
| **Print Difficulty** | Easy | Easy | Medium | Medium |
| **Cost (per kg)** | $20 | $22 | $25–30 | $20–25 |

#### Recommendation for Outdoor Security Robot

**ASA — ✅ BEST for outdoor parts** that need UV and weather resistance
- ASA (Acrylonitrile Styrene Acrylate) is essentially UV-stabilized ABS
- Use for: all external body panels, motor enclosures, joints, legs
- Print settings: 240–260°C nozzle, 90–110°C bed, enclosed printer, minimal cooling fan
- Brand recommendation: eSun ASA, Prusament ASA, or Polymaker PolyLite ASA

**PETG — ✅ GOOD alternative if no enclosed printer**
- PETG is the best option if you don't have an enclosed printer
- Better impact resistance than ASA
- Apply UV-resistant clear coat (Rust-Oleum UV clear spray) for extended outdoor life
- Print settings: 230–250°C nozzle, 70–80°C bed, no enclosure needed

**For the MTV specifically:**
- The original BOM was designed for PLA (print settings reference PLA)
- PLA WILL degrade outdoors — expect warping and brittleness within 3–6 months
- **Reprint in ASA** for a security robot that lives outdoors
- Alternatively, print in PETG and apply 2–3 coats of UV-protective clear coat
- Budget extra ~10% print time for ASA (higher temps = slightly slower for best quality)

---

## 5. Upgrade Path Components

### 5.1 IR Night Vision Camera Modules (Android USB)

| Module | Resolution | IR LEDs | Interface | Night Range | Price | Android Compatible |
|---|---|---|---|---|---|---|
| **ELP USB IR Camera (IMX323)** | 1080p | 6× 850nm | USB 2.0 (UVC) | 10–15m | $35–50 | ✅ Yes (UVC standard) |
| **Arducam 5MP OV5648 with IR-cut** | 5MP | Separate IR illuminator | USB 2.0 (UVC) | Depends on illuminator | $25–30 | ✅ Yes (UVC) |
| **HQCAM 1080P IR USB** | 1080p | 24× IR LEDs | USB 2.0 (UVC) | 15–20m | $30–45 | ✅ Yes (UVC) |
| **SainSmart Night Vision USB** | 720p | 4× IR LEDs | USB 2.0 (UVC) | 5–8m | $20–30 | ✅ Yes (UVC) |
| **Infiray T2L (thermal + visual)** | 256×192 thermal | N/A (thermal) | USB-C | N/A (thermal) | $300+ | ✅ Via app/SDK |

**For OpenBot compatibility:** The phone (Pixel 9 Pro) camera is used by default for the AI vision pipeline. Adding a USB camera would require:
1. USB OTG adapter + USB hub (since the ESP32 also needs a USB connection, unless using Bluetooth)
2. Modifying the OpenBot app to use an external USB camera (UVC) instead of the built-in camera
3. OR: Use the phone's built-in camera for AI + mount the IR camera for recording/monitoring only

**Practical recommendation:** Use the **Pixel 9 Pro's built-in camera** for AI vision during the day, and add a dedicated **IR illuminator board** (850nm or 940nm LEDs, ~$5) to enable the phone's camera to see in low light. The Pixel 9 Pro's main camera has excellent low-light performance (Night Sight) and can detect IR illumination that's invisible to humans.

### 5.2 Thermal Cameras (FLIR Lepton Alternatives)

| Camera | Resolution | FPS | Interface | Price | SDK/Android |
|---|---|---|---|---|---|
| **FLIR Lepton 3.5** | 160×120 | 8.7 FPS | SPI + I2C | $200–250 (module only) | PureThermal2 USB board ($50) + UVC |
| **Infiray Tiny1-B** | 256×192 | 25 FPS | USB-C / SPI | $150–200 | ✅ Android app + SDK |
| **Infiray P2 Pro** | 256×192 | 25 FPS | USB-C | $250–300 (complete) | ✅ Android app |
| **Seek Thermal Compact Pro** | 320×240 | 15 FPS | Micro-USB / USB-C | $400–500 | ✅ Android app |
| **TopIR 256** (AliExpress) | 256×192 | 25 FPS | USB-C | $80–120 | ⚠️ Varies by seller |
| **Hikmicro Mini1** | 160×120 | 25 FPS | USB-C | $200 | ✅ Android app |
| **AMG8833 Grid-EYE** | 8×8 | 10 FPS | I2C | $25–40 | Arduino/ESP32 only |

**Budget Recommendation:** **Infiray Tiny1-B** or **TopIR 256** modules
- 256×192 is a significant upgrade over the Lepton's 160×120
- 25 FPS vs Lepton's 8.7 FPS — much smoother
- Cheaper than FLIR
- Growing SDK support for Android and Python

**Minimum viable:** **AMG8833 Grid-EYE** at $25 — only 8×8 pixels, but can detect human-sized heat signatures at 5–7m range. Connects to ESP32 via I2C, suitable for basic presence detection.

### 5.3 LiDAR Options for Indoor SLAM

| LiDAR | Range | Scan Rate | Points/sec | Angular Res. | Interface | Price | ROS Support |
|---|---|---|---|---|---|---|---|
| **RPLiDAR A1M8** | 12m | 5.5 Hz | 8,000 | 1° | UART (USB adapter included) | $99 | ✅ Excellent |
| **RPLiDAR A2M12** | 12m | 10 Hz | 8,000 | 0.45° | UART | $300 | ✅ Excellent |
| **RPLiDAR C1** | 12m | 10 Hz | 5,000 | 0.72° | UART | $65 | ✅ Good |
| **YDLIDAR X4** | 10m | 7 Hz | 5,000 | 0.5° | UART | $69 | ✅ Good |
| **YDLIDAR X2L** | 8m | 7 Hz | 3,000 | 0.72° | UART | $49 | ✅ Good |
| **LD19 (LDS-02)** | 12m | 10 Hz | 4,500 | 0.72° | UART | $20–30 | ✅ Good |
| **Camsense X1** | 8m | 7 Hz | 4,000 | 0.6° | UART | $25–35 | ⚠️ Limited |

#### Recommendation

**For budget:** **LD19 / LDS-02** (~$25)
- Used in Xiaomi/Dreame/Roborock robot vacuums
- Excellent value, well-documented
- Available on AliExpress for $20–30
- ROS2 driver available
- 12m range is sufficient for indoor SLAM

**For reliability:** **RPLiDAR A1M8** (~$99)
- Gold standard for hobbyist SLAM
- Best documented, largest community
- USB connection works directly with Pi or phone
- ROS/ROS2 packages are mature and well-tested
- Slamtec's own SDK is excellent

**For the OpenBot platform:**
- Mount LiDAR on top of the MTV compartment
- Connect via USB to the phone (requires OpenBot app modification for SLAM) or to a companion Raspberry Pi
- For SLAM, run on companion computer with ROS2 (Pi Zero 2W might be underpowered — consider Pi 4/5 or Jetson Nano for SLAM)
- Popular SLAM algorithms: Google Cartographer, slam_toolbox, Hector SLAM

---

## 6. Master Bill of Materials

### Ground Robot (OpenBot MTV)

| Category | Item | Qty | Unit Price (USD) | Total (USD) |
|---|---|---|---|---|
| **Motors** | JGB37-520 12V 178RPM w/ encoder | 6 | $9 | $54 |
| **Wheels** | 2.8" Talon Tires (pair) | 3 | $27 | $81 |
| **Motor Driver** | Cytron MDD30A (or 2× BTS7960) | 2 | $34 ($10) | $68 ($20) |
| **MCU** | ESP32 DevKitC | 1 | $7 | $7 |
| **Battery** | 3S 5200mAh 50C LiPo | 1 | $40 | $40 |
| **Phone** | Pixel 9 Pro (already owned) | 1 | — | — |
| **USB Cable** | Duttek Micro USB panel mount | 1 | $11 | $11 |
| **Buck Converter** | LM2596S 12V→5V | 1 | $4 | $4 |
| **Misc Electronics** | Voltmeter, switch, LEDs, cables | 1 lot | ~$45 | $45 |
| **Hardware** | Screws, nuts, bearings, rods, etc. | 1 lot | ~$120 | $120 |
| **3D Print Filament** | ASA ~2.5kg | 3 spools | $25 | $75 |
| | | | **Subtotal** | **~$505** |

### Air Drone (ArduPilot F450 Quad)

| Category | Item | Qty | Unit Price (USD) | Total (USD) |
|---|---|---|---|---|
| **Frame** | F450 frame kit | 1 | $15 | $15 |
| **Autopilot** | Pixhawk 6C Mini | 1 | $100 | $100 |
| **Motors** | 2212 920KV brushless | 4 | $8 | $32 |
| **ESCs** | 30A BLHeli_S | 4 | $8 | $32 |
| **Props** | 1045 propellers (CW+CCW pair) | 4 pair | $3 | $12 |
| **GPS** | u-blox M10 w/ compass (Holybro) | 1 | $30 | $30 |
| **RC Receiver** | ELRS receiver (BetaFPV/RM) | 1 | $15 | $15 |
| **RC Transmitter** | RadioMaster Pocket ELRS | 1 | $60 | $60 |
| **Battery** | 4S 3300mAh 50C LiPo | 2 | $30 | $60 |
| **Power Module** | Holybro PM02 (or PDB + sensor) | 1 | $20 | $20 |
| **Companion** | Raspberry Pi Zero 2W | 1 | $15 | $15 |
| **Camera** | Pi Camera Module 3 | 1 | $25 | $25 |
| **Misc** | Wires, connectors, GPS mast, etc. | 1 lot | $25 | $25 |
| | | | **Subtotal** | **~$441** |

### Charging System

| Item | Qty | Unit Price (USD) | Total (USD) |
|---|---|---|---|
| 12V 5A Wireless TX/RX module | 1 | $20 | $20 |
| 12V 5A AC Power Supply | 1 | $10 | $10 |
| 3S Balance Charger Module | 1 | $10 | $10 |
| 4S Balance Charger Module | 1 | $10 | $10 |
| Charging pad enclosure (3D printed + hardware) | 1 | $15 | $15 |
| IR alignment LEDs + photodiodes | 1 kit | $10 | $10 |
| | | **Subtotal** | **~$75** |

### Weatherproofing

| Item | Qty | Unit Price (USD) | Total (USD) |
|---|---|---|---|
| MG Chemicals 419D Conformal Coat Spray | 1 | $15 | $15 |
| Silicone gasket cord (2mm, 5m) | 1 | $8 | $8 |
| IP67 vent plugs (M12) | 2 | $3 | $6 |
| Additional PG cable glands | 1 pack | $9 | $9 |
| Marine-grade grease | 1 tube | $8 | $8 |
| | | **Subtotal** | **~$46** |

---

### Grand Total Estimate

| Build | Cost |
|---|---|
| Ground Robot (MTV) | $505 |
| Air Drone (F450) | $441 |
| Charging System | $75 |
| Weatherproofing | $46 |
| **Total** | **~$1,067** |

> **Note:** This excludes: 3D printer cost, soldering equipment, tools, phone cost (assumed owned), and any upgrade components (LiDAR, thermal camera, etc.). Prices are approximate and vary by source/timing.

---

## Key Decisions Summary

| Decision | Recommendation | Reasoning |
|---|---|---|
| MTV MCU | **ESP32 DevKitC** | Only supported MCU for MTV in OpenBot firmware |
| MTV Motor Driver | **Cytron MDD30A × 2** (or BTS7960 × 2 for budget) | Need 30A+ per channel for 3 paralleled motors |
| MTV Battery | **3S 5200mAh 50C LiPo** | Motors rated 12V; 3S = 11.1V nominal — perfect match |
| MTV Print Material | **ASA** (or PETG + UV coat) | Best outdoor UV/weather resistance |
| Drone Autopilot | **Pixhawk 6C Mini** | Full ArduPilot support, compact, H7 processor, great value |
| Drone Battery | **4S 3300mAh 50C** | Good thrust margin (3.2:1 T:W), ~13 min flight time |
| Drone GPS | **u-blox M10 with compass** | Better accuracy, quad-constellation, lower power |
| Drone RC | **RadioMaster Pocket ELRS** | Open source, long range, low latency, full telemetry |
| Companion Computer | **Pi Zero 2W** (drone) | Lightweight, sufficient for MAVLink + basic CV |
| Charging | **12V 5A wireless module + balance charger** | Commercial module for reliability |
| Drone Alignment | **ArUco markers + IR backup** | ArduPilot precision landing support built-in |
| Ground Alignment | **IR beacon + physical guide funnel** | Simple, reliable, works at night |
| Night Vision | **Phone camera + IR illuminator** | Simplest integration with existing OpenBot pipeline |
| Thermal (upgrade) | **Infiray Tiny1-B or TopIR 256** | Best resolution/price ratio, Android support |
| LiDAR (upgrade) | **RPLiDAR A1M8** (reliable) or **LD19** (budget) | Well-supported in ROS ecosystem |

---

*Report generated from OpenBot GitHub repo documentation, ArduPilot official docs, and component specification databases. Verify all prices at time of purchase — electronics pricing fluctuates.*
