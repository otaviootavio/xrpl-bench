---
runScope: 'epic-level'
runKey: 'epic-17'
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-10-26'
---

Mode: epic-level (Epic 17, Wallet Chooser). Inputs: epics-wallet-chooser.md, spec-wallet-chooser/SPEC.md, chooser ARCHITECTURE-SPINE (AD-31..AD-46). Sprint status exists.

## Step 2 context
Stack: frontend (React 19 + Vite PWA, no backend). Test tooling: vitest + @testing-library/react (99 test files under src/**/__tests__); no Playwright config in repo; browser passes are manual per docs/agents/verifying-your-work.md. Lint includes scripts/check-*.mjs guards (query keys, layering, account-invalidation, money, write-choke-point).
Existing tests adjacent to Epic 17: src/__tests__/gate-migration.test.tsx, src/lib/__tests__/route.test.ts, teardown.test.ts, src/pages/__tests__/unlock-*.test.tsx, src/pages/tabs/__tests__/settings-*.test.tsx, src/lib/crypto/__tests__/keystore.test.ts.
Playwright-utils / Pact: not applicable (no Playwright suite, no services).

## Step 3: Risk assessment (P x I, 1-3 each; score >= 6 is high)

| ID | Cat | Risk (story) | Source | P | I | Score |
|---|---|---|---|---|---|---|
| R1 | SEC | Chooser activity extends an open lock, so a lock outlives its timer (17.3) | AD-35 | 2 | 3 | 6 |
| R2 | SEC | Expiry and background-lock hooks not mounted while the chooser shows (17.3) | AD-31 | 2 | 3 | 6 |
| R3 | SEC | A locked card shows an address, network or Mainnet hint (17.4, 17.5) | AD-26, AD-43 | 2 | 3 | 6 |
| R4 | SEC | Chooser mounts a ledger read, NetworkPlate or account-scoped key (17.5, 17.7, 17.11) | AD-36 | 2 | 3 | 6 |
| R5 | DATA | A failed wallet-list read renders Onboarding or an empty chooser; a setter then overwrites persisted state (Address Book) (17.1) | AD-37 | 2 | 3 | 6 |
| R6 | SEC | Import yields a weaker lock: Open Check none, shared lock, no Mainnet floor, no written-Seed confirm, duplicate address accepted (17.12, 17.13) | AD-39, AD-28 | 2 | 3 | 6 |
| R7 | SEC | Seed lingers in state or reaches the ledger or another module during Import (17.12, 17.13) | AD-39, AD-3 | 2 | 3 | 6 |
| R8 | DATA | Remove proceeds on a locked wallet when aria-disabled is bypassed (17.10) | AD-46 | 2 | 3 | 6 |
| R9 | DATA | removeWalletData closes the legacy lock or the wrong lock; activeWalletId left naming a removed wallet (17.10) | AD-46, AD-34 | 2 | 3 | 6 |
| R10 | SEC | Auto-lock edited below the Mainnet floor, or without re-proving the Open Check, on a lock shared by several Seeds (17.16) | AD-44, AD-28 | 2 | 3 | 6 |
| R11 | TECH | History unwind: Back ping-pong, Lock leaves an entry on a locked wallet, boot not rewritten to `/`; 17.5 shipped without 17.6 strands a phone user (17.2, 17.5, 17.6) | AD-32, AD-33 | 3 | 2 | 6 |
| R12 | TECH | Story 17.17 removes per-wallet Settings and the six settings-*.test.tsx files that pin them are dropped, not moved (17.14, 17.15, 17.17) | scope | 3 | 2 | 6 |
| R13 | DATA | Leave or Lock skips the cache removal: balances stay warm under a Live lamp; a lock closed inline (17.6, 17.8) | AD-38, AD-45 | 2 | 2 | 4 |
| R14 | DATA | Rename bumps rev, asks a lock, or loses the name under a concurrent Edit checks (17.9) | AD-41 | 2 | 2 | 4 |
| R15 | BUS | A multi-view Seed enters Mainnet by default after unlock; card order changes with state (17.4, 17.5) | AD-43 | 2 | 2 | 4 |
| R16 | TECH | Configure resolves with a closed lock, or acts on the wrong view of a multi-view card (17.14) | AD-32, AD-43 | 2 | 2 | 4 |
| R17 | SEC | Hard-locked user cannot reach Remove all from the chooser Settings key (17.7) | AD-46 | 2 | 2 | 4 |
| R18 | TECH | Focus, 44px targets, lamp-and-word meaning or contrast regress on new screens (all UI stories) | CLAUDE.md | 2 | 2 | 4 |
| R19 | BUS | Update marker becomes a modal or relights after a declined release (17.7) | CLAUDE.md, AD-45 | 1 | 3 | 3 |
| R20 | TECH | Creation (Generate or Import) selects or enters the new wallet (17.11, 17.13) | AD-34, AD-40 | 2 | 2 | 4 |

