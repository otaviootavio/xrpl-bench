---
title: 'Epic 4 — the rules and the code agree again'
type: 'refactor'
created: '2026-09-12'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '10e1d7048d8adcef0320e6c12e5faaf52df95689'
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-2026-09-12/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Four places where `docs/decisions.md` and the code disagree. One is
the rule's fault: §4 bans any secret from store state, but the code holds a
`CryptoKey` imported non-extractable, which is a handle whose bytes no code can
read — decided permitted, and the rule does not say so, so a future agent will
"fix" working code. Three are the code's fault: drops arithmetic lives in four
places outside the shared money module, one explorer link is hand-rolled, and
the service worker is registered twice — once from `main.tsx` through the
virtual specifier the indirection exists to prevent, and once from
`useAppUpdate`.

**Approach:** Add the missing sentence to the rule. Move each stray drops
calculation into `money.ts` behind a named helper. Render the stray link through
`AddressLink`. Give `lib/sw-register.ts` a single memoised registration and
route both callers through it.

## Boundaries & Constraints

**Always:**
- Every figure on screen is identical before and after. The spendable-balance
  and funds-check results must not change by one drop.
- Money stays strings or `BigInt` end to end. No `Number()`, `parseFloat` or
  `toFixed` touches a monetary value, including inside `money.ts`.
- The update flow keeps its behaviour exactly: a new worker installs and waits,
  only an explicit user action activates it, and never while a transaction is in
  flight.
- Every query key comes from `lib/xrpl/query-keys.ts`; a deliberate
  counterexample opts out with `// check-query-keys-allow`.

**Never:**
- No new runtime dependency; no visual, copy or token change.
- Do not change the `vaultKey` code. The decision was to keep it and correct the
  rule; only `docs/decisions.md` changes for that story.
- Do not touch the `sourceUrl` and release-notes anchors in `Unlock.tsx`,
  `SettingsTab.tsx` or `Onboarding.tsx` — they are not explorer links.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Spendable balance | balance, base reserve, owner reserve, owner count | balance − base − (owner × count), as a decimal string | Never negative; clamps to `'0'` |
| Spendable below reserve | balance less than the base reserve | `'0'`, not a negative string | N/A |
| Unfunded account | account does not exist | Unchanged: no spendable figure is produced | N/A |
| Funds check with fee | amount plus fee against spendable | `true` only when amount + fee fits | N/A |
| Funds check exactly equal | amount + fee exactly equals spendable | Fits — not an off-by-one rejection | N/A |
| Trust-line affordability | spendable against one owner reserve | `true` when spendable is greater than or equal to the reserve | Missing reserve data falls back to 200000 drops, as today |
| Explorer link on each network | an address on Mainnet, then Testnet | The network-correct official explorer, via the shared component | N/A |
| Service-worker registration | app start | Exactly one registration, whichever caller runs first | A second call returns the same registration |

</frozen-after-approval>

## Code Map

- `docs/decisions.md` §4 -- the enforced-patterns list. The bullet banning secrets from store state is the one that needs a sentence. `src/store/app-store.ts:22` holds `vaultKey: CryptoKey | null`, imported non-extractable at `src/lib/crypto/auth.ts:36` (the `false` argument), excluded from persistence by `partialize` at `app-store.ts:99-106`, and separately written to IndexedDB by `putUnlockedSession` (`src/lib/crypto/db.ts:112-115`) with an expiry equal to the auto-lock setting. Reasoning and the options weighed: `_bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-2026-09-12/vaultkey-options.md`.
- `src/lib/xrpl/money.ts` -- already exports `subtractDrops`, `multiplyDropsByCount`, `isNonNegativeDrops`, `compareDecimalStrings`, `xrpToDropsString`, `formatXrp`. The stray arithmetic below belongs here.
- `src/hooks/useSpendableBalance.ts:15-19` -- `BigInt(baseReserveDrops) + BigInt(multiplyDropsByCount(...))`, then `subtractDrops`, then clamps with `BigInt(spendableRaw) > 0n`. The whole spendable rule lives here rather than in `money.ts`.
- `src/pages/tabs/SendTab.tsx:76-77` -- `BigInt(xrpToDropsString(amount)) + BigInt(fee.data ?? '0')` compared against `BigInt(spendableDrops)`. The fee is on top of the amount, so both must fit.
- `src/pages/tabs/TrustLinesTab.tsx:69` -- `BigInt(spendableDrops) >= BigInt(reserveCostDrops)`, with `reserveCostDrops` falling back to `'200000'` when reserve data has not loaded.
- `src/components/wallet/AddressDisplay.tsx:64-66` -- a hand-written `<a href={accountExplorerUrl(network, address)} target="_blank" rel="noreferrer noopener">` wrapping an icon, inside a `Button asChild`. `AddressLink` in `src/components/wallet/AddressLink.tsx` is the shared component; note it renders its own truncation, tooltip and trailing icon, and reads `network` from the store itself.
- `src/main.tsx:3,9` -- imports `virtual:pwa-register` directly and calls `registerSW({ immediate: true })`.
- `src/lib/sw-register.ts` -- exists solely to isolate that specifier, and its own docstring says nothing else should import it. Currently a bare re-export.
- `src/hooks/useAppUpdate.ts:49-58` -- calls `registerSW({ immediate: true, onRegisteredSW, onNeedRefresh })` at module scope, guarded by `!updateSW`. This is the second registration.
- Reuse, do not change: `accountExplorerUrl` / `txExplorerUrl` in `src/lib/xrpl/networks.ts`; the `sourceUrl` and release-notes anchors in `Unlock.tsx`, `SettingsTab.tsx`, `Onboarding.tsx`.

