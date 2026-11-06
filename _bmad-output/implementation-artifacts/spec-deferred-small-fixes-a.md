---
title: 'Small deferred fixes A: unused package, unreadable results, issuer trust line'
type: 'bugfix'
created: '2026-11-05'
baseline_revision: '00396b6ac3313664bf6e953ce25c46bc8da8446c'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
context: []
warnings: ['multiple-goals', 'oversized']
deferred:
  - summary: >-
      After any Send outcome, including the new unknown one, the form keeps the destination and amount, so Review payment can re-open the confirm at once.
    evidence: |-
      SendTab never clears the destination or amount after a submit (only an asset change clears the amount). Pre-existing for every outcome; riskier after an unknown one, where the payment may already have gone through. The confirm dialog and the warning naming the hash still stand in the way.
    location: >-
      src/pages/tabs/SendTab.tsx
    severity: medium
  - summary: >-
      docs/decisions.md does not record the new unknown write outcome and the 'unknown' History result marker.
    evidence: |-
      TxStatusBadge cites decisions.md section 5.5 for how results are classified; the fourth outcome (warning not error, refresh the reads, never resubmit) is not there. Deferred because the fix edits an agent-context document.
    location: >-
      docs/decisions.md
    severity: low
---

<intent-contract>

## Intent

