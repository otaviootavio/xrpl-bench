---
title: 'Remove the recommended-setup step'
type: 'feature'
created: '2026-10-30'
status: 'done'
baseline_revision: 'e0d80d14a955520a71b831be073d62df03444f85'
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

**Problem:** Step 2 of the quiz is a read-only "Your setup" list with Create wallet and Walk me through it. An advanced user can create a wallet from defaults they never looked at (SPEC CAP-3, PRD FR-91 as revised 2026-10-30).

**Approach:** Delete that step, its list and both buttons, so step 2 is the Node question and every question is asked. Create wallet (Import wallet) shows only on the last question. On Mainnet the Open Check step states the forced rules in text. The step counter follows the shorter list.

## Boundaries & Constraints

**Always:** Policy (`describeOptions`), `handleCreate` guards, PIN entry, Seed backup, written-Seed confirmation unchanged. Seed field and PIN fields stay mounted once and are only hidden (unmounting clears them). Focus goes to the step heading on every change. The Mainnet sentence is plain text, under 21 words. Pre-selections, step order and answers kept across Back stay as built in stories 1 to 3.

**Never:** No review step, no Network-change reset line, no Create-or-Import question (stories 6 to 8). No change to `AddWalletScreen.tsx`, `Onboarding.tsx` or the double-Back fix (story 8). No weakening of a test: tests for the list and the shortcut are removed, not loosened. No new colour token.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Create, leave step 1 | Valid Label, press Next | Step 2 of 6 is Node; no list, no radios other than Node's; no Create wallet or Walk me through it | Label error keeps Next `aria-disabled` as today |
| Import, leave step 1 | Seed typed, Next | Step 2 of 4 is Node; walk is Node, Open Check and auto-lock, Signing Check | Seed not typed keeps Next blocked as today |
| Last question | Create: step 6; Import: step 4 | Next replaced by Create wallet (Import wallet); PIN fields shown here only when an App PIN is chosen | Blocked combination: `aria-disabled`, reason alert as today |
| Mainnet Open Check step | Network Mainnet | Text says an Open Check is required and auto-lock is at least 1 minute | None |
| Testnet Open Check step | Network Testnet or Devnet | That sentence is absent | None |

</intent-contract>

## Code Map

- `src/components/wallet/CreateWalletFlow.tsx` -- `SHORTCUT_INDEX`, `FIRST_WALK_INDEX` (lines ~111-113, remove); `quizSteps` (~613) has the `recommended` entry with `primary: createButton` and the Walk button (remove); `walkQuestion = walk[quizIndex - FIRST_WALK_INDEX]` becomes `walk[quizIndex - 1]` for `quizIndex >= 1`; `showPin` (~630) becomes last step only; `{quizIndex === 1 && <RecommendedList/>}` (~637) removed; `RecommendedList` import (line 10). `changeNetwork` resets via `setQuizIndex(0)` (~388), unchanged. `createButton` (~558) and `handleCreate` untouched; the blocked `Alert` shows when `quizIndex !== 0`.
- `src/components/wallet/WalletQuestions.tsx` -- delete `RecommendedList` (~98-125) and now-unused imports (`normalizeWalletName`, `NETWORKS`, `minutesLabel` only if nothing else uses them). Move its Mainnet sentence (line ~123) into `OpenCheckQuestion` (~255), rendered when `p.network === 'mainnet'`, in a `Lead` or similar existing text style.
- `src/components/wallet/walk-questions.ts` -- the walk list; unchanged. `WALK_QUESTIONS` and `walkQuestions(imported)` give 5 or 3 steps.
- `src/components/wallet/QuizShell.tsx` -- `primary` and `secondary` props are now unused by the flow; leave them (generic, covered by `quiz-shell.test.tsx`).
- `src/components/wallet/__tests__/create-wallet-flow.test.tsx` -- helpers `mount` (~85, presses Next then Walk), `GENERATE_STEPS` (~92, includes 'Your setup'), `goToStep` (~100, `now === 1 ? 'Walk me through it'`), `switchNetwork` (~110), `walkButton`, `summary`, `radioNamed` (~130); block "Label and Network, then the recommended setup" (~231) tests the list and shortcut (remove those, keep the step 1 test minus the list assertion); "Step n of 7" strings throughout become "of 6" with each step number minus 1. Policy-driven assertions keep their meaning.
- `src/components/wallet/__tests__/add-wallet-import.test.tsx` -- `submit` (~103) and tests at ~187-226, ~248-303, ~397-421 use "Walk me through it" and "Step n of 5" (now 4); the test at ~221 on the three footer buttons is removed.
- `src/components/wallet/__tests__/walk-questions.test.tsx` -- unchanged.
- Carried from stories 1 to 3: audit notes P2 "App PIN field appears only at the end" and the double Back are not this story's; story 7 moves the PIN to the review, story 8 fixes the Back.

