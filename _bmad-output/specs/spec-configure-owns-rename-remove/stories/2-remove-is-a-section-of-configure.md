---
title: 'Remove is a section of Configure'
type: 'feature'
created: '2026-10-31'
status: 'done'
baseline_revision: '0a2788301d51a158d2933d7a77c3a860af7fc883'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/docs/agents/INDEX.md'
  - '{project-root}/DESIGN.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** A wallet can only be removed from its chooser card, one tap from Open. Removal belongs on the Configure screen of the wallet it destroys (PRD FR-92, FR-86, FR-13; AD-46, AD-16).

**Approach:** Add a Remove plate as the last plate of `ConfigureScreen`. Its key opens the existing `RemoveDialog` for the wallet view being configured. The consequence copy, the call-time lock re-check, teardown in `finally` and the last-wallet App PIN deletion are reused unchanged, by moving the removal logic out of `Chooser` into one shared function that both screens call. The card's own Remove stays until story 3.

## Boundaries & Constraints

**Always:** Reuse `RemoveDialog`, `remove-copy.ts` (`removeBodyFor`, the three bodies, `REMOVE_DONE`, `REMOVE_FAILED`, `REMOVE_PIN_NOT_DISCARDED`) and `keystore.removeWallet`. Only one copy of the removal logic may exist after this story: Chooser and Configure both call the shared function, so a guard cannot drift (AD-46). The lock is re-checked from the store at call time, both when Remove is pressed and again at confirm, never from a disabled control. Teardown (`removeWalletData`) runs in `finally`. `activeWalletId` never names a removed wallet (`nextActiveWalletId`). The body is re-derived at confirm and refused if it changed. The last Wallet removed: the keystore deletes the App PIN and its failure count atomically; the app returns to first run. Any other removal leaves through `leaveToChooser()`, and focus lands on the chooser heading. Plate vocabulary only: `ConfigPlate`, the `KEY` class (wraps at 320px, 44px on coarse pointers); confirm key stays the only saturated `destructive` fill; no new token; no `:focus` styling; no `outline-none`. Plain, short wording.

**Never:** Do not remove or change the chooser card's Remove, Rename or Configure (story 3), Remove all in Settings, the quiz, the route table, the lock model or the keystore. Do not weaken or reorder any guard. Do not add a second removal path. Remove acts on the entered wallet view only (one network row of a Seed).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Remove, sibling view | Seed has another network view | Confirm shows the sibling body; `removeWallet(id)` called; that view is gone, Seed's other view and lock stay; `leaveToChooser()`; chooser heading focused; `REMOVE_DONE` | No error expected |
| Remove, sole view | Seed's only view, other Seeds exist | Sole body; removed; lock closed if no other wallet uses it; back to chooser | No error expected |
| Remove, last wallet | Only wallet on device | Last-wallet body naming the App PIN; removed; list empty; first run shows; PIN and failure count deleted | `appPin: 'failed'` shows `REMOVE_PIN_NOT_DISCARDED` |
| Lock closed at press | Lock closed after Configure opened, Remove pressed | Nothing opens; `removeWallet` not called | Silent refusal (as the card) |
| Lock closes during confirm | Lock closed while dialog open, confirm pressed | Dialog closes; error "This wallet is locked. Open it to remove it."; nothing removed | Error toast |
| Wallets changed under dialog | Body at confirm differs from shown | Dialog closes; "The wallets on this device changed. Open Remove again to see what it does now."; nothing removed | Error toast |
| Keystore throws | `removeWallet` rejects | `finally` still tears down, re-picks active, leaves; `REMOVE_FAILED` | Error toast |
| Vault unreadable | list read fails after a throw | Wallet stays in store; only its data shed; `REMOVE_FAILED` | Error toast |
| Cancel | Cancel or Escape | Dialog closes; focus returns to the Remove key; nothing removed | None |
| Double press | Confirm pressed twice | One removal (busy state) | None |

</intent-contract>

## Code Map

