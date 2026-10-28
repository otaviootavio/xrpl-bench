---
title: 'Seed grouping selector'
type: 'feature'
created: '2026-10-28'
status: 'done'
baseline_revision: 'f09ecc14664014e420b45d10c30fd46ab0cd8438'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-17-context.md'
  - '{project-root}/docs/agents/INDEX.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-chooser-2026-10-19/ARCHITECTURE-SPINE.md'
warnings: []
deferred:
  - summary: >-
      A group's `lockId`, label, `allowsLock` and open/locked state come from the entry view, so they would change with `activeWalletId` if views of one Seed ever carried different locks or Open Checks.
    evidence: |-
      The lock and its checks are properties of the Seed record (AD-18), so views share them today. If a later story lets views diverge, derive open/locked from the Seed, not the entry view. Worth re-checking in Story 5 when the chooser first renders groups.
    location: >-
      src/store/wallet-groups.ts
    severity: low
---

<intent-contract>

## Intent

**Problem:** The chooser needs one card per Seed, but the app has only a flat `wallets` list (one `WalletMeta` per view, in storage order, which is unrelated to creation order). A builder holding a whole `WalletMeta` could render a network or address on a locked card.

**Approach:** One pure selector, `groupWalletsBySeed(wallets, openLocks, activeWalletId)`, in a new `src/store/wallet-groups.ts` (AD-43). Its output is a discriminated union whose locked variant is typed to hold a name and nothing else. No UI, no store change, no hook.

## Boundaries & Constraints

**Always:** One group per `seedId`. Order is the Seed's `createdAt` ascending, then `seedId` ascending (string compare), never storage order and never by lock state, activity or active wallet. A Seed's `createdAt` is the smallest `createdAt` among its views. A group is **open** when `openLocks` has an entry for its `lockId`, otherwise **locked**. **Locked variant** has exactly `{ state: 'locked', seedId, lockId, label, entryWalletId }` and no other field (no address, network, node, check kind; no views array). **Open variant** has `{ state: 'open', seedId, lockId, label, entryWalletId, allowsLock, views }` where `allowsLock` is true when the Open Check of the entry view is not `'none'`, and `views` is one row per view `{ walletId, network, address, hasNode }` (`hasNode` is true when the view has a custom `node`), views ordered by `createdAt` then `walletId`. `label` is the entry view's label. **Entry view**: the group's view whose id equals `activeWalletId` if there is one, else the view whose id equals `seedId`, else the earliest view (`createdAt`, then `walletId`). Pure: no store import, no I/O, input arrays and objects are never mutated, deterministic.

**Never:** No chooser component, no hook, no store field, no ledger read. Do not add fields to the locked variant. Do not expose `WalletMeta` in the locked variant.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Empty | `[]` | `[]` | n/a |
| One wallet, locked | one view, no open lock | one locked group; keys exactly `state, seedId, lockId, label, entryWalletId` | n/a |
| One wallet, open | lock open | one open group with one row; `allowsLock` from `openCheck` | n/a |
| Several views | three views of one Seed | one group; views ordered `createdAt` then id | n/a |
| Order | storage order differs from `createdAt` | order by Seed `createdAt` then `seedId`; unchanged when locks open/close or active changes | n/a |
| Entry view | active id belongs to the group | that view | n/a |
| Entry view, not active | active id elsewhere or null | view with id `seedId`, else earliest | n/a |
| Shared lock | two Seeds with the same `lockId`, lock open | both groups open | n/a |
| No Open Check | open group whose entry view has `openCheck: 'none'` | `allowsLock` false | n/a |
| Purity | any input | inputs unchanged after the call | n/a |

</intent-contract>

## Code Map

- `src/store/wallet-groups.ts` -- new, pure selector and its exported types (`WalletGroup`, `LockedGroup`, `OpenGroup`, `WalletRow`).
- `src/lib/crypto/keystore.ts:44` -- `WalletMeta` (`id`, `seedId`, `lockId`, `label`, `address`, `createdAt`, `network`, `node?`, `openCheck`); import types only.
- `src/store/app-store.ts` -- `openLocks: Record<string, OpenLock>`; the selector takes `Record<string, unknown>` (or the keys) so it does not depend on `CryptoKey`.
- `src/store/__tests__/touch-lock.test.ts` -- shows the `WalletMeta` test fixture shape.
- AD-43 in the chooser `ARCHITECTURE-SPINE.md` -- the binding rule.

## Tasks & Acceptance

**Execution:**
- `src/store/wallet-groups.ts` -- implement `groupWalletsBySeed` and types per the contract -- AD-43
- `src/store/__tests__/wallet-groups.test.ts` -- one test per matrix row; a type-level test (`expectTypeOf`) that the locked variant has exactly the five keys; fails if the locked variant gains an address or network field

**Acceptance Criteria:**
- Given any matrix row, when `groupWalletsBySeed` runs, then the stated groups, order, entry view and variant result and no input is mutated.
- Given a locked group, then at runtime and in its type it holds only `state`, `seedId`, `lockId`, `label`, `entryWalletId`.
- `bun run lint`, `bun run build`, `bun run test`, `bun run check:contrast` pass.

## Spec Change Log

## Review Triage Log

### 2026-10-28 — Review pass
- verdicts: blind hunter 7, edge-case hunter 10, verification gap 2 plus 2 notes, intent alignment descriptive; grouped by root cause into the rows below — medium 1 (patched), low 3 (patched), low 1 deferred, false 1
- findings:
  - `[medium]` `patch` The locked variant was built by spreading a shared `base`, so a field added for the open variant would reach a locked card at runtime without failing the type test — the locked object now lists its five fields explicitly; a multi-view locked case asserts the runtime keys.
  - `[low]` `patch` `allowsLock` from the entry view was untested with views that differ — test added for both entry choices.
  - `[low]` `patch` The empty-string `node` branch of `hasNode` was unpinned — test added.
  - `[low]` `defer` Entry-view-derived lock state would shift with `activeWalletId` if views of a Seed diverged — see deferred.
  - `[false]` `reject` The `expectTypeOf` test never runs under vitest — `tsconfig.app.json` includes `src`, so `bun run build` (`tsc -b`) type-checks it, and it is one of the four gates.
  - `[low]` `reject` `as Meta` fixture cast, NaN or duplicate ids, whitespace-only or non-string `node`, missing `openCheck`, two comparators, an unmatched `activeWalletId` — corrupt-storage shapes the keystore never produces, test-fixture style matching the neighbouring tests, and an unmatched id is covered by the not-active row.

## Verification

**Commands:**
- `bun run lint` -- expected: no errors
- `bun run build` -- expected: `tsc -b` and Vite build succeed
- `bun run test` -- expected: all pass
- `bun run check:contrast` -- expected: pass

**Manual checks (if no CLI):**
- None: pure selector with unit tests only.

## Auto Run Result

Status: done

- Summary: `groupWalletsBySeed(wallets, openLocks, activeWalletId)` returns one card per Seed ordered by Seed `createdAt` then `seedId`; a locked card is typed and built to hold only `state`, `seedId`, `lockId`, `label` and `entryWalletId`; an open card adds `allowsLock` and one row per view.
- Files: `src/store/wallet-groups.ts` (new), `src/store/__tests__/wallet-groups.test.ts` (new).
- Review: 3 patches applied (1 medium, 2 low), 1 deferred, the rest rejected with reasons above.
- Follow-up review recommended: false.
- Verification: `bun run lint`, `bun run build`, `bun run test` (1447 tests), `bun run check:contrast` pass after patches.
- Residual risk: none beyond the deferred entry-view note; no UI yet.
