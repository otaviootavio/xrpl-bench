# PRD Addendum — XRPL Bench

Depth that belongs to architecture, delivery, or a downstream document rather
than to the PRD. Companion to `prd.md` in this run folder.

**This file is a pointer index, not a second copy of the record.** `docs/decisions.md`
is authoritative for every technical decision and its reasoning; `docs/sprints/`
is authoritative for what each sprint found and left behind. Entries below say
*what belongs here and where it actually lives* — do not inline the source text.

## 1. Stack and technical decisions

React 19 + Vite + Tailwind v4 + shadcn-in-repo + xrpl.js, shipped as a PWA. No
backend.

→ `docs/decisions.md` §1 (stack), §2 (product decisions closing the prior gap
analysis), §3 (guardrails — the AI-authoring failure modes each rule exists to
stop), §4 (enforced patterns).

Belongs to architecture, not to the PRD: state management and query layer, the
IndexedDB vault schema, the wrap/unwrap key ceremony's concrete primitives, the
service-worker registration strategy, RPC client and failover mechanics.

## 2. The unlock defect, and why FR-8 is written as it is

The first implementation let any PIN "unlock" the app, and separately let the PIN
and the passkey each derive their own unverified key rather than unwrapping one
shared Master Key — meaning only whichever method encrypted the seed could ever
really work. Caught live during Testnet validation, not in review.

This is the single most load-bearing piece of reasoning behind FR-8 and NFR-2.
→ `docs/decisions.md` §4, final bullet.

## 3. Rejected and deferred alternatives

| Considered | Outcome | Where the reasoning lives |
|---|---|---|
| Web Push for incoming payments | Permanently deferred — requires a server to hold subscriptions | `PRODUCT.md` § Positioning; `docs/decisions.md` §2 |
| Fiat-equivalent balance display | Deferred — adds a price-oracle dependency | `docs/decisions.md` §2 |
| User-editable RPC endpoints | Deferred to post-v1 | `docs/decisions.md` §2 |
| Cloudflare as a second CDN | Out of scope — not a CI/CD problem | `docs/sprints/cicd-sprints.md` |
| A GitHub MCP server | Out of scope — `gh` covers it | `docs/sprints/cicd-sprints.md` |
| Automated dependency updates, release-please, changesets, semantic-release | Out of scope | `docs/sprints/cicd-sprints.md` |
| E2E/browser tests in CI | Out of scope for now — unit tests plus `check:contrast` are the agreed gate | `docs/sprints/cicd-sprints.md` |
| `canSend` disable-until-valid on the send form | Considered, deliberately not filed | `docs/sprints/interface-sprints.md` |
| sonner for notices | Removed and replaced by the store-backed Annunciator | `docs/sprints/notices-sprints.md`; `docs/decisions.md` §6.5, §9 |
| BSL for the licence | Superseded by FSL — fixed two-year conversion, no per-adopter grant to vary | `PRODUCT.md` § Licence |

## 4. Delivery, CI/CD, and residual risks

Three protected branches `dev` → `stage` → `prod`, a `promotion-source` check
enforcing tree equality rather than a branch name, four CI gates, both
environments deploying from CI to bunny.net, release identity via a static
manifest, byte-identical rebuilds.

→ `docs/sprints/cicd-sprints.md`; `docs/decisions.md` §8, §10, §11.

**Open residual risks recorded there, surfaced in `prd.md` §9.3 and §10:**

- **CD-6** — a CDN origin plus a deploy pipeline is in tension with "no backend
  exists to compromise". User-controlled updates mitigate silent substitution;
  a user who accepts without verifying remains a real exposure.
- **Account-wide deploy credential** — `BUNNYNET_API_KEY` is account-scoped; a
  deploy-only credential is wanted and not available in that API surface.
- **Hashed assets cached `max-age=0`** — safe and wasteful; no working per-path
  cache lever exists in the provider's API. Revisit if that changes.

## 5. Verification that is manual, not gated

The four gates green means nothing is *provably* broken, not that a change works.
Standing manual prerequisites before any release, and the things a sprint
explicitly left unverified:

- The live Testnet integration pass — manual, and a stated pre-release
  prerequisite.
- Multi-wallet UI checked with more than one wallet present — a standing rule
  after two defects were found that way.
- 320px and 200% zoom on a real browser; the 200% pass has so far been emulated.
- RTL — unreviewed rather than dismissed.
- An automated accessibility audit (axe) — unavailable in the environment.
- The Android home-screen install — no device available.
- The live colour-scheme `change` listener — OS preference not toggleable on the
  available machine.

→ `docs/agents/verifying-your-work.md`; `docs/sprints/{bugfix,interface,notices,mobile-chrome}-sprints.md`.

## 6. Visual system

`DESIGN.md` and its sidecar are binding and derived from the shipped build, not
from intentions. Departing from the panel world is a redesign, not a refinement.
The PRD deliberately carries no visual requirements beyond the accessibility NFRs.

## 7. Drift reported, not repaired

Outside this PRD's task; recorded here so it is not lost:

- The "Open decisions" tables in `docs/user-stories/app-versioning-and-updates.md`
  (V1–V4) and `docs/user-stories/in-app-notices.md` (N1–N4) still present
  decisions as open. All were answered and the work shipped on 2026-09-02.
  `in-app-notices.md` still says N2 "Blocks S17"; S17 is complete.
- `docs/sprints/bugfix-sprints.md` § Coverage says "All 10 epics are implemented".
  There are twelve, the last two closed on 2026-09-02.
- The Address Book ships (`PRODUCT.md` lists it in scope; `docs/decisions.md` §2
  decided it as a new epic) but is absent from `docs/user-stories/INDEX.md` —
  neither in the in-scope list nor in the Epics table, and no epic file exists.
  Since `INDEX.md` is the authoritative functional contract, a shipped capability
  it does not name is a contract gap, and `prd.md` FR-21 and FR-45 depend on it.
- The unused `Switch` primitive and the defined-but-unused `.panel-scribe` are
  both still present with deletion pending.
