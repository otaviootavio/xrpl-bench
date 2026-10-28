# Epic 19 Context: Configure each wallet, and Settings holds only the app

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Each open wallet gets one Configure screen holding everything that belongs to that wallet (checks including auto-lock, seed reveal, operating another account, other networks, node, two-device signing), and Settings is trimmed to app-level items only. Per-wallet controls must never live in two places. This is the last of three chooser epics (17, 18 build first); its final story deletes working Settings entry points that Epic 18 already replaced.

## Stories

- Story 19.1: A Configure screen with the Checks and Seed plates
- Story 19.2: The remaining Configure plates
- Story 19.3: Auto-lock on the Checks plate
- Story 19.4: Settings holds only what belongs to the app

## Requirements & Constraints

- Configure is reachable only with the wallet's lock open; otherwise `resetToHome()` returns to the chooser. Entered from an open chooser card or the wallet header; locked cards and the locked-wallet header have no Configure key.
- Screen: h1 `Configure wallet`; plates as h2s in fixed order: Checks, Seed, Operating another account, Other networks, Node, Two-device signing. Existing components are moved, not restyled; every flow keeps its own confirm steps, checks, dialogs and focus-return targets (e.g. `Use on Mainnet` confirm). Back from a task screen (edit-checks, two-device, control) returns to Configure, labelled `Back to Configure`.
- Unavailable controls are `aria-disabled` with visible reason text; a plate is omitted only when the feature cannot exist for that wallet.
- Account Master Key off/on moves from Settings to the Operating another account plate, keeping its Signing Check and ledger-read rules. Other networks lists one `Use on {Network}` key per network without a view, or one line saying none remain.
- Auto-lock: changing minutes re-proves the lock's Open Check, enforces the Mainnet floor (at least 1 minute, refused with visible reason) over every wallet on the lock. A lock shared by several Seeds (all legacy wallets) says so with the store's count and that the change applies to all; legacy wallets keep their lock's existing minutes (default 5). A test must fail if the floor check is removed.
- Settings (from chooser or inside a wallet) holds only Address book, Version and updates, and Remove all wallets from this device: no per-wallet item, no Lock now, no auto-lock. Remove all works with no wallet and no open lock, including hard-locked.
- Gates: lint, build, test, check:contrast all green; 19.4 also needs a visual and accessibility pass at 320, 390 and desktop in both themes, and UX key flows 1 to 6 run. Keyboard and screen-reader pass on new components; 44px targets on coarse pointers; nothing styles `:focus`; no new colour token.

## Technical Decisions

- AD-44: auto-lock is edited only through `keystore.setLockAutoLock` (via `editChecks`, passing the Open Check again; policy floor from `policy.ts`, AD-28). The Checks plate and Edit checks share one success handler (`setLockMinutes` plus invalidating `queryKeys.lockInfo(lockId)`). `app-store.autoLockMinutes` is never read or written by a screen.
- AD-32/AD-45: route `configure` is `/wallets/:id/configure`; `isWalletScreen(route)` is the only chooser-side vs in-wallet split. An in-wallet screen renders only when `route.walletId === activeWalletId`, the wallet exists and its lock is open. Wallet header: Wallets key, then for an open lock NetworkPlate, Configure, and Lock (only if Open Check is not none). Chooser header: nameplate and Settings key.
- AD-43: Configure and Open carry one walletId, never a seedId. On a multi-view card, Configure acts on the entry view: the `activeWalletId` view, else the first (per-row Configure deferred).
- AD-45: one Settings component serves both `/settings` and the in-wallet Settings tab and is never mounted twice; the update marker uses one shared predicate (`updateReady && !declined`). Every lock close goes through `tearDownLock`.
- AD-46: Remove all and last-wallet removal also discard the App PIN and its failure count via `discardAppPin`.
- Screens never write a `WalletMeta` field; label and lock changes come from keystore results. Reveal seed keeps the seed in a ref, with the wallet's own check (FR-69).
- Test mapping (R12): before 19.4 deletes anything, each existing Settings-tab test (Edit checks, Reveal seed, network views, master key, two-device signing) is mapped to a Configure test; the mapping list is attached to the story.

## UX & Interaction Patterns

- Configure key accessible name on the header is `Configure wallet`; header Configure is withheld entirely on the Unlock view.
- Keyboard tab order is reading order; Esc closes the topmost dialog; focus returns to the opener (e.g. Reveal seed key) after dialogs.
- One h1 per screen: Configure `Configure wallet`, Settings `Settings`, plates h2.

## Cross-Story Dependencies

- Requires Epics 17 and 18 done first: 17.7 supplies the chooser Settings key and shared update-marker predicate; 18.2 supplies chooser Remove that replaces Settings' per-wallet Remove.
- 19.1 introduces the screen and Configure keys; 19.2 fills the remaining four plates; 19.3 adds auto-lock to the Checks plate; 19.4 must come last, after 19.1 to 19.3, because it deletes Settings entry points and needs every mapped Configure test in place.
- Epic 19 is the done checkpoint for the whole wallet chooser plan; docs/decisions.md section 6.12 is updated when the picker is removed (Epic 17).
