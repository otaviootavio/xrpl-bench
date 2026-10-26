---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - _bmad-output/specs/spec-wallet-chooser/SPEC.md
  - _bmad-output/specs/spec-wallet-chooser/stories.yaml
  - _bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-chooser-2026-10-19/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-10-19/EXPERIENCE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-10-19/DESIGN.md
---

# xrpl-wallet — Wallet Chooser — Epic Breakdown

## Overview

This document decomposes `_bmad-output/specs/spec-wallet-chooser/SPEC.md` (CAP-1
to CAP-14) into one epic and seventeen stories, using the chooser architecture
spine (AD-31 to AD-46) and the UX spine (`EXPERIENCE.md`, `DESIGN.md`).

It is a **separate file** from `epics.md` and `epics-passkey-signing.md`, which
are left untouched. Numbering continues from Epic 17, because the tracker ends
at Epic 16. Story numbers 17.1 to 17.17 are the SPEC's `stories.yaml` ids 1 to 17,
in the same order.

The acceptance criteria below are the SPEC's `success:` lines for each
capability, split across the stories that carry it. If a criterion here and the
SPEC disagree, the SPEC wins.

**Every story, when built:** read `CLAUDE.md`, `DESIGN.md`, `docs/agents/INDEX.md`
and `docs/agents/verifying-your-work.md` first; fetch `origin/dev` before
starting; run the four gates (`bun run lint`, `bun run build`, `bun run test`,
`bun run check:contrast`); where UI changes, do a browser pass at 320, 390 and
desktop widths in both themes; stage by explicit path only.

## Requirements Inventory

### Capabilities (SPEC)

CAP-1: Chooser as first screen (AD-32, AD-36, AD-43)
CAP-2: Gate error state (AD-37)
CAP-3: Open a wallet (AD-34, AD-43, AD-32)
CAP-4: Leave a wallet (AD-33, AD-38, AD-34)
CAP-5: One card per Seed, locked card name only (AD-43, AD-26, AD-36)
CAP-6: Rename (AD-41, AD-42)
CAP-7: Remove (AD-46, AD-16)
CAP-8: Add wallet, Generate or Import (AD-39, AD-40, AD-28)
CAP-9: Per-wallet Configure screen (AD-32, AD-44)
CAP-10: Auto-lock in the Checks plate (AD-44, AD-28)
CAP-11: App-level Settings (AD-44, AD-45, AD-46)
CAP-12: Header split, Lock, update marker (AD-45, AD-33)
CAP-13: Activity timer scoping and lifecycle (AD-31, AD-35)
CAP-14: Lock from an open card (AD-45, AD-38)

### Constraints that bind every story

- No secret in `localStorage`, React state, a store, the URL or anything serializable. A Seed lives in a ref, goes to keystore only, and is cleared in `finally`.
- A locked wallet is its name and nothing else: no address, network, Node or check kind, and no hook reads for it.
- The chooser side mounts no ledger read and no account-scoped key.
- A failed read is never rendered as empty or current and never relaxes a guard. `aria-disabled` is presentation; the handler re-checks.
- Every lock close, leave and remove goes through `lib/teardown.ts`.
- Money stays strings or `BigInt`. The chooser shows no balance.
- Touch targets are at least 44px on coarse pointers. Nothing styles `:focus`; `outline-none` is banned. Colour never carries meaning alone.
- Each of AD-31, AD-35, AD-36, AD-37 and AD-39 gets a test that fails when the rule is removed.

## Coverage Map

CAP-1: Epic 17 - Stories 17.2, 17.5
CAP-2: Epic 17 - Story 17.1
CAP-3: Epic 17 - Story 17.5
CAP-4: Epic 17 - Stories 17.2, 17.6
CAP-5: Epic 17 - Stories 17.4, 17.5
CAP-6: Epic 17 - Story 17.9
CAP-7: Epic 17 - Story 17.10
CAP-8: Epic 17 - Stories 17.11, 17.12, 17.13
CAP-9: Epic 17 - Stories 17.14, 17.15
CAP-10: Epic 17 - Story 17.16
CAP-11: Epic 17 - Stories 17.7, 17.17
CAP-12: Epic 17 - Stories 17.6, 17.7
CAP-13: Epic 17 - Story 17.3
CAP-14: Epic 17 - Story 17.8

## Epic List

