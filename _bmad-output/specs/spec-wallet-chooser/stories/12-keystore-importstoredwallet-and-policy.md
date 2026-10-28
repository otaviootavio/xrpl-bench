---
title: 'Keystore importStoredWallet and policy'
type: 'feature'
created: '2026-10-28'
status: 'done'
baseline_revision: '7354f8fcd2333608ea174fc74afecbcad0f82b53'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-18-context.md'
  - '{project-root}/docs/agents/INDEX.md'
  - '{project-root}/docs/agents/keys-and-secrets.md'
  - '{project-root}/docs/agents/verifying-your-work.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-chooser-2026-10-19/ARCHITECTURE-SPINE.md'
warnings: []
deferred:
  - summary: >-
      Import strength is enforced only when a wallet is created; the stored record does not record that it was imported, so Edit checks could later set an imported key's Open Check to `none` on Testnet or Devnet.
    evidence: |-
      AD-39 asks the import to be refused with `none`; the edit path is a separate rule (`checkLockRequest`/`editChecks`). Persisting an `origin` on the Seed record and applying the import floor in Edit checks is a data-model change for its own story.
    location: >-
      src/lib/crypto/keystore.ts, src/lib/crypto/policy.ts
    severity: medium
  - summary: >-
      The app's Import still goes through `importAndStoreWallet` (no duplicate check, no `none` refusal, no written-Seed confirmation) until Story 13 migrates `AddWalletScreen`, and Onboarding keeps it as the one remaining caller; `describeOptions` still offers `none` for imports.
    evidence: |-
      Story 13 wires the UI to `importStoredWallet`, adapts `describeOptions` for imports, and adds `AddWalletScreen.tsx` to the no-caller test; Onboarding's import migration is the Deferred item in AD-39.
    location: >-
      src/components/wallet/AddWalletScreen.tsx, src/pages/Onboarding.tsx
    severity: medium
  - summary: >-
      Tests do not cover `wrong-credential` and `locked-out` outcomes, a rollback where an App PIN made for the import is discarded while an older one survives, or a failing `deleteLock`.
    evidence: |-
      The paths reuse creation's rollback, covered by its tests; add import-specific cases when the UI story exercises them.
    location: >-
      src/lib/crypto/__tests__/import-stored-wallet.test.ts
    severity: low
---

<intent-contract>

## Intent

**Problem:** Import writes the Seed under the *active wallet's* open key (`importAndStoreWallet`, `storeWallet`), so an imported Seed shares another wallet's lock, needs an open wallet, and is not held to the policy Generate is: an Open Check of `none` is allowed on Testnet or Devnet, there is no written-Seed confirmation, and the same key can be held twice under two locks of different strength (a classic address is identical on every network). Two import paths would mean two lock models (AD-39).

**Approach:** Add `keystore.importStoredWallet(input, ctx)` beside `createStoredWallet`, sharing one internal writer so the order exists once: `checkWalletRequest`, duplicate check, the Signing Check credential, `createLock`, one `putStoredWallet`. Import is held to at least Mainnet-strength: Open Check `none` is refused on every network. No UI in this story. `importAndStoreWallet` stays for Onboarding only (Onboarding is migrated later); it is not called from chooser-side code.

## Boundaries & Constraints

