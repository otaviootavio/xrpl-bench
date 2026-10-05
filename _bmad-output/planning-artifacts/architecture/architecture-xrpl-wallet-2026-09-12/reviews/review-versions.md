# Reviewer Lens — Version & Reality Check

**Target:** `ARCHITECTURE-SPINE.md` (+ companion `GAP-REGISTER.md`)
**Date:** 2026-09-15
**Brief:** verify every committed decision was web-researched or reality-checked
rather than asserted from training data.
**Method:** Stack table diffed line-by-line against `package.json`; every version
checked against the live npm registry (`registry.npmjs.org/<pkg>/latest`); every
XRPL protocol claim checked against `xrpl.org`; every repo claim spot-checked
against `src/` and `vite.config.ts`.

**Verdict: the spine holds up.** Nothing in the Stack table is asserted from
training data — the "Re-read from `package.json` on 2026-09-15" note is true, all
thirteen rows match the manifest character-for-character, and every named package
exists on npm today at or near the declared range. Every XRPL claim checked is
correct against current xrpl.org documentation. The findings below are
completeness and precision issues, not refutations.

---

## Verification table

### 1. Stack table vs `package.json`

| Claim | Source checked | Result |
|---|---|---|
| bun 1.3.1 | `package.json` `packageManager: "bun@1.3.1"` | VERIFIED |
| node >=22 | `engines.node: ">=22"` | VERIFIED |
| typescript ~6.0.2 | devDep `"typescript": "~6.0.2"` | VERIFIED |
| react / react-dom ^19.2.8 | both deps `^19.2.8` | VERIFIED |
| vite ^8.2.2 | devDep `^8.2.2` | VERIFIED |
| vite-plugin-pwa ^1.3.0 | devDep `^1.3.0` | VERIFIED |
| tailwindcss ^4.3.3 | dep `^4.3.3` | VERIFIED |
| @tanstack/react-query ^5.102.8 | dep `^5.102.8` | VERIFIED |
| zustand ^5.0.15 | dep `^5.0.15` | VERIFIED |
| xrpl ^5.1.0 | dep `^5.1.0` | VERIFIED |
| idb ^8.0.3 / idb-keyval ^6.3.0 | deps, both exact | VERIFIED |
| vitest ^4.1.11 | devDep `^4.1.11` | VERIFIED |
| oxlint ^1.79.0 | devDep `^1.79.0` | VERIFIED |
| "unchanged since 2026-09-12" | not independently checkable from the manifest alone (no dated diff); no contradicting evidence | UNVERIFIED (benign) |

**Thirteen for thirteen.** The table is a real re-read, not a recollection.

### 2. Do these versions exist? (live npm registry, 2026-09-15)

| Package | Spine says | npm `latest` today | Result |
|---|---|---|---|
| typescript | ~6.0.2 | **7.0.2** | VERIFIED — TS 6 exists; repo is one major behind |
| vite | ^8.2.2 | **8.3.0** | VERIFIED — Vite 8 exists; current major |
| react | ^19.2.8 | **19.3.0** | VERIFIED — current major, one minor behind |
| vitest | ^4.1.11 | **5.0.1** | VERIFIED — Vitest 4 exists; repo one major behind |
| xrpl | ^5.1.0 | **5.2.0** | VERIFIED — current major |
| tailwindcss | ^4.3.3 | **4.3.3** | VERIFIED — exactly current |
| @tanstack/react-query | ^5.102.8 | **5.102.8** | VERIFIED — exactly current |
| zustand | ^5.0.15 | **5.0.15** | VERIFIED — exactly current |
| idb | ^8.0.3 | **8.0.3** | VERIFIED — exactly current |
| idb-keyval | ^6.3.0 | **6.3.0** | VERIFIED — exactly current |
| vite-plugin-pwa | ^1.3.0 | **1.3.0** | VERIFIED — exactly current |
| oxlint | ^1.79.0 | **1.83.0** | VERIFIED — exists, four minors behind |
| bun | 1.3.1 | **1.4.2** | VERIFIED — exists, one minor behind |

**None of the "unusually high" versions is implausible.** TypeScript 6, Vite 8,
Vitest 4, React 19.2.x, xrpl 5.x and Tailwind 4.3.x all exist on npm right now;
several rows are the literal current release. This is the opposite of a
training-data hallucination — the one signal that would betray one (a version
that does not exist) is absent from every row.

