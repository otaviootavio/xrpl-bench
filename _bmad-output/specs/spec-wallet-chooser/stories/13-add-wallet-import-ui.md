---
title: 'Add wallet, Import UI'
type: 'feature'
created: '2026-10-28'
status: 'done'
baseline_revision: '784934a7ca1f27d2f2411e2311c289b83b5fec69'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-18-context.md'
  - '{project-root}/docs/agents/INDEX.md'
  - '{project-root}/docs/agents/keys-and-secrets.md'
  - '{project-root}/docs/agents/verifying-your-work.md'
  - '{project-root}/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-chooser-2026-10-19/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-10-19/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-10-19/DESIGN.md'
warnings: ['oversized']
deferred:
  - summary: >-
      The browser pass of Import (320, 390, desktop, both themes, Testnet, and a Mainnet-style flow up to the written-Seed confirmation) has not been run; this is the story's done checkpoint.
    evidence: |-
      jsdom cannot observe layout, focus return in a real browser or the passkey and PIN prompts. Run it in the final pass and treat any Seed left in a field, URL or log there as blocking.
    location: >-
      src/components/wallet/AddWalletScreen.tsx, src/components/wallet/CreateWalletFlow.tsx
    severity: high (unverified)
  - summary: >-
      PIN field validation runs before the Seed is parsed and probed, so with a PIN Open Check an invalid or duplicate Seed plus a missing PIN shows the PIN error first; the warning sheet's focus return targets the Seed field, which is disabled while the check runs.
    evidence: |-
      PIN fields are local inputs, not a prompt, and failing late would discard the typed Seed; the sheet falls back to the document. Worth a look in the browser pass.
    location: >-
      src/components/wallet/CreateWalletFlow.tsx, src/components/wallet/AddWalletScreen.tsx
    severity: low
  - summary: >-
      No test double-clicks "Import anyway" to show the keystore is called once, and the Settings-launched variant tests were removed with the old path; the new strings (Import wallet, Importing…, the cancel line) are not recorded in the chooser EXPERIENCE.md.
    evidence: |-
      The sheet resolver is idempotent and the form is `busy`; add the test and the doc strings with the next change here.
    location: >-
      src/components/wallet/__tests__/add-wallet-import.test.tsx, _bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-10-19/EXPERIENCE.md
    severity: low
---

<intent-contract>

## Intent

**Problem:** Import on `/wallets/new` still goes through `importAndStoreWallet` under the *active wallet's* open key, is offered only while a wallet is open, asks its own thinner questions, has no duplicate check before its ledger read, no written-Seed confirmation, and allows no-check imports. Story 12 built `keystore.importStoredWallet` (own new lock, same policy as Generate) with no UI.

**Approach:** Wire the Import form to `importStoredWallet`, using the same per-wallet questions component and the same written-Seed confirmation and PIN entry as Generate (AD-40). Import omits Seed Method and signature type (the Seed fixes the algorithm). The duplicate-address refusal comes first, before any prompt and before the ledger check. Import works with every lock closed. This is the highest-risk path: the Seed is held only in a ref, cleared in `finally` on every exit.

## Boundaries & Constraints

