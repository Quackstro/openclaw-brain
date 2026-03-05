# DOGE Wallet Phase 1: Key Management + Wallet Init — Build Summary

**Date:** 2026-02-03 01:18-01:45 UTC
**Status:** ✅ Complete — TypeScript compiles, all integration tests pass

## What Was Built

### New Files
1. **`src/keys/derivation.ts`** — BIP44 HD key derivation for DOGE
   - `generateMnemonic()` — 24-word BIP39 (256-bit entropy)
   - `validateMnemonic()` — BIP39 validation
   - `mnemonicToSeed()` — Seed from mnemonic
   - `deriveDogecoinKeyPair(seed, network, index)` — Full key pair at BIP44 path `m/44'/3'/0'/0/{index}`
   - `deriveAddressOnly(seed, network, index)` — Address without private key
   - `publicKeyToAddress(pubkey, network)` — Compressed pubkey → P2PKH address
   - `isValidAddress(address, network?)` — Base58Check validation
   - Uses: `bip39`, `hdkey`, `bs58check` (transitive dep), Node.js `crypto` (SHA256 + RIPEMD160)
   - Mainnet addresses start with `D` (prefix 0x1e), testnet with `n` (prefix 0x71)

2. **`src/keys/encryption.ts`** — AES-256-GCM encrypted keystore
   - `encryptKeystore(privateKey, passphrase, address, network)` — Encrypt with scrypt + AES-256-GCM
   - `decryptKeystore(keystore, passphrase)` — Decrypt (throws `InvalidPassphraseError` on wrong pass)
   - `isKeystoreValid(data)` — Structural validation (type guard)
   - scrypt params: N=2^17 (131072), r=8, p=1, salt=32 bytes, dklen=32
   - AES-256-GCM: 12-byte IV, 16-byte auth tag
   - Derived key zeroed immediately after use

3. **`src/keys/manager.ts`** — `WalletManager` class
   - `init(passphrase)` → generates mnemonic, derives keys, encrypts, saves to disk, returns mnemonic+address
   - `recover(mnemonic, passphrase)` → restores from mnemonic, overwrites existing keystore
   - `unlock(passphrase)` → decrypts keystore, holds private key in memory
   - `lock()` → zeros and clears private key from memory
   - `isInitialized()` → async check for keystore file on disk
   - `isUnlocked()` → sync check for private key in memory
   - `getAddress()` → reads from keystore (no unlock needed)
   - `getPublicKey()` → only available when unlocked
   - `getPrivateKey()` → throws `WalletLockedError` if locked
   - Atomic writes (temp file + rename) for keystore
   - File permissions: 0o600 (keystore), 0o700 (keys directory)

4. **`src/types/hdkey.d.ts`** — Type declarations for hdkey package
5. **`src/types/bs58check.d.ts`** — Type declarations for bs58check package
6. **`src/types/secp256k1.d.ts`** — Type declarations for secp256k1 package

### Modified Files
1. **`src/types.ts`** — Added: `KeyPair`, `EncryptedKeystore`, `WalletState`, `WalletInfo`, `PassphraseMode`
2. **`src/errors.ts`** — Added: `WalletAlreadyInitializedError`, `WalletLockedError`, `InvalidPassphraseError`, `InvalidMnemonicError`
3. **`src/config.ts`** — Updated `isWalletInitialized()` to actually check disk for keystore file
4. **`index.ts`** — Major rewrite for Phase 1:
   - WalletManager instance created on plugin registration
   - `/wallet init <passphrase>` — Creates wallet, shows mnemonic ONCE
   - `/wallet recover <mnemonic> | <passphrase>` — Recovers from backup
   - `/wallet address` — Shows receiving address (no unlock needed)
   - `/wallet lock` — Clears private key from memory
   - `/wallet unlock <passphrase>` — Decrypts keystore
   - `/balance` — Shows address + lock status (balance query coming Phase 2)
   - `wallet_address` tool — Returns actual address
   - `wallet_init` tool — Agent-callable wallet initialization
   - `wallet_balance` tool — Updated with address + lock status
   - Service lifecycle: locks wallet on shutdown

## Security Properties
- Private keys NEVER appear in logs, tool output, error messages, or audit trail
- Mnemonic shown ONCE during init, then never stored
- Keystore encrypted with AES-256-GCM + scrypt (passphrase not stored on disk)
- File permissions enforced: 0o600 for keystore, 0o700 for keys directory
- Atomic writes prevent keystore corruption
- Private key zeroed from memory on lock() and in all derivation paths
- Wrong passphrase correctly throws InvalidPassphraseError (GCM auth failure)

## Test Results
- ✅ Mnemonic generation: 24 words, valid BIP39
- ✅ Seed derivation: 64-byte seed from mnemonic
- ✅ HD key derivation: correct BIP44 path m/44'/3'/0'/0/0
- ✅ Mainnet addresses start with D (prefix 0x1e)
- ✅ Testnet addresses start with n (prefix 0x71)
- ✅ Known test vector: "abandon" mnemonic produces expected seed prefix `5eb00bbddcf069084889a8ab9155568165f5c453...`
- ✅ Encryption round-trip: encrypt → decrypt = same private key
- ✅ Wrong passphrase: correctly rejected with auth failure
- ✅ Recovery: same mnemonic produces same address
- ✅ File permissions: keystore written as 0o600
- ✅ TypeScript: `npx tsc --noEmit` — zero errors

## Dependencies Used (no new packages added)
- `bip39` 3.1.0 — already in package.json
- `hdkey` 2.1.0 — already in package.json  
- `bs58check` 2.1.2 — transitive dep of hdkey
- `secp256k1` — transitive dep of hdkey
- Node.js `crypto` — built-in (SHA256, RIPEMD160, scrypt, AES-256-GCM)
- `typescript` — added as devDependency for tsc checks

## Known Limitations (Phase 1)
- `deriveAddress(index)` only supports index 0 — full HD multi-address needs seed storage (Phase 2+)
- Balance query returns placeholder — real UTXO-based balance in Phase 2
- No sending — Phase 3
- No freeze/unfreeze — Phase 4
- Network is configured as testnet (DOGETEST) for development

## Next: Phase 2 (UTXO Management + Balance)
- Implement UTXO fetching from API providers
- Local UTXO cache
- Coin selection algorithm
- Real `/balance` command with confirmed/unconfirmed amounts
- UTXO refresh cron job