### Epic 17: Open, name, add and configure wallets from a chooser
The app opens on a chooser with one card per Seed. A user can open, leave, lock, rename, remove and add wallets from it, and configure each wallet on its own screen, while Settings holds only what belongs to the app. A locked card shows a name and nothing else.
**Capabilities covered:** CAP-1 to CAP-14
**Stories (stories.yaml):** 1 to 17. Spec checkpoint on stories 17.1, 17.3, 17.9, 17.10 and 17.12. Done checkpoint on stories 17.6, 17.13 and 17.17. **Stories 17.5 and 17.6 merge to `dev` together.**

## Epic 17: Open, name, add and configure wallets from a chooser

The app opens on a chooser with one card per Seed. A user can open, leave, lock, rename, remove and add wallets from it, and configure each wallet on its own screen, while Settings holds only what belongs to the app. A locked card shows a name and nothing else.

### Story 17.1: Gate: error, empty, ready

As a user opening the app,
I want a failed read of my wallets to say so and offer Retry,
So that a read error is never mistaken for a first run or an empty chooser.

**Acceptance Criteria:**

**Given** the vault read or persisted-state hydration rejects
**When** the gate resolves
**Then** it renders `The wallets on this device could not be read. Nothing was changed.` with Retry
**And** it mounts neither Onboarding nor the app shell, and calls no store setter (AD-37)

**Given** the error state is showing
**When** the user presses Retry and the read now succeeds
**Then** the gate reaches the chooser, or Onboarding if the read succeeded with zero wallets

**Given** the rule that blocks Onboarding on a failed read is removed
**When** the tests run
**Then** at least one test fails

*Checkpoints:* spec review before work starts.

### Story 17.2: Route module: chooser route and unwind

As a user on a phone with no Back button,
I want every cold start to land on the chooser and Back to behave predictably,
So that I never get stuck in a wallet screen or bounce between two entries.

**Acceptance Criteria:**

**Given** the app is cold-started at any path
**When** `rewriteBootLocation` runs before first render
**Then** the location is `/` and the chooser is the first screen (AD-32)

**Given** the user is in a wallet and calls `leaveToChooser`
**When** history depth state says an entry can be unwound
**Then** the app lands on the chooser without Back ping-pong (AD-33)

**And** the Route type, `isWalletScreen`, `rewriteBootLocation` and the history depth state are pure and unit-tested
**And** the old `home` route is retired

### Story 17.3: App shell and activity scoping

As a user with several wallets,
I want only the wallet I am inside to count my activity, and locks to expire wherever I am,
So that browsing the chooser never keeps a lock open and a lock never outlives its timer.

**Acceptance Criteria:**

**Given** the app shell is mounted
**When** the route changes between chooser and wallet screens
**Then** `useAutoLock` and `useClearCacheOnLock` stay mounted once, above the route switch (AD-31)

**Given** `touchLock(null)` or activity on the chooser
**When** it is called
**Then** it extends no expiry, no timer and no persisted session (AD-35)

**Given** the app is backgrounded or a lock expires while the chooser shows
**When** the timer fires
**Then** the lock closes

**And** notices are scoped to the entered wallet, through `enteredWalletId`, `touchLock(entered)` and `enterWallet` (AD-34)
**And** tests for AD-31 and AD-35 fail when either rule is removed

*Checkpoints:* spec review before work starts.

### Story 17.4: Seed grouping selector

As a user whose wallets share a Seed,
I want them to appear as one card,
So that the chooser matches how my keys actually relate.

**Acceptance Criteria:**

**Given** a list of wallets
**When** `groupWalletsBySeed` runs
**Then** it returns one group per Seed, ordered by Seed `createdAt`, and the order never changes with lock state (AD-43)

**Given** a group whose lock is closed
**When** its card type is built
**Then** the type has a name and no address, network, Node or check-kind field

**And** the selector is pure and covered by unit tests only

### Story 17.5: Chooser screen and Open

As a user,
I want to see my wallets as cards and open one,
So that I choose a wallet before anything about it is read.

**Acceptance Criteria:**

**Given** several locks are open
**When** the chooser mounts
**Then** the query cache stays empty, `getXrplClient` is never called and no balance appears (AD-36)

**Given** a locked card
**When** it renders
**Then** it shows the name, the `Locked` lamp and word, and `Locked.`, and nothing else

**Given** an open card
**When** it renders
**Then** each row shows the network word, its stamp (`Real funds` or `Not stable`) and an `AddressLink` with an explicit network

**Given** Open on a locked card
**When** the user unlocks
**Then** a single-view Seed lands in its shell, and a multi-view Seed returns to the chooser with the card open
**And** a network row opens exactly its view, and a Mainnet view is never entered by default

