# Forged idea: per-wallet key setup and passkey-gated signing

Outcome: HARDENED (2026-10-09). Input for `/bmad-prd` (update the 2026-09-12 PRD).

## Threat it targets
Someone using a phone that is already unlocked. It helps somewhat against malicious code running in the page, and adds little against stolen device storage, which is already encrypted.

## Creation flow (one question per axis)
1. Network: Mainnet / Testnet / Devnet. Then the node: pick one from the list, or add a custom one with a connection test.
2. How the secret key works (plain words, both valid):
   - (1) "Your passkey creates the seed. Same passkey on a new phone = same wallet." Seed is computed from the passkey's PRF output and never stored.
   - (2) "A new random seed, locked on this phone. A new phone needs your written seed." Seed is stored encrypted.
3. Signature type: Ed25519 / secp256k1.
4. Check when the app opens: **per wallet**. Required on Mainnet (PIN or passkey, auto-lock ≥ 1 min). Optional on Testnet/Devnet.
5. Check on every signature: none (Standard), or exactly one of passkey only / PIN only. No fallback between them.

Import seed is not part of this flow.

## Rules
- A wallet with a signing check is never encrypted under the session `vaultKey`. Its seed has its own key, which only that check unlocks. `vaultKey` stays as is.
- Revealing the seed requires the wallet's signing check. Passkey-derived seeds can always be revealed this way. The screen never says the key "cannot be exported".
- The signing PIN is the app PIN. Wrong tries share the unlock screen's count and hard lock. A cancelled passkey prompt never counts. The prompt states how many tries are left.
- One passkey rule everywhere: "use an existing passkey or create a new one". New passkeys are named after the wallet. Each use (open / sign / create seed) gets its own salt.
- Synced and device-bound passkeys are both allowed. After creation, the app reads which kind it got and states the consequence.
- With the per-wallet open check, the app opens freely. Wallet names are visible, but balances and addresses of locked wallets are not.
- Existing wallets become: method (2), open check = current PIN/passkey, no signing check.
- Checks can be edited later (re-encrypt, same address). The seed method cannot; changing it means a new wallet and moving the funds. Weakening a check requires passing the current one first.
- **Reverses `decisions.md` §1 mandatory PIN fallback.** Replacement: a Mainnet wallet whose only check is a passkey requires a confirmed written seed (word check). Testnet/Devnet skip this.
- Master key is not a creation question. A later step asks "Will this wallet be controlled by a master key?" Any wallet can act as a master, including a Devnet wallet with no check. The master can be on this phone (plain warning: whoever has this phone can take over that account) or on an offline device signing by QR.
- A passkey can also be added later to an existing wallet as an extra (regular) key.

## Rejected / parked
- Passkey signature as the XRPL signature: XRPL accepts only secp256k1/Ed25519, and WebAuthn signs its own wrapper data, not the transaction.
- A passkey prompt that leaves the seed openable by `vaultKey`: it would be for show only.
- A separate signing PIN: easy to forget, and a second lockout to maintain.
- App-wide open check: it would make "no check on Testnet" meaningless on any device that also holds a Mainnet wallet.
- Splitting keys with a server (MPC): there is no backend.
- XLS-100 Smart Escrows / Xahau Hooks: not a way to authorize an account.
- `largeBlob` (seed stored inside the passkey): parked because support is uneven (no Firefox; each password manager separately). If it is ever used, store only the PRF-encrypted seed.

## Open, for PRD / architecture
- Which choice is pre-selected at each creation question.
- "Turn off master key" for a passkey regular key: recommend not offering it, or only with a strong warning, since it removes recovery.
- Built-in node list per network.
- Offline QR signing: xrpl.js default expiry is 20 ledgers (≈1 min). Set `LastLedgerSequence` explicitly (e.g. +75 ≈ 5 min). Tickets only for signing ahead.
- PRF is bound to the app's domain (rp id). A domain change loses passkey-derived keys, so treat the domain as permanent.
- The vault needs per-wallet locks instead of one app-wide master key.