## Tasks & Acceptance

**Execution:**
- `src/components/wallet/CreateWalletFlow.tsx` -- drop the shortcut step, both indexes and the list render; walk starts at index 1; PIN block shown on the last step only -- CAP-3, step counter counts what is shown
- `src/components/wallet/WalletQuestions.tsx` -- delete `RecommendedList`; add the Mainnet Open Check sentence to `OpenCheckQuestion` -- the forced rules are stated where chosen
- `src/components/wallet/__tests__/create-wallet-flow.test.tsx` -- remove the list and shortcut tests; renumber steps; add the tests below -- no weakened assertions
- `src/components/wallet/__tests__/add-wallet-import.test.tsx` -- walk from step 1 by Next; Import is 4 steps; remove the shortcut-order test
- `src/components/wallet/__tests__/create-wallet-flow.test.tsx` -- new tests: no `Walk me through it` button and no region holding `dt` terms on any step; Create wallet absent on steps 1 to 5 and present on step 6; Import wallet only on step 4; Mainnet sentence on the Open Check step only and absent on Testnet; "Step 2 of 6" is Node

**Acceptance Criteria:**
- Given step 1 is valid, when the user presses Next, then Step 2 of 6 (Import: 2 of 4) is the Node question, with no read-only list and no Walk me through it button
- Given any step before the last, when it renders, then no Create wallet or Import wallet button exists
- Given the Network is Mainnet, when the Open Check step renders, then it says an Open Check is required and auto-lock is at least 1 minute, and on Testnet or Devnet it does not
- Given the user is on the last question, when it renders, then Create wallet (Import wallet) replaces Next and creates through the same `handleCreate` with the PIN fields above it where an App PIN is chosen
- Given the user goes Back and forward, when steps re-render, then every answer, the typed Seed and the typed PIN are kept
- Given the counter renders, when Create or Import is open, then N is 6 or 4

## Spec Change Log

## Review Triage Log

