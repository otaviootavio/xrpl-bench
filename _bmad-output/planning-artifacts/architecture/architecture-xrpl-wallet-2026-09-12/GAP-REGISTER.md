# Gap Register — where the code and the spine disagree

First written 2026-09-12 from a read of `src/`, when nothing had been changed.
**Re-verified 2026-09-15: all nine original entries are closed.** They are kept
below in one line each, because the record of what was found is the load-bearing
part; the detail is in the commits.

Open gaps are **G-10 through G-27**, all added on 2026-09-15 and all verified
against `src/` rather than inferred: G-13 to G-15 by the reconcile pass, G-16 to
G-18 by the reviewer gate, and **G-19 to G-27 promoted from the deferred-work
ledger** during the epic amendment the same day — of which **G-26 was
subsequently refuted** and is retained struck, not open. The ledger entries were already
evidenced — each carried a severity, a file and a named fix — but they were
unnumbered prose, so no coverage map could be checked against them. Numbering
them is what lets the epic file, this register and the ledger agree.

Four of them exist because an `AD` is deliberately stricter than the shipped
code — AD-13/G-10, AD-9/G-16 and G-17, AD-6/G-18, AD-16/G-13 and G-14. That is
the spine working as intended, and it is also the work queue.

Applying any of these is a separate piece of work, on a branch off `dev`, with
`bun run lint`, `bun run build`, `bun run test` and `bun run check:contrast`
re-run before it merges.

---

## Closed

Verified against `src/` on 2026-09-15, not taken from the commit messages.

| | Gap | Closed by | Evidence |
|---|---|---|---|
| G-1 | Query keys typed by hand in 17 places, nothing checking a read key against its invalidation key | `2eba44c` | `lib/xrpl/query-keys.ts` owns every key; zero key literals remain in `src/` |
| G-2 | Screens turned seeds into signers outside `lib/crypto` | `10e1d70` | No `Wallet.fromSeed` outside the boundary; only the AD-2-exempt offline validators are imported at page level |
| G-3 | `lib` modules reached upward into `store` and `components` | `3ca0917`, `b359058` | `lib/notify.tsx` → `store/notice-store` is the only remaining edge, which AD-1 names as permitted |
| G-4 | The two-endpoint failover could not be tested | `10e1d70` | `setXrplClientFactory` plus a reset in `lib/xrpl/client.ts` |
| G-5 | Failed reads never reached any surface | `b359058` | `QueryErrorState` renders them inline; `notify` gained the `dismiss` that `useAppUpdate` was reaching past it for |
| G-6 | Drops arithmetic outside `money.ts` | `3ca0917` | Zero `BigInt` arithmetic in `hooks/`, `pages/` or `components/` |
| G-7 | A hand-rolled explorer anchor in `AddressDisplay` | `3ca0917` | Gone; the shared components are the only path |
| G-8 | Two service-worker registration paths | `3ca0917` | `lib/sw-register.ts` is the sole importer of the virtual specifier |
| G-9 | `docs/decisions.md` §4 owed a sentence permitting the `vaultKey` handle | `3ca0917` | §4 now carries it in full — including the lazy-expiry nuance, which is more than was asked for |

**Five of these are now machine-enforced rather than merely closed.** AD-1, AD-4
and AD-11 have scripts inside `bun run lint` — `check-layering.mjs`,
`check-query-keys.mjs`, `check-sw-register.mjs` — and since Epic 10 (2026-10-04)
so do G-6 and G-7, through `check-money.mjs` (AD-7, BigInt in `hooks/`,
`pages/`, `components/`) and `check-explorer-links.mjs` (AD-10), so the same gap
cannot silently reopen. G-2, G-4, G-5 and G-9 are held by review only.

---

## G-10 — A guard can still be satisfied by a stale read `AD-13`

**Severity: money-loss path, narrower than the one already fixed.**

`pages/tabs/SendTab.tsx:68` computes `destCheckFailed = destQuery.isError &&
!destQuery.data`. The `&& !destQuery.data` half means the guard fails closed only
when there is *no* retained data. TanStack keeps `data` across a failed refetch,
so a destination checked successfully once, then re-checked unsuccessfully, still
satisfies `!destInfo?.requireDestTag` at `:155` using the earlier answer.

