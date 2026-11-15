---
title: 'Regular Key and master key warnings'
type: 'feature'
created: '2026-11-15'
status: 'in-progress'
baseline_commit: '666994e'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/specs/spec-offline-signing/SPEC.md'
  - '{project-root}/_bmad-output/specs/spec-offline-signing/consequence-texts.md'
  - '{project-root}/_bmad-output/specs/spec-offline-signing/route-checks.md'
  - '{project-root}/_bmad-output/planning-artifacts/prds/prd-offline-signing-2026-11-07/fact-check.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-11-07/EXPERIENCE.md'
  - '{project-root}/docs/agents/ledger-io.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Online Wallet's key actions still refuse what the ledger allows (FR-75: the Regular Key must be a Wallet here; FR-77: master key off only after a validated Regular Key held here, and only from the master key), the Offline and Transmitter key types lack W1, W2 and P-30, and the three key-action ledger refusals reach the user as a code or, for a `tem` at the Transmit step, as "may have been sent" (CAP-14, OS-FR-21; fact-check cases 3 and 8).

**Approach:** An Online key plate that sets, replaces or removes a Regular Key to any address and turns the master key off or on with no app refusal, showing the live key state (P-29 on a failed read), W1/P-30, W2, W5, and before master key off "Test the Regular Key" (in place when a Wallet here signs for this Account with that key, else P-50) then W4, the Mainnet typed phrase and the Signing Check; P-54 after a validated set. W1/P-30/W2/W5 added where they are missing on the Offline and Transmitter routes. A `tem` preliminary result is a failed outcome on every route, and P-31's three sentences are the reasons in today's outcomes.

## Boundaries & Constraints

**Always:** W1–W5, "Test the Regular Key" verbatim from `consequence-texts.md`; P-29, P-30, P-31, P-47, P-50, P-54 verbatim from EXPERIENCE; approved 2026-11-08/10/14 words or shipped words for the same fact; each from one module tested against its source. Every warning before the Signing Check and never blocking. Key state read through the key factory; a failed read is P-29 and gives no W5 and no in-place test. Master key off: typed "turn off" on Mainnet, then the Signing Check. Outcomes in today's words (validated, claimed with the fee sentence, failed, expired, unknown).

**Never:** No app refusal of a Regular Key address (own address, unheld, black hole) or a master key change, on any of the three surfaces. No new keystore path that signs for an Account the Wallet does not Sign for. No raw code as the reason. No controlled view added by the new plate (P-54 replaces that). No change to two-device (FR-78) refusals or to the online submit's `submitAndWait` call (story 7 pin). No words outside the approved lists.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Online plate, state | Online Wallet, account read | title "Key state"; rows Regular Key, Master key, Signer list | read failed: P-29 rows; pending: no rows |
| Set a Regular Key | any valid address | P-30 when a key Wallet here has that key, else W1; W2 for the two black holes; W5 when a different key is set; Signing Check; SetRegularKey `RegularKey` | invalid address: shipped error, confirm held |
| Set to own address | address = Account | sent; `temBAD_REGKEY` → failed outcome, reason P-31 | — |
| Remove the Regular Key | any state | W5 when one is set; SetRegularKey without `RegularKey` | master off, no signer list: `tecNO_ALTERNATIVE_KEY` claimed, P-31 |
| Turn off the master key | any key, any state | "Test the Regular Key", W2 when the Regular Key is a black hole, W4; Mainnet typed phrase; AccountSet `SetFlag` 4 | no Regular Key: `tecNO_ALTERNATIVE_KEY`; signed by Regular Key: `tecNEED_MASTER_KEY`; both claimed, P-31 |
| Test the Regular Key | Online key Wallet here, same Network, lock open, signs for this Account with the Regular Key | AccountSet with no fields signed by that Wallet; outcome shown | otherwise P-50 |
| Turn on the master key | any | AccountSet `ClearFlag` 4 | master signing while off: today's refusal |
| P-54 | validated set on the plate | `SignsForOffer` | — |
| Offline Regular Key Build | typed or scanned address | P-30 or W1; W2 | — |
| Offline signing review | key state from the Transmitter | W5 also for a removal of a set key; W2 on master off when the state's Regular Key is a black hole | — |
| Transmitter Build and answer | live key state | Build: P-30/W1, W2, W5 (removal too); master off: W2 when black hole; answer: W5 (removal too), W2 | failed read: P-29, no W5 |
| Offline Sign review | Unsigned SetRegularKey to a black hole | W3, row, W1, W2 | — |
| Two-device offline review | SetRegularKey from the other device | W3 above "New Regular Key", P-30 or W1, W2 | — |
| `tem` at the Transmit step | preliminary `tem*` | failed outcome with its code (never "may have been sent") | — |

</frozen-after-approval>

## Code Map

- `src/lib/xrpl/writes.ts` -- `tem` preliminary → failed outcome on both submit paths; SetRegularKey removal; AccountSet with no changes.
- `src/lib/xrpl/result-codes.ts` -- P-31 reasons.
- `src/lib/key-warnings.ts` (new) -- black holes, key Wallet here, which warnings apply, the in-place tester.
- `src/lib/key-actions.ts` (new) -- the Online plate's writes and their results.
- `src/lib/offline-round-words.ts` -- W2, P-31, P-29 reuse; MasterKeyControl words repinned.
- `src/hooks/useLiveKeyState.ts` (new) -- key state from the account and signer list reads.
- `src/components/wallet/KeyWarnings.tsx` (new) -- P-30/W1/W2 notes.
- `src/components/wallet/KeysPlate.tsx` (new) -- the Online plate; replaces `MasterKeyControl` in `WalletTab.tsx`.
- `src/pages/kind/OfflineNewTransaction.tsx`, `TransmitterNewTransaction.tsx`, `TransmitScreen.tsx`, `OfflineSign.tsx`, `src/components/wallet/TwoDeviceSign.tsx` -- warnings.

## Tasks & Acceptance

**Execution:**
- [ ] writes + result codes + tests (real xrpl.js `submitAndWait` tem message; decoded blobs)
- [ ] key-warnings, key-actions, words + tests
- [ ] plate, route warnings + screen tests
- [ ] gates; browser pass on Testnet

**Acceptance Criteria:**
- Given throwaway Testnet Online Wallets X (funded) and K, when X sets its Regular Key to an unheld key, then to K (P-54 Set it), runs Test the Regular Key, turns the master key off, and K turns it on, then each validates, W1 and W2 having shown on the plate.
- Given an account with no Regular Key, when its master key is turned off, then the claimed outcome shows P-31's sentence, not a code alone.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes

## Verification
