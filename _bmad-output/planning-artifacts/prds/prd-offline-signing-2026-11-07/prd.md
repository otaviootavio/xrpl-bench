---
title: XRPL Bench — Offline signing
status: final
created: 2026-11-07
updated: 2026-11-07
parent: _bmad-output/planning-artifacts/prds/prd-xrpl-wallet-2026-09-12/prd.md
---

# PRD: Offline signing

## 0. Document Purpose

This is a **feature PRD**. It adds one layer to XRPL Bench: a key that never
touches the network, and the devices and steps that carry its transactions to
the ledger. It is written for the UX, architecture and spec work that follows.

**The product PRD stays authoritative for everything shared**
(`prd-xrpl-wallet-2026-09-12/prd.md`, called "the product PRD" below): money
as strings, failed reads never shown as current, the Signing Check, locks, one
Network per Wallet (FR-93), expiry handling (FR-24) and the non-goals. The fee
cap is defined in `docs/decisions.md` §14. This document does not restate those
rules. It names a product-PRD FR only where it changes it.

**Requirement IDs** are prefixed `OS-` (OS-FR-1, OS-SM-1) so they never clash
with the product PRD's FR-1 to FR-95. The later multi-signing PRD will use its
own prefix.

**Source.** Discovery was a conversation with the owner on 2026-11-06 and
2026-11-07; every decision is in `.memlog.md` beside this file. Earlier ideas
for the area are in
`_bmad-output/brainstorming/brainstorm-advanced-wallet-features-2026-10-06/`.

**What this replaces.** This feature replaces two controls built today:
"Operating another account" (product PRD FR-75) and "Two-device signing by QR"
(FR-78). They stay as they are until this feature ships (OS-FR-19).

## 1. Vision

A self-custody wallet is only as safe as the device that holds the key. Today
every XRPL Bench Wallet keeps its key on a device that is online. The one way to
keep a key elsewhere, two-device signing, is hidden in settings, covers three
transaction types and gives the user four to six minutes.

This feature makes **"where does the key live?"** a first-class choice. A Wallet
is either an **Online Wallet** or an **Offline Wallet**. An Offline Wallet never
reads from or sends to the ledger. It has a Network, because both devices must
agree on it, but no Node. A third kind, the **Transmitter Wallet**, holds no key
and carries Signed Transactions to the ledger. Together they let every action
the app can build (sending, trust lines, keys) be built, signed on the offline
device and sent from the online one, with the user seeing exactly what they sign
and on which Network.

Underneath, every submission to the ledger goes through **one Transmit step**,
for every Wallet kind. That single step makes the offline route the same feature
as the online one rather than a parallel copy, and it is the base the
multi-signing feature will build on.

## 2. Target User

### 2.1 Jobs To Be Done

- **Keep a large balance behind a key that has never been online**, and still
  send from it without moving the key.
- **Know, before signing, exactly what is signed and for which Network**, on a
  device that cannot check the ledger itself.
- **Change an existing Wallet's kind** and understand, in plain words, what that
  does and does not protect.
- **(Advanced) See the Signed Transaction before it is sent**, and copy it.

### 2.2 Non-Users

One operator, as in the product PRD §2.2, but no longer one device: the operator
owns both devices. This changes product PRD §2.2 ("one operator, one device").
Two people sharing control of one Account is multi-signing, a later feature.

### 2.3 Key User Journeys

- **OS-UJ-1. Otavio sends from his offline Wallet, building on the offline
  phone.**
  - **Context:** his savings Wallet is an Offline Wallet on an old phone with
    Wi-Fi, data and Bluetooth off. His daily phone has a Transmitter Wallet for
    the same address.
  - **Path:** on the old phone he opens the Offline Wallet, fills Send
    (destination, amount, tag) and reviews it. The app shows a Data-to-Sign
    Request QR: "Data to sign needed". On the daily phone he opens the
    Transmitter Wallet and scans it. The Transmitter reads the ledger, runs the
    same checks Send runs online (destination, reserve, balance) and shows a QR
    with the Data to Sign. The old phone scans it, checks it, and shows the whole
    transaction with **Mainnet** in large type. He passes the Signing Check. The
    old phone shows the signed QR. The daily phone scans it, verifies it and
    sends it.
  - **Climax:** "Validated" on the daily phone, with the amount and hash.
  - **Edge case:** he is slow and the window passes. The Transmitter says
    "Expired. Nothing was sent." and he starts the Data to Sign round again. The
    offline phone kept the Build, so he does not fill it again.

