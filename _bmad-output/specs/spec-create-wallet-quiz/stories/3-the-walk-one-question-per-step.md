---
title: 'The walk: one question per step'
type: 'feature'
created: '2026-10-29'
status: 'done'
baseline_revision: '674e9007b8aa8a889a4fa1bc1c22f6daeaf3269f'
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
      CLAUDE.md and the sprint and spec status tables do not yet mention the one-question-per-step walk.
    evidence: |-
      Review finding (Blind Hunter): the fix edits CLAUDE.md, an agent-context file, so it is deferred. Update when Epic 20 closes.
    location: >-
      CLAUDE.md
    severity: low
---

<intent-contract>

## Intent

**Problem:** After "Walk me through it", all remaining questions (Seed Method, Node, Signature type, Open Check, auto-lock, Signing Check) still sit on one long interim step ("Your choices"), so each consequence is read among five other choices.

**Approach:** Replace that step with one step per question, in `quiz-steps.md` order, built from a small ordered list of questions that the policy's own option keys must all be covered by. Import omits Seed Method and Signature type. The last question shows Create wallet in place of Next (story 4 adds the review).

## Boundaries & Constraints

**Always:** Render the questions from a registry, not a fixed count: each entry has an id, a step title, the `describeOptions` keys it covers, whether it applies to Import, and its render. Step order: Node, Seed Method, Signature type, Open Check with auto-lock (paired), Signing Check. Reuse `Axis`/`Choice` and their existing detail copy; add one short plain-words lead line per step where a consequence is not already stated. An unavailable answer stays visible, `aria-disabled`, reason as text; its step is never skipped. Answers stay in `CreateWalletForm` state; Back keeps them. "Step n of N" counts only steps the person will see (Import: 5 in all, Generate: 7). Create wallet on step 2 and on the last walk step call the same `handleCreate`. Policy, creation, PIN entry, backup, written-Seed step, Import's uncontrolled Seed field stay as they are. Nothing styles `:focus`; no `outline-none`; no new colour token.

**Never:** Add the review, Change actions or the Network-change reset (story 4). Change a pre-selection or a legality rule, or re-derive legality in the quiz. Remove or unmount the Seed field or PIN fields on a step change (keep the hidden-not-unmounted pattern). Block Next on a custom Node. Animate a step change.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Generate walk | step 2, Walk me through it | Step 3 "Node" of 7, then Seed Method, Signature type, Open Check and auto-lock, Signing Check (step 7, Create wallet instead of Next) | No error expected |
| Import walk | Import, Walk me through it | Node, Open Check and auto-lock, Signing Check: "Step 3 of 5" to "5 of 5" | No error expected |
| Unavailable answer | no PRF, or Mainnet at an unbound origin | Its step still shows; the option is `aria-disabled` with its reason as text | Clicking it does nothing |
| Passkey-Derived chosen | Seed Method step | Passkey choice and app-domain warning appear on that step; Signing Check later offers only its passkey | Unchanged policy reason if blocked |
| Failed custom Node test | Node step, Test fails | Stays on Node step; reason as text; built-in Nodes selected; Next works | Reason from `verifyNode` |
| Untested custom Node | custom picked, never tested, Next to the end | Next not blocked; Create wallet refuses with the existing "Test the custom Node first" text | Existing error |
| Policy gains a key | `describeOptions` returns a key no question covers | A test fails | n/a |
| Back across the walk | answer on step 5, Back to 3, Next | Every answer, the typed PIN and the Seed unchanged | n/a |

</intent-contract>

## Code Map

