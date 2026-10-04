---
title: 'Epic 5 retro items 7 and 10: browser-pass definition of done, virtual-authenticator recipe, deferred-work triage'
type: 'chore'
created: '2026-10-04'
status: 'done'
baseline_commit: '3ac02fc'
context:
  - '_bmad-output/implementation-artifacts/epic-5-retro-2026-09-30.md'
  - 'docs/agents/verifying-your-work.md'
  - '_bmad-output/implementation-artifacts/deferred-work.md'
---

# Epic 5 retro items 7 and 10

## Intent

**Problem.** The Epic 5 retrospective made two process findings.

- **P1–P3:** every browser pass that ran found a defect the gates and reviews had passed. Two stories reached `done` without a pass, because a passkey prompt that nothing answered was recorded as a blocker.
- **P5:** `deferred-work.md` has grown to 34 entries with no triage.

**Approach.** This change is docs only.

- **Item 7:** state in `docs/agents/verifying-your-work.md` that a UI-touching story moves to `done` only after a browser pass with opened screenshots, recorded in its spec. Record the CDP virtual-authenticator recipe there, derived from the recorded passes.
- **Item 10:**
  - Check every open `deferred-work.md` entry against `origin/dev` (first 8e421e4, then re-checked on 3ac02fc once #32 merged).
  - Give each a `triage:` line in place: keep, drop, defer or promote, with evidence.
  - Add entries for retro findings A7 and A8.
  - Delete nothing.

## Boundaries & Constraints

**Always**
- Docs only; no `src/` change.
- Each triage line cites the file and line, or the commit, that it was checked against.
- History is kept: lines are added, nothing is removed.

**Ask First:** not applicable, because this ran unattended. Calls a user would notice are listed under Decisions, for Otavio to check.

**Never**
- Repair drift found along the way (INDEX rule 5). It is reported in the PR instead.
- Fix a deferred entry while triaging it.
- Write the rule into `docs/decisions.md` or INDEX. Its reasoning lives in the retro, and the rule is behaviour, so it belongs in `docs/agents/`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Entry already fixed on dev | e.g. the four invalidation subsets | `drop`, citing the commit and the code | N/A |
| Entry fixed by a PR that merged during this work | the History mobile clip (bfc4c29, in 3ac02fc) | `drop` only after re-checking it on the new dev | N/A |
| Entry already a backlog story | e.g. the in-flight boolean (7.2) | `promote. Already story X.Y`, kept distinct from a new promotion | N/A |
| Entry whose premise was refuted | the waiting-update flag (G-26, story 7.3) | `drop`, naming the refutation | N/A |
| Entry whose cited file moved | the AGENTS.md secrets sentence | Re-pointed to `CLAUDE.md:44`, then classified | N/A |
| Entries added by #32 | 3 entries | Triaged in place, like the rest. The rebase conflict (both sides appended) is resolved by keeping both | N/A |

## Code Map

- `docs/agents/verifying-your-work.md`: a new "Definition of done for a UI-touching story" section, two Never lines, and a "Recipe: a browser pass past the passkey" section.
- `_bmad-output/implementation-artifacts/deferred-work.md`: 34 `triage:` lines and a new section with the A7 and A8 entries (36 entries, 36 triage lines).
- `src/lib/crypto/webauthn.ts` and `src/lib/crypto/auth.ts:83-85`: read, not changed. They are why `hasUserVerification`, `isUserVerified` and `hasPrf` are in the recipe.

## Tasks & Acceptance

**Execution:**
- [x] `docs/agents/verifying-your-work.md`: add the definition of done and the recipe.
- [x] `deferred-work.md`: add a triage line to every open entry.
- [x] `deferred-work.md`: add the A7 and A8 entries.
- [x] `sprint-status.yaml`: set epic 5 action items 7 and 10 to `done`.

**Acceptance Criteria:**
- **Given** an agent about to move a UI-touching story to `done`, **when** it reads `verifying-your-work.md`, **then** it finds the rule: a browser pass with opened screenshots, recorded in the spec, and the story stays in `review` without one.
- **Given** an agent whose run stops at "Setting up…", **when** it follows the recipe, **then** it has the CDP call and options (including PRF), knows to attach before the first click, and knows the credential does not outlive the session.
- **Given** `deferred-work.md`, **when** Otavio reads it, **then** every entry carries one triage call with its evidence. A7 and A8 exist as entries.

## Triage (item 10)

Checked against origin/dev on 2026-10-04: first 8e421e4, then every cited line re-checked on 3ac02fc after #32 merged. Line numbers are 3ac02fc's. The retro's priority items come first.

| # | Entry (short) | Call | One-line reason |
|---|---|---|---|
| 31 | Backup node's partial `account_tx` history | **promote-to-story** (high) | Still true: `reads.ts:154-198` never reads the returned `ledger_index_min`. Proposed ahead of epic 6, or as the first story of epic 8. |
| 29 | A thrown submit invalidates nothing | **promote-to-story** (epic 7) | Still true: both `catch` blocks (`SendTab.tsx:533`, `TrustLinesTab.tsx:61-62`) only toast. |
| 1 | Epic 2 split note | drop | Epic 2 done, merged in 88e28a4 (#29). |
| 2 | Epic 4 split note | drop | Epic 4 done, merged in 88e28a4. |
| 3 | Epic 3 split note | drop | Epic 3 done, merged in 88e28a4. |
| 4 | Query-key guard misses variable-bound keys | promote (already 10.1) | The scan is still text-only. |
| 5 | Four invalidation sites, four subsets | drop | 8e421e4 (#31): all four sites call `invalidateAccountScoped` (`SendTab.tsx:532`, `TrustLinesTab.tsx:60`, `BalancesTab.tsx:48`, `useAccountLiveUpdates.ts:30`). |
| 6 | `ledger-io.md:12` predates the factory | promote-to-story (docs story D) | Still true at `ledger-io.md:12-15`. |
| 7 | The in-flight signal is a boolean | promote (already 7.2) | Still true: `app-store.ts:31`. |
| 8 | Failover never disconnects losers | promote (already 8.1) | Still true: `client.ts:82-84`. |
| 9 | No in-flight connect dedup | promote (already 8.2) | Still true: `client.ts:71-73`. |
| 10 | The two seed-import paths disagree | promote (already 11.1 / 11.2) | Covered by both stories. |
| 11 | The absolute secrets sentence | promote-to-story (docs story D) | AGENTS.md is not on dev. The sentence now sits at `CLAUDE.md:44`, still with no pointer to §4. |
| 12 | The waiting-update flag never clears | drop | Premise refuted (G-26). Story 7.3 pins the opposite fix. |
| 13 | No BigInt or explorer-link lint gates | promote (already 10.2) | `scripts/` has neither. |
| 14 | A reserve or fee read fails silently | drop | Fixed by stories 5.2/5.3 in 88e28a4 (`useSpendableBalance.ts:63`, `BalancesTab.tsx:198`). |
| 15 | Review button uses native `disabled` | defer, retro item 8 | Still true: `SendTab.tsx:822`. The split gives each reason its own text. |
| 16 | `doSend` discards fresh `exists` / `hasTrustLine` | drop | Fixed by the 5.1 follow-up in 88e28a4. |
| 17 | Pre-flight probe has no timeout; Cancel disabled | keep | Still true: `SendTab.tsx:883`. Bounded by the connect timeout and `retry: 1`. |
| 18 | TrustLinesTab's `'200000'` reserve fallback | promote-to-story (story T) | Still true: `TrustLinesTab.tsx:68`, `:90`. |
| 19 | TrustLinesTab gives one reason for every null | promote-to-story (story T) | Still true: `TrustLinesTab.tsx:91`. |
| 20 | A token send never checks the XRP fee | defer, retro item 8 | Still true: `SendTab.tsx:307-311`. #32 made this branch refuse on an unknown line, but it still does not check the fee. Item 8 extracts the funds check. |
| 21 | No screen renders offline (`paused`) | defer, retro item 8 | No `fetchStatus`, `isPaused`, `onLine` or `networkMode` in `src/`. |
| 22 | Spendable row says "Unavailable" for all three states | defer, retro item 8 | Still true: `SendTab.tsx:799-802`. |
| 23 | Freshness-window rules missing from `decisions.md` | promote-to-story (docs story D) | Still unnamed in `decisions.md`. |
| 24 | Exponent-notation IOU values misformatted | promote-to-story | Medium misread figure. `money.ts:36-43` splits only on `.`. |
| 25 | `money.md` lacks the strict/lenient split | promote-to-story (docs story D) | Still true: `money.md:39`. |
| 26 | History failed-row clip at 320/390 | drop | Fixed by bfc4c29, merged in 3ac02fc (#32). |
| 27 | Dialog fee (10 drops) ≠ charged fee (12) | promote-to-story | Confirmed: `open_ledger_fee` is shown, and autofill's default `feeCushion` is 1.2. |
| 28 | Token sent to its own issuer warns "can't hold" | keep (low) | Still true: `query-reads.ts:93`. |
| 30 | `invalidateAccountScoped` unrecorded in decisions and agent docs | promote-to-story (docs story D) | No mention in either. |
| A7 | History shows retained rows on error; retry fetches the next page | defer (new entry) | `HistoryTab.tsx:34,56,88`. Pairs with #31 in one story. |
| A8 | TrustLinesTab shows retained rows under its failure panel | defer (new entry) | `TrustLinesTab.tsx:149,166`. Goes with story T. |
| 32 | Send outcome line overflows at 320 | defer, retro item 8 (low) | Still true: `SendTab.tsx:828`, a flex row with no wrap. |
| 33 | A long amount on History collapses the direction column | keep | Needs a design choice. `HistoryTab.tsx:98`. |
| 34 | Post-unlock probe re-checks only the destination | defer, retro item 8 | The retro decided this (F6). The cost is one fee. |

Totals over 36 entries: 8 drop, 6 promote (already a story), 11 promote-to-story (new), 8 defer, 3 keep.

## Decisions (made unattended, for Otavio to check)

1. **What counts as UI-touching:** any diff that changes what renders: a component, a page, a token or stylesheet, `index.html`, the manifest, or copy the operator reads.
2. **Where the pass is recorded:** the story spec's Verification section. It names the commit, how the browser was driven, the widths, the themes, and met or not met per criterion. This is what the 5.3, 5.4 and 5.5 passes already did.
3. **A pass that cannot run keeps the story in `review`.** The passkey is named as no longer a valid blocker.
4. **"promote (already story X.Y)" is kept distinct from "promote-to-story".** The first means a backlog story already owns the entry. The second proposes a new story.
5. **Two proposed bundles.**
   - **Docs story D:** entries 6, 11, 23, 25 and 30, all edits to agent-context or decision docs.
   - **Story T:** entries 18 and 19 plus A8, which applies 5.2's shape to the Trust lines screen.
6. **The triage is against dev, not against open PRs.** #32 merged while this was in progress (3ac02fc). The branch was rebased and every cited line re-checked; entry 26 became a drop only then.
7. **Every entry is marked with an in-place `triage:` line.** The file already carries optional fields such as `scope:`.
8. **Entry 12 (waiting flag) is a drop, not a promote.** Its proposed fix is the one story 7.3 exists to forbid.
9. **Entry 27 (fee shown ≠ fee charged) is promoted rather than kept.** It is a false figure on the confirm dialog of a money-moving action, which is epic 5's own defect class.

## Verification

**Commands:** `bun run lint` · `bun run build` · `bun run test` · `bun run check:contrast`. All exit 0 (see the PR). No `src/` file changed.

**Browser pass:** not applicable. Docs-only, no UI change. The recipe itself was not re-run in this session. It is written from the five recorded passes and from `webauthn.ts` / `auth.ts`.

**Gaps:**
- The recipe was not exercised end to end in this session. It is written from the five recorded passes and from the WebAuthn code. The `hasPrf` consequence was checked against `auth.ts:83-85`, not run.
- Every classification is a proposal. The promote calls create no stories; Otavio decides which become stories, and where.

**Drift seen and not repaired (INDEX rule 5):**
- `verifying-your-work.md` still says "29 unit tests" (the suite is 340+).
- It speaks of "five gates" where CLAUDE.md lists four (tsc is inside `build`).
- `CLAUDE.md:44` states the secrets rule with no pointer to the §4 exception (entry 11).
