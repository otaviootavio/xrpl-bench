---
title: 'Mainnet Import states one neutral fact'
type: 'feature'
created: '2026-11-02'
status: 'done'
baseline_revision: 'dd9ad1216219179f84ba70834aba5841164afc19'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/DESIGN.md'
  - '{project-root}/docs/agents/INDEX.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** A user importing a Seed on Mainnet is not told that a Seed used on another Network is the same key on Mainnet (CAP-5, FR-93). Without it, the one-network-per-Wallet rule can hide that the key is shared.

**Approach:** Add one fixed sentence to `check-words.ts` and show it on the Review step only when the flow is an Import and the Network is Mainnet, beside the "Real funds" line. It is display only: it feeds nothing, blocks nothing.

## Boundaries & Constraints

**Always:** The sentence is exactly "A Seed you used on another Network is the same key on Mainnet." (13 words, under 21). It lives in `check-words.ts` with the other plain wording. It renders in the Review's footer line group, next to the "Real funds" badge. Plain text, no new colour token, nothing styles `:focus`, no `outline-none`. Meaning is carried by words.

**Never:** Do not pass it to, or derive it from, `checkWalletRequest` or `describeOptions`; it must not change `verdict`, `busy`, or the Import button's disabled state. Do not show it on Create, Testnet, Devnet, any walk step, the chooser, Configure or Unlock. Do not change the quiz steps, the duplicate check, or the existing consequence line. Do not add a migration, reset screen or old-record handling (AD-48). Do not change the wording without the owner.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Import on Mainnet | Review step, `importSource` set, network `mainnet` | Sentence shown beside "Real funds"; Import wallet works as before | No error expected |
| Import on Testnet or Devnet | Review step, import, network not mainnet | Sentence absent | No error expected |
| Create on Mainnet | Review step, no `importSource`, network `mainnet` | Sentence absent; "Real funds" and the existing consequence line unchanged | No error expected |
| Import, Network changed via Back to step 1 | Mainnet then Testnet (or reverse) | Sentence follows the current Network on the next Review | No error expected |
| Blocked Import on Mainnet | `verdict.ok` false | Sentence still shows; the blocked alert and verdict are the same as without it | Existing alert |

</intent-contract>

## Code Map

- `src/components/wallet/check-words.ts` -- plain wording home. `createConsequence(network, imported)` (line ~33) is the pattern. Add `IMPORT_MAINNET_FACT` and `importMainnetFact(network, imported): string | null` (non-null only for `mainnet` and `imported`), so the rule has one home.
- `src/components/wallet/CreateWalletFlow.tsx` -- `ReviewStep` call at ~720 with `footer` holding the `<p id={group-consequence}>` (Badge "Real funds" plus `createConsequence`, ~724-728). `importSource` (set only when `mode === 'import'`, see `AddWalletScreen.tsx` ~190) and `network` are in scope. Add the sentence as a second `<p>` in the footer, rendered only when `importMainnetFact(...)` is non-null. Do not touch `verdict` or `createButton`. Line ~707-711 shows a separate "Real funds" badge for walk steps only; leave it.
- `src/components/wallet/WalletQuestions.tsx` -- `ReviewStep` (~139) already takes `footer`; no change expected. A test (`create-wallet-flow.test.tsx` ~1196) requires `answerRows`/`<dl>` to stay inside `ReviewStep`; keep the sentence out of `answerRows`.
- `src/components/wallet/AddWalletScreen.tsx` -- read only; the Import path passes `importSource`.
- `src/components/wallet/__tests__/check-words.test.tsx` -- "Review ... short sentences" test (~110) lists texts checked for under 21 words; add the new sentence there.
- `src/components/wallet/__tests__/add-wallet-import.test.tsx` -- test "the Review says what the imported wallet holds" (~652) already walks Testnet then Mainnet; helpers `openImport`, `typeSeed`, `click`, `button`, `text`. Add the new cases here (Import Mainnet shows, Import Testnet/Devnet hides).
- `src/components/wallet/__tests__/create-wallet-flow.test.tsx` -- "consequence line on the Review" (~1442) has `mount`, `switchNetwork`, `goToStep`. Add: Create on Mainnet does not show it.
- Read-only evidence: `checkWalletRequest` lives in `src/lib/crypto/policy`; the flow computes `verdict` from the options, not from the footer. No other file renders the Review.

