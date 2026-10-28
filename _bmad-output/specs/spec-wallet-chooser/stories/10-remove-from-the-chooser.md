---
title: 'Remove from the chooser'
type: 'feature'
created: '2026-10-28'
status: 'done'
baseline_revision: '77140dabe53d18cbe6c4e91f7cc708916ec4fe4c'
review_loop_iteration: 0
followup_review_recommended: true
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
      The vault-write guard is held across user prompts (a passkey or PIN ceremony inside `createDerivedWallet` or `editChecks`), so a removal or create in this tab or another waits for the prompt, with no timeout or "busy" report.
    evidence: |-
      The wait is bounded by the user, the confirm key shows "Removing…" meanwhile, and the guard is not re-entrant (comment lists the wrapped functions). Moving prompts outside the guard, or `ifAvailable` with a "busy" result, would remove the wait; do it when Story 12 rewrites the import path.
    location: >-
      src/lib/crypto/db.ts, src/lib/crypto/keystore.ts
    severity: medium
  - summary: >-
      Between `setUpVaultAuth` returning and Onboarding's separate import write the vault holds a PIN and a legacy lock but no wallet; a last removal in another tab in that window would discard the PIN. `appPinExpected` is passed only by `CreateWalletFlow`, not by Onboarding's import path, and `auth.ts` passkey registration and `sealSeedUnderSigningCheck` write vault meta outside the guard.
    evidence: |-
      Needs two tabs and a narrow window. Story 12 replaces `importAndStoreWallet`: its replacement MUST be wrapped in `exclusiveVaultWrite`, take `appPinExpected`, and join the first-run PIN write into one guarded unit; wrap the two other writers then.
    location: >-
      src/pages/Onboarding.tsx, src/lib/crypto/auth.ts, src/lib/crypto/keystore.ts
    severity: medium
  - summary: >-
      The empty-device cleanup is the lock-record delete, the session clear and `discardAppPin`, three writes under the guard rather than one transaction; a crash between them leaves lock records gone and the PIN present.
    evidence: |-
      The PIN discard no longer depends on the cleanup steps, a failed discard is reported, and Onboarding offers Remove all while a PIN or count remains. One transaction across the lock records and vault meta would make it all-or-nothing.
    location: >-
      src/lib/crypto/keystore.ts, src/lib/crypto/lock.ts
    severity: low
  - summary: >-
      Settings' own Remove ignores the new `RemoveWalletResult` (a failed discard is silent there) and does not call `tearDownAllLocks`, so the legacy lock's in-memory key can stay open after the last removal from Settings; no test covers an `appPinExpected` flag at `CreateWalletFlow`'s call sites, or `removeWalletData` throwing after a successful removal.
    evidence: |-
      Story 19.4 deletes Settings' Remove; the keystore tests cover `appPinExpected`; the throwing teardown path is narrow.
    location: >-
      src/pages/tabs/SettingsTab.tsx, src/components/wallet/CreateWalletFlow.tsx, src/pages/Chooser.tsx
    severity: low
  - summary: >-
      The Remove keys' 44px size, the wrapped row at 320px and the `aria-disabled` opacity style are unverified in a browser; removing the last wallet to see first-run ask for a new PIN is also unverified end to end.
    evidence: |-
      jsdom cannot observe layout; the Gate-to-Onboarding journey is covered in pieces. Run the final browser pass.
    location: >-
      src/components/wallet/WalletCard.tsx, src/pages/Onboarding.tsx
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** A wallet can be removed only from the Settings tab inside an open wallet, through an inline handler that closes a lock and clears the whole query cache itself. The last removal leaves the App PIN, its verifier and its failure count on a handed-over device. A Remove key that is `aria-disabled` does not stop activation, so the guard must be in the handler.

**Approach:** A Remove key on the Chooser (on each network row of an open card; on a locked card, `aria-disabled` with its reason) opening a confirm dialog with three consequence bodies; a handler that re-checks the lock at call time; one teardown-owner scope `removeWalletData` that runs in `finally`; a pure active-wallet re-pick; and, when the removal leaves nothing, `discardAppPin` in the keystore, atomically with the emptiness check. Settings' own Remove stays untouched until Story 19.4. This story is security-bearing: vault-meta writes go through the keystore and `lock.ts`, never the teardown owner.

