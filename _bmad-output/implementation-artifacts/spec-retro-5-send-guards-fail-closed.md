---
title: 'Send refuses on what it could not read: token funds, failed-over-pending, the confirm dialog'
type: 'bugfix'
created: '2026-10-02'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '616af810b4f143d4a6874828ccb85a7808c667ab'
context:
  - '{project-root}/docs/agents/INDEX.md'
  - '{project-root}/docs/decisions.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Epic 5 retro items 1, 2, 4 (F1, F2, F4, A6). The token funds check fails open: `if (selectedLine && …)` lets a failed or loading trust-line read, a frozen/zeroed line, or an `asset` left over from another wallet/network through, so an issued payment is submitted, fails `tec*`, and burns a fee. A failed fee read is announced as "still being read" while spendable is loading. The confirm dialog stays open with "Confirm and send" after the funds guard closes.

**Approach:** The token branch of `fundsCheck` refuses unless a fresh trust-line read for this wallet and network holds the selected line; `asset` is stamped with `(network, address)` and reads back as XRP when the stamp no longer matches. Among missing figures, a non-pending reason outranks a pending one. The confirm dialog opens only while `canSend` holds (or a send is under way), and an intent withdrawn by a closed guard does not revive. `isPositiveDrops` moves into `money.ts`.

Decisions (delegated to Claude by Otavio, 2026-10-02): a failed trust-line read is reported on Send with the existing `QueryErrorState` under the Asset picker, with retry; wording follows the existing spendable/fee reason sentences.

## Boundaries & Constraints

