---
title: 'Retry without paying twice'
type: 'feature'
created: '2026-11-10'
status: 'done'
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
| Transmit `tefPAST_SEQ` | scanned blob, preliminary `tefPAST_SEQ`, hash not validated on the ledger | outcome "Probably sent before" + P-23 line, caution; no resend | hash found validated: its real outcome |
| Transmit other results | scanned blob | as today (validated, claimed, failed, expired, unknown; `tem` → unconfirmed); one `submit` | — |

</frozen-after-approval>

## Spec Change Log

- 2026-11-10, after the browser probe: the I/O row "Transmit `tefPAST_SEQ`" reads "hash not validated on the ledger" (was "not on the ledger"), because rippled answers `tx` for a hash it rejected with `validated: false` (`.playwright-mcp/s7-probe.mjs`). Nothing else in the intent changed.

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
- [x] signed-list lib + keystore storage + tests
- [x] round: retry phases, kept, Start the request again; real-crypto blob tests (a new payment, b, c, lower)
- [x] screens: P-19 record, P-20/21/22, Signed screen + tests
- [x] Transmit `sent-before` + writes tests (one submit; other outcomes unchanged)
- [x] gates; browser pass (two contexts, Testnet): case (a) after a validated payment, case (c) twice in window

**Acceptance Criteria:**
- Given a validated payment and its Kept plate, when "Start the request again" runs a new round, then P-20 shows and nothing is signed unless "This is a new payment" is pressed; the account's history shows one payment.
- Given two signings inside the window, when both are transmitted, then one validates and the other shows "Probably sent before", never "Failed".

## Implementation Notes

- Commits: `e35e8de` (code and tests), `a35fe1e` (the `tefPAST_SEQ` read fixed after the browser pass, and this record), then the case (c) rerun, one more test and the deferred entries.
- **Signed list.** `WalletView.signed?: SignedRecord[]` (`signed-list.ts`): buildHash, sequence, hash, lastLedgerSequence, ledgerIndex, signedAt. Written by `keystore.noteSigned` (Offline view only, record validated), read by `signedListOf` (throws on a failed read; it never returns a failed read as `[]`; malformed entries are dropped). It survives a lock and a reload, and goes with the Wallet's removal. A change of kind keeps it on the view.
- **Order of signing.** Sign, check the round is still current, write the record, check again, then show the signed QR. If the write fails, the blob is dropped and P-16 shows. So every signing whose QR was shown is in the list.
- **Retry table** (`retryCaseOf`), compared against `latestSameBuild`: the record with the highest Sequence, then the highest LastLedgerSequence. Reading the Data to Sign does a fresh `signedListOf`; a failed read is P-16 alone. Round phases: `retry-higher` (P-20) and `signing.retry` (`passed`/P-21, `same-sequence`/P-22), with `signing.sequence` as the Sequence signed with.
- **Kept transaction across phases.** `Round.kept` (in memory, erased by a lock) carries the last signing. The Kept plate shows after signing (with "Start the request again"), and also under a restarted request and under case (a), so Flow 4's "Check first" and then "I know the result" works. P-19 and the record show on Reviewed and on Request shown.
- **Transmit step.** For the scanned path only (`transmitSignedTransaction`), `writes.ts` does its own single `submit` and waits as xrpl.js 5.1.0's `submitAndWait` does (`fail_hard` for AccountDelete, a `tem` throws, `txnNotFound` polls again, the expiry error, unknown meta). One change: a preliminary `tefPAST_SEQ` returns `sent-before` at once unless the hash reads validated. `TransmitOutcome` extends `SubmitOutcome` for that path only, so the online types and outcomes are unchanged. TransmitScreen renders P-23 (caution lamp, hash link, line) with no resend key, and the hash stays in the already-sent set.

## Design Notes

