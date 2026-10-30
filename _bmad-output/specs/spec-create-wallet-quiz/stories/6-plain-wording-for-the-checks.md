---
title: 'Plain wording for the checks'
type: 'feature'
created: '2026-10-30'
status: 'done'
baseline_revision: '0980fb6555a980c73b91e1599af53b910e2bf61d'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-20-context.md'
  - '{project-root}/_bmad-output/specs/spec-create-wallet-quiz/SPEC.md'
  - '{project-root}/_bmad-output/specs/spec-create-wallet-quiz/quiz-steps.md'
  - '{project-root}/docs/agents/INDEX.md'
  - '{project-root}/docs/agents/verifying-your-work.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** The two check questions read "Open Check" and "Signing Check", with answers "No Open Check" and "Standard". The quiz, the Configure Checks plate and Edit checks each hold their own copy of some words, so one check is named in several ways (SPEC CAP-9, PRD FR-91).

**Approach:** `check-words.ts` becomes the one list. Open Check question: "Authentication required to open the wallet", no-check answer "No authentication required to open the wallet". Signing Check question: "Authentication required to sign a transaction", Standard answer "Nothing is asked for signing." The quiz, Configure plate, Edit checks and the chooser card read it. Short sentences (ASD-STE100); the app signs transactions only.

## Boundaries & Constraints

**Always:** Only words change. Policy (`describeOptions`), its reasons, creation, PIN entry, Seed backup, written-Seed confirmation, answer values and order are unchanged. Every new or changed sentence is under 21 words, and a test measures it. No copy says the app signs data or messages. Unavailable answers stay visible with their reasons.

**Never:** No review step, no Network-change reset (story 7). No double-Back fix (story 8). No change to policy reason text. No test loosened: tests that match old strings are updated to the new strings with the same assertion. No new colour token.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Open Check step | Quiz step 4 (Create) or 3 (Import) | Question (radio legend) "Authentication required to open the wallet"; answers App PIN, Passkey, "No authentication required to open the wallet" | Unavailable answers stay `aria-disabled` with the policy reason |
| Signing Check step | Last quiz step | Question "Authentication required to sign a transaction"; answers "Nothing is asked for signing.", Passkey only, App PIN only | Same as above |
| Configure Checks plate | Wallet with `openCheck: none`, `standard` | Same two questions as row labels; answers read from `check-words.ts`; no duplicate sentence under them | Read failure text unchanged |
| Edit checks | Any wallet | Same legends and answer labels; the "Keep:" row uses the same words | Unchanged |
| Chooser card, lock with no Open Check | `allowsLock` false | Sentence uses "No authentication required to open the wallet" | None |
| Sentence length | Every string exported by `check-words.ts` and each Lead, detail and Mainnet sentence on the two quiz steps | Under 21 words each | Test fails on a longer one |

</intent-contract>

## Code Map

- `src/components/wallet/check-words.ts` -- already read by Configure and Edit checks. Add `OPEN_CHECK_QUESTION`, `SIGNING_CHECK_QUESTION`, `NO_OPEN_CHECK_ANSWER`, `STANDARD_SIGNING_ANSWER`. `openCheckWords('none')` returns the no-check answer, `signingWords('standard')` returns the Standard answer. `NO_OPEN_CHECK_DETAIL` shrinks to "Testnet and Devnet only." (the label now says the rest); `STANDARD_SIGNING_DETAIL` is deleted because the label is that sentence.
- `src/components/wallet/WalletQuestions.tsx` -- `OpenCheckQuestion` (~256) and `SigningCheckQuestion` (~291): legends, the `No Open Check` and `Standard` labels and their details read from `check-words.ts`. Keep the Lead and the Mainnet sentence ("an Open Check is required, and auto-lock is at least 1 minute"; story 4 tests pin it). `Auto-lock after inactivity` legend unchanged.
- `src/components/wallet/walk-questions.ts` -- step titles for `open-check` and `signing-check`: use the `quiz-steps.md` names "Authentication to open the wallet, and auto-lock" and "Authentication to sign a transaction". Keeps `covers` and order.
- `src/components/wallet/EditChecksScreen.tsx` -- legends (~373, ~421), `No Open Check` label (~397), `Standard` label (~427), and the imports; "Keep:" labels (~348, ~357) already read the words functions.
- `src/components/wallet/ConfigureScreen.tsx` -- Checks plate `dt` (~135, ~140) read the two questions; remove the now-duplicate detail `dd` for Standard (~142) and shrink the none one (~137).
- `src/components/wallet/WalletCard.tsx` -- line ~186 "No Open Check: this wallet opens itself..." uses the no-check answer so the check has one name.
- Tests that match old strings, to update with the same assertions: `__tests__/create-wallet-flow.test.tsx` (step titles at ~91, 132, 175-176, 268-273, 429-464; `/^Standard/` at ~192-199, 344, 755-758; `/^No Open Check/` at ~410-541, 920; the source-grep at ~1092-1093 expects `legend="Signing Check"` in WalletQuestions.tsx), `__tests__/walk-questions.test.tsx` (~36 titles), `__tests__/add-wallet-import.test.tsx` (~113, 209, 420, 434), `__tests__/edit-checks-screen.test.tsx` (~60, 104-137, 200, 289), `src/components/__tests__/configure-shell.test.tsx` (~103-127), `src/pages/__tests__/chooser.test.tsx` (~321-322).
- Read-only: `src/lib/crypto/policy.ts` and its tests (must pass unchanged), `src/lib/crypto/__tests__/*`.
- Carried from stories 1 to 5: the quiz is controlled by `quizIndex`; the Mainnet sentence shows on the Open Check step only; Seed and PIN fields stay mounted once; step 1 holds the path radios in Add wallet only; the counter is "of 6" (Create) and "of 4" (Import) until story 7.

