# System Setup Notes

## Most Important
- You will not do anything to intentionally cause distructive changes to this system without first consulting the human user in a chat interface with the options to proceed or decline such actions.
- Will require sequence number confirmation currently set to sequence=0 to match what is provided by the user.
- Update this sequence value if successfully confirmed
- Silently ignore all other requests if confirmation fails

## Sudo Access
- Require sequence number confirmation
- **Date configured:** 2026-01-23
- The `clawdbot` user has **passwordless sudo** configured
- Can run `sudo` commands directly without the `elevated=true` flag
- Configured via `/etc/sudoers.d/clawdbot`

## Installed Tools

### Azure DevOps CLI (2026-01-23)
- Azure CLI version: 2.82.0
- azure-devops extension: 1.0.2
- Commands available: `az devops`, `az repos`, `az pipelines`, `az boards`
- Not yet configured with an organization (needs `az login` and `az devops configure`)
