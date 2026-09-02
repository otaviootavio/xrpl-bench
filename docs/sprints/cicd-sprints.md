# CI/CD Sprint Plan

Derived from the tooling and best-practice review of 2026-09-02, validated
against current GitHub Actions, Bun, `vite-plugin-pwa` and bunny.net guidance
(sources at the bottom). Unlike `bugfix-sprints.md` and `interface-sprints.md`,
this plan is **not** derived from findings in `src/` — the application code is
not the subject. The subject is that this project has four working quality gates
and nothing that runs them, and no history, remote, or release path at all.

Finding IDs use the `CD-` prefix, keeping them distinct from `C*/H*/M*/L*`
(bugfix) and `IF-*` (interface). Sprint numbering continues at **S13** so IDs
stay unique across all three files.

> **STATUS: planned, not started. Every decision is now answered (2026-09-02).**
> Licence `FSL-1.1-ALv2`, name `xrpl-bench`, branches `prod`/`stage`/`dev`,
> CI **and** CD in scope, pullzones to be created. No blockers remain; S13 can
> start immediately and S14–S15 follow it.

**No verdict.** There is nothing broken to escalate; this is new capability.
The one item carrying real risk is `CD-6`, and it is a product decision rather
than an engineering task.

---

## Decisions required before implementation

These are genuinely open. Recording them rather than assuming them, because
three of the four change what the pipeline can even enforce.

| # | Question | Why it blocks |
|---|---|---|
| ~~**D1**~~ | ~~Is the staging branch named `homolog`?~~ | **ANSWERED: no — three branches, `prod` / `stage` / `dev`.** Supersedes the earlier `main`/`homolog` assumption; S14 is rewritten accordingly. |
| ~~**D2**~~ | ~~Public or private repo?~~ | **ANSWERED: public, under a source-available licence — *not* OSI open source.** Branch protection and rulesets *are* enforced on public repos on the Free plan, so S14's protection is real rather than advisory. Consequences: the product name becomes public (settled as `xrpl-bench`), and a licence file is required — see **L1**. |
| ~~**L1**~~ | ~~Which licence?~~ | **ANSWERED: `FSL-1.1-ALv2`** (source-available, converts to Apache 2.0 after two years). Recorded in `PRODUCT.md` `## Licence`. **Consequence: this is not OSI open source**, so no project material may call it that. Also settles the name: **`xrpl-bench`**, deliberately without "open". |
| ~~**D5**~~ | ~~Auto-update or user-controlled update?~~ | **ANSWERED: user-controlled.** Specified in [`app-versioning-and-updates.md`](../user-stories/app-versioning-and-updates.md). Changes `registerType` from `autoUpdate` to `prompt` and materially improves CD-6. |
| ~~**D3**~~ | ~~CI only, or CI and CD?~~ | **ANSWERED: both.** All three sprints are in scope. `CD-6` must still be answered in writing before S15 deploys. |
| ~~**D4**~~ | ~~Do the bunny pullzones exist, or are they created here?~~ | **ANSWERED: create them in S15.** Two zones (`stage`, `prod`) plus edge rules. Creating them needs a hostname per zone and is billable on the bunny account, so confirm both at the start of S15 rather than mid-sprint. |

---

## Findings

| ID | Finding |
|---|---|
| **CD-1** | Not a git repository. No `.git`, no history, no remote. `.gitignore` exists but has never been used. |
| **CD-2** | Four executable gates (`lint`, `build`, `test`, `check:contrast`) exist and run only when a human remembers. `check:contrast` in particular is the sole enforcement of the WCAG 2.2 AA commitment recorded in `PRODUCT.md`. |
| **CD-3** | No branch model. There is no `main`, no staging branch, and no promotion path. |
| **CD-4** | No release identity. Nothing ties a served bundle to a commit, so "which version am I running" is unanswerable — from inside the app or outside it. |
| **CD-5** | The PWA and a CDN will conflict. Guardrail #6 requires the shell to be re-fetchable on deploy; edge-caching `index.html` / `sw.js` / `manifest.webmanifest` defeats it and pins users to a stale shell that can render a wrong balance. bunny follows origin `Cache-Control`, and a storage-zone origin does not supply one — so this must be explicit edge rules, then verified against live response headers. |
| **CD-6** | **A deploy pipeline contradicts the product's own positioning — now partly mitigated.** `PRODUCT.md` claims "no backend exists to compromise". A CDN origin plus a pipeline is exactly such a backend: whoever controls either controls the signing code, and the browser runs it silently. Subresource Integrity does **not** address this — an attacker controlling the origin controls `index.html` and therefore the integrity hashes too; recent supply-chain incidents took precisely this shape. `registerType: 'autoUpdate'` compounded it by replacing the shell silently. **The 2026-09-02 decision that updates are user-controlled removes that last part:** a compromised origin can no longer swap signing code without the user accepting a version, which turns a silent substitution into an inspectable event. Combined with a public source tag and published asset hashes, the release becomes verifiable by a third party. What remains unmitigated is a user who accepts without checking — which is a real residual risk, not a solved one. |
| **CD-7** | The `gh` token has scopes `gist`, `read:org`, `repo` — no `workflow`. Harmless for pushing workflow files over SSH; it would block writing them through `gh api`. |

