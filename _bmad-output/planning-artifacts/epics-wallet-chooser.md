---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-xrpl-wallet-2026-09-12/prd.md
  - _bmad-output/test-artifacts/test-design-epic-17.md
  - _bmad-output/specs/spec-wallet-chooser/SPEC.md
  - _bmad-output/specs/spec-wallet-chooser/stories.yaml
  - _bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-chooser-2026-10-19/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-10-19/EXPERIENCE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-10-19/DESIGN.md
---

# xrpl-wallet — Wallet Chooser - Epic Breakdown

## Overview

This document provides the epic and story breakdown for the Wallet Chooser, decomposing the PRD requirements (FR-79 to FR-90 and the amended FR-10, FR-12, FR-13, FR-14, FR-65, FR-77), the SPEC capabilities, the UX design contract and the chooser architecture spine (AD-31 to AD-46) into implementable stories. It is a separate file from `epics.md` and `epics-passkey-signing.md`, which are left untouched. Numbering continues from Epic 17, because the tracker ended at Epic 16. Epics 17, 18 and 19 are to be built in that order: Epic 19's last story deletes Settings' per-wallet Remove, which Epic 18 replaces.

## Requirements Inventory

### Functional Requirements

New (PRD section 4.3):

FR-79: Every launch lands on a chooser with one card per Seed, in creation order, reading only what the device holds: no ledger read, no balance.
FR-80: A failed read of the Wallet list or saved state is an error with Retry, never first run and never an empty chooser; nothing is written before a read succeeds.
FR-81: A locked Wallet shows its name and nothing else; an open Wallet shows a row per network with word, stamp and address.
FR-82: The user opens a Wallet from its card or a network row; a multi-network Seed returns to the chooser after unlock; Mainnet is never entered by default; create and import never select or enter.
FR-83: The user leaves a Wallet to the chooser without locking it; its data is cleared; chooser activity extends no lock; expiry and backgrounding lock on every route; Lock inside a Wallet returns to the chooser.
FR-84: The user locks an open Wallet from its card; same-lock cards flip together; a Wallet with no Open Check says why there is nothing to lock.
FR-85: The user renames a Wallet (1 to 40 characters, unique case-insensitively among other Seeds); no lock, no ledger; a failed write keeps the typed name.
FR-86: The user removes one Wallet view only while its own lock is open; three confirm bodies; the Active Wallet never names a removed one; the last Wallet returns to first run and deletes the App PIN.
FR-87: The user adds a Wallet by Generate or Import with every lock closed; Import gets its own lock, refuses Open Check none, applies the Mainnet floor and the written-Seed confirm, and refuses a duplicate address before any prompt or read.
FR-88: Each open Wallet has a Configure screen (Checks with auto-lock, Seed, Operating another account, Other networks, Node, Two-device signing), reachable only with the lock open.
FR-89: Settings holds only Address Book, Version and updates, and Remove all; it is reachable from the chooser and from inside a Wallet; Remove all works with no Wallet and no open lock, including hard-locked.
FR-90: The chooser's Settings key shows an update marker, never a modal or redirect; a declined update does not relight it.

Amended:

FR-10: auto-lock is set on the Configure screen; chooser time counts as inactivity for every Wallet; legacy Wallets keep their lock's minutes (default 5), and the screen states how many Wallets share it.
FR-12: leaving a Wallet clears what it read but does not lock it.
FR-13: add, rename and remove move to the chooser; removing the last Wallet also deletes the App PIN.
FR-14: the Active Wallet is the one last chosen to open; only the Wallet the user is inside reads or writes; the picker is removed.
FR-65: an imported Wallet gets its own lock and never an Open Check of none.
FR-77: Account Master Key off and on moves from the Settings tab to the Configure screen.

### NonFunctional Requirements

NFR-1: Money is strings or BigInt end to end; the chooser shows no balance.
NFR-2: No secret is ever serializable; a Seed lives in a ref, passes to the keystore only, and is cleared in `finally`.
NFR-3: Every ledger read goes through a query hook whose key comes from the one factory; the chooser side mounts none.
NFR-4: The service worker caches the static shell only.
NFR-5: Nothing styles `:focus`; `outline-none` is banned.
NFR-6: Colour never carries meaning alone; `bun run check:contrast` is the gate; no new colour token.
NFR-7: Every irreversible action states its exact consequence (Remove, last-wallet Remove naming the App PIN).
NFR-8: Every bespoke component gets a keyboard-only and screen-reader pass.
NFR-9: 320px viewport and 200% zoom are supported; touch targets are at least 44px on coarse pointers.
NFR-10: Motion respects `prefers-reduced-motion`.
NFR-11: A list never uses an array index as its React key (the card list and network rows).
Delivery: updates are never automatic; licence copy never says open source; each of AD-31, AD-35, AD-36, AD-37, AD-39 gets a test that fails when its rule is removed.