- **OS-UJ-2. Otavio builds on the daily phone and signs on the old one.**
  - **Path:** on the Transmitter Wallet (Synced to the address) he fills Send.
    The Transmitter builds the Unsigned Transaction and shows its QR. The old
    phone scans it and shows every field and the Network. He passes the Signing
    Check and it shows the signed QR. The Transmitter verifies and sends.
  - **Climax:** "Validated".

- **OS-UJ-3. Otavio moves an existing Wallet offline.**
  - **Path:** in the Wallet's settings he presses "Change to an offline
    wallet", reads the consequences (OS-FR-12, text C) and confirms. The Wallet
    loses its Node, keeps its Network, and gains the Was-online mark.
  - **Resolution:** the app suggests making a never-online key instead, and
    shows how.

## 3. Glossary

Terms from the product PRD §3 (Wallet, Account, Seed, Signing Check, Network,
Node, Regular Key, Account Master Key) keep their meaning.

**Wallets**

- **Wallet kind** — one of Online Wallet, Offline Wallet, Transmitter Wallet.
  Every Wallet has exactly one.
- **Online Wallet** — a Wallet that holds a key and talks to one Network.
  Today's Wallet. Its Network is fixed for life (FR-93).
- **Offline Wallet** — a Wallet that holds a key and never reads from or sends
  to the ledger. It has one Network, fixed for life like any Wallet (FR-93),
  and no Node. The Network is what the two devices must agree on.
- **Transmitter Wallet** — a Wallet that holds no key, belongs to one Network,
  and sends Signed Transactions to the ledger. It may be Synced.
- **Sync to an address** — the Transmitter Wallet action that attaches it to
  one Account address, giving a read-only view of that Account (balance,
  history, trust lines). A Synced Transmitter Wallet can build Unsigned
  Transactions for that Account.
- **Signs for** — the Account a Wallet's key signs for. Usually the key's own
  address; it can be another Account whose Regular Key this key is.
- **Was-online mark** — the permanent mark on an Offline Wallet whose key was
  once held by an Online Wallet.
- **Mainnet safeguards** — the steps the product PRD requires before a Wallet
  holds real funds: an Open Check and an auto-lock of at least one minute
  (FR-65), a confirmed written Seed for a passkey-only Wallet (FR-72), and no
  Passkey-Derived Seed on a temporary origin (FR-63). Required, never skippable.

**Transactions**

- **Build** — fill in what a transaction does (type, destination, amount,
  token, limits) and review it.
- **Same Build** — two Builds with the same content (type, destination,
  amount, token, tag, flags), compared by a hash of that content.
- **Data-to-Sign Request** — the QR an Offline Wallet shows after a Build,
  asking a Transmitter Wallet for Data to Sign.
- **Data to Sign** — the ledger values a Built transaction still needs before
  it can be signed: Sequence, Fee, the validated ledger index and the Network.
  Supplied by a Transmitter Wallet. The Offline Wallet sets LastLedgerSequence
  from the ledger index itself.
- **Unsigned Transaction** — a complete transaction with every field set,
  waiting for a signature.
- **Signed Transaction** — a transaction with its signature, ready for the
  Transmit step.
- **Transmit step** — the one step every Signed Transaction passes through to
  reach the ledger, for every Wallet kind.

**Routes**

- **Offline-builds route** — the Offline Wallet Builds, receives Data to Sign,
  and signs. The Transmitter Wallet only transmits. (OS-UJ-1)
- **Transmitter-builds route** — the Synced Transmitter Wallet Builds the
  Unsigned Transaction; the Offline Wallet only signs. (OS-UJ-2)

## 4. Features

### 4.1 Wallet kinds

**Description:** Every Wallet has a kind. The create quiz asks for it first,
with its consequences. A Wallet's kind can be changed later from its own
settings, with the consequences shown again. A Transmitter Wallet is added from
the chooser like any Wallet but holds no Seed.

#### OS-FR-1: Every Wallet has one kind

A Wallet is an Online Wallet, an Offline Wallet or a Transmitter Wallet.

