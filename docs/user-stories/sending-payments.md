# Epic: Sending Payments

Covers sending XRP and token payments, fees, destination tags, confirmation, and failure handling. See the [Index](./INDEX.md) for scope and shared XRPL facts.

---

### US-1: Send a direct XRP payment
As a user, I want to send XRP to another address, so that I can pay someone or move funds.

**Acceptance Criteria:**
- User enters a destination address and an XRP amount; wallet validates the address format (classic or X-address) before submission.
- Wallet warns if the amount would drop the sender's balance below the required reserve.
- Wallet warns if the destination account doesn't exist yet and the amount is below the base reserve (the payment would fail to activate it).
- On submission, wallet signs locally and submits the signed `Payment` transaction.

**Relevant XRPL mechanism:** `Payment` transaction with `Amount` as a drops string; signed client-side, submitted via `submit`.

---

### US-2: Send an issued-currency (token) payment
As a user, I want to send a token I hold (e.g., an issued currency) to another address, so that I can transfer non-XRP assets I hold via trust lines.

**Acceptance Criteria:**
- User can only select tokens for which they have an existing trust line with a positive balance.
- Wallet checks the recipient has (or can create) a compatible trust line; if not, it warns the payment will likely fail.
- Amount field validates against the sender's current token balance.

**Relevant XRPL mechanism:** `Payment` transaction with `Amount` as a `{currency, issuer, value}` object; requires trust lines on both sides for direct issuer-to-holder or holder-to-holder transfers.

---

### US-3: See the network fee before sending
As a user, I want to see the transaction fee before confirming a payment, so that I know the total cost.

**Acceptance Criteria:**
- Wallet fetches the current recommended fee (e.g., via `fee` method) and displays it alongside the amount before the user confirms.
- Fee is shown in XRP, not just drops.

**Relevant XRPL mechanism:** `fee` API method for current open-ledger fee levels; fee is paid in XRP regardless of what asset is sent.

---

### US-4: Enter a destination tag
As a user, I want to optionally specify a destination tag, so that my payment is correctly attributed when sending to a shared address (e.g., an exchange).

**Acceptance Criteria:**
- Destination tag field accepts a 32-bit unsigned integer.
- If the destination account has the "Require Destination Tag" flag set, the wallet blocks submission until a tag is entered.

**Relevant XRPL mechanism:** `DestinationTag` field on `Payment`; `lsfRequireDestTag` account flag, checked via `account_info`.

---

### US-5: Get confirmation once a transaction validates
As a user, I want clear confirmation once my payment is validated, so that I know the funds have actually moved.

**Acceptance Criteria:**
- Wallet distinguishes between "submitted" and "validated" states — it does not claim success until the transaction appears in a validated ledger.
- Shows the resulting transaction hash and a link/reference to look it up.

**Relevant XRPL mechanism:** Poll or subscribe for the transaction hash via `tx` method (or `subscribe` to transaction streams) until `validated: true`.

---

### US-6: See a clear error when a payment fails
As a user, I want a clear, specific explanation when my payment fails, so that I can understand and fix the problem.

**Acceptance Criteria:**
- Maps common failure codes to plain-language messages, e.g.:
  - `tecUNFUNDED_PAYMENT` → "You don't have enough XRP to cover this payment and the reserve."
  - `tecNO_DST_INSUF_XRP` → "The recipient account doesn't exist yet and this amount is below the minimum needed to activate it."
  - `tecPATH_DRY` / `tecNO_LINE` → "The recipient can't receive this token (no trust line / no path)."
- Raw ledger result codes are still shown (e.g., in an expandable detail) for advanced users/debugging.

**Relevant XRPL mechanism:** Transaction result codes (`engine_result` / `meta.TransactionResult`) returned by `submit` or found via `tx`.
