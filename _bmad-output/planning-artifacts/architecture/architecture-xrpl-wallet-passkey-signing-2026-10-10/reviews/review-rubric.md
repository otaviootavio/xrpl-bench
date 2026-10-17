# Rubric review: ARCHITECTURE-SPINE (passkey-gated signing, 2026-10-10)

Reviewer: rubric walker. Repo claims checked against `src/` on this branch.
Verdict: **REVISE** (not ready to hand to builders; 2 high, several medium).

## Findings (ordered by severity)

### H1. AD-22 and the Paradigm diagram contradict `submitAndClassify` as it exists (criteria 2, 4, 5)
Spine: "`ks` returns a signed blob to the caller, and the caller hands it to
`xrpl` (`submitAndClassify`, parent AD-9)"; `signForWallet(walletId, unsignedTx, prompts)`.
Code: `src/lib/xrpl/writes.ts` `submitAndClassify(network, wallet: Wallet, tx)` does
in-flight signalling, `client.autofill(tx)`, the `FeeAboveCapError` check on the
*prepared* tx, then `wallet.sign(prepared)`, then submit and classify, with
`prepared.LastLedgerSequence` feeding expiry detection. `submitXrpPayment`,
`submitIssuedPayment`, `submitTrustSet` all take a `Wallet`. Signing sits in the
middle of the choke point.
Consequences the spine does not decide, and two builders will decide differently:
- Whether `submitAndClassify` is split (prepare / sign / submit) or takes a signer callback.
  Either one changes parent AD-9's body, yet AD-9 is listed as merely "unchanged/binding".
- Ordering of autofill vs the passkey prompt. A prompt can wait up to 60s
  (`webauthn.ts` timeout); autofill's `LastLedgerSequence` is ledger+20 (about 1 min).
  Prepare-then-prompt can expire the tx before it is signed; prompt-then-prepare means the fee
  the user confirmed (Send pins it) may differ. The fee-cap-before-signing guarantee must survive.
- Where the in-flight signal (parent US-5) starts relative to the prompt.
AD-30's "signForWallet on the offline device" has no autofill, so it is a different path again.
Fix: add an AD that fixes the new `submitAndClassify` shape and the prepare/check/sign order,
and list AD-9 as amended, not unchanged.

