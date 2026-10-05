# Adversarial review — ARCHITECTURE-SPINE.md

**Lens:** construct two units one level down that each obey every AD *to the
letter* and still build incompatibly. Every pair below is a hole; each closes
with a new or tightened AD.

**Method note.** A finding only counts if **both** units can quote the clause
that licenses them. Where a unit merely violates an AD, that is a bug, not a
hole in the spine, and it is not reported here. Findings adjacent to open gaps
(G-10, G-11, G-13) cite them as *evidence the ambiguity is already real*, and
stay about two future units diverging.

Grounded against `src/` on 2026-09-15. Twelve holes.

| # | Hole | Severity |
|---|---|---|
| H-1 | Persisted store has one key, no schema owner, no version | High |
| H-2 | Two owners of the Address Book, two identities for an entry | Critical |
| H-3 | AD-9's choke point is unreachable and wrongly scoped | Critical |
| H-4 | The in-flight flag is a boolean with concurrent writers | Critical |
| H-5 | A new AD-4 key is invalidated by nobody | High |
| H-6 | AD-8's three surfaces are not exhaustive | Medium |
| H-7 | AD-16 binds only Cache Storage; the partition is not exhaustive | High |
| H-8 | AD-13 defines neither "money-moving" nor "guard" | Critical |
| H-9 | AD-2's egress clause is unenforceable and un-gated | High |
| H-10 | No owner of the session-activity signal | High |
| H-11 | A derived value has no error channel | High |
| H-12 | Two identities for one wallet: `id` and `address` | High |

---

## H-1 — Two features extend one persisted key with no schema owner

**Severity: High** (privacy residue and silent state loss).

### The two units

**Unit A — `pages/tabs/EscrowTab.tsx` + a draft.** Escrow creation takes a
destination, an amount and a `FinishAfter` date. The author persists a
half-filled draft so a lock does not lose it:

```ts
// src/store/app-store.ts
escrowDrafts: { id: string; destination: string; amountDrops: string; finishAfter: number }[]
// partialize:
escrowDrafts: s.escrowDrafts,
```

**Unit B — `hooks/useFiatPrice.ts` + a preference.** A fiat display needs the
chosen currency and a cached rate:

```ts
fiatCurrency: 'USD' | 'EUR' | 'BRL'
fiatRate: { value: string; fetchedAt: number } | null
// partialize:
fiatCurrency: s.fiatCurrency,
fiatRate: s.fiatRate,
```

### Why both are compliant

