---
title: 'Two-device signing by QR'
type: 'feature'
created: '2026-10-13'
status: 'done'
baseline_revision: 'f72285163efcc2d65c4d601a0dd70a2f6c2340a1'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/docs/agents/keys-and-secrets.md'
  - '{project-root}/docs/agents/ledger-io.md'
  - '{project-root}/docs/agents/ui-and-design-system.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-passkey-signing-2026-10-10/ARCHITECTURE-SPINE.md'
warnings: ['oversized']
deferred:
  - summary: >-
      The QrScanner camera path (BarcodeDetector over getUserMedia) has not been run; the Testnet round trip was run through the paste path.
    evidence: |-
      Headless Chromium on Linux has no BarcodeDetector, so the browser pass used the paste fallback. A real camera scan needs a device that has one.
    location: >-
      src/components/wallet/QrScanner.tsx
    severity: medium (unverified)
  - summary: >-
      No settings test asserts the two-device entry is mounted only for a Wallet whose lock is open.
    evidence: |-
      Moving the mount into the locked branch of SettingsTab would pass every current test.
    location: >-
      src/pages/tabs/SettingsTab.tsx:412
    severity: low
---

<intent-contract>

## Intent

**Problem:** A key that lives on an offline device (a Controlling Wallet, or any Account's master key) cannot sign today: the offline device cannot read Sequence or Fee, and autofill's +20 ledger window is too short for a two-device round (CAP-13, FR-78).

**Approach:** One codec (`lib/qr-codec`, AD-30) carries an unsigned transaction to the offline XRPL Bench device and the signed blob back. The online device builds with an explicit `LastLedgerSequence` of validated + 75, states the expiry as a window, verifies the returned blob equals what it sent, and submits through `submitAndClassify`; an expired transaction is reported as expired.

## Boundaries & Constraints

**Always:**
- **Codec (AD-30).** `qr-codec.ts` is the only place either payload is defined, a `lib` leaf with no import of crypto, store or UI. Text form `xrplbench:1:u:<base64url JSON>` (unsigned: `v`, `network_id`, `tx`) and `xrplbench:1:s:<base64url JSON>` (signed: `v`, `tx_blob`). `decode*` returns a typed result, never throws, and rejects unknown version, wrong kind, malformed JSON, a non-integer or unknown `network_id` (Mainnet 0, Testnet 1, Devnet 2, from `NETWORKS`), and a payload over one QR's capacity (encode refuses with a plain reason: "too large for one QR"; no multi-frame).
- **Online side.** Offered from a Wallet whose lock is open (AD-26). Kinds: XRP `Payment`, `SetRegularKey`, `AccountSet` master-key flag; `Account` is the Wallet's `address`. Live-read guards run **before** building on a fresh read (`fetchAccountStateFresh`): an errored read, a missing Account, or the guard for the kind (reuse `setRegularKeyBlockedReason`; spendable-funds check for Payment as Send does) blocks, never relaxed. Building is in `writes.ts` (the only place `autofill` may appear): autofill, fee cap, then `LastLedgerSequence` = current validated ledger + 75 (`TWO_DEVICE_LEDGER_WINDOW`), set explicitly. No Tickets, no signing ahead, one transaction per round.
- **Expiry is stated before signing, in words:** a window of roughly four to six minutes, not a promised duration, shown on both devices before the Signing Check, with the `LastLedgerSequence` figure.
- **Offline side (no network).** Decodes the payload; refuses (nothing signed, plain reason) a `network_id` that is not its Wallet's network, a `tx.Account` that is not its Wallet's `address`, a type outside the three kinds, a non-string (non-XRP) `Amount`, a missing `Sequence`/`Fee`/`LastLedgerSequence`, a `Fee` over `MAX_FEE_DROPS` or non-canonical, or any `SigningPubKey`/`TxnSignature` already present. It shows the decoded fields (type, Account, destination, amount in XRP via `formatXrp`, fee, `LastLedgerSequence`, network with "real funds" on Mainnet) for the confirm step (FR-20), then `signingHandleFor` runs the Wallet's Signing Check and the blob is produced by one `signPrepared(signing, tx)` in `writes.ts` (Signer disposed in `finally`). A cancelled check sends nothing and never counts as a failed PIN.
- **Return trip.** Online `verifySigned`: `decode(tx_blob)` deep-equals the unsigned tx it sent ignoring only `SigningPubKey` and `TxnSignature`, and the key derived from `SigningPubKey` is the Account (only if its master key is not off) or the Account's Regular Key from a **fresh** read; otherwise refuse and submit nothing. A read that errors blocks. Submission is `submitSignedBlob` in `writes.ts`: a `SigningHandle` whose Signer returns the received blob, passed to `submitAndClassify` unchanged (fee cap, in-flight signal, classification). Before submitting, a validated ledger already past `LastLedgerSequence`, and any `tefMAX_LEDGER` result, report `expired` (FR-24), not failed. Only `validated` is success; `describeFailure` (from `lib/control.ts`) words the rest.
- No Seed, key, signed blob or typed PIN in state, store, storage or URL beyond the dialog's own lifetime; payload text lives in component state only while the dialog is open. Money stays strings; no `Number()` of drops. Every read through the key factory; nothing styles `:focus`; colour never alone; never say "open source".
- **Capturing the payload.** Display with `qrcode`. Scan with `BarcodeDetector` over `getUserMedia` where the browser has them; where it does not, the same dialog takes the payload as pasted text, and shows a copy button. Both feed the same `decode`. No new dependency (decision in Design Notes).

**Never:**
- Editing `submitAndClassify`'s order, a second codec or payload shape, multi-signing or signer lists, Tickets, signing several transactions per round, a local "pending signature" store that survives the dialog, resubmitting an expired blob, trusting the returned blob without `verifySigned`, calling `autofill`/`sign`/`submit` outside `writes.ts`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Round trip | Guards pass, offline Wallet's `address` = Account | Unsigned QR with expiry window, offline confirm + Signing Check, signed QR, verify, submit, `validated` | n/a |
| Wrong network | Payload `network_id` ≠ offline Wallet's | Refused before any prompt | Nothing signed |
| Wrong Account | `tx.Account` ≠ offline Wallet's `address` | Refused | Nothing signed |
| Tampered return | Blob differs (amount, destination, fee, LLS) or wrong signing key | `verifySigned` refuses | Nothing submitted |
| Expired | Validated ledger > LLS at submit, or `tefMAX_LEDGER` | Reported "expired", not failed; build a new one | Blob never resubmitted |
| Read errored | Fresh read fails before build or verify | Blocked with reason | Nothing built or submitted |
| Too large | Payload over one QR | Build refused, plain reason | n/a |
| Garbage text | Unknown version, bad base64/JSON | `decode` typed error | No throw |
| Cancelled check | Offline prompt dismissed | "Cancelled. Nothing was signed." | Not counted as a wrong PIN |

</intent-contract>

## Code Map

- `src/lib/xrpl/writes.ts` -- `submitAndClassify` (L117, read-only), `LEDGER_WINDOW` (L99), `Signer`/`SigningHandle`, `submitSetRegularKey`/`submitMasterKeyFlag` (templates). Add `TWO_DEVICE_LEDGER_WINDOW = 75`, `prepareUnsigned`, `signPrepared`, `submitSignedBlob`, `validatedLedgerIndex`. Only file allowed `autofill`/`sign`/`submit` (`scripts/check-write-choke-point.mjs`).
- `src/lib/crypto/keystore.ts` -- `signingHandleFor` (L485), `SigningCheckError`, `listWallets`, `WalletMeta`, `Prompts`; signs with `masterAddress` for operated views. Read-only here.
- `src/lib/control.ts` / `src/lib/master-key.ts` -- `holdsMasterKey`, `controlStatus`, `setRegularKeyBlockedReason`, `masterKeyAction`, `describeFailure` (flow template: fresh read, handle, error mapping, re-read).
- `src/lib/xrpl/networks.ts` -- `NETWORKS[...].networkId` for the envelope; `money.ts` -- `formatXrp`, `feeWithinCap`, `MAX_FEE_DROPS`; `query-reads.ts` -- `fetchAccountStateFresh`.
- `src/components/wallet/QrCode.tsx` -- address-only today; add a `text` prop. `MasterKeyControl.tsx`, `ControlWalletDialog.tsx` -- dialog, `usePrompts`, `useWalletOpenKey`, busy-lock patterns. `src/pages/tabs/SettingsTab.tsx` L408-410 -- mount beside `MasterKeyControl`, open-lock block only.
- Tests to copy: `src/lib/crypto/__tests__/master-key.test.ts` (idb/WebAuthn fakes), `src/lib/xrpl/__tests__/writes.test.ts` (`installFakeClient`), `src/components/wallet/__tests__/master-key-control.test.tsx`.
- Docs: `docs/decisions.md` §15 (add a section), `docs/agents/keys-and-secrets.md`.

## Tasks & Acceptance

**Execution:**
- `src/lib/qr-codec.ts` (new) -- encode/decode both payloads, capacity check, network-id mapping -- AD-30 one codec.
- `src/lib/xrpl/writes.ts` -- `prepareUnsigned`, `signPrepared`, `submitSignedBlob`, `validatedLedgerIndex` -- choke point stays the only submitter.
- `src/lib/two-device.ts` (new) -- `buildUnsigned` (guards, build, encode), `reviewUnsigned`, `signUnsigned`, `verifySigned`, `submitReturned` (expiry mapping) -- CAP-13.
- `src/components/wallet/QrCode.tsx` -- `text` prop; `QrScanner.tsx` (new) -- `BarcodeDetector` scan with paste fallback; `TwoDeviceSign.tsx` (new) -- online and offline panels, expiry text, confirm; `SettingsTab.tsx` -- mount for an open-lock Wallet.
- Tests and docs -- codec (round trip, every rejection, size); writes (LLS = validated + 75, cap, blob passes through the choke point, in-flight signal); two-device flow with real signatures (tamper, wrong key, wrong network/Account, expiry via past ledger and `tefMAX_LEDGER`, errored read, cancelled check); component (expiry words before signing, `aria-disabled` reasons, paste fallback); a test that fails if `verifySigned` is removed from the submit path; `docs/decisions.md` entry.

**Acceptance Criteria:**
- Given a funded Account and an offline Wallet whose `address` is that Account, when the online device builds and the offline device confirms and passes its Signing Check, then the returned blob verifies, submits through `submitAndClassify`, and `validated` is reported.
- Given a built transaction, then its `LastLedgerSequence` is the validated ledger + 75 and the expiry is stated in words before any Signing Check on both devices.
- Given a returned blob that differs from the unsent transaction in any field but `SigningPubKey`/`TxnSignature`, or whose key is not the Account's master or Regular Key, then nothing is submitted.
- Given a validated ledger past `LastLedgerSequence`, or `tefMAX_LEDGER`, then the outcome is "expired", never "failed", and the blob is not resubmitted.
- Given a wrong network id, a wrong Account, a disallowed type or an over-cap fee, then the offline device signs nothing and says why.
- Given an errored read before build or verify, then the action is blocked with the reason as text, and nothing is built or submitted.
- Given `bun run lint`, `bun run build`, `bun run test` and `bun run check:contrast`, then all pass.

## Spec Change Log

## Review Triage Log

### 2026-10-13 — Review pass
- verdicts: 33 findings — high 0, medium 9, low 4 patched or deferred, false 2, rejected-low 18 (rows grouped by claim; repeats across layers share a row)
- findings:
  - `[medium]` `patch` verifySigned never verifies the signature (blind, edge) — `verifySignature` added, flipped-byte test
  - `[medium]` `patch` reviewUnsigned `in` check passes inherited names, TypeError (edge) — hasOwnProperty, test
  - `[medium]` `patch` custom-Node `NetworkID` makes the flow impossible to finish (edge) — accepted as a common uint32 field, tests
  - `[medium]` `patch` pre-send errors worded "was sent", no re-read on unconfirmed (blind, edge, gap) — "may have been sent", FeeAboveCap refused, accounts invalidated, tests
  - `[medium]` `patch` unconfirmed leaves scanner and QR, same blob re-pastable (blind, edge, gap) — build ends on any result, "Build another", rendering test
  - `[medium]` `patch` offline states a fixed window it cannot check (edge) — offline wording names the figure as the real limit
  - `[medium]` `patch` stale QR under new text; fixed 260px for up to 2331 bytes (blind, edge, gap) — image keyed to payload and size, size scales with payload, qr-code test
  - `[medium]` `patch` wrapped paste fails (blind) — whitespace stripped, test
  - `[medium]` `patch` scanner constructor throw, null video, stale error, late rejection (edge, blind) — fixed
  - `[medium]` `patch` request mapping, over-capacity build, ClearFlag, SetFlag+ClearFlag, unconfirmed untested (gap) — tests added; source-text indexOf test replaced by behavioural ones
  - `[medium]` `defer` camera scan and Testnet round trip unverified (intent, gap) — see deferred
  - `[low]` `defer` Settings lock gating untested (gap) — see deferred
  - `[low]` `reject` payment with master off and no Regular Key proceeds until verify (edge) — verifySigned refuses; fix adds a branch for no unlikely harm
  - `[false]` `reject` validatedLedgerIndex bypasses the key factory (edge) — a write-side read inside the choke point module, as `submitAndClassify`'s own ledger read; not an account-scoped read
  - `[false]` `reject` scope E: extra kinds beyond Payment (intent) — the spec's boundaries list all three
  - `[low]` `reject` online side shows no built summary, Sequence race wording, a11y names/roles, paste box cleared, QrCode with no props, dead regex branch, no network-call assertion, fixed paste id (blind, edge, gap) — cosmetic or narrow, no named harm worth added surface

### 2026-10-13 — Review pass (follow-up)
- verdicts: 35 findings — high 0, medium 2, low 20, false 1, maybe-false 0, carried 12 (carried rows are counted in their verdict)
- findings:
  - `[medium]` `patch` guards not re-applied at submit: master-key off signed, Regular Key removed in the window, leaves no usable key (blind) — `verifySigned` refuses an AccountSet SetFlag asfDisableMaster when the fresh read has no Regular Key; test added
  - `[low]` `patch` returned() could submit twice before `busy` re-renders, and silently drops a payload while busy (edge, gap, blind) — `inFlight` ref guard; test pins single submit
  - `[medium]` `patch` Close/Escape while busy not pinned by any test (gap) — busy-lock test added (Close and Escape leave the outcome visible, Close works after)
  - `[low]` `reject` carried: camera scan and Testnet round trip unverified (intent, gap) — see `deferred`
  - `[low]` `reject` carried: Settings lock gating untested; no offline network-call assertion; Sequence race wording; a11y names/roles; fixed paste id (intent, gap, blind) — logged in the first pass
  - `[low]` `reject` component test stubs the flow functions; hand-off argument not asserted (intent, gap) — the lib tests exercise the real flow with real signatures; wiring is one call
  - `[low]` `reject` offline signs any LastLedgerSequence (blind, edge) — the offline device has no ledger to bound it against, the figure is shown before the Signing Check, and the blob dies when its Sequence is used
  - `[low]` `reject` `>` vs `>=` at validated == LastLedgerSequence (gap, edge) — the next ledger is past the window and `tefMAX_LEDGER` maps to expired, so the outcome is the same
  - `[low]` `reject` pre-send failure worded "may have been sent" (edge) — conservative wording, a rebuild costs nothing; the first pass already split out the fee-cap refusal
  - `[low]` `reject` Copy button puts payloads on the clipboard (blind) — both payloads are public (unsigned or signed transactions); the rule guards Seed, key and PIN
  - `[low]` `reject` dense QR shrinks on a narrow screen (blind, edge) — size scales with payload since the first pass and the paste fallback exists; no named failure shown
  - `[low]` `reject` master-key warning asymmetric and passive online (blind) — the build is blocked without a Regular Key and the offline confirm states the consequence
  - `[low]` `reject` Spec Change Log empty, front-matter status contradictions, `oversized` warning (blind) — fix is to edit this spec
  - `[low]` `reject` vacuous "too large" test (blind) — the `tooLarge` mock test covers the build path; no harm from the duplicate
  - `[low]` `reject` tefMAX_LEDGER matched by error text (blind) — fallback path; the result path uses `resultCode`
  - `[low]` `reject` scanner silent on a non-XRPL Bench QR; JSON.stringify throw; unhandled rejection from build/returned (edge) — tx fields are strings and numbers; the dialog's `finally` resets busy; only an IndexedDB failure reaches it
  - `[false]` `reject` the scanner/paste textarea "cleared" loses input (edge, blind) — the paste is cleared only after a payload is handed on, and busy now only occurs while a submit runs

## Design Notes

- **Scanning without a dependency.** The repo has `qrcode` (render) and no scanner. `BarcodeDetector` covers Chromium; a paste field covers the rest and still goes through `decode`. A scanner library (jsQR) is a possible later addition and needs an owner decision; it is not required for correctness.
- **Why the blob goes through a Signer.** `submitAndClassify` autofills and honours a caller-set `LastLedgerSequence`; a Signer that returns the received blob lets the one choke point keep the fee cap, in-flight signal and classification instead of a second submit path.
- **Why verify by deep-equal.** A tampered offline return (or a QR swapped in transit) must not become a transaction the user did not see. `decode` of the blob compared to the sent JSON is the whole check.

## Verification

**Commands:**
- `bun run lint && bun run build && bun run test && bun run check:contrast` -- expected: all pass

**Manual checks (if no CLI):**
- On Testnet with two browser profiles: build a payment online, sign it on the offline profile, return and submit; then let one expire and confirm "expired" wording. Not verifiable from this machine if no camera: state that.

## Auto Run Result

Status: done

- Implemented: one codec (`qr-codec`), online build with `LastLedgerSequence` = validated + 75, offline review and sign, verified return and submit through `submitAndClassify`, expiry reported as expired, UI in Settings with camera scan (where available) and paste fallback.
- Files: `src/lib/qr-codec.ts`, `src/lib/two-device.ts`, `src/lib/xrpl/writes.ts`, `src/components/wallet/{QrCode,QrScanner,TwoDeviceSign}.tsx`, `SettingsTab.tsx`, tests, `docs/decisions.md` §15.3, `docs/agents/keys-and-secrets.md`.
- Follow-up pass: 3 patches (1 medium: master-key-off re-guarded at verify; 1 medium: busy-lock test; 1 low: in-flight ref), every other finding rejected with a recorded reason or carried.
- Follow-up review recommended: false. This pass patched no high and the work has converged. Unverified: the camera path and a live Testnet round trip, as already deferred.
- Verification: `bun run lint`, `build`, `test`, `check:contrast` all pass.

### Testnet browser pass (2026-10-13, after `df0f613`)

Driven by Playwright Chromium 1.49 against `bun run dev`, two separate browser contexts (online and offline) each with its own vault and a CDP virtual authenticator, one throwaway Testnet seed imported on both and funded from the in-app faucet. The payloads moved between the two as pasted text. Desktop width 1000 px, one theme; no 320/390 px or dark-theme pass was made for this check.

- **Round trip, met.** Build a 1 XRP Payment online; the offline device showed the decoded fields and the expiry words, signed on Confirm; the signed text went back; the online dialog reported "Validated. The ledger applied this transaction."
- **Expiry, met.** Built and signed, then waited until the validated ledger passed `LastLedgerSequence` (21505674); returning the signed text reported "This transaction expired before it validated…", not failed, and nothing was submitted. The expired screen was opened and checked.
- **Defect found and fixed.** The first real round trip was refused as "not the one that was sent". The SDK's `autofill` returns `NetworkID: undefined` as a key; `deepEqual` counted it, the JSON payload dropped it. Every real return would have been refused, and no test saw it because the fake `autofill` did not add the key. `deepEqual` now ignores undefined-valued keys and the fake adds `NetworkID: undefined`; 14 round-trip tests fail without the fix.
- **Not run:** camera scan (headless Chromium has no `BarcodeDetector`), a second theme, 320 and 390 px, and the master-key and Regular Key kinds on the live ledger.
