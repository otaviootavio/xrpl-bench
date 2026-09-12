---
title: XRPL Bench
status: draft
created: 2026-09-12
updated: 2026-09-12
---

# PRD: XRPL Bench

## 0. Document Purpose

This PRD is the consolidated requirement view for XRPL Bench — a self-custody XRP
Ledger wallet, shipped as a PWA, intended to hold real Mainnet funds. It is written
for downstream planning work: epics and stories, architecture, UX, and sprint
scoping.

**It does not restate the existing record, and must not be edited to.** Four
documents are authoritative and this PRD links to them rather than copying them:

| Document | Authoritative for |
|---|---|
| `PRODUCT.md` | Product purpose, users, positioning, principles, brand, licence |
| `docs/user-stories/INDEX.md` + the twelve epic files | Story-level functional detail and the XRPL facts each story relies on |
| `docs/decisions.md` | The stack, the guardrails (§3), the enforced patterns (§4), and every decision's reasoning |
| `DESIGN.md` | The visual system as shipped — tokens, panel vocabulary, named rules |

What this PRD adds that none of those provide: **globally numbered, stable
functional requirements** grouped by feature, a single non-goals statement, an
explicit MVP boundary, and success metrics with counter-metrics. Each feature
points at the epic file that details it. Where an FR and an epic file disagree,
the epic file wins and this PRD is stale.

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
credential that cannot decrypt the vault cannot unlock the app. Every figure on
screen reaches the ledger in one click. A wallet that is pleasant but wrong about
money has failed completely.

Full positioning, principles, and the reasoning behind each: `PRODUCT.md`.

## 2. Target User

### 2.1 Jobs To Be Done

- **Hold my own keys without trusting an operator.** Custody is the point; every
  convenience is measured against it.
- **Know the true spendable number.** Not the balance — the balance minus base
  reserve minus owner reserves, because the difference is what a failed send
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
  keys; no multi-sig, no omnibus addresses.

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
  exists (1 XRP at time of writing; read live from `server_state`).
- **Drops** — the integer unit of XRP. 1 XRP = 1,000,000 Drops. All money is
  handled as Drops or as decimal strings, never as a JS number.
- **Faucet** — the Testnet-only service that funds an address with test XRP.
- **Master Key** — one random key generated at setup, wrapped once per configured
  Unlock Method, and unwrapped (never re-derived-and-trusted) on every unlock.
- **Owner Reserve** — XRP locked per owned object the Account holds (0.2 XRP each
  at time of writing). Each Trust Line costs one.
- **Release Manifest** — the static, same-origin document that names the current
  published build so a running instance can learn a newer one exists.
- **Spendable Balance** — XRP balance − Base Reserve − (Owner Reserve × owned
  objects). The number the user acts on.
- **Trust Line** — the accounting relationship between holder and issuer in which
  a token balance lives. A token cannot be held or received without one.
- **Unlock Method** — passkey/platform authenticator, or the mandatory app PIN
  fallback. Each wraps the same Master Key.
- **Vault** — the encrypted at-rest store of seed material, on-device only.
- **Wallet** — one independent keypair and address held by the app.

## 4. Features

Thirteen features: the twelve epics in `docs/user-stories/INDEX.md`, plus the
Address Book (§4.11), which ships but which that index does not list. FRs are numbered
globally and are stable; feature grouping may be reorganised without renumbering.

### 4.1 Account Onboarding
*Detail: `docs/user-stories/account-onboarding.md`*

**Description:** First run creates or imports a Wallet, walks seed backup, and
states the Account's activation status honestly — an unfunded address is not yet
an Account and the app says so rather than rendering a zero balance as if it were
a balance.

**Functional Requirements:**

#### FR-1: Generate a new Wallet
The user can generate a new keypair and address on-device.
- The seed is generated locally; it is never transmitted and never logged.
- The seed is at rest only in the Vault, encrypted.

#### FR-2: Import an existing Wallet from a seed
The user can import a Wallet by entering a seed.
- On import the app reads `account_flags` and, if `lsfDisableMasterKey` is set,
  warns before completing that this seed may be unable to sign.
- Seed entry fields are controlled by the app and never retain plaintext after
  the import completes.

#### FR-3: Guided seed backup
The user is walked through recording the seed before the Wallet is usable.
- Revealing the seed requires an explicit confirm step stating the consequence.

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

**Functional Requirements:**

#### FR-6: Unlock by passkey
The user can unlock with a platform authenticator where one exists.

#### FR-7: Mandatory PIN fallback
An app PIN is set during onboarding alongside the passkey and is never optional.
- A device with no platform authenticator can still reach every function.

#### FR-8: Unlock is proven by decryption
No Unlock Method is trusted because it produced a key.
- A wrong credential fails on the AES-GCM authentication tag, not on an
  application-level comparison.
- Any future Unlock Method follows the same wrap/unwrap contract.

#### FR-9: Failed-attempt backoff
Exponential backoff begins at the third consecutive failed attempt; after eight
consecutive failures the Wallet requires full re-import from seed.

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
material.

