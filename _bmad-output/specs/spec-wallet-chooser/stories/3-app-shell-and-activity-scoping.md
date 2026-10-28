---
title: 'App shell and activity scoping'
type: 'feature'
created: '2026-10-28'
status: 'done'
baseline_revision: '41282e48db1710e69691a54ddbaf37b05012c498'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-17-context.md'
  - '{project-root}/docs/agents/INDEX.md'
  - '{project-root}/docs/agents/verifying-your-work.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-chooser-2026-10-19/ARCHITECTURE-SPINE.md'
warnings: []
deferred:
  - summary: >-
      Route-driven notice rescoping (`subscribeRoute(rescope)` in `App.tsx`) has no test.
    evidence: |-
      Unobservable until Story 5 replaces the body of `walletInView` with `enteredWalletId`; Story 5 should add the test with that swap.
    location: >-
      src/App.tsx
    severity: medium
  - summary: >-
      `enterWallet` sets the active wallet and then calls `navigate`, which silently does nothing while a leave-blocker is active.
    evidence: |-
      The store would flip without the route moving. The chooser's Open keys (Story 5) run where no blocker is active; verify there, and rescope order (set then navigate) once `walletInView` reads the route.
    location: >-
      src/store/app-store.ts enterWallet
    severity: low
  - summary: >-
      `walletInView` lives in `AppShell.tsx`, so `App.tsx` imports a component module for it and three gate tests stub it.
    evidence: |-
      Pinned by this spec as an interim; Story 5 replaces its body and may move it into `lib/route.ts` beside `enteredWalletId`.
    location: >-
      src/components/AppShell.tsx
    severity: low
---

<intent-contract>

## Intent

**Problem:** `useAutoLock` and `useClearCacheOnLock` are mounted inside `Main`, the wallet shell. A chooser rendered outside `Main` would run no expiry timer and no background close. `touchActiveLock` reads `activeWalletId`, so activity anywhere would extend the last-used wallet's lock. Notices are scoped by `activeWalletId`, not by the wallet the user is in.

**Approach:** Per AD-31, AD-34, AD-35: an `AppShell` rendered by `Gate` whenever a wallet exists mounts both lifecycle hooks once, the header, skip link and main region, then switches on the route. `enteredWalletId(route, activeWalletId)` is one pure function. `touchLock(walletId | null)` replaces `touchActiveLock`; `null` extends nothing. `enterWallet(walletId)` is the one function that selects a wallet and navigates into it. Notices scope to the wallet in view.

## Boundaries & Constraints

**Always:** `AppShell` is the only mount point of `useAutoLock` and `useClearCacheOnLock`; they stay mounted across route changes (never remounted by the route switch). `enteredWalletId(route, activeWalletId)` returns `activeWalletId` when `isWalletScreen(route)` and `null` otherwise; it lives in `src/lib/route.ts`, takes both as arguments, and is never held in a store or state. `touchLock(null)` extends no in-memory expiry, no timer and no persisted session (`extendLockSession`). `touchLock(id)` extends that wallet's lock only. The expired-lock sweep, each lock's own timer and the background close-all run on every route, unchanged. A lock opened by creating a wallet and never entered counts down from its creation. `enterWallet(walletId)` sets `activeWalletId`, then `navigate(walletScreenPath('wallet', walletId))`. No secret in any of this.

**Never:** No chooser screen, no Wallets key, no header change, no new visible UI (Stories 5-7). Do not change what `Main` renders per route. Do not call `setActiveWalletId` from new code other than `enterWallet`. `lib` must not import the store; keep the `setNoticeWalletReader` inversion.