### Additional Requirements

- AD-31: an app shell mounts useAutoLock and useClearCacheOnLock once, above the route switch.
- AD-32: one route type; the route may name a wallet but never selects one; launch always rewrites to `/`.
- AD-33: one unwind, `leaveToChooser()`, driven by a depth in history state.
- AD-34: `activeWalletId` means selected; "entered" is derived; creation never selects.
- AD-35: `touchLock(enteredWalletId)`; null extends nothing.
- AD-36: zero ledger reads on the chooser side; screen test on cache and getXrplClient.
- AD-37: Gate has three outcomes (error, empty, ready); no setter runs before a successful rehydrate.
- AD-38: leaving keeps the lock open and removes what the wallet read.
- AD-39: Import creates its own lock through keystore.importStoredWallet, under the same policy as Generate; no chooser-side caller of importAndStoreWallet.
- AD-40: Generate and Import share one questions component; neither enters the wallet.
- AD-41/42: Rename is one write to the Seed record (no rev bump, no lock); one pure name rule in lib/wallet-name.ts.
- AD-43: groupWalletsBySeed, a discriminated union; locked variant carries a name only; order by createdAt then seedId.
- AD-44: auto-lock edited on the Checks plate by setLockAutoLock; one shared success handler; shared-lock count disclosed; legacy Wallets keep their lock's minutes.
- AD-45: header splits in two; every lock close goes through tearDownLock; one shared update-marker predicate.
- AD-46: Remove re-checks its lock at call time; removeWalletData teardown scope, run in `finally`; last wallet returns to Onboarding. The App PIN goes with the last Wallet: `discardAppPin` clears pinSaltB64, pinVerifier, wrappedMasterKeyForPin, wrappedMasterKeyForPasskey, passkeyCredentialIdB64 and rpId and resets failedAttempts and lockedUntil in one transaction, atomic or single-flight with the emptiness check and with create/import; a failed discard is reported and first-run Onboarding offers Remove all while a PIN or count remains.
- AD-25: one App PIN, one failure count; the count is reset only inside `discardAppPin`.
- Release constraint (stories.yaml): stories 5 and 6 merge to dev together.
- docs/decisions.md section 6.12 is updated when the picker is removed.

### UX Design Requirements

UX-DR1: Wallet card, one plate per Seed: name as h2 in the wallet-name type, lock-state legend (lamp plus word), "Active" legend where it applies, locked body `Locked.`, action row (Open, Configure, Rename, Lock, Remove) per state.
UX-DR2: Network row inside an open card: network word and stamp (`Real funds` on Mainnet, `Not stable` plus DEVNET_NOTICE on Devnet), AddressLink with explicit network, per-row Open and Remove.
UX-DR3: Locked card: neutral unlit lamp plus the word `Locked`; Remove `aria-disabled` with visible reason `Open this wallet to remove it.`
UX-DR4: Header split: chooser header (nameplate, Settings key); wallet header (Wallets key, then for an open lock NetworkPlate, Configure, Lock when an Open Check exists); locked wallet header is the Wallets key alone.
UX-DR5: Wallets key: outline key with leading arrow icon, aria-disabled with visible reason under a blocker.
UX-DR6: Configure screen as plates in fixed order: Checks, Seed, Operating another account, Other networks, Node, Two-device signing; existing components moved, not restyled.
UX-DR7: Rename dialog: single-field confirm-sized dialog; strings `Give this wallet a name.`, `Another wallet on this device already has that name.`, `Use 40 characters or fewer.`, failure `Could not rename the wallet. Nothing was changed.`
UX-DR8: Remove dialog with three bodies (sibling view, sole view, last wallet, which names the App PIN); confirm key `destructive`.
UX-DR9: Gate error surface `The wallets on this device could not be read. Nothing was changed.` with Retry.
UX-DR10: Focus management: chooser h1 after leave and Remove; new card h2 after Add; opener after dialog; main region on entering a wallet; one h1 per screen.
UX-DR11: Accessible names carry state (`Open {name}`, `Open {name} on {Network}`, `Settings, update available`); polite live region for lock state changes on the chooser.
UX-DR12: Shared-lock note under the chooser title (`Opening {name} also opened ...`); `No Open Check: this wallet opens itself, so there is nothing to lock.`
UX-DR13: Skip link on the chooser; 44px keys, wrapping action rows at 320px and 200% text; no swipe, long-press, drag or overflow menu; card order never changes with state.
UX-DR14: Settings is app-level: h1 `Settings`, Address book, Version, Remove all; one component serves `/settings` and the tab.