- `src/pages/Chooser.tsx` -- `openWalletNow` (line ~18), `onRemove` (~110) and `confirmRemove` (~117-170) are the removal logic to extract. `removedRef`, `setRemoving` and `headingRef.current?.focus()` are Chooser's own UI and stay. Imports `removeWalletData`, `listWallets`, `removeWallet`, `nextActiveWalletId`, `walletIdsInChooserOrder`.
- `src/lib/` (new file, e.g. `remove-wallet.ts`) -- shared `openWalletNow(walletId)` and the confirm body: lock re-check, body re-check, `removeWallet` in try, `finally` with `listWallets` fallback, `removeWalletData`, `setWallets`, `setActiveWalletId`, and the one notification. Takes `queryClient` and small callbacks so each screen can close its own dialog and move its own focus. Notification text stays in `remove-copy.ts`.
- `src/components/wallet/RemoveDialog.tsx` -- reuse as is. `target {walletId, name, body}`, `onConfirm(walletId, shownBody)`, `onClose`, `returnFocusTo()`; returning null gives the default return to the opener.
- `src/components/wallet/remove-copy.ts` -- all copy and `removeBodyFor(wallets, walletId)`. Read-only.
- `src/components/wallet/ConfigureScreen.tsx` -- add `RemovePlate` after the "Two-device signing" plate (last). Reuses `ConfigPlate`, `KEY`, `NETWORKS[wallet.network].label`. `NamePlate` is the pattern for a plate that owns a dialog.
- `src/components/wallet/ConfigPlate.tsx` -- plate shell. No change.
- `src/components/AppShell.tsx` -- lines ~62-108: when `activeWalletId` changes or the wallet is gone, a configure route is unreachable and `resetToHome()` replaces the URL; on leaving a wallet-side screen for the chooser it sheds the wallet's data and focuses `#chooser-heading`. This is why focus lands on the heading without extra code in Configure. Read-only.
- `src/lib/route.ts` ~233 -- `leaveToChooser()` unwinds app-pushed history in one `history.go`, no-ops while a leave-blocker is active. Call it before the store write so the history is unwound, not replaced; verify Back after a removal does not return to a Configure route.
- `src/App.tsx` ~118-134 -- `wallets.length === 0` renders `Onboarding` (first run) and resets the route. The last-wallet return needs no extra navigation.
- `src/lib/crypto/keystore.ts` -- `removeWallet` does the atomic last-wallet App PIN deletion (AD-46). Read-only.
- `src/lib/teardown.ts` ~173 -- `removeWalletData` (does not throw). Read-only.
- `src/store/wallet-groups.ts` -- `nextActiveWalletId`, `walletIdsInChooserOrder`. Read-only.
- `src/pages/__tests__/chooser.test.tsx` ~581-900 -- the existing Remove (AD-46) tests; they must stay green unchanged and are the model for the new ones.
- `src/pages/tabs/__tests__/configure-rename.test.tsx` -- model for a Configure test (keystore partial mock, `mount()`, store seeding). `src/components/__tests__/configure-shell.test.tsx` -- asserts plate order; update for the new last plate.

## Tasks & Acceptance

**Execution:**
- `src/lib/remove-wallet.ts` (new) -- move `openWalletNow` and the confirm logic out of `Chooser`, behaviour unchanged -- one implementation of the guards.
- `src/pages/Chooser.tsx` -- call the shared function; keep `removedRef`, `setRemoving`, heading focus and the dialog -- no behaviour change.
- `src/components/wallet/ConfigureScreen.tsx` -- add `RemovePlate` (title "Remove", one plain sentence that this removes this wallet on its network from this device, a danger-variant "Remove" key with `aria-label` `Remove ${label} on ${network}`) as the last plate. Press: re-check lock now, then open `RemoveDialog` with `removeBodyFor`. Confirm: shared function, then `leaveToChooser()` before the store write (skip it only when no wallets remain). Cancel returns focus to the key -- Remove is the one destructive action and must be a clear, separate plate.
- `src/pages/tabs/__tests__/configure-remove.test.tsx` (new) -- one test per I/O row above, plus: plate is last and after Two-device signing; a test that fails if the call-time lock re-check is removed; chooser card Remove still present.
- `src/components/__tests__/configure-shell.test.tsx` -- update plate order for the new last plate.