- **Found in the browser, fixed: rippled answers `tx` for a hash it rejected.** On Testnet the rejected blob's `tx` read returns `validated: false`, not `txnNotFound` (`.playwright-mcp/s7-probe.mjs`). The first build waited for that hash and would have run out the window, ending in "Expired". Now anything short of a validated read after `tefPAST_SEQ` is P-23. A same blob still in the open ledger also gets P-23. That is true, because it was sent before; its hash link shows the outcome.
- **"Past" read as `>=`.** The validated ledger that equals the earlier LastLedgerSequence holds no earlier transaction, so the earlier one can never apply. This matches story 2's window rule.
- **Lower received Sequence (not in the table).** If the window has passed, it is handled as (b) with the received Sequence. If not, it is handled as (c) with the earlier Sequence, so the two signings share one Sequence.
- **Every `tefPAST_SEQ` on a scanned blob is P-23.** The Transmitter cannot know whether a blob is a same-Sequence retry, and the Sequence is used either way. The online Send path is unchanged: a `tefPAST_SEQ` race there still ends as today's expired after the window (reported, not changed).
- **Notices without legends.** The mockup's "Notice" and "Caution" legends are not approved. P-19, P-21 and P-22 are default Alerts with no title. P-20 is a warning Alert whose own sentence is the focused h2.
- **Words missing (not built, need owner approval):** the mockup's "Sequence received" row on case (a); "(same as before)" beside the Sequence in case (c); "Ledger result" with `tefPAST_SEQ` on the P-23 outcome; a reason line under P-16 when the signed list cannot be read or written (P-16 shows alone); and a line on the Signed screen when its list cannot be read (P-49 shows alone, never P-56).
- Words used: P-16, P-18 (with "Start the request again"), P-19, P-20, P-21, P-22, P-23, P-49, P-52, P-56, the fixed "This is a new payment", plus story 6's words. All are in `offline-round-words.ts` and tested against EXPERIENCE.md and consequence-texts.md.

## Verification

**Gates (2026-11-10, final tree):** `bun run lint` · `bun run build` · `bun run test` (167 files, 2505 tests; baseline 164 / 2429 on story 6's record) · `bun run check:contrast`. All green.

**Browser pass (2026-11-10, code at `a35fe1e`; the rerun only changed the transmit order in the script).** Setup:
- Dev server: `bun run dev -- --port 5227 --strictPort`.
- Driver: `.playwright-mcp/s7-full.js` (git-ignored), run through the Playwright MCP in a headless Chromium with two fresh contexts. O is the offline device, T the online device; each has a CDP virtual authenticator.
- Account: a throwaway Testnet account `r99Q3ajqELB6csnN9w4tQpYQo8Mv31pAjz`, funded with 100 XRP by the faucet from a Node script. Its Seed was imported in O as an Offline Wallet. T is an unsynced Transmitter. Destination `rsSzdKMq…EYbnE`.
- Hand-off: each payload was moved by decoding the plate's QR pixels with jsQR and pasting the text.
- Harness only: visibility was pinned to visible. Nothing in the app was forced.
- Two earlier runs failed: a case-sensitive check in the script, then the `tx` read above. The account's history therefore holds their payments (Sequences 22214697 to 22214700) besides this run's.

| Criterion | Result |
|---|---|
| First signing, no notice | Met: no P-19, no retry notice; validated `619A7AF4…BF514F` (Sequence 22214701). |
| Start the request again | Met: request plate focused, P-19 + record and the Kept plate shown. |
| Case (a) after a validated payment | Met in both runs (rerun: round 1 `B129A546…330729`, Sequence 22214703; case (a) signed nothing, and 22214704 went to case (c)). First run: the Transmitter answered Sequence 22214702; P-20 heading focused, record shown, no Sign key, "This is a new payment" offered. "Check first", then "I know the result", then Erase. Nothing paid twice: `account_tx` shows one 5 XRP payment for this round (Sequence 22214701), and 22214702 went to the case (c) payment. |
| Same Build after a lock | Met: after a reload and Open, the same 5 XRP typed again shows P-19 with the record. A 3 XRP Build shows none. |
| Case (c): two signings inside the window, both transmitted | Met, in the order of EXPERIENCE Flow 4's variant (rerun): A signed (Sequence 22214704, LLS 22215047). Restarting gave P-22 and no "This is a new payment"; B signed with the same Sequence (LLS 22215048). A transmitted first: VALIDATED `3DD28AD7…7122A9`. B transmitted next: "PROBABLY SENT BEFORE" `D95C895C…ED5A42` plus the P-23 line, focused, caution lamp, no Send key (`s7-T-p23b-320-dark`). `account_tx` holds A and not B: one payment applied. A first run sent them the other way round (B validated `1E825C4B…`, A got P-23); the code path is the same. |
| Signed by this wallet | Met: P-49, three records newest first, P-52 terms. |
| Offline Wallet makes no ledger connection | Met: 0 non-local WebSockets on O. |
| 320 dark / 390 light / 1280 light, and 320 at 200% text | Met for restart, case (a), P-19 review, case (c), P-23 and the Signed list: no side scroll, nothing past the viewport (measured). |

Screenshots are in the session scratchpad `s7/`. Opened: `s7-T-p23b-320-dark`, `s7-O-case-a-320-dark`, `s7-T-p23-390-light`, `s7-O-review-p19-390-light`, `s7-O-signed-list-1280-light`, `s7-O-case-c-320-zoom200` (a full-page capture at 200% shows the top of the page only; overflow measured). The dev server was stopped.

Not driven in the browser (pinned by unit tests): case (b), a lower Sequence, a failed list read or write, and the online path.