**Always:** **Order in the UI** (nothing is written until the last step): (1) parse the typed Seed with `parseSeedInput` (invalid: `INVALID_SEED_MESSAGE`, visible); (2) the **duplicate probe**: add a keystore function (e.g. `importDuplicateReason(seed): Promise<string | null>`, reusing the same check and `IMPORT_DUPLICATE_REASON` `importStoredWallet` uses, so the two cannot disagree) and call it BEFORE `checkBeforeImport`: a duplicate is refused with its visible, persistent reason, with NO ledger read (no `checkBeforeImport`, no `fetchAccountStateOnce`) carrying the address, and no prompt; (3) `checkBeforeImport` (the existing master-key pre-check and its warning sheet, `lib/seed-import.ts`, unchanged); (4) `importStoredWallet(input, ctx)` with `ctx = { pin, confirmWrittenSeed, appPinExpected }` exactly as Generate passes them. **Questions:** the same extracted component (`WalletQuestions`) and the same `describeOptions` as Generate, Import mode omitting Seed Method and signature type; extend `describeOptions` with an `imported` flag so Open Check `none` is unavailable for an import on every network with a visible reason (the policy refuses it, `IMPORT_NEEDS_OPEN_CHECK_REASON`), and every answer unavailable for any other reason keeps its `aria-disabled` reason; Import defaults to a PIN or passkey Open Check; the Mainnet floor, the written-Seed confirmation (`WrittenSeedConfirm`, one component, fed from the caller's ref) and the PIN entry reuse Generate's code, not a copy. Prefer parameterising `CreateWalletFlow` with an import mode (and a seed supplier) if that reuses the PIN, confirmation and questions with the least duplication; otherwise extract the shared pieces. **Seed handling (docs/agents/keys-and-secrets.md, NFR-2):** the typed Seed lives in an uncontrolled input and a ref, never in React state, a store, the URL, history state, storage, an error message or a log; the parsed Seed waits in a ref only while the warning sheet or the written-Seed confirmation is open; the ref and the input are cleared in `finally` on success, on failure and on unmount (unmount cleanup in an effect), and on Cancel of the warning sheet or the confirmation. **Result:** on success `announceAdded(meta.seedId)`, `Wallet added.`, `onClose()` (return to where the user came from); the wallet is NOT selected or entered: `setActiveWalletId` is never called by this screen (remove the call from `storeImported`), the route stays on the chooser, and the Chooser focuses the new card's h2 (Story 11's mechanism). **Failure:** any refusal or failure (invalid Seed, duplicate, policy refusal, wrong credential, locked out, keystore throw) is visible, persistent text on the screen (not only an auto-dismissing toast), no lock is left behind (the keystore rolls back), and the Seed is cleared. **Reachability:** Import is offered always (every lock closed included); remove the "only while an open wallet's key exists" condition, `useWalletOpenKey`, `activeLockId` and `fallbackNetwork` plumbing that existed for the old path. `AddWalletScreen.tsx` no longer imports or calls `importAndStoreWallet` (Onboarding keeps it); add `AddWalletScreen.tsx` to Story 12's no-chooser-side-caller test in `src/lib/crypto/__tests__/import-stored-wallet.test.ts`. The route carries only the screen name. No `:focus` styling, no `outline-none`, no new colour token; keys 44px on coarse pointers.

**Never:** No Seed in state, store, URL, storage, console or an error message. No `setActiveWalletId` or navigation into the wallet from Import. No import under an existing lock. No Open Check `none` import. No change to Onboarding's import path. No ledger read before the duplicate probe has passed.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Every lock closed | all cards locked, valid new Seed, PIN Open Check | imports under its own new lock; card added; focus on its h2; `Wallet added.`; nothing selected or entered | n/a |
| Invalid Seed | garbage | `INVALID_SEED_MESSAGE` visible; no probe, no read, no write; Seed cleared | n/a |
| Duplicate | Seed's address already on the device (any network) | the duplicate reason visible and persistent; NO ledger read, NO prompt, NO write; Seed cleared | n/a |
| Master-key warning | account has master disabled, or unreadable | warning sheet as shipped; Cancel abandons and clears; "Import anyway" continues | n/a |
| Mainnet passkey-only | Mainnet, passkey Open + Signing passkey/standard | written-Seed confirmation required before anything is written | cancel leaves nothing written |
| Open Check none | any network | unavailable in the questions with a reason; keystore also refuses | n/a |
| Policy/credential failure | wrong PIN, locked out, policy refusal | visible persistent text; no lock left; Seed cleared | n/a |
| Unmount mid-flow | leave the screen | ref and input cleared | n/a |
| Generate | unchanged | all existing Generate tests pass | n/a |

## Code Map

