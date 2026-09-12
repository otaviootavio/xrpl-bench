# Gap Register — where the code and the spine disagree

Written 2026-09-12 from a read of `src/`. **Nothing has been changed.** Every
line below is a report, not a fix.

Applying any of these is a separate piece of work, on a branch off `dev`, with
`bun run lint`, `bun run build`, `bun run test` and `bun run check:contrast`
re-run before it merges.

Ordered by what it costs you if it is wrong, not by effort.

---

## G-1 — Query keys are typed by hand in two places `AD-4`

**Severity: correctness. This is the one that can put a wrong number on screen.**

Nine places build a query key. Eight *other* places retype what they hope is the
same key in order to invalidate it. Nothing checks the two match.

Reads:
`hooks/useAccountState.ts:10`, `hooks/useAccountTxHistory.ts:7`,
`hooks/useTrustLines.ts:7`, `hooks/useServerReserves.ts:7`,
`hooks/useRecommendedFee.ts:7`, `hooks/useDestinationInfo.ts:30`,
`hooks/useIncomingPaymentNotifications.ts:28`, `lib/xrpl/query-reads.ts:21`,
and two device queries at `pages/Unlock.tsx:30-31`.

Invalidations:
`hooks/useAccountLiveUpdates.ts:28-31`, `pages/tabs/SendTab.tsx:123-125`,
`pages/tabs/TrustLinesTab.tsx:58-59`, `pages/tabs/BalancesTab.tsx:46`.

**Failure mode:** a key typed differently at an invalidation site means the stale
entry is never dropped. After a wallet switch or a completed send, the screen
keeps the old value. `PRODUCT.md` names a pleasant wrong balance as the worst
possible outcome.

**Also caught by the same fix:** `useServerReserves.ts:7` is `['serverReserves',
network]` and `useRecommendedFee.ts:7` is `['fee', network]` — no address. Both
are genuinely account-independent, so they are correct. But §4 states the
wallet-plus-network rule absolutely, and with no factory there is nowhere for a
legitimate exception to be visible. An agent auditing against §4 will read these
as bugs.

**Fix:** one exported key factory. Account-scoped keys take wallet and network.
Account-independent and device-scoped reads are named functions on the same
factory. No key literal anywhere else. Roughly 17 files.

**You chose this one.**

---

## G-2 — Screens turn seeds into signers `AD-3`

**Severity: security posture. Handling is disciplined; the boundary is not enforced.**

`Wallet.fromSeed` is called outside `lib/crypto/`:
- `pages/Onboarding.tsx` (imports `Wallet` at `:2`)
- `pages/tabs/SettingsTab.tsx:74` (imports `Wallet` at `:21`)

And a signing `Wallet` — whose `.seed` is readable — is held at page level for
the duration of a submit: `pages/tabs/SendTab.tsx:92`,
`pages/tabs/TrustLinesTab.tsx:44`.

**What is already right:** every seed is held in a ref or a local, never in React
state. `SeedReveal.tsx:29` clears on unmount. The discipline is real and
consistent. What is missing is that nothing *makes* it so — the next screen that
needs a seed can do it a different way and nothing objects.

**Fix:** `lib/crypto/keystore.ts` gains the entry points the two screens need, so
no page imports `Wallet`. Pure validators like `isValidClassicAddress` stay
importable anywhere; they touch no key and no connection.

**Not urgent. Worth doing before the next screen that touches a seed.**

---

## G-3 — `lib` modules reach upward into `store` and `components` `AD-1`

**Severity: structural. No bug today; it is what makes the rest hard to test.**

- `lib/xrpl/writes.ts:4` imports `@/store/app-store` and calls
  `useAppStore.getState().setTxInFlight`. This is why `writes.ts` cannot be
  tested without standing up a store.
- `lib/notify.tsx:1-2` imports `@/components/ui/alert` as a **value** import,
  for the tone map. (Its other import, `@/store/notice-store`, is the one edge
  AD-1 explicitly permits — the funnel and its sink. Not a gap.)
- `store/notice-store.ts:2` imports `@/components/ui/alert` (type only — the
  mildest of the three).

**Fix:** the tone vocabulary moves down to where both sides can see it, rather
than living in a UI component. `writes.ts` takes the in-flight setter as a
parameter or returns a lifecycle the caller drives.

---

## G-4 — The failover path cannot be tested `AD-12`

**Severity: coverage gap on a path that only matters when things are going wrong.**

