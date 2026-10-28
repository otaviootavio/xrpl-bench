---
title: 'Auto-lock on the Checks plate'
type: 'feature'
created: '2026-10-28'
status: 'done'
baseline_revision: 'dc8de71f40e20a801f84a54cd157636b0ecaa5ba'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-19-context.md'
  - '{project-root}/docs/agents/INDEX.md'
  - '{project-root}/docs/agents/keys-and-secrets.md'
  - '{project-root}/docs/agents/verifying-your-work.md'
  - '{project-root}/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-chooser-2026-10-19/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-10-19/EXPERIENCE.md'
warnings: []
deferred:
  - summary: >-
      The "one success handler" test counts the store write and the invalidation, so it would also pass if a caller inlined the two steps; the `openKey` branch of `handleEdited` still invalidates inline rather than through the hook.
    evidence: |-
      The behaviour is identical today; a test mocking `useLockMinutesChanged` and asserting both screens call it would pin the single source. The lock-move path is a different writer (`openLock`), by design.
    location: >-
      src/hooks/useLockMinutesChanged.ts, src/pages/WalletScreens.tsx
    severity: low
  - summary: >-
      The Radix `Select` is replaced by a stand-in in the Configure tests, so the real select's pending state (blank value), its 44px coarse-pointer height, the focus after a change and the `aria-describedby` wiring are untested; the source check for `autoLockMinutes` is a regex over two files.
    evidence: |-
      jsdom lacks the pointer APIs Radix needs. Run the final browser pass; Story 19.4 must keep the Settings-side tests until then.
    location: >-
      src/components/wallet/ConfigureScreen.tsx, src/pages/tabs/__tests__/configure-auto-lock.test.tsx
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** A wallet's auto-lock minutes are edited only from the app-level Settings tab (an `Auto-lock after inactivity` select for whichever wallet is active), and Edit checks and that select each have their own success path for a minutes change (one refreshes `lockInfo`, one does not). A lock shared by several wallets is changed with no word that it affects them all.

**Approach:** Move the control to the Configure screen's Checks plate (AD-44): minutes are changed through `keystore.setLockAutoLock`, which re-proves the lock's Open Check and enforces the Mainnet floor over every wallet on the lock; the plate and Edit checks share ONE success handler; a lock shared by more than one Seed says so. The Settings tab is NOT trimmed here (Story 19.4 removes its auto-lock and Lock now): its control keeps working and its tests stay green.

## Boundaries & Constraints

