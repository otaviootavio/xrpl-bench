---
title: XRPL Bench
status: final
created: 2026-09-12
updated: 2026-09-15
---

# PRD: XRPL Bench

## 0. Document Purpose

This PRD is the consolidated requirement view for XRPL Bench — a self-custody XRP
Ledger wallet, shipped as a PWA, intended to hold real Mainnet funds. It is written
for downstream planning work: epics and stories, architecture, UX, and sprint
scoping.

**It does not restate the existing record, and must not be edited to.** Five
documents are authoritative and this PRD links to them rather than copying them:

| Document | Authoritative for |
|---|---|
| `PRODUCT.md` | Product purpose, users, positioning, principles, brand, licence |
| `docs/user-stories/INDEX.md` + the twelve epic files | Story-level functional detail and the XRPL facts each story relies on |
| `docs/decisions.md` | The stack, the guardrails (§3), the enforced patterns (§4), and every decision's reasoning |
| `DESIGN.md` | The visual system as shipped — tokens, panel vocabulary, named rules |
| `docs/sprints/` | What each sprint found, decided, and left unverified — including residual risk |

Accessibility is the one axis no single document above owns. The conformance
target is **WCAG 2.2 AA**; the mechanics live in §8 (NFR-5, NFR-6, NFR-8, NFR-9,
NFR-10) and the per-component discipline in `docs/agents/ui-and-design-system.md`.

What this PRD adds that none of those provide: **globally numbered, stable
functional requirements** grouped by feature, a single non-goals statement, an
explicit MVP boundary, and success metrics with counter-metrics. Each feature
points at the epic file that details it.

**Where an FR and an epic file disagree, the epic file wins *where it is
current*.** The qualification is load-bearing and is not a hedge: two epic files
are known to be stale, and deferring to them would regress shipped behaviour.

- `docs/user-stories/in-app-notices.md` still presents N1–N4 as open decisions
  blocking S16/S17, for work that shipped on 2026-09-02. FR-49 and FR-53 through
  FR-56 record what shipped; the epic file's open-decision table does not.
- `docs/user-stories/wallet-security.md` specifies passkey-only unlock that
  "never falls back", with the key-encryption key in platform secure storage —
  a mechanism a PWA cannot use. FR-7 records the mandatory PIN that shipped
  instead, and FR-7 is what SM-2 validates.

Both are listed in §10's defect register rather than treated as defects in
this PRD.
Everywhere else, the epic file wins.

`addendum.md` alongside this file holds the technical-how, rejected alternatives,
and residual risks that belong to architecture rather than to product.

**Calibration.** `PRODUCT.md` records this as a single-operator product — the
author is the user, there is no second audience and no support tier. That would
normally argue for a two-page PRD. It is longer than that because the stakes are
set by the money, not by the audience: real Mainnet funds make the cost of a
defect asymmetric and permanent, so the functional surface is enumerated rather
than summarised.

## 1. Vision

A wallet whose keys and spending decisions never leave the device, and which can
be checked rather than believed. There is no backend: the XRP Ledger is the only
server. No account, no email, no session on someone else's machine, no server
that learns which addresses the user watches.

Success is correctness under adversarial conditions, not adoption. The displayed
balance is the ledger's balance. The amount signed is the amount intended. A
credential that cannot decrypt the Vault cannot unlock the app. Every figure on
screen reaches the ledger in one click. A wallet that is pleasant but wrong about
money has failed completely.

Full positioning, principles, and the reasoning behind each: `PRODUCT.md`.

## 2. Target User

### 2.1 Jobs To Be Done

- **Hold my own keys without trusting an operator.** Custody is the point; every
  convenience is measured against it.
- **Know the true Spendable Balance.** Not the balance — the balance minus Base
  Reserve minus Owner Reserves, because the difference is what a failed send
  costs in confusion.
- **Send a payment and know what actually happened.** Submitted is not validated;
  a failure that consumed its fee consumed its fee.
- **Verify the wallet's claims independently.** Cross-checking against an
  explorer is part of the workflow, not a troubleshooting escape hatch.
- **Control when the signing code changes.** A PWA re-fetches its own code; the
  user decides when a new build takes effect.
- **Rehearse on Testnet before spending on Mainnet.** Same app, separate ledger
  state, unmistakable which is which.

### 2.2 Non-Users (v1)

- Anyone being taught custody. XRPL vocabulary — drops, reserve, trust line,
  sequence, destination tag, `tec`/`tef` codes — is used directly, not softened
  into analogy.
- Anyone who wants an exchange. See §5.
- Institutional or shared-account holders. One operator, one device, one set of
  keys. Omnibus addresses are permanently out (§5); **multi-signing is a v1
  boundary rather than a closed door** — §6.2 files it as a future epic, and
  this section describes who v1 is not for, not who the product can never serve.

### 2.3 User Journeys

**Deliberately absent.** `PRODUCT.md` records a single-operator product with one
role and no onboarding funnel for the uninitiated; named-persona journeys here
would be invented, not captured, and this repo's rule is that absent evidence is
not fabricated. The interaction record that would otherwise live here is in
`DESIGN.md` (the shipped panel) and in the twelve epic files (per-story flows).

