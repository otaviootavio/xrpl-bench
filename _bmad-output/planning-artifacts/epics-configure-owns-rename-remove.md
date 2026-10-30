---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-xrpl-wallet-2026-09-12/prd.md
  - _bmad-output/specs/spec-configure-owns-rename-remove/SPEC.md
  - _bmad-output/specs/spec-configure-owns-rename-remove/stories.yaml
  - _bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-chooser-2026-10-19/ARCHITECTURE-SPINE.md
---

# xrpl-wallet — Configure Owns Rename and Remove - Epic Breakdown

## Overview

This document provides the epic and story breakdown for moving Rename and Remove from the chooser cards to the Wallet's Configure screen, decomposing PRD FR-92 (and the planned-change notes on FR-85, FR-86 and FR-88), the SPEC capabilities CAP-1 to CAP-4, and the chooser architecture rules that move unchanged (AD-33, AD-41, AD-42, AD-43, AD-46). It is a separate file from `epics.md`, `epics-wallet-chooser.md`, `epics-passkey-signing.md` and `epics-create-wallet-quiz.md`, which are left untouched. Numbering continues after Epic 20. It supersedes the card Rename, Remove and Configure built in chooser stories 18.1, 18.2 and 19.1. There is no UX design contract: the spec stands in for it, and the architecture is unchanged because the rules move and do not change.

## Requirements Inventory

### Functional Requirements

New (PRD section 4.3):

FR-92: A chooser card has two actions at most: Open, and Lock while its lock is open; no Configure, Rename or Remove. Configure is reached from the Wallet's header, inside the Wallet. Rename and Remove are sections of Configure with their existing rules. A locked card shows its name and nothing else, with Open. Removing the last Wallet still returns the app to first run and deletes the App PIN.

Amended:

FR-85: rename moves from the chooser card to the Configure screen; the name rule is unchanged (1 to 40 characters, unique ignoring case among other Seeds, no lock, no ledger, a failed write keeps the typed name).
FR-86: remove moves from the chooser card to the Configure screen; the three confirm bodies, the call-time lock re-check and the last-wallet App PIN deletion are unchanged.
FR-88: Configure is reached from the Wallet's header only, and also holds Rename and Remove.

Unchanged and relied on:

FR-81: a locked card shows its name and nothing else.
FR-84: Lock from an open card.
FR-13: removing the last Wallet deletes the App PIN.
FR-89: Remove all, in Settings, is unchanged.

### NonFunctional Requirements

NFR-2: No secret is ever serializable; a name is not a secret, but teardown on removal clears the Wallet's persisted state.
NFR-5: Nothing styles `:focus`; `outline-none` is banned.
NFR-6: Colour never carries meaning alone; `bun run check:contrast` is the gate; no new colour token.
NFR-7: Every irreversible action states its exact consequence (Remove, and the last-wallet Remove naming the App PIN).
NFR-8: Every bespoke component gets a keyboard-only and screen-reader pass.
NFR-9: 320px viewport and 200% zoom are supported; touch targets are at least 44px on coarse pointers.
NFR-10: Motion respects `prefers-reduced-motion`.
Delivery: the four gates pass on every story; the rename and remove tests are re-pointed to Configure, not deleted, and the rule-guarding ones (AD-41, AD-42, AD-46) must still fail if their rule is removed.

### Additional Requirements

- AD-33: one unwind, `leaveToChooser()`; a removal inside Configure returns through it.
- AD-41/42: Rename is one write to the Seed record (no rev bump, no lock); one pure name rule in `lib/wallet-name.ts`.
- AD-43: `groupWalletsBySeed`, a discriminated union; the locked variant carries a name only, so no control can read more.
- AD-46: Remove re-checks its lock at call time; `removeWalletData` teardown scope, run in `finally`; the last wallet returns to Onboarding and deletes the App PIN atomically with the emptiness check and with create and import.
- AD-16: teardown through `lib/teardown.ts`.
- No architecture change. The rules move to a new surface. Configure (FR-88) already resolves only with the lock open.
- The quiz (Epic 20) is not changed by this epic.

### UX Design Requirements

UX-DR1: Configure shows a Name section, first in its order, using `ConfigPlate`.
UX-DR2: Configure shows a Remove section, last in its order, using `ConfigPlate`.
UX-DR3: A short confirm may stay a dialog (the existing Rename and Remove dialogs); focus returns to the section that opened it.
UX-DR4: An open card shows Open and Lock only; a locked card shows its name, the Locked word and Open only.
UX-DR5: Everything works at 320px and 200% text, with 44px touch targets on coarse pointers; no new colour token.

### FR Coverage Map

