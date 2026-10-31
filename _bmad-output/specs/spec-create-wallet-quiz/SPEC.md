---
id: SPEC-create-wallet-quiz
companions:
  - quiz-steps.md   # SPEC-AUTHORED: the step list, when each shows, what it asks
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. The requirement of record is PRD FR-91 (with FR-60, FR-87, FR-2); where they differ, the PRD wins.

# Create-wallet Quiz

## Why

A pain, owner-raised 2026-10-29. The create form shows every per-Wallet choice at once, then a Recommended panel that repeats the same values above the Customise radios, so the user reads each setting twice and scrolls a long page to make seven decisions. Seed Method sits outside Customise yet is also listed inside the panel. Asking one question at a time states each consequence where the choice is made. The users are advanced, so the quiz makes them choose every setting and offers no shortcut (revised 2026-10-30). The wallet is meant to hold real Mainnet funds, so the rules that decide which answers are legal must not move.

## Capabilities

- **CAP-1** Quiz shell (PRD FR-91)
  - **intent:** The per-Wallet questions are asked one step at a time, and the user can go back without losing an answer.
  - **success:** A screen test steps forward and back across every step and finds each earlier answer unchanged; each step shows its position as text ("Step 3 of 7"); focus is on the new step's heading after Next and Back; with reduced motion set, no step transition animates.
- **CAP-2** Create or Import, Label and Network first (FR-91, FR-60)
  - **intent:** The first step asks whether to create a new Wallet or import one, then the Label and the Network, before anything that depends on them.
  - **success:** Step 1 shows the Create-or-Import question, the Label and the Network (Import also its Seed field); no Generate or Import switch is shown on any later step; going Back to step 1 and changing the choice starts the answers again; the Label's validation text appears on step 1.
- **CAP-3** No shortcut: every setting is asked (FR-91)
  - **intent:** A user chooses every setting, so nothing is created from defaults they did not look at.
  - **success:** No step shows a read-only list of the setup, no Walk me through it button exists, and Create wallet (or Import wallet) appears only on the last step; on Mainnet the Open Check step states in text that an Open Check is required and auto-lock is at least 1 minute.
- **CAP-4** One question per step (FR-91, FR-60, FR-63, FR-65)
  - **intent:** Walking through asks Node, Seed Method, Signature type, Open Check with auto-lock, and Signing Check in that order, each pre-selected and explained in plain words.
  - **success:** The step list in `quiz-steps.md` renders in order; each question's pre-selection equals FR-60's; an answer the device or Network cannot support is visible, `aria-disabled`, with its reason as text, and is never skipped; choosing Passkey-Derived adds the Passkey choice and the app-domain warning to the Seed Method step; in Import, Seed Method and Signature type do not appear, step 1 Next is blocked until a Seed is typed (a boolean only is kept), and a refused Seed returns to step 1 with the reason beside the field.
- **CAP-5** Review before create (FR-91)
  - **intent:** The walk ends on a review of every answer, each reachable for change, from which the Wallet is created.
  - **success:** The review lists every applicable answer; each row's **Change** returns to that question with its answer kept, except Network, which shows as text with "Locked" and a visible reason (go Back to step 1; the questions then start again); **Create wallet** (**Import wallet**) is on the review; the review is one "Your answers" plate with the create-consequence line as its last line; if an App PIN is needed its plate comes last, directly above the footer, and its fields are visible above the footer at 320px and 390px, and a missing or short PIN moves focus to the PIN field with the reason beside it; the review uses plate styling from `DESIGN.md`, not a dark readout well.
- **CAP-6** Network is locked after step 1 (FR-91, FR-65)
  - **intent:** Network decides which later answers are legal, so it is chosen once, first, and never changed under answers already given.
  - **success:** Later steps and the review show Network as plain text with no Change action, and the review row says to go Back to step 1 to change it; changing Network on step 1 resets every later answer to its pre-selection (as changing Create or Import does) and a short polite status line on step 1 says the later questions start again; no answer is kept, reconciled or named; policy refuses any illegal combination at create as it does today.
- **CAP-7** Failed Node test stays put (FR-91, FR-61)
  - **intent:** A Node that fails its test is reported where the user chose it.
  - **success:** A rejected custom Node leaves the user on the Node step with the reason as text and the built-in Nodes selected; Next is not blocked by it, because the built-in Nodes remain the answer.
- **CAP-8** Phone, zoom and non-colour cues (FR-91, NFR-9)
  - **intent:** The quiz works on the narrowest supported screen and at 200% text without relying on colour.
  - **success:** At 320px, and separately at 200% zoom, no step clips or scrolls sideways and its actions stay reachable through the screen footer; `bun run check:contrast` passes; step position and unavailable-answer reasons are text.
- **CAP-9** Plain wording for the checks (FR-91)
  - **intent:** The two check questions use short, simple wording, and the same check is never named two ways in the app.
  - **success:** The Open Check question reads "Authentication required to open the wallet" with its no-check answer "No authentication required to open the wallet"; the Signing Check question reads "Authentication required to sign a transaction" with its Standard answer "Nothing is asked for signing."; the quiz, the Configure Checks plate and Edit checks all read the words from `check-words.ts`; no string says the app signs data; every new or changed sentence is under 21 words (a test checks it).

## Constraints

- The policy that decides which answers are legal (`describeOptions`, AD-28), creation, PIN entry, the Seed backup and the written-Seed confirmation are not changed; the quiz only changes how answers are asked.
- Every answer lives in the caller's state. No secret enters quiz state, URL or storage (NFR-2); a typed PIN stays in an uncontrolled input as today.
- The quiz renders the questions the policy lists, not a hard-coded seven. A question added or changed by the passkey-signing work (§4.14) appears without reworking the quiz.
- The Configure screen (FR-88) is not changed. Code check 2026-10-29: `WalletQuestions` is imported only by `CreateWalletFlow`, which `AddWalletScreen` (chooser) and `Onboarding` (first run) render.
- The quiz is identical wherever `CreateWalletFlow` renders: the chooser's add screen and first-run `Onboarding`, shortcut step included. Decided 2026-10-29.
- Back, Next and Create wallet sit in the sticky screen footer (`actionHost`), where Create wallet sits today.
- Wording follows ASD-STE100: short sentences, one idea each, simple verbs. The app signs transactions only (code check 2026-10-30: `writes.ts`), so no copy mentions data or message signing.
- The look stays inside the existing panel vocabulary of `DESIGN.md`. No new colour token.
- An unavailable answer is never hidden. A failed read is never shown as an empty one (PRD §9.1).

## Non-goals

- No new question, no changed pre-selection, no changed legality rule.
- No change to the Configure screen or to what Edit checks asks.
- No animation that carries meaning, no progress shown by colour alone.
- No change to how a Wallet is written, to PIN entry, or to the Seed backup.
- No custom-Node or Account Master Key behaviour beyond what FR-61 and FR-75 already say.

## Success signal

On a phone at 320px a user chooses Create or Import, then walks every question, reading each consequence where the choice is made, reviews the answers, and creates the Wallet. There is no shortcut and no Generate/Import switch after step 1, the previous form's duplicated Recommended list no longer exists, and every existing policy test still passes unchanged.

## Assumptions

- Open Check and auto-lock share one step, as FR-60 pairs them. Not chosen by the owner; settle in the UX pass.
- After **Change** on the review, Next returns to the review rather than replaying later steps. Not in the PRD.
- Existing tests that assume the single form (`create-wallet-flow.test.tsx` and its neighbours) are rewritten for the quiz; the policy tests are not.
