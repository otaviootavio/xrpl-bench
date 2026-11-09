---
title: 'Transmitter Wallet, Sync to an address, delegates shown'
type: 'feature'
created: '2026-11-09'
status: 'in-progress'
baseline_commit: 'b564a41'
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
- `src/lib/crypto/lock.ts` -- unused-PIN / discard helpers count Transmitter locks.
- `src/store/app-store.ts` -- hydration accepts Transmitter metas.
- `src/lib/qr-codec.ts`, `src/lib/two-device.ts` -- signed envelope names its Network.
- `src/lib/xrpl/writes.ts` -- exported pure `previewSignedTransaction`; session already-sent guard.
- `src/lib/xrpl/reads.ts`, `query-keys.ts`, `src/hooks/useDelegates.ts` -- delegates read, account-scoped.
- `src/lib/transmitter-words.ts` + test -- approved words.
- `src/lib/route.ts`, `src/components/AppShell.tsx`, `src/pages/Chooser.tsx` -- `/wallets/new-transmitter`, P-2 key.
- New `src/components/wallet/AddTransmitterScreen.tsx`, `src/pages/kind/TransmitScreen.tsx`, `TransmitterAccount.tsx`; `KindWallets.tsx`, `WalletTab.tsx`, `WalletCard.tsx`, `remove-copy.ts`, `useSeedImport.tsx`, `Unlock.tsx`.

## Tasks & Acceptance

**Execution:**
- [ ] record, keystore, lock, hydration -- keyless Transmitter, no lost lock or PIN
- [ ] codec, writes -- envelope Network, preview, guard
- [ ] delegates read
- [ ] words module
- [ ] quiz, chooser, card, shell, Transmit, Account, Local settings, remove, P-8
- [ ] tests for every matrix row

**Acceptance Criteria:**
- Given a Transmitter, when it is used, then no screen of it offers to sign, and no Seed sentence shows.
- Given any width 320 to 1280 and either theme, the quiz, Transmit and Account fit without side scroll.

## Implementation Notes

## Design Notes

## Verification