**Coherence check that could have failed and didn't:** `vite-plugin-pwa@1.3.0`
declares `peerDependencies.vite: "^3.1.0 || ^4.0.0 || ^5.0.0 || ^6.0.0 || ^7.0.0
|| ^8.0.0"`. Vite `^8.2.2` is inside that range, so AD-11's `virtual:pwa-register`
specifier is supported on this Vite major rather than merely assumed to be.

### 3. XRPL protocol claims (xrpl.org, fetched today)

| Claim | Source checked | Result |
|---|---|---|
| `delivered_amount` is the trustworthy delivered figure; `Amount`/`DeliverMax` is not, for partial payments | xrpl.org Transaction Metadata — "Rather than choosing whether or not to trust the `Amount` field, you should use the `delivered_amount` field of the metadata to see how much actually reached its destination." | VERIFIED |
| `delivered_amount` can be the literal string `"unavailable"` | same page — occurs when the tx is a partial payment **and** was validated before 2014-01-20; recovery then requires reading `AffectedNodes` | VERIFIED |
| `lsfRequireDestTag` = `0x00020000` on AccountRoot | xrpl.org AccountRoot flag table (131072 decimal) | VERIFIED |
| `OwnerCount` drives the owner reserve | AccountRoot — "the number of objects this account owns in the ledger, which contributes to its owner reserve" | VERIFIED |
| `server_state` `reserve_base`/`reserve_inc` are **drops**; `server_info` reports XRP | xrpl.org `server_state` — values "given in integer drops"; `server_info` is "a similar object with slightly different formatting (using decimal XRP instead of drops, for example)" | VERIFIED |
| `tfSetNoRipple` on TrustSet prevents unintended rippling | xrpl.org TrustSet flag table — `tfSetNoRipple` = `0x00020000`, "blocks rippling between two trust lines of the same currency **if this flag is enabled on both**" | VERIFIED, with a precision nuance (F-3) |

### 4. Technologies still exist and fit

| Claim | Source checked | Result |
|---|---|---|
| `virtual:pwa-register` is a real vite-plugin-pwa specifier | npm `vite-plugin-pwa@1.3.0` is current; `src/lib/sw-register.ts:16` imports it and `scripts/check-sw-register.mjs` gates sole ownership | VERIFIED |
| `idb-keyval` still exists and is maintained | npm latest 6.3.0 = the declared range | VERIFIED |
| TanStack Query v5 retains `data` across a failed refetch (underpins AD-14 and G-10) | TanStack v5 docs + issue tracker: previously-resolved `data` remains on the result while `isError`/`isRefetchError` go true | VERIFIED — AD-14 and G-10 describe real library behaviour, not a supposition |
| `oxlint` exists and is current | npm latest 1.83.0 | VERIFIED |

### 5. Repo claims spot-checked (brownfield reality check)

| Claim | Source checked | Result |
|---|---|---|
| G-10: `SendTab.tsx:68` computes `destQuery.isError && !destQuery.data` | `src/pages/tabs/SendTab.tsx` — exact line present, and the guard at the confirm gate reads `!destInfo?.requireDestTag` | VERIFIED |
| G-10: `useDestinationInfo` carries `staleTime: 30_000` | `src/hooks/useDestinationInfo.ts:33` | VERIFIED |
| G-14: `vite.config.ts` sets `globPatterns` and **no** `runtimeCaching` | `vite.config.ts:129`; the only occurrences of "runtimeCaching" in the file are inside a comment explaining its absence | VERIFIED |
| G-15: `reads.ts` flags only the literal `'unavailable'`, falls through on absence | `src/lib/xrpl/reads.ts:182-195` — `deliveredUnavailable = delivered === 'unavailable'`; `amountIsUpperBound` set only when that is true | VERIFIED |
| Reserves read is `server_state` and treated as drops | `src/lib/xrpl/reads.ts:110-119` — `command: 'server_state'`, defaults `1_000_000` / `200_000` drops | VERIFIED, and the drops denomination is correct per §3 |
| `lsfRequireDestTag` mask in code | `src/lib/xrpl/reads.ts:23,30` — `flags & 0x00020000` | VERIFIED against xrpl.org |

