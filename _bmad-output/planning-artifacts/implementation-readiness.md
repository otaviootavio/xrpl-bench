# Implementation Readiness — xrpl-wallet

**Date:** 2026-09-15 · **Intent:** readiness only (no tracking file generated)
**Verdict: CONCERNS**

The plan is implementable where it is recorded. The problem is that most of the
open work is not recorded at any story level, and one line in `epics.md` states
the opposite.

**This verdict reads a working tree, not a commit.** Seven `reconcile-*.md`, five
`review-*.md` and `reconcile-*.md` under `architecture/` are untracked, and
`docs/decisions.md`, `CLAUDE.md`, the PRD, the addendum, the spine and the gap
register are all modified and uncommitted. Committing or discarding them changes
what this gate saw.

---

## Artifact inventory

| Artifact | Path | State |
|---|---|---|
| PRD | `planning-artifacts/prds/prd-xrpl-wallet-2026-09-12/prd.md` | Current. Reconciled against six inputs, three reviewers, dispositioned in `triage.md`. |
| PRD addendum | `.../addendum.md` | Current. |
| Architecture spine | `planning-artifacts/architecture/.../ARCHITECTURE-SPINE.md` | Current. **AD-1 … AD-17.** |
| Gap register | `.../GAP-REGISTER.md` | Current. Re-verified against `src/` on 2026-09-15. G-1…G-9 **closed**; **G-10…G-18 open**. |
| Epics & stories | `planning-artifacts/epics.md` | **Stale, and unfinished.** Covers G-1…G-9 / AD-1…AD-12 only. `stepsCompleted: [1, 2, 3]`. |
| Specs | `implementation-artifacts/spec-{1-1,2,3,4}-*.md` | All four built; one commit each. |
| Deferred-work ledger | `implementation-artifacts/deferred-work.md` | 14 entries. 3 stale, 2 promoted into the gap register, **9 orphaned**. |
| Sprint status | — | Does not exist. `bmad-sprint-planning` has never run. |
| Project knowledge | `docs/` | Present: `agents/`, `user-stories/`, `sprints/`, `decisions.md`. |

No UX artifact under `planning-artifacts/`. Not a finding — `DESIGN.md` at the
repo root is the authoritative visual record and the stories that need it cite it.

---

## Findings, by severity

### C-1 — `epics.md` claims coverage it no longer has (CRITICAL)

`epics.md:125` reads:

> Every gap in `GAP-REGISTER.md` is covered.

That was true on 2026-09-12. It is false on 2026-09-15. The gap register now
carries **nine open gaps, G-10 through G-18**, added the same day and each
verified against `src/` rather than inferred. None appears in `epics.md`; the
FR Coverage Map stops at G-9 and the epics reference no `AD` above AD-12.

The danger is not the absence — it is the sentence. An agent that reads the
coverage claim and trusts it skips nine gaps, **two of which are the same
unrecoverable tagless-payment path the shipped work already spent an epic
closing**:

- **G-10** — `SendTab.tsx:68`'s `destCheckFailed` fails closed only when there
  is *no* retained data, so a destination that newly sets `lsfRequireDestTag`
  between reads still satisfies the guard. A third path: `useDestinationInfo`
  carries `staleTime: 30_000`, so a cached answer satisfies it for thirty
  seconds regardless of error state.
- **G-18** — an Address Book entry is `{ address, label }`, deduped on address
  alone. AD-6 requires identity to be the (address, destination tag) pair. An
  exchange deposit address is one address with a different required tag per
  customer; a picker that fills address without tag produces the same
  unrecoverable payment.

**Fix:** `bmad-create-epics-and-stories`.

### C-2 — `epics.md` is an unfinished artifact (CRITICAL)

Frontmatter records `stepsCompleted: [1, 2, 3]`. `bmad-create-epics-and-stories`
has **four** steps; `steps/step-04-final-validation.md` never ran. Its stated
goal:

> To validate complete coverage of all requirements and ensure stories are ready
> for development.

That is precisely the step that would have caught C-1. Under this gate's own
completion rule, a draft marker means the skill is still in progress — so
`epics.md` is not a finished input, and the fix is to **resume** CE rather than
start a fresh pass.

### H-1 — The deferred-work ledger is a third register agreeing with neither (HIGH)