## Tasks & Acceptance

**Execution:**
- `src/components/wallet/check-words.ts` -- add `IMPORT_MAINNET_FACT` (exact sentence) and `importMainnetFact(network, imported)` -- single home for wording and the show rule.
- `src/components/wallet/CreateWalletFlow.tsx` -- render `importMainnetFact(network, !!importSource)` as a second line in the Review footer, with an id on it only if needed -- display only, beside the badge.
- `src/components/wallet/__tests__/check-words.test.tsx` -- assert the exact sentence, `importMainnetFact` returns it only for (`mainnet`, true) and `null` for the other five combinations, and add it to the under-21-words list.
- `src/components/wallet/__tests__/add-wallet-import.test.tsx` -- Import on Mainnet shows the sentence and "Real funds" on the Review; Testnet and Devnet do not; with Mainnet chosen the Import wallet button still imports (the `acquire` / import call happens) -- nothing blocks.
- `src/components/wallet/__tests__/create-wallet-flow.test.tsx` -- Create on Mainnet Review does not show the sentence (fails if the rule ignores `imported`).
- A source-level test (same file as the Import tests) -- `check-words.ts` text holds the sentence once, and no file under `src/lib/crypto/` (policy) mentions it, so it cannot become an input to `checkWalletRequest`.

**Acceptance Criteria:**
- Given an Import with Mainnet chosen, when the Review step renders, then "A Seed you used on another Network is the same key on Mainnet." shows beside "Real funds".
- Given that Review, when the user presses Import wallet with a valid setup, then the import proceeds exactly as without the sentence, and the verdict is unchanged.
- Given Create (any Network), or Import on Testnet or Devnet, when the Review renders, then the sentence is absent.
- Given the sentence, when its word count is taken, then it is under 21 words and lives in `check-words.ts`.
- Given the story hand-back, then it reports to the owner: the release note (FR-49) is not in the repository, and its line must say older multi-network wallets are not supported (AD-48).

## Spec Change Log

## Review Triage Log

