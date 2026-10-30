---
title: 'Label and Network, then the recommended-setup shortcut'
type: 'feature'
created: '2026-10-29'
status: 'done'
baseline_revision: '3512bccf1c4ed6c1b8bfa8747f0b157c043d509c'
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

**Problem:** The create and import screen is one long form that repeats its answers in a Recommended panel above a Customise toggle, so a user reads every setting twice and the fast path is not fast.

**Approach:** Three steps in the existing shell: 1 Label and Network; 2 a read-only list of the pre-selected answers with **Create wallet** (primary) and **Walk me through it** (secondary); 3 the remaining existing controls as one step, until story 3 splits them. The Recommended panel and Customise toggle stop rendering.

## Boundaries & Constraints

**Always:** Every answer stays in `CreateWalletFlow` state. `describeOptions`, creation, PIN entry, backup and the written-Seed step are unchanged. Pre-selections are FR-60's, untouched. Create wallet from step 2 calls the same `handleCreate` as from step 3, so it makes the Wallet the walk would with no answer changed. Same on Testnet, Devnet and Mainnet, in Generate, Import, chooser add screen and first-run Onboarding. Back, Next, Walk me through it and Create wallet sit in the sticky footer (`actionHost`), inline when none is given. Typed PIN and Import Seed stay in uncontrolled inputs; only a boolean "a Seed is typed" may be kept in state (NFR-2). An unavailable answer stays visible, `aria-disabled`, reason as text. No new colour token; nothing styles `:focus`; no `outline-none`; nothing animates.

**Never:** Split step 3 into per-question steps (story 3), add the review or the Network-change reset (story 4), delete dead code beyond what this story orphans (story 5), change any legality rule or pre-selection, or hold a secret in step state.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Open | flow opens | "Step 1 of 3", Label and Network only (Import: its Seed field too); Back inert; Next | none |
| Label invalid | typed name fails validation | its existing error text shows on step 1; Next is `aria-disabled` and does nothing | text stays beside the field |
| Shortcut, Testnet | Next from step 1 | "Step 2 of 3": one read-only list (Label, Network, Node, Seed Method, Signature type, Open Check, Auto-lock, Signing Check), no radio; **Create wallet** primary, **Walk me through it** secondary | none |
| Shortcut, Mainnet | same | same list plus text: an Open Check is required and auto-lock is at least 1 minute | none |
| Shortcut, Import | same | list omits Seed Method and Signature type; primary reads **Import wallet** | none |
| Create from step 2 | answers unchanged | same keystore call and arguments as Create from step 3 | a refusal of the Import Seed returns to step 1 with the reason as text beside the Seed field; any other refusal or failure shows as text on step 2 |
| Import, step 1, no Seed typed | Seed field empty | Next is `aria-disabled` and does nothing, with its reason as visible text | none |
| Import, step 1, Seed typed | Seed field has text | Next is enabled; only a boolean "a Seed is typed" is kept in state, never the Seed | none |
| PIN needed | Open or Signing Check is App PIN | PIN field(s) appear on steps 2 and 3 only, above the footer | PIN errors as today |
| Walk | Walk me through it | "Step 3 of 3": Seed Method (+ Passkey choice and domain warning), Node, Signature type, Open Check, Auto-lock, Signing Check, as today; Back returns to step 2 | blocked-combination Alert and failed-Node text show here; Create wallet is the final action |
| Blocked answers | policy refuses the combination | step 2 shows the same Alert and Create is `aria-disabled`, as today | the reason text |
| Back/forward | any move | every answer, including a typed Seed and PIN, is as left | n/a |

</intent-contract>

## Code Map

