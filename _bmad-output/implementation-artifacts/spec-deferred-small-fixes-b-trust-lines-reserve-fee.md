---
title: 'Small deferred fixes B: Trust lines reserve and fee'
type: 'bugfix'
created: '2026-11-05'
baseline_revision: 'e057faf8d901b435780caeb718239341f3dbf9f0'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
context: ['{project-root}/DESIGN.md', '{project-root}/PRODUCT.md']
warnings: ['oversized']
deferred:
  - summary: >-
      At 320px with 200% text, the "Create trust line" button's no-wrap label cuts off, the sheet body scrolls sideways and the close X overlaps the title.
    evidence: |-
      Seen in this spec's browser pass. Pre-existing: this change did not touch the button or its label. Logged in deferred-work.md.
    location: >-
      src/pages/tabs/TrustLinesTab.tsx add sheet footer
    severity: medium
---

<intent-contract>

## Intent

**Problem:** The Trust lines screen shows a hardcoded 0.2 XRP owner reserve as fact when the reserve read is pending or failed, decides whether a new line is affordable from it, and gives one "not enough XRP" sentence for every reason it refuses. Adding, editing and closing a trust line also neither show the network fee nor sign the fee they would show, unlike Send.

**Approach:** Read the reserve, spendable balance and recommended fee as read states. Show each figure only when read; block adding a line, with a reason naming what is missing, while any of them is not read or not enough. Show the network fee in each of the three trust-line dialogs and pin that exact fee on the signed `TrustSet`.

## Boundaries & Constraints

**Always:** A pending or failed read is never rendered as a figure and never relaxes a guard. Money stays strings/BigInt; arithmetic stays in `money.ts`. Reads go through the existing hooks (query-key factory). The fee signed is the fee on screen when the operator pressed the button. A fee above `MAX_FEE_DROPS` is refused before signing, with the cap stated. Mobile floor: 320px, 200% zoom, 44px touch targets on coarse pointers, primary action reachable without scrolling. No `outline-none`; colour never carries meaning alone.

**Never:** A hardcoded reserve or fee figure. Changing Send. Changing what NoRipple or the limit sign. A new dialog or step: the existing add, edit and close dialogs are the confirm steps.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| All read, enough XRP | reserve, spendable, fee `ok`; spendable ≥ reserve + fee | Add dialog states the reserve and the fee; Create enabled; signed `TrustSet.Fee` equals the shown fee | — |
| Reserve pending | reserve read in flight | No reserve figure anywhere on the screen; Create disabled with "Reading the owner reserve…" | — |
| Reserve failed | reserve read in error (even with retained data) | No figure; Create disabled with "The owner reserve could not be read…" and a Retry | Retry refetches the reserve |
| Spendable not read | spendable `loading`/`unavailable` | Create disabled with a reason about the balance, not "not enough XRP" | — |
| Not enough | spendable < reserve + fee | Create disabled with "You don't have enough spendable XRP to cover the reserve and fee." | — |
| Fee not read | fee pending or failed | Fee shown as "…" or "Unavailable"; Create, Update limit and Close trust line disabled with a reason | — |
| Fee above cap | fee > `MAX_FEE_DROPS` | All three buttons disabled; reason states the cap | — |
| Edit / close | fee `ok` | Dialog states the fee; signed Fee equals it; close states the reserve it releases only when the reserve is read | — |

</intent-contract>

## Code Map

- `src/pages/tabs/TrustLinesTab.tsx` -- whole screen. `reserveCostDrops = reserves.data?.ownerReserveDrops ?? '200000'` (~L74) feeds the add dialog text, the empty-state text and the close dialog text; `canAffordNewLine` (~L75) uses `spendableDrops` only; `submit(currency, issuer, limit)` (~L46) calls `submitTrustSet`. Add, edit and close dialogs are in this file.
- `src/hooks/useServerReserves.ts`, `src/hooks/useSpendableBalance.ts` (returns `status`, `reserveFailed`, `retryReserves`), `src/hooks/useRecommendedFee.ts` (polled every 10 s) -- the three reads.
- `src/lib/read-state.ts` -- `readStateOf(query)` gives `ok | pending | failed`; error first, retained data ignored.
- `src/components/wallet/ReadingValue.tsx` -- renders a `ReadState` as figure, "…" or "Unavailable"; Send uses it for its fee row.
- `src/lib/xrpl/money.ts` -- `MAX_FEE_DROPS`, `feeWithinCap`, `coversOwnerReserve`, `formatXrp`. Add a BigInt helper for reserve + fee if needed.
- `src/lib/xrpl/writes.ts` -- `submitTrustSet` (~L322) takes no fee; `submitXrpPayment` shows the pattern: optional `feeDrops` set as `Fee` so autofill keeps it, choke point still caps it.
- `src/pages/tabs/SendTab.tsx` -- reference only: fee row (~L728) and confirm wording (~L820).
- Tests: `src/lib/xrpl/__tests__/writes.test.ts` (~L390, decodes the signed TrustSet blob), `src/pages/tabs/__tests__/trustlines-error.test.tsx` (renders the screen with mocked hooks and `submitTrustSet`).

