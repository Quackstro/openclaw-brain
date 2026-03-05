# Phase 1 — Parts Shopping List (Phone-Brained Prototype)

**Goal:** 1 ground robot doing autonomous patrol + person detection on Dr. Castro's ½ acre property  
**Brain:** Android smartphone  
**Date:** 2026-02-01

---

## Robot Body — OpenBot MTV (Multi-Terrain Vehicle)

| # | Item | Qty | Source | Est. Cost | Notes |
|---|------|-----|--------|-----------|-------|
| 1 | **3D-printed MTV body parts** | 1 set | Neighbor's 3D printer 🎯 | $10-15 (filament only) | [STL files from OpenBot repo](https://github.com/ob-f/OpenBot/tree/master/body/mtv/cad). ~100hrs print time total. PETG preferred for outdoor durability. |
| 2 | **JGB37-520 DC gear motors (12V, ~200RPM)** | 6 | Amazon / AliExpress | $30-48 | MTV uses 6 motors. Search "JGB37-520 12V 200RPM" |
| 3 | **Wheels (65-80mm rubber)** | 6 | Amazon / AliExpress | $12-18 | Match motor shaft diameter. TT motor wheels work with adapter. |
| 4 | **Arduino Nano** | 1 | Amazon | $5-8 | Clone is fine. Or Arduino Nano Every (~$12) |
| 5 | **L298N dual motor driver** | 3 | Amazon | $6-9 | 1 driver per 2 motors. Or use 3× TB6612FNG for better efficiency. |
| 6 | **Custom PCB or breadboard** | 1 | Amazon | $3-5 | For wiring motor drivers + sensors to Arduino |
| 7 | **Voltage regulator (12V→5V, 3A)** | 1 | Amazon | $3 | Power Arduino + phone charging from main battery |
| 8 | **Phone mount / holder** | 1 | Amazon / 3D print | $3-5 | Spring-clamp style, mount on top of body |

**Subtotal — Body: ~$90-155**

---

## Power System

| # | Item | Qty | Source | Est. Cost | Notes |
|---|------|-----|--------|-----------|-------|
| 9 | **3S LiPo battery (11.1V, 5000mAh)** | 1 | Amazon | $25-35 | Good balance of weight/capacity. ~1-2 hrs patrol time. |
| 10 | **LiPo battery alarm / voltage monitor** | 1 | Amazon | $3 | Beeps when voltage drops too low |
| 11 | **XT60 connectors + wire** | 1 pack | Amazon | $5 | Standard LiPo connector |
| 12 | **LiPo balance charger** | 1 | Amazon | $15-25 | For manual charging during Phase 1. Inductive comes Phase 2. |

**Subtotal — Power: ~$48-68**

---

## Sensors

| # | Item | Qty | Source | Est. Cost | Notes |
|---|------|-----|--------|-----------|-------|
| 13 | **HC-SR04 ultrasonic sensors** | 4 | Amazon | $5 | Front, rear, left, right — obstacle avoidance |
| 14 | **Voltage divider resistors (for battery monitoring)** | 1 set | Amazon | $1 | 100K + 33K to read battery voltage on Arduino analog pin |
| 15 | **LED headlights (white, 12V)** | 2 | Amazon | $4 | Front-facing for night visibility + deterrent |
| 16 | **LED taillights / indicators (red)** | 2 | Amazon | $3 | Status indicators |

**Subtotal — Sensors: ~$13**

---

## Phone (Brain)

| # | Item | Qty | Source | Est. Cost | Notes |
|---|------|-----|--------|-----------|-------|
| 17 | **Android phone** | 1 | Pixel 9 Pro (owned) for dev/testing. Buy refurb Pixel 6a (~$80) for dedicated outdoor robot. | $0-80 | Pixel 9 Pro: Tensor G4, 50MP, night sight — perfect for dev. Don't risk it outdoors long-term. |
| 18 | **USB OTG cable (USB-C to Micro-B)** | 1 | Amazon | $5 | Connects phone to Arduino Nano |

**Subtotal — Phone: ~$5-155** (depending on spare phone availability)

---

## Software (Free / Open Source)

