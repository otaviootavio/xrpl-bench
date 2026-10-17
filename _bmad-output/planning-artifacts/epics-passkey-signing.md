---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-xrpl-wallet-2026-09-12/prd.md
  - _bmad-output/planning-artifacts/prds/prd-xrpl-wallet-2026-09-12/addendum.md
  - _bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-passkey-signing-2026-10-10/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-2026-09-12/ARCHITECTURE-SPINE.md
  - _bmad-output/specs/spec-passkey-signing/SPEC.md
  - _bmad-output/specs/spec-passkey-signing/stories.yaml
  - _bmad-output/specs/spec-passkey-signing/check-rules.md
  - docs/sprints/passkey-signing-sprints.md
---

# xrpl-wallet — Passkey Signing — Epic Breakdown

## Overview

This document decomposes PRD §4.14 (FR-60 through FR-78, "Per-Wallet Key Setup and
Signing Checks") into epics and stories, using the passkey-signing architecture
spine (AD-18 through AD-30) and the spec in `_bmad-output/specs/spec-passkey-signing/`.

It is a **separate file** from `epics.md`, which holds the finished Epics 1–11 and
is left untouched. Epic numbering continues from Epic 12 so it cannot collide with
those (first drafted as P1–P5; now 12–16). Requirement ids are the PRD's own (FR-60..FR-78, NFR-1..NFR-11).

## Requirements Inventory

### Functional Requirements

FR-60: Creating a Wallet asks one question per axis, in order: Network then Node; Seed Method; Signature type; Open Check and auto-lock; Signing Check. Import from Seed is not part of this flow, and master-key control is a later separate step. Every question has a pre-selected answer (Testnet; first listed Node; Stored Seed; Ed25519; Open Check = passkey if PRF else App PIN with 5-minute auto-lock; Signing Check = Standard on Testnet/Devnet, passkey if PRF else App PIN on Mainnet). An answer the device cannot support is `aria-disabled` with the reason in visible text, never hidden.

FR-61: Network and Node per Wallet. The user picks Mainnet, Testnet or Devnet, then a built-in Node or a custom one. A custom Node passes the connection test only if it answers and reports the chosen Network's id (Mainnet 0, Testnet 1, Devnet 2); a Node reporting no `network_id` is accepted for Mainnet only. Devnet gets the Faucet (FR-40) and explorer links (FR-42), and a visible notice that it is not a stable ledger. Built-in list: Mainnet `wss://xrplcluster.com` (backup `wss://s1.ripple.com`); Testnet `wss://s.altnet.rippletest.net:51233` (backup `wss://testnet.xrpl-labs.com`); Devnet `wss://s.devnet.rippletest.net:51233` (no backup). FR-41 failover holds within the built-in list only; a custom Node has none. Mainnet stays unmistakable (FR-39) wherever a Wallet's Network is shown.

FR-62: Two Seed Methods in plain words: (1) Passkey-Derived Seed — "Your passkey creates the seed. Same passkey on a new phone = same wallet." (2) Stored Seed — "A new random seed, locked on this phone. A new phone needs your written seed." The Seed Method cannot be changed after creation; the app says so where checks are edited.

FR-63: A Passkey-Derived Seed is computed from the passkey's PRF output each time it is needed and is never stored in any form. Offered only where PRF is supported. Before creation the app states that the Seed depends on the app's domain and that only a written Seed (FR-69) or a Controlling Wallet (FR-75) recovers funds if the domain changes. A Mainnet Passkey-Derived Seed is `aria-disabled` with that reason while production runs on a `*.b-cdn.net` origin; Testnet and Devnet may use it; Related Origin Requests are not relied on. Its Signing Check is always that passkey (Standard and App PIN not offered).

FR-64: The user picks Ed25519 or secp256k1; the choice is fixed for the life of the Wallet.

FR-65: Each Wallet has its own Open Check (App PIN or passkey) and its own auto-lock. Mainnet: Open Check required, auto-lock not below 1 minute. Testnet and Devnet: Open Check optional. The app itself opens without a check; every Wallet's name is visible; the address and balances of a Wallet whose Open Check has not passed are not shown and no ledger read is issued for it. Auto-lock applies FR-12's teardown to that Wallet only. No app-wide Open Check.

FR-66: Each Wallet has exactly one Signing Check: Standard (none), passkey only, or App PIN only. No fallback between passkey and App PIN. The check runs on every signature from that Wallet, including every transaction type the app signs (payments, Trust Line changes, `SetRegularKey`). It comes after the confirm step (FR-20) and never replaces the confirm step's consequence statement.

FR-67: A Signing Check is real, not a prompt. With the app unlocked and the Open Check passed, no code path can produce that Wallet's Seed without the Signing Check succeeding. The Seed exists in plaintext only for one signature, then is cleared (NFR-2). A check is proven by decryption, never by key derivation (FR-8). Allowed combinations: Stored Seed — Standard, passkey, or App PIN; Passkey-Derived Seed — passkey only.

FR-68: A PIN Signing Check is the App PIN; there is no separate signing PIN. Wrong App PINs at a Signing Check share the failure count and hard lock with the Open Check (FR-9); a cancelled or dismissed passkey prompt never counts. The prompt states how many tries remain. A hard lock blocks the App PIN for every Wallet using it, at open and at sign, and never blocks Wallets whose checks are all passkeys. For a Passkey-Derived Seed Wallet whose Open Check is the App PIN, the passkey counts as the re-import. The App PIN is created the first time any Wallet chooses a PIN check; a device with no PIN-using Wallet has none. Existing Wallets keep the PIN they have.

FR-69: Revealing a Wallet's Seed requires that Wallet's Signing Check in addition to FR-3's confirm step. A Passkey-Derived Seed can always be revealed; the app never claims the key "cannot be exported". A Standard Wallet requires its Open Check again; a Wallet with neither check needs only the confirm step.

FR-70: Wherever a Wallet uses a passkey (open, sign, or Seed creation) the user chooses "use an existing passkey or create a new one". A new passkey is named after the Wallet (e.g. "XRPL Bench – Savings (Mainnet)"). No two Wallets and no two purposes share key material derived from a passkey; each use has its own derivation.

FR-71: Synced and device-bound passkeys are both allowed. After a passkey is created or chosen, the app reads which kind it is and states the consequence: synced — anyone who gets into the provider's account can open and sign; device-bound — if the device or key is lost, only the written Seed or a Controlling Wallet recovers the funds.

FR-72: A Mainnet Wallet whose only check is a passkey (Open Check passkey and Signing Check passkey or Standard) cannot be created until the user has written down its Seed and confirmed some of its words in the app. Testnet and Devnet skip it. The rule also holds when checks are edited into that state later.

FR-73: The user can change a Wallet's Open Check, auto-lock, Signing Check, and which passkey it uses. The Seed is re-encrypted; the address does not change. Any change requires passing the current check that the change affects. The Seed Method is not editable. FR-65's Mainnet floor and FR-72's written-Seed rule hold after an edit.

FR-74: On updating to the build that ships §4.14, every existing Wallet becomes a Stored Seed Wallet whose Open Check is its current Unlock Method (passkey and App PIN, as today) and whose Signing Check is Standard. No address changes, no re-import, nothing weaker than before. The update applies only when the user accepts it (FR-48).

FR-75: After creation, a separate step asks "Will this wallet be controlled by a master key?". Yes means another Wallet (the Controlling Wallet) holds the Account Master Key and this Wallet's key becomes that Account's Regular Key. Any Wallet can be a Controlling Wallet. On this device, the app warns plainly that whoever has this phone can take over that Account. On an offline device, it signs by QR (FR-78). The Regular Key's arrival is confirmed validated (FR-22) before the Wallet is treated as controlled.

FR-76: A passkey can be added later to an existing Wallet as an additional Regular Key for its Account; the Wallet's existing key keeps working. An Account has one Regular Key: if one is set, adding another replaces it, and the confirm step says in plain words that the old key stops working.

FR-77: From Settings, the user can turn off the Account Master Key of a Wallet whose Account has a validated Regular Key, and turn it back on. Otherwise the control is `aria-disabled` with the reason in visible text. Before proceeding the app states the exact consequence (NFR-7): the master key and its Controlling Wallet can no longer sign; if the Regular Key is also lost, funds are lost for good. It needs a confirm step and the Signing Check of the signing Wallet. Turning it back on is signed with the Regular Key. The Account's current state is read from the ledger, never remembered; a failed read is reported as unknown (FR-59).

FR-78: Two-device signing by QR. An online device builds the unsigned transaction and an offline XRPL Bench device signs it by QR. The expiry window is long enough for a two-device round and is stated in plain words before signing. An expired transaction is reported as expired (FR-24), never as failed. Signing ahead or several transactions per round is out of scope.

### NonFunctional Requirements

NFR-1: Money is strings or BigInt end to end; formatting only at the single render-boundary formatter; no `Number()` on a Drops value.

NFR-2: No secret is ever serializable — no Seed or exported key material in `localStorage`, React state, a store, the URL, or anything stringified, including in development. The one exception is a non-extractable `CryptoKey` handle. Under §4.14 that handle can no longer open the Seed of a Wallet with a Signing Check; Seed plaintext exists only for one signing operation.

NFR-3: Every ledger read goes through a query hook whose key includes the Active Wallet and the Active Network.

NFR-4: The service worker caches the static shell only, never an RPC response.

NFR-5: Nothing styles `:focus`; `outline-none` is banned.

NFR-6: Colour never carries meaning alone; `bun run check:contrast` is the gate, over a declared pair list (a new colour means a new pair).

NFR-7: Every irreversible action states its exact consequence in plain language before it proceeds.

NFR-8: Every bespoke component gets a keyboard-only and screen-reader pass before merge.

NFR-9: Supported conditions include a 320px viewport and 200% zoom, each independently.

NFR-10: Motion respects `prefers-reduced-motion`.

NFR-11: A list never uses an array index as its React key.

### Additional Requirements

No starter template applies; this is a brownfield change to the shipped app.

Architecture (new decisions AD-18..AD-30):

- AD-18: A **Seed record** (`seedId`) owns ciphertext, lock, checks and algorithm; a **Wallet** is `(walletId, seedId, network, node)`. Selection state is `walletId`, never an address. Ledger identity is `(network, accountAddress)`; `keyAddress` is stored separately. Controlled Wallets sign with `Wallet.fromSeed(seed, { algorithm, masterAddress })`. Two Seed records may share `(network, accountAddress)` but must differ in `keyAddress`; creation rejects a duplicate triple. Every vault-record edit is a compare-and-swap on `rev` inside its IndexedDB transaction. A legacy Seed's `algorithm` is `unresolved` until first decryption, then derived, checked against the stored address, and stored. `app-store` persists display meta only, derived from the record.
- AD-19: `NetworkId` gains `devnet`; `NETWORKS` carries a built-in Node list per network. `network` and `node` live on the Wallet; the app-wide `network` in `app-store` is removed and replaced by one selector from the active Wallet. Query keys keep `(name, network, Account address)`; the Node is not in the key. Address Book keeps network in its identity.
- AD-20: `client.ts` pools connections by Node URL. A custom Node is accepted only after `server_info` returns the picked network's id (missing id accepted for Mainnet only). `submitAndClassify` and every read take the Wallet's Node. A custom Node is stored only on its Wallet record. Failover only within the built-in list. The AD-12 seam moves with the pool. Egress list amended: built-in Nodes, Testnet/Devnet faucets, the Release Manifest, and user-declared Nodes that passed the test.
- AD-21: One non-extractable Open Key per unlocked lock, each with its own lazy expiry and its own timer that fires the AD-26 teardown. Derivation is domain-separated by `(lockId | walletId, purpose)` with purpose `open`, `sign` or `seed`. App PIN: one PBKDF2 with a device salt, then HKDF per `(id, purpose)`; passkey: a distinct PRF salt per `(walletId, purpose)`. Every PRF salt and HKDF `info` is generated at creation and stored with the record (never recomputed from a constant); legacy `PRF_SALT`, `HKDF_INFO` and PBKDF2 parameters are copied into the legacy lock record at migration. PBKDF2 output is never cached beyond one unwrap. Open Check "none" stores the Open Key as a non-extractable `CryptoKey` in IndexedDB, rejected for Mainnet.
- AD-22: `keystore.openSigner(walletId, role, prompts)` runs the Signing Check inside `lib/crypto` and returns an opaque one-use `Signer` (`sign(tx)`, `dispose()`), the Seed held only in a closure cleared in `finally`. `Signer` is a structural type declared in `lib/xrpl/writes.ts` (`xrpl` never imports `crypto`). `submitAndClassify` takes a `Signer` and runs: autofill and fee cap → confirm (FR-20) → `openSigner` → set `LastLedgerSequence` from the current validated ledger → `sign` → submit. `unlockWalletForSigning` is removed. `revealSeed(walletId, prompts)` is the only function that returns a Seed. All creation, import and edit go through `keystore` (`create`, `import`, `editChecks`) and call the policy function; the legacy `generateAndStoreWallet` and `importAndStoreWallet` are removed. PIN and passkey are collected through a `prompts` callback (AD-1).
- AD-23: A Wallet with a Signing Check has its Seed encrypted under a random Signing Key wrapped only under the signing credential, never in any session or store and never derivable from an Open Key. A Seed's ciphertext exists in exactly one form: an edit that adds a Signing Check deletes the older ciphertext (including a legacy `encryptedSeed`) in the same transaction. Required test: no code path yields the Seed without the Signing Check.
- AD-24: Passkey-Derived `Seed = Wallet.fromEntropy(HKDF(PRF(frozen 'seed' salt)), { algorithm })`, computed per use and never persisted. The seed salt is `SHA-256('xrpl-bench:seed:v1' | ordinal)`; the ordinal is shown once at creation for the user to write down. `keystore.restorePasskeyWallet(ordinal, algorithm, network, node, prompts)` rebuilds a Wallet and accepts it only if the derived address matches. HKDF output is exactly 16 bytes. A derived address not equal to the stored `keyAddress` is a wrong credential. `webauthn.ts` sets `rp.id` explicitly from the build's configured origin (per branch) via one function and records the rpId on every credential (existing credentials get their current host at migration). PRF capability-detected per credential; creation treats a second prompt after registration as normal and confirms the derived address before saving. Passkey kind read from the backup-eligible flag at registration; only BE is stored. WebAuthn gets the AD-12 substitute/reset test seam. `CLAUDE.md`'s unlock wording is amended.
- AD-25: One App PIN, created the first time a Wallet chooses a PIN check. One failure count, shared by every PIN Open Check and Signing Check; `pin.verifyPin` owns the counter and increments it inside an IndexedDB transaction. A wrong passkey that was presented counts; a cancelled or dismissed prompt does not. A hard lock disables PIN derivation for every PIN-using Wallet and deletes nothing by itself; removal needs a separate explicit confirmation and removes only Seed records whose every unlock path is the PIN. Check kinds include `either` (legacy lock). `Unlock.tsx`'s whole-vault reset is rewritten to this rule.
- AD-26: `lib/teardown.ts` has three scopes: per-lock, account data (full reset), shell (never removed by a lock). A locked Wallet shows its label only and no read is enabled for it. First read after unlock uses a fresh query. Backgrounding closes every lock. Query data for an Account is removed only when no other open lock holds a record for it. Auto-lock minutes live on the lock record (legacy lock takes today's persisted value); `app-store`'s single `autoLockMinutes` is removed. The app-wide `Unlock` gate is replaced by a per-Wallet unlock prompt and `auth.ts` is replaced by `lock.ts`.
- AD-27: Migration is relabelling, not re-encrypting. Every existing Wallet joins one legacy lock whose Open Key is today's `vaultKey`. A Wallet leaves it only through an FR-73 edit, which deletes its legacy `encryptedSeed`; the confirm says an older build can no longer open it. Each legacy Wallet's `network` comes from today's app-wide `network`, and the Wallet list offers "use on another network" which adds a Wallet over the same Seed record. Migrated Wallets lock together. No IndexedDB version bump (additive fields and new `lock:<id>` keys); persisted `app-store` version stays 0 with new fields normalised in `merge`. Rollback loses only new-build data. Applies only on user acceptance (FR-48).
- AD-28: `lib/crypto/policy.ts` is the only code that decides legal check combinations: the FR-67 table, FR-65's Mainnet floor, FR-72's written-Seed rule, and "Open Check none only off Mainnet". Creation, import and edit all call it; the UI only renders its answer, including `aria-disabled` reasons. An edit requires the current affected check and writes the new encryption and removes the old in one IndexedDB transaction, leaving the old record untouched on failure. Seed Method is never editable.
- AD-29: Regular Key and `lsfDisableMaster` state come from `account_info` through the AD-4 factory and are never persisted. A Wallet counts as controlled only after `SetRegularKey` is validated. `SetRegularKey` and `AccountSet` (`asfDisableMaster`) are enabled only on a current successful read (parent AD-13), pass `submitAndClassify`, and are signed through `openSigner`. Disabling master (`asfDisableMaster`) must be signed by the master key pair — offered only through the Controlling Wallet or the Wallet whose `keyAddress` equals its Account; re-enabling (`ClearFlag`) is signed by the Regular Key. `openSigner` is told which role to sign as.
- AD-30: `lib/qr-codec` owns both payloads — unsigned: `version`, `network_id` (envelope field), transaction JSON; signed: `tx_blob`. The online device builds the transaction and sets `LastLedgerSequence` to validated ledger + 75 (stated as a window, not a promised duration). The offline device signs through `openSigner` and refuses a `network_id` that is not its Wallet's. The online device decodes the returned blob and refuses it unless it deep-equals the unsigned transaction, ignoring only `SigningPubKey` and `TxnSignature`, and the signing key belongs to the expected Account. Live-read guards run on the online side; the offline side shows decoded fields for the confirm step. Submission through `submitAndClassify`; expiry reports as expired.

Inherited and cross-cutting:

- Parent ADs that cannot hold as written and are amended on adoption: AD-2 (egress), AD-3 (`unlockWalletForSigning`), AD-5 (one `vaultKey`), AD-6 (app-wide network), AD-9 (`submitAndClassify` takes a Wallet), AD-16 (teardown scopes). Parent Deferred items "user-editable endpoint" and "regular-key rotation" are struck on adoption.
- AD-1 and AD-4 are `[GATED]`: the `lint` gate module lists are updated in the same change as any new module (`policy`, `lock`, `pin`, `qr-codec`). `crypto` collects prompts via a callback, never by importing UI.
- Typed results from `lib/crypto`: `ok`, `wrong-credential`, `cancelled`, `unsupported`, `locked-out`; never a message containing key material.
- Naming: Wallet fields `network`, `node`, `accountAddress`, `keyAddress`, `seedMethod`, `algorithm`, `openCheck`, `signingCheck`, `lockId`; check kinds `passkey`, `pin`, `none`, `standard`.
- Irreversible actions each get a confirm step stating the exact consequence: disabling the Account Master Key, replacing a Regular Key, creating a Mainnet Passkey-Derived Seed (domain dependency).
- Tests: any rule governing what a screen may show gets a test that fails when the rule is removed; AD-23 gets a test asserting no path yields the Seed without the Signing Check. A restore of a Passkey-Derived Wallet is tested without the original device's storage.
- No new dependency (`xrpl` ^5.1.0, `idb` ^8.0.3).
- Preconditions to verify before building: the Devnet row in `docs/user-stories/INDEX.md` and the Devnet explorer transaction path; each built-in Node live; a missing `network_id` on a live Mainnet Node.
- Open owner confirmations carried by the spine: migration across networks (AD-27), Controlled Wallet identity (AD-18), missing `network_id` (AD-19).
- The final production origin is a deferred product decision; Mainnet Passkey-Derived Seeds stay disabled until production is on a permanent custom domain.
- Repo gates for every story: `bun run lint`, `bun run build`, `bun run test`, `bun run check:contrast`; visual changes also follow `docs/agents/verifying-your-work.md`.
- Story granularity input: `stories.yaml` already breaks the spec into 11 stories (spec/done checkpoints on stories 1, 3, 6, 10), and `docs/sprints/passkey-signing-sprints.md` sequences them as Sprints 18–22.

### UX Design Requirements

No bmad-ux contract (`ux-designs/ux-*/DESIGN.md` + `EXPERIENCE.md`) exists, so there are no UX-DRs extracted from one. The visual system is the repo-root `DESIGN.md` (authoritative per `CLAUDE.md`) and is not part of the step's search path. UX-relevant behaviour that the FRs already carry, and that stories must make testable: `aria-disabled` with visible reason (FR-60, FR-63, FR-77); the plain-word Seed Method and passkey-kind statements (FR-62, FR-71); tries-remaining at the signing prompt (FR-68); Mainnet unmistakable (FR-61); stated expiry window (FR-78); exact-consequence confirms (NFR-7); keyboard/screen-reader, 320px/200% zoom, reduced motion, and contrast gates (NFR-5..NFR-10).

### FR Coverage Map

FR-60: Epic 14 - One-question-per-axis creation flow
FR-61: Epic 12 - Network and Node per Wallet, Devnet, custom Node proof
FR-62: Epic 14 - Seed Methods in plain words
FR-63: Epic 14 - Passkey-Derived Seed, domain warning
FR-64: Epic 14 - Signature type
FR-65: Epic 13 - Per-Wallet Open Check and auto-lock
FR-66: Epic 13 - Per-Wallet Signing Check
FR-67: Epic 13 - Structural (real) Signing Check
FR-68: Epic 13 - App PIN as signing PIN, shared lockout
FR-69: Epic 14 - Seed reveal behind the Signing Check
FR-70: Epic 14 - One passkey rule everywhere
FR-71: Epic 14 - Synced vs device-bound statement
FR-72: Epic 14 - Confirmed written Seed for passkey-only Mainnet
FR-73: Epic 15 - Edit checks and passkey
FR-74: Epic 12 - Existing Wallets carry over
FR-75: Epic 15 - Controlling Wallet
FR-76: Epic 15 - Passkey as extra Regular Key
FR-77: Epic 15 - Account Master Key off and on
FR-78: Epic 16 - Two-device signing by QR

## Epic List

### Epic 12: Existing Wallets carry over, and every Wallet knows its own network
Each existing Wallet keeps its address and is no weaker after the update, which applies only on acceptance. Each Wallet has its own Network and Node, Devnet is included, and a custom Node must prove its network before it is trusted.
**FRs covered:** FR-61, FR-74
**Stories (stories.yaml):** 1, 2. Spec and done checkpoint on story 1.

### Epic 13: Opening and signing are gated per Wallet, and the signing gate is real
A Wallet has its own Open Check and auto-lock. A Wallet with a Signing Check cannot sign, or yield its Seed, without it. The App PIN failure count is shared, and a hard lock never wipes a passkey-only Wallet.
**FRs covered:** FR-65, FR-66, FR-67, FR-68
**Stories (stories.yaml):** 3, 4. Spec and done checkpoint on story 3.

### Epic 14: Create a Wallet exactly the way you want it, and back it up
One question per axis, Stored or Passkey-Derived Seed, key type, the passkey rule, the passkey-kind statement, the confirmed written Seed for passkey-only Mainnet Wallets, and Seed reveal behind the Signing Check.
**FRs covered:** FR-60, FR-62, FR-63, FR-64, FR-69, FR-70, FR-71, FR-72
**Stories (stories.yaml):** 5, 6, 7. Spec checkpoint on story 6.

### Epic 15: Change a Wallet's protection and put its Account under a master key
Edit checks and passkey without changing the address, make a Wallet controlled by a Controlling Wallet, add a passkey as an extra Regular Key, and turn the Account Master Key off and on.
**FRs covered:** FR-73, FR-75, FR-76, FR-77
**Stories (stories.yaml):** 8, 9, 10. Spec checkpoint on story 10.

### Epic 16: Sign from an offline device by QR
An online device builds the transaction and an offline XRPL Bench device signs it, with the expiry stated and expiry reported as expired.
**FRs covered:** FR-78
**Stories (stories.yaml):** 11.

## Epic 12: Existing Wallets carry over, and every Wallet knows its own network

Each existing Wallet keeps its address and is no weaker after the update, which applies only on acceptance. Each Wallet has its own Network and Node, Devnet is included, and a custom Node must prove its network before it is trusted.

### Story 12.1: Existing Wallets move to per-Wallet locks without changing

As a user with Wallets already in the app,
I want each existing Wallet to become a Stored Seed Wallet with its current unlock method as its Open Check and no signing check,
So that updating never changes an address, never weakens protection, and never asks me to re-import.

**Acceptance Criteria:**

**Given** a vault written by the current build, with one or more Wallets under the one app-wide key
**When** the user accepts the update (FR-48)
**Then** each Wallet is relabelled Stored Seed, with Open Check equal to its current Unlock Method and Signing Check Standard
**And** every address is unchanged and no Seed ciphertext is re-encrypted or rewritten (AD-27)

**Given** the update has not been accepted
**When** the app opens
**Then** nothing is migrated and the existing vault behaves exactly as before

**Given** a legacy Wallet is migrated
**When** its record is inspected
**Then** it joins one legacy lock whose Open Key is today's `vaultKey`, and the legacy `PRF_SALT`, `HKDF_INFO` and PBKDF2 parameters are copied into that lock record (AD-21)
**And** its `network` is set from today's persisted app-wide network, and its `algorithm` is `unresolved` until first decryption, after which it is derived, checked against the stored address and stored (AD-18)
**And** auto-lock minutes come from today's persisted value and live on the lock record

**Given** migrated Wallets
**When** one is unlocked
**Then** all migrated Wallets lock together, as today

**Given** a legacy Wallet on any network
**When** the user chooses "use on another network" from the Wallet list
**Then** a new Wallet is added over the same Seed record, with a different `(network, accountAddress)` identity, and the funded address is never hidden by a Testnet default (AD-18, AD-27)

**Given** the migration
**When** the vault's schema is checked
**Then** there is no IndexedDB version bump, new data is additive fields and new `lock:<id>` keys, and persisted `app-store` stays at version 0 with the new fields normalised in `merge`

**Given** the deployed build is rolled back after migration
**When** an unedited legacy Wallet is opened by the older build
**Then** it opens, and only Wallets created or edited on the new build are lost

**Given** an error or crash part-way through migration
**When** the app restarts
**Then** every Wallet still opens with its original unlock method

**Given** this story's changes
**When** any path is inspected
**Then** no Seed or key material enters state, storage or the URL in the clear (NFR-2)

*Checkpoints:* spec review before work starts, and review after it is done. Nothing else in the plan ships unless this holds.

### Story 12.2: Each Wallet has its own Network and Node, including Devnet

As a user,
I want to pick a Network (Mainnet, Testnet or Devnet) and a Node for each Wallet,
So that every Wallet reads and sends through a ledger I chose, and a wrong Node can never answer for my Mainnet funds.

**Acceptance Criteria:**

**Given** the app after this story
**When** the active Wallet changes
**Then** the active network is derived from that Wallet by one selector, and the app-wide `network` in `app-store` no longer exists (AD-19)
**And** every query key still includes the Wallet and its network (NFR-3, AD-4), and the Node is not part of the key

**Given** a Wallet on Mainnet, Testnet or Devnet
**When** the Node is chosen
**Then** the built-in lists are Mainnet `wss://xrplcluster.com` (backup `wss://s1.ripple.com`), Testnet `wss://s.altnet.rippletest.net:51233` (backup `wss://testnet.xrpl-labs.com`), and Devnet `wss://s.devnet.rippletest.net:51233` (no backup)
**And** failover happens only within that list and a custom Node has none (FR-41)

**Given** the user enters a custom Node
**When** the connection test runs
**Then** it passes only if `server_info` answers with the chosen network's id (Mainnet 0, Testnet 1, Devnet 2)
**And** a Testnet Node offered as Mainnet fails the test
**And** a Node reporting no `network_id` is accepted for Mainnet only
**And** a Node that passes is stored only on that Wallet's record (AD-20)

**Given** a Wallet whose Node failed the network test
**When** any screen would read the ledger for it
**Then** no request is sent (the same rule for a Wallet whose Open Check has not passed arrives in 13.2)

**Given** the connection pool
**When** two Wallets share a Node URL
**Then** they share one connection, and the test seam substitutes and resets the pool as before (AD-12)
**And** `submitAndClassify` and every read take the Wallet's Node, not only its network

**Given** a Devnet Wallet
**When** it is shown or funded
**Then** it offers the Faucet (FR-40) and explorer links (FR-42), and a visible notice says Devnet is not a stable ledger and may be reset
**And** `docs/user-stories/INDEX.md` has a Devnet row before this ships

**Given** a Wallet on Mainnet
**When** its network is shown anywhere
**Then** it is unmistakable in text and not by colour alone (FR-39, NFR-6)

**Given** a 320px viewport and 200% zoom, each on its own
**When** the Network and Node pickers are used
**Then** no control is clipped or unreachable (NFR-9), and they work by keyboard and screen reader (NFR-8)

## Epic 13: Opening and signing are gated per Wallet, and the signing gate is real

A Wallet has its own Open Check and auto-lock. A Wallet with a Signing Check cannot sign, or yield its Seed, without it. The App PIN failure count is shared, and a hard lock never wipes a passkey-only Wallet.

### Story 13.1: A Wallet's Signing Check is structural, and signing goes through a one-use Signer

As a user with a Wallet set to a signing check,
I want every signature to need that check, and for no screen or code path to be able to get my Seed without it,
So that someone holding my already-unlocked phone cannot move my funds.

**Acceptance Criteria:**

**Given** this story ships before the creation and edit screens (14.1, 15.1)
**When** a Wallet with a Signing Check is needed
**Then** `keystore` can create one through the policy function, and tests use that path; the user-facing choice arrives in 14.1 and 15.1

**Given** the five call sites of the removed functions (Onboarding generate, Onboarding import on both paths, Settings add, Settings import)
**When** this story ships
**Then** each is rewired in this story, with no new screen, onto `keystore.create` or `keystore.import` with fixed answers: Stored Seed, Standard Signing Check, the legacy lock as Open Check, the app-wide network, and the algorithm today's `Wallet.generate` and `Wallet.fromSeed` produce
**And** the user sees the same screens and steps as today, and the Epic 11 seed-import behaviour (warning before the write, `parseSeedInput` trimming) is unchanged
**And** 14.1 later replaces the Settings and Onboarding generate calls with the full creation flow, and import stays a separate flow on `keystore.import`
**And** `SendTab` and `TrustLinesTab`, the two callers of `unlockWalletForSigning`, move to `submitAndClassify` with a `Signer` in this story

**Given** a Wallet with a Signing Check of passkey or App PIN
**When** its Seed is stored
**Then** the Seed is encrypted under a random Signing Key wrapped only under the signing credential for `(walletId, 'sign')`
**And** the Signing Key never enters session state, any store or the IndexedDB session store, and cannot be derived from an Open Key (AD-23)
**And** the Seed's ciphertext exists in exactly one form, and adding a Signing Check deletes any older ciphertext, including a legacy `encryptedSeed`, in the same transaction

**Given** the app is unlocked and the Wallet's Open Check has passed
**When** every code path that could produce that Wallet's Seed is attempted
**Then** none yields it without the Signing Check succeeding
**And** a test asserts this and fails if the property is removed

**Given** a signature is requested
**When** `submitAndClassify` runs
**Then** it takes a `Signer`, not a `Wallet`, and runs in this order: autofill and fee cap (fee shown, FR-18), confirm step (FR-20), `openSigner` (the check), set `LastLedgerSequence` from the current validated ledger, `sign`, submit (AD-22)
**And** the confirm step's consequence statement is never replaced by the check prompt
**And** `unlockWalletForSigning`, `generateAndStoreWallet` and `importAndStoreWallet` no longer exist

**Given** `openSigner(walletId, role, prompts)`
**When** it succeeds
**Then** it returns an opaque `Signer` with only `sign(tx)` and `dispose()`, valid for one signature, holding the Seed only in a closure cleared in `finally`
**And** the `Signer` type is declared in `lib/xrpl/writes.ts`, and `xrpl` never imports `crypto`

**Given** any transaction type the app signs (payments, Trust Line changes, `SetRegularKey`, `AccountSet`)
**When** it is signed from a Wallet with a Signing Check
**Then** the check runs every time, with no skipped type (FR-66)

**Given** a Wallet set to passkey only, or to App PIN only
**When** the other credential is offered
**Then** it is refused; there is no fallback between passkey and App PIN

**Given** a wrong App PIN at a Signing Check
**When** it is entered
**Then** it counts toward the same failure count and hard lock as the Open Check, incremented inside one IndexedDB transaction by `pin.verifyPin` so parallel guesses cannot share one count (AD-25)
**And** the prompt states in plain words how many tries remain before the hard lock
**And** a cancelled or dismissed passkey prompt never counts, while a presented but failing passkey does

**Given** the App PIN hard-locks
**When** a Wallet that uses it tries to open or sign
**Then** it is blocked, and a Wallet whose checks are all passkeys keeps working
**And** nothing is deleted by the lock itself

**Given** a failure inside `lib/crypto`
**When** it is reported
**Then** it is one of `ok`, `wrong-credential`, `cancelled`, `unsupported`, `locked-out`, and never a message containing key material

**Given** the Seed is used for a signature
**When** the signature completes or fails
**Then** the plaintext is cleared (NFR-2)

*Checkpoints:* spec review before work starts, and review after it is done. This carries the money-moving property.

### Story 13.2: Each Wallet has its own Open Check and auto-lock

As a user with several Wallets,
I want each Wallet to have its own Open Check and its own auto-lock,
So that a Testnet Wallet with no check cannot weaken a Mainnet one on the same phone.

**Acceptance Criteria:**

**Given** the app starts
**When** it opens
**Then** it opens without a check and every Wallet's name is visible
**And** the app-wide `Unlock` gate is replaced by a per-Wallet unlock prompt, and `auth.ts` is replaced by `lock.ts` (AD-26)

**Given** a Wallet whose Open Check has not passed
**When** it is on screen
**Then** only its label is shown, with no address and no balance
**And** no ledger read is enabled for it, so no request carries its address (AD-26, NFR-3)

**Given** the Wallet unlocks
**When** the first read runs
**Then** it uses a fresh query, not retained data

**Given** a Mainnet Wallet
**When** its Open Check or auto-lock is set
**Then** an Open Check is required and auto-lock cannot be set below 1 minute
**And** a Testnet or Devnet Wallet may have no Open Check, stored as a non-extractable `CryptoKey` in IndexedDB, which is rejected for Mainnet (AD-21)

**Given** each lock
**When** its auto-lock window ends
**Then** its own timer fires the per-lock teardown, which drops that lock's session key and removes the account-scoped query data of its Wallets, and expiry is also checked lazily on read
**And** other locks stay open, and an Account's query data is removed only when no other open lock holds a record for it
**And** `app-store`'s single `autoLockMinutes` no longer exists

**Given** the app is backgrounded (FR-11)
**When** it returns
**Then** every lock is closed

**Given** teardown
**When** a lock closes
**Then** the shell (service worker cache) is never removed (AD-26)

**Given** the App PIN hard-locks
**When** the reset flow is offered
**Then** it deletes nothing by itself, and a separate explicit confirmation removes only Seed records whose every unlock path is the PIN
**And** a legacy lock (check kind `either`) survives a hard lock and still opens by passkey
**And** `Unlock.tsx`'s whole-vault reset is rewritten to this rule, and a full reset remains its own explicit action (AD-25, AD-16)

**Given** a Passkey-Derived Seed Wallet whose Open Check is the App PIN
**When** the PIN hard-locks
**Then** the Wallet stays recoverable through its passkey (FR-68)

**Given** the new modules
**When** `bun run lint` runs
**Then** the AD-1 and AD-4 gate module lists include `lock` and `pin`, and `crypto` collects prompts through a callback, never by importing UI

**Given** the locked-Wallet view
**When** it renders
**Then** it works by keyboard and screen reader (NFR-8), at 320px and 200% zoom (NFR-9), and carries no meaning by colour alone (NFR-6)

## Epic 14: Create a Wallet exactly the way you want it, and back it up

One question per axis, Stored or Passkey-Derived Seed, key type, the passkey rule, the passkey-kind statement, the confirmed written Seed for passkey-only Mainnet Wallets, and Seed reveal behind the Signing Check.

### Story 14.1: Create a Stored Seed Wallet one question at a time, under one policy

As a user creating a Wallet,
I want to be asked one question per axis in order, each with a sensible pre-selected answer,
So that I choose its network, key type and checks deliberately and can never create an illegal combination.

**Acceptance Criteria:**

**Given** the user starts creating a Wallet
**When** the flow runs
**Then** it asks, in order: Network then Node (FR-61), Seed Method, Signature type (Ed25519 or secp256k1), Open Check and auto-lock, Signing Check (FR-60)
**And** Import from Seed and master-key control are not part of the flow

**Given** each question
**When** it is first shown
**Then** it is pre-selected: Testnet; the first listed Node; Stored Seed; Ed25519; Open Check passkey where PRF is available otherwise App PIN, with 5-minute auto-lock; Signing Check Standard on Testnet and Devnet, and on Mainnet passkey where PRF is available otherwise App PIN

**Given** an answer the device or the policy cannot allow
**When** it is shown
**Then** it is `aria-disabled` with the reason in visible text, and never hidden
**And** the reason comes from `lib/crypto/policy.ts`, the only code that decides legal combinations (AD-28)

**Given** the policy function
**When** creation, import or edit asks it
**Then** it enforces the Seed Method × Signing Check table, the Mainnet Open Check requirement and 1-minute auto-lock floor, "Open Check none only off Mainnet", and, once 14.3 lands, its written-Seed rule
**And** tests fail if any rule is removed

**Given** a Stored Seed Wallet
**When** it is created
**Then** a new random Seed is generated and stored through `keystore.create`, locked per the chosen checks, and the Signature type is stored and never editable afterwards (FR-64)
**And** a creation that would duplicate `(network, accountAddress, keyAddress)` is rejected (AD-18)

**Given** the user first chooses a PIN check for any Wallet
**When** no App PIN exists
**Then** the App PIN is created then, and a device where no Wallet uses a PIN has none (FR-68)

**Given** the Seed Method question
**When** it is shown
**Then** it states in plain words that a Stored Seed is "a new random seed, locked on this phone; a new phone needs your written seed", and that the Seed Method cannot be changed later (FR-62)

**Given** a Mainnet Wallet is chosen
**When** it is shown anywhere in the flow
**Then** Mainnet is unmistakable in text, not by colour alone (FR-39, NFR-6)

**Given** the flow at 320px, at 200% zoom, by keyboard and by screen reader
**When** it is used
**Then** no control is clipped or unreachable, and the pass is done before merge (NFR-8, NFR-9, NFR-10)

### Story 14.2: A Passkey-Derived Seed, with the passkey rule and what kind of passkey it is

As a user,
I want to create a Wallet whose Seed comes from my passkey, and be told plainly what that means,
So that the same passkey on a new phone gives the same Wallet, and I know the risks before I rely on it.

**Acceptance Criteria:**

**Given** a device and passkey provider that support PRF
**When** the Seed Method question is shown
**Then** Passkey-Derived Seed is offered, described as "Your passkey creates the seed. Same passkey on a new phone = same wallet" (FR-62)
**And** where PRF is unsupported it is `aria-disabled` with the reason in visible text

**Given** a Passkey-Derived Seed Wallet
**When** it is created
**Then** its Seed is computed from `Wallet.fromEntropy(HKDF(PRF(frozen 'seed' salt)), { algorithm })` with exactly 16 bytes of HKDF output, and is never persisted in any form (AD-24)
**And** the seed salt is `SHA-256('xrpl-bench:seed:v1' | ordinal)`, and the ordinal is shown once for the user to write down with the Wallet's name
**And** creation confirms the derived address before the Wallet is saved, treating a second prompt right after registration as normal

**Given** a derived address that does not equal the stored `keyAddress`
**When** the Wallet is used
**Then** it is rejected as a wrong credential

**Given** a new device with the same passkey, the ordinal and the algorithm
**When** `keystore.restorePasskeyWallet` runs
**Then** it rebuilds the Wallet and accepts it only if the derived address matches
**And** a test restores it without the original device's storage

**Given** the Wallet's Signing Check
**When** it is chosen
**Then** only that passkey is offered; Standard and App PIN are `aria-disabled` with the reason (FR-63, FR-67)

**Given** the user is about to create a Passkey-Derived Seed
**When** the confirm step shows
**Then** it states that the Seed depends on this app's domain and that if the domain changes, only a written Seed or a Controlling Wallet recovers the funds (FR-63, NFR-7)

**Given** the build's production origin is a `*.b-cdn.net` host
**When** Mainnet is chosen
**Then** Passkey-Derived Seed is `aria-disabled` with that reason, while Testnet and Devnet may use it
**And** Related Origin Requests are not relied on (FR-63)

**Given** any use of a passkey by a Wallet (open, sign, or Seed)
**When** the prompt is shown
**Then** the user chooses "use an existing passkey or create a new one", and a new one is named after the Wallet, such as "XRPL Bench – Savings (Mainnet)" (FR-70)
**And** each Wallet and purpose derives its own key material, with a distinct PRF salt per `(walletId, purpose)` stored with the record, never recomputed from a constant (AD-21)

**Given** a passkey is created or chosen
**When** its kind is read from the backup-eligible flag
**Then** the app states the consequence: synced means anyone who gets into the provider's account can open and sign with this Wallet; device-bound means a lost device or key is recoverable only by the written Seed or a Controlling Wallet (FR-71)
**And** only the backup-eligible flag is stored

**Given** `webauthn.ts`
**When** it creates or asserts a credential
**Then** `rp.id` is set explicitly through one function from the build's configured origin (per branch) and every credential record stores its rpId, with existing credentials taking their registered host at migration (AD-24)
**And** WebAuthn has a substitute and reset test seam (AD-12)

*Checkpoints:* spec review before work starts (rpId and recovery by ordinal). Passkey flows are verified with the virtual-authenticator procedure in `docs/agents/verifying-your-work.md`, not by gates alone.

### Story 14.3: A confirmed written Seed, and revealing a Seed behind the Signing Check

As a user,
I want to be made to write down and confirm my Seed before a passkey-only Mainnet Wallet exists, and to reveal it later only after passing its check,
So that losing my one credential cannot lose my funds, and nobody holding my unlocked phone can read my Seed.

**Acceptance Criteria:**

**Given** a Mainnet Wallet whose Open Check is a passkey and whose Signing Check is a passkey or Standard
**When** the user tries to finish creation
**Then** creation is blocked until the Seed is shown, the user says they wrote it down, and they correctly enter some of its words in the app (FR-72)
**And** Testnet and Devnet Wallets skip this step

**Given** the written-Seed rule
**When** an edit later puts a Wallet in that state
**Then** the same requirement holds (15.1 applies it through the same policy function)

**Given** the user reveals a Wallet's Seed
**When** the Wallet has a Signing Check
**Then** the Seed is revealed only after that check passes, plus the confirm step of FR-3, through `keystore.revealSeed`, the only function that returns a Seed (AD-22)
**And** the reveal screen holds it in a ref and clears it when the screen closes (parent AD-3)

**Given** a Standard Wallet
**When** the user reveals its Seed
**Then** its Open Check must pass again, and a Wallet with neither check needs only the confirm step (FR-69)

**Given** a Passkey-Derived Seed Wallet
**When** the user reveals its Seed
**Then** it can always be revealed, so a written backup is always possible
**And** no screen anywhere says the key "cannot be exported"

**Given** the reveal and the written-Seed screens
**When** the Seed is on screen
**Then** it is never in state that is stringified, in storage, or in the URL (NFR-2)

**Given** a wrong or cancelled check at reveal
**When** it happens
**Then** the Seed is not shown, and wrong App PINs count toward the shared lockout while a cancelled passkey prompt does not

## Epic 15: Change a Wallet's protection and put its Account under a master key

Edit checks and passkey without changing the address, make a Wallet controlled by a Controlling Wallet, add a passkey as an extra Regular Key, and turn the Account Master Key off and on.

### Story 15.1: Edit a Wallet's checks and passkey

As a user,
I want to change a Wallet's Open Check, auto-lock, Signing Check and passkey,
So that I can strengthen or tune its protection later without moving funds.

**Acceptance Criteria:**

**Given** the Wallet's settings
**When** the user edits its Open Check, auto-lock, Signing Check or passkey
**Then** the Seed is re-encrypted for the new setting, and the address and key type do not change (FR-73)
**And** the Seed Method is not editable, and the screen says that changing it means a new Wallet and moving the funds (FR-62)

**Given** any change
**When** it is made
**Then** the current check that the change affects must pass first (weakening included)

**Given** an edit
**When** it is saved
**Then** it goes through `keystore.editChecks` and the policy function, writing the new encryption and removing the old in one IndexedDB transaction, with a compare-and-swap on the record `rev` so two tabs cannot lose each other's update (AD-18, AD-28)
**And** on any failure the old record is untouched and the Wallet still opens

**Given** a Mainnet Wallet
**When** an edit would remove its Open Check or set auto-lock under 1 minute
**Then** it is `aria-disabled` with the reason

**Given** an edit that leaves a Mainnet Wallet with a passkey as its only check
**When** the Wallet has no confirmed written Seed
**Then** the confirmation of 14.3 is required first

**Given** a legacy Wallet that is edited
**When** the edit moves it off the legacy lock
**Then** only that Wallet is re-encrypted, its legacy `encryptedSeed` is deleted, and the confirm says an older build can no longer open it (AD-27)

**Given** a Passkey-Derived Seed Wallet
**When** its Signing Check is edited
**Then** Standard and App PIN are `aria-disabled` with the reason

**Given** the edit screens
**When** used by keyboard, by screen reader, at 320px and at 200% zoom
**Then** no control is clipped or unreachable (NFR-8, NFR-9)

### Story 15.2: Control a Wallet from another Wallet, and add a passkey as an extra key

As a user,
I want a Wallet to be controlled by a Controlling Wallet that holds the Account Master Key, and to add a passkey as an extra Regular Key,
So that I can separate the key that signs day to day from the key that owns the Account.

**Acceptance Criteria:**

**Given** an existing Wallet
**When** the user opens the later step "Will this wallet be controlled by a master key?"
**Then** answering yes makes another Wallet the Controlling Wallet, which holds the Account Master Key, and this Wallet's key becomes that Account's Regular Key (FR-75)
**And** this is a separate step after creation, never part of the creation flow

**Given** the Controlling Wallet is on this device
**When** the user confirms
**Then** the app first warns plainly that whoever has this phone can take over that Account
**And** a Controlling Wallet on an offline device signs by QR (the QR flow itself arrives in 16.1; until then the offline option is shown `aria-disabled` with that reason)

**Given** the `SetRegularKey` transaction
**When** it is submitted
**Then** the guard reads `account_info` live and an errored read blocks it (parent AD-13), it is signed through `openSigner` with the role stated by the caller, and it passes `submitAndClassify` (AD-29)
**And** the Wallet is treated as controlled only after the transaction is validated (FR-22), never on submission

**Given** a controlled Wallet
**When** its record is created
**Then** its `accountAddress` is the controlled Account and its `keyAddress` is its own, and it signs with `Wallet.fromSeed(seed, { algorithm, masterAddress })` (AD-18)
**And** a Controlling Wallet that is on this device has `keyAddress` equal to that `accountAddress`
**And** a Controlling Wallet on an offline device has no record here and the controlled record keeps only a display-only `controllerAddress`

**Given** an existing Wallet with a passkey
**When** the user adds the passkey as an extra Regular Key
**Then** the Wallet's existing key keeps working (FR-76)

**Given** the Account already has a Regular Key
**When** a new one is set
**Then** it replaces the old one, and the confirm step says in plain words that the old key stops working (NFR-7)

**Given** the Regular Key state
**When** it is shown
**Then** it comes from `account_info` through the one query-key factory and is never persisted, and a failed read shows unknown (AD-29, FR-59)

### Story 15.3: Turn the Account Master Key off and on from Settings

As a user with a validated Regular Key,
I want to turn my Account's Master Key off and back on,
So that the key that can no longer be used for daily signing cannot be stolen, and I can still undo it.

**Acceptance Criteria:**

**Given** Settings
**When** the Account has no validated Regular Key
**Then** the control is `aria-disabled` with the reason in visible text

**Given** the Account has a validated Regular Key (FR-22)
**When** the user chooses to turn the Master Key off
**Then** the confirm step states the exact consequence before anything is sent: the Master Key and the Controlling Wallet that holds it can no longer sign for this Account, and if the Regular Key is also lost (for a passkey, the passkey or the app's domain) the funds are lost for good (NFR-7, FR-77)
**And** it passes the Signing Check of the Wallet that signs it

**Given** `asfDisableMaster`
**When** it is offered
**Then** it is offered only through a Wallet that holds the master key pair (the Controlling Wallet, or the Wallet whose `keyAddress` equals its Account), never through a Wallet that signs as a Regular Key (AD-29)

**Given** the Master Key is off
**When** the user turns it back on
**Then** it is signed by the Regular Key through `ClearFlag`, offered in the same place, with no extra warning beyond the confirm step

**Given** the Account's on or off state
**When** it is shown
**Then** it is read from the ledger and never remembered locally
**And** a failed or errored read shows unknown, never on or off, and blocks the action (AD-13, AD-14)

**Given** the action
**When** it is submitted
**Then** it passes `submitAndClassify` and is verified with real transactions on Testnet before it is marked done

*Checkpoints:* spec review before work starts. This is an irreversible-class action and the only one that can lose funds permanently.

## Epic 16: Sign from an offline device by QR

An online device builds the transaction and an offline XRPL Bench device signs it, with the expiry stated and expiry reported as expired.

### Story 16.1: Build a transaction online and sign it offline by QR

As a user with a Controlling Wallet on an offline device,
I want an online device to build the transaction and my offline device to sign it by QR,
So that the key that owns the Account never touches a connected phone.

**Acceptance Criteria:**

**Given** `lib/qr-codec`
**When** either device encodes or decodes a payload
**Then** it uses the one codec: unsigned carries `version`, `network_id` (an envelope field) and the transaction JSON; signed carries `tx_blob`
**And** the codec carries drops as strings and never parses an amount (AD-7, NFR-1)

**Given** the online device builds the unsigned transaction
**When** it runs
**Then** it reads Sequence and Fee, runs the live-read guards, and sets `LastLedgerSequence` explicitly to the validated ledger plus 75, not the +20 default (AD-30)
**And** no Ticket is used and no transaction is signed ahead of time

**Given** the offline device receives the QR
**When** the unsigned payload's `network_id` is not its Wallet's
**Then** it refuses it
**And** it shows the decoded fields for the confirm step (FR-20) and signs through `openSigner`, running the Signing Check

**Given** the expiry
**When** it is stated before signing
**Then** it is stated in plain words as a window of roughly four to six minutes, not a promised duration (FR-78)

**Given** the signed blob returns to the online device
**When** it is decoded with xrpl's `decode`
**Then** it is submitted only if it deep-equals the unsigned transaction it sent, ignoring only `SigningPubKey` and `TxnSignature`, and the signing key belongs to the expected Account as master or Regular Key
**And** otherwise it is refused and nothing is submitted

**Given** the transaction expires before it is validated
**When** the result is shown
**Then** it is reported as expired (FR-24), never as failed
**And** the submission goes through `submitAndClassify`

**Given** the module
**When** `bun run lint` runs
**Then** the AD-1 gate module list includes `qr-codec`, a `lib` leaf with no UI or `crypto` import

**Given** signing several transactions per round, or signing ahead
**When** the user tries it
**Then** it is not offered; it is out of scope

**Given** the QR screens
**When** used by keyboard, by screen reader, at 320px and at 200% zoom
**Then** no control is clipped or unreachable (NFR-8, NFR-9)