**Failure mode:** an address that newly sets `lsfRequireDestTag` between the first
read and the send. Narrow, and it requires a specific sequence — but the loss is
the same unrecoverable tagless payment that `b359058` set out to prevent.

**Why this is a gap and not a ratification:** AD-13 was deliberately written
stricter than the code. The alternative — accepting stale-but-successful reads,
on the grounds that the flag rarely changes — was considered and rejected,
because a blocked send is recoverable and a tagless send to an exchange is not.

**A third path, found on reconcile:** `useDestinationInfo` carries
`staleTime: 30_000`, so a cached answer satisfies the guard for thirty seconds
whether or not a refetch has failed. Any fix that only inspects error state
misses this one.

**Fix:** `destCheckFailed` widens to cover a failed refetch, a read whose input
no longer matches the address on screen, and a read outside its freshness
window. The existing `send-destination-error.test.tsx` is the place to pin it.

---

## G-11 — A failed reserve read makes two figures vanish silently `AD-8` `AD-14` `AD-15`

**Severity: silent absence, on the number the product exists to get right.**

`hooks/useServerReserves.ts` is consumed by `hooks/useSpendableBalance.ts:10`
and `pages/tabs/BalancesTab.tsx:37`, and neither checks `reserves.isError`. When
the reserve read fails, Spendable and Reserved do not render and nothing says
why — the screen simply has fewer numbers on it than before.

This is the same class as G-5: an unread value presented as an absent one. It
survived `b359058` because that pass covered `accountState` and `trustLines`,
and the reserve read is a third input feeding a derived figure rather than a
card of its own.

**Recorded as deferred in `b359058`'s own commit message.**

**Fix:** the derived figures report their own unavailability through
`QueryErrorState`, rather than the reserve failure being invisible.

---

## G-12 — A failed fee read becomes a fee of zero in the affordability guard `AD-13` `AD-8`

**Severity: money-loss path. Raised from "low" on 2026-09-15 during story
creation; the original entry described the reporting half and missed the guard.**

`pages/tabs/SendTab.tsx:53` takes `useRecommendedFee(network)` and never
inspects its error state. FR-18 requires the fee to be shown before the confirm
step; a failed fee read leaves that requirement quietly unmet.

**Recorded as deferred in `b359058`'s own commit message.**

**The guard, found on a read of `SendTab.tsx:89`:**

```
if (!amountPlusFeeFits(xrpToDropsString(amount), fee.data ?? '0', spendableDrops))
```

FR-16 requires the form to block "unless amount plus fee is within the Spendable
Balance". When the fee read fails, `fee.data` is `undefined` and that guard runs
against a **fabricated zero** — the permissive direction. This is AD-13's stated
failure, not a reporting gap: a guard on a money-moving action satisfied by a
read that did not succeed.

The consequence is named in the code's own comment at `:83` — the check exists so
a send fails "with a reason instead of costing a fee and coming back as
`tecUNFUNDED_PAYMENT`". A `tec` result is applied in a validated ledger and the
fee **is** taken (`:131`). So the failure mode is: fee read fails, guard passes
on zero, send is submitted, ledger rejects it for insufficient funds, and the
operator pays the fee for the privilege.

**Also** `:269` renders `'…'` and `:314` renders "a network fee of the current
rate", so a failed read is presented as a pending one and FR-18 goes silently
unmet.

**Fix:** the affordability check is not evaluated against a fee that was not
read, and the send blocks with the reason visible — AD-13 decides this, it is not
an open choice. The reporting half follows AD-8.

---

## G-13 — The persisted app store survives "remove everything" `AD-16`

**Severity: shared-device privacy residue. Guardrail #7's exact case.**

There are two IndexedDB owners and teardown clears one. `lib/crypto/db.ts` holds
the vault; `store/app-store.ts` persists under `xrpl-wallet-app-state` via
`idb-keyval`, carrying `wallets`, `addressBook`, `autoLockMinutes` and
`declinedUpdateVersions`. `tearDownAllLocalState` wipes the vault, the query
cache, Cache Storage and sockets — and never touches that key.

