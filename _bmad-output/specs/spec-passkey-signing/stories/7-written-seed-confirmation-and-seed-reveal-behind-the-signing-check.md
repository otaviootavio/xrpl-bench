---
title: 'Written-Seed confirmation and Seed reveal behind the Signing Check'
type: 'feature'
created: '2026-10-11'
baseline_revision: '43d634de7c6900a11a80b0cb046a62e38ae8d452'
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
      A cancel at the confirm step of a derived Mainnet creation leaves a registered passkey on the authenticator.
    evidence: |-
      The address needs PRF output, so the passkey exists before the Seed can be shown. The web app cannot delete a credential; same as story 6's deferral. The docs' "no credential" claim holds for stored creation only.
    location: >-
      src/lib/crypto/keystore.ts createDerivedWallet
    severity: low
  - summary: >-
      No browser or real-authenticator pass: the Mainnet passkey-only creation, confirm step and reveal have only met fakes.
    evidence: |-
      A PRF virtual authenticator run, then a real device, would settle it.
    severity: medium (unverified)
  - summary: >-
      restorePasskeyWallet forwards confirmWrittenSeed but no test pins the forwarding; restore has no screen.
    evidence: |-
      A Mainnet passkey-Open restore test (refused without the callback, accepted with it) would pin it.
    location: >-
      src/lib/crypto/keystore.ts restorePasskeyWallet
    severity: low
---

<intent-contract>

## Intent

**Problem:** FR-72's written-Seed rule is only a refusal today (`WRITTEN_SEED_REASON`): a Mainnet Wallet whose only check is a passkey can never be created. Seed reveal (CAP-6) runs the Signing Check but a Standard Wallet's reveal never re-passes its Open Check, the confirm dialog does not say which check will be asked, and nothing guards against copy claiming a key "cannot be exported".

**Approach:** Creation (stored and derived) gains a pre-write step that shows the Seed and asks the person to type back three random 4-character groups of it; only then is anything written, and the record notes the confirmation. Reveal re-passes the Open Check for a Standard Wallet that has one, keeps the Signing Check and confirm dialog for the rest, and a copy guard test bans "cannot be exported" wording.

## Boundaries & Constraints

**Always:**
- One rule source: `policy.ts` decides. `WalletRequest` gains `canConfirmWrittenSeed` (the caller will make the person write and confirm before any write) beside `writtenSeedConfirmed`; `requiresWrittenSeed` and its refusal stay. Testnet and Devnet never ask.
- "Word-confirmed" for an XRPL family Seed (one base58 string, no words) means: the Seed is split into 4-character groups; the challenge is three distinct, randomly chosen group positions (1-based character ranges shown, e.g. "characters 5–8"); the answers must match exactly (trim only). The positions are not secret; the typed answers live in uncontrolled inputs and are cleared. Pure helper, rng injectable.
- `createStoredWallet` and `createDerivedWallet` take an optional `ctx.confirmWrittenSeed(seed): Promise<boolean>` (a callback, AD-1; `crypto` never imports UI). When the combination requires a written Seed it is called after the Seed exists and BEFORE any credential, lock or Wallet is written (derived: after the address is derived and checked, before the lock); `false` returns `cancelled` and writes nothing; no callback means `refused` with the existing reason. On success the record gets `writtenSeedConfirmedAt` (additive, optional; story 8 reads it).
- The Seed reaches the flow only through that callback and the existing result, held in a ref and cleared on leaving the step.
- Reveal: `revealSeed` for a Standard Wallet whose lock has an Open Check re-passes it, without touching the session (`openLock` gets `persist: false`): PIN lock → `prompts.pin`; passkey lock → passkey; legacy `either` → passkey when available else PIN. A Standard Wallet with Open Check `none` needs only the confirm dialog. A sealed Wallet uses its Signing Check; a Passkey-Derived Wallet one passkey assertion (always revealable). Wrong PIN counts, cancel never does (existing).
- Confirm dialog states which check will be asked. No screen, string or doc says the key "cannot be exported".
- Plain words; Mainnet unmistakable; no colour-only meaning; nothing styles `:focus`; `outline-none` banned; never say "open source".