### 2026-10-30 — Review pass
- verdicts: 24 findings — high 0, medium 0, low 11, false 13, maybe-false 0
- findings:
  - `[false]` `[reject]` Blind: no confirmation before Create on Mainnet, and no Impeccable critique visible — The intent's Never list excludes a review step (stories 6 to 8); the old list was read-only and not a confirmation. Every question is now asked in turn. The critique is a story 20.7 task and is not part of this diff.
  - `[low]` `[reject]` Blind: an automatic name is never shown ("Named automatically" gone) — Real, but the label step has the "Savings" placeholder and the story 7 review lists every answer including the Label. A new hint is more than a direct correction.
  - `[false]` `[reject]` Blind: the Mainnet rule is stated twice and no longer shown on the Signing Check step — The other text is the policy reason on a disabled auto-lock choice, not a second statement of the sentence. The intent puts the sentence on the Open Check step only.
  - `[false]` `[reject]` Blind: PRF-capable default tests dropped — They remain in create-wallet-flow.test.tsx (~195-215): passkey Open Check default, "Passkey only" on Mainnet, Standard on Testnet, and App PIN only on Mainnet without PRF.
  - `[false]` `[reject]` Blind: test that shortcut Create and walk Create send the same arguments is gone — The shortcut no longer exists, so there is nothing to compare. No bad outcome.
  - `[false]` `[reject]` Blind: Devnet covered only by a negative assertion — The spec's matrix says the sentence is absent on Testnet and Devnet; a negative assertion is the right check.
  - `[low]` `[reject]` Blind: the `submit()` guard loop in add-wallet-import.test.tsx exits quietly, and `dt` is not scoped to visible elements — A step-count change fails loudly at the "Step n of 4" tests and at the Import wallet lookup. The import test checks `dt` on the whole document, which is stricter. Unlikely to be met; the fix adds guards.
  - `[low]` `[patch (fixed)]` Blind: radio-name `every(...)` check on the Node step is nearly vacuous — Confirmed at create-wallet-flow.test.tsx step 2 test: it passes for one radio. Fix applied: the test now asserts exactly two radios, "Built-in Nodes" and "A Node you choose".
  - `[low]` `[reject]` Blind: `quizIndex >= 1` and `walk[quizIndex - 1]` are magic numbers — The Code Map prescribes this form and it sits next to the `quizSteps` list it depends on. Stories 6 to 8 will change this math anyway. Unlikely to bite before then.
  - `[low]` `[reject]` Blind: "Step n of 6" and "of 4" written by hand in about 15 tests — Pre-existing style (it was "of 7" and "of 5"). Deriving them touches every literal, which is more than a direct correction.
  - `[low]` `[patch (fixed)]` Blind: stale PIN comment "only hidden on step 1" — Confirmed at CreateWalletFlow.tsx:624: the block is now hidden on every step except the last. Fix applied: comment reworded (mounted once, only hidden before the last step). Grouped with the Edge Case finding on the same line (shared root cause).
  - `[false]` `[reject]` Blind: WalletQuestions.tsx doc comment mentions the walk as one step per question with a bad wrap — The text is accurate (the walk is one step per question). One line is longer than its neighbours; no bad outcome.
  - `[low]` `[reject]` Blind: unused `primary` and `secondary` in the step type, and leftover "Walk me through it" copy — The grep finds no leftover copy outside absence assertions (false part). The unused props are kept on purpose by the Code Map and are tested by quiz-shell.test.tsx; removing them means editing that test too.
  - `[false]` `[reject]` Blind: docs and story status not updated, story file untracked — The story file is this spec itself. PRD FR-91 (epics file) already says "no shortcut" and docs/decisions.md has no recommended-setup text.
  - `[false]` `[reject]` Blind: import takes 4 steps with no test for Mainnet Open Check or Back clearing the Seed error — The spec sets Import at 4 steps. The Mainnet sentence uses the same component as Create, and Back's error reset (`setSeedError(null)`) is unchanged by this diff. No bad outcome shown.
  - `[low]` `[reject]` Edge: Mainnet sentence is plain `text-sm`, not the muted `Lead` style — The Code Map allows "a Lead or similar existing text style". Not muted keeps the rule readable; cosmetic only, and story 9 owns wording and style.
  - `[false]` `[reject]` Edge: removed tests were the only checks of Mainnet and PRF defaults — Same refutation as the Blind finding: those tests are still at ~195-215 of create-wallet-flow.test.tsx.
  - `[low]` `[reject]` Edge: an untested custom Node is flagged only at Create time — `handleCreate` already refuses with "Test the custom Node first" and shows it. Same as before this change. A Node-step block is a new guard, not warranted for a cosmetic gap.
  - `[low]` `[patch (fixed)]` Edge: PIN comment at CreateWalletFlow.tsx:624 is stale — Same defect as the Blind stale-comment row; fix applied: the one comment reword.
  - `[false]` `[reject]` Edge: `/at least 1 minute/` rewritten to a longer regex, a loosened assertion — The new Mainnet sentence also matches the short regex, so it needed narrowing to still target the policy reason. The assertion is stricter, not looser.
  - `[false]` `[reject]` Intent: entry points (Add wallet, Onboarding) not asserted in the diff — The spec forbids touching them. The grep finds no stale "Walk me through it", "Your setup" or step-count text in their tests, and they only embed the same flow.
  - `[false]` `[reject]` Intent: the "under 21 words" limit is not asserted — The sentence has 14 words (the auditor counted 20, wrongly). The limit holds; a word-count test is not needed.
  - `[false]` `[reject]` Intent: the Mainnet sentence shows on Import too — That is the intended rule: it shows on the Open Check step whenever Network is Mainnet.
  - `[low]` `[reject]` Intent: `quizIndex >= 1` and `- 1` offsets are literals — Same as the Blind magic-numbers row; the auditor says it does not conflict with the intent.