**Strongest path:** `pages/Unlock.tsx:74` `handleReset`, the hard-lock recovery
`wallet-security.md` says is the only way forward after eight failures, calls
teardown and reloads. Wallet labels and addresses survive, and so does the
Address Book — labelled counterparty addresses, on a device just handed over.
`SettingsTab.tsx:123` `handleFullReset` is milder: it empties `wallets` and
`activeWalletId` in state first, but `addressBook`, `autoLockMinutes` and
`declinedUpdateVersions` persist.

**The vault is genuinely wiped**, so no secret is exposed. The harm is the
privacy residue guardrail #7 names, in the one flow that promises everything
is gone. PRD FR-13's "removal tears down that Wallet's cached state" is
incomplete as stated.

**Fix:** teardown clears the persisted store as part of the account-data set,
per AD-16.

---

## G-14 — Locking deletes the app shell and protects nothing `AD-16` `AD-8`

**Severity: breaks offline operation; the privacy rationale is mistaken.**

`useClearCacheOnLock` fires `clearCachedAccountData` on every lock, which calls
`clearServiceWorkerCaches()` and deletes **every** Cache Storage key.

`vite.config.ts:129` configures `globPatterns` and **no `runtimeCaching`**, so
Cache Storage holds only the precached shell — never an RPC response. Account
data is in the TanStack Query cache, which `queryClient.clear()` already
handles. The hook's own docstring says locking "must not leave balances, trust
lines and history sitting warm in the caches"; those were never there.

**Consequences:** `app-versioning-and-updates.md` US-8 requires the previous
precache be retained and US-9 requires the app to open offline. PRD FR-52 says
the installed shell renders offline. A lock breaks all three, and buys nothing.

**Fix:** the lock path clears account data only. The shell is AD-16's other set.

---

## G-15 — An absent `delivered_amount` renders unlabelled `AD-15` `AD-2`

**Severity: money display, narrow.**

`lib/xrpl/reads.ts` tests `delivered === 'unavailable'` to set
`amountIsUpperBound`. When `delivered_amount` is *absent* rather than the
literal string, the expression falls through to `tx.DeliverMax ?? tx.Amount`
and the flag stays unset — so a requested figure renders as though it were
delivered, which PRD FR-57 forbids.

**Also:** `fetchTx` is exported and currently uncalled, and does not apply the
FR-57 normalisation at all. A future caller inherits the gap.

**Fix:** treat absent and `'unavailable'` identically — anything that is not a
positive `delivered_amount` makes the displayed figure an upper bound.

**Rule attribution corrected 2026-09-15.** This was filed under AD-2 alone
because the defect lives in `lib/xrpl/reads.ts`, inside the ledger boundary. But
the *rule it breaks* is AD-15: a figure that is not positively known is being
rendered as though it were, which is "a claim, not a default" applied to a
number rather than to a collection. AD-2 is retained because the fix is confined
to the boundary module.

---

## G-16 — The write choke point cannot be reached by a new transaction type `AD-9` — **CLOSED**

**Closed 2026-10-04 by Epic 7 (story 7.1):** `submitAndClassify` is exported and typed on
`SubmittableTransaction`; `writes.test.ts` submits an `AccountSet` through it and asserts the
in-flight signal. The text below is the gap as filed.

**Severity: the rule is unobeyable as written, which is worse than unenforced.**

`lib/xrpl/writes.ts:51` declares `async function submitAndClassify(...)` — **not
exported** — typed `tx: Payment | TrustSet`. AD-9 requires every transaction
submission to pass through it.

An Escrow, Check, Payment Channel, `AccountSet` or multi-sign feature therefore
cannot obey AD-9 without editing `writes.ts` itself, and the type would reject
its transaction even then. Every one of those is in the spine's Deferred list, so
this is the first thing the next XRPL feature hits.

**Fix:** export it and type the parameter on `SubmittableTransaction`. The
narrower type is doing no safety work — the two callers already pass concrete
`Payment` and `TrustSet` objects.

---

## G-17 — The in-flight signal is a boolean and two writes can overlap `AD-9` — **CLOSED**

**Closed 2026-10-04 by Epic 7 (story 7.2):** the choke point holds a depth and reports only the
0→1 and 1→0 transitions; the store's boolean now means "depth above zero". `writes.test.ts`
pins two overlapping writes (validated, thrown, expired). The text below is the gap as filed.

**Severity: an update can activate mid-transaction — AD-9's stated failure.**

