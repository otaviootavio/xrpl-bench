<!--
PRs target `dev`, NOT the default branch.

Promotion runs one way: dev -> stage -> prod. `prod` is the default branch
because it is the code actually deployed, so anyone verifying a release against
what the CDN serves lands on the real thing. There is deliberately no `main`.
A PR that skips a step is failed by the `promotion-source` check, not by review.
-->

## What changed

## Why

## Checklist

- [ ] Targets `dev` (or is a `dev` -> `stage` / `stage` -> `prod` promotion)
- [ ] `bun run lint && bun run build && bun run test && bun run check:contrast` pass locally
- [ ] If this touches money, keys, ledger I/O, or UI: read the matching file in `docs/agents/`
- [ ] If this adds a design token: its contrast pairs are added to `scripts/check-contrast.mjs`
- [ ] If this changes visual output: verified with two wallets, a funded account, both themes, at 320px