High risks (>= 6): R1 to R12. Mitigation for R1 to R7 is the five spec-mandated tests that fail when the rule is removed (AD-31, AD-35, AD-36, AD-37, AD-39) plus two extras the spec does not name: a locked-card type/render test (AD-43) and an Import Seed-lifetime test.

## NFR planning

- Security: thresholds are rules, not numbers. Evidence: unit and screen tests, lint guards (layering, write-choke-point), source scan that no chooser file imports `importAndStoreWallet`, `closeLock` or `queryClient.clear`.
- Reliability: failed read is never empty (AD-37). Evidence: Gate tests with a rejecting vault read and a failed hydration.
- Accessibility: 44px on coarse pointers, one h1 per screen, focus targets, contrast. Evidence: `bun run check:contrast`, plus a real-browser pass at 320, 390 and desktop in both themes (manual; no Playwright suite exists).
- Performance: **UNKNOWN**. No threshold is stated for chooser first paint or card count. Not a blocker: the chooser makes zero ledger reads. Ask only if the owner wants a card-count ceiling.
- Maintainability: the AD-36 lint gate is explicitly deferred; a screen test pins it.

## Testability

Controllable: the store, `openLocks` and keystore are injectable; `getXrplClient` can be mocked and asserted not called. Observable: the query cache and a spy on the client give a deterministic AD-36 assertion. Gap: no Playwright suite, so history and Back behaviour (AD-33) is covered by jsdom history tests plus a manual browser check, which is weaker for a PWA's real Back. Confirm in step 4 whether jsdom `history.go` is faithful enough.

## Step 4: Coverage plan

Levels: **Unit** (pure modules, vitest), **Screen** (React Testing Library, jsdom, mocked `getXrplClient`, fake store), **Browser** (manual real-browser pass; no Playwright suite exists, so this is a checkpoint, not a test). No API level: there is no backend. Playwright-utils and Pact do not apply.

### P0 (money, keys, locks; each fails when its rule is removed)
| Test | Level | Risk | Story |
|---|---|---|---|
| Gate: vault read rejects -> error text + Retry; Onboarding and shell not mounted; no setter called; Retry after good read reaches chooser; zero-wallet success reaches Onboarding | Screen | R5 | 17.1 |
| Gate: hydration failure -> error, Retry reloads page; Address Book not overwritten | Screen | R5 | 17.1 |
| AD-31: with the chooser route showing, `useAutoLock` and `useClearCacheOnLock` are mounted once; remove the mount and expiry/background close fails | Screen | R2 | 17.3 |
| AD-35: chooser activity calls `touchLock(null)` and extends no expiry, timer or persisted session; entered wallet's activity does extend | Unit + Screen | R1 | 17.3 |
| AD-35: expiry and background close-all close locks while the chooser shows | Screen | R2 | 17.3 |
| AD-36: mount chooser with several open locks -> query cache empty, `getXrplClient` never called, no balance, no NetworkPlate | Screen | R4 | 17.5 |
| AD-43: locked variant of the card type has only seedId, lockId, label, entryWalletId (type-level + runtime shape assertion); locked card DOM has no address, network, Node, check kind | Unit + Screen | R3 | 17.4, 17.5 |
| AD-39: `importStoredWallet` refuses Open Check none on every network; applies Mainnet floor; creates its own lock; refuses a duplicate address before any prompt or ledger read; rolls the lock (and App PIN) back on failure; returns no Seed | Unit | R6, R7 | 17.12 |
| AD-39: source test, no chooser-side file calls `importAndStoreWallet` | Unit (scan) | R6 | 17.12 |
| Import UI: Seed held in a ref, cleared in `finally` on success, failure and unmount; never in state, URL or storage | Screen | R7 | 17.13 |
| AD-46: Remove handler refuses when `lockId` not in `openLocks` even if `aria-disabled` is bypassed | Screen | R8 | 17.10 |
| AD-46: `removeWalletData` removes only that wallet's account-scoped entries, never closes the legacy lock, closes a lock only when its last view is gone; last wallet runs `tearDownAllLocks`; active id re-pick pure function (keep / first / null) | Unit | R9 | 17.10 |
| AD-44: `setLockAutoLock` re-proves the Open Check, rejects below the Mainnet floor over every wallet on the lock, invalidates `lockInfo` | Unit + Screen | R10 | 17.16 |

