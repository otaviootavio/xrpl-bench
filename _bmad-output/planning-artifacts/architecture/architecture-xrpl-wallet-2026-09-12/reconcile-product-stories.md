# Reconcile — `PRODUCT.md` and the twelve story epics against the spine

Date: 2026-09-15. Inputs: `PRODUCT.md`; `docs/user-stories/INDEX.md` and the
twelve epic files beside it. Spine: `ARCHITECTURE-SPINE.md` (AD-1..AD-15 plus
Deferred). Companion: `GAP-REGISTER.md`.

Method: walked each epic for capabilities that could be built two incompatible
ways and asked which AD forecloses the choice; read all fifteen ADs against
`PRODUCT.md` § Product Principles; checked the Design Paradigm, Structural Seed
and Deployment paragraph against what the stories and the code actually require.
"The spine does not restate this" is not recorded as a finding. Code was read
only where wording depended on it.

**Nothing in the spine contradicts a `PRODUCT.md` principle.** All fifteen ADs
sit with correctness-outranks-elegance; AD-13/14/15 are principle 1 and
principle 4 written as rules, AD-10 is principle 3, AD-3/AD-5 are principle 5.
The findings below are omissions and one structural claim, not contradictions of
the principles.

---

## F-1 — The lock path deletes the app shell, which two update stories forbid — **critical**

`src/lib/teardown.ts`'s `clearCachedAccountData` — the lock path, via
`src/hooks/useClearCacheOnLock.ts` — calls `caches.keys()` and deletes **every**
Cache Storage key. That is not scoped to ledger data; it includes the
`vite-plugin-pwa` precache, i.e. the shell.

Two acceptance criteria stand against this:

- `app-versioning-and-updates.md` US-8: "The precache from the previous release
  is not discarded until the new version has started successfully, so a failed
  activation leaves a working shell rather than none." A lock between install
  and activate discards exactly that.
- US-9: "the wallet to open and work without a network." An offline user who
  locks has no shell to reopen — and US-8 also forbids the documented recovery
  from being "clear site data", which is effectively what locking performs on
  the shell half.

The spine blesses the current shape rather than catching it: the Structural Seed
names `teardown.ts` as "the one place that clears caches, session and vault", and
no AD distinguishes *account data* (must not survive a handover, per
`docs/decisions.md` guardrail #7) from *the shell* (must survive, per US-8/US-9
and re-fetchable anyway because it is public and carries no account data).

The vault is not at risk — `wipeVault()` is only on `tearDownAllLocalState`,
reached from Unlock's reset and Settings' remove-all. The destroyed asset is
availability, not funds. It is still critical because it is a live
contradiction between the shipped substrate and a shipped epic, in the area
`PRODUCT.md` § Positioning uses to justify the no-backend claim.

**Proposed shape:** an AD splitting the two cache classes and naming which
teardown entry point may touch each, with the shell exempt from the lock path.

## F-2 — No AD governs network egress, and the Deployment paragraph's "only backend" claim is false — **high**

The spine states: "No server-side component exists in any environment; the
ledger's public RPC endpoints are the only backend the app talks to."

Two outbound HTTP calls refute the second clause:

- `src/lib/xrpl/faucet.ts:18` — `POST https://faucet.altnet.rippletest.net/accounts`,
  required by `network-selection.md` US-2. A third-party host, not an RPC
  endpoint. (Testnet-only and epic-scoped; the objection is to the unqualified
  claim, not to the faucet.)
- `src/lib/release-check.ts:48` — `fetch('/releases.json', { cache: 'no-store' })`,
  required by `app-versioning-and-updates.md` US-2. Own origin, but it *is* a
  backend-shaped dependency and the update story turns on it.

