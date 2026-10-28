---
title: 'Chooser screen and Open'
type: 'feature'
created: '2026-10-28'
status: 'done'
baseline_revision: '8997501e0c496d910299dd40604afd2dfb82f4bd'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-17-context.md'
  - '{project-root}/docs/agents/INDEX.md'
  - '{project-root}/docs/agents/verifying-your-work.md'
  - '{project-root}/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-chooser-2026-10-19/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-10-19/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-10-19/DESIGN.md'
warnings: ['oversized']
deferred:
  - summary: >-
      The Chooser-to-Unlock-to-Chooser flow for a multi-view Seed is tested only in pieces (the Unlock return, the Chooser card), not through `AppShell` end to end.
    evidence: |-
      A re-route between `leaveToChooser()` and the card flipping open could land a multi-view Seed in a view, possibly Mainnet. Close it in the branch's real-browser pass after Story 6.
    location: >-
      src/pages/Unlock.tsx, src/components/AppShell.tsx
    severity: medium (unverified)
  - summary: >-
      Every card's lock-state legend is its own `aria-live` region; a single polite region for lock-state changes would be quieter for screen readers.
    evidence: |-
      UX-DR11 asks for one polite live region on the chooser; the story's acceptance criteria do not. Revisit with the shared-lock note when it is built.
    location: >-
      src/components/wallet/WalletCard.tsx
    severity: low
  - summary: >-
      This story ships a Chooser with no way back from a wallet except the browser Back, which an installed phone PWA lacks.
    evidence: |-
      Story 6 adds the Wallets key and must merge in the same PR; nothing enforces it beyond the release pairing.
    location: >-
      docs and PR
    severity: medium
  - summary: >-
      The 44px keys, 320px wrapping, tab order and both themes are unverified in a real browser.
    evidence: |-
      jsdom cannot observe them. Run the browser pass after Story 6.
    location: >-
      src/pages/Chooser.tsx, src/components/wallet/WalletCard.tsx
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** Every launch lands inside one wallet's shell, with a header picker to switch. There is no screen where a user sees their wallets and chooses one before anything about it is read.

**Approach:** A read-only Chooser at `/`: one card per Seed from `groupWalletsBySeed` (AD-43), a locked card showing its name and nothing else, an open card showing one network row per view, and an Open key that calls `enterWallet`. Chooser-side routes read no ledger data and mount no wallet-scoped hook or header (AD-36). The Chooser replaces the wallet shell as the landing screen. Story 6 (merged in the same PR) adds the Wallets key to the wallet header; until then the browser Back pops to the Chooser.

## Boundaries & Constraints

**Always:** Cards are in `groupWalletsBySeed` order and the order never changes with state. A locked card renders: h2 name (`{typography.wallet-name}` as in the chooser `DESIGN.md`), a neutral lamp with the word `Locked` (shipped `StatusLegend` from `src/components/ui/lamp.tsx`), the line `Locked.`, and an Open key (accessible name `Open {name}`, visible legend `Open`, never the name). A locked Mainnet card renders exactly like a locked Testnet card (same DOM). An open card renders h2 name, a live lamp with the word `Open`, and one recessed network row per view: network word (`NETWORKS[network].label`), stamp (`Real funds` on Mainnet; `Not stable` plus the existing `DEVNET_NOTICE` text on Devnet; none on Testnet) as the shipped `Badge variant="warning"`, an `AddressLink` with `network` passed from the row, and an Open key (accessible name `Open {name} on {Network}`). The card of the group containing `activeWalletId` shows the word `Active` (muted, no lamp) and its entry Open key carries `aria-current="true"`. Chooser h1 is the visible word `Wallets` (the `TaskScreen` title treatment), with the description `Choose a wallet to open. Each one has its own lock.`. Open on a locked card calls `enterWallet(group.entryWalletId)`; a row's Open calls `enterWallet(row.walletId)`. `enterWallet` is the only path into a wallet. After a successful unlock in `Unlock.tsx`, a Seed with one view stays in its shell; a Seed with more than one view calls `leaveToChooser()` so Mainnet is never entered by default. Chooser-side screens (`chooser`, `settings`) read only `wallets`, `openLocks` and `activeWalletId` from the store, through the selector; they mount no `NetworkPlate`, no `useActiveWallet`/`useActiveNetwork`/`useActiveNode`, no `AppHeader`, no ledger-query hook, no `lockInfo` read, and show no balance. The shell header on chooser-side routes is the skip link plus the `XRPL Bench` nameplate only. Keys are the existing `Button` primitive (44px on coarse pointers); card action rows and network rows wrap at 320px and 200% zoom; list items use stable keys (`seedId`, `walletId`), not indexes. No `:focus` styling, no `outline-none`, no new colour token, no commit orange.

