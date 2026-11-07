---
title: Adversarial review — Offline signing PRD
target: prd.md, addendum.md, .memlog.md (prd-offline-signing-2026-11-07)
lens: security and XRPL correctness
date: 2026-11-07
---

# Adversarial review: Offline signing PRD

The threat model is the one the PRD itself sets: the offline device is trusted.
The Transmitter (the online device) may be **compromised** (malware, a hostile
browser extension) or **mistaken** (wrong Wallet, wrong Network, stale read).
Every finding asks one question: can the Transmitter get a signature the user
did not mean to give, or can the user reach a state where funds are lost?

Severity:
- **critical**: real Mainnet funds or control of the account can be lost through
  a path the PRD allows.
- **high**: loss is likely under a plausible mistake or compromise, or a
  product-PRD guard is silently dropped.
- **medium**: a gap or ambiguity that the architecture would have to fill in,
  with risk.
- **low**: precision or testability.

XRPL facts relied on below. Each was checked against the rippled behaviour the
current code already encodes (`src/lib/two-device.ts`, `src/lib/master-key.ts`);
the ones marked *verify* should be confirmed on xrpl.org before the PRD cites
them.
- Below NetworkID 1025, the `NetworkID` field must be absent. Including it gives
  `telNETWORK_ID_MAKES_TX_NON_CANONICAL` *(verify)*. So a Mainnet, Testnet or
  Devnet signature carries no network, and the same blob is valid on any of the
  three where the Account and Sequence match.
- `asfDisableMaster` must be signed by the master key (`tecNEED_MASTER_KEY`).
  It is refused when there is no Regular Key or signer list
  (`tecNO_ALTERNATIVE_KEY`).
- With the master key disabled, removing the Regular Key without a signer list
  is refused (`tecNO_ALTERNATIVE_KEY`) *(verify)*. **Replacing** it with any
  other address is accepted. The ledger cannot know whether anyone holds that
  key.
- A Regular Key can sign every transaction type except turning the master key
  off. That includes `SetRegularKey` itself, payments and `AccountDelete`.

---

## Critical

### C1. The Network shown at signing is not bound to the signature
**Location:** OS-FR-9 (refuses a mismatched Network), OS-FR-16 (Network in large
type), OS-FR-18, OS-SM-3, OS-SM-1, addendum "Network without a Network",
Text B ("make sure that the network on the screen is correct").

