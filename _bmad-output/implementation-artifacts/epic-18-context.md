# Epic 18 Context: Name, remove and add wallets safely

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Move wallet management onto the chooser. A user can rename a wallet, remove one (the last removal also deletes the App PIN and its failure count), and add one by Generate or Import even when every lock is closed. Import gets its own lock under the same policy as Generate, so it is never a weaker way in. This epic carries the key-handling risk of the Wallet Chooser work.

## Stories

- Story 18.1: Rename a wallet
- Story 18.2: Remove a wallet from the chooser, and the last removal deletes the App PIN
- Story 18.3: Add a wallet by Generate, with every lock closed
- Story 18.4: Import goes through the keystore, under its own lock and the same policy
- Story 18.5: Add a wallet by Import, from the chooser

## Requirements & Constraints

- Rename: 1 to 40 characters after trim and whitespace collapse, unique case-insensitively among other Seeds; existing duplicates are grandfathered. It needs no lock and no ledger call. A failed write keeps the dialog open with the typed name. No copy may promise that a passkey's authenticator name changes.
- Remove: allowed only while that wallet's own lock is open. A locked card shows Remove as `aria-disabled` with visible reason text, and the handler still re-checks the lock at call time. The confirm dialog has three bodies (a sibling network view stays; the only view of the Seed; the last wallet, which names the App PIN). The confirm key is `destructive`. The Active Wallet never names a removed one.
- Last-wallet removal returns the app to first-run Onboarding and deletes the App PIN. A failed discard is reported, and Onboarding offers Remove all while a PIN or non-zero count remains.
- Add: Generate and Import need every lock closed, and each creates its own new lock. Neither selects nor enters the wallet. The new card gets focus on its h2 and `Wallet added.` is announced. Default names auto-suffix to stay unique.
- Import: refuses Open Check `none` on any network. It applies the Mainnet floor (Open Check required, auto-lock at least 1 minute) and the written-Seed confirmation. It refuses a duplicate address before any prompt or ledger read. Any failure after the lock is written deletes that lock, and discards an App PIN made for it.
- Non-negotiables: a Seed never enters React state, a store, the URL or storage. It lives in a ref, is cleared in `finally` on success, failure and unmount, and is a keystore parameter only. The route carries only the screen name, never a name, Seed or form data. Failures are visible, persistent text. Touch targets are at least 44px, with 320px and 200% zoom support. Lists never key on an array index.

## Technical Decisions

- Rename is one write to the Seed record via `keystore.renameWallet`: no `rev` bump, no lock. The name rule lives only in `lib/wallet-name.ts`. A concurrent `commitWalletEdit` must not clobber the new name (needs an interleaved-write unit test).
- Remove runs `removeWalletData(queryClient, removed, remaining)` in `lib/teardown.ts`, in `finally`. It clears the removed wallet's account-scoped entries, closes a lock only if the keystore deleted it with the Seed's last view (never the legacy lock), and clears session, `activeWalletId` and caches even if a keystore step throws. `activeWalletId` becomes the first card in chooser order if it named the removed wallet, else stays, else `null`.
- `discardAppPin` runs in one `mutateVaultMeta` transaction. It deletes `pinSaltB64`, `pinVerifier`, `wrappedMasterKeyForPin`, `wrappedMasterKeyForPasskey`, `passkeyCredentialIdB64` and `rpId`, and resets `failedAttempts` and `lockedUntil`. The emptiness check plus delete must be atomic or under a single-flight guard shared with `createStoredWallet` and `importStoredWallet`. Only `discardAppPin` may reset the failure count (the one App PIN has one failure count). Check the cleared fields against `VaultMeta` in `db.ts` first. Vault-meta writes go through the keystore, never the teardown owner.
- `keystore.importStoredWallet(input, ctx)` runs in this order: `checkWalletRequest`, duplicate check, Signing Check credential, `createLock`, one `putStoredWallet`. It shares one internal writer with `createStoredWallet`. The result carries `meta` and the new lock's `openKey`, never the Seed. No chooser-side code may call `importAndStoreWallet`; a test must fail if one does.
- Generate and Import share one extracted questions component (renders `describeOptions`), mounted at `/wallets/new` at the app shell. Import omits Seed Method and signature type because the Seed fixes the algorithm. Creation never calls `setActiveWalletId`.
- The chooser mounts no ledger reads (no cache, no `getXrplClient`).
- Required tests: call-time refusal, three Remove bodies, teardown scope, active re-pick, PIN fields cleared and count reset, atomic race against a concurrent create, failed-discard path, Open Check `none` refusal, no chooser caller of `importAndStoreWallet`, `setActiveWalletId` not called on add, Seed ref lifetime on all three exits.

## UX & Interaction Patterns

- Card action order starts Open, Rename. Remove sits on each network row of an open card and on a locked card.
- The Rename dialog is a single-field, confirm-sized dialog. Save is enabled only for a valid, changed name. Errors are visible text tied to the field via `aria-invalid` and `aria-describedby`: `Give this wallet a name.`, `Another wallet on this device already has that name.`, `Use 40 characters or fewer.`, and on failure `Could not rename the wallet. Nothing was changed.`
- Locked-card Remove reason: `Open this wallet to remove it.` Remove failure after last wallet: `The wallet was removed, but the App PIN could not be removed.`
- The Remove dialog closes on Escape, overlay press and Back.
- Focus: back to the card's Rename key after rename; chooser `Wallets` h1 after Remove; the new card's h2 after Add; one h1 per screen.
- The chooser gets an Add wallet key to `/wallets/new`. After the last removal the user creates a new PIN as on first run.

## Cross-Story Dependencies

- Epic 17 (chooser, cards, header, `leaveToChooser`, `activeWalletId` semantics) must be built first. Epic 19's story 19.4 deletes Settings' per-wallet Remove, which 18.2 replaces; Settings' own Remove stays until then.
- 18.4 (keystore, no UI) precedes 18.5, and 18.3 and 18.5 share the extracted questions component from 18.3.
- Spec review is required before work on 18.1, 18.2 and 18.4 (18.2 and 18.4 are security-bearing). 18.5 needs a review afterward, including a real-browser pass of a Mainnet-style import.
