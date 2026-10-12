---
title: "Edit a Wallet's checks and passkey"
type: 'feature'
created: '2026-10-11'
baseline_revision: '49ed6b1d3ad4680425bb06d68798e4960b053ea5'
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
      No browser or real-authenticator pass: the Edit checks dialog and every passkey edit have only met fakes; no test chains the real dialog, real editChecks and real Settings session swap.
    evidence: |-
      A PRF virtual authenticator run, then a real device, would settle it.
    severity: medium (unverified)
  - summary: >-
      The concurrency tests use a fake IndexedDB that stages a copy, so the in-transaction compare is proven to run but a write between the transaction's read and write is not exercised.
    evidence: |-
      A real-IndexedDB (fake-indexeddb) test of two interleaved commits would settle it.
    location: >-
      src/lib/crypto/db.ts commitWalletEdit
    severity: low
  - summary: >-
      A passkey registered before a later failed edit stays on the authenticator.
    evidence: |-
      The web app cannot delete a credential; the spec allows it.
    location: >-
      src/lib/crypto/keystore.ts editChecks
    severity: low
---

<intent-contract>

## Intent

**Problem:** A Wallet's checks are fixed at creation (CAP-9, FR-73). `sealSeedUnderSigningCheck` is the only edit, one way (Standard to PIN/passkey, legacy passkey only), with no policy, no Open Check or passkey change, no way off the legacy lock, and `setLockAutoLock` needs no check.

**Approach:** One keystore function `editChecks` changes Open Check, auto-lock, Signing Check and passkeys per AD-28: pass the current check the change affects, build the new credential, judge the resulting state with `policy.ts`, ask for the written Seed when FR-72 then applies, and commit in ONE IndexedDB transaction that leaves the old state intact on any failure. The address never changes. Settings gets an "Edit checks" dialog that only renders the policy's answers.

## Boundaries & Constraints

**Always:**
- One rule source: the resulting state goes through `checkWalletRequest` (Seed Method, Signing Check, Open Check and auto-lock floors, PRF capability, FR-72). Network is Mainnet if any view of the Seed is Mainnet. A Wallet with `writtenSeedConfirmedAt` counts as confirmed; otherwise a result that needs it calls `ctx.confirmWrittenSeed(seed)` (story 7) before any write, and `false` is `cancelled`. The Seed comes from the check already passed; a Passkey-Derived Seed is computed by its passkey assertion.
- Current check first, by what the edit affects: Open Check or auto-lock edit → re-pass the lock's Open Check (`repassOpenCheck`; `none` asks nothing); Signing Check or its passkey edit on a sealed Wallet → its Signing Check (decrypting the seal is the proof); Standard→sealed → the Open Check re-pass. Wrong PIN counts, cancel never does, hard lock blocks PIN only (AD-25). Nothing is asked when nothing changes.
- Edit kinds: Open Check to `pin`, `passkey` or `none`, or a new passkey on the same kind; auto-lock minutes; Signing Check among `standard`, `pin`, `passkey` (Stored only), or a new passkey on `passkey`. A Passkey-Derived Wallet's Signing Check and Seed Method, and every Wallet's Seed Method and algorithm, are not editable. A passkey is "an existing one or a new one named after the Wallet" (FR-70), with its own random PRF salt and `hkdfInfo`; no key material shared (AD-21).
- Open Check edits make a NEW lock (new random Open Key, wrapped under the new credential) for this Seed record only and move the record to it; a Standard Seed is re-encrypted under the new Open Key. The old lock record is deleted when no record uses it; the legacy lock never is, and its other Wallets are untouched (AD-27). A Standard→sealed edit deletes the old `encryptedSeed` (including a legacy one); sealed→Standard deletes `sealedSeed` and `signing` and encrypts under the Open Key (AD-23). Ciphertext exists in exactly one form.
- Atomic and conflict-safe (AD-28, AD-18): the new lock record and the Wallet record are written in one multi-store transaction, with a compare-and-swap on an additive optional `rev` (absent = 0, +1 per edit) and the ciphertext/lock read; any mismatch or failure writes nothing and the old state still opens. A passkey registered before a later failure may stay on the authenticator.
- Auto-lock edit applies to the Wallet's lock; on the shared legacy lock it applies to every Wallet on it, as today. The policy decides the floor against every network on that lock.
- The dialog states, before commit, when an older app version can no longer open the Wallet (adding a Signing Check or leaving the legacy lock). Unavailable answers are `aria-disabled` with visible reasons from `describeOptions`, never hidden. A PIN needs the App PIN (typed twice if none exists).
- The result carries the Wallet's meta and, when the lock changed, the new lock's non-extractable Open Key; the caller closes the old lock, opens the new one and starts its session. No Seed, key or typed PIN in state, store, storage or URL. Plain words; Mainnet unmistakable; no colour-only meaning; nothing styles `:focus`; `outline-none` banned; never say "open source".

