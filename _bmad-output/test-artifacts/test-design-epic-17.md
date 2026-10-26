---
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-10-26'
inputDocuments:
  - _bmad-output/planning-artifacts/epics-wallet-chooser.md
  - _bmad-output/specs/spec-wallet-chooser/SPEC.md
  - _bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-chooser-2026-10-19/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-10-19/EXPERIENCE.md
---

# Test Design: Epics 17 to 19 - The Wallet Chooser

**Date:** 2026-10-26
**Author:** Otavio
**Status:** Draft

---

## Executive Summary

**Scope:** Epic-level test design for the Wallet Chooser: Epics 17, 18 and 19 (17 stories, CAP-1 to CAP-14). Story numbers: 17.1-17.8 (read-only chooser), 18.1-18.5 (rename, remove, add, import), 19.1-19.4 (Configure and Settings).

**Stack and tooling:** React 19 PWA, no backend. Tests are vitest + React Testing Library in jsdom, plus the lint guards in `scripts/check-*.mjs`. There is no Playwright suite, so real-browser checks are manual checkpoints. Playwright-utils and Pact do not apply.

**Risk Summary:**

- Total risks identified: 20
- High-priority risks (>= 6): 12 (R1 to R12)
- Critical categories: SEC (7), DATA (3), TECH (2) among the high risks; the other eight are medium

**Coverage Summary (approximate test counts, hours as ranges):**

- P0 scenarios: ~43 (~25-40 hours)
- P1 scenarios: ~49 (~20-35 hours)
- P2 scenarios: ~17 (~8-15 hours)
- P3 scenarios: ~4 (~2-4 hours)
- **Total effort:** ~55-95 hours, plus ~4-6 hours for three manual browser checkpoints. The tests are written inside each story, not afterwards.

---

## Not in Scope

| Item | Reasoning | Mitigation |
|---|---|---|
| Balances on the chooser | SPEC non-goal; AD-36 forbids the read | A test asserts none appear |
| First-run Onboarding import lock model (Q6), App PIN on last-wallet removal (Q7), shared-lock auto-lock semantics (Q5) | Deferred owner questions | Q5 is disclosed on the Checks plate and tested for wording only |
| Automatic updates | Forbidden by CLAUDE.md | P2 test that the marker is never a modal or redirect |
| Load and performance | No threshold exists and the chooser makes zero ledger reads | Listed under Unknown thresholds |
| Ledger behaviour of shipped dialogs (Edit checks, Reveal seed, Use on Network, two-device) | Already covered by shipped tests | Their existing tests must keep passing after the move |

---

## Risk Assessment

### High-Priority Risks (Score >= 6)

