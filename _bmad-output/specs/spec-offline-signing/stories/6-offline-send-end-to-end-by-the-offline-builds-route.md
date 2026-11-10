---
title: 'Offline Send end to end by the Offline-builds route'
type: 'feature'
created: '2026-11-10'
status: 'done'
baseline_commit: '420bc5d'
route: 'dispatch'
review_loop_iteration: 1
context:
  - '{project-root}/_bmad-output/specs/spec-offline-signing/SPEC.md'
  - '{project-root}/_bmad-output/specs/spec-offline-signing/route-checks.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-11-07/EXPERIENCE.md'
  - '{project-root}/docs/agents/ledger-io.md'
  - '{project-root}/docs/agents/keys-and-secrets.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** An Offline Wallet can hold a key but cannot send anything: its New transaction screen is a title, the codec has no Data-to-Sign Request or Data to Sign kind, and the Transmitter cannot answer a request (CAP-7, CAP-8, CAP-9, CAP-10 without retry; OS-FR-11, OS-FR-13 to OS-FR-16, OS-SM-1).

**Approach:** Two new codec kinds carried as UR by story 13's transport. The Offline Wallet Builds an XRP Payment with the online Send fields and P-1 in every reading's slot, reviews it, shows the request QR, scans the Transmitter's Data to Sign, checks it (exact set, request ID, Build hash, Network, Account, fee cap, highest-seen ledger), sets LastLedgerSequence itself, shows the signing review and signs once through `writes.ts`, then shows the signed QR and the Kept transaction plate. The Transmitter answers a request after the online pre-flight checks and remembers the request's Account for the Transmit step.

## Boundaries & Constraints

**Always:** Every new user-visible string is an approved P-n or fixed string, from one module tested against its source; shipped words are reused where a P-n is missing. An Offline Wallet mounts no ledger hook and asks no client. The signed transaction is made only from the kept Build plus the exact Data to Sign set; nothing else from the online device is used. Signing goes through `writes.ts` (`signPrepared`: fee cap, Account) with a handle the keystore gives an Offline view only. Transmitter reads go through the query-key factory, a failed read never produces Data to Sign (P-28), and any `autofill` stays in `writes.ts`. The Data to Sign carries the Transmitter's own Network. A lock erases the kept Build and request ID. Guards on Fee, Sequence, LastLedgerSequence and Network are asserted on the decoded signed blob.

