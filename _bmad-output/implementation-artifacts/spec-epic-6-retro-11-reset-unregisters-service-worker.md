---
title: 'A full reset unregisters the service worker so the next load precaches the shell again'
type: 'bugfix'
created: '2026-10-04'
status: 'done'
baseline_commit: 'de0a9f1d682d833d5519d15992bf850059c2c4e8'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/decisions.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-retro-2026-10-04.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** "Remove everything" (hard-lock reset on Unlock, "Erase everything" in Settings) deletes every Cache Storage key, but the still-registered, already-active worker never refills its precache (workbox-precaching repopulates a miss only for entries with `integrity`, which vite-plugin-pwa does not emit). An installed app that was reset may then not open offline until a new release installs (epic 6 retro F1, action item 11). The comment at `src/lib/teardown.ts:74-76` claims the reload re-fetches the shell; it does not.

**Approach (decided by Otavio, 2026-10-04):** the full reset also unregisters every service-worker registration for the origin, so the reload after the reset installs a fresh worker that precaches the shell. Lock and single-wallet removal keep the shell and the registration untouched (AD-16, story 6.2). Second, docs-only goal bundled by Otavio: record in `docs/decisions.md` §14 that he CONFIRMED on 2026-10-04 PR #42's two unattended fee decisions — no fee cushion (Send pays exactly the fee shown; a send may expire under load rather than overpay) and refusing AccountDelete / AMMCreate / VaultCreate at signing because their fee exceeds the 0.01 XRP cap.

## Boundaries & Constraints

**Always:** `lib/teardown.ts` stays the one owner of the clear set; the unregister lives in `clearShell`, reached only from `tearDownAllLocalState`. The unregister and the cache deletion are each attempted even if the other fails, and both stay quiet-fail (the shell holds no account data). Updates are never automatic: reason in the docs why the post-reset reload is not one.

**Never:** unregister or touch Cache Storage on lock or single-wallet removal; call `skipWaiting`/`updateSW` or reload from teardown itself; import `virtual:pwa-register` outside `lib/sw-register.ts`; change `registerType: 'prompt'`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Full reset, worker registered | 1+ registrations, precache present | every registration's `unregister()` called; every cache key deleted | N/A |
| Full reset, no SW API | `navigator.serviceWorker` undefined (tests, insecure context) | caches still cleared; no throw | skip |
| Unregister rejects | `getRegistrations`/`unregister` throws | caches still deleted; teardown resolves | swallowed |
| Partial teardown | an account-data clear fails | shell untouched: no unregister, no cache deletion; teardown rejects as today | reported by caller |
| Lock / single-wallet removal | registration present | no `unregister`, no `caches.keys/delete` | N/A |

</frozen-after-approval>

## Code Map