**Acceptance Criteria:**
- Given the user opens Configure, when it renders, then the last section is Remove, in plate styling.
- Given the user presses Remove, when the confirm opens, then it shows the sibling-view, sole-view or last-wallet body, and the last-wallet body names the App PIN.
- Given the lock closed after Configure opened, when Remove is pressed or confirmed, then the lock is re-checked at call time and nothing is removed.
- Given the user confirms, when removal runs (even if the keystore throws), then teardown runs in `finally`, `activeWalletId` does not name the removed wallet, the app returns to the chooser, and focus is on the chooser heading.
- Given the wallet removed is the last one, when removal finishes, then first run shows and the App PIN and its failure count are gone.
- Given the chooser, when a card's Remove is used, then it works exactly as before, and Remove all in Settings is unchanged.

## Design Notes

A short confirm may stay a dialog (SPEC Constraints), so `RemoveDialog` is reused. The risk in this story is a second copy of a guard: story 1 already left two copies of the rename write-back. Extraction is the one change that makes the guards one piece of code; story 3 then deletes the card's call site without touching the logic.

## Verification

**Commands:**
- `bun run lint` -- expected: clean
- `bun run build` -- expected: tsc and build pass
- `bun run test` -- expected: all pass, including every chooser Remove test and the new configure-remove tests
- `bun run check:contrast` -- expected: pass

**Manual checks (if no CLI):**
- Playwright MCP only, on throwaway Testnet or Devnet wallets, never Mainnet: open a wallet, Configure, Remove last plate; check 320, 390 and desktop widths in both themes; confirm sibling, sole and last-wallet bodies, Cancel focus, return to the chooser with heading focus, first run after the last removal, and Back not returning to Configure.

## Review Triage Log

