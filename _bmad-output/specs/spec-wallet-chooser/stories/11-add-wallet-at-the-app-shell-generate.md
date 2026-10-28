---
title: 'Add wallet at the app shell, Generate'
type: 'feature'
created: '2026-10-28'
status: 'done'
baseline_revision: '60e4949c3515dbb3c0485ff4c60a1c058aa3fbd9'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-18-context.md'
  - '{project-root}/docs/agents/INDEX.md'
  - '{project-root}/docs/agents/keys-and-secrets.md'
  - '{project-root}/docs/agents/verifying-your-work.md'
  - '{project-root}/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-chooser-2026-10-19/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-10-19/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-10-19/DESIGN.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Import (`storeImported`) still calls `setActiveWalletId` and does not announce the new card, and is offered only while an open wallet's key exists.
    evidence: |-
      Import is Stories 12 and 13; its replacement must not select, must announce the added card, and must work with every lock closed.
    location: >-
      src/components/wallet/AddWalletScreen.tsx
    severity: medium
  - summary: >-
      Add wallet launched from a wallet's Settings tab is chooser-side: that wallet's activity no longer counts while the screen is open, the Back key reads `Wallets` though it returns to the wallet, and focus is not restored when it closes into the wallet shell.
    evidence: |-
      Story 19.4 removes the per-wallet launch from Settings. The wallet is still shed on the way to the Chooser (patched).
    location: >-
      src/components/AppShell.tsx, src/components/wallet/AddWalletScreen.tsx
    severity: low
  - summary: >-
      The keystore guard replaces a typed name taken in another tab with `Wallet N` without telling the user; the notice does not name the wallet.
    evidence: |-
      AD-42 calls the re-check a best-effort guard. A notice naming the added wallet would close it.
    location: >-
      src/lib/crypto/keystore.ts
    severity: low
  - summary: >-
      The Add wallet key sits below the card list, the label error is not announced, and the layout at 320, 390 and desktop in both themes and the whole flow with every card locked are unverified in a browser.
    evidence: |-
      jsdom cannot observe layout; run the final browser pass.
    location: >-
      src/pages/Chooser.tsx, src/components/wallet/WalletQuestions.tsx
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** Add wallet (`/wallets/new`) is launched from a wallet's Settings tab and mounted inside the wallet shell, so it needs an open wallet. Generate (`CreateWalletFlow`) calls `setActiveWalletId` itself, so creating a wallet selects, and with it effectively enters, the new one (including a Mainnet one). The per-wallet questions are one block inside the 783-line `CreateWalletFlow`, which the Import path cannot reuse (AD-40).

**Approach:** Mount Add wallet at the app shell as a chooser-side screen; add an **Add wallet** key to the Chooser; make creation never select or enter; focus the new card's h2 on return with `Wallet added.`; auto-suffix a colliding default name; and extract the per-wallet questions into one component (rendering `describeOptions`) that Story 13 will reuse for Import. Generate must work with every lock closed. Import is not changed here beyond staying reachable only where it already works.

## Boundaries & Constraints

