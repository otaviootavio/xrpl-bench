- source_spec: none
  summary: Epic 2 — make the two sealed boundaries hold (Stories 2.1–2.4: screens stop calling Wallet.fromSeed, writes.ts stops importing the app store, lib/xrpl/client.ts gains a test seam, the endpoint failover gets tested).
  evidence: Split from a 15-story request at the build workflow's multi-goal gate. Independently shippable — needs nothing from Epic 1. Closes G-2, G-4 and the writes.ts half of G-3 in the architecture gap register.

- source_spec: none
  summary: Epic 4 — make the rules and the code agree (Stories 4.1–4.4: the decisions.md §4 sentence permitting a non-extractable CryptoKey handle, drops arithmetic moved into money.ts, AddressDisplay rendering through AddressLink, main.tsx registering through lib/sw-register.ts).
  evidence: Split from a 15-story request at the build workflow's multi-goal gate. Four mutually independent fixes; arguably four goals on its own. Closes G-9, G-6, G-7, G-8. Story 4.1 is a docs-only change.

- source_spec: none
  summary: Epic 3 — one declared way for a failure to report (Stories 3.1–3.3: notice tone vocabulary out of components/ui/alert, notify gains dismiss, every failure audited against AD-8).
  evidence: Split from a 15-story request at the build workflow's multi-goal gate. Carries the only user-visible risk in the breakdown and therefore needs the manual 320px and 200%-zoom pass. Depends on AD-8 standing as written; overriding that rule rewrites all three stories.
