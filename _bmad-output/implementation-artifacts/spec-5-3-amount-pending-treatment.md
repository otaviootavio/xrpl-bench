---
title: 'A read still in flight is not shown as a failure on the amount field'
type: 'bugfix'
created: '2026-09-30'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
baseline_commit: 'bfc4c29ad6f1affd140eb14e3030723e3307462d'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** On Send, while the fee read (5.3) or the spendable-balance read (5.2) is still in flight, the refusal wording is right ("…is still being read…"), but it reaches `AmountInput` through its `error` prop. So the field is painted destructive and announced `aria-invalid="true"`. Story 5.3's AC 2 says a read in flight reports no failure anywhere on screen. The 2026-09-28 browser pass saw it fail.

**Approach:**
- Do what the human decided on 2026-09-16 (spec-5-3 Review Findings: "give `AmountInput` a pending treatment"). `AmountInput` gains one non-destructive state for a reason that is a pending read, not a fault: muted text, no `aria-invalid`, still wired to the input through `aria-describedby`.
- SendTab routes the two in-flight reasons (spendable `loading`, fee in flight) to that state. Every failure, the not-activated case and every validation error keep the destructive `error` state.
- The send stays blocked in every one of these states: `canSend` and the submit path are unchanged, and no wording changes.

</frozen-after-approval>

## Implementation Notes

- `AmountInput.tsx`:
  - New `pending?: string` prop. `error` wins when both are given.
  - One message `<p>` is built from a single `message` object that carries its id and tone.
  - `aria-invalid` is true only for `error`, and `aria-describedby` points at whichever message is shown.
  - The XRP decimal-places hint is hidden while either message is shown.
- `SendTab.tsx`:
  - `fundsError` became `fundsCheck: { reason, pending }`, so `pending` comes from the same branch that produced the reason and cannot drift from it.
  - Pending is set when spendable is `loading` or the fee is in flight (`!fee.isError`).
  - `fundsError` is kept as the reason string; it still gates `canSend`, which is unchanged.
- **Tests** (`send-destination-error.test.tsx`): an `amountFieldState()` helper reads `aria-invalid` and the described message's tone. It covers:
  - in flight → not invalid, muted (spendable and fee)
  - failed → invalid, destructive (fee and spendable, as separate tests)
  - not activated → invalid, destructive
- **Mutations, all caught:**
  - marking the fee failure pending → 1 fails
  - marking both in-flight reads not pending → 2 fail
  - marking not-activated pending → 1 fails
- **Gates:** all four exit 0 (344 tests).
- **Browser, 2026-09-30:** the fee read was held in flight with a temporary `localStorage` switch in `reads.ts`, reverted afterwards. At 390 px light and 320 px dark:
  - the amount field has `aria-invalid="false"`, and its message is in `--muted-foreground`;
  - no alert shows, the fee row shows `…`, and Review payment is disabled.
  - Screenshots were opened.

## Review Triage Log

Blind hunter, 2026-09-30, 11 findings.

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| 1 | The Spendable readout says "Unavailable" while its read is loading | medium | Real (`SendTab.tsx` `<dl>`: every non-figure state renders "Unavailable"). Pre-existing from 5.2 and already in `deferred-work.md` (5.3 review: "Would be settled by giving that row the hook's `status`"). 5.3 AC 2 covers the fee in flight, where Spendable shows its figure. | defer (already recorded) |
| 2 | Not-activated field state untested | low | The Approach says it stays destructive, and no test pinned it. | patch |
| 3 | No unit test of `AmountInput`'s `pending` on its own | low | The screen tests pin `aria-invalid`, tone and wording. "Error wins" is a combination Send never passes. | rejected |
| 4 | The new helper separated a JSDoc from its `describe` | low | Moved above the comment. | patch |
| 5 | The mirror failure test was bundled and in the wrong `describe` | low | Split: fee in the fee block, spendable in the spendable block. | patch |
| 6 | The `message` object was half-used; ids rebuilt in two `<p>`s | low | One `<p>` rendered from `message`. | patch |
| 7 | `fundsError` now also holds pending reasons; the condition is duplicated | low | Cosmetic. It still names the refusal that gates `canSend`. | rejected |
| 8 | The tone test keyed on one class; muted never asserted | low | A `muted` flag is now asserted both ways. | patch |
| 9 | No live announcement when the message changes | low | Same as every field message in the app; not introduced here. | rejected |
| 10 | Spec unfinished (status, notes, browser record) | false | Findings came before finalizing; this section and the browser record now exist. | rejected |
| 11 | The source item in spec-5-3 and sprint status not updated | false | Done in the same commit as this spec's finalization. | rejected |
