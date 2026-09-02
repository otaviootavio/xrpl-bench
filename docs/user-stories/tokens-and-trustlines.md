# Epic: Tokens and Trust Lines

Covers creating, viewing, and removing trust lines — the mechanism that lets a self-custody wallet hold non-XRP assets. See the [Index](./INDEX.md) for scope and shared XRPL facts.

---

### US-1: Create a trust line to hold a token
As a user, I want to open a trust line to a specific issuer/currency, so that I can receive and hold that token.

**Acceptance Criteria:**
- User specifies issuer address, currency code, and a trust limit (max amount they're willing to hold).
- Wallet warns that this will lock an additional owner reserve (0.2 XRP) and checks the user has enough spendable XRP to cover it before submitting.
- Confirms success once the `TrustSet` transaction validates.

**Relevant XRPL mechanism:** `TrustSet` transaction, creating a `RippleState` ledger entry; costs one owner reserve (verified live on testnet 2026-08-31: 0.2 XRP / 200,000 drops).

---

### US-2: View my active trust lines
As a user, I want to see all the trust lines I've opened, so that I know which tokens I can hold and how much reserve they're costing me.

**Acceptance Criteria:**
- Lists each trust line with issuer, currency, current balance, and trust limit.
- Shows total XRP locked in owner reserves due to trust lines (owner_count × owner reserve).

**Relevant XRPL mechanism:** `account_lines`; `account_info` → `OwnerCount` for the reserve total.

---

### US-3: Remove an unused trust line
As a user, I want to close a trust line I no longer need, so that I can free up the locked reserve.

**Acceptance Criteria:**
- Only allows closing trust lines with a zero balance (the ledger itself enforces this — non-zero balance trust lines cannot be deleted).
- Closing a trust line refunds the owner reserve immediately upon validation.
- If the user attempts to close a trust line with a non-zero balance, wallet explains they must first send the balance elsewhere or back to the issuer.

**Relevant XRPL mechanism:** `TrustSet` with limit set to `0` on a zero-balance line, which removes the `RippleState` entry.

---

### US-4: Understand the reserve cost of trust lines up front
As a user, I want to be warned about the reserve cost before I open a trust line, so that I don't accidentally lock funds I need.

**Acceptance Criteria:**
- Before submitting a new `TrustSet`, wallet shows: current spendable XRP, reserve cost of this trust line, and resulting spendable XRP after.

**Relevant XRPL mechanism:** Same owner reserve calculation as in viewing-balances.md — `reserve_inc` from `server_state`/`server_info`.