## Tasks & Acceptance

**Execution:**
- `src/components/wallet/check-words.ts` -- add the four constants, route the two words functions through them, shrink or delete the two details -- one list
- `src/components/wallet/WalletQuestions.tsx` -- Open and Signing questions read the list -- the quiz uses the plain words
- `src/components/wallet/walk-questions.ts` -- step titles from `quiz-steps.md` -- heading and question agree
- `src/components/wallet/EditChecksScreen.tsx` -- legends and labels read the list -- same words as the quiz
- `src/components/wallet/ConfigureScreen.tsx` -- plate rows read the list, no repeated sentence -- same words as the quiz
- `src/components/wallet/WalletCard.tsx` -- the no-lock sentence uses the no-check answer -- one name per check
- tests listed in the Code Map -- update old strings, keep every assertion
- new test in `src/components/wallet/__tests__/` (for example `check-words.test.ts`) -- each exported string of `check-words.ts` and each Lead, detail and Mainnet sentence rendered on the two quiz steps splits into sentences under 21 words; no string matches /sign(s|ing)? (data|message)/i; Configure, Edit checks and the quiz show identical text for the same answer (rendered, not source-grepped)

**Acceptance Criteria:**
- Given the Open Check step renders, when the user reads it, then the question is "Authentication required to open the wallet" with answers App PIN, Passkey and "No authentication required to open the wallet"
- Given the Signing Check step renders, when the user reads it, then the question is "Authentication required to sign a transaction" with answers "Nothing is asked for signing.", Passkey only and App PIN only
- Given Mainnet or a Passkey-Derived Seed makes an answer unavailable, when the step renders, then that answer is still shown, `aria-disabled`, with the unchanged policy reason as text
- Given the Configure Checks plate and Edit checks name the same checks, when they render, then the question and answer words equal the quiz's
- Given any new or changed sentence, when the length test runs, then each is under 21 words
- Given the policy tests, when `bun run test` runs, then they pass unchanged

## Spec Change Log

## Review Triage Log

