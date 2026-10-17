---
title: 'Structural Signing Check and one-use Signer'
type: 'feature'
created: '2026-10-11'
status: 'done'
baseline_revision: '17fc9705056e2d6f64c6140d765b29dc12cbbe5f'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/docs/agents/keys-and-secrets.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-passkey-signing-2026-10-10/ARCHITECTURE-SPINE.md'
warnings: []
deferred:
  - summary: >-
      Parallel PIN attempts can all pass the lockout check before any failure is recorded, so concurrent guesses can exceed the hard-lock limit.
    evidence: |-
      attemptPin checks lockout and records failure in separate transactions; the count itself is transactional. A faithful test needs a fake IndexedDB that models concurrent transactions. Unreachable from today's UI (modal, single prompt).
    location: >-
      src/lib/crypto/pin.ts attemptPin
    severity: medium
  - summary: >-
      A PIN-sealed Wallet has no recovery from a PIN hard lock short of a full reset; Unlock.tsx's reset copy still says re-import.
    evidence: |-
      AD-25's Unlock reset rewrite is a later story; no UI creates a sealed Wallet yet, so it cannot be hit today.
    location: >-
      src/pages/Unlock.tsx
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** Today `unlockWalletForSigning` hands a live `Wallet` to a screen and the session key opens every Seed, so a sign-time PIN or passkey prompt could never be real (CAP-5, FR-66..68).

**Approach:** A Wallet may carry a Signing Check: its Seed is re-encrypted under a random Signing Key wrapped only by the PIN or a passkey (AD-23). `keystore.openSigner` runs that check inside `lib/crypto` and returns a one-use `Signer`; `submitAndClassify` takes a signing handle, not a `Wallet`, and opens it after autofill and before the ledger window is fixed (AD-22). Every PIN attempt, from any check, goes through one transactional counter and one hard lock (AD-25).

## Boundaries & Constraints

**Always:** A Wallet with a Signing Check has no `encryptedSeed` and its sealed Seed is never decryptable with the session/Open key; a check is proven by decrypting, never deriving. The Signing Key and the Seed exist only in closures cleared in `finally`; no Signer outlives one `sign`. Order inside the choke point: autofill → fee cap → open Signer → `LastLedgerSequence` from the validated ledger → sign → submit; `dispose` always runs. `xrpl` never imports `crypto`; `Signer`/`SigningHandle` are structural types in `writes.ts`. PIN: a wrong PIN counts, a wrong passkey assertion counts, a cancelled/dismissed passkey prompt never does; results are typed `ok | wrong-credential | cancelled | unsupported | locked-out`, never a message holding key material; the prompt callback receives tries remaining. Hard lock blocks PIN checks and never blocks a passkey-only check. Sign and Seed-reveal share one check. Every transaction type goes through it. Money stays strings/BigInt.

**Never:** Add a code path that decrypts a Seed with the session key for a Wallet that has a Signing Check. Keep or return a `Wallet`/Seed from any `keystore` export except `revealSeed`. Persist a Signing Key, a PBKDF2 output or a Seed. Build prompt dialogs, creation flow, edit UI, per-Wallet Open Check or the Unlock-screen reset rewrite (stories 4, 5, 8). Bump the IndexedDB version. Count a cancelled prompt.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Standard Wallet signs | no Signing Check, session key given | Signer from the Open-key Seed; `dispose` clears it | no session key → throws `Wallet is locked`, nothing signed |
| PIN check ok | `signing: pin`, correct PIN | Signer; counter reset | — |
| Wrong PIN | wrong PIN | `wrong-credential` with `triesRemaining`; counter +1 in one transaction | nothing signed |
| Hard lock / backoff | counter at limit or `lockedUntil` future | `locked-out`, prompt never asked | — |
| Passkey check ok | `signing: passkey`, assertion ok | Signer | — |
| Passkey cancelled | prompt dismissed / `NotAllowedError` | `cancelled`; counter unchanged | — |
| Wrong passkey | assertion yields a key that cannot unwrap | `wrong-credential`; counter +1 | — |
| Session key only | Signing Wallet, session key, prompts cancel | no Signer, no Seed from any keystore export | test asserts the Seed appears in no return value |
| Reveal | Signing Wallet, correct check | Seed string returned from `revealSeed` only | wrong/cancel → typed result, no Seed |
| Seal | Standard Wallet → PIN or passkey | one transaction: `encryptedSeed` deleted, `sealedSeed`+`signing` written, address unchanged | any failure leaves the old record untouched; passkey without PRF → `unsupported` |
| Window | prompt takes long | `LastLedgerSequence` is validated ledger + 20 read after open | a throwing open submits nothing, depth lowered |
| Unresolved algorithm | legacy Wallet | resolved as today on first open | address mismatch → fails closed |

