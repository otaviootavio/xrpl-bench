---
title: 'Settings reduced to app-level'
type: 'feature'
created: '2026-10-28'
status: 'done'
baseline_revision: '0b50fe87b2683490fcd386f819da66c1d2982f14'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-19-context.md'
  - '{project-root}/docs/agents/INDEX.md'
  - '{project-root}/docs/agents/verifying-your-work.md'
  - '{project-root}/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-chooser-2026-10-19/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-10-19/EXPERIENCE.md'
  - '{project-root}/_bmad-output/specs/spec-wallet-chooser/stories/14-configure-screen-shell-checks-and-seed-plates.md'
  - '{project-root}/_bmad-output/specs/spec-wallet-chooser/stories/15-configure-remaining-plates.md'
  - '{project-root}/_bmad-output/specs/spec-wallet-chooser/stories/16-auto-lock-on-the-checks-plate.md'
warnings: ['oversized']
deferred:
  - summary: >-
      The "never mounted together" assertion for the Settings tab and `/settings` is weaker than before (the old test spied on the Settings component; the replacement checks the wallet content is absent and exactly one Version heading), and a few new assertions read source text or a module's export list.
    evidence: |-
      With one component, `AppSettings`, a double mount shows two Version headings, which the test would catch; a mount counter on `AppSettings` would pin it directly.
    location: >-
      src/components/__tests__/chooser-settings.test.tsx, src/pages/__tests__/app-settings.test.tsx, src/lib/__tests__/configure-launch.test.ts
    severity: low
  - summary: >-
      `TaskScreen` still defaults its back label to `Settings`, now unused by the app, and `two-device-sign.test.tsx` depends on it; `CLAUDE.md`'s prose "All twelve epics are built; the passkey-signing plan above is the one open item" and the passkey-signing row's "Planned, not built" are stale next to the sprint tracker.
    evidence: |-
      Both predate this story (the passkey plan's epics are done in the tracker); correcting the owner's planning table is the owner's call.
    location: >-
      src/components/wallet/TaskScreen.tsx, CLAUDE.md
    severity: low
  - summary: >-
      Historical text in `docs/decisions.md` (10.2, 11, 15) and `docs/sprints/*` still names `SettingsTab`; the full real-browser pass and UX Key Flows 1 to 6 for the whole chooser plan are not run.
    evidence: |-
      Kept as the record of what was true when written. The browser pass is this story's done checkpoint and is run by the orchestrator.
    location: >-
      docs/decisions.md, docs/sprints/
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** The Settings tab inside a wallet still carries per-wallet items (the Wallets plate with Use this wallet, Reveal seed, Edit checks, Use on {Network}, Let another wallet sign, the control note, master key, two-device signing, Node, per-wallet Remove and an Add wallet key; the Security plate's auto-lock and Lock now), all now available elsewhere: Chooser (Open, Add, Rename, Lock, Remove), Configure (checks, auto-lock, Seed, control, networks, Node, two-device). Per-wallet controls live in two places, and the Settings tab and `/settings` are two different components.

**Approach:** The last story of the epic, and the only one that deletes working entry points. Settings, from the Chooser (`/settings`) and from inside a wallet (the Settings tab), becomes ONE component, `AppSettings`, holding the Address book, Version and updates, and Remove all wallets from this device, and nothing else. Before anything is deleted, every Settings assertion to be deleted is mapped to a Configure or Chooser test, and the mapping list is attached to this story. A Settings test is deleted only when its mapped counterpart exists and passes.

## Boundaries & Constraints

**Always:** **Step 1, the mapping (do this first and commit nothing deleted before it is complete).** Enumerate every `it(` (and `it.each` case) in `src/pages/tabs/__tests__/settings-edit-checks.test.tsx`, `settings-reveal.test.tsx`, `settings-network-views.test.tsx`, `settings-locks.test.tsx`, and the Settings-launch or per-wallet assertions in `pin-dialog.test.tsx`, `src/pages/__tests__/create-entry-points.test.tsx`, `src/__tests__/locked-no-ledger-request.test.tsx` and any other test that mounts `SettingsTab` or drives a per-wallet Settings control. For each, record in the `## Test Mapping` section of THIS story file one row: the Settings test, then one of: `stays` (Address book, Version, Remove all, app-level), `mapped -> <file> :: <test title>` (an existing Configure or Chooser test that asserts the same behaviour), or `missing -> written` (no counterpart existed; you wrote it BEFORE deleting). Known gaps from earlier stories to close as `missing -> written`: the master-key refusal and ledger-read rules driven through Configure, the two-device build/offline/busy-lock flows, the Node save flow through the Configure Node plate, the `Use on Mainnet` dialog's Escape and outside-press dismissal with focus return, the per-wallet Remove cases (each covered by a Chooser Remove test: name it), Lock now (the Chooser card Lock and header Lock tests: name them), `Use this wallet` (Chooser Open) and Add wallet from Settings (the Chooser Add key). **Step 2, the deletion.** `Main`'s Settings tab panel renders `AppSettings` directly and `src/pages/tabs/SettingsTab.tsx` is deleted (one component serves the tab and `/settings`, never both mounted). `AppSettings` keeps exactly: Address book, the plate holding Remove all wallets from this device (with its confirm dialog and `tearDownAllLocalState`), Version and updates; no per-wallet item, no Lock now, no auto-lock, no Add wallet; it works with no wallet and no open lock. Delete the code only the deleted Settings content used, but not what other screens still use (`RevealSeedControl`, `OtherNetworksPlate`, `reveal-copy`, `check-words`). `configure-launch.ts`: with the Settings launches gone, task screens are opened only from Configure; remove the one-shot launch marker and the `Settings` fallback label in `WalletScreens` (the label is always `Back to Configure`), keeping the focus-return behaviour and the blocked-navigation reset. **Docs and tracking:** update `docs/decisions.md` where it describes the Settings tab's per-wallet content, the `Planned work` table in `CLAUDE.md`, and `_bmad-output/implementation-artifacts/sprint-status.yaml` (stories 17.1 to 19.4 and epics 17 to 19 done). Keep `check:contrast` green; no `:focus` styling, no `outline-none`, no new colour token. All four gates green.

**Never:** Do not delete a Settings test whose row in the mapping is not `stays` or a passing counterpart. Do not weaken or drop a Settings test that stays (address book, full reset, update). Do not delete or restyle `RevealSeedControl`, `OtherNetworksPlate` or any Configure plate. Do not remove Remove all. No change to keystore, teardown or policy behaviour.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Settings from the Chooser | `/settings` | Address book, Version, Remove all, nothing else | n/a |
| Settings tab in a wallet | open wallet, Settings tab | the same component and content | n/a |
| No wallet open | all locks closed, even a hard-locked PIN | Remove all works | as shipped |
| Per-wallet items | either surface | none: no Use this wallet, Reveal seed, Edit checks, Use on, Let another wallet sign, Remove wallet, Lock now, auto-lock, Add wallet | n/a |
| Both mounted | tab and `/settings` | never both | n/a |
| Task screens | from Configure | label `Back to Configure`, Back returns to Configure | n/a |
| Deleted test | any Settings per-wallet test | its mapped counterpart exists and passes | n/a |

</intent-contract>

## Code Map

- `src/pages/tabs/SettingsTab.tsx` (deleted) -- the per-wallet Wallets plate, Security plate (auto-lock, Lock now) and the Reveal, Mainnet-network and Remove dialogs.
- `src/pages/AppSettings.tsx`, `src/pages/SettingsScreen.tsx` -- the app-level plates (Story 7); `src/pages/Main.tsx` -- the six tab panels.
- `src/lib/configure-launch.ts`, `src/pages/WalletScreens.tsx`, `src/components/wallet/TwoDeviceSign.tsx` -- launch marker and `Settings` back label removed.
- Tests: `settings-address-book` and `settings-full-reset` stay; the four per-wallet `settings-*` files and the Settings-launch cases are mapped and deleted; counterparts in `configure-*.test.tsx`, `chooser.test.tsx`, `AppHeader.test.tsx`, `chooser-settings.test.tsx`.
- `docs/decisions.md`, `CLAUDE.md`, `_bmad-output/implementation-artifacts/sprint-status.yaml`.

## Tasks & Acceptance

**Execution:**
- This story file -- the `## Test Mapping` section, complete BEFORE deletion
- New counterpart tests for every `missing` row -- written and passing first
- `Main.tsx`, `SettingsTab.tsx` (delete), `AppSettings.tsx` -- one Settings component
- `configure-launch.ts`, `WalletScreens.tsx`, `TwoDeviceSign.tsx` -- drop the Settings fallback
- Delete the Settings tests whose rows are mapped; update the tests that mounted `SettingsTab`
- `docs/decisions.md`, `CLAUDE.md`, `sprint-status.yaml`

**Acceptance Criteria:**
- Given Settings, from the Chooser or from inside a wallet, then it holds the Address book, Version and updates and Remove all wallets from this device and nothing else, with no per-wallet item, no Lock now and no auto-lock.
- Given Settings is opened with no wallet and no open lock, including for a hard-locked user, then Remove all works.
- Given the Settings tab and `/settings`, then one component serves both and never both are mounted.
- Given this story deletes entry points, then every deleted Settings assertion has its mapped test, and the mapping list is attached to this story file.
- All four gates are green.

## Test Mapping

Written and passing BEFORE any deletion; `SettingsTab.tsx` and the four `settings-*` test files were deleted only after every row below held. File paths are relative to `src/`. Counterparts are in `pages/tabs/__tests__/` unless a path is given.

### Deleted Settings tests (42, all `mapped`) and the Settings-launch tests removed from Configure files (3)

| # | Settings test (deleted) | Row |
|---|---|---|
| **settings-edit-checks.test.tsx** | | |
| 1 | is offered only for a Wallet whose lock is open | mapped -> configure-edit-checks :: the Checks plate has one Edit checks key, for this wallet only (and `components/__tests__/configure-shell` :: a closed lock: resets to the chooser and renders nothing wallet-scoped) |
| 2 | the auto-lock edit passes the prompts, so the Open Check can be re-passed | mapped -> configure-auto-lock :: the next attempt clears the refusal; a success shows the new minutes and edits that lock only (asserts `setLockAutoLock` called with `{ prompts }`) |
| 3 | after a lock change: the new lock opens with its session, the old one closes | mapped -> configure-edit-checks :: after a lock change: the new lock opens with its session, the old one closes |
| 4 | leaving the shared legacy lock does not close it | mapped -> configure-edit-checks :: leaving the shared legacy lock does not close it |
| 5 | an auto-lock-only edit updates that lock's window and starts no session and closes no lock | mapped -> configure-edit-checks :: an auto-lock-only edit updates that lock's window and starts no session and closes no lock |
| 6 | closes the removed old lock even when a later step fails | mapped -> configure-edit-checks :: closes the removed old lock even when a later step fails |
| **settings-reveal.test.tsx** | | |
| 7-14 | the dialog names the check (8 `it.each` cases: PIN Open Check, legacy lock, passkey Open Check, either lock, no Open Check, PIN Signing Check, passkey Signing Check, Passkey-Derived Seed) | mapped -> configure-reveal :: Configure reveal seed: the dialog names the check (the same 8 cases) |
| 15 | shows the seed on ok | mapped -> configure-reveal :: shows the seed on ok |
| 16 | toasts on a cancelled check and keeps the seed hidden | mapped -> configure-reveal :: toasts on a cancelled check and keeps the seed hidden |
| 17 | toasts the described failure on a wrong credential and keeps the seed hidden | mapped -> configure-reveal :: toasts the described failure on a wrong credential and keeps the seed hidden |
| **settings-network-views.test.tsx** | | |
| 18 | offers only the networks a Seed has no view on, each named by wallet and network | mapped -> configure-network-views :: offers one key per network the Seed has no view on, and counts only this Seed's views |
| 19 | offers nothing for a Seed that already has every network's view | mapped -> configure-network-views :: says so in one line, with no keys, when the Seed is on every network |
| 20 | adds the view without changing the active Wallet | mapped -> configure-network-views :: adds a Testnet view in one step, refreshes the wallets, keeps the selection and says so |
| 21 | says only the view goes when the Seed has another view, and the seed goes when it has none | mapped -> `pages/__tests__/chooser.test` :: the dialog body when %s (a sibling view remains / the only view of the Seed) |
| 22 | asks before adding the Mainnet view: nothing is added until the dialog is confirmed | mapped -> configure-network-views :: asks before adding the Mainnet view, with the shipped words; nothing is added until confirmed |
| 23 | Cancel on the Mainnet dialog adds nothing | mapped -> configure-network-views :: Cancel adds nothing and returns focus to the opener |
| 24 | a non-mainnet target stays a single step | mapped -> configure-network-views :: adds a Testnet view in one step, ... (asserts no Mainnet dialog) and :: shows the error message when adding fails (Devnet) |
| 25 | keeps one primary key per row and groups the rest under a label, Remove last | mapped -> `pages/__tests__/chooser.test` :: an open card: one Remove key per network row, danger, named for its network; the card has no other (the group layout dies with the Settings row) |
| 26 | gives two inactive rows distinct primary-action names | mapped -> `pages/__tests__/chooser.test` :: Open: on a locked card selects and enters the Seed's entry view / on a network row enters exactly that view (Open keys named per card and view) |
| 27 | Cancel on the Mainnet dialog returns focus to its opener | mapped -> configure-network-views :: Cancel adds nothing and returns focus to the opener |
| **settings-locks.test.tsx** | | |
| 28 | shows a closed Wallet as its name only: no address, no Reveal, no Remove | mapped -> `pages/__tests__/chooser.test` :: the cards: a locked card shows its name, the Locked lamp word, `Locked.` and Open; no address, network or stamp, and :: Remove: a locked card: Remove is aria-disabled, ... |
| 29 | mounts the master-key control only for a Wallet whose lock is open | mapped -> `components/__tests__/configure-shell` :: a closed lock: resets to the chooser and renders nothing wallet-scoped, and configure-master-key :: a wallet that holds the master key shows the plate with the master key control ... |
| 30 | "Lock now" closes only the active Wallet's lock | mapped -> `pages/__tests__/chooser.test` :: the Lock key: goes through tearDownLock with the group lockId, flips the card, announces, focuses the h1, and `components/__tests__/AppHeader.test` :: Lock tears the lock down, then leaves, in that order |
| 31 | Remove closes that lock when no Wallet is left on it, and leaves the other lock open | mapped -> `pages/__tests__/chooser.test` :: Remove: confirm: removeWallet, the lock the keystore deleted closes, the cache loses it, ... |
| 32 | Remove keeps the lock open while another Wallet still uses it | mapped -> `pages/__tests__/chooser.test` :: Remove: a sibling view: the Seed's card stays, its lock stays open, ... |
| 33 | Remove never closes the legacy lock | mapped -> `lib/__tests__/remove-wallet-data.test` :: never closes the legacy lock in the per-removal step |
| 34 | a closed Wallet gets neither the two-device entry nor "Let another wallet sign" | mapped -> `components/__tests__/configure-shell` :: a closed lock: resets to the chooser ... (no Configure, so no plate) |
| 35 | a Wallet that operates another Account shows the controlled note and cannot hand out control | mapped -> configure-master-key :: a wallet that operates another account shows the ControlledNote with the ledger status, and no Let another wallet sign key |
| 36 | a closed controlled Wallet shows no note: its key address stays hidden | mapped -> `components/__tests__/configure-shell` :: a closed lock ... and chooser :: a locked card shows ... no address |
| 37 | Reveal uses the key of THAT Wallet's lock, not the active Wallet's | mapped -> configure-reveal :: asks the wallet's own check with its own lock key |
| 38 | "Lock now" is not offered for a lock with no Open Check | mapped -> `pages/__tests__/chooser.test` :: the Lock key: no Open Check: no key, the reason is shown, and AppHeader :: open lock with no Open Check has no Lock key |
| 39 | auto-lock: a refusal shows the policy's reason and changes nothing | mapped -> configure-auto-lock :: a refusal shows the policy's reason as persistent alert text, reverts, and writes nothing |
| 40 | auto-lock: a success edits the active lock only and updates the store | mapped -> configure-auto-lock :: the next attempt clears the refusal; a success shows the new minutes and edits that lock only |
| 41 | Remove closes the lock's key in openLocks when no Wallet uses the lock any more | mapped -> chooser :: Remove: confirm: removeWallet, the lock the keystore deleted closes, ... |
| 42 | Remove keeps the lock open while another Wallet still uses it (second describe) | mapped -> chooser :: Remove: a sibling view: the Seed's card stays, its lock stays open, ... |
| **Settings launches removed from Configure test files** | | |
| 43 | configure-edit-checks :: Edit checks opened from the Settings tab: keeps the label `Settings` and Back returns to the tab | mapped -> configure-edit-checks :: opens the shipped screen at its path, with the label `Back to Configure`, and `pages/__tests__/wallet-screens.test` :: %s is always labelled `Back to Configure` |
| 44 | configure-edit-checks :: a Configure launch does not leak into a later Settings launch | mapped -> `lib/__tests__/configure-launch.test` :: keeps no one-shot marker: the Back label is always `Back to Configure` (the marker that leaked no longer exists) |
| 45 | configure-two-device :: opened from the Settings tab the label stays `Settings` | mapped -> configure-two-device :: Sign with two devices opens its screen with `Back to Configure`; Back returns with focus on the key, and wallet-screens.test :: %s is always labelled `Back to Configure` |

### Stays (app-level, not deleted; only the mount changed from `SettingsTab` to `AppSettings`)

| # | Test | Row |
|---|---|---|
| 46-55 | settings-address-book.test.tsx (10 tests: two rows with unique keys, address once in full, tag named in words, tagless entry, "Not recorded" for network and tag, tag without network, every network's entries, human label, empty-state copy) | stays |
| 56-58 | settings-full-reset.test.tsx :: Erase everything (3 tests: locks and reloads with nothing in the persisted store, does not reload when a clear fails, unregisters every service worker and deletes every cache key) | stays |
| 59-60 | components/wallet/__tests__/two-device-sign.test.tsx :: the Configure plate entry (2 tests, renamed from "the Settings row"; the entry now needs `configureKey`) | stays |

### Gaps closed (`missing -> written` BEFORE deleting)

| # | Gap | Row |
|---|---|---|
| G1 | master-key refusal and ledger-read rules through Configure | missing -> written: configure-master-key (5 tests: no Regular Key wallet here, master off pointing to the Regular Key wallet, flow throws before anything is sent, unconfirmed result recovers only through a successful Check again, Mainnet turn-on has no phrase) |
| G2 | two-device build / offline / busy-lock flows through the Configure plate | missing -> written: configure-two-device (8 tests: errored read aria-disabled, builds a payment with window and figure, refusal text, expired return, busy lock with `Back to Configure` disabled then focus return, unconfirmed result, offline decoded fields and confirm-then-sign, offline wrong Account refused) |
| G3 | Node save flow (custom-Node field, Test and save, Use built-in Nodes) through the Configure Node plate | missing -> written: new configure-node.test.tsx (7 tests) |
| G4 | `Use on Mainnet` dialog Escape and outside-press dismissal with focus return | missing -> written: configure-network-views (2 tests; the Dialog defers an outside press to its click, so the test presses and releases on the overlay) |
| G5 | per-wallet Remove leaves the precache and the service-worker registration alone (was settings-full-reset :: Remove one wallet) | missing -> written: `pages/__tests__/chooser.test` :: removing one wallet leaves the precache and the service-worker registration alone, and does not reload |
| G6 | reveal behind a PIN Signing Check, was driven through `SettingsTab` | missing -> written: pin-dialog.test (2 reveal tests now drive `ConfigureScreen`; the source check now pins `RevealSeedControl.tsx` for `usePrompts()`) |
| G7 | Add wallet from Settings | missing -> written: create-entry-points.test (the 3 "Add wallet" flow tests and the route test now enter `/wallets/new` the way the chooser key does; the chooser Add key itself is `pages/__tests__/chooser.test` :: Add wallet from the chooser: the Add wallet key opens /wallets/new, and works with every card locked) |
| G8 | Use this wallet | covered: `pages/__tests__/chooser.test` :: Open (selects and enters the Seed's entry view) |
| G9 | per-wallet Remove cases, Lock now | covered by the chooser Remove and Lock tests named in rows 21, 25, 28, 30-33, 38, 41, 42 |
| G10 | Settings shows only the three app-level items; one component, never both mounted; Remove all with no open lock | missing -> written: new `pages/__tests__/app-settings.test.tsx` (6 tests, by the accessible names that used to exist); `components/__tests__/chooser-settings.test` keeps the `/settings` side |

### Totals

- mapped: 45 (42 deleted Settings tests, 3 deleted Settings-launch tests in Configure files)
- stays: 15 (10 address book, 3 Erase everything, 2 two-device entry)
- missing -> written: 8 rows (G1-G7 and G10). New tests: 23 for G1-G5 (5 + 8 + 7 + 2 + 1), 6 in `app-settings.test.tsx` (G10), 3 in `wallet-screens.test.tsx` (the `Back to Configure` label). Retargeted to the new surfaces: 7 (G6: 3, G7: 4). G8 and G9 are covered by existing chooser tests, named above.

## Spec Change Log

## Review Triage Log

### 2026-10-28 — Review pass
- verdicts: blind hunter 13, edge-case hunter 10, verification gap 1 plus 2 notes, intent alignment descriptive; grouped by root cause into the rows below — high 1 and low 1 (patched), low 2 and medium 1 deferred, rest false or rejected as low
- findings:
  - `[high]` `patch` The story file itself was left truncated mid-sentence by the implementation (the Always paragraph cut off, the Never, I/O matrix, Code Map and Tasks and Acceptance sections lost, the mapping sitting unclosed inside the intent contract) — the sections were restored and the contract closed before the mapping; the mapping rows are unchanged.
  - `[medium]` `patch` The replacement for the deleted "Remove one wallet" test did not pin that removing one wallet never wipes the vault holding the others, nor that the Active Wallet becomes a survivor — the chooser test mocks `wipeVault` and asserts it is not called.
  - `[low]` `defer` Weaker never-mounted-together assertion, dead `TaskScreen` default and stale `CLAUDE.md` prose, historical doc references and the browser pass — see deferred.
  - `[false]` `reject` A reload at `/wallets/:id/checks` shows `Back to Configure` while Back lands on the Chooser — `rewriteBootLocation` rewrites every path but `/` before the first render, so a task screen is never entered by a boot.
  - `[false]` `reject` The mapping rows name counterparts that may not exist — each cited counterpart title was checked against its file (escaped apostrophes and truncated titles explain the only apparent mismatches), and the 42 deleted tests' counterparts pass in the full run.
  - `[low]` `reject` Dead `renderAt` parameter, the `QrScanner` mock removed, hard-coded query keys in `configure-node.test.tsx`, mapping count wording, `useAppUpdate` comment, `app-settings` docstring — cosmetic or test-style, with the behaviours pinned.

## Verification

**Commands:**
- `bun run lint` -- expected: no errors
- `bun run build` -- expected: `tsc -b` and Vite build succeed
- `bun run test` -- expected: all pass
- `bun run check:contrast` -- expected: pass

**Manual checks (if no CLI):**
- The full real-browser pass and UX Key Flows 1 to 6, run by the orchestrator after this story.

## Auto Run Result

Status: done

- Summary: Settings, from the Chooser and from inside a wallet, is one component, `AppSettings`: Address book, Version and updates, Remove all wallets from this device, and nothing else. `SettingsTab.tsx` and its per-wallet content are deleted; the one-shot Configure launch marker and the `Settings` back-label fallback are gone (task screens say `Back to Configure`). Four `settings-*` test files (42 tests) were deleted only after each row was mapped to a Configure or Chooser counterpart (38 mapped rows, 10 gaps written first, the rest staying); the mapping is attached to this file. Docs, `CLAUDE.md` and the sprint tracker are updated.
- Files: `src/pages/Main.tsx`, `src/pages/AppSettings.tsx`, `src/pages/tabs/SettingsTab.tsx` (deleted), `src/lib/configure-launch.ts`, `src/pages/WalletScreens.tsx`, `TwoDeviceSign.tsx`, many tests (new `configure-node`, `app-settings`; extended `configure-master-key`, `configure-two-device`, `configure-network-views`, `chooser`), `docs/decisions.md`, `CLAUDE.md`, `_bmad-output/implementation-artifacts/sprint-status.yaml`.
- Review: 2 patches applied (1 high, 1 medium), 3 deferred, the rest rejected with reasons above.
- Follow-up review recommended: true. This story deleted working entry points; the mapping was spot-checked against the files but the full real-browser pass and UX Key Flows 1 to 6 are its done checkpoint and have not been run.
- Verification: `bun run lint`, `bun run build`, `bun run test`, `bun run check:contrast` pass after patches.
- Residual risk: the unrun browser pass for the whole chooser plan.
