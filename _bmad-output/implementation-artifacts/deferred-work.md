- source_spec: none
  summary: Epic 2 — make the two sealed boundaries hold (Stories 2.1–2.4: screens stop calling Wallet.fromSeed, writes.ts stops importing the app store, lib/xrpl/client.ts gains a test seam, the endpoint failover gets tested).
  evidence: Split from a 15-story request at the build workflow's multi-goal gate. Independently shippable — needs nothing from Epic 1. Closes G-2, G-4 and the writes.ts half of G-3 in the architecture gap register.

- source_spec: none
  summary: Epic 4 — make the rules and the code agree (Stories 4.1–4.4: the decisions.md §4 sentence permitting a non-extractable CryptoKey handle, drops arithmetic moved into money.ts, AddressDisplay rendering through AddressLink, main.tsx registering through lib/sw-register.ts).
  evidence: Split from a 15-story request at the build workflow's multi-goal gate. Four mutually independent fixes; arguably four goals on its own. Closes G-9, G-6, G-7, G-8. Story 4.1 is a docs-only change.

- source_spec: none
  summary: Epic 3 — one declared way for a failure to report (Stories 3.1–3.3: notice tone vocabulary out of components/ui/alert, notify gains dismiss, every failure audited against AD-8).
  evidence: Split from a 15-story request at the build workflow's multi-goal gate. Carries the only user-visible risk in the breakdown and therefore needs the manual 320px and 200%-zoom pass. Depends on AD-8 standing as written; overriding that rule rewrites all three stories.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-query-key-factory.md`
  summary: The query-key guard cannot see a key bound to a variable before use (`const k = ['accountState', n, a]` then `invalidateQueries({ queryKey: k })`).
  evidence: Confirmed against a fixture tree — the literal is not flagged. Closing it needs dataflow analysis rather than a text scan, which is beyond what a dependency-free `node:` script should attempt. Would be settled by moving the check into a real lint rule with an AST.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-query-key-factory.md`
  summary: The four invalidation sites each invalidate a different subset of the account-scoped keys, and nothing checks the subsets against one another.
  evidence: useAccountLiveUpdates invalidates all four, SendTab three (no incomingPaymentWatch), TrustLinesTab two, BalancesTab one. Pre-existing — the subsets differed before the factory too, so not caused by this story. A named `queryKeys.accountScoped(network, address)` group returning the set would make a missing member visible.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-query-key-factory.md`
  summary: docs/agents/ledger-io.md:12 still instructs agents to put the active wallet and network into every query key by hand, with no mention of the factory or the lint gate.
  evidence: Verified the line is present and now behind the code. Deferred because the fix edits an agent-context file, which this workflow routes away from a build story.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-sealed-boundaries.md`
  summary: The transaction in-flight signal is a boolean, so two overlapping writes let the first to finish clear it while the second is still in flight — the window FR-48 exists to close.
  evidence: Reachable, not theoretical: the flag is deliberately global because Radix unmounts inactive tabs, so a payment and a trust-line change can be in flight together. Pre-existing — `git show 2eba44c:src/lib/xrpl/writes.ts` uses the same boolean. The fix is a depth counter reporting true on 0→1 and false on 1→0.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-sealed-boundaries.md`
  summary: Clients discarded during failover are never disconnected, and a connect abandoned at the 10-second timeout can still open a socket nobody owns.
  evidence: Confirmed by reading the failover loop in lib/xrpl/client.ts. Pre-existing; Epic 2 added a clearTimeout for the timer but not socket cleanup. Would be settled by disconnecting the loser in the catch and on cache-miss replacement.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-sealed-boundaries.md`
  summary: getXrplClient has no in-flight deduplication, so several queries firing at mount each construct and connect their own Client, and every loser is dropped from the map still connected.
  evidence: Confirmed by reading client.ts. Pre-existing. Caching the in-flight connect promise per network closes it.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-sealed-boundaries.md`
  summary: The two seed-import paths disagree — Onboarding gates the write on the disabled-master-key warning, SettingsTab writes to the vault first and warns afterwards — and they surface a malformed seed differently.
  evidence: Confirmed at both call sites and independently reported by the implementer as an unmet acceptance criterion. Making the settings path gate the write is a user-visible flow change, so it needs its own story. Neither path trims the seed input either, so a pasted trailing newline reads as malformed.

- source_spec: `_bmad-output/implementation-artifacts/spec-4-rules-and-code.md`
  summary: AGENTS.md still states "no secret ever enters localStorage, React state, a store, the URL, or anything serializable" absolutely, while docs/decisions.md §4 now carries a narrow exception for a non-extractable CryptoKey handle.
  evidence: AGENTS.md is loaded first via CLAUDE.md, so an agent reading it deletes the vaultKey code the §4 exception exists to protect — the exact failure the exception was written to prevent. Deferred because the fix edits an agent-context file. Per the repo's own rule it should gain a pointer to §4, not a restatement of it.

- source_spec: `_bmad-output/implementation-artifacts/spec-4-rules-and-code.md`
  summary: The waiting-update flag never returns to false, so a failed applyUpdate leaves the update prompt showing.
  evidence: Pre-existing in shape — useAppUpdate only ever set waiting true before this change too. Confirmed in src/lib/sw-register-core.ts. Would be settled by a setWaiting(false) on activation failure.

