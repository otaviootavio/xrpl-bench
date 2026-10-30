---
title: 'Create or Import is the first question'
type: 'feature'
created: '2026-10-30'
status: 'done'
baseline_revision: 'ba4824e0bec032bd902658309c5af199aeed4a0e'
review_loop_iteration: 0
followup_review_recommended: true
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

**Problem:** On the Add wallet screen, Generate and Import are two buttons above the quiz. They stay visible on every step, so the path can change in the middle of the answers. The quiz does not ask the choice itself (SPEC CAP-2, PRD FR-91).

**Approach:** Remove both buttons. Step 1 asks "Create a new wallet" or "Import a wallet" as a radio question, then (Import) the Seed field, the Label and the Network. After step 1 the choice is not shown. Going Back to step 1 and changing it starts the answers again.

## Boundaries & Constraints

**Always:** Policy (`describeOptions`), `handleCreate`, PIN entry, Seed backup and written-Seed confirmation unchanged. The Seed stays in the uncontrolled field; the host still gets only a boolean (`seedTyped`). The Seed field stays mounted once and is only hidden. Changing the choice remounts the flow (the keyed restart), which clears the typed Seed. The radios are disabled while a create or import runs. Focus: after the user picks a path, focus is on the picked radio (the remount must not drop it to the page). The Create-or-Import radios use the `Choice` and `Axis` controls of `check-controls.tsx`. Sentences under 21 words.

**Never:** No new step, so the counter stays "of 6" (Create) and "of 4" (Import) until story 7 adds the review. No change to `Onboarding.tsx` or its entry buttons, and no path radios there. No double-Back fix (story 8). No review step, no Network-change reset line, no wording pass (stories 6 to 9). No test weakened: tests of the old buttons are rewritten to the radios with the same assertion. No new colour token.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Open Add wallet | Screen opens | Step 1 of 6 titled "Create or import": radios Create a new wallet (selected) and Import a wallet, then Label and Network; no Seed field; no Generate or Import button anywhere | None |
| Choose Import | Radio Import on step 1 | Same step, now Step 1 of 4: Seed field appears first below the radios; Next blocked with the hint until a Seed is typed; focus on the Import radio | None |
| Path after step 1 | Any step 2 to last, either path | No path radio and no Generate or Import button | None |
| Back, change path | Typed Label, Mainnet, Seed; Next, Back, pick the other path | Answers start again: empty Label, Testnet, empty Seed field, step 1 | None |
| Back, keep path | Same, but the path is not changed | Label, Network and the typed Seed kept | None |
| Seed refused at create | Import, bad or duplicate Seed | Returns to step 1 with the reason beside the Seed field, as in story 2 | Path stays Import |
| Create or import running | `creating` true | Path radios disabled | None |
| First-run Onboarding | Create path | Step 1 titled "Name and network", no path radios, quiz as today | None |

</intent-contract>

## Code Map

