---
title: 'Animated QR with fountain codes for every payload'
type: 'feature'
created: '2026-11-09'
status: 'done'
baseline_commit: '874dca9'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/specs/spec-offline-signing/SPEC.md'
  - '{project-root}/_bmad-output/specs/spec-offline-signing/route-checks.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-11-07/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A payload over one QR code's capacity is refused today ("too large for one QR code"), and every larger transaction the offline route will carry (CAP-17, OS-FR-24) has no way across. The codes carry no checksum of their own beyond the QR's.

**Approach:** Every payload is a UR (BCR-2020-005), written in the repo with fountain codes (library decision of 2026-11-08: no new runtime dependency; SHA-256 from `@noble/hashes`, now a direct dependency pinned at the installed 2.4.0). The codec writes one single-part UR per payload. A QR plate draws it as one still code when it fits, else as an animated QR at not more than three frames a second with Pause/Continue, Next frame and the P-64 caption, paused under reduced motion. The scanner collects frames from any start, survives missed ones, shows P-65 progress, and hands up the whole payload once, only when the joined message's CRC-32 matches. Every existing check then runs on the whole payload.

## Boundaries & Constraints

**Always:** Wire-compatible with the Blockchain Commons reference (`bc-ur`): every `test.cpp` vector embedded and passing. The decoder refuses a joined message whose CRC-32 is not the parts' checksum, and refuses parts that disagree (path vs CBOR sequence, `seqLen != ceil(messageLen/fragmentLen)`) or claim more than 256 fragments or 64 KiB before doing any work. P-64 and P-65 come from one strings module tested against EXPERIENCE.md. `decodeSigned`/`decodeUnsigned` only ever see a whole payload. BSD-2-Clause-Patent notice kept (`src/lib/ur/NOTICE.md` and file headers).

**Never:** No new runtime dependency. Do not invent user-facing words (failures reuse the shipped "That code could not be read."). Do not build the Request and Data to Sign kinds (story 6 owns their contents); this story makes the transport kind-agnostic (`PAYLOAD_UR_TYPES`, `isPayloadUrType`) and applies it to today's two kinds, Unsigned and Signed. No wake lock and no "Make the code larger" (neither exists today; the QR plate of story 6 owns them).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Fits | message at most 500 bytes | one still code, upper case (alphanumeric mode), QR version 21 or less | — |
| Does not fit | message over 500 bytes | animated frames of at most 250 bytes, one pinned version (15 or less), seqNum 1, 2, 3, … without looping | — |
| Rate | animation running | a frame changes only after the last one is drawn and 350 ms passed (2.86 a second) | — |
| Keys | Pause / Continue / Next frame | stops, restarts, steps one frame (also while paused, also by keyboard) | — |
| Reduced motion | `prefers-reduced-motion: reduce` | starts paused ("Continue" key), Next frame reaches every frame | — |
| Scan, any start | frames from frame 6, every third missed | completes; payload handed up once, whole | — |
| Progress | each frame | visible line updates each frame; `role=status` only at 0/25/50/75, then "The app read the code." | — |
| Bad checksum | per-frame Bytewords valid, joined message altered | nothing handed up; shipped "That code could not be read." as `role=alert`; session starts over | — |
| Foreign frame | frame of another payload | ignored; after 3 in a row the session restarts on the new payload | — |
| Still code while collecting | single-part payload UR | whole at once; handed up | — |
| Crafted frame | `seqLen` 2^32-1 / path ≠ CBOR / trailing CBOR / not xrplbench | ignored, under 200 ms, nothing allocated | — |
| Paste | one frame, several frames, all at once out of order | joins the session; any other text handed up as today | — |
| Old form | `xrplbench:1:u|s:` text | still read (and judged) as before; never written | story 4's refusal of an envelope without a Network stays |
| Size | 10 KB memo, 5 KB blob | encoded and decoded whole; nothing refused for size | text over 2·65536+256 chars: malformed |

</frozen-after-approval>

## Code Map

