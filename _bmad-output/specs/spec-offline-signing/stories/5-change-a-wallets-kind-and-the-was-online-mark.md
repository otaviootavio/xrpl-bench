---
title: "Change a Wallet's kind, and the Was-online mark"
type: 'feature'
created: '2026-11-09'
status: 'in-progress'
baseline_commit: 'd0cbc35f07d998f10cbb8886f3c4b3809183fa2f'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/specs/spec-offline-signing/SPEC.md'
  - '{project-root}/_bmad-output/specs/spec-offline-signing/consequence-texts.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-11-07/EXPERIENCE.md'
  - '{project-root}/docs/agents/keys-and-secrets.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A Wallet's kind is fixed at creation: an Online Wallet cannot be moved offline and back, and nothing records that an Offline key was once online (CAP-4, OS-FR-5, OS-FR-6, OS-FR-7, OS-UJ-3).

**Approach:** A "Wallet kind" plate in Local settings (kind stamp, Was-online stamp with P-4, change key) opens one of two task screens. "Change to an offline wallet" shows Text C and a plain confirm; the keystore drops the Node and the show-before-sending flag and adds the permanent `wasOnline` mark. "Change to an online wallet" shows Text D, asks for a Node and takes today's master-key confirm (typed P-39 on Mainnet, then the Wallet's Signing Check); the keystore refuses a duplicate (P-35) before the check. The chooser card shows the Was-online stamp and P-4.

## Boundaries & Constraints

**Always:** Every rule is enforced in the keystore, not only the screen: one function per direction, typed errors for a Transmitter, a Passkey-Derived Seed, a wrong source kind and a record with more than one view. A change touches only the one view: the record's ciphertext, lock, checks, address and Network stay. `wasOnline` is never cleared by any writer. Texts C and D, P-4, P-8, P-35, P-39, P-43, P-63, "Was online" and the two change strings come from one strings module tested against the source files. After Change to offline the Wallet holds no ledger hook, its custom Node and an unused pool socket are retired, and its account-scoped cache goes unless another open Wallet holds it. The Change to online screen opens no ledger socket until Test this Node or the commit.

**Never:** No unapproved words: no "Caution" legend, no mockup filler ("Type the words above…"), no success sentence for Change to online. No change key on a Transmitter. No mark on a created or imported Offline Wallet. No Signs-for, no key-action plates (stories 10, 11).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Plate, Online | Stored Seed Online | `[Online]`, key "Change to an offline wallet" | — |
| Plate, Passkey-Derived | Online, Passkey-Derived Seed | key `aria-disabled`, P-63 visible and its description | keystore refuses too |
| Plate, Offline | marked / created / imported | `[Offline]`, "Was online" + P-4 only when marked, key "Change to an online wallet" (danger) | — |
| Plate, Transmitter | any | `[Transmitter]`, no key | keystore refuses |
| To offline | confirm on Text C screen | view `kind:'offline'`, `wasOnline:true`, no `node`, no `showBeforeSending`; result on Local settings: P-43 with the Network, Text C steps again | write fails: nothing changed (shipped words) |
| To offline, Transmitter synced here | same address | P-8 second form on the screen; still allowed | — |
| To offline, multi-view record | own view + controlled view | refused by the keystore | words missing (see Design Notes) |
| To online, Testnet | Node chosen, confirm | Signing Check, then view has no `kind`, `node` if tested, `wasOnline` kept | check fails: shipped check words, nothing written |
| To online, Mainnet | phrase not typed | confirm `aria-disabled`, described by the phrase field | — |
| To online, untested custom Node | custom, not tested | nothing written | shipped "Test the custom Node first, or use the built-in Nodes." |
| To online, duplicate | another view same Network, Account, key | refused before any prompt | P-35 with the Network |
| Back offline | marked view online → offline | mark still there | — |
| Show-before-sending | Online with it on → offline → online | stripped at the change; reads off when Online again | — |
| Edit checks on a marked Offline | checks edited | `wasOnline` kept | — |
| Card | marked Offline, open or locked | `[Offline] [Was online] TESTNET`, P-4 under the row | — |

</frozen-after-approval>

## Code Map

- `src/lib/crypto/db.ts` -- `WalletView.wasOnline?: true`.
- `src/lib/crypto/keystore.ts` -- `KeyWalletMeta.wasOnline`; `changeToOfflineWallet`, `changeToOnlineWallet`, typed errors; duplicate rule excluding the Wallet itself.
- New `src/lib/kind-change-words.ts` + test -- Texts C, D and the P-n.
- `src/lib/xrpl/client.ts` -- `retireNetworkClient(network, node?)` (built-in or custom slot).
- `src/lib/kind-change-result.ts` (new) -- one-shot "just changed" marker across the shell swap.
- `src/lib/route.ts` -- `change-to-offline` / `change-to-online` in-wallet task routes.
- `src/pages/WalletScreens.tsx` -- the two screens per kind; null while a change is leaving.
- New `src/components/wallet/ChangeKindScreens.tsx` -- the two task screens.
- `src/components/wallet/WalletQuestions.tsx` -- `NodeQuestion` takes only the props it reads.
- `src/pages/tabs/WalletTab.tsx` -- Wallet kind plate after This wallet; result plate.
- `src/components/wallet/WalletCard.tsx`, `src/store/wallet-groups.ts`, new `WasOnlineStamp` -- the card.

## Tasks & Acceptance

**Execution:**
- [ ] words module + test
- [ ] keystore and db: the two changes, the mark, the refusals
- [ ] route, WalletScreens, ChangeKindScreens, result marker, teardown
- [ ] Wallet kind plate, result plate, card stamp
- [ ] tests for every matrix row; route parse; no ledger socket on the Change to online screen

**Acceptance Criteria:**
- Given an Online Wallet changed to offline, when the change is confirmed, then the ledger socket it used closes and the Offline shell opens on Local settings with P-43.
- Given a marked Wallet changed online and back offline, then "Was online" and P-4 still show on the card and the plate.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes

## Verification