- `src/components/wallet/AddWalletScreen.tsx` -- `mode` state and the keyed `<CreateWalletFlow key={mode} ...>` stay here (keep the Seed handling, `clearSeed`, `setSeedInput`). Delete the Generate/Import `Button` row (~lines 168-178). Pass a new `pathChoice` prop (value, onChange, disabled by `creating`). Switching to Create still calls `clearSeed()` first. `importSource` is passed only when mode is import, as today. A "mode just changed" flag (ref) tells the new control to take focus on mount.
- `src/components/wallet/CreateWalletFlow.tsx` -- add optional prop `pathChoice?: { value: 'create' | 'import'; onChange: (v) => void; disabled?: boolean; focusOnMount?: boolean }` to `CreateWalletFlowProps` (~line 75). `quizSteps[0]` (~line 613) title is "Create or import" when `pathChoice` is set, else "Name and network". Render the path control first in step 1, above the hidden `importSource.field` div and `NameAndNetworkStep` (~line 640). Disabled when `busy`. It is not rendered on any other step (unmounted, not hidden). `CreateWalletFlow` (outer) holds the capability check; the remount re-runs it as before.
- `src/components/wallet/WalletQuestions.tsx` -- add a small `PathChoice` presentational component (Axis legend "Create or import", two `Choice` radios). Not part of the walk and not in `walk-questions.ts`.
- `src/components/wallet/QuizShell.tsx`, `walk-questions.ts`, `src/pages/Onboarding.tsx` -- read-only here. Onboarding renders `CreateWalletFlow` (~line 303) without `pathChoice`, which keeps its entry buttons and its own Back (story 8).
- `src/components/wallet/__tests__/add-wallet-import.test.tsx` -- `openImport` (~line 80) clicks the `Import` button; "switching to Generate clears a typed Seed" (~177), "offers Import and Generate" (~185) and "busy guards" (~587) use the buttons. Rewrite to the radios.
- `src/pages/__tests__/create-entry-points.test.tsx` -- lines ~141 and ~183-189 look for the `Generate` and `Import` buttons on the Add wallet screen. Update to the radios; Onboarding assertions stay.
- `src/components/wallet/__tests__/create-wallet-flow.test.tsx` -- mounts the flow without `pathChoice`; unchanged except where a heading assertion needs it.
- Carried from stories 1 to 4: the quiz is controlled by `quizIndex`; the PIN block shows on the last step only; step 1 Next is blocked by a label error or, in Import, an empty Seed; `changeNetwork` returns to step 1; a refused Seed returns to step 1 through `setQuizIndex(0)`.

## Tasks & Acceptance

**Execution:**
- `src/components/wallet/WalletQuestions.tsx` -- add `PathChoice` -- the question lives with the other questions
- `src/components/wallet/CreateWalletFlow.tsx` -- `pathChoice` prop, step 1 title and order, focus on mount -- step 1 asks the path
- `src/components/wallet/AddWalletScreen.tsx` -- remove the two buttons, pass `pathChoice`, keep the keyed restart and Seed clearing -- one place for the choice
- `src/components/wallet/__tests__/add-wallet-import.test.tsx` -- rewrite button tests to radios -- no weakened assertion
- `src/pages/__tests__/create-entry-points.test.tsx` -- update the Add wallet assertions to radios
- tests (add-wallet-import) -- new: no path radio or Generate/Import button on any step after 1, both paths; Back then change path restarts answers (Label, Network, Seed, step); Back without change keeps them; focus on the picked radio; radios disabled while `creating`; Onboarding step 1 has no path radios

**Acceptance Criteria:**
- Given the Add wallet screen opens, when step 1 renders, then it asks Create a new wallet or Import a wallet, with Label and Network, and Import also shows its Seed field
- Given the user is past step 1, when they look for a Generate or Import switch, then none exists, and the only way to change the path is Back to step 1
- Given the user changes the path on step 1 after answering later steps, when it changes, then the answers start again and the typed Seed is cleared
- Given first-run Onboarding, when the user starts, then its own entry buttons choose the path and the quiz after that is the same
- Given the path is Import, when the Seed is empty, refused or valid, then Next, the refusal returning to step 1 and the hint behave as in story 2, and no Seed enters state, the URL or storage

## Spec Change Log

## Review Triage Log

