---
title: 'First-run Import gets its own lock'
type: 'refactor'
created: '2026-11-02'
status: 'done'
baseline_commit: 'b76bd20141bfae32371097273f20c027b9085a61'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/DESIGN.md'
  - '{project-root}/docs/agents/INDEX.md'
  - '{project-root}/docs/agents/verifying-your-work.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** First-run Import (`Onboarding`) still sets up the old PIN vault and opens the legacy lock (`importAndStoreWallet` + `openLock(LEGACY_LOCK_ID)`), so the first imported Wallet shares a lock model no other Wallet has. Create already goes through `CreateWalletFlow`; Import has its own second path.

**Approach:** Move the Seed-import wiring out of `AddWalletScreen` into one shared module and use it from both screens. Onboarding's Import step renders `CreateWalletFlow` with that import source, so the first Wallet is made like any Wallet (own lock, App PIN on demand) and Onboarding's own import, PIN-setup and warning steps go. Nothing legacy is deleted here (story 2).

## Boundaries & Constraints

**Always:** The typed Seed lives in an uncontrolled input and a ref only, never state, URL, store or log (Guardrail 3); the shared code clears it on every exit and on unmount. Order stays: parse, duplicate probe, master-key pre-check and its warning, then `importStoredWallet` under a new lock. Onboarding keeps its two start buttons, so `pathChoice` stays unset there. The first imported Wallet is selected via `onDone` → `setActiveWalletId`, as Create does. A copy or layout change on Onboarding or Add wallet meets the mobile floor (320px, 200% zoom, 44px targets, primary action reachable).

**Never:** Delete `importAndStoreWallet`, `setUpVaultAuth`, `LEGACY_LOCK_ID` or any migration (story 2). Write a second import path. Change the duplicate rule, the Mainnet wording or the quiz questions. Drop a test that covers current behaviour: rewrite it.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First-run Import, key enabled | Clean install, valid Seed, Testnet | Quiz runs; Wallet written under its own new lock; Gate shows the wallet; no legacy lock opened | N/A |
| Master key disabled or account unreadable | Same, warning case | Warning sheet before any write; "Import anyway" writes, "Cancel import" writes nothing | Seed cleared on cancel |
| Invalid Seed | Not a Seed | Step 1 refuses with the existing message; nothing written | Message in the Seed field |
| Add wallet Import | Existing behaviour | Unchanged: same screens, same results | N/A |
| Leave mid-flow | "Back to start" while a write is in progress | Disabled; enabled again when the flow reports not in progress | N/A |

</frozen-after-approval>

## Code Map

- `src/pages/Onboarding.tsx` -- remove `import-seed`, `vault-setup`, `import-warning` steps, `commitToStore`, `handleVaultSetup`, `acceptImportWarning`, PIN and vault-key state, and the `setUpVaultAuth`, `LEGACY_LOCK_ID`, `importAndStoreWallet`, `NetworkChoice` imports; the Import button opens an import step rendering `CreateWalletFlow` with the shared import source, like the existing `create` step. Keep `passkeyAvailableForReturningUser` (story 2 removes it with `auth.ts`).
- `src/components/wallet/AddWalletScreen.tsx` -- lines 35-161 and the warning `Dialog` (201-220) hold the import wiring (refs, `seedTyped`, `setSeedInput`, `clearSeed`, `mountedRef`, `askWarning`/`settleWarning`, `importSource`). Extract them; keep the mode switch, `pathChoice`, `TaskScreen` and `announceAdded` here.
- `src/components/wallet/CreateWalletFlow.tsx` -- `ImportSource` (line 64) and the `importSource` prop; unchanged. Default label is `My Wallet`, as Onboarding's Import used.
- `src/lib/seed-import.ts`, `keystore.importDuplicateReason`/`importStoredWallet` -- reused as they are.
- Tests: `src/pages/__tests__/seed-import-screens.test.tsx` (Onboarding table, drives `#seed`/`#pin`), `src/pages/__tests__/create-entry-points.test.tsx` ("Import keeps its path", header comment), `src/components/wallet/__tests__/add-wallet-import.test.tsx` (must still pass untouched), `create-wallet-flow.test.tsx:1190` (scans Onboarding for retired names).