### 2026-11-02 — Review pass
- verdicts: 24 findings — high 0, medium 0, low 13, false 11, maybe-false 0
- findings:
  - `[false]` `[reject]` Blind: fact not in the Import button's aria-describedby — the describedby (CreateWalletFlow.tsx ~597) names the consequence only, but the fact is a plain paragraph in the same plate, read in order by a screen reader; nothing is lost, and the spec says it feeds nothing.
  - `[low]` `[patch (fixed)]` Blind: importMainnetFact called twice in the JSX — real, two call sites could drift; fix is a direct one-line local const (fixed: computed once into a local `fact` const before the return).
  - `[false]` `[reject]` Blind: sentence vague or misleading, test pins exact string — the wording is settled by the owner and the contract says not to change it; pinning it is the story's own test.
  - `[false]` `[reject]` Blind: muted text may fail contrast and colour alone conveys rank — `text-muted-foreground` is the same pairing Lead and row notes already use on this surface and is covered by check:contrast; the meaning is in the words.
  - `[low]` `[patch (fixed)]` Blind: Testnet/Devnet loop never confirms the Review was reached, so `not.toContain` can pass vacuously — real; fix is one assertion that the Import wallet button is present before the absence check (fixed: the test now asserts the Import wallet button is present before the absence check).
  - `[false]` `[reject]` Blind: Mainnet branch calls submit() with no seed typed — `submit()` types the Seed itself (add-wallet-import.test.tsx line 95) and walks to Import wallet; bundling is style only.
  - `[false]` `[reject]` Blind: section equality could pass when both are null — "Real funds" sits in ReviewPlate, a `<section>`, so it is never null and the fact would fail the equality if outside it.
  - `[low]` `[reject]` Blind: source-scan test is cwd-relative, covers only src/lib/crypto — the spec prescribes this test, `checkWalletRequest` lives in src/lib/crypto/policy.ts, other tests in the file read relative paths the same way, Node is 22; unlikely to bite and the fix adds complexity.
  - `[low]` `[reject]` Blind: `network: string` is untyped against a closed union — matches `createConsequence` and the spec's golden shape; a typo is unlikely and a union change is wider than this story.
  - `[low]` `[reject]` Blind: no test for Onboarding Mainnet Import or for the Network changed via Back — the rule is a pure function of the current `network` state, so it follows the change; unlikely to regress, fix adds tests only.
  - `[low]` `[reject]` Blind: no plain-wording check, narrow-width test, or visual verification noted — visual checks are the spec's Verification manual step, not a code defect; the sentence is under 21 words and fixed.
  - `[false]` `[reject]` Blind: no docs/decisions.md or sprint-status update, story file untracked — not a defect in the code; the fix edits docs and the spec, outside this build.
  - `[low]` `[patch (fixed)]` Edge: absence assertion passes if the flow stalls before the Review — same defect as the Blind vacuous-Review finding; same fix (fixed: the test now asserts the Import wallet button is present before the absence check).
  - `[false]` `[reject]` Edge: Mainnet submit path has no typeSeed — `submit()` calls `typeSeed` first; the path imports with a seed.
  - `[false]` `[reject]` Edge: fact not in aria-describedby — same refutation as the Blind finding.
  - `[false]` `[reject]` Edge: two footer siblings may lack spacing at 320px — ReviewPlate is `flex flex-col gap-3`, so fragment children are spaced by the plate.
  - `[low]` `[patch (fixed)]` Edge: importMainnetFact evaluated twice — same defect as the Blind double-call finding; same fix (fixed: computed once into a local `fact` const before the return).
  - `[low]` `[reject]` Edge: cwd-relative paths and `recursive` readdir — same as the Blind source-scan finding; Node 22 supports it and the directory has real files.
  - `[low]` `[reject]` Edge (claim): no test for Back to step 1 changing Network — same as the Blind coverage finding; state-driven, unlikely to regress.
  - `[low]` `[reject]` Edge (claim): no test for a blocked Mainnet Import showing the sentence — the footer is outside the `verdict` branch, so it renders regardless; unlikely to regress and the fix only adds a test.
  - `[false]` `[reject]` Edge (claim): adjacency to the badge unverified — the fact is the next sibling in the same plate right under the badge line, as the Code Map prescribes; same-section is what the spec asks.
  - `[false]` `[reject]` Auditor: render site is CreateWalletFlow.tsx, not WalletQuestions.tsx — the story's Code Map says exactly this (ReviewStep takes `footer`, no change expected); no divergence from the contract.
  - `[low]` `[reject]` Auditor: "not an input to checkWalletRequest" covered only indirectly — the source scan covers policy.ts where it lives, and the fact is not passed to it in the diff; unlikely to regress.
  - `[low]` `[reject]` Auditor: no visual or browser evidence at 320/390/desktop, themes, zoom — that is the spec's manual Verification step, run after the gates; not a code defect.

## Design Notes

Sentence wording is the spec's call for PRD open item 14 and is settled; change it only with the owner. It says nothing about the user's own history: it is a neutral fact, not a warning, so it does not block and uses no alert role. It is a footer line, not an `answerRows` row, because it has no Change button and is not an answer.

Golden shape:
```
export const IMPORT_MAINNET_FACT = 'A Seed you used on another Network is the same key on Mainnet.'
export const importMainnetFact = (network: string, imported: boolean) =>
  imported && network === 'mainnet' ? IMPORT_MAINNET_FACT : null
```

## Verification

**Commands:**
- `bun run lint` -- expected: clean
- `bun run build` -- expected: `tsc -b` and Vite succeed
- `bun run test` -- expected: all pass, including the new cases
- `bun run check:contrast` -- expected: pass