**Consequences (testable):**
- The chooser card shows the kind in words, not only an icon.
- Existing Wallet records are read as Online Wallets, with no change to
  address, Network or checks. No data migration (FR-95).
- An Offline Wallet card shows "Offline" and its Network; a Transmitter Wallet
  card shows its Network and, when Synced, the address.

#### OS-FR-2: The create quiz asks "Online wallet or offline wallet?"

The create and import quiz (product PRD FR-91) asks for the kind in step 1,
right after Create or Import and before Label and Network. Each answer shows its
consequences (OS-FR-12, texts A and B) before the user can continue.

**Consequences (testable):**
- Choosing Offline Wallet keeps the Network question and removes the Node
  question.
- The Mainnet safeguards apply to an Offline Wallet on Mainnet exactly as to an
  Online Wallet on Mainnet.
- Choosing Offline Wallet shows the two warnings of text B; the user cannot
  continue without acknowledging them.
- Import works for both kinds.

#### OS-FR-3: Add a Transmitter Wallet

From the chooser, the user can add a Transmitter Wallet: a Label and a Network,
no Seed, no Signing Check of its own.

**Consequences (testable):**
- It can be made with or without an address. With an address, it is Synced
  from the start.
- It can never sign. Nothing in it offers to.
- It has a Node, like an Online Wallet. It has its own Open Check and auto-lock
  under FR-65 for its Network: required on Mainnet, because a Synced
  Transmitter shows an Account's balances. The written-Seed and passkey-origin
  safeguards do not apply: it holds no Seed. [ASSUMPTION: architecture gives it
  known ciphertext so its unlock is proven by decryption, as for any Wallet.]
- The same address may be both an Offline Wallet and a Transmitter Wallet on
  one device. This is allowed, with a warning that the offline key is then on a
  device that connects to the internet. *Decided 2026-11-07.*

#### OS-FR-4: Sync to an address

A Transmitter Wallet has a "Sync to an address" button. The user types or scans
an address. From then on the Transmitter Wallet shows that Account read-only
(balance, history, trust lines) under the product PRD's read rules.

**Consequences (testable):**
- Sync can be changed to another address or removed later, without
  re-creating the Transmitter Wallet. *Decided 2026-11-07.*
- An unsynced Transmitter Wallet can still transmit and still answer a
  Data-to-Sign Request (the request carries the address).
- Only a Synced Transmitter Wallet can Build (Transmitter-builds route).

#### OS-FR-5: Change an Online Wallet to an Offline Wallet

The Wallet's settings offer "Change to an offline wallet". It shows text C
(OS-FR-12) and asks for a confirm.

**Consequences (testable):**
- After the change the Wallet has no Node. It keeps its Network, address, Seed
  and checks.
- The Wallet carries the Was-online mark for good (OS-FR-7).
- The app shows how to get a never-online key (text C, steps 1 to 3).

#### OS-FR-6: Change an Offline Wallet to an Online Wallet

The Wallet's settings offer "Change to an online wallet". It shows text D
(OS-FR-12) and is an irreversible-class action: a typed or held confirm, not
one tap, and the Wallet's Signing Check.

**Consequences (testable):**
- The Wallet keeps its Network (FR-93). The user picks a Node for it. The same
  address on the same Network as another Wallet is refused, as today.
- Signed Transactions made earlier are still valid until they expire; the text
  says so.

#### OS-FR-7: The Was-online mark

An Offline Wallet whose key was ever held by an Online Wallet shows "Was online"
on its card and in its settings, with one sentence on why it matters.

**Consequences (testable):**
- It cannot be removed while the Wallet exists.
- Changing to online and back to offline keeps it.
- An imported Offline Wallet has no mark: the app cannot know the Seed's past.
  Instead, importing a Seed into an Offline Wallet shows text E (OS-FR-12) and
  the user must acknowledge it. *Decided 2026-11-07.*

#### OS-FR-8: An offline passkey-derived key needs a device-bound passkey

An Offline Wallet whose Seed Method is Passkey-Derived Seed (product PRD FR-63)
needs a passkey bound to the device.

**Consequences (testable):**
- If the passkey is synced, or the app cannot tell, it shows the
  synced-passkey warning (text B) and the user must acknowledge it. A synced
  passkey is warned about, never refused. *Decided 2026-11-07.*