### 2026-10-30 — Review pass
- verdicts: 20 findings — high 0, medium 3, low 7, false 10, maybe-false 0
- findings:
  - `[low]` `[reject]` Blind: switching path silently discards Label, Network and answers — the spec decides this ("going Back to step 1 and changing it starts the answers again") and puts any reset line in a later story; a hint is added complexity for an uncommon, intended behaviour.
  - `[false]` `[reject]` Blind: Seed cleared only when switching to Create — switching to Import starts with no Seed (the Create flow has no Seed field), and Import to Create calls `clearSeed()` (AddWalletScreen.tsx:69-74, 185), which nulls `pendingSeedRef` and both inputs. Same behaviour as the old Generate button.
  - `[low]` `[reject]` Blind: focus effect disables `exhaustive-deps` and uses a `querySelector` on `:checked` — works, lint is green, cosmetic coupling inside one small component; the fix adds a ref or `autoFocus` branch for no user harm.
  - `[false]` `[reject]` Blind: disabled `Choice` might still call `onSelect` — a natively disabled radio fires no change event, and `onChange` is still guarded by `state.available` (check-controls.tsx:38-41). The missing test is covered by the patch row below.
  - `[false]` `[reject]` Blind: step title "Create or import" no longer describes Label and Network — the spec fixes this title; `PathChoice` is its own `Axis` with its own legend, and `NameAndNetworkStep` is unchanged.
  - `[medium]` `[patch (fixed)]` Blind: the mid-run guard test was weakened — it asserted Generate disabled, now asserts radios absent (add-wallet-import.test.tsx "busy guards"). The spec says no test weakened and asks for a "radios disabled while creating" test; none renders a disabled radio. Fix: add a test that renders the radios with `disabled` and with the flow busy and checks `.disabled`. Fixed: new tests in add-wallet-import.test.tsx ("busy guards") render the real CreateWalletFlow radios with host `disabled: true` and assert each `.disabled` is true, plus an enabled control case; dropping `disabled` on the Radio fails the test (checked by mutation). The existing busy-guards assertions are kept. Busy alone cannot be rendered with radios on screen (they exist on step 1 only and the flow is only busy on the last step), so the `|| busy` merge itself is not separately exercised.
  - `[low]` `[patch (fixed)]` Blind: Onboarding test only checks the mocked flow's props; the double-Back part of this finding is `false` (spec Never: that fix is story 8). The spec asks for a real-render check that Onboarding step 1 has no path radios; add it with the same test patch. Fixed: new real-render test "first-run Onboarding" opens Onboarding's own flow and checks step 1 (title 'Name and network') shows no Create/Import radios.
  - `[false]` `[reject]` Blind: Next not tested for an empty Seed or a disabled radio — the empty-Seed block is story 2 behaviour with its own tests and is not changed here; a disabled radio cannot block Next.
  - `[low]` `[reject]` Blind: the `mode`-to-path mapping appears more than once in AddWalletScreen — real but cosmetic (two lines in one file, no wrong output); the fix is a refactor, not worth it here.
  - `[low]` `[reject]` Edge: same-value early return and `clearSeed` on Create untested at screen level — the real-render tests click the radios and cover the Seed clearing; clicking an already-selected radio fires no change, so the early return is not reached by a user.
  - `[medium]` `[patch (fixed)]` Edge: no test renders the radios with `creating` or `busy` true, so dropping `disabled={pathChoice.disabled || busy}` passes every test — confirmed, same root cause as the weakened busy test. Fixed by the same test patch. Fixed: new tests in add-wallet-import.test.tsx ("busy guards") render the real CreateWalletFlow radios with host `disabled: true` and assert each `.disabled` is true, plus an enabled control case; dropping `disabled` on the Radio fails the test (checked by mutation). The existing busy-guards assertions are kept. Busy alone cannot be rendered with radios on screen (they exist on step 1 only and the flow is only busy on the last step), so the `|| busy` merge itself is not separately exercised.
  - `[false]` `[reject]` Edge: `focusPath` stays set if the flow never mounts `PathChoice` — the flag is consumed when the form first mounts (it always opens on step 1), and focusing the picked radio then is the intent; unmounting the screen drops the state.
  - `[false]` `[reject]` Edge: a refused Seed may leave the radios disabled — `busy` is cleared in the `finally` of `handleCreate` (CreateWalletFlow.tsx:435), and `onInProgressChange(false)` follows, so step 1 shows them enabled.
  - `[medium]` `[patch (fixed)]` Verification gap (filed defer): native `disabled` on the radios and the `|| busy` merge are untested. Filed as defer, but the change caused it and the spec's Tasks require the test, so it routes to patch: same fix as above. Fixed: new tests in add-wallet-import.test.tsx ("busy guards") render the real CreateWalletFlow radios with host `disabled: true` and assert each `.disabled` is true, plus an enabled control case; dropping `disabled` on the Radio fails the test (checked by mutation). The existing busy-guards assertions are kept. Busy alone cannot be rendered with radios on screen (they exist on step 1 only and the flow is only busy on the last step), so the `|| busy` merge itself is not separately exercised.
  - `[false]` `[reject]` Verification gap, other: the `onFocusTaken` reset has no observable effect — it does: `PathChoice` remounts on Back to step 1 without the form remounting, and an unreset flag would steal focus then.
  - `[low]` `[patch (fixed)]` Auditor: no test renders Onboarding's real flow and checks no path radios — same as the Onboarding row above; fixed by the same patch. Fixed: new real-render test "first-run Onboarding" opens Onboarding's own flow and checks step 1 (title 'Name and network') shows no Create/Import radios.
  - `[false]` `[reject]` Auditor: "cannot switch after step 1" is checked only by the radios' absence — the control is unmounted on later steps and the host exposes no other switch, so absence is the observable requirement.
  - `[false]` `[reject]` Auditor: the refused-Seed return to step 1 is not touched by the 20.5 tests — that behaviour is story 2's and is unchanged here (setQuizIndex(0) still runs).
  - `[false]` `[reject]` Auditor: no viewport or theme coverage in the diff — these are the spec's manual browser checks, run by the orchestrator, not a code defect.
  - `[low]` `[patch (fixed)]` Auditor: `check-controls.tsx` `disabled` is exercised only through the PathChoice busy path — same root cause as the medium rows; fixed by the same test patch. Fixed: new tests in add-wallet-import.test.tsx ("busy guards") render the real CreateWalletFlow radios with host `disabled: true` and assert each `.disabled` is true, plus an enabled control case; dropping `disabled` on the Radio fails the test (checked by mutation). The existing busy-guards assertions are kept. Busy alone cannot be rendered with radios on screen (they exist on step 1 only and the flow is only busy on the last step), so the `|| busy` merge itself is not separately exercised.