**Never:**
- Editing Seed Method, algorithm, address, network or Node here. Controlling Wallet, Regular Key, master-key work (stories 9, 10). A restore screen. An IndexedDB version bump or a change to the legacy vault meta. A passkey/PIN fallback. A second copy of any policy rule in a component.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Add Signing Check | Standard, PIN Open Check; choose passkey Signing | Open Check re-passed, seal built, one transaction; address unchanged | Cancel/failure: old record intact |
| Remove Signing Check | Passkey-sealed; choose Standard | Signing Check passed, Seed encrypted under Open Key, seal deleted | Policy refusal writes nothing |
| Change PIN to passkey Open Check | Current Open Check re-passed | New lock, Seed re-encrypted, old lock deleted | Wrong PIN counts; cancel not |
| Legacy Wallet edited | On `legacy` lock | Moves to own lock; other legacy Wallets still open | Dialog warns an older build cannot open it |
| Mainnet floor | Edit to Open Check `none` or auto-lock under 1 min | Refused with the policy reason | Nothing written |
| FR-72 after edit | Mainnet, result passkey-only, no `writtenSeedConfirmedAt` | Written-Seed confirmation asked; `writtenSeedConfirmedAt` stored | Cancel writes nothing; no callback: refused |
| Passkey-Derived | Open Check edit | Allowed; Signing Check options all `aria-disabled` | n/a |
| Concurrent edit | `rev` or ciphertext changed since read | Aborted, nothing changed | Plain message |
| No-op | Same values | Nothing asked, nothing written | n/a |

</intent-contract>

## Code Map

- `src/lib/crypto/keystore.ts` -- `sealSeedUnderSigningCheck` (L526, legacy-passkey only, no policy: superseded; keep exported for existing tests or fold in), `repassOpenCheck` (L485), `openSeed` (L358), `openSigningKey` (L286), `buildSeal` (L506), `createStoredWallet` passkey branch (L~700, registerPasskey + assertPasskeyAndDeriveBits to extract and reuse), `confirmedAtFor` (L775), `setLockAutoLock` (L1079), `viewsOf`, `toMetas` (L65), `WalletMeta` (L38). Add `editChecks`.
- `src/lib/crypto/lock.ts` -- `createLock` (L357: new lock with own salt/info/PIN-or-passkey; supports `reuseCredential`), `withAppPin` (L299), `deleteLock` (L449), `setAutoLockMinutes` (L424), `getLockInfo` (L110).
- `src/lib/crypto/db.ts` -- stores `wallets` and `vault` (`getDb` L158, v2: no bump); `mutateStoredWallet` (L253) is single-store. Add a multi-store commit with CAS; `StoredWallet` (L56) gets optional `rev`; `putLockRecord`/`deleteLockRecord` (L394-401).
- `src/lib/crypto/policy.ts` -- `checkWalletRequest`, `describeOptions`, `requiresWrittenSeed`, `canConfirmWrittenSeed`/`writtenSeedConfirmed` (story 7). Read-only unless an edit-specific verdict is needed.
- `src/components/wallet/CreateWalletFlow.tsx` -- `confirm-seed` step (L~485) and its challenge helpers; extract into a shared component for the edit dialog; `Choice`/`Axis` renderers (L~80-190) to reuse or extract.
- `src/pages/tabs/SettingsTab.tsx` -- auto-lock Select (L477), `handleAutoLock` (L258) and `lockInfoQuery` (L79): route through `editChecks`; add the Edit checks entry and wallet-meta refresh; `handleConfirmReveal` shows how `openLocks`/`closeLock`/`openLock` are wired. `src/pages/tabs/__tests__/settings-locks.test.tsx`, `settings-reveal.test.tsx` mock `keystore` and `lock` wholesale: keep their shape.
- `src/lib/crypto/__tests__/create-stored-wallet.test.ts` (hoisted fake idb and webauthn), `signing-check.test.ts`, `derived-wallet.test.ts`, `migration.test.ts` (legacy fixtures) -- patterns for edit tests. New `edit-checks.test.ts`.
- Docs: `docs/agents/keys-and-secrets.md`, `docs/decisions.md` §15 -- record the edit rules in existing style; no restatement.

