# Research: Obstacle Avoidance Systems in Robot Vacuums
**Queued:** 2026-02-01 | **Status:** Initial Brief (Deep Dive Pending)

---

## Why Low-End Models Perform Poorly

### 1. Sensor Hardware Gap
| Tier | Sensor Suite | Approx. Cost | Performance |
|------|-------------|--------------|-------------|
| **Budget** ($100-200) | Bump sensors + basic IR cliff sensors | $2-5 | Reactive only — hits obstacles then redirects |
| **Mid-range** ($300-500) | IR/ToF proximity + gyroscope + accelerometer | $15-30 | Detects obstacles ~5-15cm away, no mapping |
| **Premium** ($600-1200) | LiDAR + camera (RGB/structured light) + ToF + IMU | $50-120 | Full SLAM mapping, 3D obstacle classification |

**Key finding:** Budget models use **bump-and-redirect** (physically hitting objects) because single IR emitters can't reliably detect thin/dark/transparent obstacles. The sensor itself costs <$1.

### 2. Navigation Algorithm Limitations
- **Random bounce** (budget): No SLAM, no path planning. The robot literally bounces off walls in pseudo-random patterns. Coverage is probabilistic, not deterministic.
- **Gyro-based inertial** (mid): Tracks heading but accumulates drift. No true position awareness.
- **LiDAR SLAM / vSLAM** (premium): Real-time occupancy grid mapping. The robot knows *where it is* and *what's around it*.

### 3. Compute Constraints
Budget models run on bare-metal MCUs (ARM Cortex-M0/M3, ~$1-3) with no capacity for:
- Real-time point cloud processing
- Neural network inference for object classification
- Simultaneous localization and mapping

Premium models use application processors (Cortex-A series, $10-25) or dedicated AI accelerators that can run CNN models to distinguish a shoe from a chair leg from a pet.

### 4. Specific Failure Modes on Low-End
- **Dark furniture legs**: IR reflectivity is too low → no return signal → collision
- **Glass/mirrors**: IR passes through or reflects specularly → invisible obstacle
- **Thin objects** (cables, socks): Below IR beam height or too narrow for detection cone
- **Cliff sensor false positives**: Dark rugs register as cliffs → robot refuses to cross
- **No object persistence**: Forgets obstacles between passes

---

## What "Top Notch" Looks Like for Our Robot

### Recommended Sensor Stack (Prototype → MVP)
1. **Primary:** RPLiDAR A1/A2 (360° 2D LiDAR, $99-$200) — proven, well-documented, ROS-compatible
2. **Secondary:** 2-4x VL53L1X ToF ranging sensors ($3-8 each) — close-range (<4m), handles dark objects
3. **Tertiary:** OV2640/OV5647 camera module ($8-15) — for AI-based object classification
4. **Cliff:** 3-4x IR cliff sensors (Sharp GP2Y0A21) — drop detection
5. **Contact:** Bump sensor array (mechanical microswitches) — last-resort detection
6. **IMU:** MPU6050 or BNO055 ($3-15) — heading, tilt, collision detection

### Software Approach
- **SLAM:** Use ROS 2 + `slam_toolbox` or `cartographer` for mapping
- **Object Detection:** TensorFlow Lite / YOLO on companion SBC (Raspberry Pi 5 / Jetson Nano)
- **Fusion:** Extended Kalman Filter combining LiDAR + ToF + IMU + wheel odometry
- **Path Planning:** A* or D* Lite on occupancy grid

---

## Self-Docking Requirements
- **IR beacon system** (most common): Dock emits modulated IR signals in a fan pattern; robot homes in on signal strength/direction
- **Visual markers**: ArUco/AprilTag fiducial markers on dock, detected by onboard camera
- **Charging contacts**: Spring-loaded pogo pins on robot → metal pads on dock
- **Approach sequence**: Wide search → beacon lock → guided approach → contact verification → charging confirmation

### Our Prototype Should Include:
- IR emitter array on dock (3-beam: left guide, center, right guide)
- IR receiver pair on robot (directional, for triangulation)
- Backup: Camera + ArUco tag for precision alignment
- Pogo pin charging contacts (2-4 pin, 12-24V DC)
- Software state machine: SEARCHING → APPROACHING → ALIGNING → DOCKING → CHARGING

---

## Action Items
- [ ] Deep-dive comparison of RPLiDAR A1 vs A2 vs C1 for our use case
- [ ] Benchmark VL53L1X vs VL53L4CD for close-range detection
- [ ] Evaluate Jetson Nano Orin vs Raspberry Pi 5 for onboard inference
- [ ] Prototype IR beacon dock circuit design
- [ ] Test sensor fusion pipeline in simulation (Gazebo + ROS 2)
