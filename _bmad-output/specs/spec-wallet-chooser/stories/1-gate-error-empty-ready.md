---
title: 'Gate: error, empty, ready'
type: 'feature'
created: '2026-10-28'
status: 'done'
baseline_revision: 'ba7ccb657a89fdfdedf882e10003570d1f4bcc20'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-17-context.md'
  - '{project-root}/docs/agents/INDEX.md'
  - '{project-root}/docs/agents/verifying-your-work.md'
warnings: []
deferred:
  - summary: >-
      The browser pass at 320, 390 and desktop widths in both themes was not run for the Gate error surface.
    evidence: |-
      Gates cannot prove visual correctness; the spec's manual check (force the vault read to reject, confirm the surface and keyboard reach of Retry) is outstanding. Fold into the chooser branch's single browser pass.
    location: >-
      src/components/wallet/GateError.tsx
    severity: low
---

<intent-contract>

## Intent

**Problem:** `Gate` in `src/App.tsx` has no `.catch` on the wallet-list chain and never consults `appStateHydrationFailed()`. A rejected vault read leaves a blank screen; a failed hydration or a failed read that leaves `wallets` empty can show Onboarding to a user who has wallets. After a hydration failure any store setter makes `persist` write the defaults over the saved Address Book.

**Approach:** Gate resolves to exactly one of error / empty / ready (AD-37). Error renders the string `The wallets on this device could not be read. Nothing was changed.` with Retry, mounts neither Onboarding nor `Main`, and runs no store setter. Onboarding renders only on a successful read that returned zero wallets.

## Boundaries & Constraints

**Always:** Error only on (a) the vault list read rejecting or (b) `appStateHydrationFailed()` true after `appStateSettled()`. On (b) skip the vault read and every setter (`setWallets`, `setActiveWalletId`, `openLock`); Retry is `window.location.reload()` (hydration runs once per load). On (a) Retry re-runs the vault read only. `restoreOpenLocks` rejecting leaves every lock closed and the app continues (the one sanctioned swallow). Keep the legacy-vault migration order (hydration, migrate, list) and its skip on hydration failure. Error surface follows the `Unlock.tsx` pattern: `role="alert"` text plus an outline `Button` labelled `Retry`; no `:focus` styling, no `outline-none`, no colour-only meaning.

**Never:** Do not touch routing, `Main`, the chooser, or other stories' scope. Do not render the underlying error text. Do not add a dependency. Do not relax any guard on error.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ready | list returns 1+ wallets | store set, locks restored, `Main` mounts | n/a |
| Empty | list resolves `[]` | `Onboarding` mounts, `resetToHome()` runs | n/a |
| Vault read fails | `listWallets` rejects | error text + Retry; no Onboarding, no Main, no setter called | Retry re-runs the read; success with wallets reaches `Main`, success with zero reaches Onboarding |
| Hydration fails | idb get rejects | same error; `listWallets` not called; no setter | Retry reloads the page |
| Restore fails | `restoreOpenLocks` rejects | `Main` mounts, every lock closed | swallowed |

</intent-contract>

## Code Map

- `src/App.tsx` -- `Gate` (effect chain, `ready` flag, `noWallets` effect); `migrateOnce` awaits `appStateSettled()` and skips on hydration failure. Rework here.
- `src/store/app-store.ts` -- `appStateHydrationFailed()`, `appStateSettled()`; setters at `setWallets` / `setActiveWalletId` / `openLock` persist the slice. Read only.
- `src/pages/Unlock.tsx:155-165` -- failed-read pattern (`role="alert"` + Retry `Button`) to mirror.
- `src/__tests__/gate-migration.test.tsx` -- mocks `idb-keyval`, keystore, lock, Onboarding, Main; fresh module graph per case. Reuse its harness; its "does not hang when the persisted store cannot be read" case expects `listWallets` to run after a hydration failure and must change (list is now not called).
- `src/lib/route.ts` -- `resetToHome` (keep call on empty only).

## Tasks & Acceptance

**Execution:**
- `src/components/wallet/GateError.tsx` -- new presentational component: Card with `role="alert"` message and `Retry` button, props `{ onRetry }` -- one surface for both causes
- `src/App.tsx` -- replace `ready` with status `loading | error | ready`; await `appStateSettled()`, error + reload-retry on hydration failure; catch the list chain into error with re-run retry (attempt counter in effect deps); restore failures swallowed as today; Onboarding only when status ready and zero wallets
- `src/__tests__/gate-error.test.tsx` -- new: cases for each matrix row; assert neither Onboarding nor Main mounted and that no setter ran on error (spy on store setters or assert store unchanged); retry paths; a test that fails if the Onboarding block on error is removed
- `src/__tests__/gate-migration.test.tsx` -- update the hydration-failure case to the new behaviour (migrate not called, list not called, error shown)