## 3. Glossary

Terms below are used verbatim throughout this document. Introducing a synonym is
a discipline violation. XRPL definitions are verified against the ledger and are
restated only to the depth an FR needs; the full set lives in
`docs/user-stories/INDEX.md` § Quick Reference.

- **Account** — an address that exists on-ledger. An address becomes an Account
  only on receiving at least the Base Reserve; there is no "create account"
  transaction.
- **Active Wallet** — the one Wallet, of possibly several, that every read and
  every write applies to. Exactly one at a time.
- **Active Network** — Mainnet or Testnet. Each holds independent ledger state for
  the same address. Testnet is the first-run default and the only one with a
  Faucet.
- **Annunciator** — the docked notice area that reports events without covering
  the panel. Present on every screen.
- **Base Reserve** — XRP locked and non-spendable for as long as the Account
  exists (1 XRP at time of writing; read live from `server_state`, whose
  `reserve_base` and `reserve_inc` are denominated in Drops — the unit matters,
  because `server_info` reports the same figures in XRP).
- **Drops** — the integer unit of XRP. 1 XRP = 1,000,000 Drops. All money is
  handled as Drops or as decimal strings, never as a JS number.
- **Faucet** — the Testnet-only service that funds an address with test XRP.
- **Master Key** — one random key generated at setup, wrapped once per configured
  Unlock Method, and unwrapped (never re-derived-and-trusted) on every unlock.
  **This is the app's key-wrapping key and has nothing to do with an XRPL
  account's master key pair.** Where an FR means the latter it says so and names
  the flag (see FR-2, `lsfDisableMasterKey`).
- **Owner Reserve** — XRP locked per owned object the Account holds (0.2 XRP each
  at time of writing). Every owned object costs one — a Trust Line is the kind
  this wallet creates, but not the only kind that counts. The figure that drives
  Spendable Balance is the Account's `OwnerCount`, never a count of the Trust
  Lines this app happens to display.
- **Release Manifest** — the static, same-origin document that names the current
  published build so a running instance can learn a newer one exists.
- **Seed** — the secret from which a Wallet's keypair is derived, and the only
  thing that can recover it. It is the material FR-1 through FR-3 handle, the
  thing the Vault encrypts, and what recovery after a hard lock requires. A Seed is never in application state, never serialized, and never
  transmitted (NFR-2).
- **Spendable Balance** — XRP balance − Base Reserve − (Owner Reserve × owned
  objects). The number the user acts on.
- **Trust Line** — the accounting relationship between holder and issuer in which
  a token balance lives. A token cannot be held or received without one.
- **Unlock Method** — passkey/platform authenticator, or the mandatory app PIN
  fallback. Each wraps the same Master Key.
- **Vault** — the encrypted at-rest store of Seed material, on-device only.
- **Wallet** — one independent keypair and address held by the app.

## 4. Features

Thirteen features: the twelve epics in `docs/user-stories/INDEX.md`, plus the
Address Book (§4.11), which ships but which that index does not list. FRs are
numbered globally and are stable; feature grouping may be reorganised without
renumbering, and new requirements append rather than renumber — which is why
FR-57, FR-58 and FR-59 sit inside §4.6 and §4.4 rather than at the end.

### 4.1 Account Onboarding
*Detail: `docs/user-stories/account-onboarding.md`*

**Description:** First run creates or imports a Wallet, walks Seed backup, and
states the Account's activation status honestly — an unfunded address is not yet
an Account and the app says so rather than rendering a zero balance as if it were
a balance.

#### FR-1: Generate a new Wallet
The user can generate a new keypair and address on-device.
- The Seed is generated locally; it is never transmitted and never logged.
- The Seed is at rest only in the Vault, encrypted.

#### FR-2: Import an existing Wallet from a Seed
The user can import a Wallet by entering a Seed.
- On import the app reads `account_flags` and, if `lsfDisableMasterKey` is set,
  warns before completing that this Seed may be unable to sign.
- The Seed entry field is **deliberately uncontrolled** — its value is held in a
  ref, never in component state, because a controlled input would put Seed
  plaintext into application state and violate NFR-2. Only a boolean "a Seed is
  pending" flag may exist in state. The ref is cleared once the import completes.

#### FR-3: Guided Seed backup
The user is walked through recording the Seed before the Wallet is usable.
- Revealing the Seed requires an explicit confirm step stating the consequence.

#### FR-4: Activation status and reserve requirement
The app distinguishes an address with no Account from an Account with a zero
Spendable Balance, and states the Base Reserve the address must receive.

#### FR-5: View own address
The user can see the Active Wallet's address on demand, in full, without a
pointer (see FR-44).

### 4.2 Wallet Security and Unlock
*Detail: `docs/user-stories/wallet-security.md`. Mechanism: `docs/decisions.md` §4.*

**Description:** One Master Key, wrapped once per Unlock Method. Every unlock
attempt unwraps it. Deriving a key from a wrong PIN or a wrong passkey assertion
always succeeds, so derivation is not authentication — the check is whether the
resulting key decrypts known ciphertext.

#### FR-6: Unlock by passkey
The user can unlock with a platform authenticator where one exists.