- `src/components/wallet/AddWalletScreen.tsx` -- Import form (label, `NetworkChoice`, uncontrolled `Seed` input `#wseed`, refs `seedInputRef`, `pendingImportSeedRef`, `pendingImportNetworkRef`), `storeImported` (calls `importAndStoreWallet` and `setActiveWalletId`), `handleAddImport`, `acceptImportWarning`, `cancelImportWarning`, the warning `Dialog`, `importOffered`/`vaultKey`/`activeLockId`/`fallbackNetwork` (remove). Rework here.
- `src/components/wallet/CreateWalletFlow.tsx` -- `CreateWalletFlow`/`CreateWalletForm`: PIN entry, `confirmWrittenSeed` (~221), `seedRef`, `WrittenSeedConfirm` (~427), `appPin` state, `createStoredWallet` call sites (~322, ~355). Import mode or shared extraction.
- `src/components/wallet/WalletQuestions.tsx` -- props include seed-method and algorithm rows; add hide flags for import.
- `src/lib/crypto/policy.ts` -- `describeOptions` (~224), `OptionsContext`, `IMPORT_NEEDS_OPEN_CHECK_REASON`; add `imported`.
- `src/lib/crypto/keystore.ts` -- `importStoredWallet` (Story 12), `IMPORT_DUPLICATE_REASON`, `listStoredWallets`; add the duplicate probe sharing one implementation with the writer.
- `src/lib/seed-import.ts` -- `checkBeforeImport`, `IMPORT_WARNING_COPY`, `INVALID_SEED_MESSAGE` (unchanged).
- `src/lib/chooser-signals.ts` -- `announceAdded`. `src/pages/Onboarding.tsx` -- keeps `importAndStoreWallet`.
- Tests: `src/pages/__tests__/create-entry-points.test.tsx`, `src/components/wallet/__tests__/create-wallet-flow.test.tsx`, `src/lib/crypto/__tests__/import-stored-wallet.test.ts` (the no-caller test), policy tests; existing Import tests in `src/pages/__tests__/` (grep `Add wallet` import cases).
- chooser `EXPERIENCE.md` (Flow 2, Exact strings) and `DESIGN.md`; AD-39 and AD-40 in the spine.

## Tasks & Acceptance

**Execution:**
- `src/lib/crypto/keystore.ts` -- the duplicate probe, one implementation with the writer -- AD-39
- `src/lib/crypto/policy.ts` -- `describeOptions` import flag: Open Check `none` unavailable with a reason on every network -- FR-65
- `src/components/wallet/WalletQuestions.tsx`, `CreateWalletFlow.tsx` (and `AddWalletScreen.tsx`) -- Import uses the shared questions, PIN entry and written-Seed confirmation; calls `importStoredWallet` -- AD-40
- `src/components/wallet/AddWalletScreen.tsx` -- order, refs and `finally` clearing, results, visible failures, no `setActiveWalletId`, Import always offered -- NFR-2, FR-82, FR-87
- `src/lib/crypto/__tests__/import-stored-wallet.test.ts` -- add `AddWalletScreen.tsx` to the no-caller test
- Tests: the full matrix; the duplicate refusal issues no ledger read (spy on `checkBeforeImport` and `fetchAccountStateOnce`, neither called) and no prompt; the Seed ref and input are cleared on success, on failure and on unmount (three tests) and on Cancel of the sheet; no Seed in any rendered text, error, toast or notice (assert on the DOM and the notice store); `setActiveWalletId` is never called and the route stays on the chooser; Import offered with every lock closed; Open Check `none` unavailable with a reason for an import on all three networks; the Mainnet passkey-only confirmation applies; every existing Generate and Onboarding test passes. A test fails if Import calls `setActiveWalletId`, and one fails if the duplicate probe runs after the ledger check.

**Acceptance Criteria:**
- Given the Import form is submitted, then it calls `importStoredWallet` using the shared questions component and the written-Seed confirmation, omitting Seed Method and signature type.
- Given the Seed field, then the Seed lives in a ref and is cleared in `finally` on success, failure and unmount, and is never in React state, a store, the URL or storage.
- Given a duplicate address, then the refusal shows before any prompt or ledger read.
- Given import succeeds with every lock closed, then the chooser shows the new card with focus on its h2 and `Wallet added.`, and the wallet is not selected or entered.
- Given import fails, then the failure is visible, persistent text and no lock is left behind.
- `bun run lint`, `bun run build`, `bun run test`, `bun run check:contrast` pass.

## Spec Change Log

## Review Triage Log