### H2. Identity collision for a controlled Wallet (AD-18, AD-29; criterion 1)
AD-18 makes identity `(network, accountAddress)` and says a controlled Wallet signs for an Account
it does not derive. It never says what `accountAddress` is for the *Controlled* Wallet record (its own
original address, or the Controlling Wallet's Account) or what the *Controlling* Wallet is. If the
former Wallet adopts the master Account's address, two vault records share one identity, one query
key set (`query-keys.ts` keys are `[name, network, address]`), and one Address Book/active-wallet
selection. FR-75/FR-76 leave this open too, but the spine claims to fix this exact divergence.
Fix: state which record owns which address after FR-75 and whether two records may share an identity.

### M1. Hard lock vs legacy Wallets with both PIN and passkey wraps (AD-25, AD-27; criteria 1, 3)
Real code: `VaultMeta` holds `wrappedMasterKeyForPin` and `wrappedMasterKeyForPasskey`; a legacy
Wallet opens by either. AD-25 says the reset "removes only PIN-dependent Wallets' records", AD-27
leaves the legacy lock wrapped under both. Not defined: is a legacy Wallet PIN-dependent? If yes,
funds-bearing Wallets with a working passkey wrap are deleted; if no, the PIN wrap is dead weight
and the FR-9 "re-import" recovery is not what happens. Also the Check-kind vocabulary
(`passkey|pin|none|standard`) cannot express "passkey and pin". Data-loss class; decide it.
Related: `Unlock.tsx handleReset` does call `tearDownAllLocalState` (confirmed), but the
Unlock screen itself is an app-wide gate (`auth.ts` `unlockVault`, `restoreSession`, `useAutoLock`,
`useClearCacheOnLock`) and FR-65 says the app opens without a check. The spine never says what
happens to `Unlock.tsx`, the router gate, `auth.ts` (absent from the Structural Seed tree, as are
`aes.ts`, `derive.ts`, `encoding.ts`), or the app-wide `autoLockMinutes` in `app-store`.

### M2. Auto-lock setting has no owner (AD-18, AD-21, AD-26; criterion 1)
FR-65 makes auto-lock per Wallet. `app-store.ts` persists one app-wide `autoLockMinutes`;
`auth.ts` `extendSession(masterKey, autoLockMinutes)` takes it. AD-18's list of what the vault
record owns omits auto-lock; AD-19 removes only `network` from the store. Two builders will store
it in different places (record vs store meta). Also the Mainnet floor (>= 1 min) is in policy but the
stored field and its migration default for legacy Wallets are not named.

### M3. Legacy key derivation contradicts AD-21's "never recompute a salt from a constant" (AD-21, AD-27)
Today `webauthn.ts` uses `PRF_SALT = 'xrpl-wallet:vault-unlock:v1'`, a code constant, with no
credential rpId (`rp: { name }` only: claim confirmed). The legacy PIN wrap derives from PBKDF2
directly, not PBKDF2 then HKDF. The legacy lock must therefore keep a constant-derived salt and a
different derivation. The spine should say the legacy lock records are frozen by *literal value
copied into the record at migration* and that `lock.ts` carries a legacy derivation path.
Also: "credentials already registered get the host they were registered under at migration"
is only knowable as "the host the migration happens on"; if a user first opens the new build on
a different origin (stage vs prod) it is recorded wrongly. Say it is migration-host, and stop there.

### M4. rpId constant and environments (AD-24, Deferred, operations; criteria 3, 6)
AD-24 requires `rp.id` "from one constant"; the Deferred section leaves the production origin
undecided. `dev -> stage -> prod` deploy to distinct hosts (parent AD-17), and a WebAuthn rpId must
be a registrable suffix of the page origin, so a single constant cannot hold on all three. Whether
the constant is per environment, derived from `location`, or build-injected is exactly the choice
two units would make differently, and it decides whether stage can exercise passkey Wallets at all.
Decide it or list it as Open; do not let it sit inside Deferred. The operational paragraph names
the origin risk but gives no owner or release gate.

### M5. AD-27 internal gap on where edited legacy Wallets live (criterion 3)
"A legacy Wallet's `encryptedSeed` is never rewritten in place" and "FR-73 edit re-encrypts that
Wallet alone" together do not say where the new ciphertext is stored (new record key? new
store field?). The rollback claim ("loses only Wallets created or edited on the new build") depends
on it; an old build reading the `wallets` store sees an entry it cannot decrypt, and the `session`
store holds one `masterKey` at key `session` while the spine needs per-lock session entries
(AD-21, AD-26). Both fit existing stores (no version bump is feasible, `vault`/`session` keyPath is
`key`), but the shape is unspecified. The existing `StoredWallet.address` vs the new
`accountAddress`/`keyAddress` naming is also unreconciled in the Consistency table.

### M6. Network and Node plumbing not decided (AD-19, AD-20; criteria 1, 6)
`NetworkId` is `'mainnet' | 'testnet'` (`networks.ts`), `NETWORK_IDS` drives the selector, `clients`
/ `inflight` in `client.ts` are keyed by `NetworkId`, `faucet.ts` reads `NETWORKS[network].faucetUrl`.
AD-20 says pool by Node URL, but says nothing on adding `devnet` to `NetworkId`, on the shape of the
"built-in list" (today: `wsUrl` + `wsUrlBackup`), or whether `holdXrplClient(network)` and
`submitAndClassify(network, ...)` now take a Node. Unresolved at the sealed-boundary signature.
Also: a missing `network_id` in `server_info` (Mainnet may report 0 or omit it) needs an explicit
rule; and the Node is not in the query key, so a custom Node's answers share a key with built-ins.

### L1. Rule enforceability (criterion 2)
Enforceable and well aimed: AD-23 (testable property), AD-28 (single policy function), AD-30
(decode and compare), AD-20 (proof before trust). Weak or unenforced:
- AD-18 "never edited independently" and AD-22 "no signer leaves lib/crypto": no gate named. The
  parent uses `[GATED]` scripts; these two should get an import-boundary lint, since `Wallet` is
  imported today in `keystore.ts` and `writes.ts` and mocked by page tests.
- AD-25 "cancelled never counts" needs the typed result in Consistency (present) plus a test (not listed).
- AD-24's CLAUDE.md amendment ("proven by decrypting known ciphertext") is deferred until adoption;
  until then a rubric gate would reject AD-24 as stated. Fine, but note it is a project-rule conflict.
