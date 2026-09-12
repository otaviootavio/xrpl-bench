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