**Manual checks (if no CLI):**
- Playwright (never the user's browser, never fund or sign on Mainnet): open Add wallet, choose Import, type a throwaway test Seed, choose Mainnet on step 1, go to the Review, and look only. Confirm the sentence sits beside "Real funds"; do not press Import wallet on Mainnet. Repeat on Testnet and Create: absent. Check 320, 390 and desktop widths, both themes, 200% zoom: no clipping, no horizontal scroll.

## Auto Run Result

### Summary
The Import Review step on Mainnet now shows one fixed neutral sentence, "A Seed you used on another Network is the same key on Mainnet.", below the Real funds badge and consequence line. It is display only: it does not feed the check, the verdict, or the Import button. It is absent on Testnet, Devnet and on Create.

### Files changed
- src/components/wallet/check-words.ts: adds the IMPORT_MAINNET_FACT sentence.
- src/components/wallet/CreateWalletFlow.tsx: renders the sentence on the Review step only for Import on Mainnet.
- src/components/wallet/__tests__/add-wallet-import.test.tsx: tests for shown on Mainnet Import, absent on Testnet/Devnet, follows Network changes, button stays enabled.
- src/components/wallet/__tests__/check-words.test.tsx: tests for the sentence wording and length.
- src/components/wallet/__tests__/create-wallet-flow.test.tsx: test that Create on Mainnet does not show it.

### Review findings
High 0, medium 0, low 13, false 11, maybe-false 0. Nothing patched at high or medium; every rejected finding and its reason is in the Review Triage Log. Deferred: none.

### Verification
- Four gates passed (lint, build, test, check:contrast). Full suite: 1836 passed in 126 files (0 failed, 0 skipped). Story files: 164 passed.
- Browser pass: fresh Playwright profile against a dev server on port 5225, stopped afterwards. Created Alpha on Testnet, Beta on Devnet, and an unsaved Import of a throwaway Seed. A CDP virtual authenticator got past the passkey step. Import wallet was never pressed on Mainnet and no real funds were used.
- Chooser: a card per wallet with name, address and Network; Locked and Open cards side by side; Devnet carries a "Not stable" label in words. Open on a locked card goes to that wallet's Unlock and a successful unlock lands in the wallet; Open on an open card goes straight in. Configure has no Other networks section. The Wallets button and browser Back return correctly and the heading takes focus.
- Import quiz: five steps, focus lands on each heading after Next and Back, Seed, Label and Network survive Back to step 1, and changing Network shows "The later questions start again." with the Seed kept.
- Review fact: appears once, only on Mainnet Import, below the Real funds badge and consequence line in the same plate. Absent on Testnet, Devnet and Create Mainnet; follows Network changes; raises no alert; the Import button stays enabled.
- Widths 320, 390 and 1280 in light and dark, plus 320x568 and 320x400 (real 200% zoom): no horizontal scroll or clipping; primary action reachable.
- Screenshots: /tmp/claude-1000/-home-otavio-xxx-xrpl-wallet/c4ce42c4-8ea1-4e40-a6c7-c1d935b46f31/scratchpad/e22/shots-5/ (also in the repo's .playwright-mcp folder).
- Audit score 18/20; no P0 or P1.

### Residual risks (non-blocking P2/P3)
- P3: controls are about 32px high (Open and Lock 53x32), under the 44px touch guideline. App-wide, not a regression of this story.
- P3: on Mainnet Import Review at 320x568 and 320x400 the Real funds badge, consequence line and fact sit under the sticky footer until scrolled. Buttons stay reachable.
- P3: a CSS zoom of 2 at 640 wide is a test artifact (100dvh); real 200% zoom is fine.
- P3: the fact paragraph in CreateWalletFlow.tsx (~line 727-733) has no spacing of its own and relies on the Review plate spacing; the browser pass showed it sitting clear, but it is worth a glance at 320px.
- P3: the Create button's aria-describedby points only at the consequence line, so a screen reader user does not hear the fact on press. Deliberate, optional.
- P3: the fact uses text-sm text-muted-foreground; check:contrast passed.
