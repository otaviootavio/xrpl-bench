---
title: 'A failed payment’s amount stays visible on History at phone widths'
type: 'bugfix'
created: '2026-09-29'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'd75574038a35c77ed4551c747e5583164898ce60'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** At 320 and 390 px, a failed payment's collapsed History row pushes its amount, and the `≤` upper-bound label that story 5.4 depends on, off-screen. The status legend "Failed — fee charged (tecNO_DST_INSUF_XRP)" is `whitespace-nowrap` and the row's left column cannot shrink, so the row's content measured 417 px inside a 229/299 px button. This fails 5.4's "the upper-bound label is present" on a phone. Found in the 2026-09-28 browser pass.

**Approach:**
- In `HistoryTab.tsx`, let the row's left column shrink (`min-w-0 flex-1`) and let its direction-plus-status line wrap (`flex-wrap`), so the amount column (`shrink-0`) always keeps its place.
- In `TxStatusBadge.tsx`, drop the legend-wide `whitespace-nowrap` and keep only the bracketed result code unbreakable. The reason recorded in its comment (a code split across two lines reads as two codes) still holds, while "Failed — fee charged" may move to a second line.
- Change no wording, token, tone or component API. Rows that already fit look the same.

**Decision (2026-09-30), supersedes the Approach where they differ:** below `sm` (640 px) the row lays out on three lines: direction (plus type) and the amount on line 1, the status legend on its own full-width line 2, the date on line 3. At `sm` and up the row looks exactly as it does today. The result code is never broken. Every phone row gets one line taller, successful ones included. Reading order is the same at every width (DESIGN.md), so this is done with layout, not by reordering content per breakpoint. That means the legend moves after direction and amount in the DOM at every width, and desktop keeps its current look through placement. The legend may still wrap between words, so "Failed — fee charged" can sit above its code, but never inside the code.

</frozen-after-approval>

## Code Map

- `src/pages/tabs/HistoryTab.tsx:95-113` — the row `<button>`. It is `flex justify-between`: the left `<div>` holds a direction + type + `TxStatusBadge` line, then the date; the right `<div className="shrink-0 text-right font-data">` holds the amount with its `≤`.
- `src/components/wallet/TxStatusBadge.tsx:20-35` — `Status` wraps `StatusLegend` with `whitespace-nowrap`, deliberately, so a result code never splits (see its comment).
- `src/components/ui/lamp.tsx:58-77` — `StatusLegend`: `inline-flex items-center gap-1.5`, with the lamp then the children. As `inline-flex`, each text run is its own flex item, so a nowrap child overflows its box instead of wrapping.
- `DESIGN.md:319` — responsive behaviour: `sm` = 640 px; reading order must be identical at every width.

## Tasks & Acceptance

**Execution:**
- [x] `src/pages/tabs/HistoryTab.tsx` — restructure the row `<button>` so the legend has its own full-width line below `sm` and sits beside the direction from `sm` up, with the amount never shrinking. Keep the same DOM order at all widths (DESIGN.md:319).
- [x] `src/components/wallet/TxStatusBadge.tsx` — keep the result code unbreakable, but let the words before it wrap. Update the comment's reasoning.
- [x] `src/pages/tabs/__tests__/history-error.test.tsx` — the failed row still exposes its legend text, and the amount with `≤`. Layout itself is checked in the browser.

**Acceptance Criteria:**
- Given a failed `tec` row at 320 and 390 px, in both themes, when History renders collapsed, then `≤ 0.5 XRP` is fully visible, nothing draws over it, and `(TECNO_DST_INSUF_XRP)` is on one line.
- Given any row at 1280 px, when History renders, then it looks as it did before this change (legend beside the direction).
- Given the four gates, when each runs, then all exit 0.

## Verification

- `bun run lint && bun run build && bun run test && bun run check:contrast`: all four exit 0.
- **Browser:** the real `tecNO_DST_INSUF_XRP` row on the throwaway Testnet wallet, at 320, 390 and 1280 px, in both themes. Open every screenshot: the earlier pass measured "inside" while ink overflowed onto the amount, so a measurement alone is not evidence.

## Implementation Notes

