---
title: 'Per-Wallet locks in the vault, with migration of existing Wallets'
type: 'feature'
created: '2026-10-11'
status: 'done'
baseline_revision: '03cb41fc1feefbdb94221d407f2003f2f6455db5'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/docs/agents/keys-and-secrets.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-passkey-signing-2026-10-10/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics-passkey-signing.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** One app-wide `vaultKey` opens every Seed, so no Wallet can have its own lock, network or checks. Existing Wallets must move to the per-Wallet data model (CAP-10, story 12.1) without any address changing or any protection weakening.

**Approach:** An additive, idempotent, single-transaction relabel at app start: every legacy Seed record joins one `lock:legacy` record and gains Stored Seed / Standard / network / `algorithm: 'unresolved'` fields; a Wallet becomes a view `(walletId, seedId, network)` over a Seed record so "use on another network" can add a second view. Nothing is re-encrypted, no IndexedDB version bump, unlock stays app-wide ("lock together, as today").

## Boundaries & Constraints

**Always:** `encryptedSeed` is never read, rewritten or deleted by migration (AD-27). New data is additive fields on existing records plus `lock:<id>` keys in the existing `vault` store; no `openDB` version bump; persisted `app-store` stays version 0 with new fields normalised in `mergePersistedAppState`. Migration touches no key material and holds no Seed. Copy today's `PRF_SALT`, `HKDF_INFO` and PBKDF2 parameters into the lock record (export the constants; unlock paths behave exactly as today). Legacy `openCheck` = `either` if a passkey is registered (credential id + wrapper present), else `pin`; `signingCheck` = `standard`; `network` and `autoLockMinutes` come from the persisted app-store. `algorithm` is never guessed: resolved on first decryption from the Seed, accepted only if the derived address equals the stored address (else fail closed). A crash leaves every Wallet openable as before: one IndexedDB transaction over `wallets`+`vault`, skipped when `lock:legacy` exists.

**Never:** Re-encrypt or add a Signing Check (stories 13.x/15.1). Remove the app-wide `network` or `autoLockMinutes` from `app-store`, or change which network reads use (story 12.2). Change `unlockVault`, lockout or `Unlock.tsx`. Bump the DB or persist version. Put any seed or key in state, storage or URL. Run migration from anywhere except app start (it only ever runs in a build the user has already activated — CLAUDE.md "updates are never automatic").

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Migrate, PIN only | 2 legacy Seeds, no passkey, app network `mainnet`, autoLock 10 | Both records: `seedMethod:'stored'`, `algorithm:'unresolved'`, `lockId:'legacy'`, `openCheck:'pin'`, `signingCheck:'standard'`, one view each on `mainnet`; `lock:legacy` holds constants + autoLock 10; `encryptedSeed` byte-identical | — |
| Migrate, with passkey | passkey registered | `openCheck:'either'` | — |
| Re-run | `lock:legacy` exists | No writes | — |
| Crash mid-migration | tx aborts | No field and no lock record written; unlock by PIN/passkey still opens every Wallet | Swallow, app continues on legacy shape |
| Empty vault | no wallets | Nothing written | — |
| First decrypt, `unresolved` | derived address == stored | `algorithm` stored (`ed25519`/`secp256k1`); ciphertext untouched | Mismatch: throw, do not store |
| Use on another network | view on mainnet; choose `testnet` | New view, same `seedId`, own `walletId`; no new ciphertext | Existing `(seedId, network)` rejected |
| Remove a Wallet | seed has 2 views | Only that view goes; Seed record deleted with its last view | — |

</intent-contract>

## Code Map

- `src/lib/crypto/db.ts` -- `StoredWallet`/`VaultMeta` types, `getDb` (version stays 2); add additive fields, `LockRecord` (`lock:<id>` in `vault` store), atomic `migrateLegacyVault` helper; `wipeVaultDatabase` already clears both stores.
- `src/lib/crypto/auth.ts` (`HKDF_INFO`), `webauthn.ts` (`PRF_SALT`), `pin.ts` (`PBKDF2_ITERATIONS`) -- export the constants only; `hasPasskeyRegistered` shows the passkey test.
- `src/lib/crypto/keystore.ts` -- `WalletMeta` (add `seedId`, `network`, checks), `listWallets` (one meta per view), `unlockWalletForSigning`/`revealSeed` (resolve walletId→seed; resolve `algorithm`), `removeWallet`, new `addNetworkView`. Seed-creating paths (`storeWallet`) must write the same new fields (single view, no lock until story 14.1: legacy shape).
- `src/store/app-store.ts` -- `mergePersistedAppState` normalises missing `network` on persisted wallets; `network`/`autoLockMinutes` are the migration inputs.
- `src/App.tsx` (`Gate` effect) -- run migration after store hydration, before `listWallets`; errors swallowed.
- `src/pages/tabs/SettingsTab.tsx` -- Wallet list: "use on another network" action; grep `key={…address}` for list-key collisions now that two Wallets can share an address.
- `src/lib/teardown.ts`, `scripts/check-layering.mjs` -- confirm no new persistence owner or module list change is needed.
- `src/lib/crypto/__tests__/vault.test.ts`, `keystore.test.ts` -- in-memory IDB mock pattern to extend; `docs/agents/verifying-your-work.md` for the Settings change.

