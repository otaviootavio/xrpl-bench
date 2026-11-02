---
title: 'The duplicate key is address plus Network'
type: 'feature'
created: '2026-11-02'
status: 'done'
baseline_revision: '4511d46a5c1ac920f17ec2da632348d79acd47f9'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/docs/agents/INDEX.md'
  - '{project-root}/_bmad-output/specs/spec-one-network-per-wallet/SPEC.md'
warnings: []
deferred:
  - summary: >-
      Two imports of the same key on the same Network can race, because the duplicate check and the record write are separate async steps with no lock between them.
    evidence: |-
      duplicateReasonFor reads listStoredWallets, then writeNewStoredWallet runs pinGate, createLock and putStoredWallet. Nothing spans the check and the write. The old address-only check had the same gap, so this story did not introduce it. To settle it, run two imports of one Seed in two tabs and count the records.
    location: >-
      src/lib/crypto/keystore.ts:1032
    severity: low
---

<intent-contract>

## Intent

**Problem:** Import refuses a Seed whenever its address is on the device on any Network, with a reason that points to "Other networks". Under FR-93 a Wallet is one address on one Network, so the same Seed must be allowed on a second Network.

**Approach:** Make the duplicate key `(keyAddress, network)`: pass the Network chosen on quiz step 1 into the one duplicate check, shared by the screen's `acquire` and the keystore writer. Rewrite the reason to name the Network and point nowhere.

## Boundaries & Constraints

**Always:** The check runs when Import wallet is pressed, inside `acquire`, and again in the writer, before any prompt, lock write or ledger read (AD-39, AD-49). The same Seed on another Network is allowed as its own record, ciphertext and lock. A refusal returns to step 1 with the reason beside the Seed field (existing `at: 'seed'`). The reason never contains the Seed. Reason is one sentence under 21 words (ASD-STE100).

**Never:** No early probe on step 1 and no re-run on a Network change. Do not touch `addNetworkView`, "Other networks", `addControlledView`, the chooser, cards or Unlock (stories 22.2 to 22.4). Do not change `checkWalletRequest`, the lock model or the quiz steps. No migration code (AD-48). Do not rename or restructure `hasView`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Same Seed, other Network | Seed on device on Testnet; import it on Mainnet | Allowed: a second record with its own ciphertext and its own lock | No error |
| Same Seed, same Network | Seed on device on Testnet; import it on Testnet | Refused with a reason naming "Testnet"; no prompt, credential, lock write or ledger read; user returns to step 1 | `{ status: 'refused', reason }`, Seed not in reason |
| Generated twin | Generated wallet on Testnet; import its Seed on Testnet | Refused the same way | As above |
| Not a Seed | `importDuplicateReason('not a seed', network)` | `null` (the caller parses first) | No echo of the value |
| Controlled view | Account A is operated by key B's record; import Seed A on the same Network | Not a duplicate: the key is `keyAddress`, as `hasView` already does | No error |

</intent-contract>

## Code Map

- `src/lib/crypto/keystore.ts` -- `hasView(all, network, account, keyAddress)` (line ~106) is the triple check; reuse it with `account = keyAddress`. `IMPORT_DUPLICATE_REASON` (~928) points to "Other networks". `duplicateReasonFor(address)` (~930) and `importDuplicateReason(seed)` (~939) take the address only. `writeNewStoredWallet` calls `duplicateReasonFor(address)` at ~1032 for `origin === 'imported'`, with `input.network` in scope, before `pinGate`, `confirmedAtFor`, `createLock`. `NetworkId` is already imported. `storeWallet` (~246) has its own legacy message; leave it.
- `src/components/wallet/AddWalletScreen.tsx` -- `acquire({ network, node })` (~146) calls `importDuplicateReason(seed)` then `checkBeforeImport(queryClient, network, ...)`. Pass `network` to the first call. A refusal already returns `at: 'seed'`.
- `src/components/wallet/CreateWalletFlow.tsx` -- calls `importSource.acquire({ network, ...nodeChoice })` (~422) then `importStoredWallet`. Read only; no change expected.
- `src/lib/xrpl/networks.ts` -- `NETWORKS[network].label` gives "Mainnet", "Testnet", "Devnet" for the reason text.
- `src/lib/crypto/__tests__/import-stored-wallet.test.ts` -- test "refuses a duplicate address on any network" (~215) asserts the old reason and refusal on all three Networks; "the duplicate probe reads only..." (~233) calls `importDuplicateReason(SEED)`; "a Generated wallet with the same key" (~246). Re-point these.
- `src/components/wallet/__tests__/add-wallet-import.test.tsx` -- `DUPLICATE` constant (line 14) holds the old text; `importDuplicateReason` is mocked (`h`); assertions at ~168 and ~432 use `toHaveBeenCalledWith(SEED)`. Update to `(SEED, 'testnet')` and the new text.
- Read-only evidence: `src/lib/control.ts`, `teardown.ts`, `master-key.ts` match by network plus address, so a second Wallet on another Network does not break them. Nothing else in `src` dedupes by address alone. `groupWalletsBySeed` groups by `seedId`; two records have two `seedId`s, so they show as two groups until story 22.3.

