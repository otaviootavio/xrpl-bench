---
title: 'A key that Signs for another Account'
type: 'feature'
created: '2026-11-14'
status: 'done'
baseline_commit: '0bd24a3'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/specs/spec-offline-signing/SPEC.md'
  - '{project-root}/_bmad-output/specs/spec-offline-signing/route-checks.md'
  - '{project-root}/_bmad-output/specs/spec-offline-signing/product-prd-changes.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-11-07/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** An Online or Offline Wallet can only sign for its key's own address unless it went through the FR-75 "Operating another account" flow, which story 12 removes; the quiz, settings, card, FR-93 and the signed list know nothing of a Signs-for Account (CAP-13, OS-FR-20).

**Approach:** Record the Signs-for Account on the Wallet's view in a new field `signsFor`, separate from the legacy `accountAddress`, behind one resolver that every caller already reaches through `KeyWalletMeta.address`. Set it by an optional quiz step, change it in a Local settings plate, offer it (P-54) after a validated Regular Key change at the Transmit step, show it on the card, use it in FR-93, and pin the offline checks and the Transmit step with real signed blobs.

## Boundaries & Constraints

**Always:** `KeyWalletMeta.address` = the Signs-for Account (the one ledger identity for reads, requests, checks, signing); `keyAddress` = the Seed's own address (credential check, Signing key row). Nothing stored when Signs for equals the key address. Approved words only (fixed string, P-17, P-35, P-40, P-46, P-54, shipped "Address" and `INVALID_ADDRESS`), each from one module, tested against its source. Today's controlled views keep working until story 12. A Signs-for change never leaves the old Account's reads, kept round or Same Build records looking current for the new one.

**Never:** No ledger check that the key IS the Regular Key (P-40 states it; the ledger refuses). No migration of controlled views. No Online Keys plate (story 11). No P-54 on the legacy "Let another wallet sign" flow (it already adds the view). No signing-key-address comparison at the Transmit step.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Quiz step | Online or Offline, create or import; after Signing Check | title and checkbox: the fixed string; ticked: "Address" field, P-40 under it | invalid address: `INVALID_ADDRESS`, Next `aria-disabled`; ticked and empty: Next `aria-disabled` |
| Review | box ticked with an address | row: fixed string → the address, with Change | unticked: no row |
| Write | create/import/derived with `signsFor` | view `signsFor` set; meta `address` = it, `keyAddress` = the Seed's | equal to key address: stored as absent |
| FR-93 | same `(Network, Signs for, key)` as another key Wallet | refused, P-35 for a Signs-for collision; today's words for a plain duplicate import | Transmitter not counted |
| Settings plate | Online or Offline | title fixed string; P-17's "This wallet signs for {address}." when set; Address + P-40; keys "Set it", "Remove the address" | shared record (legacy controlled): address shown, no keys; duplicate: P-35; write fails: "Nothing was changed." |
| Change side effects | Online / Offline | Online: old Account's cached reads forgotten; Offline: kept round cleared | — |
| Same Build | record signed for another Account | not a Same Build (record carries `account`; absent = key address) | — |
| Card | address ≠ key address | address row = key address; line P-17 sentence with the Signs-for Account; locked card too | — |
| Offline-builds | Signs-for wallet | request `account` = Signs for; Data to Sign Account refusal (P-17); signed blob `Account` = Signs for, `deriveAddress(SigningPubKey)` = key address | mismatch after signing: thrown, no QR |
| Transmitter-builds | Unsigned for Signs-for Account | accepted; other Account refused (P-17) | — |
| Transmit step | blob by Regular Key for X, or master | accepted when X is expected; ledger judges the key | — |
| P-54 | validated SetRegularKey with RegularKey at a Transmit step | key Wallet here, same Network, not already signing for it: "Set the wallet {name} to sign for this account?" Set it / Not now; else the second form | Set it refused: P-35 or "Nothing was changed." |

</frozen-after-approval>

## Code Map