## Boundaries & Constraints

**Always:** **Keys.** Every network row of an open card has a **Remove** key (`Button variant="danger"`, visible legend `Remove`, accessible name `Remove {name} on {Network}`); a locked card has one Remove key (`aria-label` `Remove {name}`, `aria-disabled="true"`, not `disabled`) with the visible text `Open this wallet to remove it.` on the card. Placement and order per the chooser UX spine (row: Open then Remove). **Call-time guard.** The handler re-reads `wallet.lockId in useAppStore.getState().openLocks` when the key is activated and again when the dialog is confirmed, and refuses (does nothing, no dialog, no write) if the lock is closed, whatever the key's attributes say. **Dialog.** `Dialog` with `dismissOnOutsidePress`; Escape, overlay press and Back close it; title `Remove this wallet?`; body is exactly one of: (a) a sibling network view of the same Seed remains: `This removes only this one wallet. The encrypted seed stays, because the same key is still set up as another wallet on this device.`; (b) the only view of the Seed: `This app will no longer hold the encrypted seed for this wallet.`; (c) the last wallet on the device: `This is the last wallet on this device. Removing it returns the app to setup, and the App PIN is removed too.` followed by (b)'s sentence; all end with `Make sure you have your own backup — this cannot be undone from within the app.`; keys `Cancel` and `Remove wallet` (`variant="destructive"`). Reuse the shipped sentences verbatim. **Teardown.** `removeWalletData(queryClient, removed, remaining)` is added to `src/lib/teardown.ts` and is the only place a lock is closed or the cache is touched for removal: it removes the removed wallet's account-scoped entries (`removeAccountScoped`, keeping a `(network, address)` another open lock's remaining wallet still holds), closes a lock the keystore deleted with the Seed's last view (never `LEGACY_LOCK_ID` in the per-removal step), and when no wallet remains runs `tearDownAllLocks`. The Chooser handler calls it from a `finally` so the session, `activeWalletId` and caches are cleared even if a keystore step throws. No `closeLock` or `queryClient.clear` inline in a component. **Active re-pick.** One pure function `nextActiveWalletId(removedId, activeId, remainingInChooserOrder)` keeps `activeId` if still present, else the first wallet in chooser order (`groupWalletsBySeed` order), else `null`; no other code picks it. **Refresh.** After removal the store's `wallets` is refreshed from the keystore (`listWallets`) and the removed entries are gone. Focus moves to the Chooser `Wallets` h1. Success notice `Wallet removed from this device.`; with zero wallets left, Gate's empty outcome returns the app to Onboarding. **App PIN.** `lock.ts` gains `discardAppPin`: in ONE `mutateVaultMeta` transaction it deletes `pinSaltB64`, `pinVerifier`, `wrappedMasterKeyForPin`, `wrappedMasterKeyForPasskey`, `passkeyCredentialIdB64` and `rpId`, and resets `failedAttempts` to 0 and `lockedUntil` to undefined. Check these field names against `VaultMeta` in `src/lib/crypto/db.ts` before writing, and read the real `createStoredWallet`/`importStoredWallet`/`createLock` paths first. `keystore.removeWallet` calls it only when, after the removal, **no stored wallet remains and no lock record other than the legacy lock's remains**. Verified in the code: the legacy lock's record IS stored (`writeLegacyLock`, and the AD-27 migration), and removal never deletes it, so a rule of "no lock record at all" would never fire for a migrated legacy vault and the PIN would survive (breaking FR-86 for the users most likely to have one). When the removal empties the device, the legacy lock record (`lock:legacy`) is deleted in the same unit as the PIN fields (use a raw delete of that key; `deleteLockRecord` refuses the legacy id on purpose), so an emptied vault holds nothing that reads as a lock. A created-lock record left with no wallet (an orphan from a failed creation) also does not block the discard: orphan records for which no wallet remains are removed in that unit as well. **Atomicity (decided, not optional).** `createLock`/`withAppPin` write the App PIN (`pinSaltB64`, `pinVerifier`) in a separate `mutateVaultMeta` transaction BEFORE the lock record and the wallet are written, so a one-transaction emptiness check cannot see a create in flight: it would see no wallet and no lock, delete the fresh PIN, and the create would then write a lock wrapped under a deleted PIN. Therefore use a **single-flight guard** (`exclusiveVaultWrite(fn)`, in `db.ts` or `lock.ts`): `navigator.locks.request('xrpl-vault-write', ...)` (Web Locks, cross-tab) when available, else a module-level promise chain. It wraps, in `keystore.ts`: `createStoredWallet`, `createDerivedWallet`, `importAndStoreWallet` (today's import function; Story 12 replaces it and MUST wrap its replacement in the same guard, say so in a code comment), any path that calls `withAppPin`/`createLock`/`buildLock` to write a new PIN or lock (`editChecks`), Onboarding's first-run setup path (`setUpVaultAuth` and what it calls), and the removal's emptiness check plus `discardAppPin` plus the legacy-record delete. Inside the guard the final step may still be one transaction, but the guard is what protects the in-flight create. Read the real create and Onboarding paths before wrapping and list every wrapped function in a code comment. **Failure.** If `discardAppPin` fails after the last wallet is gone, the removal reports `The wallet was removed, but the App PIN could not be removed.` (visible, persistent), and first-run Onboarding offers **Remove all wallets from this device** (the shipped `tearDownAllLocalState` flow, reuse the `AppSettings` Remove-all plate or its dialog) whenever a PIN (`pinSaltB64`) or a non-zero `failedAttempts` remains; this is read through the keystore (`hasAppPin` and a failure-count read), not by Onboarding touching vault meta. Back to Onboarding after a clean last removal asks for a new PIN as on first run and no failed-attempt count carries over. Everything is local: no ledger call. Keys 44px on coarse pointers; no `:focus` styling, no `outline-none`; `danger` on the opening key, saturated `destructive` only on the confirm key; no new colour token.

