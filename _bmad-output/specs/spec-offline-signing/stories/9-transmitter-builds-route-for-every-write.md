---
title: 'Transmitter-builds route for every write'
type: 'feature'
created: '2026-11-14'
status: 'in-progress'
baseline_commit: '097fc85'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/specs/spec-offline-signing/SPEC.md'
  - '{project-root}/_bmad-output/specs/spec-offline-signing/route-checks.md'
  - '{project-root}/_bmad-output/specs/spec-offline-signing/consequence-texts.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-11-07/EXPERIENCE.md'
  - '{project-root}/docs/agents/ledger-io.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A token payment cannot be signed offline by any route, the Synced Transmitter's New transaction is a title, and the Offline Wallet's Sign screen (P-3) is a title, so OS-SM-2 fails (CAP-11; OS-FR-17, OS-FR-18, OS-FR-21 W1/W3).

**Approach:** The Synced Transmitter Builds any write the online app builds, for its Synced address, with live reads and the online refusals, then makes the Unsigned Transaction (Sequence, Fee, LastLedgerSequence = validated + 150) in the `u` codec kind with an envelope `{v, network_id, ledger_index, tx}` (P-38), shows it (P-33) and scans the signed QR into the Transmit step. The Offline Sign screen judges the whole payload against an allow-list of types, fields and flags it can show in words, refuses in P-16/P-17, shows the signing review (Network large, P-13 in ledgers, P-15, P-14, P-53 under risky rows, W3, W1/P-30, W4), signs exactly the transaction it showed, records the signing in the signed list (cross-route Build hash) and shows the signed QR.

## Boundaries & Constraints

**Always:** Approved P-n, W texts, fixed strings, the 2026-11-09/10/14 approvals or shipped words for the same fact, in one module tested against its source. The Offline Wallet reads nothing from the ledger. What is shown is `decode(encode(judged))`, and that same object is signed. Transmitter reads go through the key factory, fresh; a failed read never makes an Unsigned Transaction. Story 6/7 signing order: sign, lock still open, record, lock still open, show, then highest seen. Guards pinned on the decoded signed blob. Payment's Build hash literal unchanged. Two-device (FR-78) keeps working until story 12.