- `src/lib/teardown.ts` -- `clearShell` (l.98-107) deletes caches; add unregister of `navigator.serviceWorker.getRegistrations()`; rewrite the comment at l.74-76 and the module docstring's shell bullet.
- `src/lib/__tests__/teardown.test.ts` -- has `installCaches` stub; add a `navigator.serviceWorker` stub; assert unregister on full reset, none on `clearCachedAccountData`, caches cleared when unregister throws.
- `src/pages/tabs/__tests__/settings-full-reset.test.tsx` -- real SettingsTab; add an "Erase everything unregisters" assertion and the item-12 `handleRemove` test (stubbed `caches` + SW; keystore mock's `listWallets` must return one wallet for that test).
- `src/hooks/__tests__/clear-cache-on-lock.test.tsx` -- add assertion that lock never unregisters.
- `src/pages/Unlock.tsx`, `src/pages/tabs/SettingsTab.tsx` -- callers; reload after a successful teardown already exists. Do not change.
- `docs/decisions.md` §13 (l.1307) and §14 (l.1341); `docs/agents/keys-and-secrets.md:51`; `docs/user-stories/app-versioning-and-updates.md:132` -- shell-on-reset wording.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `epic-6-retro-item-11…`, `epic-6-retro-item-12…` → `done`.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/teardown.ts` -- unregister all registrations in `clearShell`, independent try blocks; correct comments -- F1.
- [x] `src/lib/__tests__/teardown.test.ts` -- unregister pins per I/O matrix -- fail if the unregister is removed.
- [x] `src/pages/tabs/__tests__/settings-full-reset.test.tsx` -- Settings erase unregisters; single-wallet removal keeps caches and registration -- item 12.
- [x] `src/hooks/__tests__/clear-cache-on-lock.test.tsx` -- lock does not unregister.
- [x] `docs/decisions.md` -- §13: reset unregisters, why, and why it is not an automatic update; §14: Otavio's confirmations.
- [x] `docs/agents/keys-and-secrets.md`, `docs/user-stories/app-versioning-and-updates.md` -- one-clause updates.
- [x] `sprint-status.yaml` -- items 11 and 12 done.

**Acceptance Criteria:**
- Given a registered worker, when either reset completes, then no registration remains and the next online load installs a worker whose precache is non-empty, and an offline reload afterwards opens the shell.
- Given a lock, when it completes, then the registration and precache are unchanged and the app opens offline.
- Given the unregister line is deleted, when tests run, then at least one test fails.

## Implementation Notes

- `clearShell` unregisters via `navigator.serviceWorker.getRegistrations()` + `Promise.allSettled(unregister)` (one rejecting registration does not stop the others), then deletes every cache key; each step in its own `try`. `tearDownAllLocalState` now throws before `clearShell` when any account-data clear failed (Decision 1).
- Tests define `navigator.serviceWorker` on the existing `navigator` and delete it in `afterEach`, rather than replacing `navigator`, so jsdom's other navigator fields stay intact.
- Mutation runs (re-run 2026-10-04 after the pass-1 patches, each mutant reverted and `teardown.ts` byte-compared afterwards):
  - M1, unregister call removed: 6 tests fail (4 in `teardown.test.ts`, 1 in `unlock-hard-lock-reset.test.tsx`, 1 in `settings-full-reset.test.tsx`).
  - M2, the `caches` early return moved ahead of the unregister: 1 test fails ("still unregisters, and resolves, when there is no Cache API").
  - M3, `clearShell` moved ahead of the partial-failure throw (Decision 1 undone): 1 test fails (the vault-wipe-fails case).
  - M4, both steps in a single `try`: 1 test fails ("still clears the caches and resolves when getRegistrations rejects").
  - M5, unregister added to `clearCachedAccountData` (lock and removal): 10 tests fail, including the lock hook test and the Settings single-wallet removal test.
  - M6 and M7, an unregister loop or a `caches.keys/delete` loop added to Settings `handleRemove`: each fails the single-wallet removal test.
- Browser pass, re-run 2026-10-04 on port 5179 in a fresh browser and an isolated context, against a fresh `bun run build` of the current tree. Production code is identical to the first pass's build (`src/lib/teardown.ts` is byte-identical; only tests changed since, from pass-1 patches #4 and #9). The negative control reuses the first pass's `dist-neg` build, which is still valid because `teardown.ts` has not changed. Scripts are in the session scratchpad `r11/`, and all three screenshots were opened and checked: Onboarding, Unlock, and a blank failed load. "Offline" means the preview server process was **killed**: Playwright's `context.setOffline` does not reach a service worker's own fetches. With `setOffline`, the negative control's offline reload still rendered, so that method cannot tell the two builds apart.
  - Settings "Erase everything": precache 14 → after the reset's reload a fresh, uncontrolled worker with precache 14 → second reload controlled, 14 → HTTP cache cleared, server killed → reload renders Onboarding, `controller` set.
  - Lock: precache 14 → 14, registration still active → HTTP cache cleared, server killed → reload renders Unlock.
  - Negative control (unregister removed): precache `{}` after the reset and after a second reload → offline reload fails `net::ERR_FAILED`.
  - Not exercised in a browser: the Unlock hard-lock reset path (same `tearDownAllLocalState`; covered by `unlock-hard-lock-reset.test.tsx`), and an installed home-screen PWA.

## Spec Change Log

## Review Triage Log

Pass 1 (blind-hunter, edge-case-hunter, verification-gap; verification-gap reported no gaps).

| # | Layer | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | blind | §13 states the partial-teardown ordering as settled next to "decided by Otavio", though it is unattended Decision 1 | low | §13 text read: the partial-teardown sentence carries no attribution. A reader would take it as Otavio's | patch (marked unattended, pending) |
| 2 | blind | epic 6 spec Decision 1 still asserts "the reload re-fetches the shell" | low | `spec-epic-6-teardown.md:131-136` unchanged | patch (append re-decided note) |
| 3 | blind | offline full reset no longer documented | low | §13 and the docstring describe only the online reload. Offline, both registration and caches are gone | patch (one sentence) |
| 4 | blind | Unlock hard-lock reset has no unregister assertion | low | `unlock-hard-lock-reset.test.tsx` stubs neither `caches` nor SW. Same function as Settings, but AC names both callers | patch (test) |
| 5 | blind | removal test docstring claims query-cache clearing it does not assert; `[0]` button pick depends on order | low / false | docstring true. The pick is pinned by `expect(removeWallet).toHaveBeenCalledWith('w1')`, so a wrong pick fails loudly | patch (docstring only) |
| 6 | blind | sprint-status marks items 11/12 done before review | false | the task directs marking them done when the work lands; the decision half of item 11 (unregister) is Otavio's, and it lands with this PR |  rejected |
| 7 | blind | fee confirmation not reflected in PR #42's spec, and §14 not traceable; item 16 still says "need sign-off" | low | spec-fee-cap Decisions section unchanged. Item 16 is `done` (PR #42 merged), and its text is history | patch (spec line + §14 pointer); item 16 text left |
| 8 | blind | negative control lives in a scratchpad; installed PWA against `stage` unverified | medium (unverified) | true. The pass used `vite preview` | defer (deferred-work.md) |
| 9 | blind | no test for SW present + `caches` undefined; reorder could skip unregister | low | the early `return` on missing `caches` sits after the unregister today, and no test pins that order | patch (test) |
| 10 | blind | navigator.serviceWorker stub duplicated in three test files | low | true, but no named harm beyond style; a shared helper is new surface | rejected |
| 11 | edge | unregister rejects/false yet caches still deleted → empty precache under surviving worker | low | `unregister()` rejecting is not a documented failure mode, and `false` means "no registration found", which is not a surviving worker. The fix adds a branch | rejected |
| 12 | edge | a never-settling `getRegistrations`/`caches` hangs the reset with no reload or toast | low (maybe-false) | `caches.keys/delete` were already awaited here before this change. A hang in `getRegistrations` is unobserved, and a timeout race adds complexity | rejected |

Pass 2 (2026-10-04, resumed after the pass-1 patches; blind-hunter, edge-case-hunter, verification-gap). Edge-case-hunter: no findings. Verification-gap: no gaps.

| # | Layer | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 13 | blind | when `getRegistrations`/`unregister` rejects, the caches are still deleted, leaving an empty precache under a live worker | low | real, but the frozen I/O matrix requires it ("Unregister rejects → caches still deleted"). In practice `getRegistrations` rejects only where no worker can control the page (an insecure or blocked context). Carries #11 | rejected (the intent requires it) |
| 14 | blind | an offline full reset leaves an app that cannot start, with no warning | medium | real, but this already happened before the change: the old reset left a worker with an empty precache that fell back to the network | defer |
| 15 | blind | §13 marks only Decision 1 as pending, yet Decisions 2 and 3 were also unattended | low | §13 read: the unregister-all and quiet-fail statements sit under "decided by Otavio" | patch (attribution clause added) |
| 16 | blind | no explicit **Never** or guard keeps unregister inside `clearShell` | low | true. The fix edits agent-context docs or adds a scan | defer |
| 17 | blind | browser-pass scripts and screenshots live only in a scratchpad | carried medium (unverified) | carried #8: same claim, still in scratchpad | defer (carried; already in deferred-work.md) |
| 18 | blind | the Unlock and Settings test names claim "the reload installs a fresh worker" but assert only stub calls | low | true. The tests assert `unregister`/`caches.delete` calls | patch (both tests renamed) |
| 19 | blind | Decision 1 is not tested through the screens | low | `teardown.test.ts` pins it (mutation M3 fails it). Screen tests would add stubs to two files for a path both screens reach only through `tearDownAllLocalState` | rejected |
| 20 | blind | spec frontmatter, change log and Code Map line numbers are stale | low | the fix edits this build's spec | rejected (edits the spec) |
| 21 | blind | the §14 pointer is vague and names the agent channel | low | §14 read: "given to the agent building…", no PR number | patch (now points to the spec Intent and to `spec-fee-cap-and-shown-fee.md` Decisions 3 and 10) |
| 22 | blind | stub cleanup is inconsistent, and a future jsdom prototype `serviceWorker` would void the "no SW API" case | carried low | carried #10. A speculative future jsdom change, and the fix is a new shared helper | rejected (carried) |

## Design Notes

**Not an automatic update.** The reload after a reset is part of an explicit user action that leaves no wallet or key on the device. It loads whatever the origin serves, as a first install does; this already happened before the change, because the emptied precache made workbox fall back to the network. No path other than the two reset buttons reaches `clearShell`; lock, removal and the update flow never unregister. A worker that was *waiting* (a declined update) is discarded with the registration, matching a fresh install.

## Decisions (made unattended, for Otavio to check)

1. **The shell is cleared only when every account-data clear succeeded.** A partial teardown leaves the worker and its precache in place. Otherwise the "Reload the app and reset again" message would reload into whatever the origin now serves, with seeds possibly still in the vault, and without the user having chosen that version. The retry of the reset clears the shell. Before this change a partial reset did delete the caches.
2. **All registrations for the origin are unregistered** (`navigator.serviceWorker.getRegistrations()`), not only the one `lib/sw-register.ts` holds, so a stale registration cannot keep serving an empty precache. Teardown does not import `lib/sw-register.ts` (that would pull the Vite virtual module into teardown's tests).
3. **Unregister and cache deletion stay quiet-fail**, each in its own `try`, and do not make the reset report incomplete: the shell holds no account data, so its failure is not a reason to tell the user the device still holds their data.
4. **Item 12 is done as a Settings `handleRemove` test**, not as the scan extension (item 13 owns moving and widening the scan).

## Verification

**Commands:**
- `bun run lint && bun run build && bun run test && bun run check:contrast` -- all green.

**Manual checks:**
- Browser pass (port 5179, fresh context, production build via `vite preview`): full reset → online reload → wait for an active worker → `workbox-precache-v2-*` entry count > 0 and equal to the pre-reset count → second online reload so the page is controlled → CDP `Network.clearBrowserCache` → offline reload → shell opens and `navigator.serviceWorker.controller` is set. Lock → registration present, precache count unchanged → clear HTTP cache → offline reload opens Unlock.
- Negative control: the same reset pass on a build with the unregister removed shows the precache staying empty and the offline reload failing.