**Never:** No Remove all change in Settings; Settings' own per-wallet Remove stays until Story 19.4. The teardown owner never writes vault meta. No inline `closeLock`/`queryClient.clear` in the Chooser or card. Do not reset `failedAttempts` outside `discardAppPin`. Do not use `discardUnusedAppPin` for this. The per-removal step never closes or deletes the legacy lock; only `tearDownAllLocks` (when nothing remains) closes it in memory, and the empty-device unit deletes its record.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Locked card | closed lock | Remove `aria-disabled` with `Open this wallet to remove it.` visible; activation does nothing | handler re-reads `openLocks`, refuses |
| Lock closes meanwhile | dialog open, lock auto-locks, user confirms | refused at confirm; nothing removed | n/a |
| Sibling view | Seed has two views | body (a); only that view removed; Seed and lock stay | n/a |
| Only view, others remain | Seed's last view, other Seeds exist | body (b); its created lock deleted and closed (never legacy); `activeWalletId` re-picked | n/a |
| Last wallet | no other wallet | body (c); `tearDownAllLocks`; `discardAppPin` clears the six fields and the count; app returns to Onboarding asking a new PIN | n/a |
| Active removed | `activeWalletId` is the removed id | first wallet in chooser order, else `null` | n/a |
| Keystore step throws | `removeWallet` rejects | `finally` still clears session, cache and `activeWalletId` for it | error shown, nothing half-claimed |
| Discard fails | `discardAppPin` rejects after last wallet gone | `The wallet was removed, but the App PIN could not be removed.`; Onboarding offers Remove all while a PIN or a non-zero count remains | n/a |
| Concurrent create | a create/import in flight while the last wallet is removed | its PIN is not deleted under it, and no typed PIN becomes the App PIN without the two-entry confirmation | atomic or single-flight |
| Legacy lock | removed wallet is on `LEGACY_LOCK_ID` | the lock is never deleted or closed by removal | n/a |

## Code Map

