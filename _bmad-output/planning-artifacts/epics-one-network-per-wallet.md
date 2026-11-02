---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-xrpl-wallet-2026-09-12/prd.md
  - _bmad-output/specs/spec-one-network-per-wallet/SPEC.md
  - _bmad-output/specs/spec-one-network-per-wallet/stories.yaml
  - _bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-chooser-2026-10-19/ARCHITECTURE-SPINE.md
---

# xrpl-wallet — One Network per Wallet - Epic Breakdown

## Overview

This document provides the epic and story breakdown for making a Wallet one address on one Network for life, decomposing PRD FR-93 (and the planned-change notes on FR-38, FR-61, FR-81, FR-82, FR-85, FR-86, FR-87, FR-88 and FR-92), the SPEC capabilities CAP-1 to CAP-5, and the chooser architecture decisions AD-47, AD-48 and AD-49 with the amended AD-36, AD-39 and AD-43. It is a separate file from `epics.md`, `epics-wallet-chooser.md`, `epics-passkey-signing.md`, `epics-create-wallet-quiz.md` and `epics-configure-owns-rename-remove.md`, which are left untouched. Numbering continues after Epic 21. It supersedes the network rows, "Other networks" and the name-only locked card built in chooser stories 17.x to 19.x, and narrows the duplicate check of AD-39. There is no UX design contract: the spec stands in for it. The architecture change is recorded in the spine (AD-47 to AD-49).

## Requirements Inventory

### Functional Requirements

New (PRD section 4.3):

FR-93: A Wallet is one address on one Network for life. The Network cannot change after creation: no switch, no "add a network", no "Other networks" in Configure. Each Wallet has its own lock, Open Check and auto-lock, and a closed lock asks its own Open Check. The chooser card shows name, address and Network, with "Real funds" on Mainnet. The same Seed can be two Wallets on two Networks, with no flow and no shortcut for it; the same address on the same Network is refused. A Mainnet Import states one neutral fact on the Review step and blocks nothing. No backward compatibility. Controlled accounts and two-device signing are unchanged.

Amended:

FR-38: there is no Network switch. (Code check 2026-11-02: no app-wide Network switch exists in `src`, so this ends by 22.2 deleting "Other networks".)
FR-61: a Wallet has exactly one Network, fixed at creation; the Node can still be changed.
FR-81: a card, locked or open, shows name, address and Network; nothing else while locked.
FR-82: after unlocking, the user enters that Wallet; no return to the chooser to pick a network.
FR-85, FR-86: Rename and Remove act on one Wallet; the sibling-network confirm body ends, and stays for a controlled account.
FR-87: the import refusal narrows to the same address on the same Network.
FR-88, FR-92: no "Other networks" section.

Unchanged and relied on:

FR-65: Mainnet floor and policy. FR-83: leaving a Wallet keeps its lock open. FR-75, FR-77, FR-78: controlled accounts and two-device signing. FR-91: the quiz.

### NonFunctional Requirements

NFR-2: No secret is ever serializable; the Seed stays a parameter to the keystore.
NFR-5: Nothing styles `:focus`; `outline-none` is banned.
NFR-6: Colour never carries meaning alone; `bun run check:contrast` is the gate; no new colour token.
NFR-8: Every bespoke component gets a keyboard-only and screen-reader pass.
NFR-9: 320px viewport and 200% zoom are supported; touch targets are at least 44px on coarse pointers.
Delivery: the four gates pass on every story; tests of removed behaviour are deleted or re-pointed, not left failing; the rule-guarding tests (AD-36, AD-39, AD-43, AD-47) must fail if their rule is removed.

### Additional Requirements

- AD-47: a Wallet has one Network for life; storage stays "Seed record plus views"; `addNetworkView` and "Other networks" are deleted; views remain only to carry a controlled account.
- AD-43 (amended): `listWalletCards` replaces `groupWalletsBySeed`; one card per Wallet; the locked variant carries `walletId`, `lockId`, `label`, `address` and `network` only.
- AD-36 (amended): the chooser still makes no ledger read; address and Network are device reads.
- AD-39 (amended) and AD-49: the duplicate key is `(keyAddress, network)`, checked before any prompt, lock write or ledger read; the step-1 probe takes the chosen Network.
- AD-48: no migration, no reset screen, no handling of an old multi-network record.
- No keystore rewrite. The policy, the Mainnet floor, the lock model, PIN entry and the Seed backup are not changed.

### UX Design Requirements

UX-DR1: A card, locked or open, shows name, address and Network in words; Mainnet "Real funds" and Devnet "Not stable" are words, not colour alone.
UX-DR2: One card per Wallet; no network rows; the card keeps its one-row layout, accessible names and 44px keys.
UX-DR3: The Mainnet Import sentence sits beside "Real funds" on the Review step, in plate styling, and is under 21 words.
UX-DR4: Everything works at 320px and 200% text, with no new colour token.

### FR Coverage Map

FR-93: Stories 22.1 to 22.5.
FR-87: Story 22.1.
FR-38, FR-61, FR-85, FR-86, FR-88, FR-92: Story 22.2.
FR-81: Story 22.3.
FR-82: Story 22.4.

## Epic List

