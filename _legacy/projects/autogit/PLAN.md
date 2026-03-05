# AutoGit Project Plan

**Vision**: AI-first GitLab fork managed by MoltBot with end-to-end automated development lifecycle

**Core Philosophy**: AI as the leverage point, humans in the loop where it matters

---

## 1. Project Overview

### What We're Building
A self-hosted, AI-managed development platform combining:
- **Forked GitLab** - Customized source control & CI/CD platform
- **MoltBot AutoGit** - New feature module for autonomous development lifecycle management
- **Vagrant Sandboxes** - Ephemeral, isolated environments for safe AI execution

### Key Capabilities
1. **Autonomous Development** - AI writes, tests, and refines code
2. **Smart Deployment** - Automated staging → production pipelines
3. **Intelligent Monitoring** - Log analysis with anomaly detection
4. **Auto Bug Fixing** - Detect issues from logs, generate fixes, redeploy
5. **Human Checkpoints** - Strategic approval gates for high-risk actions

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        AUTOGIT PLATFORM                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   GitLab     │    │   MoltBot    │    │  Monitoring  │      │
│  │   (Forked)   │◄──►│   AutoGit    │◄──►│   Stack      │      │
│  │              │    │   Module     │    │              │      │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘      │
│         │                   │                   │               │
│         ▼                   ▼                   ▼               │
│  ┌──────────────────────────────────────────────────────┐      │
│  │              Vagrant Sandbox Pool                     │      │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐     │      │
│  │  │ Dev VM  │ │ Test VM │ │Stage VM │ │ Fix VM  │     │      │
│  │  │(Claude) │ │(Claude) │ │(Deploy) │ │(Claude) │     │      │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘     │      │
│  └──────────────────────────────────────────────────────┘      │
│                                                                 │
│  ┌──────────────────────────────────────────────────────┐      │
│  │              Human Review Interface                   │      │
│  │  • PR Approvals  • Deploy Gates  • Incident Alerts   │      │
│  └──────────────────────────────────────────────────────┘      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Component Breakdown

### 3.1 GitLab Fork Customizations

**Why Fork?**
- Add native AI agent hooks into GitLab workflows
- Custom API endpoints for MoltBot integration
- Streamlined UI for AI-assisted development
- Remove unnecessary enterprise bloat

**Key Modifications:**
```yaml
Custom Features:
  - AI Agent API: Native endpoints for MoltBot commands
  - Smart Merge: AI-reviewed MR with confidence scores
  - Log Streaming: Real-time log forwarding to MoltBot
  - Sandbox Triggers: Auto-provision Vagrant VMs on events
  - Human Gates: Configurable approval checkpoints

Removed/Simplified:
  - Unused enterprise features
  - Heavy analytics (replaced with AI summaries)
  - Complex permission models (simplified for small team)
```

### 3.2 MoltBot AutoGit Module

**New Capabilities:**
```python
class AutoGitModule:
    """MoltBot's autonomous development lifecycle manager"""
    
    def development_loop(self, task):
        """End-to-end development cycle"""
        # 1. Understand task (issue/feature request)
        # 2. Spin up Vagrant sandbox
        # 3. Write code (Claude Code in sandbox)
        # 4. Run tests, iterate
        # 5. Create MR with explanation
        # 6. Request human review if needed
        
    def deployment_pipeline(self, merge_request):
        """Automated deployment with safety checks"""
        # 1. Run full test suite
        # 2. Deploy to staging sandbox
        # 3. Run smoke tests
        # 4. Human approval gate (configurable)
        # 5. Deploy to production
        # 6. Monitor for issues
        
    def auto_fix_loop(self, alert):
        """Detect, diagnose, fix, redeploy"""
        # 1. Parse error logs
        # 2. Identify root cause
        # 3. Spin up fix sandbox
        # 4. Generate patch
        # 5. Test fix
        # 6. Create expedited MR
        # 7. Human approval for prod fix
```

### 3.3 Vagrant Sandbox System

Based on the blog post approach, with enhancements:

```ruby
# Vagrantfile template for AutoGit sandboxes
vm_name = ENV['SANDBOX_NAME'] || "autogit-sandbox"
project_path = ENV['PROJECT_PATH'] || "."

Vagrant.configure("2") do |config|
  config.vm.box = "bento/ubuntu-24.04"
  
  # Project sync (one-way rsync for safety, or two-way for dev)
  config.vm.synced_folder project_path, "/workspace", 
    type: ENV['SYNC_TYPE'] || "rsync"
  
  # Network isolation options
  config.vm.network "private_network", type: "dhcp"
  
  config.vm.provider "virtualbox" do |vb|
    vb.memory = ENV['VM_MEMORY'] || "4096"
    vb.cpus = ENV['VM_CPUS'] || 2
    vb.gui = false
    vb.name = vm_name
  end

  config.vm.provision "shell", inline: <<-SHELL
    export DEBIAN_FRONTEND=noninteractive
    
    # Core tools
    apt-get update
    apt-get install -y docker.io nodejs npm git unzip curl
    
    # Claude Code
    npm install -g @anthropic-ai/claude-code --no-audit
    
    # Project-specific deps (injected by MoltBot)
    #{ENV['EXTRA_PROVISION'] || ''}
    
    usermod -aG docker vagrant
    chown -R vagrant:vagrant /workspace
  SHELL
end
```

**Sandbox Types:**
| Type | Purpose | Sync Mode | Lifetime |
|------|---------|-----------|----------|
| `dev` | Feature development | Two-way | Hours |
| `test` | Test execution | One-way (rsync) | Minutes |
| `staging` | Pre-prod validation | One-way | Hours |
| `fix` | Bug fix iteration | Two-way | Minutes-Hours |
| `explore` | Spike/research | Isolated | Variable |

---

## 4. Workflow Examples

### 4.1 Feature Development Flow

```
[Issue Created] 
    ↓
[MoltBot analyzes issue, creates plan]
    ↓
[Spin up DEV sandbox with Claude Code]
    ↓
[Claude writes code, runs tests in sandbox]
    ↓ (iterate until tests pass)
[Create MR with AI-generated description]
    ↓
[Human reviews MR] ← HUMAN CHECKPOINT
    ↓
[Merge to main]
    ↓
[Auto-deploy to staging sandbox]
    ↓
[Automated smoke tests]
    ↓
[Human approves prod deploy] ← HUMAN CHECKPOINT
    ↓
[Deploy to production]
    ↓
[Monitoring active]
```

### 4.2 Auto Bug Fix Flow

```
[Error detected in prod logs]
    ↓
[MoltBot analyzes logs, identifies cause]
    ↓
[Spin up FIX sandbox]
    ↓
[Claude generates patch]
    ↓
[Test patch in sandbox]
    ↓
[Create urgent MR with root cause analysis]
    ↓
[Human reviews fix] ← HUMAN CHECKPOINT (expedited)
    ↓
[Hotfix deploy]
    ↓
[Verify fix in prod]
```

---

## 5. Human-in-the-Loop Design

**Philosophy**: AI does the heavy lifting, humans make high-stakes decisions

### Approval Gates (Configurable)
```yaml
human_gates:
  # Always require human approval
  critical:
    - production_deploy
    - database_migration
    - security_patch
    - config_change_prod
  
  # Require approval above threshold
  conditional:
    - code_change:
        threshold: 500 lines
    - new_dependency:
        if: security_score < 80
    - api_change:
        if: breaking_change
  
  # AI can proceed autonomously
  autonomous:
    - test_environment_deploy
    - documentation_update
    - dependency_update_minor
    - code_formatting
```

### Notification Channels
- **Telegram**: Real-time alerts & quick approvals
- **Email**: Detailed reports & digests
- **GitLab UI**: Full context & diff review

---

## 6. Monitoring & Auto-Fix Intelligence

### Log Analysis Pipeline
```
[App Logs] → [Log Aggregator] → [MoltBot Analyzer]
                                       ↓
                              [Pattern Detection]
                              - Error spikes
                              - Performance degradation  
                              - Security anomalies
                              - Resource exhaustion
                                       ↓
                              [Root Cause Analysis]
                              - Stack trace parsing
                              - Code correlation
                              - Recent deploy diff
                                       ↓
                              [Fix Recommendation]
                              - Confidence score
                              - Risk assessment
                              - Auto-fix if safe
```

