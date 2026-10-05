---
title: 'A closed gap cannot silently reopen — guards for bound query keys, money arithmetic and explorer links'
type: 'chore'
created: '2026-10-04'
status: 'done'
route: 'unattended'
review_loop_iteration: 1
baseline_commit: 'c0b47a3'
context:
  - '{project-root}/docs/agents/INDEX.md'
  - '{project-root}/docs/agents/money.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-2026-09-12/GAP-REGISTER.md'
---

## Intent

**Problem:** Two enforcement holes of the same shape (G-19, G-27).
`scripts/check-query-keys.mjs` only sees a key literal written *at* the key
position, so `const k = ['accountState', n, a]` followed by
`invalidateQueries({ queryKey: k })` scans clean. And nothing at all holds the
Epic 4 closures of G-6 (no BigInt arithmetic outside `lib/xrpl/money.ts`) and
G-7 (no hand-rolled explorer anchor outside `AddressLink`/`TxLink`): both are
grep-shaped facts that hold today and decay tomorrow, which is what happened to
G-1 before the query-key guard existed.

**Approach:** Stay in the established `node:`-only guard idiom (a scan run by
`bun run lint`, exported for fixture tests, one-line `// <name>-allow`
directive, its own `bun run check:*` script).

- **10.1** — the query-key guard gains same-file binding tracking: an
  identifier bound to an array literal (`const|let|var` declaration, plain
  reassignment, or default parameter) is flagged wherever it is then used at a
  key position (`queryKey: k`, `invalidateQueries(k …)` and the other eleven
  positional APIs, and the `{ queryKey }` shorthand when the bound name is
  itself `queryKey`). What a text scan still cannot see is recorded in the
  guard's docstring and in `GAP-REGISTER.md` G-19.
- **10.2** — two new guards: `scripts/check-money.mjs` (AD-7: `BigInt(`,
  `BigInt.` and bigint literals in `src/hooks`, `src/pages`,
  `src/components`) and `scripts/check-explorer-links.mjs` (AD-10: an explorer
  host string anywhere outside `lib/xrpl/networks.ts` and
  `components/wallet/AddressLink.tsx`; a reference to the URL builder outside
  those two files in non-test source).

## Boundaries & Constraints

**Always:** guards import `node:` builtins only; each runs inside
`bun run lint` and alone as `bun run check:*`; each exports its scan for
tests; each directive suppresses exactly the next line; a missing scanned
directory throws rather than scanning nothing and passing; `src/` as it stands
passes every guard with zero directives.

**Never:** no new dependency; no change to `src/` behaviour; no refactor of the
three existing guards beyond the query-key guard this story owns (no shared
helper module — duplicating the small helpers is the established shape); no
edit to agent-context files.

## I/O & Edge-Case Matrix

### Query-key guard (10.1)

| Input (file under scan) | Result |
|---|---|
| `const k = ['accountState', n, a]` … `invalidateQueries({ queryKey: k })` | flagged at the use line, label names the binding line |
| `const k: QueryKey = [...] as const` … `queryKey: k` | flagged |
| `let k; k = [...]` … `fetchQuery(k)` | flagged |
| `function f(k = ['x']) { useQuery({ queryKey: k }) }` | flagged |
| `const queryKey = [...]` … `useQuery({ queryKey, enabled })` | flagged (shorthand) |
| use split across lines: `queryKey:\n  k` | flagged |
| `const k = queryKeys.accountState(n, a)` … `queryKey: k` | clean |
| `const k = [...]` used only as `queryKey: k.slice()` / `k[0]` / `k()` | clean (not the array itself) |
| `const [a, b] = ...` | not a binding |
| `const k = [...]` never used at a key position | clean |
| `queryKey: kk` where only `k` is bound | clean (word boundary) |
| directive above the use line | suppressed |
| directive above the binding line only | still flagged |
| key built in another module, returned from a function (incl. `useMemo(() => [...])`), wrapped (`Object.freeze([...])`, `([...])`), or composed into a non-literal | **not seen** — recorded limit |
| same name bound to an array in one scope and to a factory key in another | flagged (over-approximates; fails closed) |

### Money guard (10.2, AD-7)

| Input | Result |
|---|---|
| `BigInt(x)` / `BigInt (x)` in hooks/pages/components (incl. tests) | flagged |
| `BigInt.asUintN(...)` | flagged |
| `1_000_000n`, `0n`, `0x1fn` | flagged |
| `bigint` type annotation, `typeof v === 'bigint'` | clean |
| `// never BigInt them` (no call) | clean |
| identifier `x1n`, `abc.0n` | clean |
| same file under `src/lib` or `src/store` | not scanned — scope is the AC's three trees |
| `src/hooks` renamed/missing | the scan throws (fails closed) |

