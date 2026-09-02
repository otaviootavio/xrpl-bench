# Epic: Network Selection & Testnet Funding

Covers switching between XRPL Mainnet and Testnet, and testnet-only funding via the public faucet. See the [Index](./INDEX.md) for scope and shared XRPL facts.

---

### US-1: Select which network to use
As a user, I want to choose whether my wallet connects to Mainnet or Testnet, so that I can either manage real funds or safely develop/test without real value.

**Acceptance Criteria:**
- A visible network switch (e.g., in settings) offers exactly two options: **Mainnet** and **Testnet**.
- Switching networks re-points all reads/writes (balance, history, submit) to the corresponding JSON-RPC/WebSocket endpoint and re-fetches account state.
- The current network is always visible somewhere persistent in the UI (e.g., a badge), since an address can exist independently with different balances on each network.
- Switching networks never mixes state: balances, trust lines, and history shown always match the currently selected network.

**Relevant XRPL mechanism:** Same account keypair/address format works on both networks (they are separate ledgers with independent state); Mainnet default public endpoint `https://xrplcluster.com` (or `wss://xrplcluster.com`), Testnet default public endpoint `https://s.altnet.rippletest.net:51234` (or `wss://s.altnet.rippletest.net:51233`).

---

### US-2: Fund a wallet on Testnet via the faucet
As a user on Testnet, I want to request free test XRP for my address, so that I can activate my account and try sending/receiving without needing real funds.

**Acceptance Criteria:**
- A "Fund with Testnet XRP" action is available **only when Testnet is selected** — it must not be shown or callable on Mainnet.
- Calling it requests funds for the wallet's own address; the wallet does not accept or display any seed the faucet might return (a fresh, unimported address technically gets one back, but this flow always funds the user's already-generated address, so no seed is expected in the response).
- On success, the wallet shows the funded amount and refreshes the balance/activation status once the funding transaction validates.
- On failure (rate-limited, faucet unavailable), shows a clear, non-blocking error and lets the user retry.

**Relevant XRPL mechanism:** Testnet faucet HTTP API — `POST https://faucet.altnet.rippletest.net/accounts` with body `{"destination": "<classic address>"}`, returns `{account, amount, transactionHash}` (verified live 2026-08-31: funds 100 test XRP to an existing destination without generating a new seed). This is a testnet-only convenience service; it has no Mainnet equivalent — real accounts must be funded with real XRP from an exchange or another wallet.

---

### US-3: Understand that Mainnet requires a real funding source
As a user on Mainnet, I want to be told clearly that I must fund my account myself (no faucet exists), so that I don't expect free test funds on real value.

**Acceptance Criteria:**
- When Mainnet is selected and the account is unfunded, the wallet explains the account needs to receive ≥ the base reserve in real XRP from an external source (exchange, another wallet), and does **not** show any faucet/fund button.
- No mock or simulated funding action is ever offered on Mainnet.

**Relevant XRPL mechanism:** Mainnet has no faucet; account activation still follows the same base-reserve-via-`Payment` rule described in [account-onboarding.md](./account-onboarding.md).