- `src/lib/ur/` (new) -- `crc32`, `bytewords` (minimal and word styles), `cbor` (uint, bytes, array; shortest form; refuses indefinite and 8-byte), `xoshiro` (xoshiro256** on BigInt, alias sampler, shuffle, degree), `fountain` (encoder, decoder with limits), `ur` (single part, `UREncoder`, `URDecoder`), `NOTICE.md`.
- `src/lib/qr-codec.ts` -- payloads are single-part URs (`ur:xrplbench-unsigned/…`, `ur:xrplbench-signed/…`; message = CBOR byte string of today's JSON envelope); legacy form still read; `too-large` and `QR_MAX_BYTES` gone; `Encoded` is always `ok`.
- `src/lib/qr-frames.ts` (new) -- `planQr`: still or animated, pinned version, `frameAt(index)`.
- `src/lib/qr-scan-session.ts` (new) -- `ScanSession`, `isPayloadText`, `quarterOf`.
- `src/lib/animated-qr-words.ts` (new) -- P-64, P-65.
- `src/components/wallet/PayloadQr.tsx` (new) -- still via `QrCode`, else the animated plate.
- `src/components/wallet/QrScanner.tsx` -- camera and paste feed one session; progress line, quarter status, checksum alert.
- `src/components/wallet/TwoDeviceSign.tsx`, `src/lib/two-device.ts` -- use `PayloadQr`; the size refusal is gone.
- `package.json`, `bun.lock` -- `@noble/hashes` 2.4.0, exact.
- Tests: `ur-vectors.test.ts` (+ `ur-reference-vectors.ts`), `qr-transport.test.ts`, `animated-qr-words.test.ts`, `payload-qr.test.tsx`, `qr-scanner.test.tsx` (animated block), `qr-codec.test.ts`, `two-device.test.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/ur/*` -- UR, Bytewords, fountain codes -- against every `bc-ur` vector
- [x] `qr-codec.ts` -- UR payloads, legacy read, no size refusal
- [x] `qr-frames.ts`, `PayloadQr.tsx` -- still or animated, keys, caption, reduced motion
- [x] `qr-scan-session.ts`, `QrScanner.tsx` -- frames, progress, checksum, paste
- [x] tests for every matrix row; largest transactions signed by the SDK and decoded back

**Acceptance Criteria:**
- Given a Testnet payment built on one device and signed on another, when both hand-offs are animated QR codes and the scanner misses frames, then the online device submits the exact blob the offline device signed and the ledger validates it.
- Given the largest transactions measured below, then each round-trips through frames with every third missed, and the decoded signed blob equals what `Wallet.sign` produced.

## Implementation Notes

- **Library.** Written in the repo, following `bc-ur` (C++) and its published `test/test.cpp` vectors, all 21 cases embedded (crc32, bytewords 1 and 2 with the bad-checksum and too-short throws, rng 1-3, fragment length, sampler, shuffle, partition, degree, fragment choice, xor, encoder parts and CBOR, completeness, decoder at 32767/1000/first part 101, single-part UR, the 20 UR encoder parts, multi-part UR). All passed on the first run. No cross-check against `@qntx/ur` was added (optional; the reference vectors pin the wire).
- **CRC on the joined message.** `FountainDecoder.processSimple` compares the CRC-32 of the joined, trimmed message with the checksum every part named; a mismatch is a `checksum` result, never a message. Tested by altering one fragment while keeping each frame's own Bytewords checksum valid (lib and component).
- **Hardening beyond the reference.** Limits checked before `chooseFragments` (which allocates `seqLen` weights): `seqLen` ≤ 256, `messageLen` ≤ 65536, `seqLen === ceil(messageLen / fragmentLen)`, `seqNum ≥ 1`, path sequence equals the CBOR one, no trailing CBOR, at most 1024 mixed parts held. The reference decoder keeps a stuck state on a part of another message; here the session restarts on the new payload (a plate re-renders for a changed payload; old frames are never wanted).
- **Payload format.** UR type names the kind; message is a CBOR byte string of the same JSON envelope as before, so every field check is unchanged. Choice made over a CBOR map to keep the codec's decoders untouched; a signed blob costs about the same as the old base64 form (hex in JSON, then Bytewords in alphanumeric mode ≈ 22 bits a blob byte, against ≈ 21 before). A CBOR envelope with the blob as bytes would halve frame counts; not done.
- **Thresholds.** Still when the message is at most 500 bytes (version 21 or less, about today's density); else frames of at most 250 bytes (version 15 or less), interval 350 ms. The version is pinned per stream from a worst-case frame (seqNum 2^32-1), so the code never changes size between frames.
- **Measured (real `Wallet.sign`, every field at its widest, Testnet envelope):**

  | Transaction | Unsigned | Signed |
  |---|---|---|
  | Payment, XRP, tag | still v16 | still v19 |
  | Payment, 40-hex token | still v19 | still v21 |
  | TrustSet, 40-hex token | still v17 | still v19 |
  | SetRegularKey | still v15 | still v18 |
  | AccountSet master key off | still v13 | still v17 |
  | AccountSet, every field (Domain 256 B, …) | 4 frames v15 | 5 frames v14 |
  | Payment, 1 KB memo, 6×8 paths, SendMax, InvoiceID | 36 frames v15 | 31 frames v15 |

  Every transaction the app builds today stays one still code. The largest needs 31 frames, about 11 s for one clean pass at 2.86 frames a second.
- **Backward reading.** Today's `xrplbench:1:` form is still read by `decode*` and by the scanner, so a code from a device on an older build is judged as before; it is never written. A device on an older build cannot read a UR (its scanner ignores `ur:` text and its codec says "That is not an XRPL Bench signing code."). Story 4's refusal of a signed code with no Network is unchanged.
- **Words.** P-64 (keys, caption) and P-65 (progress, complete) from `animated-qr-words.ts`, tested against EXPERIENCE.md. The checksum failure reuses the shipped codec sentence "That code could not be read."; the frame image reuses the shipped alt "QR code carrying a signing payload". No new words.
- **Deferred work.** No open `deferred-work.md` entry belongs to this story. The open story 4 entry about scanning a plain address (`QrScanner` hands up only payload codes) is unchanged: the scanner now accepts payload URs and the old form, and still no address.
- **Not built here.** Wake lock during a round and "Make the code larger" (EXPERIENCE "Round timing", "Animated QR"): neither exists today; story 6's QR hand-off plate owns them. The plate's title, Network row and "Scan 1 of 3" caption are story 6's too.

## Review Triage Log

Round one (coordinator review, 2026-11-09). Each fixed with the smallest change; tests run on the edited files only.

| # | Finding | Verdict | Fix |
|---|---|---|---|
| 1 | A paste that completes a payload left the camera on, so it handed the same payload up again | real | `usePasted` ends the scan on any hand-up (frames or plain text): camera off, session reset. The "The app read the code." line stays (P-65 complete), since it is no stale progress. Tests: camera on, paste of a whole code / of all frames, then the same code in front of the camera: one hand-up, camera key back. |
| 2 | `planQr` animated any size; the decoder refuses more than 256 fragments, so a payload over 64,000 bytes animated unreadable | real | One bound: `planQr` reads `DEFAULT_LIMITS` and never animates past `maxMessageLen` or `maxSeqLen`; such a code is drawn still, and `QrCode` says it could not be drawn (shipped words). Test at 64,001 bytes (still) and 64,000 (256 frames). |
| 3 | Every foreign frame reset the session: one stray frame dropped progress; two codes in view never finished | real | `ScanSession` switches only after `SWITCH_AFTER_FOREIGN` (3) foreign frames in a row; a whole still code is read on its own without touching held frames. Tests: two stray frames ignored, third switches; interleaved frames of two codes, the first finishes. |
| 4 | `CborReader` accepted heads longer than needed | real | `readHead` refuses a 1/2/4-byte head whose value fits a shorter one. Test. |
| 5 | The `role=status` element mounted with its first text, so the first announcement was missed | real | The sr-only status element is always mounted, empty without progress. Test. |
| 6 | No cap on pasted frames (1,300 crafted frames block for seconds) | real | A paste of frames over 1,024 tokens or over `MAX_TEXT_LENGTH` is not read; the shipped "That code could not be read." shows. Test at 1,025 frames. |
| 7 | Reduced motion read once | real | `AnimatedQr` listens to the media query's `change` and pauses when it turns on. Test. |

## Design Notes

Camera reads and pastes feed the same `ScanSession`, so a reader without a camera can paste frames one by one (or all at once) and sees the same progress. The visible progress line is `aria-hidden`; a separate `sr-only` `role=status` carries the quarter value, so its text, and so the announcement, changes only at 0, 25, 50, 75 and complete. Percent is recovered fragments over `seqLen` (honest "read"), not the reference's 1.75 estimate, capped at 99 until complete.

## Verification

**Gates (on the working tree committed as this story):** `bun run lint` · `bun run build` · `bun run test` (156 files, 2299 tests) · `bun run check:contrast` — all green.

**Browser pass (2026-11-09, commit `56a738d`; the tree under test was that code plus the temporary switch below, removed before the commit).** `bun run dev -- --port 5213 --strictPort`. Driven by a Playwright script (`.playwright-mcp/s13-full.js`, git-ignored) through the Playwright MCP, in a headless Chromium it launched, two fresh browser contexts A (online device) and B (offline device), each with a CDP virtual authenticator. Both imported one throwaway Testnet seed as an Online Wallet with an App PIN (the headless browser offered no passkey); the account was funded by the in-app faucet in an earlier run. Forced or simulated state, named: (1) a temporary switch in `qr-frames.ts` (localStorage flag, removed before commit) set the still bound to 0 and the fragment to 60 bytes (shipping: 500 and 250), so the small FR-78 payloads animated (5 frames unsigned, 7 signed); every pixel read in the round is at that forced density; (2) B's camera was a canvas `captureStream`, and B's `BarcodeDetector` a stub that runs jsQR 1.4.0 on the video's pixels; A's displayed frame image was painted onto that canvas; (3) `document.visibilityState` pinned to visible in both contexts, a harness-only workaround, not app behaviour: two windows taking turns made each count as backgrounded and auto-lock closed both mid-run. Screenshots in the session scratchpad `s13/`.

| Criterion | Result |
|---|---|
| Animated plate, keys, caption | Met. A shows the code, PAUSE, NEXT FRAME and P-64 (`plate-320-light.png`, `plate-320-dark.png`, `plate-1280-dark.png`). |
| Scan from any frame, missed frames | Met. B started at frame 6, every third frame withheld (6,7,9,10,13,14,16,17,19 shown); 19 jsQR reads; review opened with the right Account, Destination, 2 XRP, LastLedgerSequence. |
| Progress P-65 | Met. B's line "The app read 60 percent of the code." under the camera view (`B-scan-progress-320-dark.png`; captured right after the theme switch, so its buttons are mid-transition). A paste path: 14 → 28 → 42 → 57 → … → "The app read the code." (`A-paste-progress-390-light.png`). |
| Whole payload, checks on it | Met. A, fed B's signed frames by paste (decoded by jsQR from B's frame images, some withheld), verified and submitted: "Validated. The ledger applied this transaction (ledger 22202503)." |
| Rate | Met. Running: frame 16 → 24 in 3 s (2.67 a second). |
| Pause / Continue / Next frame / keyboard | Met. Paused at 15, still 15 after 2 s; Next frame → 16; key reads CONTINUE while paused; Tab to Next frame and Enter → next frame. |
| Reduced motion | Met. `reducedMotion: 'reduce'`: frame 1 after 2.5 s, first key CONTINUE, Next frame ×4 → 2,3,4,5 (`reduced-motion-390-light.png`). |
| Pixels decode at every width (forced 60-byte frames) | Met. jsQR read the rendered element screenshot at 320/390/1280, light and dark (220 px), and at 320 with 200% text (156 px). |
| Pixels at the shipping density | Partly. Off the app: a worst-case frame (250-byte fragment, seqNum 2^32-1, v15) and a still code at the 500-byte bound (v21) drawn at the plate's size, then resampled onto a canvas at 222 and 156 CSS px, DPR 1 and 2, and read by jsQR. The v15 frame read at all four; the v21 still at 222/DPR 1 and 156/DPR 2, not at 156/DPR 1 (about 1.5 px a module) nor at 222/DPR 2. A sweep of 200-480 px showed jsQR failing on scattered sizes for both (v15 read at 30 of 36, v21 at 22 of 36), so it is resampling aliasing in the reader rather than a density limit; still recorded as a risk for a v21 still code on a small plate. Today's single codes are as dense, so this is no regression; thresholds unchanged. No real camera was used. |
| Scan plate progress line, layout | Met. Two pasted frames: line "The app read 28 percent of the code.", status "The app read 25 percent of the code."; 320/390/1280 light and dark and 320 at 200% text with no side scroll and nothing past the viewport (`scan-320-dark.png`, `scan-1280-light.png`, `scan-320-zoom200.png`). |
| 320 / 390 / 1280, light and dark, 200% text | Met. No side scroll, no element past the viewport in the plate; at 200% the keys are 117×64 and 182×64 inside the plate (`plate-320-zoom200.png`). |
