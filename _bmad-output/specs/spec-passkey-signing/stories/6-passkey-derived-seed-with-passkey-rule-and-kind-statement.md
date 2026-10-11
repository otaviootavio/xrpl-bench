---
title: 'Passkey-Derived Seed with passkey rule and kind statement'
type: 'feature'
created: '2026-10-11'
baseline_revision: 'ac057a5b1629efb3f9238b4b994dd65886c9134c'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/docs/agents/keys-and-secrets.md'
  - '{project-root}/docs/agents/ui-and-design-system.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-passkey-signing-2026-10-10/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/specs/spec-passkey-signing/check-rules.md'
warnings: [oversized]
deferred:
  - summary: >-
      Closing or reloading the tab on the backup step leaves a persisted derived Wallet and lock that never reach the app store, and the person may not have seen the ordinal.
    evidence: |-
      createDerivedWallet writes the record before the backup step, the same shape as story 5's deferral. The ordinal is stored on the record, so a later screen (story 7 or 8) can show it again.
    location: >-
      src/components/wallet/CreateWalletFlow.tsx backup step
    severity: medium
  - summary: >-
      No restore screen: restorePasskeyWallet is a keystore function only, and its PIN Open Check path has no test.
    evidence: |-
      The spec excludes a restore screen; the copy now says so. The PIN branch passes prompts.pin before the passkey ceremony and no restore test uses a PIN.
    location: >-
      src/lib/crypto/keystore.ts restorePasskeyWallet
    severity: medium
  - summary: >-
      A passkey registered during a derived creation that later aborts (for example a cancelled Open Check prompt) stays on the authenticator.
    evidence: |-
      The web app cannot delete a credential; same as story 5's deferral.
    location: >-
      src/lib/crypto/keystore.ts createDerivedWallet
    severity: low
  - summary: >-
      No real-authenticator or virtual-authenticator pass was run; PRF, BE-flag reading and the existing-passkey ceremony have only met fakes.
    evidence: |-
      A browser run with a PRF virtual authenticator and then a real device would settle it. Test passes use the substituteCredentials seam.
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** The creation flow offers only Stored Seeds; Passkey-Derived is shown `aria-disabled` as "not available yet". There is no explicit `rp.id`, no recorded rpId, no synced-versus-device-bound statement, no WebAuthn test seam, and no way to rebuild a derived Wallet on a new device (CAP-3 passkey half, CAP-7, FR-62, FR-63, FR-70, FR-71).

**Approach:** Add the Passkey-Derived Seed Method per AD-24: the Seed is `Wallet.fromEntropy(HKDF(PRF('seed' salt)), { algorithm })`, computed per signature or reveal and never persisted. The creation flow lets the person pick an existing passkey or create a new one, states its kind, warns about the domain, and shows the ordinal once. Mainnet is `aria-disabled` while the build's origin is `*.b-cdn.net`.

## Boundaries & Constraints

