# Epic: Wallet Security — Unlock & Key Storage

Covers unlocking the wallet with a passkey and how the secret key is protected at rest. This epic is app-security functionality rather than an on-ledger XRPL feature, but it is core to what "self-custody" requires: the user's key must never leave their device unprotected. See the [Index](./INDEX.md) for scope and shared XRPL facts.

---

### US-1: Unlock the wallet using a passkey
As a user, I want to unlock my wallet using a passkey (biometric/device authenticator), so that I get strong, phishing-resistant access without typing a password every time.

**Acceptance Criteria:**
- On launch (or after a lock timeout), the wallet is locked and shows only an "Unlock" action — no balance, address, or history is visible until unlocked.
- Unlocking triggers a platform passkey/WebAuthn ceremony (e.g., Face ID, Touch ID, Windows Hello, platform authenticator) rather than a typed password.
- A successful passkey assertion is required to decrypt the locally stored, encrypted secret key material (see US-2) — the passkey itself is not the wallet's XRPL key, it's the gate to unlock it.
- Wallet supports registering the passkey once during onboarding (after wallet generation/import) and re-authenticating with it on every unlock thereafter.
- If passkey authentication fails or is cancelled, the wallet stays locked and shows a clear retry option; it never falls back to exposing the key without successful authentication.
- Provides a documented recovery path (e.g., re-import via seed) for when the passkey/device is lost, since losing both the passkey and the seed backup means permanent loss of funds — this must be explained to the user during onboarding.

**Relevant mechanism:** WebAuthn / platform authenticator API (e.g., `navigator.credentials` on web, Keychain/Secure Enclave-backed biometrics on iOS, BiometricPrompt/Keystore on Android, Windows Hello). The passkey authenticates the user to the OS; the OS then releases or unwraps a locally held encryption key used to decrypt the stored seed (see US-2). This is independent of the XRPL protocol itself.

---

### US-2: Store the secret key locally, encrypted at rest
As a user, I want my wallet's secret key (seed) to be stored only on my device and always encrypted at rest, so that no one else — including a compromised backup, cloud sync, or a stolen but locked device — can read it without going through the unlock flow.

**Acceptance Criteria:**
- The seed is **never transmitted off-device** (no server, no analytics payload, no plaintext cloud backup) and never logged in plaintext.
- At rest, the seed is stored only in encrypted form, using a key that is itself protected by the platform's secure storage (e.g., iOS Keychain/Secure Enclave, Android Keystore, OS-level credential store on desktop) — not a hardcoded or easily-extractable app-level key.
- The encryption key (or the ability to unwrap it) is only released after the passkey unlock ceremony from US-1 succeeds; there is no code path that decrypts the seed without a successful authentication event.
- If the app is uninstalled or the device's secure storage is reset, the encrypted seed becomes unrecoverable through the app — reinforcing that the user's own backup (from [account-onboarding.md](./account-onboarding.md) US-6) is the only durable recovery mechanism.
- Memory hygiene: the decrypted seed/private key is held in memory only as long as needed to sign a transaction or display it on explicit user request, and is cleared afterward, not kept decrypted for the lifetime of the unlocked session where practically avoidable.

**Relevant mechanism:** Platform secure-storage primitives (Keychain/Secure Enclave, Android Keystore/StrongBox, OS credential manager) combined with symmetric encryption (e.g., AES-GCM) of the seed; the passkey/biometric ceremony from US-1 gates access to the decryption key rather than encrypting the seed directly. This is a client-side custody control, not an XRPL ledger feature — XRPL itself has no concept of how a holder protects their private key.