`writes.ts:58` calls `reportTxInFlight(true)` and clears it in `finally` at `:88`.
`store/app-store.ts:31` holds `txInFlight: boolean`, set by `:76`.

Two overlapping submissions — a send started while a trust-line change is still
awaiting validation, or a future bulk operation — mean the first to settle clears
the flag while the second is still live. `hooks/useAppUpdate.ts:133` reads that
flag as its sole interlock, so a waiting service worker can activate with a
transaction in flight. That is precisely what AD-9 exists to prevent, and
`app-versioning-and-updates.md` US-5 depends on the signal being accurate.

Nothing in the UI currently prevents two concurrent submissions from different
tabs of the same app.

**Fix:** the choke point holds a depth rather than a boolean; in-flight means
depth above zero. `finally` decrements.

---

## G-18 — An Address Book entry has no destination tag `AD-6` — **CLOSED**

**Closed 2026-10-04 by Epic 9 (stories 9.1, 9.2)** (`spec-epic-9-address-tags.md`).
An entry is `{ address, destinationTag?, label? }`, with the tag held as canonical
decimal text. Identity is `sameCounterparty` / `counterpartyKey` in
`store/address-book.ts`. FR-21's test in `SendTab` is decided on the pair, and a
send writes the pair it signed with no fabricated label. Settings keys rows by
the pair. Old entries are read as tagless by a merge-time migration, which
keeps the persisted version at 0 so that a rollback cannot wipe the slice.
**Not closed by this:** the "picker fills both fields or neither" half of the
fix has nothing to apply to, because no picker exists. The Address Book is
also not scoped to a network; see `deferred-work.md`, epic 9.

**Severity: money-loss path, and it needs no new feature to occur.**

`store/app-store.ts:13` types an entry `{ address: string; label: string }`, and
`addAddressBookEntry` at `:73` dedupes on `address` alone. AD-6 requires an
entry's identity to be the (address, destination tag) pair, so the spine is
deliberately stricter than the code here, as it is at AD-13/G-10.

**Failure mode:** an exchange deposit address is one address with a different
required tag per customer. A book keyed on address alone can hold only one of
them, and a picker that fills the address without its tag produces exactly the
unrecoverable tagless payment FR-19 and AD-13 exist to prevent.

**Also:** FR-21's "you haven't sent here before" test resolves against this book,
so identity decides when the warning fires.

**Sharpened 2026-09-15 by a read of `src/`, during the epic breakdown.** The
"picker" above is conditional — **no Address Book picker exists.** The book has
three call sites and two of them make this a *live* defect rather than a latent
one: `SendTab.tsx:127` writes an entry silently on every send, labelled with a
truncated address and dropping the destination tag it was just given; and
`SendTab.tsx:75` — `addressBook.some((e) => e.address === destination)` — **is**
FR-21's test. Sending to one exchange address with customer A's tag, then the
same address with customer B's tag, reads as already-known and suppresses the
warning. Second send, no new feature, no picker.

**Contract gap — but only over half of it. Split 2026-09-15.** PRD §4.11 records
that FR-21 and FR-45 have no authoritative acceptance criterion anywhere, and
`user-stories/INDEX.md` lists no Address Book epic. That gap covers the
**user-facing list** at `SettingsTab.tsx:219` — whether entries are
user-created, labels editable, entries removable.

It does **not** cover this gap. The (address, destination tag) identity is
AD-6, already adopted, and `SendTab.tsx:75` reads the same array as FR-21's
test. Changing the entry type and the identity function implements a rule that
has already passed and needs no product decision — so G-18 is **not blocked**.
The list as a feature is deferred separately in `epics.md`, owner Otavio,
revisit before first Mainnet funding.

**Fix:** the entry carries an optional destination tag, identity is a named
function on the pair, and a picker fills both fields or neither.

---

## Promoted from the deferred-work ledger — G-19 … G-27

Added 2026-09-15. Each was recorded in
`_bmad-output/implementation-artifacts/deferred-work.md` with a severity, a
verified location and a named fix, and each is restated here unchanged in
substance. Three further ledger entries are **stale** — the Epic 2, Epic 3 and
Epic 4 "split at the build scope gate" entries shipped in `10e1d70`, `b359058`
and `3ca0917` — and three more were already promoted as G-11, G-12 and G-17.