**Always:** Fail closed (docs/decisions.md §12 rule 1). While a read is in error, nothing from an earlier success stays on screen (§12 rule 2) — the picker offers only XRP on error. Pending is never painted as invalid (5.3 AC 2's `pending` channel). Each new gate pinned by a test that fails when the gate is removed. Money stays strings; `BigInt` only in `money.ts` (AD-7).

**Never:** Do not split `SendTab.tsx` (retro item 8, before epic 7). No new shared read-state primitive. Do not touch items 3, 5, 9. Do not make a token send depend on the fee read (existing tests pin that). No `useEffect` that re-reads or polls.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Token, read ok, enough held | line held, amount ≤ balance | send permitted | N/A |
| Token, read failed | `trustLines.isError` | refused; field shows failed reason; picker XRP only; error panel + retry | not pending |
| Token, read loading | no data, no error | refused; `pending` reason (field not invalid) | N/A |
| Token, line gone | data ok, selected line absent (zeroed/frozen) | refused, non-pending reason | N/A |
| Wallet or network switch | token selected, then switch | asset reads back as XRP | N/A |
| XRP, fee failed + spendable loading | `fee.isError`, spendable `loading` | fee failed reason, not pending | N/A |
| XRP, spendable failed + fee loading | spendable `unavailable`, fee loading | spendable failed reason, not pending | N/A |
| Dialog open, guard closes | fee/spendable/trust read fails while open | dialog closes; on recovery stays closed | N/A |

</frozen-after-approval>

## Code Map

- `src/pages/tabs/SendTab.tsx:57` -- `asset` state; becomes stamped `{network, address, asset}`, derived back to `'XRP'` on mismatch (same pattern as `preflightReport` :83-88, :313-320). SendTab does not remount on wallet switch (`Main.tsx:92`, keyed by tab).
- `SendTab.tsx:135,217-218` -- `trustLines`, `heldTokens`, `selectedLine`; `heldTokens` must be `[]` while `trustLines.isError`.
- `SendTab.tsx:233-260` -- `fundsCheck`. XRP branch :242/:246 is the F2 ordering; token branch :256 is F1. Spendable statuses: `loading | not-activated | unavailable | ok` (`useSpendableBalance.ts`).
- `SendTab.tsx:322-334` -- `confirmOpen`; comment says `canSend` is deliberately not the condition (because of `busy`) — rewrite it. `:761-768` dialog comment claims the guard; keep it true.
- `SendTab.tsx:659-674` -- Asset picker; add `QueryErrorState` after it when `trustLines.isError` (pattern at :725-731).
- `src/hooks/useTrustLines.ts` -- `refetchInterval: 15_000`, key includes network+address; unchanged.
- `src/lib/xrpl/reads.ts:218-222,260` -- `isPositiveDrops`; move to `src/lib/xrpl/money.ts`, import back.
- `src/pages/tabs/__tests__/send-destination-error.test.tsx` -- hooks mocked as `vi.fn()` (:8-18); helpers `heldToken`, `TOKEN_ASSET`, `fillValidForm`, `settleClock`, `feeRead`, `spendable`; `Select` mocked as `data-testid="asset"` input; `useAppStore` mocked (:54) — wallet/network switch tests change the mocked `network`/wallet and `rerender`.
- `src/lib/xrpl/__tests__/money.test.ts` -- add `isPositiveDrops` cases.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/xrpl/money.ts`, `reads.ts`, `money.test.ts` -- move and export `isPositiveDrops` with tests ("0", "1", "-1", "1.5", non-string) -- AD-7.
- [x] `src/pages/tabs/SendTab.tsx` -- stamped asset; `heldTokens` empty on error; token branch refuses on error / pending / missing line; XRP branch returns a non-pending reason before any pending one; `confirmOpen` uses `canSend`, and an intent is withdrawn (render-time state adjustment or equivalent, no read) whenever the guard closes outside `busy`; trust-line `QueryErrorState` with retry; comments updated, not narrated as history.
- [x] `src/pages/tabs/__tests__/send-destination-error.test.tsx` -- one test per matrix row, plus: removing any one gate makes at least one test fail.

**Acceptance Criteria:**
- Given any matrix row, when the form is rendered, then the Review button, amount-field error/pending and messages match the row.
- Given an open confirm dialog, when the guard closes and later reopens with the same destination check, then the dialog is not shown again until the operator presses Review payment.
- Given a send under way (`busy`), when a read fails, then "Sending…" stays on screen.

## Verification

**Commands:**
- `bun run lint` · `bun run build` · `bun run test` · `bun run check:contrast` -- all green.

**Manual checks:**
- Browser pass on Testnet (Playwright + CDP virtual authenticator, docs/agents/verifying-your-work.md), screenshots opened: token selected with the trust-line read forced to fail (picker XRP-only, panel shown, Review disabled); wallet switch with a token selected resets to XRP; fee failed while spendable loading shows the failed sentence. 390 px and 1280 px, both themes.

## Implementation Notes

- Implemented by a subagent; gates green (lint, build, test 365/365, check:contrast). Mutation pass: 10 of 11 gates individually turn a test red; the 11th (`canSend` in `confirmOpen`) is the exact complement of the render-time intent withdrawal, so only removing both together fails (5 tests).
- Two pre-existing tests encoded the defect this spec fixes (dialog standing over a closed guard) and were replaced: "does not submit when the form guard is closed…" → "takes the confirm step away for good when the amount stops fitting under it"; "retires the guard-closed refusal once the form is ready again" removed. The submit path's `guard-closed` refusal stays as defence-in-depth, now unreachable from the dialog.
- The Asset trigger names a picked-but-no-longer-offered token from the operator's own choice (no balance), so it does not go blank beside a token suffix.
- Orchestrator follow-up: the stamp alone restored a token on switching back to the original account; the retro asks for a reset, so a retired choice is now cleared during render. Pinned by "stays XRP after switching back"; mutation-checked.
- Browser pass (Playwright + CDP virtual authenticator, Testnet, fresh isolated profile): trust-line read forced to fail at 390/1280 px in both themes; network and wallet switch reset to XRP; fee failed while spendable loading shows the failed sentence. Gaps: fee and wallet-switch cases were captured in one theme per width, not all four combinations; the token line was faked over the WebSocket, so no real token send was made. Screenshots in the session scratchpad.

## Spec Change Log

## Review Triage Log

| # | Source | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | verification-gap | Asset trigger's fallback label is never rendered by a test (`SelectValue` mocked to null) | low | Gap pre-verified: mock at test :23-33 renders nothing; inverting the condition stays green | patch |
| 2 | blind | Amount survives the reset to XRP: "1000" typed for USD becomes 1000 XRP after a wallet/network switch | medium | `assetChoice` is cleared but `amount` is untouched; the funds check can then pass for XRP | patch |
| 3 | blind | Trust-line pending state written twice (`tokenLineUnknownReason` and inline `pending:`) | low | Two derivations of one three-way state; a change to one drifts from the other's styling; derive once | patch |
| 4 | verification-gap, blind, edge-case ×2 | `doSend`'s guard-closed branch and its retirement lost their tests | low | Real: no test reaches it. Unreachable from the UI now that the dialog is gated on `canSend`; pinning needs a test-only seam. Unlikely in use and the fix adds surface | reject |
| 5 | blind, edge-case | `canSend` in `confirmOpen` is the complement of the render-time withdrawal, so not testable alone | low | Confirmed (recorded in Implementation Notes); both together fail 5 tests; the spec asks for both | reject |
| 6 | blind, edge-case | Wallet/network switch while `busy` relabels the "Sending…" dialog as XRP | low | Dialog is modal, and the wallet and network controls sit inert behind it, so this is not reachable in normal use; the fix adds a guard | reject |
| 7 | blind | `setAsset` with no wallet stamps `''` | false | `if (!wallet) return` precedes the picker; `setAsset` cannot be called without a wallet |  reject |
| 8 | blind | Fallback label omits the issuer | low | Picker items already show the code only (pre-existing pattern); adding an issuer is new UI | reject |
| 9 | blind | Second "Try again" button with the same accessible name | low | Each sits inside its own titled panel; distinguishing needs a new `QueryErrorState` prop | reject |
| 10 | blind | `isPositiveDrops` tests miss `''`, `'01'`, `'1e6'`; accepts above total supply | false | `^\d+$` rejects `''`, `'1e6'`, `' 1'`, `'+1'`; `'01'` is a positive drops value; behaviour unchanged by the move | reject |
| 11 | blind | Move adds no caller; doc comment describes old use | false | AD-7 is the reason (BigInt only in `money.ts`); the comment describes its actual caller, `paymentAmountOf` | reject |
| 12 | blind | Design record not updated | false | `docs/decisions.md` has no Send-matrix entry; §12 rules 1-2 are general and this change applies them | reject |
| 13 | blind | Frozen-under-open-dialog and in-flight-with-retained-data untested | low | Same withdrawal mechanism as the tested failed read; retained data during a poll is the last successful read (≤15 s) | reject |
| 14 | edge-case | Paused (offline) trust-line read says "still being read" forever | low | Same treatment the fee and spendable reads already give (pre-existing pattern); no submit is possible offline | reject |
| 15 | edge-case | Trust-line/fee/spendable may fail during the unlock; token payment still submitted | medium | Pre-existing: retro F6 deliberately deferred the post-unlock probe's scope to the item 8 split | defer |
| 16 | edge-case | No freshness bound on the trust-line answer | maybe-false | Polls every 15 s; would need a paused-poll-with-online-submit path to matter | reject (low if real) |
