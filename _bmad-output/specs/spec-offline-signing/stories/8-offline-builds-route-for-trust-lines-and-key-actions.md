---
title: 'Offline-builds route for trust lines and key actions'
type: 'feature'
created: '2026-11-14'
status: 'done'
baseline_commit: '8da790f'
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

**Problem:** The Offline-builds route builds only an XRP Payment. An Offline Wallet cannot add, change or remove a trust line, set, replace or remove a Regular Key, or turn its master key off or on, and the Transmitter cannot answer a request for any of these (CAP-8, CAP-9; OS-FR-13 to OS-FR-16, OS-FR-21 display).

**Approach:** Three more types in New transaction (P-62): Trust line (the online trust-line fields and the online TrustSet, `tfSetNoRipple`), Regular Key (P-47 set / remove; the address typed or scanned on the offline device) and Master key (P-47 off / on, `asfDisableMaster`). The request carries each type as an exact key set. The Transmitter runs the online refusals that still hold for the type and, for a key change only, adds the Account's key state to the Data to Sign for display. The Offline Wallet shows the key state, W5 and W4 on its signing review, and the typed phrase for master key off on Mainnet. Same Build and the retry table work unchanged, on a Build hash that now covers every type.

## Boundaries & Constraints

**Always:** Only approved P-n, fixed strings, W texts verbatim, the 2026-11-09/10 approvals, or words already shipped on the online screen for the same fact; each in one module tested against its source. The Offline Wallet reads nothing. The signed transaction is the kept Build plus the exact Data to Sign set; `key_state` is display only and changes no field, refusal or retry case. A new Regular Key address comes only from the offline device. The Transmitter never answers from a failed read, uses its own Network, and keeps Payment's answer unchanged. Payment's Build hash is unchanged (story 7's records still match). Guards asserted on the decoded signed blob.

**Never:** No app refusal of a key action beyond what the ledger needs for Data to Sign (SPEC "Trust the user": the online FR-75/FR-77 guards "no Regular Key yet", "already off", "no wallet here holds the Regular Key", "master key turned off" are not copied). No W1, W2 or P-30 (story 11; route-checks' Offline-builds rows do not require them). No signer-list read or row (no approved words, as story 4). No "Key state" heading, no "Review" word invented for these types beyond shipped reuse (Design Notes). No token payment. No `AccountTxnID`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Type list | New transaction | "Type of transaction": Payment, Trust line, Regular Key, Master key (P-62) | — |
| Trust line Build | Add / Edit limit / Close; issuer, currency, limit | "Trust Lines" with P-1 (P-56); Owner reserve and Network fee P-1; TrustSet `LimitAmount{currency (as typed; no 40-hex 00…), issuer, limit (canonical)}`, `Flags: tfSetNoRipple`; Close = limit "0" | shipped address and currency errors; Review held while invalid |
| Regular Key Build | Set (typed or scanned address) / Remove | Regular Key and Master key rows P-1; SetRegularKey with `RegularKey` / without it | shipped invalid-address error; a scan that is not an address leaves the field as it was |
| Master key Build | Turn off / Turn on | rows P-1; off: "Test the Regular Key" → P-50, then W4's sentence; AccountSet `SetFlag` / `ClearFlag` = `asfDisableMaster` | — |
| Request | any new type | request carries the exact tx key set; codec refuses any other key or value as malformed | — |
| Transmitter, trust line add | line not on the ledger, limit > 0 | online add guard order: reserve read, account, fee cap, spendable covers owner reserve + fee; checks "Spendable sufficient", "Fee less than the fee limit" | read fails: P-28; not activated / not enough: TrustLinesTab words |
| Transmitter, trust line change or close | line on the ledger, or limit "0" | fee guard only | lines read fails: P-28 |
| Transmitter, key change | Regular Key or Master key | "Key state": Regular Key (address or "None."), Master key on/off, Signer list ("None.", "{n} signers, quorum {q}", or P-29 when its own read fails); W5 when set and replaced; W4 when turning off; Data to Sign with `key_state` | account read fails: P-28; not on the ledger: online words |
| Key state unknown | a Data to Sign whose `key_state` (or its `signer_list`) is "unknown" | those rows P-29 on the signing review; no W5 when the Regular Key is unknown | — |
| Data to Sign shape | key change without `key_state`, or payment / trust line with one | P-16 + P-17 malformed | — |
| Signing review, key change | Regular Key set to Y, state says X set | rows, W5; blob `RegularKey: Y` whatever X is | — |
| Signing review, master key off | Mainnet / other Network | W4's sentence above the typed confirm; Mainnet: Sign held until "turn off" is typed | — |
| Same Build | same type and content typed again | P-19 and the retry table, as Payment | — |
| Lock mid-round | any type | round erased | — |

</frozen-after-approval>

## Code Map

- `src/lib/qr-codec.ts` -- request tx variants (TrustSet, SetRegularKey, AccountSet), optional Data to Sign `key_state`.
- `src/lib/offline-round.ts` -- Build union, `builtTransaction`, `buildHashOf` per type, `judgeDataToSign` key-state presence rule, generic `assembleTransaction`.
- `src/lib/answer-request.ts` -- dispatch per type; trust-line add/change guard; key-change key state.
- `src/lib/offline-round-words.ts` + test -- P-47, P-50, P-56, P-57 address scan, P-62 types, W4/W5, shipped trust-line and key words.
- `src/components/wallet/SignedTransactionReview.tsx` -- flag names, `fieldValue` shared.
- New `src/components/wallet/AddressScan.tsx` -- camera-only reader of a plain address QR.
- `src/pages/kind/OfflineNewTransaction.tsx` -- type list, three forms, key state on the review, W4/W5, typed phrase.
- `src/pages/kind/TransmitScreen.tsx` -- answer plate: per-type check rows, key state, W4/W5.

## Tasks & Acceptance

**Execution:**
- [x] codec variants + key_state + tests
- [x] offline-round Build union, hash (Payment pinned), judgement, assembly + tests (real-crypto blobs for each type, a Signs-for view signing AccountSet ClearFlag)
- [x] answer-request per type + tests
- [x] words + test; flag names
- [x] screens + tests (no ledger client for every type)
- [x] gates; browser pass with two contexts on Testnet

**Acceptance Criteria:**
- Given a funded throwaway Testnet account held as an Offline Wallet and an unsynced Transmitter in another context, when each round runs by three scans, then a TrustSet, a SetRegularKey to a second address, master key off, master key on (signed by the Regular Key) and the Regular Key's removal each validate.
- Given an Offline Wallet on any new type, then no ledger client is requested.

## Implementation Notes

- Commits: `35a50e5` (code and tests), then this record.
- **Codec.** Request `tx` variants are exact key sets: Payment (unchanged); TrustSet `{TransactionType, Account, LimitAmount{currency,issuer,value}, Flags = tfSetNoRipple}` with currency upper case (3 characters, not XRP, or 40 hex) and the limit canonical (`isCanonicalLimit`: no leading or trailing fractional zero, at most 15 significant digits and 40 characters); SetRegularKey with optional `RegularKey`; AccountSet with exactly one of `SetFlag` / `ClearFlag` = `asfDisableMaster`. Anything else is malformed. Data to Sign takes an optional `key_state`: `{regular_key: address|null, master_key: on|off}` or `"unknown"`, exact shape. The codec accepts it either way; `judgeDataToSign` refuses it as malformed (P-17) when its presence does not match the kept Build (required for a key change, forbidden otherwise). It never reaches `assembleTransaction`.
- **Build hash (why it changed).** Same Build must cover the new types, so each signed field is in the content: `["TrustSet", currency, issuer, limit, 131072]`, `["SetRegularKey", key|null]`, `["AccountSet", "SetFlag"|"ClearFlag", 4]`. A leading type tag keeps types apart. Payment's content is untouched; its hash is pinned as a literal, so story 7's stored records still match. The limit is canonicalised before it enters the Build (`canonicalLimit`, string operations only), so "100" and "100.00" are one Build and the hash equals what is signed. The Account stays out, as for Payment (the list is per Wallet).
- **Transmitter.** Dispatch per type; Payment byte for byte as before. TrustSet: fresh account read (not on the ledger: TrustLinesTab's words), fresh `account_lines` through the key factory (every `marker` page, `fetchAccountLines`); a line not on the ledger with a limit above zero is an add and gets TrustLinesTab's add guard (reserves read, fee cap, `coversOwnerReserveAndFee`); anything else the fee guard only, as the edit and close dialogs. Key changes: fresh account read; not on the ledger refused in `control.ts` / `master-key.ts` words; fee cap; the key state from that same read goes into the Data to Sign. The online FR-75/FR-77 guards are not copied (SPEC "Trust the user"). A failed account read is P-28, not P-29: Sequence and existence come from it, so this Transmitter never sends `unknown`; the offline side still shows P-29 for it (tested).
- **Screens.** Type list (P-62) with four Radio rows. Trust line: "Trust Lines" P-1 (P-56), radios with TrustLinesTab's "Add trust line" / "Edit trust line limit" / "Close trust line" under P-62's "Trust line", the online fields and errors (XRP refused with the shipped currency error), Owner reserve and Network fee P-1, the online add line. Regular Key: Regular Key and Master key rows P-1, P-47 radios, "Regular Key address" with `AddressScan` (P-57; camera only, takes a plain address or `ripple:<address>`, nothing shown where the browser has no `BarcodeDetector`). Master key: rows, P-47 radios; off: "Test the Regular Key" reveals P-50 in a status, then W4's sentence. Review key "Review". Reviewed heading is the type word; `BuiltFields` uses the shared `fieldValue` (no `[object Object]`). Signing review: key-state rows, W5 when a set key is replaced, W4's sentence above the Mainnet typed confirm ("Type “turn off” to confirm", Sign `aria-disabled` until typed). Transmitter answer: per-type check rows; key-state rows, W5, W4 inside the plate after its focused h2.
- **Flags in words.** `tx-fields.ts` names `Flags` bits and AccountSet `SetFlag`/`ClearFlag` by the ledger's own names (`tfSetNoRipple`, `asfDisableMaster`); used on the review, the Kept plate, Transmit and show-before-sending.

## Spec Change Log

- 2026-11-14, review round two (owner approval, relayed by the coordinator): approved exactly — row name "Signer list" with values "None." (P-32's word) or "{n} signers, quorum {q}"; the heading "Key state" over the key state; "Review" as the review key of Trust line, Regular Key and Master key. In `offline-round-words.ts`, pinned as literals. The signer list is now read by the Transmitter (`account_objects` type `signer_list`, fresh, key factory `signerList`) and carried in the Data to Sign's key state (exact set `{regular_key, master_key, signer_list}`; `signer_list` is `null`, `{signers, quorum}` or `"unknown"` for a failed read of it, P-29), and shown under "Key state" on the Transmitter answer, the offline signing review and story 4's Account screen. The I/O rows "Transmitter, key change" and "Key state unknown" now include the signer list; "Trust line Build" keeps the currency as typed and refuses 40-hex codes starting 00.

## Review Triage Log

Round two (coordinator review, 2026-11-14). Smallest change each; only the edited files' tests run.

| # | Finding | Verdict | Fix |
|---|---|---|---|
| 1 | Review rows shortened a 40-hex currency (`XXXX…XXXX`) or showed its decoded name, so two currencies could look alike | real | `tx-fields.ts` shows the code exactly as carried, never shortened or decoded. Tests (unit, screen) |
| 2 | 40-hex codes starting 00 accepted (all-zero = XRP; standard-form USD hex) | real | `isCurrencyCode` (codec) refuses them; the offline form uses the same check (shipped currency error). Tests |
| 3 | Currency forced to upper case; 3-character codes are case-sensitive | real | kept as typed; the codec takes lower case; the Build hash uses the code as typed; the Transmitter matches hex lines by value, 3-character lines exactly. Tests |
| 4 | A Close for a line not on the ledger is answered (fee likely spent, `tecNO_LINE_REDUNDANT`) | deferred | no shipped or approved words for "this line is not on the ledger" (the online screen only closes listed lines); `deferred-work.md` |
| 5 | Notes: a trust line to the own Account not refused (as online); unmapped key refusal codes; "This is a new payment" on non-payments | recorded | Design Notes and `deferred-work.md` |
| 6 | Signer list and "Key state" (owner approval) | built | see Spec Change Log |

## Design Notes

- **Key actions never refused by the app.** The brief asked for the Transmitter's refusals to equal the online screens'. For key actions the online FR-75/FR-77 guards are exactly what OS-FR-21 removes (SPEC Constraints: "the app warns, never refuses"), so only the refusals the Data to Sign itself needs stay. Story 11 will bring the online Keys plate in line.
- **Typed confirm on Mainnet only**, as today's master-key confirm and story 5's P-39. On Testnet and Devnet master key off is W4 plus Sign plus the Signing Check.
- **Shipped words reused**, each tested against its source: TrustLinesTab's labels, actions, errors, add line and refusals; `control.ts` / `master-key.ts` "not on the ledger" words; MasterKeyControl's "Master key on/off" and typed phrase; QrScanner's camera failure; TwoDeviceSign's "Regular Key address"; the quizzes' "Review". The last two need an owner look (deferred-work).
- **Left out:** W1, W2, P-30 (story 11). The signer list and "Key state" heading were built in round two (owner approval 2026-11-14).
- **Signer list unknown, not a refusal.** It is its own read and display only: a failed read is `"unknown"` (P-29) in the key state and the Transmitter still answers. The account read stays P-28 on failure.
- **Not refused, recorded (round two):** a Close for a line not on the ledger (no words); a trust line to the Account's own address (the online screen does not refuse it either; the ledger does); key-action ledger refusals beyond P-31's three codes are story 11's; "This is a new payment" reads oddly for a retried trust line or key change (approved string; wording question for the owner).
- Words used: P-1, P-29, P-47, P-50, P-56, P-57 (address scan, Stop the camera), P-62 types; fixed "Test the Regular Key"; W4's sentence and W5 verbatim; plus story 6/7's.

## Verification

**Gates (2026-11-14, `35a50e5`):** `bun run lint` · `bun run build` · `bun run test` (169 files, 2631 tests; baseline 167 / 2505) · `bun run check:contrast`. All green.

**Browser pass (2026-11-14, code at `35a50e5`).** `bun run dev -- --port 5228 --strictPort`; `.playwright-mcp/s8-full.js` then `s8-part2.js` (git-ignored) through the Playwright MCP: headless Chromium, two fresh contexts O (offline device) and T (online device) per run, CDP virtual authenticators. Throwaway Testnet accounts funded by the faucet from a Node script: A `rfMGWFtFzwwncpefNmwbVxzp4QoU7t9mnY` (imported in O as Offline "Savings"), B `rpiuaBG2dpqBd9CW9tUUgjXjsAMrwjGuyt`. T: unsynced Transmitter. Every payload moved by decoding the plate's QR pixels with jsQR and pasting. Harness only: visibility pinned to visible.

**Forced state (named):** for the turn-on, the second run imported B's Seed in O as Offline "Rkey" and set its stored view's `accountAddress` to A in IndexedDB, the Signs-for state story 10 will record. The card then showed A's address; the wallet signed for A with B's key. The first run's attempt to import B as a second wallet stopped at an App PIN prompt in the harness, so the turn-on and removal ran in a second pair of fresh contexts on the same ledger state.

| Criterion | Result |
|---|---|
| TrustSet validated | Met: issuer B, "usd" typed → USD, "500.00" → 500; `28F55361…512E49` tesSUCCESS ledger 22324709. T checks: Spendable sufficient, Fee (a new line). Review: LimitAmount "500 USD r…", Flags tfSetNoRipple. |
| SetRegularKey to B validated | Met: `172CC206…4FB97D`. T answer and O review: Regular Key "None.", Master key on, no W5. |
| W5 | Met (replacing B with `rPT1Sj…`, then Do not sign): W5 on T's answer plate and on O's review, key state Regular Key = B. |
| Master key off validated | Met: `39288DB6…C7EF90`. O Build: P-1 rows, "Test the Regular Key" → P-50, W4. T answer: key state + W4. O review: SetFlag asfDisableMaster, key state, W4 above Sign (Testnet: no phrase). |
| Master key on, signed by the Regular Key | Met: Rkey (B for A) `DFA819E1…C9F95D`; T key state Master key off; O review Signing key = B, Account = A. |
| Regular Key removed | Met: Rkey `15DFF53E…D054F6` (no RegularKey field). |
| Ledger after | Node read of A: no RegularKey, master key on (Flags 65536, no lsfDisableMaster), USD line to B limit 500 NoRipple. All five `tx` reads validated tesSUCCESS. |
| Offline makes no ledger connection | Met: 0 non-local WebSockets in O in both runs. |
| 320 dark / 390 light / 1280 light; 320 at 200% text | Met for the trust-line form, Regular Key form, master-off form, T answers (W5, W4), O reviews (W5, master off), T outcome: no side scroll, no element past the viewport (measured). Full-page captures show the top of the page only (fixed shell), as in story 7; lower content checked by text and measurement. |

Screenshots in the session scratchpad `s8/`; opened: `O-review-master-off-320-dark`, `O-trust-form-390-light`, `T-answer-w5-320-dark`, `O-master-off-form-320-zoom200`. Not driven in the browser (unit-tested): the Mainnet typed phrase, an unknown key state, the address camera scan (no camera in headless), the trust-line refusals and failed reads. The dev server was stopped.

**Review round two (2026-11-14).** Tests of the edited files: `src/lib/__tests__` and `src/pages/kind` (42 files, 646 tests), `src/lib/xrpl`, `src/hooks`, `src/lib/crypto` (51 files, 907 tests): green; `tsc -b` and `bun run lint` green. Browser: `bun run dev -- --port 5228 --strictPort`, `.playwright-mcp/s8-r2.js`, three fresh contexts. Throwaway Testnet accounts: S `rEvLfSQPRoWe6pXfDy8U6ufroECJ5Ag6HG` with a SignerListSet (2 signers, quorum 2) submitted by a Node script (`9D55C139…C3C16B`, tesSUCCESS), and N `rp6LYAwVw7Zox5S6yx8BaP5xxCbcQmewKW` with none.

| Check | Result |
|---|---|
| Account screen, Synced to S | Met: "Key state" heading; Regular Key None., Master key on, Signer list "2 signers, quorum 2" (`r2-T-account-signers-320-dark`). |
| Account screen, Synced to N | Met: Signer list "None.". |
| Transmitter answer to a Regular Key request from S (Offline import of S) | Met: "Key state" with "2 signers, quorum 2" inside the Data to sign plate (`r2-T-answer-signers-1280-dark`). Not signed. |
| Offline signing review | Met: "Key state", Signer list "2 signers, quorum 2". |
| 40-hex currency on the offline review | Met: LimitAmount "1,000,000,000 0158415500000000C1F76FF6ECB0BAC600000000 rp6L…" in full (`r2-O-hex-review-1280-light`). |
| 320 and 1280, light and dark | Met for all five screens: no side scroll, nothing past the viewport (measured). 0 ledger sockets on the offline context. |

Screenshots opened: `r2-T-account-signers-320-dark`, `r2-O-hex-review-1280-light`, `r2-T-answer-signers-1280-dark`. The dev server was stopped.

