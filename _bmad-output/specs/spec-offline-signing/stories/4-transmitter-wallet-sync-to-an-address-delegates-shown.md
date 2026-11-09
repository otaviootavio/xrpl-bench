---
title: 'Transmitter Wallet, Sync to an address, delegates shown'
type: 'feature'
created: '2026-11-09'
status: 'done'
baseline_commit: 'b564a417e861e4c276651aee4de243eff36044da'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/specs/spec-offline-signing/SPEC.md'
  - '{project-root}/_bmad-output/specs/spec-offline-signing/route-checks.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-11-07/EXPERIENCE.md'
  - '{project-root}/docs/agents/keys-and-secrets.md'
  - '{project-root}/docs/agents/ledger-io.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A Transmitter Wallet cannot be made: story 1 only put a kind on Seed-record views, so there is no keyless record, no Sync, no read-only Account and no screen that sends a scanned Signed Transaction (CAP-3, CAP-15, OS-FR-3, OS-FR-4, OS-FR-9, OS-FR-10, OS-FR-22).

**Approach:** A new keyless record in the `wallets` store on a lock of its own, with known ciphertext under that lock's Open Key that the unlock decrypts. A chooser key (P-2) opens an Add Transmitter quiz (Label + Network, Node, Open Check + auto-lock, optional Sync, Review). Sync shows Account (balance, trust lines, key state, delegates) and History, read-only, through the query-key factory. Transmit scans a signed code and sends it through `transmitSignedTransaction` with the P-25 checks.

## Boundaries & Constraints

**Always:** P-n strings from one module, tested against EXPERIENCE.md. The policy is `checkLockRequest` (FR-65 only: no written-Seed, no passkey-origin rule). Every keystore path that decides "is anything stored", "is this lock used", "which names exist" sees Transmitter records. A failed read is P-29 or the existing "unavailable" words, never empty or zero; `isError` wins over retained data. The Network passed to the Transmit step is the one the signed envelope names. P-8 warns, never refuses.

**Never:** Nothing in a Transmitter signs or offers to. No unapproved words. No Data-to-Sign answer (story 6), no Unsigned Transaction build (story 9): New transaction shows its title only. No Signs-for, no kind change. No refusal of a Transmitter for an address another Wallet has.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Add, no address | quiz, Skip this step (P-41) | record `{recordKind:'transmitter'}`, own lock, card `[Transmitter] TESTNET` + P-5; Transmit · Local settings | policy refusal writes nothing |
| Add, address | quiz with a valid address | Synced from the start: card shows the address; Transmit · Account · History · New transaction · Local settings | invalid address: existing "That doesn't look like a valid XRPL address.", Next blocked |
| Mainnet add | Open Check none / auto-lock 30 s | not offered (FR-65) | refused by `checkLockRequest` |
| Unlock | correct / wrong check | Open Key unwrapped, then the record's verifier decrypts | verifier fails: lock not opened, "Unlock failed." |
| Same address as Offline | Sync or Add with an Offline Wallet's address | P-8 first form, caution; still allowed | — |
| Offline import of a Synced address | import Offline, a Transmitter synced to it | P-8 second form in the existing import warning dialog | Cancel import writes nothing |
| Sync change / remove | Local settings | screens change; old address data removed unless another open Wallet holds it; tab falls back to Transmit | — |
| Account reads | Synced | balance, trust lines, Regular Key, master key, delegates | failed read: unavailable words / P-29; delegates empty "None." |
| Transmit, synced | signed code for the Synced address | P-25 list, fields, Send → outcome as today | wrong Account / Network / signature / partial: P-26, no Send |
| Transmit, unsynced | signed code | P-27 above the fields; Send confirms that Account | — |
| Wrong kind | unsigned code | P-36 Transmit line | — |
| Setting on | Send | show-before-sending screen; decline sends nothing | P-24 caution |
| Same blob again | re-scan after a send in this session | nothing sent | P-26 heading |
| Last Seed wallet removed, Transmitter left | remove | Transmitter lock and App PIN kept | — |
| Auto-lock on a Transmitter lock | Mainnet, 30 s | refused (floor), Open Check re-passed first | — |
| Reload | Transmitter meta persisted | kept through hydration | — |

</frozen-after-approval>

## Code Map