- `src/lib/crypto/db.ts` -- `WalletView.signsFor`, validated in `isCompleteView`.
- `src/lib/crypto/keystore.ts` -- `accountOfView` resolver; `signsFor` on the three writers; `setSignsFor`; FR-93 via the resolver; `SignsForRefusedError`.
- `src/lib/signs-for-words.ts` (new) -- the approved words used, tested against their sources.
- `src/components/wallet/walk-questions.ts`, `WalletQuestions.tsx`, `CreateWalletFlow.tsx`, `useSeedImport.tsx` -- the optional step, Review row, writer input, probe with Signs for.
- `src/pages/tabs/WalletTab.tsx` -- Signs for plate (Online after Seed, Offline after Seed).
- `src/store/wallet-groups.ts`, `WalletCard.tsx` -- `keyAddress`/`signsFor` card fields and line.
- `src/lib/signed-list.ts`, `offline-round.ts`, `unsigned-judge.ts` -- record `account`; Same Build filtered by Account; post-sign key/Account assertion.
- `src/components/wallet/TransmitStep.tsx` + callers -- P-54 offer on a validated SetRegularKey.

## Tasks & Acceptance

**Execution:**
- [x] keystore/db -- field, resolver, writers, setter, FR-93 -- every caller coherent.
- [x] quiz -- step, Review row, probe -- CAP-13 set at create/import.
- [x] plate, card -- change in settings; card carries it.
- [x] signed list + post-sign assertion -- no cross-Account Same Build; signing key is this Wallet's.
- [x] P-54 -- offered after a validated Regular Key change.
- [x] tests for every matrix row; real signed blobs for the Account/key and Transmit rows.

**Acceptance Criteria:**
- Given a Signs-for Offline Wallet on Testnet whose Account's Regular Key is its key, when a payment is built, answered by a Transmitter, signed and transmitted, then it validates.
- Given the gates, all four are green.

## Implementation Notes

- Commit `6faf71f`. Storage: `WalletView.signsFor` (validated as an address in `isCompleteView`: a bad value hides the record, never reads as the key). One resolver `accountOfView` (keystore) feeds `toMeta`, `accountOf`, `hasView`, `hasOtherView`, `addControlledView`'s in-transaction check and `changeToOnlineWallet`; `grep "accountAddress ??"` finds only it.
- Writers: `signsFor` on `createStoredWallet`, `importStoredWallet`, `createDerivedWallet` (the derived writer checks FR-93 only when Signs for is set, so a passkey restore keeps today's behaviour). Equal to the key address is stored as absent; not an address is refused in the shipped `INVALID_ADDRESS`.
- `setSignsFor(walletId, account | null)` with `SignsForRefusedError` (`transmitter`, `shared-record`, `duplicate` = P-35, `invalid`), re-checked inside the transaction.
- Import: the probe gets the Signs-for Account; a Signs-for collision shows on the Review (not beside the Seed); the master-key pre-check of the key's own Account is skipped when the key signs for another Account (that Account's master key says nothing about it); P-8's Transmitter check compares the Signs-for Account.
- Offline signing handle wraps the one-use Signer: after signing, `assertSignedFor` decodes the blob and requires `Account` = Signs for and `deriveAddress(SigningPubKey)` = this Wallet's key; otherwise no blob returns. The Transmit step was confirmed to compare only `tx.Account` with the expected Account (story 2's `checkSignedBlob`), so master or Regular Key signatures pass and the ledger judges the key; pinned with a real blob.
- Signed list: `SignedRecord.account` (absent on old records = the key address); `latestSameBuild(list, hash, { account, keyAddress })` never matches a record for another Account, so a Signs-for change cannot reuse another Account's Sequence.
- A Signs-for change (plate and P-54) runs `teardown.ts` `forgetSignsFor`: an Online Wallet forgets the old Account's cached reads; an Offline Wallet's kept round is erased (`clearRound`), as the frozen matrix row says. (Round one kept the round; review round one corrected it: the frozen row wins.)
- Review round one: `signingHandleFor` and `offlineSigningHandleFor` take the `expectedAccount` the screen built and checked for (SendTab, TrustLinesTab, master-key, control, two-device: the Wallet's address; offline paths: the Build's or the judged transaction's Account) and refuse (`SignsForChangedError`, words P-16 + P-17's Account reason) when the vault's Signs-for Account differs, at the handle and again at `open()` before the Signing Check. P-8's second form shows on the create Review, the plate and the P-54 first form when an Offline Wallet would sign for an Account a Transmitter here is synced to. `signsForTarget` offers only key Wallets on open locks, preferring one that signs for its own address.
- P-54: `sendReady` returns `regularKeySet` for a validated SetRegularKey that sets a key; `ResultView` renders `SignsForOffer` (both Transmit step screens). Target: a key Wallet here with that key on that Network; `'done'` when one already signs for the Account. The Online Keys plate does not exist (story 11; deferred entry).
- Card: the address row is the key address; P-17's sentence with the Signs-for Account when it differs (locked and open: a record field).

