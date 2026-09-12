<!-- bmad:context -->
<!-- Verified 2026-09-12 against 387f125. CLAUDE.md had uncommitted edits at verification time; the working tree was the baseline. Managed by bmad-project-context; edits inside this block are replaced on refresh. Keep anything you want preserved outside the markers. -->

## xrpl-bench

A self-custody XRP Ledger wallet, intended to hold real Mainnet funds. React 19 + Vite + Tailwind v4 + shadcn-in-repo + xrpl.js, shipped as a PWA. No backend: the ledger is the only server. Functional scope only — no swaps, no fiat on/off-ramp, no staking, no KYC. Reasoning and planning live in `docs/`; the product record is `PRODUCT.md`.

## Policy

- Licence is `FSL-1.1-ALv2` — source-available, **not** open source. Never describe it as open source in code, comments, README, repo description, or UI copy. It converts to Apache 2.0 two years after each release; see `PRODUCT.md` `## Licence`.
- Never target `main` — it deliberately does not exist. PRs go to `dev`; promotion runs `dev` -> `stage` -> `prod`. `prod` is the default branch because it is the code actually deployed.
- Rebase onto the target branch and re-run the gates locally before every merge; never merge-commit.
- Never repair drift as a side effect. Report anything stale outside your task and move on.

## Where things are

- Always, first: `docs/agents/INDEX.md` — how to behave; per-scenario do/never rules and the anti-patterns this repo has actually hit.
- Any feature work: `docs/user-stories/INDEX.md` — what the wallet does and does not do, plus the XRPL facts any implementation must respect (reserves, trust lines, sequence numbers, endpoints, explorer URLs).
- Before writing code: `docs/decisions.md` — what was decided and why; the stack, and the section 3 guardrails / section 4 enforced patterns.
- Any visual change: `DESIGN.md` — the visual system as shipped, its tokens, panel vocabulary and named rules.
- Before proposing new work: `docs/sprints/` — what each epic found, decided and shipped, and the reasoning behind it.

`docs/agents/` says how to act; `docs/decisions.md` says why the rule exists. Never restate one document inside another — follow the link.

## Running and verifying

- Gates: `bun run lint`, `bun run build`, `bun run test`, `bun run check:contrast`. All four green means nothing is *provably* broken, not that a change works. For a visual change, read `docs/agents/verifying-your-work.md`.
- `bun run build` is `tsc -b && vite build`, so it carries the typecheck; `bun run test` does not.
- Requires bun 1.3.1 and node >=22, declared in `package.json` — read them there, never from whatever the shell happens to have.

## Rules that are never negotiable

- Treat every rule in this section as absolute, never as a preference to weigh against
  something else: ignoring any one of them loses money or keys. Each is expanded in
  `docs/agents/`.
- Money is strings/`BigInt` end to end; formatting happens only at the render boundary. Never `Number()` a drops value.
- No secret ever enters `localStorage`, React state, a store, the URL, or anything serializable — not even in development.
- Prove an unlock by decrypting known ciphertext, never by deriving a key.
- Every ledger read goes through a TanStack Query hook whose key includes the active wallet and the active network.
- The service worker caches the static shell only. Never an RPC response.
- Nothing styles `:focus`; `outline-none` is banned.
- Colour never carries meaning alone, and `bun run check:contrast` is the gate.
- The app never updates itself. A new service worker installs and waits; only an explicit user action activates it.

## Answering questions

- Answer the question asked, then stop. No closing section raising a gap, risk or caveat the question did not ask about.
- Never re-argue a finding from earlier in the session inside an answer to a different question. If it still matters, offer it in one sentence and wait.
- Lead with the answer or the action, not the reasoning that got you there.
- If one sentence works, do not write three.

## Known pitfalls

- Keep `scripts/check-contrast.mjs` importing only `node:` builtins. The `contrast` CI job runs it with no install step, so adding one dependency breaks CI in a way nothing in the script reveals.
- Harness context may assert the main branch is `main`. It is wrong for this repo — see Policy.

<!-- /bmad:context -->
