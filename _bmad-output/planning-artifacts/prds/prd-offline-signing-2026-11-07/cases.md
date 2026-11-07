# Offline signing: cases to check

Written in ASD-STE100. Source: `review-adversarial.md` and `review-rubric.md`
(2026-11-07). Each case gives the situation, the risk, and the facts the app
can check. No case gives a decision. The owner decides each case.

Terms: "offline device" is the device with the Offline Wallet. "Online device"
is the device with the Transmitter Wallet.

## Case 1. The network is not in the signature

**Situation.** You sign a transaction on the offline device. The screen shows
"Testnet". The online device wrote that word.
**Risk.** On Mainnet, Testnet and Devnet, the signed transaction does not
contain the network. An online device with malware can send it on Mainnet. If
the account and the sequence number are the same on Mainnet, the transaction
moves real funds.
**What the app can check.** The online device can refuse to send on a network
that is not the network on the screen. This stops a mistake. It does not stop
malware on the online device.

## Case 2. A key signs for a different account

**Situation.** The key of your Offline Wallet is the Regular Key of a different
account.
**Risk.** The PRD removes "Operating another account". The offline device
refuses each transaction for a different account. Thus no wallet in the app can
sign for that account. If the master key of that account is off, the app
cannot use the account.
**What the app can check.** The ledger tells which key is the Regular Key of an
account. The app can compare it with the keys on this device.

## Case 3. Nobody holds the Regular Key, and the master key is off

**Situation.** You set a Regular Key. The address has one wrong character, or
malware changed it. Then you turn off the master key.
**Risk.** Nobody can sign for the account. The funds are lost. The ledger
accepts the two transactions.
**What the app can check.** Today, the app checks that a wallet on this device
holds the Regular Key. With two devices, the online device does not know the
keys on the offline device. The offline device does not know the ledger.

## Case 4. You try again after "Expired" or "Outcome unknown"

**Situation.** The online device shows "Expired" or "Outcome unknown". You make
a new round from the same transaction on the offline device.
**Risk.** The first transaction possibly went to the ledger. The new round gets
the next sequence number. The two transactions can both go to the ledger. You
pay two times.
**What the app can check.** If the new round uses the same sequence number,
only one of the two transactions can go to the ledger.

## Case 5. The time limit of a transaction is too long

**Situation.** The online device sends the data to sign. The time limit
(LastLedgerSequence) is very far in the future.
**Risk.** The online device can keep the signed transaction and send it many
days later. You think that the transaction is not valid after ten minutes.
**What the app can check.** The offline device does not know the current
ledger. It can only compare the time limit with a ledger number that the online
device gives.

## Case 6. The transaction has fields that you do not see

**Situation.** The online device makes the transaction. The offline device
shows the amount and the destination.
**Risk.** Malware on the online device adds other fields. Examples: a partial
payment flag, a very large SendMax with paths, memos, a Delegate field, or a
permanent account flag. You sign them, but you do not see them.
**What the app can check.** The offline device can refuse each field and flag
that the app itself does not make for that action.

## Case 7. The online device changes the Regular Key address

**Situation.** The online device makes a "set Regular Key" transaction. Malware
changes the address. The first and last characters are the same.
**Risk.** You cannot see the change. The attacker gets a key that can sign
payments from your account.
**What the app can check.** The offline device can compare the address with the
keys on the offline device.

## Case 8. A new Regular Key does not stop the old key

**Situation.** You follow text C, step 2. You set a new key that was never
online as the Regular Key. The master key stays on.
**Risk.** The old master key can still sign each transaction. If malware has
the old key, it can take the funds. Text C does not tell you to turn off the
master key.
**What the app can check.** The ledger tells if the master key is on or off.

## Case 9. An Offline Wallet does not get the Mainnet protections

**Situation.** You make an Offline Wallet for a large amount. It has no network.
**Risk.** Some protections apply only to Mainnet: the open check, the written
seed, and the rule about the temporary web address for passkey seeds. An Offline
Wallet does not get them. If the device breaks and you have no written seed,
the funds are lost.
**What the app can check.** The app can apply the Mainnet protections to each
Offline Wallet.