**Always:**
- The Seed of a Passkey-Derived Wallet exists in no stored form: the record has no `encryptedSeed`, no `sealedSeed`, no `signing`. It is computed from PRF output only when a signature or reveal needs it, held for that one use, then dropped (AD-22 choke point unchanged).
- Derivation: the `seed` PRF salt is `SHA-256('xrpl-bench:seed:v1' | ordinal)`, the ordinal being a short number generated at creation, shown once, and stored on the record (it is public, not secret; the user writes it down so a lost phone can rebuild the Wallet). PRF output goes through HKDF to exactly 16 bytes, then `Wallet.fromEntropy(bytes, { algorithm })`. The salt and info string for this are frozen constants (a refactor must not change them; a test pins a known vector).
- Per-purpose derivation: when the same passkey is also the Open Check, the Open Check uses its own random stored PRF salt and `hkdfInfo`. No two purposes or Wallets share derived key material. Creating a second derived Wallet on the same credential needs a different ordinal; a duplicate (credential, ordinal, algorithm) is refused.
- Signing Check of a Passkey-Derived Wallet is always its passkey (policy already says so). One passkey assertion at signing yields the Seed and is the Signing Check; a derived address that differs from the record's `address` is a wrong credential (`wrong-credential`, passkey) and counts like a failed check; a cancelled prompt never counts and signs nothing.
- `webauthn.ts` sets `rp.id` explicitly through one function (`getRpId()`) from a build-configured value (a Vite define set per branch; local dev falls back to `location.hostname` inside that one function only, nowhere else). Every NEW credential record stores the `rpId` it was registered under and later assertions pass it. Credentials already stored without an rpId keep working as today.
- Passkey kind: read the backup-eligible (BE) flag from the attestation (`getAuthenticatorData()`) and store only BE on the credential. After creation the app states the consequence in plain words: synced (access to the passkey provider account opens the Wallet) or device-bound (loss needs the written Seed or a Controlling Wallet). When BE cannot be read, say it is unknown and give both consequences.
- Before creation the app states that the Seed depends on the app's domain, and that a domain change makes it unrecoverable except via the written Seed or a Controlling Wallet. Existing-or-new choice: "Use an existing passkey" asserts with no `allowCredentials` (the browser lists the device's passkeys for this rpId) and takes the credential id from the result; "Create a new passkey" registers one named after the Wallet. The derived address is confirmed (a second prompt after registration is the normal path) before anything is saved.
- PRF is capability-detected: the Passkey-Derived option is `aria-disabled` with the visible reason when capability is `no`, available with the existing "checked when the passkey is created" note when `unknown`; a failed PRF writes nothing.
- Mainnet: Passkey-Derived is `aria-disabled` with a visible reason while the configured origin host ends in `.b-cdn.net`; Testnet and Devnet allowed. The rule lives in `policy.ts` (origin passed in as context), never in a component. Related Origin Requests are not used.
- A WebAuthn test seam (AD-12): `webauthn.ts` exports a substitute and a reset for the credentials implementation; new tests use it. Existing `vi.mock` tests keep working.
- Creation is atomic as in story 5: any failure removes the lock and writes no Wallet; a refusal or cancel leaves the vault as it was. FR-72 stays enforced by policy (Mainnet passkey-only refused until story 7).
- Wallet meta carries `seedMethod`. Plain words; Mainnet stays unmistakable; no colour-only meaning; nothing styles `:focus`; `outline-none` banned; never say "open source".

**Never:**
- Storing the Seed, entropy or PRF output in any form (state, store, storage, URL, log, `largeBlob`). Deriving from `location.hostname` outside `getRpId()`. A passkey/PIN fallback.
- Written-Seed confirmation and Seed reveal behind the Signing Check as flows (story 7); editing checks (story 8); Controlling Wallet (story 9). Changing Seed Method or algorithm after creation.
- A restore screen. `restorePasskeyWallet` is built and tested as a keystore function only; its UI entry is a deferred item.
- An IndexedDB version bump; changes to existing Wallet records; changing the legacy lock.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| New passkey, Testnet | PRF yes, create new | Record has `seedMethod: passkey-derived`, ordinal, credential id, rpId, BE; no ciphertext; ordinal and kind statement shown once | No error expected |
| Existing passkey | Pick existing | Credential id taken from the assertion; address confirmed; saved | Cancel writes nothing |
| Sign / reveal | Passkey-Derived Wallet | One passkey prompt yields the Seed for that use only | Address mismatch: `wrong-credential`; cancel: not counted |
| Restore on new device | Same passkey, ordinal, algorithm | `restorePasskeyWallet` yields the same address, accepted only if it matches | Mismatch refused, nothing written |
| Mainnet on b-cdn.net | Origin host `*.b-cdn.net` | Option `aria-disabled` with reason; create refused if forced | Policy reason, nothing written |
| Mainnet on custom domain | Origin not b-cdn.net, Open passkey | Option available; creation hits the FR-72 refusal until story 7 | Policy reason |
| No PRF | Capability `no` | Option `aria-disabled` with reason | n/a |
| PRF skipped at registration | Authenticator returns no PRF on register | Second assertion derives; missing PRF at that point writes nothing | Unsupported message |
| Duplicate | Same credential, ordinal, algorithm exists | Refused | Plain message |
| Write fails | Storage error | Lock removed, no Wallet | Error shown |

</intent-contract>

## Code Map

