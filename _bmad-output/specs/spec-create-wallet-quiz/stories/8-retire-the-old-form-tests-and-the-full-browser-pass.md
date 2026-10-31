---
title: 'Retire the old form, tests, and the full browser pass'
type: 'feature'
created: '2026-10-31'
status: 'done'
baseline_revision: '51481035845a2a044eacb0aceb2bf5a5c3b13276'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/specs/spec-create-wallet-quiz/SPEC.md'
  - '{project-root}/_bmad-output/specs/spec-create-wallet-quiz/quiz-steps.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-20-context.md'
  - '{project-root}/docs/agents/verifying-your-work.md'
  - '{project-root}/DESIGN.md'
warnings: []
deferred:
  - summary: >-
      After "Back to start" on first-run Onboarding the button unmounts and keyboard focus falls to the page body.
    evidence: |-
      Pre-existing: the old "Back" button did the same (setStep('choice') at src/pages/Onboarding.tsx:304). The quiz's own steps do move focus to the heading; the entry choice screen has no focus move. Low harm; settle by checking where focus lands in the browser after the click.
    location: >-
      src/pages/Onboarding.tsx:304
    severity: low
---

<intent-contract>

## Intent

**Problem:** Story 20.8 (CAP-8, FR-91) is the close of Epic 20. The old form code is already gone (stories 4 to 7), but nothing proves it: first-run Onboarding still shows two controls named "Back" (the quiz's step Back and Onboarding's own leave button), and the quiz has not had a full real-browser pass or an audit across Create, Import, first run, both Networks, 320px, 390px, desktop, 200% zoom and both themes.

**Approach:** Confirm by search and by test that no old-form code remains, rename Onboarding's own leave action to "Back to start", fill any test gaps for keyboard and screen-reader behaviour, then run the browser pass and an Impeccable audit of the whole quiz, fixing P0 and P1 findings in this story.

## Boundaries & Constraints

**Always:** Policy tests (`describeOptions`, AD-28, creation, PIN, Seed backup, written-Seed confirmation) stay unchanged and pass. Only a test that assumes the old form is rewritten, and with the same assertion. Every colour comes from an existing token. Browser work uses the Playwright MCP only, on a dev server the run starts on its own port and stops after. Testnet or Devnet only for anything that proceeds past the Review.

**Never:** No change to `QuizShell.tsx` behaviour, `walk-questions.ts` legality, the policy, PIN entry, or the Configure screen. No new colour token, no `:focus` styling, no `outline-none`. Do not touch the user's own browser (no claude-in-chrome). Never create, fund or sign anything on Mainnet: Mainnet is walked to the Review and left. Do not touch the first-run Onboarding Import screen (`import-seed`, `vault-setup`): it is a separate screen, not the quiz. P2 and P3 audit findings are recorded, not fixed. No push.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First-run Create | Onboarding, Create path, any step | Exactly one button named "Back" (the quiz's), plus one named "Back to start" that returns to the entry choice | While a wallet is being written, "Back to start" stays disabled as today |
| Step 1 on Onboarding | Quiz on its first step | The quiz's Back is still `aria-disabled`; "Back to start" is the only working way out | None |
| Add wallet | `AddWalletScreen` | Unchanged: the screen's own "Wallets" back plus the quiz's Back, as named today | None |
| Old-form search | `src/` searched | No `isRecommended`, `customiseForced`, `customiseOpen`, Customise toggle, Recommended panel, `RecommendedList`, `SHORTCUT_INDEX` or "Walk me through it" in non-test source; `WalletQuestions.tsx` holds no summary list | A hit fails the test |

</intent-contract>

## Code Map