### 2026-10-30 — Review pass
- verdicts: 20 findings — high 0, medium 0, low 17, false 3, maybe-false 0
- findings:
  - `[low]` `[reject]` Blind: Standard answer ends in a full stop, unlike its siblings, and the proposed fix swaps in other wording — the exact string "Nothing is asked for signing." is fixed by the intent contract (Approach and AC); the fix would edit the spec.
  - `[low]` `[reject]` Blind: question strings are statements, and legend and label read alike — the question wording is dictated by the intent contract; no one-reading defect beyond the spec's own choice.
  - `[low]` `[reject]` Blind: step titles and legends are near-duplicates, long titles unchecked on phones — titles are the quiz-steps.md names the Code Map orders; wrapping is covered by the spec's manual checks at 320/390; fix would edit the spec.
  - `[low]` `[reject]` Blind: Standard detail removed, so nothing says it is the default — Design Notes resolve this on purpose (label is the sentence, detail dropped); fix would edit the spec.
  - `[low]` `[reject]` Blind: check-words tests have gaps (narrow regex, magic number 5, naive sentence split, dd/dt skipped) — the regex is the one the spec names; the rendered scan reads the whole step container, so Lead, detail and Mainnet text are measured; no quiz element is a dd/dt; no failing string exists today, and widening is added complexity.
  - `[low]` `[reject]` Blind: old "Open Check" jargon remains in the Lead and Mainnet sentence — the Design Notes and Code Map keep the term there on purpose (CAP-3, story 4 tests pin it); fix would edit the spec.
  - `[low]` `[reject]` Blind: WalletCard joins the answer constant and a full stop in JSX — the output is correct today and the chooser test asserts it; the intent asks only that the card use the constant; no real harm worth the churn.
  - `[low]` `[reject]` Blind: NO_OPEN_CHECK_DETAIL is a fragment — the spec orders exactly "Testnet and Devnet only."; it renders directly under the radio and on the Configure plate where it reads fine.
  - `[low]` `[reject]` Blind: tests duplicate long literals instead of importing constants — Tasks say update old strings and keep every assertion; literals also guard against a wrong constant; developer-only, no named break.
  - `[false]` `[reject]` Blind: accessibility and docs not checked — quiz-steps.md already holds the step names the code now uses, and visual checks are a separate verification step the orchestrator runs; nothing in the diff is shown to break either.
  - `[low]` `[reject]` Edge: new test does not render Configure or Edit checks, so parity is not asserted there — configure-shell and edit-checks-screen tests pin the same literals, so drift would fail them; a shared-render test would add machinery for little gain.
  - `[false]` `[reject]` Edge: leaf scan skips elements with children, so a long sentence could hide — the Lead is a plain `p`, the Mainnet sentence is a plain `p`, and the whole container text is also checked; no hiding place was shown.
  - `[low]` `[reject]` Edge: openCheckWords default branch reads "No authentication required" for an unknown kind — the default branch was already the no-check answer before this diff; the type is a closed set in practice; a new branch is added complexity for an unreached case.
  - `[low]` `[reject]` Edge: Configure shows a detail line for the none answer but not for Standard — asymmetry follows from the spec's decision to drop the Standard detail.
  - `[low]` `[reject]` Gap other: Standard answer has a trailing period and WalletCard appends its own — same as the Blind period finding; spec-fixed string.
  - `[low]` `[reject]` Gap other: create-wallet-flow test greps WalletQuestions source for the legend constant — existing style the spec's Code Map itself lists (~1092); runtime assertions also cover it; note only.
  - `[low]` `[reject]` Intent: the Open Check step shows the new question next to the old term in the Lead — kept by the spec on purpose (see the jargon row).
  - `[false]` `[reject]` Intent: step heading and question are different strings — the AC names the legend as the question and the Code Map names the headings from quiz-steps.md; both are as specified.
  - `[low]` `[reject]` Intent: tests render the question components, not the whole CreateWalletFlow walk — flow tests assert the step titles, and the question components are what the AC covers; extra walk test is added scope.
  - `[low]` `[reject]` Intent: the 21-word test does not measure Configure, Edit checks or other leads — the spec limits the test to check-words exports and the two quiz steps; those are measured.

## Design Notes

- Resolved without asking: the "question" is the radio legend; the "answer" is the radio label. The step heading is the `quiz-steps.md` name, which is a step title and not the check name.
- Resolved without asking: the Lead and the Mainnet sentence keep the glossary term "Open Check" (SPEC CAP-3 says the Mainnet text states "an Open Check is required"; story 4 tests pin it). Policy reasons also keep it. Only the question and answers change.
- Resolved without asking: the Standard answer is the sentence itself, so its separate detail line is dropped rather than shown twice. "Keep: Nothing is asked for signing." is accepted.
- Resolved without asking: passkey and App PIN answer labels and details are unchanged; they already name one idea each.

## Verification

**Commands:**
- `bun run lint` -- expected: exit 0
- `bun run build` -- expected: exit 0
- `bun run test` -- expected: all pass; policy tests unchanged
- `bun run check:contrast` -- expected: exit 0

**Manual checks (if no CLI):**
- Playwright MCP only, fresh profile, Testnet only, dev server stopped afterwards. At 320, 390 and desktop in both themes: Open Check and Signing Check steps, the Configure Checks plate and Edit checks show the new words and wrap without clipping; unavailable answers keep their reason. Nothing created, funded or signed on Mainnet.

## Auto Run Result

**Summary.** The two check questions now use plain words from one list in `check-words.ts`. Open Check reads "Authentication required to open the wallet" (no-check answer: "No authentication required to open the wallet"). Signing Check reads "Authentication required to sign a transaction" (Standard answer: "Nothing is asked for signing."). The quiz, Configure Checks plate, Edit checks and the chooser card all read that list. Only words changed; policy and its reasons are untouched.

