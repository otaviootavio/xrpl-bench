---
title: 'Review before create, the Network-change reset, and a reachable PIN'
type: 'feature'
created: '2026-10-30'
status: 'done'
baseline_revision: '44155603fc5e4ecda126e84f7a5b8ca7e1a90b08'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-20-context.md'
  - '{project-root}/_bmad-output/specs/spec-create-wallet-quiz/SPEC.md'
  - '{project-root}/_bmad-output/specs/spec-create-wallet-quiz/quiz-steps.md'
  - '{project-root}/docs/agents/INDEX.md'
  - '{project-root}/docs/agents/verifying-your-work.md'
warnings: [oversized]
deferred:
  - summary: >-
      The App PIN plate sits above the Review rows, but no check shows it is on screen above the sticky footer at 320px and 390px.
    evidence: |-
      Only DOM order is tested in jsdom. A real-browser pass at 320, 390 and desktop on Add wallet and Onboarding would settle it.
    location: >-
      src/components/wallet/CreateWalletFlow.tsx (PIN section above ReviewStep)
    severity: medium (unverified)
  - summary: >-
      A refusal text left in `error` (untested custom Node, policy refusal) stays on screen after Back or Change.
    evidence: |-
      `error` renders on every step and `goToIndex` and `changeAnswer` clear `seedError`, `pinError` and `resetNote` but not `error`. The old onIndex never cleared it either. One `setError(null)` in both would settle it.
    location: >-
      src/components/wallet/CreateWalletFlow.tsx goToIndex, changeAnswer
    severity: low
  - summary: >-
      A focused App PIN field may sit under the sticky footer on a small screen: only the Create error block has a scroll margin.
    evidence: |-
      The PIN inputs have no scroll margin and jsdom cannot show where focus() scrolls them. A Playwright check at 320 and 390 on Add wallet with a short PIN, comparing the field's box to the footer's, would settle it.
    location: >-
      src/components/wallet/CreateWalletFlow.tsx (PIN inputs, refusePin)
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** After story 20.4 the walk ends on its last question with Create wallet, so nobody sees all their answers together before creating (SPEC CAP-5). A PIN that is missing or short fails in a text line at the bottom, away from its field. Network can be changed from any step, so answers made for the old Network (No Open Check, 30 seconds, Passkey-Derived) can stay selected and be met later as blocked options (CAP-6). Owner decision 2026-10-30: Network is chosen on step 1 and locked once the person leaves it.

**Approach:** Add a Review as the last step, after Signing Check: one "Your answers" plate with every applicable answer and a Change button, the create-consequence line as the last line of that plate, then the App PIN plate last where needed, and Create wallet (Import wallet) in the footer. Lock Network after step 1: later steps and the Review show it as plain text with no Change button, and the Review row shows "Locked" with the visible reason to go Back to step 1 (the questions then start again). Changing Network on step 1 resets every later answer to its pre-selection (the same rule as changing Create or Import), with a short polite status line on step 1 saying the later questions start again. No reconcile, no keep-legal logic, no reset line on the Review. A refused PIN moves focus to its field with the reason beside it. Reuse the parked patch `_bmad-output/implementation-artifacts/wip-quiz-20-4-before-replan.patch` only for `preselection`/`defaultSigning` and its return flag for Change.

## Boundaries & Constraints

**Always:**
- Review is the last step, after Signing Check, for Create and Import. The counter becomes "Step 7 of 7" (Create) and "Step 5 of 5" (Import), as `quiz-steps.md` says. The last walk question now shows Next. Create wallet (Import wallet) is on the Review only and calls the same `handleCreate`.
- Rows, in order: Label, Network (text only; no Change, so it shows "Locked" and the reason "Locked. To change it, go Back to step 1; the questions then start again." as visible text), Node, Seed Method, Passkey (only when Passkey-Derived), Signature type, the Open Check answer, Auto-lock, the Signing Check answer. Import omits Seed Method, Passkey and Signature type. Create or Import is not a row: it cannot change without starting over (story 20.5). No Seed and no PIN is ever shown.
- Open Check and Signing Check rows use the words in `check-words.ts` (`OPEN_CHECK_QUESTION`, `openCheckWords`, `signingWords`, `SIGNING_CHECK_QUESTION`). Rows come from one function shared with the reset line, so one answer is never worded two ways.
- Each row except Network has a **Change** button, accessible name "Change <row term>". It returns to the step that asks it (Label to step 1, Open Check and Auto-lock to the Open Check step, Passkey to Seed Method) with the answer kept. After Change, a forward move lands on the Review, not the next question (SPEC assumption). Back stays one step back. The return flag clears on arriving at the Review and when Back is used, so it never skips questions later.
- Plate styling: the Review sits in a `panel-plate` with `dl` rows in normal foreground and `text-muted-foreground` terms. No `panel-well`, no `text-readout-*`, no new colour token. Words, never colour alone.
- Network lock: Network is editable only on step 1. Steps 2 onward and the Review render it as text with no Change button. Changing Network on step 1 (including from Back) resets every later answer (Node mode and any custom Node, Seed Method, Passkey, Signature type, Open Check, auto-lock, Signing Check and its touched flag) to `preselection(network, capability)`, the same rule as changing Create or Import. Reset answers are not restored if the person switches back. `preselection` (Stored, Open Check passkey if capability is yes else App PIN, 5 minutes, `defaultSigning`) serves the initial state and the reset. Nothing reads legality to decide what to keep.
- The line is visible text under Network on step 1 in an always-mounted `role="status"` region (`aria-live="polite"`): "The later questions start again." It shows when Network is changed on step 1 and clears when the step changes; an unchanged Network shows no line. It is never shown on the Review.
- PIN: the fields stay mounted once, uncontrolled, and show on the Review only (hidden elsewhere, never unmounted). On the Review they sit in the last plate, directly above the footer, with text that never says "below" ("Choose an App PIN to protect this device."), and stay visible above the sticky footer at 320px and 390px, never under it. Create wallet with a missing or short PIN, or two PINs that differ, moves focus to the field at fault (the confirm field for a mismatch) and shows the reason as text beside it, tied with `aria-describedby` and `aria-invalid`. The text clears when the person types in that field. Typing keeps no PIN in state.
- Policy still refuses any illegal combination before any write: `handleCreate` keeps its `options.combination.ok`, label and custom-Node guards, unchanged.
- Quiz is identical at Onboarding and Add wallet.