## Design Notes

- Resolved without asking: the choice stays in `AddWalletScreen` state and the flow is still keyed by it, because the story and the Seed field's lifetime depend on that remount. The radios sit inside step 1, so the remount would drop focus; the focus-on-mount flag fixes that. The capability check re-runs on remount as it did with the buttons.
- Resolved without asking: the control is radios, matching the other questions, not buttons. Labels "Create a new wallet" and "Import a wallet" follow the epic.
- Resolved without asking: Onboarding gets no `pathChoice`, so its step 1 title stays "Name and network". Story 8 owns its double Back.
- Resolved without asking: the counter does not count the path choice, since it is part of step 1, not a step.
- Step order on Import step 1 is path, Seed, Label, Network. This also removes the audit P3 where the heading "Name and network" sat over the Seed field.

## Verification

**Commands:**
- `bun run lint` -- expected: exit 0
- `bun run build` -- expected: exit 0
- `bun run test` -- expected: all pass; policy tests unchanged
- `bun run check:contrast` -- expected: exit 0

**Manual checks (if no CLI):**
- Playwright MCP only, fresh profile, dev server stopped afterwards, Testnet only. At 320, 390 and desktop in both themes: step 1 shows the radios; Import shows the Seed field; no path control on later steps; Back and changing the path starts again; focus lands on the picked radio; first-run Onboarding unchanged. Nothing created, funded or signed on Mainnet.

## Auto Run Result

### Summary

Add wallet no longer has Generate and Import buttons. Step 1 now asks "Create a new wallet" or "Import a wallet" as a radio question, above the Label and Network (and the Seed field on Import). After step 1 the choice is not shown. Going Back to step 1 and changing it starts the answers again and clears a typed Seed. First-run Onboarding is unchanged: no path radios, step 1 still titled "Name and network".

### Files changed

- `src/components/wallet/WalletQuestions.tsx` -- new `PathChoice` radio question (legend "Create or import", two `Choice` radios).
- `src/components/wallet/CreateWalletFlow.tsx` -- optional `pathChoice` prop; step 1 title and order; focus lands on the picked radio after the remount.
- `src/components/wallet/AddWalletScreen.tsx` -- removed the two buttons, passes `pathChoice`, keeps the keyed restart and the Seed clearing.
- `src/components/wallet/check-controls.tsx` -- `Choice` and `Radio` accept `disabled`.
- `src/components/wallet/__tests__/add-wallet-import.test.tsx` -- button tests rewritten to radios; new tests for no path control after step 1, Back with and without a change, focus, disabled radios, and Onboarding step 1.
- `src/pages/__tests__/create-entry-points.test.tsx` -- Add wallet assertions moved to radios.