**Always:** `/wallets/new` is a chooser-side route: `AppShell` renders `AddWalletScreen` directly (not inside `Main`/`WalletScreens`), under the chooser-side header, with no open wallet required. `walletInView` loses its INTERIM `add-wallet` clause (Story 5) and `isWalletScreen`/`enteredWalletId` treat `add-wallet` as not in-wallet; remove the comment naming Story 11. The Chooser shows an **Add wallet** key (visible legend `Add wallet`, `Button variant="outline"`, 44px on coarse pointers) that navigates to `/wallets/new` (`ADD_WALLET_PATH`); also keep Settings' existing launch working. The route carries only the screen name, never a name, Seed or form data. Generate (`CreateWalletFlow`) creates the wallet under its own new lock (Mainnet floor and the written-Seed confirmation for passkey-only Mainnet wallets unchanged, `policy.ts`) and **never calls `setActiveWalletId` and never navigates into the wallet**; remove that call from `CreateWalletFlow.finishBackup` and have the caller decide: Onboarding's first-wallet commit still sets it (it is the one allowed writer), Add wallet does not. On success `AddWalletScreen` returns to where the user came from (`leaveScreen()`), shows the notice `Wallet added.`, the store's `wallets` includes the new wallet, and the Chooser then focuses the **new card's h2** (`tabIndex={-1}`, a `data-seed-id` hook on the card): use a tiny one-shot module signal (`src/lib/chooser-signals.ts`: `announceAdded(seedId)` and `consumeAdded()`), set by `AddWalletScreen`, consumed by the Chooser on mount; a cold start consumes nothing. Default name: when the label is empty it is `uniqueDefaultName('Wallet', otherSeedNames)` (from `lib/wallet-name.ts`, Story 9); a typed label is checked with `validateWalletName` (visible error text tied to the field with `aria-invalid`/`aria-describedby`, same strings as Rename, create disabled while invalid); the creation functions in `keystore.ts` (`createStoredWallet`, `createDerivedWallet`) re-run the rule against the stored records and replace an empty or colliding label with the auto-suffixed default (a best-effort guard, AD-42). Extract the questions (Network, Node, Seed Method, signature type, Open Check, Signing Check, auto-lock, Customise toggle, their `aria-disabled` reasons, rendering `describeOptions`) from `CreateWalletForm` into one component, e.g. `src/components/wallet/WalletQuestions.tsx`, with NO change to what Generate asks, says or does (the existing `create-wallet-flow` tests stay green unmodified in substance); Import is not mounted on it in this story. While no wallet is open, the Import choice on `/wallets/new` is not offered (it still needs an open wallet's key until Story 13); say nothing misleading: omit it. All secrets stay out of state, URL and storage (docs/agents/keys-and-secrets.md). No `:focus` styling, no `outline-none`, no new colour token.

**Never:** Do not touch Import's behaviour or the keystore import path (Stories 12 and 13). Do not select or enter a wallet from creation. Do not put a name, Seed or form data in the URL or history state. Do not change Rename, Remove or Lock.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Add key | Chooser | `Add wallet` key opens `/wallets/new` | n/a |
| Every lock closed | all cards locked | Generate works under its own new lock | policy refusals shown as shipped |
| Mainnet passkey-only | Mainnet, passkey Open Check and passkey Signing | written-Seed confirmation required as shipped | n/a |
| Never selects | creation succeeds | `setActiveWalletId` not called, route returns to the Chooser, no wallet entered | n/a |
| New card | back on the Chooser | new card present, focus on its h2, `Wallet added.` | n/a |
| Default name collides | existing `Wallet` | new wallet named `Wallet 2` | n/a |
| Typed name invalid | empty after trim, 41 chars, duplicate | visible error, create disabled | n/a |
| Import choice | no open wallet | not offered | n/a |
| Cold start | launch | `/wallets/new` rewritten to `/` as before; no focus move | n/a |
| Onboarding | first wallet | still selects the new wallet (the one allowed writer) | n/a |

## Code Map

- `src/components/wallet/CreateWalletFlow.tsx` -- `CreateWalletFlow` (~93), `CreateWalletForm` (~110): questions state and JSX, `finishBackup` (~393-410) calls `setActiveWalletId` (remove); `onDone`, `actionHost`, `defaultLabel` props. Extract `WalletQuestions`.
- `src/components/wallet/AddWalletScreen.tsx` -- mounts `CreateWalletFlow` (generate) and the Import form; `useWalletOpenKey(activeWalletId)` and `activeLockId` make Import need an open wallet; `storeImported` calls `setActiveWalletId` (Import's own selection stays until Story 13, but must not run for Generate).
- `src/components/AppShell.tsx` -- route switch; `walletInView`; `walletSide` header choice; add `add-wallet` as a shell-level screen. `src/pages/Main.tsx`, `src/pages/WalletScreens.tsx` -- stop handling `add-wallet`. `src/lib/route.ts` -- `isTaskRoute`/`TaskRoute` lists `add-wallet`; adjust.
- `src/pages/Chooser.tsx`, `src/components/wallet/WalletCard.tsx` -- Add key, focus signal, `data-seed-id` on the card, h2 `tabIndex`.
- `src/lib/wallet-name.ts` -- `validateWalletName`, `uniqueDefaultName`; `src/components/wallet/rename-copy.ts` -- the error strings to reuse.
- `src/lib/crypto/keystore.ts` -- `createStoredWallet`, `createDerivedWallet` (label handling), `listStoredWallets`.
- `src/pages/Onboarding.tsx` -- first-wallet commit (the one allowed `setActiveWalletId`); `src/pages/tabs/SettingsTab.tsx` -- launches `/wallets/new` (keep).
- `src/lib/crypto/policy.ts` -- `describeOptions`; chooser `EXPERIENCE.md` (Flow 2 Adding a wallet; Exact strings: Add success) and `DESIGN.md`; AD-40 in the spine.
- Tests: `src/components/wallet/__tests__/create-wallet-flow.test.tsx`, `src/pages/__tests__/create-entry-points.test.tsx`, `src/components/__tests__/AppShell.test.tsx`, chooser tests.

## Tasks & Acceptance

**Execution:**
- `src/components/wallet/WalletQuestions.tsx` (new), `CreateWalletFlow.tsx` -- extract the questions; remove `setActiveWalletId` from `finishBackup` -- AD-40, FR-82, FR-87
- `src/components/AppShell.tsx`, `src/lib/route.ts`, `Main.tsx`, `WalletScreens.tsx` -- `add-wallet` at the app shell, chooser-side; drop the INTERIM clause -- AD-32
- `src/pages/Chooser.tsx`, `WalletCard.tsx`, `src/lib/chooser-signals.ts` (new), `AddWalletScreen.tsx` -- Add key, `Wallet added.`, new-card h2 focus, no Import offer without an open wallet
- `src/lib/crypto/keystore.ts`, `CreateWalletFlow.tsx` -- default-name rule and label validation
- `src/pages/Onboarding.tsx` -- keeps selecting the first wallet explicitly
- Tests: Generate with every lock closed creates under its own lock; `setActiveWalletId` is not called and the route stays on the Chooser after success; Mainnet passkey-only keeps the confirmation; the Chooser Add key; new card present with h2 focus and `Wallet added.`; the default-name auto-suffix and the keystore re-check; typed-name errors; Import not offered without an open wallet; Onboarding still selects its first wallet; `add-wallet` renders at the shell (no `Main`) and `walletInView` is null for it; the existing create-flow tests pass; the extracted questions component renders the same questions. A test fails if `CreateWalletFlow` calls `setActiveWalletId`.

**Acceptance Criteria:**
- Given every lock is closed, when the user adds a wallet by Generate, then creation works under its own new lock and never selects or enters the wallet.
- Given creation succeeds, then the Chooser shows the new card with focus on its h2 and `Wallet added.`.
- Given a default name already exists, then the new wallet's default name is auto-suffixed so it stays unique.
- One extracted component serves the per-wallet questions, mounted at `/wallets/new` at the app shell, which carries only the screen name.
- `bun run lint`, `bun run build`, `bun run test`, `bun run check:contrast` pass.

## Spec Change Log

## Review Triage Log

### 2026-10-28 — Review pass
- verdicts: blind hunter 10, edge-case hunter 13, verification gap 0 plus 2 notes, intent alignment descriptive; grouped by root cause into the rows below — medium 1 and low 2 (patched), medium 1 and low 3 deferred, rest false or rejected as low
- findings:
  - `[medium]` `patch` Add wallet launched from a wallet's Settings overwrote the previous wallet with null, so leaving to the Chooser skipped shedding that wallet's cached reads — the launching wallet is kept through the add-wallet screen; a new card's focus is kept over the h1.
  - `[low]` `patch` The Chooser dropped the announced focus when the new card was not rendered — it falls back to the h1.
  - `[low]` `patch` A test named for `setActiveWalletId` only matched `announceAdded` in a source file — renamed to what it checks (the behavioural guard is the flow tests asserting a null `activeWalletId`).
  - `[medium]` `defer` Import still selects and does not announce; Settings-launched Add wallet; silent keystore rename; browser items — see deferred.
  - `[false]` `reject` A cold start at `/wallets/new` may open Add wallet — `rewriteBootLocation` rewrites every path but `/` before the first render (Story 2, tested).
  - `[false]` `reject` `WalletQuestions` is not reusable for Import — Story 13 adapts what Import omits; the extraction here is the shared base the spec asks for.
  - `[low]` `reject` Onboarding ordering of `onDone`, label `maxLength`, `aria-disabled` Create look, mocked flow in `create-entry-points`, no Mainnet passkey-only test — the ordering is unchanged from before, the existing flow tests cover the Mainnet confirmation, and the rest are cosmetic.

## Verification

**Commands:**
- `bun run lint` -- expected: no errors
- `bun run build` -- expected: `tsc -b` and Vite build succeed
- `bun run test` -- expected: all pass
- `bun run check:contrast` -- expected: pass

**Manual checks (if no CLI):**
- Browser pass: add a wallet from the Chooser with every card locked, at 320, 390 and desktop in both themes; confirm focus lands on the new card. Deferred to the final pass.

## Auto Run Result

Status: done

- Summary: `/wallets/new` renders at the app shell as a chooser-side screen, reachable from a new Chooser Add wallet key with every lock closed. Generate never selects or enters the wallet (Onboarding's first-wallet commit still selects), returns to where the user came from with `Wallet added.`, and the Chooser focuses the new card's h2 through a one-shot signal. A colliding or empty default name is auto-suffixed, a typed name is checked with the Rename rule, and the keystore re-runs it. The per-wallet questions are one extracted component.
- Files: `src/components/wallet/WalletQuestions.tsx`, `src/lib/chooser-signals.ts` (new), `src/components/wallet/CreateWalletFlow.tsx`, `AddWalletScreen.tsx`, `WalletCard.tsx`, `src/pages/Chooser.tsx`, `src/components/AppShell.tsx`, `src/lib/route.ts`, `src/lib/crypto/keystore.ts`, `src/pages/Onboarding.tsx`, `Main.tsx`, `WalletScreens.tsx`, and tests.
- Review: 3 patches applied (1 medium, 2 low), 4 deferred, the rest rejected with reasons above.
- Follow-up review recommended: false.
- Verification: `bun run lint`, `bun run build`, `bun run test` (1613 tests), `bun run check:contrast` pass after patches.
- Residual risk: Import is unchanged (Stories 12 and 13); no browser pass yet.
