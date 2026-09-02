# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary user: an XRPL-literate self-custodian holding their own keys.** They
already understand what a seed is, why an account needs a base reserve to exist,
why a token requires a trust line before it can be received, and that a sent
payment is irreversible. They are not being taught custody; they are being given
a tool.

The consequence for every future surface: **assume literacy, optimize for
precision and speed.** XRPL vocabulary (drops, reserve, trust line, sequence,
destination tag, `tec`/`tef` result codes) is the user's own vocabulary and is
used directly rather than softened into analogy. Explanation earns its place
only where the ledger's behaviour is genuinely surprising or where money is at
stake — the exact amount a reserve locks, what a frozen trust line prevents,
whether a failed transaction still consumed its fee. Nowhere else.

This is currently a single-operator product: the author is the user. There is no
second audience, no onboarding funnel for the uninitiated, and no support tier.

## Product Purpose

A self-custody XRP Ledger wallet that the author intends to hold **real Mainnet
funds** with. It exists so that keys, and the decision to spend, never leave the
device.

Success is defined by correctness under adversarial conditions rather than by
adoption: the displayed balance is the ledger's balance, the amount signed is the
amount intended, a key that cannot decrypt the vault cannot unlock the app, and
every figure on screen can be independently verified against a block explorer in
one click. A wallet that is pleasant but wrong about money has failed completely.

Because real funds are in scope, the cost of a defect is asymmetric and
permanent. This is the fact that governs every trade-off in the product: when
clarity and brevity conflict, clarity about consequence wins; when speed and
verifiability conflict, verifiability wins.

## Positioning

Three properties together, none of which a custodial or exchange-adjacent wallet
can truthfully claim:

- **No backend exists to compromise.** The ledger is the only server. No
  account, no email, no session on someone else's machine, and no server that
  learns which addresses the user watches. This is a deliberate architectural
  commitment, not an unbuilt feature — it is why background push notifications
  are recorded as permanently deferred rather than planned.
- **Unlock is proven by decryption, never by derivation.** One random master key
  is generated at setup and wrapped once per configured unlock method; every
  unlock attempt must actually unwrap it. Deriving a key from a wrong PIN or a
  wrong passkey assertion always *succeeds* — so derivation alone is not
  authentication. A wrong credential fails on AES-GCM's auth tag, not on a
  comparison the app could get wrong.
- **The app invites its own audit.** Every address and transaction hash is a
  link to the network-appropriate official explorer. The wallet's claims about
  the ledger are checkable against the ledger, by design, from every surface
  that makes one.
- **The user owns the update.** Confirmed 2026-09-02: the source is public and
  the wallet never updates itself. A new build installs and waits;
  only an explicit user action activates it, and never while a transaction is in
  flight. This is what keeps the no-backend claim honest once the app is served
  from a CDN — a compromised origin cannot silently substitute signing code,
  because substitution requires the user to accept a version they can inspect
  and, against a published source tag, verify. Specified in
  `docs/user-stories/app-versioning-and-updates.md`.

## Operating Context

- **Two independent networks, user-selectable.** Mainnet and Testnet hold
  separate ledger state for the same address. Testnet is the default at first
  run; Mainnet is the network that spends real money. Only Testnet has a faucet.
- **Multiple wallets, exactly one active.** Every read and every write applies to
  whichever wallet is active. Switching wallet or network must never leave stale
  data from the previous one on screen.
- **Shared-device and handover assumptions are real.** The wallet auto-locks
  after inactivity (default 5 minutes, configurable 1/5/15/30), immediately on
  backgrounding on touch devices, and after a 30-second grace window on desktop
  — because alt-tabbing is not the same event as a phone leaving the user's
  hand. Locking tears down cached balances and history, not just the key.
- **Installed as a PWA, used on both phone and desktop.** The narrowest
  supported viewport is 320px, and 200% zoom is a supported condition, not an
  edge case.
- **Cross-checking against an explorer is part of the workflow**, not a
  troubleshooting escape hatch — the user is expected to verify.
