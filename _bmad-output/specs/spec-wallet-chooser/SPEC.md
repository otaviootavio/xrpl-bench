---
id: SPEC-wallet-chooser
companions:
  - ../../planning-artifacts/ux-designs/ux-xrpl-wallet-2026-10-19/EXPERIENCE.md   # ADOPTED: behaviour, routes, exact strings, flows
  - ../../planning-artifacts/ux-designs/ux-xrpl-wallet-2026-10-19/DESIGN.md       # ADOPTED: visual delta, no new colour token
  - ../../planning-artifacts/architecture/architecture-xrpl-wallet-chooser-2026-10-19/ARCHITECTURE-SPINE.md   # ADOPTED: AD-31..AD-46, binding
  - ../../test-artifacts/test-design-epic-17.md   # ADOPTED: risks R1-R20, P0/P1 test plan, quality gates
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Where the architecture spine and the UX spine differ, the architecture spine (later, binding) wins; the differences are listed under Assumptions.

# Wallet Chooser, Per-Wallet Configuration, Settings Split

## Why

A vision and a pain, owner-driven. The wallet should open on a chooser with one card per Seed, where a user creates, opens, renames and removes wallets; everything that belongs to one wallet (checks, auto-lock, Reveal seed, control key, other networks, Node, two-device) moves from app-level Settings to a per-wallet Configure screen. Today the header picker and an overloaded Settings tab mix app-level and per-wallet concerns, and nothing can be renamed. The wallet is meant to hold real Mainnet funds, so every move must preserve the lock model: a closed lock shows a name and nothing else.

## Capabilities

- **CAP-1** Chooser as first screen (AD-32, AD-36, AD-43; PRD FR-79)
  - **intent:** The app always opens on a chooser listing one card per Seed, reading only what the store holds.
  - **success:** A cold start at any path lands on `/` showing the chooser; a screen test mounting it with several open locks leaves the query cache empty and never calls `getXrplClient`; no balance appears.
- **CAP-2** Gate error state (AD-37; PRD FR-80)
  - **intent:** A failed read of the wallet list or persisted state is shown as an error with Retry, never as first-run or an empty chooser.
  - **success:** Forcing the vault read to reject renders `The wallets on this device could not be read. Nothing was changed.` with Retry, mounts neither Onboarding nor the app shell, and calls no store setter; Retry after a good read reaches the chooser, a successful zero-wallet read reaches Onboarding.
- **CAP-3** Open a wallet (AD-34, AD-43, AD-32; PRD FR-82)
  - **intent:** A user opens a wallet from its card or from a network row.
  - **success:** Open on a locked card shows the existing Unlock view; after unlock a single-view Seed lands in its shell and a multi-view Seed returns to the chooser with the card open; a row opens exactly its view; a Mainnet view is never entered by default; creating a wallet never selects it.
- **CAP-4** Leave a wallet (AD-33, AD-38, AD-34; PRD FR-83, FR-14)
  - **intent:** A user returns to the chooser from a wallet without closing its lock.
  - **success:** The Wallets key and browser Back land on the chooser with focus on the `Wallets` h1 and no Back ping-pong; the wallet's lock stays open; its account-scoped query data is removed; a blocked screen leaves the Wallets key `aria-disabled` with the reason visible; the left wallet's notices clear.
- **CAP-5** One card per Seed, locked card name only (AD-43, AD-26, AD-36; PRD FR-81)
  - **intent:** Wallets sharing a Seed appear as one card with a row per network, and a locked card reveals nothing but its name.
  - **success:** The locked-card type has no address, network, Node or check-kind field; a locked card renders name, `Locked` lamp and word, and `Locked.`; open rows show network word, stamp (`Real funds`, `Not stable`) and an `AddressLink` with explicit network; order follows Seed `createdAt` and never changes with state.
- **CAP-6** Rename (AD-41, AD-42; PRD FR-85)
  - **intent:** A user renames a wallet, locally.
  - **success:** The dialog accepts 1 to 40 characters unique case-insensitively among other Seeds and shows the UX strings; Save writes the Seed record without bumping `rev` or asking a lock; every row of that card shows the new name; a failed write shows `Could not rename the wallet. Nothing was changed.` and keeps the dialog open; nothing reaches the ledger.
- **CAP-7** Remove (AD-46, AD-16; PRD FR-86, FR-13)
  - **intent:** A user removes one wallet view from the chooser.
  - **success:** Remove works only with the wallet's own lock open, re-checked at call time even if `aria-disabled` is bypassed; a locked card shows `Open this wallet to remove it.`; the dialog uses the sibling-view, sole-view or last-wallet body; teardown goes through `lib/teardown.ts`; `activeWalletId` never names a removed wallet; removing the last wallet returns to Onboarding and deletes the App PIN and its failure count with it, in one transaction (`pinSaltB64`, `pinVerifier`, `wrappedMasterKeyForPin`, `wrappedMasterKeyForPasskey`, `passkeyCredentialIdB64`, `rpId` cleared; `failedAttempts` and `lockedUntil` reset), the emptiness check and the delete atomic or single-flight against a concurrent create or import, teardown run in `finally`, and the last-wallet dialog body names the PIN; if the PIN delete fails after the wallet is gone, the app says `The wallet was removed, but the App PIN could not be removed.` and first-run Onboarding offers Remove all while a PIN or count remains.