| Risk ID | Category | Description | P | I | Score | Mitigation | Owner | Timeline |
|---|---|---|---|---|---|---|---|---|
| R1 | SEC | Chooser activity extends an open lock, so a lock outlives its timer (AD-35, 17.3) | 2 | 3 | 6 | `touchLock(null)` unit and screen tests; prove they fail with the null guard removed | dev | Story 17.3 |
| R2 | SEC | Expiry and background-lock hooks not mounted while the chooser shows (AD-31, 17.3) | 2 | 3 | 6 | Screen test mounts the chooser route and asserts both hooks run once and the lock closes on expiry and on background | dev | Story 17.3 |
| R3 | SEC | A locked card shows an address, network or Mainnet hint (AD-26, AD-43; 17.4, 17.5) | 2 | 3 | 6 | Shape test on the locked variant plus a DOM test that a locked Mainnet card matches a locked Testnet card | dev | Stories 17.4, 17.5 |
| R4 | SEC | Chooser mounts a ledger read, NetworkPlate or account-scoped key (AD-36; 17.5, 17.7, 18.3) | 2 | 3 | 6 | Screen test: cache empty and `getXrplClient` not called, with several open locks; repeat for `/settings` and add-wallet | dev | Stories 17.5, 17.7, 18.3 |
| R5 | DATA | A failed wallet-list read renders Onboarding or an empty chooser, and a setter then overwrites persisted state (AD-37; 17.1) | 2 | 3 | 6 | Gate tests for rejecting read and hydration failure; assert no setter call and Address Book intact | dev | Story 17.1 |
| R6 | SEC | Import yields a weaker lock: Open Check `none`, shared lock, no Mainnet floor, no written-Seed confirm, or duplicate address accepted (AD-39, AD-28; 18.4, 18.5) | 2 | 3 | 6 | Keystore unit tests for each refusal; source scan that no chooser file calls `importAndStoreWallet` | dev | Story 18.4 |
| R7 | SEC | Seed lingers in state, URL or storage, or reaches the ledger or another module during Import (AD-39, AD-3; 18.4, 18.5) | 2 | 3 | 6 | Ref-lifetime test on success, failure and unmount; duplicate refusal asserted before any prompt or read | dev | Stories 18.4, 18.5 |
| R8 | DATA | Remove proceeds on a locked wallet when `aria-disabled` is bypassed (AD-46; 18.2) | 2 | 3 | 6 | Handler test invokes Remove with the lock closed and asserts refusal | dev | Story 18.2 |
| R9 | DATA | `removeWalletData` closes the legacy lock or the wrong lock, or `activeWalletId` names a removed wallet (AD-46, AD-34; 18.2) | 2 | 3 | 6 | Unit tests on teardown scope and on the pure re-pick function | dev | Story 18.2 |
| R10 | SEC | Auto-lock set below the Mainnet floor, or without re-proving the Open Check, on a lock shared by several Seeds (AD-44, AD-28; 19.3) | 2 | 3 | 6 | `setLockAutoLock` tests for floor over every wallet on the lock and for the re-proof | dev | Story 19.3 |
| R11 | TECH | History unwind fails: Back ping-pong, Lock leaves an entry on a locked wallet, boot not rewritten to `/`; chooser shipped without the Wallets key strands a phone user (AD-32, AD-33; 17.2, 17.5, 17.6) | 3 | 2 | 6 | Route unit tests; Wallets key and Back screen tests; 17.5 and 17.6 merge together; manual real-browser check after 17.6 | dev | Stories 17.2, 17.5, 17.6 |
| R12 | TECH | Story 19.4 removes per-wallet Settings and the `settings-*.test.tsx` assertions that pin them are dropped, not moved (19.1, 19.2, 19.4) | 3 | 2 | 6 | A checklist maps every old assertion to its new Configure test before 19.4 deletes anything | dev + Otavio | Stories 19.1 to 19.4 |

### Medium-Priority Risks (Score 3-4)

| Risk ID | Category | Description | P | I | Score | Mitigation | Owner |
|---|---|---|---|---|---|---|---|
| R13 | DATA | Leave or Lock skips cache removal (balances warm under a Live lamp), or a lock is closed inline (AD-38, AD-45) | 2 | 2 | 4 | Teardown-scope tests; scan that chooser-side and header code never call `closeLock` or `queryClient.clear` | dev |
| R14 | DATA | Rename bumps `rev`, asks a lock, or loses the name under a concurrent Edit checks (AD-41) | 2 | 2 | 4 | Keystore unit test with an interleaved `commitWalletEdit` | dev |
| R15 | BUS | A multi-view Seed enters Mainnet by default after unlock; card order changes with state (AD-43) | 2 | 2 | 4 | Selector order tests; Open flow screen test for the multi-view return | dev |
| R16 | TECH | Configure resolves with a closed lock, or acts on the wrong view of a multi-view card (AD-32, AD-43) | 2 | 2 | 4 | Route resolution test (`resetToHome()`); entry-view test | dev |
| R17 | SEC | A hard-locked user cannot reach Remove all from the chooser Settings key (AD-46) | 2 | 2 | 4 | Screen test with no wallet and no open lock, and with a hard lock | dev |
| R18 | TECH | Focus, 44px targets, lamp-and-word meaning or contrast regress on new screens | 2 | 2 | 4 | `bun run check:contrast`; focus assertions in screen tests; manual pass at 320, 390 and desktop in both themes | dev |
| R19 | BUS | Update marker becomes a modal, or relights after a declined release (AD-45) | 1 | 3 | 3 | One predicate; tests for marker text and for the declined case | dev |
| R20 | TECH | Generate or Import selects or enters the new wallet (AD-34, AD-40) | 2 | 2 | 4 | Assert `setActiveWalletId` is not called and the route stays on the chooser | dev |

### Low-Priority Risks (Score 1-2)

None identified.

### Risk Category Legend

TECH technical, SEC security, PERF performance, DATA integrity, BUS business impact, OPS operations.

---

## NFR Planning