- `src/pages/Onboarding.tsx` -- the `step === 'create'` block (~292-312): `CreateWalletFlow` (no `actionHost`, so its footer is inline) then a second `Button variant="outline"` labelled "Back" that does `setStep('choice')` and is `disabled={creating}`. Rename its label to "Back to start". Read-only: the `choice`, `import-seed`, `vault-setup`, `import-warning` blocks.
- `src/components/wallet/QuizShell.tsx` -- read-only. Footer is Back (aria-disabled on step 1), optional secondary, then Next or `finalAction`; focus goes to the step `h2` on a step change; "Step n of N" is text.
- `src/components/wallet/CreateWalletFlow.tsx` -- read-only unless the audit finds a P0/P1. `quizSteps` (~650: `name-network` titled "Create or import" with `pathChoice`, else "Name and network"; the walk; `review`). The source-search test at `__tests__/create-wallet-flow.test.tsx` ~1160 already bans `RecommendedList|SHORTCUT_INDEX|Walk me through it` and `isRecommended|customiseForced|customiseOpen`.
- `src/components/wallet/WalletQuestions.tsx` -- read-only: `NameAndNetworkStep`, the questions renders, `ReviewStep`. Unavailable answers use `aria-disabled` with their reason as text; the reset line is `role="status" aria-live="polite"` (~105).
- `src/components/wallet/AddWalletScreen.tsx` -- read-only: renders the flow with `actionHost` (sticky footer), keyed by mode.
- `src/index.css`, `DESIGN.md`, `scripts` for `check:contrast` -- read-only: compare the quiz's classes with existing tokens.
- Tests: `src/components/wallet/__tests__/create-wallet-flow.test.tsx`, `add-wallet-import.test.tsx` (its `first-run Onboarding` block ~748 renders `<Onboarding />` and clicks "Create a new wallet"), `quiz-shell.test.tsx` (focus and counter), `walk-questions.test.tsx`, `check-words.test.tsx`, `network-reset.test.tsx`. `src/pages/__tests__/create-entry-points.test.tsx` covers Onboarding and the Add wallet entry points.
- Carried from stories 1 to 7: the quiz is controlled by `quizIndex`; Seed and PIN fields are mounted once and only hidden; footer actions go through `actionHost`; Create is 7 steps and Import 5; Network is locked after step 1 and a change resets later answers with "The later questions start again."; the Review is one "Your answers" plate with the App PIN plate last; a refused Seed returns to step 1; the Onboarding footer is inline so Create wallet can sit below the fold at 320px (reachable by scrolling, not a defect unless clipped).
- Story 7 browser recipe: Playwright MCP, dev server on its own port (e.g. 5207), clear storage for first run, Testnet only, stop the server after; screenshots were kept under the session scratchpad. Story 7 did not run: 390px and desktop Import, Onboarding at desktop, the full audit.

## Tasks & Acceptance

**Execution:**
- `src/pages/Onboarding.tsx` -- change the create-step leave button label from "Back" to "Back to start", nothing else -- one Back only (20.2 audit)
- `src/pages/__tests__/create-entry-points.test.tsx` and `src/components/wallet/__tests__/add-wallet-import.test.tsx` -- add to the first-run Onboarding test: after "Create a new wallet", exactly one button named `Back` (exact) and one named `Back to start`; "Back to start" returns to the entry choice; it is disabled while `onInProgressChange(true)` has been called if the harness allows it -- locks the double-Back fix. Rewrite any existing assertion that looked for Onboarding's "Back" with the same intent
- `src/components/wallet/__tests__/create-wallet-flow.test.tsx` -- extend the source-search test to cover all of `src/components/wallet/*.ts(x)` (non-test) and `src/pages/Onboarding.tsx` for the retired names, add `Customise` toggle and "Recommended" panel text, and assert `WalletQuestions.tsx` has no summary or read-only answer list outside `ReviewStep`/`answerRows` -- proves CAP-8 retirement
- Same file or `walk-questions.test.tsx` -- fill gaps only after checking what exists: walking every step announces the counter text, focus lands on the `h2` after Next, Back and Change, and each unavailable answer on Mainnet and on a no-passkey device shows `aria-disabled` plus a visible reason (use `h.policyOverride` where needed) -- NFR-8. Do not duplicate tests that already pass
- `src/components/wallet/*.tsx`, `src/index.css` -- compare against `origin/dev` (`git diff origin/dev -- src/index.css`) and grep the quiz files for hex or `rgb(` literals and unknown `var(--...)` names; report in Auto Run Result; fix only a literal or unknown token -- UX-DR8, NFR-6
- Browser pass (no file) -- Playwright MCP on a fresh dev server: Create and Import via Add wallet, Create on first-run Onboarding; Testnet, plus Mainnet walked to the Review and left; widths 320, 390 and desktop; 200% zoom (narrow viewport at device scale 2, or the 640-wide zoom-2 form story 7 used); light and dark by emulated `prefers-color-scheme`. Check no sideways scroll (measure the component, not the document), actions reachable, focus on heading, no clipped text. Open every screenshot. Use a keyboard-only walk of Create once. Fix any clipped or unreachable control inside this story's files
- Audit (no file) -- run `/impeccable audit` on the whole quiz (step 1 to Review, Create and Import, Onboarding and Add wallet). Fix every P0 and P1 inside this story's files, re-run the gates, list P2 and P3 in Auto Run Result without fixing
- This spec's `## Auto Run Result

### Summary
Onboarding's own leave button now reads "Back to start", so first-run shows exactly one "Back" (the quiz step) plus "Back to start". A defect found in the browser was fixed: at 320px with 200% text, the Review's answer rows grew wider than the card. `ReviewStep` now uses a `minmax(0,1fr)` column and `break-words` on the term. Tests were added for the one-Back rule, a source search for retired old-form names, no answer list outside `ReviewStep`, and focus on the step heading after Next, Back and Change. Policy tests are unchanged.

