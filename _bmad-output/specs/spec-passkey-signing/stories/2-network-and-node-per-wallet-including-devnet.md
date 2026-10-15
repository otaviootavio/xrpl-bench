---
title: 'Network and Node per Wallet, including Devnet'
type: 'feature'
created: '2026-10-11'
status: 'done'
baseline_revision: '0d5fd4b07583d15192a15a3ee75149d455a7fb96'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/docs/agents/keys-and-secrets.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-passkey-signing-2026-10-10/ARCHITECTURE-SPINE.md'
warnings: [oversized]
deferred:
  - summary: >-
      Header Wallet picker item "Label · Network" may clip the network at 160px width.
    evidence: |-
      Unverified; a 320px browser pass would settle it (AppHeader comment cites §6.12 clipping history).
    location: >-
      src/components/AppHeader.tsx
    severity: medium (unverified)
  - summary: >-
      decisions.md, DESIGN.md and network-selection.md still describe the app-wide network selector.
    evidence: |-
      The selector was removed; docs were not part of this build.
    severity: low
---

<intent-contract>

## Intent

**Problem:** Network is one app-wide switch in `app-store`, there is no Devnet and no Node choice, so a Mainnet Wallet and a Testnet Wallet cannot coexist and a Mainnet Wallet can be read through whatever Node the switch points at (CAP-2, FR-61).

**Approach:** `network` and an optional custom `node` become fields of each Wallet view (AD-18/19); the active network is derived from the active Wallet and the header switch goes. The client pool is keyed by Node and a custom Node is trusted only after `server_info` reports the chosen network's id (AD-20). Devnet joins `NETWORKS` with its faucet and explorer.

## Boundaries & Constraints

**Always:** Built-in Nodes per `check-rules.md` (Mainnet `xrplcluster.com`/`s1.ripple.com`; Testnet `s.altnet…:51233`/`testnet.xrpl-labs.com`; Devnet `s.devnet.rippletest.net:51233`, no backup); failover only inside a built-in list, a custom Node has none. Network ids: Mainnet 0, Testnet 1, Devnet 2; a Node reporting no `network_id` is accepted for Mainnet only. A custom Node must be `wss://`, is checked on accept AND on every connect, and a failed check opens no read and caches no client. Query keys stay `(name, network, address)` — the Node is NOT in the key; node-scoped fetchers take an optional trailing `node`. Mainnet stays unmistakable wherever a Wallet's network shows, in words (never colour alone). Devnet shows "not a stable ledger — it can be reset, so a Wallet may need re-funding" as visible text. Money stays strings/BigInt.