**Acceptance Criteria:**
- Given `listWallets` rejects, when Gate resolves, then the error string and a Retry button show, and Onboarding, Main and every store setter are untouched.
- Given the persisted state failed to hydrate, when Gate resolves, then the same error shows, `listWallets` and the setters never run, and Retry calls `window.location.reload`.
- Given the error shows and a retried read returns wallets, then Main mounts; if it returns zero, Onboarding mounts, and only then.
- Given `restoreOpenLocks` rejects, then Main mounts with every lock closed.
- `bun run lint`, `bun run build`, `bun run test`, `bun run check:contrast` pass.

## Spec Change Log

## Review Triage Log

### 2026-10-28 — Review pass
- verdicts: blind hunter 8, edge-case hunter 11, verification gap 0, intent alignment 1 note; grouped by root cause into the rows below — medium 1 (patched), low 8, false 4, maybe-false 1
- findings:
  - `[medium]` `patch` Retry after a vault-read failure blanks the screen and drops focus — GateError stays mounted now; Retry only bumps `attempt`.
  - `[low]` `patch` Retry kind read from stale `hydrationFailed` state — removed the state; Retry reads `appStateHydrationFailed()` at click time (also covers the "retry would not reload" edge).
  - `[low]` `patch` `vi.unstubAllGlobals()` at the end of a test leaks on failure — moved to `afterEach`.
  - `[low]` `patch` gate-migration assertion used `toContain` — now the exact string.
  - `[low]` `reject` catch is wider than the vault read — setters are synchronous zustand `set` calls and do not throw; persist writes are async and not caught by this chain.
  - `[false]` `reject` "Retry re-runs a vault-writing migration" — `migrateOnce` caches on success and swallows and logs on failure; a failed relabel is atomic.
  - `[false]` `reject` `CardTitle as="h1"` may not type-check — `bun run build` (`tsc -b`) passes and `Unlock.tsx` uses it.
  - `[false]` `reject` "Nothing was changed." untrue on the list path — the copy is mandated by AD-37 and UX-DR9, and nothing is written before a successful read.
  - `[false]` `reject` hydration failure falls through if `migrateOnce` changes — it awaits `appStateSettled()` by design and the hydration test covers it.
  - `[maybe-false]` `reject` test `setState` spies before hydration might write over idb — the idb is faked in the test and the spies replace the actions; any write would not touch the assertion.
  - `[low]` `reject` no logging of the read error, hydration failure has no way out, extra `h1` wording, missing tests for a second failure and happy-path restore, no live-region — each is outside the intent or would add complexity for an unlikely case; the h1 heading is kept so the screen has one.
  - `[low]` `defer` browser pass at 320, 390 and desktop in both themes was not run — see deferred.


## Verification

**Commands:**
- `bun run lint` -- expected: no errors
- `bun run build` -- expected: `tsc -b` and Vite build succeed
- `bun run test` -- expected: all pass, including `gate-error.test.tsx`
- `bun run check:contrast` -- expected: pass

**Manual checks (if no CLI):**
- In a browser at 320, 390 and desktop widths in both themes, force the vault read to reject and confirm the error surface renders and Retry is reachable by keyboard.

## Auto Run Result

Status: done

- Summary: Gate resolves to error, empty or ready. A failed vault read or failed hydration shows the exact AD-37 string with Retry, mounts neither Onboarding nor Main, and runs no setter. Hydration failure retries by reload; a vault failure retries the read with the error surface kept mounted.
- Files: `src/App.tsx` (Gate status machine), `src/components/wallet/GateError.tsx` (new surface), `src/__tests__/gate-error.test.tsx` (new, 7 cases covering the matrix), `src/__tests__/gate-migration.test.tsx` (hydration case updated).
- Review: 4 patches applied (1 medium, 3 low), 1 deferred (browser pass), the rest rejected with reasons above.
- Follow-up review recommended: false.
- Verification: `bun run lint`, `bun run build`, `bun run test` (100 files, 1395 tests), `bun run check:contrast` all pass after patches.
- Residual risk: the visual pass is outstanding.
