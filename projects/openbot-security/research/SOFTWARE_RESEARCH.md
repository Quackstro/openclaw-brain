# Autonomous Security Patrol Robot — Software Stack Research

> **Project**: Hybrid Air/Ground Security Patrol System  
> **Architecture**: OpenBot (smartphone-brained ground robots) + ArduPilot drones  
> **Target Property**: ½ acre residential/commercial property  
> **Date**: 2026-02-01  

---

## Table of Contents

1. [OpenBot Software Stack](#1-openbot-software-stack)
2. [ArduPilot / DroneKit](#2-ardupilot--dronekit)
3. [Computer Vision / AI](#3-computer-vision--ai)
4. [Communication Stack](#4-communication-stack)
5. [Dashboard / Fleet Management](#5-dashboard--fleet-management)
6. [ROS2 Integration](#6-ros2-integration)
7. [Home Assistant Integration](#7-home-assistant-integration)
8. [Ollama / Local LLMs](#8-ollama--local-llms)
9. [Recommended Architecture Summary](#9-recommended-architecture-summary)
10. [Bill of Software](#10-bill-of-software)

---

## 1. OpenBot Software Stack

**Repository**: [github.com/ob-f/OpenBot](https://github.com/ob-f/OpenBot) (MIT License)  
**Paper**: Mueller & Koltun, "OpenBot: Turning Smartphones into Robots" (ICRA 2021)

### 1.1 Overview

OpenBot leverages Android smartphones as the "brain" for ~$50 robot bodies. The phone provides camera, IMU, GPS, compute (via GPU/NNAPI), and connectivity. An Arduino/ESP32 microcontroller handles low-level motor control, sensor reading, and LED management.

### 1.2 Android App Capabilities

The OpenBot Robot App provides these built-in screens/modes:

| Mode | Description | Security Patrol Relevance |
|------|-------------|--------------------------|
| **Free Roam** | Manual joystick control with real-time battery, speed, sonar display | Remote manual override during incidents |
| **Data Collection** | Record camera + sensor data for ML training | Collecting patrol route training data |
| **Autopilot** | Run trained TFLite driving policy models | **Core patrol navigation** — autonomous route following |
| **Object Tracking** | 80-class COCO object detection + follow mode | **Core detection** — person/vehicle/animal tracking |
| **Point Goal Navigation** | ARCore-based navigate-to-coordinate with obstacle avoidance | Navigate to specific alert locations |
| **Controller Mapping** | BT gamepad configuration | Emergency manual control |
| **Robot Info** | Diagnostics, sensor status, motor testing | Health monitoring |

**Video Streaming Options**:
- **WebRTC** — Low-latency live streaming (recommended for dashboard)
- **RTSP** — Standard IP camera protocol (for Frigate NVR integration)

**Connectivity**:
- USB serial to Arduino/ESP32
- Bluetooth Low Energy (BLE) for wireless MCU connection
- WiFi for streaming and telemetry

### 1.3 Arduino/ESP32 Firmware

The firmware (`openbot.ino`) handles:

- **Motor Control**: PWM signals via L298N or custom PCB motor drivers. Commands: `c<left>,<right>` with values [-255, 255]
- **Wheel Odometry**: Optical encoder interrupt counting (configurable `DISK_HOLES`, typically 20 per revolution)
- **Battery Monitoring**: Voltage divider with moving average filter. Configurable `VOLTAGE_MIN`, `VOLTAGE_LOW`, `VOLTAGE_MAX`
- **Ultrasonic Sonar**: Distance measurement with optional median filter
- **Bumper Sensors**: Collision detection (left-front, right-front, center-front, left-back, right-back)
- **LED Control**: Front/back brightness LEDs + status LEDs (blue, green, yellow) + indicator blinkers
- **Heartbeat Watchdog**: Configurable timeout — stops robot if no commands received
- **OLED Display**: Optional status display on the robot body

**Supported MCU Boards**:
- Arduino Nano (ATmega328P) — USB serial only
- ESP32 Dev Kit — USB + **Bluetooth** support (recommended for security patrol)

**Robot Body Configurations**: `DIY`, `PCB_V1`, `PCB_V2`, `RTR_TT`, `RC_CAR`, `LITE`, `RTR_520`, `MTV`, `DIY_ESP32`

### 1.4 ML Policy Training

OpenBot provides a complete training pipeline:

- **Data Collection**: Drive the robot manually via gamepad; the app records camera frames + control inputs as zip files
- **Training Environment**: Conda + TensorFlow 2.9, with GPU support (CUDA/Metal)
- **Model Architectures**:
  - `cil_mobile` — Small, fast CIL (Conditional Imitation Learning) network (default)
  - `cil_mobile_fast` — Optimized variant
  - `cil` — Standard CIL
  - `pilot_net` — Larger NVIDIA PilotNet-style network (better accuracy, still real-time on most phones)
- **Training Hyperparameters**: Batch size, learning rate, epochs, batch norm, flip/command augmentation
- **Output**: `autopilot_float.tflite` — deployable to the Android app
- **Web App**: Built-in React web app for data upload, dataset management, training, and model download (`python -m openbot.server`)
- **Data Format**: TFRecord conversion for fast training, or direct file-based training

### 1.5 What Works Out of the Box vs. Custom for Security Patrol

| Feature | Out of Box | Custom Needed |
|---------|:----------:|:-------------:|
| Manual remote control | ✅ | — |
| Autonomous route following (trained) | ✅ | Train on your property's patrol routes |
| Object detection (80 COCO classes) | ✅ | — |
| Person following / tracking | ✅ | — |
| Point-to-point navigation | ✅ | — |
| Video streaming (WebRTC/RTSP) | ✅ | — |
| Battery monitoring | ✅ | — |
| Obstacle avoidance (sonar) | ✅ | — |
| **Patrol scheduling/looping** | ❌ | Need custom scheduler service |
| **MQTT telemetry publishing** | ❌ | Add MQTT client to Android app |
| **Alert generation on detection** | ❌ | Add detection → alert pipeline |
| **Night vision / IR illumination** | ❌ | Hardware + firmware LED control |
| **Two-way audio** | ❌ | Add speaker/mic integration |
| **Drone launch trigger** | ❌ | MQTT → ArduPilot bridge |
| **Custom security ML model** | ❌ | Train YOLOv8-nano for security classes |
| **GPS waypoint patrol** | ❌ | Extend Point Goal Nav with GPS waypoints |
| **Weatherproofing** | ❌ | Custom enclosure |

### 1.6 Recommended Customizations

1. **Fork the Android app** to add:
   - MQTT client (Eclipse Paho Android) for publishing telemetry + detection events
   - Patrol route manager with GPS waypoint sequences
   - Custom YOLO model loader (TFLite) replacing default detector
   - Alert trigger logic: person detected in restricted zone → publish MQTT alert
   - Background service for continuous patrol (prevent Android sleep)

2. **Modify firmware** to add:
   - IR LED flood light control for night patrols
   - Status LED patterns for "patrolling" / "alert" / "returning to base"
   - Enhanced heartbeat with patrol state reporting

---

## 2. ArduPilot / DroneKit

### 2.1 Overview

ArduPilot is the leading open-source autopilot suite supporting copters, planes, rovers, and submarines. For our drone component, we use ArduPilot Copter on a flight controller (e.g., Pixhawk 6C) with a Raspberry Pi companion computer for high-level logic.

### 2.2 Autonomous Waypoint Missions

ArduPilot natively supports autonomous missions:

- **Mission Planning**: Define waypoint sequences in Mission Planner, QGroundControl, or programmatically via MAVLink
- **MAVLink Commands**: `MAV_CMD_NAV_WAYPOINT`, `MAV_CMD_NAV_TAKEOFF`, `MAV_CMD_NAV_LAND`, `MAV_CMD_NAV_RETURN_TO_LAUNCH`
- **Flight Modes**: AUTO (follow mission), GUIDED (go to single waypoint), LOITER (hold position), RTL (return to launch), LAND
- **Speed Control**: Configurable cruise speed, ascent/descent rates
- **Camera Triggers**: `MAV_CMD_DO_SET_CAM_TRIGG_DIST` for automatic photo capture during patrol

**Security Patrol Mission Example**:
```
TAKEOFF → WP1 (alert location) → LOITER 30s (observe) → WP2 → WP3 → RTL → LAND
```

### 2.3 Precision Landing (for Charging Pad)

ArduPilot's precision landing system is **critical** for autonomous drone-on-charging-pad operations:

**Setup**:
- Set `PLND_ENABLED = 1` to enable
- Set `PLND_TYPE`:
  - `1` = MAVLink LANDING_TARGET (companion computer + camera + AprilTag/ArUco) — **recommended**
  - `2` = IR-LOCK sensor + beacon
- Add a downward-facing camera + rangefinder on the drone
- Place an AprilTag or IR beacon on the charging pad

**How It Works**:
1. Drone enters LAND or RTL mode
2. Below `PLND_ALT_MAX`, the system searches for the landing target
3. Once detected, target position overrides GPS for final approach → centimeter-level accuracy
4. If target lost: configurable retry logic (`PLND_STRICT` = 0/1/2)
5. Below `PLND_ALT_MIN`, vehicle continues vertical descent even if target lost

**Key Parameters**:
| Parameter | Purpose | Recommended Value |
|-----------|---------|-------------------|
| `PLND_ENABLED` | Enable precision landing | 1 |
| `PLND_TYPE` | Position source | 1 (MAVLink/companion computer) |
| `PLND_ALT_MAX` | Max altitude to start searching | 8m |
| `PLND_ALT_MIN` | Min altitude, continue if target lost | 0.5m |
| `PLND_STRICT` | Behavior if target lost: 0=land anyway, 1=retry then land, 2=retry then hover | 1 |
| `PLND_RET_MAX` | Maximum landing retries | 3 |

**Companion Computer Implementation (Raspberry Pi)**:
```python
# Using pymavlink to send LANDING_TARGET messages
# Camera detects AprilTag → calculate angular offset → send to autopilot
from pymavlink import mavutil

master = mavutil.mavlink_connection('/dev/ttyACM0', baud=921600)

# Send landing target message at 30Hz
master.mav.landing_target_send(
    time_usec=0,
    target_num=0,
    frame=mavutil.mavlink.MAV_FRAME_BODY_NED,
    angle_x=angle_x_rad,  # Angular offset X
    angle_y=angle_y_rad,  # Angular offset Y
    distance=distance_m,   # Distance to target
    size_x=0, size_y=0
)
```

### 2.4 Geofencing

ArduPilot supports multiple fence types — essential for keeping drones within property boundaries:

| Fence Type | FENCE_TYPE Bit | Description |
|------------|---------------|-------------|
| Max Altitude | 0 | Global ceiling (e.g., 30m AGL) |
| Cylindrical ("TinCan") | 1 | Circle centered on home with radius + height |
| Polygon Inclusion/Exclusion | 2 | Arbitrary polygonal zones — define property boundary |
| Min Altitude | 3 | Floor altitude (Plane only) |

**Setup for ½ acre property**:
```
FENCE_ENABLE = 1
FENCE_ACTION = 1   (RTL on breach)
FENCE_ALT_MAX = 30  (meters)
FENCE_TYPE = 7      (all fence types)
FENCE_MARGIN = 3    (3m buffer from boundary)
```

Upload polygon fence matching property boundary via Mission Planner or programmatically via MAVLink.

**Breach Behavior**: RTL → SmartRTL → LAND (cascading fallbacks). Backup fences erected 20m beyond each breach. At 100m beyond fence, forced LAND.

### 2.5 Programmatic Drone Launch on Alert

**Architecture**: Ground robot detects intruder → MQTT alert → Companion computer on RPi → arm + takeoff drone

**Option A: pymavlink (recommended — lightweight, direct)**
```python
import paho.mqtt.client as mqtt
from pymavlink import mavutil
import time

# Connect to flight controller
master = mavutil.mavlink_connection('/dev/ttyACM0', baud=921600)
master.wait_heartbeat()

def on_alert(client, userdata, msg):
    alert = json.loads(msg.payload)
    lat, lon = alert['lat'], alert['lon']
    
    # Pre-arm checks
    master.mav.command_long_send(
        master.target_system, master.target_component,
        mavutil.mavlink.MAV_CMD_COMPONENT_ARM_DISARM,
        0, 1, 0, 0, 0, 0, 0, 0)  # ARM
    
    time.sleep(2)
    
    # Takeoff to 15m
    master.mav.command_long_send(
        master.target_system, master.target_component,
        mavutil.mavlink.MAV_CMD_NAV_TAKEOFF,
        0, 0, 0, 0, 0, 0, 0, 15)
    
    time.sleep(10)
    
    # Fly to alert location
    master.mav.set_position_target_global_int_send(
        0, master.target_system, master.target_component,
        mavutil.mavlink.MAV_FRAME_GLOBAL_RELATIVE_ALT_INT,
        0b0000111111111000,
        int(lat * 1e7), int(lon * 1e7), 15,
        0, 0, 0, 0, 0, 0, 0, 0)

# Subscribe to alerts
mqtt_client = mqtt.Client()
mqtt_client.connect("localhost", 1883)
mqtt_client.subscribe("security/alerts/intruder")
mqtt_client.on_message = on_alert
mqtt_client.loop_forever()
```

**Option B: DroneKit-Python (higher-level, but partially deprecated)**
```python
from dronekit import connect, VehicleMode, LocationGlobalRelative

vehicle = connect('/dev/ttyACM0', baud=921600, wait_ready=True)

def launch_to_alert(lat, lon, alt=15):
    vehicle.mode = VehicleMode("GUIDED")
    vehicle.armed = True
    while not vehicle.armed:
        time.sleep(1)
    vehicle.simple_takeoff(alt)
    time.sleep(10)
    target = LocationGlobalRelative(lat, lon, alt)
    vehicle.simple_goto(target, groundspeed=5)
```

**Option C: MAVSDK (modern, async, officially supported)**
```python
from mavsdk import System

drone = System()
await drone.connect(system_address="serial:///dev/ttyACM0:921600")

async def launch_on_alert(lat, lon):
    await drone.action.arm()
    await drone.action.takeoff()
    await asyncio.sleep(10)
    await drone.action.goto_location(lat, lon, 15, 0)
```

**Recommendation**: Use **pymavlink** for maximum control and minimal dependencies, or **MAVSDK** for cleaner async code. DroneKit works but is less actively maintained.

### 2.6 Companion Computer Setup (Raspberry Pi)

ArduPilot officially supports Raspberry Pi as a companion computer:

- **Connection**: Serial (UART) or USB to Pixhawk flight controller
- **Software**: pymavlink, MAVSDK, or MAVProxy
- **Additional Roles**:
  - Run AprilTag detection for precision landing (OpenCV + apriltag library)
  - MQTT client for receiving alerts and publishing drone telemetry
  - Video streaming from drone camera via MediaMTX
  - Run lightweight AI inference if needed

**Wiring**: RPi TX → Pixhawk TELEM2 RX, RPi RX → Pixhawk TELEM2 TX (cross-connect). Set `SERIAL2_BAUD = 921` and `SERIAL2_PROTOCOL = 2` (MAVLink2).

---

## 3. Computer Vision / AI

### 3.1 YOLOv8-nano on Android (TFLite)

**Ultralytics YOLO** is the state-of-the-art object detection framework. As of early 2026, YOLO has evolved through v8 to YOLO26:

| Model | Size (pixels) | mAP50-95 | Params (M) | FLOPs (B) |
|-------|:------------:|:--------:|:----------:|:---------:|
| YOLO26n | 640 | 40.9 | 2.4 | 5.4 |
| YOLO26s | 640 | 48.6 | 9.5 | 20.7 |
| YOLOv8n | 640 | 37.3 | 3.2 | 8.7 |
| YOLOv8s | 640 | 44.9 | 11.2 | 28.6 |

**TFLite Export** for Android deployment:
```python
from ultralytics import YOLO

model = YOLO("yolov8n.pt")  # or yolo26n.pt
model.export(format="tflite", imgsz=320, int8=True)
# Produces yolov8n_full_integer_quant.tflite (~4MB)
```

**Integration with OpenBot**:
- Export as TFLite with INT8 quantization
- Place in `app/src/main/assets/networks/`
- Modify the Object Tracking fragment to load custom model
- Use NNAPI delegate for hardware acceleration on Tensor G4

### 3.2 Performance on Google Tensor G4 (Pixel 9 Pro)

Based on OpenBot benchmarks and Tensor architecture progression:

| Model | CPU (fps) | GPU (fps) | NNAPI (fps) | Notes |
|-------|:---------:|:---------:|:-----------:|-------|
| MobileNetV1-300 (SSD) | ~38 | ~50 | ~65 | Pre-installed in OpenBot |
| YoloV5s-320 | ~25 | ~20 | ~25 | Good balance |
| YoloV4-tiny-224 | ~35 | ~28 | ~35 | Fast but lower accuracy |
| **YOLOv8n-320 (INT8)** | ~30-35 | ~25-30 | ~40-50 | **Recommended** |
| **YOLOv8n-640 (INT8)** | ~12-15 | ~10-12 | ~18-22 | Better for small objects |

**Tensor G4 Advantages**:
- Dedicated Edge TPU for NNAPI acceleration
- 12GB RAM allows larger models in memory
- Excellent camera ISP for low-light conditions
- Google AI Core for on-device ML optimization

**Recommended Configuration**:
- **Primary**: YOLOv8n at 320×320, INT8 quantized, NNAPI delegate → ~40-50 fps
- **High-detail mode**: YOLOv8n at 640×640 when stationary/investigating → ~18-22 fps
- **Night mode**: Reduce resolution to 224×224 for faster processing with noisy images

### 3.3 Security-Specific Detection Classes

Default COCO classes useful for security:
- `person` (class 0) — **primary target**
- `car` (class 2), `motorcycle` (class 3), `bus` (class 5), `truck` (class 7) — vehicle detection
- `dog` (class 16), `cat` (class 15), `bird` (class 14) — animal filtering
- `backpack` (class 24), `handbag` (class 26), `suitcase` (class 28) — abandoned object detection

**Custom Training for Security**:
```python
from ultralytics import YOLO

# Fine-tune on security-specific dataset
model = YOLO("yolov8n.pt")
model.train(
    data="security_patrol.yaml",
    epochs=100,
    imgsz=320,
    batch=32,
    device=0,
    # Custom classes: person, vehicle, animal, package, 
    # open_door, broken_window, fire, smoke
)
model.export(format="tflite", int8=True)
```

### 3.4 Frigate NVR Integration

**Frigate** ([github.com/blakeblackshear/frigate](https://github.com/blakeblackshear/frigate)) is a production-grade NVR with real-time AI object detection, designed for Home Assistant integration.

**Key Features for Our Project**:
- Real-time local object detection using TensorFlow/OpenVINO/Coral TPU
- Motion-triggered detection zones (minimize compute)
- 24/7 recording with retention policies based on detected objects
- MQTT integration for event publishing
- WebRTC + MSE for low-latency live view
- Built-in mask and zone editor
- Multi-camera scrubbing and review workflow
- RTSP re-streaming to reduce camera connections

**Integration Architecture**:
```
OpenBot Camera → RTSP stream → MediaMTX → Frigate NVR
                                              ↓
                                    MQTT events (person detected)
                                              ↓
                                    Dashboard + Home Assistant + Alerts
```

**Frigate Configuration for Robot Camera**:
```yaml
mqtt:
  host: mqtt-broker
  port: 1883
  topic_prefix: frigate

cameras:
  openbot_patrol_1:
    ffmpeg:
      inputs:
        - path: rtsp://mediamtx:8554/openbot1
          roles:
            - detect
            - record
    detect:
      width: 1280
      height: 720
      fps: 10
    objects:
      track:
        - person
        - car
        - dog
      filters:
        person:
          min_area: 5000
          max_area: 500000
          threshold: 0.65
    zones:
      front_yard:
        coordinates: 0,0,640,0,640,720,0,720
      driveway:
        coordinates: 640,0,1280,0,1280,720,640,720
    record:
      enabled: true
      retain:
        days: 7
        mode: motion
      events:
        retain:
          default: 14
          mode: active_objects
    snapshots:
      enabled: true
      retain:
        default: 30
```

**Dual Detection Strategy**:
1. **On-device (OpenBot)**: YOLOv8n TFLite for real-time response (trigger alerts, start following)
2. **Server-side (Frigate)**: Process RTSP stream for recording, review, and secondary validation

### 3.5 Training Custom Security Anomaly Detection

**Dataset Sources**:
- [UCSD Anomaly Detection Dataset](http://www.svcl.ucsd.edu/projects/anomaly/) — pedestrian anomalies
- [ShanghaiTech Campus](https://svip-lab.github.io/dataset/campus_dataset.html) — campus surveillance
- [COCO](https://cocodataset.org/) — general objects, fine-tune on security subset
- **Collect your own**: Use OpenBot data collection mode to record normal patrol patterns, then label anomalies

**Recommended Approach**:
1. Start with pre-trained YOLOv8n on COCO (80 classes)
2. Fine-tune on security-specific data (persons in restricted zones, vehicles at unusual hours, packages, open gates)
3. Add anomaly classification head: `normal_activity`, `suspicious_person`, `unauthorized_vehicle`, `package_left`, `gate_open`
4. Export to TFLite INT8 for on-device deployment

---

## 4. Communication Stack

### 4.1 MQTT (Mosquitto) — Central Message Bus

**Eclipse Mosquitto** is the standard lightweight MQTT broker. MQTT is the ideal protocol for robot telemetry: low overhead, pub/sub pattern, QoS levels, retained messages.

**Topic Structure**:
```
security/                           # Root namespace
├── robots/
│   ├── openbot1/
│   │   ├── telemetry/             # Battery, speed, position, heading
│   │   ├── status/                # online/offline/patrolling/charging/alert
│   │   ├── camera/                # Stream URLs, snapshot triggers
│   │   └── detections/            # Object detection events
│   └── openbot2/
│       └── ...
├── drones/
│   ├── drone1/
│   │   ├── telemetry/             # GPS, altitude, battery, flight mode
│   │   ├── status/                # grounded/flying/returning/charging
│   │   └── mission/               # Current mission status
│   └── drone2/
│       └── ...
├── alerts/
│   ├── intruder/                  # Person detection in restricted zone
│   ├── vehicle/                   # Unauthorized vehicle
│   ├── anomaly/                   # General anomaly
│   └── system/                    # Low battery, offline robot, etc.
├── commands/
│   ├── openbot1/                  # Send commands to specific robot
│   ├── drone1/                    # Send commands to specific drone
│   └── all/                       # Broadcast commands
└── frigate/                       # Frigate NVR events (auto-populated)
    ├── events/                    # Detection events
    └── cameras/                   # Camera status
```

**Message Payload Example** (JSON):
```json
{
  "robot_id": "openbot1",
  "timestamp": "2026-02-01T14:30:00Z",
  "type": "detection",
  "class": "person",
  "confidence": 0.87,
  "bbox": [120, 80, 340, 420],
  "gps": {"lat": 37.7749, "lon": -122.4194},
  "heading": 45.2,
  "zone": "front_yard",
  "snapshot_url": "http://mediamtx:8554/openbot1/snapshot",
  "action_taken": "following"
}
```

**Mosquitto Configuration** (`mosquitto.conf`):
```conf
listener 1883
allow_anonymous false
password_file /etc/mosquitto/passwd
persistence true
persistence_location /var/lib/mosquitto/
log_dest file /var/log/mosquitto/mosquitto.log

# WebSocket support for dashboard
listener 9001
protocol websockets
```

### 4.2 WebRTC / MediaMTX — Live Video Streaming

**MediaMTX** ([mediamtx.org](https://mediamtx.org)) is a ready-to-use media server supporting SRT, WebRTC, RTSP, RTMP, LL-HLS, and RTP. 17.8k GitHub stars, MIT license.

**Why MediaMTX**:
- Single binary, zero-config startup
- Protocol bridge: receive RTSP from OpenBot → serve WebRTC to dashboard
- Low-latency WebRTC for live monitoring (<200ms)
- Record streams to disk
- Multiple simultaneous readers

**Configuration** (`mediamtx.yml`):
```yaml
paths:
  openbot1:
    source: publisher  # OpenBot pushes RTSP here
    record: true
    recordPath: /recordings/openbot1/%Y-%m-%d_%H-%M-%S
  openbot2:
    source: publisher
    record: true
  drone1:
    source: publisher
    record: true
  # Frigate can also read these streams
  all:
    readUser: dashboard
    readPass: secure_password
```

**Data Flow**:
```
OpenBot (Android RTSP) → MediaMTX (:8554 RTSP) → Frigate (detection + recording)
                                   ↓
                         WebRTC (:8889) → Dashboard (low-latency live view)
                                   ↓
                         HLS (:8888) → Mobile app fallback
```

**OpenBot Android RTSP Setup**:
- In OpenBot settings, select "RTSP" streaming mode
- Configure stream URL to point to MediaMTX: `rtsp://mediamtx-host:8554/openbot1`
- The Android app uses the phone's camera hardware encoder (H.264)

### 4.3 Ntfy — Push Notifications

**ntfy** ([ntfy.sh](https://ntfy.sh)) is an open-source HTTP-based pub/sub notification service. Self-hostable, with Android/iOS apps.

**Why ntfy for Security Alerts**:
- Dead simple: `curl -d "Intruder detected!" ntfy.sh/my-security`
- Self-hostable (Go binary, Docker)
- Android/iOS apps with rich notifications (images, actions, priorities)
- No account needed, topic-based
- Supports priority levels, tags, actions, attachments
- Can attach snapshot images to alerts

**Integration Pattern**:
```python
import requests

def send_security_alert(title, message, image_path=None, priority="high"):
    headers = {
        "Title": title,
        "Priority": priority,
        "Tags": "rotating_light,security",
        "Actions": "view, Open Dashboard, https://dashboard.local:3000",
    }
    
    if image_path:
        headers["Filename"] = "snapshot.jpg"
        with open(image_path, "rb") as f:
            requests.post(
                "https://ntfy.local/security-alerts",
                data=f.read(),
                headers=headers
            )
    else:
        requests.post(
            "https://ntfy.local/security-alerts",
            data=message,
            headers=headers
        )
```

**Alert Pipeline**:
```
OpenBot detects person → MQTT publish → Alert service → ntfy push notification
                                                      → Drone launch trigger
                                                      → Home Assistant automation
                                                      → Dashboard alert banner
```

### 4.4 Ground-Drone Integration Pattern

**Scenario**: OpenBot detects intruder → Drone launches for aerial surveillance

```
┌─────────────┐     MQTT: security/alerts/intruder
│   OpenBot    │ ──────────────────────────────────────┐
│ (Ground Bot) │     {lat, lon, class, confidence,      │
└─────────────┘      snapshot_url, robot_id}            │
                                                        ▼
                                              ┌──────────────────┐
                                              │   MQTT Broker     │
                                              │   (Mosquitto)     │
                                              └──────┬───────────┘
                              ┌───────────────────────┼──────────────────┐
                              ▼                       ▼                  ▼
                    ┌──────────────┐        ┌─────────────┐    ┌──────────────┐
                    │  Drone RPi   │        │  Dashboard   │    │  ntfy/HA     │
                    │ (Companion)  │        │  (React)     │    │  (Alerts)    │
                    └──────┬───────┘        └─────────────┘    └──────────────┘
                           │
                    pymavlink/MAVSDK
                           │
                    ┌──────┴───────┐
                    │  Pixhawk FC  │
                    │  (ArduPilot) │
                    └──────────────┘
                           │
                      ARM → TAKEOFF
                      → FLY TO ALERT
                      → LOITER/OBSERVE
                      → RTL → PRECISION LAND
```

---

## 5. Dashboard / Fleet Management

### 5.1 Custom Dashboard Architecture

**Recommended Stack**: React + FastAPI + PostgreSQL + Leaflet/OpenStreetMap

```
┌───────────────────────────────────────────────┐
│                 React Frontend                  │
│  ┌──────────┐ ┌──────────┐ ┌───────────────┐  │
│  │ Live Map  │ │ Camera   │ │ Alert Feed    │  │
│  │ (Leaflet) │ │ Grid     │ │ + History     │  │
│  └──────────┘ └──────────┘ └───────────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌───────────────┐  │
│  │ Robot     │ │ Drone    │ │ Incident      │  │
│  │ Status    │ │ Status   │ │ Reports       │  │
│  └──────────┘ └──────────┘ └───────────────┘  │
└───────────────────┬───────────────────────────┘
                    │ REST API + WebSocket
┌───────────────────┴───────────────────────────┐
│              FastAPI Backend                     │
│  ┌──────────┐ ┌──────────┐ ┌───────────────┐  │
│  │ MQTT     │ │ REST     │ │ WebSocket     │  │
│  │ Client   │ │ Endpoints│ │ Server        │  │
│  └──────────┘ └──────────┘ └───────────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌───────────────┐  │
│  │ Alert    │ │ Schedule │ │ Ollama        │  │
│  │ Engine   │ │ Manager  │ │ Integration   │  │
│  └──────────┘ └──────────┘ └───────────────┘  │
└───────────────────┬───────────────────────────┘
                    │
┌───────────────────┴───────────────────────────┐
│              PostgreSQL + TimescaleDB           │
│  ┌──────────┐ ┌──────────┐ ┌───────────────┐  │
│  │ Telemetry│ │ Events   │ │ Patrol        │  │
│  │ History  │ │ + Alerts │ │ Schedules     │  │
│  └──────────┘ └──────────┘ └───────────────┘  │
└─────────────────────────────────────────────────┘
```

**Key Dashboard Features**:
1. **Live Map** (Leaflet + OpenStreetMap): Real-time robot/drone positions, patrol routes, detection markers, geofence visualization
2. **Camera Grid**: WebRTC live feeds from all robots and drones via MediaMTX
3. **Alert Feed**: Real-time detection events with snapshots, filterable by type/zone/time
4. **Robot/Drone Status**: Battery, mode, health, uptime, patrol progress
5. **Patrol Scheduler**: Define routes, times, frequencies; assign to robots
6. **Incident Reports**: AI-generated reports via Ollama (see Section 8)
7. **Historical Playback**: Timeline scrubber with recorded video + detection overlay
8. **Command Center**: Manual override controls, drone launch buttons, siren triggers

**Frontend Libraries**:
- `react-leaflet` — Map component
- `paho-mqtt` (via WebSocket) — Real-time telemetry
- `janus-gateway` or raw WebRTC — Live video
- `recharts` — Telemetry charts
- `zustand` or `redux-toolkit` — State management
- `shadcn/ui` — UI components

**Backend (FastAPI)**:
```python
from fastapi import FastAPI, WebSocket
import paho.mqtt.client as mqtt
from sqlalchemy.ext.asyncio import AsyncSession

app = FastAPI()

# MQTT → WebSocket bridge for real-time dashboard updates
@app.websocket("/ws/telemetry")
async def telemetry_ws(websocket: WebSocket):
    await websocket.accept()
    # Bridge MQTT messages to WebSocket clients
    ...

@app.get("/api/robots")
async def get_robots(db: AsyncSession = Depends(get_db)):
    return await db.execute(select(Robot))

@app.post("/api/robots/{robot_id}/command")
async def send_command(robot_id: str, command: Command):
    mqtt_client.publish(f"security/commands/{robot_id}", command.json())

@app.get("/api/alerts")
async def get_alerts(limit: int = 50, zone: str = None):
    ...

@app.post("/api/patrol-schedules")
async def create_schedule(schedule: PatrolSchedule):
    ...
```

### 5.2 Existing Open-Source Projects to Fork/Reference

| Project | Description | Relevance | License |
|---------|-------------|-----------|---------|
| **[Open-RMF](https://github.com/open-rmf/rmf)** | Robotics Middleware Framework for multi-fleet robot management | Full fleet management with ROS2 integration, traffic negotiation, task dispatch. **Heavy but comprehensive.** | Apache 2.0 |
| **[free_fleet](https://github.com/open-rmf/free_fleet)** | Lightweight fleet adapter for ROS2 navigation robots | Simpler fleet management than full RMF | Apache 2.0 |
| **[fleet_adapter_template](https://github.com/open-rmf/fleet_adapter_template)** | Template for integrating custom robot fleets with Open-RMF | Starting point for fleet integration | Apache 2.0 |
| **[Frigate NVR](https://github.com/blakeblackshear/frigate)** | NVR with AI object detection + Home Assistant integration | Already has excellent security camera dashboard, recording, review | MIT |
| **[Foxglove Studio](https://github.com/foxglove/studio)** | Robot data visualization and debugging | Excellent for visualizing robot telemetry, maps, camera feeds | MPL 2.0 |
| **[ROSboard](https://github.com/dheera/rosboard)** | Lightweight web dashboard for ROS robots | If we add ROS2, good real-time visualization | BSD |
| **[Grafana](https://github.com/grafana/grafana)** | Dashboarding platform | Excellent for telemetry charts, alerting | AGPL 3.0 |
| **[Node-RED](https://github.com/node-red/node-red)** | Flow-based automation with MQTT support | Visual automation builder, MQTT integration | Apache 2.0 |

**Recommendation**: Build a **custom React dashboard** for the core security UI (map, cameras, alerts), but leverage:
- **Frigate** for NVR recording and review
- **Grafana** (with TimescaleDB/InfluxDB) for telemetry monitoring
- **Node-RED** for rapid automation prototyping

There is no existing open-source "security robot dashboard" that's a direct fit — this is a novel combination. The closest are enterprise products (Knightscope, Cobalt Robotics) which are proprietary.

---

## 6. ROS2 Integration

### 6.1 The Question

> Is it worth adding ROS2 for SLAM/navigation, or is OpenBot's built-in nav sufficient for a ½ acre property?

### 6.2 OpenBot's Built-in Navigation Capabilities

| Feature | Implementation | Quality |
|---------|---------------|---------|
| Autopilot (learned policy) | TFLite imitation learning model | Good on trained routes; brittle on new routes |
| Object following | Camera-based bounding box tracking + PID | Works well for person/object following |
| Point Goal Navigation | ARCore visual-inertial odometry + learned policy | Works indoors/structured; limited outdoors |
| Obstacle avoidance | Ultrasonic sonar (front only) | Basic — single point, limited FOV |
| Localization | GPS (phone) + ARCore (visual) | GPS: ±3-5m outdoor; ARCore: drift-prone outdoor |
| Mapping | None built-in | ❌ No map building |

### 6.3 What ROS2 Would Add

| Feature | ROS2 Package | Benefit |
|---------|-------------|---------|
| **SLAM** | `slam_toolbox`, `cartographer`, `rtabmap` | Build and maintain property map |
| **Nav2 Stack** | `nav2_bringup` | Robust path planning, dynamic obstacle avoidance, recovery behaviors |
| **Costmap** | `nav2_costmap_2d` | 2D occupancy grid with sensor fusion |
| **Localization** | `robot_localization` (EKF) | Fuse GPS + IMU + wheel odometry for reliable position |
| **Sensor Fusion** | `robot_localization`, `imu_tools` | Better state estimation |
| **Multi-robot coordination** | Open-RMF | Fleet-level path deconfliction |
| **Standard interfaces** | `geometry_msgs`, `sensor_msgs` | Interoperability with huge ecosystem |
| **Simulation** | Gazebo + Nav2 | Test patrol routes virtually before deployment |

### 6.4 Pros and Cons for ½ Acre Property

#### Pros of Adding ROS2

1. **Robust outdoor navigation**: Nav2 handles dynamic obstacles, path replanning, recovery behaviors. OpenBot's learned policy can fail in unexpected situations.
2. **Real SLAM**: Build a persistent map of the property; know exactly where the robot is at all times. Essential for zone-based alerting ("person detected in backyard zone").
3. **GPS waypoint following**: Nav2's `navigate_through_poses` handles waypoint sequences with proper path planning between them.
4. **Multi-robot deconfliction**: If running 2+ ground robots, Open-RMF prevents collisions and optimizes coverage.
5. **Mature ecosystem**: Thousands of packages for perception, planning, control. Battle-tested in production robots.
6. **Simulation**: Test patrol routes in Gazebo before deploying on real robot.
7. **Sensor fusion**: Proper EKF combining GPS + IMU + wheel encoders for reliable outdoor localization.

#### Cons of Adding ROS2

1. **Complexity explosion**: ROS2 is a massive framework. Setup, configuration, debugging, and maintenance are significantly harder.
2. **Compute requirements**: Full Nav2 stack typically needs a companion computer (RPi 4/5 or Jetson Nano), not just the phone. The phone alone can't run ROS2 well.
3. **Integration effort**: Bridging OpenBot's Android app with ROS2 requires custom ROS2 nodes or a bridge (e.g., MQTT↔ROS2 bridge).
4. **Overkill for simple routes**: For a ½ acre property with well-defined patrol paths, a GPS waypoint follower might be sufficient.
5. **Power consumption**: Additional companion computer increases power draw, reducing patrol duration.
6. **Development time**: 2-4 weeks to set up Nav2 properly vs. 2-3 days for GPS waypoint patrol with OpenBot.

### 6.5 Recommendation

**For Phase 1 (MVP)**: **Skip ROS2.** Use OpenBot's built-in capabilities + custom GPS waypoint patrol:

```
Phase 1 Navigation Strategy:
1. Define patrol route as GPS waypoint sequence
2. Use phone GPS for position (±3-5m accuracy, fine for ½ acre)
3. Use OpenBot's learned autopilot for smooth path following between waypoints
4. Use sonar for basic obstacle avoidance
5. Use object detection for person/vehicle alerts
```

**For Phase 2 (Production)**: **Add ROS2 + Nav2** if any of these become requirements:
- Multiple ground robots needing coordination
- Precise indoor navigation (garage, shed)
- Complex obstacle avoidance (children's toys, temporary barriers)
- Property map with zones for differentiated alerting
- Integration with additional sensors (LiDAR, depth cameras)

**Compromise Option**: Use **micro-ROS** on the ESP32 for standardized sensor interfaces, and a lightweight ROS2 node on the phone via `rcljava` (experimental) or on a small companion board. But this is advanced and fragile.

### 6.6 If You Do Add ROS2

**Minimum viable ROS2 setup**:
- Raspberry Pi 4/5 mounted on OpenBot body
- ROS2 Humble or Jazzy
- `robot_localization` (GPS + IMU + wheel odom EKF)
- `nav2_bringup` with GPS waypoint following
- Custom bridge node: Android app ↔ ROS2 (via MQTT or micro-ROS)
- Total additional cost: ~$50-80 (RPi + power management)

---

## 7. Home Assistant Integration

### 7.1 Overview

Home Assistant (HA) is the ideal hub for connecting robot alerts to home automation. The integration path is primarily through **MQTT**, which HA natively supports.

### 7.2 MQTT Integration Patterns

**Step 1**: Configure MQTT broker in Home Assistant:
```yaml
# configuration.yaml
mqtt:
  broker: localhost  # or IP of Mosquitto broker
  port: 1883
  username: homeassistant
  password: !secret mqtt_password
```

**Step 2**: Define robot sensors as MQTT sensors:
```yaml
mqtt:
  sensor:
    - name: "OpenBot 1 Battery"
      state_topic: "security/robots/openbot1/telemetry"
      value_template: "{{ value_json.battery_percent }}"
      unit_of_measurement: "%"
      device_class: battery
    
    - name: "OpenBot 1 Status"
      state_topic: "security/robots/openbot1/status"
      value_template: "{{ value_json.state }}"
    
    - name: "Security Alert Level"
      state_topic: "security/alerts/intruder"
      value_template: "{{ value_json.confidence }}"
  
  binary_sensor:
    - name: "Intruder Detected"
      state_topic: "security/alerts/intruder"
      payload_on: "true"
      payload_off: "false"
      device_class: motion
      off_delay: 60  # Auto-clear after 60 seconds
    
    - name: "OpenBot 1 Online"
      state_topic: "security/robots/openbot1/status"
      value_template: "{{ value_json.online }}"
      payload_on: "true"
      payload_off: "false"
      device_class: connectivity
```

### 7.3 Automation Examples

**Alert → Turn on lights + siren + lock doors**:
```yaml
automation:
  - alias: "Intruder Alert Response"
    trigger:
      - platform: mqtt
        topic: "security/alerts/intruder"
    condition:
      - condition: template
        value_template: "{{ trigger.payload_json.confidence > 0.75 }}"
    action:
      # Turn on all exterior lights
      - service: light.turn_on
        target:
          area_id: exterior
        data:
          brightness_pct: 100
      
      # Activate siren/alarm
      - service: switch.turn_on
        target:
          entity_id: switch.security_siren
      
      # Lock all doors
      - service: lock.lock
        target:
          entity_id: 
            - lock.front_door
            - lock.back_door
            - lock.garage
      
      # Send notification with snapshot
      - service: notify.mobile_app_phone
        data:
          title: "🚨 INTRUDER DETECTED"
          message: "{{ trigger.payload_json.zone }} - Confidence: {{ (trigger.payload_json.confidence * 100) | round }}%"
          data:
            image: "{{ trigger.payload_json.snapshot_url }}"
            actions:
              - action: "DISMISS_ALERT"
                title: "Dismiss"
              - action: "LAUNCH_DRONE"
                title: "Launch Drone"
      
      # Trigger drone launch via MQTT
      - service: mqtt.publish
        data:
          topic: "security/commands/drone1/launch"
          payload: >
            {"target_lat": {{ trigger.payload_json.gps.lat }},
             "target_lon": {{ trigger.payload_json.gps.lon }},
             "source": "home_assistant"}
```

**Low battery → Return to charging station**:
```yaml
  - alias: "Robot Low Battery Return"
    trigger:
      - platform: mqtt
        topic: "security/robots/+/telemetry"
        value_template: "{{ value_json.battery_percent }}"
    condition:
      - condition: template
        value_template: "{{ trigger.payload_json.battery_percent < 20 }}"
    action:
      - service: mqtt.publish
        data:
          topic: "security/commands/{{ trigger.payload_json.robot_id }}/return_to_base"
          payload: '{"reason": "low_battery"}'
```

**Scheduled patrol start**:
```yaml
  - alias: "Start Night Patrol"
    trigger:
      - platform: time
        at: "22:00:00"
    action:
      - service: mqtt.publish
        data:
          topic: "security/commands/openbot1/start_patrol"
          payload: '{"route": "night_perimeter", "speed": "slow"}'
```

### 7.4 Frigate + Home Assistant Integration

Frigate has an **official HACS integration** that provides:

| Entity Type | Description |
|-------------|-------------|
| `camera` | Live camera stream via RTSP |
| `image` | Latest detected object snapshot |
| `sensor` | Object counts per camera/zone, Frigate performance stats |
| `switch` | Toggle detection, recording, snapshots per camera |
| `binary_sensor` | Motion sensor per camera/zone/object type |

**Setup**: Install via HACS → Add Frigate integration → Point to Frigate URL (`http://frigate:5000`)

This means Frigate's processing of robot camera feeds automatically creates HA entities for automation.

### 7.5 Camera Integration

The robot's RTSP stream (via MediaMTX) can be added directly to HA:
```yaml
camera:
  - platform: generic
    name: "OpenBot 1 Camera"
    stream_source: "rtsp://mediamtx:8554/openbot1"
    still_image_url: "http://mediamtx:8554/openbot1/snapshot"
```

Or, better, let Frigate handle the streams and use the Frigate integration's camera entities.

---

## 8. Ollama / Local LLMs

### 8.1 Overview

**Ollama** ([ollama.com](https://ollama.com)) makes running local LLMs trivial. It wraps models in a Docker-like interface with a REST API, making it easy to integrate into our security pipeline.

**Installation**: `curl -fsSL https://ollama.com/install.sh | sh`

### 8.2 Model Selection for Incident Reports

| Model | Size | RAM Required | Speed | Quality | Recommendation |
|-------|------|:------------:|:-----:|:-------:|:--------------:|
| Gemma 3 1B | 815MB | 2GB | Very fast | Basic | Testing only |
| **Gemma 3 4B** | 3.3GB | 6GB | Fast | Good | **Best balance** |
| Llama 3.2 3B | 2.0GB | 4GB | Fast | Good | Alternative |
| **Phi 4 Mini 3.8B** | 2.5GB | 4GB | Fast | Very good | **Recommended** |
| Gemma 3 12B | 8.1GB | 12GB | Medium | Very good | If server has RAM |
| Llama 3.3 70B | 43GB | 48GB | Slow | Excellent | Overkill |

**Recommendation**: **Phi 4 Mini (3.8B)** or **Gemma 3 4B** — fast enough for real-time report generation, small enough to run on the same server as the dashboard.

### 8.3 Incident Report Generation

**System Prompt** (saved as Ollama Modelfile):
```
FROM phi4-mini

SYSTEM """
You are a security incident report generator for an autonomous patrol robot system. 
Generate concise, professional incident reports from detection event data.

Report format:
- Incident ID and timestamp
- Location (zone name + GPS coordinates)
- Detection summary (what was detected, confidence level)
- Context (time of day, weather conditions if available, patrol route)
- Threat assessment (low/medium/high based on context)
- Actions taken (robot response, automations triggered)
- Recommendations (if any)

Be factual and concise. Do not speculate beyond the data provided.
"""

PARAMETER temperature 0.3
PARAMETER num_ctx 2048
```

**Integration Code**:
```python
import requests
import json
from datetime import datetime

OLLAMA_URL = "http://localhost:11434/api/generate"

def generate_incident_report(event_data: dict) -> str:
    """Generate a natural-language incident report from detection event data."""
    
    prompt = f"""Generate a security incident report from the following detection event:

Event Data:
- Timestamp: {event_data['timestamp']}
- Robot: {event_data['robot_id']}
- Detection: {event_data['class']} (confidence: {event_data['confidence']:.0%})
- Location: Zone "{event_data['zone']}" at GPS ({event_data['gps']['lat']:.6f}, {event_data['gps']['lon']:.6f})
- Robot Action: {event_data.get('action_taken', 'monitoring')}
- Time of Day: {_get_time_context(event_data['timestamp'])}
- Automations Triggered: {', '.join(event_data.get('automations', ['none']))}
- Drone Dispatched: {event_data.get('drone_dispatched', False)}
- Previous Events (last hour): {event_data.get('recent_event_count', 0)}

Generate the incident report:"""

    response = requests.post(OLLAMA_URL, json={
        "model": "security-reporter",  # Custom modelfile
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": 0.3,
            "num_predict": 512
        }
    })
    
    return response.json()["response"]


def _get_time_context(timestamp_str: str) -> str:
    hour = datetime.fromisoformat(timestamp_str).hour
    if 6 <= hour < 12: return "Morning"
    elif 12 <= hour < 17: return "Afternoon"
    elif 17 <= hour < 21: return "Evening"
    else: return "Night (elevated alert)"
```

**Example Output**:
```
SECURITY INCIDENT REPORT
========================
Incident ID: INC-2026-0201-2247
Date/Time: 2026-02-01 22:47:00 UTC

LOCATION
Zone: Front Yard
GPS: 37.774900, -122.419400
Patrol Route: Night Perimeter (Waypoint 3 of 8)

DETECTION SUMMARY
Object: Person detected with 87% confidence
Time Context: Night (elevated alert period)

THREAT ASSESSMENT: MEDIUM-HIGH
- Unauthorized person detected during nighttime patrol
- No prior events in this zone in the past hour
- Detection confidence exceeds alert threshold (75%)

ACTIONS TAKEN
1. Ground robot (OpenBot-1) initiated person following mode
2. Exterior lights activated (100% brightness) via Home Assistant
3. Drone (Drone-1) dispatched to aerial observation position
4. Security notification sent to property owner
5. All doors auto-locked

RECOMMENDATIONS
- Review camera footage from 22:45-22:50 for additional context
- Check if person matches known residents/visitors database
- Consider adjusting front yard zone sensitivity if false positives persist
```

### 8.4 Advanced: Event Summarization

Beyond individual reports, Ollama can generate **daily patrol summaries**:

```python
def generate_daily_summary(events: list, patrol_stats: dict) -> str:
    prompt = f"""Generate a daily security patrol summary:

Patrol Statistics:
- Total patrol hours: {patrol_stats['total_hours']}
- Distance covered: {patrol_stats['distance_km']:.1f} km
- Robots active: {patrol_stats['robots_active']}
- Drone flights: {patrol_stats['drone_flights']}
- Battery cycles: {patrol_stats['battery_cycles']}

Detection Events ({len(events)} total):
{json.dumps(events, indent=2)}

Generate a concise daily security summary with key findings and recommendations:"""
    
    response = requests.post(OLLAMA_URL, json={
        "model": "security-reporter",
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0.3, "num_predict": 1024}
    })
    return response.json()["response"]
```

### 8.5 Vision Model for Scene Analysis (Future)

Ollama supports multimodal models like **Llama 3.2 Vision (11B)**:
```python
# Analyze a security snapshot with a vision model
response = requests.post(OLLAMA_URL, json={
    "model": "llama3.2-vision",
    "prompt": "Describe any security-relevant observations in this image. Note any people, vehicles, open doors/windows, or unusual objects.",
    "images": [base64_encoded_snapshot],
    "stream": False
})
```

This requires more RAM (8GB+) but can provide richer scene descriptions beyond bounding-box detection.

---

## 9. Recommended Architecture Summary

```
                    ┌─────────────────────────────────────────────┐
                    │              Home Network Server              │
                    │  ┌────────────┐  ┌──────────┐  ┌─────────┐ │
                    │  │ Mosquitto  │  │ MediaMTX │  │ Frigate │ │
                    │  │ (MQTT)     │  │ (Video)  │  │ (NVR)   │ │
                    │  └────────────┘  └──────────┘  └─────────┘ │
                    │  ┌────────────┐  ┌──────────┐  ┌─────────┐ │
                    │  │ FastAPI    │  │PostgreSQL│  │ Ollama  │ │
                    │  │ (Backend)  │  │(Database)│  │ (LLM)   │ │
                    │  └────────────┘  └──────────┘  └─────────┘ │
                    │  ┌────────────┐  ┌──────────┐  ┌─────────┐ │
                    │  │ React      │  │  ntfy    │  │  Home   │ │
                    │  │ (Dashboard)│  │ (Alerts) │  │Assistant│ │
                    │  └────────────┘  └──────────┘  └─────────┘ │
                    └──────────────────────┬──────────────────────┘
                                           │ WiFi / MQTT / RTSP
              ┌────────────────────────────┼─────────────────────────┐
              │                            │                         │
    ┌─────────┴─────────┐      ┌──────────┴──────────┐    ┌────────┴────────┐
    │   OpenBot #1       │      │   OpenBot #2         │    │    Drone #1     │
    │ ┌───────────────┐  │      │ ┌───────────────┐    │    │ ┌────────────┐ │
    │ │ Pixel 9 Pro   │  │      │ │ Pixel 9 Pro   │    │    │ │ Pixhawk FC │ │
    │ │ • YOLOv8n     │  │      │ │ • YOLOv8n     │    │    │ │ ArduPilot  │ │
    │ │ • Autopilot   │  │      │ │ • Autopilot   │    │    │ └──────┬─────┘ │
    │ │ • RTSP stream │  │      │ │ • RTSP stream │    │    │ ┌──────┴─────┐ │
    │ │ • MQTT client │  │      │ │ • MQTT client │    │    │ │ RPi 4/5    │ │
    │ └───────────────┘  │      │ └───────────────┘    │    │ │ • pymavlink│ │
    │ ┌───────────────┐  │      │ ┌───────────────┐    │    │ │ • MQTT     │ │
    │ │ ESP32         │  │      │ │ ESP32         │    │    │ │ • AprilTag │ │
    │ │ • Motors      │  │      │ │ • Motors      │    │    │ └────────────┘ │
    │ │ • Sensors     │  │      │ │ • Sensors     │    │    │ ┌────────────┐ │
    │ │ • LEDs        │  │      │ │ • LEDs        │    │    │ │ Camera     │ │
    │ └───────────────┘  │      │ └───────────────┘    │    │ │ + Gimbal   │ │
    └────────────────────┘      └──────────────────────┘    │ └────────────┘ │
                                                             └────────────────┘
                                                             Inductive Charging Pad
                                                             + AprilTag Landing Target
```

### Phase 1 (MVP) — 4-6 weeks
1. Single OpenBot with Pixel 9 Pro
2. YOLOv8n person detection (COCO pre-trained)
3. GPS waypoint patrol (custom Android app modification)
4. MQTT telemetry to Mosquitto
5. RTSP → MediaMTX → basic web dashboard
6. ntfy push notifications on person detection
7. Home Assistant: lights + notification automations

### Phase 2 (Enhanced) — 6-8 weeks additional
1. ArduPilot drone with precision landing on charging pad
2. Drone auto-launch on intruder alert
3. Frigate NVR integration for recording + review
4. Custom YOLOv8n model fine-tuned for security
5. Ollama incident report generation
6. Full React dashboard with live map + camera grid
7. Multi-robot support (2 OpenBots)

### Phase 3 (Production) — 8-12 weeks additional
1. ROS2 Nav2 for robust navigation (if needed)
2. Night patrol with IR illumination
3. Two-way audio (speaker on robot)
4. Vision LLM for scene analysis
5. Daily automated patrol summaries
6. Weatherproofing and durability hardening

---

## 10. Bill of Software

All open-source components used in this project:

| Component | Project | License | Role |
|-----------|---------|---------|------|
| Ground Robot Platform | [OpenBot](https://github.com/ob-f/OpenBot) | MIT | Robot body, Android app, firmware, ML training |
| Flight Controller | [ArduPilot](https://ardupilot.org/) | GPLv3 | Drone autopilot |
| MAVLink Library | [pymavlink](https://github.com/ArduPilot/pymavlink) | LGPLv3 | Drone communication |
| Modern MAVLink | [MAVSDK](https://github.com/mavlink/MAVSDK) | BSD-3 | Alternative drone API |
| Object Detection | [Ultralytics YOLO](https://github.com/ultralytics/ultralytics) | AGPL-3.0* | YOLOv8/YOLO26 models |
| MQTT Broker | [Eclipse Mosquitto](https://mosquitto.org/) | EPL 2.0 | Central message bus |
| Video Server | [MediaMTX](https://github.com/bluenviron/mediamtx) | MIT | RTSP/WebRTC/HLS streaming |
| NVR | [Frigate](https://github.com/blakeblackshear/frigate) | MIT | Recording, AI detection, review |
| Push Notifications | [ntfy](https://ntfy.sh/) | Apache 2.0 / GPLv2 | Mobile alert notifications |
| Home Automation | [Home Assistant](https://www.home-assistant.io/) | Apache 2.0 | Smart home integration |
| Local LLM | [Ollama](https://github.com/ollama/ollama) | MIT | Incident report generation |
| Dashboard Backend | [FastAPI](https://fastapi.tiangolo.com/) | MIT | REST API + WebSocket |
| Dashboard Frontend | [React](https://react.dev/) | MIT | Web dashboard |
| Map Library | [Leaflet](https://leafletjs.com/) + [OpenStreetMap](https://www.openstreetmap.org/) | BSD-2 / ODbL | Interactive patrol map |
| Database | [PostgreSQL](https://www.postgresql.org/) + [TimescaleDB](https://www.timescale.com/) | PostgreSQL / Apache 2.0 | Telemetry + event storage |
| Fleet Management (optional) | [Open-RMF](https://github.com/open-rmf/rmf) | Apache 2.0 | Multi-robot coordination |
| Navigation (optional) | [ROS2 Nav2](https://docs.nav2.org/) | Apache 2.0 | Advanced SLAM + navigation |

*Note: Ultralytics YOLO is AGPL-3.0 for the training framework. Exported TFLite models for inference are generally considered separate works, but review licensing for commercial use. Alternative: train with the framework, deploy the model weights independently.

---

*Report generated 2026-02-01. Sources: project documentation, GitHub repositories, ArduPilot wiki, Frigate docs, and domain expertise in robotics systems integration.*
