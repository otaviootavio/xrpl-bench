---
title: 'One Transmit step, and "Show the signed transaction before sending"'
type: 'feature'
created: '2026-11-08'
status: 'done'
baseline_commit: 'f4750389494d6d959191572eb9c5848b6138b81d'
route: 'dispatch'
review_loop_iteration: 1
context:
  - '{project-root}/_bmad-output/specs/spec-offline-signing/SPEC.md'
  - '{project-root}/_bmad-output/specs/spec-offline-signing/route-checks.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-11-07/EXPERIENCE.md'
  - '{project-root}/docs/agents/ledger-io.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The submit half of a write lives inside `submitAndClassify`, glued to signing, so a Signed Transaction from anywhere else (a scanned QR, story 4) cannot reach the ledger through the same checks, and there is no place for the user to see a signed blob before it is sent (CAP-5, CAP-6, OS-FR-9, OS-FR-10).

**Approach:** Split the post-sign half of `writes.ts` into one private Transmit core that every Signed Transaction enters, add the route-checks "Transmit step" checks to it, export one entry for a Signed Transaction that was not signed here, and add the per-Wallet "Show the signed transaction before sending" setting (stored, off by default) with a review gate between signing and transmitting. With the setting off, Online sending behaves exactly as before.

## Boundaries & Constraints

**Always:** Everything that reaches `submitAndWait` stays in `src/lib/xrpl/writes.ts` (the choke-point guard exempts that file only). Outcome rules unchanged: validated / claimed (`tec`) / failed / expired / unknown (decisions §16); the fee cap (§14) is checked on what is sent; a Signed Transaction is submitted at most once and never rebuilt or resubmitted after a failure. The setting-off path makes no extra network round trip: its past-LastLedgerSequence check uses the validated index read at signing. A refusal or a decline throws a typed error (like `FeeAboveCapError`) and sends nothing; `SubmitOutcome` gets no new variant. Refusal words are P-26 and the fixed "Expired. Nothing was sent."; the decline words are P-24 plus its decline line, copied unchanged into one strings module with a test against the source files. The setting is a `WalletView` field: absent is off, so nothing is migrated.

**Never:** No check that the signing key's address equals the Account (a Regular Key signs for another Account, OS-FR-20; the ledger refuses a wrong key). No widening of the 20-ledger Online window. With the setting off, no change to the Online Send, Trust line, Regular Key or master key screens. No unapproved user-visible words. No Transmitter screens (story 4).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Online send, setting off | any write type | Same calls in the same order as before (`autofill, open, request, sign, submitAndWait`), same outcomes | as today |
| Bad signature | blob whose `TxnSignature` does not verify | nothing submitted, in-flight back to 0 | throws refusal, P-26 "The signature is not correct." |
| Wrong Account | blob signed for another Account than expected | nothing submitted | P-26 account sentence, both addresses |
| Wrong Network | Signed Transaction names another Network | nothing submitted | P-26 network sentence, both Network labels |
| Partial payment | Payment with `tfPartialPayment` | nothing submitted | P-26 partial payment sentence |
| Past its window | validated index >= its LastLedgerSequence (after a pause, or a scanned blob) | nothing submitted | scanned: "Expired. Nothing was sent."; Online write: today's `expired` outcome |
| No window | blob without LastLedgerSequence | nothing submitted | P-26 heading |
| Unknown envelope Network | scanned envelope names a Network this build does not know | nothing submitted, checked before the blob is read | P-26 network sentence |
| Fee over cap | blob `Fee` above `MAX_FEE_DROPS` | nothing submitted | today's `FeeAboveCapError` |
| Regular Key signature | Account ≠ signing key's address, signature valid | sent | — |
| Setting on, user sends | Send on the show-before-sending screen | fresh validated read, checks, sent once | read fails: refused, nothing sent, "The app did not send the transaction. The app cannot read the ledger." |
| Setting on, user declines | Do not send, close, lock, leaving, unmount, or a rejected review | nothing submitted, in-flight back to 0 | decline, P-24 + decline line, caution toast |
| Setting on, Copy | Copy on the screen | blob on the clipboard; P-24 shown in a status and kept | — |
| Setting on, no reviewer | hook absent from the prompts | nothing submitted (fail closed) | decline |
| Scanned Signed Transaction | `transmitSignedTransaction(network, signed, expectedAccount, node?, review?)` | fresh validated read, same checks, optional review, sent once, same outcomes | as above |
| Setting switch | Before sending plate, Online and Transmitter only | stores or clears the field; an Offline view is refused | — |
| Expected Account rule | Synced address, else answered request's Account, else on-screen confirm | first defined wins; none → caller must confirm (P-27, story 4) | — |
| Existing record | view without the field | setting reads off; nothing written | — |

