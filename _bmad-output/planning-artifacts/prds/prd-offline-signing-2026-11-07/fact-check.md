# Fact-check: offline signing cases

Checked 2026-11-07 against xrpl.org documentation and the rippled source
(XRPLF/rippled, `develop`). Every source below was read by the checker; a claim
with no source read is marked unverified. Amendment status was also read from
live Mainnet nodes (`feature` on xrplcluster.com and s2.ripple.com).

Cases refer to `cases.md`.

| Case | XRPL facts in the case | Verdict |
|---|---|---|
| 1 | No network in the signature; cross-network replay | True, with a condition |
| 2 | A Regular Key signs for its account | True |
| 3 | Unheld Regular Key, then master off | True, plus one ledger guard |
| 4 | Same Sequence retry: at most one applies | True |
| 5 | No upper limit on LastLedgerSequence | True |
| 6 | Hidden fields and flags | True, two corrections |
| 7 | Regular Key can sign payments and change itself | True |
| 8 | Regular Key does not stop the master key | True |
| 9–12 | App rules | No XRPL claim to check |

## Case 1. The network is not in the signature — TRUE, with a condition

- Mainnet (0), Testnet (1) and Devnet (2) must **omit** `NetworkID`; it is
  required, and signed, only above 1024. Including it at 1024 or below fails
  with `telNETWORK_ID_MAKES_TX_NON_CANONICAL`; missing it above 1024 gives
  `telREQUIRES_NETWORK_ID`. [S1, S2, R1:79–94]
- xrpl.org says cross-network replay "is theoretically possible" when the
  account is funded on the second network, the Sequence (or Ticket) matches
  there, and `LastLedgerSequence` is absent or above the second network's
  current ledger index. [S1]
- **Condition that matters:** Mainnet's ledger index is much higher than
  Testnet's. A transaction built with Testnet's index expires at once on
  Mainnet (`tefMAX_LEDGER`). Replay Testnet → Mainnet needs a
  `LastLedgerSequence` taken from Mainnet (or omitted). In our routes the
  Transmitter supplies that value, so a compromised Transmitter can do it. The
  easy direction for an accident is Mainnet → Testnet.

## Case 2. A key signs for a different account — TRUE

- A Regular Key "is not intrinsically tied to the account" and can sign the
  account's transactions. [S9] The case's risk is an app rule (the offline
  device refuses another Account), not a ledger rule.

## Case 3. Nobody holds the Regular Key, and the master key is off — TRUE, plus one guard

- `SetRegularKey` accepts any address except the account's own
  (`temBAD_REGKEY`, from fixMasterKeyAsRegularKey, enabled 2019-10-02). Nothing
  checks that anyone holds the key. [S10, R4, S11]
- Turning the master key off needs a Regular Key or a signer list, else
  `tecNO_ALTERNATIVE_KEY`; and it must be **signed by the master key**, else
  `tecNEED_MASTER_KEY`. [S12, S13, R5]
- While the master key is off, the Regular Key **can be replaced** with no
  check, but **cannot be removed** without a signer list
  (`tecNO_ALTERNATIVE_KEY`). xrpl.org does not say this; rippled does. [R4]
- Result: an unheld Regular Key plus master off is a "blackholed" account: "no
  one can ever send transactions from it again". Caveat: objects created
  before (offers, escrows) can still execute, and a delegate (if any) can still
  act. [S14]

## Case 4. Retry after "Expired" or "Outcome unknown" — TRUE

- A lower Sequence fails with `tefPAST_SEQ`; tef results "are not applied to
  ledgers and cannot cause any changes", so no fee is taken. Transactions with
  the same Sequence: "it can be processed at most once". [S3, S5, R1:726–734]
- So a retry that reuses the same Sequence can never pay twice. A retry with
  the next Sequence can.

## Case 5. The time limit is too long — TRUE

- `LastLedgerSequence` is a UInt32 and **optional**; past it the result is
  `tefMAX_LEDGER`. rippled compares it only with the current ledger; there is
  no upper limit. A signed transaction with a far-future value can be kept by
  whoever holds it and sent much later. [S1, S3, R1:794–796, R2:77]
- xrpl.org recommends setting it on every transaction, at "last validated
  ledger index + 4". [S5] Our ~10 minute window is longer by design.
- Tickets (TicketBatch, enabled 2021-11-18) are the documented way to sign in
  advance and out of order. [S6, S7]

## Case 6. Fields you do not see — TRUE, two corrections