- `src/components/wallet/QuizShell.tsx` -- built in 20.1: counter, `h2.panel-legend` heading focus on a step change, Back (`aria-disabled` on first, `disabled` when busy), Next or `finalAction` on the last step, footer via `ScreenFooter` portal into `actionHost`. Needs three small generic additions: per step `blocked` (Next `aria-disabled`, no-op), optional `secondary` and `primary` nodes (when `primary` is set it replaces Next and `finalAction` on that step; `secondary` sits between Back and it).
- `src/components/wallet/CreateWalletFlow.tsx` -- `CreateWalletForm` holds all state, `quizIndex`, `QUIZ_STEPS` (one interim step; make it three), `createButton` (~line 535), `isRecommended`/`customiseForced`/`customiseOpen` (remove), `handleCreate` (guards `busy`, `options.combination.ok`, `labelError`), PIN block (`needsPin`, `pinRef`, `pinConfirmRef`), blocked `Alert` (id `${group}-blocked`), `error`. `importSource?.field(busy)` renders above the questions today.
- `src/components/wallet/WalletQuestions.tsx` -- presentational, imported only by `CreateWalletFlow`. Holds Label, `NetworkChoice`, Seed Method, Passkey Axis and warning, `summaryRows`, the Customise toggle, then Node, Signature type, Open Check, Auto-lock, Signing Check, and the failed-Node `role="alert"` text. Split by step; reuse its `Axis`/`Choice` markup verbatim. Drop `isRecommended`, `customiseOpen`, `onCustomiseOpen`, `customiseForced` props and the Recommended panel; keep `summaryRows` as the step-2 list.
- `src/components/wallet/AddWalletScreen.tsx` -- Import host: `importSource.field` is `<Input id="wseed" ref={setSeedInput}>`; its ref callback clears the value when the element unmounts, and `acquire` reads it at create. So the field must stay mounted across steps. Footer host is `footerHost`. Now needs a change (owner decision 2026-10-29): the ImportSource reports a boolean "a Seed is typed" (never the Seed) so step 1 Next can be blocked, and a refused Seed returns the flow to step 1 with the reason beside the field.
- `src/pages/Onboarding.tsx:303` -- first-run caller, no `actionHost`; no change expected.
- `src/components/wallet/check-controls.tsx` (`Axis`, `Choice`), `NetworkChoice.tsx`, `src/lib/minutes-label.ts` -- reuse.
- `src/components/wallet/__tests__/create-wallet-flow.test.tsx` -- helpers `mount` (opens Customise) and `mountCollapsed`; block "Recommended summary and Customise" (~180-272) and "asks in the FR-60 order" and the source-regex test (~936) assume the old form. Policy tests keep their assertions.
- `src/components/wallet/__tests__/add-wallet-import.test.tsx` -- `submit` (line ~87) presses Import wallet from the first screen; three tests click `Customise` (~180, 185, 277).
- `src/components/wallet/__tests__/quiz-shell.test.tsx` -- extend for `blocked`, `primary`, `secondary`.
- Story 20.1 left one deferred item (footer at 320/390/desktop unverified in a real browser); still open, settled in story 5. Reverse-ordered footer on narrow screens puts the primary above Back.

## Tasks & Acceptance

**Execution:**
- `src/components/wallet/QuizShell.tsx` -- add `blocked`, `primary`, `secondary` to `QuizStep` -- step 2 has two forward actions and step 1 must not advance past an invalid Label
- `src/components/wallet/WalletQuestions.tsx` -- replace the single component with step bodies: Label and Network; the read-only list (with a Mainnet sentence, shown when `network === 'mainnet'`); the walk controls always visible (no `hidden`, no toggle). Mainnet text states the rule in words, not colour. Policy still arrives as `options`.
- `src/components/wallet/CreateWalletFlow.tsx` -- three `QUIZ_STEPS` (ids `name-network`, `recommended`, `walk`); step 1 `blocked: !!labelError`; step 2 `primary: createButton`, `secondary: Walk me through it` (`setQuizIndex(2)`); step 3 uses `finalAction`. Render `importSource.field` once, always mounted, wrapped `hidden` when `quizIndex !== 0`. Render the PIN block once, always mounted, wrapped `hidden` when `quizIndex === 0`, so a typed PIN survives step changes. Show the blocked Alert only on steps 2 and 3. Show `error` on every step. Remove `isRecommended`, `customiseForced`, `customiseOpen`.
- `src/components/wallet/__tests__/quiz-shell.test.tsx` -- cases for `blocked` Next, and `primary` plus `secondary` rendering in the host and inline
- `src/components/wallet/__tests__/create-wallet-flow.test.tsx` -- `mountCollapsed` opens on step 1; `mount` goes Next then Walk me through it. Rewrite "Recommended summary and Customise" as: step 1 shows only Label and Network; step 2 list per Network (Testnet, Devnet, Mainnet text), no radio, Create primary; list reads a passkey Open Check when PRF is yes; Create from step 2 calls `createStoredWallet` with the same arguments as from step 3 (compare the two calls); a typed PIN and a chosen answer survive Next, Back; invalid Label blocks Next; blocked combination shows Alert on step 2 and Create is `aria-disabled`. Update the order test to the step-3 legends. Policy-driven tests change only their opening helper.
- `src/components/wallet/__tests__/add-wallet-import.test.tsx` -- `submit` presses Next first; replace the three Customise clicks with the walk; add: Import's step-2 list omits Seed Method and Signature type, its primary reads Import wallet, and a Seed typed on step 1 is still imported from step 2.