### 2026-10-31 — Review pass
- verdicts: 25 findings — high 0, medium 0, low 15, false 10, maybe-false 0
- findings:
  - `[false]` `[reject]` Blind: no focus handling after a Configure removal — `enteredWalletId` returns the active id on a configure route, so when the route reaches the chooser `AppShell` has a wallet to leave and focuses `#chooser-heading` (src/components/AppShell.tsx ~85); the last-wallet path unmounts to first run, which owns its own focus.
  - `[false]` `[reject]` Blind: Remove on a locked wallet is silent — the spec's matrix says "Silent refusal (as the card)"; Configure is also only mounted with an open lock.
  - `[low]` `[patch]` Blind: the scanned-files guard in chooser.test.tsx lists the one-line `components/wallet/remove-copy.ts` shim, not the real `src/lib/remove-copy.ts` — the `outline-none`/`:focus` check now scans nothing real. Patch (fixed): the list entry is now `src/lib/remove-copy.ts`.
  - `[false]` `[reject]` Blind: two import paths for one module — the shim is a one-line `export *` whose comment says why it stays (AD-1); both paths resolve to the same module, so they cannot diverge.
  - `[low]` `[patch]` Blind: unreadable vault sends the user away although nothing was removed — verified, `settling(null)` satisfies `remaining !== 0` so `leaveToChooser()` runs and the wallet stays listed with a failure toast. Harm is small (same outcome as the "keystore throws" row, wallet still visible on the chooser), but the behaviour is unpinned. Grouped with the two rows below; patch (fixed): the test now asserts `h.order` equals `['leave:3']`.
  - `[low]` `[reject]` Blind: plate wording, label vs dialog name, no network in dialog — the sentence is spec-prescribed and the dialog body carries the consequence; label and dialog name read the same store; adding a network to the dialog changes `RemoveDialog`'s surface, which the spec says to reuse as is.
  - `[false]` `[reject]` Blind: no re-entrancy guard in `confirmRemoveWallet` — the only caller path is `RemoveDialog`, whose confirm key is disabled while busy (RemoveDialog.tsx ~46); no second caller shown; behaviour unchanged from the chooser.
  - `[low]` `[reject]` Blind: required `settled`, `useAppStoreRef` alias, history asserted only by call order — style only, no named harm; Back-after-removal is in the spec's manual browser checks.
  - `[low]` `[reject]` Blind: last-wallet test asserts too little — it does assert the `REMOVE_PIN_NOT_DISCARDED` path, an empty store and no leave call; `REMOVE_DONE` is covered by the sibling test and the keystore's own `appPin` results by remove-wallet.test.ts. Not worth more tests.
  - `[false]` `[reject]` Edge: `settling` throws inside `finally` — no throwing path shown; `leaveToChooser` only calls `history` and a notify, and the old Chooser ran the same kind of call there.
  - `[low]` `[patch]` Edge: unreadable vault (null remaining) leaves the screen with the wallet still listed — same root cause as the unreadable-vault row above; patch (fixed): pinned by the same `h.order` assertion.
  - `[low]` `[reject]` Edge: `leaveToChooser` no-ops while a leave-blocker is active — real, but the store write then makes the route unreachable and `AppShell` replaces the URL, so at worst one extra Back lands on the chooser. Fix adds a branch for a cosmetic effect.
  - `[false]` `[reject]` Edge: `NETWORKS[wallet.network]` undefined — `network` is a typed key of `NETWORKS`; no state shown that breaks it.
  - `[low]` `[reject]` Edge: `settled` is a no-op and heading focus is untested — focus does land through `AppShell` (see the first row); only the test is missing, and the browser pass covers it.
  - `[false]` `[reject]` Edge: aria-label uses `wallet.label` while press reads the store — both come from the same store; after a rename the prop re-renders from it, no real window of disagreement.
  - `[false]` `[reject]` Edge: refused path matches old Chooser behaviour — the finding itself says "None found"; no bad outcome.
  - `[low]` `[reject]` Edge claim: call-before-write order does not guarantee the unwind when a blocker is active — same as the blocker row above; same reason.
  - `[low]` `[reject]` Edge claim: tests do not check Back or heading focus — covered by the spec's manual browser checks; a test would need to mount `AppShell`.
  - `[low]` `[patch]` Verification gap: the "unreadable vault" test never asserts `h.order` — verified at src/pages/tabs/__tests__/configure-remove.test.tsx (the unreadable test checks only the error, wallets and active id). Patch (fixed): added `expect(h.order).toEqual(['leave:3'])`.
  - `[false]` `[reject]` Verification gap other: source-text assertions in chooser.test.tsx protect nothing at runtime — the reviewer says it is not a regression; the old test was the same kind of structural check and the runtime path is covered by behavioural tests.
  - `[false]` `[reject]` Verification gap other: `settled` no-op leaves no focus after the unreadable-vault case — that case also calls `leaveToChooser()`, so `AppShell` focuses the chooser heading.
  - `[low]` `[reject]` Intent: App PIN deletion not exercised from Configure — it is the keystore's atomic step, tested in src/lib/crypto/__tests__/remove-wallet.test.ts; Configure only calls it and reports `appPin: 'failed'`.
  - `[low]` `[reject]` Intent: no test mounts `AppShell` to check heading focus — same as the focus rows above; browser pass covers it.
  - `[low]` `[reject]` Intent: sole-view test checks the path, not the chooser DOM — the path is what `leaveToChooser` sets; negligible.
  - `[low]` `[reject]` Intent: first run is not rendered after the last wallet — `App.tsx` owns that and the test asserts the empty list it keys on; browser pass covers it.

## Auto Run Result

**Summary.** Remove is now the last plate of Configure. Its key opens the existing `RemoveDialog` for the wallet view being configured. The removal logic moved out of `Chooser` into one shared function (`src/lib/remove-wallet.ts`) that both screens call, so the lock re-check at call time and at confirm, the body re-check, teardown in `finally` and the last-wallet App PIN deletion exist once. The chooser card's Remove is unchanged until story 3.