- `src/components/wallet/WalletQuestions.tsx` -- holds `NameAndNetworkStep`, `RecommendedList` (leave as is) and `WalkStep` (one block with Seed Method + Passkey `Axis` + warning, Node `Axis` with custom-Node test, Signature type, Open Check, Auto-lock, Signing Check, then the failed-Node `role="alert"` text). Split `WalkStep` by question; add the registry (`WALK_QUESTIONS`, a helper returning those that apply for `imported`). Keep the Axis/Choice markup and copy verbatim; Signature type, Auto-lock and Open Check passkey/pin options have no detail line yet.
- `src/components/wallet/CreateWalletFlow.tsx` -- `quizSteps` (3 interim entries, `setQuizIndex(2)` in the Walk button), `quizIndex`, render block `{quizIndex === 2 && <WalkStep/>}`, the PIN block (hidden when `quizIndex === 0`) and the blocked `Alert` (`quizIndex !== 0`). `createButton`/`handleCreate` guard `options.combination.ok`, `labelError`, custom Node untested. `testNode` already sets built-in and `nodeReason` on failure. `changeNetwork` untouched.
- `src/components/wallet/QuizShell.tsx` -- built in 20.1/20.2: last step shows `finalAction`; `primary`, `secondary`, `blocked` exist. No change expected.
- `src/lib/crypto/policy.ts:232` -- `describeOptions` returns `seedMethod`, `openCheck`, `autoLock`, `signing` (questions) plus `combination`, `writtenSeedRequired` (verdicts). Read-only. Node and Signature type are not policy keys.
- `src/components/wallet/AddWalletScreen.tsx`, `src/pages/Onboarding.tsx` -- callers; `importSource` and `actionHost`; no change expected.
- `src/components/wallet/__tests__/create-wallet-flow.test.tsx` -- helpers `mount` (walks to step 3), `switchNetwork`, `legends()`; tests "asks in the FR-60 order", the Walk/passkey tests (~327), unavailable-answer, Node (~627), Passkey-Derived (~684) and the source-regex test (~1039, expects `<WalkStep`) assume one walk screen. Policy-driven assertions stay. `add-wallet-import.test.tsx` (~183-216) walks to step 3. `quiz-shell.test.tsx` unchanged.
- Carried from stories 1 and 2: Seed field is mounted once and hidden off step 1 (unmounting clears it); PIN fields are mounted once; focus goes to the step's `h2` on every change; footer actions go through `actionHost` or inline at first run. Policy tests must pass unchanged. Footer layout verified in a real browser in story 2.

## Tasks & Acceptance

**Execution:**
- `src/components/wallet/WalletQuestions.tsx` -- replace `WalkStep` with per-question renders and an exported ordered registry (id, title, covers, importApplies, lead line); export the list of policy keys that are verdicts, not questions -- one source for the step list and for the coverage test
- `src/components/wallet/CreateWalletFlow.tsx` -- build `quizSteps` as the two fixed steps plus one per applicable registry entry; Walk goes to the first walk step; render the active question; show PIN fields on step 2 and the last step only (hidden, not unmounted, elsewhere); show the failed-Node text on the Node step
- `src/components/wallet/__tests__/create-wallet-flow.test.tsx`, `add-wallet-import.test.tsx` -- add a helper that walks to a named step; rewrite tests that read radios of several questions on one screen; add tests for the matrix
- `src/components/wallet/__tests__/walk-questions.test.tsx` -- new: every key of `describeOptions(...)` outside the verdict keys is covered by a registry entry (and each registry entry covers a real key or is Node or Signature type); order matches `quiz-steps.md`

**Acceptance Criteria:**
- Given Generate on Testnet, when the person presses Walk me through it and Next, then headings read Node, Seed Method, Signature type, Open Check and auto-lock, Signing Check, each with "Step n of 7", and Create wallet replaces Next on the last
- Given Import, when walking, then Seed Method and Signature type never appear and the counter reads "of 5"
- Given no PRF, when the Open Check and Signing Check steps render, then the passkey options are visible, `aria-disabled`, with their reason as text, and Next still moves on
- Given Passkey-Derived is chosen on Seed Method, then the Passkey choice and the domain warning show on that step and not on others
- Given a custom Node fails its test, then the Node step stays, the reason shows as text, "Built-in Nodes" is checked and Next is enabled
- Given any answer, when the person goes Back and forward, then every answer, the typed PIN and an Import Seed are unchanged and Create wallet from the last step makes the same keystore call as from step 2
- Given the policy returns a question key no step covers, then the coverage test fails
- Given first-run Onboarding and the chooser's add screen, then the walk is identical

## Spec Change Log

## Review Triage Log

