# Epic: Viewing Balances

Covers XRP balance, reserved vs. spendable XRP, and token balances. See the [Index](./INDEX.md) for scope and shared XRPL facts.

---

### US-1: View my current XRP balance
As a user, I want to see my total XRP balance, so that I know how much I hold.

**Acceptance Criteria:**
- Balance is fetched live from the ledger (not cached indefinitely) and refreshable on demand.
- Displayed in XRP (converted from drops), not raw drops.

**Relevant XRPL mechanism:** `account_info` → `account_data.Balance` (in drops; divide by 1,000,000 for XRP).

---

### US-2: See reserved vs. spendable XRP
As a user, I want to see how much of my XRP balance is locked in reserve versus actually spendable, so that I don't attempt a payment that would fail.

**Acceptance Criteria:**
- Wallet computes: `spendable = balance − base_reserve − (owner_reserve × owner_count)`.
- Both the total balance and the spendable amount are shown, with a short explanation of why they differ when the account owns trust lines or other objects.

**Relevant XRPL mechanism:** `account_info` → `account_data.OwnerCount`; `server_state`/`server_info` → `reserve_base`, `reserve_inc` (verified live on testnet 2026-08-31: base = 1 XRP, owner reserve = 0.2 XRP per object).

---

### US-3: View balances of each token I hold
As a user, I want to see the balance of every token/issued currency I hold, so that I have a full picture of my assets.

**Acceptance Criteria:**
- Lists every trust line with a non-zero balance, showing currency code, issuer, and balance.
- Refreshable on demand, same as the XRP balance.
- Clearly separates "assets I hold" (positive balance) from trust lines with zero balance (shown, if at all, in a separate/collapsed section).

**Relevant XRPL mechanism:** `account_lines` → array of `{account (issuer), balance, currency, limit, ...}`.