### 4.2 The Transmit step

**Description:** Every Signed Transaction reaches the ledger through one step,
for every Wallet kind. On an Online Wallet the step follows signing on the same
device. On an Offline Wallet the step is a QR handed to a Transmitter Wallet.
Today's outcome rules (validated, claimed, failed, expired, unknown) apply
unchanged.

#### OS-FR-9: One Transmit step

Every action that writes to the ledger (Send, trust lines, Regular Key, master
key, and every later write) ends in the Transmit step.

**Consequences (testable):**
- Before sending, the Transmit step verifies the signature and that the signing
  Account is the expected one, and refuses otherwise. Expected means: the
  Synced address; else the Account in the request this Transmitter answered;
  else the Account the user confirms on screen.
- It refuses a Signed Transaction whose Network does not match its own, and one
  past its LastLedgerSequence.
- It never resubmits a transaction that may have been applied (product PRD
  FR-24; the `unknown` outcome is `docs/decisions.md` §16).
- It sends only on the Network the Signed Transaction names. On Mainnet,
  Testnet and Devnet the signature does not contain the Network
  (`fact-check.md`, case 1), so this check stops a mistake, not a compromised
  Transmitter. The PRD accepts that remaining risk; text B and OS-FR-23 warn
  against using one Seed on more than one Network.

#### OS-FR-10: "Show the signed transaction before sending" (per Wallet, off by default)

A per-Wallet setting on Online and Transmitter Wallets. When it is on, after
signing (or after scanning a Signed Transaction) the app shows the hash, the
decoded fields and a copy button for the signed blob, then asks "Send it to the
ledger?".
An Offline Wallet does not need the setting: its last screen is always the
signed QR (OS-FR-11).

**Consequences (testable):**
- Off by default for every Wallet, new and existing.
- Declining sends nothing. The screen says the Signed Transaction stays valid
  until its window ends, and anyone holding it can send it until then.
- Copying the blob shows the same warning.

#### OS-FR-11: An Offline Wallet hands its Signed Transaction out by QR

An Offline Wallet never transmits. Its Transmit step is a signed QR that a
Transmitter Wallet scans and sends.

**Consequences (testable):**
- The Offline Wallet never shows a "Send" button; its last screen is the
  signed QR.
- The QR screen says that the transaction is not sent until a Transmitter
  Wallet sends it, and until when it is valid.
- The signed QR names the Network, so the Transmit step can compare it
  (OS-FR-9).

### 4.3 Consequence texts

**Description:** The fixed words the app shows when a Wallet kind is chosen or
changed, and when a Seed is imported into an Offline Wallet.

#### OS-FR-12: Consequences are shown in these words

Written in ASD-STE100 from a security point of view and approved by the owner
on 2026-11-07. UX may lay them out; it does not reword them without a PRD
change.

**Text A. Online wallet (create quiz)**
- This device keeps the key and connects to the XRP Ledger.
- This device can show your balance and history.
- This device can sign and send transactions without help.
- The key is on a device that connects to the internet. Malware or a dangerous
  browser extension can find it.
- Use an online wallet for small amounts and for daily payments.

**Text B. Offline wallet (create quiz)**
- This device keeps the key. It does not connect to the XRP Ledger.
- This device cannot show your balance or history.
- To send a transaction, you must have a second device with a Transmitter
  wallet.
- You move each transaction between the two devices with a QR code.
- The offline wallet does not connect to the network. Before you sign, make
  sure that the network on the screen is correct.
- Use an offline wallet for large amounts.
- **WARNING: The app cannot make your device offline.** You must disconnect it
  before you create this wallet. Turn off Wi-Fi, mobile data and Bluetooth. Do
  not connect the device again.
- **WARNING: Do not use a synced passkey for an offline wallet.** A synced
  passkey goes to the cloud. If the key comes from a synced passkey, the wallet
  is not offline.

**Text C. Change an online wallet to an offline wallet**
- This wallet stops all connections to the XRP Ledger.
- This device does not show the balance or history of this wallet after the
  change.
- The node setting goes away. The network does not change.
- The address and the funds do not change.
- To send a transaction after the change, you must have a Transmitter wallet on
  a second device.
- **WARNING: This change does not make your key safe.** The key was on a device
  that connected to the internet. If malware found the key before the change,
  the malware still has it. The change cannot remove that risk.