### 4.3 Multi-Wallet Management
*Detail: `docs/user-stories/multi-wallet-management.md`*

#### FR-13: Add, list, and remove Wallets
The user can hold several independent Wallets and remove any of them.
- Removal is an irreversible action and requires an explicit confirm step
  stating the consequence.
- Removal tears down that Wallet's cached state and service-worker cache.

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

#### FR-17: Send an issued-currency payment
The user can send a token, subject to a Trust Line existing for it.

#### FR-18: Fee shown before signing
The recommended fee is displayed before the confirm step, not after.

#### FR-19: Destination tag entry
The user can attach a destination tag to a payment.

#### FR-20: Mandatory confirm step
No payment is signed without an explicit confirmation naming destination, exact
amount, and fee.

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
- This is in-app only. Background delivery is a permanent non-goal (§5).

### 4.6 Viewing Balances
*Detail: `docs/user-stories/viewing-balances.md`*

#### FR-29: XRP balance with reserved vs. spendable separated
The app shows the XRP balance and the Spendable Balance as distinct figures.
- Base Reserve and Owner Reserve values are read live from `server_state`, never
  hardcoded.
- Where a figure is an upper bound, it says so.

#### FR-30: Per-token balances
Token balances are shown per Trust Line, with the issuer identified.

### 4.7 Tokens and Trust Lines
*Detail: `docs/user-stories/tokens-and-trustlines.md`*

#### FR-31: Create a Trust Line
The user can open a Trust Line to an issuer.
- The Owner Reserve cost is stated before the action proceeds.

#### FR-32: Edit a Trust Line limit
The user can change an existing Trust Line's limit.

#### FR-33: Remove a Trust Line
The user can close a Trust Line.
- Closing is irreversible and requires an explicit confirm step.

#### FR-34: Frozen Trust Line badge
A Trust Line frozen by its issuer is badged as such wherever it appears.

#### FR-35: Trust Line list pagination
`account_lines` is paginated; the list is complete regardless of Trust Line count.

### 4.8 Transaction History
*Detail: `docs/user-stories/transaction-history.md`*

#### FR-36: Chronological history
The user can list past transactions for the Active Wallet on the Active Network.
- Sent and received are distinguished.

#### FR-37: Transaction detail
Any entry expands to its detail, including result code and fee.

### 4.9 Network Selection
*Detail: `docs/user-stories/network-selection.md`*

#### FR-38: Switch Active Network
The user can switch between Mainnet and Testnet.
- Switching never leaves data from the previous Network on screen.

#### FR-39: Mainnet is unmistakable
Mainnet carries a real-funds indication that does not rely on colour alone.

#### FR-40: Testnet Faucet funding
On Testnet the user can fund the Active Wallet's address from the Faucet.
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
A build stamp is baked in at build time and is visible in the app.

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
- Ledger data is network-first and never cached, so an offline app renders
  itself but never renders a balance it cannot verify.

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

**Permanently deferred for architectural reasons, not absence of effort:**

- **Web Push for incoming payments.** It requires a server to hold subscriptions
  and send. That contradicts "no backend exists to compromise", which is a
  positioning commitment rather than an unbuilt feature.
- **Fiat-equivalent balance display.** It would add a price-oracle dependency and
  a third party with a view of what the user holds.

**Not in the notices feature, specifically:** a notification centre with history
surviving reload, unread badges on the function tabs, and sound.

**Also not:** telemetry, analytics, session replay, or any third-party script with
a path to the unlock or seed surfaces.

## 6. MVP Scope

### 6.1 In Scope

All thirteen features in §4 — FR-1 through FR-56. Every one is implemented at the
time of writing; this PRD records the v1 boundary rather than proposing it.

### 6.2 Out of Scope for MVP

- **Checks, Escrow, Payment Channels** — real XRPL features, each its own future
  epic. Not required for a minimum functional self-custody wallet.
- **Multi-signing and regular-key rotation** — same; and multi-party signing is a
  different product shape from the single-operator assumption in §2.
- **User-editable RPC endpoints** — v1 ships one hardcoded endpoint plus one
  failover per Network (FR-41). `[NOTE FOR PM]` This is the deferral most likely
  to be missed by an operator who does not trust the shipped endpoints.
- **Automated live-ledger integration testing** — the Testnet validation pass is
  manual and is a stated pre-release prerequisite, not an automated gate.
- **RTL layout** — recorded as genuinely unreviewed rather than dismissed.
- **Automated accessibility audit (axe)** — unavailable in the build environment;
  the manual keyboard and screen-reader pass per component stands in for it.

## 7. Success Metrics

Calibrated to a single-operator product holding real funds: the metrics that
matter are correctness gates, not usage.

**Primary**

- **SM-1 — No wrong money, ever.** Zero instances of a displayed balance, fee, or
  amount that disagrees with the ledger. Measured by explorer cross-check on
  every release's manual Testnet pass. Validates FR-16 through FR-30.