#### FR-7: Mandatory PIN fallback
An app PIN is set during onboarding alongside the passkey and is never optional.
- A device with no platform authenticator can still reach every function.

#### FR-8: Unlock is proven by decryption
No Unlock Method is trusted because it produced a key.
- A wrong credential fails on the AES-GCM authentication tag, not on an
  application-level comparison.
- **A passing authentication tag is necessary but not sufficient.** Every
  Unlock Method's wrapped copy must wrap the *current* Master Key. A wrapper
  left behind by a previous Master Key unwraps with a valid tag and then
  decrypts no stored Seed at all — an unlock that succeeds and can do nothing.
  Vault metadata is therefore rebuilt from scratch whenever the Master Key is
  regenerated, never carried forward field by field.
- Any future Unlock Method follows the same wrap/unwrap contract.

#### FR-9: Failed-attempt backoff
Exponential backoff begins at the third consecutive failed attempt; after eight
consecutive failures the Wallet requires full re-import from Seed.
- **The count is durable.** It survives reload, navigation, and app restart;
  a counter that resets with the page would offer no protection at all.
- **It resets only on a successful unlock.** Nothing else clears it.
- **Only a failed unwrap counts.** A cancelled biometric prompt, a dismissed
  passkey sheet, and an Unlock Method that was never configured are not failed
  attempts. Counting them was a real defect: dismissing the platform sheet eight
  times could lock a Wallet to which no wrong credential had ever been supplied.
  This is FR-8's principle applied to counting — only a decryption failure is
  evidence of a wrong credential.
- Reaching the eighth failure blocks the unlock path; it does not itself destroy
  anything. Recovery is re-import from Seed, which is a separate and explicitly
  confirmed action. Whether the user should be warned as the count approaches
  eight is unresolved and tracked in §10.

#### FR-10: Auto-lock on inactivity
The app locks after inactivity — default 5 minutes, user-configurable to
1/5/15/30.

#### FR-11: Auto-lock on backgrounding
The app locks immediately on backgrounding on coarse-pointer devices, and after a
30-second grace window on desktop.
- Alt-tabbing and a phone leaving the user's hand are not treated as the same
  event.

#### FR-12: Lock tears down data, not just the key
Locking clears cached balances, history, and the query cache — not only key
material. A warm cache sitting behind a lock screen is the failure this
requirement exists to prevent.
- **The service-worker cache is explicitly not part of this.** It holds the
  static shell and never an RPC response (NFR-4), so clearing it on lock
  protects nothing and destroys the offline shell FR-52 requires. Account data
  lives in the query cache, which this requirement covers.
- Removal is different: FR-13 tears down that Wallet's persisted state as well,
  because the device is being handed over rather than locked.

### 4.3 Multi-Wallet Management
*Detail: `docs/user-stories/multi-wallet-management.md`*

#### FR-13: Add, list, and remove Wallets
The user can hold several independent Wallets and remove any of them.
- Removal is an irreversible action and requires an explicit confirm step
  stating the consequence.
- Removal tears down that Wallet's cached state **and every persisted trace of
  it**, including locally stored labels. A flow that says everything is gone and
  leaves labelled addresses behind is the shared-device failure this exists to
  prevent.

#### FR-14: Exactly one Active Wallet
Every read and every write applies to the Active Wallet.
- Switching Wallet never leaves data from the previous one on screen.

#### FR-15: Per-Wallet key isolation
Each Wallet has independent key material; re-authentication is required only
when signing needs that Wallet's key.

### 4.4 Sending Payments
*Detail: `docs/user-stories/sending-payments.md`*

**Description:** The highest-consequence surface in the product. Every irreversible
step states its exact consequence in plain language before it proceeds, and the
outcome distinguishes submitted from validated.

#### FR-16: Send an XRP payment
The user can send XRP to an address from the Active Wallet.
- The destination is validated as a well-formed address before the confirm step.
- A destination that is not yet an Account is called out, with the Base Reserve
  it must receive (FR-4) — a payment below that leaves the funds unusable.
- The form blocks submission unless amount plus fee is within the Spendable
  Balance. Displaying the fee (FR-18) is not the same as refusing a send that
  the reserve will reject.

#### FR-17: Send an issued-currency payment
The user can send a token, subject to a Trust Line existing for it.

#### FR-18: Fee shown before signing
The recommended fee is displayed before the confirm step, not after.

#### FR-19: Destination tag entry
The user can attach a destination tag to a payment.
- The app reads the destination's `lsfRequireDestTag` flag and, where the
  destination requires a tag, **blocks the send until one is supplied.** Sending
  without a required tag is a known way to lose funds at an exchange.
- **An indeterminate read blocks too.** If the destination's flags cannot be
  read, the app does not treat that as "no tag required" — a failed read must
  never coerce to the permissive answer.

#### FR-20: Mandatory confirm step
No payment is signed without an explicit confirmation naming destination, exact
amount, fee, and **the destination tag — or its deliberate absence.** A tag is
part of where the money lands, so a confirm step that omits it is confirming an
incomplete destination.

#### FR-21: First-time-destination warning
Sending to an address not in the Address Book shows a "you haven't sent here
before" step.