FR-92: Stories 21.1 to 21.3.
FR-85: Story 21.1.
FR-86: Story 21.2.
FR-88: Story 21.3.
FR-81: Story 21.3.

## Epic List

### Epic 21: Configure owns Rename and Remove
A user renames and removes a Wallet from inside it, on its Configure screen, with the guards those actions already have. The chooser is left to choose and lock: a card shows Open, and Lock while open, and nothing else.
**FRs covered:** FR-92, FR-85, FR-86, FR-88, FR-81
**Stories (stories.yaml):** 1 to 3, as 21.1 to 21.3. No spec or done checkpoints (owner, 2026-10-30). Each story leaves the app working: 21.1 and 21.2 add the sections while the cards still carry the old controls, and 21.3 removes them.

## Epic 21: Configure owns Rename and Remove

A user renames and removes a Wallet from its Configure screen. Rename and Remove keep every rule and guard they have today. The chooser cards lose Configure, Rename and Remove in the last story.

### Story 21.1: Rename is a section of Configure

As a user inside a wallet,
I want to rename it from its Configure screen,
So that its name sits with the rest of what belongs to that wallet.

**Acceptance Criteria:**

**Given** the user opens Configure
**When** it renders
**Then** it shows a Name section first, in `ConfigPlate` styling (FR-92, UX-DR1)

**Given** the user saves a name of 1 to 40 characters that is unique, ignoring case, among other Seeds
**When** Save is pressed
**Then** the Seed record is written without a `rev` bump or a lock prompt, and every row of that Seed shows the new name (FR-85, AD-41, AD-42)
**And** nothing is sent to the ledger

**Given** a name that is empty, over 40 characters, or the same as another Seed's name ignoring case
**When** the user tries to save
**Then** the existing reason shows as text and nothing is written

**Given** the write fails
**When** Save is pressed
**Then** the user is told nothing changed and the typed name is kept (FR-85)

**Given** the dialog or screen closes
**When** focus returns
**Then** it returns to the Name section (UX-DR3)

**And** the card's own Rename still works until story 21.3, and the rename tests keep passing; a test fails if the unique-name rule is removed

### Story 21.2: Remove is a section of Configure

As a user inside a wallet,
I want to remove it from its Configure screen,
So that the one destructive action sits where its consequences are explained, away from Open.

**Acceptance Criteria:**

**Given** the user opens Configure
**When** it renders
**Then** it shows a Remove section last, in `ConfigPlate` styling (FR-92, UX-DR2)

**Given** the user starts a removal
**When** the confirm renders
**Then** it uses the sibling-view, sole-view or last-wallet body, naming exactly what is lost, and the last-wallet body names the App PIN (FR-86, NFR-7)

**Given** the lock closed after Configure opened
**When** Remove is activated anyway
**Then** the lock is re-checked at call time and the removal is refused (AD-46)

**Given** the user confirms
**When** removal runs
**Then** teardown runs through `lib/teardown.ts` in `finally`, `activeWalletId` never names a removed wallet, and the app returns through `leaveToChooser()` with focus on the chooser heading (AD-33, AD-46, AD-16)

**Given** the Wallet removed is the last one on the device
**When** removal finishes
**Then** the app returns to first run and the App PIN and its failure count are deleted atomically with the emptiness check (FR-13, AD-46)

**And** the chooser card's own Remove still works until story 21.3, Remove all in Settings is unchanged, and a test fails if the call-time lock re-check is removed

### Story 21.3: Chooser cards show only Open and Lock

As a user choosing a wallet,
I want each card to offer Open and Lock only,
So that the chooser stays simple and I cannot remove a wallet by mistake.

**Acceptance Criteria:**

**Given** an open card
**When** it renders
**Then** it shows Open and Lock, and no Configure, Rename or Remove (FR-92, UX-DR4)

**Given** a locked card
**When** it renders
**Then** it shows its name, the Locked word and Open, and nothing else (FR-81, AD-43)
**And** the "Open this wallet to remove it" text no longer exists

**Given** the user is inside a wallet
**When** they press the header's Configure key
**Then** Configure opens, Back returns to the wallet, and no chooser card links to it (FR-88, FR-92)

**Given** Configure is requested while the lock is closed
**When** the route resolves
**Then** the app returns to the chooser, as today (FR-88)

**Given** Configure with its Name and Remove sections
**When** it is viewed at 320px, and separately at 200% zoom
**Then** nothing clips or scrolls sideways, touch targets are at least 44px on coarse pointers, and no new colour token is used (UX-DR5, NFR-9, NFR-6)

**And** the card tests that only checked the three controls are deleted, the rename and remove rule tests live on the Configure surface, and a screen test fails if any of the three controls renders on a card