### 2026-10-29 — Review pass
- verdicts: 27 findings — high 0, medium 1, low 19, false 7, maybe-false 0
- findings:
  - `[low]` `[reject]` Blind: custom-Node refusal shows on the last step, far from the Node control — the spec's matrix fixes this (Next is not blocked, Create refuses with the existing text) and the person can press Back; a custom Node is rare and a jump-back adds a new branch
  - `[low]` `[reject]` Blind: each step repeats its title as h2 and as the Axis legend — legends are kept on purpose (the acceptance criteria and tests read them); cosmetic, and changing them alters copy the spec says to reuse
  - `[false]` `[reject]` Blind: lead copy inconsistent across steps — spec asks for a lead only where a consequence is not already stated; Seed Method and Signing Check Choices already carry detail text and the policy reason is shown as text
  - `[low]` `[patch (fixed)]` Blind: step offset 2 and PIN index 1 are bare constants (also setQuizIndex(2)) — real but small: the fixed-step count lives in three places in CreateWalletFlow.tsx; fix is one named constant. The 'clamp when the step list changes' part is false: AddWalletScreen keys the flow by mode, so importSource and the walk never change under a live quizIndex — Fixed: added named constants SHORTCUT_INDEX = 1 and FIRST_WALK_INDEX = 2 in CreateWalletFlow.tsx and used them in walk[quizIndex - FIRST_WALK_INDEX], the quizIndex >= check, setQuizIndex(FIRST_WALK_INDEX) and showPin; no behaviour change
  - `[low]` `[reject]` Blind: PIN fields first met on the last step — spec Design Notes place the PIN where Create wallet is; the PIN fields sit on the final step beside the button, so there is no dead end; a hint adds new copy
  - `[low]` `[reject]` Blind: test helpers radioNamed/createButton navigate inside lookups — test-only style; placement is pinned by the step-order, PIN and passkey tests; not worth a rewrite
  - `[low]` `[reject]` Blind: failure-path tests now assert only 'Step 7 of 7' — that text proves the flow stayed on the questions at its last step (Signing Check heading); extra assertions would add little
  - `[low]` `[patch (fixed)]` Blind: Back and answer persistence coverage is thin (Open Check none, Node draft, Import) — the Generate PIN-survives-Back test exists; the real hole is Import (PIN, Seed, answers across steps), folded into the Import patch with the verification-gap finding — Fixed: covered by the new Import walk test in add-wallet-import.test.tsx (PIN, Seed and a changed answer kept across Next and Back)
  - `[low]` `[reject]` Blind: Import coverage partial (walk-questions ids only) — ids and Import steps are tested; remaining part (PIN on step 5, Seed kept) is the verification-gap patch; passkey/algorithm leakage is not reachable since Import hides those steps
  - `[false]` `[reject]` Blind: focus and announcement on step change untested — QuizShell focuses the step h2 on every index change (useEffect on index) and has its own tests from story 1; the shell is unchanged here
  - `[low]` `[reject]` Blind: architecture test greps source for walkQuestions( and .render(questionProps) — brittle in style, but the same test already uses source greps; a refactor breaks it loudly, not silently
  - `[low]` `[reject]` Blind: coverage guard is hand-maintained and allowlists node/signature-type — this is exactly the spec's registry design (Node and Signature type are not policy keys); a new policy key still fails the test
  - `[low]` `[defer]` Blind: CLAUDE.md and sprint/spec tables not updated — fix edits CLAUDE.md (agent-context file), so it is deferred; to be done when Epic 20 closes
  - `[false]` `[reject]` Blind: untracked story file not in the reviewed diff, Import decision unrecorded — the story file is the spec under build and its intent contract already states Import omits Seed Method and Signature type; the fix would edit the spec
  - `[false]` `[reject]` Blind: WalletQuestions header comment still lists auto-lock without Import note — the diff already rewrote that header to the walk's five questions; Import's omission is in walk-questions.ts (importApplies)
  - `[false]` `[reject]` Blind: 'Step 1 to step 3' comment out of date — Node is step 3 in both Generate and Import walks, so the comment is correct
  - `[low]` `[reject]` Edge: Next/Back pressed while a custom Node test runs — a failing test then falls back to built-in Nodes, the safe default; the spec forbids blocking Next on a custom Node
  - `[low]` `[reject]` Edge: nodeReason shown only on the Node step, stale on return — the text is accurate (built-in Nodes are selected) and is cleared by the next test or a network change; negligible
  - `[low]` `[reject]` Edge: walk renderers called without a key — inputs are controlled and focus is moved to the heading on every step; no demonstrated carry-over
  - `[low]` `[reject]` Edge: refusal on last step, fix is on step 3 — same root as the first Blind finding; spec-settled behaviour
  - `[false]` `[reject]` Edge: quizIndex outside range if importSource changes mid-walk — AddWalletScreen passes key={mode}, so the flow remounts with quizIndex 0 on a mode change; importSource truthiness is fixed per mount
  - `[low]` `[reject]` Edge: radioNamed break guard — the guard stops navigation from step 1; test-only, and a miss fails loudly with getByRole
  - `[medium]` `[patch (fixed)]` Gap: Import's PIN fields on step 5 (last walk step) are not verified — code is right (showPin uses quizSteps.length - 1) but no Import test walks to step 5 to check PIN fields hidden on 3 and 4, visible on 2 and 5, typed PIN kept; fix is a test in add-wallet-import.test.tsx, plus Seed kept and import from step 5 using the walked answers — Fixed: added one test in add-wallet-import.test.tsx that walks Import to step 5: PIN fields hidden on 3 and 4, visible on 2 and 5, typed PIN and Seed unchanged after Next/Back, and Import wallet from step 5 runs the duplicate probe and master-key check and calls the keystore with the changed Signing Check (App PIN only)
  - `[low]` `[reject]` Gap (other): radioNamed navigates silently, leftover break — same as the helper findings above; test-only
  - `[low]` `[reject]` Auditor: step list is a static table, not generated from describeOptions — this is the spec's registry design with a coverage test that fails on a new policy key
  - `[false]` `[reject]` Auditor: PIN placement (step 2 and last step) is a rule the ACs do not state — stated in the spec's Execution tasks and Design Notes
  - `[low]` `[reject]` Auditor: unavailable-state coverage is one instance per step; Import walk tested on default Testnet only — the policy tests cover the states; per-step rendering is shared Choice code; negligible

## Design Notes

- Resolved without asking: the registry's "covers" list is how "steps are the questions the policy lists" is enforced. Node and Signature type are not policy keys, so they are fixed registry entries; `autoLock` is covered by the Open Check step because FR-60 pairs them (SPEC assumption, unconfirmed by the owner).
- Resolved without asking: Create wallet only on step 2 and the last walk step; middle steps have Next only. The PIN fields follow Create wallet (step 2 and last step) because that is where the PIN is used.
- Resolved without asking: an untested custom Node does not block Next. SPEC CAP-7 says Next is not blocked by a Node problem; the existing refusal at Create stays as the safeguard. Audit P3 (summary could say "Test it on the next step") is left alone.
- Not in scope though noted by story 2's audit: focus after a refused Seed, 200% text with a 400px-tall viewport, the light-finish contrast of "Your setup" terms.

## Verification

**Commands:**
- `bun run lint` -- expected: no errors
- `bun run build` -- expected: `tsc -b` and Vite pass
- `bun run test` -- expected: all pass; policy tests unchanged
- `bun run check:contrast` -- expected: pass

**Manual checks (if no CLI):**
- Playwright MCP only, dev server, fresh profile: Create and Import walks at 320, 390 and desktop, dark and light, Testnet and Mainnet display only; one local Testnet wallet at most; garbage Seeds for Import. Check focus lands on each step heading, no sideways scroll, Back/Next/Create reachable in the footer, unavailable reasons visible. Nothing created, funded or signed on Mainnet.


## Auto Run Result

**Status:** done. `followup_review_recommended: false` (this pass patched no high and one medium; the rule needs a high or two or more mediums).

### Summary of the change

After "Walk me through it", each remaining question now has its own step with Back and Next, and the last step shows Create wallet instead of Next. The Generate walk reads Step 3 to Step 7 of 7 in this order: Node, Seed Method, Signature type, Open Check and auto-lock, Signing Check. The Import walk (Add wallet screen) reads Step 1 to 5 of 5 and skips Seed Method and Signature type. Answers survive Back and forward, focus moves to each step heading, and a rejected custom Node keeps the person on the Node step with the reason shown. With a Passkey-Derived Seed, Standard and App PIN are shown as unavailable with the reason as text.

### Files changed

- `src/components/wallet/walk-questions.ts` (new): the ordered list of walk steps for Generate and Import.
- `src/components/wallet/__tests__/walk-questions.test.tsx` (new): tests for the step order and the Import skip.
- `src/components/wallet/CreateWalletFlow.tsx`: drives the walk one step at a time, Next/Create, focus, PIN field placement.
- `src/components/wallet/WalletQuestions.tsx`: each question is split into its own single-question step component.
- `src/components/wallet/__tests__/create-wallet-flow.test.tsx`: updated for the stepped walk.
- `src/components/wallet/__tests__/add-wallet-import.test.tsx`: updated for the Import walk.

### Review findings

High 0, medium 1, low 19, false 7, maybe-false 0. The medium was patched. Every rejected finding and its reason is in the Review Triage Log above. One low item is deferred (CLAUDE.md and status tables do not mention the walk yet; update when Epic 20 closes).

### Verification

- Gates: `bun run test` 1766 passed in 122 files, 0 failed, 0 skipped. `bun run lint`, `bun run build` and `bun run check:contrast` all exit 0.
- Browser pass (Playwright MCP only): dev server on port 5193, fresh browser, server stopped afterwards. One local Testnet wallet created. Nothing funded, signed or sent; nothing touched Mainnet.
  - Measured checks (scrollWidth, document.activeElement, radio state) ran at 320, 390 and 640-at-zoom-2 only. Screenshots: 320 dark, 390 default finish, 1280 light. The 200% zoom check was measured only (scrollWidth 630 against clientWidth 630); its screenshot was saved but not opened. Not exercised: dark finish at 1280, light finish at 320. No screenshots at every width in both finishes.
  - Worked: Generate walk order and Next replaced by Create wallet on the last step (first run and Add wallet); focus on each step h2 after Next and Back; no sideways scroll at 320, 390 or 200% zoom; answers kept across Back and forward (App PIN only, typed PIN, Open Check and auto-lock); Passkey-Derived shows the passkey choice and domain warning on Seed Method only, and Step 7 lists Standard and App PIN as aria-disabled with the reason as text; a failing custom Node (wss://127.0.0.1:1) stayed on the Node step with an alert, and Built-in Nodes re-enabled Next; Import walk Step 1 to 5 of 5 kept the typed 31-character Seed through Next and Back.
  - First-run Onboarding's Import button does not enter the quiz. It goes to the older Seed then "Secure your wallet" PIN screen, which sat on "Setting up…" in headless Chromium (passkey step). That is outside this story. The quiz Import walk is reached only from the Add wallet screen.
- Audit: 17/20 (Good). Read-only audit from the diff; no browser pass was run for the audit.

### Non-blocking P2/P3 issues from the audit

- P2, footer on every step: two full-width Back buttons stack (step Back and the outer Back that leaves the flow); they look alike and the outer one can discard answers.
- P2, Seed Method with Passkey-Derived at 320x640: Next sits at y 642, below the viewport, so it needs a scroll. Reachable and uncovered.
- P2, all quiz steps: footer buttons are 36px and radio rows about 20px, under the 44px touch target. Shared button size, not new here.
- P2, `CreateWalletFlow.tsx` showPin: the App PIN field shows only on the shortcut step and the last step, so choosing App PIN on Open Check shows no field there and nothing says it is asked at the end.
- P2, `WalletQuestions.tsx` SignatureTypeQuestion lead: "Most wallets and services accept either." is unsourced and does not say which option is the default.
- P3, every step: step title and Axis legend repeat the same words (logged as a deliberate keep); screen readers hear the label twice.
- P3, Step 7 with Passkey-Derived: the amber reason text; meaning is in the words, contrast at small size not measured on the light finish.
- P3, Lead usage inconsistent: Node and Open Check leads define terms the user knows; Seed Method and Signing Check have none.
- P3, `walk-questions.ts` and `CreateWalletFlow.tsx`: step list rebuilt each render from importSource with no reset if it changed; FIRST_WALK_INDEX and SHORTCUT_INDEX are separate from array order.
- P3, NodeQuestion error alert sits under the Axis; needs one real-browser pass at 320px and 200% text to confirm it stays visible and announced out of context.

### Residual risks

The untested combinations above (dark at 1280, light at 320, an opened 200% screenshot), the doubled Back buttons, the sub-44px targets, and the App PIN field appearing two steps after it is chosen.