**Problem:** Four entries from the deferred-work sweep (PR #62) are still true on `dev`: an unused `@radix-ui/react-switch` dependency; a History page that crashes on an `account_tx` entry with `meta: null`; a submit whose validated result has no readable `TransactionResult` that throws (and, via the `'unknown'` fallback, would be shown as "Failed", no fee); and a token sent back to its own issuer warned as "Recipient can't hold this token".

**Approach:** Remove the dependency. Make an unreadable result its own state everywhere it can appear: History keeps the row and says the result was not read; the write choke point returns a new `unknown` outcome that every caller presents as "outcome unknown, check the hash" and that refreshes the account reads. Treat the issuer as always able to receive its own token.

## Boundaries & Constraints

**Always:** A transaction whose result could not be read is never presented as failed or as not sent (the operator would resend and pay twice). A row the ledger returned is never silently dropped from History. Money stays strings/BigInt. Account reads still go through the query-key factory and `invalidateAccountScoped`.

**Never:** Retrying or resubmitting automatically on an unknown outcome. Changing how `tesSUCCESS`, `tec*`, `tef*`/`tem*` or expiry are classified. Touching Trust lines fee or reserve display (that is spec B).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| History, validated, meta null | `account_tx` entry `{validated: true, meta: null}` | Row kept; status reads "Result not read"; Payment amount shown only as the flagged upper bound | No throw; rest of the page renders |
| History, unvalidated, meta null | `{validated: false, meta: null}` | Row kept as Pending | No throw |
| History, meta without TransactionResult | validated, `meta: {}` | Same as meta null: "Result not read", never "Failed" | No throw |
| Submit, meta without TransactionResult | `submitAndWait` resolves, `meta` lacks `TransactionResult` or is not an object | `{status: 'unknown', hash}` | No throw; never `failed` |
| Send, unknown outcome | Send gets `unknown` | Outcome plate shows "Outcome unknown" with the hash link and a sentence to check it before sending again; account reads and destination check refreshed | Warning toast, not error |
| Token to its issuer | destination === token issuer | `hasTrustLine` true; no "can't hold this token" warning; no `account_lines` read for that case | — |

</intent-contract>

## Code Map

- `package.json`, `bun.lock` -- `@radix-ui/react-switch` listed (package.json:34); nothing in `src/` imports it.
- `src/lib/xrpl/reads.ts` -- `fetchAccountTx` loop ~L220-239: `if (!tx || typeof meta !== 'object') continue` lets `null` through, then `meta.TransactionResult` throws; `resultCode` falls back to `''`. `paymentAmountOf(tx, meta)` already tolerates a non-record meta. `isRecord` is in scope.
- `src/lib/xrpl/writes.ts` -- `SubmitOutcome` (~L122), `classify` (~L132), `submitAndClassify` reads `meta.TransactionResult` at ~L199-205 with an `'unknown'` fallback that `classify` turns into `failed`.
- `src/components/wallet/TxStatusBadge.tsx` -- maps a result code to a lamp + word; `''` or unknown codes become "Failed" (alert). Add a "Result not read" / caution case.
- `src/pages/tabs/SendTab.tsx` -- outcome handling ~L443-470 (toasts, invalidations) and outcome plate ~L766-781.
- `src/pages/tabs/TrustLinesTab.tsx` -- `submit` ~L54-66: status branches end in `toast.error` for anything else.
- `src/lib/control.ts` -- `describeFailure` switch (~L90) over non-validated outcomes; used by control, master-key and two-device paths.
- `src/lib/two-device.ts` -- ~L446-449 maps outcomes; an `unknown` must not read as expired or failed.
- `src/lib/xrpl/query-reads.ts` -- `destinationInfoQueryOptions` ~L119-122 computes `hasTrustLine` from the destination's lines.
- Tests: `src/lib/xrpl/__tests__/writes.test.ts`, `account-tx-not-found.test.ts` (fetchAccountTx with a mocked client), `payment-amount.test.ts`.

## Tasks & Acceptance

**Execution:**
- `package.json`, `bun.lock` -- remove `@radix-ui/react-switch` via `bun remove` -- unused since the Switch primitive was deleted.
- `src/lib/xrpl/reads.ts` -- keep every entry with a `tx`; derive `resultCode` as the meta's string `TransactionResult`, else `'unknown'` when the entry is validated, else `''` -- stops the crash without hiding validated rows.
- `src/lib/xrpl/writes.ts` -- add `{status: 'unknown'; hash: string}` to `SubmitOutcome`; return it when the validated response has no string `TransactionResult` -- an unreadable result is not a failure.
- `src/components/wallet/TxStatusBadge.tsx` -- `resultCode === 'unknown'` (validated) renders caution "Result not read" -- one wording for History and Send.
- `src/pages/tabs/SendTab.tsx`, `src/pages/tabs/TrustLinesTab.tsx`, `src/lib/control.ts`, `src/lib/two-device.ts` -- handle `unknown`: warning toast/sentence telling the operator to check the hash before trying again; refresh account reads (Send also invalidates the destination check) -- every caller of the choke point.
- `src/lib/xrpl/query-reads.ts` -- when `destination === issuer`, set `hasTrustLine: true` without reading lines.
- Tests -- cover every I/O matrix row at the lowest layer that shows it: `fetchAccountTx` with null/empty meta, `submitAndClassify` returning `unknown`, `destinationInfoQueryOptions` for the issuer, `TxStatusBadge` wording.

**Acceptance Criteria:**
- Given a History page whose `account_tx` answer contains a validated entry with `meta: null`, when History renders, then every row renders and that row says "Result not read", not "Failed".
- Given a submit whose validated result has no `TransactionResult`, when Send reports it, then the outcome reads "Outcome unknown" with the transaction hash, a warning (not an error) is shown, and the account reads refresh.
- Given a token payment to the token's issuer, when the destination is checked, then no "can't hold this token" warning appears and the send is not blocked for a missing trust line.
- Given the repo after the change, when `bun run lint`, `bun run build`, `bun run test` and `bun run check:contrast` run, then all pass and no file imports `@radix-ui/react-switch`.

## Spec Change Log

## Review Triage Log

### 2026-11-05 — Review pass
- verdicts: 28 findings — high 0, medium 6, low 16, false 6, maybe-false 0
- findings:
  - `[low]` `[reject]` (intent) History's new branches are tested only below the page — duplicate of the History test gap below, patched there.
  - `[false]` `[reject]` (intent) Pending rows lose their sentence — the removed text was "Ledger returned: ." for an empty code, which says nothing; a Pending row still shows its badge.
  - `[low]` `[reject]` (intent) Entries with no transaction are still skipped — pre-existing, and such an entry has nothing to render; not met in everyday use.
  - `[low]` `[reject]` (intent) Trust lines, control, master key and two-device unknown branches untested — duplicate of the four test-gap rows below, patched there.
  - `[false]` `[reject]` (intent) "reached a validated ledger" overstates the intent — `submitAndWait` resolves only for a validated answer; an unvalidated one throws or expires.
  - `[low]` `[reject]` (intent) No SendTab test for the issuer case — the fix sits in the query SendTab reads, which is tested; a page test adds no guarded behaviour.
  - `[false]` `[reject]` (intent) Gates not shown to run — lint, build, test (1899, then 1905) and contrast all ran green.
  - `[medium]` `[patch]` (verification-gap) History test still used `''` for the unknown row — changed to `'unknown'`; asserts the sentence, "Result not read", and no "payment failed" alert.
  - `[medium]` `[patch]` (verification-gap) setRegularKey unknown branch untested — added a case: unconfirmed, hash in reason, no view added.
  - `[medium]` `[patch]` (verification-gap) setMasterKey unknown branch untested — added a case: unconfirmed with the hash.
  - `[medium]` `[patch]` (verification-gap) submitReturned unknown branch untested — added a case through the real choke point: unconfirmed, never expired or not-validated.
  - `[medium]` `[patch]` (verification-gap) Trust lines unknown toast untested — added a case: warning with hash, no error; verified it fails when `setOpen(false)` is removed.
  - `[low]` `[defer]` (edge-case) Send keeps destination and amount after an unknown outcome — pre-existing for every outcome; deferred (medium if-true) in frontmatter.
  - `[medium]` `[patch]` (edge-case) Trust lines dialog stayed open after unknown — now closes like the validated branch.
  - `[false]` `[reject]` (edge-case) control throws if `invalidateAccountScoped` rejects — TanStack `invalidateQueries` resolves even when a refetch fails (no `throwOnError`).
  - `[low]` `[patch]` (edge-case) Empty-string `TransactionResult` read as failed in writes — now `unknown`, with a test.
  - `[low]` `[patch]` (edge-case) Empty-string `TransactionResult` read as "Failed" in History — now `'unknown'` when validated, with a test.
  - `[low]` `[patch]` (blind) not-validated types still admit unknown — `'unknown'` added to the three `Exclude`s.
  - `[low]` `[reject]` (blind) setRegularKey could re-read and confirm on unknown — "Check again" already does this; adding it is a new branch for a rare path.
  - `[low]` `[reject]` (blind) setMasterKey could use the re-read on unknown — same reasoning; unconfirmed plus "Check again" is correct.
  - `[low]` `[reject]` (blind) History upper-bound alert wording assumes success — the sentence above it says the result is not known; rare path, new branch needed.
  - `[low]` `[reject]` (blind) History sentence not shared with Send — different context on purpose; the badge wording is the shared part.
  - `[low]` `[reject]` (blind) Four callers untested — duplicate of the test-gap rows, patched there.
  - `[low]` `[patch]` (blind) deferred-work ledger still lists the four entries — four closing triage lines added.
  - `[low]` `[defer]` (blind) decisions.md does not record the new outcome — agent-context document; deferred in frontmatter.
  - `[false]` `[reject]` (blind) Code Map incomplete — its fix edits this spec.
  - `[low]` `[patch]` (blind) Send toast lacked the hash — appended, like Trust lines.
  - `[false]` `[reject]` (blind) `'unknown'` sentinel inside `resultCode` — follows the existing `'expired'` sentinel; every consumer of `resultCode` was checked in the diff.

## Design Notes

History keeps an unreadable validated row instead of skipping it: a skipped row makes a page look complete when it is not, which the "failed read is never shown as an empty one" rule forbids. `'unknown'` as a sentinel result code is shared by History and the badge so one wording covers both. The write side needs a real outcome status, not a sentinel code, so every caller is forced by the type checker to handle it.

## Verification

**Commands:**
- `bun run lint` -- expected: pass
- `bun run build` -- expected: pass (includes `tsc -b`)
- `bun run test` -- expected: pass, new tests included
- `bun run check:contrast` -- expected: pass

**Manual checks (if no CLI):**
- The new "Result not read" / "Outcome unknown" wording reuses the existing caution lamp; no new token or layout. A browser pass is not required for this spec; the outcome cannot be produced against a real ledger on demand.

## Auto Run Result

Status: done

**Summary.** Removed the unused `@radix-ui/react-switch`. A validated History row whose result cannot be read is kept and shown as "Result not read" instead of crashing the page. The write choke point returns a new `unknown` outcome for a validated answer with no readable result; Send, Trust lines, Regular Key, master key and two-device all present it as "Outcome unknown" with the hash (Send and Trust lines as a warning; the other three as unconfirmed, with "Check again"), refresh the reads, and never resubmit. A token sent to its own issuer no longer warns about a missing trust line.

**Files changed.**
- `package.json`, `bun.lock` -- dependency removed.
- `src/lib/xrpl/reads.ts` -- keep rows with an unreadable result; `'unknown'` when validated.
- `src/lib/xrpl/writes.ts` -- new `unknown` outcome.
- `src/lib/xrpl/result-codes.ts` -- shared "Outcome unknown" sentence.
- `src/lib/xrpl/query-reads.ts` -- issuer always has a trust line for its own token.
- `src/components/wallet/TxStatusBadge.tsx` -- "Result not read".
- `src/pages/tabs/HistoryTab.tsx` -- unknown-row sentence; no "payment failed" alert for it.
- `src/pages/tabs/SendTab.tsx`, `src/pages/tabs/TrustLinesTab.tsx` -- warning with hash, refresh; Trust lines closes its dialog.
- `src/lib/control.ts`, `src/lib/master-key.ts`, `src/lib/two-device.ts` -- unknown maps to unconfirmed; types exclude it from not-validated.
- Tests in `src/lib/xrpl/__tests__/`, `src/lib/crypto/__tests__/`, `src/lib/__tests__/`, `src/components/wallet/__tests__/`, `src/pages/tabs/__tests__/`.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- four entries closed.

**Review.** 28 findings: 11 patched (5 test gaps, Trust lines dialog, two empty-string cases, type exclusions, Send toast hash, ledger), 2 deferred (Send form not cleared after any outcome; decisions.md record), 15 rejected with reasons in the triage log. Patched by verdict: medium 6, low 5.

**Follow-up review: recommended.** Unverified risk: the new wording on Send's outcome plate and History's expanded row ("Result not read", "Outcome unknown" sentence) has not been seen in a browser; this outcome cannot be produced on demand against a real ledger.

**Verification.** `bun run lint` pass, `bun run build` pass, `bun run test` pass (129 files, 1905 tests), `bun run check:contrast` pass.

**Residual risks.** The two deferred items above.

**Browser pass, added 2026-11-06** (batch 2 pass, commit e069c25, Testnet):
- MET: a token sent back to its own issuer (1 USD, B8065848…3966161, tesSUCCESS) showed no "can't hold this token" warning.
- MET (forced unknown outcome: meta read as `{}`; the payment really validated, DFF31C45…29B07E): Send showed "Result not read", "Amount: 1 XRP", the "Outcome unknown" sentence and a caution (not an error) naming the hash; the reads refreshed.
- MET (forced null meta on the first History entry): History rendered all rows; that row read "Result not read" with the "without a readable result" sentence and no "payment failed" alert.