- **CAP-8** Add wallet, Generate or Import (AD-39, AD-40, AD-28; PRD FR-87, FR-65)
  - **intent:** A user adds a wallet from the chooser, by Generate or Import, even when every lock is closed.
  - **success:** Import creates its own lock and Open Check through `keystore.importStoredWallet`, refuses Open Check `none`, applies the Mainnet floor and the written-Seed confirm exactly as Generate does, and refuses a Seed whose address already exists on the device before any prompt or ledger read; neither path enters the wallet; the chooser shows the new card, focus on its h2, `Wallet added.`
- **CAP-9** Per-wallet Configure screen (AD-32, AD-44; PRD FR-88, FR-77)
  - **intent:** Each open wallet has one Configure screen for everything specific to it.
  - **success:** `/wallets/:id/configure` has plates Checks, Seed, Operating another account, Other networks, Node, Two-device signing and resolves only with the lock open (else `resetToHome()`); Edit checks, Reveal seed, Let another wallet sign, `Use on {Network}` and Sign with two devices work with shipped dialogs and focus return; their Back returns to Configure; Configure is reached from an open card and from the wallet header.
- **CAP-10** Auto-lock in Checks plate (AD-44, AD-28; PRD FR-88, FR-10, FR-65)
  - **intent:** A user changes a wallet's auto-lock where its other checks live.
  - **success:** Changing minutes re-proves the lock's Open Check, enforces the Mainnet floor over every wallet on the lock, invalidates `lockInfo`, shares one success handler with Edit checks, and a lock shared by several Seeds says so with the count.
- **CAP-11** App-level Settings (AD-44, AD-45, AD-46; PRD FR-89)
  - **intent:** Settings holds only Address book, Version and updates, and Remove all wallets from this device.
  - **success:** No per-wallet control, no Lock now, no auto-lock remains; one component serves `/settings` (chooser Settings key) and the in-wallet Settings tab, never both mounted; Remove all works with no wallet and no open lock, including for a hard-locked user, from the chooser's Settings key and from first-run Onboarding when a PIN or failure count remains.
- **CAP-12** Header split, Lock, update marker (AD-45, AD-33; PRD FR-83, FR-90, FR-14)
  - **intent:** The header differs by side, the wallet picker is gone, and locking and the update cue stay reachable.
  - **success:** The chooser header has nameplate and Settings key; the wallet header has Wallets key and, for an open lock only, `NetworkPlate`, Configure, and Lock when the Open Check is not `none`; a locked wallet's header is the Wallets key alone; Lock calls `tearDownLock` then `leaveToChooser()`; the chooser Settings key reads `Settings, update available` when an update waits, never a modal or redirect, and a declined release does not relight it.
- **CAP-13** Activity timer scoping and lifecycle (AD-31, AD-35; PRD FR-83, FR-10, FR-11)
  - **intent:** Only the entered wallet's lock counts activity, and expiry and background lock run on every route.
  - **success:** `useAutoLock` and `useClearCacheOnLock` mount once in the app shell above the route switch; `touchLock(null)` extends no expiry, timer or persisted session; chooser activity extends no lock; backgrounding and expiry close locks while the chooser shows.
- **CAP-14** Lock from an open card (AD-45, AD-38; PRD FR-84)
  - **intent:** A user locks a wallet without entering it, or sees why Lock is absent.
  - **success:** Lock flips that card, and any card on the same lock with a note naming them, to Locked in place through `tearDownLock`, announced in a polite live region; with Open Check `none` the line `No Open Check: this wallet opens itself, so there is nothing to lock.` is visible.

## Constraints

