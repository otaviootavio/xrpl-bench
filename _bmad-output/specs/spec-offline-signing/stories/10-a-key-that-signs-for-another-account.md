---
title: 'A key that Signs for another Account'
type: 'feature'
created: '2026-11-14'
status: 'in-progress'
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
- [ ] keystore/db -- field, resolver, writers, setter, FR-93 -- every caller coherent.
- [ ] quiz -- step, Review row, probe -- CAP-13 set at create/import.
- [ ] plate, card -- change in settings; card carries it.
- [ ] signed list + post-sign assertion -- no cross-Account Same Build; signing key is this Wallet's.
- [ ] P-54 -- offered after a validated Regular Key change.
- [ ] tests for every matrix row; real signed blobs for the Account/key and Transmit rows.

**Acceptance Criteria:**
- Given a Signs-for Offline Wallet on Testnet whose Account's Regular Key is its key, when a payment is built, answered by a Transmitter, signed and transmitted, then it validates.
- Given the gates, all four are green.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes

**Storage: a new field, not `accountAddress`.** Both mean "the Account this view signs for", and `KeyWalletMeta.address` already resolves to it, so every reader (reads, requests, checks, signing with `masterAddress`) is unchanged. A separate `signsFor` lets story 12 tell today's controlled views (`accountAddress`, a second view on another Wallet's Seed record and lock, made by "Let another wallet sign") from a Signs-for Wallet with a one-line filter. One resolver, `signsFor ?? accountAddress ?? record.address`; `assertOneOwnView` still counts only `accountAddress` views as controlled, so a Signs-for view is the record's own view. **Story 12 removes:** `accountAddress` and the resolver's fallback to it, `addControlledView`, `ControlWalletScreen`, `ControlPlate`, `ControlledNote`, `control.ts`'s flows, the shared-record kind refusal and the read-only Signs for plate on a shared record, and decides whether controlled views stay listed (FR-95: not converted).

**FR-93 reading (owner question).** product-prd-changes says the refusal "compares the Signs-for Account and the Network". Read as the pair, it refuses Flow 7 on one device: Offline X (master) sets Offline K as its Regular Key, and P-54 asks to set K to sign for X, but X already signs for X on that Network. Built as the triple `(Network, Signs for, key)`, today's `hasView` rule with the Account resolved through Signs for, so P-54 works. If the owner means the pair, `hasView` drops the key comparison and P-54's first form must be refused for a key on this device.

**Words reused outside their place (owner to confirm).** The spine's "Signs for r…" card line, the plate's "Signs for" title, "Account" legend and "Change" key are not approved. Used instead: the fixed string as plate title (the spine places it in the plate); P-17's second sentence "This wallet signs for {address}." as the card line and the plate's state line; P-54's "Set it" as the plate's set key; P-46's "Remove the address" as its remove key; P-35 as the Signs-for duplicate refusal. Each is one constant in `signs-for-words.ts`.

## Verification

**Commands:**
- `bun run lint` · `bun run build` · `bun run test` · `bun run check:contrast` -- all green.

**Manual checks:** real-browser pass on Testnet, two contexts (below, filled after the pass).
