---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - _bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-2026-09-12/GAP-REGISTER.md
  - _bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-2026-09-12/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-2026-09-12/vaultkey-options.md
  - _bmad-output/planning-artifacts/prds/prd-xrpl-wallet-2026-09-12/prd.md
  - _bmad-output/planning-artifacts/prds/prd-xrpl-wallet-2026-09-12/addendum.md
  - _bmad-output/planning-artifacts/prds/prd-xrpl-wallet-2026-09-12/triage.md
  - _bmad-output/planning-artifacts/implementation-readiness.md
  - _bmad-output/implementation-artifacts/deferred-work.md
  - docs/decisions.md
  # Working papers behind the current PRD and spine, added on the 2026-09-15
  # amendment. triage.md above dispositions every finding they raised.
  - _bmad-output/planning-artifacts/prds/prd-xrpl-wallet-2026-09-12/reconcile-agents.md
  - _bmad-output/planning-artifacts/prds/prd-xrpl-wallet-2026-09-12/reconcile-decisions.md
  - _bmad-output/planning-artifacts/prds/prd-xrpl-wallet-2026-09-12/reconcile-design.md
  - _bmad-output/planning-artifacts/prds/prd-xrpl-wallet-2026-09-12/reconcile-product.md
  - _bmad-output/planning-artifacts/prds/prd-xrpl-wallet-2026-09-12/reconcile-sprints.md
  - _bmad-output/planning-artifacts/prds/prd-xrpl-wallet-2026-09-12/reconcile-user-stories.md
  - _bmad-output/planning-artifacts/prds/prd-xrpl-wallet-2026-09-12/review-fr-testability.md
  - _bmad-output/planning-artifacts/prds/prd-xrpl-wallet-2026-09-12/review-money-safety.md
  - _bmad-output/planning-artifacts/prds/prd-xrpl-wallet-2026-09-12/review-polish-prd.md
  - _bmad-output/planning-artifacts/prds/prd-xrpl-wallet-2026-09-12/review-polish-addendum.md
  - _bmad-output/planning-artifacts/prds/prd-xrpl-wallet-2026-09-12/review-rubric.md
  - _bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-2026-09-12/reconcile-decisions.md
  - _bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-2026-09-12/reconcile-prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-2026-09-12/reconcile-product-stories.md
---

# xrpl-wallet — Epic Breakdown

## Overview

This document breaks the **architecture remediation** work into implementable
stories. Its scope is the nine gaps in `GAP-REGISTER.md`, governed by the twelve
rules in `ARCHITECTURE-SPINE.md`.

**This is not product functionality.** No FR in the PRD changes behaviour as a
result of this work. The wallet does exactly what it did before; it just stops
being able to drift. `docs/user-stories/` remains the functional contract and is
untouched by these epics.

Every story lands on a branch off `dev`, rebased before merge, with
`bun run lint`, `bun run build`, `bun run test` and `bun run check:contrast` all
green. Never `main` — it does not exist.

## Requirements Inventory

### Functional Requirements

The PRD's FR-1 through FR-59 are the **regression contract** here, not the work.
Every one must still hold when these epics are done. The ones most exposed by
this remediation, and therefore the ones to re-verify:

- **FR-14** — switching wallet never leaves the previous wallet's data on screen.
- **FR-38** — switching network never leaves the previous network's data on screen.
- **FR-29, FR-30** — balances and spendable are the ledger's figures.
- **FR-16 through FR-25** — the send path, including fee display, the confirm
  step, submitted-vs-validated, and `LastLedgerSequence` expiry.
- **FR-42, FR-43** — every address and hash links to the correct network's
  explorer.
- **FR-46 through FR-52** — build identity, update prompt, and the rule that the
  app never updates itself.
- **FR-53 through FR-56** — notices docked, never auto-dismissing, announced
  politely.

Round two (Epics 5–8, closing G-10 … G-18) exposes four more, and these are the
ones to re-verify there:

- **FR-18 through FR-21** — the fee shown before the confirm step, the
  destination-tag detection, and the "you haven't sent here before" test.
- **FR-45** — the Address Book entries FR-21 resolves against.
- **FR-52** — the installed shell still renders offline, which a lock currently
  breaks.
- **FR-57** — a payment whose delivered amount is not positively known renders
  as an upper bound, never as a delivered figure.

The full list is in `_bmad-output/planning-artifacts/prds/prd-xrpl-wallet-2026-09-12/prd.md` §4.

### NonFunctional Requirements

Carried verbatim from the PRD §8. These are what the remediation is *for*.

- **NFR-1** — money is strings or BigInt end to end; formatting only at the
  render boundary.
- **NFR-2** — no secret is ever serializable.
- **NFR-3** — every ledger read goes through a query hook whose key includes the
  active wallet and the active network.
- **NFR-4** — the service worker caches the static shell only, never an RPC
  response.
- **NFR-5** — nothing styles `:focus`; `outline-none` is banned.
- **NFR-6** — colour never carries meaning alone; `check:contrast` is the gate.
- **NFR-7** — every irreversible action states its exact consequence first.
- **NFR-8** — every bespoke component gets a keyboard and screen-reader pass
  before merge.
- **NFR-9** — 320px and 200% zoom are supported conditions.
- **NFR-10** — motion respects `prefers-reduced-motion`. Verified holding on
  2026-09-15; a regression contract, not work.
- **NFR-11** — a list never uses an array index as its React key. Verified
  holding on 2026-09-15; likewise a regression contract.

### Additional Requirements

From `ARCHITECTURE-SPINE.md`. These are the rules the stories implement. No
starter template applies — this is a brownfield codebase with a fixed stack.

- **AD-1** — dependencies point one way. No `lib` → `hooks`/`components`/`pages`;
  no `store` → `components`/`pages`. One named exception: `lib/notify.tsx` may
  import `store/notice-store`.
- **AD-2** — only `lib/xrpl/` may hold an XRPL `Client`. Pure offline helpers are
  exempt.
- **AD-3** — only `lib/crypto/` may turn a seed into a signer.
- **AD-4** — one factory produces every query key, for reads and invalidations
  alike; legitimate exceptions are named functions on it.
- **AD-5** — a non-extractable `CryptoKey` handle is permitted session state.
  `[ADOPTED — decided 2026-09-12]`
- **AD-6** — `store/app-store.ts` is the only source of truth for active wallet
  and active network, **and for persisted entity identity**. An Address Book
  entry's identity is the (address, destination tag) pair, expressed as a named
  function beside the entity. The shipped entry is `{ address, label }` and
  dedupes on address alone — G-18.
- **AD-7** — all money arithmetic lives in `lib/xrpl/money.ts`.
- **AD-8** — **three** declared surfaces, chosen by cause: failed reads render
  inline, user actions report to the Annunciator, and the third is the
  persistent state the Annunciator does not own. `[ADOPTED]` — the override
  window Epic 3 was written under has since closed.
- **AD-9** — every write passes `submitAndClassify`. `[ADOPTED]`
- **AD-10** — explorer links only through `AddressLink` / `TxLink`.
- **AD-11** — `lib/sw-register.ts` is the only importer of `virtual:pwa-register`.
- **AD-12** — a module owning an external resource exposes a test seam and a reset.

Five more were adopted on 2026-09-15, after Epics 1–4 were built. They bind no
story in the four epics below; they are what Epics 5–11 implement.

- **AD-13** — a guard on a money-moving action fails **closed**. It is satisfied
  only by a read that succeeded for the input currently on screen — not an
  errored read, not data retained from an earlier input, not a read outside its
  freshness window. Absence of a prohibition is not permission, and a guard
  lives inside the submit path, not only on the control.
- **AD-14** — retained data is never rendered as current. When a read is in
  error, nothing from an earlier success renders: no figure, no liveness lamp,
  no derived total.
- **AD-15** — an empty state is a claim, not a default. A screen may say a
  collection is empty only when its read **succeeded** and returned empty.
- **AD-16** — one owner of local persistence teardown, and it is **two** sets.
  Account data — vault, query cache, live sockets, persisted app store — never
  survives a teardown claiming to remove it. The shell — the service-worker
  precache — survives every lock.
- **AD-17** — cache policy is architecture and fails safe toward staleness.
  Deploy-gated by `scripts/verify-headers.mjs` rather than merge-gated, so it
  binds the pipeline rather than a story here.

### UX Design Requirements

**None.** This remediation changes no pixel, no copy, no interaction and no
token. `DESIGN.md` is binding and untouched.

Two consequences worth stating so nobody invents work here:

- `check:contrast` still runs on every story, as a regression gate rather than as
  a source of requirements.
- **AD-8 (Epic 3) is the one place a user could notice a difference.** If a
  failure that used to appear in one place starts appearing in another, that is a
  visible change and it needs the manual 320px and 200%-zoom pass from
  `docs/agents/verifying-your-work.md` before merge.

### FR Coverage Map

Reverse of the usual direction: these epics deliver no FR, they protect FRs.