#### FR-22: Submitted vs. validated distinction
The app never reports a submitted transaction as final.
- A validated result and a submitted-but-unvalidated result are visually and
  textually distinct.

#### FR-23: Result codes reported plainly
`tec`/`tef` and other result codes are surfaced with their meaning.
- A transaction that failed *and* consumed its fee states both halves.

#### FR-24: LastLedgerSequence expiry handling
The app tracks `LastLedgerSequence`; once the ledger closes past it without
validation, the transaction is marked "expired, not applied".
- Retry issues a fresh transaction with a new sequence number. The same signed
  blob is never blind-resubmitted.

#### FR-58: The app never sends a partial payment
No transaction this app signs sets `tfPartialPayment`.
- The flag lets less arrive than the sender named, which is irreconcilable with
  FR-20's confirm step: the user confirmed an exact amount.
- The failure is silent: a partial payment succeeds, and only the delivered
  amount reveals the shortfall.

#### FR-25: Frozen Trust Line blocks sending
An asset on a Trust Line frozen by its issuer cannot be sent, and the control is
`aria-disabled` with the reason in visible text.

### 4.5 Receiving Payments
*Detail: `docs/user-stories/receiving-payments.md`*

#### FR-26: Share address and QR code
The user can display and share the Active Wallet's address as text and as a QR
code.

#### FR-27: Share a destination tag
The user can include a destination tag in what is shared.

#### FR-28: Incoming-payment notice
An incoming payment raises a notice in the Annunciator while the app is open.
- XRP and token receipts are distinguished.
- The amount reported is the delivered amount (FR-57).
- This is in-app only. Background delivery is a permanent non-goal (§5).

### 4.6 Viewing Balances
*Detail: `docs/user-stories/viewing-balances.md`*

#### FR-29: XRP balance with reserved vs. spendable separated
The app shows the XRP balance and the Spendable Balance as distinct figures.
- Base Reserve and Owner Reserve values are read live from `server_state`, never
  hardcoded.
- Where a figure is an upper bound, it says so.

#### FR-59: A failed read is reported where the data would be
Every screen that reads from the ledger reports a read that failed, in the place
the missing data would have occupied, with a way to try again.
- **A failure and an empty result are different facts.** A screen may state that
  there is nothing there only when the read succeeded and came back empty.
  Claiming an account is empty because the app could not read it is worse than
  silence.
- **Data retained from an earlier success is not shown as current.** No figure,
  no liveness indicator, while the read is in error.
- **An indeterminate read never relaxes a guard** (FR-19). Absence of a
  prohibition is not permission.
- These reports do not expire on a timer, and the underlying transport error is
  not shown — it is no more meant for a person than a raw `tec` code is.

#### FR-30: Per-token balances
Token balances are shown per Trust Line, with the issuer identified.

#### FR-57: A displayed amount is the delivered amount
Wherever the app shows what a payment moved, it shows what actually arrived.
- For any Payment, the figure displayed is the transaction metadata's
  `delivered_amount`, **never** the requested `Amount`/`DeliverMax`. On a
  partial payment those differ, and the requested figure is not what arrived.
- Where `delivered_amount` is unavailable — possible only for very old partial
  payments — the requested figure may be shown **only** when labelled as an
  upper bound, per FR-29.
- This governs FR-28, FR-36, and FR-37. A wallet that reports a requested
  amount as received is wrong about money, which §1 treats as total failure.

### 4.7 Tokens and Trust Lines
*Detail: `docs/user-stories/tokens-and-trustlines.md`*

#### FR-31: Create a Trust Line
The user can open a Trust Line to an issuer.
- The Owner Reserve cost is stated before the action proceeds.
- The Trust Line is created with `tfSetNoRipple`. Rippling through a pair of
  Trust Lines is blocked only when the flag is set on **both** of them, so this
  protects every pair the app itself created — not a pair where the other line
  predates this behaviour or came from another client.

#### FR-32: Edit a Trust Line limit
The user can change an existing Trust Line's limit.

#### FR-33: Remove a Trust Line
The user can close a Trust Line.
- Closing is irreversible and requires an explicit confirm step.

#### FR-34: Frozen Trust Line is marked wherever it appears
A Trust Line frozen by its issuer carries a visible frozen indication in every
place it is shown. Frozen is live ledger state rather than a fixed label, so it
uses the design system's status-indicator vocabulary — a lamp plus a word, never
colour alone (NFR-6). `DESIGN.md` is authoritative for which component that is.

#### FR-35: Trust Line list pagination
`account_lines` is paginated; the list is complete regardless of Trust Line count.

### 4.8 Transaction History
*Detail: `docs/user-stories/transaction-history.md`*

#### FR-36: Chronological history
The user can list past transactions for the Active Wallet on the Active Network.
- Sent and received are distinguished.

#### FR-37: Transaction detail
Any entry expands to its detail, including result code, fee, and destination
tag where one was present. Amounts follow FR-57.

### 4.9 Network Selection
*Detail: `docs/user-stories/network-selection.md`*

#### FR-38: Switch Active Network
The user can switch between Mainnet and Testnet.
- Switching never leaves data from the previous Network on screen.

#### FR-39: Mainnet is unmistakable
Mainnet carries a real-funds indication that does not rely on colour alone.

