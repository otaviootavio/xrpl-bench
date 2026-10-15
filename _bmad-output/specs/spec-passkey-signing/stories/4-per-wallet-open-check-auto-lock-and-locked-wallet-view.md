---
title: 'Per-Wallet Open Check, auto-lock, and locked-Wallet view'
type: 'feature'
created: '2026-10-11'
status: 'done'
baseline_revision: '7641949d37514b700e869b6db6a6ff0a895bf43b'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/docs/agents/keys-and-secrets.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-passkey-signing-2026-10-10/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/specs/spec-passkey-signing/check-rules.md'
warnings: [oversized]
deferred:
  - summary: >-
      PBKDF2 iterations on open and create come from the constant, not the lock record's stored `pbkdf2.iterations`.
    evidence: |-
      Raising PBKDF2_ITERATIONS later would break opening existing PIN locks; no lock created by the UI exists yet, so nothing is stranded today. Pass the record's value through derivePinKeyBits to fix.
    location: >-
      src/lib/crypto/pin.ts derivePinKeyBits, src/lib/crypto/lock.ts
    severity: medium
  - summary: >-
      Removing the last Wallet on a lock leaves its `lock:<id>` record, session entry and PIN verifier behind.
    evidence: |-
      removeWallet was not changed; no UI creates non-legacy locks yet, and the legacy lock is shared.
    location: >-
      src/lib/crypto/keystore.ts removeWallet
    severity: low
  - summary: >-
      No browser pass of the locked-Wallet view, header picker and Settings, nor a real-authenticator check of a passkey lock.
    evidence: |-
      Verified by gates and jsdom tests only; a visual pass per docs/agents/verifying-your-work.md would settle it.
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** One app-wide Unlock gate, one session key and one `autoLockMinutes` open every Wallet, so a Wallet cannot have its own Open Check or its own auto-lock, and a locked Wallet cannot be told apart from a locked app (CAP-4, FR-65).

**Approach:** Replace the gate with per-lock state (AD-21, AD-26). The app opens with no check; Wallet names are always visible; the active Wallet shows a locked view (name only, plus its unlock prompt) until its lock is open, and only an open Wallet mounts any ledger hook. Each lock has its own Open Key, its own auto-lock minutes and expiry timer, and tears down only its own Wallets' data. A lock layer can create locks with PIN, passkey or no Open Check, under one policy function for the Mainnet floors. Legacy Wallets stay on the one legacy lock and open as today.

## Boundaries & Constraints

**Always:** The session holds one non-extractable Open Key per open lock, each with its own lazy-and-timer expiry; expiry and manual lock close only that lock. Auto-lock minutes live on the lock record (the legacy lock keeps today's value from migration); the app-store's single `autoLockMinutes` is no longer read. Backgrounding past the existing grace (immediately on a coarse pointer) closes every lock. Mainnet: Open Check required (PIN or passkey) and auto-lock ≥ 1 minute, decided by one function in `lib/crypto/policy.ts`; Testnet/Devnet may use `none` (key stored as a non-extractable `CryptoKey` in IndexedDB) and any minutes. An existing legacy Wallet is never made weaker or changed by this floor. A lock's PIN use goes through `attemptPin` and the shared counter; a hard lock blocks PIN locks only, never passkey-only locks. A passkey Open Check uses its own PRF salt and credential, generated and stored on the lock record; every HKDF info and salt is stored, never recomputed from a constant. A cancelled passkey prompt never counts. Unlock is proven by decrypting a wrapped key, never by deriving. A locked Wallet renders its name only: no address, balance, history or network-derived data, and no ledger request carries its address; the first read after unlock is a fresh query. Teardown has three scopes in `lib/teardown.ts`: per-lock (drop that lock's key and persisted session, remove the account-scoped query data of its Wallets unless another open lock holds a record for the same Account), account data (full reset), shell (never touched by a lock). Failed reads and guards keep failing closed. `xrpl` never imports `crypto`; `crypto` collects PINs/prompts through callbacks.

