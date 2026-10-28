---
title: 'Wallet header: Wallets key, picker removed'
type: 'feature'
created: '2026-10-28'
status: 'done'
baseline_revision: 'e856498d51ee162b40d26e91f11838d0d027049d'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-17-context.md'
  - '{project-root}/docs/agents/INDEX.md'
  - '{project-root}/docs/agents/verifying-your-work.md'
  - '{project-root}/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-chooser-2026-10-19/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-10-19/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-10-19/DESIGN.md'
warnings: []
deferred:
  - summary: >-
      `leaveWallet` fires only on a route change to `chooser`; a wallet-side route that exits to `settings` (Story 7) or a second wallet route would not shed the first wallet's data.
    evidence: |-
      Today `settings` is unreachable and wallets are entered only from the Chooser. Story 7 adds the Settings key; revisit the trigger there, and the previous-route ref which follows `activeWalletId` while still wallet-side (matters if Story 11 changes the active wallet during add-wallet).
    location: >-
      src/components/AppShell.tsx
    severity: low
  - summary: >-
      The blocked-state reason text sits under the Wallets key and grows the header; layout at 320px and 200% zoom, the 44px key size and the `aria-disabled` styling are unverified in a browser.
    evidence: |-
      jsdom cannot observe them; `check:contrast` does not measure the `opacity-60` disabled style. Run the branch's real-browser pass.
    location: >-
      src/components/AppHeader.tsx
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** Story 5 made the Chooser the landing screen, but inside a wallet the header still hosts the wallet picker `Select` and has no key back to the Chooser (a phone PWA has no Back). Its Lock key calls `closeLock` directly, skipping the cache removal, and leaving a wallet does not clear what it read.

**Approach:** Replace the wallet header per AD-45 and AD-38: remove the picker; add a Wallets key that calls `leaveToChooser()` without closing the lock (disabled with a visible reason while a screen blocks leaving); a Lock key that runs `tearDownLock` then `leaveToChooser()`; a `leaveWallet` scope in the teardown owner that removes the left wallet's account-scoped query data and clears its notices; and focus on the Chooser `Wallets` h1 on arrival. This story merges to `dev` together with Story 5.

## Boundaries & Constraints

**Always:** The wallet header (rendered on wallet-side routes, as Story 5 chose) shows: the `XRPL Bench` nameplate; the **Wallets** key (`Button variant="outline"`, a leading `ArrowLeftIcon` with `aria-hidden`, visible legend `Wallets`, no extra aria-label); and, only when this wallet's lock is open: `NetworkPlate`, and a Lock icon key (accessible name `Lock wallet`) when the Open Check is not `none`. A wallet whose lock is closed (the Unlock view) shows the nameplate and the Wallets key only. No `Configure` key (Story 14). The wallet `Select` picker is gone. Below `sm` the controls take their own row as before (docs/decisions.md 6.12 wrap rule). The Wallets key calls `leaveToChooser()` and never closes a lock. While a leave-blocker is active the key is `aria-disabled="true"` (not `disabled`, so it stays focusable), activation does nothing, and the reason `Finish or cancel what is running first.` is visible text beside/under it; expose blocker state from `src/lib/route.ts` as a subscribable (`useSyncExternalStore`-friendly `isLeaveBlocked` plus a notification when blockers change) and a hook in `src/hooks/useRoute.ts`. The Lock key calls `tearDownLock(queryClient, lockId)` and then `leaveToChooser()`; no `closeLock` is called inline in the header (AD-45). `leaveWallet(queryClient, walletId)` is added to `src/lib/teardown.ts`: it removes that wallet's account-scoped entries (`removeAccountScoped`) unless another wallet's open lock still holds the same `(network, address)`, and never closes a lock. `AppShell` calls it when the route moves from a wallet-side screen to `chooser` (Wallets key, Back, Lock), for the wallet that was left, and the left wallet's notices are cleared (the existing notice scoping on `enteredWalletId` does this; add a test). Arriving at the Chooser from a wallet-side screen moves focus to the Chooser h1 (`tabIndex={-1}`, `Wallets`); a cold start does not steal focus. Back from the Chooser leaves the app (no ping-pong). No `:focus` styling, no `outline-none`, no new colour token. The 44px coarse-pointer key size comes from the `Button` primitive.