**Always:** On the Configure **Checks plate**, after the Open Check and Signing Check summary, an **Auto-lock** row (label `Auto-lock after inactivity`) with a select offering the minutes from `AUTO_LOCK_CHOICES` (`policy.ts`) via the shipped `Select` and `minutesLabel` words, showing the lock's current minutes from the same `lockInfo` read the plate already makes (`queryKeys.lockInfo(lockId)`); disabled with visible text until that read succeeds, and a failed read keeps the plate's existing error and Retry (never a default value shown as current). Changing the value calls `keystore.setLockAutoLock(wallet.lockId, minutes, { prompts })` (`usePrompts`), which re-proves the lock's Open Check and applies the floor; nothing in the screen applies a floor itself. **One success handler:** extract one function/hook (e.g. `useLockMinutesChanged` in `src/hooks/`, or a function taking `queryClient`) that does `setLockMinutes(lockId, minutes)` (store) and invalidates `queryKeys.lockInfo(lockId)`; the Configure control and the Edit checks success path in `WalletScreens.handleEdited` (the `edited.changed` branch that only changes minutes) both call it, and no screen duplicates those two steps (the Settings tab's own handler may stay as is until 19.4). On success the select shows the new minutes (from the refreshed `lockInfo`) and no refusal text remains. **Refusal and failure:** a refused change (the policy reason, e.g. a Mainnet wallet under 1 minute; a cancelled or failed check) is shown as visible, persistent text tied to the control (`role="alert"`, `aria-describedby` on the select), cleared on the next attempt or success, and the select reverts to the actual minutes; nothing is written. **Shared lock:** when more than one Seed (distinct `seedId` in the store's `wallets`) is on this wallet's `lockId`, a line under the control says so with the count from the store: `This lock is shared by {n} wallets. A change applies to all of them.`; legacy wallets keep the minutes their lock already has (5 by default) and no further feature is built for them. `app-store.autoLockMinutes` is never read or written by this control or any new code (it stays the legacy migration input only). Keys and the select are 44px on coarse pointers; wrap at 320px and 200% zoom; no `:focus` styling, no `outline-none`, no new colour token. **Tests (R12 mapping):** every existing Settings-tab auto-lock test (grep `autolock`, `Auto-lock`, `setLockAutoLock` under `src/pages/tabs/__tests__/`, e.g. `settings-locks.test.tsx`) gets a Configure counterpart in a new `configure-auto-lock.test.tsx` driven through the Configure screen, before anything is deleted in 19.4.

**Never:** Do not remove or restyle the Settings tab's auto-lock or Lock now. Do not read or write `app-store.autoLockMinutes`. Do not duplicate the floor rule in a component. Do not add a second writer of lock minutes besides `setLockAutoLock`/`editChecks`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Change minutes | Testnet wallet, pick 15 | `setLockAutoLock(lockId, 15, { prompts })` re-proves the Open Check; `setLockMinutes` plus `lockInfo` invalidated once; select shows 15 | n/a |
| Mainnet floor | Mainnet wallet, pick 0.5 | refused with the policy's visible reason; nothing written; select reverts | persistent `role="alert"` text |
| Floor over every wallet | shared lock with a Mainnet wallet on it | refused even when this wallet is Testnet | same |
| Cancelled / wrong check | prompt cancelled or wrong PIN | the keystore's plain reason shown; nothing written | persistent text |
| Edit checks success | edit that only changes minutes | the same shared handler runs (one `setLockMinutes`, one invalidation) | n/a |
| Shared lock | three Seeds on `legacy` | line `This lock is shared by 3 wallets. A change applies to all of them.` | n/a |
| Unshared lock | one Seed | no shared line | n/a |
| Read pending/failed | `lockInfo` loading or errored | select disabled with visible text; error and Retry as the plate already shows | never a default shown as current |
| Settings tab | unchanged | its auto-lock select and Lock now keep working | n/a |

## Code Map

- `src/components/wallet/ConfigureScreen.tsx` -- `ChecksPlate` (reads `queryKeys.lockInfo(wallet.lockId)`; Edit checks key); add the Auto-lock row here.
- `src/pages/WalletScreens.tsx` -- `handleEdited` (the `else if (edited.changed) setLockMinutes(...)` branch and the `invalidateQueries({ queryKey: queryKeys.lockInfo(...) })` after it): route the minutes part through the shared handler.
- `src/pages/tabs/SettingsTab.tsx` -- shipped `handleAutoLock` (~142), select (~246), `lockInfoQuery`; the pattern to learn from; do not remove.
- `src/lib/crypto/keystore.ts` -- `setLockAutoLock` (~1707) re-proves the Open Check via `editChecks` and applies the floor over every wallet on the lock; `src/lib/crypto/policy.ts` -- `AUTO_LOCK_CHOICES`, `checkLockRequest`; `src/lib/minutes-label.ts` -- `minutesLabel`.
- `src/store/app-store.ts` -- `setLockMinutes`, `wallets`; `src/hooks/usePrompts.ts`; `src/lib/xrpl/query-keys.ts` -- `lockInfo`.
- Tests: `src/pages/tabs/__tests__/settings-locks.test.tsx` and any other Settings auto-lock tests (to map), `src/pages/tabs/__tests__/configure-*.test.tsx` and `src/components/__tests__/configure-shell.test.tsx` (harness patterns), `src/lib/crypto/__tests__/` for `setLockAutoLock`/`editChecks` tests.
- AD-44, AD-28 in the chooser `ARCHITECTURE-SPINE.md`; chooser `EXPERIENCE.md` (Conflicts C-1 on auto-lock).

## Tasks & Acceptance

**Execution:**
- `src/hooks/` (or `src/lib/`) -- the one shared minutes-changed handler -- AD-44
- `src/components/wallet/ConfigureScreen.tsx` -- Auto-lock row, refusal text, shared-lock line -- FR-10, FR-88
- `src/pages/WalletScreens.tsx` -- Edit checks' minutes-only success goes through the shared handler
- Tests: Configure counterparts of every Settings auto-lock test; the shared handler runs once for both paths; the Mainnet floor over every wallet on the lock is exercised against the REAL `setLockAutoLock` and policy on an in-memory vault (the existing keystore test layer), so the test fails if the floor check is removed; the refusal text is visible and persistent in the Configure screen; the shared-lock line with the count; the select disabled and no default shown while the read is pending or failed; no read or write of `app-store.autoLockMinutes` (source check on the Configure files); the Settings tab's own auto-lock tests pass unchanged.

**Acceptance Criteria:**
- Given the Checks plate, when the user changes the minutes, then `setLockAutoLock` re-proves the Open Check, enforces the Mainnet floor over every wallet on the lock, and invalidates `lockInfo`.
- Given Edit checks and the auto-lock control, when either succeeds, then both go through one success handler.
- Given a lock shared by more than one Seed, then the plate says so with the count from the store and that a change applies to all of them.
- Given a Mainnet wallet, when the user tries an auto-lock under 1 minute, then it is refused with a visible reason and nothing is written.
- `app-store.autoLockMinutes` is never read or written by a screen.
- `bun run lint`, `bun run build`, `bun run test`, `bun run check:contrast` pass.

## Spec Change Log

## Review Triage Log

### 2026-10-28 — Review pass
- verdicts: blind hunter 8, edge-case hunter 12, verification gap 2 plus 1 note, intent alignment descriptive; grouped by root cause into the rows below — medium 2 and low 5 (patched), medium 1 and low 1 deferred, rest false or rejected as low
- findings:
  - `[medium]` `patch` The unconditional `lockInfo` invalidation in `handleEdited` was dropped, so a commit that changed nothing, or one that moved the wallet to a new lock, could leave the Checks plate and the Auto-lock row on the old read — the lock-move branch invalidates the new lock's read, a no-change commit invalidates once, and the minutes-only commit goes through the shared handler; tests for both.
  - `[medium]` `patch` A change the keystore had already written was reported as failed when the post-write refresh threw — a separate message says it was changed and the screen could not refresh.
  - `[low]` `patch` The shared handler wrote a session window for a lock that closed while the Open Check was being asked — it writes only for an open lock.
  - `[low]` `patch` A failed refetch kept showing the last minutes as current — the row shows no value on an error, never the stale one.
  - `[low]` `patch` The row kept a refusal for another lock after a wallet switch and listed an off-list legacy value out of order — the row is keyed by lock and the choices are sorted; the `any` on the catch is gone.
  - `[low]` `patch` The store-spy test left its spy installed for later tests — the store action is restored before every test.
  - `[medium]` `defer` Single-source pin for the handler, the stand-in `Select` and the browser pass — see deferred.
  - `[false]` `reject` The required real-keystore floor test is missing — `edit-checks.test.ts` already runs the real `setLockAutoLock` and policy on an in-memory vault against a lock shared by a Testnet and a Mainnet wallet and fails if the floor is removed; the new file defers to it in its header.
  - `[low]` `reject` Focus after a change, `aria-invalid` and describing the shared-lock line, an unmount guard, a rapid second selection — the select is disabled while a change is in flight, a closed lock writes nothing, and the rest are accessibility polish for the browser pass.

## Verification

**Commands:**
- `bun run lint` -- expected: no errors
- `bun run build` -- expected: `tsc -b` and Vite build succeed
- `bun run test` -- expected: all pass
- `bun run check:contrast` -- expected: pass

**Manual checks (if no CLI):**
- Browser pass of the Checks plate at 320, 390 and desktop in both themes (change the minutes on Testnet; try 30 seconds on a Mainnet-style wallet to see the refusal). Deferred to the final pass.

## Auto Run Result

Status: done

- Summary: The Configure Checks plate has an Auto-lock row: a select of the policy's choices showing the lock's current minutes from the plate's `lockInfo` read (disabled with text while it is pending or failed), changed through `setLockAutoLock` (which re-proves the Open Check and enforces the Mainnet floor over every wallet on the lock). A refusal or failure is persistent `role="alert"` text; a lock shared by more than one Seed says so with the count. One hook, `useLockMinutesChanged`, is the shared success handler for this control and for Edit checks' minutes-only commit. `app-store.autoLockMinutes` is untouched; the Settings tab is unchanged.
- Files: `src/hooks/useLockMinutesChanged.ts` (new), `src/components/wallet/ConfigureScreen.tsx`, `src/pages/WalletScreens.tsx`, `src/pages/tabs/__tests__/configure-auto-lock.test.tsx` (new).
- Review: 7 patches applied (2 medium, 5 low), 2 deferred, the rest rejected with reasons above.
- Follow-up review recommended: false.
- Verification: `bun run lint`, `bun run build`, `bun run test` (1745 tests), `bun run check:contrast` pass after patches.
- Residual risk: no browser pass; Story 19.4 deletes the Settings auto-lock and Lock now only after their tests are mapped.