## Spec Change Log

## Review Triage Log

Review round one (coordinator, 2026-11-15), each checked at the code.

| # | Finding | Verdict | Fix |
|---|---|---|---|
| 1 | The signing handles read the Account fresh from the vault: after a Signs-for change in another tab, a stale Send/TrustSet screen signs for Y with X's checks | real | `expectedAccount` on both handles, checked at the handle and at `open()`; refused with P-16 + P-17 (`SignsForChangedError`), nothing signed; passed from every caller. Tests in `crypto/__tests__/signs-for.test.ts` |
| 2 | P-8 missing on Offline create with Signs for, the plate, and P-54 | real | second form on the create Review, in the plate under the field, in the P-54 first form; warn, never refuse. Tests (flow, plate, offer) |
| 3 | Frozen row "Offline: kept round cleared" but the round was kept | real | `forgetSignsFor` clears it (plate and P-54); Implementation Notes corrected. Tests |
| 4 | `signsForTarget` took `holders[0]`, and could change a Wallet on a closed lock | real | prefer the holder that signs for its own address; only open locks (closed: second form). Tests |
| 5 | The signed list shows records of an earlier Account without naming it | deferred | no approved words; `deferred-work.md` |
| 6 | Malformed `signsFor` hides the whole record; master key off may rely on an Offline Regular Key holder | recorded | Design Notes |

## Design Notes

**Storage: a new field, not `accountAddress`.** Both mean "the Account this view signs for", and `KeyWalletMeta.address` already resolves to it, so every reader (reads, requests, checks, signing with `masterAddress`) is unchanged. A separate `signsFor` lets story 12 tell today's controlled views (`accountAddress`, a second view on another Wallet's Seed record and lock, made by "Let another wallet sign") from a Signs-for Wallet with a one-line filter. One resolver, `signsFor ?? accountAddress ?? record.address`; `assertOneOwnView` still counts only `accountAddress` views as controlled, so a Signs-for view is the record's own view. **Story 12 removes:** `accountAddress` and the resolver's fallback to it, `addControlledView`, `ControlWalletScreen`, `ControlPlate`, `ControlledNote`, `control.ts`'s flows, the shared-record kind refusal and the read-only Signs for plate on a shared record, and decides whether controlled views stay listed (FR-95: not converted).

**FR-93 reading (owner question).** product-prd-changes says the refusal "compares the Signs-for Account and the Network". Read as the pair, it refuses Flow 7 on one device: Offline X (master) sets Offline K as its Regular Key, and P-54 asks to set K to sign for X, but X already signs for X on that Network. Built as the triple `(Network, Signs for, key)`, today's `hasView` rule with the Account resolved through Signs for, so P-54 works. If the owner means the pair, `hasView` drops the key comparison and P-54's first form must be refused for a key on this device.

**A malformed stored `signsFor` hides the whole Seed record** (FR-95 fail-closed, `isCompleteView`): every view of that record disappears, and FR-93's duplicate checks no longer see it, so the same key could be imported again on that Network. Accepted: only a hand-edited or corrupt record has one, and showing it would risk reading it as the key's own Account.

**Master key off can now rely on an Offline Wallet as the Regular Key holder.** `master-key.ts` refuses unless a Wallet here holds the Regular Key; a Signs-for Offline Wallet now counts as one (it is a key Wallet with that `keyAddress`). The master key can then be turned on again only through the Transmitter-builds or Offline-builds route from that Offline Wallet (an Offline Wallet never sends), never from the Online Keys controls. Story 11 owns the W4 wording for this.