### Explorer-link guard (10.2, AD-10)

| Input | Result |
|---|---|
| `<a href="https://livenet.xrpl.org/accounts/r…">` anywhere but the two owners | flagged (host) |
| `` href={`https://testnet.xrpl.org/transactions/${h}`} `` | flagged (host) |
| `xrpscan.com`, `bithomp.com`, `devnet.xrpl.org` | flagged (host) |
| `href={accountExplorerUrl(network, a)}` in a page/component | flagged (builder) |
| `const u = txExplorerUrl(n, h); <a href={u}>` | flagged (builder, at the call) |
| `NETWORKS[n].explorerBaseUrl + '/accounts/' + a` | flagged (builder) |
| `components/wallet/AddressLink.tsx` | exempt (owns AddressLink and TxLink) |
| `lib/xrpl/networks.ts` | exempt (owns the hosts and the builder) |
| a test file naming the builder to assert a shared component's `href` | clean — builder rule is source-only |
| a test file containing an explorer host | flagged |
| `https://xrpl.org/docs/...` (documentation, not the explorer) | clean |
| host assembled from fragments (`'https://' + net + '.xrpl.org'`) | **not seen** — recorded limit |

## Code Map

- `scripts/check-query-keys.mjs` — gains `bindingPatterns`/binding pass; docstring records the limit and corrects the oxlint claim.
- `scripts/check-money.mjs` — new.
- `scripts/check-explorer-links.mjs` — new.
- `package.json` — `lint` runs both new guards; `check:money`, `check:explorer-links`.
- `src/lib/xrpl/__tests__/query-key-guard.test.ts` — new bound-key fixtures.
- `src/lib/__tests__/money-guard.test.ts`, `src/lib/__tests__/explorer-link-guard.test.ts` — new.
- `_bmad-output/planning-artifacts/architecture/.../GAP-REGISTER.md` — G-19, G-27 closed; G-19's residual limit stated; the "machine-enforced" paragraph names five ADs.
- `_bmad-output/planning-artifacts/architecture/.../ARCHITECTURE-SPINE.md` — AD-10 `[GATED]`; AD-7 notes the gated subset.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — epic-10, 10-1, 10-2 done.

## Tasks & Acceptance

**Execution:**
- [x] Binding tracking in the query-key guard, with fixtures for every row of its matrix.
- [x] `check-money.mjs` + fixture test.
- [x] `check-explorer-links.mjs` + fixture test.
- [x] Wire both into `lint` and give each a `check:*` script.
- [x] Record G-19's residual limit (docstring + GAP-REGISTER) and close G-19/G-27.

**Acceptance (Given/When/Then):**

- **Given** `const k = ['accountState', n, a]` then `invalidateQueries({ queryKey: k })`
  **When** the query-key guard scans it **Then** it reports the use line and names the binding line.
- **Given** a bound key with the directive above the binding line only **When** scanned **Then** it is still reported; with the directive above the use line it is suppressed, and a second bound use two lines later is still reported.
- **Given** the guard's own fixture file, which retypes keys **When** `bun run lint` runs **Then** it passes, every fixture line carrying its directive.
- **Given** a `BigInt(` call or a bigint literal in `src/hooks`, `src/pages` or `src/components` **When** `bun run lint` runs **Then** it fails naming file and line; `lib/xrpl/money.ts` is outside the scanned trees.
- **Given** a hand-rolled anchor to an explorer host, or a use of the URL builder, outside `AddressLink.tsx` **When** `bun run lint` runs **Then** it fails; `AddressLink.tsx` and `networks.ts` are exempt.
- **Given** each new guard's directive **When** placed above a violating line **Then** that line and only that line is suppressed.
- **Given** `src/` as it stands **When** all five guards run **Then** all pass with no directive added to `src/`.

## Decisions (made unattended, for Otavio to check)

1. **G-19 stays a `node:` script with a recorded limit, not an oxlint JS-plugin rule.**
   oxlint 1.80 *does* now have a user-rule mechanism (`jsPlugins`), so the
   existing docstrings' "oxlint carries no user-defined-rule mechanism" is no
   longer accurate. The schema itself marks JS plugins "alpha and not subject to
   semver"; putting a gate on signing code behind an alpha API that can change
   in a patch release trades one decay for another. The same-file binding scan
   catches the case the story names; what it cannot see (cross-module keys,
   keys returned from a function, composed keys) is written down in the
   docstring and G-19. The query-key guard's docstring is corrected; the same
   stale sentence in `check-layering.mjs` and `check-sw-register.mjs` is
   reported, not repaired (rule 5).
