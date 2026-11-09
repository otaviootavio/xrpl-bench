---
title: "Change a Wallet's kind, and the Was-online mark"
type: 'feature'
created: '2026-11-09'
status: 'done'
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
- `src/lib/teardown.ts` -- `forgetLedgerOf` (offline scope). `src/pages/Main.tsx`, `src/pages/kind/KindWallets.tsx` -- land on Local settings after a change.
- Tests: `src/lib/__tests__/kind-change-words.test.ts`, `src/lib/crypto/__tests__/kind-change.test.ts`, `src/__tests__/change-kind.test.tsx`, `src/lib/__tests__/forget-ledger-of.test.ts`, `client.test.ts` (retire), `route.test.ts`, card and groups tests.

## Tasks & Acceptance

**Execution:**
- [x] words module + test
- [x] keystore and db: the two changes, the mark, the refusals
- [x] route, WalletScreens, ChangeKindScreens, result marker, teardown
- [x] Wallet kind plate, result plate, card stamp
- [x] tests for every matrix row; route parse; no ledger socket on the Change to online screen

**Acceptance Criteria:**
- Given an Online Wallet changed to offline, when the change is confirmed, then the ledger socket it used closes and the Offline shell opens on Local settings with P-43.
- Given a marked Wallet changed online and back offline, then "Was online" and P-4 still show on the card and the plate.

## Implementation Notes

- Commits: `3f5dc20` (code and tests), then this story record.
- **Keystore.** `changeToOfflineWallet(walletId)` and `changeToOnlineWallet(walletId, { node? }, ctx)`. Refusals are `KindChangeRefusedError` with a reason (`transmitter`, `not-online`, `not-offline`, `passkey-derived`, `shared-record`); its message is developer text, never shown. Each refusal is checked again inside the record's transaction. Only the one view changes; the test compares the rest of the record before and after.
- **The mark.** `WalletView.wasOnline?: true`, set only by Change to offline and never removed by any writer (rename, Node, setting, Edit checks spread the view; tested for rename and Edit checks). It stays stored while the Wallet is Online and shows only on an Offline one (`toMeta`). Create and import never write it (`import-stored-wallet.test.ts` pins the exact view).
- **Show-before-sending (decided here).** Change to offline strips the stored flag. Change to online does not bring it back: it reads off, as for every new Wallet (OS-FR-10 "off by default"). The user turns it on again if wanted.
- **Signing Check.** Change to online opens a one-use Signer and disposes it, as master key off does: a Standard Signing Check uses the session's Open Key (no prompt), a PIN or passkey one prompts. Not the reveal rule (no Open Check re-pass).
- **Duplicate (P-35).** FR-93's `hasView` rule, the Wallet itself left out: another view with the same Network, Account and key. Run before the Signing Check (no prompt for a refused change) and again after it. Transmitters are not counted (FR-93 never counted them; OS-FR-3 warns only). Today FR-93 refuses that state at create and import, so the refusal is reachable only from an older or edited record (tested with a forced record). Story 10 changes FR-93's comparison to the Signs-for Account.
- **Multi-view record (deferred entry settled).** A Seed record with a second view (a controlled view from "Let another wallet sign") is refused by the keystore: the same key would stay on an Online Wallet on this device. The UI shows the key working, and the refusal shows the shipped "Nothing was changed." No approved reason words exist (see Design Notes). Records with a second view are only made by FR-75, which story 12 retires.
- **Shell swap.** `Main` picks the shell by kind, so the write swaps the tree under the screen. `kind-change-result.ts` is a one-shot module marker (like `configure-launch`): the screen sets it, leaves, then puts the new meta in the store with `flushSync`. `WalletScreens` renders nothing (and does not reset) for a change route while the marker names that Wallet; both shells open on Local settings while it is set; Local settings shows the result plate (Change to offline) or focuses the change key (Change to online), then clears it.
- **Stopping the ledger.** After Change to offline, `forgetLedgerOf` removes the Wallet's account-scoped cache unless another open Wallet holds the address, and retires the socket it read through (`retireNetworkClient`: the custom Node, or the built-in slot) unless another open Online Wallet or Synced Transmitter reads through the same one. The live hooks unmount with the Online shell.
- **Plate order.** Wallet kind plate right after This wallet for every kind, per the spine's table. Four existing plate-order assertions gained that entry; nothing else changed in them.
- **Card.** `LockedCard` and `OpenCard` gain `wasOnline` (true only for a marked Offline Wallet); the stamp follows the kind stamp and P-4 sits under the row, locked or open. Decision: a record field like the kind, not an Account read, so AD-26 holds; the comment on `LockedCard` says so.
- **Words used.** Texts C and D, "Change to an offline wallet" / "Change to an online wallet" (plate key, screen title, confirm key), "Was online", P-4, P-8 second form, P-35, P-39, P-43, P-63. Shipped words reused: "Cancel", "Back to Wallet", "Node" and the Node question, "Test the custom Node first, or use the built-in Nodes.", "This Node could not be checked.", "Nothing was changed.", the Signing Check failure words (`describeCheckFailure`), the success legend "Confirmed".
- **Not handled.** A change pressed while a write is in flight on the same Wallet is not refused (no screen can be on Send and Local settings at once). A marker left by a lock between the write and the landing is cleared at the next Local settings mount of that Wallet, which would show the result once more.