## Tasks & Acceptance

**Execution:**
- `src/lib/crypto/keystore.ts` -- replace `IMPORT_DUPLICATE_REASON` with a function of the Network, for example `This key is already on this device on ${NETWORKS[network].label}.`; change `duplicateReasonFor(address, network)` to `hasView(await listStoredWallets(), network, address, address)`; change `importDuplicateReason(seed, network)`; pass `input.network` at the writer call -- one key for screen and writer so they cannot disagree.
- `src/components/wallet/AddWalletScreen.tsx` -- call `importDuplicateReason(seed, network)` in `acquire` -- AD-49, no earlier probe.
- `src/lib/crypto/__tests__/import-stored-wallet.test.ts` -- replace the "any network" test with: same Network refused (reason names the Network, no "Other networks", no Seed, no confirm, passkey or lock write, one record); other Network allowed with a distinct record id, `lockId` and ciphertext, and two lock records; probe says exactly what the writer says for the same Network and returns `null` for another; a test that fails if the Network is dropped from the key (it must go red if `duplicateReasonFor` ignores `network`).
- `src/components/wallet/__tests__/add-wallet-import.test.tsx` -- new `DUPLICATE` text; assert the probe gets the step-1 Network (add a case that picks Mainnet or Devnet on step 1 and expects it); keep the order, return-to-step-1, no-ledger-read and thrown-probe cases.

**Acceptance Criteria:**
- Given a Seed already on the device on Testnet, when the user presses Import wallet with Testnet chosen on step 1, then the screen returns to step 1 with a reason naming Testnet beside the Seed field, and no Heads up prompt, ledger read, lock write or record write happens.
- Given the same Seed on Testnet, when it is imported with Mainnet chosen, then a second Wallet is stored with its own ciphertext and lock, and the first Wallet is unchanged.
- Given any refusal, when its text is read, then it names the Network, never mentions "Other networks", and never contains the Seed.
- Given the Network is dropped from the key, when the test suite runs, then at least one test fails.

## Design Notes

The reason is built from the Network label, not a fixed string with the label spliced into test data, so the test can assert both the label and the absence of any pointer. After this story the Seed is two Wallets in the app with no way to reach the second one except Import; that is intended (FR-93: no shortcut). Until story 22.3 the chooser still groups by Seed, so two records show as two groups.

## Verification

**Commands:**
- `bun run lint` -- expected: no errors
- `bun run build` -- expected: `tsc -b` and Vite succeed
- `bun run test` -- expected: all green, including the re-pointed duplicate tests
- `bun run check:contrast` -- expected: pass (no visual change)

**Manual checks (if no CLI):**
- On Testnet in a Playwright browser (never Mainnet, no real funds): import a Seed, then import it again on Testnet and confirm step 1 shows the reason beside the field; import it on Devnet and confirm it is added.

## Review Triage Log

