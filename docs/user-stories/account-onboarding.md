# Epic: Account Onboarding

Covers creating a wallet, importing an existing one, understanding activation, and safeguarding key material. See the [Index](./INDEX.md) for scope and shared XRPL facts.

---

### US-1: Generate a new wallet
As a new user, I want to generate a brand-new XRPL wallet (keypair + address), so that I can start using the wallet without depending on any third party.

**Acceptance Criteria:**
- Generates a valid XRPL keypair (seed + address) locally, without any network call.
- The seed is displayed once, clearly labeled as the only way to recover the wallet.
- The user must explicitly confirm they've backed up the seed before proceeding.

**Relevant XRPL mechanism:** Ed25519/secp256k1 keypair derivation from a seed (`ripple-keypairs` / `xrpl.js` `Wallet.generate()`); no on-ledger action yet — the address doesn't exist as an account until funded.

---

### US-2: Import an existing wallet
As a returning user, I want to import my wallet using my existing seed, so that I can access my account from this app.

**Acceptance Criteria:**
- Accepts a valid seed and derives the correct address/keypair.
- Rejects malformed seeds with a clear error, without leaking any partial derived data.
- After import, the wallet immediately fetches and displays the account's current state (balance, activation status).

**Relevant XRPL mechanism:** Seed → keypair derivation; `account_info` to check if the address is a funded account.

---

### US-3: View my own address
As a user, I want to see my wallet's XRPL address clearly, so that I can share it or verify transactions against it.

**Acceptance Criteria:**
- Address is always visible from the main wallet screen.
- Address is shown in full (not truncated) somewhere accessible, with a copy action.

**Relevant XRPL mechanism:** The account's `Account` field (r-address).

---

### US-4: Understand account activation status
As a new user, I want to know whether my account is "activated" (exists on-ledger) or not, so that I understand why I can't yet send transactions.

**Acceptance Criteria:**
- If `account_info` returns "account not found," the wallet shows an "inactive / not yet funded" state, not a generic error.
- The wallet explains that receiving at least the base reserve (1 XRP) will activate the account.
- Once funded, the wallet detects activation (via `account_info` succeeding) and updates the UI without requiring reimport.

**Relevant XRPL mechanism:** Accounts are created implicitly by receiving a `Payment` ≥ the base reserve (1 XRP / 1,000,000 drops); `account_info` is used to detect existence.

---

### US-5: See the account reserve requirement
As a user, I want to see how much of my balance is locked as a reserve, so that I understand why my full balance isn't spendable.

**Acceptance Criteria:**
- Displays the current base reserve amount (fetched from `server_state`/`server_info`, not hardcoded, since it can change via network amendment).
- Explains in plain language that this amount stays locked while the account exists.

**Relevant XRPL mechanism:** `server_state`/`server_info` → `validated_ledger.reserve_base`; currently 1 XRP on both mainnet and testnet (verified live against testnet on 2026-08-31).

---

### US-6: Back up my seed securely
As a user, I want to be guided to back up my seed phrase/key safely, so that I don't lose access to my funds.

**Acceptance Criteria:**
- Seed is never transmitted off-device or logged.
- Wallet offers to display the seed again (behind a confirmation/auth step) from a settings screen, in case the user needs to re-verify their backup.
- Wallet does not store the seed in plaintext at rest (platform-appropriate secure storage).

**Relevant XRPL mechanism:** N/A (client-side key custody responsibility, not an on-ledger feature) — core to what "self-custody" means for this wallet.