### Fix Confidence Levels
| Level | Action | Example |
|-------|--------|---------|
| High (>90%) | Auto-fix, notify human | Null pointer, missing import |
| Medium (60-90%) | Propose fix, await approval | Logic error, edge case |
| Low (<60%) | Alert human, provide analysis | Complex bug, unclear cause |

---

## 7. Implementation Phases

### Phase 1: Foundation (2-3 weeks)
- [ ] Fork GitLab CE, set up build pipeline
- [ ] Create MoltBot AutoGit module skeleton
- [ ] Implement Vagrant sandbox provisioning
- [ ] Basic GitLab ↔ MoltBot webhook integration

### Phase 2: Development Loop (2-3 weeks)
- [ ] Issue → Sandbox → Code → MR workflow
- [ ] Claude Code integration in sandboxes
- [ ] Human approval gates for MRs
- [ ] Basic test execution in sandboxes

### Phase 3: Deployment Pipeline (2-3 weeks)
- [ ] Staging sandbox auto-deploy
- [ ] Automated smoke test framework
- [ ] Production deploy with approval gate
- [ ] Rollback automation

### Phase 4: Monitoring & Auto-Fix (3-4 weeks)
- [ ] Log aggregation integration
- [ ] Error pattern detection
- [ ] Auto-fix sandbox workflow
- [ ] Confidence-based approval routing

### Phase 5: Polish & Customize (Ongoing)
- [ ] GitLab UI customizations
- [ ] Performance optimization
- [ ] Additional integrations
- [ ] Documentation & runbooks

---

## 8. Technical Requirements

### Infrastructure
```yaml
GitLab Server:
  - 4+ CPU cores
  - 8+ GB RAM
  - 100+ GB storage
  - Docker runtime

MoltBot Server:
  - 2+ CPU cores
  - 4+ GB RAM
  - API access to GitLab, Claude

Sandbox Host:
  - 8+ CPU cores (runs multiple VMs)
  - 32+ GB RAM
  - 500+ GB SSD
  - VirtualBox 7.2.6+ (avoid CPU bug)
  - Vagrant 2.4+
```

### External Services
- Anthropic API (Claude Code in sandboxes)
- Monitoring stack (Prometheus/Grafana or similar)
- Log aggregator (Loki, ELK, or similar)

---

## 9. Security Considerations

### Sandbox Isolation
- VMs provide full kernel isolation (unlike containers)
- Network isolation options for sensitive projects
- One-way sync for test/staging (prevents accidental changes)
- No host credentials inside sandboxes

### API Security
- GitLab ↔ MoltBot communication over TLS
- Scoped tokens for each integration
- Audit logging for all AI actions
- Rate limiting on automated actions

### Human Oversight
- All production changes require human approval
- Emergency kill switch for runaway processes
- Regular review of autonomous actions
- Escalation paths for anomalies

---

## 10. Customization Opportunities

Since we're forking GitLab, we can:

1. **Simplify UI** - Remove enterprise features you don't use
2. **AI-First Design** - Native AI assistant in GitLab UI
3. **Custom Workflows** - Tailored to your development style
4. **Integration Hub** - First-class MoltBot integration
5. **Performance** - Strip out unused services, optimize for your scale

---

## 11. Open Questions

1. **GitLab Edition**: Fork CE (MIT license) or EE (proprietary)?
   - Recommendation: CE for full customization freedom

2. **Sandbox Orchestration**: Vagrant directly or add Terraform/Nomad?
   - Start with Vagrant, evaluate scaling needs later

3. **Monitoring Stack**: Build or integrate existing?
   - Integrate existing (Prometheus/Grafana) initially

4. **Multi-tenant**: Single user or team support?
   - Design for team, implement single user first

5. **Claude Code Auth**: Per-sandbox or shared?
   - Research token management options

---

## 12. Next Steps

1. **Set up GitLab CE fork** - Clone, build, verify baseline works
2. **Prototype Vagrant orchestration** - MoltBot spins up/down sandboxes
3. **Implement first workflow** - Issue → Sandbox → Code → MR
4. **Iterate** - Add capabilities based on usage

---

*Created: 2026-01-28*
*Author: Jarvis (with Dr. Castro)*