**Interim rule (removed by Story 5):** until the chooser screen exists, `/` and every chooser-side route still render the wallet shell, so the wallet in view is the active one on every route. Implement this as ONE named function `walletInView(route, activeWalletId)` in `src/components/AppShell.tsx` whose body returns `activeWalletId`, with a comment naming Story 5 as the story that replaces its body with `enteredWalletId`. `AppShell` passes `walletInView(...)` to `useAutoLock` and uses it for notice scoping. Without this the shipped app would stop extending the lock of the wallet the user is using.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Entered | `enteredWalletId({screen:'configure',walletId:'a'}, 'a')` | `'a'` | n/a |
| Not entered | route `chooser`, `settings`, `add-wallet` | `null` | n/a |
| Activity, entered | `touchLock('a')` with a's lock open | a's in-memory expiry restarts; returns a's lock id | n/a |
| Activity, none | `touchLock(null)` | no expiry change, returns `null`; no `extendLockSession` call from the hook | n/a |
| Activity, other lock | `touchLock('a')` while b is open | b's expiry unchanged | n/a |
| Closed lock | `touchLock('a')`, a's lock closed or unknown id | returns `null`, nothing extended | n/a |
| Route change | route changes between chooser-side and wallet screens | both hooks stay mounted, mounted once | n/a |
| Enter | `enterWallet('w')` | store `activeWalletId` is `'w'`, location is `/wallets/w`, one history entry pushed | n/a |
| Notices | active/in-view wallet changes | notices about another wallet are dismissed; app-level notices stay | n/a |

</intent-contract>

## Code Map

- `src/pages/Main.tsx` -- `Main()` mounts `useAutoLock`, `useClearCacheOnLock`, `useAppUpdate`, `ChassisShell`, `AppHeader`, skip link and `<main id="main-content">`, then renders `Unlock` or `OpenWallet`. Split: the hooks, chassis, header, skip link and main region move to `AppShell`; `Main` keeps only the wallet content (and `useAppUpdate` for the Settings-tab marker). Keep the export name `Main` for the content component.
- `src/components/AppShell.tsx` -- new. Reads the route (`useRoute`), `activeWalletId`; calls `useAutoLock(walletInView(route, activeWalletId))` and `useClearCacheOnLock()`; renders the chassis around `<Main />`.
- `src/App.tsx` -- `Gate` renders `<Main />` at the end; render `<AppShell />` instead. Module-scope `setNoticeWalletReader(() => useAppStore.getState().activeWalletId)` and the `useAppStore.subscribe` calling `notify.scopeToWallet` (lines ~29-32): scope by the wallet in view, recomputed on store AND route changes (`subscribeRoute`, `parseRoute(currentPathname())`). Keep module scope.
- `src/store/app-store.ts:80` -- `touchActiveLock` -> `touchLock(walletId | null)`; `expiries` map, `lockRemainingMs`, `expiredLockIds` unchanged. Add `enterWallet(walletId)` here (uses `navigate`, `walletScreenPath` from `@/lib/route`).
- `src/hooks/useAutoLock.ts` -- takes the entered wallet id; read it through a ref so the effect does not re-arm on route changes (the effect keys on `openSpec` and `queryClient` only); `onActivity` calls `touchLock(entered)`, and extends the persisted session only for a non-null result.
- `src/lib/route.ts` -- add `enteredWalletId`.
- `src/lib/notify.tsx` -- `setNoticeWalletReader`/`scopeToWallet` names mention "active"; behaviour stays, comments updated to "the wallet in view".
- Tests that mount `Main`: `src/__tests__/gate-migration.test.tsx`, `src/__tests__/gate-error.test.tsx` mock `@/pages/Main`; mock `@/components/AppShell` instead (or both). Also `src/store/__tests__` / `src/hooks/__tests__` that call `touchActiveLock` (grep) and `src/lib/__tests__/notify.test.ts`.

## Tasks & Acceptance

**Execution:**
- `src/lib/route.ts` -- add `enteredWalletId` -- AD-34 pure derivation
- `src/store/app-store.ts` -- `touchLock`, `enterWallet`; remove `touchActiveLock` -- AD-35, AD-34
- `src/hooks/useAutoLock.ts` -- take the entered id via ref; `touchLock(entered)`; persisted extension only when non-null -- AD-35
- `src/components/AppShell.tsx` (new), `src/pages/Main.tsx`, `src/App.tsx` -- AppShell above the route switch, `walletInView` interim function, notice scoping by wallet in view -- AD-31, AD-34
- Tests: `enteredWalletId` table; `touchLock` rows (null, entered, other lock, closed, unknown id) with expiry assertions; hook test that `touchLock(null)` activity calls no `extendLockSession` and arms nothing; AppShell test that route changes keep both hooks mounted once (count mounts through mocks or spies) and that expiry and background close still run with the chooser-side route showing; `enterWallet` test; notice scoping test; update the existing tests that referenced `touchActiveLock` or mocked `Main`. A test for AD-31 and a test for AD-35 that each fail when their rule is removed.

