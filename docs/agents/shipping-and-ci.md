# Scenario: you are touching CI, a deploy, or the service worker

Reasoning: `docs/decisions.md` guardrail #6, #7, and §8 once the CI/CD sprint
lands. Plan: `docs/sprints/cicd-sprints.md`.

Current state: `gh` and `bunny` CLIs are installed and authenticated; there is
no `wrangler`; **this directory is not yet a git repository.**

## Always — rebase and re-test locally before merging into `dev`, `stage`, or `prod`

There is no `main`; every merge in this repo lands directly on one of the
three protected, deployed branches. Before merging any branch into any of
them — a feature PR into `dev`, or a promotion into `stage`/`prod` — do this
locally first, in order:

1. **Rebase the branch onto the target branch's current tip.** Not merge,
   rebase — a merge commit is impossible here anyway
   (`required_linear_history`), and a rebase is what actually proves the
   branch still applies cleanly on top of what the target has *right now*,
   not what it had when the branch was created or when CI last ran.
2. **Re-run the full local gate suite on the rebased result** — `bun run
   lint`, `bun run build`, `bun run test`, `bun run check:contrast` — not just
   whatever CI ran against the pre-rebase branch.
3. **A rebase conflict, or a gate failure that only appears after rebasing, is
   a real integration bug** — two changes that are each fine alone but wrong
   together. Fix it before merging. Do not force through a merge that only
   passed because the check ran against a stale view of the target.
4. Only once the rebased branch is clean and every gate is green, merge it
   (squash — that stays the actual merge method; the rebase above is
   pre-merge hygiene, not a replacement for it).

This is not theoretical: it is exactly the discipline that would have caught
`docs/decisions.md` §11's promotion failure — a `dev` → `stage` merge that
GitHub reported as cleanly squashable right up until it wasn't — before it
turned into a mid-merge surprise instead of a five-minute local check.
`strict_required_status_checks_policy` on each branch's ruleset already forces
a rebase-and-recheck before GitHub will *let* you merge a normal PR; doing it
proactively, and reading the result rather than only its pass/fail colour, is
the point.

## Always — GitHub Actions

- **Pin every third-party action to a full commit SHA.** No tags, no branches,
  no `@main`. A tag is mutable and a compromised action runs with your secrets.
  SHA-pinning gives immutability but *not* provenance, so also confirm the SHA
  belongs to the upstream repo and not a fork.
- **Declare `permissions:` explicitly and start read-only.** Default to
  `contents: read` at the workflow level and escalate per job only where needed.
- **Install with a frozen lockfile.** `bun install --frozen-lockfile` (or
  `bun ci`) so a stale `bun.lock` fails the build instead of silently resolving
  different versions. Bun does *not* infer this in CI.
- **Pin the Bun version.** `bun-version: <exact>`, never `latest` — a Bun
  release can change behaviour under you.
- **Cache only `~/.bun/install/cache`,** keyed on `hashFiles('**/bun.lock')`.
  Caching `node_modules` is not worth it; `bun install` is usually faster than
  restoring it.
- **Use a `concurrency` group** so a new push cancels the superseded run.
- **Run the repo's own gates as the pipeline**: lint, build (which includes
  `tsc -b`), test, and `check:contrast`. The contrast harness is the one that
  turns the WCAG 2.2 AA commitment in `PRODUCT.md` into something a PR cannot
  merge past.

## Never — GitHub Actions

- **Never** interpolate untrusted input (`github.event.*` titles, branch names,
  PR bodies) directly into a `run:` block. That is script injection; pass it
  through `env:` instead.
- **Never** expose deploy secrets to a workflow triggered by an untrusted fork
  (`pull_request_target` with a checkout of the PR head is the classic trap).
- **Never** echo a secret, or write one into an artifact or a build output. This
  app ships no runtime secrets at all — keep it that way.

## Always — the service worker and the CDN

This is the pairing most likely to ship a wrong balance, and guardrail #6
exists because of it.

- **`index.html`, `sw.js`, and `manifest.webmanifest` must not be edge-cached
  long, and must never be `immutable`.** Keep their cache lifetime as low as
  possible. If a browser or an edge node caches the service worker, an app
  update can never reach the user — they keep booting a stale shell.
- **Hashed assets under `assets/` can be cached aggressively**, because their
  filename changes when their content does.
- **Purge the zone on deploy** rather than trusting expiry, and verify the
  served `sw.js` actually changed after a release.
- **bunny follows the origin's `Cache-Control`.** A storage-zone origin does not
  send one the way an app server would, so the behaviour above has to be set
  explicitly as Edge Rules (override cache time, matched by path or extension) —
  and then *verified against the live response headers*, not assumed.
- **Ledger and RPC traffic is never precached or runtime-cached.** Only the
  static shell is. Do not add a `runtimeCaching` entry for an XRPL host, a
  faucet, or an explorer.

## The trust problem — read before proposing a deploy

A CDN deploy reintroduces the one thing `PRODUCT.md` claims this wallet does not
have: a backend that can compromise it. Whoever controls the origin or the
pipeline controls the signing code, and the browser will run it silently.

Two honest constraints:

- **Subresource Integrity does not solve this.** SRI defends against a
  *subresource* being swapped by a third party. Here the attacker who controls
  the origin also controls `index.html`, and therefore controls the integrity
  hashes themselves. Recent supply-chain incidents took exactly this shape: the
  compromise was at the trusted source, and SRI was irrelevant. SRI is still
  worth having as defence-in-depth for anything third-party, but never present
  it as the answer.
- **The real mitigation is verifiability, not prevention.** Reproducible builds
  plus per-commit published asset hashes let *someone* check that what is served
  matches what was built from a tagged source. That is a meaningful property
  even though most users will never perform the check.

There is also a live tension worth naming: `registerType: 'autoUpdate'` means the
service worker silently replaces the app shell. That is good for shipping fixes
and bad for a threat model where the origin is the adversary.

**Ask first** on all of it. Whether to deploy, whether to publish, and what
verifiability story ships alongside are product decisions for the owner, and
they belong in `docs/decisions.md` before any pipeline goes live.
