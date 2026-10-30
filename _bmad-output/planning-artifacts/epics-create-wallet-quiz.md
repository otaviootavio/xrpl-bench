---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-xrpl-wallet-2026-09-12/prd.md
  - _bmad-output/specs/spec-create-wallet-quiz/SPEC.md
  - _bmad-output/specs/spec-create-wallet-quiz/quiz-steps.md
  - _bmad-output/specs/spec-create-wallet-quiz/stories.yaml
  - _bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-chooser-2026-10-19/ARCHITECTURE-SPINE.md
---

# xrpl-wallet — Create-wallet Quiz - Epic Breakdown

## Overview

This document provides the epic and story breakdown for the Create-wallet Quiz, decomposing PRD FR-91 (with FR-60, FR-87 and FR-2), the SPEC capabilities CAP-1 to CAP-8 and the five stories in `stories.yaml` into implementable stories. It is a separate file from `epics.md`, `epics-wallet-chooser.md` and `epics-passkey-signing.md`, which are left untouched. Numbering continues from Epic 19. There is no UX design contract for the quiz: the spec's `quiz-steps.md` and the Impeccable brief stand in for it, and the architecture is unchanged.

## Requirements Inventory

### Functional Requirements

New (PRD section 4.3):

FR-91: The per-Wallet questions are asked one at a time. Step 1 asks Label and Network. Step 2 shows the pre-selected answers as a read-only list with Create wallet and Walk me through it, on every network, naming Mainnet's forced rules. The walk asks Node, Seed Method (with the Passkey choice and domain warning), Signature type, Open Check with auto-lock, and Signing Check, each pre-selected and explained in plain words. A review step lists every answer with Change. Back keeps every answer. Changing Network keeps legal answers and resets illegal ones with a polite announcement. An unavailable answer stays visible and `aria-disabled` with its reason as text. A failed Node test keeps the user on the Node step. Steps are named in text, focus moves to the step heading, motion respects reduced motion, and it works at 320px and 200% text.

Amended:

FR-60: Import asks the same questions except Seed Method and Signature type; the Label is asked with Network; presentation is FR-91.
FR-87: the questions are asked one at a time (FR-91).

Unchanged and relied on:

FR-60: the question order and each pre-selection.
FR-65: the Mainnet floor (an Open Check is required, auto-lock at least 1 minute).
FR-72: the written-Seed confirmation.
FR-2: Import's Seed field is uncontrolled.

### NonFunctional Requirements

NFR-2: No secret is ever serializable; a typed PIN stays in an uncontrolled input; no secret enters quiz state.
NFR-5: Nothing styles `:focus`; `outline-none` is banned.
NFR-6: Colour never carries meaning alone; `bun run check:contrast` is the gate; no new colour token.
NFR-8: Every bespoke component gets a keyboard-only and screen-reader pass.
NFR-9: 320px viewport and 200% zoom are supported, each on its own; touch targets are at least 44px on coarse pointers.
NFR-10: Motion respects `prefers-reduced-motion`.
Delivery: the four gates (`bun run lint`, `bun run build`, `bun run test`, `bun run check:contrast`) pass on every story; policy tests pass unchanged; only tests that assume the single form are rewritten.

### Additional Requirements

- AD-28: one policy function and the Mainnet floor. The quiz renders what `describeOptions` lists and never re-derives legality.
- AD-40: Generate and Import share one questions component; neither enters the wallet. The quiz stays inside that component and `CreateWalletFlow`.
- AD-22: no creation path bypasses the keystore and policy. Creation, PIN entry and the Seed backup are not touched.
- No architecture change. The change touches no lock, key, route, storage or ledger read. The quiz is identical wherever `CreateWalletFlow` renders: the chooser's add screen and first-run Onboarding (owner, 2026-10-29).
- Configure (FR-88) is not changed. Code check: `WalletQuestions` is imported only by `CreateWalletFlow`.

### UX Design Requirements

