# XRPL Bench (`xrpl-bench`)

A **self-custody XRP Ledger (XRPL) wallet**, intended to hold real Mainnet funds.
Functional scope only — no exchange/custodial features (no swaps, no fiat
on/off-ramp, no staking, no KYC).

React 19 + Vite + Tailwind v4 + shadcn-in-repo + xrpl.js, shipped as a PWA.
No backend: the ledger is the only server.

**Licence: `FSL-1.1-ALv2` — source-available, NOT open source.** Never
describe this project as open source, in code comments, README, repo
description, or UI copy. It converts to Apache 2.0 two years after each release.
See `PRODUCT.md` `## Licence`.

**Updates are never automatic.** The user decides when the signing code changes.

**Branches:** `dev` → `stage` → `prod`. `prod` is the default branch and the
deployed one; there is deliberately no `main`.

## Read these before you start

Five documents, in this order. They do not overlap; each is authoritative for
its own layer.

| Document | Authoritative for | Read when |
|---|---|---|
| **[docs/agents/INDEX.md](docs/agents/INDEX.md)** | **how to behave** — per-scenario do/never rules, and the anti-patterns this repo has actually hit | **always, first** |
| [docs/user-stories/INDEX.md](docs/user-stories/INDEX.md) | what the wallet does and does not do, plus the XRPL facts any implementation must respect (reserves, trust lines, sequence numbers, endpoints, explorer URLs) | any feature work |
| [docs/decisions.md](docs/decisions.md) | what was decided and **why** — the stack, resolved product decisions, and the §3 guardrails / §4 enforced patterns | before writing code |
| [DESIGN.md](DESIGN.md) | the visual system as shipped — tokens, the panel vocabulary, and its named rules | any visual change |
| [docs/sprints/](docs/sprints/) | **what is planned but not built** — findings, sequencing, and the decisions each sprint is blocked on | before proposing new work |

`docs/agents/` tells you how to act. `docs/decisions.md` tells you why the rule
exists. When in doubt about a rule's reasoning, follow the link rather than
re-deriving it — and never restate one document inside another.

## The rules that are never negotiable

Stated here only because ignoring any one of them loses money or keys. Each is
expanded in `docs/agents/`.

- Money is strings/`BigInt` end to end; formatting happens only at the render
  boundary. Never `Number()` a drops value.
- No secret ever enters `localStorage`, React state, a store, the URL, or
  anything serializable — not even in development.
- An unlock is proven by decrypting known ciphertext, never by deriving a key.
- Every ledger read goes through a TanStack Query hook whose key includes the
  active wallet *and* the active network.
- The service worker caches the static shell only. Never an RPC response.
- Nothing styles `:focus`; `outline-none` is banned.
- Colour never carries meaning alone, and `bun run check:contrast` is the gate.
- The app never updates itself. A new service worker installs and **waits**;
  only an explicit user action activates it.

## Planned work

Specs exist for things not yet built. Read the spec before designing the
feature, and do not re-derive it.

| Plan | Status |
|---|---|
| [docs/sprints/cicd-sprints.md](docs/sprints/cicd-sprints.md) | **Complete** (S13–S15, 2026-09-02). Repository, branch model, and deploy pipeline are live; decisions recorded in `docs/decisions.md` §8. |
| [docs/user-stories/app-versioning-and-updates.md](docs/user-stories/app-versioning-and-updates.md) | **Complete** (2026-09-02). All nine stories shipped; see `docs/decisions.md` §10 for the implementation notes on US-2/US-4/US-5/US-6/US-8/US-9 (US-1/US-3 shipped earlier, in S15). |
| [docs/user-stories/in-app-notices.md](docs/user-stories/in-app-notices.md) · [docs/sprints/notices-sprints.md](docs/sprints/notices-sprints.md) | **Complete and visually verified** (2026-09-02). N1–N4 decided and Sprint 16/17 built in `docs/decisions.md` §9; a later pass with a real browser confirmed the visual acceptance criteria and fixed two defects gates alone had missed (§9.5). |
| [docs/sprints/bugfix-sprints.md](docs/sprints/bugfix-sprints.md) · [interface-sprints.md](docs/sprints/interface-sprints.md) | Complete. Kept as the record of what was found and decided. |

**All twelve epics are now built.** The four tables above are the record of
what was found, decided, and shipped — read one before touching its area, not
because more work is pending, but because the reasoning is the load-bearing
part.

## Gates

`bun run lint` · `bun run build` (includes `tsc -b`) · `bun run test` ·
`bun run check:contrast`

All four green means nothing is *provably* broken — not that a change works. If
the change was visual, see
[docs/agents/verifying-your-work.md](docs/agents/verifying-your-work.md).