#### FR-40: Testnet Faucet funding
On Testnet the user can fund the Active Wallet's address from the Faucet.
- The Faucet funds **the address the user already holds.** A Faucet response
  that includes a Seed or a new Account is never ingested; the app does not
  adopt key material handed to it by a network service.
- No equivalent is offered on Mainnet, and the absence is explained rather than
  silent.

#### FR-41: One endpoint plus one failover per Network
Each Network has a hardcoded primary and a hardcoded backup endpoint, with
failover between them. Endpoints are not user-editable in v1 (§6.2).

### 4.10 Block Explorer Cross-Check
*Detail: `docs/user-stories/block-explorer-links.md`*

#### FR-42: Every address and hash links out
Every address and transaction hash rendered anywhere in the app links to the
Network-appropriate official explorer.
- Links route through the shared link components; no hand-rolled explorer anchor
  exists.
- Mainnet links resolve to livenet, Testnet links to testnet. A link never points
  at the wrong Network's explorer.

#### FR-43: Indexing lag is stated
Copy accompanying explorer links acknowledges that the explorer may lag the
ledger.

#### FR-44: Truncated identifiers are reachable without a pointer
A truncated address or hash can be read in full by keyboard alone.
- The character-by-character check is the product's own cross-check affordance
  and therefore cannot be hover-only.

### 4.11 Address Book
*Local-only; decided in `docs/decisions.md` §2. Note: this capability ships, but it
is absent from `docs/user-stories/INDEX.md` — the authoritative functional
contract — which lists neither an Address Book epic nor an epic file for it. Drift
reported, not repaired; see `addendum.md` §7.*

#### FR-45: Local labels for addresses
The user can label addresses locally.
- Labels are device-local. There is no on-chain and no synced component.
- The Address Book is what FR-21 tests "first time" against.

### 4.12 App Versioning and User-Controlled Updates
*Detail: `docs/user-stories/app-versioning-and-updates.md`*

**Description:** The app is delivered from a CDN, so its signing code is
re-fetched rather than installed once. This feature is what keeps the no-backend
claim honest: a compromised origin cannot silently substitute signing code,
because substitution requires the user to accept a version they can inspect.

#### FR-46: The running build is identifiable
A build stamp is baked in at build time and is visible in the app, **including
before unlock.** A user deciding whether to trust the code in front of them has
not unlocked yet, so a stamp reachable only from Settings answers the question
too late.

#### FR-47: A new release is discoverable
A static, same-origin Release Manifest lets a running instance learn a newer
build exists.

#### FR-48: The app never updates itself
A new service worker installs and waits. Only an explicit user action activates
it.
- A declined version stays declined for that version.
- An update cannot be applied while a transaction is in flight.

#### FR-49: Changelog before acceptance
The user sees what changed before accepting an update.

#### FR-50: Builds are reproducible
A release rebuilds byte-identically from its published tag, so a user can verify
that what is served is what was published.

#### FR-51: Recovery from a broken update
A user can recover from a bad update without clearing site data.

#### FR-52: Full offline operation of the shell
The installed shell renders offline.
- **The service worker never caches an RPC response** (NFR-4), so an offline app
  renders itself but never renders a balance it cannot verify.
- This is distinct from the in-memory query cache of NFR-3, which does hold
  ledger reads for the life of an unlocked session and is torn down on lock
  (FR-12). "Never cached" refers to durable, cross-session storage — not to the
  session-scoped cache that makes the app usable.

### 4.13 In-App Notices
*Detail: `docs/user-stories/in-app-notices.md`*

#### FR-53: Notices are docked, never overlaid
The Annunciator occupies a reserved area and never covers the panel or the
navigation.
- Present on the main, unlock, and onboarding surfaces alike.

#### FR-54: Errors and warnings never auto-dismiss
A message about a consumed fee or a failed unlock does not expire on a timer.

#### FR-55: Notices are announced politely
Notices render inside a polite live region, including any expanded secondary
list.

#### FR-56: Bounded height with severity and count overflow
When notices exceed the reserved area, overflow is summarised by severity and
count rather than growing the area.

## 5. Non-Goals (Explicit)

**This is not an exchange, and will not become one.** Permanently out of scope:

- Token swaps or any built-in DEX trading UI.
- Fiat on-ramp, off-ramp, or card purchases.
- Staking, yield, or lending.
- KYC/AML, custodial account recovery, shared or omnibus addresses.

**Permanently out, for architectural reasons rather than absence of effort:**

- **Web Push for incoming payments.** It requires a server to hold subscriptions
  and send. That contradicts "no backend exists to compromise", which is a
  positioning commitment rather than an unbuilt feature.

**Deferred, not permanently closed:**

- **Fiat-equivalent balance display.** It would add a price-oracle dependency and
  a third party with a view of what the user holds — a real objection, but a
  cost to be weighed rather than a contradiction of the positioning.
  `PRODUCT.md` and `docs/decisions.md` §2 both file this as deferred, and this
  PRD follows them; an earlier draft of this section called it permanent, which
  overstated the record.

**Not in the notices feature, specifically:** a notification centre with history
surviving reload, unread badges on the function tabs, and sound.