| Gap | Rule | Epic | Protects |
|---|---|---|---|
| G-1 | AD-4, AD-6 | Epic 1 | FR-14, FR-38, FR-29, FR-30, NFR-3 |
| G-2 | AD-3 | Epic 2 | FR-1, FR-2, FR-3, NFR-2 |
| G-3 (writes.ts) | AD-1 | Epic 2 | NFR-2, testability of the write path |
| G-3 (notify, notice-store) | AD-1 | Epic 3 | FR-53, NFR-2 |
| G-4 | AD-12, AD-2 | Epic 2 | FR-41 |
| G-5 | AD-8 | Epic 3 | FR-53, FR-54, FR-55 |
| G-6 | AD-7 | Epic 4 | NFR-1, FR-29 |
| G-7 | AD-10 | Epic 4 | FR-42, FR-43 |
| G-8 | AD-11 | Epic 4 | FR-46, FR-48 |
| G-9 | AD-5 | Epic 4 | NFR-2 — protects correct code from a later "fix" |

Every gap **G-1 through G-9** is covered by Epics 1–4, and all nine are now
closed — re-verified against `src/` on 2026-09-15, not taken from the commit
messages. No gap appears in two epics, except G-3, which is split by module
because its two halves belong to different concerns and different files.

> **Corrected 2026-09-15.** This paragraph previously read "Every gap in
> `GAP-REGISTER.md` is covered." That was true when written and false by the
> time it was next read: the register gained **G-10 through G-18** on
> 2026-09-15, and **G-19 through G-27** when the deferred-work ledger was
> promoted into it the same day. A coverage claim that outlives its scope is
> worse than no claim, because an agent that trusts it skips the gaps —
> including G-10 and G-18, which are both the unrecoverable tagless-payment path
> Epic 3 was written to prevent. The map below is now explicitly per-round.

### FR Coverage Map — round two (Epics 5–11)

| Gap | Rule | Epic | Protects |
|---|---|---|---|
| G-10 | AD-13 | Epic 5 | FR-19, FR-20 |
| G-11 | AD-8, AD-14, AD-15 | Epic 5 | FR-29, FR-30 |
| G-12 | AD-13, AD-8 | Epic 5 | FR-16, FR-18 |
| G-15 | AD-15, AD-2 | Epic 5 | FR-57 |
| G-20 | AD-4, AD-6 | Epic 5 | FR-14, FR-38 |
| G-13 | AD-16 | Epic 6 | FR-13 |
| G-14 | AD-16, AD-8 | Epic 6 | FR-52, US-8, US-9 |
| G-16 | AD-9 | Epic 7 | NFR-2 — reachability of the choke point |
| G-17 | AD-9 | Epic 7 | FR-46, FR-48 |
| G-22 | AD-2, AD-12 | Epic 8 | NFR-2 |
| G-23 | AD-2 | Epic 8 | NFR-2 |
| G-18 | AD-6 | Epic 9 | FR-19, FR-21, FR-45 |
| G-19 | AD-4 | Epic 10 | protects G-1's closure |
| G-27 | AD-7, AD-10 | Epic 10 | protects G-6, G-7's closure |
| G-24 | AD-3 | Epic 11 | FR-1, FR-2, FR-3 |

**Not covered by an epic, deliberately, and each says why:**

| Gap | Disposition |
|---|---|
| G-21, G-25 | Routed to **`bmad-project-context`**, which owns the `AGENTS.md` managed block. Both edit agent-context files, and that is precisely why the ledger deferred them — filing them as build stories recreates the condition that deferred them. **G-25 is the most dangerous single item in the register** and should not wait on an epic it cannot be part of. |
| Address Book as a feature | **Split out of Epic 9, 2026-09-15.** The §4.11 contract gap covers the user-facing list only, not the (address, tag) identity AD-6 already mandates. Recorded as a product question below rather than an epic, because it has no gap number and no acceptance criteria to write stories from. |
| G-26 | **Refuted by trace, 2026-09-15.** The stated fix would introduce the defect class this round exists to remove. See the note below and `GAP-REGISTER.md`. |
| AD-17 (no gap) | Deploy-gated by `scripts/verify-headers.mjs` rather than merge-gated, so AD-17 binds the pipeline and no story here. |

**G-26 — why it is not an epic.** The ledger recorded that the waiting-update
flag never returns to false, so a failed `applyUpdate` leaves the update prompt
showing. Both halves are true — `lib/sw-register-core.ts:63` sets `waiting` and
nothing clears it. But after a failed activation **a worker genuinely is still
waiting**, so the prompt is correct, and `useAppUpdate.ts:138` already restores
the control in its `catch` rather than pretending the update worked. The
proposed `setWaiting(false)` would make the app claim no update is waiting while
one is — AD-15 inverted. Reclassified as needing verification before it is
scheduled at all.

## Epic List

Four epics. Each stands alone and can ship on its own; none needs a later one to
work. Ordered by what it costs you if it is wrong, so stopping after Epic 1 still
leaves you better off than today.

A note on "user value". This is remediation, so the value is not a new capability
— it is a guarantee. Each epic below states the guarantee in terms the operator
can check, because a guarantee nobody can verify is not one.

### Epic 1: Cached ledger data can no longer go stale

After this epic the app cannot show you a number belonging to a wallet or a
network you are no longer looking at, because the label that identifies cached
data and the label that throws it away are produced by the same code. Today they
are typed by hand in seventeen places and nothing checks that they match.

**Guarantee:** switch wallet or network, or complete a send, and every figure on
screen is for the thing you are actually looking at.
**Gaps closed:** G-1. **Rules:** AD-4, AD-6. **Protects:** FR-14, FR-38, FR-29,
FR-30, NFR-3.
**Touches:** a new key module, nine read sites, four invalidation sites.
**Standalone:** yes. Nothing else depends on it and it depends on nothing.

### Epic 2: The two sealed boundaries actually hold

The architecture says two modules own dangerous things: `lib/crypto` owns key
material, `lib/xrpl` owns the network. Today both boundaries are observed by
convention rather than enforced, and one of them — the endpoint failover — cannot
be tested at all.

**Guarantee:** no screen can turn a seed into a signer, no module outside
`lib/xrpl` can open a connection, and the failover path has a test that proves it
falls through to the backup endpoint.
**Gaps closed:** G-2, G-4, and the `writes.ts` half of G-3. **Rules:** AD-1, AD-2,
AD-3, AD-12. **Protects:** FR-1, FR-2, FR-3, FR-41, NFR-2.
**Touches:** `lib/crypto/keystore.ts`, `pages/Onboarding.tsx`,
`pages/tabs/SettingsTab.tsx`, `lib/xrpl/client.ts`, `lib/xrpl/writes.ts`.
**Standalone:** yes.

### Epic 3: A failure always reports the same way

Today an imperative failure goes to the notice band and a failed ledger read
renders inline, and nothing says which is correct. This epic writes the rule down
and makes the code obey it — including closing the one place that reaches past
the notice funnel.

**Guarantee:** for any given kind of failure, you can say in advance where it
will appear, and it appears there on every screen.
**Gaps closed:** G-5, and the `notify` / `notice-store` half of G-3. **Rules:**
AD-1, AD-8. **Protects:** FR-53, FR-54, FR-55.
**Touches:** `lib/notify.tsx`, `store/notice-store.ts`, `hooks/useAppUpdate.ts`,
`BalancesTab`, `HistoryTab`.
**Standalone:** yes.
**Carries the only user-visible risk in this breakdown.** If a failure moves from
one place to another, that is a visible change and needs the manual 320px and
200%-zoom pass before merge. AD-8 is the architect's call and is still open to
override — settle it before this epic starts, not during.

### Epic 4: The rules and the code agree again

Four places where `docs/decisions.md` and the code disagree. One of them is the
rule's fault and three are the code's. Small, mechanical, independently
shippable, and each one removes a thing a future agent would otherwise "fix"
wrongly.

**Guarantee:** an agent auditing the code against `docs/decisions.md` finds
nothing to report.
**Gaps closed:** G-9 (the rule is wrong), then G-6, G-7, G-8 (the code is wrong).
**Rules:** AD-5, AD-7, AD-10, AD-11. **Protects:** FR-29, FR-42, FR-43, FR-46,
FR-48, NFR-1, NFR-2.
**Touches:** `docs/decisions.md`, `lib/xrpl/money.ts`, `hooks/useSpendableBalance.ts`,
`SendTab`, `TrustLinesTab`, `AddressDisplay.tsx`, `main.tsx`.
**Standalone:** yes, and every story inside it is independently shippable too.

### Why not more epics, or fewer

**G-3 is split across two epics on purpose.** Its two halves live in different
modules and serve different concerns: `writes.ts` reaching into the store is a
write-path problem, `notify.tsx` reaching into a UI component is a notice
problem. Keeping them together would have made two epics both edit
`lib/notify.tsx`, which is the file-churn pattern this breakdown is meant to
avoid.

**G-9 rides with Epic 4 rather than standing alone.** It is a one-sentence change
to `docs/decisions.md` and would be a whole epic containing one ten-minute story.
It sits naturally at the head of Epic 4 because that epic's theme is exactly
"the rules and the code disagree — fix whichever is wrong."


---

## Round two — Epics 5 through 11

Written 2026-09-15, after Epics 1–4 shipped and the register was re-verified.
Same frame as round one: **this is not product functionality**, with two
exceptions stated below. The wallet gains no capability; it stops being able to
tell you something untrue.

Seven epics for fifteen open gaps, two routed out to `bmad-project-context`, and
one refuted. Ordered, as round one was, by what it costs you if it is wrong — so
stopping after Epic 5 still leaves you better off than today.

**The epics are split on where a failure propagates, not on which folder it
lives in.** That distinction produced Epics 7 and 8, which a folder-based
reading would have merged.

