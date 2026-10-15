---
title: 'Creation flow for Stored Seed Wallets, with check policy'
type: 'feature'
created: '2026-10-11'
baseline_revision: '53b17f3c4df5eb5d365aa1d7f2de7a05fbb7e8c0'
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
      Closing or reloading the tab on the Seed backup step leaves a persisted Wallet whose Seed was never shown.
    evidence: |-
      createStoredWallet writes the Wallet before the backup screen; only the store commit waits for it. Onboarding behaved the same before this story. For a sealed Wallet the Seed can be revealed only once story 7 lands.
    location: >-
      src/components/wallet/CreateWalletFlow.tsx backup step
    severity: medium
  - summary: >-
      A passkey registered during a creation that later aborts stays on the authenticator, and Open passkey plus Signing passkey means two registrations with no copy saying so.
    evidence: |-
      The vault rolls back but the device credential cannot be removed by the web app.
    location: >-
      src/lib/crypto/keystore.ts createStoredWallet
    severity: low
  - summary: >-
      A Testnet Wallet created with a 30 second auto-lock shows a blank auto-lock select in Settings, which only offers 1, 5, 15 and 30 minutes.
    evidence: |-
      Reported by the implementation. Story 8 (edit checks) reworks that control.
    location: >-
      src/pages/tabs/SettingsTab.tsx
    severity: low
  - summary: >-
      No real-authenticator pass, no light/dark or narrow-width pass, and no real payment from a sealed Wallet in a browser.
    evidence: |-
      One Playwright virtual-authenticator run created a passkey-open, PIN-signing Wallet and revealed its Seed. Everything else is gates and jsdom.
    severity: medium (unverified)

---

<intent-contract>

## Intent

**Problem:** A new Wallet is made with one fixed recipe: the App PIN, the legacy lock, a Seed under the session key. Nothing in the UI lets a person pick a signature type, an Open Check, an auto-lock or a Signing Check, so the per-Wallet locks (story 4) and the Signing Check (story 3) exist but no real Wallet can use them (CAP-1, CAP-3 stored half, FR-60, FR-64, FR-67).

**Approach:** One creation flow that asks one question per axis in the FR-60 order: Network and Node, Seed Method, signature type, Open Check with auto-lock, Signing Check. Every question has a pre-selected answer. `lib/crypto/policy.ts` is extended to be the only place that says which combinations are legal, and the flow renders its answer. A new keystore create writes a new lock and a new Stored Seed Wallet, with the Seed sealed under its Signing Check when one is chosen. The flow serves first-run onboarding and Settings "Add wallet". The Signing prompt for the PIN gets a real dialog, so a Wallet this flow creates can sign.

## Boundaries & Constraints