- **2026-09-29, stopped and replanned.** I implemented the approved approach (the left column gets `min-w-0 flex-1` with a wrapping line; only the result code is `whitespace-nowrap`). All four gates were green (340 tests), and a measurement script reported the amount inside the row at 320, 390 and 1280. The screenshots contradicted it: at 320 and 390 the unbreakable `(TECNO_DST_INSUF_XRP)` overflowed its flex item and drew over `≤ 0.5 XRP`, and "Failed — / fee / charged" stacked one word per line in the roughly 120 px left for the column. Overflowing ink does not change `getBoundingClientRect` of the amount or the button's `scrollWidth`, which is why the measurement passed. The frozen approach cannot fit an unbreakable code beside the amount at 320 px, so this needs a decision (Open Question 1). The code change is reverted; the tree is at the baseline.
- **2026-09-30, implemented to the Decision.** The row `<button>` is a grid; DOM order is direction(+type), amount, legend, date. Below `sm`: `grid-cols-[minmax(0,1fr)_auto]`, legend and date `col-span-2`. From `sm`: `grid-cols-[auto_minmax(0,1fr)_auto]`, legend placed at col 2 / row 1, amount at col 3 spanning both rows, date at cols 1–2 / row 2. The legend's wrapper is `flex` so the inline-flex legend carries no line-box strut (a plain block wrapper made desktop rows 4 px taller). In `TxStatusBadge`, the legend text is one span and only `({code})` is `whitespace-nowrap`. Browser: a fresh Testnet wallet (virtual authenticator, faucet), real `tecNO_DST_INSUF_XRP` from 0.5 XRP to an unfunded address. At 320 the legend wraps to "Failed — fee charged" / "(TECNO_DST_INSUF_XRP)" with the code on one line; at 390 it fits one line; `≤ 0.5 XRP` fully visible beside the direction at both, both themes, button `scrollWidth === clientWidth`. At 1280 every leaf element's position is identical to a baseline capture taken with the change stashed. Screenshots opened. Gates: all four exit 0 (341 tests).

## Review Triage Log

Pass 1, 2026-09-30. Three layers, 16 findings.

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| 1 | `StatusLegend`'s doc still tells callers to pass `whitespace-nowrap` for result codes (blind + edge case) | low | `lamp.tsx:54-56` describes the pattern this change retired. A future caller following it recreates the overflow. Comment fix. | patch |
| 2 | The new test's nowrap check reads only the immediate parent, so re-adding nowrap on `StatusLegend` passes (verification gap + blind) | medium | Pre-verified by the layer: the parent is the new unclassed inner span. The guard stays green on the exact regression. | patch |
| 3 | No test renders the non-`tec` failure branch; dropping `code` loses "(tefPAST_SEQ)" silently (verification gap) | medium | Pre-verified. docs/decisions.md §5.5 requires the code. | patch |
| 4 | `shrink-0` on the amount cell does nothing in a grid (blind) | low | A flex property, and the button is now `grid`. The `auto` track protects the amount. Deletion. | patch |
| 5 | "Failed ()" when a validated tx has no `resultCode` (blind + edge case) | low | Pre-existing: the old `Failed ({resultCode})` rendered the same empty brackets. `fetchAccountTx` sets `''` only when meta has no `TransactionResult`, which rippled always sets. | rejected |
| 6 | From `sm` up, DOM order (direction → amount → status → date) differs from visual order (direction → status → amount) (blind + verification gap other) | low | Follows the human's 2026-09-30 decision (one DOM order at every width, legend after the amount). The accessible name still reads as a meaningful sequence (WCAG 1.3.2): "Sent, ≤ 0.5 XRP, Failed — fee charged (tec…), date". | rejected |
| 7 | The lamp centres between two lines when the legend wraps (blind) | low | Cosmetic, and seen in the 320 screenshot as acceptable. The fix (`items-baseline`) changes the shared `StatusLegend` for every site. | rejected |
| 8 | Every phone row gets one line taller, not only failed rows (blind) | false | Stated and accepted in the frozen Decision: "Every phone row gets one line taller, successful ones included." | rejected |
| 9 | The layout claim has no test or browser record (blind) | false | Browser-verified at 320/390/1280, both themes, against a real `tecNO_DST_INSUF_XRP` row. Screenshots were opened by this session, and Implementation Notes records the pass. | rejected |
| 10 | The Send outcome row using `TxStatusBadge` isn't checked (blind) | low | Real, and pre-existing: at 320 the Send result line overflows by about 41 px through the hash link's icon. Before this change it was worse, because the whole legend was nowrap. | defer |
| 11 | Below `sm` a very long amount (e.g. a 23-character issued figure) collapses the direction track, and "SENT" can paint over the amount (edge case) | medium | Real in the grid: col 1 is `minmax(0,1fr)` with `min-w-0`. The old flex layout pushed the amount off-screen in the same case, so a long amount on a phone was already broken. The failure mode changed from clipping to overlap. The fix needs a design choice (wrap the amount, or drop it to its own line). | defer |
| 12 | A result code wider than the row (e.g. `tecXCHAIN_CREATE_ACCOUNT_NONXRP_ISSUER`) still overflows at 320 (edge case) | maybe-false | The wallet submits only Payment and TrustSet. Their longest `tec` codes are about 24 characters, and `(TECNO_DST_INSUF_XRP)` measured about 180 of the 213 px. Would need rendering the longest Payment/TrustSet `tec` code at 320 to settle. If real, it is low (rare, slight). | rejected |
| 13 | From `sm` up the legend can now wrap where it didn't (edge case claim) | low | At 640 px and wider the column has ample room; 1280 was verified pixel-identical to the baseline. | rejected |
| 14 | "Expired — not applied" in the Send outcome now wraps (verification gap other) | false | Intended: only codes are unbreakable. Wrapping a two-word legend is `StatusLegend`'s documented default. | rejected |