### FR Coverage Map

FR-79: Epic 17 - Every launch lands on the chooser, no ledger read
FR-80: Epic 17 - A failed read is an error, never first run
FR-81: Epic 17 - A locked wallet is a name and nothing else
FR-82: Epic 17 - Open a wallet from its card or a network row
FR-83: Epic 17 - Leave a wallet without locking it
FR-84: Epic 17 - Lock a wallet from its card
FR-90: Epic 17 - Update marker on the chooser's Settings key
FR-12: Epic 17 - Leaving clears what the wallet read, does not lock it
FR-14: Epic 17 - Active Wallet is the one last chosen; picker removed
FR-85: Epic 18 - Rename a wallet
FR-86: Epic 18 - Remove a wallet from the chooser; last wallet deletes the App PIN
FR-87: Epic 18 - Add a wallet by Generate or Import, Import under its own lock
FR-13: Epic 18 - Add, rename, remove move to the chooser; last removal deletes the App PIN
FR-65: Epic 18 - An imported wallet gets its own lock, never Open Check none
FR-88: Epic 19 - Configure screen for each wallet
FR-10: Epic 19 - Auto-lock set on the Configure screen
FR-77: Epic 19 - Account Master Key off and on moves to Configure
FR-89: Epic 19 - Settings holds only what belongs to the app (the chooser's Settings key arrives in 17.7)

## Epic List

### Epic 17: Choose a wallet from one place
The app opens on a chooser with one card per Seed. A user can open a wallet, leave it without locking it, and lock it from its card; a failed read is an error, never first run; a locked card shows a name and nothing else. Stories 17.5 and 17.6 merge to `dev` together.
**FRs covered:** FR-79, FR-80, FR-81, FR-82, FR-83, FR-84, FR-90, FR-12, FR-14
**Stories (stories.yaml):** 1 to 8. Spec checkpoint on 17.1 and 17.3. Done checkpoint on 17.6.

### Epic 18: Name, remove and add wallets safely
A user can rename a wallet, remove one (the last removal also deleting the App PIN and its failure count), and add one by Generate or Import, even with every lock closed. Import gets its own lock under the same policy as Generate. This epic carries the key-handling risk.
**FRs covered:** FR-85, FR-86, FR-87, FR-13, FR-65
**Stories (stories.yaml):** 9 to 13, as 18.1 to 18.5. Spec checkpoint on 18.1, 18.2 and 18.4. Done checkpoint on 18.5.

### Epic 19: Configure each wallet, and Settings holds only the app
Each open wallet has one Configure screen for everything that belongs to it, auto-lock included, and Settings is trimmed to Address book, Version and updates, and Remove all.
**FRs covered:** FR-88, FR-10, FR-77, FR-89
**Stories (stories.yaml):** 14 to 17, as 19.1 to 19.4. Done checkpoint on 19.4.



## Epic 17: Choose a wallet from one place

The app opens on a chooser with one card per Seed. A user can open a wallet, leave it without locking it, and lock it from its card; a failed read is an error, never first run; a locked card shows a name and nothing else. Stories 17.5 and 17.6 merge to `dev` together.

### Story 17.1: A failed read of my wallets says so and offers Retry

As a user opening the app,
I want a failed read of my wallets to be reported with a Retry,
So that I am never sent to first run, or shown an empty list, because of a read error.

**Acceptance Criteria:**

**Given** the vault read of the wallet list rejects
**When** the gate resolves
**Then** it shows `The wallets on this device could not be read. Nothing was changed.` with Retry (FR-80, UX-DR9)
**And** it mounts neither Onboarding nor the app shell, and calls no store setter (`setWallets`, `setActiveWalletId`, `openLock`) (AD-37)

**Given** the saved app state failed to hydrate
**When** the gate resolves
**Then** the same error shows, and nothing is written over the saved Address Book
**And** Retry reloads the page, because hydration runs once per load

**Given** the error is showing and a Retry read now succeeds
**When** it returns wallets
**Then** the app reaches the chooser; if it returns zero wallets it reaches first run (Onboarding), and only then

**Given** `restoreOpenLocks` rejects
**When** the gate resolves
**Then** every lock stays closed and the app continues (the one sanctioned swallow)

**And** a test fails if the rule that blocks Onboarding on a failed read is removed (AD-37)

*Checkpoints:* spec review before work starts.

### Story 17.2: Every launch lands on the chooser, and Back behaves

As a user on a phone with no Back button,
I want every launch to land on the chooser and every way back to behave the same,
So that I never get stuck in a wallet screen or bounce between two entries.

**Acceptance Criteria:**

**Given** the app is cold-started at any path, or reloaded inside a wallet
**When** `rewriteBootLocation` runs before first render
**Then** the location is `/` (FR-79, AD-32)

**Given** the user is in a wallet screen reached by history pushes
**When** `leaveToChooser()` is called
**Then** it unwinds `depth` entries (plus an open overlay entry) in one `history.go` and lands on the chooser (AD-33)
**And** when the depth is absent (an entry created by a boot) it replaces the entry with `/`

**Given** a screen that must not be left half-way is blocking
**When** `leaveToChooser()` is called
**Then** it does nothing and the caller can show the reason (FR-83)

**And** `isWalletScreen(route)` is the one split between chooser-side and in-wallet screens, and the old `home` route is gone
**And** the module is pure and unit-tested (boot rewrite, depth, blocker, overlay, `isWalletScreen`)

### Story 17.3: Only the wallet I am in counts my activity, and locks expire everywhere

As a user with several wallets,
I want only the wallet I am inside to count my activity, and locks to expire wherever I am,
So that browsing the chooser never keeps a lock open and a pocketed phone still locks.

**Acceptance Criteria:**

**Given** the app shell is mounted
**When** the route changes between the chooser and wallet screens
**Then** `useAutoLock` and `useClearCacheOnLock` stay mounted once, above the route switch (FR-83, AD-31)

**Given** `touchLock(null)` is called, as it is for activity on the chooser
**When** it runs
**Then** it extends no in-memory expiry, no timer and no persisted session (FR-10, AD-35)

**Given** the user is inside wallet W
**When** they are active
**Then** `touchLock(W)` extends W's lock, and only W's

**Given** the chooser is showing
**When** a lock's timer expires, or the app is backgrounded (FR-11)
**Then** the lock closes and the card flips to locked in place

**Given** a lock opened by creating a wallet that is never entered
**When** time passes
**Then** it counts down from its creation

**And** notices are scoped to the entered wallet through `enteredWalletId`, `touchLock(entered)` and `enterWallet` (AD-34)
**And** tests for AD-31 and AD-35 each fail when their rule is removed

*Checkpoints:* spec review before work starts.

### Story 17.4: One card per Seed, a locked card typed to hold a name only

As a user whose wallets share a Seed,
I want them grouped as one card,
So that the chooser matches how my keys relate, and a locked wallet reveals nothing.

**Acceptance Criteria:**

**Given** a list of wallets and the open locks
**When** `groupWalletsBySeed` runs
**Then** it returns one group per Seed, ordered by Seed `createdAt` then `seedId`, and the order does not change with lock state, activity or Active (FR-79, FR-81, AD-43)

**Given** a group whose lock is closed
**When** its card type is built
**Then** the type carries `seedId`, `lockId`, `label` and `entryWalletId` and nothing else: no address, network, Node or check kind (AD-26)

**Given** a group whose lock is open
**When** its card type is built
**Then** it carries the label, `lockId`, whether the Open Check allows Lock, and one row per view (`walletId`, `network`, `address`, Node presence)

**Given** a Seed with several views
**When** the entry view is chosen
**Then** it is the view equal to `activeWalletId` if there is one, else the first (the one whose `walletId` equals `seedId`, else the earliest)

**And** the selector is pure and covered by unit tests only

### Story 17.5: The chooser, and opening a wallet from it

As a user,
I want to see my wallets as cards and open one,
So that I choose a wallet before anything about it is read.

**Acceptance Criteria:**

**Given** several locks are open
**When** the chooser mounts
**Then** the query cache is empty, `getXrplClient` is never called, no balance appears and no `NetworkPlate` is mounted (FR-79, AD-36)
**And** a test fails if any of those rules is removed

**Given** a locked card
**When** it renders
**Then** it shows the name as an h2, a neutral lamp with the word `Locked`, `Locked.`, and an Open key (FR-81, UX-DR1)
**And** a locked Mainnet card renders exactly like a locked Testnet card
**And** the Rename, Remove and Configure keys are not in this story; each is added by the story that builds its feature (18.1, 18.2, 19.1), so no key here leads nowhere

**Given** an open card
**When** it renders
**Then** each network row shows the network word, its stamp (`Real funds` on Mainnet, `Not stable` plus `DEVNET_NOTICE` on Devnet), an `AddressLink` with an explicit network and an Open key (UX-DR2, AD-36)

**Given** Open on a locked card
**When** the user unlocks
**Then** a single-view Seed lands in its shell, and a multi-view Seed returns to the chooser with the card open (FR-82)
**And** a network row opens exactly its view, and a Mainnet view is never entered by default

**Given** the chooser
**When** the user tabs through it
**Then** a skip link comes first, focus order is reading order, keys are at least 44px on coarse pointers, rows wrap at 320px and 200% zoom, and lists use stable keys, not array indexes (UX-DR13, NFR-9, NFR-11)
**And** accessible names carry state (`Open {name}`, `Open {name} on {Network}`) (UX-DR11)

**And** the chooser becomes the landing screen

*Release pairing:* 17.5 and 17.6 merge to `dev` together. A phone PWA has no Back, so the chooser must not ship without the Wallets key.

### Story 17.6: The Wallets key, and the picker is gone

As a user inside a wallet,
I want a Wallets key that takes me back to the chooser without closing my lock,
So that I can switch wallets and still choose when to lock.

**Acceptance Criteria:**

**Given** the user is in a wallet
**When** they press the Wallets key, or Back
**Then** they land on the chooser with focus on the `Wallets` h1 and the wallet's lock still open (FR-83, UX-DR5, UX-DR10)
**And** its account-scoped query data is removed unless another open lock holds the same (network, address), and its notices clear (FR-12, AD-38)
**And** Back from the chooser leaves the app

**Given** a screen that must not be left half-way is blocking
**When** the header renders
**Then** the Wallets key is `aria-disabled` with the reason visible

**Given** a wallet header for an open lock
**When** it renders
**Then** it shows the Wallets key, `NetworkPlate` and, when the Open Check is not `none`, Lock; a locked wallet's header is the Wallets key alone (UX-DR4, AD-45)
**And** the header Configure key is added by 19.1, with the screen it opens

**Given** the user presses Lock in the wallet header
**When** it runs
**Then** `tearDownLock` runs and then `leaveToChooser()`; no `closeLock` call is inline (AD-45)

**And** the wallet picker `Select` is removed (FR-14)
**And** `docs/decisions.md` section 6.12 records its removal

*Release pairing:* merges to `dev` together with 17.5.
*Checkpoints:* review after it is done, with a real-browser check of chooser, Open, leave, Lock and Back at phone width in both themes.

### Story 17.7: A Settings key on the chooser, and the update marker

As a user at the chooser,
I want a Settings key that reaches app-level settings and tells me when an update waits,
So that I can reach Remove all and updates even with no wallet open.

**Acceptance Criteria:**

**Given** the chooser header
**When** it renders
**Then** it shows the nameplate and a Settings key (UX-DR4)

**Given** an update is waiting and not declined
**When** the chooser renders
**Then** the Settings key reads `Settings, update available`, as visible text and as its accessible name, never as a modal or redirect (FR-90, UX-DR11)
**And** a declined release does not relight it
**And** the marker is read from one shared predicate (`updateReady && !declined`), used by the Settings key and the Settings tab

**Given** `/settings` and the in-wallet Settings tab
**When** either is shown
**Then** one component serves both and never both are mounted (FR-89, AD-45)
**And** Settings content is unchanged for now; the trim is story 19.4

**Given** no wallet exists, or no lock is open, including a hard-locked user
**When** the user opens Settings from the chooser
**Then** Remove all wallets from this device works (FR-89, AD-46)

**And** the Settings route mounts no ledger read and no account-scoped key (AD-36)

### Story 17.8: Lock a wallet from its card

As a user,
I want to lock a wallet from its card without entering it,
So that I can close a lock I left open.

**Acceptance Criteria:**

**Given** an open card whose Open Check is not `none`
**When** the user presses Lock
**Then** that card, and every card on the same lock, flips to Locked in place through `tearDownLock`, announced in a polite live region (FR-84, UX-DR11, AD-45, AD-38)
**And** a line names the other wallets that locked with it (UX-DR12)

**Given** an open card whose Open Check is `none`
**When** it renders
**Then** it shows no Lock key and the line `No Open Check: this wallet opens itself, so there is nothing to lock.` (UX-DR12)

**Given** the lock cannot be closed
**When** Lock fails
**Then** the failure is shown as visible, persistent text and the card stays open

**And** no `closeLock` or `queryClient.clear` is called inline (AD-16)

## Epic 18: Name, remove and add wallets safely

A user can rename a wallet, remove one (the last removal also deleting the App PIN and its failure count), and add one by Generate or Import, even with every lock closed. Import gets its own lock under the same policy as Generate. This epic carries the key-handling risk.

### Story 18.1: Rename a wallet

As a user,
I want to give a wallet a name I recognise,
So that I can tell my cards apart.

**Acceptance Criteria:**

**Given** an open or locked card
**When** it renders
**Then** it has a Rename key that opens the Rename dialog, and focus order is Open, Rename (UX-DR1)

**Given** the Rename dialog on a card
**When** the user types a name
**Then** it is trimmed and inner whitespace collapsed, and accepted at 1 to 40 characters, unique case-insensitively among other Seeds' names (FR-85, AD-42)
**And** an empty name shows `Give this wallet a name.`, a duplicate shows `Another wallet on this device already has that name.`, and a long one shows `Use 40 characters or fewer.`, each as visible text tied to the field (`aria-invalid`, `aria-describedby`) (UX-DR7)
**And** Save is enabled only for a valid, changed name

**Given** a valid name
**When** the user presses Save
**Then** `keystore.renameWallet` writes the Seed record without bumping `rev`, without asking a lock and without any ledger call (AD-41)
**And** every network row under the card shows the new name, and focus returns to the card's Rename key (UX-DR10)

**Given** `commitWalletEdit` runs concurrently with a rename
**When** both finish
**Then** the new name survives (a unit test with an interleaved write)

**Given** the write fails
**When** Save returns
**Then** `Could not rename the wallet. Nothing was changed.` shows, the dialog stays open and the typed name is kept

**And** the name rule lives only in `lib/wallet-name.ts`, existing duplicates are grandfathered, and no copy promises a passkey's authenticator name changes (AD-42, AD-41)

*Checkpoints:* spec review before work starts.

### Story 18.2: Remove a wallet from the chooser, and the last removal deletes the App PIN

As a user,
I want to remove one wallet from the chooser, and to have a handed-over device hold no trace of me,
So that I can retire a wallet without wiping the device, and the last removal leaves nothing behind.

**Acceptance Criteria:**

**Given** a card
**When** it renders
**Then** it has a Remove key (on each network row of an open card, and on a locked card), added by this story

**Given** a locked card
**When** it renders
**Then** Remove is `aria-disabled` with `Open this wallet to remove it.` visible (FR-86, UX-DR3)

**Given** Remove is activated with the wallet's lock closed, even though the key was `aria-disabled`
**When** the handler runs
**Then** it re-reads `lockId in openLocks` at call time and refuses (AD-46)

**Given** an open card
**When** the user presses Remove
**Then** the confirm dialog uses one of three bodies, naming the consequence: a sibling network view stays, this was the only view of the Seed, or this is the last wallet on the device and the App PIN goes too (FR-13, NFR-7, UX-DR8)
**And** the confirm key is the `destructive` fill, and Escape, overlay press and Back close the dialog

**Given** the user confirms
**When** `removeWalletData(queryClient, removed, remaining)` runs through `lib/teardown.ts`
**Then** it removes the removed wallet's account-scoped entries, closes a lock the keystore deleted with the Seed's last view (never the legacy lock), and runs in `finally` so the session, `activeWalletId` and caches are cleared even if a keystore step throws (AD-46, AD-16)
**And** `activeWalletId` becomes the first card in chooser order if it named the removed wallet, else stays, else `null`
**And** focus moves to the chooser `Wallets` h1

**Given** the removal leaves no stored wallet and no lock record
**When** `keystore.removeWallet` finishes
**Then** `discardAppPin` runs in one `mutateVaultMeta` transaction: it deletes `pinSaltB64`, `pinVerifier`, `wrappedMasterKeyForPin`, `wrappedMasterKeyForPasskey`, `passkeyCredentialIdB64` and `rpId`, and resets `failedAttempts` and `lockedUntil` (FR-86, AD-46, AD-25)
**And** the emptiness check and the delete are atomic, or run under a single-flight guard shared with `createStoredWallet` and `importStoredWallet`, so a create in flight is never left under a deleted PIN
**And** no code other than `discardAppPin` resets the failure count
**And** the cleared fields are checked against `VaultMeta` in `db.ts` before the transaction or guard is chosen

**Given** `discardAppPin` fails after the last wallet is gone
**When** the removal returns
**Then** the app says `The wallet was removed, but the App PIN could not be removed.`, and first-run Onboarding offers Remove all wallets from this device while a PIN or a non-zero count remains

**Given** the last wallet was removed and the PIN deleted
**When** the app returns to Onboarding
**Then** the user is asked to create a new PIN as on first run, and no failed-attempt count carries over

**And** Settings' own Remove stays until story 19.4
**And** tests cover: the call-time refusal, the three bodies, the teardown scope (never the legacy lock), the active re-pick, the PIN fields cleared and the count reset, the atomic race against a concurrent create, and the failed-discard path

*Checkpoints:* spec review before work starts. Security-bearing: vault-meta writes go through the keystore, never the teardown owner.

### Story 18.3: Add a wallet by Generate, with every lock closed

As a user at the chooser,
I want to add a wallet without opening another one first,
So that adding never forces me to unlock something I did not mean to.

**Acceptance Criteria:**

**Given** the per-wallet creation questions (FR-60)
**When** they are used
**Then** one extracted component serves them, rendering `describeOptions`, mounted at `/wallets/new` at the app shell (FR-87, AD-40)

**Given** the chooser header or body
**When** it renders
**Then** it has an Add wallet key to `/wallets/new` (FR-87)

**Given** every lock is closed
**When** the user generates a wallet
**Then** creation works under its own new lock, with the Mainnet floor and the written-Seed confirmation for passkey-only Mainnet wallets (FR-65, AD-28)
**And** it never calls `setActiveWalletId` and never enters the wallet (FR-82)

**Given** creation succeeds
**When** the chooser shows
**Then** the new card is present, focus is on its h2, and `Wallet added.` is announced (UX-DR10)

**Given** a default name already exists
**When** a wallet is generated
**Then** the default name is auto-suffixed so it stays unique (AD-42)

**And** the route carries only the screen name, never a name, Seed or form data (AD-32)
**And** a test asserts `setActiveWalletId` is not called and the route stays on the chooser

### Story 18.4: Import goes through the keystore, under its own lock and the same policy

As a user importing a Seed,
I want the import to follow the same rules as Generate,
So that Import is never a weaker way in.

**Acceptance Criteria:**

**Given** an import
**When** `keystore.importStoredWallet(input, ctx)` runs
**Then** the order is `checkWalletRequest`, duplicate check, the Signing Check credential, `createLock`, one `putStoredWallet`, shared with `createStoredWallet` through one internal writer (FR-87, AD-39)

**Given** an Open Check of `none`
**When** an import is requested on any network
**Then** it is refused (FR-65, AD-28)

**Given** a Mainnet import
**When** it is requested
**Then** the Mainnet floor (Open Check required, auto-lock at least 1 minute) and the written-Seed confirmation apply

**Given** a Seed whose address already exists on the device
**When** an import is attempted
**Then** it is refused before any prompt, any ledger read, and without the Seed leaving the keystore call

**Given** a failure after the lock is written
**When** the import aborts
**Then** the new lock is deleted and an App PIN made for it is discarded

**And** the result carries `meta` and the new lock's `openKey` and never the Seed; the Seed is a parameter only, and the keystore retains none (NFR-2)
**And** a test fails if any chooser-side code calls `importAndStoreWallet` (AD-39)
**And** a test fails if the Open Check `none` refusal is removed
**And** there is no UI in this story

*Checkpoints:* spec review before work starts. Security-bearing.

### Story 18.5: Add a wallet by Import, from the chooser

As a user,
I want to import a Seed from the chooser,
So that I can bring an existing wallet in under its own lock.

**Acceptance Criteria:**

**Given** the Import form
**When** it is submitted
**Then** it calls `importStoredWallet` using the shared questions component and the written-Seed confirmation, omitting Seed Method and signature type because the Seed fixes the algorithm (FR-87, AD-39, AD-40)

**Given** the Seed field
**When** it is used
**Then** the Seed lives in a ref, is cleared in `finally` on success, failure and unmount, and is never in React state, a store, the URL or storage (NFR-2)

**Given** a duplicate address
**When** the user submits
**Then** the refusal shows before any prompt or ledger read

**Given** import succeeds with every lock closed
**When** the chooser shows
**Then** the new card is present, focus is on its h2, `Wallet added.` is announced, and the wallet is not selected or entered (FR-82)

**Given** import fails
**When** the form returns
**Then** the failure is visible, persistent text, and no lock is left behind

**And** tests cover the ref lifetime on all three exits and that `setActiveWalletId` is not called

*Checkpoints:* review after it is done. Import is the highest-risk path; verify a Mainnet-style flow in a real browser.

## Epic 19: Configure each wallet, and Settings holds only the app

Each open wallet has one Configure screen for everything that belongs to it, auto-lock included, and Settings is trimmed to Address book, Version and updates, and Remove all.

### Story 19.1: A Configure screen with the Checks and Seed plates

As a user with an open wallet,
I want one Configure screen for that wallet,
So that everything specific to it lives in one place.

**Acceptance Criteria:**

**Given** `/wallets/:id/configure`
**When** the wallet's lock is open
**Then** the screen shows the h1 `Configure wallet` and plates as h2s in this fixed order: Checks, Seed, Operating another account, Other networks, Node, Two-device signing (FR-88, UX-DR6)
**And** in this story the Checks and Seed plates are populated; the other four follow in 19.2

**Given** the lock is not open
**When** the route resolves
**Then** `resetToHome()` returns the user to the chooser (AD-32)

**Given** an open card on the chooser, or the wallet header
**When** it renders
**Then** it has a Configure key added by this story (UX-DR4); pressing it reaches this screen; on a multi-view card the Configure key acts on the entry view, the `activeWalletId` view else the first (AD-43); locked cards have no Configure key

**Given** the Checks plate
**When** it renders
**Then** it shows the wallet's Open Check and Signing Check in the words Edit checks uses, and the Edit checks key opens the shipped flow with its dialogs and focus return (FR-88)

**Given** the Seed plate
**When** the user presses Reveal seed
**Then** the shipped confirm dialog, the wallet's own check (FR-69), the seed in a ref and the `SeedReveal` dialog run unchanged, and focus returns to the Reveal seed key

**Given** a task screen opened from Configure
**When** the user goes Back
**Then** they return to Configure, and the back labels say `Back to Configure`

**And** existing components are moved, not restyled (UX-DR6)
**And** the existing Settings-tab tests for Edit checks and Reveal seed are each mapped to a Configure test before 19.4 deletes anything (test design R12)

### Story 19.2: The remaining Configure plates

As a user,
I want the rest of a wallet's settings on its Configure screen,
So that nothing per-wallet is left in app Settings.

**Acceptance Criteria:**

**Given** the Operating another account plate
**When** it renders
**Then** it shows `ControlledNote` when it applies, the Let another wallet sign key when the wallet holds the Account Master Key, and `MasterKeyControl`; Account Master Key off and on is offered here, with its shipped confirm, Signing Check and ledger-read rules (FR-77, FR-75)

**Given** the Other networks plate
**When** it renders
**Then** it shows one `Use on {Network}` key per network the Seed has no view on, or one line saying none remain (FR-61)
**And** `Use on Mainnet` keeps its shipped confirm dialog and `returnFocusTo` target

**Given** the Node plate and the Two-device signing plate
**When** they render
**Then** `WalletNodeSection` and `TwoDeviceSign` work unchanged (FR-61, FR-78)

**Given** a control that is unavailable for now
**When** it renders
**Then** it is `aria-disabled` with its reason in visible text, and a plate is omitted only when the feature cannot exist for that wallet at all (UX-DR6)

**And** every flow keeps its own confirm steps, checks and focus return, and its Back returns to Configure
**And** the existing Settings-tab tests for network views, master key and two-device signing are each mapped to a Configure test (R12)

### Story 19.3: Auto-lock on the Checks plate

As a user,
I want to change a wallet's auto-lock where its other checks live,
So that I do not hunt for it in Settings.

**Acceptance Criteria:**

**Given** the Checks plate
**When** the user changes the minutes
**Then** `setLockAutoLock` re-proves the lock's Open Check, enforces the Mainnet floor over every wallet on the lock, and invalidates `lockInfo` (FR-10, FR-88, AD-44, AD-28)
**And** a test fails when the floor check is removed

**Given** Edit checks and the auto-lock control
**When** either succeeds
**Then** both go through one success handler (`setLockMinutes` plus invalidating `queryKeys.lockInfo(lockId)`)

**Given** a lock shared by more than one Seed, as every legacy wallet's is
**When** the plate renders
**Then** it says the lock is shared, with the count from the store, and that a change applies to all of them; legacy wallets keep the minutes their lock already has (5 by default) (FR-10, AD-44)

**Given** a Mainnet wallet
**When** the user tries to set auto-lock below 1 minute
**Then** it is refused with a visible reason

**And** `app-store.autoLockMinutes` is never read or written by a screen (AD-44)

### Story 19.4: Settings holds only what belongs to the app

As a user,
I want Settings to hold only app-level things,
So that per-wallet controls are never in two places.

**Acceptance Criteria:**

**Given** Settings, from the chooser or from inside a wallet
**When** it renders
**Then** it holds the Address book (FR-45), Version and updates (section 4.12), and Remove all wallets from this device, and nothing else (FR-89, UX-DR14)
**And** it shows no per-wallet item, no Lock now and no auto-lock (AD-44, AD-45, AD-46)

**Given** Settings is opened with no wallet and no open lock, including for a hard-locked user
**When** the user presses Remove all
**Then** it works (FR-89, AD-46)

**Given** the Settings tab inside a wallet and `/settings`
**When** either is shown
**Then** one component serves both and never both are mounted (AD-45)

**Given** this is the story that deletes working entry points, including Settings' own per-wallet Remove, which 18.2 replaces
**When** it merges (Epic 18 and stories 19.1 to 19.3 are already done)
**Then** every deleted Settings assertion has its mapped Configure test, and the mapping list is attached to the story (R12)

**And** all four gates are green, with a full visual and accessibility pass at 320, 390 and desktop in both themes, and UX Key Flows 1 to 6 run as written

*Checkpoints:* review after it is done. This is the last story of the epic.