## Tasks & Acceptance

**Execution:**
- `src/lib/crypto/db.ts` -- `rev`, multi-store atomic commit with CAS -- AD-28 atomicity.
- `src/lib/crypto/keystore.ts`, `lock.ts` -- `editChecks`, shared credential builder, new-lock move, auto-lock via the same path -- CAP-9.
- `src/components/wallet/` -- Edit checks dialog and a shared written-Seed confirm component -- render policy only.
- `src/pages/tabs/SettingsTab.tsx` -- entry point, lock/session swap after a lock change, auto-lock through `editChecks` -- wiring.
- Tests and docs -- every matrix row; address unchanged; an injected failure at each step (credential, lock write, commit) leaves the old Wallet opening; legacy neighbours still open; a test that removing the current-check re-pass or the policy call fails an edit test; session untouched until the caller swaps.

**Acceptance Criteria:**
- Given a Wallet with an Open Check, when its Open Check, Signing Check or passkey is edited, then the affected current check is passed first and the address is unchanged afterwards.
- Given an edit whose result breaks a Mainnet floor or the Seed Method rule, when requested, then it is refused with the plain reason and nothing is written; given a Mainnet result that is passkey-only without a confirmed Seed, then the written Seed is confirmed first.
- Given any failure or cancel during an edit, then the Wallet opens and signs exactly as before.
- Given a legacy-lock Wallet edited, then it leaves the legacy lock alone while other legacy Wallets still open, and the old `encryptedSeed` is gone.
- Given the four gates, `bun run lint`, `bun run build`, `bun run test`, `bun run check:contrast` all pass.

## Spec Change Log

## Review Triage Log

