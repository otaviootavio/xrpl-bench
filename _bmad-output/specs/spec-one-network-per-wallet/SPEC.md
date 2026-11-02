---
id: SPEC-one-network-per-wallet
companions:
  - ../../planning-artifacts/architecture/architecture-xrpl-wallet-chooser-2026-10-19/ARCHITECTURE-SPINE.md   # ADOPTED: AD-47, AD-48, AD-49; amended AD-36, AD-39, AD-43
sources: []
---

> **Canonical contract.** This SPEC and the spine in `companions:` are the complete contract for what to build, test, and validate. The requirement of record is PRD FR-93; where they differ, the PRD wins. It amends the chooser card, the duplicate check and "Other networks" of spec-wallet-chooser, and the locked card of spec-configure-owns-rename-remove.

# One Network per Wallet

## Why

A pain, owner-raised 2026-11-02. Opening a wallet that holds several networks drops the user on a selector after unlock, and a Mainnet Wallet sits one row from a Testnet one under the same lock. The wallet is meant to hold real Mainnet funds, and the risk is real funds sent or opened on the wrong Network. So a Wallet is one address on one Network for life, the chooser says which before it opens, and a Mainnet Wallet is a different Wallet, not a setting.

## Capabilities

- **CAP-1** A Wallet has one Network for life (PRD FR-93, FR-38, FR-61, FR-88; AD-47)
  - **intent:** A user never switches a Wallet's Network and never adds another Network to it.
  - **success:** "Other networks" and `addNetworkView` no longer exist; creation and import write exactly one view; no function changes a view's Network after creation; a test fails if a record is written with two views that both lack `accountAddress`; Rename and Remove act on one Wallet and their confirm bodies no longer offer "a sibling network view stays" except for a controlled account.
- **CAP-2** The duplicate key is address plus Network (FR-87; AD-39, AD-49)
  - **intent:** The same Seed can be two Wallets on two Networks, and one Account is never held twice on one Network.
  - **success:** Importing a Seed whose address is already on the device on the same Network is refused before any prompt, lock write or ledger read, with a reason that names the Network and points nowhere; the same Seed on another Network is allowed and gets its own record, ciphertext and lock; the probe takes the Network chosen on quiz step 1 and runs again when it changes; a test fails if the Network is dropped from the key.
- **CAP-3** A card shows name, address and Network (FR-81; AD-36, AD-43)
  - **intent:** The user sees which Network a Wallet is on before opening it.
  - **success:** One card per Wallet, locked or open, shows name, address and Network, with "Real funds" on Mainnet and "Not stable" on Devnet as words; the locked variant's type carries only `walletId`, `lockId`, `label`, `address` and `network`, so no Node, check kind or balance can render; there are no network rows; the chooser makes no ledger read (the existing zero-read screen test still passes); every address renders through `AddressLink` with the card's own `network`.
- **CAP-4** Open enters that Wallet (FR-82, FR-83; AD-43)
  - **intent:** Opening a Wallet enters that Wallet and no other.
  - **success:** A closed lock asks its own Open Check and then enters the Wallet; an open lock is entered directly; Open and Configure carry one `walletId`; the return to the chooser after unlocking a Seed with several views and the entry-view rule are gone; a Mainnet Wallet is entered only by choosing its own card.
- **CAP-5** Mainnet Import states one fact (FR-93; AD-49, AD-48)
  - **intent:** A user importing a Seed on Mainnet is told once, neutrally, that the same key works on Mainnet.
  - **success:** The Review step of an Import on Mainnet shows "A Seed you used on another Network is the same key on Mainnet." beside "Real funds"; it blocks nothing and is not an input to `checkWalletRequest`; no other Network and no Create path shows it; the release note says older multi-network wallets are not supported.

## Constraints

- No backward compatibility (AD-48): no migration, no reset screen, no handling of an old multi-network record. Storage stays "Seed record plus views" and the keystore is not rewritten (AD-47).
- Controlled accounts (`addControlledView`, FR-75, FR-77) and two-device QR signing (FR-78) are unchanged. A controlled Wallet shares its key-holder's lock, the one exception to "its own lock" (AD-47).
- Every ledger read stays out of the chooser (AD-36); a card reads only what the device holds. A locked card never carries a Node, check kind or balance, by type (AD-43).
- The policy (`describeOptions`, `checkWalletRequest`, AD-28), the Mainnet floor, the lock model, PIN entry, the Seed backup and the quiz steps (FR-91) are not changed.
- The duplicate check runs before any prompt, lock write or ledger read, so a refused Seed issues no read carrying its address (AD-39).
- Plate vocabulary from `DESIGN.md`; no new colour token; nothing styles `:focus`; no `outline-none`; Network is carried by words, never colour alone (NFR-6). 320px, 200% text and 44px touch targets on coarse pointers (NFR-9).
- Wording follows ASD-STE100: short sentences, one idea each; each new sentence is under 21 words.

## Non-goals

- No Signer or Transmitter Wallet, no offline Wallet without a Network (PRD 6.3).
- No change to controlled accounts, Regular Key, master-key flags or two-device signing.
- No new flow for putting a Seed on a second Network, and no "use on another network" key.
- No migration, reset screen or compatibility code; no keystore rewrite.
- No change to the quiz's steps, Rename's rule, Remove's guards, the App PIN rules or Settings.

## Success signal

On the chooser a user sees one card per Wallet with its name, address and Network, Mainnet marked "Real funds", whether locked or open. Open enters exactly that Wallet, asking its own Open Check when its lock is closed. There is no network switch, no "Other networks" and no selector after unlock. Importing a Seed on Mainnet that sits on Testnet is allowed and shows one neutral sentence; importing the same Seed on the same Network is refused. Every existing policy, lock and teardown test passes.

## Assumptions

- The Mainnet Import sentence's wording is mine, settled here for PRD open item 14: "A Seed you used on another Network is the same key on Mainnet." The owner can change it in review.
- The release note (FR-49) is not in the repository; the line is written wherever the release note is written, not in the app.
- `walletIdsInChooserOrder` and `nextActiveWalletId` in `store/wallet-groups.ts` keep their rules; only the card selector changes.