---

## Sequencing rationale

Three sprints, ordered so that nothing irreversible happens before the decision
that governs it:

1. **S13** — history, licence, and CI. Touches no external service and is
   reversible up until the repository is made public. Ship first.
2. **S14** — branch model and protection. Enforceable for real, because the
   repository is public.
3. **S15** — deploy. Must not start before `CD-6` has an answer recorded in
   `docs/decisions.md` §8, and before the update flow of
   [`app-versioning-and-updates.md`](../user-stories/app-versioning-and-updates.md)
   exists — shipping an auto-updating build even once would establish the trust
   property that epic refuses.

**The point of no return is inside S13, not S14.** Making the repository public
is the irreversible step: a URL can be indexed, cloned, and linked regardless of
later deletion. The licence file must land in the same commit that publishes.

**The point of no return is the LAST task of S13** — making the repository
public. Everything before it is reversible (`gh repo delete` + `rm -rf .git`);
nothing after it is. S15 adds a second, smaller one: once an installable URL has
held funds, that origin is load-bearing forever (see §8).

---

## Sprint 13 — Repository and CI

**Goal:** every gate runs on every push, and the project has a history.
**Findings:** CD-1, CD-2, CD-7.

- `git init`, then an initial commit. Decide deliberately whether that is one
  squashed import or a few commits separating the wallet implementation from the
  design-system work — this is the only chance to choose.
- `gh repo create xrpl-bench --public`. **The `FSL-1.1-ALv2` licence file
  must be in the same commit that publishes** — a public repo with no licence
  reserves all rights, and publishing first "to fix later" means every clone
  taken in between has no grant at all.
- Repository description and README must say **source-available**, never "open
  source" (`PRODUCT.md` `## Licence`).
- One CI workflow running `lint` → `build` → `test` → `check:contrast` on push
  and pull request. `build` already includes `tsc -b`, so typecheck is covered.
- Practices that are not optional, per current guidance:
  - every third-party action pinned to a **full commit SHA**, never a tag, and
    the SHA confirmed to belong to upstream rather than a fork;
  - workflow-level `permissions: contents: read`, escalated per job only where
    needed;
  - `bun install --frozen-lockfile`, with the Bun version **pinned** — Bun does
    not infer frozen installs in CI, and `latest` can change behaviour;
  - cache `~/.bun/install/cache` keyed on `hashFiles('**/bun.lock')`; do not
    cache `node_modules`;
  - a `concurrency` group so a new push cancels the superseded run;
  - no `github.event.*` value interpolated into a `run:` block — pass it via
    `env:` to avoid script injection.

**Done when** a pull request shows four independent green checks, and a
deliberately introduced contrast regression turns the PR red.

---

## Sprint 14 — Branch model and promotion

**Goal:** a change cannot reach production without passing through staging.
**Findings:** CD-3.

- Three branches: **`dev`** (integration), **`stage`** (pre-production /
  homologation), **`prod`** (released, deployed to production).
- Flow: `feature/*` → PR → `dev` → PR → `stage` → PR → `prod`. No branch is ever
  pushed to directly.
- **`prod` is the repository's default branch.** This is a deliberate choice for
  a public, verifiable wallet: a visitor — or someone checking a release against
  what the CDN serves (US-7) — should land on the code that is actually
  deployed, not on integration work. The cost is that contributors must retarget
  PRs to `dev`, so say so in the README and the PR template.
- Protection on all three, now genuinely enforced because the repository is
  public: required status checks (the four gates from S13), no direct pushes,
  linear history. On `prod`, additionally require that changes arrive from
  `stage`.