### G-19 — The query-key guard cannot see a key bound to a variable `AD-4` — **CLOSED, with a recorded limit**

**Closed 2026-10-04 by Epic 10 story 10.1** (`spec-epic-10-guards.md`). The
guard now follows an identifier bound to an array literal — `const`/`let`/`var`,
plain reassignment, or a parameter default — to a key position in the same
file, including the `{ queryKey }` shorthand, and reports it at the use line.
The check stays a `node:` script: oxlint 1.80 does offer user rules through
`jsPlugins`, but marks them alpha and outside semver.

**Residual limit, stated rather than silent** (also in the guard's docstring):
a key literal built in one module and used in another, a key returned from a
function — including `useMemo(() => [...], deps)`, the likeliest shape in a
hook — a wrapped literal (`Object.freeze([...])`, `([...])`), and a key composed
from a non-literal are not seen. Bindings are
matched by name per file, not per scope, which over-approximates and fails
closed.

The original entry, unchanged:

**Severity: enforcement hole, no live defect.**

`scripts/check-query-keys.mjs` scans for key literals at the call site. A key
assigned first — `const k = ['accountState', n, a]`, then
`invalidateQueries({ queryKey: k })` — is not flagged. Confirmed against a
fixture tree.

**Fix:** dataflow analysis, which a dependency-free `node:` script should not
attempt. Settled properly by moving the check into a real lint rule with an AST.

### G-20 — The four invalidation sites invalidate different subsets `AD-4` `AD-6`

**Severity: the staleness Epic 1 existed to prevent, one layer up.**

`useAccountLiveUpdates` invalidates all four account-scoped keys, `SendTab`
three (no `incomingPaymentWatch`), `TrustLinesTab` two, `BalancesTab` one.
Nothing checks the subsets against one another. **Pre-existing** — the subsets
differed before the factory too, so Epic 1 did not cause this.

**Fix:** a named `queryKeys.accountScoped(network, address)` group returning the
set, so a missing member is visible rather than inferred.

### G-21 — `docs/agents/ledger-io.md:12` contradicts the factory `AD-4`

**Severity: agent-context drift. Not a build story — see the routing note below.**

The line still instructs agents to put the active wallet and network into every
query key by hand, with no mention of `lib/xrpl/query-keys.ts` or the lint gate.
Verified present and now behind the code.

**Fix:** owned by `bmad-project-context`, not by a story here.

### G-22 — Failover discards clients without disconnecting them `AD-2` `AD-12`

**Severity: socket leak.**

Clients discarded during endpoint failover are never disconnected, and a connect
abandoned at the 10-second timeout can still open a socket nobody owns.
Pre-existing; Epic 2 added a `clearTimeout` for the timer but no socket cleanup.

**Fix:** disconnect the loser in the `catch` and on cache-miss replacement.

### G-23 — `getXrplClient` has no in-flight deduplication `AD-2`

**Severity: connection storm at mount.**

Several queries firing at mount each construct and connect their own `Client`,
and every loser is dropped from the map still connected. Compounds G-22.

**Fix:** cache the in-flight connect promise per network.

### G-24 — The two seed-import paths disagree `AD-3`

**Severity: user-visible flow inconsistency, on the key-material path.**

`Onboarding` gates the vault write on the disabled-master-key warning;
`SettingsTab` writes to the vault first and warns afterwards. The two also
surface a malformed seed differently, and **neither trims the input**, so a
pasted trailing newline reads as malformed. Independently reported by the
implementer as an unmet acceptance criterion.

**Fix:** the settings path gates the write as onboarding does, both trim, and
both report a malformed seed identically. This is a user-visible flow change and
needs its own story.

### G-25 — `AGENTS.md` states the secrets rule absolutely `AD-5`

**Severity: the failure the §4 exception was written to prevent. Not a build
story — see the routing note below.**

`AGENTS.md` says "no secret ever enters localStorage, React state, a store, the
URL, or anything serializable" without qualification, while `docs/decisions.md`
§4 now carries the narrow exception permitting a non-extractable `CryptoKey`
handle and says by name "Do not 'fix' `vaultKey` by removing it."

`AGENTS.md` is loaded first via `CLAUDE.md`. An agent reading in order therefore
deletes the `vaultKey` code the exception exists to protect.

**Fix:** per the repo's own rule, `AGENTS.md` gains a pointer to §4, never a
restatement of it. Owned by `bmad-project-context`.

### G-26 — The waiting-update flag never returns to false `AD-8` — **REFUTED**

**Status: not a gap on the evidence. Struck 2026-09-15 by a failure trace during
the round-two epic breakdown. Kept here rather than deleted, because the reason
it fails is the useful part.**

The ledger's two factual claims both hold. `lib/sw-register-core.ts:63` sets
`waiting = true` in `onNeedRefresh` and nothing anywhere sets it false.

What does **not** hold is the consequence. After a failed `applyUpdate` a worker
genuinely is still waiting, so a prompt that keeps showing is stating a true
fact, not a stale one. The control is not stranded either: `useAppUpdate.ts:138`
already calls `setApplying(false)` in its `catch`, with a comment saying the
control "becomes available again rather than pretending it worked".

**The proposed fix would have introduced a defect.** `setWaiting(false)` on
activation failure makes the app claim no update is waiting while one is — AD-15
("an empty state is a claim, not a default") applied to a flag and inverted. A
round written to stop the wallet asserting things it has not established would
have shipped exactly that.

**What remains, if anything:** whether any path *should* clear `waiting` — a
worker becoming redundant, or a registration replaced. Neither is evidenced
today. Verify before scheduling; do not schedule on the ledger entry alone.

### G-27 — Nothing stops the Epic 4 fixes from reappearing `AD-7` `AD-10` — **CLOSED**

**Closed 2026-10-04 by Epic 10 story 10.2** (`spec-epic-10-guards.md`).
`scripts/check-money.mjs` fails `lint` on a `BigInt(` call, a `BigInt.` static
or a bigint literal in `src/hooks`, `src/pages` or `src/components`;
`scripts/check-explorer-links.mjs` fails it on an explorer host outside
`lib/xrpl/networks.ts` and `components/wallet/AddressLink.tsx`, or on the URL
builder referenced outside them in shipped source. Each has a one-line
directive and a fixture test. **Not covered:** `src/lib` and `src/store` for
AD-7, and the `Number()`/`parseFloat`/`toFixed` half of AD-7 anywhere; an
explorer host assembled from fragments for AD-10.

The original entry, unchanged:

**Severity: decay, identical to what G-1 suffered.**

No lint gate stops BigInt arithmetic reappearing outside `money.ts`, or a
hand-rolled explorer anchor returning outside `AddressLink`/`TxLink`. Both Epic
4 acceptance criteria are grep-shaped and hold today; nothing holds them
tomorrow.

**Fix:** two more guard scripts in the `check-query-keys.mjs` idiom.

---

## Routing note — G-21 and G-25 are not build stories

Both edit agent-context files, and that is exactly why the ledger deferred them
in the first place: "the fix edits an agent-context file, which this workflow
routes away from a build story." Filing them as stories would recreate the
condition that deferred them.

They are owned by **`bmad-project-context`**, which owns the `AGENTS.md` managed
block. G-25 is the most dangerous single item in this register and should not
wait on an epic it cannot be part of.

---

## Not gaps — recorded so they are not re-raised

Carried forward from 2026-09-12 and still true, plus two added on re-verification.

- **`hooks/useAccountLiveUpdates.ts`** subscribes to a live socket inside a
  `useEffect` and calls `getXrplClient` from outside the boundary. It is a push
  stream, not a read; AD-2 names it as the one permitted exception.
- **No `runtimeCaching` in the service worker at all.** Stronger than §4's
  network-first rule, not weaker.
- **The unlock ceremony** unwraps and checks the AES-GCM tag rather than
  deriving and trusting, and rebuilds vault metadata from scratch rather than
  spreading the previous record. Both halves of that defect class are fixed.
- **Seed handling uses refs throughout.** No seed is in React state anywhere.
- **`prefers-reduced-motion`** is guarded on every animated element, and
  `components/ui/skeleton.tsx` records the policy that animation exists nowhere
  else. PRD NFR-10 holds. *(Added 2026-09-15.)*
- **No array index is used as a React key** anywhere in `src/`. PRD NFR-11
  holds. *(Added 2026-09-15.)*