### Epic 5: A figure on screen was actually read

Five places where the wallet shows, or accepts, a number it did not successfully
read — or did not re-read when it should have. Two are the guard on a
money-moving action; three are figures that vanish, mislabel themselves, or
quietly stay behind.

**Guarantee:** every number on screen came from a read that succeeded for the
thing you are looking at *now*. Anything else renders as unavailable rather than
as absent, as stale, or as a confident wrong figure.
**Gaps closed:** G-10, G-11, G-12, G-15, G-20. **Rules:** AD-13, AD-14, AD-15,
AD-8, AD-4, AD-6.
**Protects:** FR-14, FR-16, FR-18, FR-19, FR-20, FR-29, FR-30, FR-38, FR-57.
**Touches:** `SendTab.tsx`, `useDestinationInfo`, `useServerReserves.ts`,
`useSpendableBalance.ts`, `BalancesTab.tsx`, `TrustLinesTab.tsx`,
`lib/xrpl/reads.ts`, `lib/xrpl/query-keys.ts`,
`send-destination-error.test.tsx`.
**Standalone:** yes.
**Carries two money-loss paths, not one.** G-12 was filed as low severity and a
reporting gap; reading `SendTab.tsx:89` during story creation showed it is a
second instance of AD-13 — `fee.data ?? '0'` lets a failed fee read satisfy
FR-16's affordability guard with a fabricated zero. See Story 5.3 and the
severity correction in `GAP-REGISTER.md`.

G-10 is a tagless payment to an address that
started requiring a tag between two reads — unrecoverable, and satisfied today
by retained data *and* by a thirty-second `staleTime` regardless of error state.
Its story goes first, so stopping after one story still buys the expensive fix.

**G-20 sits here rather than with the enforcement gates, deliberately.** Its fix
is a key-factory change and so looks like Epic 10's work, but its *harm* is this
epic's: `BalancesTab` invalidates one of the four account-scoped keys,
`TrustLinesTab` two, `SendTab` three, so a figure can be current-but-never-
refreshed after a write. Leaving it in Epic 10 would let Epic 5 ship a guarantee
it does not keep.

### Epic 6: "Remove everything" removes everything, and locking removes nothing else

Two IndexedDB owners and teardown clears one; meanwhile the lock path deletes
the app shell it was never meant to touch. One rule, AD-16, fixes both — because
both are the same mistake about which of the two clear sets a thing belongs to.

**Guarantee:** the hard-lock reset leaves no wallet labels and no Address Book
on a device you have handed over, and locking the app does not stop it opening
offline.
**Gaps closed:** G-13, G-14. **Rules:** AD-16, AD-8.
**Protects:** FR-13, FR-52, and `app-versioning-and-updates.md` US-8 and US-9.
**Touches:** `lib/teardown.ts`, `useClearCacheOnLock`, `store/app-store.ts`,
`pages/Unlock.tsx`, `pages/tabs/SettingsTab.tsx`.
**Standalone:** yes.
**The vault is genuinely wiped today** — no secret is exposed. The harm is
privacy residue in the one flow that promises everything is gone.

### Epic 7: Every write reaches the choke point, and the interlock can count

`writes.ts:51` declares `submitAndClassify` unexported and typed
`Payment | TrustSet`, and `:58` is the only caller of `reportTxInFlight(true)`.

**These two gaps are one failure, not two in a folder.** A future Escrow, Check
or `AccountSet` that cannot reach the choke point *also never raises the
in-flight signal* — and `useAppUpdate.ts:133` reads that flag as its sole
interlock. G-16 is therefore an amplifier for G-17: the first new transaction
type silently disables the update interlock for itself.

**Guarantee:** a new transaction type obeys AD-9 without editing `writes.ts`,
and no update can activate while any write is in flight — including two
overlapping ones.
**Gaps closed:** G-16, G-17. **Rules:** AD-9.
**Protects:** FR-46, FR-48, NFR-2.
**Touches:** `lib/xrpl/writes.ts`, `store/app-store.ts`, `hooks/useAppUpdate.ts`.
**Standalone:** yes.

### Epic 8: The ledger connection closes what it opens

`client.ts:13` caches one `Client` per network, `:35` clears the cache without
disconnecting, and `:71-80` holds no in-flight connect promise.

**Separated from Epic 7 on the trace, not the folder.** G-23 compounds G-22 —
no deduplication means more losers, each dropped still connected — but the
propagation stops at socket exhaustion and never reaches the write choke point.
Different failure, different layer, shippable on its own.

**These two are the only gaps in this round that round one went past.** G-22's
register entry records that Epic 2 added a `clearTimeout` for the connect timer
and no socket cleanup — the same file, the adjacent line, left behind. Keeping
them visible as their own epic keeps that visible too.

**And the harm is a phone, not a laptop.** The wallet installs to a home screen;
balances poll on a fifteen-second interval and `useAccountLiveUpdates` holds a
live subscription. Failover exists because endpoints fail, and they fail most on
a moving, metered connection — which is where an accumulating set of
still-connected sockets stops being a tidiness problem and starts being battery
and data.

**Guarantee:** no connection is opened that nobody closes, and a mount does not
open one socket per query.
**Gaps closed:** G-22, G-23. **Rules:** AD-2, AD-12.
**Protects:** NFR-2.
**Touches:** `lib/xrpl/client.ts`, `lib/xrpl/__tests__/client.test.ts` — where
the failover tests Epic 2 added already live.
**Standalone:** yes. The narrowest epic in this round.

> **⛔ Named non-goal — `resetXrplClients` must not gain a disconnect.**
>
> `client.ts:24-32` documents that it "drops every cached connection WITHOUT
> disconnecting — AD-12's reset", synchronous and deliberately separate from
> `disconnectAllClients`, which is the production teardown path in
> `lib/teardown.ts` and *does* close the sockets.
>
> **The trap:** this epic's fix is "disconnect the client nobody owns any
> more". `resetXrplClients` is the function that most looks like it is failing
> to do that. It is not a leak — it is the test seam, and it is synchronous on
> purpose. Adding a disconnect there makes it async, breaks every test that
> clears the cache mid-run, and removes the seam AD-12 requires.
>
> The disconnects belong in the failover `catch` and on cache-miss
> replacement inside `getXrplClient`, and nowhere else. A story that touches
> `resetXrplClients` for any reason other than a comment is wrong.
>
> Recorded here rather than left to story creation because the trap is
> invisible unless you read the docstring first, and the fix reads as obviously
> correct right up to the moment the suite goes red.

### Epic 9: The Address Book tells two counterparties apart

An entry is `{ address, label }` (`store/app-store.ts:13`) and
`addAddressBookEntry` dedupes on address alone (`:73`). AD-6 requires identity to
be the (address, destination tag) pair. An exchange deposit address is one
address with a different required tag per customer, so a book keyed on address
can hold only one of them.

**This is a live defect, not a latent one — corrected 2026-09-15 after reading
`src/`.** There is no Address Book picker; the register's "a picker that fills
the address without its tag" is conditional and this file previously rendered it
as though it existed. What exists is worse:

- `SendTab.tsx:127` writes an entry **silently on every send**, labelled with a
  truncated address, and drops the destination tag it was just given.
- `SendTab.tsx:75` — `addressBook.some((e) => e.address === destination)` — is
  **FR-21's "you haven't sent here before" test**.

So sending to one exchange address with customer A's tag records the address;
sending to the same address with customer B's tag reads as already known, and
the warning FR-21 exists to raise is suppressed. No new feature is required for
this to happen, and it happens on the second send.

**Two features are wearing one coat here, and separating them is what unblocks
this epic.** `store/app-store.ts` holds one array, and the code uses it for two
unrelated jobs:

1. **A sent-to ledger.** Internal, append-only, written at `SendTab.tsx:127`
   and read at `:75` to answer "have I sent here before". FR-21 depends on it.
   Nobody designed it as a feature; it is a mechanism.
2. **An Address Book.** The user-facing list at `SettingsTab.tsx:219`, with
   labels, that a person is expected to read.

The §4.11 contract gap belongs **entirely to the second**. The first is governed
by AD-6, which is already adopted — so changing the entry type and the identity
function implements a rule that has already passed, and needs no product
decision at all.

**This epic is the first job only.**

**Guarantee:** two counterparties at one exchange are two entries, and the
"haven't sent here before" warning is decided on the (address, destination tag)
pair rather than on the address — so a second customer's deposit at the same
exchange raises the warning FR-21 exists to raise.
**Gaps closed:** G-18. **Rules:** AD-6.
**Protects:** FR-19, FR-21.
**Touches:** `store/app-store.ts` (the entry type, `addAddressBookEntry`, and a
named identity function beside the entity), `SendTab.tsx:75` and `:127`.
**Standalone:** yes.
**User-visible, so it carries the 320px and 200%-zoom pass.** Scope widened
2026-09-15: the fabricated label is fixed here rather than deferred. The
`SettingsTab.tsx:229` row renders `{e.label}` — the first eight characters of the
address — immediately beside an `AddressLink` showing the same address in full.
The label was never carrying information.

