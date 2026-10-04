---
title: '"Remove everything" removes everything, and locking removes nothing else (Epic 6: 6.1, 6.2)'
type: 'bugfix'
created: '2026-10-04'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'cd58717'
context:
  - '{project-root}/docs/agents/INDEX.md'
  - '{project-root}/docs/agents/keys-and-secrets.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-2026-09-12/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-2026-09-12/GAP-REGISTER.md'
---

## Intent

**Problem.** Two defects, one mistake about which clear set a thing belongs to
(AD-16; G-13, G-14).

- **G-13.** There are two IndexedDB owners, and "remove everything" cleared one.
  The hard-lock reset (`Unlock.tsx` `handleReset`) wiped the vault and reloaded,
  but `xrpl-wallet-app-state` kept every wallet label and address, the Address
  Book, auto-lock and declined updates. `SettingsTab.tsx` `handleFullReset`
  emptied `wallets`/`activeWalletId` in memory and left the other three fields
  on disk.
- **G-14.** Every lock and every single-wallet removal deleted every Cache
  Storage key. Cache Storage holds only the Workbox precache (`vite.config.ts`
  has `globPatterns` and no `runtimeCaching`), so this protected nothing and
  broke offline start-up (FR-52, US-9) and the retained previous precache (US-8).

**Approach.** `lib/teardown.ts` names the two sets in code. Account data at rest
is a registry, `PERSISTED_ACCOUNT_DATA` (vault, app store); the in-memory part
is the query cache. The shell is `clearShell()`, called only by
`tearDownAllLocalState`. `clearCachedAccountData`, used by lock and
single-wallet removal, clears the query cache only. The app store gains
`clearPersistedAppState()`. It resets the in-memory persisted slice to the
store's one defaults object first, then awaits deleting the key. A test scans
`src/` for persistence APIs and fails on any owner not in the registry.

## Boundaries & Constraints

**Always:** the vault is still wiped by every full reset; Story 6.1 adds to the
clear set and removes nothing from it, so the shell is still cleared on full
reset. The query cache is still cleared on every lock and removal. Each new
guard has a test that fails when the guard is removed. A failed clear fails
closed: no reload as though the device were clean.

**Never:** no call site clears store fields itself. Lock and single-wallet
removal do not touch Cache Storage. Nothing outside AD-16's two sets changes.

## I/O & Edge-Case Matrix

| Path | Vault | App store (disk) | Query cache | Sockets | Shell (Cache Storage) |
|---|---|---|---|---|---|
| Lock (any lock path, via `useClearCacheOnLock`) | kept | kept | **cleared** | kept | **kept** (was deleted) |
| Remove one wallet (Settings) | that wallet's entry (`removeWallet`) | wallets re-listed | **cleared** | kept | **kept** (was deleted) |
| Hard-lock reset (Unlock) | **wiped** | **cleared** (was kept) | cleared | closed | cleared |
| "Erase everything" (Settings) | **wiped** | **cleared** (3 of 6 fields were kept) | cleared | closed | cleared |
| Full reset, then `lock()` or any setter | — | stays defaults, never old values | — | — | — |
| Full reset, one clear throws | others still attempted | still cleared | cleared | closed | cleared, then **rejects**; the screen shows `RESET_INCOMPLETE_MESSAGE` and does not reload |
| Cache API unavailable | — | — | — | — | quietly skipped (the shell holds no account data) |

## Code Map

- `src/lib/teardown.ts` contains the two sets: `PERSISTED_ACCOUNT_DATA`,
  `tearDownAllLocalState` (all-attempt, aggregate rethrow),
  `clearCachedAccountData` (query cache only, now synchronous), `clearShell`,
  and `RESET_INCOMPLETE_MESSAGE`.
- `src/store/app-store.ts` adds `APP_STATE_STORAGE_KEY`, `PERSISTED_DEFAULTS`
  (shared by the initial state and the reset), a typed `partialize`, and
  `clearPersistedAppState()`.
- `src/pages/Unlock.tsx` `handleReset`: try teardown; on failure it reports and
  does not reload. The dialog copy names the address book and settings.
- `src/pages/tabs/SettingsTab.tsx` `handleFullReset`: no per-field clears; on
  failure it reports and does not reload; it always locks. `handleRemove` gets
  the corrected comment. The dialog copy names the address book and settings.
- `src/hooks/useClearCacheOnLock.ts`: the docstring is corrected. It says those
  reads were never in Cache Storage, so the deletion should not be restored.
- `src/lib/__tests__/teardown.test.ts` covers G-13, G-14 and the AD-16
  registration scan (11 tests).
- `src/pages/__tests__/unlock-hard-lock-reset.test.tsx` covers the hard-lock
  reset end to end with the real page, teardown and store, plus its failure path.