## Case 10. A Testnet seed becomes a Mainnet wallet

**Situation.** You have a Testnet wallet. You change it to offline. Then you
change it to online and select Mainnet.
**Risk.** The seed was on Testnet, possibly in test tools and faucets. It now
holds real funds. The app did not show the Mainnet questions.
**What the app can check.** The app can record the network of the wallet before
the change. It can show the Mainnet questions when you change to online.

## Case 11. The data to sign has more values than necessary

**Situation.** The offline device asks for data to sign. The answer has the
four values (sequence number, fee, time limit, network) and other values too.
**Risk.** If the offline device uses the other values, it signs a transaction
from the online device, not your transaction.
**What the app can check.** The offline device can use only the four values. It
can refuse an answer with other values. It can refuse an answer to a request
that it did not send.

## Case 12. The wallet locks during a round

**Situation.** You make the transaction on the offline device. You wait for the
online device. The wallet locks automatically after one minute.
**Risk.** The lock erases the transaction. You must make it again.
**What the app can check.** This is not a safety risk. It is a time cost.

---

## Your two answers (2026-11-07) change these cases

- **"The network is a thing only if the two devices must know it. No node is
  the true rule."** This applies to cases 1, 9 and 10.
- **"Trust the user. Warn about the master key and the Regular Key. Do not
  block."** This applies to cases 2, 3, 7 and 8.

---

## Proposed answers (2026-11-07, not yet approved)

Two principles from the owner:
- **P1.** No node is the true rule. A network matters only where the two
  devices must agree on it.
- **P2.** Trust the user. Warn about risk. Do not block. The ledger's own rules
  stay.

A third rule follows from P2: the app shows everything it signs in words. It
refuses only data that it cannot show or that is malformed. This is not a
block on a user choice. The user cannot choose what the user cannot see.

| Case | Proposed answer | Principle |
|---|---|---|
| 1 | The Offline Wallet has a network (no node). The two devices must agree on it: each request and each signed transaction names it, both screens show it, and the Transmitter sends only on that network. A warning says: do not use one seed on more than one network. The PRD states the remaining risk. *Owner, 2026-11-07.* | P1 |
| 2 | Keep "this key signs for account X". An Offline Wallet records the account and the key address separately. | P2 |
| 3 | Warn, do not block. Before a Regular Key change or master key off, the warning states what the app knows: if a wallet on this device holds the new key, and what the ledger says. The ledger's own refusals stay. | P2 |
| 4 | A retry from the same Build uses the same sequence number, so the transaction can apply only once. The offline device keeps a list of what it signed and shows it before it signs again. A new payment is a new Build. | correctness |
| 5 | On the Offline-builds route the offline device sets the time limit itself from the ledger number that it receives. It remembers the highest ledger number seen and warns if a number goes back or jumps. On the Transmitter-builds route it shows the time limit and warns if it is longer than the usual window. | P2 |
| 6 | Show every field and flag in words. Refuse only a field the app cannot show. Warn strongly on partial payment, SendMax, permanent flags, Delegate and memos. | P2 + show-all rule |
| 7 | The Offline-builds route types the address on the offline device. On the Transmitter-builds route, the offline device says if the new Regular Key is a wallet on this device, and warns if it is not. | P2 |
| 8 | Add step 3 to text C: "Turn off the master key. You must sign this with the old key." (Fact: only the master key can turn itself off.) | fact |
| 9 | Solved by case 1: an offline Mainnet wallet is a Mainnet wallet, so the Mainnet rules apply to it the same way. Name for those rules still open (not "blocks"). | P1 |
| 10 | Solved by case 1: the wallet keeps its network when it changes between online and offline. FR-93 (one network for life) stays as it is. | P1 |
| 11 | Data to Sign carries only the four values and a ledger number, plus the request ID. The offline device refuses an answer with other values or a wrong request ID. | correctness |
| 12 | No change. The PRD says that a lock in a round erases the Build. | — |
| Delegates | Delegation is enabled on Mainnet. A Synced Transmitter shows the delegates of the account and warns that a delegate can act for it. | P2 |