**Never:**
- Storing the Seed or the typed answers anywhere (state, store, storage, URL, log). A second copy of the policy rule in a component.
- Edits of checks (story 8), a restore screen, Controlling Wallet. An IndexedDB version bump. Changing `sealedSeed`/`signing`/legacy records.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Mainnet passkey-only stored | Open passkey, Signing passkey, callback returns true | Created; record has `writtenSeedConfirmedAt` | n/a |
| Same, cancel at confirm | callback returns false | `cancelled`, no lock, no Wallet, no credential | Flow returns to questions |
| Same, no callback | direct keystore call | `refused` (written-Seed reason) | Nothing written |
| Testnet / Mainnet with a PIN check | any | Callback never called | n/a |
| Mainnet passkey-derived, custom domain | Open passkey | Seed shown, confirmed, then ordinal step | Cancel writes nothing |
| Wrong group typed | mismatch | "That does not match. Check what you wrote." stays on step, unlimited tries | No Wallet written |
| Reveal Standard, PIN lock | confirm, then PIN | Seed on correct PIN; wrong PIN counts | cancel: no seed, not counted |
| Reveal Standard, Open Check none | confirm only | Seed shown | n/a |
| Reveal Passkey-Derived | confirm, passkey | Seed shown | mismatch `wrong-credential` |

</intent-contract>

## Code Map

- `src/lib/crypto/policy.ts` -- `requiresWrittenSeed` (L130), `checkWalletRequest` (L142; refusal L151), `WRITTEN_SEED_REASON` (L115, says "not available yet": reword), `describeOptions`/`OptionsContext` (L170+). Add `canConfirmWrittenSeed`, and `writtenSeedRequired` on `DescribedOptions`.
- `src/lib/crypto/keystore.ts` -- `createStoredWallet` (~L636; policy call, Seed generated, lock write), `createDerivedWallet` (~L770; address derived before the lock), `restorePasskeyWallet`, `revealSeed` (L459), `openSeed` (L358). Add `confirmWrittenSeed` to ctx, `writtenSeedConfirmedAt`, Open Check re-pass in `revealSeed`. `Prompts` (L232) has only `pin`.
- `src/lib/crypto/lock.ts` -- `openLock` (L207) persists via `finish(…, persist=true)` (L196): add `persist?: false` option; `getLockInfo` (L110) gives `openCheck`/`pin`/`passkey`.
- `src/lib/crypto/db.ts` -- `StoredWallet` (~L51): add optional `writtenSeedConfirmedAt`.
- `src/lib/seed-confirmation.ts` (new) -- `pickChallenge(length, rng)`, `answersMatch(seed, challenge, answers)`; pure, tested.
- `src/components/wallet/CreateWalletFlow.tsx` -- `handleCreate` (L~245), step type (L52), backup steps (L~423-470), `describeOptions` call (L~232): add a `confirm-seed` step driven by a promise resolved through a ref, pass `canConfirmWrittenSeed: true`; for a confirmed stored Wallet skip the post-create seed backup and finish directly.
- `src/pages/tabs/SettingsTab.tsx` -- `handleConfirmReveal` (L~175), reveal dialog (L601): say which check is asked. Its test `src/pages/tabs/__tests__/settings-reveal.test.tsx` mocks `@/lib/crypto/lock` and `keystore` wholesale: keep their shape.
- `src/components/wallet/SeedReveal.tsx` -- copy "ONLY way to recover" is wrong for a Passkey-Derived Wallet; read-only unless adjusted.
- Tests: `src/lib/crypto/__tests__/create-stored-wallet.test.ts`, `derived-wallet.test.ts`, `policy.test.ts` (stale `WRITTEN_SEED_REASON` cases), `signing-check.test.ts` (reveal), `src/components/wallet/__tests__/create-wallet-flow.test.tsx`, `src/pages/tabs/__tests__/settings-reveal.test.tsx`; new `seed-confirmation.test.ts` and a copy-guard test.
- Docs: `docs/agents/keys-and-secrets.md`, `docs/decisions.md` §8 -- record the rule in existing style; no restatement.