## Design Notes

- Resolved without asking: N is 6 (Create) and 4 (Import) in this story, not the 7 and 5 of `quiz-steps.md`; those include the review, which story 7 adds. The epics file says N counts only steps shown.
- Resolved without asking: the Mainnet sentence is moved, not reworded, to keep the sentence story 2 browser-tested; story 9's wording pass owns any rewrite.
- Resolved without asking: the App PIN field shows on the last step only until story 7 puts it on the review. Choosing App PIN earlier gives no field until then (known audit P2).

## Verification

**Commands:**
- `bun run lint` -- expected: exit 0
- `bun run build` -- expected: exit 0
- `bun run test` -- expected: all pass; policy tests unchanged
- `bun run check:contrast` -- expected: exit 0

**Manual checks (if no CLI):**
- Playwright MCP only, fresh profile, dev server stopped afterwards, Testnet only. Create and Import walk at 320, 390 and desktop in both themes: Step 2 is Node, Create wallet only on the last step, Mainnet sentence on the Open Check step. Nothing created, funded or signed on Mainnet.

## Auto Run Result

### Summary

The recommended-setup step is gone from the create-wallet quiz. Step 2 is now the Node question, every question is asked in turn, and Create wallet (Import wallet) shows only on the last step (step 6 of 6 for Create, step 4 of 4 for Import). The Mainnet rule ("On Mainnet an Open Check is required, and auto-lock is at least 1 minute.") moved onto the Open Check step and shows only on Mainnet. Policy, `handleCreate` guards, PIN entry and Seed backup are unchanged.

### Files changed

- `src/components/wallet/CreateWalletFlow.tsx` -- dropped the shortcut step, its two index constants, the list render and the Walk button; the walk starts at index 1; the PIN block shows on the last step only.
- `src/components/wallet/WalletQuestions.tsx` -- deleted `RecommendedList`; added the Mainnet sentence to `OpenCheckQuestion`.
- `src/components/wallet/__tests__/create-wallet-flow.test.tsx` -- removed list and shortcut tests, renumbered steps to "of 6", added tests for Node on step 2, Create wallet on the last step only, and the Mainnet sentence.
- `src/components/wallet/__tests__/add-wallet-import.test.tsx` -- walks from step 1 by Next, Import is 4 steps, shortcut-order test removed.
- `_bmad-output/specs/spec-create-wallet-quiz/stories/4-remove-the-recommended-setup-step.md` -- this story file.

### Review findings

24 findings: high 0, medium 0, low 11, false 13, maybe-false 0. Patched: 3 low (the vacuous radio check on the Node step now asserts exactly two radios; the stale PIN comment reworded, one defect reported twice). Deferred: none. All other findings were rejected, each with its reason in the Review Triage Log above. `followup_review_recommended` is false (no high patched, fewer than two mediums).

### Verification