### P1
| Test | Level | Risk | Story |
|---|---|---|---|
| `route.ts`: `rewriteBootLocation` always yields `/`; depth state; `leaveToChooser` honours blockers, unwinds depth, replaces `/` when depth absent; `isWalletScreen` list | Unit | R11 | 17.2 |
| Wallets key and Back land on chooser, focus on `Wallets` h1, no ping-pong; Lock = `tearDownLock` then `leaveToChooser` | Screen | R11 | 17.6 |
| Leave keeps lock open, removes account-scoped data unless another open lock holds the same (network, address); notices clear | Screen | R13 | 17.6 |
| Card Lock: flips card and same-lock siblings in place via `tearDownLock`, polite live region, `No Open Check` line | Screen | R13 | 17.8 |
| Wallets key `aria-disabled` with reason while a blocker is active | Screen | R11 | 17.6 |
| `groupWalletsBySeed`: one card per Seed, `createdAt` then `seedId` order, stable across lock changes, entry-view rule | Unit | R15 | 17.4 |
| Open: locked -> Unlock; single-view lands in shell; multi-view returns to chooser with card open; a row opens exactly its view; Mainnet never default | Screen | R15 | 17.5 |
| Creation (Generate, Import) never calls `setActiveWalletId` or enters; works with every lock closed; new card focused, `Wallet added.` | Screen | R20 | 17.11, 17.13 |
| Rename: `wallet-name.ts` rules (1-40 code points, case-insensitive unique, grandfathering, default-name suffix); `renameWallet` no `rev` bump, no lock; concurrent `commitWalletEdit` keeps the name; failure string keeps dialog open | Unit + Screen | R14 | 17.9 |
| Configure: resolves only with open lock else `resetToHome()`; acts on entry view; Back returns to Configure | Screen | R16 | 17.14, 17.15 |
| Settings: only Address book, Version and updates, Remove all; no Lock now, no auto-lock; one component for `/settings` and the tab, never both mounted | Screen | R12 | 17.7, 17.17 |
| Remove all reachable with no wallet and no open lock, including hard-locked | Screen | R17 | 17.7 |
| **Migration of existing tests**: each `settings-*.test.tsx` assertion that pins a per-wallet behaviour is moved to a Configure test before 17.17 deletes it; a checklist maps every old test to its new home | Process | R12 | 17.14, 17.15, 17.17 |

### P2
- Update marker: `Settings, update available` is not a modal or redirect; declined release does not relight; one shared predicate (R19).
- Focus rules: h1 after leave/Remove, h2 after Add, opener after dialog, main region on entry; one h1 per screen (R18).
- 44px targets on coarse pointers for keys, icon keys, radios, checkbox rows; two keys in a row not closer than their hit areas (R18).
- Remove dialog: three bodies (sibling-view, sole-view, last-wallet) and `Open this wallet to remove it.` text.
- Plate content and exact UX strings for Configure; shared-lock count wording.

### P3
- Exploratory: very long and emoji names on a card at 320px; 20+ cards ordering and scroll; reduced-motion.

### NFR evidence plan
Security -> P0 tests above plus lint scans. Reliability -> Gate tests. Accessibility -> `bun run check:contrast` + manual browser pass at 320, 390, desktop in both themes, with opened screenshots (docs/agents/verifying-your-work.md). Performance -> UNKNOWN threshold; no test planned. Maintainability -> `bun run lint` (layering, write-choke-point, account-invalidation, query-keys guards).

### Browser checkpoints (manual)
After 17.6: chooser, Open, leave, Lock, Back on a real phone-width browser (the stated done checkpoint). After 17.13: a Mainnet-style Import flow. After 17.17: UX Key Flows 1 to 6, full visual and a11y pass.

## Execution strategy
- **PR:** all four gates (`bun run lint`, `build`, `test`, `check:contrast`); vitest suite is jsdom-only and well under 15 minutes.
- **Per story:** the story's P0/P1 tests are written in the same story, not after (spec: each AD test must fail when the rule is removed; prove it by deleting the rule once and watching it fail).
- **Nightly/Weekly:** none needed.

## Resource estimates (ranges)
P0 ~25-40 hours, P1 ~20-35 hours, P2 ~8-15 hours, P3 ~2-4 hours. Total ~55-95 hours across the 17 stories, spread through the build, plus ~4-6 hours for the three manual browser checkpoints.

## Quality gates
P0 pass rate 100%; P1 >= 95%; every R1-R12 mitigation test merged before 17.17 (the last story); each of AD-31/35/36/37/39 has a test proven to fail when its rule is removed; four gates green; browser checkpoints done and screenshots opened; no `settings-*.test.tsx` assertion dropped without a mapped replacement.

## Step 5
Output written to _bmad-output/test-artifacts/test-design-epic-17.md.