## Tasks & Acceptance

**Execution:**
- `src/lib/seed-confirmation.ts` -- challenge and matcher -- CAP-8 word-confirm.
- `src/lib/crypto/policy.ts`, `db.ts` -- `canConfirmWrittenSeed`, `writtenSeedRequired`, reworded reason, `writtenSeedConfirmedAt` -- one rule source.
- `src/lib/crypto/keystore.ts`, `lock.ts` -- confirm callback in both creations and restore, Open Check re-pass in `revealSeed`, `persist: false` -- atomic, fail closed.
- `src/components/wallet/CreateWalletFlow.tsx` -- confirm-seed step -- CAP-8 UI.
- `src/pages/tabs/SettingsTab.tsx` -- reveal dialog copy -- CAP-6.
- Tests and docs -- every I/O row, a test that removing the confirm fails Mainnet passkey-only creation, a copy-guard scan for "cannot be exported", reveal never persists a session.

**Acceptance Criteria:**
- Given Mainnet with a passkey Open Check and a passkey or Standard Signing Check, when the person creates a Wallet and types the challenged groups correctly, then it is created and records the confirmation; a wrong answer or cancel writes nothing.
- Given Testnet, Devnet, or a Mainnet Wallet with a PIN check, when created, then no Seed confirmation is asked.
- Given a Standard Wallet with an Open Check, when its Seed is revealed, then confirm plus the Open Check pass are required and the session is unchanged; given Open Check none, confirm alone.
- Given a sealed or Passkey-Derived Wallet, when revealed, then its Signing Check runs after confirm and a Passkey-Derived Seed is shown on success.
- Given the codebase, no user-visible string says the key cannot be exported.
- Given the four gates, `bun run lint`, `bun run build`, `bun run test`, `bun run check:contrast` all pass.

## Spec Change Log

## Review Triage Log

### 2026-10-11 — Review pass
- verdicts: 54 findings — high 0, medium 4, low 24, false 6, maybe-false 0 (rows grouped by claim; repeats across layers share a route)
- findings:
  - `[medium]` `patch` Cancel/Check stay live after a correct answer; Cancel mid-write shows questions while a Wallet is created (blind, edge x2) — buttons disabled once settled; test added
  - `[medium]` `patch` reveal dialog names PIN for a legacy lock whose reveal asks the passkey (blind, edge x3, verification-gap, intent) — legacy Standard Wallets get a generic "passkey or App PIN" sentence; test added
  - `[medium]` `patch` no reveal test on a migrated legacy lock; migration tests weakened (blind, edge, verification-gap) — PIN-only and `either` (supported, unsupported) reveal tests added
  - `[medium]` `patch` no test for unmount mid-confirm or the finish-step retry (blind, verification-gap) — two flow tests added
  - `[low]` `patch` passkey reveal clears the PIN failure counter (blind, edge x2) — `resetFailures` skipped when `persist === false`; test added
  - `[low]` `patch` confirm callback throwing could leave an App PIN (edge) — existing catch already abandons; test added, no code change
  - `[low]` `defer` derived cancel leaves an orphan passkey (blind, edge) — carried from story 6; docs claim holds for stored creation only
  - `[low]` `defer` restore forwarding untested (verification-gap) — no screen yet
  - `[medium]` `defer` no browser or authenticator pass (intent) — unverified
  - `[low]` `reject` `either` should fall back to the PIN when the passkey is cancelled (edge) — the spec says passkey when available, else PIN
  - `[low]` `reject` failure after confirm discards the written Seed; retry makes a new one (blind) — the error says "Nothing was created" and a retry shows a fresh confirm step
  - `[low]` `reject` group 1 predictable, trailing remainder never asked, positions hard to count (blind, edge) — three of seven groups are random; spec fixes the 4-character scheme
  - `[low]` `reject` pickChallenge with a NaN rng (edge) — rng is injected by tests only
  - `[low]` `reject` copy guard: wrapped lines, over/under matching, file types (blind, edge x3, intent) — guard is a backstop for the phrase the spec names; wrapping is unlikely in practice
  - `[false]` `reject` lockout can change while the PIN prompt waits (edge) — `openLock`'s PIN path goes through `attemptPin`, which re-checks the lockout
  - `[false]` `reject` stray sealedSeed skips the re-pass (verification-gap) — `openSeed` fails closed on that record
  - `[false]` `reject` spec file stale (blind) — updated at finalisation
  - `[low]` `reject` Open Check none reveals on confirm alone; Signing Check reinterpreted (intent) — the spec's stated assumption
  - `[low]` `reject` flow tests mock the keystore; no end-to-end chain (intent) — both layers share the same callback contract; browser pass deferred
  - `[low]` `reject` revealCheckSentence duplicates the keystore's rule (blind, edge) — now generic where the two can differ
  - `[low]` `reject` finishBackup(fromCreate) bypasses the busy guard (verification-gap) — internal call only; retry test added
  - `[low]` `reject` autofill may keep typed groups (edge) — autoComplete off; groups alone are not a Seed
  - `[low]` `reject` writtenSeedConfirmedAt has no reader (blind) — story 8 reads it
  - `[low]` `reject` decisions.md says "built" without a browser pass (blind) — the verification gap is recorded in the deferred list