**Never:** Add a node to any query key. Contact any host other than built-in Nodes, the two faucets, the Release Manifest and a Node on a Wallet record that passed the check. Cache an RPC response in the service worker. Read the app-wide `network` for a ledger read (it survives only as the story-1 migration input and a rollback mirror of the active Wallet's network). Build the creation flow (story 5), per-Wallet locks (story 4) or any Signing Check. Persist a bare password/secret.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Custom Node ok | Mainnet Wallet, `wss://x`, `server_info.network_id` 0 | Accepted, stored on that Wallet's view only | — |
| Wrong network | Testnet Node (id 1) offered as Mainnet | Rejected with plain reason naming both ids | Nothing stored; client closed |
| No network id | Node omits `network_id` | Accepted for Mainnet; rejected for Testnet/Devnet | Reason says the Node did not state its network |
| Unreachable / not wss | `ws://…`, timeout | Rejected, reason shown | Nothing stored |
| Connect-time mismatch | stored custom Node now reports another id | `getXrplClient` rejects, no client cached, no request issued | Read errors render as errors, never empty |
| Two Wallets, two Nodes | Mainnet default + Testnet custom | Two pool entries, each Wallet reads its own | — |
| Devnet | Wallet on `devnet` | Faucet button, Devnet explorer links, instability notice | Faucet failure toasts the reason |
| Network from active Wallet | switch active Wallet mainnet→testnet | All tabs read testnet with that Wallet's address; header names network | — |
| Legacy persisted state | Wallet meta without `node` | Built-in Nodes; `devnet`/`node` normalised on merge | Unknown network falls back to app-wide persisted one |

</intent-contract>

## Code Map

- `src/lib/xrpl/networks.ts` -- `NetworkId` gains `devnet`; `NETWORK_IDS`, `NetworkConfig` gains `networkId` and nullable `wsUrlBackup`; Devnet explorer `https://devnet.xrpl.org`, faucet `https://faucet.devnet.rippletest.net/accounts`; add `isNetworkId`, `builtInNodes`. Existing tests read `wsUrl`/`wsUrlBackup` — keep those fields.
- `src/lib/xrpl/client.ts` -- pool keyed by Node (`node ?? network`), `getXrplClient`/`holdXrplClient(network, node?)`, `verifyNode`/connect-time network-id check, AD-12 seam reused (`setXrplClientFactory`); `connectNetwork` error message.
- `src/lib/xrpl/reads.ts`, `writes.ts`, `query-reads.ts`, `src/lib/seed-import.ts` -- optional trailing `node` threaded to `getXrplClient`; `submitAndClassify(network, wallet, tx, node?)` and `isExpiry`.
- `src/lib/xrpl/faucet.ts` -- `requestTestnetFunds` → `requestFaucetFunds` (Testnet + Devnet).
- `src/hooks/*` (`useAccountState`, `useTrustLines`, `useAccountTxHistory`, `useServerReserves`, `useRecommendedFee`, `useSpendableBalance`, `useDestinationCheck`, `useIncomingPaymentNotifications`, `useAccountLiveUpdates`) -- accept/pass `node`.
- `src/lib/crypto/db.ts`, `keystore.ts` -- `WalletView.node?`, `WalletMeta.node?`, `setWalletNode(walletId, node)` via `mutateStoredWallet`; ciphertext untouched; `addNetworkView` accepts devnet.
- `src/store/app-store.ts` -- remove `setNetwork`; keep `network` as legacy migration input; `partialize` writes the active Wallet's network; `normaliseWallets` accepts `devnet`, `node`; add `useActiveNetwork()`/`useActiveNode()` selectors.
- `src/components/AppHeader.tsx`, `components/wallet/NetworkSelector.tsx` (delete → read-only `NetworkPlate`), `AddressLink.tsx` -- header shows the active Wallet's network in words, wallet picker labels carry network.
- `src/pages/Main.tsx`, `Onboarding.tsx`, `tabs/{Balances,Send,Receive,History,TrustLines,Settings}Tab.tsx` -- read network/node from the active Wallet; Onboarding and Settings Add get a Network choice (Testnet pre-selected); Settings Wallet card gets a Node section (built-in / custom with "Test and save"); Devnet notice; faucet for Devnet.
- `src/App.tsx` -- `listWallets` fallback still `app-store.network`; unchanged otherwise.
- `src/lib/xrpl/__tests__/client.test.ts`, `hooks/__tests__`, `pages/**/__tests__` -- fake-client pattern to extend; `docs/agents/verifying-your-work.md` for the visual pass.

## Tasks & Acceptance

**Execution:**
- `src/lib/xrpl/networks.ts` -- add Devnet, ids, helpers -- AD-19
- `src/lib/xrpl/client.ts` -- Node-keyed pool, custom Node with network-id proof on accept and connect, `verifyNode` -- AD-20
- `src/lib/xrpl/{reads,writes,query-reads,faucet}.ts`, `src/lib/seed-import.ts`, `src/hooks/*` -- thread `node`, generalise faucet -- AD-20
- `src/lib/crypto/{db,keystore}.ts`, `src/store/app-store.ts` -- `node` on views and meta, derive active network, normalise on merge -- AD-18/19
- `src/components/*`, `src/pages/**` -- per-Wallet network display, Network choice at creation, Node section, Devnet notice and faucet; remove the app-wide switch -- CAP-2
- `src/**/__tests__` -- one test per I/O row, plus: no module outside the store reads `s.network` for a read; query keys unchanged by Node; locked app issues no client request; update tests broken by the header change -- gates

**Acceptance Criteria:**
- Given Wallets on Mainnet and Testnet, when the user switches the active Wallet, then every tab reads the new Wallet's network and the header names it in words, Mainnet also marked "Real funds".
- Given a custom Node, when it fails the network-id test on accept or on connect, then no read is issued through it and the error says why.
- Given a Devnet Wallet, then Faucet, Devnet explorer links and the "not a stable ledger" text are present.
- Given the app is locked or a Wallet's Node mismatches, then no ledger request is made for it.
- Given a persisted vault and app state from story 1, when the new build starts, then every Wallet keeps its network, uses built-in Nodes and addresses are unchanged.

## Spec Change Log

## Review Triage Log

### 2026-10-11 — Review pass
- verdicts: 33 findings — high 0, medium 9, low 14, false 4, maybe-false 1 (some rows below group several layer findings)
- findings:
  - `[medium]` `patch` custom Node URL may carry userinfo/query secrets, persisted and echoed in errors; no shared validator, no canonicalisation (`startsWith('wss://')` vs `URL.protocol`) — one validator/canonicaliser used by verify, pool, `setWalletNode`, merge
  - `[medium]` `patch` `connectCustomNode` does not abandon the client when connect fails or the pool generation changed — abandon in both paths
  - `[low]` `patch` non-number `network_id` produces a garbled reason — "unreadable network id" message
  - `[medium]` `patch` Node change/clear leaves the old custom socket pooled and ledger-wide caches (reserves, fee, destination) stale — `retireNode` plus network-scoped invalidation helper in the key factory
  - `[low]` `patch` `NetworkPlate` aria-label on a plain div, and shows a stale persisted network with no active Wallet — visible/sr-only text, render nothing without a Wallet
  - `[medium]` `patch` NetworkChoice enabled while busy, never reset, import check and stored network can differ — disable, reset, capture with the pending seed
  - `[low]` `patch` `no-app-wide-network-read` regex bypassed by other arrow/destructuring forms — broadened
  - `[medium]` `patch` no test that a non-undefined node reaches writes, `isExpiry`, Send/TrustLines submits, live updates, creation network, `WalletNodeSection` — tests added
  - `[low]` `reject` two Wallets on one network with different Nodes share `serverReserves`/`recommendedFee` keys — AD-19 states the Node is not in the key because Nodes of one network serve one ledger; Node-change invalidation patched above
  - `[low]` `reject` Mainnet accepts a Node with no `network_id`, no warning copy — owner decision 2026-10-11 (AD-20); copy is not required by the intent
  - `[low]` `reject` optional trailing `node` can be forgotten without a type error — tests above forward-check every path; a required target type would rewrite all signatures
  - `[low]` `reject` proof only at connect, not per request — documented design; a changed host drops the socket and re-proves
  - `[low]` `reject` `fetchTx` has an unused `node` param — no caller exists; harmless
  - `[low]` `reject` Devnet notice missing in header/Send/History, picker text — spec places it in Balances and Settings; Devnet reset cache handling out of intent
  - `[low]` `reject` per-Wallet lock (C2) and hook-level gating for a mismatched Node — C2 is story 4; the pool rejection yields an error state and issues no read beyond `server_info`
  - `[low]` `reject` "saved but refresh failed" message; stale `network` mirror fallback — wrong text only / documented rollback mirror
  - `[maybe-false]` `defer` header picker `Label · Network` may clip at 160px so the network is truncated — needs a 320px browser pass
  - `[low]` `defer` `decisions.md`, `DESIGN.md`, `network-selection.md` still describe the app-wide selector — docs update, not part of this build

## Design Notes

The pool key is `node ?? network`: built-in Nodes share one slot per network (their list fails over inside it), a custom Node gets its own slot by URL, so two Wallets on one network with different Nodes never share a socket. Verification of built-in Nodes at connect is deliberately skipped (verified live 2026-10-11 per `check-rules.md`); only user-declared Nodes need proof. Rolling back to a story-1 build while a `devnet` Wallet exists is unsupported by an older build that has no `devnet` entry — residual risk, additive otherwise.

## Verification

**Commands:**
- `bun run lint && bun run build && bun run test && bun run check:contrast` -- expected: all green

**Manual checks (if no CLI):**
- Browser pass of header, Settings Wallet card (Node section), a Devnet Wallet and the Add dialog per `docs/agents/verifying-your-work.md`.

## Auto Run Result

Status: done

**Summary:** Network and an optional custom Node are now fields of each Wallet view; the active network is derived from the active Wallet and the header switch is replaced by a read-only network plate. Devnet joins `NETWORKS` (faucet, explorer, instability notice). The client pool is keyed by Node; a custom Node must be `wss://` with no userinfo/query, and is proven by `server_info` network id on accept and on every connect. Creation (Onboarding, Settings Add) offers a Network choice, Testnet pre-selected; each Wallet card has a Node section.

**Files changed:** `src/lib/xrpl/{networks,client,reads,writes,query-reads,query-keys,faucet}.ts`, `src/lib/crypto/{db,keystore}.ts`, `src/store/app-store.ts`, `src/hooks/*` (node threaded), `src/components/{AppHeader,wallet/NetworkPlate,wallet/NetworkChoice,wallet/WalletNodeSection}`, `NetworkSelector` removed, `src/pages/**` (tabs, Onboarding), and tests (`node-pool`, `network-display`, `node-wiring`, `active-network`, `no-app-wide-network-read`, `locked-no-ledger-request`, plus adjusted existing tests).

**Review:** 33 findings — high 0, medium 9, low 14, false 4, maybe-false 1. Patched: Node URL validation/canonicalisation, connect-failure/reset socket handling, `retireNode` and network-scoped invalidation, `NetworkPlate` a11y and no-Wallet state, creation-network consistency, broader regex guard, and write/live-update/creation/Node-section tests. Deferred: picker clipping (unverified), stale docs. Rejected: each `reject` row above with its reason.

**Follow-up review recommended: true** — five medium entries were patched. Unverified risk: no browser pass of the header, Settings Node section, Onboarding network choice or a Devnet Wallet, and no live custom-Node test.

**Verification:** `bun run lint`, `bun run build`, `bun run test` (58 files, 771 tests), `bun run check:contrast` all pass. Every I/O matrix row has a passing test.

**Residual risks:** a `devnet` Wallet is unsupported by a story-1 build on rollback; built-in Nodes are not proven at connect; cached ledger-wide data is shared by two same-network Wallets with different Nodes (AD-19).

**Browser pass (2026-10-14, `775ade7`):** run; result and defects in `../browser-pass-2026-10-14.md`.