- To get a key that was never online:
  1. Create a new offline wallet on a device that is disconnected.
  2. Move your funds to the new address, or set the new key as the Regular Key
     of this account.
  3. If you set a Regular Key, turn off the master key of this account. You
     must sign this with the old key.
- **WARNING: The app cannot make your device offline.** Disconnect the device
  before you sign with this wallet.

**Text D. Change an offline wallet to an online wallet**
- This wallet connects to the XRP Ledger.
- The wallet keeps its network. You must select a node.
- This device shows the balance and history of this wallet.
- This wallet can sign and send transactions without a second device.
- Signed transactions that you did not send are still valid until they expire.
- **WARNING: The key will be on a device that connects to the internet.**
  Malware or a dangerous browser extension can find it. After this change, the
  key is not an offline key.
- **WARNING: You cannot undo this risk.** If you change the wallet back to
  offline later, the key is still a key that was online. For a large amount,
  keep this wallet offline.

**Text E. Import a seed into an offline wallet**
- **WARNING: An offline wallet does not make an unsafe seed safe.** The app
  cannot know where the seed was before. If malware or another person found
  the seed, they can take the funds. Make sure that you made the seed on an
  offline device. Make sure that the seed was only on paper. If you are not
  sure, do not import the seed. Create a new offline wallet. Then move your
  funds to its new address.

