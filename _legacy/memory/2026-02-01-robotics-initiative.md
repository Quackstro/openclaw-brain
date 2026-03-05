# 2026-02-01 — Project Sentinel Kickoff

## Key Decisions
- Project name: **Sentinel**
- Dr. Castro initiated Quackstro's robotics/security hardware expansion
- Robot must have **top-notch obstacle avoidance** (not low-end IR-only like cheap robot vacuums)
- Robot must be **self-docking** with sensors and systems for autonomous charging
- **Prototype** in Python/ROS 2 on RC body chassis
- **MVP pivot to Rust** after prototype validation
- Pixel 9 Pro noted as NOT daily driver (potential dev/testing device)

## Research Queued
1. Obstacle avoidance systems — why budget robots fail, our sensor stack plan
2. Rust programming language for robotics MVP

## Files Created
- `projects/sentinel/EXECUTIVE-SUMMARY.md`
- `projects/sentinel/RESEARCH-obstacle-avoidance.md`
- `projects/sentinel/RESEARCH-rust-for-mvp.md`
- `projects/sentinel/PARTS-LIST.md`

## Hardware Budget
- Estimated prototype cost: $406–$560 (Amazon-sourced)
- Key components: 4WD chassis, RPLiDAR A1, Raspberry Pi 5, Arduino Mega, ToF sensors, camera, self-docking IR beacon system

## Notes
- Neighbor has 3D printer — useful for custom brackets/housings
- Security patrol robot is a natural pivot from this platform
