# Agent Manual — index

**This manual is about *how to act*. `docs/decisions.md` is about *what was
decided and why*.** Do not restate one in the other: an agent reading two copies
of the same rule performs worse than one reading it once, so this manual states
behaviour and links to the decision for the reasoning.

Read this index, then read only the scenario file(s) your task touches. If your
task touches none of them, you are probably about to do something this project
has an opinion about — check `docs/decisions.md` §3–§4 before writing.

## Routing

| If your task involves… | Read |
|---|---|
| An amount, a balance, a fee, a reserve, drops, an issued-currency value | [money.md](money.md) |
| A seed, a PIN, a passkey, the vault, unlocking, locking, teardown | [keys-and-secrets.md](keys-and-secrets.md) |
| Reading from or writing to the ledger; `account_*`, `submit`, result codes | [ledger-io.md](ledger-io.md) |
| Any visual change: tokens, components, layout, copy, colour, type | [ui-and-design-system.md](ui-and-design-system.md) |
| Claiming something works; screenshots; "done" | [verifying-your-work.md](verifying-your-work.md) |
| CI, deploys, the CDN, releases, the service worker, the update flow | [shipping-and-ci.md](shipping-and-ci.md) |
| Anything at all — read this one before you finish | [anti-patterns.md](anti-patterns.md) |

## The three tiers

Every rule in this manual is one of three kinds. When a file says **Never**, it
means never — not "prefer not to".

- **Always** — do this without being asked. It is not a judgement call.
- **Ask first** — stop and ask the human. Proceeding on an assumption here is
  the failure, even if your assumption turns out to be right.
- **Never** — do not do this. If the task appears to require it, the task is
  wrong or you have misread it; say so instead of complying.

## The five standing behaviours

These apply to every task in this repo and are not repeated in the scenario
files.

1. **This wallet is meant to hold real money.** `PRODUCT.md` records that the
   owner intends real Mainnet funds. A defect here is asymmetric and permanent:
   a pleasant wrong balance is worse than an ugly right one. When clarity and
   brevity conflict, clarity about consequence wins.

2. **Assume literacy.** The user is an XRPL-literate self-custodian. Use the
   ledger's own vocabulary — drops, reserve, trust line, sequence, `tec`/`tef`.
   Do not soften it into analogy, and do not add tutorials nobody asked for.

3. **Report the awkward truth.** Deferred is stated as deferred. An upper bound
   is stated as an upper bound. A fee consumed by a failed transaction is
   stated. Silence about a limitation is itself a defect, in code and in your
   own summaries.

4. **A harness beats an opinion.** This repo has executable gates:
   `bun run check:contrast`, `bun run test`, `bun run lint`, `bun run build`.
   If a rule can be enforced by one of them, enforce it there rather than in a
   comment. If you add something a gate should cover, extend the gate in the
   same change — an unmeasured token is a token outside the rule.

5. **Never repair drift as a side effect.** If you notice something stale or
   wrong outside your task, report it and move on. Do not fix it silently in a
   change about something else.

## The delivery model

The wallet's source is public — source-available under `FSL-1.1-ALv2`,
which is **not** OSI open source, so never call it that — and it is delivered as
a PWA, so its signing code is re-fetched rather than installed once. **Updates are therefore never
automatic.** A new service worker installs and waits; only an explicit user
action activates it, and nothing may apply an update while a transaction is in
flight. The specification is
[`docs/user-stories/app-versioning-and-updates.md`](../user-stories/app-versioning-and-updates.md).

If you find yourself adding `skipWaiting()`, `registerType: 'autoUpdate'`, or
any path that reloads the app without the user asking, stop — that is the one
property this delivery model exists to refuse.

## What this repo will not become

`docs/user-stories/INDEX.md` is the scope boundary and it is closed, not
aspirational. No swaps or DEX UI, no fiat on/off-ramp, no staking or yield, no
KYC, no custodial recovery. If a task drifts toward any of them, stop and say so.
