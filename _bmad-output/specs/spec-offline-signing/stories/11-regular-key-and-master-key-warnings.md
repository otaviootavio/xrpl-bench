---
title: 'Regular Key and master key warnings'
type: 'feature'
created: '2026-11-15'
status: 'done'
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
- [x] writes + result codes + tests (real xrpl.js `submitAndWait` tem message; decoded blobs)
- [x] key-warnings, key-actions, words + tests
- [x] plate, route warnings + screen tests
- [x] gates; browser pass on Testnet

**Acceptance Criteria:**
- Given throwaway Testnet Online Wallets X (funded) and K, when X sets its Regular Key to an unheld key, then to K (P-54 Set it), runs Test the Regular Key, turns the master key off, and K turns it on, then each validates, W1 and W2 having shown on the plate.
- Given an account with no Regular Key, when its master key is turned off, then the claimed outcome shows P-31's sentence, not a code alone.

## Implementation Notes

- Commits: `9a90c66` (code and tests), then this record.
- **`tem` (the hidden defect).** Both submit paths throw on a `tem` preliminary result (xrpl.js 5.1.0 `submitAndWait`, and `submitOnceAndWait` which copies it). The scanned path turned that into `unconfirmed` ("may have been sent"); the online paths showed the raw message. `transmit()` now reads the code with `temResultOf` (name `XrplError` + the exact `Transaction failed, temX:` start) and returns today's `failed` outcome. The online path still calls `submitAndWait` once (story 7 pin). Pinned against the real `Client.submitAndWait` (`writes-tem-failed.test.ts`); story 7's test that pinned the throw now pins the failed outcome.
- **P-31** lives in `offline-round-words.ts` (`LEDGER_REFUSAL`, tested against the P-31 row) and is spread into `result-codes.ts`, so SendTab, TransmitStep, `describeFailure`, two-device and History all say it.
- **Online key plate** (`KeysPlate.tsx`, logic `key-actions.ts`): title "Key state"; rows from `useLiveKeyState` (account + signer list through the key factory; failed read `'unknown'` = P-29 rows; pending = no rows); four P-47 keys, each opening its part in place, the part's key of the same words signs. `runKeyAction` signs with the Wallet's own `signingHandleFor` for its Signs-for Account and sends whatever was asked: any address (own, unheld, black hole), removal (new `submitSetRegularKey(null)`), master off/on from either key. Results reuse the Transmit step's `ResultView` (today's outcome words, P-31 reason, P-54 via `regularKeySet`). A throw before the Signing Check is P-16 (nothing signed); after it, `unconfirmed`. Today's `MasterKeyOffError` (master signing while the master key is off) stays: the ledger would refuse that signature anyway.
- **Test the Regular Key** (`testRegularKey`): an AccountSet with no fields signed by `regularKeyTester` — an open Online Wallet here on the Network whose key is the Regular Key and which already Signs for this Account (no new keystore path). Otherwise P-50.
- **Placement (decided here):** the Keys plate sits after Signs for, in the spine's place, and **replaces** `MasterKeyControl` in the FR-75 plate, so one screen never has two master-key controls and the FR-77 refusal is gone from the screen. The FR-75 plate keeps its note and "Let another wallet sign" until story 12. `MasterKeyControl.tsx` and its test are deleted; its four shipped words are pinned as literals.
- **Route warnings:** `RegularKeyNotes` (P-30 or W1, plus W2) on the Offline Regular Key Build and signing review, the Transmitter Build and Unsigned plate, the Offline Sign review (replacing story 9's inline P-30/W1) and the two-device offline review (with W3 above "New Regular Key": a SetRegularKey this device did not build). W2 on master key off when the key state names a black hole: Transmitter Build and Unsigned plate, answer plate, Offline-builds signing review. W5 now also for a removal of a set key (`endsSetRegularKey`, one rule; `replacesRegularKey` is its alias).

## Spec Change Log

## Review Triage Log

## Design Notes

- **Words.** Only W1–W5, "Test the Regular Key", P-16, P-29, P-30, P-31, P-47, P-50, P-54, the 2026-11-14 "Key state"/"Signer list", and shipped words ("Regular Key address", "Type “turn off” to confirm", "Master key on/off", the outcome words). Not approved and so not used: the spine's plate name "Keys" (the plate is titled "Key state" — owner to confirm), a confirm word distinct from P-47's, W-labels as alert titles, the old MasterKeyControl dialog sentences.
- **Failed read.** P-29 rows, no W5, no in-place test (P-50 shows); the actions stay offered, because the app refuses nothing and the ledger answers.
- **Claimed sentence.** The plate uses the Transmit step's outcome view, so a claimed result reads "…The network fee was still charged for this attempt." (P-31 quotes today's shorter sentence, which `control.ts` and SendTab use). Kept; noted in deferred-work.
- **Codes beside words.** P-31's reason is the outcome's sentence; the status lamp keeps today's bracketed code beside "Failed" ("as the reason inside today's outcome").
- **Left to story 12:** two-device's online refusals (FR-75/FR-77), `master-key.ts`/`control.ts` flows, the FR-75 plate.
- **Ledger fact seen:** turning the master key off while it is already off, signed by the Regular Key, validated `tesSUCCESS` (a no-op), not `tecNEED_MASTER_KEY`; that code came only while the master key was on.