2. **A bound key is reported at the use line**, where it reaches the cache —
   the same place the existing patterns report — and the label names the
   binding line. The directive therefore goes above the use.
3. **Over-approximation is accepted.** Bindings are matched by name per file,
   not per scope, so a name reused for an array in one function and a factory
   key in another is flagged. Fails closed; the directive is the escape.
4. **Money guard scope is exactly the AC's three trees, tests included.**
   `src/lib` and `src/store` are not scanned: `lib/xrpl/__tests__/money.test.ts`
   legitimately calls `BigInt('10.5')` to pin a regression, and widening the
   scope would need a directive in `src/` on day one. Today no non-`money.ts`
   lib module does BigInt arithmetic, but nothing enforces that.
5. **Money guard flags any BigInt construction, not only operators.** A text
   scan cannot tell `a + b` on bigints from `a + b` on numbers, but it can see
   where a bigint is made; in these three trees there is no legitimate reason to
   make one. The `bigint` type keyword is not flagged (a type is not arithmetic).
6. **Comments are not stripped** in either new guard. A comment that happens to
   say `BigInt(` or name an explorer host fails closed; a lexer bug that blanked
   real code would fail open.
7. **The explorer guard's builder rule exempts test files.** A test that asserts
   a shared component's `href` must name the builder
   (`components/wallet/__tests__/address-link.test.tsx` does), and a test file
   ships no anchor. The host rule still covers tests. This is stricter than an
   anchor-shaped pattern: any builder use outside the two owners in shipped
   source is flagged, which also catches the bound-variable indirection.
8. **`networks.ts` is exempt from the explorer guard** besides the two
   components, because it is where the hosts and the builder are defined (the
   analogue of the query-key factory exemption).
9. **Spine tags:** AD-10 is marked `[GATED]` (the guard covers its rule).
   AD-7 is **not** marked `[GATED]` — its rule also forbids `Number()`,
   `parseFloat` and `toFixed` on money everywhere including `money.ts`, which
   this guard does not check — and instead gains one sentence naming the gated
   subset.

## Verification

- `bun run lint`, `bun run build`, `bun run test` (34 files, 412 tests), `bun run check:contrast` — all green on 2026-10-04.
- Mutation checks, each guard both ways:
  - Neutralising the binding pass (iterating an empty map instead of `arrayBindings(text)`) turns 6 of the 7 new query-key fixtures red; restored green.
  - Dropping `.` from the binding lookbehind, and dropping the derived-value tail from the use pattern, each turn the pass fixture red.
  - Scanning no patterns in the money guard turns 6 of 10 `money-guard.test.ts` cases red; restored green.
  - Scanning no patterns in the explorer guard turns 6 of 10 cases red; applying the builder rule to test files turns the test-file case red; restored green.
  - Planting violations in real `src/` (a bound key, a `BigInt(` call and literal, an explorer host) makes each guard exit non-zero naming file:line, and `bun run lint` fails on a planted `BigInt(` and on a planted host in `src/pages`; planted files deleted afterwards.
- No browser pass: no UI or `src/` behaviour change.

## Review triage

Self-review (adversarial, edge-case, fail-closed) of the diff:

- **Real, fixed:** a binding pattern anchored on `\b` matched `obj.k = [` as a binding of `k`; the lookbehind now excludes a preceding `.`/identifier character.
- **Checked, not a defect:** `==`/`=>` cannot match as an assignment, because the pattern needs `[` straight after a single `=`; extra lookarounds added for it were redundant (a mutation removing them stayed green) and were taken out. The behaviour is pinned by the pass fixture (`eq == [...]`, `arrowParam => [...]`).
- **Real, fixed:** `queryKey: k.slice()` / `k[0]` would have flagged a derived value; the use pattern excludes a following `.`, `(`, `[`.
- **Design, not a finding:** a missing scanned tree must not pass silently — every walk lets `readdirSync` throw; pinned by a test for the money guard only, whose three named trees are the ones a rename could drop.
- **Real, fixed:** the use-pattern helper was first named `usePatterns`, which oxlint's `rules-of-hooks` read as a React hook called from a plain function and failed `lint`; renamed `keyPositionPatterns`.
- **Real, fixed:** the guard scans its own fixture file, and a name bound in one fixture matched a use in another (cross-fixture) and the `{ queryKey }` text in a test title/label; fixtures now use distinct names and every use line carries the directive.
- **Accepted (recorded):** cross-module keys and fragment-assembled hosts are not seen (G-19 residual; Decision 1, matrix).
- **Rejected:** stripping comments to avoid false positives — fails open on a lexer bug (Decision 6).