**Files changed**
- `src/components/wallet/check-words.ts` -- four new constants; words functions route through them; details shrunk or removed.
- `src/components/wallet/WalletQuestions.tsx` -- Open and Signing questions read the list.
- `src/components/wallet/walk-questions.ts` -- step titles use the `quiz-steps.md` names.
- `src/components/wallet/EditChecksScreen.tsx` -- legends and labels read the list.
- `src/components/wallet/ConfigureScreen.tsx` -- plate rows read the list; no repeated sentence.
- `src/components/wallet/WalletCard.tsx` -- the no-lock sentence uses the no-check answer.
- `src/components/wallet/__tests__/check-words.test.tsx` -- new: wording and the under-21-words rule.
- Updated tests (old strings to new, same assertions): `create-wallet-flow`, `walk-questions`, `add-wallet-import`, `edit-checks-screen`, `configure-shell`, `chooser`.

**Review findings.** 20 findings: high 0, medium 0, low 17, false 3, maybe-false 0. Patched: none (nothing high, and fewer than two mediums). Deferred: none. All 20 rejected with reasons in the Review Triage Log. `followup_review_recommended` is false.

**Verification.** All four gates passed: lint, build, test (1778 passed in 123 files, 0 failed), check:contrast. Browser pass: I checked story 20.6 in a real Playwright browser against a dev server on port 5206. The server is stopped and the browser is closed. I looked at the chooser's Add wallet screen with a Testnet wallet and at first-run Onboarding. That meant clearing the browser profile's local data (IndexedDB and storage), and the Testnet wallet in it was lost. I also looked at the Configure Checks plate and Edit checks. Widths were 320, 390 and 1280 in light and dark, plus a 200% text pass at 640 wide. Nothing was created, funded or signed on Mainnet. I only selected Mainnet in the form to see which answers become unavailable.

Passed:
- Open Check step: the legend is 'Authentication required to open the wallet', and the answers are App PIN, Passkey and 'No authentication required to open the wallet'. The detail line reads 'Testnet and Devnet only.'
- Signing Check step: the legend is 'Authentication required to sign a transaction', and the answers are 'Nothing is asked for signing.', 'Passkey only' and 'App PIN only'. The step titles are 'Authentication to open the wallet, and auto-lock' and 'Authentication to sign a transaction'.
- Mainnet: 'No authentication required to open the wallet' and '30 seconds' stay visible and aria-disabled, each with its policy reason as text.
- Configure and Edit checks use the same legends and answers, with no repeated sentence.
- The chooser card says 'No authentication required to open the wallet. This wallet opens itself...'
- Focus moves to the step heading on Next and Back, and Passkey only survived Back and Next.
- No horizontal scroll at 320, 390, 640 or 1280. The Add wallet footer stayed pinned at 320.

Screenshots are in the shots-6 folder under /tmp/claude-1000/-home-otavio-xxx-xrpl-wallet/a26dad49-e38b-40b1-b725-b48803fac498/scratchpad/. The folder also holds shots from other runs.

Audit score: 15/20. No P0 or P1.

**Non-blocking P2/P3 issues and residual risks**
- P2, Onboarding Open Check step at 320x640: the footer is not sticky, so Next sits below the fold (bottom 642 against 640) and needs a scroll. Likely from story 20.1, not 20.6. Worse on Mainnet because of the longer text.
- P3, Onboarding: two Back buttons (story 20.8 fixes this). On step 1 focus stays on BODY on entry.
- P3, Edit checks "Keep the current setting (Nothing is asked for signing)" has no full stop while the quiz answer has one.
- P3, Back and Next are 37px tall; Settings and Wallets 32px. Under 44px unless a coarse pointer applies; not checked with one.
- P3, the 200% zoom method (html zoom=2) pushes the footer off screen; that is a test artefact. With 200% text there was no horizontal scroll and Next was reachable.
- P2, `WalletQuestions.tsx:267-268`: the old term "Open Check" still shows in the Lead and Mainnet note beside the new heading; `src/lib/crypto/policy.ts:59` still says "needs an Open Check". Kept on purpose (spec Design Notes; policy text must not change).
- P2, `check-words.ts`: STANDARD_SIGNING_ANSWER ends in a full stop and NO_OPEN_CHECK_ANSWER does not; `keepLabel` in Edit checks strips the full stop with a regex. Wording is fixed by the spec.
- P2, `EditChecksScreen.tsx` keepLabel (~353): building the label by stripping a full stop and adding brackets is fragile and long at 320px for the "either" answer.
- P2, Configure and Edit checks legends are now full sentences while answers stay short labels; the long legend in the Checks plate (`panel-legend`, made for short captions) may wrap or look heavy.
- P3, `WalletCard.tsx:187`: the sentence depends on the constant having no trailing full stop, the opposite of the sibling constant.
- P3, `NO_OPEN_CHECK_DETAIL` "Testnet and Devnet only." has no subject when read alone.
- P3, `walk-questions.ts`: long step titles may wrap or truncate at 320px in a progress indicator or screen-reader announcement.