**Also not:** telemetry, analytics, session replay, or any third-party script with
a path to the unlock or Seed surfaces.

## 6. MVP Scope

### 6.1 In Scope

All thirteen features in §4 — FR-1 through FR-59. Every one is implemented at the
time of writing; this PRD records the v1 boundary rather than proposing it.
FR-57 and FR-58 document money-correctness behaviour the code already has and
this PRD previously failed to state.

### 6.2 Out of Scope for MVP

- **Checks, Escrow, Payment Channels** — real XRPL features, each its own future
  epic. Not required for a minimum functional self-custody wallet.
- **Multi-signing and regular-key rotation** — same; and multi-party signing is a
  different product shape from the single-operator assumption in §2.
- **User-editable RPC endpoints** — v1 ships one hardcoded endpoint plus one
  failover per Network (FR-41). **This is the deferral most likely to be missed
  by an operator who does not trust the shipped endpoints**, and it is tracked
  as an open question (§10) rather than left as an annotation, because an
  operator who cannot choose an endpoint is trusting two servers the product
  never asked them to evaluate.
- **Automated live-ledger integration testing** — the Testnet validation pass is
  manual and is a stated pre-release prerequisite, not an automated gate.
- **RTL layout** — recorded as genuinely unreviewed rather than dismissed.
- **Automated accessibility audit (axe)** — unavailable in the build environment;
  the manual keyboard and screen-reader pass per component stands in for it.

## 7. Success Metrics

Calibrated to a single-operator product holding real funds: the metrics that
matter are correctness gates, not usage.

**What these metrics do and do not cover.** They are gates on the properties that
would lose money, not coverage of the functional surface. Most FRs have no metric
and are verified by the manual pass and the epic files' acceptance criteria
instead. Read the "Validates" clauses below as *what this gate is aimed at*, not
as a traceability claim — a claim of full coverage would be the kind of
comforting falsehood §9.6 exists to forbid.

**Primary**

- **SM-1 — No wrong money, ever.** Zero instances of a displayed balance, fee, or
  amount that disagrees with the ledger. Measured by explorer cross-check on
  every release's manual Testnet pass. Validates FR-16 through FR-30, FR-57, and FR-58.
- **SM-2 — Unlock cannot be forged.** A wrong credential never unlocks, in any
  configuration, including a device with only the PIN configured. Validates FR-6
  through FR-9.
- **SM-3 — The author holds real Mainnet funds in it and continues to.** The only
  adoption metric that exists for this product.
  **Precondition, so that this is falsifiable rather than aspirational:**
  1. The manual live Testnet integration pass.
  2. The device- and tool-blocked verifications in `addendum.md` §5 closed — the
     Android home-screen install, 200% zoom on a real browser rather than
     emulated, and the live colour-scheme `change` listener.
  3. The multi-wallet UI exercised with more than one Wallet present.

  Until all three hold, SM-3 is not yet measurable, and saying so is the point.

**Secondary**

- **SM-4 — All four gates green on every merge.** `lint`, `build`, `test`,
  `check:contrast` (`tsc -b` runs inside `build`). Aimed at the three NFRs a gate
  can actually decide: NFR-3's query-key discipline and NFR-4's service-worker
  rule, both enforced inside `lint` by `scripts/check-query-keys.mjs` and
  `scripts/check-sw-register.mjs`, and NFR-6's contrast rule. The remaining NFRs
  are enforced by review and by the manual pass, and SM-C3 is the guard against
  reading this metric as more than it is.
- **SM-5 — A release rebuilds byte-identically from its tag.** Validates FR-50.
- **SM-6 — Every surface passes keyboard-only and screen-reader use at 320px and
  200% zoom.** Validates FR-44, FR-53 through FR-56.

**Counter-metrics (do not optimize)**

- **SM-C1 — Do not optimize for fewer confirmation steps.** Counterbalances any
  read of SM-3 as "make it pleasant to use". Friction before an irreversible
  action is the product working.
- **SM-C2 — Do not optimize for perceived speed on ledger reads.** Counterbalances
  SM-1's cross-check cost. Caching an RPC response to make a balance appear
  faster is the failure mode this product is built to avoid.
- **SM-C3 — Do not optimize for gate count.** Counterbalances SM-4. Four green
  gates mean nothing is *provably* broken, not that a change works; adding gates
  is not the same as verifying.

## 8. Cross-Cutting NFRs

Each exists because it is a known failure mode on this stack. The guardrails and
enforced patterns are `docs/decisions.md` §3 and §4, but three of the eleven below
are recorded elsewhere in that document and the citation is given per NFR rather
than blanket — §3 and §4 carry nothing on focus, colour, or viewport.

- **NFR-1 — Money is strings or BigInt end to end.** Formatting happens only at
  the single render-boundary formatter. No `Number()` on a Drops value anywhere.
- **NFR-2 — No secret is ever serializable.** No Seed and no exported key
  material enters `localStorage`, React state, a store, the URL, or anything
  that gets stringified — including in development builds.
  - **The one deliberate exception is a non-extractable `CryptoKey` handle.**
    Such a handle cannot be read out or serialized by design, so holding the
    unlocked Vault key in store or session state is permitted and intended; it
    is what lets a refresh inside the auto-lock window avoid re-entering the PIN.
    `docs/decisions.md` §4 records this by name and instructs that it must not be
    "fixed" by removal. Its lifetime is the auto-lock window, not "immediately".
  - Decrypted Seed plaintext is the thing that exists only transiently, for the
    duration of a signing operation, and is cleared as soon as it is used.
