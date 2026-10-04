- source_spec: none
  summary: Epic 2 — make the two sealed boundaries hold (Stories 2.1–2.4: screens stop calling Wallet.fromSeed, writes.ts stops importing the app store, lib/xrpl/client.ts gains a test seam, the endpoint failover gets tested).
  evidence: Split from a 15-story request at the build workflow's multi-goal gate. Independently shippable — needs nothing from Epic 1. Closes G-2, G-4 and the writes.ts half of G-3 in the architecture gap register.
  triage: (2026-10-04, against origin/dev 3ac02fc) drop. Done: stories 2.1–2.4 are `done` in sprint-status.yaml, merged in 88e28a4 (#29). The split note has served its purpose.

- source_spec: none
  summary: Epic 4 — make the rules and the code agree (Stories 4.1–4.4: the decisions.md §4 sentence permitting a non-extractable CryptoKey handle, drops arithmetic moved into money.ts, AddressDisplay rendering through AddressLink, main.tsx registering through lib/sw-register.ts).
  evidence: Split from a 15-story request at the build workflow's multi-goal gate. Four mutually independent fixes; arguably four goals on its own. Closes G-9, G-6, G-7, G-8. Story 4.1 is a docs-only change.
  triage: (2026-10-04, against origin/dev 3ac02fc) drop. Done: stories 4.1–4.4 are `done`, merged in 88e28a4 (#29).

- source_spec: none
  summary: Epic 3 — one declared way for a failure to report (Stories 3.1–3.3: notice tone vocabulary out of components/ui/alert, notify gains dismiss, every failure audited against AD-8).
  evidence: Split from a 15-story request at the build workflow's multi-goal gate. Carries the only user-visible risk in the breakdown and therefore needs the manual 320px and 200%-zoom pass. Depends on AD-8 standing as written; overriding that rule rewrites all three stories.
  triage: (2026-10-04, against origin/dev 3ac02fc) drop. Done: stories 3.1–3.3 are `done`, merged in 88e28a4 (#29).

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-query-key-factory.md`
  summary: The query-key guard cannot see a key bound to a variable before use (`const k = ['accountState', n, a]` then `invalidateQueries({ queryKey: k })`).
  evidence: Confirmed against a fixture tree — the literal is not flagged. Closing it needs dataflow analysis rather than a text scan, which is beyond what a dependency-free `node:` script should attempt. Would be settled by moving the check into a real lint rule with an AST.
  triage: (2026-10-04, against origin/dev 3ac02fc) promote. Already story 10.1 (backlog). Still true: `scripts/check-query-keys.mjs` is a text scan.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-query-key-factory.md`
  summary: The four invalidation sites each invalidate a different subset of the account-scoped keys, and nothing checks the subsets against one another.
  evidence: useAccountLiveUpdates invalidates all four, SendTab three (no incomingPaymentWatch), TrustLinesTab two, BalancesTab one. Pre-existing — the subsets differed before the factory too, so not caused by this story. A named `queryKeys.accountScoped(network, address)` group returning the set would make a missing member visible.
  triage: (2026-10-04, against origin/dev 3ac02fc) drop. Resolved by 8e421e4 (#31, story 5.5): all four sites call `invalidateAccountScoped` (`SendTab.tsx:532`, `TrustLinesTab.tsx:60`, `BalancesTab.tsx:48`, `useAccountLiveUpdates.ts:30`).

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-query-key-factory.md`
  summary: docs/agents/ledger-io.md:12 still instructs agents to put the active wallet and network into every query key by hand, with no mention of the factory or the lint gate.
  evidence: Verified the line is present and now behind the code. Deferred because the fix edits an agent-context file, which this workflow routes away from a build story.
  triage: (2026-10-04, against origin/dev 3ac02fc) promote-to-story (proposed docs story D, with the other agent-context and decision-doc entries). Still true: `docs/agents/ledger-io.md:12-15` still says to put the wallet and network into every key by hand, and does not mention the factory.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-sealed-boundaries.md`
  summary: The transaction in-flight signal is a boolean, so two overlapping writes let the first to finish clear it while the second is still in flight — the window FR-48 exists to close.
  evidence: Reachable, not theoretical: the flag is deliberately global because Radix unmounts inactive tabs, so a payment and a trust-line change can be in flight together. Pre-existing — `git show 2eba44c:src/lib/xrpl/writes.ts` uses the same boolean. The fix is a depth counter reporting true on 0→1 and false on 1→0.
  triage: (2026-10-04, against origin/dev 3ac02fc) promote. Already story 7.2 (backlog). Still true: `app-store.ts:31` `txInFlight: boolean`; `writes.ts:17` reporter takes a boolean.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-sealed-boundaries.md`
  summary: Clients discarded during failover are never disconnected, and a connect abandoned at the 10-second timeout can still open a socket nobody owns.
  evidence: Confirmed by reading the failover loop in lib/xrpl/client.ts. Pre-existing; Epic 2 added a clearTimeout for the timer but not socket cleanup. Would be settled by disconnecting the loser in the catch and on cache-miss replacement.
  triage: (2026-10-04, against origin/dev 3ac02fc) promote. Already story 8.1 (backlog). Still true: the failover `catch` (`client.ts:82-84`) drops the client without disconnecting.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-sealed-boundaries.md`
  summary: getXrplClient has no in-flight deduplication, so several queries firing at mount each construct and connect their own Client, and every loser is dropped from the map still connected.
  evidence: Confirmed by reading client.ts. Pre-existing. Caching the in-flight connect promise per network closes it.
  triage: (2026-10-04, against origin/dev 3ac02fc) promote. Already story 8.2 (backlog). Still true: `getXrplClient` (`client.ts:71-73`) caches only connected clients, not the in-flight connect.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-sealed-boundaries.md`
  summary: The two seed-import paths disagree — Onboarding gates the write on the disabled-master-key warning, SettingsTab writes to the vault first and warns afterwards — and they surface a malformed seed differently.
  evidence: Confirmed at both call sites and independently reported by the implementer as an unmet acceptance criterion. Making the settings path gate the write is a user-visible flow change, so it needs its own story. Neither path trims the seed input either, so a pasted trailing newline reads as malformed.
  triage: (2026-10-04, against origin/dev 3ac02fc) promote. Already stories 11.1 (the warning comes before the write) and 11.2 (whitespace).

- source_spec: `_bmad-output/implementation-artifacts/spec-4-rules-and-code.md`
  summary: AGENTS.md still states "no secret ever enters localStorage, React state, a store, the URL, or anything serializable" absolutely, while docs/decisions.md §4 now carries a narrow exception for a non-extractable CryptoKey handle.
  evidence: AGENTS.md is loaded first via CLAUDE.md, so an agent reading it deletes the vaultKey code the §4 exception exists to protect — the exact failure the exception was written to prevent. Deferred because the fix edits an agent-context file. Per the repo's own rule it should gain a pointer to §4, not a restatement of it.
  triage: (2026-10-04, against origin/dev 3ac02fc) promote-to-story (docs story D). The premise has moved: AGENTS.md does not exist on dev (open PR #28 would add it). The absolute sentence is now `CLAUDE.md:44`, which still has no pointer to the `docs/decisions.md` §4 (line 62) `CryptoKey` exception.

- source_spec: `_bmad-output/implementation-artifacts/spec-4-rules-and-code.md`
  summary: The waiting-update flag never returns to false, so a failed applyUpdate leaves the update prompt showing.
  evidence: Pre-existing in shape — useAppUpdate only ever set waiting true before this change too. Confirmed in src/lib/sw-register-core.ts. Would be settled by a setWaiting(false) on activation failure.
  triage: (2026-10-04, against origin/dev 3ac02fc) drop. Premise refuted: after a failed activation a worker genuinely is still waiting, so `true` is the true answer (G-26, refuted 2026-09-15). Story 7.3 pins the opposite of the fix proposed here.

- source_spec: `_bmad-output/implementation-artifacts/spec-4-rules-and-code.md`
  summary: No lint gate stops BigInt arithmetic reappearing outside money.ts, or a hand-rolled explorer anchor returning outside AddressLink/TxLink.
  evidence: Both acceptance criteria for Epic 4 are grep-shaped and hold today, but nothing enforces them tomorrow — the same decay the query-key guard was written to stop. Two more guard scripts in the check-query-keys.mjs idiom would close it.
  triage: (2026-10-04, against origin/dev 3ac02fc) promote. Already story 10.2 (backlog). Still true: `scripts/` has no BigInt or explorer-link check.

- source_spec: `_bmad-output/implementation-artifacts/spec-3-report-failed-reads.md`
  summary: When useServerReserves fails but account_info succeeds, useSpendableBalance returns spendableDrops: null with isLoading: false, so Balances renders the XRP balance with Spendable and Reserved silently missing — no skeleton, no failure text. useRecommendedFee failing in SendTab is likewise unreported.
  evidence: Found by the implementer while reading src/hooks/useSpendableBalance.ts:13; same defect class as the three this epic fixed, same screen, but outside its task list and I/O matrix. The spendable figure is the number the operator acts on, so its silent absence is worth its own decision rather than a side-effect fix.
  triage: (2026-10-04, against origin/dev 3ac02fc) drop. Resolved in 88e28a4 (#29, stories 5.2/5.3): `useSpendableBalance.ts:63-64` returns `unavailable` on `reserves.isError`; `BalancesTab.tsx:88-89,198` states "Unavailable" with a retry; Send refuses on `feeUnknownReason`.

- source_spec: `_bmad-output/implementation-artifacts/spec-5-1-destination-check-guard.md`
  summary: The Send screen's Review button uses native `disabled={!canSend}`, which docs/decisions.md §6.4 forbids — a temporarily unavailable control must be `aria-disabled` with its reason in visible text.
  evidence: Confirmed at SendTab.tsx:279; the rule is restated in docs/agents/ui-and-design-system.md:56 and PRODUCT.md:249, with existing precedent at TrustLineRow.tsx:66 and SettingsTab.tsx:347. Deferred at the story 5.1 intent gate because `canSend` composes seven conditions and each needs its own accurate visible reason — well past this story's destination check. Safe to defer only because story 5.1 puts the real guard inside the submit path.
  triage: (2026-10-04, against origin/dev 3ac02fc) defer to epic 5 retro action item 8 (the SendTab split gives each `canSend` reason its own visible text). Still true: `SendTab.tsx:822` `disabled={!canSend}`.

- source_spec: `_bmad-output/implementation-artifacts/spec-5-1-destination-check-guard.md`
  summary: The send submit path re-reads the destination and then consumes only `requireDestTag` — the fresh `exists` and `hasTrustLine` are discarded, so a destination that de-activated or lost its trust line between the two reads is still submitted to and burns a network fee.
  evidence: Raised independently by all three review layers against SendTab.tsx's `doSend`. Real, but deferred rather than patched: both facts were warnings and never members of `canSend` before story 5.1, so making them refusals is a behaviour change past this story's intent, and the cost is a spent fee rather than unrecoverable funds. The fresh answer is already in hand at that point, so the fix is cheap whenever it is wanted.
  triage: (2026-10-04, against origin/dev 3ac02fc) drop. Resolved in 88e28a4 (#29, the 5.1 follow-up `spec-5-1-guard-retires-what-it-stops-knowing.md`): `doSend` refuses with `not-activated` / `no-trust-line` when the fresh answer contradicts the one on screen.

- source_spec: `_bmad-output/implementation-artifacts/spec-5-1-destination-check-guard.md`
  summary: The pre-flight `fetchDestinationInfoOnce` inside `doSend` has no timeout or abort, and the dialog's Cancel is `disabled={busy}`, so a stalled read leaves the confirm dialog showing "Sending…" with no way out while the decrypted signing wallet sits in a local.
  evidence: Verified, and narrower than first filed — `client.ts:43` gives connection a 10s timeout and `App.tsx:24` sets `retry: 1`, so the wait is bounded rather than open-ended; a request that stalls after connect still has none. Deferred because the fix needs a race or abort path plus a cancellable busy state, which is more than a direct correction.
  triage: (2026-10-04, against origin/dev 3ac02fc) keep. Still true: `fetchDestinationInfoOnce` in `doSend` has no race or abort, and Cancel is `disabled={busy}` (`SendTab.tsx:883`). Bounded, but not by the 10 s connect timeout, which only covers opening the socket: once connected, each request is bounded by xrpl.js's own 20 s request timeout (`TIMEOUT = 20` in `xrpl/dist/npm/client/connection.js`), and `retry: 1` (`App.tsx:26`) allows a second attempt, so "Sending…" can hold with Cancel disabled for roughly 40 s plus backoff.

- source_spec: `_bmad-output/implementation-artifacts/spec-5-2-reserve-read-reported.md`
  summary: `TrustLinesTab.tsx:69` falls back to a hardcoded `'200000'` owner reserve when the server-reserve read has no data, so `canAffordNewLine` is decided by a figure that was never read.
  evidence: Found while mapping every consumer of the reserve read for story 5.2. Squarely within epic 5's guarantee that a figure on screen was actually read, but on a different screen than 5.2's acceptance criteria and failing closed rather than open — `canAffordNewLine` is `false` when `spendableDrops` is null. Deferred rather than folded in unasked.
  scope: Three sites, not one, so closing only the first closes half the defect. (a) `TrustLinesTab.tsx:70` decides `canAffordNewLine` from the fallback. (b) `TrustLinesTab.tsx:91` RENDERS the same never-read figure to the user — "This will lock an additional 0.2 XRP owner reserve" — stated as fact, which is the falsehood epic 5 exists to remove rather than merely a guard fed a guess. (c) `TrustLinesTab.tsx:28` reads `reserves.data` with no `isError` check at all, so across a failed refetch the retained answer feeds both of the above and is presented as current. The fix is the same shape as story 5.2's on Balances: no figure without a read that succeeded, the unavailability stated in words, and a retry beside it.
  triage: (2026-10-04, against origin/dev 3ac02fc) promote-to-story (proposed story T, with the next entry): 5.2's shape on the Trust lines screen. Still true at all three sites: `TrustLinesTab.tsx:68` fallback, `:90` renders it as fact, no `reserves.isError` check.

- source_spec: `_bmad-output/implementation-artifacts/spec-5-2-reserve-read-reported.md`
  summary: `TrustLinesTab.tsx:92` states one reason — "You don't have enough spendable XRP to cover this." — for every state in which `spendableDrops` is null, including the two where the true reason is that a read failed rather than that the balance is short.
  evidence: Pre-existing for the never-loaded case; story 5.2 widened it, because the hook now returns null (correctly) while the reserve read is in error with an earlier answer retained, where it previously returned a figure. The guard itself still fails closed — the control is `disabled` and nothing is submitted — so this is a wrong *reason*, not a wrong permission. Out of 5.2's scope: a different screen, and fixing it means giving that dialog the same unavailable-vs-insufficient distinction the Balances rows just gained. Natural pair for the `'200000'` fallback entry above.
  triage: (2026-10-04, against origin/dev 3ac02fc) promote-to-story (story T, with the previous entry). Still true: `TrustLinesTab.tsx:91` gives one reason for every null `spendableDrops`.

- source_spec: `_bmad-output/implementation-artifacts/spec-5-3-fee-read-not-zero.md`
  summary: A token send never checks that the account can afford its XRP network fee. Every Payment costs drops regardless of what it carries, so an account holding tokens but almost no XRP can submit an issued payment it cannot pay for, and it is refused by the network after the attempt rather than on the form — as tecINSUFF_FEE (136) if it reaches a ledger, or terINSUF_FEE_B (-97) at submission. Neither code appears in src/lib/xrpl/result-codes.ts, so the operator gets the raw-code fallback rather than a sentence.
  evidence: Confirmed at SendTab.tsx — the `fundsError` token branch compares the amount against the trust-line balance only, and never reaches the fee or the spendable XRP figure. Pre-existing: the check has never existed, so story 5.3 could not be "not fabricating" it. Ruled out of 5.3 explicitly at the intent gate — adding it would refuse token sends that are permitted today, a user-visible behaviour change beyond a bugfix story. Would be settled by extending the token branch with an XRP-side check of fee against spendable, which then also inherits 5.2's and 5.3's three-state wording for both reads.
  triage: (2026-10-04, against origin/dev 3ac02fc) defer to epic 5 retro action item 8 (it extracts the funds check, where the XRP-side fee check belongs). Still true: the token branch (`SendTab.tsx:307-311`) compares only the trust-line balance; #32 made it refuse on an unknown line, not check the fee.

- source_spec: `_bmad-output/implementation-artifacts/spec-5-3-fee-read-not-zero.md`
  summary: No screen renders the offline state. `App.tsx:24` builds the QueryClient with no `networkMode`, so the default `'online'` leaves a read with no connection at `status: 'pending'`, `fetchStatus: 'paused'` — no data and no error — and every three-state screen reports it as a read still in flight, with no retry and no admission that nothing is being attempted.
  evidence: Confirmed by grep — nothing in `src/` branches on `fetchStatus`, `isPaused`, or `navigator.onLine`. This is a property of every ledger read in the app, not of story 5.3: 5.2's spendable wording has it identically, and 5.3 only made it visible by adding a third state worth distinguishing. For an installable PWA meant to be opened offline, "still being read" is a false statement about a read that was never started. What 5.3 did change offline is an improvement: an XRP send is now refused rather than declared affordable against a fee of zero. Would be settled by one shared treatment for `paused` across the three-state screens, which is why it does not belong inside a single story.
  triage: (2026-10-04, against origin/dev 3ac02fc) defer to epic 5 retro action item 8 (`paused` becomes a state of the shared read-state primitive). Still true: nothing in `src/` reads `fetchStatus`, `isPaused`, `navigator.onLine` or `networkMode`.

- source_spec: `_bmad-output/implementation-artifacts/spec-5-3-fee-read-not-zero.md`
  summary: The Send screen's Spendable row renders the word "Unavailable" for a read still in flight and for an account that does not exist yet, not only for a read that failed — the same collapse epic 5 exists to remove, one row away from the fee row that now distinguishes all three.
  evidence: `SendTab.tsx:511-514` branches on `spendableDrops` alone, and `useSpendableBalance.ts:64,70,78` returns null for `unavailable`, `loading` and `not-activated` alike. Written by story 5.2, not by 5.3, and found by the review of 5.3 — recorded rather than repaired, because a fix here is a change to the story next door. The guard itself still fails closed and the amount field's refusal already names the right one of the three states (5.2 fixed that half), so this is a wrong word in the readout, not a wrong permission. Would be settled by giving that row the hook's `status` the way the refusal wording already takes it.
  triage: (2026-10-04, against origin/dev 3ac02fc) defer to epic 5 retro action item 8 (the row takes the primitive's state). Still true: `SendTab.tsx:799-802` branches on `spendableDrops` alone.

## Deferred from: code review of story-5.1 (2026-09-16)

- source_spec: `_bmad-output/implementation-artifacts/spec-5-1-destination-check-guard.md`
  summary: No decision record names `DESTINATION_CHECK_FRESHNESS_MS`, its 30-second value, the third ("out of date") state the Send form now has, the post-unlock placement of the re-check, or the deliberate choice not to refetch when a check goes stale.
  evidence: All five are new rules on the money path, and the code comments in `query-reads.ts:29` and `SendTab.tsx:154` cite them as already decided. `docs/decisions.md` §12 mentions a "freshness window" in passing but names none of them. Deferred because the fix edits §12, a rules file this workflow routes away from a build story.
  triage: (2026-10-04, against origin/dev 3ac02fc) promote-to-story (docs story D). Still true: `docs/decisions.md` does not name `DESTINATION_CHECK_FRESHNESS_MS`; §12 (`:1288`) mentions a freshness window only in passing.

## Deferred from: code review of story-5.4 (2026-09-28)

- source_spec: `_bmad-output/implementation-artifacts/spec-5-4-amount-upper-bound.md`
  summary: An issued-currency value in XRPL exponent notation (`1e-7`, `1234567890123456e-30`) is rendered raw by `formatAmountString`, and a digit run before `e` gets thousands separators (`1,234e5`).
  evidence: `money.ts:36-43` splits only on `.` and applies separators to the whole integer part. rippled's `STAmount::getText` uses scientific notation for very small or very large IOU values. Pre-existing: before story 5.4, any truthy `delivered_amount` reached the same formatter. Story 5.4 now classifies such values as exact (`isPositiveLedgerDecimalString`), so they are correctly unflagged but still misformatted. Medium: a misread token figure on History and in the "Received" toast.
  triage: (2026-10-04, against origin/dev 3ac02fc) promote-to-story. Medium: a misread token figure on History and in the Received toast. Still true: `formatAmountString` (`money.ts:36-43`) splits only on `.`.
- source_spec: `_bmad-output/implementation-artifacts/spec-5-4-amount-upper-bound.md`
  summary: `docs/agents/money.md` does not record the split between `isPositiveDecimalString` (strict, what a user types) and `isPositiveLedgerDecimalString` (lenient, what the ledger reports), or that `amountIsUpperBound` now also covers failed, zero and malformed deliveries.
  evidence: money.md:37-39 still describes the flag only as "when the ledger could not report it". Without the note, a later change may merge the two checks back together. Agent-context file, so it is recorded here rather than patched.
  triage: (2026-10-04, against origin/dev 3ac02fc) promote-to-story (docs story D). Still true: `docs/agents/money.md:39` is the only mention, and `isPositiveLedgerDecimalString` is not named.

## Deferred from: browser pass of stories 5.3 and 5.4 (2026-09-28)

- source_spec: `_bmad-output/implementation-artifacts/spec-5-4-amount-upper-bound.md`
  summary: On History at 320 and 390 px, a failed payment's collapsed amount (and its `≤` label) is pushed off-screen by the unwrapped status badge.
  evidence: Measured in the browser: the row's content is 417 px wide in a 229/299 px button, with the amount at x=374–463. Seen on a real `tecNO_DST_INSUF_XRP` row. Blocks 5.4 leaving review.
  triage: (2026-10-04, against origin/dev 3ac02fc) drop. Resolved by bfc4c29 (`spec-5-4-history-failed-row-clipping.md`), merged to dev in 3ac02fc (#32): the History row is a grid below `sm` (`HistoryTab.tsx:98`), and only the result code is unbreakable.
- source_spec: `_bmad-output/implementation-artifacts/spec-5-3-fee-read-not-zero.md`
  summary: The Send confirm dialog states the network fee as the recommended figure (0.00001 XRP), but the submitted transaction was charged 0.000012 XRP.
  evidence: In the browser pass, the dialog read "plus a network fee of 0.00001 XRP". After a failed send the balance went from 99 to 98.999988, and History's Fee field reads 0.000012 XRP. The dialog and the fee autofilled at submission disagree.
  triage: (2026-10-04, against origin/dev 3ac02fc) promote-to-story. Root cause confirmed: the dialog states `fee`'s `open_ledger_fee` (`reads.ts:126`), while `client.autofill` (`writes.ts`) applies xrpl.js's default `feeCushion` (`DEFAULT_FEE_CUSHION = 1.2`, `node_modules/xrpl/dist/npm/client/index.js:51`), so 10 drops shown means 12 drops charged. The confirm dialog of a money-moving action states a figure that is not the one charged.
- source_spec: `_bmad-output/implementation-artifacts/spec-5-3-fee-read-not-zero.md`
  summary: Sending a token back to its own issuer shows "Recipient can't hold this token", but an issuer needs no trust line to receive its own token.
  evidence: In the browser pass, selecting EUR with the EUR issuer's address as destination showed that warning. The destination check reads `hasTrustLine` without treating destination === issuer as holding.
  triage: (2026-10-04, against origin/dev 3ac02fc) keep. Low. Still true: `query-reads.ts:93` has no `destination === issuer` case.

## Deferred from: code review of story-5.5 (2026-09-29)

- source_spec: `_bmad-output/implementation-artifacts/spec-5-5-one-invalidation-group.md`
  summary: When `submitXrpPayment`/`submitTrustSet` throws (timeout, dropped socket, unknown outcome), SendTab and TrustLinesTab invalidate nothing, although the transaction may have applied.
  evidence: `invalidateAccountScoped` sits on the `try` path after the result toast; the `catch` only toasts. Pre-existing: before 5.5 the `catch` also invalidated nothing. The live subscription usually covers it, but not when the socket is what failed. Medium: balance and history can stay pre-submit until a poll.
  triage: (2026-10-04, against origin/dev 3ac02fc) promote-to-story (proposed for epic 7, which owns the write path). Medium. Still true: the `catch` in SendTab `doSend` (`SendTab.tsx:533`) and in TrustLinesTab `submit` (`TrustLinesTab.tsx:61-62`) only toasts. Raised by the retro (P5) as a priority item.
- source_spec: `_bmad-output/implementation-artifacts/spec-5-5-one-invalidation-group.md`
  summary: `docs/decisions.md` §4 (enforced patterns) and `docs/agents/ledger-io.md` do not record that account-scoped data is discarded only through `invalidateAccountScoped`, or why.
  evidence: The rule and its reason live only in `query-keys.ts` comments and a vitest scan. CLAUDE.md makes `decisions.md` the home of the reasoning. Agent-context and decision docs, so recorded here, not patched.
  triage: (2026-10-04, against origin/dev 3ac02fc) promote-to-story (docs story D). Still true: neither `docs/decisions.md` nor `docs/agents/` mentions `invalidateAccountScoped`.

## Deferred from: browser pass of story 5.5 (2026-09-29)

- source_spec: `_bmad-output/implementation-artifacts/spec-5-5-one-invalidation-group.md`
  summary: When `account_tx` is answered by a node whose history doesn't reach the account's transactions, History states "No transactions yet" or shows a truncated list as the complete one.
  evidence: The account `rGMSiqR8SFRv9seNALxCMNdySHNbjZ574V` was checked on both nodes. `wss://s.altnet.rippletest.net:51233` returns 6 transactions (`complete_ledgers` 13075065-21133873). `wss://testnet.xrpl-labs.com`, the backup, returns 0 (`complete_ledgers` 21132193-21133873). The app used both within one load: after a faucet refresh, History went from 6 rows to 1. `account_tx` reports `ledger_index_min`, which shows the searched range starting after the account's first transaction, so the gap can be detected. High: the app states a falsehood about the account, and the wallet's own rule says a failure and an empty result are never the same fact. It overlaps with the connection work in epic 8.
  triage: (2026-10-04, against origin/dev 3ac02fc) promote-to-story. High: History states "No transactions yet", or shows a truncated list, as fact. Raised by the retro (P5) as the top item. Still true: `fetchAccountTx` (`reads.ts:154-198`) sends `ledger_index_min: -1` and never reads the returned range, and `client.ts` fails over to the backup silently. Proposed to go ahead of epic 6, or as the first story of epic 8.

## Deferred from: code review of the History failed-row fix (2026-09-30)

- source_spec: `_bmad-output/implementation-artifacts/spec-5-4-history-failed-row-clipping.md`
  summary: At 320 px the Send outcome line (status legend beside the transaction hash link) overflows its plate by about 41 px; the link's external-link icon spills past the edge.
  evidence: Measured in the browser during the fix's verification. The `SendTab.tsx:729-733` row is `flex items-center gap-2`, with no wrap or shrink. Pre-existing: before the fix the whole legend was nowrap and the overflow was larger.
  triage: (2026-10-04, against origin/dev 3ac02fc) defer to epic 5 retro action item 8 (the SendTab split). Low, cosmetic. Still true: the outcome row (`SendTab.tsx:828`) is `flex items-center gap-2`, with no wrap.
- source_spec: `_bmad-output/implementation-artifacts/spec-5-4-history-failed-row-clipping.md`
  summary: On History below `sm`, a very long amount (e.g. a 20+ character issued-currency figure) squeezes the direction column to zero, and "SENT"/"RECEIVED" can paint over the amount.
  evidence: The row grid is `grid-cols-[minmax(0,1fr)_auto]` with a `min-w-0` direction cell, so an `auto` amount wider than the row minus the direction wins. Pre-existing in another form: the old flex layout pushed the amount off-screen in the same case. Medium: a long token amount on a phone is unreadable either way. Needs a design choice (let the amount wrap, or give it its own line).
  triage: (2026-10-04, against origin/dev 3ac02fc) keep. Still true: `HistoryTab.tsx:98` `grid-cols-[minmax(0,1fr)_auto]`. It needs a design choice before it can be a story.

## Deferred from: code review of the Epic 5 retro send-guards fix (2026-10-03)

- source_spec: `_bmad-output/implementation-artifacts/spec-retro-5-send-guards-fail-closed.md`
  summary: After the unlock, Send re-checks only the destination; a trust-line, fee or spendable read that fails or changes during the unlock does not stop a token or XRP payment from being submitted.
  evidence: `doSend` re-reads only `fetchDestinationInfoOnce` after `unlockWalletForSigning`; the Epic 5 retro (F6) deferred widening the probe to the `SendTab` split (action item 8).
  triage: (2026-10-04, against origin/dev 3ac02fc) defer to epic 5 retro action item 8, as the retro decided (F6, open question 3). The cost is one fee, not funds.

## Deferred from: Epic 5 retrospective, aggregate views A7 and A8 (2026-09-30; recorded 2026-10-04)

- source_spec: `_bmad-output/implementation-artifacts/epic-5-retro-2026-09-30.md`
  summary: History keeps rendering its retained rows under the failure panel, and its retry fetches the next page even when the read that failed was a refetch of the first page. The failed read is never retried, and the list under the panel is shown as if it were current.
  evidence: (Line numbers are origin/dev 3ac02fc.) `HistoryTab.tsx:34` is `retryRead = () => (data && data.pages.length > 0 ? fetchNextPage() : refetch())`. With pages already loaded, it assumes the failure came from "Load more". A failed first-page refetch also leaves pages loaded, and it is the common case: every `invalidateAccountScoped` call (send, trust-line change, faucet, live stream) refetches page 1. Retry then fetches a further page. Rows are rendered (`:88`) beside the `QueryErrorState` (`:56`) with nothing marking them as last-known. Pre-epic; story 5.5 widened its reach by routing more invalidations through `accountTx`. Medium: a stale history presented as current, after exactly the actions that change it.
  triage: (2026-10-04) defer, as the retro decided (A7). Pairs with the backup-node partial-history entry above: both are History stating an incomplete list as complete. Settle in the same story.
- source_spec: `_bmad-output/implementation-artifacts/epic-5-retro-2026-09-30.md`
  summary: The Trust lines screen renders the retained lines beneath its own failure panel, whose text says the app "does not know what is on" the list.
  evidence: (origin/dev 3ac02fc) `TrustLinesTab.tsx:149` renders the `QueryErrorState` on `trustLines.isError`. `:166` then maps `trustLines.data` unconditionally, so after a failed refetch the previous answer is listed under a panel that disclaims it. The comment at `:145-148` acknowledges retained data only for the empty branch. Pre-epic. Same root as retro F1 (Send's asset picker listing retained lines on error), which 3ac02fc (#32) fixed for Send only. Low to medium: a line's balance and limit are shown as current when they were not read.
  triage: (2026-10-04) defer, as the retro decided (A8). Natural member of proposed story T (Trust lines screen, 5.2's shape).

## Deferred from: build of epic 8 (2026-10-04)

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-8-connections.md`
  summary: A connect attempt still in flight when `disconnectAllClients` runs (wallet removal) settles afterwards and writes a connected client into the cache that teardown has just emptied.
  evidence: `client.ts` `connectNetwork` caches on success; `disconnectAllClients` only closes clients already in the map and does not touch `inflight`. Pre-existing: before epic 8 every concurrent attempt did the same. Not fixed because story 8.1 requires the teardown path's behaviour to stay unchanged. Low: the socket carries no subscription after teardown, but it stays open until the next disconnect.
- source_spec: `_bmad-output/implementation-artifacts/spec-epic-8-connections.md`
  summary: After a socket drops, `useAccountLiveUpdates` keeps its `transaction` listener on the client it subscribed through, and nothing re-subscribes on the replacement client. Live updates stop until the hook remounts (network or wallet switch, or reload), and polling is the only fallback.
  evidence: xrpl.js 5.1.0 `connection.ts` has no subscription tracking, so its own auto-reconnect never re-subscribed either. Epic 8 now closes the replaced client, which ends that client's reconnect loop. The loss itself is pre-existing. Medium: incoming payments appear on the next 15-second poll rather than at once.

## Deferred from: build of epic 10 (2026-10-04)

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-10-guards.md`
  summary: `scripts/check-layering.mjs` and `scripts/check-sw-register.mjs` still say "oxlint carries no user-defined-rule mechanism"; oxlint 1.80 has one (`jsPlugins`, alpha).
  evidence: `node_modules/oxlint/configuration_schema.json` documents `jsPlugins`. Corrected in `check-query-keys.mjs`, which epic 10 owns; the other two are outside its scope (agents rule 5). Low: the conclusion (stay a `node:` script) still holds, only the stated reason is stale.
- source_spec: `_bmad-output/implementation-artifacts/spec-epic-10-guards.md`
  summary: AD-7 is gated only for BigInt construction in `src/hooks`, `src/pages` and `src/components`. `src/lib`/`src/store` and the `Number()`/`parseFloat`/`toFixed`-on-money half of the rule are still review-only.
  evidence: Story 10.2's AC scopes the guard to the three UI trees. Widening it to `src/lib` needs a directive in `lib/xrpl/__tests__/money.test.ts:104` (a deliberate `BigInt('10.5')`), and a `Number()` ban needs a way to tell a monetary value from any other number, which a text scan cannot. Medium: today no non-`money.ts` lib module does money arithmetic, but nothing holds that.