**Never:** Leaving a wallet never calls a lock close. No second source of "current wallet". No new Select/picker. No Settings key (Story 7), no Configure key (Story 14), no card Lock key (Story 8).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Wallets key | in an open wallet | lands on `/` with focus on the `Wallets` h1; the wallet's lock still open; its account-scoped query data removed; its notices cleared | n/a |
| Browser Back | in a wallet entered from the Chooser | same as the Wallets key | n/a |
| Shared account | another open lock's wallet holds the same `(network, address)` | the left wallet's entries for it stay | n/a |
| Blocked | a screen has a leave-blocker | Wallets key `aria-disabled`, reason visible, press does nothing | n/a |
| Lock key | open wallet with an Open Check | `tearDownLock` runs, then `leaveToChooser()`; lock closed; card flips to Locked; Back does not return to a wallet just locked | n/a |
| No Open Check | open wallet with `openCheck: 'none'` | no Lock key | n/a |
| Locked wallet header | Unlock view showing | Wallets key only (no NetworkPlate, no Lock) | n/a |
| Picker | wallets.length > 1 | no `Select` in the header | n/a |
| Cold start | launch at `/` | Chooser, focus not moved | n/a |

## Code Map

- `src/components/AppHeader.tsx` -- current header: nameplate, picker `Select` (remove), `NetworkPlate`, Lock icon key calling `closeLock` directly (replace). Rework here.
- `src/components/AppShell.tsx` -- renders `AppHeader` on wallet-side routes; route-change effect for `leaveWallet` and the Chooser h1 focus (previous-route ref).
- `src/pages/Chooser.tsx` -- h1 `Wallets`; make it focusable (`tabIndex={-1}`) and accept a focus signal from `AppShell`.
- `src/lib/route.ts` -- `blockers`, `blockLeaving`, `leaveToChooser`; add `isLeaveBlocked`/subscription; notify on blocker change. `src/hooks/useRoute.ts` -- `useLeaveBlocker` exists; add a reader hook.
- `src/lib/teardown.ts` -- `removeLockedAccountData` (the stillReadable pattern to mirror), `tearDownLock`; add `leaveWallet`.
- `src/lib/notify.tsx` and `src/App.tsx` -- notice scoping by wallet in view (Story 3); verify, do not redo.
- `src/components/wallet/NetworkPlate.tsx` -- mounted inside the wallet header only.
- `docs/decisions.md` section 6.12 -- records that the picker is removed (Wallets key, then Open); edit it, do not restate the rule elsewhere.
- Existing tests touching the picker: `src/**/network-display.test.tsx` (picker cases at ~62-80), `src/__tests__/locked-no-ledger-request.test.tsx`, `src/components/__tests__/AppShell.test.tsx`; update, never weaken.

## Tasks & Acceptance

**Execution:**
- `src/lib/route.ts`, `src/hooks/useRoute.ts` -- subscribable blocker state -- AD-33
- `src/lib/teardown.ts` -- `leaveWallet` -- AD-38
- `src/components/AppHeader.tsx` -- wallet header per the contract; picker removed -- AD-45, FR-14
- `src/components/AppShell.tsx`, `src/pages/Chooser.tsx` -- `leaveWallet` on leaving, Chooser h1 focus on arrival from a wallet -- UX-DR10
- `docs/decisions.md` -- 6.12 records the picker's removal
- Tests: header contents per lock state; Wallets key leaves without closing the lock and focuses the h1; blocked key is `aria-disabled` with visible reason and does nothing; Lock key calls teardown then leave, no inline `closeLock`; `leaveWallet` removes account-scoped entries and keeps a shared account's; notices of the left wallet clear; no `Select` in the header; Back from a wallet lands on the Chooser. A test fails if `leaveWallet` is not called on leaving, and one fails if the Wallets key closes the lock.