**Never:** No retry of a Same Build and no "Start the request again" (story 7: a new request for a signed Build could pay twice without its Sequence comparison). No trust line, Regular Key or master key type (story 8). No token payment offline. No Send key on the Offline Wallet. No signed blob or Build in persisted storage. No invented words: "Scan 1 of 3", "Checking {address} on {Network}", the Data to Sign and signed plate titles, the type-picker legend and a "signing key" row term are left out (Design Notes).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Build | destination, tag, XRP amount | P-1 in the Network fee, Spendable and destination-check slots; "Review payment" | shipped field errors; self-send refused |
| Review → request | Show the request (P-37) | request QR, title "Data to sign needed" (focused), Network row, P-9, P-10 key and line, scan plate (P-57 title, P-11) | — |
| Change the transaction | P-10 key | back to the form, values kept; next request has a new request ID | — |
| Transmitter answers | request, all reads ok | "Checked on {Network}" list, Data to Sign QR on its own Network; request's Account remembered | — |
| Transmitter refuses | other Network / synced elsewhere | P-55, no QR | — |
| Transmitter refuses | tag required and none, self-send, account not activated, amount + fee over spendable, fee over cap | shipped online words, no QR | — |
| Transmitter read fails | account, reserves, destination, fee/sequence or ledger read | P-28 and "Read again", no QR | — |
| Destination not activated | read ok, destination absent | shipped online warning, still answers | — |
| Data to Sign ok | matching IDs, own Network, Fee ≤ cap | signing review: well "You are signing for {Network}" (focused), P-13, P-51, field list | — |
| Data refused | other request ID / Build hash / after a lock | P-16 + P-17 request, no review | request QR stays |
| Data refused | extra or missing value, bad type | P-16 + P-17 malformed | — |
| Data refused | other Network / Fee over cap / Account not Signs-for | P-16 + P-17 network / fee / account | — |
| Ledger index | lower than highest seen / too high for elapsed time | P-14 caution on the review; Sign still offered | — |
| Sign | Sign, Signing Check passes | blob: Account, Destination, Amount, tag, Fee and Sequence received, LastLedgerSequence = index + 150, no NetworkID; signed QR (envelope Network = Wallet's), P-12, Kept transaction plate | check dismissed / failed: shipped check words, nothing signed |
| Do not sign | P-34 key | back to the request, P-34 result in a status | — |
| Kept plate | I know the result / Cancel this transaction | P-61 confirm; Erase clears the round, Keep it keeps it | — |
| Lock mid-round | any phase | round erased; next open shows an empty form | — |
| Auto-lock near | ≤ 1 minute left during a round | P-58 caution with "Keep it unlocked" | — |
| Transmit after answer | signed QR for the answered Account, unsynced | P-25 Account line, no P-27, Send → outcome | wrong Account: P-26 |

</frozen-after-approval>

## Code Map

- `src/lib/qr-codec.ts` -- `r` (`xrplbench-request`) and `d` (`xrplbench-data-to-sign`) kinds, exact-set decoders, `payloadKindOf`.
- New `src/lib/offline-round.ts` -- Build, Build hash, request ID, Data to Sign judgement, assembly (LastLedgerSequence), ledger-jump warning, signing; in-memory round store erased by lock.
- New `src/lib/answer-request.ts` -- the Transmitter's pre-flight and Data to Sign.
- New `src/lib/offline-round-words.ts` + test -- the approved words.
- `src/lib/xrpl/writes.ts` -- `prepareDataToSign` (autofill, fee cap, validated index).
- `src/lib/crypto/keystore.ts`, `db.ts` -- `offlineSigningHandleFor` (Offline view only); highest-seen ledger on the view.
- New `src/components/wallet/HandoffPlate.tsx` -- QR hand-off plate: Network row, P-59 larger code, wake lock.
- `src/components/wallet/PayloadQr.tsx` -- size override for the larger code.
- New `src/pages/kind/OfflineNewTransaction.tsx`; `KindWallets.tsx`, `TransmitScreen.tsx`.
- `src/hooks/useClearCacheOnLock.ts` -- erases rounds of closed locks.

## Tasks & Acceptance

**Execution:**
- [x] codec kinds + tests
- [x] offline-round lib, keystore handle, ledger seen, words + tests (blob decoded)
- [x] prepareDataToSign + answer-request + tests
- [x] HandoffPlate, OfflineNewTransaction, TransmitScreen answer + tests
- [x] lock erasure, P-58
- [x] browser pass, two contexts, OS-SM-1 on Testnet

**Acceptance Criteria:**
- Given a funded Testnet account whose Seed is the Offline Wallet's, when the round runs between two contexts, then three scans (request, Data to Sign, signed) end in a validated payment and no field is typed twice (OS-SM-1).
- Given an Offline Wallet at any point of the round, then no ledger client is requested.

## Spec Change Log

- 2026-11-10, review round two (owner approval, relayed by the coordinator): approved exactly — "Scan 1 of 3" / "Scan 2 of 3" / "Scan 3 of 3" on the hand-off and scan plates; the plate titles "Data to sign" and "Signed transaction"; "Checking {address} on {Network}" while the Transmitter reads, in a status region; "Type of transaction" over the type list; "Signing key" as the signing review's row name; the QR alt text "QR code: {payload} for {Network}". In `offline-round-words.ts`, pinned as literals. The I/O rows "Review → request", "Transmitter answers" and "Sign" now show them; the Design Notes items they settle are marked so. The "Transmitter refuses" row adds the base-reserve refusal; "Destination not activated" now reads: below the base reserve refused (two-device's words), at or above it answered with no warning.