## Tasks & Acceptance

**Execution:**
- `src/lib/crypto/db.ts` -- additive types, `LockRecord`, atomic idempotent migration -- AD-27
- `src/lib/crypto/{auth,webauthn,pin}.ts` -- export constants, no behaviour change -- AD-21
- `src/lib/crypto/keystore.ts` -- view-aware list/unlock/reveal/remove, `algorithm` resolution, `addNetworkView` -- AD-18
- `src/store/app-store.ts`, `src/App.tsx` -- normalise on merge; migrate at start -- AD-27
- `src/pages/tabs/SettingsTab.tsx` -- "use on another network" with plain wording, plain-text network, no colour-only meaning -- 12.1
- `src/lib/crypto/__tests__/` -- one test per I/O row, plus: ciphertext unchanged, schema version still 2, old-build read of a migrated record still decrypts, no Seed in any written record, `lock:legacy` removed by `wipeVaultDatabase` -- gates

**Acceptance Criteria:**
- Given a vault from the current build, when the new build starts, then each Wallet is Stored Seed / `openCheck` = its Unlock Method / Signing Check Standard, addresses unchanged, ciphertext identical.
- Given the update is not activated, when the app opens, then the old build runs and nothing is migrated.
- Given migrated Wallets, when one is unlocked by its existing PIN or passkey, then all open and sign as before and lock together.
- Given a migrated legacy Wallet, when its Settings entry is used for "use on another network", then a second Wallet shares its Seed record and the funded address stays listed.
- Given a rollback to the previous build after migration, when an unedited Wallet is opened, then it opens (additive fields ignored).

## Spec Change Log

## Review Triage Log

Patches applied in this pass (the `patch` rows below): per-record migration keeping a resolved `algorithm`; one `openCheckOf` helper; `listWallets(fallbackNetwork)` with all callers passing the app-wide network and `addNetworkView` refusing unmigrated records; best-effort algorithm persist; `appStateSettled()` (via `onRehydrateStorage`, resolves on success and failure) replacing `onFinishHydration` in `App.tsx`; no active-Wallet switch and per-Wallet aria-labels in Settings; `app-store.ts` doc blocks restored and id-less entries filtered; new tests `src/__tests__/gate-migration.test.tsx`, `src/pages/tabs/__tests__/settings-network-views.test.tsx` and extra cases in `migration.test.ts`.

