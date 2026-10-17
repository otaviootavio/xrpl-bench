---
id: SPEC-passkey-signing
companions:
  - check-rules.md
  - ../../planning-artifacts/architecture/architecture-xrpl-wallet-passkey-signing-2026-10-10/ARCHITECTURE-SPINE.md
sources:
  - ../../planning-artifacts/prds/prd-xrpl-wallet-2026-09-12/prd.md
  - ../../planning-artifacts/prds/prd-xrpl-wallet-2026-09-12/addendum.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Per-Wallet Key Setup and Passkey-Gated Signing

Planned, not built. Covers PRD §4.14 (FR-60..FR-78); the FR ids are cited in parentheses for traceability.

## Why

A pain, and a mandate. The wallet holds real Mainnet funds, and the threat this targets is someone holding a phone that is already unlocked (some help against malicious page code, little against stolen storage, which is already encrypted). Today one session key opens every Seed, so a sign-time passkey prompt would be for show only. Protection must be real, per Wallet, and must replace the mandatory-PIN fallback that decisions.md §1 required — a rule this work reverses.

## Capabilities

- **CAP-1**
  - **intent:** A user creates a Wallet by answering one question per axis, in order: Network and Node, Seed Method, signature type, Open Check with auto-lock, Signing Check (FR-60).
  - **success:** Each question has a pre-selected answer; an answer the device cannot support is shown `aria-disabled` with the reason as visible text, never hidden; Import from Seed and master-key control are not in the flow.
- **CAP-2**
  - **intent:** Each Wallet carries its own Network (Mainnet, Testnet, Devnet) and Node, built-in or custom (FR-61).
  - **success:** A custom Node is accepted only if it answers and reports the chosen Network's id (a Testnet Node offered as Mainnet fails); Devnet gets the Faucet and explorer links and a stated "not a stable ledger" notice; Mainnet stays unmistakable wherever a Wallet's Network shows.
- **CAP-3**
  - **intent:** A user chooses a Seed Method in plain words — Passkey-Derived or Stored — and a signature type, Ed25519 or secp256k1 (FR-62, FR-63, FR-64).
  - **success:** A Passkey-Derived Seed is computed from PRF output when needed and is stored nowhere in any form; the same passkey on a new device yields the same Wallet; before creation the app states that the Seed depends on the app's domain; Seed Method and key type cannot be changed after creation.
- **CAP-4**
  - **intent:** Each Wallet has its own Open Check (App PIN or passkey) and auto-lock (FR-65).
  - **success:** The app opens without a check; Wallet names are visible; a Wallet whose Open Check has not passed shows no address or balance and issues no ledger read; auto-lock tears down only that Wallet; Mainnet requires an Open Check with auto-lock ≥ 1 min (see `check-rules.md`).
- **CAP-5**
  - **intent:** Each Wallet has one Signing Check — Standard, passkey only, or App PIN only — run on every signature after the confirm step (FR-66, FR-67, FR-68).
  - **success:** With the app unlocked and the Open Check passed, no code path yields that Wallet's Seed without the Signing Check succeeding; the Seed exists in plaintext only for one signature; there is no passkey↔PIN fallback; wrong PINs share the Open Check's count and hard lock, a cancelled passkey prompt never counts, and the prompt states tries remaining; combinations obey `check-rules.md`.
- **CAP-6**
  - **intent:** A user reveals a Wallet's Seed only after passing its Signing Check plus the confirm step (FR-69).
  - **success:** A Passkey-Derived Seed can always be revealed, and no screen claims the key "cannot be exported".
- **CAP-7**
  - **intent:** Wherever a Wallet uses a passkey, the user picks an existing passkey or creates a new one, and learns what kind it is (FR-70, FR-71).
  - **success:** A new passkey is named after the Wallet; no two Wallets or purposes share derived key material; after creation the app states the consequence for synced (provider-account access opens the Wallet) or device-bound (loss needs the written Seed or a Controlling Wallet).
- **CAP-8**
  - **intent:** A Mainnet Wallet whose only check is a passkey cannot be created until the user has written down and word-confirmed its Seed (FR-72).
  - **success:** Creation is blocked without the confirmation; Testnet and Devnet skip it; the rule still holds when edits put a Wallet in that state.
- **CAP-9**
  - **intent:** A user edits a Wallet's Open Check, auto-lock, Signing Check, and passkey without changing its address (FR-73).
  - **success:** The Seed is re-encrypted and the address is unchanged; any edit requires passing the current check it affects; Mainnet floors and CAP-8 hold after an edit.