UX-DR1: A step container with "Step n of N" as text, counting only the steps the user will see (Import omits Seed Method and Signature type).
UX-DR2: Focus moves to the new step's heading on Next and Back.
UX-DR3: Step 2 is a read-only list, no radio, with Create wallet primary and Walk me through it secondary, on every network; on Mainnet it names the forced rules in text.
UX-DR4: Each question step reuses the existing `Choice` and `Axis` controls and their detail copy; an unavailable answer is `aria-disabled` with its reason as text.
UX-DR5: The review step lists every answer with a Change action that returns to that question; after Change, Next returns to the review.
UX-DR6: The Network-change reset line is visible text and is announced politely.
UX-DR7: Actions stay reachable at 320px and 200% text through the screen footer; no step clips or scrolls sideways.
UX-DR8: No new colour token; the existing panel vocabulary of `DESIGN.md`.

### FR Coverage Map

FR-91: Stories 20.1 to 20.5.
FR-60 (Import line, Label): Story 20.2, 20.3.
FR-87: Stories 20.2, 20.3.
NFR-5, NFR-6, NFR-8, NFR-9, NFR-10: Story 20.5, and each UI story.

## Epic List

### Epic 20: Create a wallet one question at a time
A user creating or importing a wallet is asked one question at a time. They can accept the recommended setup in one tap or walk through each choice with its consequence stated, and they review everything before the wallet is created. The rules that decide which answers are legal, and how the wallet is written, stay as they are.
**FRs covered:** FR-91, FR-60 (Import line, Label), FR-87
**Stories (stories.yaml):** 1 to 5, as 20.1 to 20.5. No spec or done checkpoints (owner, 2026-10-29).


## Epic 20: Create a wallet one question at a time

A user creating or importing a wallet is asked one question at a time, with a shortcut for the recommended setup and a review before anything is created. Policy, creation, PIN entry and the Seed backup are not changed. Each story leaves the app working.

### Story 20.1: A step shell with Back and Next

As a user creating a wallet,
I want the questions to come in steps I can move back and forth through,
So that I never lose an answer by going back.

**Acceptance Criteria:**

**Given** the Create or Import screen opens
**When** it renders
**Then** it shows one step, "Step n of N" as text, and Back and Next (FR-91, CAP-1)
**And** until story 20.2 the current form is the single step, so nothing the user could do before is lost

**Given** the user has answered a question and moves to another step and back
**When** the step renders again
**Then** every answer is as they left it (FR-91)

**Given** the user presses Next or Back
**When** the new step renders
**Then** focus is on that step's heading, and nothing styles `:focus` (NFR-5)

**Given** the user prefers reduced motion
**When** a step changes
**Then** nothing animates (NFR-10)

**Given** a PIN is typed in an uncontrolled input
**When** the user moves between steps
**Then** it is read and cleared as today and never enters step state (NFR-2)

**And** the policy tests pass unchanged, and a screen test fails if Back resets an answer

### Story 20.2: Label and Network, then the recommended-setup shortcut

As a user creating a wallet,
I want to name it, pick its network, and create it in one tap with the recommended setup,
So that the fast path stays fast.

**Acceptance Criteria:**

**Given** the quiz opens
**When** step 1 renders
**Then** it asks Label and Network only, with the Label's existing validation text (FR-91, FR-60, CAP-2)

**Given** the user moves on from step 1
**When** step 2 renders
**Then** it lists every applicable pre-selected answer once, as read-only text with no radio, on Mainnet, Testnet and Devnet (FR-91, CAP-3)
**And** **Create wallet** is the primary action and **Walk me through it** the secondary

**Given** the Network is Mainnet
**When** step 2 renders
**Then** it states in text that an Open Check is required and auto-lock is at least 1 minute (FR-65)

**Given** the user chooses Create wallet on step 2 with no answer changed
**When** creation runs
**Then** the Wallet is the same as the one the previous form made with those answers, and PIN entry, the written-Seed confirmation and the backup follow as today

**Given** the user chooses Walk me through it
**When** the next step renders
**Then** the remaining existing controls appear as one step, until story 20.3 splits them
**And** Import shows the same steps without Seed Method and Signature type (FR-87)