### 2026-11-02 — Review pass
- verdicts: 21 findings — high 0, medium 1, low 1, false 19, maybe-false 0
- findings:
  - `[false]` `[reject]` Blind: hasView gets `address` twice, so a signing key could be refused as a duplicate — hasView matches `w.address === keyAddress` and the view's account; passing the key address as both is what the spec's Controlled view row asks for, and a controlled account (different `accountAddress`) is not matched.
  - `[false]` `[reject]` Blind: the Generate path and the reverse direction are not covered — the Generate path does no duplicate check (random keys), and the test "a Generated wallet with the same key" imports its Seed on testnet (refused) and on devnet (allowed).
  - `[false]` `[reject]` Blind: legacy or multi-view records may be refused or double-registered — hasView walks every view of every record, and viewsOf gives a view-less record its one fallback view; nothing is double-registered. The missing test is the gap-layer row below.
  - `[false]` `[reject]` Blind: the importDuplicateReason callers may pass a stale network — the only callers are the screen's acquire (the step-1 Network, locked after step 1) and the writer (input.network); tsc requires the argument.
  - `[false]` `[reject]` Blind: message tests are weak (word cap, label casing) — the 21-word cap is the spec's own rule, and NETWORKS labels are 'Mainnet', 'Testnet', 'Devnet'; if a label changes the test fails loudly, which is correct.
  - `[false]` `[reject]` Blind: the allow test does not check the second record's fields or an unlock — the spec's required checks (distinct id, lockId, ciphertext, first record unchanged, two locks) are all asserted; extra checks are a wish, not a defect.
  - `[false]` `[reject]` Blind: the screen tests do not cover a refusal on one Network not blocking another, or a Back-to-step-1 re-probe — the devnet case is added, and the spec forbids any re-probe on a Network change.
  - `[false]` `[reject]` Blind: pendingSeedRef keeps the Seed after a refusal — the ref is cleared on unmount and in clearSeed, and the Seed already sits in the input field the user returns to; the pattern is unchanged by this diff.
  - `[false]` `[reject]` Blind: docs and AD-39 are not updated — a grep of docs/decisions.md and docs/user-stories finds no "held once" text, and the spec does not call for doc edits.
  - `[false]` `[reject]` Edge: the writer re-check and the probe can race, giving two records — see the deferred item; the old check had the same gap, so it is not caused by this story.
  - `[false]` `[reject]` Edge: a legacy record with no address is missed — `address: string` is a required field of StoredWallet, so no such record is typed or written.
  - `[false]` `[reject]` Edge: NETWORKS[network] throws on an unknown network — `network` is typed NetworkId and comes from the step-1 choice; a throw on an impossible value is loud and correct. The screen's catch also turns it into a refusal.
  - `[false]` `[reject]` Edge: the Other networks pointer is gone while addNetworkView still exists — the spec forbids touching addNetworkView before stories 22.2 to 22.4 (Never list, Design Notes), and hasView already refuses an Import on a Network where that path added a view.
  - `[medium]` `[patch]` Gap: no test seeds a record with an extra view or with no `views` — the code is correct today (hasView checks every view), but nothing would catch a regression that counts only the first view or reads a legacy record on the wrong Network; patch (fixed: two cases added to import-stored-wallet.test.ts — a record with a second view on Devnet is refused on both its Networks by the probe and the writer and allowed on Mainnet, and a view-less legacy record is refused only on Testnet and allowed on Devnet and Mainnet; the file's 28 tests pass).
  - `[false]` `[reject]` Gap other: the old "Before any prompt" comment is still accurate — this states a fact; no bad outcome is described.
  - `[false]` `[reject]` Gap other: the word-count assertion is brittle — the 21-word limit is the spec's rule; same refutation as the Blind row on message tests.
  - `[false]` `[reject]` Intent: the screen-to-step-1 behaviour is tested only with the keystore mocked — the spec's task asks for exactly that screen test, and the real keystore is covered in import-stored-wallet.test.ts; the screen change is one argument.
  - `[false]` `[reject]` Intent: criteria 1 and 2 are tested on an in-memory store, not IndexedDB — that fake is the existing pattern of the whole keystore test file; the duplicate logic does not depend on the store.
  - `[low]` `[reject]` Intent: ledger-read order is shown only by mock call order in the screen test — true, but the keystore has no ledger read and the screen order is asserted; nothing is wrong, and any added assertion would be more than a direct fix.
  - `[false]` `[reject]` Intent: other files still say "Other networks" — those files belong to stories 22.2 to 22.4 (spec Never list); the keystore constant, the only one in this story, is gone.
  - `[false]` `[reject]` Intent: the browser pass and the story file are not in the diff — the manual browser check is a later verification step in the spec, not a code defect.

## Auto Run Result

**Summary:** The duplicate key for Import is now address plus Network. The same Seed can be imported on a second Network as its own record, with its own ciphertext and lock. The same Seed on the same Network is refused with one sentence that names the Network, points nowhere and never contains the Seed. The screen and the keystore writer use the same check, so they cannot disagree.

**Files changed:**
- `src/lib/crypto/keystore.ts` -- the fixed reason became a function of the Network; `duplicateReasonFor` and `importDuplicateReason` take the Network and use `hasView`; the writer passes `input.network`.
- `src/components/wallet/AddWalletScreen.tsx` -- `acquire` passes the step-1 Network to `importDuplicateReason`.
- `src/lib/crypto/__tests__/import-stored-wallet.test.ts` -- same-Network refusal, other-Network allowed, probe equals writer, Network-dropped-from-key test, extra-view and view-less legacy cases.
- `src/components/wallet/__tests__/add-wallet-import.test.tsx` -- new reason text; the probe receives the step-1 Network, including a Devnet case.
- `_bmad-output/specs/spec-one-network-per-wallet/stories/1-the-duplicate-key-is-address-plus-network.md` -- status, triage log and this result.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- story 22.1 done, epic 22 in progress.

**Review findings:** high 0, medium 1 (patched: tests for multi-view and view-less legacy records), low 1 (rejected), false 19, maybe-false 0. Deferred: 1 low (two simultaneous imports of the same key on the same Network can race; the old address-only check had the same gap).

**Verification:** lint, build, test and check:contrast all passed; 1837 tests passed across 126 files (0 failed, 0 skipped). Browser pass: no UI in this story. Audit score: n/a. Non-blocking P2/P3 issues: none.

**Residual risks:** the import race above. Until stories 22.2 to 22.4, the chooser still groups by Seed, so two records of one Seed show as two groups, and the "Other networks" path is untouched.
