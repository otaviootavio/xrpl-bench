---
title: 'Transmitter-builds route for every write'
type: 'feature'
created: '2026-11-14'
status: 'done'
baseline_commit: '097fc85'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/specs/spec-offline-signing/SPEC.md'
  - '{project-root}/_bmad-output/specs/spec-offline-signing/route-checks.md'
  - '{project-root}/_bmad-output/specs/spec-offline-signing/consequence-texts.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-11-07/EXPERIENCE.md'
  - '{project-root}/docs/agents/ledger-io.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A token payment cannot be signed offline by any route, the Synced Transmitter's New transaction is a title, and the Offline Wallet's Sign screen (P-3) is a title, so OS-SM-2 fails (CAP-11; OS-FR-17, OS-FR-18, OS-FR-21 W1/W3).

**Approach:** The Synced Transmitter Builds any write the online app builds, for its Synced address, with live reads and the online refusals, then makes the Unsigned Transaction (Sequence, Fee, LastLedgerSequence = validated + 150) in the `u` codec kind with an envelope `{v, network_id, ledger_index, tx}` (P-38), shows it (P-33) and scans the signed QR into the Transmit step. The Offline Sign screen judges the whole payload against an allow-list of types, fields and flags it can show in words, refuses in P-16/P-17, shows the signing review (Network large, P-13 in ledgers, P-15, P-14, P-53 under risky rows, W3, W1/P-30, W4), signs exactly the transaction it showed, records the signing in the signed list (cross-route Build hash) and shows the signed QR.

## Boundaries & Constraints

**Always:** Approved P-n, W texts, fixed strings, the 2026-11-09/10/14 approvals or shipped words for the same fact, in one module tested against its source. The Offline Wallet reads nothing from the ledger. What is shown is `decode(encode(judged))`, and that same object is signed. Transmitter reads go through the key factory, fresh; a failed read never makes an Unsigned Transaction. Story 6/7 signing order: sign, lock still open, record, lock still open, show, then highest seen. Guards pinned on the decoded signed blob. Payment's Build hash literal unchanged. Two-device (FR-78) keeps working until story 12.