- `SendMax` is the "highest amount of source currency this transaction is
  allowed to cost"; `tfPartialPayment` lowers the delivered amount instead of
  failing; `DeliverMin` is valid only with a partial payment; `Paths` routes a
  cross-currency payment. [S15]
- **Correction:** `Memos` is a common field on every transaction type (max
  1 KB), not a Payment field. [S1]
- `Delegate`: the transaction is sent by another account on behalf of
  `Account`; the delegate signs and pays the fee. Amendment
  **PermissionDelegationV1_1**. **Correction:** the xrpl.org known-amendments
  page still shows it in voting, but live Mainnet nodes report it **enabled**
  (2026-11-07); the original PermissionDelegation is obsolete. [S1, S16, live
  `feature`]
- Permanent flags: `asfNoFreeze` "can never be disabled";
  `asfAllowTrustLineClawback` needs an **empty owner directory** (no trust
  lines, offers, escrows, channels, checks or signer lists) and "cannot be
  reverted". [S13]
- TrustSet: `tfSetfAuth` authorizes the other party to hold the issuer's
  currency and cannot be unset; `QualityIn` / `QualityOut` value balances at a
  ratio per 1,000,000,000. [S17]
- "Signing covers every field": partly true. Fields marked signing fields are
  signed (all normal fields); sponsor signatures are not. No xrpl.org page
  states a ledger-side protection against a field the user did not see:
  unverified, but nothing found suggests one exists. [S18, S1]

## Case 7. The online device changes the Regular Key address — TRUE

- A Regular Key can sign payments and "can authorize a transaction to change
  the regular key pair". [S9] One signature to a wrong address hands over the
  account.

## Case 8. A new Regular Key does not stop the old key — TRUE

- While the master key is on, it can sign everything, including replacing or
  removing the Regular Key. [S1, R4]
- Only the **master key** can turn itself off (`tecNEED_MASTER_KEY`). Turning
  it back on can be done with the Regular Key. [S9, R5]
- Extra fact: once the master key is off, a Regular Key can set `asfNoFreeze`
  (rippled; not in the docs). [R5]

## Cases 9–12 — app rules

These cases describe XRPL Bench rules (Mainnet floors, a Testnet seed reaching
Mainnet, the Data to Sign shape, auto-lock). They cite no ledger fact beyond
those checked above.

## Sources

- [S1] https://xrpl.org/docs/references/protocol/transactions/common-fields
- [S2] https://xrpl.org/docs/references/protocol/transactions/transaction-results/tel-codes
- [S3] https://xrpl.org/docs/references/protocol/transactions/transaction-results/tef-codes
- [S5] https://xrpl.org/docs/concepts/transactions/reliable-transaction-submission
- [S6] https://xrpl.org/docs/concepts/accounts/tickets
- [S7] https://xrpl.org/resources/known-amendments
- [S9] https://xrpl.org/docs/concepts/accounts/cryptographic-keys
- [S10] https://xrpl.org/docs/references/protocol/transactions/types/setregularkey
- [S11] https://xrpl.org/blog/2019/fixmasterkeyasregularkey-expected
- [S12] https://xrpl.org/docs/tutorials/how-tos/manage-account-settings/disable-master-key-pair
- [S13] https://xrpl.org/docs/references/protocol/transactions/types/accountset
- [S14] https://xrpl.org/docs/concepts/accounts/blackholed-accounts
- [S15] https://xrpl.org/docs/references/protocol/transactions/types/payment
- [S16] https://xrpl.org/docs/references/protocol/transactions/types/delegateset
- [S17] https://xrpl.org/docs/references/protocol/transactions/types/trustset
- [S18] https://xrpl.org/docs/references/protocol/binary-format
- [R1] rippled `src/libxrpl/tx/Transactor.cpp` (NetworkID 74–96; Sequence 726–734; LastLedgerSequence 794–796)
- [R2] rippled `include/xrpl/protocol/detail/sfields.macro` (49, 77)
- [R4] rippled `src/libxrpl/tx/transactors/account/SetRegularKey.cpp`
- [R5] rippled `src/libxrpl/tx/transactors/account/AccountSet.cpp`
- Live: `feature` RPC on xrplcluster.com and s2.ripple.com, 2026-11-07
  (PermissionDelegationV1_1, TicketBatch, fixMasterKeyAsRegularKey,
  fixCleanup3_4_0 enabled)

AI-assisted: the checks were run by AI research agents reading the sources
above; verdicts were compiled by Claude.