- `src/pages/tabs/SettingsTab.tsx:~148` -- `handleRemove` (the shipped flow to learn from, NOT to change) and the shipped dialog sentences (~371-380).
- `src/lib/crypto/keystore.ts` -- `removeWallet` (~line 740), `findSeedRecord`, `viewsOf`, `deleteLock` use, `createStoredWallet`/`importStoredWallet` (creation paths), `discardUnusedAppPin` use sites (~868, 894, 1056, 1471).
- `src/lib/crypto/lock.ts` -- `discardUnusedAppPin` (~344), `hasAppPin` (~335), `listLockRecords`, `withAppPin`; add `discardAppPin`.
- `src/lib/crypto/db.ts` -- `VaultMeta` (126), `mutateVaultMeta` (243), `mutateStoredWallet` (261), `listStoredWallets`, lock records store; the transaction or guard lives here or in `lock.ts`.
- `src/lib/teardown.ts` -- `tearDownLock`, `tearDownAllLocks`, `removeLockedAccountData`, `leaveWallet`; add `removeWalletData`.
- `src/components/wallet/WalletCard.tsx`, `src/pages/Chooser.tsx` -- keys and dialog (the Rename dialog from Story 9 is the pattern); `src/store/wallet-groups.ts` -- chooser order.
- `src/pages/Onboarding.tsx` -- first-run; add the Remove all offer; `src/pages/AppSettings.tsx` -- the Remove-all plate and dialog to reuse.
- chooser `EXPERIENCE.md` (Exact strings: Remove; State Patterns: Remove confirmation) and `DESIGN.md`; AD-46 and AD-25 in the spine.

## Tasks & Acceptance

**Execution:**
- `src/lib/crypto/db.ts`, `src/lib/crypto/lock.ts`, `src/lib/crypto/keystore.ts` -- `discardAppPin`, the atomic emptiness check, `removeWallet` wiring -- AD-46, AD-25, FR-86
- `src/lib/teardown.ts` -- `removeWalletData` -- AD-46, AD-16
- `src/store/` or `src/lib/` -- pure `nextActiveWalletId`
- `src/components/wallet/WalletCard.tsx`, `src/pages/Chooser.tsx` (and a `RemoveDialog`) -- keys, three bodies, call-time guard, `finally` teardown, refresh, re-pick, focus
- `src/pages/Onboarding.tsx` -- Remove all offer while a PIN or count remains; the failed-discard message
- Tests: call-time refusal (both at open and at confirm); the three bodies; `removeWalletData` scope (never the legacy lock; keeps a shared account; `tearDownAllLocks` when none remain); active re-pick (pure table); the six fields cleared and the count reset only by `discardAppPin`; a test that nothing else resets `failedAttempts`; the race against a concurrent create, asserted deterministically on the guard (the test holds the guard from a stubbed create that has written the PIN but not yet the lock or wallet, starts the last removal, and shows the removal waits and the PIN is intact when the create finishes; do not use a simultaneous run on the hand-rolled `idb` mock, whose whole-store commit reports a lost update the real database would not), a test that every function named in the guard comment is wrapped (spy or source-level check of the call), a migrated legacy vault whose only lock record is `lock:legacy` (the PIN is discarded and the legacy record deleted), and an orphan created-lock record with no wallet (does not block the discard); the failed-discard path and Onboarding's offer; `finally` clears session and cache when `removeWallet` throws; no inline `closeLock`/`clear` in Chooser or card. A test fails if the call-time guard is removed and one fails if `discardAppPin` is skipped.

**Acceptance Criteria:**
- Given a locked card, then Remove is `aria-disabled` with the reason visible, and activating it does nothing.
- Given an open card, when Remove is pressed, then the dialog shows one of three consequence bodies; Escape, overlay press and Back close it; the confirm key is the `destructive` fill.
- Given confirm, then `removeWalletData` runs from `finally`; `activeWalletId` is re-picked; focus lands on the `Wallets` h1.
- Given the removal leaves no wallet and no lock record, then the six PIN fields are deleted and the count reset in one transaction, atomic with the emptiness check, and Onboarding asks for a new PIN with no carried-over count.
- Given the discard fails, then the stated message shows and Onboarding offers Remove all while a PIN or count remains.
- `bun run lint`, `bun run build`, `bun run test`, `bun run check:contrast` pass.

## Spec Change Log

## Review Triage Log