</intent-contract>

## Code Map

- `src/lib/xrpl/writes.ts` -- add `Signer`, `SigningHandle { address; open() }`; `submitAndClassify`, `submitXrpPayment`, `submitIssuedPayment`, `submitTrustSet` take a handle where they took a `Wallet` (`wallet.address` → `signing.address`); reorder per AD-22; `signed = signer.sign(prepared)`; `dispose` in `finally`.
- `src/lib/crypto/pin.ts` -- own the shared counter: `getLockoutState`, `recordFailure`/`resetFailures` (transactional on `vault` meta), constants (`MAX_ATTEMPTS_BEFORE_HARD_LOCK`, backoff), `attemptPin(pin, proof)`. `auth.ts` re-exports `getLockoutState` and calls these (Unlock.tsx and `vault.test.ts` import `getLockoutState` from `auth`).
- `src/lib/crypto/webauthn.ts` -- `assertPasskeyAndDeriveBits(credentialIdB64, salt = PRF_SALT)`; export a `isCancelled(err)` predicate.
- `src/lib/crypto/db.ts` -- `StoredWallet.encryptedSeed` optional; add `sealedSeed`, `signing: SigningSeal` (additive); `sealSeedAtomically` via `mutateStoredWallet`.
- `src/lib/crypto/keystore.ts` -- remove `unlockWalletForSigning`; add `openSigner`, `signingHandleFor` (throws `SigningCheckError`), `sealSeedUnderSigningCheck`; `revealSeed(walletId, ctx)` uses the same open path; `SigningContext { openKey; prompts }`, `Prompts`, `CheckResult`. Algorithm resolution logic moves into the open path.
- `src/pages/tabs/SendTab.tsx`, `TrustLinesTab.tsx`, `SettingsTab.tsx` -- build the handle; Send's post-open destination re-check runs inside `open` (after the check, before signing) and aborts with a sentinel; Settings reveal passes a ctx. `src/lib/crypto/unavailablePrompts` (null prompts) until stories 4/5 add the dialogs.
- `scripts/check-write-choke-point.mjs`, `check-layering.mjs` -- no change expected; confirm `signer.sign` lives only in `writes.ts`.
- Tests: `src/lib/xrpl/__tests__/writes.test.ts` (fake client pattern), `src/lib/crypto/__tests__/{keystore,vault,migration}.test.ts` (in-memory IDB mock), send/trustlines tabs tests mocking `unlockWalletForSigning`, `tx-in-flight-bridge.test.ts`.

## Tasks & Acceptance

**Execution:**
- `src/lib/crypto/{pin,auth}.ts` -- shared transactional counter and `attemptPin` -- AD-25
- `src/lib/crypto/webauthn.ts`, `db.ts` -- salt parameter, cancel predicate, sealed-Seed fields -- AD-21/23
- `src/lib/crypto/keystore.ts` -- `openSigner`, `signingHandleFor`, `sealSeedUnderSigningCheck`, `revealSeed`; delete `unlockWalletForSigning` -- AD-22/23
- `src/lib/xrpl/writes.ts` -- handle-based choke point with the new order -- AD-22
- `src/pages/tabs/{SendTab,TrustLinesTab,SettingsTab}.tsx` -- adopt handle/ctx -- AD-22
- `src/**/__tests__` -- one test per I/O row; AD-23 property test; counter shared between unlock and signing; order test (open after autofill, window read after open); update mocks broken by the removal -- gates

**Acceptance Criteria:**
- Given a Wallet with a Signing Check and an unlocked session, when any keystore function is called with the session key and prompts that cancel, then no return value contains the Seed and no Signer is produced.
- Given a PIN Signing Check, when wrong PINs are entered across sign and unlock, then one count advances and the hard lock blocks both; a passkey-only Wallet still opens.
- Given a payment, when signing, then `LastLedgerSequence` is set after the check succeeds and a failed check submits nothing.
- Given the repo, when `lint`, `build`, `test`, `check:contrast` run, then all pass.

## Spec Change Log

## Review Triage Log