- **Offline is a partial state.** The app shell is installable and cache-first;
  ledger data is network-first and never cached, so an offline app can render
  itself but cannot honestly render a balance.

## Capabilities and Constraints

The functional contract is recorded in `docs/user-stories/INDEX.md` (ten epics)
and the technical contract in `docs/decisions.md`. Both are authoritative and
must be read before feature work. In summary:

**In scope.** Wallet creation and import with seed backup; passkey-gated
encrypted on-device key storage with a mandatory app PIN fallback; sending and
receiving XRP and issued-currency payments; XRP and token balances with reserved
vs. spendable distinguished; trust line create / edit-limit / remove; transaction
history and detail; Mainnet/Testnet switching with Testnet faucet funding;
multiple wallets; a local-only address book; explorer cross-check links.

**Out of scope, permanently — this is not an exchange.** Token swaps or any DEX
trading UI, fiat on/off-ramp, staking or yield or lending, KYC/AML, custodial
recovery, shared or omnibus addresses.

**Deferred, and recorded as deferred rather than silently absent.** Checks,
Escrow, Payment Channels, multi-signing and regular-key rotation (all real XRPL
features, each its own future epic); fiat-equivalent balance display (would add a
price-oracle dependency); Web Push for incoming payments (impossible without a
backend — see Positioning); user-editable custom RPC endpoints (v1 ships one
hardcoded endpoint plus one failover per network).

**Ledger facts the product must respect** (verified 2026-08-31; code reads live
values from `server_state` regardless): an address becomes an account only on
receiving the base reserve — there is no "create account" transaction; base
reserve 1 XRP, owner reserve 0.2 XRP per owned object; spendable = balance −
base reserve − (owner reserve × owned objects); tokens live in trust lines, never
"in" the account; every transaction consumes the account's current sequence
number.

**Non-negotiable engineering constraints**, each existing because it is a known
failure mode on this stack: no secret in `localStorage`, React state, the URL, or
anything serializable; no floating-point arithmetic on money anywhere outside the
single render-boundary formatter; no ledger read outside a TanStack Query hook;
no RPC response cached by the service worker; active wallet and active network
are one global source of truth present in every query key; every irreversible
action states its exact consequence in plain language before it proceeds.

## Brand Commitments

**Name — binding as of 2026-09-02: `XRPL Bench`** (repository slug
`xrpl-bench`). This supersedes the placeholder "XRPL Wallet".

The name was chosen to agree with the identity rather than to describe the
category: the visual world recorded in `DESIGN.md` is a bench instrument panel,
and the product's job is reading an instrument. It deliberately does **not**
contain "open", because the licence below is source-available and not
OSI-approved open source — a name asserting a licence property the project does
not have would be misleading.

"XRPL" is the ledger's own name and is widely used by community projects. No
trademark clearance has been performed; that remains the maintainer's
responsibility before any commercial use of the name.

**Visual identity — binding.** The panel world is recorded in `DESIGN.md` and
its sidecar, derived from the shipped build. It is no longer scaffolding.
Departing from it is a redesign, not a refinement.

**Licence — source-available, not open source.** See `## Licence` below.

The one durable voice constraint comes from the product, not from branding: the
wallet tells the truth about money, including inconvenient truth. A displayed
amount that is only an upper bound says so; a transaction that failed *and* took
its fee says both halves.

## Licence

**Decided 2026-09-02: Functional Source License, 2-year, Apache 2.0
(`FSL-1.1-ALv2`).** Source is public and readable; competing commercial
use is restricted for two years, after which each released version converts to
Apache 2.0.

**This is source-available, not open source.** FSL is not OSI-approved and does
not meet the Open Source Definition. Project materials must therefore say
"source-available" or "public source", never "open source" — including the
repository description, the README, and any future landing page.

**Why this licence.** It preserves the property this product actually depends
on: anyone may read the source and rebuild it from a tag to verify what is
served (`docs/user-stories/app-versioning-and-updates.md` US-7). That
verification story is unaffected by the commercial restriction. FSL is the
narrowed successor to the Business Source License, with a fixed two-year
conversion and no per-adopter "Additional Use Grant" to vary — which is the
main criticism of BSL.

