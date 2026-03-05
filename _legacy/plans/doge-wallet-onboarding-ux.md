# DOGE Wallet Plugin — Onboarding UX Design

**Created:** 2026-02-03 16:55 UTC  
**Status:** 📋 Design Draft  
**Goal:** Low barrier to entry, secure by default, guided step-by-step setup

---

## Design Principles

1. **No jargon upfront** — Don't say "BIP-44 HD wallet" to users; say "your wallet"
2. **One step at a time** — Don't overwhelm with all options; progressive disclosure
3. **Secure defaults** — Conservative spending limits, require confirmation for large amounts
4. **Recoverable** — Make backup crystal clear and verify understanding
5. **Conversational** — Use Telegram's native UI (inline buttons, step-by-step messages)

---

## Onboarding Flow

### Trigger
User sends `/wallet` or mentions "doge wallet" and no wallet exists yet.

### Step 1: Welcome & Consent
```
🐕 Welcome to DOGE Wallet!

I can help you send and receive Dogecoin right from this chat. 
Before we start, a few things to know:

• Your keys are encrypted and stored locally
• I'll generate a 24-word recovery phrase — you MUST save it
• You control spending limits for autonomous transactions

Ready to set up your wallet?

[🚀 Let's Go]  [❓ Learn More]
```

**[Learn More]** expands:
```
DOGE Wallet is a self-custodial wallet — you own your keys.

• I never see your recovery phrase after setup
• Encrypted with a passphrase only you know
• Works on Dogecoin mainnet (real money!)

Security: Your funds are as safe as your passphrase + recovery phrase.
```

---

### Step 2: Passphrase Setup
```
🔐 Step 1 of 4: Create Your Passphrase

Your passphrase encrypts your wallet. Choose something strong:
• At least 12 characters
• Mix of letters, numbers, symbols
• NOT a common phrase

⚠️ If you forget this, you'll need your recovery phrase to restore.

Reply with your passphrase (I'll delete your message immediately for security):
```

**After user sends passphrase:**
1. Validate strength (min 12 chars, entropy check)
2. Delete user's message containing passphrase
3. Acknowledge receipt without echoing it

```
✅ Passphrase received and secured. (Your message was deleted)

[Continue →]
```

**If weak passphrase:**
```
⚠️ That passphrase is a bit short/weak. For real money, I recommend:
• At least 12 characters
• Example pattern: three-random-words-plus-numbers-123

[Try Again]  [Use Anyway (not recommended)]
```

---

### Step 3: Generate & Display Recovery Phrase
```
📝 Step 2 of 4: Your Recovery Phrase

These 24 words can restore your wallet if anything goes wrong.

⚠️ CRITICAL — Write these down NOW on paper:

1. witch     7. abandon   13. fossil   19. mixed
2. collapse  8. grocery   14. verify   20. toast  
3. practice  9. artwork   15. curtain  21. wealth
4. fiber    10. measure   16. eternal  22. orient
5. revenge  11. hospital  17. bundle   23. purpose
6. license  12. century   18. account  24. identify

🚨 This is shown ONCE. Never share it. Never screenshot it.

[✅ I've Written It Down]
```

---

### Step 4: Verify Recovery Phrase
```
🔍 Step 3 of 4: Let's Verify

To make sure you saved it correctly, please type:

Word #3: ___
Word #11: ___
Word #18: ___
```

**On correct answers:**
```
✅ Perfect! Your recovery phrase is safely recorded.
```

**On incorrect:**
```
❌ That doesn't match. Let's try again — check your written copy.

Word #3 should be: practice
Word #11 should be: hospital

[🔄 Show Phrase Again]  [Try Verification Again]
```

---

### Step 5: Spending Limits Setup
```
⚙️ Step 4 of 4: Spending Limits

How much can I spend automatically without asking you?

Recommended for beginners:
• Auto-approve: Up to 10 DOGE (~$1) per transaction
• Notify + wait: 10-100 DOGE (you can approve via button)
• Always ask: Over 100 DOGE

[👍 Use Recommended]  [🔧 Customize]
```

**[Customize] flow:**
```
Set your auto-approve limit (transactions below this go through automatically):

[1 DOGE]  [5 DOGE]  [10 DOGE]  [25 DOGE]  [None - always ask]
```

---

### Step 6: Completion
```
🎉 Your DOGE Wallet is Ready!

📬 Your receiving address:
DQ6dZtCmYL...xR9Ke

Send DOGE to this address to fund your wallet.

Quick commands:
• /balance — Check your balance
• /send <address> <amount> — Send DOGE
• /wallet — Wallet dashboard

💡 Tip: Start with a small test deposit (~10 DOGE)

[📋 Copy Address]  [📊 View Dashboard]
```

---

## Error Handling

### User Abandons Mid-Flow
- Save progress state
- On next `/wallet` command, offer to resume:
```
👋 Looks like you started setting up but didn't finish.

[▶️ Resume Setup]  [🔄 Start Over]
```

### User Closes Chat During Phrase Display
- Never re-display phrase automatically
- Require full passphrase to show phrase again (one time only):
```
⚠️ For security, I can only show your recovery phrase one more time.
Please enter your passphrase to confirm:
```

---

## Security Considerations

| Risk | Mitigation |
|------|------------|
| Passphrase in chat history | Delete message immediately after receipt |
| Recovery phrase screenshot | Warn against it; phrase shown as text not image |
| User skips backup | Require verification before completing setup |
| Weak passphrase | Entropy check with warning (allow override) |
| Man-in-middle (Telegram) | Warn that Telegram is not E2E encrypted for bots |

---

## Implementation Notes

### State Machine
```
ONBOARDING_STATES:
  - NONE (no wallet, not started)
  - WELCOME (showed welcome, awaiting consent)
  - PASSPHRASE_PENDING (awaiting passphrase input)
  - PASSPHRASE_WEAK_WARNING (weak passphrase, awaiting decision)
  - PHRASE_DISPLAYED (recovery phrase shown, awaiting confirmation)
  - VERIFICATION_PENDING (awaiting word verification)
  - LIMITS_PENDING (awaiting spending limit choice)
  - COMPLETE (wallet ready)
```

### Storage
- Onboarding state: `~/.openclaw/doge/onboarding-state.json`
- Passphrase: NEVER stored (used to encrypt, then discarded)
- Recovery phrase: Encrypted in keystore, never stored plaintext

### Message Deletion
Use Telegram `deleteMessage` API immediately after receiving passphrase:
```typescript
await telegram.deleteMessage(chatId, messageId);
```

---

## Future Enhancements

1. **QR code for address** — Generate inline for easy mobile scanning
2. **Fiat amount display** — Show "~$1.08" next to DOGE amounts
3. **Guided first transaction** — Walk through sending first DOGE
4. **Backup reminder** — Periodic prompt to verify backup still accessible
5. **Multi-device recovery** — Instructions for restoring on new device

---

## Open Questions

1. Should we support hardware wallet (Ledger) in v2?
2. Allow email/cloud backup of encrypted keystore? (controversial)
3. Social recovery option (Shamir's secret sharing)?