**Given** the app is at first run, with no Wallet on the device
**When** the quiz opens
**Then** it is the same quiz, with the same shortcut step (FR-91)

**And** Back, Next and Create wallet sit in the sticky screen footer (`actionHost`), as Create wallet does today
**And** the old Recommended panel and Customise toggle no longer render

### Story 20.3: The walk, one question per step

As a user who wants to choose,
I want each question on its own step with its consequence in plain words,
So that I understand what I am choosing where I choose it.

**Acceptance Criteria:**

**Given** the user walks through
**When** the steps render
**Then** they follow `quiz-steps.md`: Node, Seed Method, Signature type, Open Check with auto-lock, Signing Check, each pre-selected as in FR-60 (FR-91, CAP-4)
**And** the steps are the questions `describeOptions` lists, not a hard-coded seven (AD-28)

**Given** an answer is unavailable on this device or Network
**When** its step renders
**Then** it is visible, `aria-disabled`, with the reason as visible text, and the step is not skipped (FR-60, NFR-6)

**Given** the user picks Passkey-Derived on the Seed Method step
**When** the step renders
**Then** the Passkey choice and the app-domain warning appear on that step (FR-63)

**Given** the user is importing
**When** the steps render
**Then** Seed Method and Signature type are absent, and "Step n of N" counts only the steps shown (FR-87, UX-DR1)

**Given** a custom Node fails its test
**When** the Node step renders
**Then** the user stays on it, the reason is text, and the built-in Nodes are selected (FR-61, CAP-7)

**Given** the user is on the last question
**When** they continue
**Then** **Create wallet** replaces Next, until story 20.4 adds the review

**And** a test fails if a question the policy lists is not rendered as a step

### Story 20.4: Review before create, and the Network-change reset

As a user about to create a wallet,
I want to see every answer once more and change any of them,
So that nothing is created that I did not choose.

**Acceptance Criteria:**

**Given** the user finishes the walk
**When** the review renders
**Then** it lists every applicable answer, each with **Change**, and **Create wallet** (FR-91, CAP-5)

**Given** the user chooses Change on a row
**When** that question renders
**Then** its answer is kept, and Next returns to the review (assumption in SPEC.md)

**Given** the user changes Network after later steps were answered
**When** the change is made
**Then** answers still legal are kept and illegal ones reset to the new pre-selection (FR-91, CAP-6)
**And** a visible line names what was reset and is announced politely (UX-DR6)

**Given** the user chooses Create wallet on the review
**When** creation runs
**Then** policy refuses any illegal combination before any write, as today (AD-28)

**And** a test fails if a Network change leaves an illegal answer selected

### Story 20.5: Retire the old form, rewrite its tests, and check it in a real browser

As the owner,
I want nothing of the old long form left, and the quiz proven on a phone-width screen,
So that it ships clean and usable at 320px and 200% zoom.

**Acceptance Criteria:**

**Given** the quiz is in place
**When** the code is searched
**Then** no Recommended panel, Customise toggle, `isRecommended` or `customiseForced` remains, and `WalletQuestions` carries no duplicate summary (CAP-8)

**Given** tests that assumed the single form
**When** they are rewritten
**Then** they exercise the quiz; the policy tests are unchanged and pass

**Given** the quiz is open for Create, Import and first run, on Mainnet and Testnet
**When** checked in a real browser at 320px, 390px, desktop and 200% zoom, in both themes
**Then** no step clips or scrolls sideways and its actions stay reachable (NFR-9, UX-DR7)

**Given** the quiz is used by keyboard and screen reader
**When** moving through every step
**Then** order, focus on the step heading, the step counter and the unavailable-answer reasons are announced (NFR-8)

**Given** the quiz's styles
**When** they are compared with `DESIGN.md`
**Then** every colour comes from an existing token and none is added (UX-DR8, NFR-6)

**And** `bun run lint`, `bun run build`, `bun run test` and `bun run check:contrast` pass
