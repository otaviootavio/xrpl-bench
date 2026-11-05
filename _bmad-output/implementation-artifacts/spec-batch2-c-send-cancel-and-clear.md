---
title: 'Batch 2 C: Send can be cancelled before signing, and clears the amount after a send that may have paid'
type: 'bugfix'
created: '2026-11-05'
baseline_revision: 'ba57d913046ac4e4c8a1894ef9516ff824a052fc'
status: 'in-review'
review_loop_iteration: 0
followup_review_recommended: false
context: ['{project-root}/DESIGN.md']
warnings: ['multiple-goals']
deferred:
  - summary: >-
      Cancel on the Send confirm does not close a passkey sheet that is already on screen.
    evidence: |-
      No AbortSignal reaches the WebAuthn call in the keystore. If the operator then approves, the signer is discarded and nothing is sent, but the page and the system prompt disagree meanwhile.
    location: >-
      src/lib/crypto (WebAuthn get) and src/pages/tabs/SendTab.tsx
    severity: medium
  - summary: >-
      docs/decisions.md does not record that Send's Cancel works until a signer exists, and that the amount clears after validated or unknown.
    evidence: |-
      Agent-context document; deferred from this spec.
    location: >-
      docs/decisions.md
    severity: low
---

<intent-contract>

## Intent

**Problem:** While the Send confirm is working before anything is signed (autofill, the Signing Check prompt, the destination re-check), Cancel is `disabled={busy}`, so on a slow node the operator cannot back out for up to about 40 seconds. And after a send that may have paid (`validated` or `unknown`), the form keeps the amount, so "Review payment" can pay the same amount again with one click.

**Approach:** Track whether signing has started. Before that, Cancel is enabled and aborts the send: the dialog closes at once, nothing is signed or submitted afterwards, and the work already in flight is discarded when it settles. After `validated` or `unknown`, clear the amount; keep destination and asset.

## Boundaries & Constraints

**Always:** Nothing is signed or submitted after Cancel was pressed, even if a read or prompt returns later. Once a signature exists, Cancel is unavailable (as today). `busy` and the in-flight signal are always released when the discarded work settles. A cancelled send says so ("Cancelled. Nothing was sent.") in the existing pre-flight report, not as an error. Money stays strings.

**Never:** Recalling or hiding a transaction that was signed. Clearing the amount after `expired`, `failed` or `claimed` (retrying the same payment is legitimate there). Clearing the destination, tag or asset. Changing the choke point's order (autofill, cap, Signing Check, sign, submit).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Cancel during destination re-check | re-check in flight (slow node) | Cancel enabled; pressing it closes the dialog at once and shows "Cancelled. Nothing was sent."; when the re-check returns, nothing is signed or submitted | Read result discarded |
| Cancel during autofill | autofill in flight | Same; when autofill returns, the Signing Check is not asked and nothing is signed | — |
| Cancel during the Signing Check prompt | PIN or passkey prompt open | The prompt's own cancel already aborts; the dialog's Cancel does the same | — |
| After signing started | signature made, submit in flight | Cancel disabled, "Sending…" stays | — |
| Settling after Cancel | discarded work resolves or rejects | `busy` false; Review usable again; no toast about the discarded attempt | — |
| Outcome validated | `validated` | Amount cleared; destination, tag, asset kept | — |
| Outcome unknown | `unknown` | Amount cleared; destination, tag, asset kept | — |
| Outcome expired / failed / claimed | those statuses | Amount kept | — |

</intent-contract>

## Code Map

- `src/pages/tabs/SendTab.tsx` -- `doSend` (~"async function doSend"): sets `busy`, builds a `SigningHandle` whose `open()` runs `base.open()` (the Signing Check) then `recheckDestination()` (`fetchDestinationInfoOnce`), then calls `submitXrpPayment` / `submitIssuedPayment`; catches `PreflightAbort` and reports via `setPreflightReport`. `PreflightReason` union near the top. Confirm dialog footer: Cancel `onClick={() => setConfirmingFor(null)} disabled={busy}`, Confirm `disabled={busy}`. `confirmOpen` holds the dialog open while `busy`. Outcome branches after the submit (`validated`, `expired`, `claimed`, `unknown`, else). `amount` / `setAmount` state.
- `src/lib/xrpl/writes.ts` -- `submitAndClassify`: autofill, cap, master-key check, then `signing.open()`, then `signer.sign`, then submit. `open()` is the last point before a signature; nothing here changes.
- Tests: `src/pages/tabs/__tests__/send-address-book.test.tsx` (renders SendTab with mocked submit; has the unknown-outcome case), `send-destination-error.test.tsx` (pre-flight report cases), `send-pin-dialog.test.tsx`.

## Tasks & Acceptance

**Execution:**
- `src/pages/tabs/SendTab.tsx` -- add a per-attempt cancel token and a "signing started" flag set when `open()` returns a signer; enable Cancel while busy and not signing; Cancel marks the attempt cancelled, closes the dialog and reports `cancelled`; `open()` throws `PreflightAbort('cancelled')` (disposing any signer) when the attempt was cancelled, including after the re-check or prompt resolves; race the destination re-check against the cancel so the abort does not wait for the read; on settle of a cancelled attempt, release `busy` and show no outcome or error toast for it; add `'cancelled'` to `PreflightReason` with the sentence "Cancelled. Nothing was sent."; after `validated` and `unknown`, `setAmount('')`.
- Tests -- one per matrix row at the screen surface, with deferred promises for a slow re-check and a slow submit start.