**Never:** Create Wallets under a new lock (creation flow is story 5), edit a Wallet's checks, add a Signing Check UI or the written-Seed rule (stories 5, 7, 8), change signing paths from story 3, add a passkey-derived Seed, bump the IndexedDB version, put a key or PIN in state/storage/URL, cache RPC in the service worker, style `:focus`, or let colour alone carry meaning. Do not delete any Seed record on a hard lock (the explicit full reset stays its own action).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Cold start | Wallets exist, no lock open | App opens to the shell with the Wallet picker showing names; active Wallet shows the locked view and its unlock prompt; no address/balance, no pool request | — |
| Unlock one lock | Wallet A (lock X) unlocked, Wallet B (lock Y) not | A reads normally; B in the picker still name only; switching to B shows its locked view | — |
| Auto-lock one lock | X expires while Y open | X's key dropped, X's Wallets' account query data removed (unless Y holds a record for that Account); Y untouched | — |
| Shared Account | Two locks hold records for one (network, Account); X closes | Query data for that Account kept while Y is open | — |
| Backgrounding | Hidden past grace (or coarse pointer) | Every lock closed | — |
| No Open Check | Testnet lock `none` | Opens with no prompt; key is a non-extractable CryptoKey | — |
| Mainnet floor | `createLock` for Mainnet with `none`, or auto-lock 0.5 min | Refused with a plain reason from the policy function; 1 min with PIN/passkey accepted | Nothing written |
| Wrong PIN | PIN lock, wrong PIN | `wrong-credential` with tries remaining; counter shared with legacy unlock and signing | hard lock → locked view says so; passkey-only locks still open |
| Passkey cancelled | Passkey lock prompt dismissed | `cancelled`, counter unchanged, lock stays closed | — |
| Session restore | Refresh within window | That lock's key restored, others not; expired entry cleared | — |
| Legacy lock | Migrated Wallets | One lock for all; unlocking opens them together; auto-lock from the lock record | — |
| Auto-lock edit | Open Wallet's Settings | Changes only that lock's minutes; Mainnet value < 1 refused with reason | — |

</intent-contract>

## Code Map

- `src/lib/crypto/lock.ts` (new; replaces `auth.ts` over time) -- per-lock `createLock` (PIN/passkey/none, stored salts/info, Mainnet floor via policy), `openLock(lockId, method, ctx)` returning typed `CheckResult`, wrap/unwrap by decryption. Legacy lock opens through the existing `auth.ts` `unlockVault` wrappers; keep `auth.ts` for vault setup.
- `src/lib/crypto/policy.ts` (new) -- the one function for Open Check × Network × auto-lock floors (`check-rules.md`); story 5 extends it.
- `src/lib/crypto/db.ts` -- extend `LockRecord` additively (open check kind, wrapped Open Key per method, credential id, PRF salt, `none` CryptoKey), per-lock session entries `session:<lockId>` (legacy keeps `session`); helpers to list locks. `wipeVaultDatabase` clears all.
- `src/lib/crypto/keystore.ts` -- `WalletMeta` gains `lockId`; `listWallets` fills it; add lock listing/auto-lock edit (`setLockAutoLock`) obeying policy.
- `src/store/app-store.ts` -- replace `vaultKey`/`unlocked`/`lock` with per-lock open state, `openLock`/`closeLock`/`closeAllLocks`, selectors `useWalletIsOpen`, `useWalletOpenKey`; drop reads of `autoLockMinutes` (persisted field tolerated in `merge`). Consumers: `SendTab`, `TrustLinesTab`, `SettingsTab`, `Onboarding`, `useAutoLock`, `useClearCacheOnLock`.
- `src/hooks/useAutoLock.ts` -- one timer per open lock; background rule closes all; throttled per-lock `extendSession`.
- `src/lib/teardown.ts`, `src/lib/xrpl/query-keys.ts` -- per-lock scope; an account-scoped remover on the key factory (keep `check-account-invalidation` and `check-query-keys` green); `PERSISTED_ACCOUNT_DATA` unchanged unless a new persistence owner appears.
- `src/App.tsx`, `src/pages/Main.tsx`, `src/pages/Unlock.tsx` -- remove the app-wide gate; `Gate` shows Onboarding (no Wallets) else the shell; ledger hooks (`useIncomingPaymentNotifications`, `useAccountLiveUpdates`, tabs) mount only for an open Wallet; new locked-Wallet view reuses Unlock's PIN/passkey form, lockout countdown and explicit full-reset affordance; hard-lock copy no longer implies automatic deletion.
- `src/components/AppHeader.tsx` -- Wallet picker lists names for every Wallet; no address/balance for a locked one.
- Tests: `src/__tests__/locked-no-ledger-request.test.tsx` (rewrite for the new gate), `src/lib/crypto/__tests__/vault.test.ts`/`signing-check.test.ts` (in-memory IDB, `idb-keyval` mock patterns), `src/lib/__tests__/teardown.test.ts`, `src/pages/__tests__/unlock-hard-lock-reset.test.tsx`, `check-layering.mjs`/`check-query-keys.mjs` module lists (update in the same change as new modules). `docs/agents/verifying-your-work.md` for the visual pass.