## Tasks & Acceptance

**Execution:**
- `src/lib/xrpl/writes.ts` -- give `submitTrustSet` an optional `feeDrops` set as `Fee`, like `submitXrpPayment`.
- `src/lib/xrpl/money.ts` -- BigInt helper for "spendable covers reserve plus fee", if `coversOwnerReserve` cannot express it.
- `src/pages/tabs/TrustLinesTab.tsx` -- derive reserve, spendable and fee read states; drop the `'200000'` fallback; render the reserve figure only when read (otherwise word it without a figure); compute one add-refusal reason in the matrix order (reserve, balance, fee, cap, not enough) and show it in the add dialog; show a "Network fee" reading in the add, edit and close dialogs; disable each action while the fee is not `ok` or above the cap; pass the shown fee to `submitTrustSet`.
- `src/lib/xrpl/__tests__/writes.test.ts` -- the decoded signed TrustSet's `Fee` equals the `feeDrops` passed.
- `src/pages/tabs/__tests__/trustlines-error.test.tsx` -- one case per matrix row at the screen surface.

**Acceptance Criteria:**
- Given any trust-line dialog with the fee read, when the operator presses its action, then the decoded signed `TrustSet` carries exactly the fee the dialog showed.
- Given the reserve read is pending or failed, when the Trust lines screen renders, then no XRP reserve figure appears on it and adding a line is refused with a reason naming the reserve.
- Given the repo after the change, when `bun run lint`, `bun run build`, `bun run test` and `bun run check:contrast` run, then all pass.

## Spec Change Log

## Review Triage Log

### 2026-11-05 — Review pass
- verdicts: 22 findings — high 0, medium 4, low 13, false 5, maybe-false 0
- findings:
  - `[medium]` `[patch]` (verification-gap) The failed-fee Retry in the dialogs is never clicked — test added: clicking it calls the fee read's `refetch` once.
  - `[low]` `[patch]` (verification-gap) `shownFee` has no test — test added: fee `'012'` shows "Unavailable", no figure, the could-not-be-read reason, Create disabled.
  - `[medium]` `[patch]` (intent) A fee change while a dialog is open is not covered — grouped with the pinned-fee display finding below; a test now changes the poll mid-submission.
  - `[low]` `[reject]` (intent) Screen tests assert the fee passed to `submitTrustSet`, not the decoded blob — the decoded-blob test in writes.test.ts pins the SDK output; the screen test pins that the shown figure is the one passed. Together they cover the chain; a joined test adds no guarded behaviour.
  - `[false]` `[reject]` (intent) Cap refused inside the dialog instead of before it opens — the spec chose the existing dialogs as the confirm steps; the action is refused before signing either way.
  - `[low]` `[reject]` (intent) Balance-unavailable has no Retry — duplicate of the edge-case row below.
  - `[low]` `[reject]` (intent) Mobile floors and focus not in tests or the Verification list — they are checked in the browser pass that follows; editing the list is a spec edit.
  - `[false]` `[reject]` (intent) New Retry devices where none existed — `QueryErrorState` is the screen's existing retry device, reused as the intent allows.
  - `[low]` `[reject]` (edge-case) Ledger waives the reserve for an account owning fewer than 2 objects — pre-existing (the old guard did the same), fails closed, only reachable on a near-empty account; the fix adds a branch.
  - `[low]` `[reject]` (edge-case) A failed `account_info` read gives no Retry — the hook exposes no account retry and the read refreshes on its own; the fix adds hook API.
  - `[false]` `[reject]` (edge-case) Spendable `ok` with null drops shown as loading — `useSpendableBalance` never returns that pair: `ok` always carries both figures.
  - `[medium]` `[patch]` (edge-case) `fetchServerReserves` falls back to 1 XRP / 0.2 XRP when the node has no validated ledger, an `ok` read of a hardcoded figure — now throws, so every consumer fails closed; three tests added.
  - `[medium]` `[patch]` (blind) The dialogs show the live fee while the fee pinned at the press is signed — the pinned figure is shown while a submission runs.
  - `[low]` `[patch]` (blind) The Create handler re-checks only the fee — it now re-checks the whole add guard and the three input checks.
  - `[low]` `[reject]` (blind) No balance Retry — duplicate of the edge-case row above.
  - `[false]` `[reject]` (blind) Impossible `ok`-with-null state — duplicate of the false edge-case row above.
  - `[low]` `[reject]` (blind) Edit and Close do not say the fee is spent — each now shows a "Network fee" reading; added wording is cosmetic.
  - `[low]` `[patch]` (blind) Edit and Close tests stop at the disabled button — refusal notes and their `aria-describedby` links now asserted for add, edit and close.
  - `[low]` `[reject]` (blind) `shownFee` untested — duplicate of the verification-gap row, patched there.
  - `[low]` `[patch]` (blind) The writes test claimed "before anything is signed" but checked only submission — it now also asserts the signing handle never opened.
  - `[low]` `[reject]` (blind) The empty state does not report a failed reserve read — it states no figure, so nothing false is shown; the failure is reported where the reserve is used (the add dialog).
  - `[false]` `[reject]` (blind) Spec unfinished and Code Map uses line anchors — its fix edits this spec; the logs are filled at this step.