**Always:**
- `policy.ts` decides; the creation function calls it and refuses before any write; the UI renders its verdict and reasons. No legality rule is written in a component.
- Combinations follow `check-rules.md`: Stored Seed allows Standard, passkey only and App PIN only. Passkey-Derived allows passkey only (the option exists in policy; it is not offered yet).
- Mainnet needs an Open Check (App PIN or passkey) and auto-lock of at least 1 minute. Testnet and Devnet may use `none`.
- A Mainnet Wallet whose only check is a passkey (Open Check passkey, Signing Check passkey or Standard) needs a written, word-confirmed Seed (FR-72). That confirmation is story 7, so until then policy refuses that combination at creation with a visible reason. It is not weakened to a checkbox.
- An unsupported answer is rendered `aria-disabled` with its reason as visible text, from policy. Never hidden, never colour alone, never `disabled` removing it from the reading order.
- Pre-selected answers: Testnet; the first Node listed; Stored Seed; Ed25519; Open Check passkey only if passkey PRF is known to be available, else App PIN, auto-lock 5 min; Signing Check Standard on Testnet and Devnet, on Mainnet passkey if PRF is known available, else App PIN.
- Each created Wallet gets its OWN lock (`createLock`), whatever its Open Check, so a later edit or auto-lock touches only it. Every lock salt, `hkdfInfo` and PRF salt is generated and stored on the record.
- A Seed's ciphertext exists in exactly one form. A Wallet created with Signing Check passkey or PIN is written with `sealedSeed` and `signing` and NO `encryptedSeed`: the session and Open Keys never open it. Standard writes `encryptedSeed` under the lock's Open Key only.
- The Seed is generated in `lib/crypto`, held in a ref for the backup screen, never in React state, storage or the URL. A typed PIN lives in an uncontrolled input or a ref, cleared after use.
- A passkey used by the Open Check may be reused for the Signing Check of the same Wallet only with a different PRF salt and `hkdfInfo`; no two purposes share derived key material. A new passkey is named after the Wallet.
- The App PIN is created by its first user in this flow (Open Check or Signing Check), asked twice; afterwards the flow asks for the existing App PIN, counted on the shared counter, and states tries remaining. A cancelled prompt never counts.
- Creation is atomic: any failure after the lock is written removes that lock record and writes no Wallet. A refusal or a cancelled passkey leaves the vault as it was.
- A PIN Signing Check is asked through a PIN dialog wherever a Wallet signs (Send, Trust Lines) and where a Seed is revealed; the dialog states tries remaining and a lock-out in plain words, and a cancelled dialog resolves `null` (cancelled, not counted).
- Plain words in copy; Mainnet stays unmistakable; no colour-only meaning; nothing styles `:focus`; `outline-none` banned; docs and copy never say "open source".

**Never:**
- Passkey-Derived Seed creation, the existing-or-new passkey choice, the synced versus device-bound statement and the domain warning (story 6). The Seed Method question shows Passkey-Derived `aria-disabled` with the reason "Not available in this version yet".
- The word-confirmation of a written Seed and Seed reveal behind the Signing Check (story 7); editing an existing Wallet's checks (story 8); Controlling Wallet or Regular Key (story 9).
- Import from Seed in this flow. The existing Import screens stay as they are.
- A key, Seed or PIN in React state, a store, storage, the URL or a log. A fallback between passkey and PIN. Deriving a key to prove a check.
- Changing the legacy lock or any existing Wallet's record. No IndexedDB version bump.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Defaults on Testnet | Open Check App PIN (no PRF), Signing Standard | One Wallet on its own lock; Seed under the lock's Open Key; Wallet open after creation | No error expected |
| Sealed by PIN | Signing App PIN | Record has `sealedSeed` and `signing`, no `encryptedSeed`; signing asks the PIN dialog | Wrong PIN counts; tries remaining shown |
| Sealed by passkey | Signing passkey on a PRF device | Same shape with credential id and PRF salt; one passkey prompt per signature | Cancel does not count; no PRF writes nothing |
| Open none | Testnet, Open Check none | Lock has an Open Key and no wrapper; Wallet opens with no prompt | Refused on Mainnet with the reason |
| Mainnet floor | Mainnet, Open none or auto-lock under 1 minute | Option `aria-disabled` with reason; create refused if forced | Policy reason, nothing written |
| Passkey-only on Mainnet | Mainnet, Open passkey, Signing passkey or Standard | Refused with the written-Seed reason until story 7 | Nothing written |
| No PRF | Capability reports no PRF | Passkey options `aria-disabled` with the reason; defaults fall to App PIN | n/a |
| PRF unknown | Capability cannot tell | Passkey options available with a visible "checked when the passkey is created" note; a failed PRF writes nothing | Unsupported message |
| Custom Node | A Node reporting another network id | Refused by `verifyNode`; the flow keeps the built-in choice | Reason shown, Wallet not created |
| First PIN | No App PIN yet | Asked twice; mismatch blocks | Plain message |
| Write fails after lock | Storage error | Lock record removed, no Wallet | Error shown, vault unchanged |

</intent-contract>

## Code Map