### 2026-10-28 — Review pass
- verdicts: blind hunter 14, edge-case hunter 10, verification gap 2 plus 4 notes, intent alignment descriptive; grouped by root cause into the rows below — high 1 and medium 4 and low 4 (patched), high (unverified) 1 and low 2 deferred, rest false or rejected as low
- findings:
  - `[high]` `patch` The typed Seed stayed in the old input element after the written-Seed step removed it from the page (the clear reached only the latest element), so a detached node held the Seed — the field's stable ref callback now clears it when it leaves the DOM; the tightened Mainnet Cancel test captures the original element and asserts it is empty. (A first attempt used an inline ref callback, which React re-runs on every render and would have cleared a typed Seed mid-flow; the full suite caught it and it was replaced by a stable callback.)
  - `[medium]` `patch` Switching Import to Generate left the typed Seed in the detached field — the Generate key clears it first; test added.
  - `[medium]` `patch` A probe or ledger check finishing after the screen was left went on to a ledger read and a warning sheet — each step after an await checks the screen is still mounted and stops.
  - `[medium]` `patch` An import's catch showed the raw error message, which is not ours to promise holds no Seed — an import shows a fixed message; test updated.
  - `[medium]` `patch` The Mainnet and Devnet choices and the custom Node were never asserted to reach the master-key check and the keystore — a parameterised test asserts the network reaches both.
  - `[low]` `patch` The Passkey-Derived branch ran ahead of the import branch — guarded with `!importSource`; a result with no Seed in Generate mode now reports instead of doing nothing; the cancel and refusal copy says `Nothing was imported.` in import mode; the Seed field turns off auto-capitalise and auto-correct.
  - `[high]` `defer` Browser pass of Import — see deferred.
  - `[low]` `defer` PIN-before-Seed ordering and sheet focus return; the double-click test and the doc strings — see deferred.
  - `[false]` `reject` The duplicate probe duplicates the writer's address derivation — the probe and the writer call one `duplicateReasonFor`, and a test pins that they agree; deriving the address twice from one Seed is the same function.
  - `[low]` `reject` Orphaned doc comment, source-text test brittleness, mocked `useQueryClient`, the written-Seed callback receiving the Seed as an argument, `describeOptions` flag name — cosmetic, the confirmation callback is the caller's own display step by design, and the runtime Seed-leak checks are real.

## Verification

**Commands:**
- `bun run lint` -- expected: no errors
- `bun run build` -- expected: `tsc -b` and Vite build succeed
- `bun run test` -- expected: all pass
- `bun run check:contrast` -- expected: pass

**Manual checks (if no CLI):**
- Browser pass of Import at 320, 390 and desktop in both themes on Testnet; a Mainnet-style flow up to the written-Seed confirmation without funding anything. Deferred to the final pass.

## Auto Run Result

Status: done

- Summary: The Import form on `/wallets/new` runs parse, then the duplicate probe (no ledger read, no prompt), then the master-key check and its warning sheet, then `importStoredWallet` under its own new lock, using the shared questions (Seed Method and signature type omitted), PIN entry and written-Seed confirmation. Import is offered with every lock closed, never selects or enters the wallet, announces the new card, and shows failures as persistent text. The Seed lives in an uncontrolled field and a ref, cleared on success, failure, Cancel, unmount, mode switch and when its field leaves the page.
- Files: `src/components/wallet/AddWalletScreen.tsx`, `CreateWalletFlow.tsx` (import mode), `WalletQuestions.tsx`, `src/lib/crypto/keystore.ts` (`importDuplicateReason`), `policy.ts` (`describeOptions` import flag), and tests (`add-wallet-import` new, `import-stored-wallet`, `policy`, `create-entry-points`, `seed-import-screens`).
- Review: 9 patches applied (1 high, 4 medium, 4 low), 3 deferred, the rest rejected with reasons above.
- Follow-up review recommended: true. A high finding (a Seed held in a detached field) and four medium findings were patched in the Seed-handling path; a real-browser check of Import is the story's done checkpoint and has not been run.
- Verification: `bun run lint`, `bun run build`, `bun run test` (1661 tests), `bun run check:contrast` pass after patches.
- Residual risk: the unrun browser pass; the stored record still does not mark itself imported (Story 12 deferred).
