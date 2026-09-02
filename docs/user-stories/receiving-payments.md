# Epic: Receiving Payments

Covers sharing your address, destination tags, and detecting incoming payments. See the [Index](./INDEX.md) for scope and shared XRPL facts.

---

### US-1: View and share my address
As a user, I want to easily view and share my address, so that others can send me payments.

**Acceptance Criteria:**
- Address is displayed in full with a one-tap/click copy action.
- A QR code encoding the address is available for in-person sharing.

**Relevant XRPL mechanism:** The account's `Account` r-address; no transaction involved.

---

### US-2: Share a destination tag when needed
As a user, I want to generate or communicate a destination tag alongside my address when required, so that senders using shared/omnibus addresses on my behalf can route funds correctly.

**Acceptance Criteria:**
- If the user's own account is configured to require a destination tag, the wallet surfaces that requirement prominently next to the address/QR code.
- QR code payload can optionally embed the destination tag alongside the address (standard XRPL URI format).

**Relevant XRPL mechanism:** `DestinationTag` field on incoming `Payment` transactions; `lsfRequireDestTag` account flag.

---

### US-3: Get notified when a payment arrives
As a user, I want to be notified when a payment lands in my account, so that I don't have to manually refresh to know I've been paid.

**Acceptance Criteria:**
- Wallet detects new incoming validated transactions for the account without requiring a manual refresh (e.g., via a subscription or polling `account_tx`).
- Notification shows amount, asset, and sender address.

**Relevant XRPL mechanism:** `subscribe` to the account's transaction stream, or periodic `account_tx` polling; filters for transactions where the account is the `Destination`.

---

### US-4: Distinguish incoming XRP vs. token payments
As a user, I want incoming payments to clearly show whether they're XRP or a specific token, so that I understand what I received.

**Acceptance Criteria:**
- Incoming payment notifications/list entries show currency code and issuer (for tokens) or "XRP" clearly.
- If a token payment arrives for a currency with no existing trust line, the wallet explains that the payment could not be delivered (it would have failed on-ledger) rather than showing a false "received" state.

**Relevant XRPL mechanism:** `Amount` field shape on `Payment` (drops string for XRP vs. `{currency, issuer, value}` object for tokens); a token payment cannot succeed without the recipient's trust line already existing.