Fourteen entries. Only two were ever promoted into the gap register (the reserve
/ fee entry became **G-11** and **G-12**; the in-flight boolean became **G-17**).
Three are stale — the Epic 2, Epic 3 and Epic 4 "split at the build scope gate"
entries all shipped afterwards, in `10e1d70`, `b359058` and `3ca0917`.

That leaves **nine entries recorded in no epic and no gap**:

1. The query-key guard cannot see a key bound to a variable before use.
2. The four invalidation sites invalidate different subsets, unchecked against one another.
3. `docs/agents/ledger-io.md:12` still tells agents to hand-write query keys.
4. Failover-discarded clients are never disconnected; an abandoned connect can leak a socket.
5. `getXrplClient` has no in-flight dedup — concurrent mount queries each open a Client.
6. The two seed-import paths disagree on gating and on malformed-seed reporting; neither trims input.
7. `AGENTS.md` states the secrets rule absolutely, contradicting `decisions.md` §4's `vaultKey` exception — and `AGENTS.md` loads first.
8. The waiting-update flag never returns to false, so a failed `applyUpdate` strands the prompt.
9. No lint gate stops BigInt arithmetic or a hand-rolled explorer anchor reappearing.

Entry 7 is self-defeating in the way the §4 exception was written to prevent: an
agent reading `AGENTS.md` first deletes the `vaultKey` code §4 exists to protect.

**Fix:** triage the ledger into the gap register during the CE pass, or run
`bmad-loop-sweep` if you want the partition done mechanically first.

### M-1 — Four ADs bind nothing in any story (MEDIUM)

AD-13, AD-14, AD-15 and AD-16 are adopted rules in the spine with no story
implementing them. AD-17 is deploy-gated by `scripts/verify-headers.mjs` and so
is covered by a gate rather than a story — not a finding.

The spine is deliberately stricter than the code in four places (AD-13/G-10,
AD-9/G-16 and G-17, AD-6/G-18, AD-16/G-13 and G-14). The register names that as
"the spine working as intended, and it is also the work queue." The work queue
has no stories in it.

### M-2 — Six PRD open questions carry owners; one is a live product gap (MEDIUM)

`prd.md` §10 items 1–6 all name **Otavio** as owner with a revisit condition, so
they are deferred rather than forgotten and none blocks this gate. One is worth
surfacing because it is neither a documentation fix nor covered by any gap:

- **§10.2 / triage F12** — nothing warns the user as the failure count
  approaches the eight-attempt hard lock. Reaching it makes the wallet unusable
  without the seed, and NFR-7 wants a consequence stated *before* the
  irreversible step. Revisit condition: before the first real Mainnet funding.

### L-1 — Six input documents are recorded as wrong and not repaired (LOW)

`triage.md` and `prd.md` §10 both list them: `in-app-notices.md` N1–N4 stale,
`wallet-security.md` specifying passkey-only unlock a PWA cannot do,
`user-stories/INDEX.md` missing the Address Book, `CLAUDE.md`'s table missing the
product layer, `cicd-sprints.md` describing a replaced `promotion-source` check,
`DESIGN.md` documenting only true `disabled`. Reported outward by design, not a
blocker — but they are the documents the tie-break rule in §0 defers to.

---

## What is *not* a finding

- **The four built epics.** All fifteen stories shipped, and the gap register
  re-verified each closure against `src/` rather than trusting commit messages.
  Three are now machine-enforced (`check-layering.mjs`, `check-query-keys.mjs`,
  `check-sw-register.mjs`).
- **PRD ↔ spine alignment.** The reconcile pass ran in both directions and the
  disagreements were dispositioned, including two where the PRD was wrong and the
  code right (F6 controlled seed fields, F7 NFR-2 vs §4).
- **No sprint-status file for work already done.** Retroactively irrelevant.
- **The nine open gaps themselves.** Each carries a severity, a verified file and
  line, and a named fix. Nothing needs inventing — they are simply not broken
  into stories.

---

## Recommendation

Resume `bmad-create-epics-and-stories` and give it two jobs:

1. Correct the coverage claim at `epics.md:125` and run step 4.
2. Break G-10 … G-18 into a second epic set, folding in the nine orphaned
   ledger entries so all three registers agree.

Then run sprint planning for real. Generating a tracking file today would produce
a sprint of fifteen already-done stories and none of the nine open gaps.

`bmad-correct-course` is **not** the fix here — the spine and gap register have
already absorbed the change. Only the story layer is behind.
