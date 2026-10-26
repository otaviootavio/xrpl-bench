# Glossary — the words we use to talk about this project

One word per thing. When two words could name the same thing, use the one here.

**Four names that must never blur:** *Docusaurus* is for wallet users. *Feature
plan* is internal, one per feature. *DESIGN.md* is the visual rules. *Agent
manual* is the rules for agents.

**Product words** (Wallet, Seed, Open Check, Signing Check, Node, Annunciator and
the rest) are defined once, in [PRD §3](../_bmad-output/planning-artifacts/prds/prd-xrpl-wallet-2026-09-12/prd.md).
They are not repeated here, because two copies drift. This file covers the words
about the *work*, and the few chooser words the PRD does not define yet.

## The documents

| Word | Means | Lives in | Read by |
|---|---|---|---|
| **Docusaurus** | The site that teaches people how to use the wallet. Always called Docusaurus, never "the manual" or "the docs". Not yet written beyond a scaffold. | `manual/` | Wallet users |
| **Agent manual** | The rules an agent follows while working in this repo: do, ask first, never. | `docs/agents/` | Agents |
| **Decisions** | What was decided and why. | `docs/decisions.md` | Developers, agents |
| **User stories** | What the wallet does and does not do, plus the XRPL facts any change must respect. | `docs/user-stories/` | Developers, agents |
| **Sprint plans and findings** | What was found, what was decided, and what is planned but not built. | `docs/sprints/` | Developers |
| **Feature plan** | The written plan for one feature: spec, UX docs, architecture. Internal. No code. Never called "design docs", because that name belongs to `DESIGN.md`. | `_bmad-output/` | Developers, agents |
| **DESIGN.md** | The visual rules as shipped: tokens, panels, named rules. About how the app looks, not about any one feature. | repo root | Developers, agents |

## The feature plan, one feature at a time

| Word | Means |
|---|---|
| **Spec** | The contract for one feature: what to build and how to tell it works. `SPEC.md` plus its supporting files. |
| **Capability (CAP-n)** | One thing the spec says the feature must do, with a pass/fail success check. |
| **Story** | One slice of the spec that can be built and merged on its own, listed in the spec's `stories.yaml`. |
| **Epic** | A group of stories shipped together. Tracked in `epics.md` and `sprint-status.yaml`. |
| **Sprint** | A planned batch of work in `docs/sprints/`. |
| **UX docs** | `EXPERIENCE.md` (screens, routes, flows, exact wording) and a feature-level `DESIGN.md` (the visual changes). |
| **Architecture spine** | The binding technical decisions for a feature, numbered AD-n. A later spine wins over an earlier one. |
| **FR-n / AD-n** | FR is a functional requirement in the PRD. AD is an architecture decision in a spine. |
| **Memlog** | `.memlog.md`: the record of what was decided in a planning session, including the owner's choices. |

## Doing and checking the work

| Word | Means |
|---|---|
| **Gates** | The four automatic checks: `bun run lint`, `build`, `test`, `check:contrast`. All green means nothing is provably broken, not that the change works. |
| **Browser pass** | Opening the real app in a browser and looking at it, at 320, 390 and desktop widths in both themes. Required for any visual change. |
| **Audit** | A review of the shipped interface that produces a numbered list of findings. |
| **Finding** | One problem an audit, review or retrospective found. |
| **Retro** | The retrospective after an epic: what happened, plus action items. |
| **Deferred work** | Findings postponed on purpose, kept in `deferred-work.md`. |
| **Promotion** | Moving code up the branch ladder: `dev` to `stage` to `prod`. |

## Chooser words

These are the words the chooser spec uses. They are not in PRD §3 yet.

| Word | Means |
|---|---|
| **Chooser** | The first screen: one card per Seed, where you create, open, rename and remove wallets. |
| **Card** | One Seed on the chooser. A locked card shows its name and nothing else. |
| **View** | One Wallet of a Seed on one Network. A card has one row per view. |
| **Configure screen** | The per-wallet screen that takes over what Settings held for that wallet: checks, auto-lock, Reveal seed, Node. |
| **Settings** | After the split, only what belongs to the whole device. |
| **Enter / leave a wallet** | Going into a wallet's tabs, or back to the chooser. Leaving does not close the wallet's lock. |