## Design Notes

The three dialogs already are the confirm steps (close has its own; add and edit submit from their sheet), so the fee goes into them rather than into a new step. The pinned fee is the figure rendered at the moment of the press; the fee poll can change the shown figure while a dialog is open, and what is pressed is what is signed. A failed fee blocks all three actions, stricter than a token send, because the intent forbids a failed fee read from enabling the confirm.

## Verification

**Commands:**
- `bun run lint` -- expected: pass
- `bun run build` -- expected: pass
- `bun run test` -- expected: pass, new cases included
- `bun run check:contrast` -- expected: pass

**Manual checks (browser pass, run separately):**
- Testnet, funded throwaway wallet, Playwright Chromium with the virtual authenticator from `docs/agents/verifying-your-work.md`. Widths 320, 390, 1280; light and dark.
- Add dialog with all reads ok: reserve and fee shown; Create reachable without scrolling at 320px and 200% zoom.
- Reserve forced failed with a temporary switch (reverted after): no reserve figure, refusal reason and Retry shown.
- Create a real trust line: the transaction's fee on the explorer equals the fee the dialog showed. Edit its limit, then close it: each dialog shows the fee.

**Browser pass (2026-11-05).** Commit 49b307c, then 49b307c plus the `scroll-pb-24` fix in `src/components/ui/dialog.tsx` for the confirmation round. Playwright MCP Chromium with the CDP virtual authenticator (ctap2, internal, resident key, UV, PRF). Two throwaway Testnet wallets made with the create quiz and funded by the in-app faucet; wallet 2 was the issuer. Widths 320, 390, 1280, light and dark; 200% zoom as root font-size 200% at 320x568 and as a 160x284 viewport. The reserve failure was forced with a temporary localStorage switch in `fetchServerReserves`, reverted after; it was not observed naturally. Screenshots in the session scratchpad (`bp-b/`, `bp-b2/`), opened before citing.
- MET: reserve and fee figures shown with all reads ok; Create reachable without scrolling at 320px.
- MET: signed fee equals shown fee on Testnet for create, edit (limit 500) and close: 10 drops each, shown 0.00001 XRP, all tesSUCCESS, read back with `account_tx`.
- MET: edit and close dialogs show a Network fee reading.
- MET: reserve failed shows no reserve figure anywhere on the screen; Create disabled with the reserve reason and a Try again button.
- MET after fix: focused Try again at 320px was under the sticky footer (first round); with `scroll-pb-24` on the sheet body it sits fully above the footer in light and dark, `elementFromPoint` at its centre returns it, focus ring fully visible.
- NOT MET, pre-existing, deferred: 200% zoom at 320px clips the Create label and scrolls the sheet sideways.
- MET: tree clean after each round (temporary switch reverted).

## Auto Run Result

Status: done

**Summary.** The Trust lines screen no longer shows a hardcoded 0.2 XRP reserve: the reserve is shown only when read, and adding a line is refused with a reason naming what is missing (reserve, balance, fee, fee cap, or not enough XRP), with Retry for a failed reserve or fee. The reserve read itself fails instead of falling back to fixed figures when the node has no validated ledger. Add, edit and close each show the network fee and sign exactly the fee shown at the press (pinned on the TrustSet); the pinned figure stays on screen while the submission runs. A sheet's body now keeps a focused element above its sticky footer.

**Files changed.**
- `src/lib/xrpl/writes.ts` -- `submitTrustSet` takes `feeDrops`.
- `src/lib/xrpl/money.ts` -- `coversOwnerReserveAndFee`.
- `src/lib/xrpl/reads.ts` -- `fetchServerReserves` throws without a validated ledger.
- `src/pages/tabs/TrustLinesTab.tsx` -- read states, refusal reasons, fee readings, pinned fee, guard re-check in the handler.
- `src/components/ui/dialog.tsx` -- `scroll-pb-24` on the sheet body below `sm`.
- Tests: `writes.test.ts`, `money.test.ts`, `reads-node.test.ts`, `trustlines-error.test.tsx`, `pin-dialog.test.tsx`.
- `deferred-work.md` -- the 200% zoom footer entry.

**Review.** 22 findings: 8 patched (fee Retry test, malformed-fee test, refusal and aria tests, reserve read without validated ledger, pinned fee display, handler guard, writes test name, mid-submission fee test), 0 deferred from review, 14 rejected with reasons in the triage log. Patched entries by verdict: medium 3, low 4. Browser pass added one fix (sheet scroll padding) and one deferral (200% zoom label, pre-existing).

**Follow-up review: recommended.** Unverified risk: the pinned fee shown during a submission is checked in jsdom only; in the browser the passkey prompt hides the add and edit sheets, so the swap from the live to the pinned figure was not observed there.

**Verification.** `bun run lint`, `bun run build`, `bun run test` (129 files, 1938 tests), `bun run check:contrast`: all pass. Browser pass above.

**Residual risks.** The 200% zoom footer label (deferred).