## Tasks & Acceptance

**Execution:**
- [x] `src/components/wallet/` (one new module, e.g. a `useSeedImport` hook returning `{ importSource, clearSeed, warningDialog }`) -- move the import wiring and warning dialog out of `AddWalletScreen` -- one import path for both screens
- [x] `src/components/wallet/AddWalletScreen.tsx` -- use the shared module; behaviour unchanged -- no regression in Add wallet
- [x] `src/pages/Onboarding.tsx` -- Import step renders `CreateWalletFlow` with the shared source, `onInProgressChange={setCreating}`, `onDone` selecting the Wallet, a "Back to start" button; delete the old steps and state -- first Wallet gets its own lock
- [x] `src/pages/__tests__/seed-import-screens.test.tsx`, `create-entry-points.test.tsx` -- rewrite the Onboarding cases to drive the quiz (Seed field, Next through the questions, Import wallet), keep the three outcomes (write, warn-then-write, cancel writes nothing) and assert `importStoredWallet` and no `setUpVaultAuth`/`openLock('legacy')` -- current behaviour stays covered
- [x] Add a test: first-run Import opens a lock whose id is not `legacy` -- CAP-1

**Acceptance Criteria:**
- Given a clean install, when the user imports a valid Seed at first run, then the Wallet has its own lock id, `setUpVaultAuth` is never called, and nothing opens `legacy`.
- Given Add wallet Import, when run, then `add-wallet-import.test.tsx` passes unchanged.
- Given the typed Seed, when the flow ends, is cancelled or unmounts, then the input and ref are empty and the Seed appears in no state, URL or storage.

## Implementation Notes

- New `src/components/wallet/useSeedImport.tsx`: the Seed-import wiring moved out of `AddWalletScreen` unchanged (refs, `seedTyped`, `setSeedInput`, `clearSeed`, the warning promise, `importSource`) plus the warning `Dialog` as `warningDialog`. Returns `{ importSource, clearSeed, warningDialog }`.
- `AddWalletScreen` uses the hook; `add-wallet-import.test.tsx` is untouched and passes.
- `Onboarding`: the `import-seed`, `vault-setup` and `import-warning` steps, the PIN and vault-key state and `commitToStore` are gone, with the `setUpVaultAuth`, `importAndStoreWallet` and `LEGACY_LOCK_ID` imports. Step type is `'choice' | 'create' | 'import'`. `ImportStep` is its own component so the typed Seed is dropped when the step is left.
- Review round 1 patches: success toast restored (`Wallet imported.`); tests for Back to start disabled while writing, unmount with the warning open, lock opened no later than the wallet list, and a step-count regex instead of `Step 1 of 5`; header comment rewritten.
- Browser round: the quiz actions are a sticky footer through `actionHost` (as Add wallet), "Back to start" moved above the flow and wraps (`h-auto min-h-8 w-fit max-w-full whitespace-normal py-1`).
- Not changed, on purpose: the Create step (same reachability gap, recorded in `deferred-work.md`), and all legacy code (story 2).
- The Playwright profile already held wallets on `localhost:5176` and `localhost:5177` (left from earlier sessions). They were not touched; the pass ran on clean origins `localhost:5391` and `127.0.0.1:5391`.

## Spec Change Log

## Review Triage Log

Iteration 0. Layers: blind-hunter (BH), edge-case-hunter (EC), verification-gap (VG), ui-mobile (UI). Verdicts are mine, not the reviewers'.

