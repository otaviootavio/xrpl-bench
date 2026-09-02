# Epic: Transaction History

Covers listing past transactions and viewing transaction detail. See the [Index](./INDEX.md) for scope and shared XRPL facts.

---

### US-1: View a chronological list of past transactions
As a user, I want to see a list of my past transactions in order, so that I can review my account activity.

**Acceptance Criteria:**
- Lists transactions newest-first, paginated (the underlying API is paginated via markers).
- Each row shows: date/time, type (sent/received), asset, amount, and counterparty.

**Relevant XRPL mechanism:** `account_tx` with `Account` set to the user's address, using the `marker` field for pagination.

---

### US-2: View the details of a specific transaction
As a user, I want to open a transaction and see its full details, so that I can verify or troubleshoot it.

**Acceptance Criteria:**
- Detail view shows: transaction hash, amount, fee paid, sender, recipient, destination tag (if any), timestamp, validated ledger index, and final result code.
- Distinguishes a successful (`tesSUCCESS`) transaction from a failed one, with the failure reason shown in plain language (reusing the mapping from sending-payments.md).

**Relevant XRPL mechanism:** `tx` method with the transaction hash; result taken from `meta.TransactionResult`.

---

### US-3: Filter/distinguish sent vs. received transactions
As a user, I want to filter or visually distinguish transactions I sent from ones I received, so that I can quickly scan my activity.

**Acceptance Criteria:**
- Each transaction is tagged as "sent" or "received" based on whether the user's address is the `Account` (sender) or the `Destination`.
- A filter/toggle lets the user view only sent or only received transactions.

**Relevant XRPL mechanism:** Comparing the user's address against the `Account` and `Destination` fields of each transaction returned by `account_tx`.
