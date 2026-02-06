# Drone-Based Roof Inspection & Estimation Business
## Market Research Report — Tampa, Florida Focus

**Date:** February 2026  
**Status:** Research Complete  
**Context:** Adjacent use case for ArduPilot-based autonomous drone platform with AI/CV capabilities

---

## Table of Contents

1. [Florida Roofing Market](#1-florida-roofing-market)
2. [Roofing Fraud Problem in Florida](#2-roofing-fraud-problem-in-florida)
3. [Drone Roof Inspection Technology](#3-drone-roof-inspection-technology)
4. [Value Proposition by Customer Segment](#4-value-proposition-by-customer-segment)
5. [Regulatory & Consumer Protection Angle](#5-regulatory--consumer-protection-angle)
6. [Technical Requirements](#6-technical-requirements)
7. [Business Model for Roof Inspection](#7-business-model-for-roof-inspection)
8. [Synergies with Security Robot Business](#8-synergies-with-security-robot-business)
9. [Competitive Landscape Summary](#9-competitive-landscape-summary)
10. [Go-to-Market Recommendations](#10-go-to-market-recommendations)

---

## 1. Florida Roofing Market

### 1.1 Market Size

- **U.S. roofing industry:** ~$56–62 billion annually (residential + commercial), with Florida representing approximately 8–10% of the national market due to climate exposure, population growth, and storm frequency.
- **Florida roofing market:** Estimated at **$5–6 billion annually**, making it the largest or second-largest state market (competing with Texas).
- **Tampa Bay metro area:** With ~3.2 million residents and approximately 1.2 million residential structures, Tampa Bay represents roughly **15–18% of the Florida roofing market** (~$750M–$1B annually).
- Florida has **more licensed roofing contractors** than any other state — estimated at 8,000–10,000 active roofing contractor licenses through DBPR.

### 1.2 Roof Replacements Per Year

- **Florida-wide:** An estimated **200,000–300,000 roof replacements per year** in normal years, spiking to **400,000+** in years following major hurricanes.
- **Post-hurricane surges:** After Hurricane Ian (2022), estimates suggest 300,000+ insurance claims for roof damage in Southwest and Central Florida alone. Hurricane Irma (2017) generated over 1 million property insurance claims statewide.
- **Tampa Bay specifically:** Approximately 30,000–50,000 roof replacements annually, with significant backlog from recent storm activity.
- **Age-driven demand:** Florida's 25-year roof replacement rule (for insurance purposes) creates a steady baseline demand independent of storm damage. Millions of roofs installed during the 1990s–2000s building boom are now hitting replacement age.

### 1.3 Average Roof Replacement Cost

| Roof Type | Average Cost (Florida) | Notes |
|-----------|----------------------|-------|
| Asphalt shingle (standard) | $8,000–$15,000 | Most common residential |
| Tile (concrete/clay) | $15,000–$30,000 | Very common in FL |
| Metal standing seam | $15,000–$25,000 | Growing in popularity |
| Flat/modified bitumen | $8,000–$18,000 | Commercial/low-slope |
| Premium/slate | $25,000–$50,000+ | Luxury homes |

- **Average residential roof replacement in Tampa Bay: $12,000–$18,000** (blended across material types).
- Florida costs run 10–20% higher than national averages due to: building code requirements (Florida Building Code wind resistance), material costs, labor demand, and insurance/permitting complexity.

### 1.4 Insurance Claim Process for Roof Damage

1. **Damage occurs** (hurricane, hail, wind, falling debris, or age-related failure)
2. **Homeowner files claim** with property insurance carrier
3. **Insurance adjuster inspects** — Carrier sends a field adjuster (staff or independent) to inspect the roof. Historically, this involves climbing the roof, which is time-consuming and dangerous.
4. **Adjuster files estimate** — Using tools like Xactimate (Verisk), the adjuster creates a repair/replacement estimate based on scope of damage.
5. **Carrier approves/denies/supplements** — Carrier may approve the claim, deny it (pre-existing damage, policy exclusion, wear-and-tear), or require supplemental documentation.
6. **Homeowner gets contractor estimates** — Homeowner shops contractors; contractor estimates may differ significantly from adjuster estimates.
7. **Negotiation/supplement process** — Contractors often file "supplements" arguing the insurance estimate is insufficient. This is where significant friction (and fraud) occurs.
8. **Payment and completion** — Carrier pays (minus deductible), work is performed, final inspection may occur.

**Key pain points:**
- Subjective nature of roof inspections (two adjusters may reach different conclusions)
- Significant lag time between damage, inspection, and payment
- Difficulty distinguishing storm damage from pre-existing wear
- Contractor-driven claims inflation
- Shortage of qualified adjusters after major storms

### 1.5 Recent Florida Legislation

#### SB 4-D (2022) — Property Insurance Reform
Signed into law May 26, 2022 (Chapter 2022-269). Passed unanimously (Senate 38-0, House 110-0) during a special session focused on the property insurance crisis. Key provisions:

- **Eliminated one-way attorney fee provisions** in property insurance litigation — previously, policyholders who won lawsuits had attorney fees paid by insurers, but insurers who won did not. This was a massive driver of litigation.
- **Restricted Assignment of Benefits (AOB)** — Contractors could no longer have policyholders sign over insurance benefits. AOB had been heavily abused: contractors would take assignment, inflate claims, and sue insurers.
- **Reduced statute of limitations for filing claims** from 3 years to 2 years (later further reduced to 1 year in HB 7065).
- **Created the Reinsurance to Assist Policyholders (RAP) program** and Florida Optional Reinsurance Assistance (FORA) to stabilize the market.

#### HB 7065 (2023) — Further Insurance Reform
- Reduced the time to file a property insurance claim to **1 year from the date of loss**.
- Banned solicitation of property insurance claims by contractors (anti-storm-chasing provision).
- Required contractors to provide a "Good Faith Estimate" before commencing work.
- Imposed penalties for filing fraudulent or inflated insurance claims.

#### Roof Age and Insurance
- Prior to reforms, Florida law required insurers to cover full roof replacement regardless of age. Post-reform, insurers can now offer policies that factor in roof age and depreciation.
- The **25-year roof rule** — many Florida insurers will not write or renew policies on homes with roofs older than 25 years (15 years for some materials) without a roof inspection certifying remaining useful life.
- This has created massive demand for **roof certification inspections** — a perfect use case for drone-based inspection.

#### My Safe Florida Home Program
- State-funded program providing free wind mitigation inspections and grants (up to $10,000) for hurricane hardening.
- Inspections verify roof-to-wall connections, roof deck attachment, roof geometry, etc.
- This program creates additional demand for standardized roof inspections.

---

## 2. Roofing Fraud Problem in Florida

### 2.1 Scale of the Problem

- Florida is widely recognized as the **#1 state in the nation for property insurance fraud**, with roofing fraud being the largest single category.
- The Florida CFO's Division of Investigative and Forensic Services investigates thousands of property insurance fraud cases annually. Roofing/contractor fraud consistently represents the largest share.
- **Industry estimates:** Roofing fraud costs Florida property insurers **$1–2 billion per year** in inflated claims, unnecessary replacements, and litigation.
- Florida accounted for approximately **76% of all homeowner property insurance lawsuits in the nation** while representing only ~15% of claims (pre-2022 reform). The vast majority involved roofing claims.
- **Litigation explosion:** From 2013 to 2020, property insurance lawsuits in Florida increased from ~27,000 to over 100,000 annually — the majority roofing-related.

### 2.2 Common Fraud Schemes

#### Storm Chasing
- Out-of-state contractors flood into Florida after hurricanes, going door-to-door soliciting homeowners.
- They offer "free roof inspections" and then claim storm damage on roofs that may have only pre-existing wear.
- Many are unlicensed, uninsured, or use shell companies.

#### Inflated Estimates / Scope Creep
- Contractors intentionally inflate the scope of damage on insurance claims.
- A roof that needs minor repairs gets scoped as a full replacement.
- Xactimate estimates are manipulated by adding line items for work that isn't needed.

#### Assignment of Benefits (AOB) Abuse (now largely banned)
- Contractors would have homeowners sign over insurance claim rights.
- Contractor then files inflated claims and sues the insurer directly.
- Homeowner loses control of the claim process.
- This was a **$15+ billion problem** statewide at its peak.

#### Manufactured Damage
- In the worst cases, contractors or their subcontractors deliberately damage roofs during "inspections" to create claimable damage.
- Examples: using tools to crack tiles, peel shingles, or dent metal components.

#### Kickbacks and Fee Splitting
- Contractors paying public adjusters or referral fees for steering claims.
- Attorneys and contractors in collusive arrangements to maximize litigation payouts.

### 2.3 Cost Impact

| Stakeholder | Estimated Annual Cost |
|-------------|----------------------|
| Insurance companies (claims inflation) | $1–2 billion |
| Consumers (higher premiums) | $500–1,000+ per policy/year above actuarial |
| State (FIGA/Citizens exposure) | Hundreds of millions in backstop risk |
| Legitimate contractors (lost business) | Significant market share to fraudulent operators |

- Florida homeowner insurance premiums are the **highest in the nation**, averaging **$4,000–$6,000/year** (3x the national average), driven significantly by fraud and litigation.
- Citizens Property Insurance (state insurer of last resort) has grown to **1.2+ million policies**, indicating massive market dysfunction.

### 2.4 Regulatory Efforts

- **Florida DBPR (Department of Business and Professional Regulation):** Licenses roofing contractors, investigates complaints, takes disciplinary action. Has increased enforcement actions against unlicensed contractors.
- **Florida CFO Office:** Operates fraud hotline (1-800-378-0445), Division of Investigative and Forensic Services pursues criminal cases.
- **Attorney General:** Prosecutes organized roofing fraud rings. Multiple major cases prosecuted since 2020.
- **Office of Insurance Regulation (OIR):** Monitors insurer practices, approves rate filings, tracks litigation trends.
- **SB 4-D and HB 7065:** Legislative reforms directly targeting the fraud ecosystem (see Section 1.5).

### 2.5 How Drone Inspections Combat Fraud

| Fraud Vector | Drone Inspection Countermeasure |
|-------------|-------------------------------|
| Subjective damage assessment | AI-consistent, standardized damage classification |
| Inflated scope of work | Precise, automated roof measurements (sq ft, pitch, facets) |
| Manufactured damage | Timestamped, geolocated pre- and post-inspection imagery |
| Storm vs. wear-and-tear disputes | AI trained to differentiate impact damage from aging patterns |
| Unlicensed contractor claims | Third-party objective report independent of contractor |
| Adjuster shortage after storms | Scalable drone fleet can inspect 10–20x more roofs per day |
| Inconsistent adjuster opinions | Same AI model, same standards, every inspection |

**Key insight:** Standardized drone inspections create an **objective, auditable, timestamped record** that makes it dramatically harder to inflate or fabricate claims. This is the single most compelling value proposition for insurance companies and regulators.

---

## 3. Drone Roof Inspection Technology

### 3.1 Current State of Industry

The drone roof inspection industry has matured significantly since 2018 and is now a mainstream tool for insurance adjusters and progressive roofing contractors. Key trends:

- **Autonomous flight:** Modern solutions use fully autonomous flight patterns — the operator sets a boundary, and the drone executes a pre-programmed survey pattern.
- **AI damage detection:** Computer vision models can now identify hail damage, missing/cracked shingles, lifted flashing, ponding water, and structural sagging with increasing accuracy.
- **3D reconstruction:** Photogrammetry creates complete 3D models of roofs from drone imagery, enabling precise measurements without physical access.
- **Integration with estimation software:** Direct output to Xactimate, CompanyCam, and other industry tools.
- **Regulatory acceptance:** FAA Part 107 provides clear regulatory framework. Insurance industry increasingly accepts drone-based assessments.

### 3.2 AI/ML for Roof Damage Detection

#### Damage Types Detectable by AI

| Damage Type | Detection Maturity | Notes |
|------------|-------------------|-------|
| Missing shingles | ✅ High | Clear visual signature |
| Hail damage (shingles) | ✅ High | Circular impact patterns |
| Cracked/broken tiles | ✅ High | Edge detection excels |
| Wind damage (lifted shingles) | ✅ High | Shadow/displacement analysis |
| Moss/algae growth | ✅ High | Color/texture classification |
| Flashing damage/separation | ⚠️ Medium | Requires high resolution |
| Ponding water (flat roofs) | ✅ High | Color/reflectance analysis |
| Structural sagging | ⚠️ Medium | 3D model analysis |
| Granule loss (shingles) | ⚠️ Medium | Subtle texture changes |
| Blistering vs. hail | ⚠️ Medium | Key differentiator for fraud detection |
| Interior leak indicators | ❌ Low | Requires thermal imaging |

#### AI Model Approaches
- **Object detection:** YOLOv8/v9, Faster R-CNN for identifying specific damage instances
- **Semantic segmentation:** U-Net, DeepLabV3+ for mapping damage areas across the roof surface
- **Classification:** ResNet, EfficientNet for categorizing damage severity (none/minor/moderate/severe)
- **Anomaly detection:** Autoencoders and GANs for identifying unusual patterns that may indicate damage
- **3D analysis:** Point cloud analysis from photogrammetry for structural assessment

#### Training Data Requirements
- **Minimum viable dataset:** 5,000–10,000 annotated roof images for basic damage detection
- **Production-quality model:** 50,000–100,000+ annotated images with diverse damage types, materials, lighting conditions, and roof geometries
- **Data sources:** 
  - Partnership with insurance companies (claims photos with adjuster annotations)
  - Public datasets (limited — RoofSense, AIRS dataset for segmentation)
  - Synthetic data augmentation
  - Self-collected during initial operations
- **Annotation needs:** Bounding boxes + segmentation masks + damage severity labels + material type labels

### 3.3 Automated Measurement and Estimation

Modern drone-based systems can automatically extract:

- **Roof area** (total square footage, per-facet breakdown) — accuracy within 1–2%
- **Roof pitch/slope** (degrees and ratio, e.g., 6:12) — from 3D model
- **Number and geometry of facets** — hip, gable, valley, ridge identification
- **Material identification** — shingle type, tile type, metal, flat membrane via visual classification
- **Eave/rake/ridge/valley linear measurements** — for estimating trim, flashing, drip edge
- **Penetrations** — vents, skylights, chimneys, HVAC curbs counted and measured
- **Waste factor calculation** — based on complexity/facet count

### 3.4 Existing Companies — Competitive Landscape

#### EagleView Technologies
- **HQ:** Rochester, NY
- **Founded:** 2008
- **Backed by:** Vista Equity Partners, Clearlake Capital
- **Products:** 
  - EagleView Assess™ — Autonomous drone-powered roof inspection with AI damage detection
  - EagleView One™ — Platform for aerial imagery, property data, and 3D models
  - Aerial measurement reports from fixed-wing aircraft surveys
- **Technology:** Proprietary autonomous drone (DJI-based), AI damage detection, 3D modeling, integration with claims workflows
- **Pricing:** Subscription-based for drone hardware + software; per-report pricing for aerial measurement reports ($15–$95 per report depending on detail level)
- **Market position:** Dominant incumbent. 3.5 billion image library. Used by top 20 insurance carriers.
- **Strengths:** Massive data moat, insurance industry relationships, regulatory trust
- **Weaknesses:** Proprietary/closed ecosystem, expensive, enterprise-focused (not accessible to small contractors)

#### Hover Inc.
- **HQ:** San Francisco, CA
- **Technology:** Smartphone-based 3D property modeling (photos from ground level → 3D model with measurements). Does NOT use drones.
- **Products:** Starter, Pro, Enterprise tiers
- **Pricing:** 
  - Starter: Per-order pricing (~$25–49/report)
  - Pro: Subscription + per-order (~$99–199/month + reduced per-order)
  - Enterprise: Custom pricing with 2-hour turnaround
- **Strengths:** No drone needed (lower barrier), fast turnaround (4–12 hours), broad material library
- **Weaknesses:** Ground-level photos miss damage detail on roof surface; less accurate for steep/complex roofs; can't detect damage — measurements only

#### Roofr
- **HQ:** Toronto, Canada
- **Technology:** Satellite/aerial imagery-based instant estimation platform (not drone-based)
- **Products:** Instant Estimator, CRM for roofers, proposal tools
- **Pricing:** Subscription tiers for roofing companies; emphasis on lead generation and sales workflow
- **Strengths:** Instant quotes from satellite imagery, strong CRM/sales tools, good for lead qualification
- **Weaknesses:** No drone capability, no damage detection, measurements from satellite are less accurate than drone

#### Zeitview (formerly DroneBase)
- **HQ:** San Diego, CA
- **Technology:** Nationwide network of Part 107 drone pilots + AI analytics platform
- **Products:** Property Insights — drone-captured imagery with analytics for insurance, property management, solar, construction
- **Pricing:** Per-inspection pricing via pilot network
- **Strengths:** Massive pilot network (can deploy anywhere), multi-industry platform
- **Weaknesses:** Dependent on third-party pilots (quality variance), not fully autonomous

#### Loveland Innovations (IMGING)
- **HQ:** Pleasant Grove, UT
- **Technology:** Automated drone flight software (IMGING) with AI damage detection, measurement, and report generation
- **Products:**
  - IMGING Flex — AI damage detection from any drone via desktop/iOS upload
  - IMGING Flight — Automated drone flight + AI + measurements (requires DJI Mavic 3 Enterprise)
  - IMGING Inspect — All-in-one inspection tool with automated flight
- **Pricing:** Subscription-based (estimated $200–500/month per user depending on tier)
- **Strengths:** Purpose-built for roofing/insurance, strong AI, automated flight, polished reports
- **Weaknesses:** Tied to DJI hardware, subscription cost, smaller market presence than EagleView

#### Other Notable Players
- **Nearmap:** High-resolution aerial imagery (fixed-wing), AI property analytics
- **Cape Analytics:** AI analysis of aerial/satellite imagery for insurance underwriting
- **Betterview:** AI-powered property intelligence for insurance carriers (roof condition scoring from aerial imagery)
- **Arturo:** AI property data for insurance (acquired by Nearmap)
- **SkyRoofMeasure:** Canadian company, aerial measurement reports

### 3.5 Open-Source Tools for Roof Analysis

| Tool | Use Case | URL |
|------|----------|-----|
| **OpenDroneMap (ODM)** | Photogrammetry / 3D reconstruction from drone images | github.com/OpenDroneMap |
| **QGIS** | GIS analysis, roof area measurement from orthophotos | qgis.org |
| **Detectron2 (Meta)** | Object detection / segmentation framework for damage detection | github.com/facebookresearch/detectron2 |
| **YOLOv8/Ultralytics** | Real-time object detection for damage identification | github.com/ultralytics/ultralytics |
| **Segment Anything (SAM)** | Zero-shot segmentation — useful for roof facet segmentation | github.com/facebookresearch/segment-anything |
| **Open3D** | 3D point cloud processing for structural analysis | github.com/isl-org/Open3D |
| **OpenCV** | Computer vision primitives for image processing | opencv.org |
| **Roboflow** | Dataset management, annotation, model training platform (freemium) | roboflow.com |
| **Label Studio** | Open-source data annotation tool | github.com/HumanSignal/label-studio |
| **ArduPilot** | Autonomous flight control for survey missions | ardupilot.org |
| **Mission Planner** | Ground control station with Survey (Grid) auto-mission | ardupilot.org/planner |
| **QGroundControl** | Cross-platform GCS with survey mission planning | qgroundcontrol.com |

**Key insight for our platform:** By combining ArduPilot (autonomous flight) + OpenDroneMap (3D reconstruction) + YOLOv8/Detectron2 (damage detection) + custom estimation logic, we can build a **fully open-source-based** roof inspection pipeline that competes with proprietary solutions at a fraction of the cost.

---

## 4. Value Proposition by Customer Segment

### 4.1 For Roofing Companies

| Benefit | Impact |
|---------|--------|
| **Faster estimates** | Inspect 8–15 roofs/day vs. 3–5 with ladder climbing |
| **Worker safety** | Eliminate the #1 cause of roofing industry injuries (falls from ladders/roofs) |
| **Consistency** | Every inspection follows the same protocol, reducing errors |
| **Professional documentation** | Polished PDF reports with annotated photos, measurements, and AI damage detection |
| **Sales tool** | Show homeowners exactly what's wrong with their roof using drone imagery |
| **Insurance supplement support** | AI-detected damage provides evidence for supplement claims |
| **Hiring advantage** | Sales reps don't need to climb roofs — broader talent pool |
| **Competitive differentiation** | "We use drone technology for precise inspections" is a strong marketing message |

**Estimated value:** A roofing company doing 50 inspections/month could save $5,000–$10,000/month in labor time and close 10–20% more jobs with better documentation.

### 4.2 For Insurance Companies

| Benefit | Impact |
|---------|--------|
| **Fraud detection** | AI-consistent assessments make inflated claims immediately obvious |
| **Standardized assessments** | Same AI model, same criteria — eliminates adjuster subjectivity |
| **Before/after documentation** | Timestamped, geolocated imagery for claims verification |
| **Faster claims processing** | Drone inspection in 15 minutes vs. 1–2 hour adjuster visit |
| **Scalability after catastrophe** | Deploy drone fleet rapidly vs. waiting for adjuster availability |
| **Reduced litigation** | Objective evidence reduces disputes and lawsuit frequency |
| **Underwriting data** | Roof condition data supports accurate pricing and risk assessment |
| **Cost savings** | Estimated 15–30% reduction in claims processing costs |

**Estimated value:** A mid-size Florida carrier processing 50,000 roof claims/year could save $10–30M annually through fraud reduction and efficiency gains.

### 4.3 For Regulators (DBPR, OIR, CFO)

| Benefit | Impact |
|---------|--------|
| **Objective third-party inspections** | Independent data not influenced by contractor or insurer bias |
| **Quote consistency benchmarking** | Compare contractor estimates against AI-generated fair estimates |
| **Consumer protection** | Homeowners get an unbiased assessment before committing to a contractor |
| **Fraud investigation tool** | Drone records provide evidence for prosecuting fraud cases |
| **Market stabilization data** | Aggregate roof condition data across the state |
| **Building code compliance** | Verify wind mitigation features, roof-to-wall connections |

### 4.4 For Homeowners

| Benefit | Impact |
|---------|--------|
| **Transparency** | See exactly what's on your roof via high-res imagery and 3D model |
| **Fair pricing** | AI-generated estimate provides benchmark against contractor quotes |
| **Insurance claim support** | Professional documentation strengthens claim submissions |
| **Preventive maintenance** | Identify issues before they become expensive problems |
| **Negotiating power** | Objective data prevents being pressured into unnecessary work |
| **Peace of mind** | Know the true condition of your roof without trusting a stranger on a ladder |

### 4.5 For HOAs / Property Management

| Benefit | Impact |
|---------|--------|
| **Bulk assessment** | Inspect 100+ roofs in a single day across a community |
| **Consistent standards** | Same evaluation criteria for every unit |
| **Reserve planning** | Accurate data on remaining useful life for capital reserve studies |
| **Insurance negotiation** | Demonstrate community-wide roof condition for better group rates |
| **Compliance verification** | Ensure all units meet HOA architectural standards |
| **Maintenance prioritization** | Triage which roofs need immediate attention vs. monitoring |
| **Post-storm assessment** | Rapidly assess entire community after a hurricane |

**Key insight:** HOAs are a particularly strong target because they need bulk inspections, have budgets for professional services, and often also need security services (direct cross-sell with security robot business).

---

## 5. Regulatory & Consumer Protection Angle

### 5.1 Pitch to Florida Regulators

#### Florida DBPR (Department of Business and Professional Regulation)
- **Angle:** "Standardized drone inspections provide an objective verification layer for contractor estimates, helping DBPR identify contractors who consistently inflate scopes of work."
- **Specific value:** Aggregate data can flag contractors whose estimates consistently exceed AI-benchmarked fair estimates — early fraud detection.
- **Ask:** Partner program where licensed contractors using drone-verified estimates get expedited license renewals or preferred status.

#### Florida OIR (Office of Insurance Regulation)
- **Angle:** "Drone inspections standardize the claims process, reducing the subjective variability that drives litigation and market instability."
- **Specific value:** OIR has been focused on stabilizing the property insurance market. Objective inspection data directly supports this mission.
- **Ask:** Regulatory guidance encouraging (or requiring) drone-based inspections for claims above a threshold amount. Endorsement of drone inspection standards.

#### Florida CFO (Chief Financial Officer)
- **Angle:** "Drone inspections are a powerful fraud prevention tool. Timestamped, geolocated, AI-analyzed imagery makes it dramatically harder to manufacture or inflate roof damage claims."
- **Specific value:** The CFO's fraud division can use drone data as evidence in prosecutions. Pre- and post-storm imagery libraries are forensic goldmines.
- **Ask:** Include drone inspection technology in the CFO's fraud prevention toolkit. Fund pilot programs through the Division of Investigative and Forensic Services.

### 5.2 Standardized Inspection Reports as Fraud Prevention

A standardized drone inspection report should include:

1. **Property identification** — Address, GPS coordinates, aerial photo with parcel boundaries
2. **Roof metadata** — Material type, approximate age, total area, pitch, number of facets
3. **Condition assessment** — AI-classified damage with confidence scores
4. **Detailed photo documentation** — High-resolution images of every roof section with damage annotations
5. **3D model** — Interactive 3D reconstruction with measurement data
6. **Estimated repair/replacement cost** — Based on current material and labor rates (Florida-specific)
7. **Comparison to previous inspections** — Change detection if prior inspection exists
8. **Certification** — Inspected by licensed Part 107 pilot, processed by certified AI system, date/time/GPS stamped

This creates an **auditable, repeatable, defensible** inspection standard.

### 5.3 Potential for Mandatory Third-Party Drone Inspection

**Current opportunity:** Florida could mandate or incentivize third-party drone inspections:

- **Before insurance payout** (claims >$10,000): Independent drone inspection verifies contractor scope of work
- **For roof certification** (25-year rule): Drone inspection replaces or supplements manual inspection
- **For My Safe Florida Home** inspections: Drone-based wind mitigation verification
- **Post-storm community assessments**: County/state contracts for rapid damage assessment

**Legislative pathway:**
1. Pilot program in Hillsborough/Pinellas County (Tampa Bay)
2. Partner with Citizens Property Insurance as early adopter
3. Build data showing fraud reduction and cost savings
4. Propose bill in Florida Legislature mandating drone-verified inspections for claims above threshold
5. Expand to other hurricane-prone states

### 5.4 Public-Private Partnership Opportunities

| Partner | Opportunity |
|---------|------------|
| **Citizens Property Insurance** | Preferred drone inspection vendor for the state's largest insurer |
| **My Safe Florida Home Program** | Provide drone-based wind mitigation inspections |
| **Florida Division of Emergency Management** | Post-hurricane rapid damage assessment contracts |
| **Hillsborough/Pinellas County** | Building code enforcement and inspection verification |
| **Tampa Bay Regional Planning Council** | Community resilience and hurricane preparedness programs |
| **FEMA** | Post-disaster damage assessment (Preliminary Damage Assessment support) |
| **Florida Building Commission** | Develop standards for drone-based building inspections |

### 5.5 Model for Other States

Florida is the ideal proving ground, but the model scales to:
- **Louisiana** — Hurricane-prone, similar fraud issues
- **Texas** — Massive hail belt, significant roof claim volume
- **Colorado** — Major hail damage market
- **Oklahoma/Kansas** — Tornado and hail belt
- **Carolinas** — Hurricane exposure
- **Puerto Rico** — Ongoing hurricane recovery

**National potential:** Every state with significant weather-related property damage has the same fundamental problems. Florida's regulatory solutions become a template.

---

## 6. Technical Requirements

### 6.1 Camera Specifications

#### Minimum Viable Camera
| Spec | Requirement | Rationale |
|------|------------|-----------|
| **Resolution** | 20MP minimum, 48MP+ preferred | Need to resolve individual shingle granules, hairline cracks |
| **Sensor size** | 1" minimum, 4/3" preferred | Larger sensor = better low-light performance, dynamic range |
| **Lens** | 24mm equivalent (84° FOV) | Wide enough for context, not so wide that edges distort |
| **Video** | 4K60 minimum | For continuous capture during flight |
| **Photo format** | RAW (DNG) + JPEG | RAW needed for post-processing and AI analysis |
| **Gimbal** | 3-axis stabilized, -90° to +30° tilt | Need nadir (straight down) and oblique angles |
| **GPS tagging** | Every image geotagged with GPS + altitude | Required for photogrammetry and georeferencing |

#### Recommended Camera Systems
| Camera/Drone | Resolution | Sensor | Price Point | Notes |
|-------------|-----------|--------|------------|-------|
| DJI Mavic 3 Enterprise | 20MP (wide) + 12MP (tele) | 4/3" CMOS | ~$4,000 | Industry standard for roof inspection |
| DJI Matrice 30T | 48MP wide + 5-16MP zoom | 1/2" CMOS | ~$10,000 | Thermal + visual, enterprise-grade |
| Sony A7R IV (custom mount) | 61MP | Full frame | Custom | Maximum resolution for custom builds |
| DJI Zenmuse P1 (on M300/M350) | 45MP | Full frame | ~$6,000 (camera) | Professional surveying grade |

#### For ArduPilot Custom Build
- **Recommended:** Sony RX0 II (15.3MP, 1" sensor, compact) or Sony A6xxx series on custom gimbal
- **Alternative:** Raspberry Pi HQ Camera (12.3MP, needs good lens) for cost-effective builds
- **Gimbal:** Storm32 or SimpleBGC-based 3-axis gimbal (open-source control)
- **Trigger:** ArduPilot camera trigger via PWM/relay, timed to capture at calculated intervals

#### Thermal Camera (Optional but Valuable)
- **FLIR Lepton 3.5** (embedded, 160x120) or **FLIR Boson** (320x256/640x512) for detecting:
  - Moisture intrusion (wet insulation shows thermal signature)
  - Missing insulation
  - Electrical hotspots
  - Delamination in flat roofs

### 6.2 Flight Patterns for Complete Roof Coverage

#### Standard Residential Roof Survey Pattern

```
1. TAKEOFF — Launch from street/driveway (clear of obstacles)
2. CLIMB — Ascend to 80-100 feet AGL for overview shots
3. OVERVIEW ORBIT — Circle the property at 80-100ft, capturing 4-8 oblique images (all sides)
4. NADIR GRID — Descend to 30-40ft above highest roof point
   - Fly grid pattern over roof footprint
   - 70% forward overlap, 60% side overlap
   - Camera pointing straight down (-90°)
5. OBLIQUE PASSES — Fly each roof edge at 20-30ft offset, 45° camera angle
   - Captures gutters, fascia, flashing details
   - 4 passes minimum (one per cardinal direction)
6. DETAIL HOVER — If AI flags potential damage during flight, hover at 10-15ft for close-up
7. RTL — Return to launch
```

#### Flight Parameters
| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Survey altitude (nadir) | 30–40 ft above roof | 0.1–0.15 cm/pixel GSD at 20MP |
| Survey altitude (oblique) | 20–30 ft from roof edge | Detail capture of edges, flashing |
| Forward overlap | 70–80% | Ensures photogrammetry success |
| Side overlap | 60–70% | Full coverage, no gaps |
| Flight speed | 3–5 mph | Avoid motion blur at high resolution |
| Camera trigger | Distance-based (2-3m intervals) | Consistent overlap |
| Total images | 150–400 per residential roof | Depends on roof size/complexity |
| Flight time | 8–15 minutes per house | Within single-battery capacity |
| GSD target | < 0.2 cm/pixel | Can resolve individual shingle tabs |

#### ArduPilot Mission Planning

ArduPilot's Mission Planner and QGroundControl both support Survey (Grid) missions natively:

1. **Define survey area:** Draw polygon around roof footprint (can use satellite imagery for pre-planning)
2. **Set camera parameters:** Enter sensor size, focal length, image resolution → auto-calculates overlap spacing
3. **DO_SET_CAM_TRIGG_DIST:** Auto-triggers camera at calculated intervals
4. **DO_SET_ROI:** Point camera/gimbal at center of roof for oblique passes
5. **Terrain following:** Use SRTM/DTED terrain data + LiDAR altimeter for consistent AGL height over pitched roofs
6. **Obstacle avoidance:** Essential for residential environments (trees, power lines, antennas)

**Custom Development Needed:**
- Roof footprint auto-detection from satellite/aerial imagery (pre-mission planning)
- Adaptive flight planning based on roof geometry (steep pitch = different altitude)
- Real-time AI during flight to flag areas needing closer inspection
- Integration with post-processing pipeline (automatic upload → ODM → AI → report)

### 6.3 AI Model Training Requirements

#### Dataset Needs
| Category | Minimum | Production | Source |
|----------|---------|-----------|--------|
| Roof images (undamaged) | 2,000 | 20,000+ | Self-collected, aerial imagery providers |
| Hail damage | 1,000 | 10,000+ | Insurance company partnerships, post-storm surveys |
| Wind damage | 1,000 | 10,000+ | Same |
| Missing/cracked shingles | 1,000 | 10,000+ | Common, easier to collect |
| Tile damage | 500 | 5,000+ | Florida-specific priority |
| Flashing/vent damage | 500 | 5,000+ | Harder to annotate |
| Age/wear patterns | 2,000 | 20,000+ | Material aging classification |
| Material types | 1,000 per type | 5,000+ per type | Shingle, tile, metal, flat |

#### Model Architecture Recommendations
1. **Stage 1 — Roof segmentation:** Segment Anything Model (SAM) fine-tuned for roof facets
2. **Stage 2 — Material classification:** EfficientNet-B4 trained on roof material types
3. **Stage 3 — Damage detection:** YOLOv8-L for object detection of damage instances
4. **Stage 4 — Severity scoring:** Custom classifier on detected damage regions
5. **Stage 5 — Measurement extraction:** OpenDroneMap 3D reconstruction → custom geometry analysis

#### Training Infrastructure
- **Initial training:** Cloud GPU (AWS p3.2xlarge or similar) — ~$3/hour
- **Inference:** Edge deployment on NVIDIA Jetson Orin (can run on drone or ground station)
- **Model size target:** <100MB for edge deployment, larger models for cloud post-processing

### 6.4 Integration with Estimation Software

| Platform | Integration Type | Priority |
|----------|-----------------|----------|
| **Xactimate (Verisk)** | Export damage scope in ESX format | 🔴 Critical — industry standard for insurance |
| **CompanyCam** | Photo sync + annotations | 🟡 High — popular with contractors |
| **AccuLynx** | CRM integration for roofing companies | 🟡 High |
| **JobNimbus** | Project management integration | 🟡 High |
| **Roofr** | Measurement + estimate sync | 🟢 Medium |
| **Hover** | Measurement comparison/validation | 🟢 Medium |
| **Google Earth/Maps** | Property identification + pre-planning | 🟢 Medium |
| **Symbility (CoreLogic)** | Alternative to Xactimate for claims | 🟢 Medium |

### 6.5 Report Generation

#### Automated Report Contents

```
1. COVER PAGE
   - Property address, date, inspector info
   - Aerial overview photo with property boundaries
   
2. EXECUTIVE SUMMARY
   - Overall roof condition score (1-100)
   - Estimated remaining useful life
   - Recommended action (maintenance/repair/replacement)
   - Estimated cost range
   
3. ROOF SPECIFICATIONS
   - Total area (sq ft)
   - Pitch/slope (per facet)
   - Material type and estimated age
   - Number of facets, ridges, valleys, hips
   - Penetrations inventory (vents, skylights, etc.)
   
4. CONDITION ASSESSMENT
   - AI damage detection results with confidence scores
   - Annotated photos for each finding
   - Heat map showing damage distribution
   - Material wear analysis
   
5. MEASUREMENT DETAILS
   - Per-facet area breakdown
   - Ridge, hip, valley, eave, rake linear measurements
   - Waste factor calculation
   - 3D model renderings
   
6. COST ESTIMATE
   - Itemized materials estimate (using current FL pricing)
   - Labor estimate
   - Permit/dumpster/overhead allowances
   - Total replacement cost range
   - Comparison to typical insurance estimate
   
7. PHOTO GALLERY
   - All captured images organized by roof section
   - Damage close-ups with annotations
   - Overview images from all angles
   
8. CERTIFICATION
   - Part 107 pilot license number
   - Drone serial number and calibration date
   - AI model version and confidence metrics
   - GPS coordinates and timestamps
   - Digital signature
```

**Output formats:** PDF (primary), JSON (API), ESX (Xactimate), CSV (data export)

---

## 7. Business Model for Roof Inspection

### 7.1 Revenue Streams

#### A. Per-Inspection Pricing

| Service Tier | Price | Includes |
|-------------|-------|----------|
| **Basic Inspection** | $150–$250 | Drone flight + photos + measurements + PDF report |
| **Standard Inspection** | $250–$400 | Basic + AI damage detection + condition assessment + cost estimate |
| **Premium Inspection** | $400–$600 | Standard + thermal imaging + 3D model + Xactimate export |
| **Emergency/Storm** | $300–$500 | Standard inspection with 24-hour turnaround post-storm |
| **Re-inspection** | $100–$150 | Follow-up inspection (e.g., post-repair verification) |

**Revenue potential:** At 10 inspections/day, 250 working days/year = 2,500 inspections/year × $300 avg = **$750,000/year per drone team**.

#### B. Subscription Model for Roofing Companies

| Tier | Monthly Price | Included Inspections | Per-Additional |
|------|-------------|---------------------|----------------|
| **Starter** | $499/mo | 10 inspections | $40/each |
| **Professional** | $999/mo | 30 inspections | $30/each |
| **Enterprise** | $2,499/mo | Unlimited | Included |

**Target:** 50 roofing company subscribers in Tampa Bay = $600K–$1.5M ARR.

#### C. Insurance Company Contracts

| Contract Type | Pricing Model | Estimated Value |
|--------------|---------------|-----------------|
| **Per-claim inspection** | $200–$350 per inspection | Volume-dependent |
| **Catastrophe response** | $150–$250/inspection + mobilization fee | Surge pricing after storms |
| **Underwriting data** | $50–$100/property for condition scoring | Mass assessment |
| **Annual portfolio assessment** | Custom pricing per policy count | Large contract value |

**Target:** 2–3 insurance carrier contracts = $1–5M ARR.

#### D. Municipal/County Contracts

| Use Case | Pricing | Potential |
|----------|---------|-----------|
| **Building code enforcement** | $100–$200/inspection | Code violation verification |
| **Post-disaster assessment** | Per-property + mobilization | FEMA-reimbursable |
| **Community resilience programs** | Grant-funded | My Safe Florida Home inspections |
| **Tax assessment verification** | Bulk pricing | Property appraiser data |

**Target:** Hillsborough + Pinellas County contracts = $200K–$500K/year.

#### E. HOA/Community Bulk Inspections

| Community Size | Per-Unit Price | Total |
|---------------|---------------|-------|
| 50–100 units | $120–$180/unit | $6,000–$18,000 per community |
| 100–500 units | $80–$120/unit | $8,000–$60,000 per community |
| 500+ units | $50–$80/unit | $25,000–$40,000+ per community |

**Target:** 20 HOA contracts/year in Tampa Bay = $200K–$500K/year.

### 7.2 Cost Structure

#### Per-Inspection Variable Costs
| Cost Item | Amount | Notes |
|-----------|--------|-------|
| Pilot labor | $30–$50 | 30-45 min including travel |
| Vehicle/fuel | $10–$15 | Travel to inspection site |
| Drone wear/maintenance | $5–$10 | Amortized over 500+ flights |
| Cloud processing | $2–$5 | AI inference + report generation |
| Insurance | $3–$5 | Liability insurance per-flight allocation |
| **Total variable cost** | **$50–$85** | |

#### Monthly Fixed Costs (Tampa Bay Operation)
| Cost Item | Monthly | Annual |
|-----------|---------|--------|
| Office/warehouse | $2,000 | $24,000 |
| Drone fleet (5 drones, amortized) | $1,500 | $18,000 |
| Software/cloud infrastructure | $2,000 | $24,000 |
| Insurance (E&O, general liability) | $1,000 | $12,000 |
| Marketing/sales | $3,000 | $36,000 |
| Admin/legal | $1,500 | $18,000 |
| Part 107 pilot team (3 FTE) | $15,000 | $180,000 |
| AI/engineering (2 FTE, shared w/ security) | $10,000 | $120,000 |
| Management (1 FTE) | $8,000 | $96,000 |
| **Total fixed costs** | **~$44,000** | **~$528,000** |

#### Unit Economics
- **Average revenue per inspection:** $300
- **Variable cost per inspection:** $70
- **Contribution margin:** $230 (77%)
- **Break-even:** ~2,300 inspections/year (~190/month)
- **At 5,000 inspections/year:** Revenue $1.5M, Gross Profit $1.15M, Net Profit ~$620K (41% margin)

### 7.3 Scaling Strategy

#### Phase 1: Tampa Bay Launch (Months 1–12)
- 2 drone teams, 1 AI engineer
- Target: 100–200 inspections/month
- Revenue target: $360K–$720K Year 1
- Focus: Roofing company subscriptions + direct homeowner inspections
- Build training dataset from every inspection

#### Phase 2: Tampa Bay Expansion + Insurance (Months 12–24)
- 5 drone teams, expanded AI capabilities
- Target: 500+ inspections/month
- Revenue target: $1.5M–$2.5M Year 2
- Add: Insurance company contracts, HOA bulk inspections
- Launch: Municipal partnerships

#### Phase 3: Statewide Florida (Months 24–36)
- Expand to Miami, Orlando, Jacksonville, Fort Myers
- 15–20 drone teams statewide
- Revenue target: $5M–$8M Year 3
- Add: Catastrophe response capability, regulatory partnerships

#### Phase 4: Multi-State / National (Months 36–48)
- Expand to Texas, Louisiana, Carolinas, Colorado
- License/franchise model or direct operations
- Revenue target: $15M–$25M Year 4
- Potential: Strategic acquisition target for EagleView, Verisk, or insurance carrier

---

## 8. Synergies with Security Robot Business

### 8.1 Shared Drone Platform & Maintenance

| Shared Component | Security Robot | Roof Inspection | Synergy |
|-----------------|---------------|-----------------|---------|
| ArduPilot flight controller | ✅ | ✅ | Same firmware, same config tools |
| Drone airframe | Patrol-optimized | Survey-optimized | 80% shared components, different payloads |
| Battery system | ✅ | ✅ | Same batteries, same charging infrastructure |
| GPS/RTK positioning | ✅ | ✅ | Shared base stations for RTK precision |
| Obstacle avoidance | ✅ | ✅ | Same LiDAR/stereo vision systems |
| Communications (LTE/mesh) | ✅ | ✅ | Same telemetry and data links |
| Ground control software | ✅ | ✅ | Shared GCS with mission-specific modules |
| Maintenance facility | ✅ | ✅ | Same workshop, same technicians |
| Part 107 pilots | ✅ | ✅ | Same licensed operators |

**Cost savings:** Shared platform reduces per-unit drone cost by 30–40% compared to maintaining two separate fleets.

### 8.2 Shared AI/ML Infrastructure

| AI Component | Security | Roof Inspection | Shared? |
|-------------|----------|-----------------|---------|
| Object detection framework | Person/vehicle detection | Damage detection | Same YOLOv8/Detectron2 base |
| Image classification | Threat classification | Material/damage classification | Same training pipeline |
| Computer vision preprocessing | Video stream analysis | Photo analysis | Same OpenCV pipeline |
| Edge inference (Jetson) | Real-time detection | On-drone analysis | Same hardware |
| Cloud processing | Alert management | Report generation | Same cloud infrastructure |
| Data pipeline | Video storage/indexing | Image storage/analysis | Same storage architecture |
| Model training infrastructure | ✅ | ✅ | Same GPU servers, same MLOps |
| Annotation tools | ✅ | ✅ | Same Label Studio instance |

**Cost savings:** Shared AI infrastructure saves $50K–$100K/year in compute and engineering costs.

### 8.3 Cross-Selling Opportunities

| Customer Has Security → | Upsell Roof Inspection |
|------------------------|----------------------|
| HOA with patrol contract | Annual community roof assessment |
| Commercial property with surveillance | Roof maintenance inspection quarterly |
| Construction site monitoring | Progress documentation + final roof inspection |
| Event security client | Venue roof/structure assessment |

| Customer Has Roof Inspection → | Upsell Security |
|-------------------------------|----------------|
| HOA with bulk roof assessment | Community patrol service |
| Property management company | Building perimeter monitoring |
| Insurance company using inspections | Construction site surveillance |
| Roofing contractor | Job site security (materials theft prevention) |

### 8.4 HOA as Ideal Combined Customer

HOAs are the **#1 cross-sell opportunity** because they need both services:

**Security needs:**
- Community perimeter patrol
- Common area monitoring
- Vehicle/pedestrian surveillance
- Incident response

**Roof inspection needs:**
- Annual/biannual community-wide roof assessment
- Post-storm damage assessment for all units
- Reserve study support (remaining useful life data)
- Insurance documentation for community policy
- Code compliance verification

**Combined pricing example:**
| Service | Standalone | Bundled |
|---------|-----------|---------|
| Security patrol (monthly) | $2,500 | $2,000 |
| Annual roof assessment (200 units) | $24,000 | $18,000 |
| **Annual total** | $54,000 | $42,000 |
| **Savings for HOA** | — | 22% |
| **Combined LTV** | — | $42K/year × 5+ years = $210K+ |

### 8.5 Revenue Diversification

| Benefit | Detail |
|---------|--------|
| **Seasonal balance** | Security is year-round; roof inspection peaks during/after hurricane season (June–November) and during peak roofing season (spring/fall) |
| **Revenue smoothing** | If one business has a slow month, the other compensates |
| **Market resilience** | Security demand is recession-resistant; roofing demand is storm/insurance-cycle driven |
| **Talent utilization** | Pilots and technicians can flex between services based on demand |
| **Customer stickiness** | Multi-service relationships have 3–5x lower churn than single-service |
| **Valuation premium** | Diversified drone services company commands higher multiple than single-use-case |

---

## 9. Competitive Landscape Summary

### Positioning Map

```
                    HIGH COST
                       |
    EagleView ●        |        ● Nearmap/Cape Analytics
    (full stack,       |        (aerial imagery + AI,
     enterprise)       |         insurance-focused)
                       |
  Loveland ●           |
  (drone + AI,         |
   mid-market)         |
                       |
LOW TECH ──────────────┼────────────────── HIGH TECH
                       |
   Hover ●             |         ● [OUR POSITION]
   (phone-based,       |         (ArduPilot drone + open-source AI
    no damage detect)  |          + fraud prevention focus
                       |          + security cross-sell)
   Roofr ●            |
   (satellite,         |
    lead gen)          |
                       |
                    LOW COST
```

### Our Competitive Advantages

1. **Open-source platform:** No vendor lock-in, lower hardware costs, fully customizable
2. **Fraud prevention angle:** Not just inspection — specifically positioned as anti-fraud tool for regulators and insurers
3. **Local Tampa Bay focus:** Competitors are national; we start with deep local market knowledge and relationships
4. **Combined security + inspection:** Unique dual-use platform that no competitor offers
5. **ArduPilot customization:** Can develop specialized flight patterns, custom payloads, and unique autonomy features
6. **Cost advantage:** Open-source stack vs. proprietary systems → 40–60% lower per-inspection cost
7. **Regulatory partnership:** Positioned as public-private partnership, not just commercial vendor

### Key Risks

| Risk | Mitigation |
|------|-----------|
| EagleView's massive data moat | Build FL-specific dataset rapidly; partner with local insurers |
| DJI ban/restrictions affecting competitors | ArduPilot-based = not dependent on DJI |
| FAA regulatory changes | Stay engaged with FAA; Part 107 is well-established |
| Insurance industry consolidation | Diversify across roofing companies, HOAs, municipalities |
| AI accuracy concerns | Conservative claims, transparent confidence scores, human review |
| Hurricane season variability | Diversify with non-storm services (maintenance inspections, certifications) |

---

## 10. Go-to-Market Recommendations

### Immediate Actions (Next 90 Days)

1. **Build prototype inspection workflow:**
   - ArduPilot drone with Sony camera → OpenDroneMap → YOLOv8 → PDF report
   - Complete 20–30 test inspections on friendly properties
   - Validate measurement accuracy against manual measurements

2. **Start building training dataset:**
   - Partner with 2–3 local roofing companies for access to roofs they're already working on
   - Annotate damage in every image captured
   - Target 1,000 annotated images in first 90 days

3. **Regulatory engagement:**
   - Schedule meetings with Hillsborough County building department
   - Connect with Florida CFO's fraud division
   - Attend Florida Roofing & Sheet Metal Contractors Association (FRSA) events

4. **First paying customers:**
   - Offer 10 free inspections to roofing companies → convert to subscribers
   - Target HOAs where we already have security relationships
   - Price at 30% below EagleView/Loveland to gain traction

### Year 1 Revenue Target

| Revenue Stream | Target | Annual Revenue |
|---------------|--------|---------------|
| Roofing company subscriptions (10 @ $999/mo) | $120K | $120,000 |
| Per-inspection (homeowners + overflow) | 1,000 × $300 | $300,000 |
| HOA bulk assessments (5 communities) | 5 × $15K avg | $75,000 |
| Insurance pilot program (1 carrier) | 500 × $250 | $125,000 |
| **Total Year 1** | | **$620,000** |

### Key Metrics to Track

| Metric | Target |
|--------|--------|
| Inspections per month | 100+ by Month 6 |
| AI damage detection accuracy | >85% by Month 6, >92% by Month 12 |
| Measurement accuracy vs. manual | Within 2% of actual |
| Customer NPS | >50 |
| Average revenue per inspection | >$275 |
| Customer acquisition cost | <$500 for roofing companies, <$100 for homeowners |
| Subscriber churn | <5% monthly |

---

## Appendix A: Regulatory References

| Law/Regulation | Reference | Relevance |
|---------------|-----------|-----------|
| Florida SB 4-D (2022) | Chapter 2022-269 | AOB reform, attorney fee reform |
| Florida HB 7065 (2023) | Property insurance reform | 1-year claims filing, anti-solicitation |
| FAA Part 107 | 14 CFR Part 107 | Commercial drone operations |
| Florida Building Code (FBC) | 7th Edition (2023) | Roof wind resistance requirements |
| Florida Statute 489 | Construction contractor licensing | DBPR contractor regulation |
| Florida Statute 626 | Insurance fraud statutes | Criminal penalties for insurance fraud |
| My Safe Florida Home Program | FS 215.5586 | State-funded wind mitigation inspections |

## Appendix B: Key Contacts for Tampa Bay Launch

| Organization | Contact Purpose |
|-------------|----------------|
| Hillsborough County Building Services | Building code inspection partnership |
| Pinellas County Building Department | Same |
| Citizens Property Insurance | Pilot program for drone inspections |
| Florida DBPR (Tallahassee) | Contractor oversight partnership |
| FRSA (Florida Roofing Association) | Industry relationships, trade shows |
| Tampa Bay Builders Association | Builder/contractor network |
| Community Associations Institute (CAI) FL | HOA management company connections |
| Florida Office of Insurance Regulation | Regulatory endorsement |

## Appendix C: Technology Stack Summary

```
FLIGHT LAYER
├── ArduPilot Copter (flight controller firmware)
├── Mission Planner / QGroundControl (mission planning)
├── Custom survey pattern generator (roof-specific)
├── Obstacle avoidance (LiDAR + stereo vision)
└── RTK GPS (centimeter-level positioning)

CAPTURE LAYER
├── High-resolution camera (20-48MP, gimbaled)
├── Optional: FLIR thermal camera
├── DO_SET_CAM_TRIGG_DIST (ArduPilot camera trigger)
├── Geotagged RAW + JPEG capture
└── Real-time image preview to ground station

PROCESSING LAYER
├── OpenDroneMap (photogrammetry → 3D model + orthophoto)
├── YOLOv8 / Detectron2 (damage detection)
├── EfficientNet (material classification)
├── Custom geometry analysis (measurements from 3D model)
├── Segment Anything (SAM) (roof facet segmentation)
└── Edge inference: NVIDIA Jetson Orin

REPORTING LAYER
├── Automated PDF generation (ReportLab / WeasyPrint)
├── 3D model viewer (web-based, Three.js)
├── Xactimate ESX export
├── Customer portal (web app)
└── API for insurance company integration

DATA LAYER
├── PostgreSQL + PostGIS (property data, inspection records)
├── S3-compatible object storage (images, 3D models)
├── Label Studio (annotation for model training)
├── MLflow (model versioning and tracking)
└── Grafana (operations monitoring)
```

---

*This report was compiled from public sources, industry data, and direct research of competitor offerings. Financial projections are estimates based on market analysis and should be validated with actual market testing. All figures are approximate and subject to market conditions.*