**Acceptance Criteria:**
- Given the flow opens, when step 1 renders, then Label (with its validation text) and Network are the only questions, and no Recommended panel or Customise button exists anywhere.
- Given step 2, when it renders on any Network, then every applicable answer appears once as text with no radio, Create wallet is primary and Walk me through it secondary; on Mainnet the Open Check and 1-minute auto-lock rule is stated.
- Given step 2, when Create wallet is pressed with no answer changed, then creation, PIN entry, written-Seed confirmation and backup behave exactly as from step 3.
- Given Walk me through it, when step 3 renders, then all remaining controls show with their reasons for unavailable answers, and Back returns to step 2 with answers kept.
- Given Import, when steps are counted, then it is still "of 3" and Seed Method and Signature type appear nowhere.
- Given first run (Onboarding, no `actionHost`), when the flow opens, then the same steps and shortcut appear, actions inline.
- Given the existing policy tests, when the suite runs, then their assertions pass unchanged.

## Spec Change Log

### 2026-10-29 — owner settled the two Import questions the review raised
- Trigger: review routed bad_spec (Import Seed refusal surfaced on step 2 while the Seed field is on step 1; Next not blocked on an empty Seed).
- Amended: I/O matrix: a refused Import Seed returns to step 1 with the reason beside the field; step 1 Next is blocked until a Seed is typed, tracked by a boolean only. Always and Code Map updated to match.
- Known-bad state avoided: the reason showing on a step that does not hold the field to fix; a typed Seed ever held in state.
- KEEP: the Seed field and PIN fields mounted once and only hidden on other steps; Create from step 2 calls the same handleCreate as from step 3; everything else already built and passing.

## Review Triage Log