- source_spec: `_bmad-output/implementation-artifacts/spec-4-rules-and-code.md`
  summary: No lint gate stops BigInt arithmetic reappearing outside money.ts, or a hand-rolled explorer anchor returning outside AddressLink/TxLink.
  evidence: Both acceptance criteria for Epic 4 are grep-shaped and hold today, but nothing enforces them tomorrow — the same decay the query-key guard was written to stop. Two more guard scripts in the check-query-keys.mjs idiom would close it.

- source_spec: `_bmad-output/implementation-artifacts/spec-3-report-failed-reads.md`
  summary: When useServerReserves fails but account_info succeeds, useSpendableBalance returns spendableDrops: null with isLoading: false, so Balances renders the XRP balance with Spendable and Reserved silently missing — no skeleton, no failure text. useRecommendedFee failing in SendTab is likewise unreported.
  evidence: Found by the implementer while reading src/hooks/useSpendableBalance.ts:13; same defect class as the three this epic fixed, same screen, but outside its task list and I/O matrix. The spendable figure is the number the operator acts on, so its silent absence is worth its own decision rather than a side-effect fix.

- source_spec: `_bmad-output/implementation-artifacts/spec-5-1-destination-check-guard.md`
  summary: The Send screen's Review button uses native `disabled={!canSend}`, which docs/decisions.md §6.4 forbids — a temporarily unavailable control must be `aria-disabled` with its reason in visible text.
  evidence: Confirmed at SendTab.tsx:279; the rule is restated in docs/agents/ui-and-design-system.md:56 and PRODUCT.md:249, with existing precedent at TrustLineRow.tsx:66 and SettingsTab.tsx:347. Deferred at the story 5.1 intent gate because `canSend` composes seven conditions and each needs its own accurate visible reason — well past this story's destination check. Safe to defer only because story 5.1 puts the real guard inside the submit path.

- source_spec: `_bmad-output/implementation-artifacts/spec-5-1-destination-check-guard.md`
  summary: The send submit path re-reads the destination and then consumes only `requireDestTag` — the fresh `exists` and `hasTrustLine` are discarded, so a destination that de-activated or lost its trust line between the two reads is still submitted to and burns a network fee.
  evidence: Raised independently by all three review layers against SendTab.tsx's `doSend`. Real, but deferred rather than patched: both facts were warnings and never members of `canSend` before story 5.1, so making them refusals is a behaviour change past this story's intent, and the cost is a spent fee rather than unrecoverable funds. The fresh answer is already in hand at that point, so the fix is cheap whenever it is wanted.

- source_spec: `_bmad-output/implementation-artifacts/spec-5-1-destination-check-guard.md`
  summary: The pre-flight `fetchDestinationInfoOnce` inside `doSend` has no timeout or abort, and the dialog's Cancel is `disabled={busy}`, so a stalled read leaves the confirm dialog showing "Sending…" with no way out while the decrypted signing wallet sits in a local.
  evidence: Verified, and narrower than first filed — `client.ts:43` gives connection a 10s timeout and `App.tsx:24` sets `retry: 1`, so the wait is bounded rather than open-ended; a request that stalls after connect still has none. Deferred because the fix needs a race or abort path plus a cancellable busy state, which is more than a direct correction.

- source_spec: `_bmad-output/implementation-artifacts/spec-5-2-reserve-read-reported.md`
  summary: `TrustLinesTab.tsx:69` falls back to a hardcoded `'200000'` owner reserve when the server-reserve read has no data, so `canAffordNewLine` is decided by a figure that was never read.
  evidence: Found while mapping every consumer of the reserve read for story 5.2. Squarely within epic 5's guarantee that a figure on screen was actually read, but on a different screen than 5.2's acceptance criteria and failing closed rather than open — `canAffordNewLine` is `false` when `spendableDrops` is null. Deferred rather than folded in unasked.
  scope: Three sites, not one, so closing only the first closes half the defect. (a) `TrustLinesTab.tsx:70` decides `canAffordNewLine` from the fallback. (b) `TrustLinesTab.tsx:91` RENDERS the same never-read figure to the user — "This will lock an additional 0.2 XRP owner reserve" — stated as fact, which is the falsehood epic 5 exists to remove rather than merely a guard fed a guess. (c) `TrustLinesTab.tsx:28` reads `reserves.data` with no `isError` check at all, so across a failed refetch the retained answer feeds both of the above and is presented as current. The fix is the same shape as story 5.2's on Balances: no figure without a read that succeeded, the unavailability stated in words, and a retry beside it.

- source_spec: `_bmad-output/implementation-artifacts/spec-5-2-reserve-read-reported.md`
  summary: `TrustLinesTab.tsx:92` states one reason — "You don't have enough spendable XRP to cover this." — for every state in which `spendableDrops` is null, including the two where the true reason is that a read failed rather than that the balance is short.
  evidence: Pre-existing for the never-loaded case; story 5.2 widened it, because the hook now returns null (correctly) while the reserve read is in error with an earlier answer retained, where it previously returned a figure. The guard itself still fails closed — the control is `disabled` and nothing is submitted — so this is a wrong *reason*, not a wrong permission. Out of 5.2's scope: a different screen, and fixing it means giving that dialog the same unavailable-vs-insufficient distinction the Balances rows just gained. Natural pair for the `'200000'` fallback entry above.