## Review Triage Log

Round two (coordinator review, 2026-11-10). Each fixed with the smallest change; tests run on the edited files only.

| # | Finding | Verdict | Fix |
|---|---|---|---|
| 1 | A `ledger_index` near 2^32 made LastLedgerSequence overflow; encode/sign threw in render (blank app) and the index was stored | real | `decodeDataToSign` refuses `ledger_index > 4294967295 - 150` as malformed; `assembleTransaction` bounds it again (RangeError). Tests (codec, judgement, screen) |
| 2 | The highest seen was saved before the user decided, so a declined bogus answer poisoned it | real | saved only after `signRound` succeeds. Test: Do not sign leaves it unchanged; Sign saves it |
| 3 | The first round had no bound: a Transmitter could make a blob valid for years with no warning | real | `LEDGER_FLOORS` (per Network, read 2026-11-10, refresh steps in `offline-window.ts`) is the P-14 reference before anything was seen, with the same 3 s a ledger + 30 rule. Tests |
| 4 | Mainnet/Testnet blobs carry no NetworkID | known limit | recorded in Design Notes |
| 5 | Below the base reserve to an unactivated destination was answered (fee burned, `tecNO_DST_INSUF_XRP`) | real | refused in two-device's shipped words; the not-activated warning is gone (it never applies once that is refused). Test |
| 6 | Tag-required refusal used two-device's "…Nothing was built." | real | online Send's words, "Destination tag (required by recipient)" (its tag label; the only online sentence for the fact). Test against SendTab |
| 7 | An unsynced Transmitter's read of the request Account outlived the lock | real | on Transmit unmount (a lock unmounts it) each answered Account's account-scoped data is removed unless an open Wallet holds it (`forgetSyncedAddress`). Test |
| 8 | Check list and warning before the focused heading, never announced; h3 before h2 | real | they now sit inside the plate after its h2 title; heading order h2 then h3 |
| 9 | Only the last answered Account was remembered | real | a set for this mount; unsynced, a blob whose Account is in it is expected. Tests: every answered Account counts, a refused answer adds none, the set goes with an unmount |
| 10 | Wake lock always on in Transmit | real | only while answering or after an answer until an outcome (the plate holds its own while shown) |
| 11 | Overlapping wake-lock requests could leak a sentinel | real | one at a time: skip while pending or held; re-take only after the browser released it. Tests: unmount before resolve releases it; hidden then visible takes it again, once |
| 12 | Focus on refusal and on answering from P-28 | real | the scanner takes focus; "Checking {address} on {Network}" in an always-mounted status. Tests |
| 13 | HandoffPlate repeated its heading in `aria-label` | real | `aria-labelledby` on the h2's id. Test |
| 14 | The larger code was sized from a render-time snapshot | real | CSS `min(100vw - 4rem, 100dvh - 17rem)` (reserve: dialog padding, close control, animated keys and caption, Back), drawn at 720 px. Test; browser |
| 15 | Kept plate showed P-1 for Fee after signing | real | the signed Fee and Sequence. Test |
| 16 | A request or signed code where Data to Sign is expected said "malformed" | real | P-36 via `payloadKindOf` first. `{kind}` filled with the approved titles in lower case ("data to sign", "signed transaction") and the glossary names ("data-to-sign request", "unsigned transaction"). Tests |
| 17 | Codec Account/Destination checked by pattern only | real | `isValidClassicAddress` (checksum). Test |
| 18 | Stale comments in Main.tsx and KindWallets.tsx | real | rewritten |
| 19 | Tests: a real failed read through Transmit with the real `answerRequest`; the reserve case | real | `transmit-answer-real.test.tsx`; `answer-request.test.ts` |

## Implementation Notes

