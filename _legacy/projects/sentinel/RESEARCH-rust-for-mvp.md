# Research: Rust for Robotics MVP
**Queued:** 2026-02-01 | **Status:** Initial Brief (Deep Dive Pending)

---

## Why Rust is a Strong Candidate for Post-Prototype MVP

### Core Advantages

#### 1. Memory Safety Without Garbage Collection
- **Zero-cost abstractions** — no GC pauses that could interrupt real-time sensor processing
- **Ownership model** eliminates data races at compile time — critical when multiple sensor threads share state
- Replaces C/C++ in safety-critical code without sacrificing performance

#### 2. Concurrency for Robotics
- `async/await` + Tokio runtime for high-throughput I/O (sensor polling, network comms)
- `Send`/`Sync` traits enforce thread safety at compile time
- **Fearless concurrency** = fewer runtime crashes during autonomous operation

#### 3. Performance Parity with C/C++
- Compiles to native machine code via LLVM
- No runtime overhead — suitable for resource-constrained embedded targets
- Benchmarks consistently within 5-10% of equivalent C code

#### 4. Growing Robotics Ecosystem
| Crate | Purpose | Maturity |
|-------|---------|----------|
| `rosrust` / `r2r` / `rclrs` | ROS / ROS 2 bindings | Active, improving |
| `nalgebra` | Linear algebra (transforms, kinematics) | Mature |
| `opencv-rust` | Computer vision bindings | Stable |
| `rplidar-rs` | RPLiDAR driver (our primary sensor!) | Maintained |
| `embedded-hal` | Hardware abstraction layer | Mature, widely adopted |
| `embassy` | Async embedded framework | Very active |
| `rerun` | Robotics visualization/logging | Excellent |
| `zenoh` | Pub/sub middleware (ROS 2 alternative) | Production-ready |

#### 5. Cross-Compilation
- Targets ARM (Raspberry Pi), RISC-V, and x86 from a single codebase
- `cargo` makes cross-compilation straightforward with `--target`
- Can compile for both the SBC (Linux ARM) and MCU (bare-metal Cortex-M)

### Challenges / Risks

#### 1. Steeper Learning Curve
- Borrow checker is notoriously frustrating for newcomers
- Robotics devs typically come from Python/C++ backgrounds
- **Mitigation:** Prototype in Python/ROS 2 first, port critical paths to Rust

#### 2. ROS 2 Integration Still Maturing
- `rclrs` (official Rust ROS 2 client) is functional but not feature-complete vs. `rclpy`/`rclcpp`
- Some ROS 2 message types may need manual binding generation
- **Mitigation:** Use `zenoh` as middleware (ROS 2 bridge available) or `r2r` crate

#### 3. Smaller Talent Pool
- Fewer robotics engineers know Rust vs. Python/C++
- Hiring may be harder initially
- **Mitigation:** Rust adoption is accelerating; strong signal for quality hires

#### 4. Prototyping Speed
- Rust's strict compiler slows iteration vs. Python
- Not ideal for rapid algorithm experimentation
- **Mitigation:** Prototype in Python → validate → rewrite in Rust for production

---

## Recommended Strategy: Phased Approach

```
Phase 1 (CURRENT) — Prototype
├── Python + ROS 2 for rapid iteration
├── Arduino/MicroPython for MCU layer
└── Goal: Validate hardware, sensors, algorithms

Phase 2 — MVP (Post-Prototype)
├── Rust for core control loop + sensor fusion
├── Rust for embedded MCU firmware (embassy)
├── Python retained for high-level planning / ML inference
└── Goal: Production-quality, safe, performant

Phase 3 — Production
├── Full Rust stack where possible
├── Formal verification on safety-critical paths
└── Goal: Shippable product
```

---

## Proof Points
- **Oxide Computer** — Built entire server firmware in Rust
- **Astro (Amazon)** — Household robot, Rust used in subsystems
- **Waymo** — Uses Rust for certain autonomous driving components
- **Ditto (Cruise)** — Rust in robotics middleware
- **Embassy framework** — Proving Rust viable for microcontroller-level robotics

---

## Action Items
- [ ] Evaluate `rclrs` vs `r2r` vs `zenoh` for our ROS 2 integration path
- [ ] Benchmark Rust vs Python sensor fusion pipeline (latency, throughput)
- [ ] Identify which prototype components are highest priority for Rust rewrite
- [ ] Set up cross-compilation toolchain for Raspberry Pi 5 (aarch64)
- [ ] Prototype RPLiDAR driver using `rplidar-rs` crate