### Review findings

20 findings: high 0, medium 3, low 7, false 10, maybe-false 0. The three mediums (all one root cause: no test rendered the disabled radios) and two lows were patched with new tests. The other low findings were rejected with reasons in the Review Triage Log. Nothing deferred.

### Verification

- Gates passed: lint, build, test (1774 passed in 122 files, 0 failed, 0 skipped), check:contrast.
- Browser pass: I ran a dev server on port 5205 in a fresh browser profile, Testnet only, and stopped it afterwards. Nothing was funded, signed or submitted. I walked first-run Onboarding, created a local Testnet wallet, then used the chooser's Add wallet screen. The story's acceptance criteria all passed.
  - Add wallet step 1 reads "Step 1 of 6" with "Create or import" radios (Create selected), then Label and Network. There is no Seed field and no Generate or Import button.
  - Choosing Import changes it to "Step 1 of 4", shows the Seed field first with the hint "Type your Seed to continue.", and disables Next. Focus lands on the picked Import radio, and also on the picked radio after an ArrowUp key change back to Create.
  - On step 2 there are no path radios, and focus is on the step heading.
  - Back with the path unchanged kept the Seed (29 characters typed), the Label and Devnet. Back and then changing the path started over: Label empty, Testnet selected, Seed field gone, "Step 1 of 6".
  - Onboarding step 1 is titled "Name and network" with no path radios; I walked it through to the Seed backup.
  - Checked 320 (dark and light), 390 (dark), 1280 (dark) and 200% zoom. No horizontal scroll at any width, and the sticky footer kept Next reachable at 320x640. CSS zoom on a 640 px viewport did not show the footer; I treated that as a limit of the zoom emulation and confirmed it with a real 320x320 viewport, where the footer works.
  - Colour is not the only signal for the selected radio.
  - Not covered: I did not re-check every later step at every width, and the Passkey path and the PIN block were not exercised.
  - Screenshots: /tmp/claude-1000/-home-otavio-xxx-xrpl-wallet/a26dad49-e38b-40b1-b725-b48803fac498/scratchpad/shots-5/
- Audit score: 17/20, no P0 or P1.

### Non-blocking audit issues

- P2, Add wallet step 1 (all widths): step title "Create or import" and the radio legend "Create or import" show the same words twice. Spec Design Notes asked for both.
- P3, Add wallet at 200% zoom (320x320): the sticky footer plus the dashed block leave about 60 px of content. Next stays reachable and the page scrolls, but the radios sit under the footer until you scroll.
- P3, Onboarding and Add wallet controls: radio rows are 20 px high (16 px radio), buttons and inputs 36 px; all under 44 px. This is the app's existing sizing, not new in 20.5.
- P3, first-run Onboarding: still two Back buttons. Expected; story 20.8 owns it.
- P2, `AddWalletScreen.tsx` (`<CreateWalletFlow key={mode}>`): picking the other path remounts the flow and silently discards what was typed, and it acts at once with no confirmation (WCAG 3.2.2). The spec decides this behaviour; a reset line belongs to a later story.
- P2, `CreateWalletFlow.tsx` step 1 title: "Create or import" hides that the step also holds Label and Network; the legend repeats it.
- P2, `WalletQuestions.tsx` PathChoice focus effect: uses a `querySelector` on the checked radio and a suppressed exhaustive-deps lint. A ref would be sturdier. Screen-reader announcement after the remount was not verified.
- P3, `check-controls.tsx`: disabled radios are dimmed to 55% and nothing else says why. The old buttons behaved the same.
- P3, `WalletQuestions.tsx` PathChoice: both Choices pass a constant `available: true`, so the aria-disabled and reason machinery is unused. Harmless.

### Residual risks

- Focus-on-remount relies on a `querySelector` and a suppressed lint rule; screen-reader announcement is unverified.
- The `|| busy` merge on the radios is not exercised by a test, because the flow is only busy on the last step where the radios are not rendered.
- Switching path discards typed answers with no warning, by design until a later story.
- Because three medium findings were patched, a follow-up review is recommended.