- Commits: `4572b34` (code and tests), `852b12f` (round keys wrap at 320px with 200% text, found in the browser pass), then this record (the larger code clears the dialog's close control, P-58 tests).
- **Ledger count and margin (architecture choice, OS-FR-16, addendum "Assumptions").** `OFFLINE_LEDGER_WINDOW = 150`: about ten minutes at about four seconds a ledger. Ledger-jump warning: a received index may be at most `ceil(elapsed / 3 s) + 30` above the highest seen. Three seconds a ledger, not four, so a run of fast closes does not warn; 30 ledgers (about two minutes) for clock skew and the Transmitter's answer time. Lower than the highest seen always warns. Both are warnings (P-14), never refusals. In `offline-round.ts`, with tests.
- **Highest seen.** `WalletView.ledgerSeen = { index, at }`, written only on an Offline view, only raised (`noteLedgerSeen`), when a Data to Sign passes every refusal. Public ledger facts, no secret; survives a lock and a reload. A failed read or write of it skips the comparison that time, never refuses.
- **Codec.** `r` = `xrplbench-request`, `d` = `xrplbench-data-to-sign` in `PAYLOAD_UR_TYPES`, so story 13's transport (still or animated, scan session) carries them unchanged. Both envelopes are exact key sets (an extra or missing key is `malformed`); the request's `tx` is an XRP Payment with exactly `TransactionType, Account, Destination, Amount[, DestinationTag]` and `Account` = the Signs-for `account`. `payloadKindOf` lets Transmit dispatch on the kind. The legacy `xrplbench:1:` form stays u/s only. One existing fixture used `xrplbench-request` as an unknown type; it now uses `xrplbench-later`, and a second line pins `xrplbench-request` as a wrong kind.
- **Build hash.** SHA-256 (noble) of `["Payment", destination, amount, token(null), tag|null, flags(0)]`, the glossary's Same Build content; independent of the request ID, so story 7 can compare it after a lock. Request ID: 16 random bytes, new on every "Show the request".
- **Offline judgement order:** shape (exact set) → Network → request ID / Build hash (none kept after a lock) → fee cap → Account. Then the transaction is `builtTransaction(build)` + `Sequence`, `Fee` + `LastLedgerSequence = ledger_index + 150`, no `NetworkID`, nothing else.
- **Signing.** `keystore.offlineSigningHandleFor` refuses any view that is not Offline (`NotAnOfflineWalletError`), mirroring `signingHandleFor`'s refusal of non-Online views; signing goes through `writes.ts` `signPrepared` (fee cap, Account = handle's, Signing Check, dispose). Pinned with real cryptography in `lib/crypto/__tests__/offline-round-sign.test.ts`: the decoded blob's Account, Destination, Amount, tag, Sequence, Fee, `LastLedgerSequence = index + 150`, no `NetworkID`, no other field, valid signature, and the envelope's Network.
- **Transmitter.** `answer-request.ts`: P-55 (Network, Synced elsewhere), self-send, account read (fresh) → not activated refuses, reserves (fresh), destination check, tag required, then `writes.ts` `prepareDataToSign` (autofill's current-ledger Sequence and Fee, fee cap, validated index), then amount + fee ≤ spendable. Any read failure is `read-failed` (P-28, "Read again"); a fee over the cap is online Send's `FeeAboveCapError` words. A destination not on the ledger is warned in online Send's words and still answered, because online Send warns there and still sends. The answered request's Account is kept in the screen's state and passed as `requestAccount` to `expectedAccountFor`, so an unsynced Transmitter shows the P-25 Account line (no P-27) on the third scan, and a signed code for another Account is refused (P-26).
- **Round store.** In memory only (`offline-round.ts`), per Wallet, with its lock id; `useClearCacheOnLock` calls `eraseRoundsOfLocks` for every closed lock. A sign or a scan that resolves after a lock finds no round and shows nothing. The signed QR's text lives there until erased; nothing is persisted.
- **Screens.** New transaction: Payment form (online Send's shipped labels and errors; P-1 in the destination-check slot, the Network fee and Spendable well) → review (Built fields in ledger names, Fee = P-1; P-37, P-10 key) → request (hand-off plate "Data to sign needed", focused; P-9; P-10 key and line; scan plate with P-57 title and P-11; P-16 + P-17 alert) → signing review (well "You are signing for {Network}" as the focused h2, P-13, P-51, the decoded field list, P-14 caution, Sign / Do not sign) → signed (hand-off plate headed by P-12's first line, focused; P-12's second line with "10 minutes" and the local signing time; Kept transaction plate, P-18; P-61 confirm before erasing). P-58 shows with "Keep it unlocked" when a minute or less is left on the Wallet's lock during the request, signing or signed state; the key is activity like any press (the auto-lock timer restarts on its mousedown/keydown), the lock rule is unchanged.
- **Hand-off plate** (`HandoffPlate.tsx`): heading, Network row (label and the card's shipped Real funds / Not stable stamps), `PayloadQr`, lines, P-59 "Make the code larger" (a dialog with the code at the viewport's size and "Back"), a screen wake lock while up (`useWakeLock`, also on the Transmit and request screens; nothing changes where the API is missing).
- **Story 13's deferred entry settled:** UR types added; wake lock, "Make the code larger" (still and animated, via `PayloadQr`'s new `size`), plate title and Network row built. "Scan 1 of 3" is not built (words not approved).
- **Not handled:** the scanner still stops its camera after a hand-up, so after a refusal one press restarts it (EXPERIENCE "Notes For The Build" wants it to stay on). The QR on a 320px screen at 200% text shrinks with the plate (max-width) rather than keeping its drawn size; "Make the code larger" is the way round it.

## Design Notes

**Network is agreed, not signed (protocol fact, review round two).** On Mainnet, Testnet and Devnet a signed blob carries no `NetworkID` (it exists only above 1024), so the same Seed signs the same bytes for every Network. A Data to Sign labelled Testnet but carrying the Sequence the Account has on Mainnet (and a ledger index Mainnet accepts) yields a blob that is valid on Mainnet. The envelope's Network check and the Offline Wallet's Network refusal stop a mistake, not a Transmitter that lies; they cannot prevent this. The guard is the OS-FR-23 warning (one Seed on one Network) shown at create and import (`fact-check.md` case 1, route-checks "Known limit"). The ledger floor (round two) narrows the window such a blob can have, not the replay itself.

**Ledger floors (round two).** `src/lib/offline-window.ts` `LEDGER_FLOORS`, read 2026-11-10 from each Network's built-in Node: Mainnet 108237339 (10:26:41Z), Testnet 22214144 (10:26:50Z), Devnet 6831893 (10:26:51Z). Refresh: read `ledger` with `ledger_index: 'validated'` on each built-in Node and copy `ledger_index` and `ledger.close_time_iso`. A stale floor only widens the "too high" allowance; after a Testnet or Devnet reset the "lower" warning shows until the file is refreshed.

**Left out in round one: words not approved (settled 2026-11-10 except where marked).**
- The scan count caption "Scan 1 of 3" / "Scan 2 of 3" / "Scan 3 of 3" (EXPERIENCE component row, not a P-n). Approved and built.
- Titles for the Data to Sign plate and the signed plate. Approved ("Data to sign", "Signed transaction") and built; P-57's line and P-12's first line are now plate lines.
- The Transmitter's "Checking {address} on {Network}" reading status. Approved and built (status region).
- A legend for the type list and a term for the signing-key row. Approved ("Type of transaction", "Signing key") and built: a one-option type list (Payment) and the key's address on the signing review.
- QR alternative text naming payload and Network. Approved ("QR code: {payload} for {Network}") and built; `{payload}` is the plate's title in lower case.
- A refusal reason for a Transmitter request it cannot read beyond its shape (codec's shipped "That code could not be read."). Still open.

**Left out by design.** "Start the request again" (P-18's third key) is story 7's: re-requesting a signed Build would hand out a new Sequence and could pay twice without story 7's Sequence comparison. The Build is kept so story 7 can add it. Token payments offline are not built (the online asset list is a read).

**Words used.** P-1, P-9, P-10, P-11, P-12, P-13, P-14, P-16, P-17 (request, malformed, fee, network, account), P-18 (title, line, two keys), P-28, P-34, P-37, P-51, P-55, P-57 (Data to Sign plate line, "Checked on {Network}", the four results, scan plate title), P-58, P-59, P-61, P-62 "Payment"; fixed "Data to sign needed" and "You are signing for {Network}"; story 2's "Sign"; P-52 ledger field names as terms. Shipped words reused: online Send's "Destination address", "That doesn't look like a valid XRPL address.", "You can't send a payment to your own address.", "Destination tag (requirement unknown)", "Amount", "Network fee", "Spendable", "Review payment", "Destination not activated" and its line, the destination tag range error; funds check's not-activated and over-spendable sentences; two-device's "The destination requires a destination tag. Nothing was built."; the card's "Real funds" / "Not stable"; P-36's Transmit line for a Data to Sign scanned on Transmit; the Signing Check failure words. All in `offline-round-words.ts`, tested against their sources.

## Verification

**Gates (2026-11-10, final tree):** `bun run lint` · `bun run build` · `bun run test` (163 files, 2429 tests; baseline 157 / 2357) · `bun run check:contrast` — all green.

**Browser pass (2026-11-10, commit `852b12f`; a first full run on `4572b34` found the 200% key overflow).** `bun run dev -- --port 5226 --strictPort`, driven by `.playwright-mcp/s6-full.js` (git-ignored) through the Playwright MCP: a headless Chromium it launched, two fresh browser contexts O (offline device) and T (online device), each with a CDP virtual authenticator. Throwaway Testnet account `r9ei3Rb2TDp7xhnV6ZSFgAsoQUPf7PBwtn`, funded with 100 XRP by the Testnet faucet from a Node script (`client.fundWallet`); its Seed imported in O as an **Offline** Wallet (Text B and Text E ticked, no Open Check, Standard Signing Check). T: an unsynced Transmitter added from Onboarding (Sync skipped). Each payload moved by the scan plate's paste path: the plate's QR image was decoded from its pixels by jsQR in the showing page, and that text pasted into the other page. Harness only: `document.visibilityState` pinned to visible in both contexts (two windows taking turns would auto-lock each other). Nothing forced in the app. Screenshots in the session scratchpad `s6/`.

| Criterion | Result |
|---|---|
| OS-SM-1: three scans, validated, nothing typed twice | Met, twice. Run 2: 20 XRP to `rVffW5e…QFHmC`, hash `7EC983F787236CC56E5935E91ADA8A1D578A8B9C211B2914A6BC125A066DE25F`, T outcome VALIDATED. Run 1 on `4572b34`: hash `40212ED8…EC77B2`, confirmed on Testnet by a Node `tx` read: validated, `tesSUCCESS`, ledger 22206610, LastLedgerSequence 22206756. Two fields typed on O (destination, amount), none on T. Scans: `ur:xrplbench-request` (733 chars, still), `ur:xrplbench-data-to-sign` (still), `ur:xrplbench-signed` (still). |
| Offline Wallet makes no ledger connection | Met: 0 non-local WebSockets in O across the whole run; T opened `wss://s.altnet.rippletest.net:51233`. |
| Build with P-1, review, request plate focused | Met (`O-form-*`, `O-request-320-light`): focus on "Data to sign needed". |
| Transmitter answer | Met (`T-answered-320-dark`): "Checked on Testnet", Destination found, Spendable sufficient, Fee less than the fee limit, Data to Sign plate. Run 1 (destination not yet on the ledger) showed online Send's "Destination not activated" warning and still answered. |
| Signing review | Met (`O-signing-390-dark`): well "You are signing for Testnet" focused, P-13, "Valid until ledger 22206840" = received index + 150, the fields, Sign / Do not sign. |
| Signed QR, kept plate, no Send key | Met (`O-signed-1280-light`): P-12 heading focused, "valid until ledger 22206840 … approximately 10 minutes after 12:30 AM", Kept transaction plate; 0 buttons named Send on O. |
| Transmit after the answer, unsynced | Met: P-25 with "Account: r9ei3R…, correct" (no P-27), Send → VALIDATED (`T-outcome-390-light`). |
| P-61 then erase | Met: "I know the result" → confirm → Erase → empty form. |
| Make the code larger | Met. On `852b12f` the code filled the width with "Back" but the dialog's close control sat over its top-right corner (`O-larger-320-light`). Fixed in `d9a74d6`; re-checked in the browser on `d9a74d6` (O alone, same setup): at 320x640 and 390x844, light and dark, the close control's box does not intersect the code's (code 236 px at 320, 306 px at 390, fully inside the viewport), no side scroll (`O-larger2-320-dark` opened). |
| 320 / 390 / 1280, light and dark; 320 at 200% text | Met on `852b12f`: form, review, request, answer, signing review, signed and outcome: no page side scroll and no element past the viewport (measured each). On `4572b34` the "Review payment", "Make the code larger" and "Change the transaction" keys ran past the edge at 200%; fixed by letting round keys wrap. |

Not driven in the browser: a refused Data to Sign, P-14, P-58, a lock mid-round and a failed Transmitter read (each pinned by `offline-new-transaction.test.tsx`, `transmit-answer.test.tsx`, `answer-request.test.ts`); an animated code (a Payment fits one still code; story 13 verified the animated transport); a real camera. Screenshots opened: `O-larger2-320-dark`, `O-signing-390-dark`, `O-request-320-light`, `T-answered-320-dark`, `O-signed-1280-light`, `O-larger-320-light`, `T-outcome-390-light`. The dev server was stopped after the pass.

**Review round two (2026-11-10, commit `340735d` plus the Radio primitive on the type list).** Gates on the edited files' tests only (the coordinator runs the full set): 13 test files, all green; `tsc -b` and `bun run lint` green. Browser: `bun run dev -- --port 5226 --strictPort`, the same two-context script and harness as above, same funded account (still about 60 XRP), O imported as Offline, T an unsynced Transmitter.

| Check | Result |
|---|---|
| OS-SM-1, one full round | Met. 20 XRP, hash `888D96E7F2475B37D13BCA7948B9ADACDB62027131FBC813199C0F71BD58B573`, T outcome VALIDATED; three pasted scans decoded from the QR pixels; two fields typed on O; 0 ledger sockets on O. |
| New words | Met. O: "Type of transaction" over a checked "Payment" (Radio primitive, visible in dark: `r2-O-type-320-dark`), "Scan 1 of 3" on the request plate, "Scan 2 of 3" on the scan plate, "Signing key" with the key's address on the signing review, "Signed transaction" title (focused) and "Scan 3 of 3". T: status "Checking r9ei3Rb2TDp7xhnV6ZSFgAsoQUPf7PBwtn on Testnet" while reading, then "Data to sign" title, "Scan 2 of 3", the check list inside the plate after it; alt "QR code: data to sign for Testnet". |
| Kept plate after signing | Met. Fee 0.000012 XRP and Sequence 22206556, no P-1. |
| The window | LastLedgerSequence = received index + 150 (22214418); no P-14 against the Testnet floor. |
| Larger code (CSS-sized) | Met (`r2-O-larger-320-light`): fills the dialog width at 320x640, below the close control. |
| 320 / 390 / 1280 (dark 320, light 390 and 1280) and 320 at 200% text | Met: form, review, request, answer, signing review, signed and outcome: no page side scroll, nothing past the viewport. |

Not driven in the browser in round two: the reserve refusal, the floor's "too high" warning, a refused answer and the unmount cleanup (each pinned by unit tests). Screenshots opened: `r2-T-answered-390-light`, `r2-O-larger-320-light`, `r2-O-form-320-dark`, `r2-O-form-390-light`, `r2-O-type-320-dark`. The dev server was stopped.
