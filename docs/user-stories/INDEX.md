# XRPL Self-Custody Wallet — User Stories Index

This is the functional scope reference for the wallet. It exists to keep every future feature discussion, design, and implementation anchored to the same, XRPL-verified set of core capabilities. **Read this file before starting any wallet feature work.**

## Scope

**In scope — core self-custody wallet functionality:**
- Wallet creation/import and key management
- Sending XRP and issued-currency (token) payments
- Receiving XRP and token payments
- Viewing XRP and token balances
- Managing trust lines (required to hold non-XRP tokens on XRPL)
- Viewing transaction history
- App versioning and user-controlled updates (the user decides when the code changes)
- In-app notices: where the wallet tells you something happened, without covering the panel

**Out of scope — exchange/custodial features:**
- Token swaps / built-in DEX trading UI
- Fiat on-ramp / off-ramp, card purchases
- Staking, yield, lending
- KYC/AML, custodial account recovery, shared/omnibus addresses

**Deferred (real XRPL features, not part of the initial core set):**
- Checks (deferred/cancellable payments)
- Escrow (time/condition-locked payments)
- Payment Channels (streaming micro-payments)
- Multi-signing / regular key rotation

These are legitimate native XRPL features and can become their own epics later, but they are not required for a minimum functional self-custody wallet.

## Epics

| File | Covers |
|---|---|
| [account-onboarding.md](./account-onboarding.md) | Creating/importing a wallet, seed backup, account activation, viewing your address |
| [sending-payments.md](./sending-payments.md) | Sending XRP and token payments, fees, destination tags, confirmation, error handling |
| [receiving-payments.md](./receiving-payments.md) | Sharing your address/QR code, destination tags, detecting incoming payments |
| [viewing-balances.md](./viewing-balances.md) | XRP balance, reserved vs. spendable XRP, token balances |
| [tokens-and-trustlines.md](./tokens-and-trustlines.md) | Creating/viewing/removing trust lines, their reserve cost |
| [transaction-history.md](./transaction-history.md) | Listing past transactions, viewing transaction detail, sent vs. received |
| [network-selection.md](./network-selection.md) | Switching between Mainnet/Testnet, testnet faucet funding |
| [wallet-security.md](./wallet-security.md) | Unlocking with a passkey, encrypted local storage of the secret key |
| [multi-wallet-management.md](./multi-wallet-management.md) | Adding/removing multiple wallets, listing them, selecting the active one for actions |
| [block-explorer-links.md](./block-explorer-links.md) | Clickable addresses/transactions that open the on-chain block explorer to cross-check wallet data |
| [app-versioning-and-updates.md](./app-versioning-and-updates.md) | Which build is running, learning a new release exists, and applying it **only** when the user chooses |
| [in-app-notices.md](./in-app-notices.md) | Where a notice appears and how long it stays — a docked annunciator that never covers the panel, on every screen |

## Quick Reference (XRPL facts every story below relies on)

Verified 2026-08-31 against xrpl.org docs and the public testnet (`server_state` on `wss://s.altnet.rippletest.net:51233` / `https://s.altnet.rippletest.net:51234`):

- **No explicit "create account" transaction.** An address becomes a funded account the moment it receives a `Payment` of at least the base reserve. Before that, the address doesn't exist on-ledger.
- **Base reserve:** 1 XRP (1,000,000 drops), locked and non-spendable, as long as the account exists.
- **Owner reserve:** 0.2 XRP (200,000 drops) per "owned object" the account has — each trust line, each open order, escrow, etc. Spendable balance = XRP balance − base reserve − (owner reserve × number of owned objects).
- **Sequence Number:** every account has one; each transaction it sends must use the current value, then it increments by 1. Prevents replay and enforces ordering.
- **Tokens/issued currencies are never "in" the account.** They live in a **Trust Line** — an accounting relationship between the holder and the issuer, created via a `TrustSet` transaction. You cannot hold or receive a token without first opening a trust line to its issuer (and that trust line costs one owner reserve).
- **Destination Tags** are an application-level integer field on a `Payment`, used to disambiguate which sub-account/customer a payment is for when the destination address is a shared address (e.g. many exchanges). Required by some destinations, irrelevant for plain self-custody-to-self-custody sends.
- **Key read-only API methods** a wallet UI needs: `account_info` (XRP balance, reserve, sequence, flags), `account_lines` (trust lines and token balances), `account_tx` (transaction history).
- **Core payment transaction:** `Payment` — covers both direct XRP transfers and issued-currency transfers (with amount specified as a currency/issuer/value object instead of a drops string).
- **Networks:** the wallet supports **Mainnet** and **Testnet** as user-selectable networks, each with its own independent ledger state (same address can exist differently on each). Only Testnet has a public faucet (`https://faucet.altnet.rippletest.net/accounts`, verified live 2026-08-31 — funds 100 test XRP to an existing address via `{"destination": "<address>"}`); Mainnet has no faucet and must be funded with real XRP.
- **Key custody:** the secret key/seed is generated and stored only on-device, encrypted at rest, and unlocked via a passkey/platform-authenticator ceremony rather than a typed password — see [wallet-security.md](./wallet-security.md).
- **Multiple wallets:** the app can hold more than one independent keypair/address at once; exactly one is "active" at a time and all balance/send/receive/history/trust-line actions apply to whichever wallet is currently active — see [multi-wallet-management.md](./multi-wallet-management.md).
- **Delivery and updates:** the wallet's source is public (source-available under `FSL-1.1-ALv2`, *not* OSI open source) and it is delivered as a PWA, so its signing code is re-fetched rather than installed once. Updates are therefore **never automatic**: a new service worker installs and waits, and only an explicit user action activates it — see [app-versioning-and-updates.md](./app-versioning-and-updates.md). Subresource Integrity does not defend against a compromised origin (the attacker controls `index.html` and thus the hashes); reproducible builds plus published asset hashes are what make a release verifiable.
- **Block explorer:** addresses and transaction hashes shown in the app should be clickable, linking out to the network-appropriate official explorer for independent on-chain verification — `https://livenet.xrpl.org/accounts/{address}` / `/transactions/{hash}` on Mainnet, `https://testnet.xrpl.org/...` on Testnet (verified live 2026-08-31) — see [block-explorer-links.md](./block-explorer-links.md).