- Docs: `docs/decisions.md` gets a new §13 and a narrowing note on guardrail #7.
  `docs/agents/keys-and-secrets.md` replaces the lock rule with a "Never clear
  the SW cache on lock" rule and a registration rule. The US-8 mechanism
  sentence in `app-versioning-and-updates.md` is corrected. Each of these texts
  mandated or described the G-14 defect.

## Tasks & Acceptance

**6.1, AC1.** *Given* the two IndexedDB owners, *when* `tearDownAllLocalState`
runs, *then* the app-store key is cleared as part of the account-data set, and
`wallets`, `addressBook`, `autoLockMinutes` and `declinedUpdateVersions` do not
survive. **Met**: teardown.test "leaves no wallet label…" and "removes the
persisted key itself"; browser pass.

**6.1, AC2.** *Given* `handleReset` / `handleFullReset`, *when* the operator
takes either path, *then* no wallet label, address or Address Book entry remains
after the reload. **Met**: unlock-hard-lock-reset.test, and the browser pass on
both paths (below).

**6.1, AC3.** *Given* AD-16, *then* `lib/teardown.ts` owns the store clear, not
the call sites, and the two sets are distinguishable in code. **Met**:
`PERSISTED_ACCOUNT_DATA` / `clearShell`; the per-field clears are removed from
Settings; the registration scan is a gate.

**6.1, AC4.** *Given* the vault is already wiped, *then* that remains true.
**Met**: teardown.test "still wipes the vault, the query cache, the sockets and
the shell".

**6.2, AC1.** *Given* the lock hook, *when* the app locks, *then* the precache
is untouched and the query cache is still cleared. **Met**: teardown.test
`clearCachedAccountData` cases; browser pass, where the precache had 14 entries
before and after the lock.

**6.2, AC2.** *Then* the hook docstring is corrected and says those reads were
never in Cache Storage. **Met.**

**6.2, AC3.** *When* the app is locked and reopened with no network, *then* it
renders, and the update flow still has its precache. **Met**: browser pass. It
reloaded offline to the Unlock screen and unlocked offline by PIN. The precache
was intact (14 entries).

**6.2, AC4.** *When* a single wallet is removed, *then* the shell survives.
**Met**: browser pass, 14 entries before and after the removal.

## Decisions (made unattended, for Otavio to check)

1. **A full reset still clears the shell.** AD-16 says the shell "survives every
   lock". A reset is not a lock, and Story 6.1 says it "removes nothing" from
   the clear set. The reload re-fetches the shell, so an *offline* full reset
   leaves an app that cannot start until the device is back online. The
   behaviour is unchanged from before. If a reset should also keep the shell,
   that is a one-line change in `tearDownAllLocalState`.
2. **A full reset also resets the network preference to Testnet.** The whole
   persisted key is cleared, and `network` lives in it. "Remove everything" was
   read literally.