**Acceptance Criteria:**
- Given the destination re-check is still in flight, when the operator presses Cancel, then the dialog closes, "Cancelled. Nothing was sent." is shown, and after the re-check resolves no submit or signature happens.
- Given a send that ended `validated` or `unknown`, when the outcome is shown, then the amount field is empty and "Review payment" is disabled until a new amount is entered.
- Given the repo after the change, when the four gates run, then all pass.

## Spec Change Log

## Review Triage Log

### 2026-11-05 — Review pass
- verdicts: 23 findings — high 0, medium 5, low 13, false 2, maybe-false 3
- findings:
  - `[low]` `[reject]` (intent) Cancel disabled from `open()` returning, before the choke point's ledger read and `sign` — one bounded request; moving the flag needs a hook in writes.ts the spec forbids changing. Grouped with the edge-case row below.
  - `[low]` `[reject]` (intent) Autofill and the Signing Check are not raced against Cancel — by design (Design Notes); busy is now released at Cancel, so the operator is not held.
  - `[maybe-false]` `[defer]` (intent) The app-wide in-flight signal is never exercised by these tests — released by the choke point's own `finally`, already tested in writes.test.ts; the browser pass watches it.
  - `[maybe-false]` `[defer]` (intent) The PIN-prompt case is not covered — the confirm sheet is hidden behind the PIN prompt, so its Cancel cannot be pressed there; the prompt's own Cancel is the route. Browser pass covers a real cancel.
  - `[low]` `[defer]` (intent) Layout and focus not tested; delay switch not described — browser pass, with the switch recorded there.
  - `[medium]` `[defer]` (blind) Cancel does not close a passkey sheet already on screen — needs an AbortSignal into the keystore's WebAuthn call; nothing can be signed (the signer is discarded), so deferred.
  - `[false]` `[reject]` (blind) PIN-prompt matrix row unreachable as written — its fix edits this spec.
  - `[low]` `[reject]` (blind) Prompt cancel reports as a toast, dialog cancel inline — two different acts on two surfaces; both say nothing was signed or sent.
  - `[medium]` `[patch]` (blind) After Cancel during autofill or the Signing Check, `busy` held Review disabled with no reason — busy released at Cancel; the discarded attempt's settle touches nothing.
  - `[low]` `[reject]` (blind) Escape and overlay now cancel a send — deliberate: before, they closed the dialog over a send that carried on; the safer behaviour.
  - `[low]` `[patch]` (blind) Stale test comment above the Confirm/Cancel test — rewritten.
  - `[low]` `[patch]` (blind) Weak autofill-cancel assertion; no between-check case; no token case — all added.
  - `[medium]` `[patch]` (blind) Clearing the amount removed the figure to check the hash against — the outcome panel now shows the sent amount.
  - `[low]` `[patch]` (blind) Report stamp built twice — `report` lifted to component scope.
  - `[low]` `[defer]` (blind) decisions.md does not record the new Cancel and clear behaviour — agent-context document; deferred in frontmatter.
  - `[medium]` `[patch]` (verification-gap) Closing an idle confirm, and after an earlier attempt, untested — tests added: first Review, after validated, after cancelled; Cancel and Escape.
  - `[low]` `[patch]` (edge-case) Dialog title read "Send  XRP?" while animating out — amount pinned at Review.
  - `[medium]` `[patch]` (edge-case) Cancel during `signingHandleFor` still started autofill — checked right after it resolves; submit never called.
  - `[low]` `[reject]` (edge-case) Signing flag set before the pre-sign ledger read — duplicate of the intent row.
  - `[maybe-false]` `[reject]` (edge-case) Only the re-check is raced — duplicate of the busy row, patched there.
  - `[low]` `[patch]` (edge-case) Toast spies restored inline — moved to afterEach.
  - `[false]` `[reject]` (edge-case) Claim "signature exists" vs flag at `open()` — the signer exists at that point and signs synchronously after one read; recorded as the boundary.
  - `[low]` `[reject]` (edge-case) Claim "operator not held" during autofill — duplicate of the busy row, patched there.

## Design Notes

The choke point already calls `signing.open()` as the last step before a signature, so the cancel check lives in the screen's `open()` wrapper: no change to `writes.ts`. Racing only the re-check (not autofill) keeps the change local; a cancel during autofill is honoured when `open()` is reached, and the dialog is already closed, so the operator is not held.

## Verification

**Commands:**
- `bun run lint`, `bun run build`, `bun run test`, `bun run check:contrast` -- expected: all pass.

**Manual checks (browser pass, run separately):**
- Testnet, funded throwaway wallet. Slow the destination re-check with a temporary delay switch (reverted after): open Review, press Confirm, press Cancel while the re-check waits; the dialog closes, "Cancelled. Nothing was sent." shows, and no transaction appears for the account afterwards (`account_tx`).
- Send a real small XRP payment: after "Validated", the amount field is empty, destination kept.
- Cancel button reachable and focus visible at 320px, light and dark.