## Tasks & Acceptance

**Execution:**
- `src/lib/crypto/{lock,policy,db,keystore}.ts` -- per-lock create/open, Mainnet floors, additive records, `lockId` on views -- AD-21, AD-28
- `src/store/app-store.ts`, `src/hooks/useAutoLock.ts` -- per-lock open state, timers, background rule -- AD-26
- `src/lib/teardown.ts`, `src/lib/xrpl/query-keys.ts` -- per-lock scope and account remover -- AD-26
- `src/App.tsx`, `src/pages/{Main,Unlock}.tsx`, `src/components/AppHeader.tsx`, tab consumers -- no app gate; locked-Wallet view; hooks only when open -- CAP-4
- `src/**/__tests__` and gate scripts -- one test per I/O row, plus: no module reads a Wallet's address/balance while its lock is closed; locked app issues no `getXrplClient`; migrated vault opens as before -- gates

**Acceptance Criteria:**
- Given Wallets on two locks, when one lock auto-locks, then only its Wallets are torn down and the other stays readable.
- Given a locked Wallet, when it is active, then only its name is shown and no ledger request carries its address.
- Given a Mainnet lock request with no Open Check or auto-lock under 1 minute, then the policy function refuses it with a visible reason.
- Given a vault from the previous build, when the new build starts, then its Wallets open with their existing PIN or passkey, together, with unchanged addresses.
- Given the repo, `lint`, `build`, `test`, `check:contrast` all pass.

## Spec Change Log

## Review Triage Log

### 2026-10-11 — Review pass
- verdicts: 42 findings — high 1, medium 8, low 17, false 2, maybe-false 0 (rows below group several layer findings)
- findings:
  - `[high]` `patch` Remove offered on a Wallet whose lock is closed, destroying its Seed without its Open Check — Remove only for open locks; test
  - `[medium]` `patch` Mainnet Wallet/view could join a `none` or under-1-minute lock, bypassing policy — `assertLockAllowsNetwork` before writes; tests
  - `[medium]` `patch` locked view rendered a failed lock read as empty and a failed `none` auto-open silently — error with Retry; tests
  - `[low]` `patch` `<Unlock>` not keyed by Wallet — keyed
  - `[medium]` `patch` restored session got a fresh full window — persisted `expiresAt` honoured; tests
  - `[medium]` `patch` late extend could rewrite a closed lock's session — atomic update on an existing entry only; test
  - `[medium]` `patch` any activity kept every lock alive — only the active Wallet's lock is touched; test
  - `[low]` `patch` missing expiry treated as never — fails closed; test
  - `[low]` `patch` App-PIN config error counted as a wrong PIN in createLock — typed `unsupported` before attemptPin; test
  - `[medium]` `patch` per-lock teardown left counterparty/ledger-wide queries cached — whole cache cleared when the last lock closes; test
  - `[medium]` `patch` untested: Onboarding opens the legacy lock, Settings auto-lock edit, locked Settings state and "Lock now" — tests added
  - `[medium]` `defer` PBKDF2 iterations ignored from the lock record — see deferred
  - `[low]` `defer` removing the last Wallet leaves its lock record — see deferred
  - `[medium]` `defer` no browser pass (unverified) — see deferred
  - `[false]` `reject` check-layering/check-query-keys module lists not updated — the scripts enumerate by scan and the gates are green with the new modules
  - `[false]` `reject` Testnet "any minutes" refused at 0 — 0 is not a valid auto-lock and the spec's floor concerns the positive range
  - `[low]` `reject` passkey failure feeding the PIN hard lock — AD-25 states a wrong passkey counts on the shared counter
  - `[low]` `reject` intent-alignment: all real Wallets share the legacy lock until story 5 creates locks — stated in the spec Design Notes
  - `[low]` `reject` `describeCheckFailure` string replace, "Lock wallet" label on the shared legacy lock, `none` lock churn, blank Select for 0.5 min, teardown header wording, test mock churn, other style notes — negligible