### 2026-10-11 — Review pass
- verdicts: 39 findings — high 0, medium 15, low 19, false 5, maybe-false 0
- findings (B = blind-hunter, E = edge-case, V = verification-gap, I = intent-alignment):
  - `[medium]` `patch` B1 / E3 migration skipped once `lock:legacy` exists, so a Wallet added by a rolled-back build stays unmigrated — made per-record (rollback AC allows this state)
  - `[medium]` `patch` B2 / E1 / E2 / E14 / V4 / V5 `listWallets` labels an unmigrated record `testnet` and `addNetworkView` persists that fabricated view, which the migration then skips — fallback takes the app-wide network; add-view refuses an unmigrated record
  - `[false]` `reject` B3 / E4 migration bakes in the store's default network — with no persisted network the default WAS the app-wide setting in use, which is what the AC says to copy
  - `[low]` `patch` B4 a failed algorithm write blocks signing and reveal after a verified decrypt — persist is made best-effort; the address-mismatch throw stays (fail closed)
  - `[low]` `reject` B5 migration error swallowed silently and cached for the session — per-record retry on every start removes the lasting harm; no direct fix
  - `[low]` `patch` B6 / E10 `normaliseWallets` JSDoc inserted between `mergePersistedAppState` and its own doc; unvalidated `w.id` cast — move doc, filter entries without a string id
  - `[medium]` `patch` B7 / E12 "Use on" selects the new view as active while reads still use the app-wide network, so the active Wallet claims a network it does not read from; the repeated buttons share one accessible name — stop selecting it; per-Wallet aria-label
  - `[low]` `reject` B8 naming-list/docs not updated; old-build test only re-decrypts the same field — the naming list lives in a planning artifact, not an agent-context file; no direct fix for the second
  - `[low]` `patch` B9 Open Check rule written twice (`legacyOpenCheck`, inline in migration) — one shared helper; the claim that onboarding registers the passkey after storing is false (`setUpVaultAuth` runs first)
  - `[medium]` `patch` E5 `storeHydrated` never resolves if hydration errors — verified in `node_modules/zustand/middleware.js:433-435`, finish listeners fire only on success; Gate would never list Wallets. Must not hang
  - `[false]` `reject` E6 invalid `autoLockMinutes` — store default is 5 and the only setter is a fixed list in Settings
  - `[low]` `reject` E7 address mismatch blocks reveal — fail closed is the spec's rule
  - `[low]` `reject` E8 removed record reports "already set up" — unlikely race, wrong message only
  - `[low]` `reject` E9 / E15 `openCheck` is a snapshot — passkey setup happens only at onboarding, which builds new records
  - `[false]` `reject` E11 undefined network in `normaliseWallets` — fallback is `current.network`, always a valid id
  - `[low]` `reject` E13 `removeWallet` silent no-op on a vanished record — caller re-lists
  - `[medium]` `patch` V1 / I5 no App/Gate test of order, hydrated inputs, swallowed rejection — add one (include the hydration-error case)
  - `[medium]` `patch` V2 / I6 no Settings test for the "Use on" buttons or remove-dialog copy — add one
  - `[low]` `patch` V3 `either` untested on the `storeWallet` path — one added case
  - `[low]` `patch` V6 migration overwrites an already-resolved `algorithm` with `unresolved` — keep the existing value
  - `[low]` `reject` V7 / I7 mock IndexedDB is not real IndexedDB — no `fake-indexeddb` in the repo; recorded as residual risk
  - `[low]` `reject` I1 / I2 / I3 / I4 fields are labels no unlock path reads; store copy defaults `pin`; no acceptance gate — the spec's `<intent-contract>` fixes this story as the relabel (unlock stays app-wide, update activation is the service worker's)
  - `[false]` `reject` I8 teardown/layering unconfirmed — `lock:legacy` lives in the `vault` store `wipeVaultDatabase` clears, tested; gates pass

## Design Notes

A Wallet view is stored on the Seed record as `views: [{ walletId, network }]`, with the first `walletId` equal to the legacy record `id`, so persisted `activeWalletId` keeps working. `openCheck: 'either'` follows AD-25 (not in the naming list, which gains it). Reads still use the app-wide network until story 12.2; this story records views, it does not route reads. Unlock still reads the constants, not the lock record; moving reads to the record is story 13.x.

## Verification

**Commands:**
- `bun run lint && bun run build && bun run test && bun run check:contrast` -- expected: all green

**Manual checks (if no CLI):**
- Browser pass of the Settings Wallet list and "use on another network" per `docs/agents/verifying-your-work.md`, on a vault created by the previous build.

## Auto Run Result

Status: done

**Summary:** Existing Wallets are relabelled onto a legacy lock at app start: one atomic, idempotent, per-record IndexedDB transaction adds `seedMethod`, `algorithm: 'unresolved'`, `lockId`, `openCheck` (`pin`/`either`), `signingCheck: 'standard'` and a network view to each Seed record and writes `lock:legacy` (constants copied, no key, no Seed). Ciphertext is untouched, the DB version stays 2, and unlock stays app-wide. A Wallet is a view over a Seed record; Settings gained "Use on <network>".

**Files changed:** `src/lib/crypto/db.ts` (types, migration, mutate helper), `keystore.ts` (view-aware list/unlock/reveal/remove, `addNetworkView`, algorithm resolution), `auth.ts`/`webauthn.ts`/`pin.ts` (constants exported), `src/store/app-store.ts` (normalise on merge, `appStateSettled`), `src/App.tsx` (migrate at start), `Onboarding.tsx`, `SettingsTab.tsx`, and tests (`migration.test.ts`, `gate-migration.test.tsx`, `settings-network-views.test.tsx`, two fixtures updated).

**Review:** 39 findings — 0 high, 15 medium, 19 low, 5 false. Patched: the medium and low `patch` rows above. Deferred: none. Rejected: the `reject` rows above, each with its reason (mock IndexedDB fidelity and the fields being unread by unlock are the two worth knowing).

**Follow-up review recommended: true** — more than two medium entries were patched. Unverified risk: the migration and the hydration-failure path have only been exercised against an in-memory IndexedDB fake and a mocked store, not a real browser.

**Verification:** `bun run lint`, `bun run build`, `bun run test` (52 files, 704 tests) and `bun run check:contrast` all pass. All 8 I/O matrix rows have a passing test. The browser pass of Settings on a vault created by the previous build was NOT done.

**Residual risks:** real-IndexedDB atomicity and a real rollback to the previous build are untested; "ships only on user acceptance" rests on the service worker's waiting behaviour and has no test.