- **NFR-3 — Every ledger read goes through a query hook.** Its key includes the
  Active Wallet and the Active Network, so a switch of either can never leave
  stale cross-wallet or cross-network data on screen.
- **NFR-4 — The service worker caches the static shell only.** Never an RPC
  response. Cache version increments on deploy and old caches purge on activate.
- **NFR-5 — Nothing styles `:focus`.** `outline-none` is banned; the platform's
  own indicator is the indicator. (`docs/decisions.md` §6.3.)
- **NFR-6 — Colour never carries meaning alone**, and `bun run check:contrast` is
  the gate. It evaluates a **declared list** of the pairs the app renders in both
  themes, alpha composites included, and exits non-zero on failure. The list is
  curated, not discovered: a token nobody added is a token nobody measured, so
  adding a colour means adding its pair. A failure is fixed by introducing a
  token for the missing role — never by silently repainting an existing one,
  which trades a measured failure for an unmeasured one.
  (`docs/decisions.md` §6.2 and §7.5; `PRODUCT.md` § Brand Commitments.)
- **NFR-7 — Every irreversible action states its exact consequence** in plain
  language before it proceeds.
- **NFR-8 — Every bespoke component gets a keyboard-only and screen-reader pass
  before merge**, not as deferred polish.
- **NFR-9 — Supported conditions include a 320px viewport and 200% zoom**, each
  independently. They are not multiplied: the requirement is 320px at normal
  zoom and 200% zoom at a normal viewport, not a 160px effective width. A clipped
  or unreachable control at either is an escalation, not a nitpick.
  (`docs/decisions.md` §6.8, §6.9, §7.2, §9.5.)
- **NFR-10 — Motion respects `prefers-reduced-motion`.** A `PRODUCT.md`
  commitment that the guardrail sections do not carry.
- **NFR-11 — A list never uses an array index as its React key.** Row identity
  must come from the item, or per-row state sticks to the wrong item after a
  Wallet switch — which is FR-14's guarantee failing in a way FR-14 cannot see.
  (`docs/decisions.md` §3.)

## 9. Constraints and Guardrails

### 9.1 Safety
The cost of a defect is asymmetric and permanent. Where clarity and brevity
conflict, **clarity about consequence** wins; where speed and verifiability
conflict, verifiability wins. A control that is temporarily unavailable is
`aria-disabled` with its reason in visible text — never hidden.

The emphasis is deliberate and narrow. **Explanation earns its place only where
the ledger's behaviour is genuinely surprising or where money is at stake** —
what a reserve locks, what a frozen Trust Line prevents, whether a failed
transaction still consumed its fee. Nowhere else. The user knows XRPL, and its
vocabulary is theirs: Drops, reserve, Trust Line, sequence, destination tag,
`tec`/`tef` codes are used directly rather than softened into analogy (§2.2).
A surface that explains everywhere is not safer, only slower to read — and it
buries the one sentence that was worth reading. `PRODUCT.md` § Principles is
authoritative.

### 9.2 Privacy
Nothing leaves the device. No backend, no telemetry, no account, no server that
learns which addresses the user watches. The only outbound traffic is to the
Network's RPC endpoints and, on user action, to the block explorer.

### 9.3 Delivery and Residual Risk
The app is served from a CDN, and **a CDN origin plus a deploy pipeline is in
tension with "no backend exists to compromise".** This is stated as a standing
constraint rather than a note to be resolved later. User-controlled updates
(FR-46 through FR-51) mitigate silent substitution; a user who accepts an update
without verifying it against the published tag is a real residual risk, not a
solved one. Recorded in full in `docs/sprints/cicd-sprints.md` as CD-6 and in
`addendum.md` §4.

Production currently serves from a provider subdomain. Because IndexedDB is
origin-scoped, moving to a custom domain later would strand every existing
Vault and force a re-import from Seed — so the origin has to be settled before
anyone but the author is invited to use it. `docs/decisions.md` §8.11 is
authoritative and states the precondition. SM-3 concerns the author's own funds,
so this is tracked separately as an open question in §10 rather than folded into
that metric.

### 9.4 Platform
Web, installed as a PWA, used on both phone and desktop. Narrowest supported
viewport 320px. Offline is a partial state: the shell renders, ledger data does
not.

### 9.5 Licence and Naming
`FSL-1.1-ALv2` — source-available, **not** open source; it converts to Apache 2.0
two years after each release. No project material, UI copy included, may describe
it as open source. Product name is **XRPL Bench**, repository slug `xrpl-bench`.
No trademark clearance has been performed on "XRPL". Full reasoning:
`PRODUCT.md` § Licence and § Brand Commitments.

### 9.6 Evidence Discipline
There are no third-party users, testimonials, case studies, press, usage figures,
or performance benchmarks. The product has never been hosted for others and has
not yet held real Mainnet funds. Future work must not fabricate any of these.