- `src/lib/crypto/db.ts` -- `TransmitterRecord`, `isCompleteTransmitterRecord`, `listTransmitterRecords`; `WalletView.kind` narrowed to `'offline'`.
- `src/lib/crypto/keystore.ts` -- `WalletMeta` union; `createTransmitterWallet`, `setTransmitterSync`, `proveTransmitterUnlock`; rename, node, setting, remove, auto-lock, names see Transmitters.
- `src/lib/crypto/transmitter-unlock.ts` -- `proveTransmitterUnlock` (decrypts the verifier). `lock.ts` unchanged: its PIN and lock-record helpers already count a Transmitter's lock.
- `src/lib/wallet-meta.ts` -- `isKeyWallet`; `src/lib/same-address.ts` -- P-8 conditions and the shipped invalid-address words.
- `src/components/wallet/WarningSentence.tsx` -- an approved WARNING as a caution Alert, words unchanged.
- `src/pages/Onboarding.tsx` -- first run offers P-2.
- `src/lib/xrpl/result-codes.ts` -- `UNCONFIRMED_SUBMIT_WORDS` (two-device's shipped sentence, shared).
- `src/lib/teardown.ts` -- `forgetSyncedAddress`.
- `src/store/app-store.ts` -- hydration accepts Transmitter metas.
- `src/lib/qr-codec.ts`, `src/lib/two-device.ts` -- signed envelope names its Network.
- `src/lib/xrpl/writes.ts` -- exported pure `previewSignedTransaction`; session already-sent guard.
- `src/lib/xrpl/reads.ts`, `query-keys.ts`, `src/hooks/useDelegates.ts` -- delegates read, account-scoped.
- `src/lib/transmitter-words.ts` + test -- approved words.
- `src/lib/route.ts`, `src/components/AppShell.tsx`, `src/pages/Chooser.tsx` -- `/wallets/new-transmitter`, P-2 key.
- New `src/components/wallet/AddTransmitterScreen.tsx`, `src/pages/kind/TransmitScreen.tsx`, `TransmitterAccount.tsx`; `KindWallets.tsx`, `WalletTab.tsx`, `WalletCard.tsx`, `remove-copy.ts`, `useSeedImport.tsx`, `Unlock.tsx`.

## Tasks & Acceptance

**Execution:**
- [x] record, keystore, lock, hydration -- keyless Transmitter, no lost lock or PIN
- [x] codec, writes -- envelope Network, preview, guard
- [x] delegates read
- [x] words module
- [x] quiz, chooser, card, shell, Transmit, Account, Local settings, remove, P-8
- [x] tests for every matrix row

**Acceptance Criteria:**
- Given a Transmitter, when it is used, then no screen of it offers to sign, and no Seed sentence shows.
- Given any width 320 to 1280 and either theme, the quiz, Transmit and Account fit without side scroll.

## Implementation Notes

- Commits: `648f056` (record, keystore, codec, writes, UI, tests), then this story record with the Onboarding key.
- **Record.** `TransmitterRecord` (`recordKind: 'transmitter'`) lives in the `wallets` store; `listStoredWallets` still returns Seed records only, so no Seed path can see it. Every "what is stored" question reads both: `removeWallet` (removing the last Seed Wallet keeps a Transmitter's lock and the App PIN: tested), lock-in-use checks, names (`nameForNewWallet`, `renameWallet`), `setLockAutoLock` (a Transmitter lock re-passes its Open Check, then `checkAutoLock` on its Network: a Mainnet one keeps the 1-minute floor), `setWalletNode`, `setShowBeforeSending`. `commitWalletEdit`'s lock release and `discardUnusedAppPin` already counted it (raw `getAll`, lock records).
- **Unlock proof.** The record holds `verifier` = AES-GCM of `xrpl-bench:transmitter:<id>:v1` under its lock's Open Key. `Unlock.tsx` runs `proveTransmitterUnlock` (`lib/crypto/transmitter-unlock.ts`) after the lock opens, on the PIN/passkey path and the `none` auto-open; a key that does not decrypt it leaves the lock closed ("Unlock failed." / "This wallet could not be opened.", shipped words) and ends the session.
- **Meta.** `WalletMeta = KeyWalletMeta | TransmitterMeta`; a Transmitter's `address` is its Synced address or `null`. Key-only modules (control, master key, two-device, Edit checks, reveal) take `KeyWalletMeta` and filter `kind !== 'transmitter'` at entry, so a Transmitter is never a signing target. A Seed view that says `kind: 'transmitter'` is now not listed (fail closed); story 1's fixtures that forced that were changed to Transmitter records, assertions kept. Hydration (`isCompleteSavedWallet`) accepts a Transmitter meta.
- **Policy.** The quiz renders `describeOptions` for the Open Check and auto-lock rows only and judges with `checkLockRequest`; the keystore judges again. No written-Seed or passkey-origin rule.
- **Signed envelope.** `encodeSigned({ network, txBlob })` writes `network_id`; `decodeSigned` refuses a code without a known one (`bad-network`, existing codec words). Two-device's signer writes it. Transmit passes the envelope's Network, never its own.
- **Transmit.** `previewSignedTransaction` (writes.ts, no ledger read) is the P-25 list's source: the same checks and words as `transmit`, minus the window read; Send re-runs everything. Expected Account: `expectedAccountFor({ syncedAddress })`; unsynced, P-27 shows and Send passes `confirmedAccount` = the blob's Account. Setting on: the provider's reviewer; declined is a caution status (P-24 + decline line). Outcomes use today's words (`TxStatusBadge`, `describeResultCode`, `UNKNOWN_OUTCOME_WORDS`); expiry is the fixed string; a thrown submit is two-device's shipped "may have been sent" sentence (moved to `result-codes.ts`, `UNCONFIRMED_SUBMIT_WORDS`).
- **Already sent (story 2 deferred, settled).** `transmitSignedTransaction` keeps an in-memory set of hashes, added the moment a submission is attempted (never on a refusal or a decline). The same blob again is refused with the P-26 heading alone, `reason: 'already-sent'`.
- **Remove words (story 1 deferred, settled).** `removeBodyFor` returns `transmitter` (no sentence: the title and the plate's own line) or `transmitter-last` (`REMOVE_LAST` only). No Seed or backup sentence.
- **P-8.** Compared on the address alone, any Network (the PRD does not name a Network; a Transmitter makes the device online whatever Network): first form on the quiz Sync step, its Review and the Sync plate; second form on an Offline import, in the existing import warning dialog ("Heads up", "Cancel import" / "Import anyway"). An Offline create makes a fresh random key, so no Transmitter can be synced to it: no check there. "Change to an offline wallet" is story 5's.
- **Account.** `delegates` joined the `accountScoped` table (removal and invalidation pick it up). `fetchAccountDelegates` follows `marker`; `actNotFound` is none, any other error is thrown (P-29). Testnet answered the `delegate` type in the browser ("None."). `isError` is tested before `data` everywhere.
- **Sync change.** `forgetSyncedAddress` (teardown) removes the old address's account-scoped data unless another open Wallet holds it; `KindShell` falls back to Transmit when the selected screen goes away. Live account updates mount only when Synced.
- **Scanner words.** `QrScanner`'s `{payload}` slot is filled with "a code", which composes "Scan a code with the camera" and "Or paste the text of a code" from today's scanner template (P-57 "Scan {payload} with the camera"). The slot's filling is mine; a different noun needs only the label prop.
- **Two-device behaviour change.** Because a signed envelope must now name its Network, two-device signing (FR-78, retired in story 12) refuses a signed code made by a build before this one (no `network_id`), with the codec's "That code names a network this wallet does not know." Both devices on this build work as before.
- **Sync step key.** "Skip this step" (P-41) sits under its line in the step body, not in the footer: three stacked footer keys left no room at 320x568 with 200% text. Re-measured: the Address field and Next are reachable by scrolling; the footer still covers part of the step, the known frame issue.
- **Onboarding.** A fresh daily phone has no chooser, so first-run Onboarding also offers P-2 (the chooser key's words, reused for the first-run chooser); the new Transmitter becomes the active Wallet. Found in the browser pass.

## Design Notes

**Words used:** P-2 (chooser key, screen title, final key), P-5, P-8 both forms, P-25, P-27, P-29, P-32, P-36 (Transmit line), P-41, P-42, P-46, P-48 first line, P-62 (Account, History, New transaction; "Regular Key", "Master key" as key-state terms), fixed "Sync to an address" (step title, plate title, plate key), "Expired. Nothing was sent.", P-24, P-26, P-52. Shipped words reused: "Name and network", "Node", the Open Check step, "Review", "Your answers", "Address" (Address Book's term), "That doesn't look like a valid XRPL address.", the Balances readout words ("XRP Balance", "Live", "Spendable", "Reserved", "Balance unavailable", "Reserve unavailable", "Account not activated yet"), "Tokens and trust lines", "Token balances unavailable", "Master key on" / "Master key off", the import warning dialog, "Wallet added.", "Unlock failed.". "None." (P-32) is reused for no Regular Key and no trust lines.

**Not shown, words missing (needs owner approval):**
- The signer list row of the key state (a term and its values).
- A reason line for the already-sent refusal (only the P-26 heading shows).
- A sentence for the Transmitter Remove dialog beyond its title.
- A visible reason for the Sync plate's `aria-disabled` key while the field is empty.
- Scanning an address with the camera on the Sync step (P-57 "Scan an address with the camera" exists, but `QrScanner` accepts only `xrplbench:` codes; left for a later story): the address is typed or pasted.

**Layout.** Transmit: scanner and P-42, then (role=alert) refusals, then the check list, P-27 as a caution, the hash (h2, takes focus), the field list, and the one orange Send. With the setting on, Send opens story 2's show-before-sending screen. Account: address, readout, key-state rows, trust lines, then the Delegates caution and its list.

## Verification

**Gates (2026-11-09, on the final tree):** `bun run lint` · `bun run build` · `bun run test` (146 files, 2165 tests after the review fixes; baseline 138 / 2078) · `bun run check:contrast` — all green.

**Browser pass (2026-11-09, commit `648f056` plus the Onboarding key, hot-reloaded).** `bun run dev -- --port 5194 --strictPort`, Playwright Chromium, a fresh browser context (`browser.newContext()`), no existing wallets. Two throwaway Testnet accounts funded with the Testnet faucet from a Node script; **forced state:** the signed codes were made by that script (xrpl.js autofill + sign, LastLedgerSequence = validated + 75, the new envelope with `network_id: 1`) and pasted into Transmit, because no screen of this build makes a signed code for another device yet (story 6). Submit frames counted on the page's WebSocket. Screenshots in the session scratchpad `s4/`.

| Criterion | Result |
|---|---|
| First run offers P-2; quiz steps, no Seed or Signing Check question | Met. Name and network → Node → Open Check (none, Testnet) → Sync to an address → Review → "Add a Transmitter wallet". |
| Card | Met. `[TRANSMITTER] TESTNET`, the Synced address link, Open; "No authentication…" line as for any `none` lock. |
| Synced screens | Met. Transmit · Account · History · New transaction · Local settings. |
| Account, real reads | Met. 100 XRP, Spendable 99, Reserved 1, Regular Key "None.", "Master key on", trust lines "None.", Delegates warning then "None." (Testnet answered `account_objects` type `delegate`). |
| Transmit, synced | Met. P-25 four lines, hash, fields; focus on "Transaction hash"; 0 submit frames before Send; Send → VALIDATED, 1 submit frame. |
| Same code again | Met. Refused "The app did not send the transaction.", still 1 submit frame. |
| Remove the address | Met. Two screens again; This wallet shows P-5 and P-48. |
| Unsynced Transmit, P-27 | Met. No "Account: …, correct" line, P-27 with the blob's Account; Send → VALIDATED. |
| Remove dialog | Met. Title and the last-wallet sentence only; no Seed or backup sentence. |
| Sync again from Local settings | Met. Five screens back. |
| 320 / 390 / 1280, light and dark: Account, Transmit (code shown), Local settings | Met. No page side scroll, no element past the viewport (measured each). |
| 320 at 200% text: Account, Transmit, Local settings, quiz step 1, Sync with an invalid address, Review | Met for overflow (none measured). At 320x568 the quiz's sticky footer covers most of the screen: the known frame issue already in deferred-work (spec-no-legacy-lock story 4), not new. |

**Re-check after review (2026-11-09):** the Skip key moved into the Sync step body; at 320x568 with 200% text the Address field and Next are each reachable by scrolling (element at their centre is themselves), no side scroll (`quiz-sync-320x568-zoom200-address`, opened). New tests for the review: `forget-synced-address.test.ts`, the Transmit fallback in `wallet-kind-screens.test.tsx`, a PIN Transmitter's auto-lock re-proof (dismissed changes nothing), the `none` auto-open with a failing proof, and Onboarding's P-2.

Not driven in the browser: P-8 (needs an Offline Wallet and a Transmitter for one address; pinned in `add-transmitter.test.tsx` and `add-wallet-import.test.tsx`), the show-before-sending path on a Transmitter (pinned in `transmit-screen.test.tsx`; the screen itself was verified in story 2), a Mainnet Transmitter, and the delegate list with entries (pinned in `transmitter-account.test.tsx`). Screenshots opened: `account-390-light`, `transmit-ready-390-light`, `account-320-dark`, `settings-1280-dark`, `quiz-sync-invalid-320-zoom200`. The dev server was stopped after the pass.
