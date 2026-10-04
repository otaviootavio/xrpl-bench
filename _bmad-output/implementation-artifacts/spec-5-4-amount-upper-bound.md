---
title: 'An amount not known to be delivered renders as an upper bound'
type: 'bugfix'
created: '2026-09-28'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '88e28a4fe22f7f24685dcce2cd143d918667570f'
context:
  - '{project-root}/docs/agents/money.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `fetchAccountTx` flags a payment's figure as an upper bound only when `delivered_amount` is the literal `'unavailable'`. When the field is absent, zero, or malformed, the requested `DeliverMax`/`Amount` is shown as if it arrived. `fetchTx` applies no normalisation at all, so a future caller would inherit the same gap (FR-57).

**Approach:** One pure function decides, from a Payment's `tx` and `meta`, the figure to show and whether it is an upper bound. Only a positive, well-formed `delivered_amount` is exact; anything else falls back to the requested figure, flagged. `fetchAccountTx` and `fetchTx` both go through it. History keeps its `≤` prefix and its worded alert, and a screen test pins both.

**Decisions (2026-09-28):**
- **A failed Payment** (any non-`tesSUCCESS` result) is flagged as an upper bound like the others. rippled gives it no `delivered_amount`, and `≤ requested` is true because nothing arrived. The History alert is worded by cause. A failed payment reads: this payment failed, nothing was delivered, and the figure is what was requested. Every other upper-bound case keeps today's "the ledger could not report the exact delivered amount" wording.
- **The incoming-payment toast** fires only for a `tesSUCCESS` payment. A failed incoming payment is not announced as received.

## Boundaries & Constraints

**Always:** exact means a positive `delivered_amount`: drops by `BigInt > 0n`, and an issued `value` by string inspection that also accepts XRPL exponent notation (`1.5e-7`). No `Number`/`parseFloat` on any amount. The flag stays `amountIsUpperBound` on `TxSummary`. Non-Payment rows are unchanged (no amount, no flag). The upper-bound label is text, not colour.

**Never:** no change to how History fetches or paginates, to query keys, or to Send. No MPT rendering. `fetchTx` gains no caller.

## I/O & Edge-Case Matrix

| Scenario | `meta.delivered_amount` | Shown | Upper bound |
|---|---|---|---|
| Normal payment | `"1000000"` / `{value:"10"}` | delivered | no |
| Partial payment | delivered < requested | delivered | no |
| Legacy | `'unavailable'` | requested | yes |
| Absent | missing | requested | yes |
| Non-positive | `"0"`, `{value:"0"}`, `"-5"` | requested | yes |
| Malformed | `"abc"`, `{}`, `null` | requested | yes |
| Exponent issued | `{value:"1e-7"}` | delivered | no |
| Not a Payment | any | nothing | no |

</frozen-after-approval>

## Code Map

