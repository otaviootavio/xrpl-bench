# Check rules

## Seed Method × Signing Check (FR-67)

| Seed Method | Standard | Passkey only | App PIN only |
|---|---|---|---|
| Stored Seed | yes | yes | yes |
| Passkey-Derived Seed | no | yes | no |

## Open Check and auto-lock floors (FR-65)

| Network | Open Check | Auto-lock |
|---|---|---|
| Mainnet | required (App PIN or passkey) | ≥ 1 min |
| Testnet, Devnet | optional | any |

## Network ids for the custom-Node test (FR-61)

Mainnet 0, Testnet 1, Devnet 2.

## Pre-selected answers (decided 2026-10-10)

Testnet; first Node listed; Stored Seed; Ed25519; Open Check passkey if PRF else App PIN, auto-lock 5 min; Signing Check Standard on Testnet/Devnet, on Mainnet passkey if PRF else App PIN.

## Rules that apply across checks

- "Only check is a passkey" = Open Check is a passkey and Signing Check is a passkey or Standard (`[ASSUMPTION]`); FR-72's written-Seed rule applies, including after edits.
- Revealing a Standard Wallet's Seed re-passes its Open Check; a Wallet with neither check needs only the confirm step (`[ASSUMPTION]`).
- Any change to checks requires passing the current check the change affects.

## Built-in Nodes (decided 2026-10-10; failover only within a Network's list)

| Network | Primary | Backup |
|---|---|---|
| Mainnet | `wss://xrplcluster.com` | `wss://s1.ripple.com` (today's pair) |
| Testnet | `wss://s.altnet.rippletest.net:51233` | `wss://testnet.xrpl-labs.com` (CORS) |
| Devnet | `wss://s.devnet.rippletest.net:51233` | none |

Ripple states public servers are not for sustained use; custom Nodes (FR-61) are the escape hatch. Verified live 2026-10-11: all five answer `server_info` with the expected network id (`s1.ripple.com` is Clio and omits `server_state`; Mainnet accepts a missing id). Devnet explorer transaction path returns 200.