**Never:** No Rename, Remove, Configure, Lock, Add wallet or Settings key here: each is added by the story that builds its feature (8, 9, 10, 11, 7, 14), so no key leads nowhere. No balance, address on a locked card, network on a locked card. No reorder by state. No `setActiveWalletId` call outside `enterWallet` (Gate's existing repair and Onboarding's commit excepted).

**Route switch and guards (in `AppShell`):** `chooser` and `settings` render the Chooser (`settings` has no key yet and is boot-rewritten to `/`). `wallet` and `configure` renders only when `route.walletId === activeWalletId` and that wallet exists; otherwise call `resetToHome()` and render the Chooser. Every other route (`add-wallet` and the task screens) renders the existing `Main` content as today, with `AppHeader`. `walletInView` becomes `enteredWalletId(route, activeWalletId) ?? (route.screen === 'add-wallet' ? activeWalletId : null)`, the `add-wallet` clause marked INTERIM for Story 11 because Add wallet is still launched from inside a wallet's Settings tab. Remove the old interim comment. `AppHeader` renders only on wallet-side routes (`isWalletScreen(route)` or `add-wallet`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Launch | any path, wallets exist | `/`, Chooser, no ledger call, query cache empty | n/a |
| Locked card | closed lock | name h2, `Locked` lamp+word, `Locked.`, Open key; no address, network, stamp | n/a |
| Open card, three views | lock open | one row per view in view order; Mainnet row has `Real funds`; Devnet row has `Not stable` and `DEVNET_NOTICE` | n/a |
| Several open locks | mount | `getXrplClient` never called; `queryClient.getQueryCache().getAll()` empty; no `NetworkPlate` in the DOM | n/a |
| Open, locked, single view | press Open | location `/wallets/<id>`, Unlock view; after unlock the shell | n/a |
| Open, locked, several views | press Open, unlock | returns to `/` with the card open; no view entered | n/a |
| Row Open | press a network row's Open | `activeWalletId` is that view, location `/wallets/<its id>`, exactly that view | n/a |
| Mismatched deep link | route `wallet` for an id that is not active or missing | `resetToHome()`, Chooser | n/a |
| Active | active wallet's group | `Active` word, `aria-current="true"` on the Open key | n/a |
| Lock expires on Chooser | timer fires with Chooser showing | card flips to `Locked` in place; user not moved | n/a |

## Code Map

- `src/store/wallet-groups.ts` -- `groupWalletsBySeed`, `WalletGroup`, `OpenGroup`, `LockedGroup`; the only grouping. Read only.
- `src/components/AppShell.tsx` -- `walletInView` (rewrite per above), route switch, header choice, skip link, `<main id="main-content">`. Rework here.
- `src/pages/Main.tsx` -- wallet content (`Unlock` or `OpenWallet`, task screens via `WalletScreens`); unchanged except it no longer renders for `chooser`.
- `src/pages/Chooser.tsx` -- new screen (`src/components/wallet/WalletCard.tsx` and `NetworkRow` may be separate files).
- `src/pages/Unlock.tsx` -- success path of the open handler: after `openLock`, if the wallet's Seed has more than one view in `wallets`, `leaveToChooser()`.
- `src/components/ui/lamp.tsx` -- `Lamp`, `StatusLegend` (tone `neutral` and `live`).
- `src/components/wallet/NetworkPlate.tsx` -- the stamp devices (`Badge variant="warning"`) to mirror, NOT to mount; `src/components/wallet/DevnetNotice.tsx` -- `DEVNET_NOTICE`; `src/components/wallet/AddressLink.tsx` -- address link, takes `network`; `src/lib/xrpl/networks.ts` -- `NETWORKS`.
- `src/store/app-store.ts` -- `enterWallet`, `openLocks`; `src/lib/route.ts` -- `enteredWalletId`, `isWalletScreen`, `leaveToChooser`, `resetToHome`.
- `src/pages/__tests__/` and `src/__tests__/` -- existing tests that assume the shell at `/` (grep `AppShell`, `Main`, `'/'`); update, never weaken.
- chooser `EXPERIENCE.md` (Exact strings, Component Patterns, State Patterns, Accessibility Floor) and chooser `DESIGN.md` (wallet card, network row, Layout) -- the binding visual and copy contract.

## Tasks & Acceptance