- `src/lib/crypto/policy.ts` -- extend: `SeedMethod`, `SigningKind`, `WalletRequest`, `checkSigningCheck`, `requiresWrittenSeed` (FR-72), `checkWalletRequest` (lock request + signing + FR-72), and `describeOptions(context)` returning per-option `{ available, reason }` for Seed Method, Open Check, Signing Check. Context carries network, Seed Method, Open Check, passkey capability (`yes`/`no`/`unknown`) and `passkeyDerivedBuilt: false`. Keep `checkLockRequest`/`checkAutoLock`.
- `src/lib/crypto/webauthn.ts` -- add `detectPrfSupport()` (`yes`/`no`/`unknown`: `PublicKeyCredential.getClientCapabilities` `extension:prf` when present, `no` without WebAuthn, else `unknown`).
- `src/lib/crypto/lock.ts` -- `createLock` (L286) writes the lock. Extract the App PIN creation and proof (L311-338) into an exported helper the Signing PIN also uses; export `startLockSession(lockId, key, minutes)` over `putLockSession`; export `deleteLock(lockId)` removing the record and session (db.ts `putLockRecord` L371, `clearLockSession` L356; add the db delete).
- `src/lib/crypto/keystore.ts` -- add `createStoredWallet(input, ctx)` (AD-28 `keystore.create`): policy, createLock, `Wallet.generate({ algorithm })`, write once with `encryptedSeed` or `sealedSeed`+`signing`, rollback of the lock on failure, returns the meta, the Open Key and the Seed for the caller's backup ref. Share the seal build with `sealSeedUnderSigningCheck` (L432); `openSigningKey` (L274) reads `signing.credentialIdB64`, `prfSaltB64`, `hkdfInfo` and the PIN `hkdfInfo` and must open what is written. `removeWallet` (L517) also deletes a non-legacy lock whose last Wallet it removes (story 4 deferral).
- `src/lib/crypto/db.ts` -- `SeedMethod` stays `stored`; add the lock record delete.
- `src/components/wallet/CreateWalletFlow.tsx` (new) -- the one-question-per-axis flow, a native `fieldset` per axis like `NetworkChoice.tsx`; `aria-disabled` options with visible reasons; custom Node test through `verifyNode` (`src/lib/xrpl/client.ts` L340); PIN entry; post-create Seed backup with `SeedReveal`.
- `src/components/wallet/PinPromptDialog.tsx` (new) and a small provider/hook giving `Prompts` (`pin: (info) => Promise<string | null>`) to screens; replaces `unavailablePrompts` in `SendTab.tsx` (L327), `TrustLinesTab.tsx` (L48), `SettingsTab.tsx` (L188). `unavailablePrompts` stays exported only if still used.
- `src/pages/Onboarding.tsx` -- first run: "Create a new wallet" opens the flow; Import keeps its path through `setUpVaultAuth` unchanged. `src/pages/tabs/SettingsTab.tsx` -- "Add wallet" generate mode opens the flow; Import mode untouched. `src/App.tsx` Gate unchanged.
- `src/store/app-store.ts` -- `openLock`, `setWallets`, `setActiveWalletId` (called by the flow only once the backup step is done, as Onboarding does today).
- `docs/agents/keys-and-secrets.md`, `docs/agents/INDEX.md` -- state that creation sets per-Wallet locks and the Seed shape per Signing Check, in the existing wording style; no restatement.
- Tests: `src/lib/crypto/__tests__/` (policy, createStoredWallet, rollback, shape, removeWallet lock cleanup), `src/components/wallet/__tests__/` (flow: order, defaults, aria-disabled reasons, no secret in state), `src/pages/__tests__/` (Onboarding and Settings entry), `src/pages/tabs/__tests__/` (PIN dialog on Send, Trust Lines, reveal). Use the existing WebAuthn test seam and fakes; read the story 3 and 4 tests first for helpers.

## Tasks & Acceptance