**Still split out — the Address Book as a curation feature.** What stays
deferred is whether a person can *act* on this list: create an entry by hand,
edit a label, remove one. What does **not** stay deferred is the fabricated
label, because fixing it needs no product decision — the empty-state copy at
`SettingsTab.tsx:221-224` already declares what the list is ("Addresses you send
to are saved here automatically, so the wallet can warn you the first time you
send somewhere new"). An auto-written ledger does not need to invent a human
label, and inventing one is what makes the row meaningless.

### Epic 10: A closed gap cannot silently reopen

Two enforcement holes of the same shape: a gap was closed by a change that
nothing now holds in place. G-1 already suffered exactly this decay, which is
why `check-query-keys.mjs` exists.

**Guarantee:** an agent cannot reintroduce a hand-written query key, a stray
BigInt arithmetic expression, or a hand-rolled explorer anchor without `lint`
failing.
**Gaps closed:** G-19, G-27. **Rules:** AD-4, AD-7, AD-10.
**Protects:** the closures of G-1, G-6 and G-7.
**Touches:** `scripts/`, `package.json`.
**Standalone:** yes.
**G-19 may not be fully closable by a `node:` script.** Its fix needs dataflow
analysis, so the story may land as a real lint rule with an AST or as an
explicit recorded limit — that is a decision for the story, not for this epic.

### Epic 11: Importing a Seed is the same operation wherever you do it

`Onboarding` gates the vault write on the disabled-master-key warning;
`SettingsTab` writes to the vault first and warns afterwards. The two also
surface a malformed Seed differently, and neither trims the input — so a pasted
trailing newline reads as malformed.

**Guarantee:** whichever screen you import from, the warning comes before the
write, a pasted Seed with stray whitespace is accepted, and a genuinely
malformed one is rejected with the same words.

**Gaps closed:** G-24. **Rules:** AD-3.
**Protects:** FR-1, FR-2, FR-3.
**Touches:** `pages/Onboarding.tsx`, `pages/tabs/SettingsTab.tsx`,
`lib/crypto/keystore.ts`.
**Standalone:** yes.

**It stands alone rather than joining Epic 7 or 8 because it is the other
boundary.** Round one's Epic 2 sealed both at once — `lib/crypto` owns key
material, `lib/xrpl` owns the network — and round two splits them, because
sealing and behaving-correctly are different jobs and these have nothing in
common beyond the word "boundary". The second user-visible change in this round,
so it carries its own verification pass; no Seed may reach the vault before its
warning, including in a development build.

### Product question split out of Epic 9

Recorded in the house style of PRD §10 — an owner and a condition that brings it
back, because an item with neither is not deferred, it is forgotten.

**What is the Address Book?** `SettingsTab.tsx:219` renders a list that
`SendTab.tsx:127` fills silently on every send, labelled with the first eight
characters of the destination address. Nobody chose that. `docs/decisions.md` §2
and `PRODUCT.md` both say the capability ships;
`docs/user-stories/INDEX.md` lists neither an epic nor a file for it; and PRD
§4.11 records that FR-21 and FR-45 depend on it existing while "neither has an
authoritative acceptance criterion anywhere."

The open questions, none of which block Epic 9: is an entry user-created, or
only ever auto-written? Is a label editable? Is an entry removable — and does
removing one make FR-21 warn again? Is the Settings list a feature a person is
meant to use, or a debug view that escaped? **FR-45 has no home until this is
answered.**

*Owner: Otavio. Revisit: before the first real Mainnet funding (PRD §7, SM-3),
alongside §10.2 — the same window, and the same class of "a person loses money
because nobody decided".*

### Why seven epics, and where the files overlap

**Assessed for file churn, as the round-one breakdown was.** Three overlaps
exist and all three are incidental rather than end-to-end:

- **`SendTab.tsx`** is touched by Epic 5 (its destination guard and its fee
  read) and Epic 9 (its recipient picker). Different regions of a large screen,
  different rules, no shared logic. Consolidating them would produce one epic
  spanning a money-loss guard, three silent-staleness defects and a new entity
  field — the file-churn cure worse than the disease.
- **`store/app-store.ts`** is touched by Epic 6 (the persisted store joins the
  teardown set), Epic 7 (`txInFlight` becomes a depth) and Epic 9 (the entry
  type gains a tag). Three unrelated fields.
- **`SettingsTab.tsx`** is touched by Epic 6 (its reset handler) and Epic 11
  (its Seed-import handler). Same incidental shape.

**Epic 5 mixes severities on purpose.** G-10 is a money-loss path and G-12 is
low. They stay together because they are the same rule family in the same files,
and because a story is the shipping unit here — Epic 4 established that every
story inside an epic is independently shippable too.

**Epics 7 and 8 were one epic until the failure trace split them.** A reading
based on folders would have kept `writes.ts` and `client.ts` together as
"`lib/xrpl` behaves". Tracing what propagates where showed one genuine amplifier
pair and one unrelated pair, and the split follows the propagation.

---


## Standing conditions for every story below

These apply to all fifteen stories and are not repeated in each one:

- Branch off `dev`, rebased onto `dev` before merge. Never `main` — it does not exist.
- `bun run lint`, `bun run build`, `bun run test` and `bun run check:contrast` all
  green before merge. Four green gates mean nothing is *provably* broken, not that
  the change works.
- No behaviour change visible to the user, except where a story says otherwise.
- No secret enters state, a store, the URL, or anything serializable — including
  in development builds.
- No `Number()`, `parseFloat` or `toFixed` touches a monetary value.

## Epic 1: Cached ledger data can no longer go stale

One module produces every label that identifies cached ledger data, and every
label that throws it away. Closes G-1. Implements AD-4 and AD-6. Protects FR-14,
FR-38, FR-29, FR-30 and NFR-3.

### Story 1.1: One module produces every account-scoped cache label

As a wallet operator holding real funds,
I want the labels that identify my cached balances to come from one place,
So that no hand-typed label can quietly disagree with another.

**Acceptance Criteria:**

**Given** a new module that exports a query-key factory
**When** a hook needs a key for an account-scoped ledger read
**Then** it calls the factory rather than writing an array literal
**And** the factory takes the active wallet and the active network as arguments, so a key cannot be built without them.

**Given** the six account-scoped read hooks — `useAccountState`, `useAccountTxHistory`, `useTrustLines`, `useDestinationInfo`, `useIncomingPaymentNotifications`, and `lib/xrpl/query-reads.ts`
**When** the migration is complete
**Then** none of them contains a query-key array literal
**And** each produces exactly the same key it produced before, verified by a test asserting the shape.

**Given** the app running against Testnet with two wallets configured
**When** the operator switches from one wallet to the other
**Then** the balance, trust lines and history on screen are the newly-active wallet's
**And** no figure from the previous wallet remains visible.

### Story 1.2: Invalidation uses the same labels as the reads

As a wallet operator,
I want the code that discards stale data to use the same labels as the code that stored it,
So that a completed send cannot leave the old balance on screen.

**Acceptance Criteria:**

**Given** the four invalidation sites — `useAccountLiveUpdates`, `SendTab`, `TrustLinesTab`, `BalancesTab`
**When** the migration is complete
**Then** each calls the factory from Story 1.1 rather than retyping a key
**And** no query-key array literal remains at any invalidation site.

**Given** a successful XRP payment on Testnet
**When** the transaction validates
**Then** the sender's balance and history refresh without a manual reload
**And** the spendable figure reflects the new balance.

**Given** a trust line is created
**When** the transaction validates
**Then** the trust-line list and the owner-reserve figure both refresh.

### Story 1.3: Reads that are not account-scoped say so on the factory

As a maintainer,
I want the reads that legitimately have no wallet in their label to be named on the factory,
So that an audit against the wallet-plus-network rule sees an exception rather than a bug.

**Acceptance Criteria:**

**Given** `useServerReserves` and `useRecommendedFee`, which are network-scoped but not account-scoped
**When** the migration is complete
**Then** each gets its key from a named factory function whose name states it is network-scoped
**And** the factory carries a comment explaining why no address belongs in that key.

**Given** the two device-scoped queries in `pages/Unlock.tsx` — passkey registration and lockout state
**When** the migration is complete
**Then** both get their keys from named factory functions marked device-scoped
**And** neither is affected by a wallet or network switch.

**Given** an agent auditing the code against `docs/decisions.md` §4's wallet-plus-network rule
**When** it inspects the key factory
**Then** every exception is visible and explained in one file.

### Story 1.4: A new hand-written cache label cannot be merged

As a maintainer,
I want the build to refuse a query key written outside the factory,
So that this fix does not decay the next time someone adds a hook.

**Acceptance Criteria:**

**Given** the factory from Stories 1.1 to 1.3 is in place
**When** a developer adds a `queryKey` or `invalidateQueries` call with an inline array literal
**Then** the check fails and names the offending file and line
**And** the message says to use the factory.

**Given** the check runs
**When** `bun run lint` is invoked
**Then** the check runs as part of it, with no extra command to remember
**And** it adds no dependency to `scripts/check-contrast.mjs`, whose CI job has no install step.

## Epic 2: The two sealed boundaries actually hold

`lib/crypto` owns key material and `lib/xrpl` owns the network — enforced rather
than observed. Closes G-2, G-4, and the `writes.ts` half of G-3. Implements AD-1,
AD-2, AD-3, AD-12. Protects FR-1, FR-2, FR-3, FR-41 and NFR-2.

### Story 2.1: No screen turns a seed into a signer

As a wallet operator,
I want every path from a seed to a signing key to run through one audited module,
So that there is one place to get seed handling right rather than three.

**Acceptance Criteria:**

**Given** `pages/Onboarding.tsx` and `pages/tabs/SettingsTab.tsx`, which today import `Wallet` from `xrpl` and call `Wallet.fromSeed`
**When** the change is complete
**Then** neither file imports `Wallet`
**And** each asks `lib/crypto/keystore.ts` for what it needs.

**Given** the pure offline validators such as `isValidClassicAddress`
**When** a screen needs to validate an address before submitting
**Then** it may still import them directly, because they touch no key and no connection.

**Given** a seed being imported or revealed
**When** the operation completes
**Then** the plaintext seed has existed only in a local variable or a ref
**And** it has never been in React state, a store, a query cache, or a log — including in a development build.

**Given** the existing onboarding and import flows on Testnet
**When** a wallet is generated and then a second is imported from its seed
**Then** both behave exactly as before, including the disabled-master-key warning on import.

### Story 2.2: The write path no longer reaches into the store

As a maintainer,
I want `lib/xrpl/writes.ts` to stop importing the app store,
So that the send path can be tested without standing up a React store.

**Acceptance Criteria:**

**Given** `lib/xrpl/writes.ts`, which today imports `@/store/app-store` and calls `useAppStore.getState().setTxInFlight`
**When** the change is complete
**Then** the file imports nothing from `src/store`, `src/hooks`, `src/components` or `src/pages`
**And** the in-flight flag is set by the caller, or through a setter the caller supplies.

**Given** `submitAndClassify` remains the single choke point every write passes
**When** any payment or trust-line transaction is submitted
**Then** the in-flight flag is raised before submission and cleared after the outcome is known, exactly as before.

**Given** an app update is available and a payment is in flight
**When** the operator tries to apply the update
**Then** it is still blocked until the transaction resolves — FR-48 is unchanged.

**Given** the new shape
**When** a test submits a payment against a stubbed client
**Then** it can assert the in-flight transitions without a store.

### Story 2.3: The ledger client can be substituted in a test

As a maintainer,
I want `lib/xrpl/client.ts` to accept a substitute client and expose a reset,
So that the failover path becomes reachable from a test at all.

**Acceptance Criteria:**

**Given** `lib/xrpl/client.ts`, which today holds a module-level map and constructs a real `Client`
**When** the change is complete
**Then** the module accepts a client factory and exposes a reset that clears its map
**And** production behaviour is unchanged when no substitute is supplied.

**Given** `lib/xrpl/reads.ts` and `lib/xrpl/writes.ts`, which call `getXrplClient` directly
**When** a test supplies a substitute
**Then** both use it without further change.

**Given** AD-2
**When** the change is complete
**Then** no module outside `src/lib/xrpl/` imports a `Client` from `xrpl` or calls `getXrplClient`
**And** the live-subscription hook is either moved inside the boundary or recorded in the spine as a named exception with its reason.

### Story 2.4: The failover path is proven by a test

As a wallet operator,
I want proof that the wallet falls through to the backup endpoint,
So that a primary endpoint outage does not silently leave me unable to read the ledger.

**Acceptance Criteria:**

**Given** the seam from Story 2.3 and a substitute that refuses the primary endpoint
**When** a ledger read is attempted
**Then** the backup endpoint is tried
**And** the read succeeds.

**Given** a substitute where the primary never resolves
**When** the ten-second timeout elapses
**Then** the backup is tried rather than the read hanging.

**Given** a substitute where both endpoints refuse
**When** a ledger read is attempted
**Then** the resulting error names both failures
**And** the original causes are preserved rather than flattened into one message.

**Given** a connection that is already open and connected
**When** a second read is requested for the same network
**Then** the existing connection is reused and no second connection is opened.

## Epic 3: A failure always reports the same way

One rule for where a failure appears, and code that obeys it. Closes G-5 and the
`notify` half of G-3. Implements AD-1 and AD-8. Protects FR-53, FR-54, FR-55.

**Before this epic starts:** AD-8 is the architect's call, not the product
owner's decision. Confirm or override it first. If it is overridden, these three
stories change.

**This epic carries the only user-visible risk in this breakdown.** A failure
moving from one place on screen to another is a real change and needs the manual
320px and 200%-zoom pass in `docs/agents/verifying-your-work.md` before merge.

### Story 3.1: The notice vocabulary stops living in a UI component

As a maintainer,
I want the notice tone vocabulary to sit where both the funnel and the component can see it,
So that `lib/notify.tsx` stops importing a component.

**Acceptance Criteria:**

**Given** `lib/notify.tsx`, which today imports `@/components/ui/alert` as a value for the tone map, and `store/notice-store.ts`, which imports it as a type
**When** the change is complete
**Then** neither imports anything from `src/components`
**And** the tone vocabulary lives where both sides and the `Alert` component can import it.

**Given** AD-1's one named exception
**When** the change is complete
**Then** `lib/notify.tsx` may still import `store/notice-store`, because that store is the funnel's sink
**And** no other `lib` module imports from `src/store`.

**Given** the Annunciator on the main, unlock and onboarding screens
**When** a notice of each severity is raised
**Then** each renders exactly as it did before, in both themes.

### Story 3.2: Dismissing a notice goes through the same door as raising one

As a maintainer,
I want `notify` to own dismissal as well as raising,
So that nothing reaches past the funnel into the notice store.

**Acceptance Criteria:**

**Given** `hooks/useAppUpdate.ts:169`, which today calls `useNoticeStore.getState().dismiss()` directly because `notify` has no dismiss
**When** the change is complete
**Then** `notify` exports a dismiss
**And** no module outside `lib/notify.tsx` imports `useNoticeStore`, except the Annunciator that renders it.

**Given** an update notice is showing and the operator declines that version
**When** the decline is recorded
**Then** the notice is dismissed exactly as before
**And** a newer release still surfaces later — FR-48 is unchanged.

### Story 3.3: Every failure appears where the rule says it will

As a wallet operator,
I want to know in advance where a given failure will appear,
So that I never miss one because it showed up somewhere I was not looking.

**Acceptance Criteria:**

**Given** AD-8's rule — a failed read of data with a place on screen renders inline, anything the operator did reports to the Annunciator
**When** every query consumer and every imperative `catch` has been audited
**Then** each follows the rule
**And** any deliberate exception is recorded in the spine with its reason rather than left as a silent difference.

**Given** a ledger read fails on the Balances or History screen
**When** the failure renders
**Then** it appears inline where the missing data would have been
**And** it does not auto-dismiss.

**Given** a send, a trust-line change, an unlock or an update fails
**When** the failure renders
**Then** it appears in the Annunciator
**And** it does not auto-dismiss, and it is announced in the polite live region.

**Given** the screens at 320px and at 200% zoom
**When** a failure of each kind is shown
**Then** nothing is clipped or unreachable
**And** `bun run check:contrast` passes for every tone used.

## Epic 4: The rules and the code agree again

Four disagreements between `docs/decisions.md` and the code. Closes G-9, G-6, G-7,
G-8. Implements AD-5, AD-7, AD-10, AD-11. Protects FR-29, FR-42, FR-43, FR-46,
FR-48, NFR-1 and NFR-2. Every story here ships independently of the others.

### Story 4.1: The secrets rule says what it means

As a maintainer,
I want `docs/decisions.md` to record that an unreadable browser key handle is permitted,
So that a future agent does not remove working code while enforcing the rule.

**Acceptance Criteria:**

**Given** `docs/decisions.md` §4's rule that no secret ever enters store state or anything serializable
**When** the sentence is added
**Then** it states that a `CryptoKey` imported non-extractable may be held in session state and in the IndexedDB session store, and that raw key bytes and plaintext seeds may not
**And** it says the exposure window is the auto-lock setting.

**Given** an agent auditing `store/app-store.ts:22` against §4
**When** it reads the rule
**Then** it finds the code compliant rather than flagging it.

**Given** this is a `docs/` change with no code change
**When** the story is complete
**Then** nothing under `src/` has been modified.

### Story 4.2: Drops arithmetic lives in one module

As a wallet operator,
I want the spendable-balance calculation written once,
So that two copies cannot drift and show me different numbers.

**Acceptance Criteria:**

**Given** the four sites doing `BigInt` arithmetic on drops outside `money.ts` — `useSpendableBalance.ts:16` and `:19`, `SendTab.tsx:75-76`, `TrustLinesTab.tsx:68`
**When** the change is complete
**Then** each calls a named helper in `lib/xrpl/money.ts`
**And** no arithmetic on a monetary value remains outside that module.

**Given** the spendable-balance rule — balance minus base reserve minus owner reserve times owned objects
**When** it is expressed as a helper
**Then** it exists in exactly one place
**And** it has tests covering zero balance, an unfunded account, and a balance below the base reserve.

**Given** an account with trust lines on Testnet
**When** the Balances screen renders
**Then** the spendable figure is identical to the figure shown before this change.

### Story 4.3: Every explorer link goes through the shared component

As a wallet operator,
I want every address and hash to link out the same way,
So that a link can never point at the wrong network's explorer.

**Acceptance Criteria:**

**Given** `components/wallet/AddressDisplay.tsx:65`, which today writes its own anchor using the URL builder
**When** the change is complete
**Then** it renders through `AddressLink`
**And** no hand-written anchor to an explorer remains anywhere in `src/`.

**Given** the app on Mainnet and then on Testnet
**When** an address link is followed from every screen that shows one
**Then** each opens the network-correct official explorer.

**Given** the anchors pointing at source and release notes in `Unlock.tsx`, `SettingsTab.tsx` and `Onboarding.tsx`
**When** the audit runs
**Then** they are left alone, because they are not explorer links.

### Story 4.4: The service worker registers once

As a wallet operator,
I want one piece of code to own service-worker registration,
So that the update prompt cannot fire from a path the update logic does not control.

**Acceptance Criteria:**

**Given** `main.tsx:3`, which today imports `virtual:pwa-register` directly and calls `registerSW` at `:9`
**When** the change is complete
**Then** it goes through `lib/sw-register.ts`
**And** that module is the only importer of the virtual specifier, as its own docstring already claims.

**Given** a build with a new release published
**When** the app is opened
**Then** the update notice appears exactly once
**And** the new worker installs and waits rather than activating — FR-48 is unchanged.

**Given** the operator accepts the update with no transaction in flight
**When** the new version activates
**Then** it activates once, and the app reloads into the new build.

---

# Round two — stories

The standing conditions above apply unchanged to every story below.

## Epic 5: A figure on screen was actually read

Every number the wallet shows, or accepts as permission, comes from a read that
succeeded for the thing on screen now. Closes G-10, G-11, G-12, G-15 and G-20.
Implements AD-13, AD-14, AD-15, AD-8, AD-4 and AD-6. Protects FR-14, FR-18,
FR-19, FR-20, FR-29, FR-30, FR-38 and FR-57.

### Story 5.1: A destination check that failed cannot permit a send

As a wallet operator sending real funds to an exchange,
I want a destination-tag check that did not succeed to block the send,
So that a read failing is never mistaken for the destination not needing a tag.

**Acceptance Criteria:**

**Given** `SendTab.tsx:68`, where `destCheckFailed` is today
`destQuery.isError && !destQuery.data`
**When** the guard is rewritten
**Then** it is satisfied only by a read that succeeded **for the address
currently in the field**
**And** it fails closed on each of three separate conditions: the read is in
error, the read's input no longer matches the address on screen, and the read is
outside its freshness window.

**Given** `useDestinationInfo.ts:33` carries `staleTime: 30_000`
**When** a destination was checked successfully and thirty seconds have passed
**Then** the cached answer no longer satisfies the guard on its own
**And** a fix that inspects only `isError` is insufficient — this path must be
covered explicitly.

**Given** the send path at `SendTab.tsx:155`, where the condition
`!destInfo?.requireDestTag` is evaluated
**When** the guard is enforced
**Then** the check lives **inside the submit path**, not only on the control
**And** an `aria-disabled` control alone does not satisfy this story, because
`aria-disabled` does not prevent activation (AD-13).

**Given** `send-destination-error.test.tsx`, which today exercises the error
branch only
**When** the story is complete
**Then** it pins all three failing conditions separately
**And** the freshness case uses a controlled clock rather than a real wait.

**Given** a destination on Testnet that requires a destination tag
**When** the check succeeds and no tag is entered
**Then** the send is blocked with the reason in visible text, as it is today —
this story must not regress the case that already works.

### Story 5.2: A failed reserve read is reported, not silently subtracted

As a wallet operator deciding how much I can spend,
I want the Spendable and Reserved figures to say when they could not be worked out,
So that a missing number is never mistaken for a smaller obligation.

**Acceptance Criteria:**

**Given** `useSpendableBalance.ts:10` and `BalancesTab.tsx:37`, neither of which
inspects `reserves.isError`
**When** the reserve read fails
**Then** the derived figures report their own unavailability through
`QueryErrorState`
**And** neither Spendable nor Reserved renders a figure derived from a read that
did not succeed.

**Given** a reserve read that fails while `account_info` succeeds
**When** the Balances screen renders
**Then** the XRP balance still renders, because its own read succeeded
**And** Spendable and Reserved render the failure rather than disappearing —
a screen with fewer numbers on it than before is the defect, not the fix.

**Given** AD-14
**When** a reserve read fails after an earlier success
**Then** the previously-derived Spendable figure is not left on screen
**And** no liveness indicator claims the derived figures are current.

### Story 5.3: A fee that could not be read does not become a fee of zero

As a wallet operator about to confirm a payment,
I want the affordability check to refuse to run on a fee it could not read,
So that a failed read cannot make a payment look affordable when it is not.

**This story is a guard fix, not a reporting fix.** `SendTab.tsx:89` reads:

```
if (!amountPlusFeeFits(xrpToDropsString(amount), fee.data ?? '0', spendableDrops))
```

When the fee read fails, `fee.data` is `undefined` and the affordability guard
FR-16 requires — "blocks submission unless amount plus fee is within the
Spendable Balance" — runs against a **fabricated fee of zero**, which is the
permissive direction. That is AD-13's failure exactly: a guard on a money-moving
action satisfied by a read that did not succeed, coerced to the permissive
answer. Its own code comment at `:83` says the check exists so a send fails "with
a reason instead of costing a fee and coming back as `tecUNFUNDED_PAYMENT`" — and
a `tec` result takes the fee (`:131`).

**Acceptance Criteria:**

**Given** `SendTab.tsx:89`, where the fee defaults to `'0'` when the read failed
**When** the guard is rewritten
**Then** the affordability check is **not evaluated** against a fee that was not
read
**And** the send is blocked with the reason in visible text, because a guard on a
money-moving action fails closed (AD-13).

**Given** `SendTab.tsx:269`, which renders `'…'` when `fee.data` is absent, and
`:314`, which renders "a network fee of the current rate"
**When** the fee read has failed
**Then** neither presents the absence as a pending read
**And** the failure is reported through the surface AD-8 assigns to a failed
read, before the confirm step rather than after submission — FR-18 is either met
or visibly not met, never silently unmet.

**Given** a fee read that fails and then succeeds on retry
**When** the read succeeds
**Then** the guard evaluates normally and the send proceeds
**And** no stale fee from an earlier success is used in the meantime (AD-14).

### Story 5.4: An amount not known to be delivered renders as an upper bound

As a wallet operator reading my transaction history,
I want an amount the ledger did not confirm as delivered to be labelled as an upper bound,
So that a requested figure is never read as a received one.

**Acceptance Criteria:**

**Given** `lib/xrpl/reads.ts`, which today sets `amountIsUpperBound` only when
`delivered_amount === 'unavailable'`
**When** `delivered_amount` is **absent** rather than the literal string
**Then** the figure is flagged as an upper bound exactly as the `'unavailable'`
case is
**And** anything that is not a positive `delivered_amount` produces an upper
bound, per FR-57.

**Given** `fetchTx`, which is exported, currently uncalled, and applies no FR-57
normalisation
**When** the story is complete
**Then** it applies the same normalisation as the history path
**And** a future caller cannot inherit the gap.

**Given** a partial payment in history
**When** it renders
**Then** the upper-bound label is present and carries meaning beyond colour
(NFR-6).

### Story 5.5: Invalidating account-scoped data goes through one named group

As a wallet operator,
I want every screen that discards cached account data to discard the same set,
So that no screen can refresh three figures and leave the fourth stale.

**Acceptance Criteria:**

**Given** the four invalidation sites, which today invalidate different subsets —
`useAccountLiveUpdates` all four keys, `SendTab` three (no
`incomingPaymentWatch`), `TrustLinesTab` two, `BalancesTab` one
**When** the story is complete
**Then** each invalidates the same named account-scoped group
**And** a member missing from the group is visible at the factory rather than
inferred by comparing four call sites.

**Given** `scripts/check-query-keys.mjs` flags array **literals** at key sites
and cannot see a key bound to a variable first (G-19)
**When** the group is introduced
**Then** **the factory owns the loop** — it exposes a function that performs the
invalidation, and call sites pass no query key at all
**And** a shape that returns a set for call sites to iterate is **rejected**: it
would create a variable-bound key at four sites, which the guard cannot see,
making the invalidation layer more correct and less enforced at the same time.

**Given** a completed send on Testnet
**When** the transaction validates
**Then** balance, history, trust lines and the incoming-payment watch all
refresh
**And** the same holds after a trust-line change and on the live-update path.

## Epic 6: "Remove everything" removes everything, and locking removes nothing else

Teardown is two sets, never one. Account data never survives a teardown that
claims to remove it; the shell survives every lock. Closes G-13 and G-14.
Implements AD-16 and AD-8. Protects FR-13, FR-52, and
`app-versioning-and-updates.md` US-8 and US-9.

### Story 6.1: A reset that claims to remove everything clears the persisted store

As someone about to hand this device to another person,
I want "remove everything" to leave none of my wallet labels or saved addresses behind,
So that the flow that promises everything is gone is telling the truth.

**Acceptance Criteria:**

**Given** two IndexedDB owners — `lib/crypto/db.ts` holding the vault, and
`store/app-store.ts` persisting under `xrpl-wallet-app-state` via `idb-keyval`
**When** `tearDownAllLocalState` runs
**Then** the persisted app-store key is cleared as part of the account-data set
**And** `wallets`, `addressBook`, `autoLockMinutes` and `declinedUpdateVersions`
do not survive it.

**Given** `pages/Unlock.tsx:74` `handleReset` — the hard-lock recovery that
`wallet-security.md` names as the only way forward after eight failed attempts —
which today calls teardown and reloads without clearing store state
**When** the operator takes that path
**Then** no wallet label, address or Address Book entry remains after the reload
**And** the same holds for `SettingsTab.tsx:123` `handleFullReset`, which today
empties `wallets` and `activeWalletId` in state while leaving the other three
persisted fields.

**Given** AD-16's rule that a module persisting anything is incomplete until its
clear is registered with the teardown owner
**When** this story is complete
**Then** `lib/teardown.ts` owns the clear for the persisted store rather than
each call site clearing its own fields
**And** the two sets — account data and the shell — are distinguishable in the
code, not only in the docstring.

**Given** the vault is already genuinely wiped today
**When** this story is complete
**Then** that remains true — this story adds to the clear set and removes
nothing from it.

### Story 6.2: Locking the app does not delete the app shell

As a wallet operator on a phone with no signal,
I want locking the app to leave it able to open,
So that a lock does not cost me offline access it was never protecting.

**Acceptance Criteria:**

**Given** `hooks/useClearCacheOnLock.ts:19`, which calls `clearCachedAccountData`
on every lock, and `lib/teardown.ts:31`, where that function deletes **every**
Cache Storage key
**When** the app locks
**Then** the service-worker precache is untouched
**And** the TanStack Query cache is still cleared, because that is where account
data actually lives.

**Given** `vite.config.ts:129` configures `globPatterns` and **no
`runtimeCaching`**, so Cache Storage holds only the precached shell and never an
RPC response
**When** this story is complete
**Then** the hook's docstring — which claims locking "must not leave balances,
trust lines and history sitting warm in the caches" — is corrected to say what
is actually true
**And** the correction states that those were never in Cache Storage, so a
future reader does not restore the deletion.

**Given** `app-versioning-and-updates.md` US-8 (the previous precache is
retained) and US-9 (the app opens offline), and PRD FR-52
**When** the app is locked and then reopened with no network
**Then** it renders
**And** the update flow still sees the precache it needs.

**Given** wallet removal at `SettingsTab.tsx:118`, which also calls
`clearCachedAccountData`
**When** a single wallet is removed
**Then** the shell survives that too — the two call sites get the same
corrected behaviour.

## Epic 7: Every write reaches the choke point, and the interlock can count

One choke point, reachable by any transaction type, raising a signal that counts
rather than latches. Closes G-16 and G-17. Implements AD-9. Protects FR-46,
FR-48 and NFR-2.

### Story 7.1: Any transaction type can reach the write choke point

As the next person to add an XRPL feature to this wallet,
I want the choke point every write must pass through to be reachable from outside its own file,
So that obeying AD-9 does not require editing the module that enforces it.

**Acceptance Criteria:**

**Given** `lib/xrpl/writes.ts:51`, where `submitAndClassify` is declared
`async function` — **not exported** — and typed `tx: Payment | TrustSet`
**When** this story is complete
**Then** it is exported
**And** its transaction parameter is typed on `SubmittableTransaction`.

**Given** the two existing callers, which pass concrete `Payment` and `TrustSet`
objects
**When** the type is widened
**Then** both still compile unchanged
**And** no caller gains a cast — the narrower type was doing no safety work, and
widening it must not push the narrowing into the call sites.

**Given** the spine's Deferred list, which names Escrow, Check, Payment Channel,
`AccountSet` and multi-sign
**When** a future feature submits one of those
**Then** it can pass through the choke point without editing `writes.ts`
**And** it therefore raises the in-flight signal, which today it could not —
`:58` is the only caller of `reportTxInFlight(true)`, so a write that bypasses
the choke point is invisible to the update interlock at `useAppUpdate.ts:133`.

**Given** `writes.test.ts`
**When** this story is complete
**Then** a test submits a transaction type that is neither `Payment` nor
`TrustSet` through the exported choke point
**And** asserts the in-flight signal was raised for it.

### Story 7.2: Two overlapping writes cannot clear each other's in-flight signal

As a wallet operator with a payment and a trust-line change both awaiting validation,
I want the app to know that something is still in flight,
So that an update cannot activate underneath a transaction that has not settled.

**Acceptance Criteria:**

**Given** `store/app-store.ts:31`, where `txInFlight` is a `boolean` set by `:76`,
and `writes.ts:58`/`:88`, which set it true and clear it in `finally`
**When** two submissions overlap
**Then** the signal reports in-flight until the **last** one settles
**And** the choke point holds a depth: true on the 0→1 transition, false on 1→0.

**Given** the flag is deliberately global because Radix unmounts inactive tabs,
so a payment and a trust-line change can genuinely be in flight together
**When** the first of two settles
**Then** the signal does not clear
**And** `hooks/useAppUpdate.ts:133`, which reads that flag as its sole interlock,
still refuses to activate.

**Given** a submission that throws, and one that returns `expired`
**When** either happens
**Then** the depth still decrements, because the decrement lives in the same
`finally` that clears the flag today
**And** a thrown outcome cannot strand the signal above zero.

**Given** `app-versioning-and-updates.md` US-5, which depends on the signal being
accurate
**When** this story is complete
**Then** a test submits two overlapping writes and asserts the signal stays
raised across the first settlement.

### Story 7.3: A failed update activation keeps telling the truth about what is waiting

As the next agent to read `sw-register-core.ts`,
I want a test that says why the waiting flag is never cleared,
So that correct behaviour is not "fixed" into a lie.

**This story adds a test and a comment. It changes no behaviour.** G-26 was filed
as a defect — the waiting flag never returns to false — and refuted on
2026-09-15: after a failed activation a worker genuinely **is** still waiting, so
the flag is stating a true fact. The refutation currently lives only in
`GAP-REGISTER.md`, where the next reader of `sw-register-core.ts:63` will not
look.

**Acceptance Criteria:**

**Given** `lib/sw-register-core.ts:49`, where `waiting` is set true at `:63` and
never set false
**When** this story is complete
**Then** a test asserts `isUpdateWaiting()` remains true after an `applyUpdate`
whose activation rejects
**And** the test is named for the reason, so the assertion reads as intent
rather than as a description of current behaviour.

**Given** `hooks/useAppUpdate.ts:138`, which already calls `setApplying(false)`
in its `catch`
**When** activation fails
**Then** the control becomes available again **and** the prompt keeps showing
**And** a test pins both halves together, because the pair is what makes the
behaviour correct rather than stranded.

**Given** AD-15 — an empty state is a claim, not a default
**When** a future change proposes `setWaiting(false)` on activation failure
**Then** the test fails
**And** the failure message names AD-15, so the reason arrives with the red
rather than requiring a trip to the register.

## Epic 8: The ledger connection closes what it opens

No connection is opened that nobody closes, and a mount does not open one socket
per query. Closes G-22 and G-23. Implements AD-2 and AD-12. Protects NFR-2.

> **⛔ The epic-level non-goal applies to every story here:
> `resetXrplClients` must not gain a disconnect.** `client.ts:24-32` documents
> it as AD-12's synchronous test seam, deliberately separate from
> `disconnectAllClients`, which is the production teardown path and does close
> the sockets. The fix below reads as though it belongs there. It does not.

### Story 8.1: A connection the app has stopped using is closed

As a wallet operator on a phone with a patchy connection,
I want a socket the app has abandoned to be closed,
So that a failing endpoint does not accumulate live connections in my pocket.

**Acceptance Criteria:**

**Given** `client.ts:76-84`, the failover loop, where a `clientFactory(url)` that
fails `connectWithTimeout` is caught at `:81` and left
**When** the loop falls through to the backup endpoint
**Then** the client that failed is disconnected
**And** a connect abandoned at the ten-second timeout cannot leave a socket that
opens afterwards and belongs to nobody.

**Given** `client.ts:71` — `if (existing?.isConnected()) return existing` — where
a cached-but-disconnected client falls through and is **overwritten** at `:80`
**When** the map entry is replaced
**Then** the client being replaced is disconnected first
**And** this cache-miss replacement path is covered by its own test, because it
is a second leak path and the register names only the failover one.

**Given** `connectWithTimeout` at `:56`, whose `finally` clears the timer but
does nothing about the client
**When** the timeout wins the race
**Then** the losing connection is closed rather than merely unreferenced.

**Given** the epic-level non-goal
**When** this story is complete
**Then** `resetXrplClients` is unchanged
**And** it remains synchronous, still drops connections without disconnecting,
and still serves as AD-12's seam — a test asserts it does not await anything.

**Given** `disconnectAllClients` at `:92`, the production teardown path
**When** this story is complete
**Then** its behaviour is unchanged — this story adds disconnects on the
abandonment paths, it does not move the teardown path.

### Story 8.2: Concurrent callers share one connection attempt

As a wallet operator opening the app,
I want the queries that fire at mount to share one connection,
So that a single screen does not open several sockets and discard all but one.

**Acceptance Criteria:**

**Given** `client.ts:70`, where `getXrplClient` has no in-flight deduplication,
so several queries firing at mount each run the failover loop
**When** two or more callers request the same network before a connection is
established
**Then** they share one connect attempt
**And** exactly one `Client` is constructed for that network.

**Given** the in-flight promise is cached per network
**When** the attempt rejects
**Then** the cached promise is discarded rather than left to reject every future
caller
**And** a subsequent call retries the failover loop from the start.

**Given** two different networks requested concurrently
**When** both connect
**Then** they do not share an attempt — deduplication is per network, as the
cache is.

**Given** `client.test.ts`, where the failover tests Epic 2 added already live
**When** this story is complete
**Then** a test fires several concurrent `getXrplClient` calls against a counting
factory and asserts one construction
**And** the existing failover tests still pass unchanged, because the fallback
behaviour is not what this story alters.

## Epic 9: The Address Book tells two counterparties apart

An entry's identity is the (address, destination tag) pair, and FR-21's warning
is decided on that pair. Closes G-18. Implements AD-6. Protects FR-19, FR-21 and
FR-45.

### Story 9.1: A saved address carries the tag that makes a payment arrive

As a wallet operator with two accounts at the same exchange,
I want each saved destination to keep its own destination tag,
So that saving the second one does not overwrite the first.

**Acceptance Criteria:**

**Given** `store/app-store.ts:13`, where an entry is typed
`{ address: string; label: string }`
**When** this story is complete
**Then** the entry carries an optional destination tag
**And** the tag is stored as a string or `undefined`, never coerced through a
number — a destination tag is an identifier, not a quantity.

**Given** `addAddressBookEntry` at `:73`, which today dedupes with
`e.address !== address`
**When** two entries share an address but differ by tag
**Then** both are kept
**And** an entry with the same address **and** the same tag still replaces rather
than duplicates.

**Given** AD-6's requirement that identity is a named function beside the entity,
never re-derived at a call site
**When** this story is complete
**Then** one exported function answers "are these the same counterparty?"
**And** no call site compares `.address` directly to decide identity.

**Given** an entry saved with no tag and one saved with a tag, for the same
address
**When** identity is evaluated
**Then** they are two counterparties — absence of a tag is a distinct identity,
not a wildcard that matches any tag.

**Given** the persisted store already holds entries in the old shape
**When** the app loads after this change
**Then** existing entries read as tagless entries rather than throwing or
vanishing
**And** no saved address is lost by the shape change.

### Story 9.2: The send screen warns on the pair, and the list stops inventing labels

As a wallet operator sending to a second account at an exchange I have used before,
I want the "you haven't sent here before" warning to fire,
So that a familiar address does not silence the check on an unfamiliar tag.

**Acceptance Criteria:**

**Given** `SendTab.tsx:75` — `addressBook.some((e) => e.address === destination)`
— which is FR-21's "you haven't sent here before" test
**When** the operator sends to a known address with a tag never used before
**Then** the warning fires
**And** the test uses the identity function from Story 9.1 rather than comparing
addresses.

**Given** `SendTab.tsx:127`, which writes an entry on every send via
`addAddressBookEntry(destination, destination.slice(0, 8))`
**When** an entry is written
**Then** it records the destination tag that was actually used
**And** it does **not** fabricate a label from the address.

**Given** `SettingsTab.tsx:229`, where a row renders `{e.label}` beside an
`AddressLink` showing the same address in full
**When** an entry has no human label
**Then** the row renders the address once, through `AddressLink`, and the
destination tag when there is one
**And** nothing renders a truncated address as though it were a name.

**Given** `SettingsTab.tsx:229` uses `key={e.address}`
**When** two entries share an address and differ by tag
**Then** the React key is unique per entry
**And** it is derived from the identity function, not from the address alone —
two rows with the same key is the defect this change would otherwise introduce.

**Given** the empty-state copy at `SettingsTab.tsx:221-224`, which already says
addresses are saved automatically so the wallet can warn on a new destination
**When** this story is complete
**Then** that copy is still accurate
**And** nothing in this story makes the list look like something the operator can
curate, because whether they can is still an open product question.

**Given** the list on a 320px viewport and at 200% zoom
**When** an entry shows an address and a destination tag
**Then** both remain readable and the row does not overflow
**And** the tag is distinguishable from the address by more than colour (NFR-6).

## Epic 10: A closed gap cannot silently reopen

The fixes from round one are held in place by a gate rather than by memory.
Closes G-19 and G-27. Implements AD-4, AD-7 and AD-10. Protects the closures of
G-1, G-6 and G-7.

### Story 10.1: The query-key guard sees a key that was bound to a variable first

As the next agent to touch the invalidation layer,
I want the guard to catch a hand-written key even when it is assigned before use,
So that the gate protecting G-1's closure cannot be stepped around by accident.

**Acceptance Criteria:**

**Given** `scripts/check-query-keys.mjs`, which matches array literals against
whole-file text at the key-taking APIs
**When** a key is bound first — `const k = ['accountState', n, a]` then
`invalidateQueries({ queryKey: k })`
**Then** the guard reports it
**And** the existing fixture tree in `query-key-guard.test.ts` gains this case,
which it does not cover today.

**Given** the guard is a dependency-free `node:` script by design, and this check
needs to follow an assignment to its use
**When** this story is implemented
**Then** either the check moves to a real lint rule with an AST, or the `node:`
script's limit is recorded explicitly in its docstring and in
`GAP-REGISTER.md`
**And** whichever is chosen, the outcome is stated — a guard that silently
cannot see a case is the failure this epic exists to prevent.

**Given** the `check-query-keys-allow` directive, which suppresses exactly one
line
**When** the guard changes
**Then** the directive still suppresses one line and no more
**And** the guard's own fixtures, which must retype keys to prove a mismatch is
caught, still pass.

**Given** `bun run lint`
**When** this story is complete
**Then** the guard still runs there
**And** it adds no dependency that `lint` did not already have, or the addition
is justified in `docs/decisions.md`.

### Story 10.2: Money arithmetic and explorer links get gates of their own

As the next agent to touch a balance or an address link,
I want `lint` to stop me reintroducing what Epic 4 removed,
So that two grep-shaped rules do not decay the way the query keys did.

**Acceptance Criteria:**

**Given** AD-7 — all money arithmetic lives in `lib/xrpl/money.ts`
**When** BigInt arithmetic appears in `src/hooks`, `src/pages` or
`src/components`
**Then** `lint` fails and names the file and line
**And** `lib/xrpl/money.ts` itself is exempt, as the factory is exempt in the
query-key guard.

**Given** AD-10 — explorer links only through `AddressLink` and `TxLink`
**When** an anchor is hand-rolled to an explorer host outside those two
components
**Then** `lint` fails
**And** the two shared components are exempt.

**Given** both checks are written in the `check-query-keys.mjs` idiom
**When** they are added
**Then** each supports a one-line opt-out directive with the same
suppress-exactly-one-line semantics
**And** each is wired into `bun run lint` and given its own `bun run check:*`
script, as the three existing guards are.

**Given** `src/` as it stands today, where both rules already hold
**When** the new gates run
**Then** they pass with no exemptions
**And** each ships with a fixture test proving it catches a violation, because a
gate nobody has seen fail is not known to work.

## Epic 11: Importing a Seed is the same operation wherever you do it

One gated path, one set of words for a malformed Seed, and whitespace that does
not decide whether a Seed is valid. Closes G-24. Implements AD-3. Protects FR-1,
FR-2 and FR-3.

### Story 11.1: The warning comes before the write on both import paths

As someone importing a Seed whose account has a disabled master key,
I want to be warned before the Seed is stored,
So that I find out while I can still stop.

**Acceptance Criteria:**

**Given** `pages/Onboarding.tsx:96-105`, which probes the account and warns
**before** calling `importAndStoreWallet` — "nothing is written to the vault
until the user has seen the warning and chosen to continue"
**When** `pages/tabs/SettingsTab.tsx:72-82` runs the same import
**Then** it warns before `importAndStoreWallet`, not after
**And** the vault write happens only once the operator has seen the warning and
chosen to continue.

**Given** the comment already at `SettingsTab.tsx:70-71` — that the
disabled-master-key check "must not be limited to the onboarding path"
**When** this story is complete
**Then** that intent holds for the ordering as well as for the presence of the
check
**And** the comment is updated so it no longer reads as satisfied by a check that
runs too late.

**Given** an account whose master key is **not** disabled
**When** a Seed is imported from either screen
**Then** the import completes with no extra step
**And** this story adds no friction to the ordinary path.

**Given** the probe itself fails — the network is unreachable and account state
cannot be read
**When** the operator imports
**Then** the outcome is the same on both screens
**And** an unread account state is not treated as "master key is fine", because a
failed read must not coerce to the permissive answer (AD-13).

### Story 11.2: A pasted Seed is not rejected for its whitespace

As someone pasting a Seed from a password manager,
I want a trailing newline not to read as a corrupt Seed,
So that a correct backup is not reported as a bad one.

**Acceptance Criteria:**

**Given** neither import path trims its input — `Onboarding.tsx:96` and
`SettingsTab.tsx:72` both read `.value` directly
**When** a Seed is pasted with leading or trailing whitespace
**Then** it is accepted
**And** the trim happens in one place that both paths use, not twice.

**Given** `Onboarding.tsx:223` validates with `isValidSeed` and reports "That
seed looks invalid. Double-check and try again.", while `SettingsTab` has no
such check and surfaces whatever `addressFromSeed` throws through
`toast.error(err?.message ?? 'Could not add wallet.')`
**When** a genuinely malformed Seed is entered on either screen
**Then** both report it the same way, in the same words
**And** neither surfaces a raw xrpl.js message to the operator.

**Given** guardrail #3 — a Seed must never enter React state
**When** the trim and the validation are added
**Then** both operate on the ref-held value, and neither introduces a controlled
input
**And** the Seed is still cleared from the input after a completed import, as
both screens do today.

**Given** a Seed that is whitespace only
**When** it is submitted
**Then** it is reported as malformed rather than as empty-and-ignored.
