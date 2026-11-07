# Route checks: what each device refuses, warns and keeps

One row per rule. "Refuse" stops the round and signs or sends nothing. "Warn"
lets the user continue. Ledger refusals always stay; the app maps them to plain
words (`fact-check.md` cases 3 and 8). Facts behind the rules are in
`fact-check.md`.

## What travels by QR

| Payload | From → to | Carries exactly | OS-FR |
|---|---|---|---|
| Data-to-Sign Request | Offline → Transmitter | Signs-for Account, the Built transaction, request ID, Build hash, Network | OS-FR-14, OS-FR-20 |
| Data to Sign | Transmitter → Offline | Sequence, Fee, current validated ledger index, Network, request ID, Build hash. For a key change only: the Account's key state, for display | OS-FR-15, OS-FR-16 |
| Unsigned Transaction | Synced Transmitter → Offline | Every field set, plus an envelope with the Network and the validated ledger index | OS-FR-17, OS-FR-18 |
| Signed Transaction | Offline → Transmitter | Signed blob, plus an envelope naming the Network | OS-FR-11 |

All four are kinds of today's one codec (`src/lib/qr-codec.ts`, `addendum.md`).
One payload is one QR.

## Offline Wallet, Offline-builds route

| Rule | Kind | OS-FR |
|---|---|---|
| Builds Send, trust lines and key actions with the online screens' fields and review | — | OS-FR-13 |
| Where the online screen shows a read (balance, spendable, destination check, fee), says the value comes from the Transmitter; never a guess, never blank as zero | — | OS-FR-13 |
| Request appears only after review; changing anything after it is shown restarts the request | — | OS-FR-14 |
| A new Regular Key address is typed or scanned on the offline device, never taken from the Transmitter | — | OS-FR-21 |
| Kept Build and its request ID live only while the Wallet is unlocked; a lock erases both | — | OS-FR-13, OS-FR-16 |
| Kept Build stays after signing until the user marks the outcome known, cancels or replaces it | — | OS-FR-13 |
| Data to Sign with a different request ID or Build hash (including any answer after a lock) | Refuse | OS-FR-16 |
| Data to Sign with any extra value, or missing one of the set | Refuse as malformed | OS-FR-16 |
| Transaction made only from the kept Build plus Data to Sign, nothing else | — | OS-FR-16 |
| Sets LastLedgerSequence itself: received ledger index plus about ten minutes (ledger count set by architecture); stated in plain words, never as a promise | — | OS-FR-16 |
| Ledger index lower than the highest seen for this Wallet, or higher than elapsed time allows (~4 s per ledger plus an architecture margin) | Warn | OS-FR-16 |
| Fee over the cap (`docs/decisions.md` §14) | Refuse | OS-FR-16 |
| Network not its own | Refuse | OS-FR-16 |
| Account not the one it Signs for | Refuse | OS-FR-16, OS-FR-20 |
| Shows the complete transaction and the Network in large type before the Signing Check | — | OS-FR-16 |
| Last screen is the signed QR; no Send button | — | OS-FR-11 |

### Retry without paying twice (OS-FR-16)

- The Offline Wallet keeps a signed list: Build hash, transaction hash,
  Sequence, LastLedgerSequence, time. No secret; survives a lock.
- **Same Build** = same type, destination, amount, token, tag, flags, compared
  by a hash of that content. Detected even when typed again after a lock.
- On a Same Build it shows the earlier signing's record and re-signs with that
  Sequence instead of the received one, so at most one can apply
  (`tefPAST_SEQ`, `fact-check.md` case 4). The signed blob is never stored;
  the PRD's "shows the earlier signature" means this record (owner,
  2026-11-07).
- A new Sequence only after the warning that the earlier one may have been
  applied and the confirm "This is a new payment". The user decides.

## Offline Wallet, Transmitter-builds route

| Rule | Kind | OS-FR |
|---|---|---|
| Shows every field and flag in words, the Network in large type and the expiry, before the Signing Check | — | OS-FR-18 |
| Unknown transaction type; a field or flag it cannot show in words | Refuse | OS-FR-18 |
| Network not its own; Account it does not Sign for; a pre-set signature; Fee over the cap | Refuse | OS-FR-18 |
| `tfPartialPayment` | Refuse (FR-58 unchanged) | OS-FR-18 |
| `SendMax` (shown as "at most X can leave your account"), `Paths`, `DeliverMin`, memos, `Delegate`, `TicketSequence`, any account or trust-line flag that cannot be undone (`asfNoFreeze`, `asfAllowTrustLineClawback`, `tfSetfAuth`, …) | Strong warning in words | OS-FR-18 |
| Same highest-seen ledger check as the other route, from the envelope's ledger index; shows the window in ledgers | Warn | OS-FR-18 |
| Window longer than the usual one | Warn | OS-FR-18 |
| A SetRegularKey it did not build | W3 | OS-FR-21 |
| New Regular Key is a Wallet on this device, or not | States it; W1 if not | OS-FR-21 |
| User refuses | Signs nothing | OS-FR-18 |

## Transmitter Wallet

| Rule | Kind | OS-FR |
|---|---|---|
| Answers a request whether Synced or not (the request carries the address) | — | OS-FR-4 |
| Runs the online pre-flight checks on the request's address: destination exists, destination tag required, reserve, spendable balance, trust line, frozen line, fee cap | Refuse in the online words | OS-FR-15 |
| A failed read never produces Data to Sign | Refuse | OS-FR-15 (FR-59) |
| Data to Sign carries its own Network | — | OS-FR-15 |
| Before a key change: reads Regular Key, master key on/off, signer list; shows W4, W5; failed read stated as unknown, never safe | Warn | OS-FR-15, OS-FR-21 |
| Builds only when Synced, only for the Synced address, for every write the app can build | — | OS-FR-4, OS-FR-17 |
| Never signs; nothing offers to | — | OS-FR-3 |

## Transmit step (every Wallet kind)

| Rule | Kind | OS-FR |
|---|---|---|
| Verifies the signature | Refuse if bad | OS-FR-9 |
| Signing Account must be the expected one: the Synced address; else the Account in the request this Transmitter answered; else the Account the user confirms on screen | Refuse if not | OS-FR-9 |
| Accepts master key (when enabled) or current Regular Key signatures | — | OS-FR-20 |
| Network named by the Signed Transaction differs from its own | Refuse | OS-FR-9 |
| Past its LastLedgerSequence | Refuse | OS-FR-9 |
| `tfPartialPayment` | Refuse | OS-FR-18 |
| Sends only on the named Network; never resubmits a possibly-applied transaction (FR-24, `unknown` per decisions §16) | — | OS-FR-9 |
| Outcomes validated, claimed, failed, expired, unknown as today; expiry reads "Expired. Nothing was sent." | — | OS-FR-9, OS-UJ-1 |
| With "Show the signed transaction before sending" on: hash, decoded fields, copy blob, then "Send it to the ledger?"; decline and copy both warn the blob stays valid and anyone holding it can send it until the window ends | — | OS-FR-10 |

Known limit (accepted): on Mainnet, Testnet and Devnet the signature does not
contain the Network, so the Network check stops a mistake, not a compromised
Transmitter (`fact-check.md` case 1). Mitigation is the OS-FR-23 warning.
