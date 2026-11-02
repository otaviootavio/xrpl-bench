---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-xrpl-wallet-2026-09-12/prd.md
  - _bmad-output/specs/spec-settings-split-by-owner/SPEC.md
  - _bmad-output/specs/spec-settings-split-by-owner/stories.yaml
  - _bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-chooser-2026-10-19/ARCHITECTURE-SPINE.md
---

# xrpl-wallet — Settings Split by Owner - Epic Breakdown

## Overview

This document provides the epic and story breakdown for making every setting either the Wallet's or XRPL Bench's, decomposing PRD FR-94 (and the planned-change notes on FR-13, FR-21, FR-45, FR-88, FR-89, FR-90 and FR-92), the SPEC capabilities CAP-1 to CAP-4, and the chooser architecture decisions AD-50 and AD-51 with the amended AD-32, AD-43, AD-44, AD-45 and AD-46. It is a separate file from `epics.md`, `epics-wallet-chooser.md`, `epics-passkey-signing.md`, `epics-create-wallet-quiz.md`, `epics-configure-owns-rename-remove.md` and `epics-one-network-per-wallet.md`, which are left untouched. Numbering continues after Epic 22. It supersedes the Configure screen and the app-level Settings tab inside a wallet (chooser stories 19.x), and the Configure key of Epic 21. The UX decisions were taken in an Impeccable shape pass on 2026-11-02 and are recorded in FR-94, so the spec and the PRD stand in for a UX design contract. The architecture change is recorded in the spine (AD-50, AD-51).

## Requirements Inventory

### Functional Requirements

New (PRD section 4.3):

FR-94: A setting belongs either to one Wallet or to the app as a whole, never both, and the words on screen say which. Inside a Wallet, the Wallet tab is that Wallet's own settings, headed "Settings for <name>" with its Network, in the order identity, Name, Address Book, Checks, Seed, Operating another account, Node, Two-device signing, Remove this wallet. The separate Configure screen and the header's Configure key are gone. On the chooser, the key "XRPL Bench" opens the app's settings: Version and updates and "All wallets on this device". The Address Book belongs to a Wallet. Inside a Wallet, the Wallets key carries the update marker. No backward compatibility.

Amended:

FR-13: removing a Wallet also removes that Wallet's Address Book entries, and the confirm step says so.
FR-21: the first-time-destination warning tests the sending Wallet's own Address Book.
FR-45: the Address Book belongs to a Wallet and is removed with it.
FR-88: the per-Wallet settings are the Wallet tab, not a separate Configure screen.
FR-89: the Address Book leaves the app's Settings, which is reached from the chooser only.
FR-90: the chooser key is "XRPL Bench"; inside a Wallet the Wallets key says "Wallets, update available".
FR-92: Rename and Remove are sections of the Wallet tab; no Configure header key.

Unchanged and relied on:

FR-83: leaving a Wallet keeps its lock open. FR-85, FR-86: the Rename and Remove rules and confirm bodies. FR-93: one Network per Wallet. FR-75, FR-77, FR-78: controlled accounts and two-device signing.

### NonFunctional Requirements

NFR-2: No secret is ever serializable; the Address Book holds no secret.
NFR-5: Nothing styles `:focus`; `outline-none` is banned.
NFR-6: Colour never carries meaning alone; `bun run check:contrast` is the gate; no new colour token.
NFR-8: Every bespoke component gets a keyboard-only and screen-reader pass.
NFR-9: 320px viewport and 200% zoom are supported; touch targets are at least 44px on coarse pointers.
Delivery: the four gates pass on every story; tests of removed behaviour are deleted or re-pointed, not left failing; the rule-guarding tests (AD-36, AD-50, AD-51) must fail if their rule is removed.

### Additional Requirements

- AD-51: the Wallet tab replaces the Configure screen; the configure route is retired with no alias; task screens return to the tab; the app-level settings render at `/settings` only.
- AD-50: the Address Book is `Record<walletId, entries>` in the same persisted slice, read in the wallet shell only; no list means the first-time warning shows; an old array is read as `{}`; `removeWalletData` deletes the key.
- AD-45 (amended): no Configure key; the Wallets key carries the update marker from `useUpdateMarker`.
- AD-46 (amended): `removeWalletData` removes that Wallet's Address Book in the same scope, in `finally`, without throwing.
- AD-48: no backward compatibility, no migration code.
- AD-36: the chooser reads no Address Book and makes no ledger read.

### UX Design Requirements

UX-DR1: The Wallet tab has a visible heading "Settings for <name>" with the Network beside it (Mainnet "Real funds", Devnet "Not stable"); the other tabs keep a screen-reader-only heading.
UX-DR2: One column, in the decided order, no jump list; Remove this wallet is last.
UX-DR3: The chooser's settings open with "These settings are for the whole app. Each wallet's own settings are inside that wallet."
UX-DR4: An Address Book over 10 entries shows the first 10 and "Show all N".
UX-DR5: Everything works at 320px and 200% text, with 44px touch targets on coarse pointers; no new colour token.

### FR Coverage Map

FR-94: Stories 23.1 to 23.3.
FR-88, FR-92: Story 23.1.
FR-13, FR-21, FR-45: Story 23.2.
FR-89, FR-90: Story 23.3.