| # | Layer | Finding | Verdict | Evidence | Route |
|---|-------|---------|---------|----------|-------|
| 1 | BH, EC | No "Wallet imported." feedback on first-run Import | low | Old path called `toast.success`; `CreateWalletFlow` and Onboarding's Create path call no toast, so the Gate swaps to Main silently | patch |
| 2 | VG, BH | "Back to start" disabled-while-writing untested for Import | medium | Create-step case exists (`create-entry-points.test.tsx:105`); Import case only checks the button exists. Matrix row "Leave mid-flow" uncovered | patch |
| 3 | VG, EC, BH | Unmount with the warning open untested in Onboarding | low | Hook cleanup is covered through Add wallet (`add-wallet-import.test.tsx:558`), but acceptance criterion 3 names unmount and Onboarding has no case | patch |
| 4 | BH | Lock-before-wallet-list order no longer pinned | low | The old Onboarding test went with `commitToStore`; `create-wallet-flow.test.tsx` checks end state only (lines 693, 706) | patch |
| 5 | EC, BH | Hard-coded `'Step 1 of 5'` and cwd-relative paths in tests | low | `Step 1 of 5` at `seed-import-screens.test.tsx:106,191`; cwd-relative `readFileSync` is the repo's convention (`create-wallet-flow.test.tsx:1190`), so only the step literal is patched | patch (step literal only) |
| 6 | EC, BH | Onboarding header comment run-on and partly stale | low | Comment says selection waits for the whole flow while `finishBackup` commits first | patch |
| 7 | EC | `setActiveWalletId` after the Gate may unmount Onboarding, leaving no active wallet | false | `finishBackup` calls `setWallets` then `onDone` in one synchronous run; React flushes the store update after it. Same sequence as Create, which works | reject |
| 8 | EC | `acquire` catch leaves the Seed in `pendingSeedRef`, or returns refused when unmounted | false | Code moved unchanged from `AddWalletScreen`; the flow's `finally` calls `importSource.clear()` (`CreateWalletFlow.tsx:473`); the unmount effect clears the ref | reject |
| 9 | EC | Duplicate ids `wseed` / `wseed-note` if the hook is mounted twice | false | One screen mounts at a time; Add wallet and Onboarding never coexist | reject |
| 10 | EC, BH | No `useLeaveBlocker(creating)` on `ImportStep` | false | Onboarding is the Gate, not a route; its Create step has none either. Back is disabled while writing | reject |
| 11 | EC | First-run Import over a stale App PIN (`pinResidue`) untested | low | Create already runs the same quiz over the same residue, and the residue notice offers Remove all. Not caused by this change | reject |
| 12 | EC | Old unreadable-account test (raw transport error not shown) dropped | false | Same behaviour is unit-tested at the source: `src/lib/__tests__/seed-import.test.ts:63` | reject |
| 13 | EC | Passkey offer lost with the vault-setup step | false | The quiz asks the Open Check and Signing Check (passkey included) for every Wallet, FR-60 | reject |
| 14 | EC | `add-wallet-import.test.tsx` "passes unchanged" unverified | false | File not in `git status`; full suite 1864 of 1864 passed on my run | reject |
| 15 | UI | Primary action not pinned (no sticky footer) on first-run Import at 320x568 | medium (confirmed, fixed) | Browser pass: at 320x568 the step 1 Next ends 11px past the scroll area (100% text), and at 200% text Next is at y=1245 and Import wallet at y=5963 against a scroll area ending at 451. At 390x844 with the App PIN fields showing, Import wallet is at y=816 past 785. Violates the spec's Always clause | patch (round 2: sticky footer through `actionHost`, Import step only). Re-measured: reachable in all 5 combinations |
| 22 | UI | Create step (same card, inline action row) has the same reachability gap | medium | Same structure at `Onboarding.tsx` Create step; not caused by this story and outside its frozen intent (Import) | defer |
| 23 | UI (mine, browser) | "Back to start" overhangs the card by 34px at 320px / 200% text | medium (confirmed, fixed) | `whitespace-nowrap` base style; measured button right 291 vs card right 257. After the fix it ends 33px inside the card at 200% and is inside at all sizes. Document-width check was blind to it | patch |
| 16 | UI | Longer card description pushes the Seed field down | low | Same sentence as the Create step; cosmetic | reject |
| 17 | UI | Warning sheet `returnFocusTo` is a detached field on Onboarding | maybe-false (low) | Moved unchanged from Add wallet. NOT observed: the master-key warning needs an account with the master key disabled, which a throwaway Testnet key does not give; covered by unit tests only | defer |
| 18 | BH | "Back to start" discards quiz answers | false | Same as the Create step and by design; the Seed is cleared on purpose | reject |
| 19 | BH | Hook returns JSX that must be rendered once | low | Two call sites, both render it; a wrapper component adds surface for no caller | reject |
| 20 | BH | Spec file unfinished (tasks, notes, verification empty) | n/a | Fix is to edit this spec; filled in at the end of the build | reject |
| 21 | BH | Source-text test brittle | low | Same style as `create-wallet-flow.test.tsx:1190`; the behavioural lock-id test also exists | reject |