**And** the chooser becomes the landing screen

*Release pairing:* stories 17.5 and 17.6 merge to `dev` together. A phone PWA has no Back, so the chooser must not ship without the Wallets key.

### Story 17.6: Wallet header: Wallets key, picker removed

As a user inside a wallet,
I want a Wallets key that takes me back to the chooser without closing my lock,
So that I can switch wallets and still lock when I choose.

**Acceptance Criteria:**

**Given** the user is in a wallet
**When** they press the Wallets key or browser Back
**Then** they land on the chooser with focus on the `Wallets` h1, the wallet's lock stays open, its account-scoped query data is removed, and its notices clear (AD-33, AD-38)

**Given** a screen that blocks leaving
**When** the header renders
**Then** the Wallets key is `aria-disabled` with the reason visible

**Given** a wallet header for an open lock
**When** it renders
**Then** it shows the Wallets key, `NetworkPlate`, Configure, and Lock when the Open Check is not `none`; a locked wallet's header is the Wallets key alone (AD-45)

**Given** the user presses Lock in the wallet header
**When** it runs
**Then** `tearDownLock` runs and then `leaveToChooser()`

**And** the wallet picker Select is removed
**And** `docs/decisions.md` 6.12 records the picker's removal

*Release pairing:* merges to `dev` together with story 17.5.
*Checkpoints:* review after it is done, with a real-browser check of chooser, Open, leave and Lock.

### Story 17.7: Chooser Settings key, /settings, update marker

As a user at the chooser,
I want a Settings key that reaches app-level settings and tells me when an update waits,
So that I can reach Remove all and updates even with no wallet open.

**Acceptance Criteria:**

**Given** the chooser header
**When** it renders
**Then** it shows the nameplate and a Settings key

**Given** an update is waiting
**When** the chooser renders
**Then** the Settings key reads `Settings, update available`, never as a modal or redirect, and a declined release does not relight it

**Given** `/settings` and the in-wallet Settings tab
**When** either is shown
**Then** one component serves both and never both are mounted (AD-45)

**Given** no wallet exists and no lock is open, including for a hard-locked user
**When** the user opens Settings
**Then** Remove all wallets from this device works (AD-46)

**And** Settings content is unchanged for now; the trim is story 17.17

### Story 17.8: Lock key on open cards

As a user,
I want to lock a wallet from its card without entering it,
So that I can close a lock I left open.

**Acceptance Criteria:**

**Given** an open card whose Open Check is not `none`
**When** the user presses Lock
**Then** that card, and any card on the same lock with a note naming them, flips to Locked in place through `tearDownLock`, announced in a polite live region (AD-45, AD-38)

**Given** an open card with Open Check `none`
**When** it renders
**Then** the line `No Open Check: this wallet opens itself, so there is nothing to lock.` is visible

### Story 17.9: Rename

As a user,
I want to give a wallet a name I recognise,
So that I can tell my cards apart.

**Acceptance Criteria:**

**Given** the Rename dialog
**When** the user types a name
**Then** it accepts 1 to 40 code points, unique case-insensitively among other Seeds, and shows the UX strings (AD-42)

**Given** a valid name
**When** the user presses Save
**Then** the Seed record is written without bumping `rev` or asking a lock, every row of the card shows the new name, and nothing reaches the ledger (AD-41)

**Given** the write fails
**When** Save returns
**Then** `Could not rename the wallet. Nothing was changed.` shows and the dialog stays open

**And** the name rule lives only in `lib/wallet-name.ts`; existing duplicates are grandfathered; no copy promises a passkey's authenticator name changes

*Checkpoints:* spec review before work starts.

### Story 17.10: Remove from the chooser

As a user,
I want to remove one wallet from the chooser,
So that I can retire a wallet without wiping the device.

**Acceptance Criteria:**

**Given** a locked card
**When** it renders
**Then** Remove shows `Open this wallet to remove it.`

**Given** Remove is invoked with the wallet's lock closed, even if `aria-disabled` was bypassed
**When** the handler runs
**Then** it re-checks at call time and refuses (AD-46)

**Given** an open card
**When** the user presses Remove
**Then** the dialog uses the sibling-view, sole-view or last-wallet body, and teardown goes through `lib/teardown.ts`

**And** `activeWalletId` never names a removed wallet
**And** removing the last wallet returns to Onboarding
**And** Settings' own Remove stays until story 17.17

### Story 17.11: Add wallet at the app shell, Generate

As a user at the chooser,
I want to add a wallet even when every lock is closed,
So that adding never forces me to open another wallet first.

