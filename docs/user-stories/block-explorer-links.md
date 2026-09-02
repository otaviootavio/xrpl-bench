# Epic: Block Explorer Cross-Check

Covers letting the user jump from anything shown in the wallet (address, account, transaction) straight to a public block explorer to independently verify it on-chain. See the [Index](./INDEX.md) for scope and shared XRPL facts.

---

### US-1: Open my address/account on a block explorer
As a user, I want to click my own address (or another wallet's address) anywhere it's shown, so that I can verify that account's on-chain state independently of this app.

**Acceptance Criteria:**
- Every place an address is displayed as a primary element (own address, active wallet in the switcher, a counterparty in transaction history, a trust line's issuer) is clickable/tappable and opens that address's account page on the explorer.
- Opens in an external browser/new tab, not embedded in-app, so the user is clearly looking at an independent third-party source.
- The explorer link always matches the **currently selected network** (see [network-selection.md](./network-selection.md)) — a Testnet address never links to the Mainnet explorer and vice versa.

**Relevant XRPL mechanism / explorer mapping:** `https://livenet.xrpl.org/accounts/{address}` for Mainnet, `https://testnet.xrpl.org/accounts/{address}` for Testnet (XRPL Foundation's official open-source explorer, verified live 2026-08-31). Purely a UI convenience — no XRPL API call is needed to build the link, just the address and the active network.

---

### US-2: Open a specific transaction on a block explorer
As a user, I want to click a transaction (in history, in a send confirmation, or in a payment-received notification) so that I can verify its exact on-chain result on an independent explorer.

**Acceptance Criteria:**
- Every transaction reference shown in the app (history list row, transaction detail screen, "payment sent" confirmation, "payment received" notification) includes a link/button to view it on the block explorer.
- The link uses the transaction's hash and resolves to that transaction's page, matching the network it was submitted/received on.
- Available even for a transaction the wallet itself reports as failed, so the user can independently confirm the failure and its exact result code on-chain.

**Relevant XRPL mechanism / explorer mapping:** `https://livenet.xrpl.org/transactions/{txHash}` for Mainnet, `https://testnet.xrpl.org/transactions/{txHash}` for Testnet (verified live 2026-08-31, e.g. `https://livenet.xrpl.org/transactions/891487D68B41C11D853590A168FF6F8DA4222E106FE286E1690E48E3CEF2591B`).

---

### US-3: Cross-check my full account, including trust lines, on the explorer
As a user, I want a direct link from my balances/trust-lines screen to my account's explorer page, so that I can compare the wallet's reported balances and trust lines against the raw on-chain record.

**Acceptance Criteria:**
- The balances screen ([viewing-balances.md](./viewing-balances.md)) and trust lines screen ([tokens-and-trustlines.md](./tokens-and-trustlines.md)) each expose a "View on explorer" action pointing at the active wallet's account page, in addition to any per-row links from US-1.
- Wallet does not claim the explorer values will always match instantly — explorer indexing can lag the wallet's own direct ledger read by a few seconds; this is noted briefly in the UI copy (e.g., a tooltip) so the user isn't confused by a momentary mismatch.

**Relevant XRPL mechanism:** Same account page as US-1; the account page on the XRPL Foundation explorer surfaces XRP balance, owner count, and trust lines, giving a direct visual cross-check against `account_info`/`account_lines`.

---

### US-4: Trust that explorer links are exact, not fabricated
As a user, I want the explorer links to point to the exact address/transaction I'm looking at — never a mismatched or stale one — so that cross-checking is actually trustworthy.

**Acceptance Criteria:**
- Explorer URLs are built directly from the same address/hash values currently rendered on screen (no caching of a different account's link, no truncated/malformed hash in the URL).
- If an address or hash hasn't finished loading yet, the explorer action is disabled rather than linking to an empty or wrong path.

**Relevant XRPL mechanism:** N/A on-ledger — this is a UI-correctness requirement ensuring the app never sends the user to the wrong page on a third-party site.
