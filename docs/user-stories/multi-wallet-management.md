# Epic: Multiple Wallets & Wallet Selection

Covers holding more than one wallet (address/keypair) in the app and choosing which one is active for a given action. See the [Index](./INDEX.md) for scope and shared XRPL facts.

---

### US-1: Add another wallet
As a user, I want to add an additional wallet (generate a new one or import an existing seed) alongside my current wallet(s), so that I can separate funds or identities (e.g., personal vs. savings) without using a different app.

**Acceptance Criteria:**
- "Add wallet" is available from a wallet list/switcher, using the same generate/import flows from [account-onboarding.md](./account-onboarding.md).
- Each added wallet gets its own address, its own seed, and its own on-device encrypted storage entry (see [wallet-security.md](./wallet-security.md)) — wallets are never derived from each other or share key material.
- User can give each wallet a local, editable label (e.g., "Personal", "Savings"); the label is stored only on-device and has no on-ledger meaning.
- Adding a wallet never affects or replaces any existing wallet already stored in the app.

**Relevant XRPL mechanism:** Each wallet is an independent XRPL keypair/address; the ledger has no concept of "grouping" — grouping and labeling are purely app-side/local.

---

### US-2: View my list of wallets
As a user, I want to see all the wallets I've added, so that I can tell them apart and pick the one I want.

**Acceptance Criteria:**
- Wallet list/switcher shows, per wallet: label, address (truncated with full copy available), current network's balance, and activation status.
- Clearly indicates which wallet is currently **active** (the one all actions apply to).
- List reflects the currently selected network (see [network-selection.md](./network-selection.md)) — the same wallet can show different balances/activation depending on Mainnet vs. Testnet.

**Relevant XRPL mechanism:** Per-wallet `account_info`/`account_lines` calls against the address, scoped to whichever network is currently selected.

---

### US-3: Select which wallet is active
As a user, I want to switch which wallet is "active," so that sending, receiving, balance, and history actions all apply to the wallet I intend.

**Acceptance Criteria:**
- Selecting a wallet from the list makes it the active wallet app-wide; all other screens (balance, send, receive, history, trust lines) immediately reflect the newly selected wallet's data.
- The active wallet is clearly and persistently visible (e.g., in a header) so the user always knows which wallet they're about to act with before sending a payment.
- Switching the active wallet does not require re-adding or re-importing it — it stays available in the list.
- Switching wallets re-applies the unlock/passkey gate for that wallet's key material only when an action actually needs the private key (e.g., signing); simply switching the active selection to view balances/history does not require re-authentication if the app is already unlocked, but signing with a *different* wallet's key still requires that wallet's key to be decrypted via the unlock flow.

**Relevant XRPL mechanism:** N/A on-ledger — "active wallet" is purely a local app-state concept selecting which keypair/address subsequent `account_info`/`account_lines`/`account_tx`/`Payment`/`TrustSet` calls use.

---

### US-4: Remove a wallet from the app
As a user, I want to remove a wallet I no longer need from the app, so that my wallet list stays relevant and unused key material isn't retained unnecessarily.

**Acceptance Criteria:**
- Removing a wallet requires explicit confirmation and a warning that the app will no longer hold the encrypted seed — the user must have their own backup ([account-onboarding.md](./account-onboarding.md) US-6) to restore it later.
- Removal securely deletes the wallet's encrypted key material from local storage; it does not affect the wallet's on-ledger existence or balance.
- If the removed wallet was the active wallet, the app prompts the user to select a new active wallet (or shows the "no wallets" onboarding state if none remain).

**Relevant XRPL mechanism:** N/A on-ledger — removal is purely local key-material deletion; the XRPL account itself is unaffected and can always be re-imported later with its seed.