- `src/lib/xrpl/reads.ts:127-147` — `TxSummary`. The `amountIsUpperBound` doc comment says "only possible for very old partial payments". That is now wrong and needs rewording.
- `src/lib/xrpl/reads.ts:182-195` — the defect: `delivered === 'unavailable'` is the only upper-bound trigger, and `delivered && …` counts `"0"` or `{}` as delivered.
- `src/lib/xrpl/reads.ts:208` — `fetchTx`, which returns the raw `tx` response and is uncalled. Keep the raw response and add the normalised `{ amountDrops?, amountIssued?, amountIsUpperBound? }` beside it. It has no account, so it has no direction.
- `src/lib/xrpl/money.ts:82` — `isPositiveDecimalString` rejects exponent notation. Do not change it, since Send and trust lines rely on it. Add a sibling for ledger-reported values.
- `src/lib/xrpl/client.ts:20` — `setXrplClientFactory`, the test seam for `fetchTx`/`fetchAccountTx` with a fake client.
- `src/pages/tabs/HistoryTab.tsx:108-112` — the `≤ ` prefix on the row. `:150-160` — the warning `Alert` in the expanded detail. `resultCode` is on the row (`TxStatusBadge`).
- `src/pages/tabs/__tests__/history-error.test.tsx` — mocks `useAccountTxHistory` and has `page(items)`. Add a partial-payment case here or in a sibling file.
- `src/hooks/useIncomingPaymentNotifications.ts:54,70` — the filter (add the result check) and the `up to` prefix (keep). Check `src/hooks/__tests__/` for an existing suite before creating one.
- **Reuse, do not change:** `formatXrp`, `formatAmountString`, `displayCurrencyCode`, `Alert`, `TxStatusBadge`.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/xrpl/reads.ts` — extract `paymentAmountOf(tx, meta)` per the matrix; use it in `fetchAccountTx` and `fetchTx`; reword the `TxSummary` doc.
- [x] `src/lib/xrpl/money.ts` — positive check for a ledger-reported issued value, with exponent support.
- [x] `src/pages/tabs/HistoryTab.tsx` — word the upper-bound alert by cause (failed payment vs. not reported), per Decisions.
- [x] `src/lib/xrpl/__tests__/payment-amount.test.ts` — one case per matrix row, plus `fetchTx` and `fetchAccountTx` through a fake client factory.
- [x] `src/pages/tabs/__tests__/history-error.test.tsx` — a partial/absent-delivery row shows `≤` and, once expanded, the worded alert; an exact row shows neither.
- [x] `src/hooks/useIncomingPaymentNotifications.ts` — toast only `tesSUCCESS` payments; test that a failed incoming payment raises no toast.

**Acceptance Criteria:**
- Given a Payment whose `delivered_amount` is absent, when History renders, then the figure is prefixed `≤` and the expanded row states in words that it is a maximum.
- Given a Payment with a positive `delivered_amount` smaller than the requested amount, when History renders, then the delivered figure is shown with no upper-bound label.
- Given a failed Payment, when its History row is expanded, then the alert says the payment failed and nothing was delivered, not that the ledger could not report the amount.
- Given `fetchTx` for any Payment, when it resolves, then its normalised amount matches what `fetchAccountTx` produces for the same `tx`/`meta`.
- Given the four gates, when each runs, then all exit 0.

## Implementation Notes

- `paymentAmountOf` treats a Payment as exact only when `meta.TransactionResult === 'tesSUCCESS'` *and* `delivered_amount` is positive and well-formed; a failed Payment is flagged even if a delivered figure were present. Missing meta (e.g. an unvalidated `fetchTx`) is therefore an upper bound.
- An issued amount (delivered or requested) is mapped only when `currency`, `issuer` and `value` are all strings; an MPT amount yields no figure rather than an `amountIssued` with an undefined currency.
- `fetchTx` returns `{ ...rawResponse, amountDrops?, amountIssued?, amountIsUpperBound? }`, reading `result.tx_json ?? result` (API v2 / v1).
- History's failed-payment wording is chosen when `resultCode` is non-empty and not `tesSUCCESS`.
- The incoming-payment hook suite is new (`src/hooks/__tests__/incoming-payment-notifications.test.tsx`); none existed.

## Spec Change Log

## Review Triage Log

Pass 1, 2026-09-28. Three layers (blind hunter, edge-case hunter, verification gap), 20 findings.

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| 1 | No History test renders an upper-bound row with `resultCode: ''`; dropping the `tx.resultCode &&` guard passes every test (verification gap) | low | Pre-verified by the layer. Test-only fix. | patch |
| 2 | A successful MPT Payment renders `—` plus the upper-bound alert (edge case) | low | Real in code, but it needs an MPToken the wallet cannot create (it never submits `MPTokenAuthorize`), and the fix adds a branch. | rejected |
| 3 | A Payment with neither `DeliverMax` nor `Amount` sets the flag with no figure (edge case) | false | `Amount` is a required Payment field; the ledger serves no Payment without it. | rejected |
| 4 | A malformed `DeliverMax` drops string crashes `formatXrp` now that the fallback is reached more often (edge case) | false | `DeliverMax` is a validated ledger field. The absent-delivery case reached the same fallback before this change. | rejected |
| 5 | An exponent-notation issued value renders raw (`1e-7 USD`, `1,234e5`) (edge case + blind) | medium | Real. Pre-existing: the old code showed any truthy `delivered_amount` through the same `formatAmountString`. Not caused by this story. | defer |
| 6 | "Succeeded" is decided three ways (classifier, History, toast); they diverge on an empty `resultCode`; return a reason enum instead (edge case ×2 + blind) | low | They diverge only when `meta` has no `TransactionResult`, which rippled always sets (`reads.ts:179` already drops non-object meta). The fix adds public surface. | rejected |
| 7 | A failed payment's collapsed row reads `≤ 5 XRP`, implying something may have arrived (edge case + blind) | false | The same row carries `TxStatusBadge` "Failed — fee charged (tec…)" (`TxStatusBadge.tsx:33`), and `≤` on a failed row is the human's frozen decision. | rejected |
| 8 | `fetchTx` misreads a binary `meta_blob` (edge case) | false | `fetchTx` never requests `binary: true`. | rejected |
| 9 | `fetchTx`/`fetchAccountTx` parity holds only for object meta (edge case) | low | `fetchTx` has no caller, and the case needs a non-object meta. | rejected |
| 10 | The failed-payment alert does not state the fee was charged (blind) | false | The collapsed row's badge reads "Failed — fee charged", and the Fee field sits in the same expanded detail, which satisfies `docs/agents/INDEX.md` §3. | rejected |
| 11 | `fetchTx` spreads amount fields onto the raw RPC response; delete it or return a typed summary (blind) | false | The shape (raw response plus normalised fields, no caller) is what the spec's Code Map specifies. The fix would edit this build's spec. | rejected |
| 12 | `docs/agents/money.md` not updated for the widened flag and the strict/lenient decimal split (blind) | low | money.md:39 still holds ("the figure is a maximum and the UI says so"). The strict/lenient split is undocumented. The fix edits agent-context docs. | defer |
| 13 | The toast has no token case and no normalisation→toast test (blind) | false | No defect claimed. Normalisation is pinned in `payment-amount.test.ts`; the toast's filter and prefix in its own suite. | rejected |
| 14 | The notification test's `setTimeout(0)` ordering is fragile (blind) | maybe-false | Would need repeated runs under load to settle. If real, it is low (test-only, no user harm). | rejected |
| 15 | New History tests wrap in `TooltipProvider`, older ones do not (blind) | false | The older tests never expand a row, so they never mount a tooltip. | rejected |
| 16 | A partial payment's sender side ("requested 5, delivered 1") is unrepresented (blind) | false | FR-57 prescribes showing the delivered figure, and the spec matrix pins "Partial → delivered, exact". | rejected |
| 17 | `fetchTx` still has no caller (verification gap, other) | false | The spec's Never list says `fetchTx` gains no caller. | rejected |

## Verification

**Commands:**
- `bun run lint && bun run build && bun run test && bun run check:contrast` — expected: all exit 0.
- Mutation check: go back to `=== 'unavailable'` as the only trigger; the absent-delivery test must fail.

**Manual checks:**
- History with a failed and a partial payment on Testnet: `≤` on the row, and the alert wording matches the cause.

**Result, 2026-09-28:** all four gates exit 0 (327 tests). Mutation checks: restoring `=== 'unavailable'` as the only trigger fails 19 tests, including the absent-delivery case and the `fetchAccountTx` regression. Dropping the `tx.resultCode &&` guard in `HistoryTab.tsx` fails the empty-`resultCode` case.

**Manual check: NOT RUN.** No browser or Testnet pass has been made on History, so the two alert wordings are pinned by tests, not seen on screen.

**Browser pass, 2026-09-28: RUN, ONE CRITERION NOT MET AT MOBILE WIDTHS. Status stays `review`.**

- **How it was run:** the same session as 5.3's pass (Playwright Chromium with a virtual authenticator, Testnet), on `f229db1`. Real ledger transactions, none forced:
  - a failed Payment, 0.5 XRP to an unfunded address, `tecNO_DST_INSUF_XRP`
  - a normal 50 EUR payment
  - a true partial payment (`tfPartialPayment`, 100 EUR requested, 30 EUR delivered), sent from a script-controlled issuer
- **Met:**
  - The failed Payment shows `≤ 0.5 XRP` beside the "Failed — fee charged" badge. Expanded, it reads "This payment failed — nothing was delivered", with no "could not report" wording.
  - The partial payment shows 30 EUR, the delivered figure, with no `≤` and no upper-bound alert.
  - Desktop layout is correct in both themes.
- **Not met at 320 and 390 px:** on the failed row, the collapsed amount (`≤ 0.5 XRP`) is not visible. The long status badge does not wrap, so the row's content is 417 px wide inside a 229 px (at 320) or 299 px (at 390) button, and the amount sits at x=374–463, clipped by the tab panel's scroll container. The upper-bound label is therefore absent on mobile for exactly the failed rows this story flags. The layout predates 5.4; successful rows fit.
- **Not observed:** the "Received" toast. None was captured after the two incoming EUR payments, which may mean it had already expired. Neither confirmed nor refuted.

**Follow-up, 2026-09-30: the mobile criterion now passes. Status → `done`.** Fixed by `spec-5-4-history-failed-row-clipping.md`. Below `sm` the status legend takes its own line, and only the result code is unbreakable. Browser-verified on a real `tecNO_DST_INSUF_XRP` row at 320, 390 and 1280 px in both themes: `≤ 0.5 XRP` is fully visible, the code is whole, and desktop is pixel-identical to before.