("Create" and "import" are kept although they are not ASD-STE100 approved
verbs, because they are the app's own button names.)

### 4.4 Offline-builds route

**Description:** Realizes OS-UJ-1. The user does all the Building on the
Offline Wallet, with the same screens an Online Wallet uses, minus every read.
Only when the Build is reviewed does the app ask for Data to Sign.

#### OS-FR-13: An Offline Wallet Builds with the normal screens

Send, trust lines and key actions are available on an Offline Wallet with the
same fields and the same review.

**Consequences (testable):**
- Where the online screen shows a read (balance, spendable, destination check,
  fee), the Offline Wallet says the value comes from the Transmitter Wallet. It
  never shows a guess, or a blank as zero.
- The Build is kept on the device after signing, until the user marks the
  outcome as known, cancels it or replaces it, so an expired or unknown round
  does not mean filling it again.
- A kept Build is held only while the Wallet is unlocked. A lock erases it,
  under the product PRD's lock rules (FR-12). *Decided 2026-11-07.*

#### OS-FR-14: The Data-to-Sign Request comes after the Build

After the review, and not before, the Offline Wallet shows the Data-to-Sign
Request QR. It carries the Account the Wallet Signs for, the Built
transaction, a request ID and the Build hash.

**Consequences (testable):**
- Nothing about the transaction can be changed after the request is shown
  without starting the request again.

#### OS-FR-15: The Transmitter Wallet answers with Data to Sign

A Transmitter Wallet scans the request and reads the ledger for that address.
It runs the same pre-flight checks the online screen runs (destination exists,
destination tag required, reserve, spendable balance, trust line, frozen line,
fee cap in `docs/decisions.md` §14), shows the result, and shows the Data to
Sign QR. [ASSUMPTION: Data to Sign reaches the Offline Wallet by QR, like
today's two-device round.]

**Consequences (testable):**
- A failed read never produces Data to Sign (product PRD FR-59).
- A check that refuses online refuses here, in the same words.
- The Network in the Data to Sign is the Transmitter Wallet's own.
- Before a Regular Key or master key change, it reads the Account's key state
  (Regular Key, master key on or off, signer list) and shows the matching
  OS-FR-21 warnings (W4, W5) on its own screen. A failed read is stated as
  unknown, never as safe.

#### OS-FR-16: The Offline Wallet checks Data to Sign before signing

The Offline Wallet makes the transaction itself, from its kept Build plus the
values in Data to Sign, and from nothing else.

**Consequences (testable):**
- Data to Sign must carry the same request ID and Build hash as the
  Data-to-Sign Request (OS-FR-14). Otherwise it is refused. A lock erases the ID
  with the Build, so an answer after a lock is refused.
- Data to Sign carries exactly: Sequence, Fee, the current validated ledger
  index and the Network, plus the request ID and Build hash. An answer with any
  other value, or without one of these, is refused as malformed. For a key
  change it may also carry the Account's key state, for display only
  (OS-FR-15).
- The Offline Wallet sets LastLedgerSequence itself: the received ledger index
  plus a window long enough for one more QR round and the Signing Check. The
  window is about ten minutes, stated in plain words, never as a promise. The
  exact ledger count is set by architecture. *Decided 2026-11-07.*
- It remembers the highest ledger index it has seen for this Wallet. It warns
  if a new one is lower, or higher than the elapsed time allows at about four
  seconds per ledger plus a margin set by architecture.
- It refuses a Fee over the fee cap (`docs/decisions.md` §14), a Network that is
  not its own, and an Account that is not the one it Signs for.
- **Retry without paying twice.** It keeps a list of what it signed: Build
  hash, transaction hash, Sequence, LastLedgerSequence, time. The list holds no
  secret and survives a lock. When a Build is the Same Build as a listed one
  (even typed again after a lock), it shows the earlier signature and reuses
  its Sequence, so at most one of them can be applied (`tefPAST_SEQ`,
  `fact-check.md` case 4). To sign it with a new Sequence, the user confirms
  "This is a new payment" after a warning that the earlier one may have been
  applied. The user decides; the app warns. For Offline Wallets this changes
  product PRD FR-24 ("Retry issues a fresh transaction with a new sequence
  number").
- It shows the complete transaction and the Network **in large type** ("You are
  signing for Mainnet") before the Signing Check.
- When every check passes it signs and shows the signed QR (OS-FR-11).

### 4.5 Transmitter-builds route

**Description:** Realizes OS-UJ-2. Today's two-device signing (FR-78), extended
to every write the app can build.

#### OS-FR-17: A Synced Transmitter Wallet Builds Unsigned Transactions

A Synced Transmitter Wallet Builds an Unsigned Transaction for its Synced
address and hands it to the Offline Wallet by QR.

**Consequences (testable):**
- It uses the online screens and checks for the Synced address and shows the
  Unsigned Transaction QR.
- It covers every write the app can build, not only XRP payments, Regular Key
  and master key.

#### OS-FR-18: The Offline Wallet shows every field before signing

The Offline Wallet decodes the Unsigned Transaction and, before the Signing
Check, shows every field and flag in words, the Network in large type, and the
expiry. It trusts the user with what it shows; it refuses only what it cannot
show.

**Consequences (testable):**
- It refuses an unknown transaction type, a field or flag it cannot show in
  words, a Network that is not its own, an Account it does not Sign for, a
  pre-set signature, and a Fee over the cap.
- It refuses a partial payment (`tfPartialPayment`): the app never builds one,
  so it can only come from a changed transaction. Product PRD FR-58 is
  unchanged, and the Transmit step refuses it too.
- It shows a strong warning, in words, for: a `SendMax` (as "at most X can
  leave your account"), `Paths`, `DeliverMin`, memos, a `Delegate` field, a
  `TicketSequence`, and any account or trust-line flag that cannot be undone
  (for example `asfNoFreeze`, `asfAllowTrustLineClawback`, `tfSetfAuth`).
  Facts: `fact-check.md` case 6.
- The Unsigned Transaction envelope carries the validated ledger index. The
  Offline Wallet applies the same highest-seen check as OS-FR-16, shows the
  window in ledgers, and warns when it is longer than the usual window.
- The user can refuse; refusing signs nothing.

### 4.6 Retiring today's controls

**Description:** The Wallet kinds replace the two controls this feature
supersedes (§0, "What this replaces").

#### OS-FR-19: Operating another account and Two-device signing are replaced

When this feature ships, "Operating another account" (FR-75) and "Two-device
signing by QR" (FR-78) are replaced by the Wallet kinds and the two routes.

**Consequences (testable):**
- FR-75 (Controlling Wallet) and FR-78 (two-device QR) screens are removed from
  Local settings.
- The capability stays: a key can still Sign for another Account (OS-FR-20).
- No migration. A Wallet that today operates another account is not
  converted; the operator re-creates the setup with the new Wallet kinds. This
  follows the product PRD's no-backward-compatibility rule (FR-95). *Decided
  2026-11-07.*
- Every product-PRD reference to FR-75, FR-77, FR-78 or a Controlling Wallet
  gets a pointer to this PRD: FR-63 (recovery), FR-75 to FR-78, the FR-93 and
  FR-95 lock exception, FR-94's settings list, the Glossary entry, §2.2 and the
  "Offline signing" entry in §6.2.

### 4.7 Keys and accounts

**Description:** The app trusts the user with key changes. It states what it
knows and warns; it does not block. The ledger's own refusals stay (for
example, turning the master key off needs a Regular Key or a signer list, and
must be signed by the master key; `fact-check.md` cases 3 and 8).

#### OS-FR-20: A key can Sign for another Account

An Online or Offline Wallet records the Account it Signs for and its key
address separately. The Account can be the key's own address, or another
Account whose Regular Key this key is.

**Consequences (testable):**
- OS-FR-16 and OS-FR-18 compare the transaction's Account with the recorded
  Account, and the signing key with this Wallet's key.
- The Transmit step accepts a signature by the master key (when enabled) or the
  current Regular Key, as today.
- Signs for is set when the Wallet is created or imported (an optional "This
  key signs for another account" step that asks for the Account address), and
  can be changed in the Wallet's settings. After a Regular Key change built in
  this app (text C, steps 2 and 3), the app offers to set the new key's Wallet
  to Sign for that Account.
- The chooser card and the Data-to-Sign Request show and carry the Signs-for
  Account. FR-93's same-address refusal compares the Signs-for Account and the
  Network.

#### OS-FR-21: Regular Key and master key: the user decides, the app warns

Applies to **every Wallet kind**, online and offline. The user may hold keys in
other wallets, hardware devices or on paper; XRPL Bench is one wallet among
them and cannot see the others. *Decided 2026-11-07; research and sources in
`addendum.md` "Regular Key and master key".*

**What the user can do:**
- Set **any address** as the Regular Key: typed, scanned, or a Wallet in this
  app. The ledger refuses the Account's own address (`temBAD_REGKEY`); the app
  says so in plain words.
- Replace or remove the Regular Key, and turn the master key off or on,
  whenever the ledger allows it.
- The app adds no refusal of its own. When the ledger refuses, the app says why
  in plain words, never as a raw code: removing the Regular Key while the master
  key is off and no signer list exists (`tecNO_ALTERNATIVE_KEY`); turning the
  master key off with no Regular Key or signer list (`tecNO_ALTERNATIVE_KEY`);
  turning the master key off with a key other than the master key
  (`tecNEED_MASTER_KEY`). Facts: `fact-check.md` cases 3 and 8.

**What the app warns about** (ASD-STE100; the user can continue after each):
- **W1. The key is not in this app.** "This app cannot sign with this key. Make
  sure that you hold the key in a different wallet."
- **W2. A black-hole address** (`rrrrrrrrrrrrrrrrrrrrrhoLvTp`,
  `rrrrrrrrrrrrrrrrrrrrBZbvji`). "Nobody holds the key for this address. If you
  turn off the master key, nobody can use this account again. The funds are
  lost. A delegate can still act for the account, and old offers and escrows
  can still run."
- **W3. A "set Regular Key" that this device did not build** (a QR from a
  Transmitter, or a transaction from a website). "This transaction gives control
  of your account to the key below. Sign it only if you hold that key. Scammers
  use this to take accounts."
- **W4. Before the master key is turned off.** The app offers "Test the Regular
  Key". If the Regular Key is a Wallet in this app, the test signs an AccountSet
  with no changes with that key and shows whether it was validated. If the key is
  elsewhere, the app tells the user to test it in that wallet. The test is
  offered, never required. Then: "After this, the master key cannot sign for
  this account. Only the Regular Key or a signer list can turn on the master
  key again."
- **W5. Replacing a Regular Key that is set.** "The old Regular Key stops
  working."

**Consequences (testable):**
- No Regular Key or master key action is refused by the app when the ledger
  would accept it.
- Each warning above appears in its situation, before the Signing Check.
- The Account's current state (Regular Key, master key on or off) is read from
  the ledger. A failed read is stated as unknown, never as safe (product PRD
  FR-59).
- On the Offline-builds route the new key address is typed or scanned on the
  offline device, never taken from the Transmitter.

**Changes to the product PRD:** this FR replaces FR-75 and FR-77. FR-75 has a
Controlling Wallet hold the master key and set this Wallet's key as the Regular
Key; today's code offers only Wallets on this device. FR-77 offers turning the
master key off only once a Regular Key is set and validated; today's code also
needs a Wallet on this device to hold it. Turning the master key off stays an
irreversible-class action: a typed or held confirm and the Signing Check, as in
FR-77.

#### OS-FR-22: A Synced Transmitter shows the Account's delegates

Delegation (`PermissionDelegationV1_1`) is enabled on Mainnet (`fact-check.md`
case 6). A Synced Transmitter Wallet shows the Account's delegates and what
each may do, with a warning that a delegate can act for the Account.

**Consequences (testable):**
- No delegates is shown as "none"; a failed read is shown as unknown.
- Setting or removing delegates is out of scope.

#### OS-FR-23: One Seed on one Network

When a Seed is imported or created for any Wallet, the app warns: "Do not use
one seed on more than one network. A transaction signed for one network can be
sent on another." Facts: `fact-check.md` case 1.

**Consequences (testable):**
- The warning is shown on create and on import, for every Wallet kind that
  holds a Seed, before the Seed is saved.

## 5. Non-Goals

- **Multi-signing.** Signer lists, quorum and collecting several signatures are
  the next feature PRD, built on this one.
- **Making the device offline.** The app cannot turn off radios or prove a
  device is offline. It says so (texts B and C).
- **Hardware wallets** (Ledger, Keystone and similar). Not in this feature.
- **Signing ahead of time and several transactions per round.** One transaction
  per round, as today. Tickets are later work (§6.2).
- **A server or relay between devices.** QR only. No backend (product PRD).

## 6. Scope

### 6.1 In Scope

- Wallet kinds and changing them (4.1).
- The Transmit step and the "Show the signed transaction before sending"
  setting (4.2).
- The consequence texts (4.3).
- The Offline-builds route (4.4).
- The Transmitter-builds route (4.5).
- Retiring FR-75 and FR-78 (4.6).
- Keys and accounts: Signs for, Regular Key and master key warnings, delegates
  shown, one Seed on one Network (4.7).

### 6.2 Later

- Multi-signing (own PRD).
- Tickets, for windows longer than a QR round.
- Setting delegates (`DelegateSet`). Showing them is in scope (OS-FR-22).
- A multi-frame QR for transactions too big for one code.

## 7. Success Metrics

Single operator, so these are checks rather than targets.

- **OS-SM-1.** A Testnet payment completes by the Offline-builds route in three
  QR scans (request, Data to Sign, signed), with no field typed twice.
  Validates OS-FR-13 to OS-FR-16.
- **OS-SM-2.** Every write the app can build online can be built and signed
  offline by at least one route. Validates OS-FR-13, OS-FR-17.
- **OS-SM-3.** XRPL Bench never submits a Signed Transaction on a Network other
  than the one it names. Validates OS-FR-9, OS-FR-16.
- **OS-SM-C1 (counter).** Do not reduce confirms or warnings to make the round
  faster. The round is meant to be deliberate. Counterbalances OS-SM-1.

## 8. Open Questions

1. **Request transport.** Can a Data-to-Sign Request for a large Build exceed
   one QR? (Today's codec refuses over 2,331 bytes.) A multi-frame QR is listed
   under Later (§6.2).

**Settled 2026-11-07:**
- The signing window is about ten minutes (OS-FR-16).
- Today's controlled accounts are dropped, not migrated (OS-FR-19).
- The same address as an Offline and a Transmitter Wallet on one device, and a
  synced passkey, are warned about, never refused (OS-FR-3, OS-FR-8).
- An Offline Wallet has a Network and no Node (§3, OS-FR-2).
- The Mainnet safeguards stay required (§3, OS-FR-2).
- Delegates are shown (OS-FR-22).
- The twelve review cases are answered (`cases.md`).
- Regular Key and master key changes are warned about, never refused, for every
  Wallet kind (OS-FR-21).

## 9. Assumptions Index

- OS-FR-3: a Transmitter Wallet's unlock is proven by decrypting known
  ciphertext that architecture provides, as for any Wallet.
- OS-FR-15: Data to Sign reaches the Offline Wallet by QR, like today's
  two-device round (memlog).

The other assumptions of the first draft were confirmed by the owner on
2026-11-07 (OS-FR-4, OS-FR-7, OS-FR-13).