**Never:** No app refusal of a key action (SPEC "Trust the user"). No "Other transactions" type that opens nothing. No scan count on this route ("Scan {n} of 3" is the only approved form). No signed blob stored. No `prepareUnsigned` change (two-device's 75-ledger window). No retry table on this route (the Transmitter sets the Sequence); P-19 shows as information.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Type list | Synced Transmitter, New transaction | Payment, Trust line, Regular Key, Master key; P-48 line on key types | unsynced: no screen (story 4) |
| Payment Build | XRP or a held token, destination, tag, amount; live Spendable, Network fee, token list, destination check | online Send's words and warnings; P-38 | online field errors; key held while invalid |
| Make the unsigned transaction | any type | fresh pre-flight (online refusals, as the answer); Unsigned plate: P-33 heading, Network row, QR, signed scanner ("Scan the signed transaction") | refusal: online words; read failed: "The app cannot read the ledger." + "Read again" |
| Key types on the Transmitter | Regular Key / Master key | key state rows from live reads; W5 when a set key is replaced; master off: "Test the Regular Key" → P-50, W4 | failed read: P-29 rows |
| Signed scanned on the Transmitter | signed code | Transmit step (P-25, fields, Send), expected Account = Synced address | P-26 / P-36 |
| Offline Sign, wrong kind | request, data, signed code | P-36 with the kind names | — |
| Offline refusals | malformed envelope or tx; other Network; Account not Signs-for; SigningPubKey/TxnSignature/Signers; Fee over cap; Payment `tfPartialPayment`; unknown type, field, flag or amount form | P-16 + P-17 (malformed / network / account / pre-set / fee / partial / "The app cannot show {name} in words."); no review; scanner ready | signer never opened |
| TrustSet `tfSetNoRipple` | same bit as `tfPartialPayment` | accepted (partial refusal is Payment only) | — |
| Signing review | accepted payload | "You are signing for {Network}" focused; "Time limit: {n} ledgers"; P-51; rows of the encoded tx; Signing key; P-15 when n > 150; P-14 from the envelope index | — |
| Risky rows | SendMax, Paths, DeliverMin, Memos, Delegate, TicketSequence, asfNoFreeze, asfAllowTrustLineClawback, tfSetfAuth | P-53 caution under that row | memo not UTF-8: refused (cannot show) |
| SetRegularKey | RegularKey set | W3 above the RegularKey row; P-30 when a key Wallet here holds it, else W1 | — |
| Master key off | AccountSet SetFlag asfDisableMaster | W4's sentence; Mainnet: typed "turn off" holds Sign | — |
| Do not sign | P-34 | P-34 result; back to the scanner | — |
| Sign | Signing Check passes | record (Build hash, Sequence, hash, LLS, ledger index, time) then signed QR ("Signed transaction", P-12 with the window's minutes) | record write fails: P-16, no QR; check dismissed: shipped words |
| Same Build | earlier record with this Build hash (either route) | P-19 + record on the review | list unreadable: P-16 |
| Lock mid-round | either device | Unsigned / review / signed QR gone | — |

</frozen-after-approval>

## Code Map

- `src/lib/qr-codec.ts` -- `encodeUnsigned` writes `ledger_index` when given; strict `decodeUnsignedForSigning` (exact envelope).
- New `src/lib/unsigned-judge.ts` -- allow-list judge, risky rows, window, cross-route Build hash.
- `src/lib/offline-round.ts` -- `buildHashOf` reused; `signUnsignedOffline` (sign the judged tx).
- `src/lib/answer-request.ts` -- shared `preflight(wallet, account, tx)` used by the answer and the build; token Payment pre-flight.
- New `src/lib/transmitter-build.ts` -- the Transmitter's Build union, `makeUnsigned`.
- `src/lib/offline-round-words.ts` + test -- P-13 ledgers, P-15, P-17 rest, P-33, P-38, P-48 line, P-53, W1, W3, P-30.
- `src/components/wallet/TransmitStep.tsx` -- the signed-code part of Transmit, shared.
- New `src/pages/kind/OfflineSign.tsx`, `TransmitterNewTransaction.tsx`; `KindWallets.tsx`, `TransmitScreen.tsx`.

## Tasks & Acceptance

**Execution:**
- [ ] codec + judge + Build hash + offline signing (real-crypto blobs) + tests
- [ ] shared pre-flight, token pre-flight, `makeUnsigned` + tests (decoded tx)
- [ ] words + test
- [ ] Offline Sign screen, Transmitter New transaction, Transmit step reuse + tests
- [ ] gates; browser pass with two contexts on Testnet

**Acceptance Criteria:**
- Given a funded throwaway Testnet account held as an Offline Wallet and a Transmitter Synced to it, when a token Payment and a TrustSet are each built on the Transmitter, signed offline and transmitted, then both validate.
- Given an Unsigned Transaction for another Network, then P-16/P-17 shows and nothing is signed; given one with a memo, then P-53's memo caution shows under the Memos row.
- Given the Offline Wallet on the Sign screen, then no ledger client is requested.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes

**OS-SM-2: every online write and its route.** The online app builds exactly these writes (grep of `TransactionType:` literals and `autofill(` callers, 2026-11-14: `SendTab` via `submitXrpPayment` / `submitIssuedPayment`, `TrustLinesTab` via `submitTrustSet`, `control.ts` via `submitSetRegularKey`, `master-key.ts` via `submitMasterKeyFlag`; two-device builds a subset):

| Online write | Offline-builds (stories 6, 8) | Transmitter-builds (this story) |
|---|---|---|
| Payment, XRP | yes | yes |
| Payment, token | no (the asset list is a read) | yes |
| TrustSet add / edit limit / close | yes | yes |
| SetRegularKey set | yes | yes |
| SetRegularKey remove (not online; story 8 adds it) | yes | yes |
| AccountSet `asfDisableMaster` off / on | yes | yes |

There is no other write, so P-62's "Other transactions" would open nothing: it is not shown. The brief's browser criterion "one Other transactions type" is therefore not applicable; the TrustSet stands in as the non-Payment type built on the Transmitter.

**Words not approved (left out):** a title for the Unsigned plate (P-33 heads it, as story 6 headed its plates with their lines before titles were approved); "Scan 1 of 2" / "Scan 2 of 2"; a word for an empty "Other transactions". `{duration}` in P-12 on this route is the window in minutes ("N minutes", ~4 s a ledger, the ratio of story 6's "10 minutes" for 150 ledgers); `{flag in words}` in P-53 is the ledger's flag name (P-52 keeps ledger names).

## Verification

**Commands:**
- `bun run lint` · `bun run build` · `bun run test` · `bun run check:contrast` -- all green.

**Manual checks:** two-context browser pass on Testnet (recorded below when done).