The structural half matters more than the wording. AD-2 seals the *xrpl
`Client`* — it names `Client` and `getXrplClient` — not network egress. Nothing
in the spine stops a future component, hook or `lib` module calling `fetch()`
against any host: a price oracle for the deferred fiat display, an error
reporter, a CDN-hosted font. `PRODUCT.md` principle 5 ("No backend, no
telemetry, no third-party script with any path to the unlock or seed surfaces.
Convenience never buys its way past this") is the product's load-bearing claim
and has no architectural enforcement, while three of its neighbours (AD-1, AD-4,
AD-11) are `[GATED]` scripts.

**Proposed shape:** an AD, gateable by the same lint mechanism, naming the
complete set of permitted egress destinations (ledger RPC via `lib/xrpl`, the
Testnet faucet, the origin's own `releases.json`) and confining `fetch`/
`XMLHttpRequest`/`WebSocket` to named modules under `src/lib/`. Amend the
Deployment sentence to say "no server-side component the project operates", and
give the faucet and release-check rows in the Capability → Architecture Map,
which currently has neither.

## F-3 — AD-8 partitions by cause and the notices epic names a third cause — **high**

AD-8 is titled "Two declared error surfaces, chosen by cause": a failed *read*
renders inline through `QueryErrorState`; anything the user *did* reports
through `notify`. `in-app-notices.md` US-2's own criterion names a case that is
neither: "One notice area serves every notice, whether it is the result of
something the user just did **or something that arrived on its own**."

Things that arrive on their own, all from shipped stories:

- an incoming payment detected by the live subscription — `receiving-payments.md`
  US-3, "Notification shows amount, asset, and sender address", and
  `block-explorer-links.md` US-2 requires that notice to carry a `TxLink`;
- account activation detected — `account-onboarding.md` US-4, "the wallet
  detects activation ... and updates the UI";
- an update becoming available — `app-versioning-and-updates.md` US-2's
  "persistent, quiet marker", and US-6's bump-dependent prominence.

None is an error, and none was user-initiated. An agent reading AD-8 literally
can route an arrival either way — through `notify`, or as a new inline banner on
Balances — and only one of those satisfies notices US-1/US-2 (one area, never
overlapping the panel, same place on all six panels). The AD's exclusivity
language ("nothing reaches into the notice store directly") argues for `notify`,
but by cause the arrival case is simply unclassified.

**Proposed shape:** restate AD-8 as *surfaces chosen by cause, with three
causes* — failed read → inline; user action → `notify`; unsolicited event →
`notify` — and drop "error" from the heading, since a validated payment and an
available update are not errors.

## F-4 — AD-14 does not resolve to an answer for the paginated history read — **medium**

`transaction-history.md` US-1 is paginated by `account_tx` markers, built as
`useInfiniteQuery` (`src/hooks/useAccountTxHistory.ts`, `getNextPageParam:
(lastPage) => lastPage.marker`). AD-14 says: "When a read is in error, data
retained from an earlier success is not rendered."

On a failed page 3, pages 1 and 2 are not retained-and-possibly-stale — they
were fetched in this same query, succeeded, and are correct. Applying AD-14
literally blanks a correct list; applying its *intent* (don't present an unread
ledger as read, AD-15) argues for rendering the pages that succeeded with the
inline failure beside them. Both readings are defensible from the text, and they
produce visibly different screens. AD-15 has the same ambiguity: is a history
with two good pages and a failed third "empty", "loaded", or "partial"? Partial
success is the case the three error ADs were written without.

`GAP-REGISTER.md` G-10/G-11/G-12 are all single-read cases; none covers this.

**Proposed shape:** one sentence in AD-14 saying that pages already fetched
successfully in the same query are not "retained data", and that a failed page
renders the AD-8 inline surface at the end of the list rather than replacing it —
plus the AD-15 corollary that a list with a failed page never renders an
end-of-list "that is everything" claim.

## F-5 — Address Book: the home is unambiguous; its lifecycle is not — **low**

The Capability → Architecture Map has no Address Book row and the Structural
Seed does not name it, but the home is not actually in doubt: it is
`addressBook: { address, label }[]` in `src/store/app-store.ts:13`, persisted by
`partialize` under `xrpl-wallet-app-state` alongside `network` and
`activeWalletId` — i.e. exactly where AD-6 puts non-secret selection state. At
this altitude the missing row is documentary. The real absence is upstream:
`PRODUCT.md` lists "a local-only address book" in scope and
`docs/user-stories/INDEX.md` lists neither an epic nor an epic file for it, so
there is no acceptance criterion for the spine to answer to.

One decision is genuinely open and no AD picks it: the store's own comment says
"keeping every persisted byte in one store means teardown has a single owner" —
does the address book survive a lock, or a remove-all? Both answers are
defensible (losing labels is an annoyance; retaining a counterparty list on a
device that has just been handed over contradicts `PRODUCT.md`'s shared-device
assumption and guardrail #7's reasoning). Worth one sentence when an epic is
written.

One architectural edge to state whenever it is: an address recalled from the
book is still an address on the Send screen, so AD-13's fail-closed destination
check and AD-10's `AddressLink` apply to it unchanged — a stored label must
never stand in for a current `account_info` read.

---

## The operational dimension — **inadequate, in one specific place**

For most of what a client-only PWA needs, the single Deployment paragraph plus
the linked documents are enough, and the spine is right not to restate
`docs/sprints/cicd-sprints.md`. Update delivery is specified (the epic), rollback
is specified (US-8), endpoint failover has an owner and a test seam (AD-2,
AD-12), and `GAP-REGISTER.md` is honest about what is unverified.

What is missing is **cache behaviour as an invariant rather than a sprint note**.
This product's threat model, stated in `PRODUCT.md` § Positioning, is a
compromised or stale origin substituting signing code. Two rules defend it and
neither is in the build substrate:

- `/releases.json` must never be cached by the service worker — stated in
  US-2 ("It is never cached by the service worker"), enforced today only by
  `{ cache: 'no-store' }` at one call site.
- `index.html`, `sw.js` and `manifest.webmanifest` must not be edge-cached —
  recorded as CD-5 at `docs/sprints/cicd-sprints.md:51`, which notes that bunny
  follows origin `Cache-Control` and a storage-zone origin supplies none, so the
  rule survives only as explicit edge configuration verified against live
  response headers.

An edge rule is not in the repository, is not covered by any of the four gates,
and would fail silently: a stale `index.html` pins users to old signing code and
a cached `releases.json` makes "a newer version exists" unlearnable — defeating
the update epic without any test going red. AD-11 already owns the registration
path; the caching contract belongs beside it, at minimum as a named invariant
with a pointer to where the edge rules live and how they are verified.

Not findings, recorded so they are not re-raised: the spine carries no visual
requirements by design; `DESIGN.md` is authoritative for those and
`PRODUCT.md` § Accessibility is gated by `check:contrast`. Deferred XRPL
features, a second provider, i18n/RTL and offline write queueing are all named in
the Deferred section and need nothing here.

## Summary

| | Finding | Severity |
|---|---|---|
| F-1 | Lock path deletes the app shell; US-8 and US-9 forbid it, Structural Seed blesses it | critical |
| F-2 | No AD governs `fetch` egress; "only backend" claim refuted by faucet and `releases.json` | high |
| F-3 | AD-8's by-cause partition has no branch for an unsolicited event | high |
| F-4 | AD-14/AD-15 give no answer for a partially failed paginated read | medium |
| F-5 | Address Book has a home but no lifecycle decision, and no epic upstream | low |
| Op | Shell and release-manifest cache rules live only in a sprint record | high |