## Epic List

### Epic 23: Settings split by owner
A user finds a wallet's settings inside that wallet and the app's settings on the chooser, and the words on screen say which. Remove all wallets is never next to Remove this wallet, and each wallet keeps its own Address Book.
**FRs covered:** FR-94, FR-13, FR-21, FR-45, FR-88, FR-89, FR-90, FR-92
**Stories (stories.yaml):** 1 to 3, as 23.1 to 23.3. No spec or done checkpoints (owner, 2026-11-02). Each story leaves the app working: 23.1 moves the wallet's settings into the Wallet tab while the Address Book is still the old global one on `/settings`, 23.2 makes the Address Book per Wallet, and 23.3 finishes the chooser's settings and moves the update marker.

## Epic 23: Settings split by owner

A setting is the Wallet's or XRPL Bench's, never both. The Wallet tab holds everything about one wallet; "XRPL Bench" on the chooser holds what belongs to the whole app.

### Story 23.1: The Wallet tab holds this wallet's settings

As a user inside a wallet,
I want its settings in one tab of that wallet,
So that I know they are this wallet's and I find them in one place.

**Acceptance Criteria:**

**Given** a wallet with its lock open
**When** the tab list renders
**Then** the sixth tab is "Wallet", in the same fixed order as the others, and the old Settings tab is gone (FR-94, FR-88, AD-51)

**Given** the Wallet tab
**When** it renders
**Then** it shows the visible heading "Settings for <name>" with the Network beside it (Mainnet "Real funds", Devnet "Not stable"), an identity plate, then Name, Checks, Seed, Operating another account, Node, Two-device signing and Remove this wallet last, in one column with no jump list (UX-DR1, UX-DR2)

**Given** the Wallet tab
**When** it is read
**Then** it shows no "Remove all wallets" and no Version and updates, and a test fails if it does (FR-94)

**Given** the Configure screen
**When** the app is searched for it
**Then** the screen, the route `/wallets/:id/configure` and the header's Configure key no longer exist, with no alias (AD-32, AD-45)

**Given** the user opens Edit checks, Let another wallet sign or Two-device signing from the tab
**When** they press Back
**Then** the key reads "Back to Wallet", the Wallet tab is shown again, and focus is on the key that opened the screen (AD-51)

**And** until story 23.2 the Address Book is still the old global one, reached only from `/settings`, and the plate tests that mounted the Configure screen are re-pointed to the tab, not deleted

### Story 23.2: The Address Book belongs to a Wallet

As a user sending payments,
I want each wallet to keep its own sent addresses,
So that one wallet's recipients never change another wallet's first-time warning.

**Acceptance Criteria:**

**Given** a payment sent from a wallet
**When** it is submitted
**Then** its recipient is saved in that wallet's Address Book only (FR-45, AD-50)

**Given** an address another wallet has paid
**When** the user sends to it from a wallet that has not
**Then** the "you haven't sent here before" step shows (FR-21)

**Given** a wallet with no list, or a store not yet read
**When** the user starts a send
**Then** the first-time warning shows (AD-50)

**Given** a device that holds the old array-shaped book
**When** the app starts
**Then** the old book is read as empty, and startup does not fail (AD-50, AD-48)

**Given** the Wallet tab
**When** it renders
**Then** the Address Book plate sits after Name and shows only that wallet's addresses, the first 10 and "Show all N" beyond that (UX-DR4), and the app's `/settings` no longer shows an Address Book

**Given** the user removes a wallet
**When** the removal finishes
**Then** that wallet's Address Book entries are gone, the "Remove this wallet" plate named the wallet and its Address Book beforehand, and Remove all clears every entry (FR-13, AD-46)

**And** a controlled Wallet has its own book, tests fail if another wallet's entries are read or silence the warning, and the chooser reads no Address Book (AD-36)

### Story 23.3: XRPL Bench's settings and the update marker on the Wallets key

As a user,
I want the app's own settings in one place on the chooser,
So that Remove all wallets and updates are never mixed with a wallet's settings.

**Acceptance Criteria:**

**Given** the chooser
**When** it renders
**Then** the settings key reads "XRPL Bench", and its page is headed "XRPL Bench settings" and opens with "These settings are for the whole app. Each wallet's own settings are inside that wallet." (FR-89, UX-DR3)

**Given** the XRPL Bench settings
**When** they render
**Then** they hold Version and updates and one plate "All wallets on this device" with the action "Remove all wallets from this device", stating how many wallets go and that the App PIN goes too, and nothing per wallet, and a test fails if an Address Book or a per-wallet control renders

**Given** an update is waiting and not declined
**When** the user is inside a wallet
**Then** the header's Wallets key reads "Wallets, update available" in its accessible name and shows the lamp, from the one shared `useUpdateMarker`, and the Wallet tab carries no marker (FR-90, AD-45)

**Given** an update is waiting
**When** the user is inside a wallet
**Then** no control applies it; applying an update is possible only in the XRPL Bench settings, with its in-flight-transaction guard

**Given** the first-run Onboarding
**When** it renders the Remove all plate
**Then** its wording still reads correctly there

**And** the count shown is a device read with no ledger read, a declined release lights neither marker, and everything works at 320px and 200% text with 44px targets and no new colour token (UX-DR5)
