---
id: SPEC-offline-signing
companions:
  - consequence-texts.md
  - route-checks.md
  - product-prd-changes.md
  - ../../planning-artifacts/prds/prd-xrpl-wallet-2026-09-12/prd.md
  - ../../planning-artifacts/prds/prd-offline-signing-2026-11-07/addendum.md
  - ../../planning-artifacts/prds/prd-offline-signing-2026-11-07/fact-check.md
sources:
  - ../../planning-artifacts/prds/prd-offline-signing-2026-11-07/prd.md
  - ../../planning-artifacts/prds/prd-offline-signing-2026-11-07/cases.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Offline Signing

Planned, not built. Covers the offline signing feature PRD (OS-FR-1 to OS-FR-23); the OS-FR ids are the requirement references. The product PRD stays authoritative for every shared rule; `product-prd-changes.md` lists the rules this feature changes.

## Why

A vision and a pain. Every XRPL Bench Wallet keeps its key on a device that is online, and the one way to keep it elsewhere (two-device signing, FR-78) is hidden in settings, covers three transaction types and gives four to six minutes. "Where does the key live?" becomes a first-class choice: a Wallet is Online, Offline (holds a key, never touches the ledger, has a Network but no Node) or Transmitter (no key, carries Signed Transactions to the ledger). One operator owns both devices. Every submission, for every kind, goes through one Transmit step, so the offline route is the same feature as the online one, and the later multi-signing feature builds on it.

## Capabilities

- **CAP-1**
  - **intent:** Every Wallet has exactly one kind: Online, Offline or Transmitter (OS-FR-1).
  - **success:** The chooser card shows the kind in words; an Offline card shows "Offline" and its Network, a Transmitter card its Network and, when Synced, the address; existing records read as Online Wallets with no change and no migration.
- **CAP-2**
  - **intent:** The create and import quiz asks "Online wallet or offline wallet?" in step 1, after Create or Import and before Label and Network, with its consequences (OS-FR-2, OS-FR-7, OS-FR-8).
  - **success:** Text A or B shows before the user can continue; Offline keeps the Network question and drops the Node question; text B's two warnings must be acknowledged; Mainnet safeguards apply to an Offline Mainnet Wallet exactly as online; import works for both kinds and importing into an Offline Wallet shows text E, which must be acknowledged; an offline Passkey-Derived Seed on a synced or unknown passkey shows the synced-passkey warning, never a refusal.
- **CAP-3**
  - **intent:** From the chooser, a user adds a Transmitter Wallet (Label and Network, no Seed) and can Sync it to an address (OS-FR-3, OS-FR-4).
  - **success:** It can be made with or without an address; it never signs and nothing in it offers to; it has a Node and its own Open Check and auto-lock under FR-65 (required on Mainnet), and no written-Seed or passkey-origin safeguard; Sync shows the Account read-only (balance, history, trust lines) and can be changed or removed without re-creating; an unsynced one still transmits and answers requests; the same address as an Offline and a Transmitter Wallet on one device is warned, never refused.
- **CAP-4**
  - **intent:** A user changes a Wallet's kind from its settings, seeing the consequences again (OS-FR-5, OS-FR-6, OS-FR-7).
  - **success:** "Change to an offline wallet" shows text C and a confirm, removes the Node, keeps Network, address, Seed and checks, adds the permanent Was-online mark and shows the never-online steps; "Change to an online wallet" shows text D, is irreversible-class, keeps the Network, asks for a Node and refuses the same address on the same Network; the mark survives online-and-back and is never on an imported Offline Wallet.