**Execution:**
- `src/pages/Chooser.tsx`, `src/components/wallet/WalletCard.tsx` -- the screen, cards, rows, per the contract and `DESIGN.md` -- FR-79, FR-81, AD-36, AD-43
- `src/components/AppShell.tsx` -- route switch, guards, minimal chooser-side header, `walletInView` -- AD-31, AD-32, AD-35
- `src/pages/Unlock.tsx` -- multi-view Seed returns to the chooser after unlock -- FR-82
- Tests: Chooser with several open locks asserts empty query cache, no `getXrplClient` call, no `NetworkPlate`; locked Mainnet and locked Testnet cards render identically and hold no address or network text; open card rows (words, stamps, `DEVNET_NOTICE`, `AddressLink` network per row); Open on locked card and row; order independent of state; `Active` and `aria-current`; AppShell route guard; Unlock multi-view returns to chooser and single-view stays; accessible names. Each of the AD-36 rules gets a test that fails when the rule is removed.
- Update existing tests that assumed the shell at `/`.

**Acceptance Criteria:**
- Given several open locks, when the Chooser mounts, then the query cache is empty, `getXrplClient` is never called, no balance appears and no `NetworkPlate` is mounted.
- Given a locked card, then it shows only name, `Locked` lamp and word, `Locked.` and Open.
- Given an open card, then each row shows network word, stamp, an `AddressLink` with explicit network and an Open key.
- Given Open on a locked card, when the user unlocks, then a single-view Seed lands in its shell and a multi-view Seed returns to the Chooser with the card open.
- Given a network row, when its Open is pressed, then exactly that view is entered.
- Given the Chooser, when tabbed, then the skip link is first, order is reading order, keys are 44px on coarse pointers and rows wrap at 320px.
- The Chooser is the landing screen; Add wallet, Edit checks and the other task screens still work from inside a wallet.
- `bun run lint`, `bun run build`, `bun run test`, `bun run check:contrast` pass.

## Spec Change Log

## Review Triage Log

### 2026-10-28 — Review pass
- verdicts: blind hunter 12, edge-case hunter 11, verification gap 2 plus 2 notes, intent alignment descriptive; grouped by root cause into the rows below — low 2 (patched), medium 2 and low 1 deferred, false 3, rest rejected as low
- findings:
  - `[low]` `patch` A hand-edited line in `locked-no-ledger-request.test.tsx` was misindented and asserted before the re-render settled — now inside `await act(async …)`.
  - `[low]` `patch` The locked-card test matched `rA` case-insensitively — now asserts the network words and the exact fixture address fragment.
  - `[medium]` `defer` End-to-end multi-view flow, no way back until Story 6, and the real-browser items — see deferred.
  - `[low]` `defer` One `aria-live` region per card — see deferred.
  - `[false]` `reject` Task routes with a mismatched `walletId` render the active wallet under another URL — `WalletScreens` already calls `resetToHome()` when the screen is not reachable, a guard that predates this story.
  - `[false]` `reject` No `useActiveNetwork` or `lockInfo` spy — `lockInfo` is read through `useQuery`, so the empty-query-cache assertion fails if it were read; `AddressLink` calls `useActiveNetwork` internally by design and ignores it when `network` is passed.
  - `[false]` `reject` Re-unlock mid-task bounces the user to the Chooser — a closed lock makes `WalletScreens` reset a task route, so the Unlock view is only ever shown on the plain wallet route.
  - `[low]` `reject` Stale async unlock, a blocked `leaveToChooser` at unlock, empty Chooser, `/settings` URL kept, header nameplate classes duplicated, 50 ms negative assertion, `warnings: oversized` — no demonstrated wrong outcome, Gate prevents an empty list, the `settings` route has no entry point yet, and each fix adds structure for an unlikely case.

## Verification

**Commands:**
- `bun run lint` -- expected: no errors
- `bun run build` -- expected: `tsc -b` and Vite build succeed
- `bun run test` -- expected: all pass
- `bun run check:contrast` -- expected: pass

**Manual checks (if no CLI):**
- Real-browser pass of the Chooser at 320, 390 and desktop widths in both themes (open and locked cards, Open, back); deferred to the branch's single pass after Story 6 if no browser is available to the implementer.

## Auto Run Result

Status: done

- Summary: The Chooser is the landing screen. Cards come from `groupWalletsBySeed`; a locked card shows its name, a `Locked` lamp and word, `Locked.` and Open; an open card shows one network row per view with word, stamp, `AddressLink` and Open. Open calls `enterWallet`. Chooser-side routes mount no wallet-scoped hook or header; a multi-view Seed returns to the Chooser after unlock.
- Files: `src/pages/Chooser.tsx`, `src/components/wallet/WalletCard.tsx` (new), `src/components/AppShell.tsx`, `src/pages/Unlock.tsx`, and tests (`chooser`, `AppShell`, `unlock-wallet`, `locked-no-ledger-request`, `notice-scope`).
- Review: 2 patches applied (low), 4 deferred, the rest rejected with reasons above.
- Follow-up review recommended: false.
- Verification: `bun run lint`, `bun run build`, `bun run test` (1470 tests), `bun run check:contrast` pass after patches.
- Residual risk: no real-browser pass yet; merge with Story 6 in the same PR.