**Execution:**
- `src/lib/crypto/policy.ts` -- add the Signing Check table, FR-72 predicate, `checkWalletRequest` and `describeOptions` -- one function for creation and later edits (AD-28).
- `src/lib/crypto/webauthn.ts` -- add `detectPrfSupport` -- PRF availability for pre-selection and reasons.
- `src/lib/crypto/lock.ts`, `src/lib/crypto/db.ts` -- extract App PIN helper, add `startLockSession` and `deleteLock` -- creation needs them.
- `src/lib/crypto/keystore.ts` -- add `createStoredWallet`, share the seal build, clean up the lock in `removeWallet` -- atomic, one-form Seed.
- `src/components/wallet/PinPromptDialog.tsx` and screens -- real PIN prompt for signing and reveal -- sealed Wallets must be usable.
- `src/components/wallet/CreateWalletFlow.tsx` -- the five questions, reasons, PIN entry, backup -- FR-60.
- `src/pages/Onboarding.tsx`, `src/pages/tabs/SettingsTab.tsx` -- use the flow for new Wallets -- both entry points.
- `src/lib/crypto/__tests__/*`, `src/components/wallet/__tests__/*`, `src/pages/**/__tests__/*` -- cover every row of the I/O matrix; a test that fails if a rule is moved out of `policy.ts` into a component; a test that no sealed record decrypts with the Open Key; a test that no secret appears in store or storage.
- `docs/agents/keys-and-secrets.md` -- record the creation rules.

**Acceptance Criteria:**
- Given the first run, when the person taps Create a new wallet, then the questions appear in the order Network and Node, Seed Method, signature type, Open Check with auto-lock, Signing Check, each with its pre-selected answer.
- Given Mainnet is chosen with no Open Check or auto-lock under 1 minute, when the screen renders, then that answer is `aria-disabled` with its reason as visible text and creation cannot proceed.
- Given a device without passkey PRF, when the Open Check and Signing Check questions render, then passkey is `aria-disabled` with the reason visible, and the defaults are the App PIN.
- Given Stored Seed with Signing Check passkey or App PIN, when creation finishes, then the record holds `sealedSeed` and `signing` and no `encryptedSeed`, and the lock's Open Key cannot decrypt it.
- Given a PIN-sealed Wallet, when Send, Trust Lines or reveal need a signature, then a PIN dialog states tries remaining and a wrong PIN counts toward the shared hard lock; Cancel does not count.
- Given any failure after the lock record is written, when creation aborts, then no lock record and no Wallet remain.
- Given the last Wallet on a created lock is removed, when removal finishes, then that lock record and session are gone and the legacy lock is untouched.
- Given the four gates, when `bun run lint`, `bun run build`, `bun run test` and `bun run check:contrast` run, then all pass.

## Spec Change Log

## Review Triage Log

### 2026-10-11 — Review pass
- verdicts: 41 findings — high 0, medium 4, low 11, false 4, maybe-false 1 (the remaining findings are reported twice or are repeats; each row below stands)
- findings:
  - `[medium]` `patch` Onboarding choice-screen Network picker ignored by Create (reported by 3 layers) — picker moved to the import step
  - `[medium]` `patch` failed App PIN read rendered as "no App PIN" — explicit error with Retry, Create blocked, test added
  - `[low]` `patch` network change during custom-Node test could store a Node proven for another network — network choice disabled while testing, stale result ignored
  - `[low]` `patch` both passkeys of one Wallet share a name — named by purpose
  - `[medium]` `patch` Settings Remove closing the lock untested — both cases added
  - `[medium]` `patch` multi-view removeWallet lock keep untested (code already correct) — test added
  - `[medium]` `patch` detectPrfSupport untested — test file added
  - `[medium]` `defer` tab close on backup step strands an unbacked-up Wallet — pre-existing shape, story 7 supplies reveal
  - `[low]` `defer` orphan passkey after aborted creation, two-passkey copy — web app cannot delete a credential
  - `[low]` `defer` 30 s auto-lock blank in Settings select — story 8
  - `[low]` `reject` putStoredWallet then toMetas throw leaves wallet without lock — toMetas is pure and cannot throw on a record just built
  - `[low]` `reject` unmount while createStoredWallet pending — the Add dialog cannot close while writing
  - `[low]` `reject` PIN rule in component, digits-only, empty-submit hint, needsPin without field — same rule as the Onboarding flow had; no harm named
  - `[low]` `reject` registerPasskey prfSupported ignored — the assertion that follows fails closed as unsupported and nothing is written
  - `[low]` `reject` withAppPin multi-tab race, App PIN proved twice, discardUnusedAppPin race — two-tab race on first PIN only; cost is a PBKDF2 run
  - `[low]` `reject` handleRemove only closes lock at one call site — it is the only caller
  - `[low]` `reject` PIN dialog outliving auto-lock, provider unmount not settling — submit still requires the PIN; no named harm
  - `[low]` `reject` hard-lock state not shown before submit — shown after the first failed submit; plain-words message exists
  - `[low]` `reject` "first Node listed" preselects Built-in Nodes — built-in list with failover is the first Node
  - `[false]` `reject` Settings dialog has no scroll — DialogContent already has max-h and overflow-y-auto
  - `[false]` `reject` signature type should be aria-disabled — both algorithms are always supported
  - `[false]` `reject` spec logs/INDEX bookkeeping stale — INDEX.md is an agent-context file and the spec log is filled here
  - `[maybe-false]` `reject` aria-disabled radio keyboard behaviour — low if true, would need a browser pass
  - `[low]` `reject` flow is one form not a wizard; tests mock keystore; source-grep test; secret test misses IndexedDB — the spec asks for a question per axis in order, and createStoredWallet has its own real tests
  - `[false]` `reject` flow tests do not cover the entry points — create-entry-points covers entry; the PIN dialog tests render the real provider