**Problem:** for Mainnet (0), Testnet (1) and Devnet (2) the signed bytes hold no
network. The "Network" the offline device shows is a label in an unsigned
envelope, and the Transmitter writes it. The Transmit step's Network check
(OS-FR-9) compares that label with the Transmitter's own Network. It protects
against an honest mistake by the Transmitter, never against a compromised one.
And today's signed payload (`xrplbench:1:s:`) carries no network at all, so as
written the check cannot even be implemented. The PRD presents the large-type
Network as the guard ("the user seeing exactly what they sign and on which
network", §1). It is a hint.

**Failure scenario (Transmitter-builds route):**
1. The user keeps one Seed as a Mainnet Wallet and, as FR-93 allows, as a
   Testnet Wallet. OS-SM-1 itself tells them to rehearse on Testnet.
2. A compromised Transmitter builds a payment to the attacker's address. It
   sets Sequence and LastLedgerSequence from **Mainnet**, but labels the
   envelope **Testnet**.
3. The offline device shows "You are signing for Testnet" in large type. The
   user signs with less care, because it is Testnet.
4. The Transmitter sends the blob to Mainnet, and it validates.

The Offline-builds route has the same hole. The user built the destination, but
a "Testnet rehearsal" with a large amount is then executed on Mainnet. Anyone who
photographs a signed QR can also replay it on another network where the Sequence
matches.

**Suggested requirement fix:**
- State plainly in OS-FR-16, OS-FR-18 and the addendum that the label prevents
  mistakes but does not defend against a compromised Transmitter.
- Add **OS-FR-x:** at creation, an Offline Wallet records the one Network class
  its key signs for: real funds (Mainnet) or test (Testnet/Devnet). This is a
  signing permission, not a connection. The offline device refuses Data to Sign,
  or an Unsigned Transaction, labelled with the other class.
- Add to text B (a new fact, not a rewording): a Seed used on Testnet or Devnet
  must never hold Mainnet funds, because a signature made for one network can be
  sent on another.
- Rewrite OS-SM-3 so it can be tested ("the app never submits a blob to a
  Network other than its envelope label"), and drop the claim about any other
  submitter.
- This reverses the owner's "an Offline Wallet must not have a network"
  decision (.memlog). It needs an owner decision; flag it, do not resolve it
  silently.

### C2. Retiring FR-75 leaves no Wallet that can sign as a Regular Key
**Location:** OS-FR-19 (FR-75 removed, no migration), OS-FR-16 ("an address that
is not its own"), OS-FR-18 ("a transaction for another Account"), Text C
step 2, FR-63 ("only a written Seed or a Controlling Wallet recovers").

**Problem:** in the new model every Wallet signs only for its own address.
Nothing in it can hold a Regular Key for another Account: there is no
`keyAddress ≠ address` Wallet. Text C step 2 tells the user to "set the new key
as the Regular Key of this account". After that, the new Offline Wallet refuses
every transaction for that Account (OS-FR-16 and OS-FR-18). The Account can then
be signed for only by the was-online master key, the exact key the advice tried
to retire.

**Failure scenario:**
1. Today the user has an Account whose master key is off, and whose Regular Key
   is held by a controlled Wallet (FR-75 or FR-77, both built).
2. This feature ships. FR-75 screens are removed, there is no migration, and the
   new kinds refuse another Account.
3. Nothing in the app can sign for that Account. The PRD says the user
   "re-creates the setup with the new Wallet kinds", but no new kind can
   express it.
4. Separately, a user follows text C step 2, then turns the master key off. Now
   nothing in the app can sign for that Account at all.

**Suggested requirement fix:**
- Add **OS-FR-x:** an Offline Wallet (and an Online Wallet) may sign as the
  **Regular Key of a named Account**. The Account address and the key address
  are recorded separately, and OS-FR-16 and OS-FR-18 check that
  "Account = the recorded Account, and the key = this Wallet's key".
- The Transmit step's signer check (master enabled, or current Regular Key) is
  already the right verifier.
- Make OS-FR-19's "no migration" explicit that ledger state is not app state.
  Before shipping, the owner must confirm that no Account they hold has its
  master key off with its Regular Key held only in a controlled Wallet. If one
  does, turn the master key back on first.

### C3. The guards against locking the account out are lost when the key is on another device
**Location:** OS-FR-15 (pre-flight checks list), OS-FR-17, OS-FR-9; product
FR-77 and today's `holdsRegularKeyHere` / `NO_REGULAR_KEY_WALLET_REASON`.

**Problem:** today, turning the master key off is blocked unless a Wallet on
this device signs as the current Regular Key. `verifySigned` also re-checks that
a Regular Key still exists. Neither guard can run on two devices: the
Transmitter holds no key and cannot know what the offline device holds. The
OS-FR-15 checks list does not mention them. Nothing stops this sequence:
1. A `SetRegularKey` to an address no one holds: a typo, a scanned address, or
   a compromised Transmitter.
2. Then `asfDisableMaster`.

The ledger accepts both. It also accepts **replacing** the Regular Key with an
unheld address while the master key is off.

**Failure scenario:** the user sets a Regular Key on the Offline-builds route
and mistypes one character of a valid-checksum address copied from a note. The
Transmitter checks only the format. Later the user turns the master key off,
signed offline and transmitted. The account is locked for good.

**Suggested requirement fix:**
- Add **OS-FR-x:** turning the master key off is offered only after the Regular
  Key has proved itself. The proof is a validated transaction signed by that
  Regular Key, for example a no-op `AccountSet`. The Transmit step's signer
  check observes it, and the Transmitter records it.
- The same proof is needed before `SetRegularKey` while the master key is off.
- The offline device refuses `SetRegularKey` unless the key address is a Wallet
  on this offline device, or the user types it again on the offline device and
  sees the warning that an unheld Regular Key can lock the account.

---

## High

### H1. A retry after "Expired" or "unknown" can pay twice
**Location:** OS-UJ-1 edge case, OS-FR-13 (kept Build), OS-FR-16, OS-FR-9, product
FR-24.

**Problem:** the only witness of "Expired. Nothing was sent." is the
Transmitter. The kept Build is designed for a new Data-to-Sign round. If the
first blob was actually applied (a lying Transmitter, or an honest `unknown`),
the new round gets Sequence N+1, and both payments apply. Separately, OS-FR-16
checks only that Sequence and LastLedgerSequence are "valid numbers". A
Transmitter can set LastLedgerSequence = 4294967295, or a Sequence of N+5. The
result is a signature it can hold and submit later, outside the "about ten
minutes" the user was told.

**Failure scenario:** the Transmitter submits the first signed payment, shows
"Expired. Nothing was sent.", and asks for a new round. The offline device signs
the kept Build again with Sequence N+1. The Transmitter submits it too: two
payments.

**Suggested requirement fix:**
- Add to OS-FR-16: a re-sign of a kept Build must reuse the **same Sequence** as
  the first signature. If the first one applied, the second fails with
  `tefPAST_SEQ` and costs nothing. A different Sequence is refused, with words
  saying the earlier transaction may have been applied.
- The offline device keeps a non-secret log of each signature (hash, Sequence,
  LastLedgerSequence, time). The log survives lock (it holds no secret) and is
  shown before signing, if an earlier signature from the same Build exists.
- Data to Sign carries the current validated ledger index. The offline device
  refuses LastLedgerSequence greater than that index plus the window set by
  architecture.
- It remembers the highest index seen and refuses a lower one. This bounds an
  inflated window without a network.

### H2. The Transmitter-builds route has no list of allowed fields and flag bits
**Location:** OS-FR-17 ("every write the app can build"), OS-FR-18 ("a field it
cannot show").

**Problem:** "a field it cannot show" means that any field the decoder can render
in words is signable. Today's `reviewUnsigned` is safe only because it allows
three shapes with `Flags` = 0. Widened to "every write", a compromised
Transmitter can add things the user will not notice:
- `tfPartialPayment` (FR-58 bans it).
- A huge `SendMax` with `Paths` through its own offers, on an issued-currency
  payment.
- `DeliverMin`.
- `Memos`.
- `TicketSequence` or `Sequence` 0. Tickets are a non-goal.
- The `Delegate` field, which signs for another Account on its behalf.
- AccountSet flags with permanent effect, such as `asfNoFreeze` or
  `asfAllowTrustLineClawback`, or account-wide flags such as `asfDepositAuth`.
- TrustSet `tfSetfAuth`, `QualityIn` or `QualityOut`, or a lookalike issuer.

**Failure scenario:** a token payment shows "Send 100 USD to rDest, SendMax
50,000 XRP". The user reads the amount and destination. The cross-currency path
consumes the SendMax through the attacker's offer.

**Suggested requirement fix:**
- Replace "a field it cannot show" in OS-FR-18 with this: the offline device
  signs only the transaction types, fields and flag bits the app's own online
  Build produces for that action. The architecture names that list per type.
  Anything else is refused.
- Explicitly refused: `tfPartialPayment` (FR-58), `Paths`, `DeliverMin`,
  `TicketSequence`, `Delegate`, a pre-set `SigningPubKey`, `TxnSignature` or
  `Signers`, and any AccountSet flag other than the ones the app builds.
- `SendMax` is allowed only if the app builds it. Then it is bounded and shown
  as "at most X will leave your account".

### H3. `SetRegularKey` on the Transmitter-builds route is a takeover in one signature
**Location:** OS-FR-17, OS-FR-18.

**Problem:** the Regular Key can sign payments. On the Transmitter-builds route
the address comes from the untrusted device, and the user cannot check 25 to 35
base58 characters by eye. The addendum admits that "the offline screen is the
only defence against a changed destination". For a Regular Key, that defence is
not enough.

**Failure scenario:** the user asks the Transmitter to set the Regular Key to
their new offline key. The Transmitter substitutes an address whose first and
last four characters match. The user signs. The attacker now signs payments
from the Account at will.

**Suggested requirement fix:** key changes (`SetRegularKey`, master key on or off)
are built on the Offline-builds route only. Or, on the Transmitter-builds route,
the offline device signs a `SetRegularKey` only to an address held by a Wallet
on that offline device (ties to C2 and C3).

### H4. Text C step 2 leaves out a fact: a Regular Key alone does not retire the was-online key
**Location:** OS-FR-12 Text C, "To get a key that was never online … 2. … or set
the new key as the Regular Key of this account".

**Problem:** this is not a request to reword the text. The stated fact is
incomplete in a way that misleads. Setting a Regular Key does not stop the
master key. The was-online master key can still sign every payment, and can
replace or remove the Regular Key, until `asfDisableMaster` is set. Text C
presents step 2 as a way "to get a key that was never online" protecting the
account. It does that only together with turning the master key off. And under
C2, the new Offline Wallet cannot even sign for that Account.

**Failure scenario:** the user follows step 2, believes the account is now
protected by a never-online key, and leaves the master key on. Malware that
already holds the master Seed drains the account.

**Suggested requirement fix:** the owner amends step 2 so it includes "then turn
off the master key of this account", with the C3 proof first. Or the owner
removes the Regular Key option from Text C until C2 is resolved.

### H5. An Offline Wallet escapes every Mainnet-only protection
**Location:** OS-FR-2, OS-FR-5, OS-FR-8; product FR-65 (Open Check required, auto-lock
≥ 1 min on Mainnet), FR-72 (passkey-only Mainnet needs a confirmed written Seed),
FR-63 (no Mainnet Passkey-Derived Seed on a `*.b-cdn.net` origin).

**Problem:** these floors are all keyed on "Mainnet". An Offline Wallet has no
Network, so none of them fires. The Wallet kind meant "for large amounts" (Text
B) can be created with no Open Check. It can be passkey-only with no written
Seed, on a device-bound passkey. If the phone dies, the Seed is gone for good:
FR-63's other recovery, a Controlling Wallet, is removed by OS-FR-19. It can also
be a Passkey-Derived Seed on the temporary `b-cdn.net` origin, which FR-63 bars
for real funds because a domain change destroys the Seed.

**Failure scenario:** the user creates an offline Passkey-Derived Wallet on a
device-bound passkey, as OS-FR-8 urges, and skips the written Seed because
FR-72 did not ask. They fund it with savings. The old phone's battery fails. The
funds are lost.

**Suggested requirement fix:** add **OS-FR-x:** every Offline Wallet gets the
Mainnet floors: FR-65, FR-72 (a confirmed written Seed is always required for
an Offline Wallet), and FR-63's origin bar.

### H6. Changing an Offline Wallet to online lets a Testnet Seed onto Mainnet without the Mainnet review
**Location:** OS-FR-5 and OS-FR-6, against product FR-93.

**Problem:** FR-93 says a Wallet is one address on one Network for life. A
Mainnet Wallet is made only by the creation flow, with "Real funds" and the
import fact, because "the danger this rule guards against is a Testnet Seed
reused on Mainnet". OS-FR-5 then OS-FR-6 gives exactly that move: a Testnet
Online Wallet goes offline (the Network is dropped), then online again on Mainnet.
It skips the FR-91 review, the "Real funds" step and FR-93's Mainnet import
fact. The PRD says it changes a product-PRD FR only where it names it. It does
not name FR-93 as changed, yet it changes it.

**Failure scenario:** a Seed used freely on Testnet, and pasted into faucets and
tools, becomes a Mainnet Wallet through two settings toggles. The user funds it.

**Suggested requirement fix:**
- Declare the amendment to FR-93: "Network fixed for life" becomes "fixed while
  online".
- OS-FR-6 must run the same review as FR-91 for the chosen Network, including
  "Real funds" and the FR-93 import fact.
- Or: an Offline Wallet that was a Testnet or Devnet Wallet may return online
  only on that Network. Record the Network it left (ties to C1's class).

### H7. The PRD does not say which values Data to Sign may carry
**Location:** OS-FR-14, OS-FR-16, Glossary "Data to Sign".

**Problem:** the PRD names the four values, but never requires the offline device
to use **only** those values. Nothing requires it to build the final
transaction itself from its kept Build. "A request it did not issue" has no
stated mechanism, so it cannot be tested. A missing LastLedgerSequence is not
named as a refusal; only "not a valid number" is.

**Failure scenario:** the reply carries a full transaction, or extra fields
(`Flags`, `SendMax`, `Destination`). An implementation that merges the reply over
the Build signs the Transmitter's version.

**Suggested requirement fix:**
- OS-FR-16 states that the offline device builds the signed transaction from its
  kept Build plus exactly Sequence, Fee, LastLedgerSequence and the network
  label. It refuses a Data to Sign that carries any other field, or lacks one of
  the four.
- The Data-to-Sign Request carries a random request ID and a hash of the Build.
  Data to Sign must echo both. A lock erases the ID with the Build, so a reply
  after a lock is refused.

---

## Medium

### M1. The Transmit step's "expected Account" and blob identity are undefined
**Location:** OS-FR-9, OS-FR-4 (an unsynced Transmitter can transmit), OS-FR-10.

**Problem:** "the signing Account is the expected one" has no referent for an
unsynced Transmitter, or for a signed QR scanned with no request behind it. If
Sync changes between build and transmit, it is ambiguous again. Today's
`verifySigned` also requires three things the PRD does not carry over:
- The returned blob equals what was built or answered.
- The signer is the enabled master key or the **current** Regular Key, from a
  fresh read.
- Master-off is signed by the master key.

**Scenario:** an unsynced Transmitter is handed any valid signed blob. It
submits it with no display, because OS-FR-10 is off by default.

**Fix:**
- The Transmit step keeps the expected transaction from the round it took part
  in. It refuses a blob that does not match it, apart from the signature fields.
- It carries over today's three signer rules.
- A blob with no matching round is always shown decoded before sending,
  whatever OS-FR-10 says.

### M2. The validity time shown on the offline device cannot be checked there
**Location:** OS-FR-11 ("until when it is valid"), OS-FR-18 ("the expiry").

**Problem:** the offline device knows only a ledger number the Transmitter
supplied. It cannot turn that into a time it can stand behind. As written, the
requirement either cannot be tested or shows a time the attacker controls (see
H1).

**Fix:** say that the expiry is shown as the ledger number plus the window the
Transmitter claimed, marked as "from the other device", with today's
`expiryWords(…, offline)` wording. Add the H1 bound.

### M3. Auto-lock can erase the kept Build in the middle of a round
**Location:** OS-FR-13 (a lock erases the Build), product FR-10 and FR-11, OS-UJ-1
edge case, OS-SM-1.

**Problem:** a ten-minute round on another phone exceeds the FR-65 minimum
auto-lock. When the offline phone backgrounds or locks (FR-11), the Build and
request ID go. That breaks the "no field typed twice" metric. It also pushes
users to raise auto-lock on the Wallet meant for large amounts.

A signed QR left on screen is not mentioned in the lock teardown either. It is a
bearer instrument (see OS-FR-10's own warning).

**Fix:**
- State whether an open round holds off inactivity auto-lock. Backgrounding
  still locks.
- Lock clears any displayed signed QR or request QR.

### M4. "Change to offline" while the same Seed is still an Online Wallet on that device
**Location:** OS-FR-5, OS-FR-7, FR-93 (the same Seed as two Wallets).

**Problem:** FR-93 allows the same Seed as two Wallets on two Networks. The user
can take one of them offline while the other stays online on the same device.
The Seed is still on a device that connects. The Was-online mark covers the
history, but not the fact that it is online **now**. OS-FR-3 warns about the
analogous Offline-plus-Transmitter pair; this pair gets no warning.

**Fix:** OS-FR-5 warns, and OS-FR-2 import warns, when another Wallet on this
device holds the same Seed, or the same key address.

### M5. The fee is not known when the user confirms on the Offline-builds route
**Location:** OS-FR-14 ("after the review, and not before"), product FR-18 (fee shown
before the confirm step) and FR-20 (the confirm names the fee).

**Problem:** the review happens before Data to Sign, so the fee FR-20 requires
in the confirm arrives only afterwards. If the review is the confirm, FR-20 is
broken. If OS-FR-16's "shows the complete transaction" is the confirm, say so.

**Fix:** OS-FR-16's full display is the FR-20 confirm step. It names the fee,
and the Signing Check comes after it (FR-66).

### M6. The Transmitter Wallet's own lock and checks are unstated
**Location:** OS-FR-3 ("no Signing Check of its own"), OS-FR-4.

**Problem:** a Synced Transmitter shows Mainnet balance and history. It also
chooses the network label and the Data to Sign for the key that guards the large
balance. The PRD does not say whether FR-65's Open Check, auto-lock and the
FR-12 teardown apply to it. Nor does it say whether changing its Sync, or its
Network, needs a check.

**Fix:** state that a Transmitter on Mainnet takes FR-65's Mainnet floor. Changing
Sync needs the Open Check.

### M7. The offline device's app version is frozen, and the codec will move
**Location:** §5 ("making the device offline"), addendum (new kinds `r:` and `d:`),
Text B ("Do not connect the device again"), product "updates are never automatic".

**Problem:**
- An offline device cannot update without connecting, which Text B forbids. So
  every protocol change strands it.
- Silent handling of unknown fields in a newer payload version would be a
  bypass.
- A home-screen PWA's storage may also be evicted on a rarely used device. The
  impact is loss of the encrypted Seed (H5 makes that fatal).

**Fix:**
- Add a requirement that the Transmitter keeps speaking every payload version an
  offline device may run. An offline device refuses any version or field it
  does not know (today's codec does, for the version).
- State that the app asks for persistent storage on an Offline Wallet's device.
- State how an offline device is updated: by connecting it, which the was-online
  rules then treat explicitly. Or declare it never updated.

### M8. The Transmitter's pre-flight checks are advisory, but the PRD presents them as protective
**Location:** OS-FR-15, OS-FR-13.

**Problem:** on the Offline-builds route the destination-tag-required check
(FR-19) and the destination-exists check run only on the untrusted device.
FR-19 exists because a missing tag loses funds at an exchange. A compromised
Transmitter answers "no tag required".

**Fix:**
- The offline device's confirm says these checks were done by the other device.
- The offline Build keeps today's local rules: an address-book tag hint, and the
  deliberate "no tag" statement FR-20 already requires.

---

## Low

### L1. NetworkID is accepted with any value
**Location:** OS-FR-16 and OS-FR-18. Today's `reviewUnsigned` accepts any uint32
`NetworkID`.

**Fix:** the offline device refuses `NetworkID` for labels 0 to 2, and requires it
to equal the label for any network above 1024 if one is added later.

### L2. The fee cap is the only bound on fee loss
**Location:** OS-FR-16.

**Problem:** a compromised Transmitter can always set Fee = cap, and can make
the transaction fail on purpose. For example, it can omit a required check on a
new destination below the reserve (`tecNO_DST_INSUF_XRP`); the fee is burnt. The
cost is small (0.01 XRP today), but the PRD should say this is accepted.

### L3. FR-95's controlled-wallet lock exception is not retired
**Location:** OS-FR-19.

**Problem:** FR-93 and FR-95 keep "a controlled Wallet opens with the lock of
the Wallet that holds its key … until the Offline signing work". OS-FR-19 removes
controlled Wallets, but does not retire the exception or say what replaces it
(see C2).

### L4. The Transmitter-builds window is unstated
**Location:** OS-FR-17.

**Problem:** OS-FR-15 sets about ten minutes for the Offline-builds route only.
Today's FR-78 window is four to six minutes. The PRD does not say which window
the Transmitter-builds route uses, or that it is stated before signing.

### L5. The Was-online mark misses one path
**Location:** OS-FR-7.

**Problem:** the mark is set only by the in-app change. A user who removes an
Online Wallet and then imports the same Seed as an Offline Wallet on the same
device gets no mark. That is acceptable because text E covers import. But the
consequence "key ever held by an Online Wallet" overstates what can be tested.
Reword the testable form to "changed from online in this app".

### L6. The PRD says the app cannot tell whether a passkey is synced, but it can
**Location:** OS-FR-8 ("or the app cannot tell").

**Problem:** WebAuthn reports backup eligibility and backup state (the BE and BS
flags in authenticator data) at registration. So the app can usually tell, and
the requirement should say to read them. On iOS, platform passkeys for websites
are always synced. The OS-FR-8 warning will always fire there, so the PRD should
state that in plain words.