- AD-29 FR-77 wording "AccountSet asfDisableMaster ... pass the Signing Check of the Wallet that
  signs it" covered; "turning back on signed with the Regular Key" is covered only by implication.

### L2. Coverage FR-60..FR-78 (criterion 5)
All 19 appear in the map. Thin or implicit:
- FR-69 reveal for a Standard Wallet ("re-pass Open Check again") and for a no-check Wallet: AD-22
  covers Signing Check only; the Open-Check re-prompt is not in policy or AD-22.
- FR-76 (extra passkey Regular Key; "existing key keeps working") collides with AD-29's "exactly
  one Regular Key": the spine resolves it by replacement and flags it ASSUMPTION; FR-76's text
  says otherwise. Listed under Deferred, which is correct only if FR-76 is reworded first.
- FR-71 "kind stated" is covered; FR-62's plain-words copy is a UX matter.
- FR-74 "Open Check is passkey and App PIN, as today": not representable (see M1).

### L3. Inherited ADs (criterion 5)
Five conflicts are listed openly, which is good, and AD-1/4/7/12/13/14/15 hold. Missing from the
conflict list:
- **AD-9**: see H1 (body of the choke point changes).
- **AD-1** `[GATED]`: `crypto` gets a `prompts` callback and `qr-codec` a new `lib` leaf; the
  gate script's allowed-import table needs editing; the spine says it "binds" but gives no gate change.
- **AD-4** `[GATED]`: "a locked Wallet issues no read" needs `enabled` wiring through every
  `use*` hook and `scripts/check-query-keys.mjs`; unstated.
- Parent Deferred lists "a user-editable endpoint" and "regular-key rotation" as deferred; this
  spine builds both. Not weakening an AD, but the parent Deferred entries should be struck.
- AD-2 conflict: also the parent's "closed list" rule says a new host is a *product decision*;
  AD-20 is that decision only if the PRD FR-61 counts, which it does. State that.

### Repo claims verified (criterion 4)
True: `unlockWalletForSigning` exists and returns a live `Wallet` (keystore.ts:100) and screens call it
(tests mock it); `rp: { name: 'XRPL Bench' }` with no `id` (webauthn.ts:25); `Unlock.tsx` `handleReset`
runs `tearDownAllLocalState` and reloads (full wipe); `app-store` persists one app-wide `network`
and `autoLockMinutes`, version 0, normalised in `merge`; `teardown.ts` has two sets as AD-16 says;
xrpl 5.1.0 has `Wallet.fromEntropy` and `fromSeed(..., { masterAddress })`; autofill `LEDGER_OFFSET = 20`.
False or misleading: "xrpl never imports crypto; ks returns a signed blob... submitAndClassify"
(H1); the Structural Seed omits existing files `auth.ts`, `aes.ts`, `derive.ts`, `encoding.ts`.

### Criterion 6 (structural dimensions)
Decided: layout, persistence, key model, egress, migration, rollback, QR contract.
Open but not marked Open: rpId per environment (M4); failure semantics when an IndexedDB edit
transaction spans `wallets` + `vault` stores (AD-28 says "one transaction": fine, `idb` supports it).
Operations: no gate or CI check for the new rules, no release-note step for the Passkey-Derived Seed
domain risk, no observability (none by product design, fine). Concurrency: two tabs holding different
per-lock sessions are not addressed (parent already had the `blocking()` multi-tab hazard).

## Summary table
| # | Severity | Criterion | Item |
|---|---|---|---|
| H1 | High | 2,4,5 | Spine contradicts `submitAndClassify`; order of prepare/prompt/sign undecided |
| H2 | High | 1 | Controlled/Controlling Wallet identity collision |
| M1 | Medium | 1,3 | Hard-lock effect on legacy PIN+passkey Wallets; Unlock gate, auth.ts unaccounted |
| M2 | Medium | 1 | Per-Wallet auto-lock has no owner |
| M3 | Medium | 2,4 | Legacy salt/derivation vs AD-21 |
| M4 | Medium | 3,6 | rpId constant vs dev/stage/prod origins, placed in Deferred |
| M5 | Medium | 3 | Edited-legacy ciphertext location; per-lock session entries |
| M6 | Medium | 1,6 | `NetworkId`/Node plumbing, missing `network_id` rule |
