# Executive Summary: Project Sentinel — Quackstro Autonomous Robot
**Date:** February 1, 2026 | **Author:** Jarvis (AI Assistant) | **Prepared for:** Dr. Jose Castro, CEO — Quackstro LLC

---

## Vision
**Project Sentinel** — Build an autonomous robot prototype with **top-tier obstacle avoidance** and **self-docking capability**, positioning Quackstro LLC to expand from app development into robotics/security hardware.

---

## Key Decisions & Findings

### 1. Obstacle Avoidance — Why Ours Must Be Best-in-Class
Low-end robot vacuums fail at obstacle avoidance due to a **cost-driven sensor deficit**: $1-5 IR bump sensors vs. $50-120 LiDAR + camera + ToF stacks on premium units. Budget models use reactive "bump-and-redirect" navigation with no environmental mapping, leading to:
- Collisions with dark/thin/transparent objects
- No persistent spatial awareness
- Random coverage patterns instead of systematic cleaning

**Our approach:** Multi-sensor fusion combining **360° LiDAR** (RPLiDAR A1, $99), **ToF proximity sensors** (4x VL53L1X), **camera-based object classification**, and **IMU** — running SLAM algorithms on a Raspberry Pi 5. This puts us at feature parity with $800+ commercial robots at prototype cost.

### 2. Self-Docking System
Autonomous docking requires a **guided approach system**:
- **IR beacon** on dock (3-beam directional emitter) + IR receivers on robot for homing
- **Camera + ArUco markers** for precision alignment (backup/verification)
- **Pogo pin charging contacts** for reliable power transfer
- **State machine**: Search → Beacon Lock → Approach → Align → Dock → Charge

This is well-understood engineering with commodity components. No novel R&D required — just solid integration.

### 3. Rust for MVP (Post-Prototype Pivot)
After validating hardware and algorithms in Python/ROS 2 during prototyping, the **production MVP should be rewritten in Rust**:
- **Memory safety without garbage collection** — eliminates an entire class of runtime crashes
- **Real-time performance** on par with C/C++ — critical for sensor fusion loops
- **Growing robotics ecosystem** — `rplidar-rs`, `embassy`, `rclrs` (ROS 2 bindings), `nalgebra`
- **Cross-compilation** to ARM (Pi) and MCU (motor controllers) from one toolchain

**Strategy:** Python prototype → Rust MVP → Rust production. This de-risks hardware validation while setting up a high-quality production codebase.

### 4. Hardware Platform
- **Chassis:** 4WD acrylic smart car kit (~$30) — upgradeable to tracked platform
- **Brain:** Raspberry Pi 5 (8GB) + Arduino Mega (motor I/O)
- **Sensors:** RPLiDAR A1, VL53L1X (4x), IMU, cliff sensors, bump switches, camera
- **Power:** 4S 18650 Li-ion pack with BMS

**Total prototype budget: $406 – $560** (all Amazon-sourced)

---

## Timeline Estimate

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| **1. Parts Procurement** | 1-2 weeks | All hardware in hand |
| **2. Chassis Assembly + Basic Motion** | 1-2 weeks | Driving, turning, speed control |
| **3. Sensor Integration + SLAM** | 2-4 weeks | Mapping, obstacle detection |
| **4. Self-Docking** | 1-2 weeks | Autonomous return-to-dock |
| **5. AI Object Classification** | 2-3 weeks | Camera-based obstacle ID |
| **6. Prototype Complete** | — | Full demo unit |
| **7. Rust MVP Rewrite** | 4-8 weeks | Production-quality codebase |

**Total to prototype: ~8-13 weeks** | **Total to MVP: ~12-21 weeks**

---

## Strategic Notes
- **Neighbor's 3D printer** → Custom mounting brackets, sensor housings, dock enclosure (huge cost savings vs. machining)
- **Security pivot potential** → The same sensor stack (LiDAR + camera + self-docking) maps directly to autonomous security patrol robots
- **Pixel 9 Pro** noted as not daily driver — available as a development/testing device for robot camera feed monitoring or remote control interface

---

## Research Queued
1. ✅ **Obstacle Avoidance Deep Dive** → `projects/robotics/RESEARCH-obstacle-avoidance.md`
2. ✅ **Rust for MVP Analysis** → `projects/robotics/RESEARCH-rust-for-mvp.md`
3. ✅ **Parts List with Amazon Links** → `projects/robotics/PARTS-LIST.md`

---

## Next Steps
1. Review parts list and approve budget (~$500)
2. Create Amazon shopping list and order
3. Set up ROS 2 development environment on Pi 5
4. Begin chassis assembly upon delivery
5. Establish project repo (`sentinel`)

---

*Prepared by Jarvis 🤖 | Quackstro LLC — Project Sentinel*
