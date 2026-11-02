---
id: SPEC-settings-split-by-owner
companions:
  - ../../planning-artifacts/architecture/architecture-xrpl-wallet-chooser-2026-10-19/ARCHITECTURE-SPINE.md   # ADOPTED: AD-50, AD-51; amended AD-32, AD-43, AD-44, AD-45, AD-46
sources: []
---

> **Canonical contract.** This SPEC and the spine in `companions:` are the complete contract for what to build, test, and validate. The requirement of record is PRD FR-94; where they differ, the PRD wins. It supersedes the Configure screen and the app-level Settings tab inside a wallet of spec-wallet-chooser, and the Configure key of spec-configure-owns-rename-remove.

# Settings Split by Owner

## Why

A pain, owner-raised 2026-11-02. "Remove all wallets from this device" sat in the Settings tab of a single wallet, beside a wallet's own Remove, and the wallet's Configure was a separate screen behind a header key. A user could not tell what belongs to one wallet and what belongs to the whole app. The wallet is meant to hold real Mainnet funds, and a destructive action next to the wrong scope is a risk. So every setting is the Wallet's or XRPL Bench's, never both, and the words on screen say which.

## Capabilities

- **CAP-1** The Wallet tab holds this wallet's settings (PRD FR-94, FR-88, FR-92; AD-51)
  - **intent:** A user finds everything about one wallet in one place inside that wallet, and sees whose settings they are.
  - **success:** The sixth in-wallet tab is "Wallet". Its visible heading is "Settings for <name>" with the Network beside it (Mainnet "Real funds", Devnet "Not stable"); the other tabs keep a screen-reader-only heading. It holds, in one column and in this order, an identity plate, Name, Address Book, Checks with auto-lock, Seed, Operating another account, Node, Two-device signing, and Remove this wallet last; there is no jump list. The Configure screen, `/wallets/:id/configure` and the header's Configure key no longer exist, with no alias. Edit checks, Let another wallet sign and Two-device signing open only from this tab, read "Back to Wallet", and return to the tab with focus on the key that opened them. The app-level settings are not mounted inside a wallet; a test fails if the Wallet tab shows Remove all wallets or Version and updates.
- **CAP-2** The Address Book belongs to a Wallet (FR-45, FR-21, FR-13; AD-50, AD-46)
  - **intent:** A wallet shows only the addresses it sent to, and nothing it sent to reaches another wallet.
  - **success:** The book is stored per wallet and read only in the wallet shell; the Send first-time-destination warning tests only the sending wallet's entries, and a wallet with no list (or an unread store) shows the warning; an old array-shaped book is read as empty and does not fail startup; a controlled Wallet has its own book; removing a wallet removes its entries and Remove all clears them all; the Address Book plate shows the first 10 entries and "Show all N" beyond that; the "Remove this wallet" plate names the wallet and its Address Book; tests fail if the book is read from another wallet's key or the warning is silenced by another wallet's entry.
- **CAP-3** XRPL Bench's settings hold only app-level things (FR-89, FR-94)
  - **intent:** A user finds what belongs to the whole app in one place, on the chooser, and nowhere inside a wallet.
  - **success:** The chooser's key reads "XRPL Bench"; its page heading is "XRPL Bench settings" and it opens with "These settings are for the whole app. Each wallet's own settings are inside that wallet." It holds Version and updates, and one plate "All wallets on this device" with the action "Remove all wallets from this device", which states how many wallets will be removed and that the App PIN goes too. It has no Address Book and no per-wallet control; a test fails if it renders either.
- **CAP-4** Inside a wallet the Wallets key carries the update marker (FR-90; AD-45)
  - **intent:** A user working inside a wallet still learns that an update is waiting, without being able to apply it there.
  - **success:** With an update waiting, the header's Wallets key reads "Wallets, update available" in its accessible name, with the lamp, from the one shared predicate `useUpdateMarker`; a declined release does not light it; the update is applied only in `/settings` (with its in-flight-transaction guard); the Wallet tab carries no marker.

## Constraints

- The quiz (FR-91), Rename and Remove rules and confirm bodies, the lock model, the policy and the Mainnet floor, Remove all behaviour, and the Version and updates content are not changed.
- No backward compatibility (AD-48): the old shared Address Book is dropped, never migrated and never an error. The Address Book is stored in the same persisted slice (`xrpl-wallet-app-state`), so it adds no persistence owner (AD-50).
- Remove acts through `removeWalletData` in the teardown owner (AD-16, AD-46), run in `finally`; it must not throw.
- The chooser reads no Address Book and mounts no wallet read (AD-36). Account-scoped reads stay in the wallet shell and never relax a guard. A failed read is never shown as empty or current.
- The task screens' focus-return stays module state, never in the URL or history state, and holds no secret (the `configure-launch.ts` contract).
- Plate vocabulary from `DESIGN.md`; no new colour token; nothing styles `:focus`; no `outline-none`; scope and Network are carried by words, never colour alone (NFR-6). 320px, 200% text and 44px touch targets on coarse pointers (NFR-9).
- Wording follows ASD-STE100: short sentences, one idea each, each new sentence under 21 words.

## Non-goals

- No in-page jump list and no tabs inside the Wallet tab.
- No new setting, no change to what any plate does.
- No change to the chooser cards, Open, Lock, or the Version and updates plate.
- No migration of the old Address Book and no per-network split of a book.
- No Signer or Transmitter Wallet work (PRD 6.3).

## Success signal

Inside a wallet the Wallet tab is that wallet's settings, headed "Settings for <name>" and its Network, with the Address Book and Remove this wallet in it and nothing about the whole app. On the chooser, "XRPL Bench" opens the app's settings, which hold Version and updates and "All wallets on this device" only. Sending to an address another wallet already paid shows the first-time warning. An update waiting shows as "Wallets, update available" in a wallet and is applied only on the chooser. Every existing rename, remove, lock and send test passes against its new home.

## Assumptions

- The 10-entry Address Book limit is the UX pass's default, not an owner figure.
- The identity plate shows the name and Network; it repeats the address only if the wallet header does not already show it. The builder checks the header.
- The tab keeps `OpenWallet`'s local tab state (AD-32), so a task screen's Back returns to the Wallet tab; the route stays `/wallets/:id`.