## Verification

**Gates (2026-11-15, code at `9a90c66`):** `bun run lint` · `bun run build` · `bun run test` (181 files, 2862 tests; baseline 179 / 2830 before the new files) · `bun run check:contrast`. All green.

**Browser pass (2026-11-15, code at `9a90c66`).** `bun run dev -- --port 5311 --strictPort`; `.playwright-mcp/s11-run.js`, `s11-run2.js`, `s11-run3.js` (git-ignored) through the Playwright MCP: headless Chromium, a fresh context per run, CDP virtual authenticator, Testnet only. Throwaway accounts from `.playwright-mcp/s11-fund.mjs` (faucet from Node, as stories 7–10): X `rM9wwyeEF1duwTiR2q46Bg2MCGoxgRfUR9` (Online "Vault"), K `rEabvbfP5z5fEfYD6dsHjLbH7hesivKBbQ` (Online "Phone", unfunded), Z `r3Wiv8B2WZZfK9VXoeCDrBqHxYw3yP5c5x` (Online "Spare"), U `rM7E8mvT5e2i7C2vbeanUPTLyWUGNqekxs` (held nowhere). Runs 2 and 3 set Phone to sign for X in its Signs for plate (story 10), since each run is a fresh browser; run 2 imported X through today's "master key disabled" heads-up (Import anyway). Harness only: visibility pinned to visible. Ledger read after: `.playwright-mcp/s11-check.mjs`.

| Criterion | Result |
|---|---|
| Plate | Met: "Key state" after "This key signs for another account", before "Operating another account"; rows None. / Master key on / None.; four P-47 keys. |
| W1 and W2 | Met: black hole `rrrr…BZbvji` typed: W1 and W2, no W5 (`set-blackhole-w1-w2-320-dark` opened); U typed: W1 only. |
| Regular Key to a key not held here (W1) validated | Met: `EA1FE4ADC1FDBB2D9E109A85F6DA259B9A997AC05698C179A67A3EBF69DC6ED7` tesSUCCESS; P-54 second form shown. |
| Regular Key to K: P-30, W5, P-54 Set it | Met: "This key is the wallet Phone on this device." + W5; `F29098813BFDD4621CDBF8C9669AD7FFD2D6A94768B4A9392C883FA7A1C74141` tesSUCCESS; "Set the wallet Phone to sign for this account?" → Set it (`set-k-validated-p54-390-light` opened). |
| Test the Regular Key (held Regular Key Wallet) | Met: AccountSet with no changes signed by K for X, `01922F52AEC5555B2333004A0EC4BB8DD2A0EA5750893916081D5AD35EC99813` tesSUCCESS, shown as Validated on the plate before W4 (`off-test-validated-1280-light` opened). |
| Master key off, then on | Met: off by X `AADAA637516F6770B169C5841DBD99F956E32EE7D2B9159BC0C87E2446004688` tesSUCCESS (Testnet: W4, no phrase); on by K (Phone, signs for X) `F57EA06B26ECC90936D15BBDEB5C1147B9081B05375C33FACF120FFFCD04B8E8` tesSUCCESS. Ledger after: X RegularKey K, Flags 65536 (no lsfDisableMaster). |
| Ledger refusals in words | Met: `temBAD_REGKEY` (Phone sets X's Regular Key to X): "Failed (temBAD_REGKEY)" + "The Regular Key cannot be the address of the account." (nothing applied, no fee). `tecNO_ALTERNATIVE_KEY` (Spare turns off with no Regular Key; the test showed P-50): `EE55042A1CADF43A3A9DF7028C118E751088322ED61614D8411101DB269ED838`, "Failed — fee charged" + "The ledger needs a Regular Key or a signer list first. The network fee was still charged for this attempt." `tecNEED_MASTER_KEY` (Phone turns off while on): `A7E33B399FE3013EB5F319F50BC80AFC2487D6CED9E1988342BE3D0778985DBD`, "Only the master key can turn off the master key." + fee sentence. |
| Widths / themes | 320 dark, 390 light, 1280 light and dark for every plate state: no side scroll, 0 elements past the viewport. 320 at 200% text: 0 for the start plate, W1/W2, test result, `temBAD_REGKEY`, `tecNEED_MASTER_KEY`; **not met** for the `tecNO_ALTERNATIVE_KEY` outcome (2 elements: the unbreakable code, `no-alternative-key-320-zoom200` opened). A shared fix measured 0 but broke the pinned History rule, so it was reverted and deferred. |

Screenshots in the session scratchpad `s11/` (plate element captures; at 200% the sticky shell covers the plate top). Not driven in the browser (unit- and screen-tested): the Mainnet typed phrase, a failed key-state read, W5 on removal and W2 on the Offline, Transmitter, answer and two-device surfaces, the address camera. The dev server was stopped.