### 2026-10-29 — Review pass
- verdicts: 28 findings — high 0, medium 2, low 12, false 14, maybe-false 0
- findings:
  - Blind Hunter
    - `[false]` `[reject]` Unverified custom Node can be created from step 2 — `handleCreate` returns "Test the custom Node first, or use the built-in Nodes." when `nodeMode === 'custom' && !verifiedNode`, and `error` renders on every step; the list also says "(not tested yet)". Create is refused, not allowed.
    - `[low]` `[reject]` Mainnet rule sentence hard-coded in `RecommendedList` — real drift risk, but the spec's Execution section asks for this sentence in this component; the fix needs a new field from `describeOptions` (policy code the story must not change), and the rule is unlikely to change inside this story. Not worth the added surface.
    - `[low]` `[patch (fix pending)]` Step 2 titled "Recommended setup" even after the user changed answers on step 3 — `isRecommended` is gone and the title is a constant, so Walk, change, Back shows custom choices under "Recommended setup". Fix: retitle step 2 to a neutral "Your setup" in `quizSteps` (leave the `Pre-selected answers` aria-label, tests pin it). Round 2 (2026-10-29): the aria-label was a separate finding and is now fixed, see below.
    - `[medium]` `[bad_spec]` Import errors land on step 2 while the Seed field is hidden — step 1 Next is blocked only by `labelError`, so an empty or wrong Seed reaches step 2; `acquire` refuses, `setError` shows the text on step 2, the Seed input is in a `hidden` wrapper (and the refusal clears it). The user must find Back. The spec's I/O row says any refusal shows as text on step 2, so the obvious fix (return to step 1 on a Seed refusal) contradicts the spec. Grouped with Edge #1 and Edge #7.
    - `[false]` `[reject]` No focus management on step changes — `QuizShell.tsx:44` focuses the step heading whenever `index` changes; the 20.1 browser pass and this story's pass confirmed focus on the heading. A `hidden` wrapper is not tabbable.
    - `[low]` `[reject]` Hard-coded `setQuizIndex(2)` — index 2 stays the first walk step after story 3 splits it, and story 4 adds its step at the end; unlikely to break, and a lookup by id is extra code.
    - `[low]` `[patch (fix pending)]` Label row shows `p.label.trim()`, not the saved name — `normalizeWalletName` also collapses inner spaces and strips invisible characters, so a name like "My  Wallet" shows differently from what is checked. "Named automatically" for an empty label is the spec's own decision (Design Notes), not a defect. Fix: show `normalizeWalletName(p.label)`. Same root cause as Edge #5.
    - `[low]` `[patch (fix pending)]` Import test "ordered after Walk me through it" uses `expect.arrayContaining`, so it does not check order. Fix: assert the order of those three names (a `toEqual` on the filtered list). Same root cause as Edge #8 and the Verification Gap "Other finding".
    - `[false]` `[reject]` Tests coupled to implementation details — no concrete defect shown: `closest('[hidden]')` tests the attribute the app sets (Tailwind's preflight makes `[hidden]` win over `flex`), the source-grep pattern pre-exists, and `switchNetwork` is used only from step 3.
    - `[low]` `[patch (fix pending)]` Leftover formatting and notes — the long `WalletQuestions` import line in `CreateWalletFlow.tsx`, the blank line before `</div>` in the PIN block and before `</>` in `NameAndNetworkStep` are real; fix: delete the stray blank lines and wrap the import. The untracked story file is the build's own spec, not a defect, and a search of `docs/`, `DESIGN.md` and `PRODUCT.md` finds no remaining "Customise" text to update (those parts are false).
  - Edge Case Hunter
    - `[medium]` `[bad_spec]` Import Next guarded only by `labelError`, empty or invalid Seed still advances — real (see Blind #4); the guard would have to read the uncontrolled Seed input, which the spec has not decided. Grouped with Blind #4.
    - `[low]` `[reject]` `labelError` appearing after step 1 leaves Create `aria-disabled` with a dangling `aria-describedby` — only reachable if another tab or window adds a wallet with the same name while this flow sits on step 2 or 3; step 1 Next is already blocked in the normal path. Fix would add rendering or navigation branches.
    - `[false]` `[reject]` Custom Node untested or failed, step 2 does not render `nodeReason` — Create then refuses with the visible "Test the custom Node first" error on step 2, and the list says "(not tested yet)". The spec puts the failed-Node text on step 3.
    - `[false]` `[reject]` Back/Next/Create while a Node test is in flight — Network is `disabled` while `nodeBusy`, and `handleCreate` refuses a custom Node with no `verifiedNode`; no wrong Wallet can be made.
    - `[low]` `[patch (fix pending)]` Label row differs from the normalized name — same defect as Blind #7; one fix, `normalizeWalletName(p.label)`.
    - `[false]` `[reject]` Passkey choice and domain warning not on step 2 — the Seed Method defaults to Stored; Passkey-Derived is only reachable by choosing it on step 3, where the choice and the warning show. Step 2 can only see it after the user has seen both.
    - `[low]` `[bad_spec]` Hidden wrapper means a focus-to-field on error silently fails — no code focuses a field on error today, so only the "no anchor" half is real, and it is the same defect as Blind #4. Grouped there.
    - `[low]` `[patch (fix pending)]` Import test title claims order, `arrayContaining` checks none — same as Blind #8.
    - `[false]` `[reject]` Claim (low confidence) that someone may believe step 2 shows every Create-blocking reason — a statement about a possible misreading, not a defect; the blocked-combination Alert does show on step 2 and the Node reason is spec-assigned to step 3.
  - Verification Gap Reviewer (arrived pre-verified)
    - `[low]` `[patch (fix pending)]` Import Seed field never asserted visible on step 1 — filed evidence: the only wrapper assertion is the step-2 hidden check. Fix: in the new import test, before pressing Next, `expect(seedInput().closest('[hidden]')).toBeNull()`.
    - `[low]` `[patch (fix pending)]` Other finding: the import order test overstates what it checks — same as Blind #8.
  - Intent Alignment Auditor
    - `[false]` `[reject]` Tests run at component level, first run and the real footer are inferred — no defect shown: Onboarding passes no `actionHost`, the inline path is covered in `quiz-shell.test.tsx`, and the unrun browser checks are listed in the Verification result.
    - `[false]` `[reject]` Step 1 is not "Label and Network only" for Import — the spec's I/O row says "(Import: its Seed field too)" and the Design Notes record the decision.
    - `[false]` `[reject]` Step 2 hosts the PIN fields and the blocked Alert — the spec's Execution section and the matrix ("PIN field(s) appear on steps 2 and 3", "step 2 shows the same Alert") require both.
    - `[false]` `[reject]` Mainnet text states only two rules — the criterion and matrix name exactly those two; the passkey Signing Check on Mainnet appears in the list row.
    - `[false]` `[reject]` Label row is not a "pre-selected answer" — the Design Notes resolve this on purpose (FR-91, "every applicable answer").
    - `[false]` `[reject]` Equivalence is tested against step 3, not the old form — the spec's own test task says to compare the two keystore calls; the old form no longer exists to compare.
    - `[false]` `[reject]` No tests of step heading focus or reduced motion — the shell test from 20.1 covers heading focus, the shell does not animate, and the browser pass saw focus on the heading.
- routing: bad_spec (Blind #4, Edge #1, Edge #7: Import Seed refusal surfaces on step 2 while the field is on step 1); patch rows above are moot while the code is re-derived. Questions: (1) when an Import Seed is refused, may the flow return to step 1 (contradicting the matrix row "any refusal shows as text on step 2"), or must the text stay on step 2? (2) should step 1 Next also be blocked while the Seed field is empty?

### 2026-10-29 — Review pass
- verdicts: 28 findings — high 0, medium 0, low 16, false 12, maybe-false 0
- findings:
  - Blind Hunter
    - `[low]` `[patch (fix pending)]` Stale Seed error after a refusal: `seedError` clears only in `onIndex` (`CreateWalletFlow.tsx:624`), so typing a corrected Seed keeps the red reason and `aria-invalid` until Next — real; the Seed field's `onChange` (`AddWalletScreen.tsx:123`) only sets `seedTyped`, and the note shows the stale reason instead of "Next is ready." Fix: clear `seedError` when the Seed field changes (see patch row group A). Same root cause as Edge #1 and Verification Gap "Other findings" 1.
    - `[false]` `[reject]` Focus is lost (drops to `body`) on the return to step 1 — `QuizShell.tsx:41-45` focuses the step heading on every index change, and `setQuizIndex(0)` is an index change, so focus lands on the heading, not `body`; the reason is `role="alert"`. (Heading rather than the field is Edge #7.)
    - `[low]` `[reject]` Mainnet sentence hard-coded in `RecommendedList` — `carried` from the first pass: same place, same claim, code unchanged (`WalletQuestions.tsx:121`); the spec asks for the sentence in this component and the fix needs a new field from policy code.
    - `[low]` `[reject]` Step 2 shows "Named automatically" instead of the name `uniqueDefaultName` will give — real but small; the spec's Design Notes decided that wording (an automatic name reads "Named automatically"), and showing the real name needs the existing-names list threaded into the list component.
    - `[low]` `[patch (fix pending)]` Region label "Pre-selected answers" goes stale after the user changes answers on step 3 and comes back — real for a screen-reader user (the section has only an `aria-label`, `WalletQuestions.tsx:112`). Fix: one string, the label becomes "Your setup" to match the step title, and the tests that pin the old label change with it (group B).
    - `[low]` `[reject]` Blocked combination gives no pointer on step 2, and `nodeReason` shows only on step 3 — step 2 shows the blocked Alert and a disabled Create exactly as the spec's matrix says, and "Walk me through it" sits beside Create in the footer; the `nodeReason` half is `carried` from the first pass (spec puts the failed-Node text on step 3, Create refuses with visible text). A pointer sentence adds a branch for a case users reach only on odd Mainnet states.
    - `[low]` `[reject]` "Next is ready." is weak copy and not announced — wording only; Next's `aria-disabled` state is exposed to assistive tech and a live region would add a new announcement path for a hint line.
    - `[false]` `[reject]` Hidden-element tests check only the attribute — `carried` from the first pass; Tailwind v4 preflight sets `[hidden]{display:none !important}`, so `flex flex-col` cannot override it.
    - `[low]` `[patch (fix pending)]` Seed-typed edge cases untested — the whitespace-only case is a real hole (see Verification Gap #1, group C); autofill without a change event and a restored value are not reachable: browser autofill fires `input`, which React's `onChange` receives, and the field is never remounted with a value (the ref callback blanks it and sets `seedTyped` false on unmount).
    - `[low]` `[reject]` A cleared Seed field costs a retype — the wipe is `finally { importSource?.clear() }` (`CreateWalletFlow.tsx:430`), which predates this story and is deliberate (a Seed does not linger in a field); copy that says so is cosmetic.
    - `[false]` `[reject]` Hard-coded `wseed-note` id, and `aria-describedby` pointing at unrendered ids — only one Import field ever mounts, so no duplicate id; the blocked Alert is hidden only on step 1 where Create is not rendered; the `-label-error` half is `carried` from the first pass (only reachable if another window adds a same-named wallet).
    - `[false]` `[reject]` Smaller test gaps (`switchNetwork` brittle, no Passkey-in-list test) — no defect shown; `switchNetwork` is used only from step 3, and the Passkey choice is by design on step 3 only (first pass).
  - Edge Case Hunter
    - `[low]` `[patch (fix pending)]` Stale refusal stays on a corrected Seed — same defect as Blind #1; one fix (group A).
    - `[low]` `[reject]` Non-seed refusal wipes the field, the retry then bounces to step 1 with the invalid-Seed text — the wipe is pre-existing (`finally`), and an emptied field does need a new Seed, so step 1 is where the user has to go; a separate branch to word this differently is not worth it.
    - `[low]` `[reject]` Seed set without a change event leaves Next blocked — not reachable in practice (autofill and paste both fire `input`); a sync-on-focus guard is extra code for a case nobody will meet.
    - `[false]` `[reject]` Late refusal yanks the user back or sets state after unmount — Back and Next are `disabled` while `busy` (`QuizShell.tsx` Back, Create), so the user cannot leave mid-attempt, and `mountedRef` already turns a result after unmount into a cancel.
    - `[false]` `[reject]` Whitespace-only Seed keeps Next blocked with a misleading hint — blocked is the right outcome (a blank Seed is nothing typed) and "Type your Seed to continue." is accurate. The untested half is covered by group C.
    - `[false]` `[reject]` Custom Node test failed, then Back to step 2 shows no failure reason — `carried` from the first pass: Create refuses with visible text on step 2 and the list says "(not tested yet)"; the spec assigns `nodeReason` to step 3.
    - `[low]` `[reject]` Focus lands on the heading, not the Seed field, after the return to step 1 — heading focus is the shell's rule for every step change and the reason is `role="alert"`; moving focus to the field needs a new effect and a visibility wait for a polish gain.
    - `[low]` `[reject]` Blocked step 2 has no pointer to step 3 after `customiseForced` was removed — same as Blind #6; removal of `customiseForced` is the spec's own instruction.
  - Verification Gap Reviewer (arrived pre-verified)
    - `[low]` `[patch (fix pending)]` Whitespace-only Seed not tested as "nothing typed" — filed evidence: only `typeSeed('')` is tested, which passes with or without `.trim()`. Fix: add a case typing `'   '` that expects Next `aria-disabled` and the hint (group C).
    - `[low]` `[patch (fix pending)]` Other finding: stale refusal after typing a new Seed — verified (see Blind #1); group A.
    - `[low]` `[reject]` Other finding: nothing moves focus to the Seed field after the refusal — same as Edge #7; not worth a new effect.
  - Intent Alignment Auditor
    - `[false]` `[reject]` First-run Import is a separate form and does not get the quiz — `SPEC.md:49` decides the quiz is identical wherever `CreateWalletFlow` renders; `Onboarding.tsx:243` keeps its own pre-existing Seed input that never went through `CreateWalletFlow`, and this diff did not cause that. No defect shown.
    - `[false]` `[reject]` Tests run only at component level, first-run Create has no Onboarding test — `carried` from the first pass: Onboarding passes no `actionHost`, the inline path is covered in `quiz-shell.test.tsx`.
    - `[false]` `[reject]` Footer is inline at first run — the Always line says "inline when none is given".
    - `[false]` `[reject]` Mainnet text checked only in a component test — `carried` from the first pass: the spec forbids creating on Mainnet.
    - `[false]` `[reject]` 390px, dark theme, 200% zoom and first-run not checked in a real browser — recorded as not done in the Verification result; the finding is a statement about checks, not a defect in the code.
- routing: patch (no intent_gap or bad_spec this round; Import questions are settled). Patches (all fix pending): A) wrap the Seed field in `CreateWalletFlow.tsx:626` so a change inside it calls `setSeedError(null)` (e.g. `onChange` on the existing `<div hidden>`), plus one test: refuse, type a new Seed, reason gone; B) `WalletQuestions.tsx:112` aria-label "Pre-selected answers" becomes "Your setup", update the tests that pin the label; C) one test in `add-wallet-import.test.tsx`: `typeSeed('   ')` leaves Next `aria-disabled` with "Type your Seed to continue.". Deferred: none.

## Design Notes

- Resolved without asking: the epic does not say where Import's Seed field lives or where the PIN is typed once Create can be pressed on step 2. Seed on step 1 (it is part of what is being named and placed) and PIN on steps 2 and 3 (where Create is), each mounted once and hidden elsewhere. Unmounting would clear a typed Seed (`setSeedInput` blanks it on unmount) or PIN, and would break "Back keeps every answer".
- Resolved without asking: Next on step 1 is `aria-disabled` while the Label is invalid, because step 2's Create would otherwise point at an error that is not on screen.
- Resolved without asking: the list includes Label (an automatic name reads "Named automatically"), since FR-91 says every applicable answer.
- Step titles are interim: "Name and network", "Recommended setup", "Your choices". Story 3 replaces step 3.

## Verification

**Commands:**
- `bun run lint` -- expected: no errors
- `bun run build` -- expected: `tsc -b` and Vite build succeed
- `bun run test` -- expected: all pass, policy tests with unchanged assertions
- `bun run check:contrast` -- expected: pass

**Manual checks (if no CLI):**
- Playwright MCP only, Testnet or Devnet, never Mainnet: at 320, 390 and desktop in both themes, Create, Import and first run show steps 1 to 3, footer actions reachable, no sideways scroll. Mainnet text is checked in the unit test, not by creating anything.

## Verification result (2026-10-29)

Gates: lint, build, test (1751 passed) and check:contrast all green on baseline 3512bcc plus the working tree. Browser pass (Playwright MCP, dev server, Testnet, Add wallet screen, nothing created): Step 1 and Step 2 at 320px show the footer actions in view; Step 3 at 320px has no sideways scroll and focus lands on the heading; Step 3 at 1280px is fine. Light theme only. Not done: 390px, dark theme, 200% zoom, Import and first-run Onboarding in a real browser, Mainnet text (unit-tested only).

## Verification result, round 2 (2026-10-29)

Applied the owner's Import decisions on baseline 3512bcc plus the working tree: step 1 Next waits on a boolean "a Seed is typed" (`ImportSource.seedTyped`, set from the field's change event, cleared with the field); a refusal with `at: 'seed'` (invalid or duplicate Seed) returns to step 1 with the reason beside the field (`aria-describedby`), any other refusal stays on step 2. Also applied the pending patches: step 2 titled "Your setup", Label row uses `normalizeWalletName`, import order test asserts order, Seed field asserted visible on step 1, stray blank lines and long import wrapped. Gates: lint, build, test (1756 passed) and check:contrast green. Browser (Playwright MCP, dev server, Testnet, nothing created): at 320px the empty-Seed hint and blocked Next show with no sideways scroll; a garbage Seed returns to "Step 1 of 3" with the reason in red text beside the emptied field. Not done: 390px, dark theme, 200% zoom, first-run Onboarding in a real browser, Mainnet text (unit-tested only).

### 2026-10-29 — Round 2 fixes
- `[low]` `[patch (fixed)]` Red Seed reason stayed on a corrected Seed until Next — fixed: `onChange={() => setSeedError(null)}` on the hidden wrapper around `importSource.field` in `CreateWalletFlow.tsx`; test "typing a new Seed clears the refusal reason" added.
- `[low]` `[patch (fixed)]` Step 2 section labelled "Pre-selected answers" after answers changed — fixed: `aria-label` in `WalletQuestions.tsx` is now "Your setup"; `summary()` in `create-wallet-flow.test.tsx` picks the list section by its terms because the step shell's section carries the same name.
- `[low]` `[patch (fixed)]` No test for a whitespace-only Seed — fixed: test added in the "Seed field and step 1" block of `add-wallet-import.test.tsx`.
- The other "patch (fix pending)" rows above (normalized label row, import order test, Seed visible on step 1, formatting leftovers) were not in this round and are still pending.

## Auto Run Result

Status: done. Followup review recommended: false (no high patched, fewer than two medium patched).

**Implemented:** the create and import screen is now three steps in the quiz shell. Step 1 asks only Label (plus Seed on Import) and Network. Step 2 lists the pre-selected answers as plain text, with Create wallet as the primary action and Walk me through it as the secondary. Step 3 holds the remaining existing controls. The Recommended panel and Customise toggle no longer render. Create wallet from step 2 and step 3 call the same `handleCreate`. A refused Seed returns the person to step 1 with the reason beside the field.

**Files changed**
- `src/components/wallet/CreateWalletFlow.tsx` — three-step flow, Label and Network validation, Seed handling, shared create path.
- `src/components/wallet/WalletQuestions.tsx` — step 1 questions, the read-only "Your setup" list, step 3 controls.
- `src/components/wallet/QuizShell.tsx` — small shell adjustments for the new steps and footer.
- `src/components/wallet/AddWalletScreen.tsx` — passes the footer host to the new steps.
- `src/components/wallet/__tests__/create-wallet-flow.test.tsx`, `add-wallet-import.test.tsx`, `quiz-shell.test.tsx` — rewritten or extended for the three steps.
- Planning and spec files (epics, PRD, SPEC.md, memlogs) updated to record the settled Import decisions.

**Review findings:** high 0, medium 0, low 16 patched or triaged, false 12, maybe-false 0. Every rejected finding and its reason is in the Review Triage Log above. Deferred: none.

**Verification:** lint, build, test and check:contrast all passed; 1758 tests passed of 1758 (121 files), none skipped. Browser pass: a dev server on port 5192 (stopped afterwards) driven with Playwright in a fresh profile. Walked first-run Onboarding (Create) and the chooser's Add wallet screen (Generate and Import) at 320, 390 and 1280 wide, in dark and light, with an approximate 200% pass and a Mainnet step 2 view. One local Testnet wallet was created with No Open Check; nothing on Mainnet, no funding, signing or submitting. Import was tried only with garbage seeds, so nothing was imported.
- Passing: "Step n of 3" on every step; step 1 shows only Label (plus Seed on Import) and Network; a 41-character name shows "Use 40 characters or fewer." and leaves Next aria-disabled; step 2 lists answers as plain text with no radios; Import omits Seed Method and Signature type and reads "Import wallet"; the Mainnet sentence about the Open Check and 1-minute auto-lock appears; step 3 is "of 3" with all controls; Create from step 2 and from step 3 both completed on Testnet; Back, forward and Back again kept label, network, signature type and a typed PIN (the Seed stays mounted but hidden); focus lands on the step heading after Next, Back and Walk; empty Seed shows "Type your Seed to continue." with Next blocked, a typed Seed shows "Next is ready."; a refused Seed returns to step 1 with the red reason, cleared on retyping; no horizontal scroll anywhere; the sticky footer keeps the primary action in view on the Add wallet screen at every width and finish; first run has no footer host, so actions are inline.
- Caveat: real browser zoom was unavailable (CSS zoom 2 breaks the dvh shell), so 200% was approximated with a 320-wide viewport and html font-size 200%. A coarse pointer was not emulated.
- Screenshots (68 files): /tmp/claude-1000/-home-otavio-xxx-xrpl-wallet/a26dad49-e38b-40b1-b725-b48803fac498/scratchpad/shots-2/
- Audit score: 17/20, no P0 or P1.

**Non-blocking P2/P3 issues from the audit**
- P2: first-run Onboarding shows two "Back" buttons (the shell's step Back and Onboarding's leave action); consider relabelling the leave action "Back to start".
- P2: step 2 term labels in the "Your setup" well measure about 2.6:1 contrast (rgb 84,92,100 on 18,24,29) in the light finish; carried over from the old Recommended panel, and check:contrast does not cover it. Needs a lighter muted token in the well.
- P2: at 200% text with a 400 px tall viewport the step 2 sticky footer is taller than the scroll area, so Create wallet scrolls out of sight; step 3 is similar but milder.
- P2: after a refused Seed, focus goes to the step 1 heading, not the Seed field.
- P2: the Create button's aria-describedby can point at a label-error id that exists only on step 1 (hard to reach, since Next blocks first).
- P2: coverage gap noted by the audit (390, dark, 200%, first run, Mainnet) is now closed by the browser pass above.
- P3: first-run step 3 inline Create wallet sits below the fold at 320 and 390 (spec'd inline behaviour).
- P3: three stacked footer buttons on step 2 at 320x640 take about 200 px.
- P3: buttons are 36 px and radio rows 20 px on fine pointers; the 44 px coarse-pointer case was not emulated.
- P3: Back on step 1 is aria-disabled with no visible reason.
- P3: "Your setup" section aria-label duplicates the h2 name.
- P3: a custom Node "not tested yet" is only refused at Create wallet; the summary row could say "Test it on the next step".
- P3: PIN fields on step 2 have no group label.

**Residual risks:** the items above; 200% was approximated, not a true browser zoom; coarse-pointer target sizes unchecked; Import was never run with a valid Seed in a browser.