## Spec Change Log

## Review Triage Log

## Design Notes

**Not shown, words missing (needs owner approval):**
- The plate title "Wallet kind". It is the spine's plate name, in neither approved list (story 2 needed an approval for "Before sending"). The plate's heading is its stamps ("Online", or "Offline" + "Was online"), which are approved. One line in `KindPlate` when approved.
- A reason for refusing Change to offline on a Seed record with a second view (keystore `shared-record`). The key is not disabled ahead of time, because a disabled key must show its reason; the refusal says only "Nothing was changed."
- A success sentence after Change to an online wallet. Focus lands on the change key of the Online Local settings; the `[Online]` stamp is the only sign.
- The mockup's "Type the words above. Then the Signing Check follows." and its "Caution" legend: not used.

**Result plate.** The mockup puts the result on Local settings above the plates, with a "Confirmed" legend; the build does the same with the shipped success legend, P-43 and Text C's steps, and focuses the plate.

## Verification

**Gates (2026-11-09, on `3f5dc20` plus this record):** `bun run lint` · `bun run build` · `bun run test` (151 files, 2228 tests; baseline 146 / 2165) · `bun run check:contrast` — all green.

**Browser pass (2026-11-09, commit `3f5dc20`).** `bun run dev -- --port 5197 --strictPort`, Playwright Chromium, fresh browser contexts (`browser.newContext()`) with a CDP virtual authenticator (ctap2, internal, UV, PRF). Throwaway Testnet wallets made in the UI, not funded (no screen here needs a balance). No forced state. Ledger WebSockets counted with `page.on('websocket')` and their `close` events. Screenshots in the session scratchpad `s5/`.

| Criterion | Result |
|---|---|
| Online plate and key | Met. After This wallet; heading `ONLINE`; key "Change to an offline wallet". |
| Text C screen | Met. Five lines, both warnings, the lead line and three numbered steps, P-8 second form (a Transmitter "Carrier" was synced to Daily's address), Cancel and the confirm key (`text-c-390-light`). |
| Change to offline | Met. Lands on the Offline shell's Local settings (five tabs), focus on the result plate: "Confirmed", P-43 with Testnet, the three steps (`result-offline-320-dark`). Stored view `{ kind: 'offline', wasOnline: true }`, no Node. |
| The ledger socket closes | Met in a run with Daily alone: the one `wss://s.altnet.rippletest.net` socket was open before and closed after. With the Synced Transmitter open on the same Network it stayed open, as designed (shared). |
| Card | Met. `[OFFLINE] [WAS ONLINE] TESTNET`, P-4 under the row (`chooser-390-light`). |
| Text D screen | Met. Five lines, two warnings, Node with Built-in Nodes, no typed phrase on Testnet; 0 new ledger sockets while on it (`text-d-1280-dark`). |
| Change to online | Met. Signing Check passed (virtual authenticator); lands on Online Local settings, focus on "Change to an offline wallet"; stored view `{ wasOnline: true }`, no kind. |
| Mark survives | Met. Changed offline again: plate heading `OFFLINE WAS ONLINE`, result shown again (`offline-again-390-light`). |
| 320 / 390 / 1280, light and dark | Met for the Online plate, Text C, the result, the chooser and Text D: no page side scroll and no element past the viewport (measured each). |
| 320 at 200% text | Met for overflow on Text C, the result and Text D. At 320x568 the sticky footer covers most of the screen (`text-c-320-zoom200`): the known frame issue already in deferred-work, not new. |

Not driven in the browser: Mainnet (the typed P-39 confirm), a Passkey-Derived Seed (P-63), P-35, an untested custom Node and a failed Signing Check. Each is pinned in `change-kind.test.tsx` and `kind-change.test.ts`. Screenshots opened: `text-c-390-light`, `result-offline-320-dark`, `chooser-390-light`, `text-d-1280-dark`, `text-c-320-zoom200`, `offline-again-390-light`. The dev server was stopped after the pass.