### 2026-10-28 — Review pass
- verdicts: blind hunter 10, edge-case hunter 13, verification gap 3 plus 3 notes, intent alignment descriptive; grouped by root cause into the rows below — high 1 and medium 4 and low 2 (patched), medium 2 and low 3 deferred, rest false or rejected as low
- findings:
  - `[high]` `patch` When `removeWallet` threw and the vault list could not be read either, the Chooser fell back to the store minus the removed wallet, so a wallet the vault may still hold vanished from the list (a failed read shown as a current one), and with one wallet the app routed to Onboarding — an unread vault now keeps the list as it is, sheds only the removed wallet's data, and reports the failure; test added.
  - `[medium]` `patch` The dialog's consequence was computed when it opened and not re-checked, so wallets changing under it could make "only this wallet" untrue for a last-wallet removal that discards the PIN — confirm recomputes the body and refuses with a message if it differs; test added.
  - `[medium]` `patch` A failed lock-record or session cleanup skipped `discardAppPin` and reported the PIN as failed for a step never tried — the PIN discard is now attempted independently of the lock cleanup.
  - `[medium]` `patch` A confirm refused because the lock closed gave no feedback — a persistent error says so; test added.
  - `[medium]` `patch` Onboarding hid the Remove all offer when the PIN-residue read failed, leaving no way out after a failed discard and a failed read — a failed read now keeps the offer.
  - `[low]` `patch` The Web Locks branch of the guard was never exercised — a test stubs `navigator.locks` and checks the name, the result and a rejection.
  - `[low]` `patch` The locked card's `aria-disabled` Remove looked enabled — it takes the shared disabled styling.
  - `[medium]` `defer` Guard held across prompts; the first-run gap and unguarded writers — see deferred.
  - `[low]` `defer` Three-write empty-device cleanup; Settings' Remove; `appPinExpected` caller test; layout — see deferred.
  - `[false]` `reject` `createDerivedWallet` omits `signing === 'pin'` from the `appPinExpected` check — a passkey-derived Seed has no PIN signing check; its only PIN input is the Open Check, which is checked.
  - `[low]` `reject` Re-pick should prefer an open lock, order helper duplicates the grouping, store-text tests, `void id` leftovers, spec wording — the spec says the first wallet in chooser order, the helper is covered by a table, and the behavioural tests cover the same rules.

## Verification

**Commands:**
- `bun run lint` -- expected: no errors
- `bun run build` -- expected: `tsc -b` and Vite build succeed
- `bun run test` -- expected: all pass
- `bun run check:contrast` -- expected: pass

**Manual checks (if no CLI):**
- Browser pass of the Remove keys and dialog bodies at 320, 390 and desktop in both themes; remove the last wallet and confirm first-run asks for a new PIN. Deferred to the final pass.

## Auto Run Result

Status: done

- Summary: Every card has a Remove key (per network row on an open card; `aria-disabled` with its reason on a locked one) that re-checks the lock at call time and at confirm, a three-body confirm dialog, and one teardown scope `removeWalletData` run from `finally`. The last removal discards the App PIN fields and resets the failure count, atomically with the emptiness check through a single-flight guard that also wraps every PIN- and lock-writing creation path; the legacy lock record and orphans are cleaned in the same step. A failed discard is reported and Onboarding offers Remove all while a PIN or count remains.
- Files: `src/lib/crypto/db.ts`, `lock.ts`, `keystore.ts`, `auth.ts`, `src/lib/teardown.ts`, `src/store/wallet-groups.ts`, `src/pages/Chooser.tsx`, `src/pages/Onboarding.tsx`, `src/pages/AppSettings.tsx`, `src/components/wallet/WalletCard.tsx`, `RemoveDialog.tsx`, `remove-copy.ts`, `RemoveAllPlate.tsx`, `CreateWalletFlow.tsx`, and tests (`remove-wallet`, `remove-wallet-data`, `wallet-groups`, `chooser`, `create-entry-points`, `create-stored-wallet`).
- Review: 7 patches applied (1 high, 4 medium, 2 low), 5 deferred, the rest rejected with reasons above.
- Follow-up review recommended: true. A high and four medium findings were patched in the removal and PIN-discard paths, and the guard's behaviour across tabs and prompts is covered only by a promise-chain test and a stubbed Web Locks call.
- Verification: `bun run lint`, `bun run build`, `bun run test` (1594 tests), `bun run check:contrast` pass after patches.
- Residual risk: the first-run PIN-write gap and the guard held across prompts (deferred, with a note for Story 12); no browser pass yet.