- `src/lib/crypto/webauthn.ts` -- `registerPasskey` (L52) has `rp: { name }` with no `id` (L58) and no BE read; `assertPasskeyAndDeriveBits` (L86) takes `(credentialIdB64, salt)` with no `rpId`. Add `getRpId()`, rpId on register/assert, BE via `getAuthenticatorData()`, an assertion variant with no `allowCredentials` returning `{ credentialIdB64, bits }`, and the test seam (substitute and reset). Keep `detectPrfSupport` (L28) and `PRF_SALT`.
- `src/lib/crypto/derive.ts` (new) -- frozen `seed` salt (`SHA-256('xrpl-bench:seed:v1' | ordinal)`), HKDF-to-16-bytes, `Wallet.fromEntropy`; ordinal generator. Pure; tested with a pinned vector.
- `src/lib/crypto/db.ts` -- `SeedMethod` (L5) adds `'passkey-derived'` (also declared in `policy.ts` L66: make one source). `StoredWallet` (L43-61) gets an optional `derived: { credentialIdB64, rpId, ordinal, backupEligible }`; `SigningSeal`/`LockRecord`/`VaultMeta` gain optional `rpId`. Additive only.
- `src/lib/crypto/keystore.ts` -- `createStoredWallet` (L584) hardcodes `seedMethod: 'stored'`; add `createDerivedWallet` sharing the lock, rollback, PIN and views code. `openSeed` (L315) throws when `encryptedSeed` is absent: add the `passkey-derived` branch (assert with the seed salt, derive, compare with `address`, else `wrong-credential`). `openSigner` (L367), `signingHandleFor` (L400), `revealSeed` (L415) route through `openSeed` unchanged. `sealSeedUnderSigningCheck` (L446) must refuse a derived Wallet. Add `restorePasskeyWallet(ordinal, algorithm, network, node, prompts)`. `WalletMeta` (L28) and `toMetas` (L53) add `seedMethod`.
- `src/lib/crypto/policy.ts` -- `checkWalletRequest` (L115) refuses derived with `NOT_BUILT_YET` unless `passkeyDerivedBuilt`: drop that flag; add the PRF `no` reason, the b-cdn.net Mainnet reason (origin in context) and keep `checkSigningCheck` (L95). `describeOptions` (L170) drops `NOT_BUILT_YET`, adds origin to `OptionsContext`.
- `src/components/wallet/CreateWalletFlow.tsx` -- `passkeyDerivedBuilt: false` hardcoded (L214); Seed Method axis (L436-452); backup step (L354-377) shows ordinal and the kind statement for a derived Wallet instead of a Seed; add the domain warning and the existing-or-new choice.
- `src/store/app-store.ts` -- `normaliseWallets` (~L120-150): default `seedMethod` to `'stored'`.
- `vite.config.ts` -- `define` block: add the rpId define per branch (`dev` local, stage and prod hosts from `.github/workflows/deploy.yml` L87-88 and `docs/sprints/cicd-sprints.md` L224-225); `src/vite-env.d.ts`/globals declaration. Read-only evidence: no `.env*` files or `import.meta.env` use today.
- `docs/agents/keys-and-secrets.md`, `docs/decisions.md` §8.11, `CLAUDE.md` unlock wording -- record Passkey-Derived rules in the existing style, say the address match is the unlock proof for a Seed with no ciphertext (AD-24); no restatement.
- Tests: `src/lib/crypto/__tests__/` (`policy.test.ts` L24, L30-33, L68-70, L75-76, L98-99 reference `passkeyDerivedBuilt`; `create-stored-wallet.test.ts` has the hoisted fake idb and webauthn mock at L7-110 to extend; new `derive.test.ts`, derived create/open/restore tests), `src/components/wallet/__tests__/create-wallet-flow.test.tsx` (L149 asserts the old "not available" reason: replace).

## Tasks & Acceptance

**Execution:**
- `src/lib/crypto/derive.ts` -- seed salt, HKDF 16 bytes, `fromEntropy`, ordinal -- AD-24 derivation, frozen.
- `src/lib/crypto/webauthn.ts` -- `getRpId`, rpId on calls, BE flag, no-allowCredentials assertion, test seam -- CAP-7 and AD-12.
- `src/lib/crypto/db.ts`, `policy.ts` -- one `SeedMethod`, `derived` record field, b-cdn.net Mainnet rule, drop `passkeyDerivedBuilt` -- single rule source.
- `src/lib/crypto/keystore.ts` -- `createDerivedWallet`, `openSeed` branch, `restorePasskeyWallet`, `seedMethod` in meta -- no ciphertext, atomic.
- `src/components/wallet/CreateWalletFlow.tsx`, `src/store/app-store.ts` -- enable the option, passkey choice, domain warning, ordinal and kind statement -- CAP-3, CAP-7.
- `vite.config.ts` and docs -- rpId define per branch; documentation updates.
- Tests -- every I/O row; a pinned derivation vector; a test that the record holds no ciphertext or Seed material; a test that same-credential Open and Seed salts differ; a test that `getRpId` is the only rpId source; update the stale policy and flow tests.