| Item | Source | Cost |
|------|--------|------|
| OpenBot Android App | [GitHub](https://github.com/ob-f/OpenBot) / Play Store | Free |
| OpenBot Controller App | Same repo | Free |
| Arduino IDE + OpenBot firmware | Same repo | Free |
| YOLOv8-nano (person detection) | Ultralytics | Free |
| MQTT broker (Mosquitto) | mosquitto.org | Free |
| Python + OpenCV | pip | Free |

---

## Tools & Soldering Kit (Need to Purchase)

| # | Item | Qty | Source | Est. Cost | Notes |
|---|------|-----|--------|-----------|-------|
| T1 | **Soldering station (adjustable temp)** | 1 | Amazon | $25-40 | PINECIL V2 (~$26, USB-C powered, open source firmware!) or Hakko FX888D (~$100 if you want pro-grade). PINECIL is the move for open-source vibes. |
| T2 | **Solder (60/40 or 63/37 rosin core, 0.8mm)** | 1 roll | Amazon | $8-12 | Leaded is easier to work with. 63/37 is slightly better flow. |
| T3 | **Soldering tip cleaner (brass wool)** | 1 | Amazon | $5 | Way better than a wet sponge |
| T4 | **Helping hands / PCB holder** | 1 | Amazon | $10-15 | Third hand with magnifying glass. Makes soldering 10x easier. |
| T5 | **Wire strippers (AWG 10-22)** | 1 | Amazon | $8-12 | Self-adjusting type recommended |
| T6 | **Heat shrink tubing assortment** | 1 kit | Amazon | $6-8 | Various sizes, weatherproof your connections |
| T7 | **Multimeter (digital)** | 1 | Amazon | $15-25 | For voltage/continuity testing. AstroAI or Kaiweets are solid budget options. |
| T8 | **Flush cutters** | 1 | Amazon | $5-7 | Trim leads, cut wire |
| T9 | **Screwdriver set (precision, M2/M3 hex)** | 1 | Amazon | $8-12 | For robot assembly |
| T10 | **Hot glue gun + sticks** | 1 | Amazon | $8-10 | Securing components in place |
| T11 | **Silicone soldering mat** | 1 | Amazon | $8-12 | Protects table, heat resistant, magnetic parts tray |
| T12 | **Dupont jumper wires (M-M, M-F, F-F)** | 1 kit | Amazon | $6 | For prototyping before soldering permanent connections |
| T13 | **Solder wick / desoldering pump** | 1 | Amazon | $5 | For fixing mistakes |
| T14 | **Flux pen (rosin)** | 1 | Amazon | $5-8 | Makes solder flow better on stubborn joints |
| | **Subtotal — Tools** | | | **$115-175** | One-time investment, useful for all future phases |

### 3D Printer Access
- ✅ Neighbor has 3D printer — print MTV body for filament cost (~$10-15 PETG)

### Recommended Amazon Kit Bundles (Save vs. Individual)
Several "soldering kit" bundles on Amazon include iron + solder + tips + stand + helping hands + wick for $30-50. Search:
- "PINECIL V2 soldering iron" (~$26) + buy consumables separately
- OR "Soldering station kit complete" (~$35-50 for bundled set)

**Budget option: ~$75-90 for a complete bundled kit + multimeter + extras**  
**Nice option: ~$115-175 buying quality individual items**

---

## Summary

| Category | Low Est. | High Est. |
|----------|----------|-----------|
| Robot Body | $70 | $115 |
| Power System | $48 | $68 |
| Sensors | $13 | $13 |
| Phone | $0 | $80 |
| **TOTAL** | **$131** | **$276** |

**Using Pixel 9 Pro for testing (no phone purchase): ~$131-196**  
**Adding a dedicated outdoor phone (refurb Pixel 6a): ~$211-276**  
**Tools & soldering kit: ~$75-175 (one-time)**

### Grand Total to Get Started
| Scenario | Cost |
|----------|------|
| Robot + budget tool kit + Pixel 9 Pro | **~$206-285** |
| Robot + nice tools + dedicated phone | **~$325-450** |

---

## Quick Questions Before Ordering

1. **Do you have a spare Android phone?** (Android 8+, working camera, USB-C preferred)
2. **Do you have access to a 3D printer?** Or should we use a print service / buy RTR body instead?
3. **Do you have basic electronics tools?** (soldering iron, multimeter, etc.)

If no 3D printer, alternatives:
- **OpenBot RTR (Ready-to-Run)** on Amazon: ~$80-100 (smaller than MTV, but faster to start)
- **RC Truck body option:** Buy a 1:16 RC truck (~$25) + 3D print the OpenBot adapter
- **Print service:** Upload STLs to JLC3DP or Craftcloud, ~$40-80 shipped

---

## Order Priority (What to Get First)

**Week 1 — Get rolling:**
1. Arduino Nano + motor drivers + wiring supplies
2. Phone (confirm spare or order refurb)
3. Start 3D printing body (or order from service)
4. Flash OpenBot firmware, install Android app

**Week 2 — Assemble + test:**
5. Motors + wheels + battery
6. Assemble body, wire everything
7. Basic driving test (manual control via controller app)

**Week 3-4 — Intelligence:**
8. Ultrasonic sensors + LEDs
9. Get autonomous navigation working
10. Add YOLOv8 person detection
11. Set up MQTT + basic alert pipeline
12. First autonomous patrol test on property