| NFR Category | Requirement / Threshold | Risk Link | Planned Validation | Evidence Needed |
|---|---|---|---|---|
| Security | A closed lock shows a name only; no secret in state, URL or storage; every lock close, leave and remove goes through `lib/teardown.ts` | R1-R10, R13 | P0 unit and screen tests; layering and write-choke-point lint guards; source scans | vitest report, lint output |
| Reliability | A failed read is never rendered as empty or current (AD-37) | R5 | Gate tests with rejecting vault read and failed hydration | vitest report |
| Accessibility | 44px targets on coarse pointers; one h1 per screen; defined focus targets; colour never alone; contrast gate | R18 | `bun run check:contrast`; focus assertions; manual browser pass with opened screenshots | check:contrast output, screenshots |
| Maintainability | Layering and the key factory stay intact | R4, R13 | `bun run lint` (layering, query-keys, account-invalidation, money guards) | lint output |
| Performance | UNKNOWN | - | None planned | - |

**Unknown thresholds:** no chooser first-paint or card-count threshold is stated, so none is invented. This is not a blocker: the chooser makes zero ledger reads. Ask the owner only if a card-count ceiling matters.

---

## Entry Criteria

- [ ] Plan branch work agreed; stories and ACs read (done: `epics-wallet-chooser.md`)
- [ ] Each story starts from a fetched `origin/dev` (the plan branch is unmerged; build on `docs/chooser-plan-and-glossary`)
- [ ] The existing `settings-*.test.tsx` assertions are inventoried before Story 19.1 begins (R12)
- [ ] Test doubles for `getXrplClient`, the keystore and the store are confirmed available

## Exit Criteria

- [ ] All P0 tests pass; P1 at 95% or better with failures triaged
- [ ] Each of AD-31, AD-35, AD-36, AD-37, AD-39 has a test proven to fail when its rule is removed (delete the rule once, watch it fail, restore)
- [ ] No settings assertion dropped without a mapped replacement
- [ ] Four gates green; three manual browser checkpoints done and screenshots opened
- [ ] UX Key Flows 1 to 6 run as written

---

## Test Coverage Plan

Levels: **Unit** (pure modules), **Screen** (React Testing Library in jsdom), **Browser** (manual). No API level.

### P0 (Critical)

| Requirement | Test Level | Risk | Tests | Notes |
|---|---|---|---|---|
| Gate: vault read rejects -> error text and Retry; no Onboarding, no shell, no setter; Retry after a good read reaches chooser; zero-wallet success reaches Onboarding (17.1) | Screen | R5 | 3 | AD-37 proof test |
| Gate: hydration failure -> error; Retry reloads the page; Address Book not overwritten (17.1) | Screen | R5 | 2 | |
| Hooks mounted once above the route switch while the chooser shows (17.3) | Screen | R2 | 2 | AD-31 proof test |
| `touchLock(null)` extends no expiry, timer or persisted session; entered wallet's activity does (17.3) | Unit + Screen | R1 | 4 | AD-35 proof test |
| Expiry and background close-all run while the chooser shows (17.3) | Screen | R2 | 2 | |
| Chooser with several open locks: cache empty, `getXrplClient` never called, no balance, no NetworkPlate; same for `/settings` and add-wallet (17.5, 17.7, 18.3) | Screen | R4 | 4 | AD-36 proof test |
| Locked variant carries only seedId, lockId, label, entryWalletId; locked Mainnet card renders like a locked Testnet card (17.4, 17.5) | Unit + Screen | R3 | 4 | AD-43 |
| `importStoredWallet`: refuses Open Check `none`; Mainnet floor; own lock; duplicate refused before any prompt or read; rollback of lock and App PIN; result carries no Seed (18.4) | Unit | R6, R7 | 7 | AD-39 proof test |
| Source scan: no chooser-side file calls `importAndStoreWallet` (18.4) | Unit (scan) | R6 | 1 | AD-39 |
| Import UI: Seed in a ref, cleared in `finally` on success, failure and unmount; never in state, URL or storage (18.5) | Screen | R7 | 3 | |
| Remove refuses with the lock closed even if `aria-disabled` is bypassed (18.2) | Screen | R8 | 2 | |
| `removeWalletData` scope: only that wallet's entries, never the legacy lock, closes a lock only with its last view; last wallet runs `tearDownAllLocks`; re-pick keeps, else first, else `null` (18.2) | Unit | R9 | 5 | |
| `setLockAutoLock`: re-proves the Open Check, rejects below the floor over every wallet on the lock, invalidates `lockInfo` (19.3) | Unit + Screen | R10 | 4 | |

**Total P0:** ~43 test cases (some share setup), ~25-40 hours

### P1 (High)

