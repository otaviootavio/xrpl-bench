# Glossary (feature terms)

Copied from the PRD §3. Product PRD terms (Wallet, Account, Seed, Signing
Check, Network, Node, Regular Key, Account Master Key) keep the product PRD's
meaning.

## Wallets

- **Wallet kind** — one of Online Wallet, Offline Wallet, Transmitter Wallet.
  Every Wallet has exactly one.
- **Online Wallet** — a Wallet that holds a key and talks to one Network.
  Today's Wallet. Its Network is fixed for life (FR-93).
- **Offline Wallet** — a Wallet that holds a key and never reads from or sends
  to the ledger. It has one Network, fixed for life like any Wallet (FR-93),
  and no Node. The Network is what the two devices must agree on.
- **Transmitter Wallet** — a Wallet that holds no key, belongs to one Network,
  and sends Signed Transactions to the ledger. It may be Synced.
- **Sync to an address** — the Transmitter Wallet action that attaches it to
  one Account address, giving a read-only view of that Account (balance,
  history, trust lines). A Synced Transmitter Wallet can build Unsigned
  Transactions for that Account.
- **Signs for** — the Account a Wallet's key signs for. Usually the key's own
  address; it can be another Account whose Regular Key this key is.
- **Was-online mark** — the permanent mark on an Offline Wallet whose key was
  once held by an Online Wallet.
- **Mainnet safeguards** — the steps the product PRD requires before a Wallet
  holds real funds: an Open Check and an auto-lock of at least one minute
  (FR-65), a confirmed written Seed for a passkey-only Wallet (FR-72), and no
  Passkey-Derived Seed on a temporary origin (FR-63). Required, never skippable.

## Transactions

- **Build** — fill in what a transaction does (type, destination, amount,
  token, limits) and review it.
- **Same Build** — two Builds with the same content (type, destination,
  amount, token, tag, flags), compared by a hash of that content.
- **Data-to-Sign Request** — the QR an Offline Wallet shows after a Build,
  asking a Transmitter Wallet for Data to Sign.
- **Data to Sign** — the ledger values a Built transaction still needs before
  it can be signed: Sequence, Fee, the validated ledger index and the Network.
  Supplied by a Transmitter Wallet. The Offline Wallet sets LastLedgerSequence
  from the ledger index itself.
- **Unsigned Transaction** — a complete transaction with every field set,
  waiting for a signature.
- **Signed Transaction** — a transaction with its signature, ready for the
  Transmit step.
- **Transmit step** — the one step every Signed Transaction passes through to
  reach the ledger, for every Wallet kind.

## Routes

- **Offline-builds route** — the Offline Wallet Builds, receives Data to Sign,
  and signs. The Transmitter Wallet only transmits. (OS-UJ-1)
- **Transmitter-builds route** — the Synced Transmitter Wallet Builds the
  Unsigned Transaction; the Offline Wallet only signs. (OS-UJ-2)
