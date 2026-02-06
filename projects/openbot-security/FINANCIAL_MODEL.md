# Financial Model — "Quit the Job" Scenario

**Goal:** What contract size funds viable deployment + $200K/year surplus for Dr. Castro?

---

## Fixed Annual Costs (Operating the Business)

| Expense | Monthly | Annual | Notes |
|---------|---------|--------|-------|
| General liability insurance | $700 | $8,400 | Robot operations, commercial use |
| E&O / Cyber insurance | $400 | $4,800 | For tech/SaaS component |
| Software/hosting (dashboard, MQTT, storage) | $200 | $2,400 | Self-hosted to start, scales with clients |
| Cellular data plans (robots) | $15/robot | Varies | Per-robot, ~$180/yr each |
| Vehicle (service calls, installs) | $500 | $6,000 | Gas, maintenance, insurance |
| Tools & replacement parts | $200 | $2,400 | Ongoing maintenance stock |
| Accounting / bookkeeping | $200 | $2,400 | QuickBooks + quarterly CPA |
| Legal (LLC maintenance, contracts) | $150 | $1,800 | Annual filing, template contracts |
| Marketing / website | $200 | $2,400 | SEO, basic digital presence |
| Misc / contingency | $300 | $3,600 | Buffer |
| **Total Fixed Overhead** | **~$2,850** | **~$34,200** | Before robot hardware costs |

---

## Team Compensation — 4-Person Model

Assuming JV structure: Dr. Castro + wife, Neighbor + wife

### Roles
| Person | Role | Focus |
|--------|------|-------|
| **Dr. Castro** | CTO / Co-Founder | Engineering, product, AI, robot builds |
| **Mrs. Castro** | Comms / Marketing / Sales | Client relations, HOA pitches, social media, community outreach |
| **Neighbor** | COO / Co-Founder | Security operations, client acquisition, installations, industry expertise |
| **Neighbor's Wife** | Admin / Operations | Scheduling, billing, customer support, office management |

### Scenario 1: Full Salary (Comfortable — needs more revenue)

| Person | Salary | Payroll Tax (~10% employer side) | Benefits/Health | Total Cost |
|--------|--------|--------------------------------|-----------------|------------|
| Dr. Castro | $200,000 | $20,000 | $7,200 | $227,200 |
| Mrs. Castro | $65,000 | $6,500 | $7,200 | $78,700 |
| Neighbor | $120,000 | $12,000 | $7,200 | $139,200 |
| Neighbor's Wife | $50,000 | $5,000 | $7,200 | $62,200 |
| **Total Compensation** | **$435,000** | **$43,500** | **$28,800** | **$507,300** |

### Scenario 2: Lean Startup (Lower salaries + equity upside)

| Person | Salary | Payroll Tax | Benefits | Total Cost |
|--------|--------|-------------|----------|------------|
| Dr. Castro | $120,000 | $12,000 | $7,200 | $139,200 |
| Mrs. Castro | $45,000 | $4,500 | $7,200 | $56,700 |
| Neighbor | $80,000 | $8,000 | $7,200 | $95,200 |
| Neighbor's Wife | $40,000 | $4,000 | $7,200 | $51,200 |
| **Total Compensation** | **$285,000** | **$28,500** | **$28,800** | **$342,300** |

### Scenario 3: Bootstrap Phase (Minimal draw, heavy equity)

| Person | Salary | Payroll Tax | Benefits | Total Cost |
|--------|--------|-------------|----------|------------|
| Dr. Castro | $85,000 | $8,500 | $7,200 | $100,700 |
| Mrs. Castro | $35,000 | $3,500 | $7,200 | $45,700 |
| Neighbor | $60,000 | $6,000 | $7,200 | $73,200 |
| Neighbor's Wife | $30,000 | $3,000 | $7,200 | $40,200 |
| **Total Compensation** | **$210,000** | **$21,000** | **$28,800** | **$259,800** |

---

## Total Annual Nut to Crack (All 3 Scenarios)

| | Scenario 1 (Full) | Scenario 2 (Lean) | Scenario 3 (Bootstrap) |
|---|---|---|---|
| Team compensation | $507,300 | $342,300 | $259,800 |
| Fixed overhead | $34,200 | $34,200 | $34,200 |
| **Total needed** | **$541,500/year** | **$376,500/year** | **$294,000/year** |
| **Monthly revenue target** | **$45,125** | **$31,375** | **$24,500** |

---

## Revenue Scenarios

### Scenario A: Managed Service (Highest Revenue Per Client)

Using the managed service model (turnkey: install + maintain + monitor):

| Client Type | Monthly Fee | Annual Revenue | Robot Cost (upfront) |
|-------------|------------|----------------|---------------------|
| Residential (2 ground + 1 drone) | $349-499/mo | $4,188-5,988 | ~$1,500 |
| Small Commercial (4 ground + 2 drones) | $799-1,299/mo | $9,588-15,588 | ~$3,500 |
| Large Commercial (8 ground + 4 drones) | $2,499-4,999/mo | $29,988-59,988 | ~$8,000 |