---

## Findings by severity

### Medium

**F-1 — Two build-critical dependencies are absent from the Stack table, and the
"none carry an invariant" sentence does not cover them.**
`package.json` declares `@tailwindcss/vite@^4.3.3` and `@vitejs/plugin-react@^6.1.0`.
Neither appears in the Stack table, and neither appears in the follow-on
sentence that enumerates what is present-but-invariant-free (Radix, lucide-react,
qrcode, cva, clsx, tailwind-merge). `@tailwindcss/vite` is exactly as
load-bearing as the `tailwindcss` row it must version-match — Tailwind v4 ships
its build integration as a separate package, and a drift between the two is a
build break, not a style nit. As written the Stack section reads as an
exhaustive account of `package.json` and is not one.
*Fix:* add `@tailwindcss/vite` (must track `tailwindcss`) and
`@vitejs/plugin-react` as rows, or name them in the prose sentence.

### Low

**F-2 — The Stack table is production-only; the test substrate AD-12 and the
Conventions table depend on is invisible.**
AD-12 mandates a test seam, and the Conventions table mandates screen-level tests
that fail when a rendering rule is removed. Those rest on
`@testing-library/react@^16.3.3`, `@testing-library/dom@^10.4.1` and
`jsdom@^30.0.1`, none of which are named anywhere in the spine. `vitest` alone
does not give you a DOM. Not a correctness defect — but a reader reconstructing
the substrate from the spine cannot.

**F-3 — `tfSetNoRipple` "prevents unintended rippling" is true but incomplete,
and the code comment is where it matters.**
xrpl.org is explicit that No Ripple blocks rippling between two trust lines of
the same currency **only when the flag is set on both**. `src/lib/xrpl/writes.ts:147-149`
sets `TrustSetFlags.tfSetNoRipple` and comments that "without NoRipple a holder's
balance can shift" — which overstates the unilateral protection. For a
non-issuing holder wallet setting it on its own side, the practical effect is
correct and the flag is the right default; the reasoning as written is not.
*Fix:* one clause in the comment: the flag protects this side of the line.

**F-4 — A hex collision worth a note, not a change.**
`lsfRequireDestTag` (AccountRoot ledger flag) and `tfSetNoRipple` (TrustSet
transaction flag) are both `0x00020000` in different namespaces. Both literals
live in this codebase (`reads.ts:30`, `writes.ts:149`). Both are currently
correct. A future reader copying one mask to the other context would be wrong in
a way that looks right.

**F-5 — Four ranges are behind current, none dangerously.**
`typescript ~6.0.2` (latest 7.0.2), `vitest ^4.1.11` (latest 5.0.1),
`oxlint ^1.79.0` (latest 1.83.0), `bun 1.3.1` (latest 1.4.2). All exist, all are
supported; the two major-version gaps are deliberate-looking (a `~` pin on
TypeScript, a caret inside vitest 4). Recorded so that "unchanged since
2026-09-12" is not later read as "current".

### Informational — nothing refuted

No claim in the spine or the gap register was refuted by the web or by the repo.
The specific risk this lens exists to catch — a version or an API remembered
rather than looked up — produced zero hits across thirteen packages, six protocol
claims, four technology-existence claims and six repo line references.

---

## Counts

- **VERIFIED: 38**
- **REFUTED: 0**
- **UNVERIFIED: 1** ("unchanged since 2026-09-12" — no dated manifest diff
  available from the working tree; benign, and no evidence contradicts it)

## Sources

- [npm registry](https://registry.npmjs.org) — per-package `latest` metadata for
  typescript, vite, react, vitest, xrpl, tailwindcss, @tanstack/react-query,
  zustand, idb, idb-keyval, vite-plugin-pwa, oxlint, bun
- [XRPL — Transaction Metadata](https://xrpl.org/docs/references/protocol/transactions/metadata)
- [XRPL — AccountRoot](https://xrpl.org/docs/references/protocol/ledger-data/ledger-entry-types/accountroot)
- [XRPL — server_state](https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/server-info-methods/server_state)
- [XRPL — TrustSet](https://xrpl.org/docs/references/protocol/transactions/types/trustset)
- [TanStack Query v5 — Queries](https://tanstack.com/query/v5/docs/framework/react/guides/queries)
