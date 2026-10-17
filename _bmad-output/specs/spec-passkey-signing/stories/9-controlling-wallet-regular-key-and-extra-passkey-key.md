---
title: 'Controlling Wallet, Regular Key, and extra passkey key'
type: 'feature'
created: '2026-10-12'
status: 'done'
baseline_revision: 'b2773cf53ca5502464b4a3d8b27ad8cf044d496e'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/docs/agents/keys-and-secrets.md'
  - '{project-root}/docs/agents/ui-and-design-system.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-passkey-signing-2026-10-10/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/specs/spec-passkey-signing/check-rules.md'
warnings: [oversized]
deferred:
  - summary: >-
      The real `submitSetRegularKey` is never run with a handle whose `address` differs from the signer's key.
    evidence: |-
      `writes.test.ts` uses a plain wallet; `control.test.ts` mocks the builder. A test with a controlled handle would settle it.
    location: >-
      src/lib/xrpl/writes.ts submitSetRegularKey
    severity: low
  - summary: >-
      No browser or real-ledger pass: the dialog, Settings entry and a send from a controlled Wallet have only met fakes.
    evidence: |-
      The spec's manual check (Testnet: set a Regular Key, then send from the controlled Wallet) was not done.
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** A Wallet's key can only ever be the master key of its own Account (CAP-11, FR-75, FR-76). There is no way to let a second key, such as a passkey-derived one, operate an Account, and `keyAddress` versus `accountAddress` (AD-18) does not exist in code.