**To hit $272K/year with managed service:**

| Mix | Clients Needed | Monthly Revenue | Annual Revenue | Year 1 Hardware Investment |
|-----|---------------|----------------|----------------|---------------------------|
| All residential ($499/mo) | 46 clients | $22,954 | $275,448 | ~$69,000 |
| All small commercial ($999/mo) | 23 clients | $22,977 | $275,724 | ~$80,500 |
| All large commercial ($2,499/mo) | 10 clients | $24,990 | $299,880 | ~$80,000 |
| **Realistic mix** | **See below** | | | |

#### Realistic Mix to Hit $272K:
| Segment | Qty | Monthly/Each | Monthly Total | Annual |
|---------|-----|-------------|---------------|--------|
| HOA Pro ($499/mo) | 10 | $499 | $4,990 | $59,880 |
| Small Commercial ($999/mo) | 8 | $999 | $7,992 | $95,904 |
| Large Commercial ($2,499/mo) | 4 | $2,499 | $9,996 | $119,952 |
| **TOTAL** | **22 clients** | | **$22,978** | **$275,736** ✅ |

**Hardware investment for 22 clients:** ~$85,000-110,000 (one-time, amortized over 3-year contracts)

---

### Scenario B: Hybrid Model (Hardware Sale + SaaS — Lower Barrier)

Customer buys robots, pays monthly SaaS:

| Sale | Revenue |
|------|---------|
| Starter Bundle (1 ground + 1 drone) | $999 hardware + $79/mo SaaS |
| Pro Bundle (2 ground + 1 drone) | $1,499 hardware + $79/mo SaaS |
| HOA Bundle (4 ground + 2 drones) | $3,499 hardware + $499/mo SaaS |

**To hit $272K/year with hybrid:**

| Segment | Qty | Hardware (one-time) | SaaS Monthly | Annual SaaS | Total Year 1 |
|---------|-----|--------------------|--------------| ------------|-------------|
| Residential ($999 + $79/mo) | 30 | $29,970 | $2,370 | $28,440 | $58,410 |
| HOA ($3,499 + $499/mo) | 12 | $41,988 | $5,988 | $71,856 | $113,844 |
| Commercial ($5,999 + $999/mo) | 8 | $47,992 | $7,992 | $95,904 | $143,896 |
| **TOTAL** | **50 clients** | **$119,950** | **$16,350** | **$196,200** | **$316,150** ✅ |

Year 2+ (SaaS only, no new hardware): **$196,200** — need to keep growing.
Year 1 includes hardware windfalls but requires more clients.

---

### Scenario C: The Fastest Path — A Few Big Contracts

**The neighbor's security company is the shortcut.** If he has commercial clients:

| Contract | Details | Monthly | Annual |
|----------|---------|---------|--------|
| 1 large HOA (200+ homes) | 6 ground + 2 drones, managed | $1,499/mo | $17,988 |
| 1 commercial property mgmt co. (3 sites) | 12 ground + 4 drones, managed | $3,999/mo | $47,988 |
| 2 construction companies (rotating sites) | 4 ground + 2 drones each, managed | $1,999/mo × 2 | $47,976 |
| 3 mid-size HOAs (80-150 homes each) | 4 ground + 1 drone each, managed | $799/mo × 3 | $28,764 |
| 5 residential estates | 2 ground + 1 drone each, managed | $349/mo × 5 | $20,940 |
| **Roof inspection add-on** | 200 inspections/yr × $150 avg | — | $30,000 |
| **TOTAL** | **~12 contracts** | | **$193,656** |

Gap to $272K: **$78,344** → need ~7 more mid-tier clients OR scale roof inspections.

#### The Magic Number: ~15-25 Contracts

**With a blended average contract of $12,000-18,000/year, you need 15-25 clients to hit the $272K target.**

---

## The Realistic "Quit Plan" Timeline

| Phase | Timeline | Revenue | Cumulative |
|-------|----------|---------|------------|
| **Build prototype** | Months 1-3 | $0 | Keep day job |
| **Pilot (free) with neighbor's clients** | Months 4-6 | $0 | Keep day job |
| **First 3-5 paying clients** | Months 7-9 | $3-5K/mo | Keep day job, validate |
| **Scale to 10-12 clients** | Months 10-14 | $10-15K/mo | **Approach quit threshold** |
| **Hit 15-20 clients** | Months 15-18 | $18-25K/mo | **$200K+ annualized → QUIT** |
| **Scale to 25+ clients** | Months 19-24 | $25-35K/mo | Hire first employee |

**Conservative estimate: 15-18 months from today to safely quit, assuming neighbor partnership provides warm leads.**

---

## The Single Contract That Changes Everything

If you could land **ONE large property management company** with multiple sites:

| Contract | Sites | Robots | Monthly | Annual |
|----------|-------|--------|---------|--------|
| Property mgmt co. (10 sites) | 10 | 40 ground + 10 drones | $8,000-15,000 | $96,000-180,000 |

That single contract + 5-8 smaller HOA/residential contracts = **quit territory**.

**This is why the neighbor partnership is critical** — he likely has exactly these connections.

---

---

## Revised Scenarios: 4-Person Team

### Contracts Needed by Scenario (Managed Service, Blended Avg $15K/yr per contract)

| Scenario | Annual Target | Contracts @ $15K avg | Contracts @ $25K avg | Monthly Revenue |
|----------|--------------|---------------------|---------------------|----------------|
| **Full Salary** | $541,500 | 37 contracts | 22 contracts | $45,125 |
| **Lean Startup** | $376,500 | 26 contracts | 16 contracts | $31,375 |
| **Bootstrap** | $294,000 | 20 contracts | 12 contracts | $24,500 |

### Realistic Mix to Hit Each Scenario

#### Bootstrap ($294K — all 4 people employed, modest salaries)
| Segment | Qty | Monthly/Each | Annual |
|---------|-----|-------------|--------|
| HOA Pro | 8 | $499 | $47,904 |
| Small Commercial | 6 | $999 | $71,928 |
| Large Commercial | 3 | $2,499 | $89,964 |
| Construction Sites | 4 | $1,499 | $71,952 |
| Roof Inspections | 100/yr | $150 ea | $15,000 |
| **TOTAL** | **21 clients + inspections** | | **$296,748** ✅ |

#### Lean Startup ($376K — solid salaries, room to grow)
| Segment | Qty | Monthly/Each | Annual |
|---------|-----|-------------|--------|
| HOA Pro | 12 | $499 | $71,856 |
| Small Commercial | 8 | $999 | $95,904 |
| Large Commercial | 4 | $2,499 | $119,952 |
| Construction Sites | 4 | $1,499 | $71,952 |
| Roof Inspections | 150/yr | $150 ea | $22,500 |
| **TOTAL** | **28 clients + inspections** | | **$382,164** ✅ |

#### Full Salary ($541K — Dr. Castro at $200K, everyone comfortable)
| Segment | Qty | Monthly/Each | Annual |
|---------|-----|-------------|--------|
| HOA Pro | 15 | $499 | $89,820 |
| Small Commercial | 10 | $999 | $119,880 |
| Large Commercial | 5 | $2,499 | $149,940 |
| Construction Sites | 6 | $1,499 | $107,928 |
| Roof Inspections | 200/yr | $150 ea | $30,000 |
| Property Mgmt Co. (whale) | 1 | $5,000 | $60,000 |
| **TOTAL** | **37 clients + inspections + 1 whale** | | **$557,568** ✅ |

### Hardware Investment Needed (Fleet Size)

| Scenario | Ground Robots | Drones | Est. Hardware Cost |
|----------|--------------|--------|-------------------|
| Bootstrap (21 clients) | ~50 | ~15 | $45-65K |
| Lean (28 clients) | ~70 | ~22 | $65-90K |
| Full (37+ clients) | ~100 | ~30 | $90-130K |

---

## The Whale Strategy

**One large property management company or HOA management firm changes everything:**

| Whale Type | Sites/Properties | Fleet | Monthly | Annual |
|------------|-----------------|-------|---------|--------|
| HOA management firm (Castle Group, FirstService) | 20 communities | 80 ground + 20 drones | $15-25K | $180-300K |
| Commercial property mgmt | 15 sites | 60 ground + 15 drones | $12-20K | $144-240K |
| National roofing company (Tampa ops) | 500+ inspections/yr | 3-5 drones | — | $75-100K |

**1 whale + 10 smaller contracts = Full salary scenario covered.**

---

## Summary: What You Need (4-Person Team)

| Question | Bootstrap | Lean | Full |
|----------|-----------|------|------|
| **Annual revenue target** | $294K | $376K | $541K |
| **Monthly revenue** | $24.5K | $31.4K | $45.1K |
| **Contracts needed** | ~20 | ~28 | ~37 |
| **Hardware investment** | ~$50K | ~$75K | ~$110K |
| **Dr. Castro salary** | $85K | $120K | $200K |
| **Total team payroll** | $210K | $285K | $435K |
| **Timeline to quit (estimated)** | 12-15 months | 18-22 months | 22-28 months |
| **With a whale contract** | 8-12 months | 12-16 months | 16-22 months |

### Recommended Path
1. **Start bootstrap** — both couples take modest draws ($210K total payroll)
2. **Neighbor keeps security company running** — provides revenue stability + client pipeline  
3. **Dr. Castro keeps day job** through pilot phase (months 1-6)
4. **Mrs. Castro starts part-time** — social media, HOA outreach, building pipeline
5. **Once hitting $25K/mo** — Dr. Castro quits, goes full-time
6. **Scale salaries with revenue** — graduated raises tied to contract milestones
