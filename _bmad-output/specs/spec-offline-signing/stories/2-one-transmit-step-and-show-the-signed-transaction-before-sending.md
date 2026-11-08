---
title: 'One Transmit step, and "Show the signed transaction before sending"'
type: 'feature'
created: '2026-11-08'
status: 'done'
baseline_commit: 'f4750389494d6d959191572eb9c5848b6138b81d'
route: 'dispatch'
review_loop_iteration: 0
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

**Never:** No check that the signing key's address equals the Account (a Regular Key signs for another Account, OS-FR-20; the ledger refuses a wrong key). No widening of the 20-ledger Online window. No change to the Online Send, Trust line, Regular Key or master key screens. No unapproved user-visible words: a piece that needs them is left out and named here. No Transmitter screens (story 4).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Online send, setting off | any write type | Same calls in the same order as before (`autofill, open, request, sign, submitAndWait`), same outcomes | as today |
| Bad signature | blob whose `TxnSignature` does not verify | nothing submitted, in-flight back to 0 | throws refusal, P-26 "The signature is not correct." |
| Wrong Account | blob signed for another Account than expected | nothing submitted | P-26 account sentence, both addresses |
| Wrong Network | Signed Transaction names another Network | nothing submitted | P-26 network sentence, both Network labels |
| Partial payment | Payment with `tfPartialPayment` | nothing submitted | P-26 partial payment sentence |
| Past its window | validated index > its LastLedgerSequence (after a pause, or a scanned blob) | nothing submitted | "Expired. Nothing was sent." |
| Fee over cap | blob `Fee` above `MAX_FEE_DROPS` | nothing submitted | today's `FeeAboveCapError` |
| Regular Key signature | Account ≠ signing key's address, signature valid | sent | — |
| Setting on, user sends | review hook resolves true | fresh validated read, checks, sent once | read fails: refused, nothing sent |
| Setting on, user declines | review hook resolves false | nothing submitted, in-flight back to 0 | throws decline, P-24 + decline line |
| Setting on, no reviewer | hook absent from the prompts | nothing submitted (fail closed) | decline |
| Scanned Signed Transaction | `transmitSignedTransaction(network, signed, expectedAccount)` | fresh validated read, same checks, sent once, same outcomes | as above |
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
- `src/__tests__/tx-in-flight-bridge.test.ts` -- fixture only: its stand-in signer returned `'00'`, which the signature check now refuses; it returns a real precomputed blob instead. Assertions unchanged.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/xrpl/writes.ts` -- split out the Transmit core, no behaviour change, zero test files touched -- proves the split is pure
- [x] `src/lib/xrpl/writes.ts`, `src/lib/transmit-words.ts` -- Transmit checks, scanned-blob entry, review gate -- CAP-5, CAP-6
- [x] `src/lib/crypto/db.ts`, `keystore.ts` -- setting field, setter, handle wiring -- OS-FR-10 off by default
- [x] Tests (cite OS-FR-9 / OS-FR-10): every matrix row on real signed blobs, asserting `client.submitted` and the decoded blob; setting kept across rename and Node change; absent reads off

**Acceptance Criteria:**
- Given the setting off, when any existing write runs, then the existing write suites pass with no assertion changed.
- Given a Signed Transaction from any source, when it reaches the Transmit step, then each refusal sends nothing and lowers the in-flight depth.

## Implementation Notes

- Two commits. `bf30b65` is the pure split: `transmit()` extracted from `submitAndClassify`, zero test files touched, the same 799 write, Send, Trust line, two-device, control and master-key tests pass before and after. `3ee5d5d` adds the checks, the scanned-blob entry, the review gate and the setting.
- `withWriteInFlight` (new, private) now owns the in-flight depth and the held client for both `submitAndClassify` and `transmitSignedTransaction`; the raise/lower ordering is unchanged (the in-flight tests pass unmodified).
- Check order in `checkSignedTransaction`: Network, decode + `verifySignature`, Account, partial payment, fee cap, LastLedgerSequence. A blob that does not decode is a signature refusal. The Account check compares `Account` only, never the signing key's address (OS-FR-20; a controlled view signs as the Regular Key).
- Past-LastLedgerSequence: with no pause, the index read for the window at signing is reused (no new round trip; the filtered order `autofill, open, request, sign, submitAndWait` is unchanged). After a review, for a caller-set LastLedgerSequence (two-device), and for a scanned blob, it reads the validated ledger once more; a failed read refuses. A blob with no LastLedgerSequence is not refused by the app (no rule says so); the ledger decides.
- A failed window read at the Transmit step refuses with the P-26 heading alone ("The app did not send the transaction."). No approved sentence says why; P-26 heading plus P-28's first sentence ("The app cannot read the ledger.") would say it, but that pairing is not written in the spine, so it is a word request, not shipped.
- **Two deliberate departures from "exactly as before", both on Two-device signing (still in Online Local settings until story 12).** `submitSignedBlob` sends a caller-set LastLedgerSequence, so its blob takes the fresh-read branch. (1) A blob that expires between `submitReturned`'s own pre-check and the Transmit step's read is now refused before submit instead of submitted and classified `expired`. (2) A failed read there now refuses instead of submitting. Both follow route-checks ("Past its LastLedgerSequence: Refuse", a failed read never relaxes a guard). `submitReturned` maps a `TransmitRefusedError` to `expired` or `refused`, never to "may have been sent" (new test in `two-device.test.ts`, which fails without the mapping). Two-device submit was not exercised in the browser pass. `control.ts` and `master-key.ts` treat any throw after the Signing Check as possibly sent and re-read the ledger; an unchanged read then reports the refusal's own words, so a Transmit refusal there ends as `refused`, correctly.
- The review gate keeps the in-flight depth raised while it is open (a live signed blob exists). The screen that answers it must settle it on every exit (decline, unmount, lock), or the depth stays raised and updates are held for the session; the hook's doc comment says so. The Online window stays 20 ledgers (about 60 to 80 s), so a slow review ends in "Expired. Nothing was sent.": a stated limit, not widened because that would change setting-off behaviour.
- `signingHandleFor` attaches `reviewBeforeSending` only when the view stores `showBeforeSending: true` and the kind is not Offline. With no `Prompts.reviewSignedTransaction`, it answers false, so every send is declined (fail closed). That covers every write that gets its handle from `signingHandleFor`: Send, Trust line, master key, Regular Key (control). `submitSignedBlob` (two-device, retired in story 12) builds its own handle and gets the checks but no review.
- `tx-in-flight-bridge.test.ts`: fixture change only. Its stand-in signer returned `'00'`, which now fails the signature check; it returns a real blob signed beforehand (under jsdom a key cannot be derived, but `verifySignature` was probed and works there). The address moved to that blob's Account. Assertions unchanged.
- Never-resubmit stays structural: each entry submits its blob once and keeps no blob; nothing retries. A session-wide "this hash was already sent" guard was not added: it needs refusal words that are not approved, and the Online path cannot reach it. Story 4 owns re-scanning the same signed QR.
- Left out, for missing approved words (see Design Notes): the show-before-sending screen (hash, field list, Copy, "Send it to the ledger?" with Send / Do not send), the Local settings control, and the Online confirm key "Sign". With no control, the setting stays off for every Wallet, and the Online screens did not change. When the words are approved, the remaining work is a `Prompts.reviewSignedTransaction` provider (counted in `useYieldingPrompts` so the Send sheet yields), the plate on Online Local settings calling `setShowBeforeSending`, and a decline toast in warning tone (today the generic catch shows it as an error toast, seen in the browser pass).

## Spec Change Log

## Design Notes

**Words audit (brief, 2026-11-08).** Approved and used: P-24, P-26, "Expired. Nothing was sent.", "Send it to the ledger?" (fixed), P-44, P-52 "Transaction hash". The show-before-sending screen and the Local settings control also need these, which are in neither approved list (they appear only in EXPERIENCE prose or the mockup):

- the screen's commit key "Send" and its decline key "Do not send" (EXPERIENCE "Transmit step"; P-27 names "Send" only inside its own sentence);
- the copy key's label "Copy" (P-44 says "a copy button", no label);
- the Online confirm key "Sign" when the setting is on (EXPERIENCE "Transmit step" table);
- the plate title "Before sending" (EXPERIENCE plate table), or approval to use the setting's name (SPEC CAP-6) as the plate title and the control's label.

So the screen and the settings control are left out of this story. The setting is stored, read and enforced in `lib`; with no control it stays off for every Wallet, and the Online screens are unchanged.

## Verification

**Commands (final tree):** `bun run lint` · `bun run build` · `bun run test` (136 files, 2020 tests; baseline 133 / 1989) · `bun run check:contrast` -- all green.

**Browser pass (2026-11-08, commit `3ee5d5d`).** `bun run dev -- --port 5181 --strictPort`, Playwright Chromium in a fresh browser context with a CDP virtual authenticator (ctap2, internal, UV, PRF). One throwaway Testnet wallet "S2 Sender" made with the quiz (Stored Seed, no Open Check, nothing asked for signing), funded with the in-app faucet (100 XRP). Submit frames counted by wrapping `WebSocket.prototype.send` in the page and matching `"command":"submit"`. Screenshots in the session scratchpad `s2/`, each one opened.

| Criterion | Result |
|---|---|
| Online send, setting off, validated | Met. 2 XRP to a new address: dialog unchanged ("Confirm and send"), outcome VALIDATED, toast "Payment sent.", exactly 1 submit frame (`sent-validated-390-light`). |
| Online send, setting off, `tec` outcome as today | Met. 0.5 XRP to an unfunded address: "FAILED — FEE CHARGED (TECNO_DST_INSUF_XRP)" and "The network fee was still charged", 1 submit frame. Captured at 320, 390, 1280 in light and dark (`claimed-*`; opened `claimed-320-dark`, `claimed-1280-light`). |
| Another write type through the same step | Met. Trust line USD, limit 1,000, to the activated address: line listed, 1 submit frame (`trustline-390-light`). |
| Setting on, no reviewer: nothing sent | Met, **forced state**: `views[0].showBeforeSending = true` written in IndexedDB, then reload. Send 1 XRP: toast "WARNING: This signed transaction is valid until ledger 22170961. Until then, a person who has it can send it. The app did not send the transaction.", **0** submit frames, spendable unchanged (`forced-setting-on-declined-390-light`). The toast is error-toned (generic catch); see Implementation Notes. |
| Show-before-sending screen and settings control | Not built: words not approved (Design Notes). |

The story adds no layout, so 200% text was not checked. Dev server stopped after the pass.