### 2026-10-11 — Review pass
- verdicts: 41 findings — high 0, medium 7, low 24, false 4, maybe-false 0 (grouped by claim; repeats across layers share a route)
- findings:
  - `[medium]` `patch` auto-lock-only edit refused on a Mainnet passkey-only Wallet with no confirmed Seed, or when PRF is `no` (blind, edge x2) — FR-72 and PRF now judged only when Open Check or Signing Check changes; tests added
  - `[medium]` `patch` post-commit throw can discard the App PIN the committed lock depends on (blind) — cleanup limited to pre-commit; `commitWalletEdit` returns `lockRemoved`; test added
  - `[medium]` `patch` dialog says "Nothing was changed" after a committed edit when `onEdited` throws (blind, edge) — separate honest message; old lock closed in `finally`; tests added
  - `[low]` `patch` stale cached auto-lock reverted by a signing-only edit (edge) — sent only when changed
  - `[low]` `patch` dialog offers a sub-minute choice the keystore refuses on a shared legacy lock; rule copied into the component (blind, edge) — `describeEditOptions` takes the lock's networks
  - `[medium]` `patch` `sealSeedUnderSigningCheck` writes ciphertext with no `rev` check (blind) — reads, checks and bumps `rev`
  - `[medium]` `patch` untested: existing passkey as Open Check; Testnet-primary Seed with a Mainnet view; Settings edit with no new lock key (verification-gap) — three tests added
  - `[medium]` `defer` no browser or authenticator pass; no end-to-end chain (intent, verification-gap) — unverified
  - `[low]` `defer` fake IndexedDB cannot show an interleaved write (blind, verification-gap) — a fake-indexeddb test would settle it
  - `[low]` `defer` orphan passkey after a failed edit (edge) — allowed by the spec
  - `[low]` `reject` missing typed PIN returns `cancelled` (blind, edge) — the dialog always supplies it
  - `[low]` `reject` `algorithm` backfilled by an edit (blind) — same rule as `walletFromSeed`: derived from the Seed and checked against the address
  - `[low]` `reject` CAS stamps omit some fields (blind) — `rev` bumps on every edit, so any concurrent edit is caught
  - `[low]` `reject` view added during a prompt is missed by the CAS (edge) — narrow window; floors re-judged on the next edit
  - `[low]` `reject` sealed to Standard asks two prompts (edge, intent) — documented in decisions.md; the new ciphertext needs the real Open Key
  - `[low]` `reject` `setLockAutoLock` edits through the first Wallet on the lock; `passkey` unset in its context (verification-gap) — auto-lock-only edits no longer judge PRF
  - `[low]` `reject` dialog focus, no dismiss while busy, zero-length challenge, type cast, Seed nulling in finally (blind, edge) — cosmetic, no demonstrated harm
  - `[false]` `reject` housekeeping: spec status, empty logs, tracking tables, manual check unrecorded (blind) — filled at finalisation; the manual check is a deferred item
  - `[low]` `reject` docs rule vs `sealSeedUnderSigningCheck` (blind) — now covered by the `rev` patch

## Design Notes

A new lock per Open Check edit, rather than re-wrapping, handles `none` (non-extractable Open Key), the shared legacy lock, and credential rotation with one mechanism, and re-encryption of a Standard Seed is cheap. The old lock stays valid until the single commit, so a crash mid-edit never strands the Seed. Auto-lock on a lock shared by legacy Wallets is deliberately unchanged in scope.

## Verification

**Commands:**
- `bun run lint` -- expected: no errors
- `bun run build` -- expected: `tsc -b` and Vite build succeed
- `bun run test` -- expected: all tests pass
- `bun run check:contrast` -- expected: pass

**Manual checks (if no CLI):**
- With a browser and a PRF virtual authenticator, edit a Testnet Wallet from PIN to passkey Open Check and add a passkey Signing Check, then send. Note if not done; unverified on a real device.

## Auto Run Result

Status: done

**Summary:** `editChecks` changes Open Check, auto-lock, Signing Check and passkeys: it resolves the resulting state through `policy.ts`, passes the affected current check first, asks for the written Seed when FR-72 then applies (only when an Open or Signing Check changes), and commits one multi-store transaction with a compare-and-swap on `rev`, so any failure leaves the old Wallet opening. An Open Check edit moves the Seed record to a new lock of its own; the legacy lock and its other Wallets are untouched. Settings has an Edit checks dialog that renders the policy's answers; auto-lock now re-passes the Open Check.

**Files:** `src/lib/crypto/{db,lock,policy,keystore}.ts`, `src/components/wallet/{EditChecksDialog,WrittenSeedConfirm,check-controls}.tsx`, `CreateWalletFlow.tsx`, `src/pages/tabs/SettingsTab.tsx`, docs, and tests (`edit-checks.test.ts`, dialog and Settings tests, policy additions).

**Review:** patches applied 7 entries (medium 5, low 2); deferred 3 (one unverified medium, two low); the rest rejected with reasons in the log.

**Follow-up review recommended:** true — five medium entries were patched, and the passkey edit paths have only met fakes, with no browser or authenticator run.

**Verification:** `bun run lint`, `bun run build`, `bun run test` (79 files, 1121 tests) and `bun run check:contrast` pass after the patches. No browser or authenticator run.

**Residual risks:** see the deferred list; a sealed-to-Standard edit asks two prompts; an edit through the Settings auto-lock dropdown never asks for the written Seed.
