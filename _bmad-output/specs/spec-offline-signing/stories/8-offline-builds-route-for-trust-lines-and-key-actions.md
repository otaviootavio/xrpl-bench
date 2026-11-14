---
title: 'Offline-builds route for trust lines and key actions'
type: 'feature'
created: '2026-11-14'
status: 'in-progress'
baseline_commit: '8da790f'
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

**Problem:** The Offline-builds route builds only an XRP Payment. An Offline Wallet cannot add, change or remove a trust line, set, replace or remove a Regular Key, or turn its master key off or on, and the Transmitter cannot answer a request for any of these (CAP-8, CAP-9; OS-FR-13 to OS-FR-16, OS-FR-21 display).

**Approach:** Three more types in New transaction (P-62): Trust line (the online trust-line fields and the online TrustSet, `tfSetNoRipple`), Regular Key (P-47 set / remove; the address typed or scanned on the offline device) and Master key (P-47 off / on, `asfDisableMaster`). The request carries each type as an exact key set. The Transmitter runs the online refusals that still hold for the type and, for a key change only, adds the Account's key state to the Data to Sign for display. The Offline Wallet shows the key state, W5 and W4 on its signing review, and the typed phrase for master key off on Mainnet. Same Build and the retry table work unchanged, on a Build hash that now covers every type.

## Boundaries & Constraints

**Always:** Only approved P-n, fixed strings, W texts verbatim, the 2026-11-09/10 approvals, or words already shipped on the online screen for the same fact; each in one module tested against its source. The Offline Wallet reads nothing. The signed transaction is the kept Build plus the exact Data to Sign set; `key_state` is display only and changes no field, refusal or retry case. A new Regular Key address comes only from the offline device. The Transmitter never answers from a failed read, uses its own Network, and keeps Payment's answer unchanged. Payment's Build hash is unchanged (story 7's records still match). Guards asserted on the decoded signed blob.

**Never:** No app refusal of a key action beyond what the ledger needs for Data to Sign (SPEC "Trust the user": the online FR-75/FR-77 guards "no Regular Key yet", "already off", "no wallet here holds the Regular Key", "master key turned off" are not copied). No W1, W2 or P-30 (story 11; route-checks' Offline-builds rows do not require them). No signer-list read or row (no approved words, as story 4). No "Key state" heading, no "Review" word invented for these types beyond shipped reuse (Design Notes). No token payment. No `AccountTxnID`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Type list | New transaction | "Type of transaction": Payment, Trust line, Regular Key, Master key (P-62) | — |
| Trust line Build | Add / Edit limit / Close; issuer, currency, limit | "Trust Lines" with P-1 (P-56); Owner reserve and Network fee P-1; TrustSet `LimitAmount{currency (upper), issuer, limit (canonical)}`, `Flags: tfSetNoRipple`; Close = limit "0" | shipped address and currency errors; Review held while invalid |
| Regular Key Build | Set (typed or scanned address) / Remove | Regular Key and Master key rows P-1; SetRegularKey with `RegularKey` / without it | shipped invalid-address error; a scan that is not an address leaves the field as it was |
| Master key Build | Turn off / Turn on | rows P-1; off: "Test the Regular Key" → P-50, then W4's sentence; AccountSet `SetFlag` / `ClearFlag` = `asfDisableMaster` | — |
| Request | any new type | request carries the exact tx key set; codec refuses any other key or value as malformed | — |
| Transmitter, trust line add | line not on the ledger, limit > 0 | online add guard order: reserve read, account, fee cap, spendable covers owner reserve + fee; checks "Spendable sufficient", "Fee less than the fee limit" | read fails: P-28; not activated / not enough: TrustLinesTab words |
| Transmitter, trust line change or close | line on the ledger, or limit "0" | fee guard only | lines read fails: P-28 |
| Transmitter, key change | Regular Key or Master key | key state rows (Regular Key: address or "None."; Master key on/off); W5 when set and replaced; W4 when turning off; Data to Sign with `key_state` | account read fails: P-28; not on the ledger: online words |
| Key state unknown | a Data to Sign whose `key_state` is "unknown" | rows P-29 on the signing review; no W5 | — |
| Data to Sign shape | key change without `key_state`, or payment / trust line with one | P-16 + P-17 malformed | — |
| Signing review, key change | Regular Key set to Y, state says X set | rows, W5; blob `RegularKey: Y` whatever X is | — |
| Signing review, master key off | Mainnet / other Network | W4's sentence above the typed confirm; Mainnet: Sign held until "turn off" is typed | — |
| Same Build | same type and content typed again | P-19 and the retry table, as Payment | — |
| Lock mid-round | any type | round erased | — |

</frozen-after-approval>

## Code Map

- `src/lib/qr-codec.ts` -- request tx variants (TrustSet, SetRegularKey, AccountSet), optional Data to Sign `key_state`.
- `src/lib/offline-round.ts` -- Build union, `builtTransaction`, `buildHashOf` per type, `judgeDataToSign` key-state presence rule, generic `assembleTransaction`.
- `src/lib/answer-request.ts` -- dispatch per type; trust-line add/change guard; key-change key state.
- `src/lib/offline-round-words.ts` + test -- P-47, P-50, P-56, P-57 address scan, P-62 types, W4/W5, shipped trust-line and key words.
- `src/components/wallet/SignedTransactionReview.tsx` -- flag names, `fieldValue` shared.
- New `src/components/wallet/AddressScan.tsx` -- camera-only reader of a plain address QR.
- `src/pages/kind/OfflineNewTransaction.tsx` -- type list, three forms, key state on the review, W4/W5, typed phrase.
- `src/pages/kind/TransmitScreen.tsx` -- answer plate: per-type check rows, key state, W4/W5.

## Tasks & Acceptance

**Execution:**
- [ ] codec variants + key_state + tests
- [ ] offline-round Build union, hash (Payment pinned), judgement, assembly + tests (real-crypto blobs for each type, a Signs-for view signing AccountSet ClearFlag)
- [ ] answer-request per type + tests
- [ ] words + test; flag names
- [ ] screens + tests (no ledger client for every type)
- [ ] gates; browser pass with two contexts on Testnet

**Acceptance Criteria:**
- Given a funded throwaway Testnet account held as an Offline Wallet and an unsynced Transmitter in another context, when each round runs by three scans, then a TrustSet, a SetRegularKey to a second address, master key off, master key on (signed by the Regular Key) and the Regular Key's removal each validate.
- Given an Offline Wallet on any new type, then no ledger client is requested.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes

## Verification