### Epic 22: One network per Wallet
A user sees which Network a Wallet is on before opening it, opens exactly that Wallet, and can no longer switch it between Testnet and Mainnet. A Mainnet Wallet is a different Wallet, made by the normal creation flow.
**FRs covered:** FR-93, FR-38, FR-61, FR-81, FR-82, FR-85, FR-86, FR-87, FR-88, FR-92
**Stories (stories.yaml):** 1 to 5, as 22.1 to 22.5. No spec or done checkpoints (owner, 2026-11-02). Each story leaves the app working: 22.1 and 22.2 change the rules while the cards still group by Seed, 22.3 changes the cards, 22.4 changes what Open does, and 22.5 adds the Import sentence.

## Epic 22: One network per Wallet

A Wallet is one address on one Network for life. The chooser says which Network before it opens, and Open enters that Wallet. The same Seed can be two Wallets on two Networks, but nothing in the app makes that the natural path.

### Story 22.1: The duplicate key is address plus Network

As a user importing a Seed,
I want the app to refuse only the same address on the same Network,
So that I can hold one Seed as two Wallets on two Networks, and never one Account twice on one Network.

**Acceptance Criteria:**

**Given** a Seed whose address is already on the device on the same Network
**When** the user imports it
**Then** it is refused before any prompt, lock write or ledger read, with a reason that names the Network and points nowhere (FR-87, AD-39)

**Given** the same Seed on a different Network
**When** the user imports it
**Then** it is allowed as its own Wallet with its own record, ciphertext and lock (FR-93)

**Given** the user is on quiz step 1
**When** the Seed is typed, and again when the Network changes
**Then** the duplicate probe runs with the Network chosen on that step (AD-49)

**And** a test fails if the Network is dropped from the key; the old reason that points to "Other networks" no longer exists

### Story 22.2: A Wallet has one Network for life

As a user,
I want a Wallet to keep its Network,
So that a Mainnet Wallet can never become a Testnet one, or the other way, by a setting.

**Acceptance Criteria:**

**Given** a Wallet's Configure screen
**When** it renders
**Then** there is no "Other networks" section and no key to add or switch a Network (FR-61, FR-88, FR-93)

**Given** creation or import
**When** the Wallet is written
**Then** exactly one view is written, with the Network chosen on quiz step 1, and no function changes a view's Network afterwards (AD-47)
**And** a test fails if a record is written with two views that both lack `accountAddress`

**Given** Rename or Remove on a Wallet
**When** the user uses them
**Then** they act on one Wallet, and the "sibling network view stays" confirm body shows only for a controlled account (FR-85, FR-86)

**And** `addNetworkView` and the tests of "Other networks" are deleted or re-pointed, controlled accounts and two-device signing are not touched, and the keystore is not rewritten

### Story 22.3: One card per Wallet with name, address and Network

As a user choosing a wallet,
I want each card to show its name, address and Network,
So that I know which Network I am about to enter before I open it.

**Acceptance Criteria:**

**Given** any Wallet, locked or open
**When** its card renders
**Then** it shows name, address and Network, with "Real funds" on Mainnet and "Not stable" on Devnet as words (FR-81, UX-DR1)

**Given** a Seed with more than one view
**When** the chooser lists it
**Then** each Wallet is its own card and there are no network rows (AD-43, UX-DR2)

**Given** a locked card
**When** its type is read
**Then** it holds only `walletId`, `lockId`, `label`, `address` and `network`, so no Node, check kind or balance can render

**Given** the chooser
**When** it mounts with several open locks
**Then** the query cache is empty and no ledger client is made (AD-36), and every address renders through `AddressLink` with the card's own `network`

**And** `listWalletCards` replaces `groupWalletsBySeed`, `walletIdsInChooserOrder` and `nextActiveWalletId` keep their rules, the polished card layout keeps its rules (accessible names, 44px keys, `aria-current`, no new token), and a test fails if the locked card is given a Node, check kind or balance

### Story 22.4: Open enters that Wallet

As a user,
I want Open to enter the Wallet I chose,
So that I am never dropped on a selector after unlocking.

**Acceptance Criteria:**

**Given** a card whose lock is closed
**When** the user presses Open and passes its Open Check
**Then** the app enters that Wallet (FR-82, AD-43)

**Given** a card whose lock is open
**When** the user presses Open
**Then** the app enters that Wallet directly (FR-82, FR-83)

**Given** a Seed with several views
**When** a lock is opened
**Then** the app does not return to the chooser to pick a network, and no entry-view rule remains

**Given** a controlled Wallet
**When** it is opened
**Then** it opens through its key-holder's lock, as built

**And** Open and Configure carry one `walletId`, and the unlock tests are updated for the deleted return

### Story 22.5: Mainnet Import states one neutral fact

As a user importing a Seed on Mainnet,
I want to be told once that the same key works on Mainnet,
So that I know a Seed I used on another Network is the same key here.

**Acceptance Criteria:**

**Given** an Import with Mainnet chosen
**When** the Review step renders
**Then** it shows "A Seed you used on another Network is the same key on Mainnet." beside "Real funds" (FR-93, UX-DR3)

**Given** the sentence
**When** the user presses Import wallet
**Then** nothing blocks, and the sentence is not an input to `checkWalletRequest` (AD-49)

**Given** Create, or Import on Testnet or Devnet
**When** the Review step renders
**Then** the sentence does not show

**And** the sentence lives in `check-words.ts` with the other plain wording and is under 21 words; the release note says older multi-network wallets are not supported (AD-48), and that line is reported to the owner because the release note is not in the repository
