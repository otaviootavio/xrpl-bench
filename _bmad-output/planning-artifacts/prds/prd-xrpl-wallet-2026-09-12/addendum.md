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
IndexedDB Vault schema, the wrap/unwrap key ceremony's concrete primitives, the
service-worker registration strategy, RPC client and failover mechanics.

## 2. The unlock defect, and why FR-8 is written as it is

The first implementation let any PIN "unlock" the app, and separately let the PIN
and the passkey each derive their own unverified key rather than unwrapping one
shared Master Key — meaning only whichever method encrypted the Seed could ever
really work. Caught live during Testnet validation, not in review.

A second defect of the same class was found later: rebuilding Vault metadata by
spreading the previous record carried forward a wrapper for a *superseded*
Master Key. That is why FR-8's second bullet exists; `prd.md` FR-8 states the
consequence and the rule that follows from it.

Together these are the single most load-bearing piece of reasoning behind FR-8
and NFR-2. → `docs/decisions.md` §4, final bullet.

## 3. Rejected and deferred alternatives

| Considered | Outcome | Where the reasoning lives |
|---|---|---|
| Web Push for incoming payments | Permanently out — requires a server to hold subscriptions, contradicting the positioning itself. `PRODUCT.md` says permanent; `docs/decisions.md` §2 and §5.2 say "revisit only if a backend is introduced", which is the same boundary stated as a condition | `PRODUCT.md` § Positioning; `docs/decisions.md` §2, §5.2 |
| Fiat-equivalent balance display | Deferred, not permanently closed — adds a price-oracle dependency and a third party with a view of holdings | `PRODUCT.md`; `docs/decisions.md` §2 |
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
environments deploying from CI to bunny.net, release identity via
the Release Manifest, byte-identical rebuilds.

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
- Multi-wallet UI checked with more than one Wallet present — a standing rule
  after two defects were found that way.
- 320px and 200% zoom on a real browser; the 200% pass has so far been emulated.
- RTL — unreviewed rather than dismissed.
- An automated accessibility audit (axe) — unavailable in the environment.
- The Android home-screen install — no device available.
- The live colour-scheme `change` listener — OS preference not toggleable on the
  available machine.
- The validated-payment outcome box and the `expired` transaction status have
  never been rendered; only the `tec*` result path was ever exercised. This
  underwrites FR-22, FR-23, FR-24 and SM-1 — the send path's whole claim to
  distinguish submitted from validated.
- A Trust Line with a non-zero balance has never been rendered against real
  ledger state; the state is not producible in-app and only a component test
  covers it. Underwrites FR-33 and FR-34.

SM-3's precondition (`prd.md` §7) is the Testnet pass, the multi-wallet check,
and the three device- and tool-blocked items above — 200% zoom on a real
browser, the Android install, and the colour-scheme listener. The rest are
recorded so they are not mistaken for verified.

→ `docs/agents/verifying-your-work.md`; `docs/sprints/{bugfix,interface,notices,mobile-chrome}-sprints.md`.

## 6. Visual system

`DESIGN.md` and its sidecar are binding and derived from the shipped build, not
from intentions. Departing from the panel world is a redesign, not a refinement.
The PRD deliberately carries no visual requirements beyond the accessibility NFRs.

## 7. Drift reported, not repaired

Outside this PRD's task; recorded here so it is not lost. Each entry below was
re-verified against the source on 2026-09-15, and two earlier entries were found
to be wrong rather than merely stale — withdrawn below.

- `docs/user-stories/in-app-notices.md` still presents N1–N4 as open decisions,
  with N2 and N3 marked "Blocks S17" and N1 and N4 "Blocks S16". All four were
  answered and the work shipped on 2026-09-02. **Confirmed still stale.**
- `docs/user-stories/wallet-security.md` specifies passkey-only unlock that
  "never falls back", with the key-encryption key in platform secure storage —
  a mechanism a PWA cannot use. The mandatory PIN in `prd.md` FR-7 shipped
  instead, and FR-7 is what SM-2 validates. **Confirmed still stale.**
- `docs/user-stories/app-versioning-and-updates.md` was previously listed here
  as carrying the same defect. **It does not** — that file states "All four are
  now answered (2026-09-02)" and strikes through V1–V4. **Withdrawn.**
- `docs/sprints/bugfix-sprints.md` § Coverage says "All 10 epics are
  implemented". There are twelve, the last two closed on 2026-09-02.
  **Confirmed.**
- The Address Book ships (`PRODUCT.md` lists it in scope; `docs/decisions.md` §2
  decided it as a new epic) but is absent from `docs/user-stories/INDEX.md` —
  neither in the in-scope list nor in the Epics table, and no epic file exists.
  `prd.md` §4.11 and §11 record the consequence. **Confirmed.**
- `docs/sprints/cicd-sprints.md` still describes `promotion-source` as a check
  on the head branch's *name*; `docs/decisions.md` §11 replaced it with tree
  equality. §4 above is correct; the sprint file is the stale one. **New.**
- `CLAUDE.md`'s "Read these before you start" table claims five documents with
  non-overlapping layer authority, but has no row for the product layer — even
  though it cites `PRODUCT.md` at line 13 and depends on it. **New.**
- `DESIGN.md` documents only the true `disabled` state; `prd.md` §9.1 and FR-25
  require `aria-disabled` with the reason in visible text. The design system is
  the document missing the state, not the PRD. **New.**
- The unused `Switch` primitive is still present with deletion pending:
  `src/components/ui/switch.tsx` exists and has no JSX call site. **Confirmed.**
- `.panel-scribe` was previously listed here as "defined but unused, deletion
  pending". **It is already gone** from `src/`; `DESIGN.md` records its removal
  on 2026-09-02. **Withdrawn.**
