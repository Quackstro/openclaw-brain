# 🛒 FINAL Shopping List — Autonomous Security Patrol System
## 1 Ground Robot (OpenBot MTV) + 1 Air Drone (ArduPilot F450)

**Date:** 2026-02-01  
**Prepared for:** Quackstro LLC — Dr. Castro's ½ acre property, Tampa, FL  
**Philosophy:** Open source everything, buy once / buy right  
**Status:** ✅ CORRECTED — incorporates all findings from parts research

> **⚠️ KEY CORRECTIONS from original list:**
> 1. ~~Arduino Nano~~ → **ESP32 DevKitC** (only MCU supported for MTV 6-motor config)
> 2. ~~TB6612FNG / L298N~~ → **Cytron MDD30A** (small drivers can't handle 3A stall current × 3 motors)
> 3. ~~USB OTG primary~~ → **Bluetooth primary** (no cable to snag/weatherseal outdoors)
> 4. ~~Pixhawk 2.4.8 clone~~ → **Pixhawk 6C Mini** (clones have 1MB flash bug, limited firmware)
> 5. ~~M8N GPS~~ → **Holybro M10 GPS** (1.5m vs 2.5m accuracy, quad-constellation, lower power)
> 6. ~~PETG filament~~ → **ASA filament** (UV-resistant for outdoor robot that lives outside)
> 7. ~~Qi wireless charging~~ → **Industrial 12V 5A wireless modules** (Qi maxes out at 15W, too low)
> 8. Added **conformal coating** (MG 419D acrylic spray) for electronics weatherproofing
> 9. Added **secure comms hardware** (ESP32-S3, SX1262 LoRa, ATECC608A secure element)

---

## Table of Contents
- [Section A: Ground Robot (OpenBot MTV)](#section-a-ground-robot-openbot-mtv)
- [Section B: Air Drone (ArduPilot F450 Quad)](#section-b-air-drone-ardupilot-f450-quad)
- [Section C: Secure Communications Hardware](#section-c-secure-communications-hardware)
- [Section D: Wireless Charging System](#section-d-wireless-charging-system)
- [Section E: Weatherproofing & Outdoor Hardening](#section-e-weatherproofing--outdoor-hardening)
- [Section F: Tools & Soldering Kit](#section-f-tools--soldering-kit)
- [Section G: Hub / Base Station](#section-g-hub--base-station)
- [Section H: Consumables & Shared Hardware](#section-h-consumables--shared-hardware)
- [Grand Total Summary](#grand-total-summary)
- [Order Priority Schedule](#order-priority-schedule)

---

## Section A: Ground Robot (OpenBot MTV)

### A1 — 3D Printed Chassis (Neighbor's Printer)

| # | Item | Qty | Search Term | Est. Cost | Notes |
|---|------|-----|-------------|-----------|-------|
| A1.1 | **eSUN ASA filament 1.75mm — Black** | 3 kg (3 spools) | `"eSUN ASA filament 1.75mm 1kg black"` | $28/spool = **$84** | UV-resistant for outdoor life. Needs enclosed printer. ~2.5kg for full MTV print |
| A1.2 | ASA filament — Orange or Yellow (accent) | 1 kg | `"eSUN ASA filament 1.75mm 1kg orange"` | **$28** | Optional accent color for visibility |

> **Print settings for ASA:** 240–260°C nozzle, 90–110°C bed, enclosed printer, minimal part cooling fan  
> **Total print time:** ~80–120 hours for full MTV body  
> **⚠️ CONFIRM:** Neighbor's printer has enclosure. If not, use PETG + UV clear coat as fallback.

**Subtotal A1: ~$84–112**

---

### A2 — Motors & Drive

| # | Item | Qty | Search Term | Est. Cost | Notes |
|---|------|-----|-------------|-----------|-------|
| A2.1 | **JGB37-520 DC gear motor 12V 178RPM with encoder** | 6 | `"JGB37-520 12V 178RPM encoder DC gear motor"` (AliExpress: ~$9/ea; Amazon "Bringsmart JGB37-520": ~$14/ea) | **$54–84** | ⚠️ CRITICAL: Must be **178RPM** variant (gear ratio ~1:56). Many listings mix RPM ratings. Verify before ordering. Comes with hall-effect quadrature encoder (11 PPR at motor shaft). 6mm D-shaft. |
| A2.2 | **2.8" Talon Tires** (pair) | 3 pairs (6 wheels) | `"Lynxmotion A4WD2 talon tire pair"` — RobotShop | $27/pair = **$81** | Official MTV wheel. Mount via hex hub coupling that comes with motor kit. Best outdoor traction for rocker-bogie. |
| A2.3 | Motor mounting brackets (37mm) | 6 | `"37mm DC motor mounting bracket clamp"` | **$8** | If not 3D printing the mounts |

> **Alternative wheels (budget):** 65mm rubber wheels with 6mm bore hub (~$3–5/pair on Amazon, search `"65mm rubber wheel 6mm shaft robot"`) — smaller but $66 cheaper total. Not recommended for outdoor terrain.

**Subtotal A2: ~$143–173**

---

### A3 — Motor Drivers

| # | Item | Qty | Search Term | Est. Cost | Notes |
|---|------|-----|-------------|-----------|-------|
| A3.1 | **Cytron MDD30A** — 30A 5–30V Dual DC Motor Driver | 2 | `"Cytron MDD30A motor driver"` — Cytron.io direct ($34/ea) or Amazon | **$68** | ✅ Official MTV spec. Each board = 2 channels (30A continuous). Board 1: Left 3 motors (paralleled). Board 2: Right 3 motors (paralleled). MOSFET H-bridge, ~95% efficient, no heatsink needed. |

> **Budget alternative:** BTS7960 43A IBT-2 Motor Driver — $8–10/ea × 2 = **$16–20**  
> Search: `"BTS7960 43A motor driver IBT-2"`. Single channel per board, 43A continuous. Very popular in robotics. Works fine but less clean wiring than MDD30A.

**Subtotal A3: $68 (recommended) / $20 (budget)**

---

### A4 — Microcontroller & Electronics

| # | Item | Qty | Search Term | Est. Cost | Notes |
|---|------|-----|-------------|-----------|-------|
| A4.1 | **ESP32-WROOM-32 DevKitC** (38-pin, USB-C preferred) | 2 | `"ESP32 DevKitC WROOM-32 development board"` or `"AITRIP ESP32 DevKitC 3-pack"` (~$20 for 3-pack) | **$14** (buy 3-pack, spare) | ✅ REQUIRED for MTV. Only supported MCU for 6-motor config. Use ESP32 board package **v2.0.17** in Arduino IDE (v3.x NOT compatible). Select "ESP32 Dev Module". Built-in WiFi + Bluetooth. |
| A4.2 | **LM2596S DC-DC buck converter** (adjustable) | 2 | `"LM2596S DC-DC step down buck converter adjustable"` | **$6** (pack of 5) | 12V battery → 5V for ESP32 and sensors. Set output to 5.0V with multimeter before connecting. |
| A4.3 | Micro USB panel mount cable (Duttek) | 1 | `"Duttek micro USB panel mount extension cable"` | **$11** | For clean USB routing through chassis (debug/programming access). |
| A4.4 | USB-C to Micro-USB OTG cable | 1 | `"USB-C to micro USB OTG cable"` | **$7** | For phone-to-ESP32 wired connection during setup/debugging |
| A4.5 | Phone mount (adjustable spring clamp) | 1 | `"Bike phone mount adjustable clamp"` or 3D print | **$5** | Holds Pixel 9 Pro on robot. Can 3D print a custom mount later. |
| A4.6 | Mini digital voltmeter 0–100V (3-wire) | 1 | `"Mini digital voltmeter 0.28 inch 0-100V"` | **$4** | Monitor battery voltage on robot chassis |
| A4.7 | Toggle switch (panel mount, 20A 12V) | 1 | `"Toggle switch panel mount 20A 12V"` | **$3** | Main power switch |
| A4.8 | LED indicator lights (12V, red/green) | 4 | `"12V LED indicator light panel mount"` | **$5** | Status indicators |
| A4.9 | White LED module bars (12V) | 2 | `"12V LED module white small"` | **$4** | Headlights for night patrol |
| A4.10 | Mini speaker + PAM8403 amplifier | 1 | `"PAM8403 amplifier module 3W speaker"` | **$4** | Audible alerts / deterrent siren |

**Subtotal A4: ~$63**

---

### A5 — Sensors

| # | Item | Qty | Search Term | Est. Cost | Notes |
|---|------|-----|-------------|-----------|-------|
| A5.1 | HC-SR04 ultrasonic sensor | 4 | `"HC-SR04 ultrasonic sensor module"` | **$5** (pack of 5) | Obstacle detection — front, rear, left, right |
| A5.2 | Resistor assortment (1/4W) | 1 kit | `"Resistor assortment kit 1/4W 1% 1ohm-1Mohm"` | **$6** | For voltage dividers, pull-ups, etc. |

**Subtotal A5: ~$11**

---

### A6 — Power (Ground Robot)

| # | Item | Qty | Search Term | Est. Cost | Notes |
|---|------|-----|-------------|-----------|-------|
| A6.1 | **3S LiPo 11.1V 5200mAh 50C** (XT60 connector) | 1 | `"3S LiPo 11.1V 5200mAh 50C XT60"` — Zeee, HRB, or Ovonic brands | **$35** | 3S matches JGB37-520 12V rating. 5200mAh gives ~50 min patrol (flat ground). XT60 standard connector. |
| A6.2 | LiPo voltage alarm buzzer (1S–8S) | 2 | `"LiPo voltage alarm buzzer 1S-8S"` | **$4** | Audible low-voltage warning. One for ground bot, one for drone. |
| A6.3 | XT60 connectors (male + female, 5 pairs) | 1 pack | `"XT60 connector pair 5 pack"` | **$6** | Shared across both builds |
| A6.4 | **ToolkitRC M6 charger** (or iMAX B6AC V2) | 1 | `"ToolkitRC M6 LiPo charger"` ($40) or `"iMAX B6AC V2 balance charger"` ($28) | **$28–40** | Charges BOTH 3S (ground) and 4S (drone) batteries. ToolkitRC M6 is nicer; iMAX B6AC is proven and cheaper. |
| A6.5 | LiPo safe bag (large) | 1 | `"LiPo safe charging bag large"` | **$8** | Fireproof bag for charging and storage |

**Subtotal A6: ~$81–93**

---

### A7 — Hardware & Fasteners

| # | Item | Qty | Search Term | Est. Cost | Notes |
|---|------|-----|-------------|-----------|-------|
| A7.1 | M3 screw/nut assortment (stainless, hex socket) | 1 kit | `"M3 screw nut assortment stainless steel hex socket kit"` | **$10** | Primary fastener for MTV assembly |
| A7.2 | M2 screw assortment | 1 kit | `"M2 screw assortment kit"` | **$6** | For PCB mounting, small components |
| A7.3 | M3 brass standoff assortment (male/female) | 1 kit | `"M3 brass standoff kit male female assortment"` | **$8** | PCB mounting standoffs |
| A7.4 | Bearings (608ZZ, 8×22×7mm) | 4 | `"608ZZ bearing 8x22x7mm"` | **$5** | Rocker-bogie pivot bearings |
| A7.5 | Steel rods (8mm × 100mm) | 2 | `"8mm steel rod 100mm"` or cut from longer rod | **$5** | Axle rods for rocker-bogie |
| A7.6 | PG7 cable glands (3–6.5mm) | 10 | `"PG7 cable gland nylon waterproof"` | **$6** (pack of 20) | Weatherproof cable entry points for motor wires |
| A7.7 | PG9/PG11 cable glands (4–8mm / 5–10mm) | 5 each | `"PG9 PG11 cable gland assortment"` | **$6** | Larger cables (battery, USB) |

**Subtotal A7: ~$46**

---

### 📊 **Ground Robot (MTV) Total: ~$496–560**

| | Budget | Recommended |
|---|---|---|
| Chassis (filament) | $84 | $112 |
| Motors & Drive | $143 | $173 |
| Motor Drivers | $20 (BTS7960) | $68 (Cytron MDD30A) |
| Electronics | $63 | $63 |
| Sensors | $11 | $11 |
| Power | $81 | $93 |
| Hardware | $46 | $46 |
| **Total** | **~$448** | **~$566** |

---

## Section B: Air Drone (ArduPilot F450 Quad)

### B1 — Frame

| # | Item | Qty | Search Term | Est. Cost | Notes |
|---|------|-----|-------------|-----------|-------|
| B1.1 | **F450 quadcopter frame kit** (450mm, with PDB) | 1 | `"F450 quadcopter frame kit 450mm PCB"` | **$18** | Comes with integrated Power Distribution Board (PDB) on bottom plate. Standard 450mm size. |
| B1.2 | Tall landing gear (for ground clearance) | 1 set | `"F450 tall landing gear"` | **$6** | Extra clearance for camera + future inductive charging coil underneath |

**Subtotal B1: ~$24**

---

### B2 — Flight Controller & GPS

| # | Item | Qty | Search Term | Est. Cost | Notes |
|---|------|-----|-------------|-----------|-------|
| B2.1 | **Holybro Pixhawk 6C Mini** (with PM02 power module set) | 1 | `"Holybro Pixhawk 6C Mini"` — Holybro.com or Amazon | **$120** | ✅ H7 processor (STM32H743, 480MHz), full ArduPilot 4.5+ support, 2MB flash, triple redundant IMUs, vibration isolation, IMU heating. Compact (54×39×17mm). Use "Pixhawk6C" firmware. PM02 power module included in the set. |
| B2.2 | **Holybro M10 GPS** (with IST8310 compass, safety switch, buzzer) | 1 | `"Holybro M10 GPS"` — Holybro.com or Amazon | **$35** | ✅ u-blox M10, 1.5m CEP accuracy, quad-constellation (GPS+GLONASS+BeiDou+Galileo), 25Hz update rate, 12mA power. JST-GH connector fits Pixhawk 6C Mini directly. Includes compass, buzzer, safety switch. |
| B2.3 | GPS folding mast/mount | 1 | `"GPS folding mount Pixhawk"` | **$5** | Raises GPS above frame to reduce magnetic interference from motors |

**Subtotal B2: ~$160**

---

### B3 — Motors, ESCs, Props

| # | Item | Qty | Search Term | Est. Cost | Notes |
|---|------|-----|-------------|-----------|-------|
| B3.1 | **2212 920KV brushless motors** | 4 | `"2212 920KV brushless motor"` — Readytosky, Hobbypower, or Tarot | **$28** (4-pack) | Standard combo for F450. ~750g thrust/motor at full throttle on 3S, ~950g on 4S. 52g each. |
| B3.2 | **30A ESC BLHeli_S** | 4 | `"30A ESC BLHeli_S"` or `"Simonk 30A ESC"` | **$28** (4-pack) | BLHeli_S preferred for DShot protocol support. Handles 2212 920KV comfortably (max ~16A draw on 4S). |
| B3.3 | **1045 propellers** (CW + CCW pairs) | 6 pairs | `"1045 propeller CW CCW pair"` | **$10** | Buy extra — props break. 10-inch diameter, 4.5-inch pitch. Verify CW/CCW markings. |

**Subtotal B3: ~$66**

---

### B4 — Power (Drone)

| # | Item | Qty | Search Term | Est. Cost | Notes |
|---|------|-----|-------------|-----------|-------|
| B4.1 | **4S LiPo 14.8V 3300mAh 50C** (XT60 connector) | 2 | `"4S LiPo 14.8V 3300mAh 50C XT60"` — Zeee, Ovonic, or Tattu | $28/ea = **$56** | 4S gives excellent T:W ratio (3.2:1). ~13 min usable flight time per battery. Two batteries = swap and fly again. AUW ~1,176g well within safe margins. |
| B4.2 | Battery velcro straps (20mm × 200mm) | 4 | `"LiPo battery strap velcro 20mm"` | **$4** | Secure battery to frame |

> **Note:** LiPo charger (A6.4) handles both 3S and 4S — no extra charger needed.

**Subtotal B4: ~$60**

---

### B5 — Radio Control (Safety-Critical Manual Override)

| # | Item | Qty | Search Term | Est. Cost | Notes |
|---|------|-----|-------------|-----------|-------|
| B5.1 | **RadioMaster Pocket ELRS** transmitter | 1 | `"RadioMaster Pocket ELRS"` — RadioMaster.com or GetFPV | **$60** | Open-source ELRS + EdgeTX firmware. Compact size. Supports Yaapu telemetry LUA script for on-screen battery/GPS/mode display. |
| B5.2 | **RadioMaster RP1 ELRS Nano receiver** | 1 | `"RadioMaster RP1 ELRS receiver"` or `"ELRS receiver nano 2.4GHz"` | **$14** | Connects to Pixhawk 6C Mini via CRSF on SERIAL2. Binding via phrase (no button needed). For 50Hz packet rate (patrol), range is 10+ km. |

> **⚠️ CRITICAL SAFETY:** You MUST have manual RC override for the drone. Never fly autonomous without a kill switch in hand. Configure failsafe: `FS_THR_ENABLE=2` (RTL on signal loss).

**Subtotal B5: ~$74**

---

### B6 — Companion Computer & Camera (Drone)

| # | Item | Qty | Search Term | Est. Cost | Notes |
|---|------|-----|-------------|-----------|-------|
| B6.1 | **Raspberry Pi Zero 2 W** | 1 | `"Raspberry Pi Zero 2 W"` | **$15** | Quad-core A53 @ 1GHz, 512MB RAM, WiFi + BLE. 10g. Runs MAVLink routing + camera streaming + basic CV. Connects to Pixhawk via UART (GPIO 14/15 → TELEM1). |
| B6.2 | **Raspberry Pi Camera Module 3** (wide angle) | 1 | `"Raspberry Pi Camera Module 3 Wide"` | **$30** | 12MP, autofocus, wide FOV. For ArUco precision landing + patrol video. |
| B6.3 | Pi Zero camera ribbon cable (short, 15cm) | 1 | `"Raspberry Pi Zero camera cable 15cm"` | **$4** | Pi Zero uses smaller 22-pin connector (not standard 15-pin) |
| B6.4 | MicroSD card 32GB (Class 10 / A1) | 2 | `"MicroSD 32GB A1 class 10"` | **$8** (×2) | One for Pi Zero 2W (drone), one for Pi hub |
| B6.5 | **UBEC 5V 3A** (BEC voltage regulator) | 1 | `"UBEC 5V 3A BEC"` | **$5** | Powers Pi Zero 2W from drone battery. Do NOT power Pi from Pixhawk (current limit too low). |

**Subtotal B6: ~$62**

---

### B7 — Lights & Safety (Drone)

| # | Item | Qty | Search Term | Est. Cost | Notes |
|---|------|-----|-------------|-----------|-------|
| B7.1 | LED navigation lights (red/green/white) | 1 set | `"Quadcopter LED navigation light set"` | **$6** | Standard nav: red=port/left, green=starboard/right, white=rear |
| B7.2 | Anti-collision strobe light (FAA compliant) | 1 | `"Drone anti-collision strobe light FAA"` — Firehouse Technology or Lume Cube | **$10** | Required for night operations under FAA Part 107. 3 statute mile visibility. |
| B7.3 | ArUco marker (printed on weatherproof material) | 1 | Print on waterproof paper or plastic sheet | **$0** | For precision landing on charging pad. ArduPilot built-in support via companion computer. |

**Subtotal B7: ~$16**

---

### 📊 **Air Drone (F450) Total: ~$462**

| Component | Cost |
|---|---|
| Frame | $24 |
| Flight Controller & GPS | $160 |
| Motors/ESCs/Props | $66 |
| Power | $60 |
| Radio Control | $74 |
| Companion Computer | $62 |
| Lights & Safety | $16 |
| **Total** | **~$462** |

---

## Section C: Secure Communications Hardware

> Based on comms security research. This hardware enables the 5-layer encrypted communication stack:
> WiFi → Cellular → LoRa → BLE Mesh → Autonomous Fallback

### C1 — BLE Mesh & LoRa Comms

| # | Item | Qty | Search Term | Est. Cost | Notes |
|---|------|-----|-------------|-----------|-------|
| C1.1 | **Heltec LoRa 32 V3** (ESP32-S3 + SX1262 combo) | 3 | `"Heltec WiFi LoRa 32 V3 ESP32-S3 SX1262"` | $18/ea = **$54** | ✅ ALL-IN-ONE: ESP32-S3 (WiFi + BLE 5.0 + AES crypto) + SX1262 LoRa (915MHz, 170dB link budget) on single board. 1 per robot + 1 for hub. Has OLED display for debug. Built-in AES-128 hardware encryption on LoRa. |
| C1.2 | **ATECC608A/B secure element** (breakout board) | 3 | `"ATECC608A breakout board"` or `"Adafruit ATECC608 breakout"` (Adafruit #4314) | $6/ea = **$18** | Hardware key storage (16 slots). ECC P-256 sign/verify, AES-128, TRNG. I²C interface → connects to ESP32-S3. Private keys NEVER leave the chip. Tamper-resistant. FIPS certified RNG. |
| C1.3 | 915MHz LoRa antenna (SMA, 3dBi+) | 3 | `"915MHz LoRa antenna SMA 3dBi"` | $4/ea = **$12** | Better range than stock stubby antennas. Half-wave dipole or spring antenna. |
| C1.4 | SMA to U.FL pigtail cables | 3 | `"SMA to U.FL pigtail cable"` | **$6** | If Heltec board uses U.FL connector |

> **Why Heltec V3 over separate ESP32-S3 + SX1262:** Single board = simpler wiring, pre-tuned RF matching, smaller footprint. The V3 gives you WiFi + BLE + LoRa + OLED + USB-C on one $18 board. You'd spend $25+ buying ESP32-S3 + SX1262 module + OLED separately.

**Subtotal C1: ~$90**

---

### C2 — Hub Networking (for later — Phase 2)

| # | Item | Qty | Search Term | Est. Cost | Notes |
|---|------|-----|-------------|-----------|-------|
| C2.1 | WiFi 6 outdoor AP (GL.iNet or TP-Link) | 1 | `"GL.iNet GL-MT6000 WiFi 6 router"` ($90) or `"TP-Link EAP610 Outdoor"` ($100) | **$90–100** | WPA3-SAE + 802.11w (management frame protection). OpenWrt compatible. Covers ½ acre. Phase 2 — use existing home WiFi initially. |

> **Phase 1:** Use existing home WiFi. Add dedicated outdoor AP when deploying to permanent patrol.

**Subtotal C2: ~$0 (Phase 1) / $100 (Phase 2)**

---

### 📊 **Secure Comms Total: ~$90 (Phase 1)**

---

## Section D: Wireless Charging System

> Phase 2 item — build robots first, add autonomous charging later.

### D1 — Ground Robot Charging

| # | Item | Qty | Search Term | Est. Cost | Notes |
|---|------|-----|-------------|-----------|-------|
| D1.1 | **12V 5A wireless charging TX/RX module pair** (industrial) | 1 set | `"12V 5A wireless charging module transmitter receiver"` (AliExpress) or `"wireless power transfer module 60W 12V"` | **$22** | NOT Qi (too low power). Industrial power transfer module, pre-tuned resonant circuit. 60W capability, 5–10mm air gap, 60–70% efficiency. Mount TX coil in charging pad, RX on robot belly. |
| D1.2 | 12V 5A AC power supply (for charging pad) | 1 | `"12V 5A AC DC power adapter barrel jack"` | **$10** | Powers the TX coil. Use with outdoor-rated enclosure. |
| D1.3 | 3S LiPo balance charger module | 1 | `"3S 11.1V LiPo balance charger module BQ24650"` or use small SkyRC charger | **$10** | Sits between wireless RX output (12V) and battery. Handles CC/CV charging + cell balancing. |
| D1.4 | Charging pad enclosure (3D printed + hardware) | 1 | Print from ASA + aluminum sheet | **$10** | Weather-sealed pad with TX coil flush-mounted. Physical funnel guides for robot alignment. |
| D1.5 | IR LEDs (850nm) + photodiodes (for alignment) | 1 kit | `"IR LED 850nm 5mm"` + `"IR photodiode 5mm"` | **$6** | Fine alignment — IR beacon on pad, sensors on robot underbelly. Last-meter precision docking. |
| D1.6 | Neodymium magnets (10mm × 3mm disc) | 10 | `"Neodymium magnet 10mm 3mm disc"` | **$5** | Final snap-alignment between robot and pad coils |

**Subtotal D1: ~$63**

### D2 — Drone Charging (Phase 2+)

| # | Item | Qty | Search Term | Est. Cost | Notes |
|---|------|-----|-------------|-----------|-------|
| D2.1 | Contact-based pogo pin charging system | 1 | `"Pogo pin spring loaded connector 30A"` | **$15** | More efficient than wireless for drone (>95% vs 60–70%). Drone lands precisely (ArUco), pogo pins make contact. |
| D2.2 | 4S balance charger module | 1 | `"4S 16.8V LiPo balance charger module"` | **$12** | |
| D2.3 | 17V power supply (for 4S charging) | 1 | `"18V 3A AC DC power adapter"` | **$12** | |

**Subtotal D2: ~$39**

### 📊 **Charging System Total: ~$102** (all Phase 2)

---

## Section E: Weatherproofing & Outdoor Hardening

| # | Item | Qty | Search Term | Est. Cost | Notes |
|---|------|-----|-------------|-----------|-------|
| E1 | **MG Chemicals 419D Acrylic Conformal Coating Spray** (340g) | 1 can | `"MG Chemicals 419D conformal coating spray"` | **$16** | Spray all PCBs (ESP32, motor drivers, buck converters, Heltec boards). Mask USB/connectors with Kapton tape first. 2–3 thin coats. Easy rework — dissolves in IPA. Fluoresces under UV for inspection. |
| E2 | Kapton tape (polyimide, high temp) | 1 roll | `"Kapton tape 10mm polyimide"` | **$5** | Mask connectors before conformal coating |
| E3 | Silicone gasket cord (2mm diameter, 5m) | 1 | `"Silicone gasket cord 2mm 5 meter"` | **$8** | Seal compartment seams on MTV body |
| E4 | IP67 vent plugs (M12 thread) | 2 | `"IP67 vent plug M12 waterproof"` or `"Gore vent M12"` | $3/ea = **$6** | Pressure equalization without water ingress. One per robot electronics compartment. |
| E5 | Closed-cell foam tape (weatherstripping, 3mm × 10mm) | 1 roll | `"Closed cell foam tape 3mm weatherstrip"` | **$5** | Seal battery door and access panels |
| E6 | Marine-grade silicone grease | 1 tube | `"Marine grade silicone grease waterproof"` | **$8** | Apply to motor shaft output areas. JGB37-520 motors are NOT waterproof — the enclosure protects them, grease seals the shaft entry. |
| E7 | Permatex silicone RTV gasket maker (clear) | 1 tube | `"Permatex clear RTV silicone gasket maker"` | **$6** | Seal 3D printed motor enclosure seams |

**Subtotal E: ~$54**

---

## Section F: Tools & Soldering Kit

> One-time investment. These tools serve all current and future builds.

### F1 — Soldering

| # | Item | Qty | Search Term | Est. Cost | Notes |
|---|------|-----|-------------|-----------|-------|
| F1.1 | **PINECIL V2 soldering iron** | 1 | `"PINECIL V2 soldering iron"` — Pine64.com ($26) or Amazon | **$26** | Open-source, RISC-V powered, heats in 6 seconds. USB-C PD or barrel jack power. IronOS firmware (community-maintained). Best value portable iron. |
| F1.2 | PINECIL tips set (TS-B2 conical + TS-D24 chisel min) | 1 set | `"PINECIL TS100 compatible tip set"` or buy individually from Pine64 | **$10** | B2 (conical) = precision work. D24 (chisel) = general soldering + drag soldering. |
| F1.3 | USB-C PD power supply 65W+ | 1 | `"USB-C PD 65W charger GaN"` | **$18** | Powers PINECIL at full 65W for fast heating. Also charges phones/laptop. GaN = compact. |
| F1.4 | Solder 63/37 rosin core 0.8mm (leaded) | 1 roll | `"63/37 rosin core solder 0.8mm 100g"` | **$9** | 63/37 tin/lead — lower melting point, better flow than lead-free. 0.8mm good for PCB work. |
| F1.5 | Flux pen (rosin, no-clean) | 1 | `"Rosin flux pen no-clean"` — Kester 186 or MG Chemicals | **$6** | Essential for clean solder joints. No-clean = no residue washing needed. |
| F1.6 | Brass tip cleaner | 1 | `"Soldering iron brass tip cleaner"` | **$5** | Gentler on tips than wet sponge |
| F1.7 | Solder wick (2.5mm) + desoldering pump | 1 each | `"Solder wick desoldering pump combo"` | **$6** | For fixing mistakes |
| F1.8 | Helping hands with magnifier | 1 | `"Helping hands soldering stand magnifier"` | **$12** | Holds small PCBs while soldering |
| F1.9 | Silicone soldering mat | 1 | `"Silicone soldering mat heat resistant"` | **$10** | Protects desk, heat resistant, magnetic sections |

### F2 — General Tools

| # | Item | Qty | Search Term | Est. Cost | Notes |
|---|------|-----|-------------|-----------|-------|
| F2.1 | **Digital multimeter** (Kaiweets HT118A or AstroAI AM33D) | 1 | `"Kaiweets HT118A digital multimeter"` or `"AstroAI AM33D multimeter"` | **$20** | Measure voltage, continuity, resistance. Essential for checking battery voltage, LM2596 output, diagnosing wiring. |
| F2.2 | Wire strippers (self-adjusting, AWG 10–24) | 1 | `"Self adjusting wire stripper AWG 10-24"` | **$10** | Strip silicone wire without nicking conductors |
| F2.3 | Flush cutters | 1 | `"Flush cutter electronics"` | **$6** | Trim leads, cut zip ties |
| F2.4 | Precision screwdriver set (hex, Phillips, flat) | 1 | `"Precision screwdriver set iFixit"` or `"Wowstick electric screwdriver"` | **$10** | M2/M3 hex keys essential. iFixit Mahi is excellent. |
| F2.5 | Hex key set (metric, 1.5–6mm) | 1 | `"Hex key set metric ball end"` | **$6** | For M3, M4 hex socket bolts |
| F2.6 | Hot glue gun + sticks (mini) | 1 | `"Mini hot glue gun"` | **$8** | Temporary fixes, strain relief, sensor mounting |
| F2.7 | Heat shrink tubing assortment | 1 kit | `"Heat shrink tubing assortment kit"` | **$7** | Insulate solder joints. Use with lighter or heat gun. |
| F2.8 | Electrical tape | 2 rolls | `"3M Electrical tape super 33+"` | **$4** | |
| F2.9 | Zip ties assortment (various sizes) | 1 pack | `"Zip tie assortment pack black"` | **$5** | Cable management, temporary mounting |
| F2.10 | Needle-nose pliers | 1 | `"Needle nose pliers electronics"` | **$5** | |
| F2.11 | Tweezers set (ESD-safe) | 1 set | `"ESD anti-static tweezers set"` | **$6** | For placing small components |

**Subtotal F: ~$187**

---

## Section G: Hub / Base Station

| # | Item | Qty | Search Term | Est. Cost | Notes |
|---|------|-----|-------------|-----------|-------|
| G1 | **Raspberry Pi 4 Model B (4GB)** | 1 | `"Raspberry Pi 4 4GB"` | **$55** | Central hub running MQTT broker (Mosquitto), MAVLink router, video relay, alert management. OR use spare laptop (saves $75 total). |
| G2 | MicroSD 64GB (A2, for Pi hub) | 1 | `"MicroSD 64GB A2 class 10"` | **$10** | |
| G3 | Raspberry Pi 4 power supply (USB-C 5V 3A) | 1 | `"Raspberry Pi 4 official power supply USB-C"` | **$8** | |
| G4 | Raspberry Pi 4 case with fan | 1 | `"Raspberry Pi 4 case fan aluminum"` | **$10** | Passive + active cooling for 24/7 operation |

> **Alternative:** Use a spare laptop as the hub. Saves ~$83 and gives you more processing power, display, keyboard.

**Subtotal G: ~$83 (Pi) / $0 (laptop)**

---

## Section H: Consumables & Shared Hardware

### H1 — Wire & Connectors

| # | Item | Qty | Search Term | Est. Cost | Notes |
|---|------|-----|-------------|-----------|-------|
| H1.1 | **Silicone wire kit** (14, 16, 18, 20, 22 AWG) | 1 kit | `"Silicone wire kit 14 16 18 20 22 AWG"` | **$14** | 14 AWG for battery/motor power. 22 AWG for signals. Silicone is flexible + heat resistant. |
| H1.2 | Dupont jumper wires (M-M, M-F, F-F kit) | 1 kit | `"Dupont jumper wire kit 120pcs"` | **$6** | For breadboard prototyping and signal connections |
| H1.3 | JST-XH connector kit (2/3/4/5/6 pin) | 1 kit | `"JST-XH connector kit assortment with crimps"` | **$10** | For LiPo balance leads, sensor connections |
| H1.4 | Breadboard (half-size, 400 points) | 2 | `"Half size breadboard 400 point"` | **$4** | Prototyping |
| H1.5 | XT30 connectors (5 pairs) | 1 pack | `"XT30 connector pair 5 pack"` | **$5** | Smaller power connectors for accessories |

**Subtotal H: ~$39**

---

## Grand Total Summary

### By Section

| Section | Description | Budget | Recommended |
|---------|-------------|--------|-------------|
| **A** | Ground Robot (OpenBot MTV) | $448 | $566 |
| **B** | Air Drone (ArduPilot F450) | $462 | $462 |
| **C** | Secure Comms Hardware | $90 | $90 |
| **D** | Wireless Charging System | — | $102 (Phase 2) |
| **E** | Weatherproofing | $54 | $54 |
| **F** | Tools & Soldering Kit | $187 | $187 |
| **G** | Hub / Base Station | $0 (laptop) | $83 (Pi 4) |
| **H** | Consumables & Shared | $39 | $39 |
| | | | |
| | **Phase 1 Total** | **$1,280** | **$1,481** |
| | **+ Phase 2 (Charging + AP)** | +$102 | +$202 |
| | **Grand Total (All Phases)** | **$1,382** | **$1,683** |

### By Priority

| Priority | Items | Cost |
|----------|-------|------|
| 🔴 **Must Have (Phase 1 Core)** | Robot + Drone + Tools + Comms | ~$1,280–1,481 |
| 🟡 **Phase 2 (Autonomous Ops)** | Wireless charging + outdoor AP | ~$102–202 |
| 🟢 **Phase 3 (Upgrades)** | Thermal camera, LiDAR, dedicated phone | ~$150–400 |

### What You Already Own (Savings)

| Item | Est. Value | Status |
|------|-----------|--------|
| Pixel 9 Pro (robot brain + dev/testing) | ~$1,000 | ✅ Owned |
| 3D printer access (neighbor) | ~$300+ | ✅ Available |
| Home WiFi (initial hub networking) | — | ✅ Available |
| Laptop (potential hub) | ~$500+ | ✅ If available |

---

## Order Priority Schedule

### 🔴 Week 1 — Order Immediately (Long Lead Time + Get Started)

**Priority: Start learning to solder + start 3D printing body + order long-shipping items**

| Order | Items | Source | Est. Cost | Why First |
|-------|-------|--------|-----------|-----------|
| 1 | PINECIL V2 + tips + 65W USB-C charger + solder + flux + brass cleaner + desoldering kit | Pine64 + Amazon | ~$80 | Learn to solder ASAP — every connection in both builds needs soldering |
| 2 | ASA filament (3 spools black + 1 orange) | Amazon | ~$112 | Start printing MTV body — takes 80–120 hours total |
| 3 | Multimeter + wire strippers + flush cutters + tweezers | Amazon | ~$42 | Basic measurement tools needed from day 1 |
| 4 | ESP32 DevKitC (3-pack) + Dupont jumpers + breadboard | Amazon | ~$30 | Start firmware testing and learning while body prints |
| 5 | Holybro Pixhawk 6C Mini (with PM02 set) + Holybro M10 GPS | Holybro.com or Amazon | ~$160 | Longest lead time for quality components; start reading ArduPilot docs |
| 6 | RadioMaster Pocket ELRS + RP1 receiver | RadioMaster.com or GetFPV | ~$74 | Need for first drone test flight |

**Week 1 Subtotal: ~$498**

---

### 🟡 Week 2 — Once Printing & Soldering Practice Underway

**Priority: All components to start building both robots**

| Order | Items | Source | Est. Cost | Why |
|-------|-------|--------|-----------|-----|
| 7 | JGB37-520 motors × 6 (178RPM) + Talon Tires × 3 pair | AliExpress (motors) + RobotShop (tires) | ~$135–165 | AliExpress motors ship 2–4 weeks |
| 8 | Cytron MDD30A × 2 (or BTS7960 × 2 for budget) | Cytron.io or Amazon | ~$68 ($20) | Motor drivers for MTV |
| 9 | 2212 920KV motors × 4 + 30A ESCs × 4 + 1045 props | Amazon (combo kits available) | ~$66 | Drone motor/ESC/prop kit |
| 10 | 3S LiPo 5200mAh + 4S LiPo 3300mAh × 2 + charger + LiPo bags | Amazon | ~$135 | Batteries + charger for both builds |
| 11 | Raspberry Pi Zero 2W + Pi Camera 3 Wide + cable + SD card | Amazon / Pi authorized dealer | ~$57 | Drone companion computer |
| 12 | F450 frame + landing gear | Amazon | ~$24 | Drone frame |

**Week 2 Subtotal: ~$485–517**

---

### 🟢 Week 3 — Assembly Phase

**Priority: Fill remaining hardware gaps + secure comms**

| Order | Items | Source | Est. Cost | Why |
|-------|-------|--------|-----------|-----|
| 13 | Heltec LoRa 32 V3 × 3 + ATECC608A × 3 + antennas | Amazon / AliExpress / Adafruit | ~$90 | Secure comms hardware |
| 14 | Hardware kit (screws, standoffs, bearings, rods, cable glands) | Amazon | ~$46 | Assembly hardware |
| 15 | Silicone wire kit + connectors + XT60 + heat shrink | Amazon | ~$39 | Wiring supplies |
| 16 | Sensors (HC-SR04 × 4, resistors) + LEDs + speaker + switch | Amazon | ~$25 | Ground robot sensors |
| 17 | Drone lights (nav + strobe) + battery straps | Amazon | ~$20 | Drone accessories |
| 18 | Helping hands + silicone mat + hot glue gun | Amazon | ~$30 | Assembly aids |

**Week 3 Subtotal: ~$250**

---

### 🔵 Week 4+ — Weatherproofing & Testing

| Order | Items | Source | Est. Cost | Why |
|-------|-------|--------|-----------|-----|
| 19 | MG 419D conformal coat + Kapton tape | Amazon | ~$21 | Coat all boards before final assembly |
| 20 | Weatherproofing (gaskets, vent plugs, foam tape, silicone grease, RTV) | Amazon | ~$33 | Final weathersealing |
| 21 | Hub: Raspberry Pi 4 + case + PSU + SD card (or use laptop) | Amazon | ~$83 ($0) | Set up central hub for comms |

**Week 4+ Subtotal: ~$54–137**

---

### ⬜ Phase 2 — Autonomous Charging (Month 2+)

| Order | Items | Source | Est. Cost |
|-------|-------|--------|-----------|
| 22 | 12V 5A wireless charging TX/RX + PSU + charger module + alignment hardware | AliExpress + Amazon | ~$63 |
| 23 | Drone pogo-pin charging setup | Amazon | ~$39 |
| 24 | Outdoor WiFi 6 AP (dedicated robot network) | Amazon | ~$100 |

**Phase 2 Subtotal: ~$202**

---

### ⬜ Phase 3 — Upgrades (Month 3+)

| Item | Est. Cost | Notes |
|------|-----------|-------|
| Infiray Tiny1-B thermal camera (256×192) | ~$150–200 | Person detection day/night |
| RPLiDAR A1M8 (or LD19 budget) | ~$99 ($25) | Indoor SLAM mapping |
| Dedicated cheap Android phone for outdoor robot | ~$80–150 | Protect Pixel 9 Pro |
| IR illuminator board (850nm) for night vision | ~$10 | Enable phone camera night vision |

---

## Quick Reference: Key Search Terms

| Component | Exact Search Term for Amazon |
|-----------|----------------------------|
| ESP32 | `"ESP32 WROOM-32 DevKitC development board 38 pin"` |
| Motor | `"JGB37-520 12V 178RPM encoder DC gear motor"` |
| Motor driver | `"Cytron MDD30A 30A motor driver"` |
| Wheels | `"Lynxmotion 2.8 talon tire"` (RobotShop) |
| Pixhawk | `"Holybro Pixhawk 6C Mini flight controller"` |
| GPS | `"Holybro M10 GPS compass"` |
| RC TX | `"RadioMaster Pocket ELRS transmitter"` |
| RC RX | `"RadioMaster RP1 ELRS 2.4GHz receiver"` |
| Drone motors | `"2212 920KV brushless motor 4pcs"` |
| ESCs | `"30A ESC BLHeli_S 4pcs"` |
| Battery 3S | `"3S LiPo 11.1V 5200mAh 50C XT60"` |
| Battery 4S | `"4S LiPo 14.8V 3300mAh 50C XT60"` |
| LoRa board | `"Heltec WiFi LoRa 32 V3 SX1262"` |
| Secure element | `"ATECC608A breakout board"` |
| Soldering iron | `"PINECIL V2 soldering iron"` |
| Charger | `"ToolkitRC M6 LiPo charger"` |
| Conformal coat | `"MG Chemicals 419D conformal coating spray"` |
| ASA filament | `"eSUN ASA filament 1.75mm 1kg"` |

---

## Compatibility Notes & Gotchas

### ⚠️ Critical Compatibility Warnings

1. **JGB37-520 RPM variant:** MUST be 178RPM. There are 30, 50, 107, 150, 178, 200, 330, 520 RPM variants. Wrong RPM = wrong gear ratio = wrong torque. Verify listing.

2. **ESP32 board package version:** Use **v2.0.17** in Arduino IDE. Version 3.x.x is NOT compatible with OpenBot firmware. Select "ESP32 Dev Module" as board.

3. **Pixhawk 6C Mini firmware:** Use `"Pixhawk6C"` build from firmware.ardupilot.org. NOT "Pixhawk1" or generic.

4. **ELRS receiver wiring:** CRSF protocol needs full UART (TX + RX). On Pixhawk 6C Mini, use SERIAL2 (TELEM2). Set: `SERIAL2_PROTOCOL=23, SERIAL2_BAUD=115`.

5. **Pi Zero 2W camera cable:** Uses 22-pin connector (different from standard 15-pin Pi camera cable). Buy the specific Pi Zero ribbon cable.

6. **4S LiPo + 2212 920KV:** This combo draws up to 16A per motor at full throttle. 30A ESCs have good headroom, but NEVER use 20A ESCs with 4S.

7. **Conformal coating masking:** Mask ALL connectors, USB ports, programming headers, potentiometers, and buttons with Kapton tape before spraying. Spray in well-ventilated area.

8. **ASA printing:** REQUIRES enclosed printer. If neighbor's printer has no enclosure, fall back to PETG + 2–3 coats Rust-Oleum UV clear spray.

9. **XT60 polarity:** Red = positive, black = negative. ALWAYS verify polarity with multimeter before connecting LiPo. Reversed polarity on LiPo = fire risk.

10. **ArduPilot serial port allocation (Pixhawk 6C Mini):**
    ```
    SERIAL1 (TELEM1) → Pi Zero 2W companion computer (MAVLink2 @ 921600)
    SERIAL2 (TELEM2) → ELRS RP1 receiver (CRSF RC input)
    SERIAL3 (GPS1)   → Holybro M10 GPS
    SERIAL4 (GPS2)   → Free (future: telemetry radio or second GPS)
    ```

---

*Last updated: 2026-02-01 — Prices are estimates based on typical US retail (Amazon/manufacturer direct). Verify at time of purchase. Electronics pricing fluctuates.*