- Gates: lint, build, test and check:contrast all passed. Tests: 1765 passed of 1765 (122 test files, none skipped).
- Browser pass: I ran the dev server on 5204, in a fresh Playwright profile, using Testnet only. The server is stopped and 5173 was never touched. Everything I created stays local: one Testnet wallet with a throwaway seed, and one orphaned first-run PIN that I wiped with Remove all. Nothing was funded or signed, and Mainnet was only viewed. I opened first-run Create and Add wallet (Generate and Import) at 320, 390 and 1280, in dark and light. The 200% zoom check (640 wide, zoom 2) was only on the Mainnet Open Check step, in light. Screenshots are in /tmp/claude-1000/-home-otavio-xxx-xrpl-wallet/a26dad49-e38b-40b1-b725-b48803fac498/scratchpad/shots-4/. The Playwright screenshot tool only allowed saving inside the repo, so I wrote to .playwright-mcp and copied them over. That folder also holds shots from earlier runs. Each acceptance criterion I could check in the browser held.
  - Step 2 of 6 is Node, with two radios and no list. No dt terms or "Walk me through it" button appear on any step.
  - Create wallet appears only on step 6 of 6, and Import wallet only on step 4 of 4. Import runs Node, Open Check, Signing Check.
  - The Mainnet sentence appears on the Open Check step on Mainnet and is absent on Testnet.
  - Focus lands on the step's h2 after every Next and Back. After typing the Seed and walking Back to step 1, the Seed was kept. A typed App PIN was kept across Back and forward.
  - Switching to Mainnet on step 1 returned to step 1 as expected.
  - There was no horizontal scroll at 320, 390 or 1280, and none at 200% zoom.
  - Colour is not the only signal: the blocked options carry explanatory text.
- No P0 or P1 found. Audit score: 17/20.

### Non-blocking P2/P3 issues

- P2, Create wallet on a Testnet wallet, step 5 (Open Check) default: in this Chromium the Open Check defaults to Passkey, and pressing Create wallet leaves the button on "Creating..." with both Back buttons disabled for over 60 seconds, with no way to cancel. Probably the automated browser's WebAuthn prompt never answering. `handleCreate` is untouched by this story. Worth a timeout or Cancel path. "No Open Check" on Testnet created the wallet fine.
- P2, Create walk at 320x640, Mainnet step 5: the footer is not sticky; Next sits at y=673 in a 640px window and is reachable only by scrolling. Unchanged by this story.
- P3, all steps and widths: Next, Back, Generate and Import buttons are 36px tall (Settings and Wallets 32px); radios are 16px with a 20px label row. All are under the 44px touch-target guideline; same styling as before.
- P3, first-run Onboarding, Import path: it is the older Network, Seed and Continue form followed by a "Secure your wallet" PIN screen, not the quiz. The "Step 2 of 4" Import criterion could only be exercised in Add wallet. Out of scope here (stories 6 to 8).
- P3, Onboarding vs Add wallet, step 1: the Label is prefilled "My Wallet" in Onboarding and empty (placeholder "Savings") in Add wallet; each screen shows two Back buttons. Story 8 owns the Back fix.
- P3, Add wallet, Import step 1: the heading says "Name and network" but the Seed field comes first. Next is disabled with the hint "Type your Seed to continue."
- P2, `CreateWalletFlow.tsx` quizSteps (~607): removing the step also removed the one-tap create, so every wallet now means walking all questions. This was the intent, but nothing shows the answers together before the create action. Acceptable only if story 20.7 (review step) lands in the same release.
- P2, `WalletQuestions.tsx` OpenCheckQuestion (~227): the Mainnet rule used to show on the recommended list and now shows only on the Open Check step, so someone picking Mainnet on step 1 gets no hint it is coming. The sentence is plain `text-sm` while the Lead above is muted. Consider a short note on the Name and Network step, or a deliberate callout.
- P3, `CreateWalletFlow.tsx` walkQuestion and showPin (~613-616): the step offset is a bare literal (`quizIndex >= 1`, `walk[quizIndex - 1]`). Add a named constant (for example `FIRST_WALK_INDEX = 1`).
- P3, `QuizShell.tsx` Back button (not changed here): on step 1 Back is `aria-disabled` with no visible reason, against the PRODUCT.md rule. Belongs in story 20.8 with the double Back.
- P3, `WalletQuestions.tsx` file header comment (lines 12-16): wraps unevenly after the RecommendedList text was removed. Cosmetic.

### Residual risks

- Do not ship 20.4 alone to users: it removes the one-tap create and shows no summary of answers before create until story 20.7 lands.
- The passkey default on Testnet can leave Create stuck on "Creating..." in automated Chromium; not confirmed in a real browser.
- Mainnet is only viewed in the browser pass; no Mainnet create was run.
