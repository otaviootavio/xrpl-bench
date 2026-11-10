---
title: 'Retry without paying twice'
type: 'feature'
created: '2026-11-10'
status: 'in-progress'
baseline_commit: '6c6254c'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/specs/spec-offline-signing/SPEC.md'
  - '{project-root}/_bmad-output/specs/spec-offline-signing/route-checks.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-11-07/EXPERIENCE.md'
  - '{project-root}/docs/agents/ledger-io.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** After story 6 an Offline Wallet forgets every signing, so a second request for the same payment (after an unknown outcome, a lock, or a typed-again Build) gets a fresh Sequence and can pay twice; the Kept transaction plate has no "Start the request again"; a Transmitter that gets `tefPAST_SEQ` waits out the window and reports "Expired. Nothing was sent." (CAP-10 retry, OS-FR-16).

**Approach:** Keep a signed list on the Offline Wallet's view (no secret, no blob, survives a lock). A Same Build (same Build hash) shows P-19 and the earlier-signing record; when the Data to Sign arrives, its Sequence and ledger index are compared with the latest earlier signing and the retry table decides (P-20 / P-21 / P-22). Add "Start the request again" and the Signed screen (P-49, P-56). The Transmit step of a scanned blob reads the submit's preliminary result and reports `tefPAST_SEQ` as P-23.

## Boundaries & Constraints

**Always:** The record holds Build hash, Sequence, transaction hash, LastLedgerSequence, ledger index received and time signed; nothing else. It is written after signing and before the signed QR is shown; if the write fails the blob is dropped and nothing is shown (P-16). The list is read fresh when the Data to Sign arrives; a failed read signs nothing (P-16). Sequence guards are asserted on the decoded signed blob. Online sending is unchanged. Only approved words.

**Never:** No signed blob in storage. No "This is a new payment" in case (c). A used Sequence is never reported as failed or expired. No resend key on P-23. No `AccountTxnID`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First signing | Build with no earlier record | as story 6; one record appended | write fails: P-16, no QR |
| Same Build at review | record with the same Build hash (also after a lock, typed again) | P-19 + the record (Sequence, Transaction hash, Valid until ledger, Signed at) above the fields | list unreadable: no notice (nothing signs without a fresh read) |
| Case (a) | received Sequence > earlier | P-20 (focused) + record; nothing signed; "Check first" → request; "This is a new payment" → signing review with the received Sequence | — |
| Case (b) | same Sequence, index ≥ earlier LastLedgerSequence | signing review with P-21; received Sequence | — |
| Case (c) | same Sequence, index < earlier LastLedgerSequence | signing review with P-22; earlier Sequence; no "This is a new payment" | — |
| Lower Sequence | received < earlier | index ≥ earlier LLS: as (b); else as (c) with the earlier Sequence | — |
| Several records | same Build signed more than once | compared with highest Sequence, then highest LastLedgerSequence | — |
| List read fails | Data to Sign arrives, list cannot be read | P-16 alone, nothing signed | — |
| Start the request again | Kept plate after signing | request QR with a new request ID, same Build; Kept plate stays below | — |
| Signed screen | records | P-49, then each record newest first | empty: P-56; failed read: P-49 only |
| Transmit `tefPAST_SEQ` | scanned blob, preliminary `tefPAST_SEQ`, hash not on the ledger | outcome "Probably sent before" + P-23 line, caution; no resend | hash found validated: its real outcome |
| Transmit other results | scanned blob | as today (validated, claimed, failed, expired, unknown; `tem` → unconfirmed); one `submit` | — |

</frozen-after-approval>

## Code Map

- New `src/lib/signed-list.ts` -- `SignedRecord`, `latestSameBuild`, `retryCaseOf` (the retry table), sequence to sign with.
- `src/lib/crypto/db.ts`, `keystore.ts` -- `WalletView.signed`; `signedListOf`, `noteSigned`, a change listener.
- `src/lib/offline-round.ts` -- `assembleTransaction` takes the chosen Sequence; phases `retry-higher`, signing `retry`; `Round.kept` across phases.
- `src/lib/offline-round-words.ts` + test -- P-18 third key, P-19 to P-23, P-49, P-52, P-56.
- `src/pages/kind/OfflineNewTransaction.tsx` -- record notice, retry screens, Start the request again, write-before-show.
- New `src/pages/kind/OfflineSigned.tsx`; `KindWallets.tsx` -- the Signed screen.
- `src/lib/xrpl/writes.ts` -- scanned path: own submit and wait, `sent-before` outcome.
- `src/pages/kind/TransmitScreen.tsx` -- P-23 outcome.

## Tasks & Acceptance

**Execution:**
- [ ] signed-list lib + keystore storage + tests
- [ ] round: retry phases, kept, Start the request again; real-crypto blob tests (a new payment, b, c, lower)
- [ ] screens: P-19 record, P-20/21/22, Signed screen + tests
- [ ] Transmit `sent-before` + writes tests (one submit; other outcomes unchanged)
- [ ] gates; browser pass (two contexts, Testnet): case (a) after a validated payment, case (c) twice in window

**Acceptance Criteria:**
- Given a validated payment and its Kept plate, when "Start the request again" runs a new round, then P-20 shows and nothing is signed unless "This is a new payment" is pressed; the account's history shows one payment.
- Given two signings inside the window, when both are transmitted, then one validates and the other shows "Probably sent before", never "Failed".

## Design Notes

Filled during the build.

## Verification

Filled after the build.