**Always:** Signature `importStoredWallet(input: ImportStoredWalletInput, ctx: ImportWalletContext): Promise<ImportStoredWalletResult>`. Input: `label`, `network`, optional proven `node`, `openCheck` (`NewOpenCheck`), `autoLockMinutes`, `signing` (`SigningKind`), and `seed` (the parsed Seed string, a parameter only). Context mirrors `CreateWalletContext`: `pin`, `confirmWrittenSeed`, `appPinExpected`. Result is the same `CheckResult` shape as creation: `ok` with `{ meta, openKey }` and NEVER the Seed (Generate's result returns its generated Seed for the backup screen; Import's does not); `refused` with a plain `reason`; `cancelled`, `wrong-credential`, `locked-out` as creation. The whole function runs inside `exclusiveVaultWrite` (the vault-write guard, Story 10) and honours `appPinExpected` exactly as `createStoredWallet` does; update the guard's comment in `db.ts` so it lists `importStoredWallet` and removes the "Story 12 replaces this function" note. **Order, once, in a shared internal writer** that both `createStoredWalletUnguarded` and the import use (refactor Generate to use it, behaviour unchanged): (1) the name rule via `nameForNewWallet` (Story 11); (2) `checkWalletRequest` (policy, with import strength below); (3) **duplicate check** (before any prompt, any lock write, any credential): derive the address from the Seed (`Wallet.fromSeed`) and refuse, with a plain reason pointing the user to Configure, Other networks, if it equals the `keyAddress` (`address`) of ANY stored Seed record on the device on ANY network; (4) the written-Seed confirmation via `ctx.confirmWrittenSeed` after the Seed is parsed and before any credential, lock or wallet is written (`requiresWrittenSeed` decides, with NO import exemption: a missing callback where it is required is `refused` by the policy, `false` is `cancelled`); (5) the Signing Check credential (`sealUnderNewCredential` for non-standard, `ctx.pin` required for a PIN check); (6) `createLock` (its own new lock, never an existing one, never the active wallet's); (7) one `putStoredWallet`. Any failure after the lock is written deletes the lock and discards an App PIN made for it (`deleteLock`, `discardUnusedAppPin`), as Generate does. The stored record's `algorithm` is that of the imported Seed (`algorithmOfSeed`), `seedMethod: 'stored'`. **Policy:** extend `policy.ts` so a request can be marked an import (e.g. `origin: 'imported'` on `WalletRequest`); for an import, an Open Check of `none` is refused on EVERY network with a plain reason (a key that is imported may hold real funds this device cannot see); the Mainnet floor (Open Check required, auto-lock at least 1 minute) applies unchanged; `requiresWrittenSeed` is unchanged and applies to imports. `describeOptions` is not changed here (the UI story adapts it; keep it compiling and its tests green, or add the minimal import flag with tests). **Seed handling (keys-and-secrets.md):** the Seed is a parameter only: not stored in module state, not logged, never in an error message, never in the result, not in a thrown `Error`; the keystore retains none. The caller (Story 13) holds it in a ref and clears it in `finally`. `importAndStoreWallet` is NOT changed in behaviour. The new lock is opened at commit as Generate does (the `openKey` is returned), and the wallet is not selected or entered (the caller does neither here).

**Never:** No UI, no component, no Onboarding change, no change to `importAndStoreWallet`'s behaviour or its callers (Onboarding keeps it). No ledger read of any kind in this function (the pre-import ledger check stays in the UI path). No import under an existing lock. No Open Check `none` import, on any network.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy path | valid Seed, PIN Open Check, PIN signing | `ok`, `{ meta, openKey }`, own new lock, one stored wallet, no Seed in the result | n/a |
| Open Check `none`, Testnet | any network | `refused` with the plain reason, nothing written | n/a |
| Mainnet floor | Mainnet, auto-lock under 1 minute | `refused` | nothing written |
| Mainnet passkey-only | Open passkey + Signing passkey/standard, no `confirmWrittenSeed` | `refused` by policy | nothing written |
| Mainnet passkey-only | callback returns false | `cancelled`, nothing written | n/a |
| Duplicate address | Seed's address equals any stored Seed's `address`, any network | `refused` pointing to Configure, Other networks, BEFORE any prompt, credential, lock write or callback | no ledger read, Seed not leaked |
| Failure after lock | `putStoredWallet` throws | the new lock is deleted, an App PIN made for it discarded, error rethrown without the Seed | n/a |
| Concurrent removal | last wallet being removed | waits on the vault-write guard; honours `appPinExpected` | refused if PIN gone |
| Malformed Seed | invalid | refused with a plain reason that does not contain the Seed | n/a |
| Generate | unchanged | behaves exactly as before through the shared writer | n/a |

## Code Map

- `src/lib/crypto/keystore.ts` -- `importAndStoreWallet` (~205, leave), `createStoredWallet`/`createStoredWalletUnguarded` (~891) holds the order to extract into the shared writer; `nameForNewWallet`, `confirmedAtFor`, `abandon`, `sealUnderNewCredential`, `hasView`/`listStoredWallets`, `algorithmOfSeed`, `putStoredWallet`, `deleteLock`, `discardUnusedAppPin`, `APP_PIN_GONE`, `CreateWalletContext`, `exclusiveVaultWrite`.
- `src/lib/crypto/policy.ts` -- `WalletRequest`, `checkWalletRequest` (~148), `checkLockRequest`, `requiresWrittenSeed` (~137), `describeOptions` (~224).
- `src/lib/crypto/db.ts:~505-520` -- the guard comment to update.
- Existing tests: `src/lib/crypto/__tests__/create-stored-wallet.test.ts` (the pattern and mocks), `policy.test.ts`, `remove-wallet.test.ts` (the guard checks that every wrapped function is wrapped, which will include the new one).
- AD-39 in the chooser `ARCHITECTURE-SPINE.md`; `docs/agents/keys-and-secrets.md`.

## Tasks & Acceptance