## 10. Open Questions

Each carries an owner and a condition that brings it back. An item with neither
is not deferred, it is forgotten.

1. **Should the empty reserved notice band render as a visible dashed outline on
   a phone?** It costs roughly a sixth of the viewport at 320px. Raised and
   explicitly not answered in `docs/sprints/mobile-chrome-sprints.md`.
   *Owner: Otavio. Revisit: next visual pass on the Annunciator.*
2. **Should the unlock surface warn as the failure count approaches the hard
   lock?** Today the backoff says "try again in Ns", and the eighth failure says
   "re-import your Wallet with your Seed" — but nothing is said in between. For a
   user whose Seed backup is imperfect, arriving at eight is effectively loss.
   NFR-7 wants a consequence stated *before* the irreversible step; here it lands
   after. Neither the requirement nor the build does this today.
   *Owner: Otavio. Revisit: before the first real Mainnet funding (§7, SM-3).*
3. **Is a scoped deploy credential obtainable?** The CI deploy uses an
   account-wide API key, recorded as residual risk in
   `docs/sprints/cicd-sprints.md`.
   *Owner: Otavio. Revisit: if the provider's API grows a narrower scope.*
4. **When is the production origin settled?** The constraint and its cost are in
   §9.3; `docs/decisions.md` §8.11 states the precondition — settle it before
   anyone but the author is invited.
   *Owner: Otavio. Revisit: before inviting a second user.*
5. **When does RTL get a real review?** Recorded as unreviewed rather than
   dismissed. §6.2 carries the same item as an MVP exclusion; this is the entry
   that owns it. The accepted risk is that RTL then becomes unbudgeted work
   discovered late.
   *Owner: Otavio. Revisit: when a user requiring an RTL locale exists.*
6. **Should RPC endpoints become user-editable?** §6.2 names this as the
   deferral most likely to be missed by an operator who does not trust the two
   shipped endpoints.
   *Owner: Otavio. Revisit: on the first concrete objection to an endpoint.*

**Defects in the authoritative inputs, reported and not repaired.** These are not
open questions about the product — they are places where a document this PRD
defers to is wrong, recorded so §0's tie-break rule is applied with open eyes.

- `docs/user-stories/in-app-notices.md` presents N1–N4 as open decisions
  blocking S16/S17, for work that shipped on 2026-09-02.
- `docs/user-stories/wallet-security.md` specifies passkey-only unlock that
  "never falls back", with the key-encryption key in platform secure storage —
  a mechanism a PWA cannot use, and contradicted by the mandatory PIN in FR-7.
- `docs/user-stories/INDEX.md` lists neither an Address Book epic nor an epic
  file, though the capability ships and FR-21 and FR-45 depend on it (§4.11).
- `CLAUDE.md`'s five-document table has no row for the product layer, though it
  cites `PRODUCT.md` and depends on it.
- `docs/sprints/cicd-sprints.md` still describes `promotion-source` as a
  head-branch-name check; `docs/decisions.md` §11 replaced it with tree equality.
- `DESIGN.md` documents only the true `disabled` state, while §9.1 and FR-25
  require `aria-disabled` with the reason in visible text.

**Verification gaps carried forward.** Recorded because the four gates green means
nothing is *provably* broken, not that a change works.

- The validated-payment outcome box and the `expired` transaction status have
  never been rendered; only the `tec*` path was exercised. Underwrites FR-22,
  FR-23, FR-24, and SM-1.
- A Trust Line with a non-zero balance has never been rendered against real
  ledger state. Underwrites FR-33 and FR-34.
- The multi-wallet UI has never been exercised with more than one Wallet
  present. Underwrites FR-13, FR-14 and NFR-11, and is SM-3's third precondition.
- The device- and tool-blocked items enumerated in `addendum.md` §5.

## 11. Assumptions Index

- **§0** — `[ASSUMPTION]` This PRD records the v1 boundary as built rather than
  proposing new scope. Confirmed as the accepted frame: §6.1's "already
  implemented", §7's correctness-gate metrics, and §2.3's absent journeys all
  follow from it and are deliberate, not omissions.
- **§0** — `[ASSUMPTION]` The tie-break rule now defers to an epic file only
  *where it is current*. Two stale files are named in §10; the qualification is
  necessary because applying the rule literally would regress shipped behaviour.
- **§2.3** — `[ASSUMPTION]` User journeys are omitted rather than invented,
  because `PRODUCT.md` records one operator and no second audience.
- **§3** — `[ASSUMPTION]` Reserve figures are stated as "at time of writing"
  because the code reads them live; no FR depends on the constant.
- **§4.11** — `[ASSUMPTION]` The Address Book is filed as a thirteenth feature on
  the strength of `docs/decisions.md` §2 ("add as a new epic") and `PRODUCT.md`
  (in scope, shipped), even though `docs/user-stories/INDEX.md` does not list it.
  FR-21 and FR-45 depend on it existing, and neither has an authoritative
  acceptance criterion anywhere. This is a known contract gap, not a closed one.
- **§7** — `[ASSUMPTION]` Success metrics are correctness gates rather than usage
  targets. No usage target exists anywhere in the repo record.