## Design Notes

The warning stays a sheet (as in Add wallet), not Onboarding's old full-page alert: one dialog, one copy of the behaviour. Onboarding's old Network picker is gone because the quiz's step 1 already asks Name and Network for Import.

## Verification

**Commands (final tree, run by me, not the build agent):**
- `bun run lint` -- clean (oxlint plus the seven repo checks)
- `bun run build` -- `tsc -b` and bundle succeeded
- `bun run test` -- 127 files, 1867 tests passed (1864 before this story's three added tests)
- `bun run check:contrast` -- all token pairs pass

**Browser pass (real Chromium through Playwright, virtual authenticator with PRF attached):**
- Under test: working tree on `b76bd20` plus this story's uncommitted changes, served by `bun run dev` on port 5391, clean origins (`localhost:5391`, then `127.0.0.1:5391`). Throwaway Testnet Seed generated for the pass, unfunded, never on Mainnet.
- Flow observed end to end at 390px light: Onboarding, Import, the five quiz steps, App PIN chosen at step 3, PIN set on the review step, Import wallet. The chooser then showed the Wallet open and active on Testnet with the Seed's address, and the toast `Wallet imported.`.
- **CAP-1 met:** the stored Wallet has `lockId` `fef76fb1-49ed-4f5c-afce-1af7bc3d6e91`, not `legacy`; IndexedDB `vault` holds `lock:fef76fb1-...` and the App PIN record; no `setUpVaultAuth` step was shown. (Read from IndexedDB, not from the UI.)
- Layout, measured by element rects (not document width) after the round 2 fixes, in each of 320x568 light 200% text (`html{font-size:200%}`), 320x568 dark, 390x844 dark, 390x844 light with the App PIN fields, 1280x800 light: Next, Import wallet, Back and Back to start are all inside the scroll area, no horizontal overflow, "Back to start" inside the card. Before the fix, at 320x568 and 200% text, Import wallet was at y=5963 against a scroll area ending at 451.
- Screenshots opened and checked: 390 light step 1 and review, 320 dark review and step 1, 320 light 200% review and step 1, 1280 light review. Not opened, not cited: the other captures in the run.

**Not observed (said plainly):**
- The master-key warning sheet in a browser, and focus return on Cancel (triage 17). A throwaway key cannot produce it; unit tests cover the behaviour, add-wallet-import covers the hook in its other host.
- Coarse-pointer 44px targets: only fine-pointer emulation was used; the button classes carry `pointer-coarse:h-11` and `min-h-11` from the primitives.
- The passkey Open Check path through the browser (App PIN was chosen); dark theme at 1280.
- The Create step of Onboarding was not changed and was not re-checked (deferred).

**375px and Impeccable audit (On Complete):**
- 375x667 light and dark: Next, Back to start and Import wallet reachable, inside the card, no horizontal overflow.
- `/impeccable audit` scoped to the first-run Import step and the warning sheet, detector `[]`: **17/20 (Good)** — Accessibility 3, Performance 4, Responsive 3, Theming 4, Implementation Integrity 3. No P0, no P1 open on the touched surfaces. Not comparable one-to-one with the earlier 14/20 and 15/20, which scored whole branches. Open P2s: warning sheet `returnFocusTo` points at a detached field (unobserved); sticky footer may cover a focused App PIN field (focus-obscured behaviour not tested); coarse-pointer height of "Back to start" not measured. P3: card description pushes the Seed field below the fold at 320px / 200% text. Out of scope and already in `deferred-work.md`: the Create step has the structure Import had before the fix (primary action below the fold at 320x568 is expected there; not measured).