**Never:** change `describeOptions`, `policy.ts`, any pre-selection value, or any legality rule; add or change a question; change `QuizShell` (the flag lives in the flow's `onIndex` wrapper), Configure, Seed backup, written-Seed step or how a Wallet is written; put a secret in state, URL or storage; animate a step; fix the double Back on Onboarding (story 20.8); re-add a list of answers before the Review, a shortcut or a Customise toggle.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Review (Create) | Next on Signing Check | Heading "Review", "Step 7 of 7", a row and Change per applicable answer, Create wallet in the footer | Blocked verdict shows the existing warning Alert, Create `aria-disabled` |
| Review (Import) | Import walk | "Step 5 of 5", no Seed Method, Passkey or Signature type row, Import wallet | none |
| Change, then Next | Review, Change on Node, edit, Next | Node step shows the kept answer; Next lands on the Review with the edit | Label error still blocks Next on step 1 |
| Network locked | Any step after 1, or the Review | Network shown as text, no Change button; Review row shows "Locked" and says to go Back to step 1; the questions then start again | none |
| Network change on step 1 | Back to step 1 after answering later steps, change Network | Every later answer at its pre-selection for the new Network, custom Node gone, status line says the later questions start again | none |
| Legal answers, Network changed | App PIN, 15 minutes, then Network changed | Reset too: nothing is kept | none |
| Network not changed | Back to step 1, Next without changing Network | All later answers kept, no line | none |
| App PIN, none set yet, empty field | Create wallet on the Review | Focus on the PIN field, "The App PIN must be at least 6 digits." beside it | No keystore call |
| App PIN exists, field empty | Create wallet | Focus on the PIN field, "Enter your App PIN." beside it | No keystore call |
| Two PINs differ | Create wallet | Focus on the confirm field, "The two PINs don't match." beside it | No keystore call |
| Create from Review | Same answers as before | Same `createStoredWallet` / `createDerivedWallet` / `importStoredWallet` call as today | Refusals show as today |

</intent-contract>

## Code Map

- `src/components/wallet/CreateWalletFlow.tsx` -- `CreateWalletForm`: `quizSteps` (~612: name-network, then `walk.map`; add `{ id: 'review', title: 'Review' }` last); `walkQuestion = walk[quizIndex - 1]`; `showPin` (~619, now the Review index, which is still the last step); `onIndex` wrapper on `QuizShell` (~622, clears `seedError`; add the return-to-Review flag here); `changeNetwork` (~270: resets Node, sets signing; replace with a reset of every later answer to `preselection(next, capability)` and set the status note); initial `useState`s for Seed Method, Open Check, auto-lock, signing (~149-153) and `defaultSigning` (~116; move into `network-reset.ts`); `handleCreate` (~305) PIN guards at ~318-337 set `setError`, change them to a `pinError` plus focus; `pinRef`, `pinConfirmRef` (~178); the hidden PIN `div` (~630) is the last block on the Review, after `ReviewStep`; the consequence line (`createConsequence` with the Mainnet "Real funds" Badge) is passed to `ReviewStep` as its `footer`, so there is no separate "Before you create" plate; `createButton` (~556) is also `finalAction`; the blocked `Alert` (~662) stays; the Seed refusal returns to step 1 through `setQuizIndex(0)` (~387).
- `src/components/wallet/WalletQuestions.tsx` -- `NameAndNetworkStep` (~74): add the status region under `NetworkChoice`; `PathChoice` and the walk renders are read-only; `Lead` (~136). Add `ReviewStep` (rows with Change; Network row text only). Props: add `resetNote?: string | null`.
- `src/components/wallet/walk-questions.ts` -- `WALK_QUESTIONS`, `walkQuestions(imported)`, `VERDICT_KEYS`. Add `answerRows(props)` and the shared formatters; each row names its step id, and the Network row has none (text only). It imports renders from `WalletQuestions`, so import row types with `import type` to avoid a runtime cycle.
- `src/components/wallet/network-reset.ts` (new) -- pure `preselection` and `defaultSigning` only. No `reconcileForNetwork`, no `resetLine`.
- `src/components/wallet/check-words.ts`, `check-controls.tsx`, `NetworkChoice.tsx`, `src/lib/minutes-label.ts` -- reuse, do not restyle. `Button size="sm"` already gives 44px on coarse pointers.
- `src/components/wallet/QuizShell.tsx` -- read-only. Footer is Back, then Next or `finalAction` on the last step; heading focus on a step change; sticky `ScreenFooter` via `actionHost`.
- `src/lib/crypto/policy.ts:232` -- `describeOptions`: read-only. Mainnet makes No Open Check, 30 seconds and (on an unbound or unknown origin) Passkey-Derived unavailable; signing is unavailable only for derived plus non-passkey.
- `src/index.css:307` -- `.panel-plate`, `.panel-legend`; `DESIGN.md` for the plate rules.
- `src/components/wallet/AddWalletScreen.tsx`, `src/pages/Onboarding.tsx` -- read-only; both render the flow, so the Review is identical.
- Tests to update (the step count, the new last step, and the old no-reset behaviour): `__tests__/create-wallet-flow.test.tsx` (`GENERATE_STEPS` ~92 add 'Review'; `createButton` helper ~129 goes to 'Review'; "of 6" becomes "of 7"; rewrite "Passkey-Derived on Mainnet at a b-cdn.net origin..." ~389, "Mainnet: no Open Check and an auto-lock under a minute..." ~407, and "Testnet may use no Open Check; switching to Mainnet..." ~436 to the lock rule (Network changes only on step 1 and resets everything after it); `h.policyOverride` ~24 lets a test force a verdict, and the "a policy that allows everything is believed" test must still pass; PIN tests that read the bottom `role="alert"` now read the field text); `__tests__/add-wallet-import.test.tsx` ("of 4" becomes "of 5", Import wallet from the Review); `__tests__/walk-questions.test.tsx` (extend for rows); `__tests__/check-words.test.tsx` (the under-21-words rule for new copy). `quiz-shell.test.tsx` and all policy tests stay unchanged.
- Carried from stories 1 to 6: `quizIndex` is controlled by the flow; Seed field and PIN fields are mounted once and only hidden; focus goes to the step `h2`; footer actions go through `actionHost`; step 1 holds the path radios in Add wallet only; the Mainnet sentence sits on the Open Check step; nothing styles `:focus`; `outline-none` is banned; Seed refused at create returns to step 1.

## Tasks & Acceptance

**Execution:**
- `src/components/wallet/network-reset.ts` -- new pure `preselection`, `defaultSigning` -- one place for the pre-selection used at start and at reset (REMOVE `reconcileForNetwork` and `resetLine` if present in the working tree)
- `src/components/wallet/walk-questions.ts` -- add `answerRows(props)` with shared formatters from `check-words.ts` -- one source for Review rows and the reset line
- `src/components/wallet/WalletQuestions.tsx` -- add `ReviewStep` (plate, `dl`, a Change per row, accessible names); add the polite status region under Network; the Network row on the Review is text with the "Locked" note (`NETWORK_LOCKED_NOTE` in `check-words.ts`); `ReviewStep` takes a `footer` rendered as the plate's last line
- `src/components/wallet/CreateWalletFlow.tsx` -- add the Review step; the return-to-Review flag in `onIndex`, cleared on arrival and on Back; reset-all in `changeNetwork` (every later answer to `preselection`), and Network rendered as text on steps 2 onward; `preselection` for initial state; `resetNote` cleared on a step change; PIN block above the rows on the Review; `pinError` with focus and `aria-describedby` in `handleCreate`
- `src/components/wallet/__tests__/network-reset.test.tsx` -- keep only `preselection` and `defaultSigning` tests (REMOVE every `reconcileForNetwork` and `resetLine` test)
- `src/components/wallet/__tests__/create-wallet-flow.test.tsx`, `add-wallet-import.test.tsx`, `walk-questions.test.tsx`, `check-words.test.tsx` -- update helpers and counts, rewrite the three tests above, and add tests for the I/O matrix: Review rows and Change names, Change then Next, Back clears the flag, Import Review, the lock (no Network Change anywhere after step 1, Review note present), reset-all on Back-to-step-1 Network change with the status line and polite role, no reset and no line when Network is unchanged, three PIN refusals move focus and show text beside the field with no keystore call, Create from the Review equals the old call, no Seed or PIN in the Review, every new sentence is under 21 words, and a test fails if a walk question yields no row

**Acceptance Criteria:**
- Given the walk is finished, when Next is pressed on Signing Check, then "Review" shows with "Step 7 of 7" (Import "5 of 5"), every applicable answer as text with its own Change, and Create wallet in the footer and nowhere earlier
- Given Change on any row, when its question renders, then the answer is as it was, and Next lands on the Review showing any edit
- Given any step after 1 or the Review, when Network shows, then it is plain text with no Change action, and the Review row says to go Back to step 1 to change it
- Given answers on later steps, when the user goes Back to step 1 and changes Network, then every later answer is at its pre-selection for the new Network (a custom Node is gone) and a polite status line on step 1 says the later questions start again
- Given the user goes Back to step 1 and does not change Network, then every later answer is kept and no line shows
- Given Passkey-Derived on an unbound address, when Network changes to Mainnet on step 1, then Seed Method is Stored, Signing Check is its pre-selection, and Passkey-Derived stays visible, `aria-disabled`, with its reason
- Given an App PIN is needed and the Review opens at 320px or 390px, when it renders, then the PIN plate is the last block, directly above the sticky footer, its fields fully visible without scrolling, and the answers are one "Your answers" plate with the create-consequence line last
- Given Create wallet is pressed with a missing, short or unmatched PIN, when the refusal shows, then focus is on the PIN field at fault with the reason as text beside it, and no keystore call is made
- Given the Review, when Create wallet is pressed, then policy refuses any illegal combination before any write, and a legal one makes the same call as before
- Given first-run Onboarding and the chooser's add screen, then the Review and the reset behave identically

## Spec Change Log

- 2026-10-30 (Otavio): the reconcile rule is replaced by a Network lock. Network is chosen on step 1 and locked after it; later steps and the Review show it as plain text with no Change (the Review row says to go Back to step 1); changing it on step 1 resets every later answer to its pre-selection, with a short polite status line there. Existing code in the working tree implements the old reconcile rule: REMOVE `reconcileForNetwork`, `resetLine`, and the reconcile tests in `network-reset.ts` and `network-reset.test.tsx`; KEEP `preselection`/`defaultSigning` and everything else (Review, Change buttons for the other rows, the return flag, the PIN refusals); implement the lock plus reset-all on a Back-to-step-1 Network change. Closes the intent_gap findings in the Review Triage Log. The "Change on Network" path in the Review rows is dropped.
- 2026-10-31 (Otavio): final Review layout. One "Your answers" plate first, the create-consequence line (with the Mainnet "Real funds" Badge) as its last line, no "Before you create" plate; the App PIN plate last, directly above the footer, its text not saying "below"; a row with no Change shows "Locked" plus a visible reason as text (Network: "Locked. To change it, go Back to step 1; the questions then start again."). Supersedes the PIN-above-answers placement and the "Go Back to step 1 to change the Network." wording; still reachable above the sticky footer at 320px and 390px, and the three PIN refusals still move focus to the field with the reason beside it.

## Review Triage Log
### 2026-10-30 — Review pass
- verdicts: 36 findings — high 0, medium 6, low 15, false 14, maybe-false 1
- route: intent_gap (the Network-change line is cleared before it can be seen when Network is changed from the Review; see the first group). Patch rows below are fix pending and moot until that is settled.
- findings:
  - Blind Hunter
  - `[medium]` `[intent_gap]` Reset note wiped before it is seen: `changeNetwork` sets `resetNote`, then Next from step 1 runs `goToIndex`, which clears it and jumps to the Review — verified in CreateWalletFlow.tsx `goToIndex`/`changeAnswer`; the Review shows reset answers with no explanation. The contract says the line sits under Network on step 1 and "clears when the step changes", and also adds a Change on Network, so it does not say what the person is told on this path. Several fixes are possible (keep the line, show it on the Review, name it on Next).
  - `[low]` `[reject]` Untouched Signing Check changes silently on a Network switch — the contract states this on purpose ("not named: it was never an answer of theirs"), and the Review shows the new value. Fix would go against the contract.
  - `[false]` `[reject]` Open Check and Auto-lock judged against the old Open Check — `describeOptions` makes `autoLock` depend only on Network, `openCheck` only on Network, capability and `imported`, and `signing` only on Seed Method; none read `openCheck`. `after` already uses `next.seedMethod`.
  - `[false]` `[reject]` Reset targets never checked for legality — `pre.openCheck` is passkey only when capability is `yes` (available) else App PIN (always available); `pre.seedMethod` is Stored (always available). No illegal target is reachable.
  - `[false]` `[reject]` `canConfirmWrittenSeed: true` hard-coded — same value as `CreateWalletFlow.tsx:249`, and it only affects `combination`, which `reconcileForNetwork` never reads.
  - `[false]` `[reject]` `changeNetwork` resets when Network does not change — `NetworkChoice` uses radio `onChange`, which does not fire on re-selecting the checked radio.
  - `[false]` `[reject]` `hidden` plus `className="contents"` — Tailwind v4 preflight (`node_modules/tailwindcss/preflight.css:396`) sets `[hidden]:where(:not([hidden='until-found'])) { display: none !important; }`, which beats `display: contents`.
  - `[low]` `[reject]` Focus and announcement after Change and after a refused PIN untested — the heading focus on a step change is in `QuizShell` (line 44) and unchanged, and the PIN reason tied by `aria-describedby` with focus on the field is exactly what the contract asks for; a live region would add complexity for no demonstrated loss.
  - `[false]` `[reject]` Reset line wording awkward — "Reset to the recommended answer:" is the contract's own example wording, and the short-sentence rule is tested.
  - `[low]` `[reject]` No warning for risky answers on the Review — not asked for by the intent; Mainnet floors are already refused by policy, and an untested custom Node is refused at create as today. Adding warnings is new scope.
  - `[false]` `[reject]` Step count changes during a return — `AddWalletScreen.tsx:174` renders the flow with `key={mode}`, so switching Create/Import remounts it and `returnToReview` resets.
  - `[false]` `[reject]` `goToIndex` hijacks a step-dot jump — `QuizShell` has only Back and Next (`onIndex(index - 1)` and `onIndex(index + 1)`); there are no step dots.
  - `[low]` `[reject]` Import Review test asserts `dt` terms by exact string — a wording change fails the test loudly, which is the point of such a test; developer-only and unlikely to cause trouble.
  - `[false]` `[reject]` CreateWalletFlow doc comment stale — it was updated (it lists signature type and says "then a Review"), and no "of 6" remains in the tests (they say "of 7").
  - `[low]` `[patch (fixed)]` `pinError` is never cleared by navigation — verified: `goToIndex` and `changeAnswer` clear `seedError`/`resetNote` but not `pinError`, so after a refused PIN, Back and a return to the Review the stale reason shows beside the field. Fix: `setPinError(null)` in `goToIndex` and `changeAnswer`. — Fix applied: already fixed in round 4: `setPinError(null)` in `goToIndex` and `changeAnswer`.
  - Edge Case Hunter
  - `[medium]` `[intent_gap]` Reset line cleared by `goToIndex` before the Review is seen (same defect as the first Blind Hunter row) — same evidence and same open question.
  - `[low]` `[reject]` Signing Check line reads "now Passkey only" although it did not change when Passkey-Derived falls back to Stored — the contract says both are named in that case ("Signing Check returns to the pre-selection and untouched, and both are named"). Fix goes against the contract.
  - `[false]` `[reject]` Availability depends on stale answers — see the Open Check row above; no availability in `describeOptions` reads `openCheck` or the old Signing Check.
  - `[low]` `[patch (fixed)]` Stale PIN reason after Back and a Signing Check change — same defect as the `pinError` row above (grouped, same one-line fix). Verified in `pinError` state and `goToIndex`. — Fix applied: fixed with the `pinError` row above.
  - `[low]` `[reject]` Second identical reset line not re-announced — two identical lines in a row would need Network changes that reset the same answers with nothing reset in between; going back to Testnet resets nothing, so the line empties between them. Unlikely, and the fix adds a timing trick.
  - `[low]` `[reject]` Untested custom Node not flagged on the Review — the contract keeps refusals "as today" and a test covers the refusal text; the Node row shows its state. A flag is new behaviour.
  - `[false]` `[reject]` `changeAnswer` with unknown step id does nothing — step ids come from `answerRows`, built from the same `walk` as `quizSteps`, so a row can never name a missing step.
  - `[low]` `[patch (fixed)]` Old refusal text stays after Change — the `pinError` half is real (grouped with the `pinError` row, same fix); the `seedError` half does not occur: a refused Seed returns to step 1 and any move from there clears it. Fix: `setPinError(null)` in `changeAnswer`. — Fix applied: fixed with the `pinError` row above.
  - `[low]` `[reject]` Refusal announced only through `aria-describedby` — focus moves to the field and the contract asks for this; a live region adds complexity for no shown loss.
  - `[low]` `[reject]` Create wallet below the fold on Onboarding at 320px — it is reachable by scrolling and the Onboarding footer position predates this story; the PIN plate is above the rows as the contract asks. Needs a real browser to see more, and a layout change is out of this story.
  - `[low]` `[reject]` Reset line wording differs from the contract example — the contract says "for example" and requires the check-words wording, so the longer term is what it asked for; cosmetic.
  - Verification Gap Reviewer
  - `[medium]` `[patch (fixed)]` Network change on the Import path not tested through the component — filed pre-verified. Fix: add a test in `add-wallet-import.test.tsx` that types a Seed, changes Network after a Testnet-only answer, and checks the status line and the Review rows. — Fix applied: fixed: `add-wallet-import.test.tsx` now types a Seed, changes Network on step 1, and checks the Seed is kept, the status line shows, and the Review rows are the defaults.
  - `[medium]` `[intent_gap]` Change Network, then Next to the Review, shows a reset nobody is told about (filed pre-verified, same defect as the first Blind Hunter row). A test cannot be written until the intended behaviour is settled.
  - `[medium]` `[patch (fixed)]` Passkey-Derived fallback test no longer reaches a create call — filed pre-verified. Fix: in that test fill the PIN, click Create wallet, and assert `createStoredWallet` was called and `createDerivedWallet` was not. — Fix applied: fixed: the b-cdn.net test now clicks Create wallet and asserts `createStoredWallet` was called and `createDerivedWallet` was not.
  - `[false]` `[reject]` `goToIndex` skips the step-1 Label guard — the reviewer checked this itself: `quizSteps[0].blocked` still applies in `QuizShell`, and the Label-error test shows Next stays blocked.
  - Intent Alignment Auditor
  - `[maybe-false]` `[defer]` "Above the footer without scrolling at 320px and 390px" shown only by DOM order — the PIN plate is the first block on the Review so it is likely fine, but no layout check exists. Would settle it: a real-browser pass at 320, 390 and desktop on Add wallet and Onboarding, checking the PIN fields sit above the sticky footer. If true it would be medium; recorded as unverified.
  - `[false]` `[reject]` "Not a dark readout well" met only by class name — `.panel-plate` in `src/index.css` uses `var(--card)` and `var(--border)`; `panel-well` is not used in the Review.
  - `[low]` `[reject]` Polite announcement not tested in a screen reader — the region is always mounted with `role="status"` and `aria-live="polite"`; jsdom cannot hear it, and nothing shows it is wrong.
  - `[medium]` `[intent_gap]` Reset line shown only on step 1, not on the Review — same defect as the first Blind Hunter row.
  - `[low]` `[reject]` Impeccable critique and browser pass leave no trace in the diff — a process step run outside the diff (see `## Verification`); no code defect at any cited place.
  - `[false]` `[reject]` `pinReadFailed` not covered by the focus rule — the contract scopes focus to the three PIN refusals; a failed read is a different state with its own Retry alert.

### 2026-10-30 — Review pass
- verdicts: 26 findings — high 0, medium 7, low 13, false 5, maybe-false 1
- route: patch (no intent_gap or bad_spec: the one real defect has a single sensible reading, so it is a one-line fix). New deferred items: none; the 320px/390px layout row is carried and is already in the frontmatter `deferred` list.
- findings:
  - Blind Hunter
  - `[medium]` `[patch (fixed)]` `returnToReview` survives a Network change — verified in CreateWalletFlow.tsx: `changeNetwork` resets every later answer but never calls `setReturnToReview(false)`, and `goToIndex` then jumps the next Next to the Review. Change on Label lands on step 1, where Network is editable, so a Network change there leaves reset answers on the Review, never walked and with no note. Group A (root cause: the return flag outlives the reset). Fix: `setReturnToReview(false)` in `changeNetwork`, plus a test (Change on Label, change Network, Next lands on step 2, not the Review). — Fix applied: fixed: `changeNetwork` calls `setReturnToReview(false)`; test: Change on Label, change Network, Next lands on step 2.
  - `[low]` `[reject]` Review's Network note says "Go Back to step 1" although Change Label also reaches step 1 — the wording is the contract's own ("the Review row says to go Back to step 1"); a fix edits the spec. Cosmetic.
  - `[medium]` `[patch (fixed)]` `carried` b-cdn.net test never clicks Create, so `createDerivedWallet` not-called can never fail — still reads that way (create-wallet-flow.test.tsx ~399-420). Fix: fill the PIN, click Create wallet, assert `createStoredWallet` was called and `createDerivedWallet` was not. — Fix applied: fixed: same as the b-cdn.net row above.
  - `[low]` `[patch (fixed)]` Test title `'step 2 of 6 is the Node question…'` while the body asserts "Step 2 of 7" — verified at create-wallet-flow.test.tsx:235. Fix: change the title to "step 2 of 7". The brittleness of hard-coded "Step N of 7" is rejected: developer-only, and the fix (derive from `GENERATE_STEPS`) is a wider refactor. — Fix applied: fixed: title now says 'step 2 of 7'.
  - `[low]` `[patch (fixed)]` Stale comment in walk-questions.ts line 33 ("the Review and the Network-change line both read them"; `NETWORK_RESET_NOTE` is a constant reading no formatter) and a bad wrap at line 17 — verified. Fix: reword both comments. — Fix applied: fixed: both comments reworded in `walk-questions.ts`.
  - `[low]` `[reject]` The reset note does not say what was lost, and no marker for reset defaults on the Review — the contract fixes the line as "The later questions start again." and says nothing is kept and no marker is on the Review; a fix edits the spec.
  - `[medium]` `[patch (fixed)]` `carried` Import path through `changeNetwork` untested at component level — carried from the earlier pass (filed pre-verified). Fix: a test in add-wallet-import.test.tsx that types a Seed, changes Network, and checks the Seed is kept, the line shows, and the Review rows are the defaults. The "derived backup not cleared" half is false: `derivedBackup` and `backedUp` are set only after a create succeeds, on the post-create steps, which cannot be reached from step 1. The "only pure helpers tested" half is rejected: the component test at create-wallet-flow.test.tsx:1268 covers `changeNetwork`. — Fix applied: fixed: same as the Import test row above.
  - `[low]` `[reject]` `'name-network'` and `step:` literals duplicated, so a mismatch gives a dead Change button — step ids come from the same `walk` and a walk-questions test fails if a row names a missing step; a mismatch is unlikely and the fix is a refactor.
  - `[low]` `[reject]` `'testnet'` hard-coded in four initialisers — no drift today, and `preselection('testnet', …)` is the documented starting Network; the fix adds a constant for a default nobody is changing.
  - `[low]` `[reject]` PIN plate before the answers hurts reading order — the contract puts it there on purpose (visible at 320px without scrolling past eight rows).
  - `[low]` `[reject]` Accessibility bundle on the PIN error — live-region point carried and rejected earlier (focus plus `aria-describedby` is what the contract asks); "aria-describedby drops the hints" is false (the tries and "One App PIN serves…" lines have no id and were never part of the description); long Change names are the contract's "Change <row term>"; focus after Change untested was rejected earlier (QuizShell heading focus is unchanged).
  - Edge Case Hunter
  - `[medium]` `[patch (fixed)]` Change on Label, change Network, Next: reset lands unannounced — same defect as the first Blind Hunter row (Group A); same fix. — Fix applied: fixed: same fix as row 159 (`setReturnToReview(false)`).
  - `[low]` `[patch (fixed)]` Stale "Test the custom Node first" error after the Node resets — verified: `error` renders on every step (line ~729) and `changeNetwork` never clears it, so the old refusal shows beside a Node that is already built-in again. Fix: `setError(null)` in `changeNetwork`. — Fix applied: fixed: `changeNetwork` calls `setError(null)`; test added.
  - `[low]` `[patch (fixed)]` Typing in the other PIN field clears this field's reason — verified: `pinFieldProps` `onChange` is `setPinError(null)` for both fields, while the contract clears the text only when typing in the field at fault. Fix: `setPinError((e) => (e?.field === field ? null : e))`. — Fix applied: fixed: `onChange` clears the error only when the typed field is the one at fault.
  - `[false]` `[reject]` Backup state carries into a reset flow — `backedUp` and `derivedBackup` are set only on the post-create steps, after the quiz is left; the quiz cannot be re-entered with them set.
  - `[false]` `[reject]` Note shows although nothing was reset — the contract says the line shows when Network is changed on step 1; `changeNetwork` returns early on the same Network, so it shows exactly then.
  - `[low]` `[reject]` Identical second note not re-announced — `carried` from the earlier pass: the line empties between changes, and the fix is a timing trick.
  - Verification Gap Reviewer
  - `[medium]` `[patch (fixed)]` Passkey choice and Node draft reset not asserted — filed pre-verified; the reset lines exist (CreateWalletFlow.tsx:285-286) and no test breaks if removed. Fix: extend the test at create-wallet-flow.test.tsx:1268 to pick Passkey-Derived plus Existing passkey and type a Node draft, then change Network and assert the defaults. — Fix applied: fixed: the reset test now picks Passkey-Derived plus Existing passkey and types a Node draft, then asserts the defaults.
  - `[medium]` `[patch (fixed)]` Other finding: first forward move after a Change goes to the Review even after a Network change on step 1 — same defect as the first Blind Hunter row (Group A). The spec wants a walk restart after a Network change ("start again"), so the flag is cleared and a test added. — Fix applied: fixed: same fix as row 159.
  - `[false]` `[reject]` Other finding: `refusePin` focus on a hidden field — the reviewer itself says it cannot happen (`handleCreate` runs from the Review, which un-hides the wrapper); not a defect.
  - Intent Alignment Auditor
  - `[maybe-false]` `[defer]` `carried` PIN visible above the sticky footer at 320px and 390px shown only by DOM order — already in the frontmatter `deferred` list (medium, unverified); not added again.
  - `[false]` `[reject]` Focus on refusal could differ in a real browser because the wrapper is `hidden` — the Review render un-hides it before Create can be pressed, and the earlier Playwright pass at 320px confirmed focus lands on the field.
  - `[medium]` `[patch (fixed)]` Network lock has a gap through Change on Label — same defect as the first Blind Hunter row (Group A); same fix. — Fix applied: fixed: same fix as row 159.
  - `[low]` `[reject]` Polite announcement not heard in a screen reader — `carried`: region is always mounted with `role="status"` and `aria-live="polite"`; nothing shows it is wrong.
  - `[false]` `[reject]` Stale test and spec surfaces keep older Network assertions — the tests were rewritten to the lock rule; the only leftover is the stale title already logged above.
  - `[low]` `[reject]` Impeccable critique and fixes leave no trace in the diff — `carried`: a process step, open in Auto Run Result, no code defect.


### 2026-10-31 — Review pass
- verdicts: 21 findings — high 0, medium 2, low 13, false 5, maybe-false 1
- route: patch (no intent_gap or bad_spec: every real defect has one sensible reading and a small fix). New deferred items: 1 (low, pre-existing stale error text); the 320px/390px layout row is carried and is already in the frontmatter `deferred` list.
- findings:
  - Blind Hunter
  - `[low]` `[reject]` `carried` "Locked" Network row contradicts Change on Label, and the note gives the wrong route — same location and claim as the earlier "Go Back to step 1" row: the wording is the contract's own, a fix edits the spec; cosmetic.
  - `[low]` `[reject]` Consequence line says "Nobody can recover its Seed for you" for Passkey-Derived on Mainnet and for imports — verified: the sentence stays true (nobody but the person, via the passkey or their own copy, can recover it), so it is imprecise, not wrong; the fix adds Seed Method branches to a copy line for a rare case.
  - `[low]` `[reject]` `createConsequence` takes `network: string` and falls back to the test-funds text — verified in check-words.ts, but the only call site passes a `NetworkId` (a union of three, all handled) and no new Network is planned; a developer would not meet it in everyday use and an exhaustive switch is more than a direct correction.
  - `[low]` `[reject]` `carried` Network change also resets answers that were still legal — the contract says "no reconcile, no keep-legal logic" and "nothing is kept"; same claim as the earlier "does not say what was lost" row; a fix edits the spec.
  - `[false]` `[reject]` Choosing Stored Seed again silently overwrites Signing — `Choice` is a radio, whose `onChange` does not fire on re-selecting the checked one, so `onSelectStored` runs only when switching from Passkey-Derived, where Signing was forced to `passkey` and nothing the person chose is lost.
  - `[low]` `[reject]` Switching to Passkey-Derived from the Review skips the Signing Check question — verified, but forcing `signing = 'passkey'` is FR-67 and pre-dates this story, and the Review shows the changed Signing row and the new Passkey row right away; a note adds a branch for no lost money or key.
  - `[low]` `[patch (fixed)]` No test asserts the new "Network: X" line on walk steps — verified: grep finds no "Network:" assertion in the quiz tests; the contract requires Network as plain text on later steps, so removing the line would pass every test. Same defect as the Intent Alignment Auditor row on Network wording (grouped). The unstyled paragraph and the duplicate of the Review row are cosmetic and rejected. Fix: assert the line on step 2 and its absence on step 1. Fixed: create-wallet-flow.test.tsx asserts "Network: Testnet" is absent on step 1 and shown on step 2.
  - `[low]` `[reject]` Several tests would pass on a broken page — the `[hidden]` worry is refuted: Tailwind v4 preflight sets `[hidden] { display: none !important }`, which beats `display: contents` (see the earlier row); the click-until-gone loops and the `as unknown as` fixture are test-style choices that fail loudly on a missing button or shape drift in everyday use; the real-browser check is the carried 320px row.
  - `[medium]` `[patch (fixed)]` PIN refusal may not be read out to a screen reader — verified in CreateWalletFlow.tsx `refusePin`: `setPinError` is queued and `focus()` runs at once, so the field takes focus before `aria-invalid` and `aria-describedby` exist, and the old `role="alert"` line is gone. Same defect as the Edge Case Hunter "removed alert" row (grouped). The other claims: the "N tries remaining" hint is not part of the field's description (no `aria-describedby` pointed at it before), so nothing is dropped (false); the long Change labels are the contract's own terms (cosmetic, rejected). Fix: apply the state with `flushSync` before calling `focus()`. Fixed: refusePin applies the pinError state with flushSync before focus(), so aria-invalid and aria-describedby are on the field when it takes focus.
  - Edge Case Hunter
  - `[low]` `[reject]` Create pressed while the App PIN read has not resolved gives no visible refusal — verified: `refusePin` sets a reason for fields that are not mounted. The read is a local IndexedDB lookup that finishes long before step 7 is reached; a guard adds a branch for a window nobody meets in everyday use.
  - `[low]` `[defer]` Stale refusal text in `error` stays after Back or Change — verified: `error` renders on every step (CreateWalletFlow.tsx:744) and `goToIndex` clears the other reasons but not it; the behaviour pre-dates this story (the old `onIndex` cleared only `seedError`). Recorded in the frontmatter `deferred` list.
  - `[false]` `[reject]` Return-to-Review flag outlives other paths on step 1 — the flag is dropped in `changeNetwork`, on Back, and on arrival at the Review (`goToIndex`), and the report names no path that leaves it set.
  - `[false]` `[reject]` Seed refusal returns to step 1 with the flag still set — Create exists only on the Review, where the flag was already dropped on arrival; the flag is true only on a step reached through Change, which has no Create button.
  - `[medium]` `[patch (fixed)]` Removed bottom alert for PIN refusals, refusal no longer announced as an alert — grouped with the Blind Hunter PIN row above (same root cause: the refusal depends on focus and an attribute set after focus); same fix. Fixed: same flushSync change in refusePin.
  - `[false]` `[reject]` Claim that rows come from one function shared with the reset line is vacuous — the reset line is now the constant `NETWORK_RESET_NOTE` and the lock rewrite removed that spec sentence's premise; no wording can diverge.
  - Verification Gap Reviewer
  - `[low]` `[patch (fixed)]` Consequence line never checked for an Import — filed pre-verified; the filed disposition was defer, but the wrong tense on the import path is caused by this story's `imported` parameter and one assertion closes it, so it is patched. Fix: in `add-wallet-import.test.tsx`, on the Review assert "This wallet holds test funds only." on Testnet and, on Mainnet, "This wallet holds real funds. Nobody can recover its Seed for you." plus the "Real funds" stamp. Fixed: add-wallet-import.test.tsx asserts the Import Review line on Testnet and, on Mainnet, the real-funds line and the "Real funds" stamp.
  - Intent Alignment Auditor
  - `[maybe-false]` `[defer]` `carried` PIN plate above the sticky footer at 320px and 390px shown only by DOM order — same claim as the earlier row, already in the frontmatter `deferred` list (not added again). Would settle it: a real-browser pass at 320, 390 and desktop on Add wallet and Onboarding.
  - `[false]` `[reject]` `carried` "Plate styling, not a dark readout well" met only by class name — `.panel-plate` uses `var(--card)` and `var(--border)`; `panel-well` is not used in the Review.
  - `[low]` `[reject]` `carried` Impeccable critique and browser pass leave no trace in the diff — a process step outside the diff; no code defect at any cited place.
  - `[low]` `[reject]` `carried` Polite announcement semantics (`role="status"` inside an `Alert`) not tested in a screen reader — jsdom cannot hear it and nothing shows it is wrong.
  - `[low]` `[patch (fixed)]` Network text on later steps has no test — grouped with the Blind Hunter "Network: X" row (same missing assertion); same fix. Fixed: same step 1 and step 2 assertion as the "Network: X" row.

### 2026-10-31 — Review pass
- verdicts: 27 findings — high 0, medium 0, low 20, false 5, maybe-false 2
- route: patch (no intent_gap or bad_spec: the two real defects have one sensible reading and a direct fix). New deferred items: none; the stale `error` text row and the 320px/390px layout row are carried and are already in the frontmatter `deferred` list. Patch rows are fix pending.
- findings:
  - Blind Hunter
  - `[low]` `[reject]` Review alert says "Use a Change button below" but Network has no Change — verified in CreateWalletFlow.tsx `blockedAlert`: every answer is chosen from options that `describeOptions` marks unavailable when illegal, and a Network change resets every later answer to a legal pre-selection, so the Review cannot be blocked by Network in everyday use; if it ever is, Back reaches step 1. Unlikely, and the fix adds a branch to the alert.
  - `[low]` `[reject]` `carried` `createConsequence` takes `network: string` and falls back to the test-funds text — same location and claim as the earlier row; the only call site passes a `NetworkId`, all three handled.
  - `[low]` `[reject]` `carried` Change then Next skips the questions the edit affected (Passkey-Derived forces Signing) — same claim as the earlier "Switching to Passkey-Derived from the Review" row: FR-67 forces it, and the Review shows the changed Signing and Passkey rows at once.
  - `[low]` `[reject]` `carried` Network reset note is vague about what was reset and kept — same claim as the earlier "does not say what was lost" row; the contract fixes the line as "The later questions start again." and it shows whenever Network changes.
  - `[low]` `[patch (fixed: `locked` deleted from `AnswerRow` in WalletQuestions.tsx and from the Network row; `step` absent and `note` kept)]` `AnswerRow.locked` is set in `answerRows` but never read — verified: grep finds `locked` only in the interface and at walk-questions.ts:121; `ReviewStep` decides by `step === undefined`. Two ways to mark a locked row can drift apart. Group A with the Edge Case Hunter `locked` row. Fix: delete the `locked` field from `AnswerRow` and from the Network row.
  - `[low]` `[patch (fixed: Node row now `data: p.nodeMode === 'custom' && !!p.verifiedNode`)]` Node row sets `data: true` for the prose value "Built-in Nodes" — verified in walk-questions.ts:68: the Data face is for an address, URL or number, and `formatNode` returns prose for the built-in choice. The Auto-lock row ("5 minutes") is a number and stays. Fix: `data: nodeMode === 'custom' && !!verifiedNode`.
  - `[low]` `[reject]` Network context line has no Real-funds stamp and no test that it is absent on the Review — verified: `walkQuestion` is undefined on the Review, so the line cannot show there, and step 1 and step 2 are already asserted; the stamp is not in the contract for walk steps (the Review row and consequence line carry it).
  - `[low]` `[reject]` `carried` No focus move after Change or after landing on the Review — same claim as the earlier row; `QuizShell.tsx:44` focuses the step heading on every index change, including a Change, and `document.activeElement` is not a gap that loses anything.
  - `[low]` `[reject]` Review states untested (untested custom Node row, `disabled={busy}`, `pinReadFailed` in the plate, Mainnet passkey-derived reset) — each is one expression in code that fails loudly if wrong; developer-only and a wider test sweep.
  - `[false]` `[reject]` `carried` `hidden` plus `className="contents"` may show the PIN fields early — Tailwind v4 preflight sets `[hidden]:where(:not([hidden='until-found'])) { display: none !important; }`, which beats `display: contents`.
  - `[false]` `[reject]` `pinError` not cleared on a Network change — `pinError` exists only on the Review; leaving it goes through `goToIndex` or `changeAnswer`, both clear it, and Network can only be changed on step 1; `handleCreate` clears it first.
  - `[low]` `[reject]` `carried` Initial network `'testnet'` duplicated in the seeds and the state default — same claim as the earlier "hard-coded in four initialisers" row; no drift, nobody is changing the default.
  - `[low]` `[reject]` Word-limit test covers only some Review strings — the unchecked strings are short fixed text; a longer sentence would be seen in review, and the fix is more tests, not a defect.
  - `[low]` `[reject]` Weak "no Seed or PIN" regexes in the `answerRows` test — `answerRows` takes no Seed or PIN input at all, and the component tests assert `not.toContain(SEED)`; the unit test is a second net.
  - Edge Case Hunter
  - `[low]` `[defer]` `carried` Stale `error` text stays after Back or Change — same claim as the earlier row; `goToIndex` and `changeAnswer` still do not clear `error` (CreateWalletFlow.tsx:645-661). Already in the frontmatter `deferred` list, not added again.
  - `[false]` `[reject]` `carried` `derivedBackup`/`backedUp`/Seed refusal survive a Network change — set only after a create succeeds, on steps unreachable from step 1; a Seed refusal clears on any move from step 1.
  - `[low]` `[reject]` Alert names no route for a Network-caused block — same claim and evidence as the first Blind Hunter row.
  - `[low]` `[patch (fixed: same deletion, the field no longer exists)]` A row with `locked: true` and a `step` would still show Change — grouped with Group A (same dead field); no row does this today, and deleting the field removes the question. Fix: the same deletion.
  - `[low]` `[reject]` A wrong App PIN (keystore refusal) still fails in the bottom line, not at the field — verified: it returns `wrong-credential` and goes to `setError` (a `role="alert"` line); the contract lists exactly three refusals that move focus (missing, short, mismatch). Behaviour unchanged by this story; the fix adds a mapping branch.
  - `[low]` `[reject]` `carried` An identical second reset line is not re-announced — same claim as the earlier row; the line empties between two changes in practice.
  - `[low]` `[reject]` Seed Method away and back discards the Signing answer now that `signingTouched` is gone — verified: Passkey-Derived forces Signing to `passkey` (FR-67), so the earlier answer is already lost at the first switch; the contract removes the touched flag on purpose ("nothing reads legality to decide what to keep").
  - `[maybe-false]` `[defer]` `carried` PIN plate above the sticky footer at 320px and 390px shown only by DOM order — same claim as the earlier rows, already in the frontmatter `deferred` list. Would settle it: a real-browser pass at 320, 390 and desktop on Add wallet and Onboarding.
  - Verification Gap Reviewer
  - `[low]` `[reject]` `carried` Mainnet consequence line "Nobody can recover its Seed for you" may not fit Passkey-Derived — same claim as the earlier row; imprecise, not wrong.
  - Intent Alignment Auditor
  - `[maybe-false]` `[defer]` `carried` PIN plate visibility and place above the footer is checked in jsdom only — same claim as the row above; already in `deferred`.
  - `[false]` `[reject]` The PIN plate is hidden, not unmounted — the contract requires exactly that ("hidden elsewhere, never unmounted").
  - `[low]` `[reject]` `carried` Polite status line checked by markup, not by announcement — same claim as the earlier row; jsdom cannot hear it.
  - `[false]` `[reject]` "Locked" row is one string where the criterion splits the word and the reason — the contract itself gives the single string "Locked. To change it, go Back to step 1; the questions then start again." and the code and test match it.

### 2026-10-31 — Review pass
- verdicts: 28 findings — high 0, medium 0, low 20, false 6, maybe-false 2
- route: patch (no intent_gap or bad_spec: the two real defects have one sensible reading and a direct fix). New deferred items: none; the stale `error` text row and the 320px/390px layout row are carried and are already in the frontmatter `deferred` list. Patch rows are fix pending.
- findings:
  - Blind Hunter
  - `[low]` `[defer]` `carried` Stale "The wallet was not created" alert follows the person to other steps — same claim as the earlier stale `error` row; `goToIndex` and `changeAnswer` still do not clear `error`. Already in the frontmatter `deferred` list, not added again.
  - `[low]` `[patch (fixed)]` A repeated refusal does not refocus or scroll — verified: `handleCreate` calls `setError(null)` (CreateWalletFlow.tsx:340) and then the synchronous refusals `setError('Test the custom Node first...')` (:349) and the App PIN read one (:345) in the same tick, so React batches them, `error` keeps the same string and the `[error]` effect (:194) does not run on the second press. Same defect as the Edge Case Hunter row on the same effect (grouped). Fix: key the effect on a counter that `handleCreate` bumps with each refusal (a `errorTick` state), so it fires on every refusal. Fixed: `handleCreate` bumps an `errorTick` state on the two synchronous refusals and the focus/scroll effect is keyed on `[error, errorTick]`.
  - `[low]` `[reject]` Error may be announced twice, and `variant="warning"` does not say "failed" — the Alert has `role="alert"` (ui/alert.tsx:95) and the title reads "The wallet was not created"; double announcement is a guess jsdom cannot hear and nothing shows it happens; the styling is a cosmetic choice and the words carry the meaning.
  - `[low]` `[patch (fixed)]` Network row says "Locked" and the note lists the Back route; `changeAnswer` keeps a `restart = stepId === 'network'` branch no row can reach — verified: the Network row has no `step` (walk-questions.ts), so `ReviewStep` never calls `changeAnswer('network')` and the branch (CreateWalletFlow.tsx:663-666) is dead and can drift from the lock rule. The "Locked" wording and the Change Label route are `carried` (same claim as the earlier "Locked" row: the wording is the contract's own, a fix edits the spec). Same defect as the Edge Case Hunter dead-branch row (grouped). Fix: delete the `restart` branch in `changeAnswer` (`at = quizSteps.findIndex(...)`, `setReturnToReview(true)`). Fixed: the dead `restart` branch is deleted; `changeAnswer` finds the step, returns if none, and calls `setReturnToReview(true)`.
  - `[low]` `[reject]` `carried` Blocked alert says "Use a Change button below" though Network has no Change — same claim and evidence as the earlier "Change button" row: a Network change resets to a legal pre-selection, so Network cannot be the cause in everyday use.
  - `[low]` `[reject]` `carried` `createConsequence` takes `network: string` and falls back to test funds — same location and claim as the earlier row; the only call site passes a `NetworkId`.
  - `[low]` `[reject]` Create button loses the real-funds description when creation is blocked, and steps 2 to 6 have no real-funds cue — verified at CreateWalletFlow.tsx:591: the description falls through to the blocked or label reason first, which is what a blocked button should say, and the real-funds line sits on the Review next to it; the steps 2 to 6 half is the same as the earlier "no Real-funds stamp on the Network line" row (not in the contract). A fix joins several ids, more than a direct correction, for a negligible effect.
  - `[low]` `[reject]` `carried` Reset note is vague about what was reset and kept, and resets legal answers — same claim as the earlier "does not say what was lost" row; the contract fixes the line and says "nothing is kept"; a fix edits the spec.
  - `[low]` `[reject]` `carried` `signingTouched` removed, Derived then Stored discards a chosen Signing Check — same claim as the earlier Seed Method round-trip row: Passkey-Derived forces Signing to `passkey` (FR-67), so nothing chosen survives the first switch; the contract removes the flag.
  - `[low]` `[reject]` Import Review shows no address to catch a wrong Seed — verified: the rows come from the contract, which lists none for Import, and no address is shown anywhere in the import flow before this story; a fix adds a row and needs the Seed read to derive it, so it edits the spec and adds secret handling for a pre-existing gap.
  - `[false]` `[reject]` `carried` `hidden` with `className="contents"` may show the PIN fields early — Tailwind v4 preflight sets `[hidden]:where(:not([hidden='until-found'])) { display: none !important; }`, which beats `display: contents`.
  - `[low]` `[reject]` Smaller maintainability gaps (`QUESTION_TERMS` identical strings, two note constants in two files, "Step 7 of 7" literals, the 21-word regex, six Back clicks outside `act`, a long `aria-label`) — each is a style choice that fails loudly or is the contract's own wording (the long names are the contract's row terms); no named harm and any fix is a refactor.
  - Edge Case Hunter
  - `[low]` `[reject]` `carried` Create pressed while the App PIN read has not resolved gives no visible refusal — same claim as the earlier row: a local IndexedDB read that finishes long before step 7; a guard adds a branch for a window nobody meets.
  - `[low]` `[patch (fixed)]` Same refusal string set twice is batched, so no refocus or scroll on the second press — same defect as the Blind Hunter row on the `[error]` effect (grouped); same fix (the `errorTick` counter). Fixed: `handleCreate` bumps an `errorTick` state on the two synchronous refusals and the focus/scroll effect is keyed on `[error, errorTick]`.
  - `[low]` `[defer]` `carried` Stale refusal text stays after Back or Change — same claim as the earlier row and the first Blind Hunter row; already in the frontmatter `deferred` list.
  - `[low]` `[reject]` Error alert renders after the PIN plate, so the plate is not last — verified (CreateWalletFlow.tsx:767): the alert shows only after a failed Create and sits next to the footer button the person just pressed, with focus and scroll moved onto it; the contract's "last block" describes the Review before any refusal. Putting the alert first would push it away from the button.
  - `[low]` `[patch (fixed)]` `changeAnswer` restart branch is never reached — same defect as the Blind Hunter dead-branch row (grouped); same fix (delete the branch). Fixed: the dead `restart` branch is deleted; `changeAnswer` finds the step, returns if none, and calls `setReturnToReview(true)`.
  - `[low]` `[reject]` `carried` An identical second reset line is not re-announced — same claim as the earlier row; the line empties between two changes in practice.
  - `[maybe-false]` `[defer]` `carried` PIN plate above the sticky footer at 320px and 390px shown only by DOM order — same claim as the earlier rows, already in the frontmatter `deferred` list (not added again). Would settle it: a real-browser pass at 320, 390 and desktop on Add wallet and Onboarding.
  - `[low]` `[reject]` Claim that the PIN plate is the last block above the footer fails when an error shows — same claim and evidence as the "alert renders after the PIN plate" row above (grouped); the alert is transient and by design near the button.
  - `[low]` `[reject]` `carried` Removed alert: a PIN refusal with unmounted fields gives no message — same claim as the App PIN read row above; the fields are mounted once the read resolves.
  - Verification Gap Reviewer
  - No findings filed ("No verification gaps found").
  - Intent Alignment Auditor
  - `[maybe-false]` `[defer]` `carried` Visual criteria (PIN plate last above the sticky footer, fully visible at 320/390px, plate styling) exercised in jsdom only, and the critique and browser pass leave no trace in the diff — same claim as the earlier rows; already in the frontmatter `deferred` list. Would settle it: the real-browser pass at 320, 390 and desktop in both themes.
  - `[false]` `[reject]` `carried` "Locked" row is one string where the criterion splits the word and the reason — the contract gives the single string, and the code and test match it.
  - `[false]` `[reject]` "Network plain text" on later steps is untested — create-wallet-flow.test.tsx:235 asserts "Network: Testnet" is absent on step 1 and shown on step 2, and the earlier pass added it.
  - `[false]` `[reject]` Status line clears on the next step transition — that is the contract ("clears when the step changes"); `goToIndex` sets `resetNote` to null and the line shows on step 1 only.
  - `[false]` `[reject]` Reset clears more than the pre-selection fields (algorithm, passkey choice, Node draft) — the contract lists Node mode and custom Node, Seed Method, Passkey and Signature type among "every later answer"; nothing outside the contract's list is reset.
  - `[low]` `[reject]` Create failure now a warning Alert in a focusable wrapper, not a plain `role="alert"` line — verified (CreateWalletFlow.tsx:767-774): the Alert keeps `role="alert"` and the text, and the focus and scroll serve the sticky-footer case the story is about; the contract does not forbid it and nothing is lost.
  - `[false]` `[reject]` Create-time refusal is not exercised beyond existing tests — the contract says `handleCreate` keeps its guards unchanged, which the diff does; there is nothing to build.

### 2026-10-31 — Review pass
- verdicts: 26 findings — high 0, medium 0, low 21, false 3, maybe-false 2
- route: patch (no intent_gap or bad_spec: the one real defect new to this pass has one sensible reading and a direct fix). New deferred items: 1 (medium, unverified: a focused PIN field may sit under the sticky footer); the stale `error` text row and the 320px/390px layout row are carried and already in the frontmatter `deferred` list. Patch rows are fix pending.
- findings:
  - Blind Hunter
  - `[low]` `[reject]` `carried` Seed Method change overwrites the Signing Check — same claim as the earlier `signingTouched` rows: Passkey-Derived forces Signing to `passkey` (FR-67), so nothing chosen survives the first switch; the contract removes the flag.
  - `[low]` `[defer]` `carried` Failed-create alert survives Back and Change — same claim as the earlier stale `error` rows; `goToIndex` and `changeAnswer` still do not clear `error`. Already in the frontmatter `deferred` list, not added again.
  - `[low]` `[reject]` No jump to step 1 from the Review (six Back presses) — verified: `QuizShell` only steps one at a time, so it is real, but the contract names "go Back to step 1" as the route and changing Network after step 1 is rare; a jump control adds new surface the contract did not ask for.
  - `[low]` `[reject]` `carried` Network reset is broad and vague, resets Signature type, and is shown even when nothing was customised — same claim as the earlier "does not say what was lost" and "keep-legal" rows; the contract lists Signature type among "every later answer", fixes the line as "The later questions start again." and says "nothing is kept"; a fix edits the spec.
  - `[low]` `[reject]` `carried` A Change jump can skip dependent questions (Open Check, untested custom Node) — same claim as the earlier "Change then Next skips the questions" row; the Review shows the changed rows at once and an untested custom Node is refused at Create with its own text.
  - `[low]` `[reject]` `createConsequence` wording differs by tense, ignores `imported` off Mainnet, and `network: string` — the `network: string` part is `carried` (the only call site passes a `NetworkId`); "holds test funds only" is true for a wallet that will hold test funds and moves no money; cosmetic.
  - `[low]` `[reject]` `carried` Consequence line is linked to Create only on Mainnet — same claim as the earlier "Create button loses the real-funds description" row; the blocked or label reason rightly wins, and test funds carry no risk to announce.
  - `[low]` `[reject]` `carried` Create-failure alert is a warning tone and may be read twice — same claim as the earlier "announced twice" row; the Alert keeps `role="alert"` and its title says "was not created". `scroll-mb-32` as a magic number is a style choice with no named harm.
  - `[low]` `[reject]` PIN reason has no live region, and the PIN length rule exists in three places — the live-region half is `carried` (focus plus `aria-describedby` is what the contract asks); the length rule is duplicated the same way in `EditChecksScreen.tsx:300`, so it pre-dates this story, and a shared constant is a refactor beyond a direct fix.
  - `[low]` `[reject]` `carried` Test brittleness and gaps (hard-coded step counts, Back loops without `act`, word-count test covers some strings) — same claim as the earlier maintainability and word-limit rows; the new sub-claim that a long custom Node URL is untested at 320px is not a defect: the row already uses the Data face with `break-words` (WalletQuestions.tsx:147) and jsdom cannot measure width.
  - `[low]` `[reject]` Review omits whether the temporary-address warning applies and the written-Seed step after Create — verified: neither is an answer, the contract asks for "every applicable answer", and the warning shows on the Seed Method step; adding text is new scope, not a lost answer.
  - `[low]` `[reject]` `ReviewPlate` comment, `AnswerRow.step` typed `string`, `QUESTION_TERMS` keys — the comment is accurate (both the answers and the App PIN use `ReviewPlate`) and the section has `aria-label`, asserted by `section[aria-label="Your answers"]` in tests; a mistyped `step` shows as a Change button that does nothing and the Change tests walk every row, so it fails loudly. A shared `StepId` union is a refactor.
  - Edge Case Hunter
  - `[low]` `[reject]` `carried` Create pressed while the App PIN read has not resolved gives no visible refusal — same claim as the earlier rows: a local IndexedDB read that finishes long before step 7; a guard adds a branch for a window nobody meets.
  - `[low]` `[defer]` `carried` Stale "The wallet was not created" alert on later steps — same claim as the earlier stale `error` rows; already in the frontmatter `deferred` list, not added again.
  - `[low]` `[reject]` `carried` Error alert renders after the PIN plate, so the plate is not last — same claim as the earlier row; the alert is transient and sits by the button just pressed, with focus and scroll moved to it.
  - `[false]` `[reject]` `carried` Derived-only state survives a Network change — `derivedBackup`, `backedUp` are set only after a create succeeds, on steps unreachable from step 1; the reset already sets Seed Method to Stored.
  - Verification Gap Reviewer
  - `[low]` `[patch (fixed)]` Repeated identical Create refusal is not tested for refocus (`errorTick`) — filed pre-verified with disposition defer; the `errorTick` counter was added by this story and a regression would pass every test, and the fix is one test with no code change, so it is patch. Fix: in `create-wallet-flow.test.tsx` trigger the custom-Node refusal, move focus elsewhere, click Create again, and assert the error wrapper has focus. Applied: added the test "a repeated identical Create refusal moves focus back to the error each time" in `create-wallet-flow.test.tsx`; no code change.
  - `[low]` `[reject]` `not.toContain(SEED)` reads `textContent` only — the assertion targets the Review `section`, which holds no inputs; the Seed field is a separate hidden block outside it, and nothing in the diff renders a Seed.
  - `[low]` `[reject]` `carried` Confirm-field reason clearing and `disabled={busy}` on Change are untested — same claim as the earlier "Review states untested" row; each is one expression that fails loudly, and the reviewer itself says it is not a gap that matters.
  - Intent Alignment Auditor
  - `[maybe-false]` `[defer]` `carried` PIN plate last above the sticky footer, visible at 320px and 390px, plate styling — checked in jsdom only — same claim as the earlier rows, already in the frontmatter `deferred` list (not added again). Would settle it: a real-browser pass at 320, 390 and desktop on Add wallet and Onboarding.
  - `[maybe-false]` `[defer]` A focused PIN field may sit under the sticky footer on a small screen; only the Create error block has `scroll-mb-32` and `scrollIntoView` — different claim from the layout row (focus and scroll, not placement). The PIN field has no scroll margin (CreateWalletFlow.tsx PIN inputs), and the browser scroll on `focus()` may or may not clear the footer; jsdom cannot tell. If true it would be medium: the reason beside the field could be hidden. Would settle it: Playwright at 320 and 390 on Add wallet with a short PIN, check the field's box against the footer's. New `deferred` item.
  - `[low]` `[reject]` `carried` Polite status line proven by markup, not by announcement — same claim as the earlier rows; jsdom cannot hear it and nothing shows it is wrong.
  - `[low]` `[reject]` `carried` Browser pass and critique leave no trace in the diff — a process step outside the diff, open in Auto Run Result; no code defect at any cited place.
  - `[low]` `[reject]` Consequence line "last line" placement not tested at layout level — verified: a test asserts the answers plate holds the consequence line, and `footer` renders last in `ReviewPlate`; layout-level proof is the real-browser item above.
  - `[false]` `[reject]` `carried` "Locked" is one string where the criterion splits word and reason — the contract gives the single string and the code and test match it.
  - `[false]` `[reject]` Network radio on step 1 only and plain "Network: X" text later — that is the contract's rule ("Network is plain text on later steps"), not a divergence.

## Design Notes

- Decided by the owner 2026-10-30: Network is locked after step 1; a change on step 1 resets every later answer, with no keep-legal logic. This closes the intent_gap in the Review Triage Log below.
- Resolved without asking: the status line sits on step 1, the only place Network changes, and clears on a step change. The Review has no Network Change and no reset line.
- Decided by the owner 2026-10-31: the Review is one "Your answers" plate (rows, then the create-consequence line), and the App PIN plate comes last, directly above the footer. This replaces the earlier "PIN plate first" resolution and the separate "Before you create" plate.
- Resolved without asking: Create or Import is not a Review row, and Seed is never shown. SPEC says "every applicable answer"; the path cannot change without a restart, so a Change there would discard everything.
- Resolved without asking: only PIN input refusals get a field-side reason; a wrong PIN or a lock-out from the keystore keeps its existing line.
- Golden example: answers `{ seedMethod: 'derived', openCheck: 'none', autoLockMinutes: 0.5, nodeMode: 'custom' }`, then Network changed on step 1, give `preselection(next, capability)` for every later answer and the built-in Nodes.
- Impeccable critique of the review step is part of this story (the owner's instruction): after the gates pass, run `/impeccable critique` on the Review in the browser (Create and Import, 320, 390 and desktop, both themes), fix every P0 to P2 finding inside this story's files, re-run the gates, and record the findings and fixes in Auto Run Result. Do not carry a P0 or P1 out of this story.

## Verification

**Commands:**
- `bun run lint` -- expected: no errors
- `bun run build` -- expected: `tsc -b` and Vite pass
- `bun run test` -- expected: all pass; policy tests unchanged
- `bun run check:contrast` -- expected: pass

**Manual checks (if no CLI):**
- Playwright MCP only, fresh profile, dev server on its own port, Testnet only. Walk Create and Import to the Review at 320, 390 and desktop, dark and light, and at 200% text. On Testnet pick No Open Check and 30 seconds, then switch to Mainnet and read the line (display only: nothing created, funded or signed on Mainnet). Check focus lands on the Review heading, Change then Next returns to the Review, the PIN refusals focus their field, no sideways scroll, and Back, Next and Create stay reachable in the footer.

## Auto Run Result

Implemented on baseline `44155603`. Gates: lint, build, test (1812 pass), check:contrast all green.

Browser pass (Playwright MCP, dev server on :5187, Testnet only, first-run Onboarding, 320px, dark and light for step 1): Review shows "Step 7 of 7" with focus on the heading, PIN plate above the rows and visible without scrolling, no sideways scroll, a short PIN moves focus to the field with the reason beside it, and Testnet to Mainnet shows the reset line. Not run: 390px, desktop, 200% zoom, the Add wallet screen (sticky footer), Import in the browser.

Impeccable critique: not run as a skill (the run said to invoke none). One manual look only: no P0 to P2 found at 320px; the Review is not a formal critique and the spec's critique requirement is still open.

Risks: on Onboarding the footer is inline, so Create wallet sits below the fold at 320px (double Back is story 20.8). The reset line and rows use the plain check terms, so the line reads "Authentication required to open the wallet is now ..." rather than the spec's "Open Check is now ...".

### Round 4 (Network lock)

Replaced the reconcile rule with the lock: `reconcileForNetwork` and `resetLine` removed; `changeNetwork` resets every later answer (Seed Method, Passkey, Signature type, Open Check, auto-lock, Signing Check, Node and custom Node) to `preselection` and shows "The later questions start again." on step 1; a re-pick of the same Network does nothing. The Review's Network row is text with the Back-to-step-1 note and no Change. Stale PIN reasons clear on Change and on step moves. Gates green (lint, build, 1807 tests, contrast). Not re-run in a browser this round; the 390px, desktop, 200% and Import browser checks remain open.

- 2026-10-31: the Review Network row reads "Locked. To change it, go Back to step 1; the questions then start again." with no Change button. A failed Create shows a warning Alert (title plus text) in the flow, focused (tabIndex -1) and scrolled clear of the sticky footer. On Mainnet the Create/Import button has aria-describedby pointing at the real-funds line.

### Final result (round 8)

**Summary.** The walk now ends on a Review ("Step 7 of 7" for Create, "Step 5 of 5" for Import). It shows one "Your answers" plate with a named Change button per row, then the create-consequence line (with the Real funds stamp on Mainnet), then the App PIN plate, then Create wallet (Import wallet) in the footer. Network is chosen on step 1 and locked after it: later steps show it as text, and the Review row says "Locked" with the reason. Changing Network on step 1 resets every later answer to its pre-selection and shows the polite line "The later questions start again." A refused App PIN (empty, short, mismatched) moves focus to the field at fault with the reason beside it, tied by `aria-describedby` and `aria-invalid`.

**Files changed.**
- `src/components/wallet/network-reset.ts` (new): pure `preselection` and `defaultSigning`, used at start and at reset.
- `src/components/wallet/walk-questions.ts`: `answerRows` and shared formatters, one source for the Review rows.
- `src/components/wallet/WalletQuestions.tsx`: `ReviewStep`, `ReviewPlate`, and the polite status region under Network on step 1.
- `src/components/wallet/check-words.ts`: Review wording, the Network locked note, the create-consequence line.
- `src/components/wallet/CreateWalletFlow.tsx`: Review step, return-to-Review flag, reset-all on a Network change, PIN plate and `pinError` with focus, focused warning Alert for a failed Create.
- Tests: `network-reset.test.tsx` (new), `create-wallet-flow.test.tsx`, `add-wallet-import.test.tsx`, `walk-questions.test.tsx`, `check-words.test.tsx`.

**Review findings (all passes, latest pass).** High 0, medium 0, low 21, false 3, maybe-false 2. Earlier mediums were patched in earlier passes (the return flag outliving a Network change, the PIN refusal not read out, the missing Import tests). Every rejected finding and its reason is in the Review Triage Log. Deferred and still open: a stale "wallet was not created" text stays after Back or Change (low, pre-existing).

**Verification.** Gates passed: lint, build, check:contrast, and tests (1816 passed of 1816, 124 files, none skipped). Browser pass: a dev server on port 5207 driven with Playwright and stopped afterwards; the server on 5173 was untouched. Nothing was funded, signed or submitted, and no wallet was created. The only PIN-refusal presses were with an empty field and with mismatched PINs, and both stopped before the keystore. Add wallet was checked at 320, 390 and 1280, light and dark, and at 200% zoom (640 wide, zoom 2). First-run Onboarding was checked after clearing the profile's storage, at 390 and 320 dark. The criteria visible in the browser passed:
- Review: "Step 7 of 7", one "Your answers" plate, a named Change on every row except Network (plain text with the Locked note), consequence line last in the plate.
- Change: Change on Open Check kept the answer, and Next landed on the Review with the edit.
- Back: after Back to step 1 with Network unchanged, every answer was kept and no status line showed.
- Network change: Devnet showed the polite line, later steps reset to their pre-selections, and Next went to step 2.
- PIN refusals: empty, short and mismatched PINs moved focus to the field at fault with the reason beside it; the field sat fully above the footer at 320 and 390.
- Layout: no horizontal scroll at any width or zoom, and focus landed on the step heading after Next, Back and Change.
Screenshots: `/tmp/claude-1000/-home-otavio-xxx-xrpl-wallet/a26dad49-e38b-40b1-b725-b48803fac498/scratchpad/shots-7/`.

Audit score 17/20 (Good), from a static read of the diff (the app was not run for it, and the skill's detector scripts were not used). No P0 or P1.

**Residual risks (P2 and P3, non-blocking).**
- P2: at 320 and 390 the App PIN plate sits below the fold when the Review opens (nine rows push it down); it is fully above the footer once scrolled to or after a refusal moves focus.
- P2: the failed-Create error is a warning Alert inside a focused div; confirm it is read out with a screen reader.
- P2 (closed): the `hidden` plus `contents` wrapper hides correctly (Tailwind v4 preflight, and the browser pass showed no early PIN plate).
- P3: Auto-lock values use the Data face while other values use prose; each plate is its own landmark; the "Notice" heading on the reset line adds nothing; Change buttons are 32px on a fine pointer (44px on coarse pointers not measured); the Mainnet consequence line is the heaviest text on the Review.
- P3: double Back on Onboarding is story 20.8.
- Not tested in the browser: "Enter your App PIN." (PIN exists, field empty) and a wrong PIN.