**Execution:**
- `src/lib/crypto/policy.ts` -- import-strength rule (Open Check `none` refused on every network) -- FR-65, AD-28
- `src/lib/crypto/keystore.ts` -- shared internal writer; `importStoredWallet`; Generate uses the writer -- FR-87, AD-39
- `src/lib/crypto/db.ts` -- guard comment lists the new function
- Tests: each matrix row against the real keystore on the same in-memory layer `create-stored-wallet.test.ts` uses; the duplicate refusal happens before the confirmation callback, the credential and any lock write (spies on them are never called); the result never contains the Seed and no thrown error contains it (assert on the serialized result and error message); lock rollback and App PIN discard on a late failure; Open Check `none` refused on Testnet, Devnet and Mainnet (a test fails if that refusal is removed); the Mainnet floor and written-Seed rule apply to imports; Generate still passes all its existing tests through the shared writer; the vault-write guard test that every named function is wrapped includes `importStoredWallet`; a test fails if any chooser-side file (`Chooser.tsx`, `WalletCard.tsx`, `AppShell.tsx`, `SettingsScreen.tsx`, `AppSettings.tsx`) calls `importAndStoreWallet` (source-level check is acceptable here; Story 13 adds `AddWalletScreen.tsx` to that list when it migrates).

**Acceptance Criteria:**
- Given an import, then the order is `checkWalletRequest`, duplicate check, the Signing Check credential, `createLock`, one `putStoredWallet`, shared with `createStoredWallet` through one internal writer.
- Given an Open Check of `none`, then the import is refused on any network.
- Given a Mainnet import, then the Mainnet floor and the written-Seed confirmation apply.
- Given a Seed whose address already exists on the device, then the import is refused before any prompt and any ledger read, and the Seed does not leave the keystore call.
- Given a failure after the lock is written, then the new lock is deleted and an App PIN made for it is discarded.
- The result carries `meta` and the new lock's `openKey` and never the Seed; the keystore retains none.
- `bun run lint`, `bun run build`, `bun run test`, `bun run check:contrast` pass.

## Spec Change Log

## Review Triage Log

### 2026-10-28 — Review pass
- verdicts: blind hunter 9, edge-case hunter 11, verification gap 0 plus 3 notes, intent alignment descriptive; grouped by root cause into the rows below — medium 1 and low 2 (patched), medium 2 and low 1 deferred, rest false or rejected as low
- findings:
  - `[medium]` `patch` Generate now created its Seed before the PIN-missing and App-PIN-gone checks, so a cancelled or refused request left a fresh Seed in memory — a Generate checks the PIN first again and an import keeps its duplicate check first (it already holds its Seed as a parameter).
  - `[low]` `patch` The chooser-side caller test passed vacuously if a file was renamed — it now asserts each file was found.
  - `[low]` `patch` The import policy rule had no direct unit test — `policy.test.ts` covers it on all three networks, the non-import case and the Mainnet floor.
  - `[medium]` `defer` Import strength after creation; the app's Import still on the old path; import-specific rollback cases — see deferred.
  - `[false]` `reject` The vault-write guard is per-tab only — `exclusiveVaultWrite` uses Web Locks (cross-tab) when available, and Onboarding's `importAndStoreWallet` is wrapped in it too.
  - `[low]` `reject` The duplicate check also matches Passkey-Derived records, an unexplained `as const`, the `imported` field name, the Mainnet-`none` reason order, `appPinExpected` for a passkey-only import, a custom `node` test, the Seed handed to `confirmWrittenSeed` — the same key held twice under two locks is the case AD-39 forbids whatever the Seed Method, the confirmation callback is the caller's own display step, and the rest are cosmetic.

## Verification

**Commands:**
- `bun run lint` -- expected: no errors
- `bun run build` -- expected: `tsc -b` and Vite build succeed
- `bun run test` -- expected: all pass
- `bun run check:contrast` -- expected: pass

**Manual checks (if no CLI):**
- None: no UI in this story.

## Auto Run Result

Status: done

- Summary: `keystore.importStoredWallet(input, ctx)` imports a Seed under its own new lock through the one internal writer Generate now uses: name rule, policy, duplicate check (any network, before any prompt, credential or lock write), written-Seed confirmation, Signing Check credential, `createLock`, one `putStoredWallet`, with rollback of the lock and an App PIN made for it. An Open Check of `none` is refused for an import on every network; the Mainnet floor and the written-Seed rule apply. The result carries `meta` and the `openKey`, never the Seed. It runs inside the vault-write guard and honours `appPinExpected`.
- Files: `src/lib/crypto/keystore.ts`, `policy.ts`, `db.ts` (guard comment), and tests (`import-stored-wallet` new, `policy`, `remove-wallet`).
- Review: 3 patches applied (1 medium, 2 low), 3 deferred, the rest rejected with reasons above.
- Follow-up review recommended: false.
- Verification: `bun run lint`, `bun run build`, `bun run test` (1638 tests), `bun run check:contrast` pass after patches.
- Residual risk: Import's UI still uses the old path until Story 13; the stored record does not mark itself imported.