**Acceptance Criteria:**

**Given** the per-wallet creation questions
**When** they are used
**Then** one extracted component serves them, at `/wallets/new` mounted at the app shell (AD-40)

**Given** every lock is closed
**When** the user generates a wallet
**Then** creation works, never selects the wallet and never enters it

**Given** creation succeeds
**When** the chooser shows
**Then** the new card is present, focus is on its h2, and `Wallet added.` is announced

### Story 17.12: Keystore importStoredWallet and policy

As a user importing a Seed,
I want the import to follow the same policy as Generate,
So that Import is never a weaker way in.

**Acceptance Criteria:**

**Given** an import
**When** `keystore.importStoredWallet` runs
**Then** it creates its own lock and Open Check, refuses Open Check `none` on every network, applies the Mainnet floor and the written-Seed confirm (AD-39, AD-28)

**Given** a Seed whose address already exists on the device
**When** import is attempted
**Then** it is refused before any prompt or ledger read

**Given** a failure partway
**When** the import aborts
**Then** the new lock is rolled back

**And** a test shows no chooser-side code calls `importAndStoreWallet`
**And** the Seed is a parameter only, held in a ref, and cleared in `finally`
**And** there is no UI in this story

*Checkpoints:* spec review before work starts. Security-bearing.

### Story 17.13: Add wallet, Import UI

As a user,
I want to import a Seed from the chooser,
So that I can bring an existing wallet in under its own lock.

**Acceptance Criteria:**

**Given** the Import form
**When** it is submitted
**Then** it calls `importStoredWallet` using the shared questions component and the written-Seed confirm (AD-39, AD-40)

**Given** import succeeds
**When** the chooser shows
**Then** the new card is present, focus is on its h2, `Wallet added.` is announced, and the wallet is not entered

*Checkpoints:* review after it is done. Import is the highest-risk path; verify a Mainnet-style flow in a real browser.

### Story 17.14: Configure screen: shell, Checks and Seed plates

As a user,
I want one Configure screen per wallet,
So that everything specific to one wallet lives in one place.

**Acceptance Criteria:**

**Given** `/wallets/:id/configure`
**When** the lock is open
**Then** it shows the plates, starting with Checks and Seed (AD-32, AD-44)

**Given** the lock is not open
**When** the route resolves
**Then** it calls `resetToHome()`

**Given** a task screen opened from Configure
**When** the user goes Back
**Then** they return to Configure, and the back labels say so

**And** Configure is reached from an open card and from the wallet header
**And** Reveal seed moves here and keeps its shipped dialogs and focus return
**And** Edit checks works with its shipped dialog

### Story 17.15: Configure: remaining plates

As a user,
I want the rest of a wallet's settings on its Configure screen,
So that nothing per-wallet is left in app Settings.

**Acceptance Criteria:**

**Given** the Configure screen
**When** it renders
**Then** it has the plates Operating another account, Other networks, Node and Two-device signing

**Given** the Other networks plate
**When** the user presses `Use on {Network}`
**Then** the shipped flow runs, with the Mainnet confirm for Mainnet

**And** Let another wallet sign and Sign with two devices work with shipped dialogs and focus return

### Story 17.16: Auto-lock on the Checks plate

As a user,
I want to change a wallet's auto-lock where its other checks live,
So that I do not hunt for it in Settings.

**Acceptance Criteria:**

**Given** the Checks plate
**When** the user changes minutes
**Then** `setLockAutoLock` re-proves the lock's Open Check, enforces the Mainnet floor over every wallet on the lock, and invalidates `lockInfo`

**Given** Edit checks and auto-lock
**When** either succeeds
**Then** both share one success handler

**Given** a lock shared by several Seeds
**When** the plate renders
**Then** it says so, with the count (AD-44)

**And** a Mainnet floor test fails when the floor is removed (AD-28)

### Story 17.17: Settings reduced to app-level

As a user,
I want Settings to hold only app-level things,
So that per-wallet controls are never in two places.

**Acceptance Criteria:**

**Given** Settings
**When** it renders
**Then** it holds only Address book, Version and updates, and Remove all wallets from this device

**Given** the old per-wallet controls
**When** Settings is searched
**Then** no per-wallet item, no Lock now and no auto-lock remains (AD-44, AD-45, AD-46)

**And** this is the last story, because it is the only one that deletes a working entry point

*Checkpoints:* review after it is done. All four gates, a full visual and accessibility pass, and UX Key Flows 1 to 6.