- No secret in `localStorage`, React state, a store, the URL or anything serializable; routes carry a screen name and at most a walletId, never a name, Seed, lock id or form data; a Seed lives in a ref, passed to keystore only, cleared in `finally` (AD-3, AD-32, AD-39).
- A locked wallet is its name and nothing else: no address, network, Node or check kind, and no hook reads for it; a locked Mainnet card is indistinguishable from a Testnet one until opened (AD-26, AD-43).
- The chooser side mounts no ledger read, no `useActiveWallet`/`useActiveNetwork`/`useActiveNode`, no `NetworkPlate` and no account-scoped key; any device-scoped read is a named exception on the key factory (AD-36, AD-4). Account-scoped keys keep active wallet and network.
- A failed read is never rendered as empty or current and never relaxes a guard; `aria-disabled` is presentation, the handler re-checks (AD-37, AD-33, AD-46).
- Every lock close, leave and remove goes through `lib/teardown.ts`; no inline `closeLock` or `queryClient.clear` (AD-16, AD-38, AD-45, AD-46).
- The App PIN and its failure count are deleted together, only by `discardAppPin`, only when no wallet and no lock record remain, atomically with that check; no other code resets the count (AD-46, AD-25, FR-13).
- Money stays strings/`BigInt`; the chooser shows no balance; never `Number()` a drops value.
- Touch targets are at least 44px on coarse pointers for every key, icon key, radio and checkbox row; two keys in a network row sit no closer than their hit areas.
- Nothing styles `:focus`; `outline-none` is banned. Focus: chooser h1 after leaving or Remove; new card h2 after Add; the opener after a dialog; main region on entering a wallet; one h1 per screen.
- Colour never carries meaning alone: lock state is lamp and word; Mainnet is the word and `Real funds`; Devnet is word, `Not stable` and `DEVNET_NOTICE`; a disabled Remove has visible reason text. `bun run check:contrast` stays green; no new colour token (DESIGN.md).
- Launch always lands on `/` via `rewriteBootLocation` before first render; Back from a wallet is the chooser, from the chooser leaves the app (AD-32, AD-33).
- No creation path and no Add wallet calls `setActiveWalletId` or enters the wallet; `activeWalletId` is the one selection field (AD-34, AD-40, AD-6).
- Policy: Import refuses Open Check `none` on every network; the Mainnet floor and written-Seed confirm apply to import (AD-39, AD-28).
- The name rule lives only in `lib/wallet-name.ts`; the name is local; existing duplicates are grandfathered; no copy promises a passkey's authenticator name changes on rename (AD-41, AD-42).
- Updates are never automatic; the update marker is never a modal or redirect. Licence copy never says open source.
- Each of AD-31, AD-35, AD-36, AD-37, AD-39 gets a test that fails when the rule is removed. Gates: `bun run lint`, `build`, `test`, `check:contrast`.

## Non-goals

- Balances on the chooser, and a Mainnet badge on locked cards.
- Any change to the legacy-lock first-run Onboarding import (own story after this epic, PRD open question 13), or to shared-lock auto-lock semantics beyond the disclosure on the Checks plate.
- Automatic updates; exchange, swap, fiat, staking or KYC features.
- A per-row Configure key on multi-view cards, incoming-payment notices on the chooser, a quick-switch picker, swipe, drag, long-press or overflow menus.

## Success signal

A user launches the app and sees only wallet names and lock states. Rui can open a locked wallet, press Wallets, rename and remove wallets, add an Imported one under its own lock while every card is locked, and configure each wallet, while Settings holds nothing per-wallet. At no point does a locked card, the chooser, or a failed read show an address, balance, or empty list. The UX Key Flows 1 to 6 run as written.

## Assumptions

- The PRD (`_bmad-output/planning-artifacts/prds/prd-xrpl-wallet-2026-09-12/prd.md`, FR-79 to FR-90 in section 4.3) was backfilled after this spec and the architecture, a one-off exception; each capability cites its FR. Where wording differs, the PRD owns the requirement and this spec owns the success test.
- The locked card shows no network (UX OQ-4), settled by AD-43.
- Both a chooser Settings key and an in-wallet Settings tab (UX OQ-13), adopted by AD-45.
- Cold-start rewrite covers `/settings` too (AD-32), deviating from the UX spine; reversing needs a served `/settings`.
- In-wallet Lock calls `leaveToChooser()` rather than replacing the entry with `/` (AD-33; UX OQ-11).
- Name limit is 40 code points; creation auto-suffixes colliding default names (AD-42; UX OQ-8).
- Configure on a multi-view card acts on the entry view: the `activeWalletId` view, else the first (AD-43; UX OQ-14).
- Leaving removes the wallet's account-scoped query data unless another open lock holds the same `(network, address)`; this is the architect's addition (AD-38).
- Multi-view unlock returns to the chooser (UX OQ-6); the `Active` legend stays (UX OQ-9); the UX strings tagged `[ASSUMPTION]` (blocked-leave reason, shared-lock and multi-view-unlock notes) are used as written.
- `docs/decisions.md` §6.12 is updated with the picker's removal in the header story; Checks plate wording is copied from `EditChecksScreen` (issues 8a-8i), not re-authored.

## Open Questions

None. Q5, Q6 and Q7 were answered by the owner on 2026-10-26: Q5, legacy wallets keep their lock's minutes (default 5) and may change them, disclosed on the Checks plate (AD-44); Q6, every import gets its own lock, first-run Onboarding import follows in its own story (PRD open question 13); Q7, removing the last wallet deletes the App PIN and failure count (AD-46, FR-13).
