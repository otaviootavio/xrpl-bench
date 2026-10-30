# Epic 20 Context: Create a wallet one question at a time

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Creating or importing a wallet is currently one long form that shows every per-Wallet choice, then repeats them in a Recommended panel. This epic turns it into a short quiz: one question at a time, a one-tap shortcut for the recommended setup, a review before creation, and each consequence stated where the choice is made. Only how answers are asked changes. The rules deciding which answers are legal, and how the wallet is written, stay as they are, because the wallet is meant to hold real Mainnet funds.

## Stories

- Story 20.1: A step shell with Back and Next
- Story 20.2: Label and Network, then the recommended-setup shortcut
- Story 20.3: The walk, one question per step
- Story 20.4: Review before create, and the Network-change reset
- Story 20.5: Retire the old form, rewrite its tests, and check it in a real browser

## Requirements & Constraints

- Step 1 asks Label (with its existing validation text) and Network only. Network comes first because it decides which later answers are legal.
- Step 2 is a read-only list of the pre-selected answers (no radios), with Create wallet primary and Walk me through it secondary, on Mainnet, Testnet and Devnet. On Mainnet it states in text that an Open Check is required and auto-lock is at least 1 minute.
- The walk asks, in order: Node, Seed Method (Passkey choice and app-domain warning when Passkey-Derived is picked), Signature type, Open Check with auto-lock (paired, an unconfirmed assumption), Signing Check. Pre-selections are unchanged.
- The walk ends on a review listing every applicable answer, each with Change. After Change, Next returns to the review (assumption). Create wallet on the review equals Create wallet on step 2.
- Import omits Seed Method and Signature type; the step counter ("Step n of N", as text) counts only steps the user will see.
- Back keeps every answer. Changing Network keeps still-legal answers, resets illegal ones to the new pre-selection, and shows a visible line naming what was reset, announced politely.
- An unavailable answer stays visible and `aria-disabled` with its reason as visible text; its step is never skipped. A failed custom-Node test keeps the user on the Node step with the reason as text and the built-in Nodes selected; Next is not blocked.
- Quiz is identical at first-run Onboarding and the chooser's add screen, shortcut step included.
- Non-goals: no new question, pre-selection or legality rule; no change to Configure, PIN entry, Seed backup, written-Seed confirmation, or how a Wallet is written.
- Accessibility and delivery: focus moves to the new step's heading on Next and Back; nothing styles `:focus` and `outline-none` is banned; no meaning by colour alone; no new colour token; reduced motion means no step animation; works at 320px and at 200% text (each on its own), touch targets at least 44px on coarse pointers; keyboard-only and screen-reader pass. The four gates (`bun run lint`, `bun run build`, `bun run test`, `bun run check:contrast`) pass on every story; policy tests pass unchanged.
- No secret enters quiz state, URL or storage; a typed PIN stays in an uncontrolled input, and Import's Seed field stays uncontrolled.

## Technical Decisions

- The policy function (`describeOptions`) and the Mainnet floor are the single source of legality. The quiz renders what it lists and never re-derives legality, and steps are not a hard-coded seven, so a question added later (passkey-signing work) appears without rework. A test fails if a listed question is not a step.
- The questions component is shared by Generate and Import and neither enters the wallet. It is imported only by `CreateWalletFlow`, which the chooser's add screen and first-run Onboarding render. The quiz stays inside that component and `CreateWalletFlow`. No creation path bypasses the keystore and policy.
- All answers live in the caller's state. No architecture, lock, key, route, storage or ledger-read change.
- Back, Next and Create wallet sit in the sticky screen footer (`actionHost`), where Create wallet sits today.
- Reuse the existing `Choice` and `Axis` controls and their detail copy, and the existing panel vocabulary of `DESIGN.md`.
- Retire the old Recommended panel, Customise toggle, `isRecommended` and `customiseForced`, and any duplicate summary in the questions component.

## UX & Interaction Patterns

- No UX design contract exists; the spec's step table and the Impeccable brief stand in.
- Step container shows "Step n of N" as text; actions stay reachable through the screen footer at 320px and 200% text, with no clipping or sideways scroll.
- Final story includes a real-browser check at 320px, 390px, desktop and 200% zoom, in both themes, for Create, Import and first run, on Mainnet and Testnet.

## Cross-Story Dependencies

- 20.1 is the shell; until 20.2 the current form is its single step.
- 20.2 puts the remaining controls in one step after Walk me through it, until 20.3 splits them.
- 20.3 shows Create wallet on the last question, until 20.4 adds the review and the Network-change reset.
- 20.5 depends on all prior stories: it deletes the old form code, rewrites tests that assumed the single form, and runs the browser and accessibility passes.
- Relies on existing rules for the Mainnet floor, the written-Seed confirmation and Import's uncontrolled Seed field.