## Design Notes

Opening the legacy lock reuses `unlockVault` (one counter in the vault meta, shared via `attemptPin`); new locks hold their own wrapped Open Key, derived per `(lockId, 'open')` from the App PIN bits or a per-lock PRF salt. A new PIN lock needs proof of the App PIN from known ciphertext: the legacy wrapper if present, otherwise a verifier record written when the App PIN is created. Creation UI, signing-check UI and edits of checks are later stories, so non-legacy locks are exercised by tests and `createLock` only. Selective removal of PIN-only Seed records after a hard lock (AD-25) stays deferred: the explicit full reset is the only removal.

## Verification

**Commands:**
- `bun run lint && bun run build && bun run test && bun run check:contrast` -- expected: all green

**Manual checks (if no CLI):**
- Browser pass of the locked-Wallet view, header picker and Settings per `docs/agents/verifying-your-work.md` (record if not done).

## Auto Run Result

Status: done

**Summary:** The app-wide Unlock gate is replaced by per-lock state. The app opens with no check; Wallet names always show; the active Wallet shows a locked view (name, its own PIN/passkey prompt, lockout countdown, explicit full reset) and mounts tabs and ledger hooks only while its lock is open. Each lock has its own Open Key, auto-lock minutes and timer; backgrounding closes all. `lock.ts` can create PIN, passkey or no-check locks under `policy.ts` (Mainnet: check required, auto-lock ≥ 1 min). Teardown gained a per-lock scope.

**Files changed:** `src/lib/crypto/{lock,policy,db,keystore,auth,pin}.ts`, `src/store/app-store.ts`, `src/hooks/{useAutoLock,useClearCacheOnLock}.ts`, `src/lib/teardown.ts`, `src/lib/xrpl/query-keys.ts`, `src/App.tsx`, `src/pages/{Main,Unlock,Onboarding}.tsx`, `src/components/AppHeader.tsx`, `src/pages/tabs/*`, `docs/agents/keys-and-secrets.md`, tests.

**Review:** 42 findings — high 1, medium 8, low 17, false 2. Patched: eleven rows above (including Remove on a locked Wallet, Mainnet floor on joining a lock, restore window, extend race, activity scope, cache clear). Deferred: PBKDF2 iterations from the record, lock cleanup on last-Wallet removal, browser pass. Rejected: each row above with its reason.

**Follow-up review recommended: true** — one high and several medium entries were patched. Unverified risk: the locked-Wallet view, header and Settings were never opened in a real browser, and passkey locks only ran against a fake authenticator.

**Verification:** `bun run lint`, `bun run build`, `bun run test` (64 files, 862 tests), `bun run check:contrast` all pass. Every I/O row has a passing test. The manual browser check was not done.

**Residual risks:** in the shipped app every Wallet still shares the legacy lock until story 5 creates locks; a hard lock blocks PIN only, so a legacy lock with a passkey opens by passkey while hard-locked.

**Browser pass (2026-10-14, `775ade7`):** run; result and defects in `../browser-pass-2026-10-14.md`.