| Requirement | Test Level | Risk | Tests | Notes |
|---|---|---|---|---|
| `route.ts`: boot rewrite always yields `/`; depth state; `leaveToChooser` honours blockers, unwinds depth, replaces `/` when depth absent; `isWalletScreen` list (17.2) | Unit | R11 | 8 | |
| Wallets key and Back land on the chooser, focus on the `Wallets` h1, no ping-pong; Lock = `tearDownLock` then `leaveToChooser` (17.6) | Screen | R11 | 4 | |
| Wallets key `aria-disabled` with visible reason under a blocker (17.6) | Screen | R11 | 1 | |
| Leave keeps the lock open, removes account-scoped data unless another open lock holds the same (network, address); notices clear (17.6) | Screen | R13 | 3 | |
| Card Lock flips the card and same-lock siblings in place; polite live region; `No Open Check` line (17.8) | Screen | R13 | 3 | |
| `groupWalletsBySeed`: one card per Seed, `createdAt` then `seedId`, stable across lock changes, entry-view rule (17.4) | Unit | R15 | 5 | |
| Open: locked -> Unlock; single-view lands in shell; multi-view returns to chooser with card open; a row opens exactly its view; Mainnet never default (17.5) | Screen | R15 | 5 | |
| Generate and Import never call `setActiveWalletId` or enter; work with every lock closed; new card focused, `Wallet added.` (18.3, 18.5) | Screen | R20 | 4 | |
| Rename: name rule (1-40 code points, case-insensitive unique, grandfathering, default-name suffix); no `rev` bump, no lock; concurrent `commitWalletEdit` keeps the name; failure keeps dialog open (18.1) | Unit + Screen | R14 | 7 | |
| Configure resolves only with an open lock else `resetToHome()`; acts on entry view; Back returns to Configure (19.1, 19.2) | Screen | R16 | 4 | |
| Settings holds only Address book, Version and updates, Remove all; one component for `/settings` and the tab, never both mounted (17.7, 19.4) | Screen | R12 | 3 | |
| Remove all reachable with no wallet, no open lock, and with a hard lock (17.7) | Screen | R17 | 2 | |
| Move each existing `settings-*.test.tsx` assertion to its new Configure test (14, 15, 17) | Process | R12 | checklist | |

**Total P1:** ~49 test cases, ~20-35 hours

### P2 (Medium)

| Requirement | Test Level | Risk | Tests | Notes |
|---|---|---|---|---|
| Update marker text, never modal or redirect, declined release does not relight, one predicate (17.7) | Screen | R19 | 3 | |
| Focus targets: h1 after leave and Remove, h2 after Add, opener after dialog, main on entry; one h1 per screen | Screen | R18 | 5 | |
| 44px targets on coarse pointers; two keys in a row not closer than their hit areas | Screen | R18 | 3 | |
| Remove dialog three bodies and `Open this wallet to remove it.` | Screen | R8 | 3 | |
| Configure plate content, UX strings, shared-lock count wording | Screen | R10 | 3 | |

**Total P2:** ~17 test cases, ~8-15 hours

### P3 (Low)

| Requirement | Test Level | Tests | Notes |
|---|---|---|---|
| Very long and emoji names on a card at 320px; 20+ cards order and scroll; reduced motion | Browser (manual) | 3-4 | Exploratory |

**Total P3:** ~4, ~2-4 hours

### Manual browser checkpoints (not automated)

1. After 17.6: chooser, Open, leave, Lock and Back at phone width, both themes.
2. After 18.5: a Mainnet-style Import flow.
3. After 19.4: UX Key Flows 1 to 6, full visual and accessibility pass.

Each follows `docs/agents/verifying-your-work.md`, and the screenshots are opened and looked at.

---

## Execution Order

- **Smoke (per story, < 1 min):** the story's own new test file.
- **P0 (< 5 min):** Gate, AD-31, AD-35, AD-36, AD-43 locked card, `importStoredWallet`, Remove, `setLockAutoLock`.
- **P1 and P2 (< 10 min):** the rest of vitest.
- **PR:** all four gates (`bun run lint`, `build`, `test`, `check:contrast`). The suite is jsdom-only and well under 15 minutes. No nightly or weekly job is needed.

---

## Resource Estimates

| Priority | Cases | Hours (range) |
|---|---|---|
| P0 | ~43 | 25-40 |
| P1 | ~49 | 20-35 |
| P2 | ~17 | 8-15 |
| P3 | ~4 | 2-4 |
| **Total** | **~113** | **~55-95** (plus 4-6 for browser checkpoints) |