**Open, and accepted:** a non-OSI licence can reduce trust and contribution in
the wallet space specifically, where "fork it freely" is part of how projects
earn confidence. That is a real cost of this choice, not an oversight.

**Not legal advice.** The licence text should be read in full before it is
committed, and reviewed by a lawyer if the commercial restriction is ever
intended to be enforced.

## Evidence on Hand

- **Real, in-repo:** ten user-story epics (`docs/user-stories/`), the technical
  decision and guardrail record (`docs/decisions.md`), two sprint records
  (`docs/sprints/`), a working React 19 / Vite / Tailwind v4 / xrpl.js
  implementation covering all ten epics, a unit test suite, and an executable
  contrast harness (`scripts/check-contrast.mjs`).
- **Verified live against the ledger:** XRPL reserve figures, the Testnet
  faucet endpoint, and both explorer URL patterns (2026-08-31); the
  derive-vs-unwrap unlock defect was caught during Testnet validation, not in
  review.
- **Absent — future work must not fabricate these.** There are no third-party
  users, no testimonials, no case studies, no press, no usage or performance
  benchmarks, and no pricing. The product has never been hosted or distributed,
  and has not yet held real Mainnet funds.
- **Decided but not yet done (2026-09-02):** the project will be published
  publicly under `FSL-1.1-ALv2` as `xrpl-bench`. Nothing has been
  published yet, and no licence file exists in the repository — until it does,
  all rights are reserved by default regardless of intent.

## Product Principles

1. **Correct about money, or nothing.** Precision in amounts, reserves, and
   transaction outcomes outranks every other quality, including elegance. A
   pleasant wrong balance is the worst possible outcome.
2. **Assume literacy; explain consequence.** The user knows XRPL. Spend words
   only where the ledger surprises or where money is irreversibly at stake, and
   there spend them plainly.
3. **Invite verification.** Never ask to be believed. Every claim about the
   ledger reaches the ledger in one click.
4. **Report the awkward truth.** Deferred is stated as deferred, an upper bound
   as an upper bound, a fee consumed by a failure as consumed. Silence about a
   limitation is a defect.
5. **Nothing leaves the device.** No backend, no telemetry, no third-party script
   with any path to the unlock or seed surfaces. Convenience never buys its way
   past this.

## Accessibility & Inclusion

**Standing commitment: WCAG 2.2 AA.** Not current practice — a requirement every
future surface is held to.

- Contrast is **measured, not eyeballed**, and enforced as a gate:
  `bun run check:contrast` parses the design tokens, evaluates every pair the app
  actually renders in both themes including alpha composites, and exits non-zero
  on failure. A failing pair is reported and fixed with a token for the missing
  role — never silently repainted, and never by borrowing a token whose value
  merely looks right.
- **No component, generic or bespoke, suppresses or recolors the platform focus
  indicator.** `outline-none` is banned. The browser's own two-tone ring is the
  indicator, because it is the only one that holds up across every surface a
  control can land on without being re-measured forever.
- **Every bespoke component gets a keyboard-only and screen-reader pass before
  merge**, not as deferred polish. Wrapping a primitive is the point at which
  ARIA and focus handling are known to get lost.
- A control that is temporarily unavailable is rendered `aria-disabled` with its
  reason in **visible** text — never hidden. Hiding a control does not
  communicate why it is unavailable.
- Errors and warnings **never auto-dismiss**; a message about a consumed fee or a
  failed unlock must not expire on a timer before a screen reader finishes it.
- Truncated addresses and hashes are reachable **without a pointer** — the
  character-by-character check is the wallet's own cross-check affordance, so it
  cannot be hover-only.
- Supported conditions include a **320px viewport and 200% zoom**; a clipped or
  unreachable control at either is an escalation, not a nitpick.
- Motion, if introduced, arrives with a `prefers-reduced-motion` guard.