AD-6's rule is exhausted by its own sentence: "`src/store/app-store.ts` holds
`network` and `activeWalletId` and nothing duplicates them into component
state." Neither unit duplicates either field. AD-1 holds — the store imports
nothing upward. The Consistency Conventions table says nothing about persisted
shape. Both authors did the locally correct thing: one store, one key, as the
existing comment in `app-store.ts` explicitly instructs ("keeping every
persisted byte in one store means teardown has a single place to clear").

### The incompatibility

`persist` is configured with `name: 'xrpl-wallet-app-state'` and **no `version`
and no `migrate`**. The two features ship in different releases. A user who
installed between them rehydrates a blob containing `escrowDrafts` but not
`fiatCurrency`; zustand merges shallowly over the initializer, so Unit B's
defaults survive — but Unit A's author, writing after Unit B, reasonably assumes
`fiatRate` exists and reads `s.fiatRate.value`. There is no owner of the
persisted schema, no declared migration policy, and nothing that fails a build
when a persisted field's shape changes. Because AD-4's `[GATED]` and AD-1's
`[GATED]` scripts both exist, an author reasonably infers that an unpoliced
concern is an unconstrained one.

The second half is worse and is the reason Unit B's author will not put the
preference here at all once they read AD-16: AD-16 declares "the persisted app
store" to be **account data**, wiped by any teardown claiming to remove it. A
fiat *preference* is not account data. The rational compliant move is a second
persist target:

```ts
// src/store/prefs-store.ts — a second zustand persist, key 'xrpl-wallet-prefs'
```

which is compliant with every AD as written — and is a second persistence owner
that `lib/teardown.ts` does not know about. That is G-13 reopening under a
different key, by an author who followed the rules.

### The AD that closes it

**Tighten AD-6, or add AD-17 — One persisted store, one schema, one version.**

- `src/store/app-store.ts` is the **only** module that may call zustand
  `persist`, and `xrpl-wallet-app-state` the only key it writes. A second
  persist target is a violation.
- The store carries `version` and a `migrate`; a change to any persisted field's
  shape bumps it in the same change.
- Every field listed in `partialize` declares, in a comment on its declaration,
  which AD-16 set it belongs to. A field with no declared set fails review.
- Make it `[GATED]`: extend `check-layering.mjs` (or a sibling) to reject
  `persist(` and `createJSONStorage(` outside `app-store.ts`.

---

## H-2 — Two owners of the Address Book, and two identities for an entry

**Severity: Critical** (wrong-destination path; the loss class AD-13 exists for).

The store holds `addressBook: { address: string; label: string }[]` and one
action:

```ts
addAddressBookEntry: (address, label) =>
  set((s) => ({ addressBook: [...s.addressBook.filter((e) => e.address !== address), { address, label }] })),
```

Identity is the `address` string, and only that.

### The two units

**Unit A — `pages/tabs/ContactsTab.tsx`, a managed second view.** Add, rename,
delete, and — because exchanges are the common counterparty — store the
destination tag alongside:

```ts
// widened entry
addressBook: { address: string; label: string; destinationTag?: number }[]
renameAddressBookEntry: (address, label) => ...
removeAddressBookEntry: (address) => ...
```

Unit A stores the classic address plus the tag as separate fields, and allows
two entries for one exchange address under different tags ("Kraken main",
"Kraken sub") by widening the dedupe key to `address + tag`.

**Unit B — `components/wallet/AddressBookPicker.tsx`, used by SendTab.** A
picker, plus a convenience: after a validated send, remember where it went.

```ts
// in SendTab's success path
addAddressBookEntry(destination, labelInput || shortenAddress(destination))
```

Unit B accepts an X-address in the destination field (the ledger's own way of
carrying a tag inside the address) and stores that string verbatim, because
`isValidXAddress` is an AD-2-exempt offline validator and the field already
accepts it.

### Why both are compliant

The Address Book is not a ledger read (AD-2, AD-4 silent), carries no money
(AD-7 silent), is not a write (AD-9 silent), is not a key (AD-3 silent), and is
not a duplicate of `network` or `activeWalletId` (AD-6 satisfied). AD-10 binds
only how an address *renders*. No AD in the spine mentions the Address Book at
all; the Capability map routes FR-13..FR-15 to `store/app-store.ts` and stops
there. Both units wrote to the store the store invited them to write to.

### The incompatibility

Three distinct clashes, all from one missing owner:

1. **Identity.** Unit A dedupes on `(address, tag)`; Unit B's
   `addAddressBookEntry` dedupes on `address` and *replaces* — so a single send
   to "Kraken main" silently deletes "Kraken sub" and both of Unit A's rows
   collapse into one with Unit B's auto-generated label.
2. **Address encoding.** Unit A stores classic + `destinationTag`; Unit B stores
   an X-address. Unit A's picker reads `entry.destinationTag`, finds
   `undefined` on a Unit-B row, and fills the Send form with an X-address in a
   classic field — or, in the variant where Unit A decodes for display, fills
   the classic address **and drops the tag**. That is an unrecoverable payment
   to an exchange, which is exactly the loss AD-13 and `b359058` were written to
   prevent, arriving through a door AD-13 does not watch.
3. **Network scope.** Nothing in AD-6 or AD-4 scopes the Address Book to a
   network. A Testnet `r...` address appears in the Mainnet picker and vice
   versa. Unit A's author scopes new entries by adding `network` to the row;
   Unit B's does not. Rows written by one are invisible or mis-scoped to the
   other.

Note that AD-4's factory has the exact rule this needs ("a read scoped to an
account takes the active wallet and the active network") — it just does not
reach non-query state.

### The AD that closes it

**Add AD-18 — The Address Book has one owner and one identity.**

- A single module, `src/lib/address-book.ts`, owns entry normalisation, the
  identity function, and dedupe. The store holds the array and nothing else;
  screens never construct or compare an entry themselves.
- An entry's identity is `(network, classic address, destinationTag | null)`.
  Every address is stored in **classic form with an explicit tag field**; an
  X-address is decoded on entry and never persisted as-is, so a tag can never be
  silently lost in translation between two renderings.
- No feature writes an Address Book entry as a side effect of another action. A
  "remember this destination" is an explicit user act with its own confirm, or
  it does not happen.
- The picker's contract: selecting an entry fills **both** the address and the
  tag, or the selection is refused. A partially applied entry is a violation.

---

## H-3 — AD-9's choke point is unreachable from outside `writes.ts`, and its
Binds line contradicts its Rule line

**Severity: Critical** (the defect AD-9 names, arriving by a compliant route).

AD-9 as written:

> **Binds:** payments, trust-line changes
> **Rule:** Every transaction submission goes through `submitAndClassify` in
> `src/lib/xrpl/writes.ts`.

And in `src/lib/xrpl/writes.ts`:

```ts
async function submitAndClassify(network: NetworkId, wallet: Wallet, tx: Payment | TrustSet): Promise<SubmitOutcome>
```

No `export`. Union typed to two transaction types.

### The two units

**Unit A — `lib/xrpl/escrow.ts`.** `EscrowCreate` / `EscrowFinish` /
`EscrowCancel`. The author reads AD-9's Rule, tries to import
`submitAndClassify`, finds it is not exported and would not typecheck, reads
AD-9's **Binds** line — "payments, trust-line changes" — concludes Escrow is
out of scope, and writes the obviously-correct local equivalent inside the
sealed boundary, which AD-2 explicitly permits ("Only modules under
`src/lib/xrpl/` may import a `Client` from `xrpl` or call `getXrplClient`"):

```ts
// src/lib/xrpl/escrow.ts
let reportEscrowInFlight: (b: boolean) => void = () => {}
export function setEscrowInFlightReporter(r) { reportEscrowInFlight = r }

async function submitEscrow(network, wallet, tx: EscrowCreate | EscrowFinish) {
  reportEscrowInFlight(true)
  try { /* autofill, sign, submitAndWait, classify */ }
  finally { reportEscrowInFlight(false) }
}
```

**Unit B — `lib/xrpl/multisign.ts`.** Multi-signing genuinely cannot pass the
existing choke point even if it were exported: there is no single
`wallet.sign(prepared)`. Signatures are collected from N signers across
sessions, combined with `multisign()`, and submitted as one blob. The in-flight
window spans a user leaving and returning. The author writes a second submit
path for structural reasons, inside `lib/xrpl/`, and cites AD-2.

### Why both are compliant

Unit A stands on AD-9's Binds line, which is narrower than its Rule line —
a spine that contradicts itself licenses whichever half suits. Unit B stands on
the fact that AD-9's Rule is *impossible* for it: an AD that mandates routing
through a symbol that is neither exported nor typed to accept your transaction
cannot be obeyed. Both obey AD-2 (inside the boundary), AD-1, AD-7 (arithmetic
in `money.ts`), AD-12 (they use the seam), and AD-4 (invalidation via the
factory).

### The incompatibility

Three submit paths, three module-level reporters, three classification tables.
`app-versioning-and-updates.md` US-5 / PRD FR-48 need one truthful "is anything
in flight" signal; `App.tsx` installs a reporter into `writes.ts` only, so
`txInFlight` stays `false` for the whole of an escrow or a multi-sig submit and
the update flow can activate a waiting service worker mid-transaction. That is
verbatim what AD-9's Prevents line names. Meanwhile `result-codes.ts`
classification diverges: Unit A hand-rolls `classify`, which is currently
private to `writes.ts` too, so `tecNO_PERMISSION` on an `EscrowFinish` reaches
a screen through a second table that may not agree with the first — violating
the Conventions row "a raw `tec`/`tef` string never reaches a screen
unclassified" by an accident of duplication.

### The AD that closes it

**Tighten AD-9 — scope and signature.**

- **Binds** becomes: *every* transaction submission of *every* `TransactionType`,
  present and deferred. Delete the two-item list; it is the source of the
  contradiction.
- `submitAndClassify` is **exported** and typed on `SubmittableTransaction` (the
  xrpl.js union), not `Payment | TrustSet`. An AD may not mandate an unreachable
  symbol; make the mandate satisfiable in the same change that states it.
- Sign-and-submit are separated so a transaction whose signing is not a single
  local act — multi-sign, a regular-key signer — still passes the same
  classification and the same flag: `beginWrite()` / `submitSigned()` /
  `endWrite()` on one module, with the in-flight window owned there regardless
  of how the blob was signed.
- Make it `[GATED]`: a `check-writes.mjs` beside the three existing scripts,
  rejecting `submitAndWait` / `.sign(` outside `lib/xrpl/writes.ts`.

---

## H-4 — The in-flight flag is a boolean and two compliant writes race it

**Severity: Critical** (same consequence as H-3, reachable today, one feature away).

Distinct from H-3: H-3 is about *scope and signature*, this is about
*concurrency*. Both units here route correctly through the choke point.

### The two units

**Unit A — `pages/tabs/TrustLinesTab.tsx`, "Set NoRipple on all lines".** A
bulk action over three existing trust lines:

```ts
await Promise.all(lines.map((l) =>
  submitTrustSet(network, wallet, { currency: l.currency, issuer: l.issuer, limit: l.limit })))
```

**Unit B — `hooks/useAppUpdate.ts`**, the reader, unchanged: it consults
`txInFlight` to decide whether a waiting service worker may be activated.

### Why both are compliant

Unit A submits only through `submitTrustSet`, which is the public face of
`submitAndClassify`. AD-9 is satisfied literally and in spirit. Unit B reads the
flag AD-9 promises is accurate. Nothing in AD-9 says a write is exclusive, and
nothing says two may not overlap — and `store/app-store.ts`'s own comment
asserts the flag is "true for the exact window a payment or trust-line
transaction is signing, submitted, or awaiting validation."

### The incompatibility

```ts
reportTxInFlight(true)
try { ... } finally { reportTxInFlight(false) }
```

`setTxInFlight` is a plain boolean setter. With three concurrent submissions,
the **first** `finally` to run sets `txInFlight = false` while the other two are
still awaiting validation. Unit B then reads `false` and activates a new service
worker mid-transaction. AD-9's Prevents line —"a write that forgets to raise
`txInFlight`, which would let an app update activate mid-transaction" — is
satisfied (nobody forgot), and the outcome it forbids happens anyway.

The same race arrives without a bulk feature: a send submitted from SendTab
while a trust line is still awaiting validation in TrustLinesTab. Radix keeps
the write alive across a tab switch — which is *why* the flag was put in the
store in the first place.

### The AD that closes it

**Tighten AD-9 — the flag is a depth, not a boolean.**

- The choke point holds a **counter**. `txInFlight` is `depth > 0`. The reporter
  becomes `begin()` / `end()`, or `(depth: number) => void`; a bare boolean
  setter is a violation because it cannot express overlap.
- The store exposes `beginWrite()` / `endWrite()` and no `setTxInFlight`, so
  there is no API through which a caller can assert "nothing is in flight".
- A test pins it: two overlapping submissions, the first resolving first, and
  `txInFlight` still true. Per the Conventions row, it must fail if the counter
  is reverted to a boolean.

---

## H-5 — A new AD-4 key is invalidated by nobody, and two units fix it
incompatibly

**Severity: High** (stale account data after a switch — AD-4's own Prevents line).

`hooks/useAccountLiveUpdates.ts` invalidates a **hardcoded list of four**:

```ts
queryClient.invalidateQueries({ queryKey: queryKeys.accountState(network, address) })
queryClient.invalidateQueries({ queryKey: queryKeys.trustLines(network, address) })
queryClient.invalidateQueries({ queryKey: queryKeys.accountTx(network, address) })
queryClient.invalidateQueries({ queryKey: queryKeys.incomingPaymentWatch(network, address) })
```

### The two units

**Unit A — `hooks/useEscrows.ts`.** Adds to the factory, correctly:

```ts
escrows: (network, address) => ['escrows', network, address] as const,
```

and registers it in `accountScoped`, which is exactly what AD-4 asks. It does
not touch `useAccountLiveUpdates`, because no AD says to. Result: an
`EscrowFinish` validating on the socket refreshes the balance and the history
and leaves the escrow list showing an escrow that no longer exists.

**Unit B — `hooks/useChecks.ts`.** The same author-facing situation, solved by
prefix invalidation, which the factory does not forbid:

```ts
queryClient.invalidateQueries({ queryKey: ['checks'] })   // rejected by the gate
queryClient.invalidateQueries({ queryKey: queryKeys.checks(network, address).slice(0, 1) })  // not rejected
```

The second spelling passes `check-query-keys.mjs` — the gate rejects key
*literals*, and `.slice(0, 1)` is not a literal. It invalidates every wallet's
and every network's Checks at once.

### Why both are compliant

AD-4's rule is entirely about *construction*: "Query keys are produced by a
single exported factory. No other module constructs a key literal, for a read
or for an invalidation." Both units construct through the factory. Nothing in
AD-4 says a key must be *registered for invalidation*, and nothing says an
invalidation must be exact rather than a prefix.

### The incompatibility

Unit A's data is stale after every ledger event; Unit B's is over-invalidated
across wallets and networks — refetching another wallet's Checks under the
active wallet's credentials is at best a privacy-adjacent extra request, at
worst a request storm on a 15-second poll. Two features, two invalidation
disciplines, one cache. AD-4 got the hard half (construction, gated) and left
the matching half (propagation) unowned.

A third face of the same hole: nothing invalidates or removes account-scoped
entries on a **wallet switch**. Today the address is in the key, so the old
wallet's data merely sits in memory; once a feature caches something
account-scoped that is *not* in the key — see H-12 — it is served across the
switch.

### The AD that closes it

**Tighten AD-4 — the factory owns invalidation scope too.**

- `accountScoped` is enumerable at runtime and `useAccountLiveUpdates`
  invalidates **by iterating it**, never by a hand-listed set. Adding a key to
  the factory then invalidates it by construction; the list cannot drift.
- Invalidation is by a full key from the factory. Deriving a partial key
  (`.slice`, spread, destructure) is a violation — extend
  `check-query-keys.mjs` to reject a `queryKey` argument that is not a direct
  `queryKeys.*(...)` call expression.
- A named factory function declares its invalidation class alongside its key —
  `accountScoped`, `networkScoped`, `deviceScoped` — so the exception stays
  visible at the definition, as AD-4 already requires for scope.

---

## H-6 — AD-8's three surfaces are not exhaustive: a failure with no place on
screen and no user behind it

**Severity: Medium** (a screen that is wrong without being in error).

AD-8's partition by cause: (1) a failed read of data that has a place on screen
→ `QueryErrorState`; (2) something the user did → `notify`; (3) something that
arrived on its own → `notify`.

### The two units

**Unit A — `hooks/useConnectionHealth.ts`.** AD-12 gives `lib/xrpl/client.ts` a
failover to a backup endpoint. Today nothing surfaces that it happened. The
author adds a hook that reports when the primary is down and the backup is
carrying traffic, and routes it to `notify.warning` — it is not a failed read
(the read succeeded, via the backup), it did not arrive on its own in the
US-2 sense, and the user did nothing.

**Unit B — `hooks/useAccountLiveUpdates.ts`, hardened.** The websocket
`subscribe` drops and cannot re-establish. The screen is now silently *not*
live: the balance on screen is the last successful poll, no read is in error, so
neither AD-14 nor AD-15 fires and `QueryErrorState` has nothing to render into.
The author reasons that AD-8 gives this no surface and renders nothing.

### Why both are compliant

AD-8's rule assigns a surface **by cause**, and both causes are none of the
three named. Unit A picks the only funnel AD-8 offers for a non-read
(`notify`); Unit B concludes the absence of a named surface means no surface.
Both readings are available from the same sentence.

### The incompatibility

Unit A's warning is `persistent: true` by construction (`notify.tsx`: errors and
warnings never auto-dismiss) and the underlying condition is *recurring* — a
flaky primary endpoint on a 15-second poll produces an unbounded stack of
undismissable band entries, one per failover. Unit B's silence produces the
condition AD-14 was written against — data that is not current, rendered as
though it were — reached without any query being in error, so AD-14's trigger
("when a read is in error") never fires. One feature over-reports the same class
of event that the other under-reports to zero, and the spine endorses both.

AD-14's Prevents line already imagines "a stale balance under a green 'Live'
lamp". Nothing in the spine says who owns the lamp.

### The AD that closes it

**Tighten AD-8 — name the fourth category, or close it explicitly.**

Either:

- **A fourth surface: ambient state.** Connection health, liveness, and
  degradation render in one owned component (an indicator adjacent to the data
  it qualifies), never through `notify`. It is a *state*, not an *event*: it has
  no dismissal and no timer, and it is not allowed to accumulate. Add the rule
  that `notify` is for **events** — a thing with an instant — and a condition
  that persists is never an event.

Or, if a fourth surface is unwanted:

- **State AD-8's partition is closed and say what the residue does.** A
  condition that is none of the three causes is not reported; instead the reads
  it affects must be made to *fail*, so AD-14 and AD-15 apply and the failure
  reaches the inline surface. Either way, decide it in the spine — the current
  text lets two features answer differently.

---

## H-7 — AD-16 binds "a new Cache Storage entry"; the partition is not
exhaustive and the media are not enumerated

**Severity: High** (G-13's exact class, re-openable by a compliant author).

AD-16's operative sentence:

> A module that persists anything is incomplete until its clear is registered
> here; **a new Cache Storage entry** must declare which of the two sets it
> belongs to.

The obligation to declare a set is bound to *Cache Storage*. Everything else —
IndexedDB, OPFS, `localStorage`, `sessionStorage` — falls under the vaguer "a
module that persists anything", with no set to declare and no registry to be
registered in. `lib/teardown.ts` has no registry; it hardcodes four calls.

### The two units

**Unit A — `lib/history-export.ts`, a CSV export.** A year of history is many
paged `account_tx` calls, so the author caches the assembled CSV in OPFS
(`navigator.storage.getDirectory()`) keyed by wallet and date range, and — since
the user asked for this file and expects it to be there — declares it survives
teardown, reasoning by analogy with AD-16's shell set ("survives every lock,
because it holds no account data to leak" is the shell's rationale; the author
inverts it into "the user asked for it, so it stays").

**Unit B — `lib/fiat-rate.ts`, an exchange-rate cache.** A rate with a TTL in
`localStorage`. Account-independent, non-secret, harmless either way. The author
declares it account data, because that is the set AD-16 makes the default for
anything under app control.

### Why both are compliant

AD-16 offers exactly two sets and binds the declaration requirement to Cache
Storage. Neither unit writes a Cache Storage entry, so neither is strictly
obliged to declare anything; both declare anyway, in good faith, and the two
sets do not fit what they have. AD-1 is satisfied, AD-3 is satisfied (no key
material), and nothing else in the spine touches storage.

### The incompatibility

Unit A parks **a full transaction history, per wallet, in plaintext, outside
every clear path** — on the device, surviving the hard-lock reset at
`pages/Unlock.tsx:74` that `wallet-security.md` presents as the only way forward
after eight failed attempts, and surviving `SettingsTab.tsx` `handleFullReset`.
That is G-13 (`wallets`, `addressBook`, `autoLockMinutes` surviving "remove
everything") reopening in a different medium, written by an author who read
AD-16 and followed it. Meanwhile Unit B's harmless rate is deleted on every
lock, so a locked-and-unlocked wallet re-fetches an exchange rate for no reason
— an outbound request, on a screen the privacy claim covers (see H-9).

The sets are also not exhaustive in principle. Three kinds exist, not two:
account data (must go), shell (must stay), and **device preference that is
neither** — a fiat currency choice, a preferred explorer, a chosen theme. AD-16
forces those into "account data" and wipes them, which is why H-1's Unit B
reaches for a second persist target.

### The AD that closes it

**Tighten AD-16 — every medium, three sets, one registry.**

- Binds **every** persistence medium by name: Cache Storage, IndexedDB (both the
  vault and the persisted store), OPFS, `localStorage`, `sessionStorage`, and
  any future one. Delete "a new Cache Storage entry" and say "a new persisted
  thing, in any medium".
- Three sets: **account data** (cleared by every teardown and every lock that
  claims to clear it), **shell** (never cleared by a lock), **device
  preference** (survives lock and wallet removal; cleared only by an explicit
  "reset this device" the user chooses, which names what it will delete per the
  Conventions row on irreversible actions).
- `lib/teardown.ts` holds an explicit **registry** — each persisted thing
  registers a `{ key, set, clear }` — and the teardown functions iterate it. A
  hardcoded list of clears is a violation, because it is the structure that
  cannot tell you what it is missing.
- Anything written *outside* app storage at the user's request (a downloaded
  file, a Share-target hand-off) is out of scope by name, so an author never has
  to guess whether the app is supposed to delete the user's own file.

---

## H-8 — AD-13 defines neither "a money-moving action" nor "a guard"

**Severity: Critical** (unrecoverable-send class, by two different compliant readings).

AD-13 binds "every guard on a money-moving action whose condition comes from a
ledger read". Neither term is defined anywhere in the spine.

### The two units

**Unit A — `pages/tabs/EscrowTab.tsx`, an `EscrowFinish` control.** The author
asks whether finishing an escrow is "money-moving". The funds move to a
destination that is not necessarily the actor; the actor pays only a fee. They
conclude it is not money-moving in AD-13's sense — AD-13's Prevents line is
entirely about *a tagless payment the sender makes* — and let the retained
`useEscrows` data drive the control across a failed refetch. The escrow's
`FinishAfter` has not arrived per the last good read; the button is live;
`tecNO_PERMISSION` and a consumed fee.

**Unit B — `pages/tabs/TrustLinesTab.tsx`, adding a line.** Opening a trust line
raises the owner reserve by 0.2 XRP. The guard on "do you have the reserve" is
`useServerReserves` + `useSpendableBalance`. G-11 records that neither consumer
checks `reserves.isError` today. The author reads AD-13, decides a `TrustSet`
moves no value and is therefore not money-moving, and leaves it. A user with
insufficient reserve gets `tecINSUFFICIENT_RESERVE` and a consumed fee — and,
worse, the same reasoning applied to the *send* screen's spendable figure would
enable a send the account cannot afford after reserve.

**And the second ambiguity — what is a guard.** A third unit implements its
guard *only* on the control, following the Conventions table:

> Unavailable controls: `aria-disabled` with the reason in visible text. Never
> hidden.

```tsx
<Button aria-disabled={destCheckFailed} onClick={handleSend}>Send</Button>
```

`aria-disabled` is advisory. It does not block activation: a click, an Enter
key, or a form submit runs `handleSend`, which contains no check. The unit is
literally compliant with AD-13 (a guard exists and fails closed) and with the
Conventions table (it is `aria-disabled`, not hidden), and is **factually
unguarded**.

### Why both are compliant

AD-13's binding clause is a phrase with no definition and a Prevents line that
describes exactly one scenario — a tagless payment. An author reasoning from the
stated scope excludes `TrustSet` and `EscrowFinish` honestly. And "a guard" is
nowhere located: the spine never says the check must be inside the submit path.
G-10 is the evidence this ambiguity is real *today* — `destCheckFailed` at
`SendTab.tsx:68` is the app's most carefully written guard, and it is still
satisfied by retained data.

### The incompatibility

Two features ship with opposite answers to "does AD-13 bind me", so the app has
guards that fail closed on one screen and guards that fail open on the next, for
the same class of condition. And across all of them, "guard" may mean a blocking
check or a visual hint, which is the difference between a refused send and an
unrecoverable one.

### The AD that closes it

**Tighten AD-13 — define both terms.**

- **Money-moving action** = *any transaction submission*. Every one consumes a
  fee, and many alter the reserve. There is no transaction type outside AD-13.
  Delete the judgement call.
- **A guard** is a check **inside the submit path**, evaluated immediately
  before the transaction is built. A disabled or `aria-disabled` control is a
  courtesy to the user and is never the guard; a control-only guard is a
  violation. Both may exist, and the submit-path one is the one that counts.
- The satisfying read is the Conventions table's pre-flight probe — a
  `queryClient.fetchQuery` on the AD-4 factory key of the equivalent hook,
  resolved for **the exact input being submitted**, inside the freshness window.
  Retained data, an errored refetch, and a cached answer for a previous input
  all fail the guard. (This also subsumes G-10's third path: a `staleTime`
  window is not freshness for a guard.)
- Per the Conventions row on pinning a rendering rule, each guard gets a test
  that activates the control *while `aria-disabled` is true* and asserts no
  submission occurs.

---

## H-9 — AD-2's egress clause is unenforceable, and two units place a new
egress on opposite sides of the boundary

**Severity: High** (the shipped privacy claim in `PRODUCT.md` breaks silently).

AD-2:

> Every other outbound request — today the Testnet Faucet (`lib/xrpl/faucet.ts`)
> and the same-origin Release Manifest (`lib/release-check.ts`) — lives in a
> named `lib` module whose purpose is that call. … The privacy claim in
> `PRODUCT.md` is a claim about this list, so the list has to be enumerable.

### The two units

**Unit A — `lib/fiat-rate.ts`.** One module, one purpose, one `fetch` to a price
API. Textbook compliance with the clause. It also sends the user's IP to a third
party on every app open, which is precisely what the same document's privacy
claim says does not happen — and AD-2 contains no obligation to amend the list
or `PRODUCT.md` in the same change.

**Unit B — `lib/xrpl/issuer-meta.ts`.** A token display name is not on the
ledger; it is in the issuer's `.well-known/xrp-ledger.toml`. The author places
it **inside `lib/xrpl/`** and cites AD-2's first paragraph: "Only modules under
`src/lib/xrpl/` may import a `Client`… Everything else goes through the exported
read and write functions." To that author, `lib/xrpl/` *is* where network access
lives, and `faucet.ts` — already inside the boundary, and an HTTP `fetch`, not a
`Client` call — is the precedent.

### Why both are compliant

Unit A satisfies the clause word for word. Unit B satisfies the sealed-boundary
paragraph and follows the only existing example of a non-`Client` egress, which
the spine itself placed inside `lib/xrpl/`. AD-2 offers no test for which side a
new egress belongs on, and there is no gate: `check-layering.mjs`,
`check-query-keys.mjs` and `check-sw-register.mjs` exist; nothing scans for
`fetch`.

### The incompatibility

After both units, the "enumerable list" is neither enumerable nor enumerated.
The Structural Seed still says "Outbound traffic is the ledger's public RPC
endpoints, plus two named exceptions". `PRODUCT.md` still makes a privacy claim
about a two-item list. Nothing failed. A reviewer reading either diff sees a
module that follows AD-2. The claim degrades by accretion, which is the one
failure mode AD-2's own last sentence identifies and does not prevent.

The narrower incompatibility between the units: Unit B's placement makes the
sealed ledger boundary no longer mean "the ledger", so a later reader auditing
`lib/xrpl/` for XRPL correctness now has a third-party HTTP client in scope, and
a later reader auditing egress by reading the AD-2 list misses it entirely.

### The AD that closes it

**Tighten AD-2 — gate the egress and bind the claim.** `[GATED]`.

- `scripts/check-egress.mjs`, beside the three existing scripts: `fetch(`,
  `XMLHttpRequest`, `new WebSocket(`, `navigator.sendBeacon`, and any dynamic
  `import()` of a remote URL are permitted only in files on an **explicit
  allowlist inside the script**. A new egress module is added to that list in
  the same change, which makes it a visible line in every diff and a merge
  conflict when two features add one at once.
- The allowlist and the `PRODUCT.md` claim are the same list. Mirror the
  existing colour-token convention: *an egress the harness does not measure is
  an egress outside the rule.* The Conventions table gets the row.
- Placement rule: `lib/xrpl/` holds calls **to an XRPL endpoint**. Everything
  else lives in a sibling `lib` module regardless of how XRPL-adjacent it feels.
  Move `faucet.ts` out to `lib/faucet.ts` so the precedent stops teaching the
  other answer.

---

## H-10 — No owner of the session-activity signal

**Severity: High** (an unlocked wallet on an unattended device).

AD-5: the window is "*auto-lock minutes of inactivity*, extended by activity and
ended by any lock path". "Activity" is not defined in the spine, and no AD names
its owner. Today `hooks/useAutoLock.ts` defines it privately:

```ts
const events = ['mousedown', 'keydown', 'touchstart', 'scroll']
events.forEach((e) => window.addEventListener(e, resetTimer))
```

so a background poller does **not** extend the session today. The hole is that
nothing says it may not.

### The two units

**Unit A — `pages/tabs/EscrowTab.tsx` with a countdown.** An escrow's
`FinishAfter` is a wall-clock moment; the tab shows a live countdown and polls
`useEscrows`. The author observes that a user watching a countdown for four
minutes without touching the screen gets locked out at minute five, calls that a
bug, and exports `resetTimer` so a successful poll counts as activity:

```ts
useEffect(() => { if (escrows.isSuccess) extendSession() }, [escrows.dataUpdatedAt])
```

**Unit B — `hooks/useLockOnIdle.ts`, a stricter second lock path.** A new unlock
method (`lib/crypto/webauthn-reauth.ts`) makes re-unlocking cheap, so the author
adds a lock on `visibilitychange` and shortens the window, defining activity as
*user input only* and deliberately excluding anything the app does to itself.

### Why both are compliant

AD-5 fixes what may be *held* in session state (a non-extractable `CryptoKey`),
the length of the window, and the laziness of expiry. It says nothing about what
generates the activity signal, and the Conventions table's only session row is
about new unlock methods wrapping the master key. Unit A can point at AD-5's
plain word "activity"; Unit B can point at the same word.

### The incompatibility

With Unit A merged, `useEscrows`' own refetch interval extends the session
forever: a phone on a desk with the Escrow tab open never auto-locks, and the
non-extractable key handle stays live in the IndexedDB session store
indefinitely — AD-5's permission was granted on the basis of a bounded window.
With both merged, the app has two lock policies and two definitions of activity
racing each other, and `unlocked` becomes a function of which tab is mounted.

The lazy-expiry nuance AD-5 records makes it sharper: an entry past its time
survives until the next session read. A new unlock method that *reads* the
session to decide whether to prompt silently resurrects a session it should have
found expired, unless the expiry check is unconditionally first — which AD-5
describes but does not assign to an owner.

### The AD that closes it

**Add AD-19 — One owner of session lifetime.**

- A single module owns the session window: the activity signal, the timer, the
  expiry check, and every lock path. `useAutoLock` becomes its only consumer;
  no other module calls an extend.
- The activity signal is an **enumerated list of DOM events originating from the
  user**. A query success, a timer, a poll, a socket message, or any app-
  initiated effect never extends the session. State this as a prohibition, not
  an omission, because the omission is what Unit A read as permission.
- Every session **read** evaluates expiry before returning, so a lazily-expired
  entry can never satisfy a caller — including a new unlock method deciding
  whether to prompt.
- A screen that needs to stay readable without input (a countdown) may suppress
  its own *display* on lock; it may not extend the window.

---

## H-11 — A derived value has no error channel, and two hooks pick opposite
failure semantics

**Severity: High** (one variant renders a *wrong* number, not a missing one).

AD-14 binds "every **screen** that renders query data". A hook that combines two
reads renders nothing, so AD-14 and AD-15 do not reach it. `useSpendableBalance`
shows the existing shape:

```ts
if (!accountState.data || !reserves.data || !accountState.data.exists) {
  return { isLoading: ..., spendableDrops: null, reservedDrops: null }
}
```

There is no error in the return type. A failed read and a loading read and a
non-existent account all arrive at the consumer as `null` — which is G-11.

### The two units

**Unit A — `hooks/usePortfolioTotal.ts`.** Combines `useTrustLines`,
`useAccountState` and a fiat rate. Following the precedent above, it returns
`{ totalFiat: null }` when any input is missing. The Balances screen renders
nothing where the total was, and says nothing — silent absence.

**Unit B — `hooks/useAvailableToSend.ts`.** Combines `useAccountState` and
`useServerReserves` for the Send screen. The author decides a *missing* reserve
read should not block a send outright and treats the absent reserve as zero, so
the figure degrades gracefully:

```ts
const reservedDrops = reserves.data ? reserveRequirementDrops(...) : '0'
const spendableDrops = spendableAfterReserve(balanceDrops, reservedDrops)
```

### Why both are compliant

Neither is a screen. AD-14's Rule triggers "when a read is in error" and both
hooks consume the error without re-emitting it, so the screen never sees one.
AD-7 is satisfied in both (all arithmetic in `money.ts`). AD-15 is about a
collection. AD-8 routes a failed read to the inline surface — but the hook is
not a surface, and the screen has nothing to route.

### The incompatibility

Unit A reproduces G-11 in a new place: a figure vanishes and nothing says why.
Unit B is materially worse — it renders a **wrong number as a right one**: a
spendable figure that includes the reserve, on the screen whose entire job is to
stop the user from spending it. AD-14's Prevents line — "a figure from an
earlier success surviving a failed refetch and reading as live" — is a narrower
version of exactly this, and the rule does not reach the composition layer where
the two features differ. Two compliant hooks, two failure semantics, one screen
that cannot tell which it is looking at.

### The AD that closes it

**Tighten AD-14 — a derived value carries its own error.**

- A hook that combines reads returns a **discriminated result**, not a bare
  value: `{ status: 'success', ... } | { status: 'loading' } | { status:
  'error', refetch }`. `null` may never mean "a read failed"; loading, absent
  and failed are three facts and never share a representation. (This is AD-15's
  argument — "a failure and an empty result are different facts and never share
  a rendering" — applied one layer down, where it is currently unstated.)
- A missing input is **never substituted with a default** in a monetary
  calculation. No zero, no last-known value, no optimistic assumption. If an
  input to a money figure is unavailable, the figure is unavailable.
- AD-14's Binds widens from "every screen that renders query data" to "every
  screen, and every hook that derives a value from one".
- Per the Conventions row, each derived hook gets a test that fails if an error
  input starts producing a value.

---

## H-12 — Two identities for one wallet: the store says `id`, the key factory
says `address`

**Severity: High** (cache collision between two distinct wallets' data).

AD-6 makes `activeWalletId` authoritative. AD-4 implements "the active wallet" as
an address:

```ts
export type AccountScopedKey = readonly [name: string, network: NetworkId, address: string | null]
```

And `keystore.ts` mints a fresh id per import with no address dedupe:

```ts
const stored: StoredWallet = { id: crypto.randomUUID(), label, address: wallet.address, ... }
```

Importing the same seed twice — or importing a seed for an account already
generated in-app, which is exactly what a user restoring a backup onto a device
that still has the wallet does — produces **two `WalletMeta` rows with distinct
`id`s and one `address`**.

### The two units

**Unit A — a wallet-rename / per-wallet-settings feature.** Keys everything on
`id`, because AD-6 names `activeWalletId` as the source of truth: per-wallet
labels, a per-wallet preferred explorer, a per-wallet default destination tag.

**Unit B — `hooks/useEscrows.ts` (or any new account-scoped read).** Keys on
`address` via `queryKeys.escrows(network, address)`, because that is the shape
`AccountScopedKey` enforces — the tuple type is *what makes an account-scoped
builder that forgets the address fail the typecheck*, so the author cannot key
on `id` even if they wanted to.

### Why both are compliant

Unit A obeys AD-6 literally. Unit B obeys AD-4 literally — and cannot do
otherwise without changing the exported tuple type. Both are the only reading
available to their author.

### The incompatibility

With two rows sharing one address, switching between them changes
`activeWalletId` and therefore changes everything Unit A owns, while changing
nothing Unit B owns: the query key is byte-identical, so the cache is not
re-keyed and no refetch is triggered by the switch. That is benign only while
the two rows really are the same account. The moment a feature caches something
that *should* differ per row — Unit A's per-wallet default destination tag, read
through a query, or a draft, or a per-wallet note — one wallet's value is served
under the other's identity, and AD-4's Prevents line ("in the worst case a
previous wallet's balance") arrives by a path the gate cannot see, because every
key came from the factory.

Conversely, `unlockWalletForSigning(walletId, ...)` resolves by `id`, so the
*signing* path and the *reading* path identify the active wallet by different
keys. Nothing today reconciles them.

### The AD that closes it

**Tighten AD-6 — one identity, and a stated relationship to the key.**

- A wallet's identity is its `id`. The keystore refuses to store a second wallet
  for an address already present (an import of a known seed adopts the existing
  row, or is refused with the reason named) — so `id` ↔ `address` is a bijection
  and the two identities cannot diverge.
- State the relationship in AD-4 rather than leaving it implicit: an
  account-scoped key carries the address *because* the address uniquely
  identifies the active wallet, which is true only under the bijection above.
  If the bijection is ever relaxed, the key tuple carries `walletId` too.
- Every consumer resolves the active wallet through one selector
  (`useActiveWallet`) and never re-derives it from `wallets.find(...)` at a call
  site.

---

## Cross-cutting observation

Eleven of the twelve holes have the same shape: an AD fixes the *hard* half of a
concern and leaves the matching half unowned. AD-4 gates construction and not
propagation (H-5). AD-9 names a choke point and not its concurrency or its type
(H-3, H-4). AD-16 names a medium and not the others (H-7). AD-13 names a
condition and not the terms in it (H-8). AD-2 names a rule and not a gate (H-9).
AD-5 names a window and not its signal (H-10). AD-14 names a screen and not the
layer above it (H-11). AD-6 names a field and not a schema (H-1) or an identity
(H-12).

The three `[GATED]` ADs are the three that do not admit this reading. That is
not a coincidence, and it is the cheapest available heuristic for which of the
tightenings above should also become scripts: **H-1, H-3, H-9 and H-5** are all
scannable, and each is one file beside the three that already exist.