**Test data and doubles:** a fake store seeded with wallets and open locks (single-view, multi-view, shared legacy lock, Mainnet and Testnet); a rejecting vault read; a mocked `getXrplClient`; a keystore with injectable failures for the rollback test.
**Tooling:** vitest, React Testing Library, the existing `scripts/check-*.mjs` guards. Consider adding a scan for AD-36 later (deferred in the spine).

---

## Quality Gate Criteria

- P0 pass rate 100%; P1 >= 95%; P2/P3 informational.
- R1 to R12 mitigations merged before Story 19.4 (the last story).
- The five AD tests (31, 35, 36, 37, 39) are proven to fail when their rule is removed.
- Security scenarios 100% covered; business logic >= 70% statements on the new modules (`route.ts`, `wallet-groups.ts`, `wallet-name.ts`, keystore additions, teardown scopes).
- Four gates green; browser checkpoints done.
- Planned NFR evidence exists, or `nfr-assess` records CONCERNS.

---

## Mitigation Plans

### R5: Failed read shown as empty (Score 6)
**Strategy:** Gate resolves exactly one of error, empty, ready. **Verification:** the AD-37 test fails if the `.catch` or the hydration check is removed. **Status:** Planned.

### R6/R7: Import weaker than Generate, Seed leaks (Score 6)
**Strategy:** one writer in the keystore shared with `createStoredWallet`; the Seed is a parameter only. **Verification:** the AD-39 tests plus the source scan; delete the Open Check refusal once and watch the test fail. **Status:** Planned.

### R1/R2: Lock outlives its timer (Score 6)
**Strategy:** hooks mount once in the app shell; `touchLock(null)` extends nothing. **Verification:** AD-31 and AD-35 tests fail when either is removed. **Status:** Planned.

### R12: Settings coverage lost (Score 6)
**Strategy:** before 19.4, list every assertion in `settings-locks`, `settings-edit-checks`, `settings-reveal`, `settings-network-views` and the per-wallet parts of `settings-full-reset`, and name the Configure test that now holds it. **Verification:** the list is attached to the 19.4 story and every line is ticked. **Status:** Planned.

---

## Assumptions and Dependencies

### Assumptions

1. jsdom `history` is faithful enough for the unwind unit tests; the real Back is checked by hand after 17.6.
2. The store, keystore and `getXrplClient` can be doubled without new infrastructure.
3. The lint guards stay green as chooser files are added (layering, query-keys).

### Dependencies

1. Story 18.4 (keystore) before 18.5 (Import UI).
2. Stories 17.5 and 17.6 merge together.
3. Story 19.4 last.

### Risks to Plan

- **Risk:** a P0 test written after the code passes without proving anything. **Impact:** the rule is untested in practice. **Contingency:** the delete-the-rule-once check in the exit criteria.

---

## Follow-on Workflows (Manual)

- `/bmad-testarch-atdd` to write failing P0 tests before 17.1, 17.3, 18.2 and 18.4 (not auto-run).
- `/bmad-testarch-automate` once more of the epic exists.

---

## Interworking & Regression

| Component | Impact | Regression scope |
|---|---|---|
| `Gate` (`App.tsx`) | Gets error and shell outcomes | `src/__tests__/gate-migration.test.tsx` |
| `lib/route.ts` | Route type, depth state | `src/lib/__tests__/route.test.ts` |
| `lib/teardown.ts` | New scopes `leaveWallet`, `removeWalletData` | `src/lib/__tests__/teardown.test.ts` |
| `keystore.ts` | `importStoredWallet`, `renameWallet` | `src/lib/crypto/__tests__/keystore.test.ts` |
| `Unlock` | Reached from Open | `src/pages/__tests__/unlock-wallet.test.tsx`, `unlock-hard-lock-reset.test.tsx` |
| `SettingsTab` | Loses per-wallet items | all `src/pages/tabs/__tests__/settings-*.test.tsx` (see R12) |

---

## Appendix

### Related Documents

- Epics: `_bmad-output/planning-artifacts/epics-wallet-chooser.md` (Epics 17, 18, 19)
- Spec: `_bmad-output/specs/spec-wallet-chooser/SPEC.md`
- Architecture: `_bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-chooser-2026-10-19/ARCHITECTURE-SPINE.md`
- UX: `_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-10-19/EXPERIENCE.md`

**Generated by:** BMad TEA Agent - Test Architect Module
**Workflow:** `bmad-testarch-test-design`