## Tasks & Acceptance

**Execution:**

- [x] `docs/decisions.md` -- add the sentence permitting a non-extractable `CryptoKey` handle in session state and in the IndexedDB session store, while raw key bytes and plaintext seeds stay banned; say the exposure window is the auto-lock setting -- without it the next agent reads the rule literally and removes working code.
- [x] `src/lib/xrpl/money.ts` -- add named helpers for the spendable rule, for "amount plus fee fits", and for "spendable covers one owner reserve" -- one place for each calculation.
- [x] `src/hooks/useSpendableBalance.ts`, `src/pages/tabs/SendTab.tsx`, `src/pages/tabs/TrustLinesTab.tsx` -- call them; no `BigInt` arithmetic on a monetary value left outside `money.ts`.
- [x] `src/lib/xrpl/__tests__/money.test.ts` -- extend; cover every row of the matrix, including a balance below the base reserve and the exactly-equal funds case.
- [x] `src/components/wallet/AddressDisplay.tsx` -- render the explorer link through the shared component -- AD-10.
- [x] `src/lib/sw-register.ts` -- own a single memoised registration so a second call returns the first result -- fixes the actual double registration, not just the import path.
- [x] `src/main.tsx`, `src/hooks/useAppUpdate.ts` -- both go through it; `main.tsx` stops importing the virtual specifier -- AD-11.
- [x] `src/lib/__tests__/sw-register.test.ts` -- new; assert two calls produce one registration.

**Acceptance Criteria:**

- Given the whole change, when `src/` is searched for `BigInt(`, then every remaining use on a monetary value is inside `money.ts`.
- Given an account with trust lines, when the Balances screen renders, then the spendable and reserved figures are identical to before, including when the balance is below the base reserve.
- Given `src/` is searched for an anchor whose href is an explorer URL, then none exists outside `AddressLink` / `TxLink`.
- Given the app starts, when registration runs, then exactly one service worker registration is created however many callers ask.
- Given a new release and no transaction in flight, when the user accepts the update, then it activates once and the app reloads — unchanged from before.
- Given `docs/decisions.md` §4 is read against `src/store/app-store.ts:22`, then the code is compliant on its face.

## Implementation Notes

- **`sw-register.ts` is now two files.** `src/lib/sw-register-core.ts` holds the
  memoised registry and imports nothing; `src/lib/sw-register.ts` stays the only
  module that names `virtual:pwa-register` (AD-11) and is three lines of wiring.
  The split exists because a test importing `sw-register.ts` would evaluate the
  virtual specifier, which the test runner cannot resolve at all — so the rule is
  tested on the core, with a fake `registerSW` passed in.
- **The registry owns the callbacks, rather than the first caller's options
  winning.** `main.tsx` used to register with no callbacks and `useAppUpdate`
  with `onNeedRefresh`; plain "first call wins" memoisation would have made the
  update prompt depend on module evaluation order, so a future lazy-load of
  `Main` could have killed it silently. The registry registers with its own
  callbacks and exposes `isUpdateWaiting` / `subscribeToWaitingUpdate`, with a
  replay for a subscriber that arrives after a worker is already waiting.
  `useAppUpdate` no longer tracks the registration or the waiting flag itself.
- **AD-11 is enforced by a guard, not by convention.** `scripts/check-sw-register.mjs`
  (a `node:`-builtins-only scan in the `check-query-keys.mjs` idiom, wired into
  `bun run lint`, with its own fixture-tree test) asserts `virtual:pwa-register`
  is imported by `src/lib/sw-register.ts` alone. Without it, restoring the
  import in `main.tsx` reintroduces the double registration with all four gates
  green — the registry tests use the core factory and `useAppUpdate.test.tsx`
  mocks the wiring module away. A single line can opt out with
  `// check-sw-register-allow`, which is how the guard's own test holds fixtures.
- **`AddressLink` gained an opt-in `iconOnly` mode** so `AddressDisplay`'s
  icon-only explorer affordance could move behind it without the address being
  printed twice on the serial plate. It emits the same single `<a>` with
  `buttonVariants({ variant: 'ghost', size: 'icon' })` and the same
  `aria-label`, which is what the `Button asChild` wrapper produced before, so
  the rendered element and class list are unchanged. The default rendering of
  `AddressLink` is untouched, so no other call site moves. Its props are a
  discriminated union, so `label` is required and `truncate` rejected in that
  mode, and it renders through `<Button asChild variant="ghost" size="icon">`
  rather than re-deriving Button's internal class contract.