- **CAP-5**
  - **intent:** Every write, for every Wallet kind, reaches the ledger through one Transmit step (OS-FR-9).
  - **success:** It verifies the signature and the expected Account (Synced address, else the answered request's Account, else the one confirmed on screen); refuses a Network mismatch, a transaction past its LastLedgerSequence and a partial payment; sends only on the named Network; never resubmits a possibly-applied transaction; outcome rules are today's.
- **CAP-6**
  - **intent:** On Online and Transmitter Wallets, a per-Wallet setting "Show the signed transaction before sending" lets the user see and copy the Signed Transaction before it is sent (OS-FR-10).
  - **success:** Off by default for every Wallet, new and existing; when on it shows the hash, decoded fields and a copy button, then "Send it to the ledger?"; declining sends nothing; declining and copying both warn that the blob stays valid and anyone holding it can send it until its window ends.
- **CAP-7**
  - **intent:** An Offline Wallet hands its Signed Transaction out by QR and never transmits (OS-FR-11).
  - **success:** No Send button anywhere in it; its last screen is the signed QR, which names the Network and says the transaction is not sent until a Transmitter sends it and until when it is valid.
- **CAP-8**
  - **intent:** An Offline Wallet Builds Send, trust line and key actions with the online screens, minus every read (OS-FR-13).
  - **success:** Each read is stated as coming from the Transmitter, never guessed or blank-as-zero; the Build is kept after signing until the outcome is marked known, cancelled or replaced, and a lock erases it.
- **CAP-9**
  - **intent:** After review, the Offline Wallet asks for Data to Sign by QR and a Transmitter Wallet answers it after the online pre-flight checks (OS-FR-14, OS-FR-15).
  - **success:** The request appears only after review and nothing can change without restarting it; the Transmitter refuses in the online words whatever online Send refuses, never answers from a failed read, uses its own Network, and before a key change shows the key state and W4/W5, stating a failed read as unknown.
- **CAP-10**
  - **intent:** The Offline Wallet signs only a transaction made from its kept Build plus a well-formed Data to Sign, and a retry never pays twice (OS-FR-16).
  - **success:** Every Offline-builds rule in `route-checks.md` holds: exact Data to Sign set with matching request ID and Build hash, own LastLedgerSequence (~10 minutes), highest-seen ledger warning, fee cap, Network and Account refusals, Network in large type before the Signing Check; a Same Build shows the earlier signing's record and re-signs with that Sequence unless the user confirms "This is a new payment"; no signed blob is stored.
- **CAP-11**
  - **intent:** A Synced Transmitter Wallet Builds an Unsigned Transaction for any write the app can build, and the Offline Wallet shows every field before signing it (OS-FR-17, OS-FR-18).
  - **success:** Every Transmitter-builds rule in `route-checks.md` holds: every field and flag in words, Network large, expiry and window shown; refuses what it cannot show, a foreign Network or Account, a pre-set signature, a Fee over the cap and a partial payment; strong warnings on the listed risky fields; refusing signs nothing.
- **CAP-12**
  - **intent:** When the feature ships, "Operating another account" (FR-75) and "Two-device signing by QR" (FR-78) are replaced (OS-FR-19).
  - **success:** Both screens are gone from Local settings; a key can still Sign for another Account; today's controlled Wallets are not converted (FR-95); the product PRD's planned-change pointers read as replaced.
- **CAP-13**
  - **intent:** An Online or Offline Wallet records the Account it Signs for separately from its key address (OS-FR-20).
  - **success:** Set by an optional "This key signs for another account" step at create or import, changeable in settings, and offered after an in-app Regular Key change; the card and the Data-to-Sign Request carry it; offline checks compare the transaction's Account with it and the signing key with this Wallet's key; the Transmit step accepts master (when enabled) or current Regular Key signatures; FR-93's same-address refusal compares Signs-for Account and Network.
- **CAP-14**
  - **intent:** For every Wallet kind, the user sets, replaces or removes a Regular Key and turns the master key off or on whenever the ledger allows, with warnings and no app refusal (OS-FR-21).
  - **success:** Any address is accepted; ledger refusals (`temBAD_REGKEY`, `tecNO_ALTERNATIVE_KEY`, `tecNEED_MASTER_KEY`) are said in plain words, never as a code; W1–W5 appear in their situations before the Signing Check; key state is read from the ledger and a failed read is unknown, never safe; master key off stays irreversible-class.
- **CAP-15**
  - **intent:** A Synced Transmitter Wallet shows the Account's delegates and what each may do, with a warning that a delegate can act for the Account (OS-FR-22).
  - **success:** No delegates shows "none"; a failed read shows unknown; no control sets or removes a delegate.
- **CAP-16**
  - **intent:** The user is warned not to use one Seed on more than one Network (OS-FR-23).
  - **success:** The warning shows on create and import, for every kind that holds a Seed, before the Seed is saved.

## Constraints

- Consequence texts A–E, warnings W1–W5, the OS-FR-23 warning and the fixed strings are shown in the words in `consequence-texts.md`; UX lays them out and never rewords them (OS-FR-12).
- An Offline Wallet never reads from or sends to the ledger. It has a Network and no Node; the Network is what the two devices agree on and both screens show.
- The Offline Wallet builds a transaction only from its kept Build plus the exact Data to Sign set; no other value from the online device is used.
- Trust the user: the app warns, never refuses, on Regular Key and master key actions, a synced passkey, and an Offline plus Transmitter Wallet for one address. It refuses only what it cannot show in words or what is malformed. Ledger refusals stay.
- Mainnet safeguards (FR-63, FR-65, FR-72) are required for an Offline Mainnet Wallet, and Open Check with auto-lock for a Mainnet Transmitter. Never skippable.
- Offline to online and master key off are irreversible-class: a typed or held confirm plus the Wallet's Signing Check.
- Devices talk only by QR, one payload per QR, one transaction per round. No server or relay.
- Inherited, unchanged: money as strings/BigInt; no secret in storage, state or URL; every ledger read through the key factory scoped to Wallet and Network; a failed read is never empty, current or safe; the service worker never caches RPC; outcomes as today (`unknown` per decisions §16); fee cap per decisions §14; the app never builds a partial payment (FR-58).

## Non-goals

- Multi-signing: signer lists, quorum, collecting several signatures (next feature PRD).
- Making the device offline; the app cannot turn off radios or prove a device is offline.
- Hardware wallets.
- Signing ahead of time, several transactions per round, Tickets.
- A server or relay between devices.
- Setting or removing delegates (`DelegateSet`).
- A multi-frame QR.
- Migrating today's controlled accounts.

## Success signal

- **OS-SM-1.** A Testnet payment completes by the Offline-builds route in three QR scans (request, Data to Sign, signed), with no field typed twice.
- **OS-SM-2.** Every write the app can build online can be built and signed offline by at least one route.
- **OS-SM-3.** XRPL Bench never submits a Signed Transaction on a Network other than the one it names.
- **OS-SM-C1 (counter).** No confirm or warning is removed to make the round faster.

## Assumptions

- A Transmitter Wallet's unlock is proven by decrypting known ciphertext that architecture provides (PRD OS-FR-3).
- Data to Sign reaches the Offline Wallet by QR (PRD OS-FR-15).
- Architecture sets the ledger count for the ~10 minute window, the ledger-jump margin, the codec kinds for the request and Data to Sign, and the Transmit step as the split-out submit half of today's write path (`addendum.md`).

## Open Questions

- Can a Data-to-Sign Request or Unsigned Transaction for a large Build exceed one QR (2,331 bytes)? Multi-frame QR is out of scope.