**Approach:** From a Controlling Wallet (an on-device Wallet whose key is the Account's master key), the user picks another on-device Wallet on the same network and sets its key as the Account's single Regular Key through `SetRegularKey`, signed by the Controlling Wallet's Signing Check. Only after a fresh ledger read shows that Regular Key does the target gain a Wallet view that operates the Account and signs with `masterAddress` (AD-18, AD-29). Control state is read from the ledger, never remembered.

## Boundaries & Constraints

**Always:**
- Data (additive, no IndexedDB version bump): `WalletView` gets optional `accountAddress` (absent: the Seed record's own `address`, which stays the key's address and the wrong-credential comparison). `WalletMeta.address` is the view's `accountAddress ?? record.address` and is the ONLY ledger identity every read, query key, send, receive and teardown uses; `WalletMeta` also exposes `keyAddress` (the record's `address`). `app-store` normalisation defaults `keyAddress` to `address`. Creation and view-adding reject a second view with the same `(network, accountAddress, keyAddress)`.
- Signing: `openSigner` and `signingHandleFor` take the view of the requested `walletId`. When its account differs from the key address the Signer is `Wallet.fromSeed(seed, { algorithm, masterAddress })`, passing the stored algorithm; `signingHandleFor(...).address` is the Account. The wrong-credential compares in `walletFromSeed` and `openDerivedSeed` keep using the key address.
- Control state is read, never stored (AD-29): `controlStatus(accountState, keyAddress)` is `controlled` (Regular Key equals the key address), `not-controlled`, or `unknown` (read errored or still loading, or the Account does not exist). The action is offered only on a fresh successful read (`fetchAccountStateOnce`-style, not a stale cache); an errored read blocks it, `aria-disabled` with the reason in words, never rendered as on or off. After a failed or errored read nothing is claimed.
- Flow (one function in `src/lib`, e.g. `setRegularKey(controllerId, targetId, ctx)`; no secret in state): the Controlling Wallet must have key address equal to its Account (holds the master key) and the master key not disabled; the target is another Seed record on the same network with a different key address. Fresh read of the Account. If the existing Regular Key is another address, a confirm names it and says it will stop working; if it already equals the target key, no transaction is sent and the claim step runs. A plain warning is shown first: whoever holds this phone can take over the Account. When the target uses a passkey (Passkey-Derived Seed or passkey Signing Check) the dialog says the passkey becomes an extra key and the master key keeps working. Sign with the Controlling Wallet's Signing Check through `signingHandleFor` and submit `SetRegularKey` (`Account` = the Account, `RegularKey` = the target key address) via `submitAndClassify` (add a thin `submitSetRegularKey` in `src/lib/xrpl/writes.ts`; the choke point is unchanged). Only `validated` continues; `claimed`, `failed`, `expired`, a cancelled or wrong check each report plainly and claim nothing.
- Claim only after validation: re-read the Account with a fresh `fetchAccountState`; add a view to the target's Seed record `{ walletId, network, node (the controller's), accountAddress }` only if the read succeeded and `regularKey` equals the target key address. A failed re-read reports "submitted, could not confirm; check again" and adds no view. A "check again" path runs only the re-read and claim. Invalidate the Account's query data afterwards.
- A Wallet with `accountAddress` differing from its key shows plainly that it operates another Account as a Regular Key, with the live `controlStatus` as text (never colour alone); Settings lists it. Mainnet stays unmistakable. A Wallet's own checks, floors and Seed Method rules are unchanged.
- No Seed, key or typed PIN in state, store, storage or URL; money as strings; every ledger read through the one query-key factory (Account address and network scoped); nothing styles `:focus`, `outline-none` banned; plain words; never say "open source".

**Never:**
- An offline Controlling Wallet or QR signing (story 11). Turning the master key off or on (story 10). Removing or clearing a Regular Key. A local "controlled" or "master key off" flag. Importing a Seed. A second copy of any policy rule in a component. Editing `submitAndClassify`'s behaviour.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Set first Regular Key | Controller open, Account funded, no Regular Key, target on same network | Warning, controller's Signing Check, `SetRegularKey` validated, re-read matches, target gets a view for the Account | No view until the re-read matches |
| Replace a Regular Key | Account has another Regular Key | Confirm names the old key as no longer able to sign, then as above | Cancel at the confirm sends nothing |
| Already the Regular Key | Re-read shows the target key | No transaction; claim runs | n/a |
| Passkey target | Target is Passkey-Derived or passkey-sealed | Dialog states the passkey is an extra key; master key keeps working | n/a |
| Read errored | `account_info` fails or Account unfunded | Action `aria-disabled` with reason; status "unknown" | Nothing signed |
| Master key off | `disableMasterKey` true | Action refused with the reason | Nothing signed |
| Not validated | tec/tef/expired, cancelled or wrong check | Plain outcome, no view added | Wrong PIN counts, cancel does not |
| Re-read fails after validation | Validated, then read errors | "Could not confirm; check again", no view | Check-again retries the read only |
| Controlled Wallet signs | View with `accountAddress` | Signer has `masterAddress`; tx `Account` is the Account, signed by the target key; reads use the Account | Wrong credential still detected by key address |
| Duplicate | Same `(network, accountAddress, keyAddress)` exists | Refused | Nothing written |
| Wrong network or same seed | Target on another network, or same Seed as the controller | Not offered | n/a |

</intent-contract>

## Code Map

- `src/lib/crypto/db.ts` -- `WalletView` (L46), `StoredWallet` (L56), `mutateStoredWallet` (L256): add `accountAddress?` and an additive duplicate-triple rule; use `mutateStoredWallet` like `setWalletNode`.
- `src/lib/crypto/keystore.ts` -- `WalletMeta` (L44), `toMetas` (L73), `findSeedRecord` (L69), `walletFromSeed` (L387, drops `algorithm` when resolved; compares key address at L392), `openDerivedSeed` (L337, compare L356), `openSigner` (L420), `signingHandleFor` (L453), `addNetworkView` and `setWalletNode` (L1045, L1090: patterns). Add the claim function and meta `keyAddress`.
- `src/lib/xrpl/writes.ts` -- `Signer`, `SigningHandle` (L79-94), `submitAndClassify` (L122), `submitTrustSet` (L277: pattern). Add `submitSetRegularKey`.
- `src/lib/xrpl/reads.ts` (`AccountState` has `regularKey`, `disableMasterKey`; `fetchAccountState` L19), `src/lib/xrpl/query-reads.ts` (`fetchAccountStateOnce` L15), `src/hooks/useAccountState.ts`, `src/lib/xrpl/query-keys.ts` -- reuse; no new literal keys.
- `src/store/app-store.ts` -- `normaliseWallets` (L130): default `keyAddress`.
- Ledger-address consumers that must read `WalletMeta.address` as the Account (verify, change only where they use the key address): `BalancesTab`, `ReceiveTab`, `SendTab`, `TrustLinesTab`, `HistoryTab`, `Main.tsx`, `WalletNodeSection`, `src/lib/teardown.ts` (L124-129).
- `src/pages/tabs/SettingsTab.tsx` -- row actions (L385-437), dialog mounting at the bottom (L658, `EditChecksDialog` pattern), `usePrompts`; `src/pages/tabs/TrustLinesTab.tsx` L47-70 is the signing-flow template.
- Tests to copy: `src/lib/crypto/__tests__/signing-check.test.ts` and `edit-checks.test.ts` (fake idb), `src/lib/xrpl/__tests__/writes.test.ts` (`installFakeClient`), `src/components/wallet/__tests__/edit-checks-dialog.test.tsx`, `src/pages/tabs/__tests__/settings-edit-checks.test.tsx`.
- Docs: `docs/agents/keys-and-secrets.md`, `docs/decisions.md` -- record the rules in existing style, no restatement.

## Tasks & Acceptance

**Execution:**
- `src/lib/crypto/db.ts`, `keystore.ts`, `src/store/app-store.ts` -- `accountAddress` on views, meta `address`/`keyAddress`, signer by view with `masterAddress`, duplicate-triple rule, claim function -- AD-18.
- `src/lib/xrpl/writes.ts` -- `submitSetRegularKey` -- AD-29.
- `src/lib/` (new module) -- `controlStatus` and the `setRegularKey` orchestration (fresh reads, confirms by callback, claim after validation) -- AD-29.
- `src/components/wallet/` and `src/pages/tabs/SettingsTab.tsx` -- Controlling Wallet dialog, Settings entry and status text for controlled Wallets -- render only.
- Consumers -- ensure every ledger read uses the Account address.
- Tests and docs -- every matrix row; a Signer built for a controlled view signs with `masterAddress` (decode the blob: `Account` is the Account, key is the target's); wrong-credential still by key address; no view on any non-validated or unconfirmed path; no stored control flag.

**Acceptance Criteria:**
- Given a Controlling Wallet and a same-network target, when the user sets the Regular Key, then the controller's Signing Check is passed and only after validation and a matching fresh read does the target operate the Account.
- Given an errored or stale read, when the action is requested, then it is blocked and status is shown as unknown, never on or off.
- Given an existing different Regular Key, when replacing it, then a confirm names that key as no longer able to sign before anything is signed.
- Given a controlled Wallet, when it sends or reads, then the Account address is used and the signature is by the target key.
- Given the four gates, `bun run lint`, `bun run build`, `bun run test`, `bun run check:contrast` all pass.

## Spec Change Log

## Review Triage Log

### 2026-10-12 — Review pass
- verdicts: 32 findings — high 0, medium 5, low 24, false 3, maybe-false 0 (rows repeat across layers; grouped by claim for routing)
- findings:
  - `[medium]` `patch` a claim write that fails after a validated `SetRegularKey` returned `refused`, with no "Check again" (blind) — now `unconfirmed`; test added with an injected write failure
  - `[medium]` `patch` dialog dismissable mid-submit or with the replace confirm open, leaving the promise unsettled (blind, edge) — dismissal locked while busy or confirming; the pending confirm resolves `false` on unmount
  - `[low]` `patch` "Not controlled by the chosen wallet" shown before a wallet is chosen (blind, edge) — neutral "unknown: choose a wallet" until chosen; test added
  - `[low]` `patch` picker lists a Seed twice when it also has a controlled view (blind, edge) — one row per Seed; test added
  - `[low]` `reject` no way to clear or revoke a Regular Key or remove a controlled view (blind) — the intent excludes it (Never in the spec)
  - `[low]` `reject` guard can go stale during the Signing Check (blind, edge) — narrow race against the owner's own other device; the ledger rejects a bad change
  - `[low]` `reject` no passkey-target test (blind) — the key is any Seed's key; the copy is covered by a dialog test
  - `[medium]` `patch` no component tests for the dialog, the note or the gating (blind, verification-gap, intent) — `control-wallet-dialog.test.tsx` added: blocked reasons, `aria-disabled`, replace confirm, check-again, note statuses
  - `[low]` `patch` `ControlledNote` read the ledger for every Wallet (blind) — the read now lives in an inner component mounted only for a Wallet on another Account
  - `[low]` `patch` placeholder section number `15.x` (blind) — `15.1` in both docs
  - `[low]` `false` `walletFromSeed` drops the resolved algorithm (blind, edge) — `Wallet.fromSeed(seed)` infers the algorithm from the seed prefix exactly as `algorithmOfSeed` does, and the probe already checked the address
  - `[low]` `reject` `confirmControl` skips the controller guards (edge) — only reached with ids `setRegularKey` already judged, or from the dialog's picker
  - `[low]` `reject` fresh read may reuse an in-flight query started before the submit (edge) — fails safe: `unconfirmed`, and "Check again" re-reads
  - `[low]` `reject` selected target vanishes after a refresh (edge) — cosmetic; the action needs a target
  - `[low]` `reject` `hasView` check outside the write transaction (edge) — narrow race; a duplicate view is harmless to funds
  - `[false]` `reject` removing a controlled view could delete the Seed (edge) — `removeWallet` filters by `walletId` and deletes the record only when no view remains
  - `[low]` `reject` signing offered from a view whose key was revoked (edge) — the ledger rejects it before a fee is charged and the note says it cannot sign
  - `[low]` `reject` "validated" wording on the already-set path (edge) — spec wording; the claim still rests on a fresh read
  - `[low]` `defer` real `submitSetRegularKey` untested with a handle whose address differs from the key (verification-gap) — a `writes.test.ts` case would settle it
  - `[low]` `reject` `addNetworkView` ignores `accountAddress` (verification-gap) — a Seed always has its own view first
  - `[low]` `reject` no `removeWallet` test for a controlled view (verification-gap) — covered by the rule above, no defect shown
  - `[low]` `reject` mocked builder runs the check before autofill (verification-gap) — noted in the test; the choke point is unchanged
  - `[low]` `reject` passkey appears only as copy (intent) — by design: any Seed's key, passkey-derived included, can be the Regular Key
  - `[low]` `reject` persisted `accountAddress` as "remembered" control (intent) — it is a display claim; status is always read
  - `[low]` `reject` scope drift: duplicate-import refusal, `walletFromSeed`, docs (intent) — each follows from AD-18

## Design Notes

The record's `address` stays the key's address so every existing wrong-credential compare is untouched; only the view carries the Account. `controlled` is a live read, so the persisted `accountAddress` is only a claim that the app should show this key operating that Account, and the UI always pairs it with the current status.

## Verification

**Commands:**
- `bun run lint` -- expected: no errors
- `bun run build` -- expected: `tsc -b` and Vite build succeed
- `bun run test` -- expected: all tests pass
- `bun run check:contrast` -- expected: pass

**Manual checks (if no CLI):**
- On Testnet, with a browser, set a second Wallet's key as the Regular Key of a funded Wallet's Account, then send from the controlled Wallet. Note if not done; unverified against a real ledger.

## Auto Run Result

Status: done

**Summary:** A Controlling Wallet (one holding its Account's master key) can set another on-device Wallet's key as the Account's single Regular Key. The flow reads the Account fresh, blocks on an errored read, an unfunded Account or a disabled master key, confirms a replacement that names the old key, signs with the controller's Signing Check through `submitSetRegularKey`, and only after `validated` and a matching fresh read adds a view over the target's Seed with `accountAddress`. Control status is always read from the ledger. A controlled view signs with `masterAddress`, and every read uses the Account.

**Files:** `src/lib/control.ts`, `src/lib/crypto/{db,keystore}.ts`, `src/lib/xrpl/{writes,query-reads}.ts`, `src/store/app-store.ts`, `src/components/wallet/{ControlWalletDialog,ControlledNote}.tsx`, `SettingsTab.tsx`, `BalancesTab.tsx`, docs, and tests (`control.test.ts`, `control-wallet-dialog.test.tsx`, `writes.test.ts`).

**Review:** patches applied 7 entries (medium 3, low 4); deferred 2 (one low, one unverified medium); the rest rejected with reasons in the log.

**Follow-up review recommended:** true — three medium entries were patched (claim recovery, dialog dismissal, UI tests), and the dialog and a send from a controlled Wallet have never run in a browser or against a real ledger.

**Verification:** `bun run lint`, `bun run build`, `bun run test` (81 files, 1157 tests) and `bun run check:contrast` pass after the patches. No browser or ledger run.

**Residual risks:** see the deferred list; the replace confirm can go stale during a long Signing Check; a revoked view still offers signing and the ledger refuses it.

**Browser pass (2026-10-14, `775ade7`):** run; result and defects in `../browser-pass-2026-10-14.md`.
