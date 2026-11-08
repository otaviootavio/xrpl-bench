# Changes to the product PRD

The product PRD (`prd-xrpl-wallet-2026-09-12/prd.md`) stays authoritative for
every shared rule. This feature changes only the rules below. Commit `a22bb3b`
already added "Planned change" pointers for each; when the feature ships they
become "Replaced by" (OS-FR-19).

| Product PRD | Change | By |
|---|---|---|
| §2.2 "one operator, one device" | One operator, two devices | §2.2 of the feature PRD |
| FR-24 "Retry issues a fresh transaction with a new sequence number" | For an Offline Wallet, a retry of a Same Build reuses its Sequence unless the user confirms "This is a new payment" | OS-FR-16 |
| FR-63 recovery via a Controlling Wallet | Recovery via a key that Signs for the Account | OS-FR-20 |
| FR-75 Controlling Wallet, on-device targets only | Removed; any address can be the Regular Key; the app warns, never refuses | OS-FR-19, OS-FR-20, OS-FR-21 |
| FR-77 master key off offered only after a validated on-device Regular Key | Never refused by the app; warned (W1–W5, test offered); stays irreversible-class | OS-FR-21 |
| FR-78 Two-device signing by QR (three types, ~5 min) | Removed; replaced by Wallet kinds and the two routes for every write, ~10 min | OS-FR-19, OS-FR-17 |
| FR-91 create quiz step 1 | Adds the kind question after Create or Import, before Label and Network; an Offline Wallet skips the Seed Method question (Stored Seed only) | OS-FR-2, OS-FR-8 |
| FR-93 same address on same Network refused | Compares the Signs-for Account and the Network; Offline and Transmitter for one address on one device are warned, not refused | OS-FR-20, OS-FR-3 |
| FR-93 / FR-95 controlled-Wallet lock exception | Gone with FR-75; no migration of controlled Wallets | OS-FR-19 |
| FR-94 Local settings list (Operating another account, Two-device signing) | Both removed; adds the kind change and "Show the signed transaction before sending" | OS-FR-5, OS-FR-6, OS-FR-10, OS-FR-19 |
| Glossary "Controlling Wallet"; §6.2 "Offline signing" | Point to the feature PRD | OS-FR-19 |

Unchanged on purpose: FR-58 (no partial payment), FR-59 (failed reads), FR-65
and FR-72 (Mainnet safeguards), FR-12 (locks), the fee cap
(`docs/decisions.md` §14), the `unknown` outcome (§16).