**Words reused outside their place (owner to confirm).** The spine's "Signs for r…" card line, the plate's "Signs for" title, "Account" legend and "Change" key are not approved. Used instead: the fixed string as plate title (the spine places it in the plate); P-17's second sentence "This wallet signs for {address}." as the card line and the plate's state line; P-54's "Set it" as the plate's set key; P-46's "Remove the address" as its remove key; P-35 as the Signs-for duplicate refusal. Each is one constant in `signs-for-words.ts`.

## Verification

**Commands:**
- `bun run lint` · `bun run build` · `bun run test` · `bun run check:contrast` -- all green.

**Gates (2026-11-14, commit `6faf71f`):** lint, build, test (2821 tests), check:contrast: all green.

**Browser pass (2026-11-14, code at `6faf71f`).** `bun run dev -- --port 5310 --strictPort`; `.playwright-mcp/s10-run.js`, `s10-p54.js`, `s10-zoom.js` (git-ignored) through the Playwright MCP: headless Chromium, fresh contexts O (offline device) and T (online device), CDP virtual authenticators; payloads moved by decoding the plate QR pixels (jsQR) and pasting. **Forced state (named):** `.playwright-mcp/s10-fund.mjs` funded throwaway Testnet X `rE25Dpy1AB8gE4oJc6V32AHbHvPxCBtTMT` and destination C `rrnXMe9VkKMrPMhfTasN98AG9jDvx7Lrcw`, generated key K `rhxWLZS1tTiCScabkvgXqdbx2ZqW56H6fU`, and set X's Regular Key to K with X's master key outside the app (`F18090F6…4A3360`, tesSUCCESS).

| Criterion | Result |
|---|---|
| Import K as Offline with "This key signs for another account" = X | Met: step 4 of 5, title and box the fixed string, Address with P-40 under it; "rNOTANADDRESS" shows the shipped words and Next `aria-disabled`; Review row "This key signs for another account · rE25…TMT · Change". |
| Card | Met: `[Offline] TESTNET`, address row K (`rhxWLZ…H6fU`), "This wallet signs for rE25Dpy1AB8gE4oJc6V32AHbHvPxCBtTMT." |
| Signs for plate (Offline) | Met: fixed-string title, P-17 state line, Address, P-40, Set it, Remove the address. |
| Offline-builds payment from X, signed by K, validated | Met: T a Transmitter Synced to X; O review "You are signing for Testnet", Account X, Signing key K; T checks "Account: rE25…, correct"; **VALIDATED `A3C91BFE34310D49DF318B63EA461B0283A77B5173AD1A641D15D88C22EBDCBC`** (1 XRP X → C). |
| P-54 second form | Met: an Offline Regular Key round (X's key set to K again, signed by K) validated `0E62ACC5…42BD5C`; T, with no Wallet for K, shows "In the wallet that has this key, set the key to sign for this account." |
| P-54 first form, Set it | Met (fresh contexts; forced: K also imported on T as Online "Hot key"): round validated `99445F5E…1ACE28`; T shows "Set the wallet Hot key to sign for this account?" Set it · Not now; Set it closes it; T's chooser card for Hot key: row K, "This wallet signs for rE25…TMT." |
| Same Build after a key round | Seen: a third identical SetRegularKey in the first run showed story 7's retry case (a) (P-20), as designed. |
| No ledger connection on O | Met: 0 non-local WebSockets. |
| Widths/themes | 320 dark/light, 1280 dark/light for the quiz step, bad address, Review, card, plate, signing review, T outcomes, P-54 both forms, T chooser: no side scroll, 0 elements past the viewport. 200% text at 320 for the quiz step, card and plate: 0 past the viewport; the plate wraps the address (`z-zoom-plate`). |

Screenshots in the session scratchpad `s10/`; opened: `O-quiz-signs-for-320-dark`, `O-chooser-card-1280-light`, `p54-T-p54-here-320-dark`, `z-zoom-plate`, `z-zoom-thiswallet`. **Pre-existing, not this story:** at 320 with 200% text, the This wallet plate's `AddressDisplay` (unchanged since #29) sets the address one character per line (~2000 px tall plate); recorded in `deferred-work.md`. 390 was not shot this pass (the harness viewport between shots is 390). Not driven in the browser (unit-tested): the Online Signs for plate's cache drop, P-35 refusals, the shared-record read-only plate, create (vs import) with Signs for, the Transmitter-builds route for a Signs-for Wallet. The dev server was stopped.