- **SM-2 — Unlock cannot be forged.** A wrong credential never unlocks, in any
  configuration, including a device with only the PIN configured. Validates FR-6
  through FR-9.
- **SM-3 — The author holds real Mainnet funds in it and continues to.** The only
  adoption metric that exists for this product. Validates the whole.

**Secondary**

- **SM-4 — All four gates green on every merge.** `lint`, `build`, `test`,
  `check:contrast`. Validates the cross-cutting NFRs.
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

Each exists because it is a known failure mode on this stack. Reasoning and the
full guardrail list: `docs/decisions.md` §3 and §4.

- **NFR-1 — Money is strings or BigInt end to end.** Formatting happens only at
  the single render-boundary formatter. No `Number()` on a Drops value anywhere.
- **NFR-2 — No secret is ever serializable.** No secret enters `localStorage`,
  React state, a store, the URL, or anything that gets stringified — including in
  development builds. Decrypted key material exists transiently in memory for
  signing and is cleared immediately.
- **NFR-3 — Every ledger read goes through a query hook.** Its key includes the
  Active Wallet and the Active Network, so a switch of either can never leave
  stale cross-wallet or cross-network data on screen.
- **NFR-4 — The service worker caches the static shell only.** Never an RPC
  response. Cache version increments on deploy and old caches purge on activate.
- **NFR-5 — Nothing styles `:focus`.** `outline-none` is banned; the platform's
  own indicator is the indicator.
- **NFR-6 — Colour never carries meaning alone**, and `bun run check:contrast` is
  the gate — it evaluates every pair the app renders in both themes, alpha
  composites included, and exits non-zero on failure.
- **NFR-7 — Every irreversible action states its exact consequence** in plain
  language before it proceeds.
- **NFR-8 — Every bespoke component gets a keyboard-only and screen-reader pass
  before merge**, not as deferred polish.
- **NFR-9 — Supported conditions include a 320px viewport and 200% zoom.** A
  clipped or unreachable control at either is an escalation, not a nitpick.

## 9. Constraints and Guardrails

### 9.1 Safety
The cost of a defect is asymmetric and permanent. Where clarity and brevity
conflict, clarity about consequence wins; where speed and verifiability conflict,
verifiability wins. A control that is temporarily unavailable is `aria-disabled`
with its reason in visible text — never hidden.

### 9.2 Privacy
Nothing leaves the device. No backend, no telemetry, no account, no server that
learns which addresses the user watches. The only outbound traffic is to the
Network's RPC endpoints and, on user action, to the block explorer.

### 9.3 Delivery and Residual Risk
The app is served from a CDN. `[NOTE FOR PM]` A CDN origin plus a deploy pipeline
is in tension with "no backend exists to compromise". User-controlled updates
(FR-46 through FR-51) mitigate silent substitution; a user who accepts an update
without verifying it against the published tag is a real residual risk, not a
solved one. Recorded in full in `docs/sprints/cicd-sprints.md` as CD-6 and in
`addendum.md`.

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

1. **Should the empty reserved notice band render as a visible dashed outline on a
   phone?** It costs roughly a sixth of the viewport at 320px. Raised and
   explicitly not answered in `docs/sprints/mobile-chrome-sprints.md`.
2. **Does the Android home-screen install behave as intended?** The PWA colour fix
   follows from the precedence rule, not from observation — no device was
   available to verify it.
3. **Is a scoped deploy credential obtainable?** The CI deploy currently uses an
   account-wide API key, recorded as residual risk in `docs/sprints/cicd-sprints.md`.
4. **When does RTL get a real review?** Recorded as unreviewed rather than
   dismissed; no owner and no revisit condition set.
5. **What triggers the first real Mainnet funding?** SM-3 is the product's only
   adoption metric and currently has no defined precondition. The manual Testnet
   pass is a stated prerequisite; nothing else is.
6. **Are the stale open-decision tables a correctness risk?** `app-versioning-and-updates.md`
   (V1–V4) and `in-app-notices.md` (N1–N4) still present decisions as open that
   shipped on 2026-09-02. Reported, not repaired — outside this PRD's task.

## 11. Assumptions Index

- **§0** — `[ASSUMPTION]` This PRD records the v1 boundary as built rather than
  proposing new scope. Derived from the request to populate from the existing
  repo record, not from a stated product intent.
- **§2.3** — `[ASSUMPTION]` User journeys are omitted rather than invented,
  because `PRODUCT.md` records one operator and no second audience.
- **§3** — `[ASSUMPTION]` Reserve figures are stated as "at time of writing"
  because the code reads them live; no FR depends on the constant.
- **§4.11** — `[ASSUMPTION]` The Address Book is filed as a thirteenth feature on
  the strength of `docs/decisions.md` §2 ("add as a new epic") and `PRODUCT.md`
  (in scope, shipped), even though `docs/user-stories/INDEX.md` does not list it.
  FR-21 depends on it existing.
- **§7** — `[ASSUMPTION]` Success metrics are correctness gates rather than usage
  targets. No usage target exists anywhere in the repo record.
