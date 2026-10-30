---
id: SPEC-configure-owns-rename-remove
companions: []
sources: []
---

> **Canonical contract.** This SPEC is the complete, preservation-validated contract for what to build, test, and validate. The requirement of record is PRD FR-92; where they differ, the PRD wins. It supersedes the card Rename, Remove and Configure of chooser stories 18.1, 18.2 and 19.1 (spec-wallet-chooser).

# Configure Owns Rename and Remove

## Why

A pain, owner-raised 2026-10-30. Each chooser card carries Configure, Rename and Remove beside Open and Lock, so the chooser, which should show a name and nothing else on a locked card, is crowded with per-wallet controls, and a destructive Remove sits one tap from Open. Everything that belongs to one wallet already has a home, the Configure screen, which exists only while the wallet's lock is open. Rename and Remove belong there, and the chooser is left to choose and lock. The wallet is meant to hold real Mainnet funds, so no rule that guards Remove or Rename may weaken in the move.

## Capabilities

- **CAP-1** Rename is a Configure section (PRD FR-92, FR-85; AD-41, AD-42)
  - **intent:** A user renames a Wallet from its Configure screen, with the rules renaming has today.
  - **success:** Configure shows a Name section; Save accepts 1 to 40 characters unique case-insensitively among other Seeds, writes the Seed record without bumping `rev` or asking a lock, and every row of the Seed shows the new name; a failed write shows the existing "nothing changed" text and keeps the typed name; nothing reaches the ledger; the dialog or screen returns focus to the Name section.
- **CAP-2** Remove is a Configure section (FR-92, FR-86, FR-13; AD-46, AD-16)
  - **intent:** A user removes the Wallet view they are inside from its Configure screen, with the guards removal has today.
  - **success:** Configure shows a Remove section; its confirm uses the sibling-view, sole-view or last-wallet body; the lock is re-checked at call time even if the control is activated while the lock closed; teardown runs through `lib/teardown.ts` in `finally`; `activeWalletId` never names a removed wallet; removing the last wallet returns to first run and deletes the App PIN and its failure count in one step; any other removal returns to the chooser with focus on its heading; Remove all in Settings is unchanged.
- **CAP-3** Chooser cards show only Open and Lock (FR-92, FR-81, FR-84)
  - **intent:** A card is for choosing and locking, so it carries no per-wallet settings control.
  - **success:** An open card renders Open and Lock and no Configure, Rename or Remove; a locked card renders its name, the Locked word and Open and nothing else, so its type has no field a control could read; a screen test fails if any of the three controls renders on a card; the "Open this wallet to remove it" text no longer exists.
- **CAP-4** Configure is reached from the header only (FR-92, FR-88)
  - **intent:** A user reaches a Wallet's Configure screen from inside that Wallet.
  - **success:** The wallet header's Configure key opens `/wallets/:id/configure`; no chooser card links to it; the route still resolves only with the lock open and otherwise returns to the chooser; Back from Configure returns to the Wallet.

## Constraints

- The rules move unchanged: FR-85's name rule (AD-41, AD-42) and FR-86's remove rules (AD-46, AD-16, FR-13). Each keeps its own tests, re-pointed to the Configure surface.
- Remove re-checks its lock at call time, never relying on a disabled control, and removal runs teardown in `finally` (AD-46).
- The last Wallet removed deletes the App PIN and its failure count atomically with the emptiness check, as AD-46 requires.
- Configure exists only with the lock open (FR-88), so no locked card can offer Remove or Rename.
- A short confirm may stay a dialog; any multi-step or multi-input flow is a screen (project rule for mobile). It works at 320px and 200% text, with 44px touch targets on coarse pointers.
- No new colour token; Configure's plate vocabulary (`ConfigPlate`) from `DESIGN.md`; nothing styles `:focus`; no `outline-none`.
- Wording stays short and plain (ASD-STE100), consistent with the quiz epic's wording rule.

## Non-goals

- No change to the quiz (Epic 20), Settings, or Remove all.
- No new tab or navigation, and no new Configure route.
- No change to what Edit checks, Reveal seed, Other networks, Node or Two-device signing do.
- No change to the lock model, the keystore, or how a wallet is written.

## Success signal

On the chooser a user sees one card per Seed with Open (and Lock while open) and nothing else; inside a wallet, Configure holds its name and its removal with the same guards as before, and removing the last wallet still ends at first run with the App PIN gone. Every existing rename and remove test passes against its new home.

## Assumptions

- The Name section comes first and the Remove section last in Configure's order. Not in the PRD; settle in the UX pass.
- After a Remove inside Configure the app returns to the chooser (first run if it was the last Wallet) through the existing leave-to-chooser unwind, with focus on the chooser heading.
- Remove acts on the entered Wallet view only (one network row of a Seed), as FR-86 does today.