`lib/xrpl/client.ts` holds a module-level `Map<NetworkId, Client>` and constructs
a real `new Client`. There is no injection point and no reset. The failover loop
at `:30-39` — try primary, 10-second timeout, fall through to backup, throw a
composed error — has no test, and cannot get one as written.

`reads.ts` and `writes.ts` inherit the problem, because they call
`getXrplClient` directly.

**Fix:** a client factory the module accepts and a reset for tests. Then the
timeout, the fall-through, and the reuse-if-connected branch are all reachable.

---

## G-5 — Failed reads never reach the notice band `AD-8`

**Severity: inconsistency, and it is currently undeclared.**

Imperative failures funnel through `lib/notify.tsx` to the Annunciator — 36 call
sites. But TanStack `isError` renders an inline `<Alert>` in `BalancesTab` and
`HistoryTab`, so a failed ledger read never appears in the notice band.

**This may well be right** — a failed balance read belongs where the balance
would have been, not in a status strip. AD-8 writes that down as the rule rather
than leaving it to be guessed. **That AD is my call; override it if you meant
something else.**

**Also:** `hooks/useAppUpdate.ts:169` calls `useNoticeStore.getState().dismiss()`
directly, because `notify` has no `dismiss`. One escape hatch, easily closed by
adding `notify.dismiss`.

---

## G-6 — Drops arithmetic outside the money module `AD-7`

**Severity: contract drift, not a defect.**

`BigInt` arithmetic on drops happens outside `lib/xrpl/money.ts`:
- `hooks/useSpendableBalance.ts:16` and `:19`
- `pages/tabs/SendTab.tsx:75-76`
- `pages/tabs/TrustLinesTab.tsx:68`

All `BigInt`, so there is no floating-point defect here. But §4 says a single
shared utility, and "spendable = balance − base − owner×count" is now written in
more than one place. **Zero `parseFloat` and zero `toFixed` in `src/` — that part
is clean.**

**Fix:** named helpers in `money.ts`; the call sites become one call each.

---

## G-7 — A hand-rolled explorer anchor `AD-10`

**Severity: low, but it is a stated rule and it is broken.**

`components/wallet/AddressDisplay.tsx:65` writes its own
`<a href={accountExplorerUrl(network, address)} target="_blank" ...>`. The URL
builder is used; the shared `AddressLink` is not. §4 names this exact pattern as
forbidden.

The other external anchors — `Unlock.tsx:134`, `SettingsTab.tsx:289,332,337`,
`Onboarding.tsx:200` — point at source and release notes, not an explorer. Not
violations.

---

## G-8 — The service worker registers twice `AD-11`

**Severity: low. Two paths, one of which the update logic does not own.**

`lib/sw-register.ts` exists, and its own docstring says it exists so that nothing
imports the virtual specifier directly. `main.tsx:3` imports
`virtual:pwa-register` anyway and calls `registerSW({ immediate: true })` at
`:9`, while `hooks/useAppUpdate.ts:2,50` goes through the wrapper.

**Fix:** `main.tsx` uses the wrapper. One import line.

---

## G-9 — `docs/decisions.md` §4 owes one sentence `AD-5`

**Severity: documentation, and it protects working code.**

§4 says no secret ever enters store state or anything serializable. The code
holds a non-extractable `CryptoKey` handle in `store/app-store.ts:22` and in the
IndexedDB session store (`lib/crypto/db.ts:112-115`). You decided this is
permitted: the handle is not readable key material.

Without a sentence saying so, the next agent to audit against §4 will read
`app-store.ts:22` as a violation and remove it. Reasoning and the options
considered are in `vaultkey-options.md`.

**This is a `docs/` change, outside this run's task. Reported, not made.**

---

## Not gaps — recorded so they are not re-raised

- **`hooks/useAccountLiveUpdates.ts:85,136-159`** subscribes to a live socket
  inside a `useEffect`. §3's guardrail governs ledger *reads*; this is a push
  stream and the file argues the distinction at `:97-99`. The argument holds.
- **No `runtimeCaching` in the service worker at all.** §4 asks for network-first
  on ledger traffic; having no interception whatsoever is stronger, not weaker.
- **The unlock ceremony.** `lib/crypto/auth.ts:194` unwraps and checks the
  AES-GCM tag rather than deriving and trusting. This is the defect that was
  caught on Testnet, and the fix is correct and in place.
- **Seed handling uses refs throughout.** No seed is in React state anywhere.