**Acceptance Criteria:**
- Given the app shell is mounted, when the route changes between chooser-side and wallet routes, then `useAutoLock` and `useClearCacheOnLock` remain mounted exactly once.
- Given `touchLock(null)`, when it runs, then no expiry, timer or persisted session is extended.
- Given the user is active in wallet W, when activity occurs, then only W's lock extends.
- Given any route, when a lock's timer expires or the app is backgrounded, then the lock closes (FR-11).
- Given the app as it runs today (no chooser), then the user can still use the wallet at `/` without being locked out while active, and nothing visible changed.
- `bun run lint`, `bun run build`, `bun run test`, `bun run check:contrast` pass.

## Spec Change Log

## Review Triage Log

### 2026-10-28 — Review pass
- verdicts: blind hunter 8, edge-case hunter 7, verification gap 2 plus 2 notes, intent alignment descriptive; grouped by root cause into the rows below — medium 1 (patched), low 5 (3 patched, 2 deferred), medium 1 deferred, false 2
- findings:
  - `[medium]` `patch` The ref holding the entered id was synced in a passive effect, so activity right after a route change could count for the previous id; no test changed the id then fired activity — now a layout effect, plus a test that renders with `'a'`, rerenders with `null`, fires `mousedown` and asserts nothing extended.
  - `[low]` `patch` `enterWallet` selected and navigated to an id that is not a wallet — it now returns first; test added.
  - `[low]` `patch` Dead `autoArgs` instrumentation in `AppShell.test.tsx` — removed.
  - `[medium]` `defer` Route-driven notice rescoping is untested — see deferred.
  - `[low]` `defer` `enterWallet` under a blocker; `walletInView` placed in `AppShell.tsx` — see deferred.
  - `[false]` `reject` `enteredWalletId` ignores `route.walletId` on a deep link — AD-32 renders an in-wallet screen only when `route.walletId === activeWalletId` and otherwise `resetToHome()`, and a boot rewrites any deep link to `/`.
  - `[false]` `reject` the "route change does not re-arm" test would pass if the effect re-armed — true, but `arm` uses each lock's remaining time, so a re-arm is harmless; the test pins the observable outcome (no fresh window), which is the rule.
  - `[low]` `reject` module-scope subscriptions never unsubscribe, `notify.tsx` comment wording, a `Main` render outside `AppShell`, `docs` still naming `touchActiveLock` (only planning documents describing the replaced function do), no created-never-entered test, no `#main-content` focus test — pre-existing pattern, cosmetic, or covered by the unchanged countdown-from-creation behaviour and the later browser pass.

## Verification

**Commands:**
- `bun run lint` -- expected: no errors
- `bun run build` -- expected: `tsc -b` and Vite build succeed
- `bun run test` -- expected: all pass
- `bun run check:contrast` -- expected: pass

**Manual checks (if no CLI):**
- A browser pass is deferred to the chooser branch's single pass; there is no visible change in this story.

## Auto Run Result

Status: done

- Summary: `AppShell` is rendered by `Gate` and mounts `useAutoLock` and `useClearCacheOnLock` once above the route switch, with the chassis, header, skip link and main region. `touchLock(walletId | null)` replaces `touchActiveLock`; `null` extends nothing. `enteredWalletId`, `enterWallet` and wallet-in-view notice scoping are in place, with the interim `walletInView` returning the active wallet so nothing visible changes.
- Files: `src/components/AppShell.tsx` (new), `src/pages/Main.tsx`, `src/App.tsx`, `src/store/app-store.ts`, `src/hooks/useAutoLock.ts`, `src/lib/route.ts`, `src/lib/notify.tsx`, and tests (`AppShell`, `touch-lock`, `notice-scope`, `auto-lock`, route, gate mocks, panel-vocabulary).
- Review: 3 patches applied (1 medium, 2 low), 3 deferred, the rest rejected with reasons above.
- Follow-up review recommended: false.
- Verification: `bun run lint`, `bun run build`, `bun run test` (1432 tests), `bun run check:contrast` pass after patches.
- Residual risk: Story 5 must swap `walletInView` for `enteredWalletId` and add the route-rescoping test; no browser pass yet.
