# Scenario: you are touching money

Any amount, balance, fee, reserve, drops value, or issued-currency value.
Reasoning: `docs/decisions.md` guardrail #4, §4, §6.11.

## Always

- **Keep money as strings or `BigInt`, end to end.** Drops are integer strings.
  Issued-currency values are decimal strings. They arrive as strings from the
  ledger and stay strings until the render boundary.
- **Format only at the render boundary, through `src/lib/xrpl/money.ts`.** That
  module is the single place a value becomes human-readable. `formatXrp()`
  returns the figure with its unit; `formatXrpValue()` returns the bare figure
  for a surface that engraves the unit once beside the reading.
- **Compare decimal strings with `compareDecimalStrings()`**, and do drops
  arithmetic with `subtractDrops()` / `multiplyDropsByCount()`. They exist so
  you never reach for an operator on a value that must not become a float.
- **Render any changeable amount in the data face** (`font-data`), which sets
  tabular figures at face level. A balance that shifts its own digits on a live
  update is a defect, not a cosmetic issue.
- **Validate an amount with string operations only.** `validateAmountString()`
  in `AmountInput.tsx` is regex plus string length — deliberately no `Number()`.
  XRP allows 6 decimal places; issued currencies allow 15 significant digits.
- **Add the fee on top of the amount when checking affordability.** The send
  path checks `amount + fee <= spendable`, in `BigInt`, before enabling submit,
  so an over-send fails in the form instead of costing a fee and returning
  `tecUNFUNDED_PAYMENT`.

## Never

- **Never** call `Number()`, `parseFloat()`, `parseInt()`, or use `+ - * /` on
  drops or an issued-currency value. This is the single highest-consequence
  rule in the repo: floating-point drift here means sending the wrong amount.
- **Never** compute spendable balance yourself from hardcoded reserve figures.
  Read them from `server_state` via `useServerReserves()`. The repo docs record
  1 XRP base / 0.2 XRP owner as authoritative *for documentation*
  (`docs/decisions.md` §5.7), but the code must keep reading live values.
- **Never** show a delivered amount as exact when the ledger could not report
  it. If `amountIsUpperBound` is set, the figure is a maximum and the UI says
  so — this is the sentence a user most needs and the one most easily dropped.
- **Never** reuse a unit label three times in one readout because the formatter
  happens to append it. State the unit once and let the figures be figures.

## Ask first

- Introducing any price, conversion, or fiat-equivalent display. It is
  explicitly deferred (`docs/decisions.md` §2) because it adds a price-oracle
  dependency, and "deferred" is a decision, not an oversight.