</frozen-after-approval>

## Code Map

- `src/lib/xrpl/writes.ts` -- the split: private `transmit` core (checks + `submitAndWait` + classify + `isExpiry`); `submitAndClassify` = sign half + optional review + `transmit`; new `SignedTransaction`, `transmitSignedTransaction`, `expectedAccountFor`, `TransmitRefusedError`, `TransmitDeclinedError`; `SigningHandle.reviewBeforeSending?`.
- New `src/lib/transmit-words.ts` + test -- P-24, P-26, "Expired. Nothing was sent.".
- `src/lib/crypto/db.ts` -- `WalletView.showBeforeSending?: true`.
- `src/lib/crypto/keystore.ts` -- `WalletMeta.showBeforeSending`; `setShowBeforeSending`; `Prompts.reviewSignedTransaction?`; `signingHandleFor` attaches the review gate when the setting is on (fail closed without a reviewer).
- `src/lib/xrpl/__tests__/writes.test.ts` -- existing tests unmodified; `writes-transmit.test.ts` new, for the matrix on real signed blobs.
- New `src/lib/crypto/__tests__/show-before-sending-setting.test.ts` -- the field, the setter, and the handle's review gate.
- New `src/components/wallet/SignedTransactionReview.tsx` + `__tests__/signed-transaction-review.test.tsx` -- the show-before-sending screen.
- `src/components/wallet/PinPromptDialog.tsx` -- the provider also answers `reviewSignedTransaction`, and answers no on lock, leaving and unmount.
- `src/hooks/usePrompts.ts` -- `useYieldingPrompts` counts the review, so the sheet that started the send yields.
- `src/pages/tabs/WalletTab.tsx` -- Before sending plate (Online after Node; Transmitter after Node).
- `src/pages/tabs/SendTab.tsx`, `TrustLinesTab.tsx` -- "Sign" confirm key when on (Send); a decline is a caution toast.
- `src/lib/control.ts`, `master-key.ts`, `two-device.ts` -- a Transmit refusal or decline is `refused`, never "may have been sent"; two-device's return passes the reviewer.
- `src/__tests__/tx-in-flight-bridge.test.ts` -- fixture only: its stand-in signer returned `'00'`, which the signature check now refuses; it returns a real precomputed blob instead. Assertions unchanged.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/xrpl/writes.ts` -- split out the Transmit core, no behaviour change, zero test files touched -- proves the split is pure
- [x] `src/lib/xrpl/writes.ts`, `src/lib/transmit-words.ts` -- Transmit checks, scanned-blob entry, review gate -- CAP-5, CAP-6
- [x] `src/lib/crypto/db.ts`, `keystore.ts` -- setting field, setter, handle wiring -- OS-FR-10 off by default
- [x] `SignedTransactionReview.tsx`, `PinPromptDialog.tsx`, `usePrompts.ts` -- the screen, answered on every exit -- CAP-6 (round two)
- [x] `WalletTab.tsx`, `SendTab.tsx`, `TrustLinesTab.tsx` -- Before sending plate, "Sign" key, caution decline -- CAP-6 (round two)
- [x] Review findings (round two) -- see Review Triage Log
- [x] Tests (cite OS-FR-9 / OS-FR-10): every matrix row on real signed blobs, asserting `client.submitted` and the decoded blob; setting kept across rename and Node change; absent reads off

**Acceptance Criteria:**
- Given the setting off, when any existing write runs, then the existing write suites pass with no assertion changed.
- Given a Signed Transaction from any source, when it reaches the Transmit step, then each refusal sends nothing and lowers the in-flight depth.

## Implementation Notes

- Commits, in order: `bf30b65` the pure split (`transmit()` out of `submitAndClassify`, zero test files touched, the same 799 send-related tests pass before and after); `3ee5d5d` the checks, the scanned-blob entry, the review gate and the stored setting; `d4c7db6` story record (round one); `f883706` two-device maps a Transmit refusal to expired / refused, and the unread-ledger words; `7a07b64` round two: the show-before-sending screen, the Before sending plate, the approved words, and the review fixes; `47567bf` the screen's wrapping at 320px and 200% text, found in the browser pass; then this story record.
- `withWriteInFlight` (private) owns the in-flight depth and the held client for `submitAndClassify` and `transmitSignedTransaction`; the raise/lower ordering is unchanged (the in-flight tests pass unmodified).
- `transmit()` runs `checkSignedTransaction` (Network, decode + `verifySignature`, Account, partial payment, fee cap, LastLedgerSequence present, window), then the optional review, then a fresh window check after the review, then the one `submitAndWait`. `transmitSignedTransaction` checks the Network before it hashes or decodes the blob, and an unknown envelope Network is refused by name. The Account check compares `Account` only, never the signing key's address (OS-FR-20).
- The window: refused when the validated ledger has reached LastLedgerSequence (`>=`, that ledger is closed, so the blob can no longer apply). LastLedgerSequence is read once, from the decoded blob, and that value feeds the review, P-24 in the decline, and `isExpiry` after submit. `isExpiry` keeps today's `>` (outcome rules unchanged). With no pause, the window check reuses the index read at signing (no extra round trip; the filtered order `autofill, open, request, sign, submitAndWait` is unchanged).
- An Online write whose window passed during a review returns today's `expired` outcome (not a throw), so Send and Trust line run their expired handling (fee re-read, panel, retry). A scanned blob gets the refusal "Expired. Nothing was sent.".
- The Network check compares the envelope's Network: on Mainnet, Testnet and Devnet a blob carries no `NetworkID`, so it stops a mistake, not a compromised sender (route-checks "Known limit"). Story 4's scanner must pass the Network the signed-QR envelope names, never its own (code comment on `assertNetwork`).
- The review: `SigningHandle.reviewBeforeSending` (set by `signingHandleFor` when the view stores `showBeforeSending: true` and the kind is not Offline), `submitSignedBlob`'s new `review` argument (two-device return, from the Wallet's meta) and `transmitSignedTransaction`'s `review` argument (story 4). A rejected review is a decline. Without a `Prompts.reviewSignedTransaction` the answer is no (fail closed).
- The screen (`SignedTransactionReview`) is answered by `PinPromptProvider`: Send is yes; Do not send, Escape / the close control, the active Wallet's lock closing, any route change, a newer review and unmount are no. So the in-flight depth is always released (browser: `txInFlight` true while open, false after the auto-lock answered no). The blob leaves memory with the screen. Focus goes to "Send it to the ledger?" (a `DialogTitle` placed above the keys), never to Send. Copy writes the blob and shows P-24 inside an always-rendered `role="status"`; it stays.
- The decline's P-24 message is shown by the caller as a caution toast (SendTab, TrustLinesTab read the error by name, so their test mocks of the writes module need no new export); control and master-key return it as `refused`.
- The switch is the Checkbox primitive with `role="switch"` (the panel vocabulary has no Switch primitive), labelled by the setting name and described by P-44.
- The Online window stays 20 ledgers (about 60 to 80 s): a slow review ends in `expired`. Not widened.
- `setShowBeforeSending(id, true)` on an Offline view throws `SettingNotForOfflineError`. Its message is developer text; no screen can reach it (the plate is not on an Offline Wallet).
- Never-resubmit stays structural: one submission per entry, no blob kept, nothing retries. A session-wide "already sent" guard is story 4's (re-scanning a signed QR).
- Two-device signing (retired in story 12): its return path now has the Transmit checks and the review; a blob that expires between its own pre-check and the Transmit step is `expired` before submit, and a failed read there is `refused`. Not exercised in the browser.

## Spec Change Log

- 2026-11-08, round two (owner approval, relayed by the coordinator): the words "Send", "Do not send", "Copy", "Sign" (Online confirm key when the setting is on), the plate title "Before sending" with the switch labelled "Show the signed transaction before sending", and "The app did not send the transaction. The app cannot read the ledger." are approved exactly. They are in `transmit-words.ts`, pinned as literals. The screen and the plate are built. The I/O matrix rows for the window (`>=`, no window, unknown envelope Network, Online expiry as today's outcome) and the review exits changed with the review findings below.

## Review Triage Log

Round two findings (coordinator), each checked at the code.

| # | Finding | Verdict | Fix |
|---|---|---|---|
| 1 | control.ts / master-key.ts read a Transmit refusal or decline as "may have been sent"; with a failed re-read, reported unconfirmed | real | mapped to `refused` with its words before the re-read; tests with a failing re-read in both suites |
| 2 | a rejected `reviewBeforeSending` escapes as a generic error | real | a rejection is a decline (`writes-transmit`, both entries) |
| 3 | an Online `expired` refusal skips Send / Trust line expired handling | real | `submitAndClassify` returns today's `expired` outcome for it |
| 4 | scanned blob with no LastLedgerSequence is sent unchecked | real | refused (`no-window`, P-26 heading) for every entry |
| 5 | boundary: validated == LastLedgerSequence must refuse | real | `>=`; test flipped, plus a one-before test |
| 6 | LastLedgerSequence taken from the requested tx, not the blob | real | read once from the decoded blob; feeds review, P-24, `isExpiry` |
| 7 | unknown envelope Network throws a TypeError | real | checked, refused as `network` naming the raw value |
| 8 | scanned entry hashes before the Network check | real | Network first |
| 9 | envelope reliance undocumented | real | comment on `assertNetwork` and Implementation Notes |
| 10 | `submitSignedBlob` skips the review | real | `review` argument, fed from the Wallet's meta in `submitReturned` |
| 11 | `transmitSignedTransaction` has no reviewer | real | optional `review`, fail closed |
| 12 | `setShowBeforeSending` stores on for an Offline view | real | refused; tested |
| 13 | tests: two-view record; setting on + read fails on `submitAndClassify`; `expectDepthReleased` missing | real | added |
| 14 | bridge fixture hash and window limit | real | `hashes.hashSignedTx`, comment on the validated-index limit |
| 15 | transmit-words P-26 comment contradicts its assertion | real | the assertion now checks the row's pointer to the fixed string, and the comment says so |
| 16 | story lists not every commit; `review_loop_iteration` | real | fixed here |

Browser pass finding (round two): at 320px and 200% text the screen's body overflowed sideways (a ledger field name in the tracked legend face) and the hash row ran under the close control. Fixed in `47567bf`, re-measured (body `scrollWidth === clientWidth` at 320/200%, 390, 1280).

## Design Notes

**Words.** Approved and used: P-24, P-26, P-44, P-52 "Transaction hash", the fixed "Send it to the ledger?" and "Expired. Nothing was sent.", and the round-two words above. Field rows use the ledger's own field names (P-52); amounts use today's formatters. The screen follows EXPERIENCE "Transmit step": hash (data face, full), the decoded field list, Copy (outline), the P-24 caution after Copy, then the question and Send (commit, the one orange key) / Do not send (outline). On a sheet below `sm` the keys stick to the bottom, as every sheet's footer does.

## Verification

**Round one commands:** `bun run lint` · `bun run build` · `bun run test` (136 files, 2020 tests; baseline 133 / 1989) · `bun run check:contrast` -- all green.

**Browser pass (2026-11-08, commit `3ee5d5d`).** `bun run dev -- --port 5181 --strictPort`, Playwright Chromium in a fresh browser context with a CDP virtual authenticator (ctap2, internal, UV, PRF). One throwaway Testnet wallet "S2 Sender" made with the quiz (Stored Seed, no Open Check, nothing asked for signing), funded with the in-app faucet (100 XRP). Submit frames counted by wrapping `WebSocket.prototype.send` in the page and matching `"command":"submit"`. Screenshots in the session scratchpad `s2/`, each one opened.

| Criterion | Result |
|---|---|
| Online send, setting off, validated | Met. 2 XRP to a new address: dialog unchanged ("Confirm and send"), outcome VALIDATED, toast "Payment sent.", exactly 1 submit frame (`sent-validated-390-light`). |
| Online send, setting off, `tec` outcome as today | Met. 0.5 XRP to an unfunded address: "FAILED — FEE CHARGED (TECNO_DST_INSUF_XRP)" and "The network fee was still charged", 1 submit frame. Captured at 320, 390, 1280 in light and dark (`claimed-*`; opened `claimed-320-dark`, `claimed-1280-light`). |
| Another write type through the same step | Met. Trust line USD, limit 1,000, to the activated address: line listed, 1 submit frame (`trustline-390-light`). |
| Setting on, no reviewer: nothing sent | Met, **forced state**: `views[0].showBeforeSending = true` written in IndexedDB, then reload. Send 1 XRP: toast "WARNING: This signed transaction is valid until ledger 22170961. Until then, a person who has it can send it. The app did not send the transaction.", **0** submit frames, spendable unchanged (`forced-setting-on-declined-390-light`). The toast is error-toned (generic catch); see Implementation Notes. |
| Show-before-sending screen and settings control | Not built in round one (words then unapproved); built and verified in round two below. |

The story adds no layout, so 200% text was not checked. Dev server stopped after the pass.

**Round two (2026-11-08, commit `47567bf`).** Gates on the final tree: lint, build, test (137 files, 2045 tests), check:contrast, all green.

Browser: `bun run dev -- --port 5182 --strictPort`, Playwright Chromium in a fresh browser context with a CDP virtual authenticator (ctap2, internal, UV, PRF) and clipboard permission. One throwaway Testnet wallet "S2 Review" made with the quiz (Stored Seed, App PIN Open Check, auto-lock 30 seconds, nothing asked for signing), funded with the in-app faucet. Submit frames counted by an init script wrapping `WebSocket.prototype.send`; `txInFlight` read from the app's own store module. The first round-two capture ran on `7a07b64` and found the 200% overflow; the fix was hot-reloaded and every measurement after it is on the `47567bf` tree. Screenshots in the session scratchpad `s2b/`, each one opened.

| Criterion | Result |
|---|---|
| Setting off: send as before | Met. Confirm keys "Cancel" / "Confirm and send" (commit); 2 XRP validated, "Payment sent.", 1 submit frame (`off-sent-390-light`). |
| The switch in Local settings | Met. Before sending plate after Node: `role=switch` named "Show the signed transaction before sending", `aria-checked` false, P-44 under it; one click turns it on. Captured 320/390/1280 light and dark (opened `plate-390-dark`) and 320 at 200% text (`plate-320-zoom200-light`: plate `scrollWidth === clientWidth`, no page side scroll; the label wraps mid-word because every Config plate sets `overflow-wrap: anywhere`, a pre-existing rule). |
| Setting on, Send | Met. Confirm key "Sign" in the default finish (`on-confirm-sign-390-light`); after it the Send sheet yields and one dialog is open; focus on "Send it to the ledger?"; 0 submits while open; Send: validated, "Payment sent.", 1 submit frame. |
| Copy | Met. The clipboard holds the 364-character blob (starts `120000220000`); P-24 caution shown and kept. Captured 320/390/1280 light and dark (opened `review-320-light`, `review-1280-dark`). |
| Setting on, Do not send | Met. 0 submit frames, spendable unchanged (95.99998 XRP before and after), caution toast "WARNING: This signed transaction is valid until ledger 22171778. Until then, a person who has it can send it. The app did not send the transaction." (`declined-390-light`, opened `declined-390-dark`). |
| Lock while the screen is open | Met. Screen open, `txInFlight` true; no activity, the 30-second auto-lock closed the lock: the screen closed, the lock screen showed, the same P-24 caution toast, `txInFlight` false, 0 submit frames (`lock-after-390-light`). |
| 200% text at 320, the screen | Met after the fix: body `scrollWidth === clientWidth` (303), no side scroll at 390 and 1280 either (`review-320-zoom200-light-fixed`). Before the fix it was 351 > 303 (`review-320-zoom200-light`). Below the sticky footer a strip of content shows through: the known sheet-footer issue already in deferred-work (spec-batch2-d), not new. |

Leaving the screen (Back) was not driven in the browser; it is pinned by `signed-transaction-review.test.tsx` (route change answers no). Two-device's return path was not driven. The dev server was stopped after the pass.