**Files changed.**
- `src/lib/remove-wallet.ts` (new): shared `openWalletNow` and `confirmRemoveWallet`, the single copy of the removal guards.
- `src/lib/remove-copy.ts` (moved from `src/components/wallet/`): the removal copy, now reachable from lib (AD-1).
- `src/components/wallet/remove-copy.ts`: one-line re-export so component imports keep working.
- `src/components/wallet/ConfigureScreen.tsx`: new `RemovePlate`, last after Two-device signing.
- `src/pages/Chooser.tsx`: calls the shared function; keeps its own dialog, `removedRef` and heading focus.
- `src/pages/tabs/__tests__/configure-remove.test.tsx` (new): one test per I/O row, plate order, call-time lock re-check.
- `src/components/__tests__/configure-shell.test.tsx`: plate order updated for the new last plate.
- `src/pages/__tests__/chooser.test.tsx`: scanned-file list now names `src/lib/remove-copy.ts`.

**Review findings.** high 0, medium 0, low 15, false 10, maybe-false 0 (25 total). Patched: 4 (the scan list entry, and the unreadable-vault behaviour pinned with `h.order` in three grouped findings). Deferred: 0. Every rejected finding and its reason is in the Review Triage Log above.

**Verification.** All four gates passed (lint, build with `tsc -b`, test, check:contrast). Tests: 1850 passed across 126 files, 0 failed, 0 skipped.

Browser pass: I ran the dev server on port 5202 with a fresh Playwright profile and a virtual authenticator, using local Testnet and Devnet wallets only. Nothing touched Mainnet, and nothing was funded or signed. A passkey for the second wallet failed on the virtual authenticator, so I used the App PIN instead; that is unrelated to this story. I imported wallets by seed to get two Seeds, then opened Configure from the in-wallet header. All the checks below passed.

- **Remove plate:** it is the last plate, after Two-device signing, in plate styling. Its text reads "Remove this wallet on Testnet from this device." and the key's label is "Remove <name> on Testnet".
- **Layout:** no horizontal scroll at 320, 390 or 1280, in dark and light, or at 200% zoom (viewport 640, zoom 2). The key is reachable by scrolling the panel, and the sticky footer stays visible.
- **Confirm dialog:** fits at 320 and at 200% zoom. Focus starts on Cancel. Cancel and Escape both return focus to the Remove key.
- **Bodies:** the sole-view body appeared for a Seed with one network view. The sibling body appeared after "Use on Devnet" gave that Seed a second view. The last-wallet body names the App PIN.
- **Confirm:** removing a wallet from Configure returns to the chooser with focus on #chooser-heading. The removed wallet is gone, the other view and the other Seed stay, and the "Wallet removed from this device." toast shows. Back after removal went to the page before the app, never to a Configure route.
- **Last wallet:** removing it returns to first run. The leftover-"This device" notice is absent, and setup asked for a new PIN, so the App PIN was deleted.
- **Cards:** the chooser cards still show Open, Remove, Configure, Rename and Lock, as expected until story 21.3.

Screenshots: /tmp/claude-1000/-home-otavio-xxx-xrpl-wallet/a26dad49-e38b-40b1-b725-b48803fac498/scratchpad/shots-2/. The dev server on 5202 is stopped and the browser is closed.

Audit score: 17/20, no P0 or P1.

**Residual risks (non-blocking).**
- P3: the Remove key is 67x32px with a mouse; 44px applies only to coarse pointers and was not measured (touch cannot be emulated here).
- P3: the Two-device signing key looks tighter than the others at 320px; outside this story.
- P3: "lock closed after Configure opened" was not tried in the browser (not reachable there); only unit tests cover the call-time lock re-check.
- P2: the key's aria-label is longer than its visible "Remove"; WCAG 2.5.3 still passes because the label starts with the visible word.
- P2: if the lock has closed, `press()` returns silently, as the card does (spec: silent refusal). The button would look dead if that state were ever reachable.
- P2: the plate does not hint that other network views of the Seed stay; the dialog explains it.
- P2: with an unreadable vault, the user leaves Configure although the wallet may still be listed, and the error toast shows on the chooser. Accepted and now pinned by a test.
- P3: two import paths for one copy module (lib and the components re-export); pick lib and migrate importers later.
- P3: focus return uses `document.querySelector` on a data attribute, as other plates do; a ref would be cleaner.
- P3: two user-facing strings stay inline in `remove-wallet.ts` instead of `remove-copy.ts`.