**Acceptance Criteria:**
- Given the user is in a wallet, when they press Wallets or Back, then they land on the Chooser with focus on the `Wallets` h1, the lock still open, the wallet's query data removed unless another open lock holds the same `(network, address)`, and its notices cleared.
- Given a screen blocks leaving, then the Wallets key is `aria-disabled` with the reason visible.
- Given a wallet header for an open lock, then it shows the Wallets key, `NetworkPlate` and, when the Open Check is not `none`, Lock; a locked wallet's header is the Wallets key alone.
- Given Lock is pressed, then `tearDownLock` runs and then `leaveToChooser()`, with no inline `closeLock`.
- The picker `Select` is gone and `docs/decisions.md` 6.12 records it.
- `bun run lint`, `bun run build`, `bun run test`, `bun run check:contrast` pass.

## Spec Change Log

## Review Triage Log

### 2026-10-28 — Review pass
- verdicts: blind hunter 10, edge-case hunter 9, verification gap 2 plus 1 note, intent alignment descriptive; grouped by root cause into the rows below — medium 1 (patched), low 2 deferred, rest false or rejected as low
- findings:
  - `[medium]` `patch` The header Lock key closed the lock while a screen blocked leaving, then `leaveToChooser` did nothing, stranding the user on the Unlock view mid-task (flagged by all four layers) — Lock is now `aria-disabled` with the same visible reason and does nothing while blocked; test added (lock stays open).
  - `[low]` `defer` `leaveWallet` trigger only on `chooser`, and the previous-route ref following `activeWalletId` — see deferred.
  - `[medium]` `defer` Blocked-reason layout, 44px, `opacity-60` — see deferred (browser pass).
  - `[false]` `reject` Header and shell use different notions of the current wallet — the shell renders the in-wallet screens only for `route.walletId === activeWalletId` and an existing wallet and resets otherwise, and `WalletScreens` guards the task screens, so the header's active wallet is the wallet in view.
  - `[false]` `reject` Focus is lost if the Chooser h1 is not mounted when the effect runs — the Chooser renders in the same commit and child DOM exists before the parent's effect.
  - `[low]` `reject` Wallet-to-wallet route without passing the chooser, blockers reset elsewhere, test cleanup for `release()` and fake timers, other docs naming the picker, in-flight reads not cancelled — wallets are entered only from the Chooser, `blockers` changes only in `blockLeaving` and its release, the tests pass in order and clean up, `docs` greps found no other picker text, and `removeAccountScoped` removes queries whose observers are already unmounted.

## Verification

**Commands:**
- `bun run lint` -- expected: no errors
- `bun run build` -- expected: `tsc -b` and Vite build succeed
- `bun run test` -- expected: all pass
- `bun run check:contrast` -- expected: pass

**Manual checks (if no CLI):**
- Real-browser pass of Chooser, Open, Wallets key, Lock and Back at phone width in both themes; run by the orchestrator after this story if the implementer has no browser.

## Auto Run Result

Status: done

- Summary: The wallet header is the Wallets key, `NetworkPlate` and Lock (both only for an open lock; Lock only with an Open Check) or the Wallets key alone for a closed lock; the picker `Select` is removed. Wallets leaves without closing the lock; Lock runs `tearDownLock` then `leaveToChooser()`; both wait, `aria-disabled` with a visible reason, while a screen blocks leaving. `leaveWallet` sheds the left wallet's account-scoped data (keeping a shared account's) and focus lands on the Chooser h1.
- Files: `src/components/AppHeader.tsx`, `src/components/AppShell.tsx`, `src/pages/Chooser.tsx`, `src/lib/route.ts`, `src/hooks/useRoute.ts`, `src/lib/teardown.ts`, `docs/decisions.md` (6.12), and tests (`AppHeader` new, `AppShell`, `teardown`, `notice-scope`, `network-display`).
- Review: 1 patch applied (medium), 2 deferred, the rest rejected with reasons above.
- Follow-up review recommended: false.
- Verification: `bun run lint`, `bun run build`, `bun run test` (1484 tests), `bun run check:contrast` pass after patches.
- Residual risk: no real-browser pass yet (the story's checkpoint); stories 5 and 6 now ship together on this branch.