### Files changed
- `src/pages/Onboarding.tsx`: leave button renamed "Back to start".
- `src/components/wallet/WalletQuestions.tsx`: Review rows no longer overflow narrow cards.
- `src/components/wallet/__tests__/add-wallet-import.test.tsx`: one Back plus "Back to start".
- `src/components/wallet/__tests__/create-wallet-flow.test.tsx`: retired-name source search, no answer list outside Review, focus on heading, "Step n of 7".
- `src/pages/__tests__/create-entry-points.test.tsx`: first-run Back and "Back to start", disabled while writing.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: story 20.8 and epic-20 set to done.

### Review findings
High 0, medium 0, low 8, false 14, maybe-false 0. Patched: none beyond the Review overflow fix above. Deferred: low-severity items only (focus after "Back to start" on first-run, see frontmatter). Every rejected finding and its reason is in the review log. followup_review_recommended is false (no high patched, fewer than two mediums).

### Verification
- Gates: lint, build, test, check:contrast all pass. Tests: 1821 passed in 124 files (0 failed, 0 skipped).
- Browser pass: a fresh dev server on port 5208, driven with Playwright only, then stopped. One Testnet wallet created with no authentication, living only in the browser. Nothing created, funded or signed on Mainnet; Mainnet was walked to the Review and left.
- Covered: first-run Create on Testnet at 320, 390 and 1280 in dark and light, and Mainnet at 390. Add wallet Create and Import on Testnet and Mainnet (Import used the public docs example Testnet seed) at 320, 390 and 1280 in both themes. Import ran every step. Create ran every step except the first-run Mainnet 7th screen at 320.
- Step counters: "Step n of 7" for Create and "n of 5" for Import.
- Focus after Next, Back and Change lands on the step h2 (checked by keyboard, Enter). Exception: first arrival at Add wallet from the chooser leaves focus on BODY.
- Answers survive Back and Change (label, network, seed, passkey, auto-lock). Changing the Signature type from Review returns to Review.
- Changing the Network at step 1 shows "The later questions start again." and resets later answers, keeping label and seed.
- Mainnet shows unavailable answers as aria-disabled with a visible text reason, plus "On Mainnet an Open Check is required, and auto-lock is at least 1 minute." The Review shows a "Real funds" tag and warning text.
- First-run shows one "Back" plus "Back to start"; "Back to start" is disabled on the seed-backup screen.
- No sideways scroll anywhere (document width equals viewport; only inner scrollers were the seed input with long text and the sr-only skip link). No clipped or overlapping controls in the screenshots opened.
- Add wallet's primary action is always on screen thanks to the sticky footer, including a true 200% zoom emulated as a 320x400 viewport. CSS zoom of 2 at 640 wide is misleading for the sticky footer (100vh does not shrink), so the 320x400 viewport was used.
- Not covered: real touch emulation (44px targets not measured) and first-run Onboarding Import (out of scope).
- Screenshots: shots-8 folder under the scratchpad, for example first-390-mainnet-s7.png and true200-dark-create-s7.png.
- Audit score: 18/20. No P0 or P1 left.

### Non-blocking P2/P3 issues (recorded, not fixed)
- P2, Add wallet at true 200% zoom (320x400): header and sticky footer fill most of the screen, about one line of content shows. Cramped but nothing clipped.
- P2, first-run Onboarding at 320px, steps 5 and 7: inline footer puts Next or Create wallet below the fold (about 647 to 703px against 640px). Reachable by scrolling, which the spec accepts.
- P3, Add wallet step 1: h2 and radio legend carry the same text, so it reads twice.
- P3, first arrival at Add wallet from the chooser: focus is on BODY.
- P3, Review: "5 minutes" is drawn in a larger monospace font than other answers.
- P3, an empty dashed Annunciator box sits at the bottom of the viewport (existing app chrome).
- P3, fine-pointer buttons are 36px and radios 20px; coarse-pointer sizing looks handled but was not measured.
- P3, first-run after "Back to start": focus falls to BODY (known deferred item).
- P3, Review Change button keeps a 32px minimum on fine pointers (44px only on coarse).
- P3, Review note dd has no break-words; a very long unbroken note could overflow.
- P3, "Back to start" label is longer; check it does not wrap awkwardly at 320px.

### Residual risks
Touch target sizes and real touch behaviour are unmeasured. The inline first-run footer is below the fold at 320px on two steps. The two focus-on-BODY cases are low harm and deferred.