**Acceptance Criteria:**
- Given a PRF-capable device on Testnet, when the person creates a Passkey-Derived Wallet with a new or an existing passkey, then the Wallet is saved with no stored Seed in any form, the ordinal and the synced-or-device-bound statement are shown, and the domain warning was shown beforehand.
- Given a Passkey-Derived Wallet, when Send, Trust Lines or reveal need the Seed, then one passkey assertion produces it for that use only, and a mismatched address is a wrong credential while a cancel counts nothing.
- Given the same passkey, ordinal and algorithm on a device with no local storage, when `restorePasskeyWallet` runs, then it yields the same address and is accepted only on a match.
- Given Mainnet and a build origin ending `.b-cdn.net`, when the Seed Method question renders, then Passkey-Derived is `aria-disabled` with its reason as visible text and creation is refused; Testnet and Devnet are unaffected.
- Given a device without PRF, when the question renders, then the option is `aria-disabled` with the visible reason.
- Given any failure after the lock is written, then no lock and no Wallet remain.
- Given the four gates, when `bun run lint`, `bun run build`, `bun run test` and `bun run check:contrast` run, then all pass.

## Spec Change Log

## Review Triage Log

### 2026-10-11 — Review pass
- verdicts: 33 findings — high 0, medium 4, low 11, false 4, maybe-false 1 (rows below stand; repeats share a route)
- findings:
  - `[medium]` `patch` Mainnet origin rule fails open when origin is absent / getRpId throws (blind, edge x2) — policy now refuses an absent origin on Mainnet; flow test added
  - `[low]` `reject` Mainnet rule is a denylist of one suffix (blind) — the intent names b-cdn.net; an allowlist would edit the spec
  - `[low]` `patch` resolveRpId treats empty RP_ID as set (blind) — `||`
  - `[low]` `reject` release build with no rpId falls back to host (blind, verification-gap, edge) — deploy workflow runs on stage/prod branches where GITHUB_REF_NAME is set; only a tag build is affected
  - `[false]` `reject` tests depend on build env (blind) — vitest.config.ts has no define; ran `GITHUB_REF_NAME=prod bun run test`, 999 passed
  - `[medium]` `patch` backup copy promises a rebuild path with no screen (blind) — copy now says there is no restore screen yet; restore gap deferred
  - `[medium]` `defer` tab close on backup step strands the Wallet and ordinal; "shown once" claim (blind, edge) — same shape as story 5's deferral; "once" wording is the spec's
  - `[false]` `reject` wrong passkey counts against and bypasses lockout (blind, edge) — AD-25: a failing passkey counts, hard lock never blocks passkey-only Wallets
  - `[low]` `reject` create/restore mismatch not counted and tries shown (blind, edge) — restore on a new device has no counter to protect; fix would change AD-25 semantics
  - `[low]` `reject` existing-passkey kind always unknown (blind, intent) — spec reads BE from the attestation only; both consequences are stated
  - `[low]` `reject` extra prompts have no copy (blind) — spec calls a second prompt normal
  - `[medium]` `patch` rpId recording and replay on existing paths, secp256k1 derived signing, legacy without rpId, localStorage scan untested (blind, verification-gap) — tests added
  - `[low]` `reject` assertAny picks any passkey; two-tab duplicate race (blind, edge x2) — address is confirmed before saving and a wrong passkey fails closed; two-tab race rejected the same way in story 5
  - `[medium]` `patch` addNetworkView adds a Mainnet view to a derived Wallet without policy (edge x2) — checkWalletRequest now runs; four tests added
  - `[low]` `reject` getRpId/SecurityError unhandled (edge) — getRpId falls back and never throws; a rpId mismatch makes the browser throw and creation fails closed
  - `[low]` `reject` rpId versus serving host mismatch (edge) — the browser rejects a mismatched rpId; fails closed
  - `[low]` `defer` orphan passkey after aborted derived creation (edge) — web app cannot delete credentials
  - `[low]` `patch` host-reader regex too narrow (edge) — extended
  - `[low]` `reject` deletion of passkeyDerivedBuilt clean (edge) — no defect reported
  - `[medium]` `defer` restorePasskeyWallet PIN path untested (verification-gap) — no UI entry yet
  - `[low]` `reject` app-store passkey-derived normalisation untested (verification-gap) — no named harm
  - `[low]` `reject` vite resolveRpId unverified (verification-gap) — build configuration, Actions sets GITHUB_REF_NAME
  - `[low]` `reject` openDerivedSeed fail-closed branches untested (verification-gap) — loud throw on unreachable states
  - `[low]` `reject` UI and keystore tests never meet (intent) — both layers are tested against the same seam; a browser pass is deferred
  - `[low]` `reject` "origin" means build-configured rpId host, not page host (intent) — AD-24 says rpId comes from the build's configured origin
  - `[medium]` `defer` virtual-authenticator pass not done (intent) — unverified; see deferred list
  - `[false]` `reject` blind: docs and meta edits outside the Create flow (intent) — spec lists them
  - `[low]` `reject` blind: duplicate-ordinal collision returns refused with no retry (blind) — 6 digits random; a collision is rare and the person can retry
  - `[low]` `reject` blind: fake authenticator monkey-patches get (blind) — test readability only
  - `[low]` `reject` blind: unknown-kind sentence uses charAt string surgery (blind) — copy is covered by a test
  - `[low]` `reject` blind: policy.ts hard-codes a CDN suffix duplicating hostnames (blind) — the one rule the spec names, in the one place rules live
  - `[maybe-false]` `reject` blind: passkey Open Check plus existing passkey is three prompts (blind) — would be low if true
  - `[low]` `reject` edge: persisted derived record has no kind for Mainnet UI (edge) — none named
  - `[low]` `reject` edge: assertAny returns a credential used by another lock (edge) — salts and info differ per purpose, as the spec allows