## Design Notes

PRF cannot be known before a passkey exists on most browsers, so the capability has three states. `unknown` keeps passkey options available with a visible note and lets creation fail closed (`unsupported`, nothing written); only `yes` makes passkey a default.

The Mainnet passkey-only refusal is deliberately a stopgap owned by story 7: policy already knows the rule, so story 7 only supplies the confirmation input. With PRF and Mainnet chosen, the pre-selected answers hit this refusal; the person sees why and picks the App PIN for one check.

## Verification

**Commands:**
- `bun run lint` -- expected: no errors
- `bun run build` -- expected: `tsc -b` and Vite build succeed
- `bun run test` -- expected: all tests pass
- `bun run check:contrast` -- expected: pass

**Manual checks (if no CLI):**
- With a browser, create a Testnet Wallet with each Signing Check, send a payment, and check the dialog copy and `aria-disabled` reasons; note it if not done.

## Auto Run Result

Status: done

**Summary:** One creation flow asks Network and Node, Seed Method, signature type, Open Check with auto-lock and Signing Check, each pre-selected, with `policy.ts` as the single rule source and unsupported answers `aria-disabled` with visible reasons. `createStoredWallet` gives each Wallet its own lock and writes its Seed under Standard (Open Key) or sealed under a PIN or passkey Signing Check, atomically. A real PIN dialog now serves Send, Trust Lines and Seed reveal. Mainnet with a passkey-only combination is refused until story 7.

**Files:** `src/lib/crypto/policy.ts` (rules, `describeOptions`), `webauthn.ts` (`detectPrfSupport`), `lock.ts`/`db.ts` (App PIN helper, session start, lock delete), `keystore.ts` (`createStoredWallet`, lock cleanup in `removeWallet`), `src/components/wallet/CreateWalletFlow.tsx`, `PinPromptDialog.tsx`, `src/hooks/usePrompts.ts`, `Onboarding.tsx`, `SettingsTab.tsx`, `SendTab.tsx`, `TrustLinesTab.tsx`, `App.tsx`, docs and tests.

**Review:** patches applied 7 (medium 5, low 2); deferred 4; the rest rejected with the reasons logged above.

**Follow-up review recommended:** true — two or more medium entries were patched, and the passkey path has only met a virtual authenticator.

**Verification:** `bun run lint`, `bun run build`, `bun run test` (72 files, 955 tests) and `bun run check:contrast` pass after the patches. One Playwright virtual-authenticator pass; no real device.

**Residual risks:** see the deferred list; the Mainnet pre-selected answers with passkey support land on the story-7 refusal.

**Browser pass (2026-10-14, `775ade7`):** run; result and defects in `../browser-pass-2026-10-14.md`.