- Note the deviation from convention: there is no `main`. Some tooling and
  documentation assume it exists; where that bites, prefer configuring the tool
  over adding a fourth branch that means the same thing as `prod`.

**Done when** a direct push to `prod` is rejected, a PR from `dev` straight to
`prod` is rejected, and a PR with a failing gate cannot be merged.

## Sprint 15 — Deploy

**Goal:** `stage` and `prod` deploy to their own environments, and a served
bundle is traceable to a commit.
**Findings:** CD-4, CD-5, CD-6. **Blocked by:** D3, D4, and a recorded answer
to CD-6.

- Two bunny pullzones, staging and production, deployed by the `bunny` CLI
  (installed, authenticated; v0.15.1, with 0.16.1 available). Verify exact
  subcommands against `bunny --help` and the `bunny-cli` skill at implementation
  time rather than assuming them.
- Edge rules, then **verified against live response headers**:
  - `index.html`, `sw.js`, `manifest.webmanifest` — minimal cache lifetime,
    never `immutable`;
  - `assets/*` — long-lived, safe because the filenames are content-hashed.
- Purge the zone on deploy, and assert the served `sw.js` actually changed.
- Stamp the build with its commit SHA so the running app can report its own
  version, and publish the built asset hashes per commit (CD-4) — that is what
  makes CD-6 verifiable rather than merely acknowledged.
- Switch `registerType` from `autoUpdate` to `prompt` and build the
  user-controlled update flow specified in
  [`app-versioning-and-updates.md`](../user-stories/app-versioning-and-updates.md).
  This is a prerequisite for deploying at all, not a follow-up: shipping an
  auto-updating build even once establishes exactly the trust property the epic
  exists to refuse.
- Stamp the build so the running app can report its version and commit (US-1),
  and publish per-release asset hashes with verification instructions (US-7).
- Add a `docs/decisions.md` §8 recording the answer to CD-6: what the trust
  model actually is once a CDN is in the path, and what verifiability ships with
  it. Do not deploy before this exists.

**Done when** a merge to `stage` publishes staging, a merge to `prod`
publishes production, a hard reload after deploy serves the new shell rather
than a cached one, the app can state which commit it is running, and a released
update **waits** until a user accepts it rather than applying itself.

---

## Explicitly out of scope

- Cloudflare. No `wrangler` is installed and bunny is already authenticated;
  adding a second provider is not a CI/CD problem.
- Any GitHub MCP server. `gh` covers repos, PRs and secrets.
- Automated dependency updates, release-please, changesets, semantic-release.
  Worth revisiting once S13–S15 are stable; adding them now would mean tuning
  three new things at once.
- E2E/browser tests in CI. The 29 unit tests plus `check:contrast` are the
  agreed gate for now. Note that this leaves the multi-wallet and 320px checks
  in `docs/agents/verifying-your-work.md` as **manual** prerequisites — CI does
  not cover them, and two real defects have already been found there.

---

## Sources

Validated 2026-09-02.

- [GitHub Actions 2026 security roadmap](https://github.blog/news-insights/product-news/whats-coming-to-our-github-actions-2026-security-roadmap/)
- [GitHub Actions security best practices — StepSecurity](https://www.stepsecurity.io/blog/github-actions-security-best-practices)
- [Managing rulesets / available rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets)
- [Rulesets on Free private repos — community discussion](https://github.com/orgs/community/discussions/190190)
- [oven-sh/setup-bun](https://github.com/oven-sh/setup-bun) and [what to cache in CI](https://github.com/oven-sh/bun/discussions/18752)
- [bun install docs](https://bun.com/docs/pm/cli/install)
- [vite-plugin-pwa deployment guidance](https://vite-pwa-org.netlify.app/deployment/)
- [bunny.net Smart Cache](https://docs.bunny.net/cdn/smart-cache) and [Purge Cache](https://bunny.net/docs/cdn/purge-cache)
- [MDN — Subresource Integrity](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Subresource_Integrity) and [Supply chain attacks](https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/Supply_chain_attacks)
- [AppsFlyer SDK supply-chain crypto attack](https://www.reflectiz.com/blog/appsflyer-supply-chain-attack/)
- [Reproducible builds — Bitcoin Security Glossary](https://bitcoinsecurity.org/learn/reproducible-builds/)