- **CAP-10**
  - **intent:** Existing Wallets carry over on update with no re-import (FR-74).
  - **success:** Each becomes a Stored Seed Wallet with Open Check = its current Unlock Method and Signing Check = Standard; addresses unchanged; nothing is weaker than before; the update applies only on user acceptance.
- **CAP-11**
  - **intent:** A later, separate step lets a Wallet be controlled by a Controlling Wallet that holds the Account Master Key while this Wallet's key becomes the Account's Regular Key; a passkey can also be added as an extra Regular Key (FR-75, FR-76).
  - **success:** An on-device Controlling Wallet triggers a plain warning that whoever holds the phone can take over the Account; an offline controller signs by QR; the Wallet is treated as controlled only after the Regular Key is validated on-ledger; the existing key keeps working after a passkey is added.
- **CAP-12**
  - **intent:** From Settings, a user turns an Account's Master Key off and back on (FR-77).
  - **success:** Offered only once a Regular Key is validated, otherwise `aria-disabled` with reason; before proceeding the app states the exact consequence (master key and its Controlling Wallet can no longer sign; losing the Regular Key loses funds); it needs confirm and the signing Wallet's Signing Check; on/off state is read from the ledger and a failed read shows unknown.
- **CAP-13**
  - **intent:** An online device builds an unsigned transaction and an offline XRPL Bench device signs it by QR (FR-78).
  - **success:** Expiry is long enough for a two-device round (≈5 min) and is stated in plain words before signing; an expired transaction is reported as expired, not failed.

## Constraints

- A Wallet with a Signing Check is never encrypted under the session key; its Seed has its own key that only that check opens. A check is proven by decryption, never by key derivation.
- No Wallet or purpose shares key material derived from a passkey; each use gets its own derivation.
- A Passkey-Derived Seed's passkey is bound to the app's domain. The domain is permanent; a change makes the Seed unrecoverable except via a written Seed or a Controlling Wallet.
- A Mainnet Passkey-Derived Seed is not offered while production runs on a `*.b-cdn.net` origin; it is `aria-disabled` with that reason until production sits on a permanent custom domain the owner controls. Testnet and Devnet may use it. Related Origin Requests are not relied on (support beyond Chrome/Safari unconfirmed).
- A Passkey-Derived Seed Wallet's Signing Check is always its passkey (Standard and App PIN are not offered).
- The App PIN is the only PIN and is created the first time any Wallet chooses a PIN check; a device with no PIN-using Wallet has none. Its hard lock blocks every Wallet using the PIN at open and sign, and never blocks Wallets whose checks are all passkeys.
- No app-wide Open Check; per-Wallet only.
- Guards and Regular Key/master-key state fail closed: an errored read blocks and renders as unknown, never on or off.
- Inherited repo rules hold: money as strings/BigInt; no secret in storage, state, or URL; every ledger read through the one query-key factory (Wallet + Network scoped); the service worker never caches RPC; the app never updates itself.

## Non-goals

- Using a passkey signature as the XRPL signature (XRPL accepts only Ed25519/secp256k1).
- A passkey prompt that leaves the Seed openable by the session key.
- A separate signing PIN.
- Splitting keys with a server (MPC), XLS-100 Smart Escrows, Xahau Hooks.
- Storing the Seed in the passkey (`largeBlob`).
- Multi-signing and signer lists; signing ahead or several transactions per QR round (Tickets).
- Exchange or custodial features (swaps, fiat ramps, staking, KYC).

## Success signal

On Mainnet, with the app unlocked and the Open Check passed, a Wallet set to passkey-only cannot sign, nor reveal its Seed, without a passkey assertion — demonstrable by attempting every signing path — and an existing Wallet upgrades with the same address and no weaker protection.

## Assumptions

- The Signing Check applies to every signed transaction type (payments, Trust Line changes, `SetRegularKey`), not only payments.
- Revealing a Standard Wallet's Seed re-passes its Open Check; a no-check Testnet/Devnet Wallet needs only the confirm step.
- After a PIN hard lock, the passkey producing a Passkey-Derived Seed counts as the re-import.
- Devnet can be reset, so a Devnet Wallet may need re-funding.
- Turning the master key back on is signed by the Regular Key with no warning beyond the confirm step.
- Replacing an existing Regular Key is allowed with a confirm that says the old key stops working.
- Migration: each legacy Wallet takes its Network from today's app-wide setting, and "use on another network" adds a Wallet over the same Seed record, so a funded Mainnet address is never hidden by a Testnet default.
- A Node reporting no `network_id` is accepted for Mainnet only.
- Controlled-Wallet identity follows the architecture spine's call (AD-18).
