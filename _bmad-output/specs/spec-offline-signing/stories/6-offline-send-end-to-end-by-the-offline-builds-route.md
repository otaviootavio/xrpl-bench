---
title: 'Offline Send end to end by the Offline-builds route'
type: 'feature'
created: '2026-11-10'
status: 'in-progress'
baseline_commit: '420bc5d'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/specs/spec-offline-signing/SPEC.md'
  - '{project-root}/_bmad-output/specs/spec-offline-signing/route-checks.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-11-07/EXPERIENCE.md'
  - '{project-root}/docs/agents/ledger-io.md'
  - '{project-root}/docs/agents/keys-and-secrets.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** An Offline Wallet can hold a key but cannot send anything: its New transaction screen is a title, the codec has no Data-to-Sign Request or Data to Sign kind, and the Transmitter cannot answer a request (CAP-7, CAP-8, CAP-9, CAP-10 without retry; OS-FR-11, OS-FR-13 to OS-FR-16, OS-SM-1).

**Approach:** Two new codec kinds carried as UR by story 13's transport. The Offline Wallet Builds an XRP Payment with the online Send fields and P-1 in every reading's slot, reviews it, shows the request QR, scans the Transmitter's Data to Sign, checks it (exact set, request ID, Build hash, Network, Account, fee cap, highest-seen ledger), sets LastLedgerSequence itself, shows the signing review and signs once through `writes.ts`, then shows the signed QR and the Kept transaction plate. The Transmitter answers a request after the online pre-flight checks and remembers the request's Account for the Transmit step.

## Boundaries & Constraints

**Always:** Every new user-visible string is an approved P-n or fixed string, from one module tested against its source; shipped words are reused where a P-n is missing. An Offline Wallet mounts no ledger hook and asks no client. The signed transaction is made only from the kept Build plus the exact Data to Sign set; nothing else from the online device is used. Signing goes through `writes.ts` (`signPrepared`: fee cap, Account) with a handle the keystore gives an Offline view only. Transmitter reads go through the query-key factory, a failed read never produces Data to Sign (P-28), and any `autofill` stays in `writes.ts`. The Data to Sign carries the Transmitter's own Network. A lock erases the kept Build and request ID. Guards on Fee, Sequence, LastLedgerSequence and Network are asserted on the decoded signed blob.

**Never:** No retry of a Same Build and no "Start the request again" (story 7: a new request for a signed Build could pay twice without its Sequence comparison). No trust line, Regular Key or master key type (story 8). No token payment offline. No Send key on the Offline Wallet. No signed blob or Build in persisted storage. No invented words: "Scan 1 of 3", "Checking {address} on {Network}", the Data to Sign and signed plate titles, the type-picker legend and a "signing key" row term are left out (Design Notes).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Build | destination, tag, XRP amount | P-1 in the Network fee, Spendable and destination-check slots; "Review payment" | shipped field errors; self-send refused |
| Review → request | Show the request (P-37) | request QR, title "Data to sign needed" (focused), Network row, P-9, P-10 key and line, scan plate (P-57 title, P-11) | — |
| Change the transaction | P-10 key | back to the form, values kept; next request has a new request ID | — |
| Transmitter answers | request, all reads ok | "Checked on {Network}" list, Data to Sign QR on its own Network; request's Account remembered | — |
| Transmitter refuses | other Network / synced elsewhere | P-55, no QR | — |
| Transmitter refuses | tag required and none, self-send, account not activated, amount + fee over spendable, fee over cap | shipped online words, no QR | — |
| Transmitter read fails | account, reserves, destination, fee/sequence or ledger read | P-28 and "Read again", no QR | — |
| Destination not activated | read ok, destination absent | shipped online warning, still answers | — |
| Data to Sign ok | matching IDs, own Network, Fee ≤ cap | signing review: well "You are signing for {Network}" (focused), P-13, P-51, field list | — |
| Data refused | other request ID / Build hash / after a lock | P-16 + P-17 request, no review | request QR stays |
| Data refused | extra or missing value, bad type | P-16 + P-17 malformed | — |
| Data refused | other Network / Fee over cap / Account not Signs-for | P-16 + P-17 network / fee / account | — |
| Ledger index | lower than highest seen / too high for elapsed time | P-14 caution on the review; Sign still offered | — |
| Sign | Sign, Signing Check passes | blob: Account, Destination, Amount, tag, Fee and Sequence received, LastLedgerSequence = index + 150, no NetworkID; signed QR (envelope Network = Wallet's), P-12, Kept transaction plate | check dismissed / failed: shipped check words, nothing signed |
| Do not sign | P-34 key | back to the request, P-34 result in a status | — |
| Kept plate | I know the result / Cancel this transaction | P-61 confirm; Erase clears the round, Keep it keeps it | — |
| Lock mid-round | any phase | round erased; next open shows an empty form | — |
| Auto-lock near | ≤ 1 minute left during a round | P-58 caution with "Keep it unlocked" | — |
| Transmit after answer | signed QR for the answered Account, unsynced | P-25 Account line, no P-27, Send → outcome | wrong Account: P-26 |

</frozen-after-approval>

## Code Map

- `src/lib/qr-codec.ts` -- `r` (`xrplbench-request`) and `d` (`xrplbench-data-to-sign`) kinds, exact-set decoders, `payloadKindOf`.
- New `src/lib/offline-round.ts` -- Build, Build hash, request ID, Data to Sign judgement, assembly (LastLedgerSequence), ledger-jump warning, signing; in-memory round store erased by lock.
- New `src/lib/answer-request.ts` -- the Transmitter's pre-flight and Data to Sign.
- New `src/lib/offline-round-words.ts` + test -- the approved words.
- `src/lib/xrpl/writes.ts` -- `prepareDataToSign` (autofill, fee cap, validated index).
- `src/lib/crypto/keystore.ts`, `db.ts` -- `offlineSigningHandleFor` (Offline view only); highest-seen ledger on the view.
- New `src/components/wallet/HandoffPlate.tsx` -- QR hand-off plate: Network row, P-59 larger code, wake lock.
- `src/components/wallet/PayloadQr.tsx` -- size override for the larger code.
- New `src/pages/kind/OfflineNewTransaction.tsx`; `KindWallets.tsx`, `TransmitScreen.tsx`.
- `src/hooks/useClearCacheOnLock.ts` -- erases rounds of closed locks.

## Tasks & Acceptance

**Execution:**
- [ ] codec kinds + tests
- [ ] offline-round lib, keystore handle, ledger seen, words + tests (blob decoded)
- [ ] prepareDataToSign + answer-request + tests
- [ ] HandoffPlate, OfflineNewTransaction, TransmitScreen answer + tests
- [ ] lock erasure, P-58
- [ ] browser pass, two contexts, OS-SM-1 on Testnet

**Acceptance Criteria:**
- Given a funded Testnet account whose Seed is the Offline Wallet's, when the round runs between two contexts, then three scans (request, Data to Sign, signed) end in a validated payment and no field is typed twice (OS-SM-1).
- Given an Offline Wallet at any point of the round, then no ledger client is requested.

## Implementation Notes

## Design Notes

## Verification