3. **A partial teardown is reported and does not reload.** Every clear is
   attempted. Any failure rethrows (`AggregateError`), and both reset screens
   show `RESET_INCOMPLETE_MESSAGE` ("…Reload the app and reset again before
   handing this device over.") instead of reloading. Before this change, a vault
   failure was an unhandled rejection with no message. The in-memory store may
   already be at defaults at that point, so the screen behind the message can be
   onboarding. A reload shows the device's true state.
4. **Both reset dialogs now name the address book and settings.** They now say
   "…along with the address book and settings". They previously named only
   wallets, seeds and cached data, so the copy now matches what is cleared.
5. **Single-wallet removal keeps the Address Book.** The Address Book is
   device-level, not per wallet, and the removal path is untouched apart from
   the shell. Recorded because someone could reasonably expect otherwise.
6. **The docs that mandated G-14 were corrected in the same change.** These were
   guardrail #7 (a narrowing note pointing to the new §13), `keys-and-secrets.md`
   and US-8's mechanism sentence. Treated as in scope rather than drift: the
   story's own aim is "so a future reader does not restore the deletion", and
   those three texts told a reader to do exactly that.

## Self-review triage

| Finding | Verdict |
|---|---|
| Deleting the key alone lets `persist` rewrite old values on the next `set()` (`lock()` is called on both paths) | **Real, fixed**: memory is reset first. Pinned by the test that calls `lock()` after teardown (mutation: no in-memory reset → fails). |
| `persist.clearStorage()` returns void; a reload could beat the delete | **Real, avoided**: `idbDel` is awaited directly. |
| The defaults `setState` write and the `idbDel` could race | **Checked**: both go through idb-keyval's single `dbp.then`, so the readwrite transactions are created in order. Even if they were not, only defaults could be written. |
| One failing clear used to abort the rest | **Real, fixed**: every clear is attempted, then the failures are rethrown together (mutation-checked both ways). |
| A call site reloading over a failed teardown | **Real, fixed**: try/catch on both screens; the Unlock side is pinned by a component test (mutation: swallow and reload → fails). The Settings side is not component-tested (gap below). |
| Duplicate failure copy in two pages | Fixed: one exported constant. |
| `app-store.ts` `lock()` comment says the query cache "is cleared by the Main view's lock handler" (actually `useClearCacheOnLock`) | Pre-existing, outside the touched lines. Reported, not fixed (INDEX rule 5). |
| Going offline after unlock logs an uncaught `Could not reach the Testnet network…` page error | Pre-existing (connection layer, Epic 8 area). The screen itself reports each failed read correctly. Reported, not fixed. |

## Verification

**Gates** (on the final tree): `bun run lint`, `bun run build`, `bun run test`
(37 files, 458 tests, after rebasing onto `b23eb74`) and
`bun run check:contrast` all exit 0.

**Mutation checks** (each reverted afterwards):

| Mutation | Result |
|---|---|
| Registry entry for the app store made a no-op | 3 teardown tests fail |
| `clearPersistedAppState` skips the in-memory reset | 1 fails (the `lock()`-after test) |
| `clearPersistedAppState` skips `idbDel` | 2 fail |
| `clearCachedAccountData` also clears the shell | 1 fails |
| Teardown stops at the first failing clear | 1 fails |
| Teardown swallows failures | 1 fails |
| Full reset stops clearing the shell | 1 fails |
| Unlock `handleReset` swallows the failure and reloads | 1 Unlock test fails |
| Unlock `handleReset` skips teardown | 2 Unlock tests fail |

**Browser pass, 2026-10-04.** Production build of this branch (based on
`cd58717`, uncommitted tree, built before the final edit — which changed only
the wording of the reset-failure message, a string the pass never rendered),
served with `vite preview --port 5174`. The pass
used headless Playwright Chromium (1.49) in a fresh, isolated context with a CDP
virtual authenticator (ctap2, internal, UV, PRF), on Testnet, with throwaway
wallets only. The service worker was confirmed controlling before any step. The
precache key was `workbox-precache-v2-http://localhost:5174/`, with 14 entries.

| Step | Observed |
|---|---|
| Wallet A created, funded by the in-app faucet (100 XRP) | balance readout 100 / spendable 99 |
| Wallet B and a throwaway C added; C removed | precache 14 entries before and after the removal (**6.2 AC4 met**) |
| 20 XRP A → B, validated | Address Book gained `rKxP4Mk6…`; persisted key held both wallets and the entry |
| Lock (header button) | precache 14 → 14 (**6.2 AC1 met**) |
| Offline, reload | Unlock screen rendered from the precache; PIN unlock worked offline; each read showed its failure inline (**6.2 AC3 met**) |
| 8 real wrong PINs (backoff waited out, ~35 s) | hard-lock message shown |
| Hard-lock reset → "Erase and reset" | reload to onboarding. Persisted key holds `wallets: [], activeWalletId: null, addressBook: [], autoLockMinutes: 5, declinedUpdateVersions: []`. Before: 2 wallets and 1 Address Book entry (**6.1 AC2 met, Unlock path**) |
| New wallet, auto-lock set to 30, Settings → "Erase everything" | reload to onboarding. Persisted key back to the same defaults; before: 1 wallet and `autoLockMinutes: 30` (**6.1 AC2 met, Settings path**) |

After a reset the key holds the defaults rather than being absent. The
post-teardown `lock()` and the next load's hydration write the defaults. No
earlier value survives.

**Screenshots** (session scratchpad, not the repo). Every one was opened and
judged. Flow: `01-funded-A` (100 XRP, Live), `02-settings-two-wallets`,
`03-sent-A-to-B` (Validated), `04-locked-offline-reload` (Unlock, offline),
`05-unlocked-offline` (each read failure reported inline, no figure),
`06-hard-locked`, `07-hard-lock-reset-dialog`, `08-after-hard-lock-reset`
(onboarding), `09-settings-reset-dialog` and `10-after-settings-reset`
(onboarding). The two changed dialogs were captured at 320, 390 and 1280 px, in
light and dark, which is all 12 combinations. Text wraps cleanly with no
clipping, both buttons are reachable at every width, and the page does not
scroll horizontally. `zz-failure.png` comes from a superseded run, where the
script's own wait condition was wrong; it shows a working, funded Balances
screen and is not evidence of anything.

**Gaps, stated plainly.**
- The reset-failure path (`RESET_INCOMPLETE_MESSAGE`) was exercised only in the
  Unlock component test with a forced vault failure. It was not exercised in a
  browser, and not on the Settings screen at all.
- `declinedUpdateVersions` was not populated in the browser, because declining
  needs a newer release. Its clearing is covered by the unit test.
- The Settings-path "Erase everything" ran with an empty address book (that
  wallet had sent nothing), so a real Address Book entry was cleared in the
  browser only on the hard-lock path. The Settings path's address-book clearing
  rests on the shared teardown and its unit test, which calls `lock()` after
  teardown.
- The browser build predates the rebase onto `b23eb74` and the final wording
  edit to the failure message.
- The installed-PWA (home-screen) case was not exercised. Offline start-up was
  verified in a browser tab under the controlling service worker.