## Design Notes

"Not device-stored" in AD-24 means the salt is reconstructible from the ordinal, not that the device cannot hold it: signing needs the salt every time, so the record keeps the ordinal (public). `address` is the record's `keyAddress` until AD-18's field exists. Ordinals are generated at random (6 digits) and uniqueness is enforced only locally; the same (credential, ordinal, algorithm) on another device is the same Wallet by design.

## Verification

**Commands:**
- `bun run lint` -- expected: no errors
- `bun run build` -- expected: `tsc -b` and Vite build succeed
- `bun run test` -- expected: all tests pass
- `bun run check:contrast` -- expected: pass

**Manual checks (if no CLI):**
- With a browser and a virtual authenticator (PRF), create a Testnet Passkey-Derived Wallet with a new and with an existing passkey and send a payment; check the Mainnet `aria-disabled` reason. Note it if not done; a real device is unverified.

## Auto Run Result

Status: done

**Summary:** Passkey-Derived Seeds are offered in the creation flow where PRF is available: the Seed is computed from PRF output (frozen salt and HKDF to 16 bytes) per signature or reveal and stored in no form. The flow asks new or existing passkey, warns about the domain first, then shows the ordinal and the synced, device-bound or unknown statement. Mainnet is `aria-disabled` while the build origin is `*.b-cdn.net`, or the origin is unknown, in `policy.ts`, including for added network views. `rp.id` is explicit and recorded; a WebAuthn test seam exists.

**Files:** `src/lib/crypto/derive.ts`, `webauthn.ts`, `db.ts`, `policy.ts`, `keystore.ts` (`createDerivedWallet`, `openSeed` branch, `restorePasskeyWallet`, `addNetworkView` check), `lock.ts`, `auth.ts`, `src/components/wallet/CreateWalletFlow.tsx`, `src/store/app-store.ts`, `vite.config.ts` (`__RP_ID__`), docs, and tests (`derive.test.ts`, `derived-wallet.test.ts`, updated policy and flow tests).

**Review:** patches applied 6 entries (medium 4, low 2); deferred 4 (medium 3, one unverified; low 1); the rest rejected with the reasons logged above.

**Follow-up review recommended:** true — four medium entries were patched, and the passkey, PRF and BE-flag path has only met fakes, no browser or real authenticator.

**Verification:** `bun run lint`, `bun run build`, `bun run test` (74 files, 1006 tests) and `bun run check:contrast` pass after the patches; also `GITHUB_REF_NAME=prod bun run test` passed before them. No browser or authenticator run.

**Residual risks:** see the deferred list. On Mainnet with a passkey Open Check a derived Wallet hits the FR-72 refusal until story 7. Restore has no screen.
