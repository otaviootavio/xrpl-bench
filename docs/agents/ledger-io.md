# Scenario: you are reading from or writing to the ledger

`account_info`, `account_lines`, `account_tx`, `server_state`, `fee`, `submit`.
Reasoning: `docs/decisions.md` guardrail #1, #2, #5, §4, §5.4, §5.5, §5.6.

## Always

- **Every read goes through a TanStack Query hook.** The hooks in `src/hooks/`
  are the whole surface: `useAccountState`, `useTrustLines`,
  `useAccountTxHistory`, `useServerReserves`, `useSpendableBalance`,
  `useRecommendedFee`, `useDestinationInfo`. Add a hook rather than a call.
- **Put the active wallet and the active network in every query key.** They are
  one global source of truth, never duplicated into component state. This is
  what makes a wallet or network switch incapable of leaving stale cross-account
  data on screen.
- **For a genuinely imperative one-shot read, use `fetchAccountStateOnce()`**
  (`src/lib/xrpl/query-reads.ts`), which wraps `queryClient.fetchQuery`. A
  pre-flight probe inside a submit handler must block, so it cannot be a
  declarative hook — but it still shares one cache entry and one retry policy
  with the UI, so the probe and the screen can never disagree.
- **Distinguish three submit outcomes, because they cost different money.**
  `tesSUCCESS` applied. `tef*`/`tem*` never applied and cost nothing. `tec*`
  **is in a validated ledger and consumed its fee** — surfaced as the `claimed`
  status and reported to the user as "the network fee was still charged".
  Collapsing `tec` into "failed" charges a user without telling them.
- **Track `LastLedgerSequence`.** Once the ledger closes past it without
  validation, mark the transaction "expired, not applied" and offer a retry with
  a fresh sequence.
- **Key list rows by a natural identifier** — transaction hash, or
  `currency + issuer`. Never the array index.

## Never

- **Never** fetch ledger data in a raw `useEffect`. It duplicates under
  StrictMode, has no retry or backoff on transient RPC failure, reuses no cache,
  and races on stale closures. This is the most common AI-authored bug on this
  stack.
- **Never** suppress `react-hooks/exhaustive-deps`. If a callback needs the
  latest value without re-running, use a ref or `useEffectEvent`. An empty
  dependency array here means a component keeps showing the *previous* wallet or
  network after a switch.
- **Never** re-submit an already-signed blob after a failure. Build a fresh
  transaction with a new sequence number.
- **Never** offer a frozen asset as sendable. `freezePeer` and `freeze` both
  disqualify a line from the send path.

## Ask first

- Adding a new RPC endpoint, or making endpoints user-editable. v1 ships one
  hardcoded endpoint plus one failover per network, deliberately.
- Anything requiring a backend. There isn't one, on purpose — that is why Web
  Push is permanently deferred (`docs/decisions.md` §5.2). Do not solve a
  problem by introducing a server.