### 2026-10-11 — Review pass
- verdicts: 41 findings — high 0, medium 4, low 17, false 5, maybe-false 0 (rows below group several layer findings)
- findings:
  - `[medium]` `patch` openSeed let the session key open a record declaring a Signing Check but missing its seal — now throws, test added
  - `[low]` `patch` Settings reveal collapsed failures to one string — uses `describeCheckFailure`
  - `[medium]` `patch` Settings reveal handling of CheckResult untested — `settings-reveal.test.tsx`
  - `[medium]` `patch` caller-set LastLedgerSequence and non-numeric validated index untested — two tests
  - `[medium]` `patch` Send refusal paths did not assert `dispose` — spy asserted on four paths
  - `[low]` `patch` trustlines test mis-indented, `signed` not reset — fixed
  - `[medium]` `defer` parallel PIN guesses can exceed the hard lock — see deferred
  - `[medium]` `defer` no recovery from hard lock for a sealed Wallet — see deferred
  - `[false]` `reject` unlock counts a cancelled passkey — auth.ts maps NotAllowedError/AbortError to a cancel before any count
  - `[false]` `reject` addNetworkView/removeWallet assume `encryptedSeed` — neither reads it
  - `[false]` `reject` PIN change orphans sealed Wallets — no PIN-change feature exists
  - `[low]` `reject` other auth.ts getVaultMeta/putVaultMeta writers — setup-time only, not concurrent with checks
  - `[low]` `reject` non-unwrap passkey faults counted, raw errors rethrown, seal prompts before PIN check, counter reset on failed seal, `void wallet`, extractable key, un-scrubbed closures — cosmetic or unreachable until sealed Wallets exist; JS cannot scrub memory
  - `[low]` `reject` open() never settling keeps in-flight raised; Sequence/Fee stale after a long prompt; dropped client — the order is dictated by AD-22 and the client is held across the wait
  - `[low]` `reject` address not asserted for resolved algorithms — a mismatched Account is rejected by the ledger
  - `[low]` `reject` NotAllowedError conflation; stale `revealSeed` mocks; duplicated test helpers; tests mock the choke point; writes tests for other submit types; unresolved-sealed test; allow-directive in keystore; spec lacks verification (filled here) — negligible
  - `[low]` `reject` intent-alignment: no UI creates a sealed Wallet, prompts stubbed, test behavioural not static — stated scope limit in the story (stories 4, 5, 8)

## Design Notes

`submitAndClassify` cannot take an already-open Signer and also run the check after autofill, so it takes a `SigningHandle` whose `open()` runs the check; `Signer` is what `open()` returns. A passkey wrong-assertion counting toward the shared counter follows AD-25 literally; a passkey-only Wallet ignores hard lock so it can never be blocked by it. Sealing is the minimal write that gives a Wallet a Signing Check; the full edit flow, policy function and prompt dialogs belong to stories 4, 5 and 8, so no UI creates a sealed Wallet yet.

## Verification

**Commands:**
- `bun run lint && bun run build && bun run test && bun run check:contrast` -- expected: all green

## Auto Run Result

Status: done

**Summary:** A Wallet can now carry a Signing Check: its Seed is re-encrypted under a random Signing Key wrapped only by the PIN or a passkey, and the session key cannot open it. `keystore.openSigner` runs the check and returns a one-use `Signer`; `submitAndClassify` takes a `SigningHandle` and runs autofill → fee cap → check → `LastLedgerSequence` (validated + 20) → sign → submit. One transactional PIN counter and hard lock is shared by unlock and signing.

**Files changed:** `src/lib/xrpl/writes.ts`; `src/lib/crypto/{pin,auth,db,keystore,webauthn}.ts`; `src/pages/tabs/{SendTab,TrustLinesTab,SettingsTab}.tsx`; tests (`signing-check`, `settings-reveal`, `writes`, and adjusted send/trustlines/bridge/migration/vault tests).

**Review:** 41 findings — high 0, medium 4, low 17, false 5. Patched: six (fail-closed on an incomplete sealed record, reveal copy, reveal/window/dispose tests, test hygiene). Deferred: parallel-guess hard-lock bound, hard-lock recovery for sealed Wallets. Rejected: each row above with its reason.

**Follow-up review recommended: true** — three medium entries were patched. Unverified risk: passkey/PRF sealing and signing against a real authenticator, and real IndexedDB transaction behaviour, are tested only with stubs.

**Verification:** `bun run lint`, `bun run build`, `bun run test` (60 files, 800 tests), `bun run check:contrast` all pass. Every I/O row has a passing test.

**Residual risks:** no UI creates a sealed Wallet and the screens pass `unavailablePrompts`, so a sealed Wallet reports "cancelled" from any screen until stories 4/5 add the dialogs; a successful passkey check does not reset the PIN counter.
