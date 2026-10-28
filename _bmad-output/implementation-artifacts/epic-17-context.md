# Epic 17 Context: Choose a wallet from one place

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Replace the wallet picker with a chooser that every launch lands on: one card per Seed, reading only what the device holds. A user can open a wallet from its card, leave it without locking it, and lock it from its card. A failed read of the wallet list is an error with Retry, never first run or an empty chooser. A locked card shows a name and nothing else, so nothing about a locked wallet leaks. This epic carries the app-shell and routing restructure that Epics 18 and 19 build on.

## Stories

- Story 17.1: A failed read of my wallets says so and offers Retry
- Story 17.2: Every launch lands on the chooser, and Back behaves
- Story 17.3: Only the wallet I am in counts my activity, and locks expire everywhere
- Story 17.4: One card per Seed, a locked card typed to hold a name only
- Story 17.5: The chooser, and opening a wallet from it
- Story 17.6: The Wallets key, and the picker is gone
- Story 17.7: A Settings key on the chooser, and the update marker
- Story 17.8: Lock a wallet from its card

## Requirements & Constraints

- Chooser: one card per Seed in creation order; no ledger read and no balance. A locked card shows its name only; an open card shows a row per network with word, stamp (`Real funds` on Mainnet, `Not stable` plus the Devnet notice on Devnet) and address.
- Open from a card or a network row. A multi-network Seed returns to the chooser after unlock (Mainnet is never entered by default). Create and import never select or enter a wallet.
- Leaving a wallet does not lock it and clears what it read. Chooser activity extends no lock. Expiry and backgrounding lock on every route. Lock inside a wallet returns to the chooser.
- Lock from a card: cards sharing one lock flip together; a wallet with no Open Check says `No Open Check: this wallet opens itself, so there is nothing to lock.`
- Failed read of the wallet list or saved state: surface `The wallets on this device could not be read. Nothing was changed.` with Retry. Nothing is written before a read succeeds (otherwise persistence overwrites the Address Book with defaults). Never relaxes a money-moving guard.
- Active Wallet is the one last chosen to open; only the wallet the user is inside reads or writes. The picker is removed, and the matching section of `docs/decisions.md` is updated.
- Chooser Settings key shows an update marker, never a modal or redirect; a declined update does not relight it.
- Standing rules: no `:focus` styling, no `outline-none`; colour never alone (`check:contrast`, no new colour token); 320px and 200% zoom; 44px touch targets on coarse pointers; reduced motion respected; list keys never array indices; keyboard and screen-reader pass for bespoke components; updates never automatic; never call the project open source.
- Each of AD-31, AD-35, AD-36, AD-37 needs a test that fails when its rule is removed.
- Stories 17.5 and 17.6 must merge to `dev` together.

## Technical Decisions