## Design Notes

A pre-write callback, not a two-phase create, keeps the Seed inside `lib/crypto` until the person is ready and keeps creation atomic. For a derived Wallet on Mainnet the Seed is computed at creation anyway (the address is checked), so it can be shown then. Restore stays refused for Mainnet passkey-only unless a caller supplies a callback; it has no screen.

## Verification

**Commands:**
- `bun run lint` -- expected: no errors
- `bun run build` -- expected: `tsc -b` and Vite build succeed
- `bun run test` -- expected: all tests pass
- `bun run check:contrast` -- expected: pass

**Manual checks (if no CLI):**
- With a browser and a PRF virtual authenticator, create a Mainnet passkey-only Wallet (custom domain build) and reveal a Seed. Note if not done; unverified on a real device.

## Auto Run Result

Status: done

**Summary:** Mainnet passkey-only Wallets (stored and derived) can now be created: a pre-write step shows the Seed and asks for three random 4-character groups; only then is anything written, and the record gets `writtenSeedConfirmedAt`. Reveal re-passes the Open Check for a Standard Wallet (session untouched, PIN counter untouched on a passkey pass), uses the Signing Check for sealed Wallets and one passkey assertion for Passkey-Derived ones; the confirm dialog names the check; a copy guard bans "cannot be exported" wording.

**Files:** `src/lib/seed-confirmation.ts`, `src/lib/crypto/{policy,db,lock,keystore}.ts`, `src/components/wallet/{CreateWalletFlow,SeedReveal}.tsx`, `src/pages/tabs/SettingsTab.tsx`, docs (`keys-and-secrets.md`, `decisions.md` §15), and tests (new `seed-confirmation`, `copy-guard`; extended create, derived, policy, reveal, flow tests).

**Review:** patches applied 6 entries (medium 4, low 2); deferred 3 (one unverified medium, two low); the rest rejected with reasons in the log.

**Follow-up review recommended:** true — four medium entries were patched, and the passkey/PRF creation, confirm step and reveal have only met fakes, no browser or authenticator.

**Verification:** `bun run lint`, `bun run build`, `bun run test` (76 files, 1056 tests) and `bun run check:contrast` pass after the patches. No browser or authenticator run.

**Residual risks:** see the deferred list; a derived Mainnet cancel can leave an unused passkey; restore has no screen.

**Browser pass (2026-10-14, `775ade7`):** run; result and defects in `../browser-pass-2026-10-14.md`.