- **Three money helpers, not two.** `useSpendableBalance` returns `reservedDrops`
  as well as `spendableDrops`, so the reserve requirement needed its own helper
  (`reserveRequirementDrops`) or the hook would have kept inline `BigInt`
  arithmetic. `amountPlusFeeFits` is inclusive (`<=`), matching the previous
  `needed > spendable` rejection exactly. `ownerCount` stays a `number` — it is a
  count, not a monetary value.
- **Three new tests pin the compositions the typechecker cannot see.**
  `spendable-balance-wiring.test.tsx` asserts the exact `reservedDrops` /
  `spendableDrops` strings (swapping the two same-typed reserve arguments turns
  it red); `address-link.test.tsx` renders the `iconOnly` branch on both
  networks (a hardcoded href turns it red); `sw-register-guard.test.ts` runs the
  AD-11 guard against a fixture tree in both directions. Both mutations were run
  and confirmed red.
- **`docs/decisions.md` only, for `vaultKey`.** `AGENTS.md` restates the §4
  no-secret rule in short form and is now less precise than §4. It is outside
  this spec's scope and was left alone.

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| 1 | `useSpendableBalance`'s composition is unpinned — swapping the two same-typed string arguments to `reserveRequirementDrops` turns a 1.6 XRP reserve into 3.2 XRP with every gate green | **high** | Verified by reading the hook and `money.ts:129`. Same defect class as Epic 1's wrong-sibling finding, but this one changes a money figure on three screens. No test imports the hook. | patch |
| 2 | The new `iconOnly` branch of `AddressLink` is rendered by no test | **medium** | Verified: the only test importing `AddressLink` mocks it out with a bare span. Changing the href to a fixed Mainnet URL leaves all four gates green. | patch |
| 3 | `iconOnly` re-derives `buttonVariants(...)` and hardcodes `data-slot="button"`, duplicating Button's contract outside Button | **medium** | Confirmed by reading both files. Anything Button gains beyond classes silently skips this link. | patch |
| 4 | `label` documented as required in `iconOnly` mode but typed optional; `truncate` silently ignored; an empty address renders a stray `—`; icon missing the `aria-hidden` its siblings carry | **low** | All four confirmed by reading the component. Direct corrections, so not rejected. | patch |
| 5 | `register()` memoises on `if (updateSW)`, so a falsy return re-registers every time; `count += 1` runs before the call, so a throw leaves the count wrong | **medium** | Confirmed at `sw-register-core.ts:51-56`. The counter is the accessor meant to prove the single-registration invariant. | patch |
| 6 | `registrationCount()` sits in the production interface only so a test can assert what the fake already asserts | **low** | Confirmed. Direct deletion. | patch |
| 7 | AD-11 is not enforced end to end: restoring the virtual-specifier import in `main.tsx` reintroduces the double registration with every gate green | **medium** | Pre-verified by the verification-gap layer: the registry test uses the core factory in isolation and `useAppUpdate.test.tsx` mocks the module away. | patch |
| 8 | `sw-register.test.ts` is named for a module it does not exercise | **low** | Confirmed — it tests `sw-register-core.ts`, hiding that the wiring module has no coverage. | patch |
| 9 | The new §4 sentence says the exposure window is the auto-lock setting, but `extendSession` pushes the expiry on every activity tick and expired entries are deleted only on the next read | **medium** | Confirmed at `auth.ts:219-220` and `useAutoLock.ts:53`. The sentence was added by this change, so its accuracy is this story's problem. | patch |
| 10 | `AGENTS.md` still states the no-secret rule absolutely, so an agent reading it deletes `vaultKey` despite the §4 exception | **medium** | Real and confirmed. Fix edits an agent-context file, which this workflow routes away from a build story. | defer |
| 11 | `waiting` never returns to `false`, so a failed `applyUpdate` leaves a stale update prompt | **low** | Real, and pre-existing in shape — `useAppUpdate` only ever called `setWaiting(true)` before this change too. | defer |
| 12 | No lint rule stops `BigInt(` reappearing outside `money.ts` or a hand-rolled explorer anchor returning | **low** | True. The acceptance criteria are grep-shaped and hold today; adding two more guard scripts is its own piece of work. | defer |
| 13 | `money.ts` helpers throw on malformed input (`NaN` owner count, decimal or empty drops strings) | **low** | Checked the call sites: `SendTab` guards `amountPlusFeeFits` behind `amountValidation.valid`, and `ownerCount` comes from `account_info` as an integer. Code that fails loudly on a state never shown reachable is correct behaviour, not a defect. | reject |
| 14 | A subscriber listener that throws would silence the remaining subscribers | **low** | Both listeners are internal and do not throw. The fix is a guard rather than a direct correction. | reject |


## Verification

**Commands:**
- `bun run lint` -- expected: exit 0.
- `bun run build` -- expected: exit 0.
- `bun run test` -- expected: exit 0, with the money and sw-register suites passing.
- `bun run check:contrast` -- expected: exit 0. `AddressDisplay` changes markup, so this must stay green.
- `grep -rn "BigInt(" src --include=*.ts --include=*.tsx` -- expected: monetary uses only inside `money.ts`.