- **App shell (AD-31):** rendered by Gate whenever at least one Wallet exists. It mounts `useAutoLock`, `useClearCacheOnLock`, the header, skip link and main region once, above the route switch. No child of the route switch mounts those hooks.
- **Gate (AD-37):** three outcomes: error (list read rejects or persisted slice failed to hydrate), empty (successful read, zero Wallets, renders Onboarding only here), ready. No store setter (`setWallets`, `setActiveWalletId`, `openLock`) runs before a successful rehydrate. Retry re-runs the vault read; after a hydration failure it reloads the page. `restoreOpenLocks` rejecting leaves locks closed (the one sanctioned swallow).
- **Routes (AD-32):** `Route` is `chooser | settings | add-wallet | wallet | configure | edit-checks | two-device | control`; `home` is retired in one change. Paths: `/`, `/settings`, `/wallets/new`, `/wallets/:id` and its `/configure`, `/checks`, `/two-device`, `/control` children. `parseRoute` is total (unknown parses to chooser). `isWalletScreen(route)` is the only chooser-side versus in-wallet split. An in-wallet screen renders only when the route walletId equals `activeWalletId`, the wallet exists, and (configure and tasks) its lock is open; otherwise `resetToHome()`. `rewriteBootLocation()` runs at module scope before first render and `replaceState`s every path other than `/` to `/`, including `/settings`. The route may name a wallet but never selects one. Tab selection inside a wallet stays local state.
- **History (AD-33):** each pushed entry carries `{ screen: true, depth: n }`. `leaveToChooser()` is the only return to `/` from an in-wallet screen: honours blockers, unwinds depth (plus overlay) in one `history.go`, `replaceState`s `/` when depth is absent. Wallets key and Lock key both call it; Lock closes through the teardown owner first. Back still pops one entry. A blocker makes the Wallets key `aria-disabled` with visible reason and `leaveToChooser()` a no-op. `leaveScreen()` stays the task screens' own exit. No direct `history.*` outside `route.ts`.
- **Selection (AD-34):** `activeWalletId` means selected (last chosen to open). Writers: `enterWallet(walletId)` (the only call from chooser Open keys), removal re-pick, Gate's repair (first card in chooser order), Onboarding's first-wallet commit. `CreateWalletFlow.finishBackup` and `AddWalletScreen` stop calling `setActiveWalletId`. `enteredWalletId(route, activeWalletId)` is a pure derived value, never stored. Notice scope reads it, so a chooser-side notice survives and a wallet's notices go when it is left.
- **Activity (AD-35):** `touchActiveLock` becomes `touchLock(enteredWalletId)`; null extends nothing (not in-memory expiry, timer, nor persisted session). Expiry sweep, per-lock timers and background close-all run on every route.
- **Read budget (AD-36):** the chooser side reads only `wallets` and `openLocks` via the grouping selector. No ledger-read hook, no `useActiveWallet/Network/Node`, no `NetworkPlate`, no account-scoped key, no `lockInfo` read. Every `AddressLink` passes `network` from its own row. A screen test mounts the chooser with several open locks and fails if the query cache is non-empty or `getXrplClient` is called.
- **Leaving (AD-38):** never closes a lock. Unmounting the in-wallet subtree stops live subscriptions and incoming-payment notices; teardown owner's `leaveWallet(queryClient, walletId)` removes that wallet's account-scoped cache entries unless another open lock holds the same network and address. No incoming-payment notice fires on the chooser.
- **Grouping (AD-43):** `groupWalletsBySeed(wallets, openLocks, activeWalletId)` in `src/store/wallet-groups.ts`, pure, ordered by Seed `createdAt` then `seedId`, never by state or storage order. Output is a discriminated union: the locked variant carries only `seedId`, `lockId`, `label`, `entryWalletId`; the open variant carries label, `lockId`, whether Lock is allowed, and per-view rows (`walletId`, `network`, `address`, Node presence). Open and Configure carry one walletId; the entry view is the one equal to `activeWalletId`, else the first view. Unlocking a multi-view Seed returns through `leaveToChooser()`.
- **Header (AD-45):** wallet `Select` removed. Wallet header (when `isWalletScreen`): nameplate, Wallets key, and for an open lock `NetworkPlate`, Configure, and Lock when Open Check is not none. Chooser header: nameplate and Settings key. A locked wallet's header is the Wallets key alone. Every Lock key (header or card) calls `tearDownLock`, never `closeLock` directly. The update marker comes from one shared predicate (`updateReady && !declined`).
- Pure modules stay import-free of components; new modules join the dependency-gate lists. Only `/` is guaranteed served by the static shell.

## UX & Interaction Patterns

- Wallet card is one plate per Seed: name as h2 in the wallet-name type, lock-state legend (lamp plus word), `Active` legend where it applies, locked body `Locked.`, action row (Open, Configure, Rename, Lock, Remove) varying by state. Locked card: neutral unlit lamp plus `Locked`. Card order never changes with state.
- Network row in an open card: word, stamp, `AddressLink`, per-row Open.
- Wallets key: outline key with leading arrow icon; `aria-disabled` with visible reason under a blocker.
- Accessible names carry state (`Open {name}`, `Open {name} on {Network}`, `Settings, update available`); polite live region announces lock-state changes on the chooser.
- Shared-lock note under the chooser title (`Opening {name} also opened ...`); skip link on the chooser; 44px keys; action rows wrap at 320px and 200% text; no swipe, long-press, drag or overflow menu.
- Focus: chooser h1 after leaving a wallet; opener after a dialog; main region on entering a wallet; one h1 per screen.

## Cross-Story Dependencies

- 17.1 (Gate three outcomes) and 17.3 (activity and lifecycle hooks, tests for AD-31 and AD-35) are spec checkpoints; the shell and route work in 17.2 underpins 17.4 to 17.8.
- 17.4 (grouping selector) feeds 17.5 (chooser) and 17.8 (card Lock).
- 17.5 and 17.6 ship together; 17.6 done is the epic's done checkpoint.
- 17.7 depends on the header split from 17.6.
- Epic 18 (rename, remove, add) and Epic 19 (Configure, Settings trim) build on this chooser, shell and route model; Epic 18's Remove and Epic 19's removal of per-wallet Remove in Settings depend on it, so Epic 17 builds first.
