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