**Never:** No app refusal of a key action (SPEC "Trust the user"). No "Other transactions" type that opens nothing. No scan count on this route ("Scan {n} of 3" is the only approved form). No signed blob stored. No `prepareUnsigned` change (two-device's 75-ledger window). No retry table on this route (the Transmitter sets the Sequence); P-19 shows as information.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Type list | Synced Transmitter, New transaction | Payment, Trust line, Regular Key, Master key; P-48 line on key types | unsynced: no screen (story 4) |
| Payment Build | XRP or a held token, destination, tag, amount; live Spendable, Network fee, token list, destination check | online Send's words and warnings; P-38 | online field errors; key held while invalid |
| Make the unsigned transaction | any type | fresh pre-flight (online refusals, as the answer); Unsigned plate: P-33 heading, Network row, QR, signed scanner ("Scan the signed transaction") | refusal: online words; read failed: "The app cannot read the ledger." + "Read again" |
| Key types on the Transmitter | Regular Key / Master key | key state rows from live reads; W5 when a set key is replaced; master off: "Test the Regular Key" → P-50, W4 | failed read: P-29 rows |
| Signed scanned on the Transmitter | signed code | Transmit step (P-25, fields, Send), expected Account = Synced address | P-26 / P-36 |
| Offline Sign, wrong kind | request, data, signed code | P-36 with the kind names | — |
| Offline refusals | malformed envelope or tx; other Network; Account not Signs-for; SigningPubKey/TxnSignature/Signers; Fee over cap; Payment `tfPartialPayment`; unknown type, field, flag or amount form | P-16 + P-17 (malformed / network / account / pre-set / fee / partial / "The app cannot show {name} in words."); no review; scanner ready | signer never opened |
| TrustSet `tfSetNoRipple` | same bit as `tfPartialPayment` | accepted (partial refusal is Payment only) | — |
| Signing review | accepted payload | "You are signing for {Network}" focused; "Time limit: {n} ledgers"; P-51; rows of the encoded tx; Signing key; P-15 when n > 150; P-14 from the envelope index | — |
| Risky rows | SendMax, Paths, DeliverMin, Memos, Delegate, TicketSequence, asfNoFreeze, asfAllowTrustLineClawback, tfSetfAuth | P-53 caution under that row | memo not UTF-8: refused (cannot show) |
| SetRegularKey | RegularKey set | W3 above the RegularKey row; P-30 when a key Wallet here holds it, else W1 | — |
| Master key off | AccountSet SetFlag asfDisableMaster | W4's sentence; Mainnet: typed "turn off" holds Sign | — |
| Do not sign | P-34 | P-34 result; back to the scanner | — |
| Sign | Signing Check passes | record (Build hash, Sequence, hash, LLS, ledger index, time) then signed QR ("Signed transaction", P-12 with the window's minutes) | record write fails: P-16, no QR; check dismissed: shipped words |
| Same Build | earlier record with this Build hash (either route) | P-19 + record on the review | list unreadable: P-16 |
| Lock mid-round | either device | Unsigned / review / signed QR gone | — |

</frozen-after-approval>

## Code Map

- `src/lib/qr-codec.ts` -- `encodeUnsigned` writes `ledger_index` when given; strict `decodeUnsignedForSigning` (exact envelope).
- New `src/lib/unsigned-judge.ts` -- allow-list judge, risky rows, window, cross-route Build hash.
- `src/lib/offline-round.ts` -- `buildHashOf` reused; `signUnsignedOffline` (sign the judged tx).
- `src/lib/answer-request.ts` -- shared `preflight(wallet, account, tx)` used by the answer and the build; token Payment pre-flight.
- New `src/lib/transmitter-build.ts` -- the Transmitter's Build union, `makeUnsigned`.
- `src/lib/offline-round-words.ts` + test -- P-13 ledgers, P-15, P-17 rest, P-33, P-38, P-48 line, P-53, W1, W3, P-30.
- `src/lib/transmit-step.ts` + `src/components/wallet/TransmitStep.tsx` -- the signed-code part of Transmit (ready, send, views), shared by Transmit and New transaction.
- `src/components/wallet/HandoffPlate.tsx` -- optional `payload` for the QR alt when the heading is not the title.
- New `src/pages/kind/OfflineSign.tsx`, `TransmitterNewTransaction.tsx`; `KindWallets.tsx`, `TransmitScreen.tsx`.

## Tasks & Acceptance

**Execution:**
- [x] codec + judge + Build hash + offline signing (real-crypto blobs) + tests
- [x] shared pre-flight, token pre-flight, `makeUnsigned` + tests (decoded tx)
- [x] words + test
- [x] Offline Sign screen, Transmitter New transaction, Transmit step reuse + tests
- [x] gates; browser pass with two contexts on Testnet

**Acceptance Criteria:**
- Given a funded throwaway Testnet account held as an Offline Wallet and a Transmitter Synced to it, when a token Payment and a TrustSet are each built on the Transmitter, signed offline and transmitted, then both validate.
- Given an Unsigned Transaction for another Network, then P-16/P-17 shows and nothing is signed; given one with a memo, then P-53's memo caution shows under the Memos row.
- Given the Offline Wallet on the Sign screen, then no ledger client is requested.

## Implementation Notes

- Commits: `ddd932b` (core), the screens commit, `91f9e7b` (screen tests), then this record with the 320/200% Asset fix.
- **Codec.** `encodeUnsigned` writes `ledger_index` when given. `decodeUnsignedForSigning` takes exactly `{v, network_id, ledger_index, tx}`. `decodeUnsigned` (two-device) is unchanged.
- **Two-device (FR-78, until story 12).** Its code has no `ledger_index`, so the Offline Sign screen refuses it as malformed (P-17). A Transmitter-builds code scanned on two-device's offline side is judged by `reviewUnsigned`, which ignores the extra envelope key. It refuses what two-device does not sign, for example a TrustSet (type) or any non-zero Flags. `prepareUnsigned` and its 75-ledger window are unchanged.
- **Judge (`unsigned-judge.ts`).** Order: P-36 wrong kind → strict envelope (malformed) → Network → pre-set `SigningPubKey`/`TxnSignature`/`Signers` → Account (Signs-for: the view's `address`) → type allow-list (Payment, TrustSet, SetRegularKey, AccountSet) → field allow-list and value forms → `Flags` bits by name per type → `tfPartialPayment` (Payment only: the same bit is `tfSetNoRipple` and `tfOptionalDestTag`) → Fee (malformed / over cap) → Sequence (0 only with `TicketSequence`) → LastLedgerSequence above the envelope index and inside UInt32 → `decode(encode(tx))`, which must read back as the same object (case aside). The rows and the object signed are that reading. MPT amounts, non-text memos, unnamed flags, `NetworkID`, `Domain` and any other field are "The app cannot show {name} in words." An issued value the codec rewrites ("100.00" → "100") is refused as malformed. This is conservative: the Transmitter always sends canonical limits and values.
- **Risky rows (P-53).** SendMax, Paths, DeliverMin, Memos (one caution per memo, text from MemoData, else MemoType, else MemoFormat), Delegate (`{address}` = the Account), TicketSequence, `SetFlag` asfNoFreeze / asfAllowTrustLineClawback, TrustSet `tfSetfAuth`.
- **Build hash across routes.** If the transaction has exactly an Offline-builds shape (XRP Payment with no flags, TrustSet with `tfSetNoRipple`, SetRegularKey, master key flag, no Ticket), the hash is `buildHashOf` of that Build. Otherwise it is SHA-256 of `['Unsigned', canonical tx less Account/Fee/Sequence/LLS/TicketSequence]`. Payment's literal is unchanged. P-19 shows on this route's review as information; the retry table is not applied (the Transmitter chose the Sequence).
- **Signing order.** Sign, then check the lock is still open, write the record (on failure, P-16 and no QR), check again, show the signed QR, and only then `noteLedgerSeen` with the envelope index. A lock resets the screen during render and bumps a generation, so a late signing shows nothing.
- **Transmitter.** `answer-request.ts` exposes `preflight(wallet, account, tx)`. The answer and `makeUnsigned` share it, so both refuse the same things in the same words. Payment is unchanged byte for byte. A token Payment is new: self-send, account read, fresh lines, destination check (a required tag refuses; not activated and no trust line warn, as online), fee cap, then `checkFunds` on the held line (frozen or over balance refuse in online Send's words). `makeUnsigned` = built tx + Sequence + Fee + LLS (validated + 150), only for the Synced address. The form shows live reads through the hooks (key factory): Network fee, Spendable, the asset list, the destination check, trust lines, Owner reserve and key state (P-29 on a failed read). W5 and W4/P-50 show on the Build and again on the Unsigned plate. After Send, "Change the transaction" (P-10's key) goes back to the form. Past the window, P-38 makes it again with new values.
- **State.** Both screens keep their round in component state. A tab switch, a lock or a Sync change drops it (Radix unmounts inactive tabs). EXPERIENCE allows this ("Nothing is kept", "The Unsigned Transaction is dropped"). Re-signing the same Unsigned code gives the same blob (deterministic signatures).

## Spec Change Log

## Review Triage Log

## Design Notes

**OS-SM-2: every online write and its route.** The online app builds exactly these writes (grep of `TransactionType:` literals and `autofill(` callers, 2026-11-14: `SendTab` via `submitXrpPayment` / `submitIssuedPayment`, `TrustLinesTab` via `submitTrustSet`, `control.ts` via `submitSetRegularKey`, `master-key.ts` via `submitMasterKeyFlag`; two-device builds a subset):

| Online write | Offline-builds (stories 6, 8) | Transmitter-builds (this story) |
|---|---|---|
| Payment, XRP | yes | yes |
| Payment, token | no (the asset list is a read) | yes |
| TrustSet add / edit limit / close | yes | yes |
| SetRegularKey set | yes | yes |
| SetRegularKey remove (not online; story 8 adds it) | yes | yes |
| AccountSet `asfDisableMaster` off / on | yes | yes |

There is no other write, so P-62's "Other transactions" would open nothing: it is not shown. The brief's browser criterion "one Other transactions type" is therefore not applicable; the TrustSet stands in as the non-Payment type built on the Transmitter.

**W1 and P-30 are built here** (route-checks Transmitter-builds row "New Regular Key is a Wallet on this device, or not"), under the RegularKey row, with W3 directly above it. The check reads local Wallets only (`keyAddress`).

**Shipped words reused** (each tested against its source): online Send's "Asset", "XRP", "(balance …)", "Destination tag (optional)", "Checking destination…" and its two warnings with their lines; TrustLinesTab's list title and the Account screen's "Token balances unavailable"; P-10's key "Change the transaction" without its line (the line speaks of a request); story 2's "The app cannot read the ledger." with P-28's "Read again" for a failed read while making. P-36 composes "needs a unsigned transaction" (approved template with the glossary noun).

**Words not approved (left out):** a title for the Unsigned plate (P-33 heads it, as story 6 headed its plates with their lines before titles were approved); "Scan 1 of 2" / "Scan 2 of 2"; a word for an empty "Other transactions". `{duration}` in P-12 on this route is the window in minutes ("N minutes", ~4 s a ledger, the ratio of story 6's "10 minutes" for 150 ledgers); `{flag in words}` in P-53 is the ledger's flag name (P-52 keeps ledger names).

## Verification

**Gates (2026-11-14, tree of `91f9e7b` plus the Asset fix):** `bun run lint` · `bun run build` · `bun run test` (174 files, 2744 tests; baseline 169 / 2631) · `bun run check:contrast`. All green. After the Asset fix: lint, `tsc -b` and `src/pages/kind` tests green.

**Browser pass (2026-11-14, code at `91f9e7b`; the Asset fix re-measured on the same server).** `bun run dev -- --port 5229 --strictPort`; `.playwright-mcp/s9-run1.js` then `s9-run2.js` (git-ignored) through the Playwright MCP: headless Chromium, two fresh contexts per run, O (offline device) and T (online device), CDP virtual authenticators. Throwaway Testnet accounts funded by the faucet from a Node script: A `rJeGdeSB4PEwS8LQV4nc1L3wnJKMjin6df` (imported in O as Offline "Savings"; T is a Transmitter Synced to A), and B `rMfTYEtBZaedwVKfJtL741KrofrzwPTn9V` (issuer). Every payload was moved by decoding the plate's QR pixels with jsQR and pasting the text. Harness only: visibility pinned to visible. Between runs, B issued 100 USD to A from a Node script (`3021C0B5…773619`, tesSUCCESS). That is setup, not a step under test.

**Forced states (named):** run 2 rebuilt the real Unsigned code in T's page with the app's own codec (`import('/src/lib/qr-codec.ts')`). Once it was re-encoded with `network: 'mainnet'`. Once Memos were added (MemoData "RENT FOR MAY").

| Criterion | Result |
|---|---|
| Type list | Met: Payment, Trust line, Regular Key, Master key; no "Other transactions" (OS-SM-2 table). |
| TrustSet built on T, signed offline, transmitted (the non-Payment type) | Met: `3F055AEA63903825C72719C39441775233A8BC56894EABDDF1793E64EA80C376`, validated in ledger 22329682. T form read Owner reserve 0.2 XRP and Network fee live. The plate showed the fields, Flags tfSetNoRipple, LLS = index + 150 and "Checked on Testnet". O review: "You are signing for Testnet", "Time limit: 150 ledgers", every field. Signed list: one record. |
| Token Payment built on T, signed offline, transmitted | Met: 5 USD A → B, `C7FA1E512352771CF9ABAE3DC47E6252486C2A5E10A491C8A7CACCE39501BE3F`, validated in ledger 22329714. The asset list showed "USD (balance 100)". T check: Account rJeG…, correct. Node read: A's USD line balance 95; decoded tx without NetworkID, Fee 12, LLS 22329860. |
| Refusal: foreign Network (forced) | Met: "The app did not sign the transaction." / "This transaction is for Mainnet. This wallet is for Testnet." under the scanner; no review. |
| Risky field: Memos (forced) | Met: Memos row "RENT FOR MAY" with P-53's caution under it; "Do not sign" → P-34's result, scanner ready. |
| Offline makes no ledger connection | Met: 0 non-local WebSockets on O in both runs. |
| 320 dark / 390 light (run 2) / 1280 light and dark; 320 at 200% text | Met for the T trust form, T token form, Unsigned plate, O reviews (trust, memo, token), O refusal, O signed plate, T outcome: no side scroll, nothing past the viewport. Exception, now fixed: at 320 with 200% text the Asset row sat 2 px past the edge (its non-wrapping trigger widened the column). `min-w-0` was added and the probe re-measured 0 elements. Run 1's shots are 320/1280 only (script slip); run 2 covers 390. |

Screenshots in the session scratchpad `s9/`; opened: `run2-O-review-memo-320-dark`, `run2-O-refusal-network-390-light`, `run1-T-unsigned-trust-1280-dark`, `run2-T-token-form-320-zoom200` (a full-page capture shows the top only: fixed shell, as in stories 7 and 8). Not driven in the browser (unit-tested): P-15, P-14, W1/W3/P-30, the Mainnet typed phrase, the token pre-flight refusals, failed reads, the lock mid-round, a Regular Key or Master key built on T. The dev server was stopped.
